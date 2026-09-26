// S2 «تعبئة سريعة»: liters ↔ amount at the price locked for the shift. No floats: liters in thousandths
// (sales.liters is numeric(14,3)), money in BigInt cents. No imports besides reading.ts, so `node --test` runs it.
import { normalizeDigits } from "./reading.ts";

/** «40», «40.5», «40.125», Arabic digits → thousandths of a liter. More than 3 decimals → null. */
export function parseLitersMilli(input: string): number | null {
  const m = /^(\d{1,11})(?:\.(\d{1,3}))?$/.exec(normalizeDigits(input));
  if (!m) return null;
  return Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0"));
}

/** Amount paid → liters to pump, rounded to the nearest thousandth (half up). */
export function litersFromAmount(amountCents: bigint, priceCents: bigint): number {
  if (priceCents <= 0n) return 0;
  return Number((amountCents * 1000n * 2n + priceCents) / (priceCents * 2n));
}

/** What the server will record: round(liters × price, 2), half up. */
export function amountFromLiters(litersMilli: number, priceCents: bigint): bigint {
  return (BigInt(litersMilli) * priceCents + 500n) / 1000n;
}

/** Thousandths → the string sent as p_liters («40.000»). */
export function milliToString(milli: number): string {
  return `${Math.trunc(milli / 1000)}.${String(milli % 1000).padStart(3, "0")}`;
}
