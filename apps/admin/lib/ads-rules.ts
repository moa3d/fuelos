// الإعلانات (docs/briefs/10a; spec docs/superpowers/specs/2026-10-04-sponsor-ads-design.md §4): status badges,
// file/link validation mirroring save_ad's own rules (for instant feedback — the server still re-checks
// everything), date-picker → timestamptz conversion, and sort/export helpers. No imports, so `node --test`
// runs it directly.

export type AdStatus = "scheduled" | "running" | "paused" | "ended";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function statusBadge(status: AdStatus): { tone: Tone; label: string } {
  switch (status) {
    case "scheduled": return { tone: "info", label: "مجدول" };
    case "running": return { tone: "success", label: "يعمل" };
    case "paused": return { tone: "warning", label: "متوقف" };
    case "ended": return { tone: "neutral", label: "منتهٍ" };
  }
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
};
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Mirrors save_ad/the bucket's own rule, checked before ever uploading — a clear message now instead of a
 * round trip just to learn the file was always going to be rejected. */
export function validateImageFile(file: { type: string; size: number }): string | undefined {
  if (!(file.type in ALLOWED_IMAGE_TYPES)) return "ارفع صورة بصيغة JPG أو PNG أو WEBP أو GIF";
  if (file.size > MAX_IMAGE_BYTES) return "الصورة أكبر من 3 ميغابايت";
  return undefined;
}

export function extensionFor(mimeType: string): string {
  return ALLOWED_IMAGE_TYPES[mimeType] ?? "jpg";
}

/** ads/<uuid>.<ext> — the only path shape save_ad accepts. `uuid` is generated once by the caller and reused on
 * retry so a repeated upload stays idempotent (storage upsert:false + "already exists" = fine). */
export function adImagePath(uuid: string, mimeType: string): string {
  return `ads/${uuid}.${extensionFor(mimeType)}`;
}

const HTTPS_RE = /^https:\/\/\S+$/;
const TEL_RE = /^tel:\+?[0-9]{6,15}$/;

/** save_ad's own link rule: https://… or tel:+digits, or empty (not clickable). */
export function validateLink(link: string): string | undefined {
  const v = link.trim();
  if (v === "") return undefined;
  if (HTTPS_RE.test(v) || TEL_RE.test(v)) return undefined;
  return "الرابط يجب أن يبدأ بـ https:// أو يكون رقم هاتف tel:+…";
}

/** «واتساب» helper: a phone typed as digits (with or without a leading +) becomes a wa.me link. */
export function whatsappLink(phoneDigits: string): string {
  const digits = phoneDigits.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

export function telLink(phoneDigits: string): string {
  const digits = phoneDigits.replace(/[^\d+]/g, "");
  return `tel:${digits.startsWith("+") ? digits : `+${digits}`}`;
}

/** A plain <input type="date"> value, as the start of that day in the browser's own local time zone. */
export function startOfDayLocal(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}

/** Brief's own rule: an end date picked as a day means the END of that day, local time — not its start
 * (which would make a one-day-long ad expire before it began). */
export function endOfDayLocal(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

export function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The ▲▼ reorder: the ads whose sort_order must change, with their new value. Every ad is renumbered 0..n-1 in
 * the order the list shows. Swapping two values is not enough: new ads all start at sort_order 0, so swapping
 * two of them changes nothing. Ads already in their final place are left out. */
export function reorderChanges(list: { id: string; sortOrder: number }[], index: number, dir: "up" | "down"): { id: string; sortOrder: number }[] {
  const target = dir === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return [];
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next
    .map((a, i) => ({ id: a.id, sortOrder: i, was: a.sortOrder }))
    .filter((a) => a.sortOrder !== a.was)
    .map(({ id, sortOrder }) => ({ id, sortOrder }));
}

/** Click-through rate as a percentage with one decimal (12 of 100 → 12, 1 of 3 → 33.3). Zero views → 0, never
 * NaN. Clicks are never more than views on the server (record_ad_event back-fills the view), so no clamping. */
export function ctrPercent(views: number, clicks: number): number {
  if (views <= 0) return 0;
  return Math.round((clicks * 1000) / views) / 10;
}

// ---------- stats export (same shape style as lib/sales-rules.ts's A5 export) ----------
export type StatTotal = { adId: string; sponsorName: string; title: string; views: number; clicks: number; ctr: number };
export type ExportCell = string | number;
export const STATS_HEADERS = ["الراعي", "العنوان", "المشاهدات", "النقرات", "نسبة النقر %"] as const;

export function toStatsExportRow(t: StatTotal): ExportCell[] {
  return [t.sponsorName, t.title, t.views, t.clicks, t.ctr];
}

export type StatSortKey = "sponsorName" | "title" | "views" | "clicks" | "ctr";
export type SortDir = "asc" | "desc";
export function sortStatTotals(rows: StatTotal[], key: StatSortKey, dir: SortDir): StatTotal[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key]; const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
    return String(av).localeCompare(String(bv), "ar") * sign;
  });
}
