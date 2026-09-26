// The attendant's fills of a shift, read from the outbox (the outbox row is the proof of the sale).
// The server's answer (amount) replaces the device's computation once the row is sent.
import type { OutboxRow } from "./db";
import { toCents } from "./money";

export type PaymentMethod = "cash" | "card" | "credit" | "voucher";

export type LocalSale = {
  saleId: string;
  legId: string;
  nozzleId: string;
  litersMilli: number;
  amountCents: bigint;
  method: PaymentMethod;
  createdAt: string;
  status: OutboxRow["status"];
};

/** record_sale rows of a shift. `meta.amount` is the device's amount until the server answers. */
export function salesOfShift(rows: Iterable<OutboxRow>, shiftId: string): LocalSale[] {
  const out: LocalSale[] = [];
  for (const r of rows) {
    if (r.rpc !== "record_sale" || r.params.p_shift !== shiftId || r.status === "cancelled") continue;
    const serverAmount = r.result?.amount;
    const local = r.meta?.amount;
    out.push({
      saleId: r.id,
      legId: String(r.params.p_leg),
      nozzleId: String(r.params.p_nozzle),
      litersMilli: Math.round(Number(r.params.p_liters) * 1000),
      amountCents: (serverAmount !== undefined ? toCents(String(serverAmount)) : null) ?? toCents(String(local ?? "0")) ?? 0n,
      method: r.params.p_method as PaymentMethod,
      createdAt: r.createdAt,
      status: r.status,
    });
  }
  return out;
}

/** Card + credit + voucher: what expected cash subtracts (cash fills don't change it). */
export function nonCashCents(sales: LocalSale[]): bigint {
  return sales.filter((s) => s.method !== "cash").reduce((sum, s) => sum + s.amountCents, 0n);
}

export function sumBy(sales: LocalSale[], method: PaymentMethod): { cents: bigint; count: number } {
  const list = sales.filter((s) => s.method === method);
  return { cents: list.reduce((sum, s) => sum + s.amountCents, 0n), count: list.length };
}
