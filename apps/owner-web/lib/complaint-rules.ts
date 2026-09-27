// O10 helpers: status/kind labels, the SLA countdown, and canned replies (design/screens/O10.png).
// No imports, so `node --test` runs it directly.

export type ComplaintStatus = "open" | "awaiting_station" | "resolved" | "escalated";
export type ComplaintKind = "complaint" | "price_report";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: "مفتوحة", awaiting_station: "قيد الرد", resolved: "محلولة", escalated: "مصعّدة",
};

/** The list badge: an active case shows «بانتظار ردك»; escalated/resolved show their own state. */
export function statusBadge(status: ComplaintStatus): { tone: Tone; label: string } {
  switch (status) {
    case "open": case "awaiting_station": return { tone: "warning", label: "بانتظار ردك" };
    case "escalated": return { tone: "danger", label: "مصعّدة للمنصة" };
    case "resolved": return { tone: "success", label: "محلولة" };
  }
}

export const KIND_ICON: Record<ComplaintKind, string> = { complaint: "💬", price_report: "🏷" };
export const KIND_LABEL: Record<ComplaintKind, string> = { complaint: "شكوى", price_report: "بلاغ سعر" };

/** Whole hours left before the 48h SLA escalates the case; negative once past due. Null once decided. */
export function hoursUntilSla(slaDueAtIso: string, nowMs: number, status: ComplaintStatus): number | null {
  if (status === "resolved" || status === "escalated") return null;
  return Math.ceil((Date.parse(slaDueAtIso) - nowMs) / 3_600_000);
}

/** «متبقٍّ 45 ساعة قبل التصعيد» / «متبقٍّ يوم واحد …» / an overdue warning once past the SLA. */
export function slaText(hours: number): { tone: Tone; label: string } {
  if (hours <= 0) return { tone: "danger", label: "تجاوز مهلة الرد — سيُصعَّد للمنصة" };
  if (hours < 24) return { tone: hours <= 6 ? "danger" : "warning", label: `متبقٍّ ${hours} ساعة قبل التصعيد` };
  const days = Math.round(hours / 24);
  const word = days === 1 ? "يوم واحد" : days === 2 ? "يومين" : `${days} أيام`;
  return { tone: "warning", label: `متبقٍّ ${word} قبل التصعيد` };
}

/** Who may act, split by action: the whole screen is owner/shift_manager (complaints RLS); recording an
 * invoice correction is owner/accountant (invoice_corrections RLS) — on this screen that means owner only. */
export function canHandle(role: string): boolean {
  return role === "owner" || role === "shift_manager";
}
export function canCorrectInvoice(role: string): boolean {
  return role === "owner";
}

export type Canned = { label: string; body: string };
export const CANNED_REPLIES: Canned[] = [
  { label: "تم تصحيح الفاتورة", body: "تحققنا من الأمر وسنصدر تصحيحاً للفاتورة. نعتذر عن الإزعاج." },
  { label: "سنتواصل معك هاتفياً", body: "شكراً لتواصلك — سيتصل بك أحد موظفينا خلال ساعات العمل لمتابعة الموضوع." },
  { label: "نعتذر عن التأخير", body: "نعتذر عن التأخير في الرد، ونعمل على حل الموضوع في أقرب وقت." },
];
