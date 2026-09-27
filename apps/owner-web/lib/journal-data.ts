// O4 «القيود المحاسبية». Read: journal_entries/journal_lines/accounts (is_finance RLS) + audit_log for the
// selected entry's «سجل المراجعة» (audit_read: owner or platform staff only — accountant sees the entry but not
// the raw audit trail, per RLS). Manual entries have no RPC (see supabase/migrations/20260924000400_rls.sql):
// insert the entry as a draft, insert its lines, then update the entry's own status to 'posted' — a trigger
// (fn_journal_entry_guard) checks the balance, blocks a closed period, and assigns the sequential `number`.
// There is no export/CSV endpoint yet (Cowork request).
import { errorMessage } from "@fuelos/core";
import { cents, centsStr } from "./money";
import { sumLines } from "./journal-rules";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type Account = { id: string; code: string; name: string; type: "asset" | "liability" | "equity" | "revenue" | "expense" };

export type Line = { accountId: string; accountCode: string; accountName: string; debitCents: bigint; creditCents: bigint; memo: string | null };

export type Entry = {
  id: string; number: number | null; entryDate: string; description: string;
  sourceTable: string | null; sourceId: string | null; status: "draft" | "posted";
  reversesEntryId: string | null; reason: string | null; createdByName: string; createdAt: string; postedAt: string | null;
  lines: Line[];
};

export type AuditRow = { id: number; at: string; action: string; actorName: string; reason: string | null };

export type Period = { id: string; startsOn: string; endsOn: string; status: "open" | "closed" };

export type JournalData = {
  period: Period | null;
  entries: Entry[];
  accounts: Account[];
  fetchedAt: string;
};

const SOURCE_LABEL: Record<string, string> = {
  shifts: "مناوبة", fuel_deliveries: "توريد وقود", expenses: "مصروف", company_payments: "سداد شركة",
  sales: "بيع آجل", inventory_movements: "حركة مخزون", tank_measurements: "تسوية مخزون",
};
export function sourceLabel(sourceTable: string | null): string {
  return sourceTable ? (SOURCE_LABEL[sourceTable] ?? sourceTable) : "قيد يدوي";
}
/** Where «فتح المصدر» sends the owner — the list screen for that source (no per-row deep link exists yet). */
export const SOURCE_HREF: Record<string, string> = {
  shifts: "/sales", fuel_deliveries: "/tanks", expenses: "/expenses", company_payments: "/customers",
  sales: "/sales", tank_measurements: "/tanks",
};

const ENTRIES_MAX = 200;

