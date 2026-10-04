// O7/O1 meter-photo galleries: merges leg_readings rows into one "shot" per distinct (leg, opening/closing,
// path) — a photo that covers several nozzles (the worker app attaches the same path to every reading of one
// opening/closing) becomes a single shot with every nozzle's reading attached, instead of showing the same
// image twice. No imports, so `node --test` runs it directly.

export type PhotoKind = "opening" | "closing";

export type RawLegReading = {
  legId: string;
  pumpNumber: number;
  nozzleLabel: string;
  openingReading: number;
  closingReading: number | null;
  openingPhotoPath: string | null;
  closingPhotoPath: string | null;
  /** the leg's own started_at/ended_at — leg_readings has no timestamp of its own, so this is the honest
   * stand-in for "when this reading was taken" (there is no "when this photo was uploaded" available without
   * exposing Storage's own internal schema — see docs/briefs/09a). */
  legStartedAt: string;
  legEndedAt: string | null;
};

export type PhotoShot = {
  legId: string;
  pumpNumber: number;
  kind: PhotoKind;
  path: string;
  readings: { nozzleLabel: string; value: number }[];
  at: string | null;
};

/** One shot per distinct (leg, kind, path): nozzles sharing a photo merge into one shot with every reading;
 * nozzles photographed separately stay separate shots. Sorted by pump number, then leg, then opening before
 * closing — matches how the pumps/legs list above it already reads top to bottom. */
export function buildPhotoShots(rows: RawLegReading[]): PhotoShot[] {
  const byKey = new Map<string, PhotoShot>();
  for (const r of rows) {
    addShot(byKey, r, "opening", r.openingPhotoPath, r.openingReading, r.legStartedAt);
    if (r.closingReading !== null) addShot(byKey, r, "closing", r.closingPhotoPath, r.closingReading, r.legEndedAt);
  }
  return [...byKey.values()].sort((a, b) =>
    a.pumpNumber - b.pumpNumber
    || a.legId.localeCompare(b.legId)
    || (a.kind === b.kind ? 0 : a.kind === "opening" ? -1 : 1));
}

function addShot(
  byKey: Map<string, PhotoShot>, r: RawLegReading, kind: PhotoKind, path: string | null, value: number, at: string | null,
): void {
  if (!path) return;
  const key = `${r.legId}|${kind}|${path}`;
  const shot = byKey.get(key) ?? { legId: r.legId, pumpNumber: r.pumpNumber, kind, path, readings: [], at };
  shot.readings.push({ nozzleLabel: r.nozzleLabel, value });
  byKey.set(key, shot);
}
