// O4 helpers: entry status badges, the debit/credit balance check, and the account-scope filter tabs
// (design/screens/O4.png). No imports, so `node --test` runs it directly. BigInt cents, no floats.

export type EntryStatus = "draft" | "posted";
export type Tone = "danger" | "success" | "info" | "warning";

export type LineTotals = { debitCents: bigint; creditCents: bigint; lineCount: number };

/** Σdebit = Σcredit > 0 and at least two lines — the same check `fn_journal_entry_guard` runs on posting. */
export function isBalanced(t: LineTotals): boolean {
  return t.lineCount >= 2 && t.debitCents > 0n && t.debitCents === t.creditCents;
}

export function sumLines(lines: { debitCents: bigint; creditCents: bigint }[]): LineTotals {
  return {
    debitCents: lines.reduce((s, l) => s + l.debitCents, 0n),
    creditCents: lines.reduce((s, l) => s + l.creditCents, 0n),
    lineCount: lines.length,
  };
}

/**
 * The design's status badges: غير متوازن (draft, unbalanced) / معلّق (draft, balanced, awaiting posting) /
 * معتمد (posted, entered manually) / آلي (posted, created automatically by another screen) / قيد عكسي (a reversal).
 */
export function entryBadge(
  e: { status: EntryStatus; sourceTable: string | null; reversesEntryId: string | null },
  balanced: boolean,
): { tone: Tone; label: string } {
  if (e.status === "posted") {
    if (e.reversesEntryId) return { tone: "info", label: "قيد عكسي" };
    if (e.sourceTable === null) return { tone: "success", label: "معتمد" };
    return { tone: "info", label: "آلي" };
  }
  return balanced ? { tone: "warning", label: "معلّق" } : { tone: "danger", label: "غير متوازن" };
}

export type Scope = "all" | "cash" | "sales" | "inventory" | "receivables";
export const SCOPE_LABEL: Record<Scope, string> = {
  all: "كل الحسابات", cash: "الصندوق", sales: "المبيعات", inventory: "المخزون", receivables: "الذمم",
};
/** Which chart-of-accounts codes (see create_station_defaults) each scope tab covers. */
const SCOPE_CODES: Record<Exclude<Scope, "all">, string[]> = {
  cash: ["1000", "1010", "1020"],
  sales: ["4000", "4200"],
  inventory: ["1200", "5000", "5400"],
  receivables: ["1100", "1150", "2000"],
};

/** Whether an entry (by the account codes its lines touch) belongs to a scope tab. */
export function matchesScope(lineAccountCodes: string[], scope: Scope): boolean {
  return scope === "all" || lineAccountCodes.some((c) => SCOPE_CODES[scope].includes(c));
}

/** «إغلاق الفترة» is owner-only, and blocked while any draft entry falls inside it (FUELOS_DRAFTS_BLOCK_CLOSE). */
export function canCloseperiod(role: string, draftCountInPeriod: number): { allowed: boolean; reason?: string } {
  if (role !== "owner") return { allowed: false, reason: "إغلاق الفترة متاح لصاحب المحطة فقط" };
  if (draftCountInPeriod > 0) {
    return { allowed: false, reason: draftCountInPeriod === 1 ? "قيد واحد غير مرحّل يمنع إغلاق الفترة" : `${draftCountInPeriod} قيود غير مرحّلة تمنع إغلاق الفترة` };
  }
  return { allowed: true };
}

/** Manual entries only: owner and accountant may create, post, delete a draft, or reverse a posted entry. */
export function canManage(role: string): boolean {
  return role === "owner" || role === "accountant";
}
