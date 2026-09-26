// Data for O1 «لوحة القيادة». Every amount comes from the server:
// - station_period_bounds(): the period in the station's time zone (today / yesterday / week / month);
// - dashboard_summary(): the same math as shift_summary, summed server-side, plus the finance fields
//   (null for a shift manager) and liters/amount per fuel per day;
// - the tank_book_levels view, approval requests and the period's shifts for the lists.
// The page only formats. (briefs 03a; accounting skill: never re-implement the cash formula in the app)
import { supabase } from "./supabase";

export type Period = "today" | "yesterday" | "week" | "month";
type Num = number | string;

export type Summary = {
  from: string; to: string; timezone: string;
  meter_sales: Num; liters: Num; expected_cash: Num;
  shifts_total: number; shifts_closed: number;
  recorded_open_fills: Num; recorded_open_fills_count: number;
  daily: { day: string; product_id: string; liters: Num; amount: Num }[];
  estimated_profit: Num | null; profit_complete: boolean | null;
  receivables: Num | null; overdue_companies: number | null;
};

export type ShiftRow = {
  id: string;
  status: "open" | "submitted" | "approved" | "rejected" | "reopened";
  opened_at: string;
  closed_at: string | null;
  attendantName: string;
  pumps: number[];
  products: string[];
  /** from the shift's close request (counted − expected), when it was submitted */
  cashDiff: Num | null;
};

export type TankRow = {
  tankId: string; name: string; product: string; capacityL: number; bookL: number; bookPct: number;
  minPct: number; lastDipAt: string | null;
};

export type Approval = {
  id: string;
  type: "shift_close" | "credit_over_limit" | "stock_adjustment" | "shift_reopen";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  requestedBy: string;
  refId: string | null;
  payload: Record<string, unknown>;
};

export type DashboardData = {
  period: { from: string; to: string; timezone: string };
  summary: Summary;
  /** liters per fuel per day over the 15 days ending with the period */
  daily: { day: string; product: string; liters: number }[];
  /** last day of the chart, «YYYY-MM-DD» in the station's time zone */
  chartEndDay: string;
  shifts: ShiftRow[];
  /** all shifts in the period (the list shows the latest few) */
  shiftsCount: number;
  tanks: TankRow[];
  approvals: Approval[];
  fetchedAt: string;
};

const signal = () => AbortSignal.timeout(20_000);
const SHIFT_LIST_MAX = 12;

