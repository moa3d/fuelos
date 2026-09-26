// Money and liters on the device, without floating point (no imports, so `node --test` runs it directly).
// Money = BigInt cents; readings/liters = integer tenths of a liter (readings are numeric(14,1)).
// The server is authoritative; these numbers are a preview labelled «تقديري».

/** "927438", "1850.5", "1850.50" → cents. Returns null for anything else. */
export function toCents(value: string | number): bigint | null {
  const s = String(value).trim();
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -cents : cents;
}

/** Cents → "927438" or "927438.5" style string (for formatMoney, which hides ".00"). */
export function centsToString(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const int = abs / 100n;
  const frac = abs % 100n;
  return `${neg ? "-" : ""}${int}${frac === 0n ? "" : `.${frac.toString().padStart(2, "0")}`}`;
}

/** round(liters × price, 2) like the server: liters in tenths, price in cents, half rounded up. */
export function amountCents(litersTenths: number, priceCents: bigint): bigint {
  const raw = BigInt(litersTenths) * priceCents;          // cents × 10
  return raw >= 0n ? (raw + 5n) / 10n : -((-raw + 5n) / 10n);
}
