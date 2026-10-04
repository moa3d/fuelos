// الإعلانات (docs/briefs/10a; spec §4): every write and every aggregate read goes through Cowork's RPCs —
// ads/ad_events have RLS on with no policies at all, so there's nothing for this file to read directly.
import { errorMessage } from "@fuelos/core";
import type { AdStatus } from "./ads-rules.ts";
import { supabase } from "./supabase.ts";

const signal = () => AbortSignal.timeout(30_000);

// The brief's own Arabic wording for codes the shared packages/core map either lacks or phrases generically.
const LOCAL: Record<string, string> = {
  FUELOS_PERMISSION_DENIED: "هذا الإجراء لمدير المنصة فقط",
  FUELOS_REQUIRED: "أكمل اسم الراعي والعنوان والصورة",
  FUELOS_NOT_FOUND: "الإعلان غير موجود أو مؤرشف",
};
const BAD_REQUEST_DETAIL: Record<string, string> = {
  sponsor_name: "الاسم أطول من 120 حرفاً", title: "العنوان أطول من 120 حرفاً",
  image_path: "ارفع صورة بصيغة JPG أو PNG أو WEBP أو GIF",
  link: "الرابط يجب أن يبدأ بـ https:// أو يكون رقم هاتف tel:+…",
  dates: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية",
  period: "اختر فترة صحيحة (حتى 13 شهراً)",
};

function toMessage(error: { message?: string; code?: string; details?: string | null } | null, fallback: string): string {
  if (!error) return fallback;
  const code = error.message?.startsWith("FUELOS_") ? error.message.trim() : error.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  if (code === "FUELOS_BAD_REQUEST") {
    const detail = error.details?.trim();
    return (detail && BAD_REQUEST_DETAIL[detail]) || "تحقق من البيانات المدخلة";
  }
  return (code && LOCAL[code]) || (code ? errorMessage(code) : fallback);
}

export type AdminAd = {
  id: string; sponsorName: string; title: string; imagePath: string; linkUrl: string | null;
  startsAt: string; endsAt: string | null; isPaused: boolean; sortOrder: number;
  createdAt: string; updatedAt: string; status: AdStatus; views: number; clicks: number;
};

type Num = number | string;
type RawAd = {
  id: string; sponsor_name: string; title: string; image_path: string; link_url: string | null;
  starts_at: string; ends_at: string | null; is_paused: boolean; sort_order: Num;
  created_at: string; updated_at: string; status: AdStatus; views: Num; clicks: Num;
};

function toAd(r: RawAd): AdminAd {
  return {
    id: r.id, sponsorName: r.sponsor_name, title: r.title, imagePath: r.image_path, linkUrl: r.link_url,
    startsAt: r.starts_at, endsAt: r.ends_at, isPaused: r.is_paused, sortOrder: Number(r.sort_order),
    createdAt: r.created_at, updatedAt: r.updated_at, status: r.status,
    views: Number(r.views), clicks: Number(r.clicks),
  };
}

export const AD_IMAGES_BUCKET = "ad-images";

export function adImageUrl(imagePath: string): string {
  return supabase().storage.from(AD_IMAGES_BUCKET).getPublicUrl(imagePath).data.publicUrl;
}

export async function loadAds(): Promise<AdminAd[]> {
  const { data, error } = await supabase().rpc("admin_ads").abortSignal(signal());
  if (error) throw new Error(toMessage(error, "تعذّر تحميل الإعلانات"));
  return ((data ?? []) as RawAd[]).map(toAd);
}

export type UploadOutcome = { ok: true; path: string } | { ok: false; message: string };

/** ads/<uuid>.<ext> — the only path shape save_ad accepts (and the only folder the storage policies allow). */
export async function uploadAdImage(path: string, file: File): Promise<UploadOutcome> {
  const { error } = await supabase().storage.from(AD_IMAGES_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    const msg = error.message ?? "";
    if (/mime|type/i.test(msg)) return { ok: false, message: "ارفع صورة بصيغة JPG أو PNG أو WEBP أو GIF" };
    if (/size|413|large/i.test(msg)) return { ok: false, message: "الصورة أكبر من 3 ميغابايت" };
    return { ok: false, message: "تعذّر رفع الصورة — حاول مرة أخرى" };
  }
  return { ok: true, path };
}

export async function deleteAdImage(path: string): Promise<void> {
  await supabase().storage.from(AD_IMAGES_BUCKET).remove([path]);
}

export type SaveAdInput = {
  id: string | null; sponsorName: string; title: string; imagePath: string; link: string;
  startsAt: string | null; endsAt: string | null; sortOrder: number | null; isPaused: boolean | null;
};

export async function saveAd(input: SaveAdInput): Promise<AdminAd> {
  const { data, error } = await supabase().rpc("save_ad", {
    p_id: input.id, p_sponsor: input.sponsorName, p_title: input.title, p_image_path: input.imagePath,
    p_link: input.link.trim() === "" ? null : input.link.trim(),
    p_starts: input.startsAt, p_ends: input.endsAt, p_sort: input.sortOrder, p_paused: input.isPaused,
  }).abortSignal(signal());
  if (error) throw new Error(toMessage(error, "تعذّر حفظ الإعلان"));
  // save_ad returns the bare row (no status/views/clicks) — admin_ads is re-fetched by the caller for those;
  // a freshly-saved ad has no events yet, so a "running"-ish status here is only a placeholder until that refetch.
  const row = data as Omit<RawAd, "status" | "views" | "clicks">;
  return toAd({ ...row, status: "running", views: 0, clicks: 0 });
}

export async function archiveAd(id: string): Promise<void> {
  const { error } = await supabase().rpc("archive_ad", { p_id: id }).abortSignal(signal());
  if (error) throw new Error(toMessage(error, "تعذّر أرشفة الإعلان"));
}

export type StatRow = { adId: string; sponsorName: string; title: string; day: string; views: number; clicks: number };
export type StatTotal = { adId: string; sponsorName: string; title: string; views: number; clicks: number; ctr: number };
export type AdStats = { rows: StatRow[]; totals: StatTotal[] };

type RawStatRow = { ad_id: string; sponsor_name: string; title: string; day: string; views: Num; clicks: Num };
type RawStatTotal = { ad_id: string; sponsor_name: string; title: string; views: Num; clicks: Num; ctr: Num };

export async function loadAdStats(from: string, to: string): Promise<AdStats> {
  const { data, error } = await supabase().rpc("ad_stats", { p_from: from, p_to: to }).abortSignal(signal());
  if (error) throw new Error(toMessage(error, "تعذّر تحميل الإحصائيات"));
  const r = data as { rows: RawStatRow[]; totals: RawStatTotal[] };
  return {
    rows: (r.rows ?? []).map((x) => ({ adId: x.ad_id, sponsorName: x.sponsor_name, title: x.title, day: x.day, views: Number(x.views), clicks: Number(x.clicks) })),
    totals: (r.totals ?? []).map((x) => ({ adId: x.ad_id, sponsorName: x.sponsor_name, title: x.title, views: Number(x.views), clicks: Number(x.clicks), ctr: Number(x.ctr) })),
  };
}
