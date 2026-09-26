const words = (name: string) => name.trim().split(/\s+/);

/** «أحمد سالم» → «أس», «خالد العمر» → «خع» (skips the «ال» article). */
export function initials(name: string): string {
  return words(name).slice(0, 2)
    .map((w) => (w.startsWith("ال") && w.length > 2 ? w.slice(2) : w)[0])
    .join("");
}

export function firstName(name: string): string {
  return words(name)[0] ?? name;
}

/** First name, or the full name when someone else in `all` shares it. */
export function shortName(name: string, all: string[]): string {
  const first = firstName(name);
  const count = all.filter((n) => firstName(n) === first).length;
  return count > 1 ? name : first;
}
