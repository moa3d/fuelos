// L1: one field accepts an email or a phone number. No imports, so `node --test` runs it directly.

export type Identifier = { kind: "email"; value: string } | { kind: "phone"; value: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Arabic-Indic / Persian digits → Latin. */
function latinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Email as typed (trimmed, lower-case), or a phone in E.164. A local Syrian number (09xxxxxxxx) gets +963;
 * other countries must be typed with «+». Returns null when it is neither.
 */
export function parseIdentifier(input: string, defaultCountryCode = "963"): Identifier | null {
  const s = latinDigits(input.trim());
  if (s.includes("@")) return EMAIL_RE.test(s) ? { kind: "email", value: s.toLowerCase() } : null;
  const digits = s.replace(/[\s\-()]/g, "");
  if (/^\+\d{8,15}$/.test(digits)) return { kind: "phone", value: digits };
  if (/^00\d{8,15}$/.test(digits)) return { kind: "phone", value: `+${digits.slice(2)}` };
  if (/^0\d{8,10}$/.test(digits)) return { kind: "phone", value: `+${defaultCountryCode}${digits.slice(1)}` };
  return null;
}
