// O8 «المصاريف والموردون». Owner/accountant only (RLS: is_finance). A draft expense is a plain insert; «حفظ
// المصروف» inserts then posts it through post_expense() (immutable once posted — corrections are reversals,
// not edits). Supplier debt (حساب 2000 «ذمم الموردين») is credited only by priced fuel deliveries; there is no
// RPC yet to record a payment to a supplier, so it is shown read-only (see docs/briefs Cowork request).
import { errorMessage } from "@fuelos/core";
import { cents } from "./money";
import type { Category, PaidFrom } from "./expense-rules";
import { supabase } from "./supabase";

type Num = number | string;
const signal = () => AbortSignal.timeout(20_000);

export type ExpenseRow = {
  id: string; category: Category; amount: Num; paidFrom: PaidFrom; description: string; expenseDate: string;
  status: "draft" | "posted"; supplier: string | null; by: string; hasAttachment: boolean;
};

export type SupplierRow = { id: string; name: string; phone: string | null; owedCents: bigint; lastDeliveryAt: string | null };

export type ExpensesData = {
  period: { from: string; to: string; timezone: string };
  monthRows: { category: Category; amount: Num }[];
  recent: ExpenseRow[];
  suppliers: SupplierRow[];
  todayISODate: string;
  fetchedAt: string;
};

const RECENT_MAX = 60;

export async function loadExpenses(stationId: string): Promise<ExpensesData> {
  const sb = supabase();
  const bounds = await sb.rpc("station_period_bounds", { p_station: stationId, p_period: "month" }).abortSignal(signal());
  if (bounds.error || !bounds.data) throw new Error(bounds.error?.message ?? "no bounds");
  const { from, to, timezone } = bounds.data as { from: string; to: string; timezone: string };
  const todayISODate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const monthFromDay = todayISODate.slice(0, 7) + "-01";

  const [monthPosted, recent, members, suppliers, deliveries] = await Promise.all([
    sb.from("expenses").select("category, amount").eq("station_id", stationId).eq("status", "posted").gte("expense_date", monthFromDay).abortSignal(signal()),
    sb.from("expenses").select("id, category, amount, paid_from, description, expense_date, status, supplier_id, created_by, attachment_path")
      .eq("station_id", stationId).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(RECENT_MAX).abortSignal(signal()),
    sb.from("station_members").select("user_id, display_name").eq("station_id", stationId).abortSignal(signal()),
    sb.from("suppliers").select("id, name, phone").eq("station_id", stationId).eq("is_active", true).order("name").abortSignal(signal()),
    sb.from("fuel_deliveries").select("supplier_id, liters, unit_cost, extra_costs, received_at").eq("station_id", stationId).not("supplier_id", "is", null).abortSignal(signal()),
  ]);
  const failed = [monthPosted, recent, members, suppliers, deliveries].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const nameOf = new Map((members.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  const supplierName = new Map((suppliers.data ?? []).map((s) => [s.id as string, s.name as string]));

  const recentRows: ExpenseRow[] = (recent.data ?? []).map((e) => ({
    id: e.id, category: e.category as Category, amount: e.amount, paidFrom: e.paid_from as PaidFrom, description: e.description,
    expenseDate: e.expense_date, status: e.status as "draft" | "posted", supplier: e.supplier_id ? supplierName.get(e.supplier_id) ?? "" : null,
    by: nameOf.get(e.created_by) ?? "", hasAttachment: !!e.attachment_path,
  }));

  // ذمم الموردين (account 2000): Σ(liters × unit cost + extra costs) over priced deliveries — the same
  // amount record_fuel_delivery() credits to that account. No RPC yet records a payment back to a supplier
  // (unlike company_payments for customers), so this total only ever grows; see docs/briefs Cowork request.
  const owed = new Map<string, { cents: bigint; last: string }>();
  for (const d of deliveries.data ?? []) {
    if (d.unit_cost === null) continue;
    const litersMilli = milli(d.liters);
    const lineCents = divRound(litersMilli * cents(d.unit_cost), 1000n) + cents(d.extra_costs ?? 0);
    const cur = owed.get(d.supplier_id as string);
    owed.set(d.supplier_id as string, { cents: (cur?.cents ?? 0n) + lineCents, last: !cur || d.received_at > cur.last ? d.received_at : cur.last });
  }
  const supplierRows: SupplierRow[] = (suppliers.data ?? []).map((s) => ({
    id: s.id, name: s.name, phone: s.phone, owedCents: owed.get(s.id)?.cents ?? 0n, lastDeliveryAt: owed.get(s.id)?.last ?? null,
  })).sort((a, b) => (b.owedCents > a.owedCents ? 1 : b.owedCents < a.owedCents ? -1 : 0));

  return {
    period: { from, to, timezone }, monthRows: (monthPosted.data ?? []) as { category: Category; amount: Num }[],
    recent: recentRows, suppliers: supplierRows, todayISODate, fetchedAt: new Date().toISOString(),
  };
}

/** Liters (numeric(14,3)) → thousandths, as a BigInt. */
function milli(v: Num): bigint {
  const m = /^(-)?(\d+)(?:\.(\d{1,3}))?/.exec(String(v).trim());
  if (!m) return 0n;
  const c = BigInt(m[2]) * 1000n + BigInt((m[3] ?? "").padEnd(3, "0"));
  return m[1] ? -c : c;
}

/** n ÷ d rounded half away from zero (d > 0). */
function divRound(n: bigint, d: bigint): bigint {
  const half = d / 2n;
  return n >= 0n ? (n + half) / d : -((-n + half) / d);
}

// ---------- writes ----------
export type Outcome = { ok: true; id?: string } | { ok: false; message: string };
const LOCAL: Record<string, string> = { FUELOS_PERMISSION_DENIED: "المصاريف متاحة لصاحب المحطة والمحاسب فقط", FUELOS_POSTED_IMMUTABLE: "هذا المصروف مرحّل بالفعل ولا يمكن تعديله" };
function messageOf(e: { message?: string; code?: string } | null): string {
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  return (code && LOCAL[code]) || errorMessage(code);
}

export type NewExpense = {
  stationId: string; category: Category; amount: string; paidFrom: PaidFrom; supplierId: string | null; description: string; expenseDate: string;
};

/** Inserts the expense as a draft, then posts it immediately (two calls, one user action). */
export async function saveAndPostExpense(e: NewExpense): Promise<Outcome> {
  const created = await saveDraft(e);
  if (!created.ok) return created;
  const { error } = await supabase().rpc("post_expense", { p_expense: created.id }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true, id: created.id };
}

export async function saveDraft(e: NewExpense): Promise<Outcome> {
  const { data, error } = await supabase().from("expenses").insert({
    station_id: e.stationId, category: e.category, amount: e.amount, paid_from: e.paidFrom,
    supplier_id: e.supplierId, description: e.description, expense_date: e.expenseDate,
  }).select("id").abortSignal(signal()).single();
  return error ? { ok: false, message: messageOf(error) } : { ok: true, id: data.id as string };
}

export async function postExpense(id: string): Promise<Outcome> {
  const { error } = await supabase().rpc("post_expense", { p_expense: id }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export async function createSupplier(stationId: string, name: string, phone: string | null): Promise<Outcome> {
  const { error } = await supabase().from("suppliers").insert({ station_id: stationId, name, phone }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}
