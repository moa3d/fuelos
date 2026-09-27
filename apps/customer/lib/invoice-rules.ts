// C3/C4 helpers: invoice status badges and the month-window math for «فواتيري». No imports, so `node --test`
// runs it directly. BigInt cents, no floats.

export type InvoiceStatus = "pending" | "confirmed" | "corrected" | "cancelled";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** design/screens/C3.png, C4.png: مؤكدة / بانتظار المحطة / مصحّحة / ملغاة. */
export function invoiceStatusBadge(status: InvoiceStatus): { tone: Tone; label: string } {
  switch (status) {
    case "confirmed": return { tone: "success", label: "مؤكدة" };
    case "pending": return { tone: "warning", label: "بانتظار المحطة" };
    case "corrected": return { tone: "info", label: "مصحّحة" };
    case "cancelled": return { tone: "neutral", label: "ملغاة" };
  }
}

/** First day (UTC) of the month `offset` months from `iso` — for the «‹ سبتمبر 2026 ›» month switcher. */
export function monthStart(iso: string, offset = 0): string {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)).toISOString();
}

/** The exclusive end of that month (= the next month's start). */
export function monthEnd(monthStartIso: string): string {
  return monthStart(monthStartIso, 1);
}

export type Num = number | string;
function num(v: Num): number {
  return typeof v === "number" ? v : Number(v);
}

export type MonthTotals = { amount: number; liters: number; fillCount: number };

/** Sum of confirmed+corrected invoices' sale amount/liters this month (pending/cancelled don't count as real spend). */
export function monthTotals(rows: { status: InvoiceStatus; amount: Num; liters: Num }[]): MonthTotals {
  const real = rows.filter((r) => r.status === "confirmed" || r.status === "corrected");
  return {
    amount: real.reduce((s, r) => s + num(r.amount), 0),
    liters: real.reduce((s, r) => s + num(r.liters), 0),
    fillCount: real.length,
  };
}
