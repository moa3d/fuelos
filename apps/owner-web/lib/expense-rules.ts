// O8 helpers: category labels, the monthly breakdown bars, and the plain-language preview of the ledger entry
// post_expense() will create. No imports, so `node --test` runs it. BigInt cents, no floats.
import { cents } from "./money.ts";

type Num = number | string;
export type Category = "salaries" | "utilities" | "maintenance" | "transport" | "other";
export type PaidFrom = "cash" | "bank";

export const CATEGORY_LABEL: Record<Category, string> = {
  salaries: "رواتب", utilities: "كهرباء ومياه", maintenance: "صيانة", transport: "نقل ومحروقات", other: "أخرى",
};
export const CATEGORY_TONE: Record<Category, "primary" | "info" | "warning" | "neutral"> = {
  salaries: "primary", utilities: "info", maintenance: "warning", transport: "info", other: "neutral",
};
export const PAID_FROM_LABEL: Record<PaidFrom, string> = { cash: "من الصندوق", bank: "من البنك" };

export type CategoryTotal = { category: Category; amountCents: bigint };

/** Posted expenses of the period, summed per category, largest first — the design's «مصاريف سبتمبر» bars. */
export function monthlyByCategory(rows: { category: Category; amount: Num }[]): { totalCents: bigint; rows: CategoryTotal[] } {
  const sums = new Map<Category, bigint>();
  for (const r of rows) sums.set(r.category, (sums.get(r.category) ?? 0n) + cents(r.amount));
  const list = (Object.keys(CATEGORY_LABEL) as Category[])
    .map((category) => ({ category, amountCents: sums.get(category) ?? 0n }))
    .filter((r) => r.amountCents > 0n)
    .sort((a, b) => (b.amountCents > a.amountCents ? 1 : b.amountCents < a.amountCents ? -1 : 0));
  return { totalCents: list.reduce((s, r) => s + r.amountCents, 0n), rows: list };
}

/** Share of the month's total, 0–100, for each category's bar width. */
export function sharePercent(amountCents: bigint, totalCents: bigint): number {
  if (totalCents <= 0n) return 0;
  return Math.max(0, Math.min(100, Number((amountCents * 100n) / totalCents)));
}

/** Plain-language preview of what saving («حفظ المصروف») will post — account codes stay out of the UI. */
export function ledgerPreview(category: Category, paidFrom: PaidFrom): string {
  return `سيُنشأ قيد: مصروف ${CATEGORY_LABEL[category]} — ${PAID_FROM_LABEL[paidFrom]}`;
}

/** Whether any expense (draft or posted) is already dated today, for the reminder banner. */
export function hasTodayEntry(expenseDates: string[], todayISODate: string): boolean {
  return expenseDates.includes(todayISODate);
}
