// O9 helpers: reading a typed price, the change and margin shown on the cards, an estimated purchase cost, and which
// price is «المنشور». BigInt cents, no floats. The only import is money.ts, so `node --test` runs it.
import { cents } from "./money.ts";

type Num = number | string;

/** Arabic-Indic / Persian digits → Latin; Arabic decimal separator → «.»; drop spaces and grouping. */
function normalize(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/[,،٬\s]/g, "");
}

/** A price per liter in cents: positive, at most 2 decimals. Anything else → null. */
export function parsePriceCents(input: string): bigint | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(normalize(input));
  if (!m) return null;
  const c = BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0"));
  return c > 0n ? c : null;
}

/** n / d rounded half away from zero (d > 0). */
function divRound(n: bigint, d: bigint): bigint {
  const half = d / 2n;
  return n >= 0n ? (n + half) / d : -((-n + half) / d);
}

/** (new − old) / old in tenths of a percent, rounded half away from zero. 12.5% → 125. */
export function changePercentTenths(oldC: bigint, newC: bigint): number {
  return oldC <= 0n ? 0 : Number(divRound((newC - oldC) * 1000n, oldC));
}

/** A change beyond ±25% is probably a typo (12.5 typed as 125): the owner must confirm it. */
export function isLargeChange(oldC: bigint, newC: bigint, thresholdTenths = 250): boolean {
  const p = changePercentTenths(oldC, newC);
  return (p < 0 ? -p : p) > thresholdTenths;
}

/** Margin per liter and as a share of the price, in tenths of a percent (design: 125 − 112 = 13, 10.4%). */
export function marginOf(priceC: bigint, costC: bigint): { marginC: bigint; percentTenths: number } {
  const marginC = priceC - costC;
  return { marginC, percentTenths: priceC <= 0n ? 0 : Number(divRound(marginC * 1000n, priceC)) };
}

function milli(v: Num): bigint {
  const m = /^(\d+)(?:\.(\d{1,3}))?/.exec(String(v).trim());
  return m ? BigInt(m[1]) * 1000n + BigInt((m[2] ?? "").padEnd(3, "0")) : 0n;
}

/**
 * Average purchase cost per liter over the priced deliveries, in cents: Σ(liters × unit cost + extra costs) / Σ liters —
 * the same rule as the server's tank_avg_cost(), pooled over a product's tanks. An estimate: null when nothing is priced.
 */
export function avgCostCents(rows: { liters: Num; unit_cost: Num | null; extra_costs: Num | null }[]): bigint | null {
  let total = 0n;   // cents × 1000
  let liters = 0n;  // liters × 1000
  for (const r of rows) {
    if (r.unit_cost === null || r.unit_cost === undefined) continue;
    const l = milli(r.liters);
    total += l * cents(r.unit_cost) + cents(r.extra_costs ?? 0) * 1000n;
    liters += l;
  }
  if (liters === 0n) return null;
  return (total + liters / 2n) / liters;
}

/** Suggested availability from the book stock: below the tank's minimum level → «محدود». */
export function suggestedAvailability(bookPct: number, minPct: number): "available" | "limited" {
  return bookPct < minPct ? "limited" : "available";
}

export type PriceRow = { product_id: string; price: Num; effective_at: string };

/** The published price of each product: the latest row already in force (effective_at ≤ now). */
export function currentPrices<T extends PriceRow>(rows: T[], nowMs: number): Map<string, T> {
  const best = new Map<string, T>();
  for (const r of rows) {
    if (Date.parse(r.effective_at) > nowMs) continue;
    const cur = best.get(r.product_id);
    if (!cur || Date.parse(r.effective_at) > Date.parse(cur.effective_at)) best.set(r.product_id, r);
  }
  return best;
}

/** Prices already published for a later moment. */
export function scheduledPrices<T extends PriceRow>(rows: T[], nowMs: number): T[] {
  return rows.filter((r) => Date.parse(r.effective_at) > nowMs).sort((a, b) => Date.parse(a.effective_at) - Date.parse(b.effective_at));
}
