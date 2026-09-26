// O3 helpers: shift status labels and the payment breakdown of a shift. No side effects; the only import is money.ts,
// so `node --test` runs it. The numbers themselves (meter sales, expected cash) come from shift_summary() on the server.
import { cents } from "./money.ts";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";
type Num = number | string;

export type ShiftStatus = "open" | "submitted" | "approved" | "rejected" | "reopened";

/** Badge for the list: an open shift older than the station's limit is «مفتوحة طويلاً». */
export function statusOf(status: ShiftStatus, openedAt: string, nowMs: number, maxShiftHours: number): { tone: Tone; label: string } {
  if (status === "open" || status === "reopened") {
    const hours = (nowMs - Date.parse(openedAt)) / 3_600_000;
    if (hours > maxShiftHours) return { tone: "danger", label: "مفتوحة طويلاً" };
    return status === "reopened" ? { tone: "warning", label: "أعيد فتحها" } : { tone: "info", label: "مفتوحة" };
  }
  if (status === "submitted") return { tone: "warning", label: "بانتظار الاعتماد" };
  if (status === "approved") return { tone: "success", label: "معتمدة" };
  return { tone: "danger", label: "مرفوضة" };
}

/** «منذ 23:40 أمس» style hint for a long open shift: the hours it has been open. */
export function openHours(openedAt: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(openedAt)) / 3_600_000));
}

export type Method = "cash" | "card" | "credit" | "voucher";
export const METHOD_LABEL: Record<Method, string> = { cash: "نقدي", card: "بطاقة مسجلة", credit: "آجل (شركات)", voucher: "قسيمة / خصم" };

export type SaleLite = { payment_method: Method; status: string; amount: Num; leg_id?: string | null };

export type PaymentRow = { method: Method; label: string; count: number; amountCents: bigint };

/**
 * Payment methods of a shift. Card, credit and voucher amounts are the server's (they are subtracted from expected cash);
 * cash = meter sales − those three, exactly the accounting rule. Counts are the fills recorded on the device
 * (every fill is recorded, cash included), voided ones excluded.
 */
export function paymentBreakdown(
  summary: { meter_sales: Num; card: Num; credit: Num; voucher: Num }, sales: SaleLite[],
): { rows: PaymentRow[]; totalCount: number; totalCents: bigint } {
  const live = sales.filter((s) => s.status !== "voided");
  const count = (m: Method) => live.filter((s) => s.payment_method === m).length;
  const card = cents(summary.card);
  const credit = cents(summary.credit);
  const voucher = cents(summary.voucher);
  const total = cents(summary.meter_sales);
  const rows: PaymentRow[] = [
    { method: "cash", label: METHOD_LABEL.cash, count: count("cash"), amountCents: total - card - credit - voucher },
    { method: "card", label: METHOD_LABEL.card, count: count("card"), amountCents: card },
    { method: "credit", label: METHOD_LABEL.credit, count: count("credit"), amountCents: credit },
    { method: "voucher", label: METHOD_LABEL.voucher, count: count("voucher"), amountCents: voucher },
  ];
  return { rows, totalCount: live.length, totalCents: total };
}

/** Fills recorded on legs that are still open: their meter sales are only known when the pump is closed. */
export function openLegFills(sales: SaleLite[], openLegIds: Set<string>): { count: number; cents: bigint } {
  const list = sales.filter((s) => s.status !== "voided" && s.leg_id && openLegIds.has(s.leg_id));
  return { count: list.length, cents: list.reduce((sum, s) => sum + cents(s.amount), 0n) };
}
