// O6 «التقارير والتحليلات». Owner/accountant only (RLS: is_finance). Every money figure comes from the same
// posted ledger the other screens post to (accounting skill: never recompute money outside it) — the profit &
// loss table, the cash-discrepancy and inventory-waste cards are all built from one journal_lines/accounts read
// for the current period and its comparison window. Liters by fuel reuse dashboard_summary()'s daily totals
// (same price_at() math the ledger posts with); debt aging reuses the FIFO the company balance uses (O5).
// «تصدير» is a client-side CSV, no server involved; «مشاركة مع المحاسب» has no send-mail capability yet
// (docs/briefs/04a-cowork-reports-sharing.md).
import type { Period } from "./dashboard";
import { fifoAging } from "./company-rules";
import { cents } from "./money";
import { priorMonth, priorWindow, type AgingBucket } from "./report-rules";
import { supabase } from "./supabase";

type Num = number | string;
const signal = () => AbortSignal.timeout(20_000);

export type PnL = {
  revenueCents: bigint; otherRevenueCents: bigint; cogsCents: bigint; grossProfitCents: bigint;
  opexCents: bigint; netProfitCents: bigint;
};

export type ReportsData = {
  period: { from: string; to: string; timezone: string };
  compare: { from: string; to: string };
  profitComplete: boolean;
  pnl: PnL;
  prevPnl: PnL;
  byProduct: { product: string; liters: number; amountCents: bigint }[];
  totalLiters: number;
  byPump: { pump: number; liters: number; amountCents: bigint }[];
  cashDiff: { netCents: bigint; count: number };
  inventoryDiff: { adjustmentCents: bigint };
  aging: Record<AgingBucket, bigint>;
  agingTotalCents: bigint;
  fetchedAt: string;
};

const EXPENSE_COGS_CODE = "5000";
const REVENUE_FUEL_CODE = "4000";

/** «تصدير» — a plain CSV of the profit & loss table, built in the browser (no server call). Excel opens CSV fine. */
export function pnlCsv(data: ReportsData): string {
  const row = (label: string, cur: bigint, prev: bigint) => [label, (Number(cur) / 100).toFixed(2), (Number(prev) / 100).toFixed(2)].join(",");
  return [
    "البند,الفترة الحالية (ل.س),فترة المقارنة (ل.س)",
    row("مبيعات الوقود", data.pnl.revenueCents, data.prevPnl.revenueCents),
    row("تكلفة الوقود المباع", data.pnl.cogsCents, data.prevPnl.cogsCents),
    row("إجمالي الربح", data.pnl.grossProfitCents, data.prevPnl.grossProfitCents),
    row("المصاريف التشغيلية", data.pnl.opexCents, data.prevPnl.opexCents),
    row("صافي الربح التقديري", data.pnl.netProfitCents, data.prevPnl.netProfitCents),
  ].join("\n");
}