export async function loadDashboard(stationId: string, period: Period): Promise<DashboardData> {
  const sb = supabase();
  const bounds = await sb.rpc("station_period_bounds", { p_station: stationId, p_period: period }).abortSignal(signal());
  if (bounds.error || !bounds.data) throw new Error(bounds.error?.message ?? "no bounds");
  const { from, to, timezone } = bounds.data as { from: string; to: string; timezone: string };
  const chartFrom = new Date(Date.parse(to) - 15 * 86_400_000).toISOString();

  const [summary, chart, members, shiftsRes, tanksRes, levelsRes, dipsRes, productsRes, approvalsRes] = await Promise.all([
    sb.rpc("dashboard_summary", { p_station: stationId, p_from: from, p_to: to }).abortSignal(signal()),
    sb.rpc("dashboard_summary", { p_station: stationId, p_from: chartFrom, p_to: to }).abortSignal(signal()),
    sb.from("station_members").select("user_id, display_name").eq("station_id", stationId).abortSignal(signal()),
    sb.from("shifts")
      .select("id, status, attendant_id, opened_at, closed_at, shift_legs(pumps(number), leg_readings(nozzles(tank_id)))", { count: "exact" })
      .eq("station_id", stationId).gte("opened_at", from).lt("opened_at", to)
      .order("opened_at", { ascending: false }).limit(SHIFT_LIST_MAX).abortSignal(signal()),
    sb.from("tanks").select("id, name, product_id, capacity_l, min_level_pct").eq("station_id", stationId).eq("is_active", true).abortSignal(signal()),
    sb.from("tank_book_levels").select("tank_id, book_l, book_pct").eq("station_id", stationId).abortSignal(signal()),
    sb.from("tank_measurements").select("tank_id, measured_at").eq("station_id", stationId)
      .order("measured_at", { ascending: false }).limit(50).abortSignal(signal()),
    sb.from("products").select("id, name").eq("station_id", stationId).abortSignal(signal()),
    sb.from("approval_requests").select("id, type, status, requested_at, requested_by, ref_id, payload")
      .eq("station_id", stationId).order("requested_at", { ascending: false }).limit(30).abortSignal(signal()),
  ]);
  const failed = [summary, chart, members, shiftsRes, tanksRes, levelsRes, dipsRes, productsRes, approvalsRes].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const nameOf = new Map((members.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  const productName = new Map((productsRes.data ?? []).map((p) => [p.id as string, p.name as string]));
  const tankProduct = new Map((tanksRes.data ?? []).map((t) => [t.id as string, productName.get(t.product_id) ?? ""]));

  const approvals: Approval[] = (approvalsRes.data ?? []).map((a) => ({
    id: a.id, type: a.type, status: a.status, createdAt: a.requested_at, refId: a.ref_id,
    requestedBy: nameOf.get(a.requested_by) ?? "", payload: (a.payload ?? {}) as Record<string, unknown>,
  }));
  const closeDiff = new Map(approvals.filter((a) => a.type === "shift_close" && a.refId)
    .map((a) => [a.refId!, (a.payload.cash_diff ?? null) as Num | null]));

  type RawShift = {
    id: string; status: ShiftRow["status"]; attendant_id: string; opened_at: string; closed_at: string | null;
    shift_legs: { pumps: { number: number } | null; leg_readings: { nozzles: { tank_id: string } | null }[] }[];
  };
  const shifts: ShiftRow[] = ((shiftsRes.data ?? []) as unknown as RawShift[]).map((s) => ({
    id: s.id, status: s.status, opened_at: s.opened_at, closed_at: s.closed_at,
    attendantName: nameOf.get(s.attendant_id) ?? "",
    pumps: [...new Set(s.shift_legs.map((l) => l.pumps?.number ?? 0))],
    products: [...new Set(s.shift_legs.flatMap((l) => l.leg_readings.map((r) => tankProduct.get(r.nozzles?.tank_id ?? "") ?? "")))],
    cashDiff: closeDiff.get(s.id) ?? null,
  }));

  const level = new Map((levelsRes.data ?? []).map((l) => [l.tank_id as string, l]));
  const lastDip = new Map<string, string>();
  for (const d of dipsRes.data ?? []) if (!lastDip.has(d.tank_id)) lastDip.set(d.tank_id, d.measured_at);
  const tanks: TankRow[] = (tanksRes.data ?? []).map((t) => ({
    tankId: t.id, name: t.name, product: productName.get(t.product_id) ?? "",
    capacityL: Number(t.capacity_l), bookL: Number(level.get(t.id)?.book_l ?? 0), bookPct: Number(level.get(t.id)?.book_pct ?? 0),
    minPct: Number(t.min_level_pct), lastDipAt: lastDip.get(t.id) ?? null,
  })).sort((a, b) => a.product.localeCompare(b.product, "ar"));

  const chartSummary = chart.data as Summary;
  return {
    period: { from, to, timezone },
    summary: summary.data as Summary,
    daily: chartSummary.daily.map((d) => ({ day: d.day, product: productName.get(d.product_id) ?? "", liters: Number(d.liters) })),
    chartEndDay: new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(Date.parse(to) - 1)),
    shifts,
    shiftsCount: shiftsRes.count ?? shifts.length,
    tanks,
    approvals,
    fetchedAt: new Date().toISOString(),
  };
}

export { cents, centsStr } from "./money";