export async function loadJournal(stationId: string): Promise<JournalData> {
  const sb = supabase();
  const [periods, entries, lines, accounts, members] = await Promise.all([
    sb.from("accounting_periods").select("id, starts_on, ends_on, status").eq("station_id", stationId).order("starts_on", { ascending: false }).limit(1).abortSignal(signal()),
    sb.from("journal_entries").select("id, number, entry_date, description, source_table, source_id, status, reverses_entry_id, reason, created_by, created_at, posted_at")
      .eq("station_id", stationId).order("created_at", { ascending: false }).limit(ENTRIES_MAX).abortSignal(signal()),
    sb.from("journal_lines").select("entry_id, account_id, debit, credit, memo").eq("station_id", stationId).abortSignal(signal()),
    sb.from("accounts").select("id, code, name, type").eq("station_id", stationId).order("code").abortSignal(signal()),
    sb.from("station_members").select("user_id, display_name").eq("station_id", stationId).abortSignal(signal()),
  ]);
  const failed = [periods, entries, lines, accounts, members].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const accountOf = new Map((accounts.data ?? []).map((a) => [a.id as string, a as { id: string; code: string; name: string; type: string }]));
  const nameOf = new Map((members.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  const linesByEntry = new Map<string, Line[]>();
  for (const l of lines.data ?? []) {
    const acc = accountOf.get(l.account_id as string);
    const line: Line = {
      accountId: l.account_id, accountCode: acc?.code ?? "", accountName: acc?.name ?? "حساب محذوف",
      debitCents: cents(l.debit), creditCents: cents(l.credit), memo: l.memo,
    };
    const arr = linesByEntry.get(l.entry_id as string);
    if (arr) arr.push(line); else linesByEntry.set(l.entry_id as string, [line]);
  }

  const entryRows: Entry[] = (entries.data ?? []).map((e) => ({
    id: e.id, number: e.number, entryDate: e.entry_date, description: e.description,
    sourceTable: e.source_table, sourceId: e.source_id, status: e.status as "draft" | "posted",
    reversesEntryId: e.reverses_entry_id, reason: e.reason,
    createdByName: nameOf.get(e.created_by) ?? "", createdAt: e.created_at, postedAt: e.posted_at,
    lines: linesByEntry.get(e.id) ?? [],
  }));

  const p = periods.data?.[0];
  return {
    period: p ? { id: p.id, startsOn: p.starts_on, endsOn: p.ends_on, status: p.status as "open" | "closed" } : null,
    entries: entryRows,
    accounts: (accounts.data ?? []) as Account[],
    fetchedAt: new Date().toISOString(),
  };
}

/** «سجل المراجعة»: audit_log rows for this entry (owner or platform staff only — RLS: audit_read). */
export async function loadAuditTrail(stationId: string, entryId: string): Promise<AuditRow[]> {
  const sb = supabase();
  const [rows, members] = await Promise.all([
    sb.from("audit_log").select("id, at, action, actor_id, reason").eq("station_id", stationId).eq("entity", "journal_entries").eq("entity_id", entryId).order("at").abortSignal(signal()),
    sb.from("station_members").select("user_id, display_name").eq("station_id", stationId).abortSignal(signal()),
  ]);
  if (rows.error) {
    // accountant: RLS hides audit_log rows entirely rather than erroring — treat as "nothing to show"
    if (rows.error.code === "42501") return [];
    throw new Error(rows.error.message);
  }
  const nameOf = new Map((members.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  return (rows.data ?? []).map((r) => ({ id: r.id, at: r.at, action: r.action, actorName: nameOf.get(r.actor_id) ?? "النظام", reason: r.reason }));
}

// ---------- writes ----------
export type Outcome = { ok: true; id?: string } | { ok: false; message: string };
const LOCAL: Record<string, string> = {
  FUELOS_PERMISSION_DENIED: "القيود المحاسبية متاحة لصاحب المحطة والمحاسب فقط",
  FUELOS_POSTED_IMMUTABLE: "هذا القيد مرحّل بالفعل ولا يمكن تعديله أو حذفه — استخدم عكس القيد",
  FUELOS_UNBALANCED_ENTRY: "إجمالي المدين لا يساوي إجمالي الدائن، أو أقل من سطرين",
  FUELOS_DRAFTS_BLOCK_CLOSE: "هناك قيود غير مرحّلة في هذه الفترة — رحّلها أو احذفها أولاً",
  FUELOS_REASON_REQUIRED: "اكتب سبب عكس القيد",
};
function messageOf(e: { message?: string; code?: string } | null): string {
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  return (code && LOCAL[code]) || errorMessage(code);
}

export type NewLine = { accountId: string; debitCents: bigint; creditCents: bigint; memo: string };
export type NewEntry = { stationId: string; entryDate: string; description: string; lines: NewLine[] };

/** Inserts the entry as a draft, inserts its lines, then posts it (one user action, three calls). */
export async function saveManualEntry(e: NewEntry): Promise<Outcome> {
  const totals = sumLines(e.lines);
  if (totals.lineCount < 2 || totals.debitCents !== totals.creditCents || totals.debitCents === 0n) {
    return { ok: false, message: LOCAL.FUELOS_UNBALANCED_ENTRY };
  }
  const sb = supabase();
  const created = await sb.from("journal_entries").insert({
    station_id: e.stationId, entry_date: e.entryDate, description: e.description,
  }).select("id").abortSignal(signal()).single();
  if (created.error) return { ok: false, message: messageOf(created.error) };
  const entryId = created.data.id as string;

  const { error: linesError } = await sb.from("journal_lines").insert(e.lines.map((l) => ({
    station_id: e.stationId, entry_id: entryId, account_id: l.accountId,
    debit: l.debitCents > 0n ? centsStr(l.debitCents) : "0",
    credit: l.creditCents > 0n ? centsStr(l.creditCents) : "0",
    memo: l.memo || null,
  }))).abortSignal(signal());
  if (linesError) return { ok: false, message: messageOf(linesError) };

  const { error: postError } = await sb.from("journal_entries").update({ status: "posted" }).eq("id", entryId).abortSignal(signal());
  return postError ? { ok: false, message: messageOf(postError) } : { ok: true, id: entryId };
}

/** Retries posting a draft left over from a failed save (lines inserted, the post step didn't finish). */
export async function postDraftEntry(entryId: string): Promise<Outcome> {
  const { error } = await supabase().from("journal_entries").update({ status: "posted" }).eq("id", entryId).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

/** Draft manual entries only (entries_draft_delete RLS); posted entries must be reversed instead. */
export async function deleteDraftEntry(entryId: string): Promise<Outcome> {
  const { error } = await supabase().from("journal_entries").delete().eq("id", entryId).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export async function reverseEntry(entryId: string, reason: string): Promise<Outcome> {
  const { data, error } = await supabase().rpc("reverse_journal_entry", { p_entry: entryId, p_reason: reason }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true, id: data as string };
}

export async function closePeriod(periodId: string): Promise<Outcome> {
  const { error } = await supabase().rpc("close_period", { p_period: periodId }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}
