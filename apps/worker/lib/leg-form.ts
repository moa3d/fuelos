// Validation of the readings typed when a pump leg starts (S1, move step 2) or ends (move step 1, close step 1).
// No imports besides reading.ts, so `node --test` runs it directly. The server re-validates everything.
import { checkReading, type ReadingCheck } from "./reading.ts";

export type TypedReading = { nozzleId: string; tenths: number };

export type OpeningResult = {
  checks: Map<string, ReadingCheck>;
  /** unrecorded liters since the last closing reading, summed over the nozzles (spec: needs a written reason) */
  gapTenths: number;
  /** what still blocks the button, as the Arabic hint shown next to it */
  problem?: string;
  readings: TypedReading[];
};

/** Opening readings vs each nozzle's last closing reading. Higher needs `gapNote`; lower is refused. */
export function validateOpening(
  nozzles: { id: string; lastReading: number }[], values: Record<string, string>, gapNote: string,
): OpeningResult {
  const checks = new Map(nozzles.map((n) => [n.id, checkReading(values[n.id] ?? "", n.lastReading)]));
  const all = [...checks.values()];
  const gapTenths = all.reduce((sum, c) => sum + (c.kind === "higher" ? c.diffTenths : 0), 0);
  const problem =
    nozzles.length === 0 ? "لا يوجد مسدس مفعّل على هذه المضخة"
    : all.some((c) => c.kind === "empty") ? "أدخل القراءة الافتتاحية للعداد"
    : all.some((c) => c.kind === "invalid" || c.kind === "lower") ? "صحّح القراءة الافتتاحية"
    : gapTenths > 0 && gapNote.trim() === "" ? "اكتب سبب الفرق عن آخر قراءة"
    : undefined;
  return { checks, gapTenths, problem, readings: readingsOf(checks) };
}

/** Closing readings vs the leg's opening readings: equal is fine (no sales), lower is refused. */
export function validateClosing(
  readings: { nozzleId: string; opening: number }[], values: Record<string, string>,
): { checks: Map<string, ReadingCheck>; problem?: string; readings: TypedReading[] } {
  const checks = new Map(readings.map((r) => [r.nozzleId, checkReading(values[r.nozzleId] ?? "", r.opening)]));
  const all = [...checks.values()];
  const problem =
    all.some((c) => c.kind === "empty") ? "أدخل القراءة النهائية للعداد"
    : all.some((c) => c.kind === "invalid" || c.kind === "lower") ? "صحّح القراءة النهائية"
    : undefined;
  return { checks, problem, readings: readingsOf(checks) };
}

function readingsOf(checks: Map<string, ReadingCheck>): TypedReading[] {
  return [...checks].flatMap(([nozzleId, c]) => ("tenths" in c ? [{ nozzleId, tenths: c.tenths }] : []));
}
