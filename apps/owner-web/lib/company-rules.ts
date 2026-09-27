// O5 helpers: FIFO aging of a company's balance, the overdue days it implies, the risk badge and the
// company's credit utilization. No imports, so `node --test` runs it. BigInt cents, no floats.
import { cents } from "./money.ts";

type Num = number | string;
export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";
export type CompanyStatus = "active" | "frozen" | "suspended";

export type Lot = { amountCents: bigint; at: string };

/**
 * Payments pay off the oldest sales first (FIFO), regardless of a payment's own date — the standard way to
 * age a running balance. Returns the unpaid lots left (oldest first) and the total, which equals
 * company_balance() on the server when every sale and payment is included.
 */
export function fifoAging(sales: { amount: Num; at: string }[], payments: { amount: Num; at: string }[]): { unpaid: Lot[]; totalCents: bigint } {
  const queue: Lot[] = sales.map((s) => ({ amountCents: cents(s.amount), at: s.at })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let toPay = payments.reduce((sum, p) => sum + cents(p.amount), 0n);
  let i = 0;
  while (toPay > 0n && i < queue.length) {
    if (queue[i].amountCents <= toPay) {
      toPay -= queue[i].amountCents;
      i++;
    } else {
      queue[i] = { ...queue[i], amountCents: queue[i].amountCents - toPay };
      toPay = 0n;
    }
  }
  const unpaid = queue.slice(i);
  return { unpaid, totalCents: unpaid.reduce((s, l) => s + l.amountCents, 0n) };
}

/** Age of the oldest unpaid sale, in whole days; null when nothing is outstanding. */
export function overdueDays(unpaid: Lot[], nowMs: number): number | null {
  if (unpaid.length === 0) return null;
  const oldest = Math.min(...unpaid.map((l) => Date.parse(l.at)));
  return Math.floor((nowMs - oldest) / 86_400_000);
}

export type AgingBucket = "0-30" | "31-60" | "60+";

/** Each unpaid lot bucketed by its own age, for a portfolio-wide risk summary. */
export function bucketOf(days: number): AgingBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  return "60+";
}

/** Share of the credit limit in use, 0–100 (design: 212,000 of 250,000 → 85). */
export function utilizationPercent(remainingCents: bigint, limitCents: bigint): number {
  if (limitCents <= 0n) return 0;
  const used = limitCents - remainingCents;
  // round(used/limit × 100) done in BigInt: floor((2·used·100 + limit) / (2·limit)), half rounded up
  const pct = (used * 200n + limitCents) / (limitCents * 2n);
  return Math.max(0, Math.min(100, Number(pct)));
}

export type Badge = { tone: Tone; label: string };

/**
 * One badge, most urgent first: account status, then overdue beyond 30 days, then near the credit limit,
 * otherwise «منتظم». `days` is `overdueDays()`; `utilPct` is `utilizationPercent()`.
 */
export function companyBadge(status: CompanyStatus, days: number | null, utilPct: number, nearLimitAt = 80): Badge {
  if (status === "suspended") return { tone: "neutral", label: "موقوف" };
  if (status === "frozen") return { tone: "neutral", label: "مجمّد" };
  if (days !== null && days > 30) return { tone: "danger", label: `متأخر ${days} يوماً` };
  if (utilPct >= nearLimitAt) return { tone: "warning", label: "قرب الحد" };
  return { tone: "success", label: "منتظم" };
}

/** The riskiest active company worth a proactive nudge: overdue and already near its limit. */
export function needsAttention(days: number | null, utilPct: number, nearLimitAt = 80): boolean {
  return days !== null && days > 30 && utilPct >= nearLimitAt;
}
