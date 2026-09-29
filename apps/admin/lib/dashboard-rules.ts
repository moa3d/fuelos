// A1 «لوحة المنصة» helpers: MRR, badges, and the "needs attention" thresholds. No imports, so `node --test`
// runs it directly. BigInt cents, no floats.

export type SubStatus = "trial" | "active" | "past_due" | "cancelled" | "legacy";
export type TicketStatus = "open" | "in_progress" | "resolved";
export type TicketPriority = "low" | "medium" | "high";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export type SubForMrr = { status: SubStatus; planMonthlyPriceCents: bigint; perStation: boolean; stationCount: number };

/** Recurring revenue: active and past-due subscriptions only (still nominally billed); a per-station plan
 * (e.g. «شبكة») multiplies by how many stations that organization has. */
export function mrrCents(subs: SubForMrr[]): bigint {
  return subs
    .filter((s) => s.status === "active" || s.status === "past_due")
    .reduce((sum, s) => sum + s.planMonthlyPriceCents * BigInt(s.perStation ? s.stationCount : 1), 0n);
}

/** Whole days from now until an ISO timestamp; negative once past. */
export function daysUntil(iso: string, nowMs: number): number {
  return Math.ceil((Date.parse(iso) - nowMs) / 86_400_000);
}

export function subscriptionBadge(status: SubStatus): { tone: Tone; label: string } {
  switch (status) {
    case "trial": return { tone: "info", label: "تجربة" };
    case "active": return { tone: "success", label: "نشط" };
    case "past_due": return { tone: "danger", label: "متأخر الدفع" };
    case "cancelled": return { tone: "neutral", label: "ملغى" };
    case "legacy": return { tone: "neutral", label: "خطة قديمة" };
  }
}

export function ticketBadge(priority: TicketPriority): { tone: Tone; label: string } {
  switch (priority) {
    case "high": return { tone: "danger", label: "عالية" };
    case "medium": return { tone: "warning", label: "متوسطة" };
    case "low": return { tone: "neutral", label: "منخفضة" };
  }
}

/** A trial within this many days of ending needs a nudge (design: «تنتهي خلال 3 أيام»). */
export function trialEndingSoon(trialEndsAt: string | null, nowMs: number, withinDays = 3): boolean {
  if (!trialEndsAt) return false;
  const d = daysUntil(trialEndsAt, nowMs);
  return d >= 0 && d <= withinDays;
}