export async function loadReports(stationId: string, period: Period): Promise<ReportsData> {
  const sb = supabase();
  const bounds = await sb.rpc("station_period_bounds", { p_station: stationId, p_period: period }).abortSignal(signal());
  if (bounds.error || !bounds.data) throw new Error(bounds.error?.message ?? "no bounds");
  const { from, to, timezone } = bounds.data as { from: string; to: string; timezone: string };

  const prevFrom = period === "month" ? priorMonth(from) : new Date(priorWindow(Date.parse(from), Date.parse(to)).fromMs).toISOString();
  const prevTo = period === "month" ? priorMonth(to) : from;

  const localDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const fromDay = localDay(from);
  const endDay = localDay(new Date(Date.parse(to) - 1).toISOString());
  const prevFromDay = localDay(prevFrom);
  const prevEndDay = localDay(new Date(Date.parse(prevTo) - 1).toISOString());

  const [current, accountsRes, entriesRes, companiesRes, salesRes, paymentsRes, shiftsRes] = await Promise.all([
    sb.rpc("dashboard_summary", { p_station: stationId, p_from: from, p_to: to }).abortSignal(signal()),
    sb.from("accounts").select("id, code, type").eq("station_id", stationId).abortSignal(signal()),
    sb.from("journal_entries").select("id, entry_date, source_table").eq("station_id", stationId).eq("status", "posted")
      .gte("entry_date", prevFromDay).lte("entry_date", endDay).abortSignal(signal()),
    sb.from("company_accounts").select("id").eq("station_id", stationId).abortSignal(signal()),
    sb.from("sales").select("id, company_account_id, amount, status, received_at").eq("station_id", stationId).eq("payment_method", "credit").neq("status", "voided").limit(2000).abortSignal(signal()),
    sb.from("company_payments").select("id, company_account_id, amount, received_at").limit(2000).abortSignal(signal()),
    sb.from("shifts").select("id").eq("station_id", stationId).gte("opened_at", from).lt("opened_at", to).limit(500).abortSignal(signal()),
  ]);
  const failed = [current, accountsRes, entriesRes, companiesRes, salesRes, paymentsRes, shiftsRes].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const entryIds = (entriesRes.data ?? []).map((e) => e.id as string);
  const linesRes = entryIds.length === 0 ? { data: [] as { entry_id: string; account_id: string; debit: Num; credit: Num }[], error: null }
    : await sb.from("journal_lines").select("entry_id, account_id, debit, credit").in("entry_id", entryIds).abortSignal(signal());
  if (linesRes.error) throw new Error(linesRes.error.message);

  const shiftIds = (shiftsRes.data ?? []).map((s) => s.id as string);
  const legsRes = shiftIds.length === 0 ? { data: [] as { id: string; pump_id: string }[], error: null }
    : await sb.from("shift_legs").select("id, pump_id").in("shift_id", shiftIds).abortSignal(signal());
  const pumpSalesRes = shiftIds.length === 0 ? { data: [] as { leg_id: string; amount: Num; liters: Num }[], error: null }
    : await sb.from("sales").select("leg_id, amount, liters").in("shift_id", shiftIds).neq("status", "voided").limit(5000).abortSignal(signal());
  const pumpsRes = await sb.from("pumps").select("id, number").eq("station_id", stationId).abortSignal(signal());
  const failed2 = [legsRes, pumpSalesRes, pumpsRes].find((r) => r.error);
  if (failed2?.error) throw new Error(failed2.error.message);

  // ---------- profit & loss (from the ledger, current vs. the comparison window) ----------
  const accountOf = new Map((accountsRes.data ?? []).map((a) => [a.id as string, a as { id: string; code: string; type: string }]));
  const entryOf = new Map((entriesRes.data ?? []).map((e) => [e.id as string, e as { id: string; entry_date: string; source_table: string | null }]));

  function pnlOf(windowFromDay: string, windowEndDay: string): PnL {
    let revenueCents = 0n, otherRevenueCents = 0n, cogsCents = 0n, opexCents = 0n;
    for (const l of linesRes.data ?? []) {
      const entry = entryOf.get(l.entry_id as string);
      const acc = accountOf.get(l.account_id as string);
      if (!entry || !acc || entry.entry_date < windowFromDay || entry.entry_date > windowEndDay) continue;
      const debit = cents(l.debit), credit = cents(l.credit);
      if (acc.type === "revenue") {
        const signed = credit - debit;
        if (acc.code === REVENUE_FUEL_CODE) revenueCents += signed; else otherRevenueCents += signed;
      } else if (acc.type === "expense") {
        const signed = debit - credit;
        if (acc.code === EXPENSE_COGS_CODE) cogsCents += signed; else opexCents += signed;
      }
    }
    const grossProfitCents = revenueCents - cogsCents;
    return { revenueCents, otherRevenueCents, cogsCents, grossProfitCents, opexCents, netProfitCents: grossProfitCents + otherRevenueCents - opexCents };
  }
  const pnl = pnlOf(fromDay, endDay);
  const prevPnl = pnlOf(prevFromDay, prevEndDay);

  // ---------- cash discrepancies & inventory adjustments, straight from the accounts they post to ----------
  let overageCents = 0n, shortageCents = 0n, adjustmentCents = 0n;
  const diffEntries = new Set<string>();
  for (const l of linesRes.data ?? []) {
    const entry = entryOf.get(l.entry_id as string);
    const acc = accountOf.get(l.account_id as string);
    if (!entry || !acc || entry.entry_date < fromDay || entry.entry_date > endDay) continue;
    const debit = cents(l.debit), credit = cents(l.credit);
    if (acc.code === "4200") { overageCents += credit - debit; if (entry.source_table === "shifts") diffEntries.add(entry.id); }
    if (acc.code === "5300") { shortageCents += debit - credit; if (entry.source_table === "shifts") diffEntries.add(entry.id); }
    if (acc.code === "5400") adjustmentCents += debit - credit;
  }

  // ---------- liters by fuel (dashboard_summary daily, same price_at() math the ledger posts with) ----------
  type Daily = { day: string; product_id: string; liters: Num; amount: Num };
  const products = await sb.from("products").select("id, name").eq("station_id", stationId).abortSignal(signal());
  if (products.error) throw new Error(products.error.message);
  const productName = new Map((products.data ?? []).map((p) => [p.id as string, p.name as string]));
  const byProductMap = new Map<string, { liters: number; amountCents: bigint }>();
  for (const d of ((current.data as { daily: Daily[] }).daily ?? [])) {
    const cur = byProductMap.get(d.product_id) ?? { liters: 0, amountCents: 0n };
    byProductMap.set(d.product_id, { liters: cur.liters + Number(d.liters), amountCents: cur.amountCents + cents(d.amount) });
  }
  const byProduct = [...byProductMap.entries()].map(([id, v]) => ({ product: productName.get(id) ?? "", ...v }))
    .sort((a, b) => b.liters - a.liters);
  const totalLiters = byProduct.reduce((s, r) => s + r.liters, 0);

  // ---------- liters by pump ----------
  const pumpOf = new Map((pumpsRes.data ?? []).map((p) => [p.id as string, p.number as number]));
  const pumpOfLeg = new Map((legsRes.data ?? []).map((l) => [l.id as string, pumpOf.get(l.pump_id as string) ?? 0]));
  const byPumpMap = new Map<number, { liters: number; amountCents: bigint }>();
  for (const s of pumpSalesRes.data ?? []) {
    const pump = pumpOfLeg.get(s.leg_id as string) ?? 0;
    const cur = byPumpMap.get(pump) ?? { liters: 0, amountCents: 0n };
    byPumpMap.set(pump, { liters: cur.liters + Number(s.liters), amountCents: cur.amountCents + cents(s.amount) });
  }
  const byPump = [...byPumpMap.entries()].filter(([p]) => p > 0).map(([pump, v]) => ({ pump, ...v })).sort((a, b) => a.pump - b.pump);

  // ---------- debt aging across every company (same FIFO as O5's company_balance) ----------
  const now = Date.now();
  const aging: Record<AgingBucket, bigint> = { "0-30": 0n, "31-60": 0n, "60+": 0n };
  for (const c of companiesRes.data ?? []) {
    const sales = (salesRes.data ?? []).filter((s) => s.company_account_id === c.id);
    const payments = (paymentsRes.data ?? []).filter((p) => p.company_account_id === c.id);
    const { unpaid } = fifoAging(sales.map((s) => ({ amount: s.amount, at: s.received_at })), payments.map((p) => ({ amount: p.amount, at: p.received_at })));
    for (const lot of unpaid) {
      const ageDays = Math.floor((now - Date.parse(lot.at)) / 86_400_000);
      const bucket: AgingBucket = ageDays <= 30 ? "0-30" : ageDays <= 60 ? "31-60" : "60+";
      aging[bucket] += lot.amountCents;
    }
  }
  const agingTotalCents = aging["0-30"] + aging["31-60"] + aging["60+"];

  return {
    period: { from, to, timezone }, compare: { from: prevFrom, to: prevTo },
    profitComplete: !!(current.data as { profit_complete: boolean | null }).profit_complete,
    pnl, prevPnl, byProduct, totalLiters, byPump,
    cashDiff: { netCents: shortageCents - overageCents, count: diffEntries.size },
    inventoryDiff: { adjustmentCents },
    aging, agingTotalCents,
    fetchedAt: new Date().toISOString(),
  };
}
