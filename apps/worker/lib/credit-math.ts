// S8/S9 company credit: what fits in the company's remaining limit. No imports, so `node --test` runs it.

/** Whole liters the remaining credit pays for — floor(remaining / price), as record_sale reports it. */
export function possibleLiters(remainingCents: bigint, priceCents: bigint): number {
  if (priceCents <= 0n || remainingCents <= 0n) return 0;
  return Number(remainingCents / priceCents);
}

/** How much the fill goes over the remaining limit (0 when it fits). */
export function overBy(amountCents: bigint, remainingCents: bigint): bigint {
  return amountCents > remainingCents ? amountCents - remainingCents : 0n;
}

/** Share of the limit still available, 0–100, for the S8 bar. */
export function remainingPercent(remainingCents: bigint, limitCents: bigint): number {
  if (limitCents <= 0n) return 0;
  const pct = Number((remainingCents * 100n) / limitCents);
  return Math.max(0, Math.min(100, pct));
}
