// A1 «لوحة المنصة» helpers: MRR, badges, and the "needs attention" thresholds. No imports, so `node --test`
// runs it directly. BigInt cents, no floats.

export type SubStatus = "trial" | "active" | "past_due" | "cancelled" | "legacy";
export type TicketStatus = "open" | "in_progress" | "resolved";
export type TicketPriority = "low" | "medium" | "high";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export type SubForMrr = { status: SubStatus; planMonthlyPriceCents: bigint; perStation: boolean; stationCount: number };

/** Recurring revenue: ACTIVE subscriptions only — matches mrr_snapshots' own definition (docs/briefs/06a), so
 * the live figure and the historical trend never disagree. A per-station plan (e.g. «شبكة») multiplies by how
 * many stations that organization has. */
export function mrrCents(subs: SubForMrr[]): bigint {
  return subs
    .filter((s) => s.status === "active")
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

/** «لم تُزامن منذ 3 أيام» — a station's most recent device sync is older than the threshold. Null (no device
 * has ever synced) doesn't count here: a brand-new station isn't "stale", it just hasn't started yet. */
export function deviceSyncStale(latestSyncAt: string | null, nowMs: number, thresholdDays = 3): boolean {
  if (!latestSyncAt) return false;
  return nowMs - Date.parse(latestSyncAt) > thresholdDays * 86_400_000;
}
