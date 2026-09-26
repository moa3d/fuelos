// Parsing what the attendant types (no imports, so `node --test` can run it directly).

/** Arabic-Indic / Persian digits → Latin, Arabic decimal separator → «.», drop grouping and spaces. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/[,،٬\s]/g, "");
}

/**
 * A meter reading in liters with at most one decimal (the DB column is numeric(14,1)).
 * Returned in tenths of a liter so comparisons never touch floating point.
 */
export function parseReadingTenths(input: string): number | null {
  const s = normalizeDigits(input);
  const m = /^(\d{1,13})(?:\.(\d))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 10 + Number(m[2] ?? 0);
}

export function tenthsToLiters(tenths: number): number {
  return tenths / 10;
}

/** The last closing reading (a number from the DB, one decimal) in tenths. */
export function litersToTenths(liters: number): number {
  return Math.round(liters * 10);
}

export type ReadingCheck =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "equal"; tenths: number }
  | { kind: "higher"; tenths: number; diffTenths: number }
  | { kind: "lower"; tenths: number; diffTenths: number };

/** Compares the typed opening reading with the nozzle's last closing reading. */
export function checkReading(input: string, lastReading: number): ReadingCheck {
  if (normalizeDigits(input) === "") return { kind: "empty" };
  const tenths = parseReadingTenths(input);
  if (tenths === null) return { kind: "invalid" };
  const last = litersToTenths(lastReading);
  if (tenths === last) return { kind: "equal", tenths };
  if (tenths > last) return { kind: "higher", tenths, diffTenths: tenths - last };
  return { kind: "lower", tenths, diffTenths: last - tenths };
}

/**
 * Cash amount as a string of digits (whole currency units). Money never goes through a float.
 * Returns null when the input is not a non-negative whole number.
 */
export function parseCash(input: string): string | null {
  const s = normalizeDigits(input);
  if (!/^\d{1,13}$/.test(s)) return null;
  return s.replace(/^0+(?=\d)/, "");
}
