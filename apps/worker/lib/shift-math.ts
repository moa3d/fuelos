// Local preview of a shift's totals across its pump legs (spec §5). No imports besides money.ts,
// so `node --test` runs it directly. The server's shift_summary is authoritative.
import { amountCents, toCents } from "./money.ts";

export type PriceRow = { productId: string; price: string; effectiveAt: string };
export type LegReadingInput = { nozzleId: string; productId: string; openingTenths: number; closingTenths?: number };
export type LegInput = { legId: string; readings: LegReadingInput[] };

export type LegTotals = { legId: string; litersTenths: number; amountCents: bigint; missingPrice: boolean };
export type ShiftTotals = {
  legs: LegTotals[];
  litersTenths: number;
  meterSalesCents: bigint;
  expectedCashCents: bigint;
  /** a product had no price at shift open: the amount is incomplete */
  missingPrice: boolean;
};

/** The price in force at `at` (latest effective_at ≤ at), like price_at() on the server. */
export function priceAt(prices: PriceRow[], productId: string, at: string): bigint | null {
  const t = Date.parse(at);
  let best: PriceRow | undefined;
  for (const p of prices) {
    if (p.productId !== productId || Date.parse(p.effectiveAt) > t) continue;
    if (!best || Date.parse(p.effectiveAt) > Date.parse(best.effectiveAt)) best = p;
  }
  return best ? toCents(best.price) : null;
}

/**
 * Meter sales = Σ legs Σ nozzles (closing − opening) × price at shift open, each nozzle amount rounded
 * to cents as the server does. Expected cash = opening cash + meter sales − card − credit − voucher.
 * A reading without a closing value counts 0 liters (the leg is still open).
 */
export function shiftTotals(
  legs: LegInput[], prices: PriceRow[], openedAt: string, openingCashCents: bigint, nonCashCents = 0n,
): ShiftTotals {
  let litersTenths = 0;
  let meterSalesCents = 0n;
  let missingPrice = false;
  const perLeg = legs.map((leg): LegTotals => {
    let lt = 0;
    let amt = 0n;
    let missing = false;
    for (const r of leg.readings) {
      const liters = r.closingTenths === undefined ? 0 : r.closingTenths - r.openingTenths;
      const price = priceAt(prices, r.productId, openedAt);
      if (price === null) missing = liters > 0 || missing;
      lt += liters;
      amt += price === null ? 0n : amountCents(liters, price);
    }
    litersTenths += lt;
    meterSalesCents += amt;
    missingPrice ||= missing;
    return { legId: leg.legId, litersTenths: lt, amountCents: amt, missingPrice: missing };
  });
  return {
    legs: perLeg,
    litersTenths,
    meterSalesCents,
    expectedCashCents: openingCashCents + meterSalesCents - nonCashCents,
    missingPrice,
  };
}

/** |counted − expected| > tolerance → a written reason is required (server: FUELOS_REASON_REQUIRED). */
export function needsDiffReason(countedCents: bigint, expectedCents: bigint, toleranceCents: bigint): boolean {
  const diff = countedCents - expectedCents;
  return (diff < 0n ? -diff : diff) > toleranceCents;
}
