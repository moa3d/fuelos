// Meter photos (docs/briefs/06c, delivered in 06e): optional, uploaded straight to the `meter-photos` bucket
// while the attendant is online — the photo must never block a shift (fuelos-offline-sync), so a failed or
// offline upload simply leaves the reading without one; there is no background retry queue for the file itself.
// Path: {station_id}/{leg_id}/{nozzle_id}-{opening|closing}-{uuid}.jpg (one photo documents the whole pump,
// so the same path is attached to every nozzle reading of that opening/closing).
import { supabase } from "./supabase.ts";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function validatePhoto(file: File): string | undefined {
  if (!(file.type in ALLOWED_TYPES)) return "صيغة الصورة غير مدعومة — استخدم JPG أو PNG أو WEBP";
  if (file.size > MAX_PHOTO_BYTES) return "حجم الصورة أكبر من 5 ميغابايت";
  return undefined;
}

export type PhotoKind = "opening" | "closing";
export type PhotoUpload = { ok: true; path: string } | { ok: false; message: string };

/** Uploads with upsert:false — a retry of the SAME photoId reuses the same path, and a 409 "already exists"
 * on that retry counts as success (idempotent), matching the offline outbox's own replay rule. */
export async function uploadMeterPhoto(params: {
  stationId: string; legId: string; nozzleId: string; kind: PhotoKind; file: File; photoId: string;
}): Promise<PhotoUpload> {
  const invalid = validatePhoto(params.file);
  if (invalid) return { ok: false, message: invalid };
  const ext = ALLOWED_TYPES[params.file.type];
  const path = `${params.stationId}/${params.legId}/${params.nozzleId}-${params.kind}-${params.photoId}.${ext}`;
  const { error } = await supabase().storage.from("meter-photos").upload(path, params.file, { upsert: false, contentType: params.file.type });
  if (error && !isAlreadyExists(error)) return { ok: false, message: "تعذّر رفع الصورة — يمكنك المتابعة بدون صورة" };
  return { ok: true, path };
}

function isAlreadyExists(error: { message?: string; statusCode?: string }): boolean {
  return error.statusCode === "409" || /already exists/i.test(error.message ?? "");
}
