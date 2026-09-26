// Station reference data: the pump board (pump_board RPC), station settings and prices.
// Fetched through RLS/RPC when online and cached in IndexedDB for offline use.
import { db, type LocalLeg, type LocalShift, type PumpRef, type StationRef } from "./db";
import type { ServerShift, ServerStatus } from "./shift-merge";
import { supabase } from "./supabase";

const CURRENCY_LABELS: Record<string, string> = { SYP: "ل.س" };
const TIMEOUT_MS = 15_000;

export type ReferenceResult =
  | { source: "server"; data: StationRef }
  | { source: "cache"; data: StationRef }       // offline or server unreachable: last saved copy
  | { source: "none" };                          // offline and nothing cached yet

/** Thrown when the server answered with an error (not a network problem). */
export class ReferenceLoadError extends Error {}

function isNetworkError(message: string | undefined): boolean {
  return !navigator.onLine || /fetch|network|abort|timeout/i.test(message ?? "");
}

type BoardRow = {
  pump_id: string; number: number; name: string | null; held_by: string | null; held_by_me: boolean;
  nozzles: { nozzle_id: string; label: string; product_id: string; product_name: string; last_reading: number }[];
};

export async function loadReference(stationId: string): Promise<ReferenceResult> {
  const cached = await db.reference.get(stationId).catch(() => undefined);
  const fromCache = (): ReferenceResult => (cached ? { source: "cache", data: cached } : { source: "none" });
  if (!navigator.onLine) return fromCache();

  const sb = supabase();
  const signal = () => AbortSignal.timeout(TIMEOUT_MS);
  const [station, board, prices] = await Promise.all([
    sb.from("stations").select("name, currency_code, offline_max_ops, cash_tolerance, max_shift_hours")
      .eq("id", stationId).abortSignal(signal()).maybeSingle(),
    sb.rpc("pump_board", { p_station: stationId }).abortSignal(signal()),
    sb.from("prices").select("product_id, price, effective_at").eq("station_id", stationId).abortSignal(signal()),
  ]);
  const failed = [station, board, prices].find((r) => r.error);
  if (failed?.error) {
    if (isNetworkError(failed.error.message)) return fromCache();
    throw new ReferenceLoadError(failed.error.message);
  }
  if (!station.data) throw new ReferenceLoadError("station not visible");

  const data: StationRef = {
    stationId,
    stationName: station.data.name,
    currencyLabel: CURRENCY_LABELS[station.data.currency_code] ?? station.data.currency_code,
    offlineMaxOps: station.data.offline_max_ops ?? 50,
    cashTolerance: String(station.data.cash_tolerance ?? "0"),
    maxShiftHours: station.data.max_shift_hours ?? 12,
    fetchedAt: new Date().toISOString(),
    prices: (prices.data ?? []).map((p) => ({ productId: p.product_id, price: String(p.price), effectiveAt: p.effective_at })),
    pumps: ((board.data ?? []) as BoardRow[]).map((p): PumpRef => ({
      id: p.pump_id,
      number: p.number,
      name: p.name,
      heldBy: p.held_by,
      heldByMe: p.held_by_me,
      nozzles: p.nozzles.map((n) => ({
        id: n.nozzle_id, label: n.label, productId: n.product_id, productName: n.product_name,
        lastReading: Number(n.last_reading),
      })),
    })),
  };
  await db.reference.put(data).catch(() => undefined);
  return { source: "server", data };
}

/**
 * After a local move or open, keep the cached board in step with what this device knows,
 * so an offline S1/move shows the right holder and prefill.
 */
export async function patchBoard(stationId: string, fn: (pumps: PumpRef[]) => void): Promise<void> {
  await db.reference.where("stationId").equals(stationId).modify((ref: StationRef) => fn(ref.pumps)).catch(() => undefined);
}

type ServerLeg = {
  id: string; pump_id: string; started_at: string; ended_at: string | null; gap_note: string | null;
  leg_readings: { nozzle_id: string; opening_reading: number; closing_reading: number | null }[];
};
type ServerShiftRow = {
  id: string; station_id: string; status: ServerStatus; opened_at: string; opening_cash: number | string;
  counted_cash: number | string | null; diff_reason: string | null; decision_note: string | null; shift_legs: ServerLeg[];
};

const SHIFT_COLUMNS =
  "id, station_id, status, opened_at, opening_cash, counted_cash, diff_reason, decision_note, " +
  "shift_legs(id, pump_id, started_at, ended_at, gap_note, leg_readings(nozzle_id, opening_reading, closing_reading))";

/** Server legs → the device's shape (pump numbers and fuel names come from the cached station data). */
export function mapServerLegs(legs: ServerLeg[], ref: StationRef): LocalLeg[] {
  const pumps = new Map(ref.pumps.map((p) => [p.id, p]));
  return [...legs]
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
    .map((l) => {
      const pump = pumps.get(l.pump_id);
      const nozzles = new Map(pump?.nozzles.map((n) => [n.id, n]) ?? []);
      return {
        legId: l.id, pumpId: l.pump_id, pumpNumber: pump?.number ?? 0, startedAt: l.started_at,
        endedAt: l.ended_at ?? undefined, gapNote: l.gap_note ?? undefined,
        readings: l.leg_readings.map((r) => ({
          nozzleId: r.nozzle_id, label: nozzles.get(r.nozzle_id)?.productName ?? "",
          productId: nozzles.get(r.nozzle_id)?.productId ?? "",
          opening: Number(r.opening_reading),
          closing: r.closing_reading === null ? undefined : Number(r.closing_reading),
        })),
      };
    });
}

/**
 * The attendant's working shift on the server (opened on another device, or already synced), as a LocalShift.
 * A reopened shift carries the owner's note (why he returned the close).
 */
export async function findOpenShiftOnServer(userId: string, ref: StationRef): Promise<LocalShift | undefined> {
  const { data, error } = await supabase()
    .from("shifts").select(SHIFT_COLUMNS)
    .eq("attendant_id", userId).in("status", ["open", "reopened"])
    .order("opened_at", { ascending: false }).limit(1)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS)).maybeSingle();
  if (error || !data) return undefined;
  const s = data as unknown as ServerShiftRow;
  return {
    userId, shiftId: s.id, stationId: s.station_id, openedAt: s.opened_at, openingCash: String(s.opening_cash),
    status: "open", legs: mapServerLegs(s.shift_legs, ref),
    returnedNote: s.status === "reopened" && s.decision_note ? s.decision_note : undefined,
  };
}

/** One shift by id, whatever its status — to learn what the owner decided. */
export async function loadServerShift(shiftId: string, ref: StationRef): Promise<ServerShift | undefined> {
  const { data, error } = await supabase()
    .from("shifts").select(SHIFT_COLUMNS).eq("id", shiftId)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS)).maybeSingle();
  if (error || !data) return undefined;
  const s = data as unknown as ServerShiftRow;
  return {
    status: s.status, decisionNote: s.decision_note, diffReason: s.diff_reason,
    countedCash: s.counted_cash === null ? null : String(s.counted_cash),
    legs: mapServerLegs(s.shift_legs, ref),
  };
}
