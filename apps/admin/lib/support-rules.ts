// «تذاكر الدعم» — the full ticket queue (A4's own panel only shows the open/in-progress few; this page is
// every ticket, filterable). No imports, so `node --test` runs it directly.

export type TicketStatus = "open" | "in_progress" | "resolved";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_LABEL: Record<TicketStatus, string> = { open: "مفتوحة", in_progress: "قيد المعالجة", resolved: "محلولة" };

/** Whole hours left before a ticket's SLA; negative once past due, null once resolved (nothing left to count
 * down — same shape as the owner-web complaint SLA). */
export function hoursUntilSla(slaDueAtIso: string | null, nowMs: number, status: TicketStatus): number | null {
  if (status === "resolved" || !slaDueAtIso) return null;
  return Math.ceil((Date.parse(slaDueAtIso) - nowMs) / 3_600_000);
}

/** «متبقٍّ 45 ساعة» / «متبقٍّ يومين» / a past-due warning. */
export function slaText(hours: number): { tone: Tone; label: string } {
  if (hours <= 0) return { tone: "danger", label: "تجاوزت مهلة الرد" };
  if (hours < 24) return { tone: hours <= 6 ? "danger" : "warning", label: `متبقٍّ ${hours} ساعة` };
  const days = Math.round(hours / 24);
  const word = days === 1 ? "يوم واحد" : days === 2 ? "يومين" : `${days} أيام`;
  return { tone: "info", label: `متبقٍّ ${word}` };
}

/** Case-insensitive substring match over a ticket's subject and station name together. */
export function matchesSearch(subject: string, stationName: string | null, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === "") return true;
  return subject.toLocaleLowerCase().includes(q) || (stationName ?? "").toLocaleLowerCase().includes(q);
}
