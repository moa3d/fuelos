// Station reference data for S1 (pumps, nozzles, fuels), fetched through RLS and cached for offline use.
import { db, type PumpRef, type StationRef } from "./db";
import { supabase } from "./supabase";

const CURRENCY_LABELS: Record<string, string> = { SYP: "ل.س" };

export type ReferenceResult =
  | { source: "server"; data: StationRef }
  | { source: "cache"; data: StationRef }       // offline or server unreachable: last saved copy
  | { source: "none" };                          // offline and nothing cached yet

/** Thrown when the server answered with an error (not a network problem). */
export class ReferenceLoadError extends Error {}

function isNetworkError(message: string | undefined): boolean {
  return !navigator.onLine || /fetch|network|abort|timeout/i.test(message ?? "");
}

export async function loadReference(stationId: string): Promise<ReferenceResult> {
  const cached = await db.reference.get(stationId).catch(() => undefined);
  if (!navigator.onLine) return cached ? { source: "cache", data: cached } : { source: "none" };

  const sb = supabase();
  const timeout = () => AbortSignal.timeout(15_000);
  const [station, pumps, nozzles, tanks, products] = await Promise.all([
    sb.from("stations").select("name, currency_code, offline_max_ops").eq("id", stationId).abortSignal(timeout()).maybeSingle(),
    sb.from("pumps").select("id, number, name").eq("station_id", stationId).eq("is_active", true).order("number").abortSignal(timeout()),
    sb.from("nozzles").select("id, pump_id, tank_id, label, last_reading").eq("station_id", stationId).eq("is_active", true).order("label").abortSignal(timeout()),
    sb.from("tanks").select("id, product_id").eq("station_id", stationId).abortSignal(timeout()),
    sb.from("products").select("id, name").eq("station_id", stationId).abortSignal(timeout()),
  ]);
  const failed = [station, pumps, nozzles, tanks, products].find((r) => r.error);
  if (failed?.error) {
    if (isNetworkError(failed.error.message)) return cached ? { source: "cache", data: cached } : { source: "none" };
    throw new ReferenceLoadError(failed.error.message);
  }
  if (!station.data) throw new ReferenceLoadError("station not visible");

  const productOfTank = new Map((tanks.data ?? []).map((t) => [t.id as string, t.product_id as string]));
  const productName = new Map((products.data ?? []).map((p) => [p.id as string, p.name as string]));
  const data: StationRef = {
    stationId,
    stationName: station.data.name,
    currencyLabel: CURRENCY_LABELS[station.data.currency_code] ?? station.data.currency_code,
    offlineMaxOps: station.data.offline_max_ops ?? 50,
    fetchedAt: new Date().toISOString(),
    pumps: (pumps.data ?? []).map((p): PumpRef => ({
      id: p.id,
      number: p.number,
      name: p.name,
      nozzles: (nozzles.data ?? []).filter((n) => n.pump_id === p.id).map((n) => ({
        id: n.id,
        label: n.label,
        productName: productName.get(productOfTank.get(n.tank_id) ?? "") ?? n.label,
        lastReading: Number(n.last_reading),
      })),
    })),
  };
  await db.reference.put(data).catch(() => undefined);
  return { source: "server", data };
}

/** The attendant's open shift on the server (opened on another device, or already synced). */
export async function findOpenShiftOnServer(userId: string) {
  const { data, error } = await supabase()
    .from("shifts")
    .select("id, station_id, pump_id, opened_at, opening_cash, shift_readings(nozzle_id, opening_reading)")
    .eq("attendant_id", userId).in("status", ["open", "reopened"])
    .order("opened_at", { ascending: false }).limit(1)
    .abortSignal(AbortSignal.timeout(15_000)).maybeSingle();
  return error ? undefined : data ?? undefined;
}
