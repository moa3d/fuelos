// Shared by O7 (approvals detail) and O1 (dashboard «آخر المناوبات»): both read the same leg_readings +
// meter-photos bucket a station member can already see under RLS — no new RPC needed.
import { buildPhotoShots, type PhotoShot, type RawLegReading } from "./photo-rules.ts";
import { supabase } from "./supabase.ts";

const signal = () => AbortSignal.timeout(20_000);
const SIGNED_URL_SECONDS = 600; // 10 minutes

/** One batched call for every distinct path, not one per photo. */
export async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data, error } = await supabase().storage.from("meter-photos").createSignedUrls(unique, SIGNED_URL_SECONDS);
  if (error || !data) return map;
  for (const d of data) if (d.path && d.signedUrl && !d.error) map.set(d.path, d.signedUrl);
  return map;
}

export type ShiftPhotos = { shots: PhotoShot[]; urls: Map<string, string> };

/** Every leg_reading of the given legs, merged into shots (lib/photo-rules.ts) and signed in one batch. */
export async function loadShiftPhotos(legIds: string[]): Promise<ShiftPhotos> {
  if (legIds.length === 0) return { shots: [], urls: new Map() };
  const { data, error } = await supabase().from("leg_readings")
    .select("leg_id, opening_reading, closing_reading, opening_photo_path, closing_photo_path, nozzles(label), shift_legs(started_at, ended_at, pumps(number))")
    .in("leg_id", legIds).abortSignal(signal());
  if (error) throw new Error(error.message);

  type Raw = {
    leg_id: string; opening_reading: number | string; closing_reading: number | string | null;
    opening_photo_path: string | null; closing_photo_path: string | null;
    nozzles: { label: string } | null;
    shift_legs: { started_at: string; ended_at: string | null; pumps: { number: number } | null } | null;
  };
  const rows: RawLegReading[] = ((data ?? []) as unknown as Raw[]).map((r) => ({
    legId: r.leg_id, pumpNumber: r.shift_legs?.pumps?.number ?? 0, nozzleLabel: r.nozzles?.label ?? "",
    openingReading: Number(r.opening_reading), closingReading: r.closing_reading === null ? null : Number(r.closing_reading),
    openingPhotoPath: r.opening_photo_path, closingPhotoPath: r.closing_photo_path,
    legStartedAt: r.shift_legs?.started_at ?? new Date(0).toISOString(), legEndedAt: r.shift_legs?.ended_at ?? null,
  }));
  const shots = buildPhotoShots(rows);
  const urls = await signPaths(shots.map((s) => s.path));
  return { shots, urls };
}
