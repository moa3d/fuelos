// O6 helpers: the previous-period comparison window, margin/percent-change math, and the aging/limit badges
// for the report cards (design/screens/O6.png). No imports, so `node --test` runs it. BigInt cents, no floats.

/** The immediately preceding window of equal length — e.g. "هذا الأسبوع" compares to the 7 days before it. */
export function priorWindow(fromMs: number, toMs: number): { fromMs: number; toMs: number } {
  const length = toMs - fromMs;
  return { fromMs: fromMs - length, toMs: fromMs };
}

/** The same span one calendar month earlier ("مقارنة بالفترة نفسها من أغسطس") — day-of-month preserved,
 * clamped to the shorter month (e.g. Aug 31 one month back from Sep 30 stays Aug 31, not Oct 1). */
export function priorMonth(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInMonth));
  return d.toISOString();
}

/** Net margin as a percent of revenue, one decimal place (design: 3,230,000 of 48,630,000 → 6.6%). Can be
 * negative on a loss; null when there's no revenue to divide by. */
export function marginPercent(netProfitCents: bigint, revenueCents: bigint): number | null {
  if (revenueCents === 0n) return null;
  const sign = netProfitCents < 0n ? -1n : 1n;
  const n = netProfitCents < 0n ? -netProfitCents : netProfitCents;
  const tenths = (n * 2000n + revenueCents) / (revenueCents * 2n); // one decimal place, half-up
  return Number(sign * tenths) / 10;
}

/** Signed percent change vs. the previous period, for «الربح أعلى بـ12.5% من أغسطس». Null with no baseline. */
export function percentChange(currentCents: bigint, previousCents: bigint): number | null {
  if (previousCents === 0n) return null;
  const diff = currentCents - previousCents;
  const sign = diff < 0n ? -1n : 1n;
  const n = diff < 0n ? -diff : diff;
  const base = previousCents < 0n ? -previousCents : previousCents;
  const tenths = (n * 2000n + base) / (base * 2n); // one decimal place, half-up
  return Number(sign * tenths) / 10;
}

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";
export type Badge = { tone: Tone; label: string };

/** «ضمن الحد» / «يحتاج انتباهاً» — used for both the inventory-waste share and the cash-discrepancy count. */
export function limitBadge(hasIssue: boolean): Badge {
  return hasIssue ? { tone: "danger", label: "يحتاج انتباهاً" } : { tone: "success", label: "ضمن الحد" };
}

/** Waste/adjustments as a share of revenue, 0–100+ (design: 0.3%). One decimal place, half-up. */
export function wasteSharePercent(adjustmentCents: bigint, revenueCents: bigint): number {
  if (revenueCents <= 0n) return 0;
  const a = adjustmentCents < 0n ? -adjustmentCents : adjustmentCents;
  const tenths = (a * 2000n + revenueCents) / (revenueCents * 2n); // one decimal place, half-up
  return Number(tenths) / 10;
}

export type AgingBucket = "0-30" | "31-60" | "60+";

/** Every company's unpaid lots, bucketed by age, for the station-wide «أعمار الديون» card. */
export function aggregateAging(lots: { amountCents: bigint; ageDays: number }[]): Record<AgingBucket, bigint> {
  const totals: Record<AgingBucket, bigint> = { "0-30": 0n, "31-60": 0n, "60+": 0n };
  for (const l of lots) {
    const bucket: AgingBucket = l.ageDays <= 30 ? "0-30" : l.ageDays <= 60 ? "31-60" : "60+";
    totals[bucket] += l.amountCents;
  }
  return totals;
}

/** Share of the fuel mix by liters, 0–100 (design: بنزين 95 = 46% من الكمية). */
export function litersSharePercent(productLiters: number, totalLiters: number): number {
  if (totalLiters <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((productLiters / totalLiters) * 100)));
}
