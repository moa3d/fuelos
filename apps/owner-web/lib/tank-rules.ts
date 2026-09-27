// O2 helpers: tank level status, days-of-stock estimate, movement labels. No imports, so `node --test` runs it.
export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

/** The level bar's color: red under the minimum, amber near it (within 5 points), green otherwise. */
export function levelTone(pct: number, minPct: number): "danger" | "warning" | "success" {
  if (pct < minPct) return "danger";
  if (pct < minPct + 5) return "warning";
  return "success";
}

/** Liters ÷ average daily liters sold, or null when there is not enough sales history yet. */
export function daysOfStock(bookL: number, avgDailyL: number): number | null {
  if (avgDailyL <= 0) return null;
  return bookL / avgDailyL;
}

/** Σ|sale liters| ÷ days spanned — the average daily draw used for «يكفي X يوم». */
export function avgDailyFromSales(saleLitersAbs: number[], days: number): number {
  if (days <= 0) return 0;
  return saleLitersAbs.reduce((s, l) => s + l, 0) / days;
}

export type CardFlag = { tone: Tone; label: string } | undefined;

/**
 * One badge per card, most important first: a stock adjustment awaiting a decision, then below the minimum
 * level, then the last delivery still missing its purchase cost (estimated profit). Otherwise none.
 */
export function cardFlag(input: { hasPendingAdjustment: boolean; belowMin: boolean; lastDeliveryMissingCost: boolean }): CardFlag {
  if (input.hasPendingAdjustment) return { tone: "danger", label: "فرق يتطلب سبباً" };
  if (input.belowMin) return { tone: "warning", label: "أقل من الحد الأدنى" };
  if (input.lastDeliveryMissingCost) return { tone: "info", label: "سعر الشراء الأخير غير مدخل" };
  return undefined;
}

export type MovementType = "receipt" | "sale" | "adjustment" | "waste" | "return" | "transfer_in" | "transfer_out";
export const MOVEMENT_LABEL: Record<MovementType, string> = {
  receipt: "وارد", sale: "بيع", adjustment: "تسوية", waste: "هدر", return: "إرجاع", transfer_in: "نقل وارد", transfer_out: "نقل صادر",
};
export const MOVEMENT_TONE: Record<MovementType, Tone> = {
  receipt: "success", sale: "neutral", adjustment: "warning", waste: "danger", return: "info", transfer_in: "info", transfer_out: "info",
};

/** Filter chips group the two transfer types under one «نقل» tab. */
export type MovementFilter = "all" | "receipt" | "sale" | "adjustment" | "waste" | "return" | "transfer";
export function matchesFilter(type: MovementType, filter: MovementFilter): boolean {
  if (filter === "all") return true;
  if (filter === "transfer") return type === "transfer_in" || type === "transfer_out";
  return type === filter;
}
