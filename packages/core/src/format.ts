// Latin digits everywhere, with a thousands separator: 1,250.
const numberFmt = new Intl.NumberFormat("en-US");
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
// «الخميس 24 سبتمبر»: Arabic names, Latin digits
const dayFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" });

export function formatNumber(value: number, fractionDigits?: number): string {
  if (fractionDigits === undefined) return numberFmt.format(value);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * Money arrives from the database as a numeric string (never a float); format it without
 * parsing through floating point. «ل.س» (or the station currency label) goes after the number.
 */
export function formatMoney(amount: string, currencyLabel = "ل.س"): string {
  const [int, frac] = amount.trim().replace(/^-/, "").split(".");
  const sign = amount.trim().startsWith("-") ? "-" : "";
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fracPart = frac && /[1-9]/.test(frac) ? `.${frac}` : "";
  return `${sign}${grouped}${fracPart} ${currencyLabel}`;
}

/** HH:MM in the device's local time, Latin digits. */
export function formatTime(value: string | Date): string {
  return timeFmt.format(typeof value === "string" ? new Date(value) : value);
}

/** «الخميس 24 سبتمبر» (Arabic day and month names, Latin digits). */
export function formatDay(value: string | Date): string {
  const parts = dayFmt.formatToParts(typeof value === "string" ? new Date(value) : value);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}
