// Money as BigInt cents (numeric strings/numbers from the server → cents → string). No floats. No imports.
type Num = number | string;

export function cents(v: Num | null | undefined): bigint {
  if (v === null || v === undefined) return 0n;
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?/.exec(String(v).trim());
  if (!m) return 0n;
  const c = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -c : c;
}

export function centsStr(c: bigint): string {
  const neg = c < 0n; const a = neg ? -c : c;
  const frac = a % 100n;
  return `${neg ? "-" : ""}${a / 100n}${frac === 0n ? "" : `.${frac.toString().padStart(2, "0")}`}`;
}

export function absCents(c: bigint): bigint {
  return c < 0n ? -c : c;
}
