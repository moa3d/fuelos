// O3 «المبيعات والمناوبات»: the shifts of a period (list) and one shift in detail.
// Totals come from shift_summary() (the only place that computes meter sales and expected cash); this file only reads.
import type { Period } from "./dashboard";
import type { Method, ShiftStatus } from "./shift-report";
import { supabase } from "./supabase";

type Num = number | string;
const signal = () => AbortSignal.timeout(20_000);

export type ShiftListRow = {
  id: string; status: ShiftStatus; openedAt: string; closedAt: string | null;
  attendant: string; pumps: number[]; products: string[];
};
export type PumpNow = { id: string; number: number; products: string[]; heldBy: string | null };

export type SalesList = {
  period: { from: string; to: string; timezone: string };
  shifts: ShiftListRow[];
  shiftsCount: number;
  pumps: PumpNow[];
  names: Record<string, string>;
  maxShiftHours: number;
  cashToleranceCents: number;
  fetchedAt: string;
};

const LIST_MAX = 60;

export async function loadSalesList(stationId: string, period: Period): Promise<SalesList> {
  const sb = supabase();
  const bounds = await sb.rpc("station_period_bounds", { p_station: stationId, p_period: period }).abortSignal(signal());
  if (bounds.error || !bounds.data) throw new Error(bounds.error?.message ?? "no bounds");
  const { from, to, timezone } = bounds.data as { from: string; to: string; timezone: string };

  const [members, shiftsRes, tanks, products, board, station] = await Promise.all([
    sb.from("station_members").select("user_id, display_name").eq("station_id", stationId).abortSignal(signal()),
    sb.from("shifts")
      .select("id, status, attendant_id, opened_at, closed_at, shift_legs(pumps(number), leg_readings(nozzles(tank_id)))", { count: "exact" })
      .eq("station_id", stationId).gte("opened_at", from).lt("opened_at", to)
      .order("opened_at", { ascending: false }).limit(LIST_MAX).abortSignal(signal()),
    sb.from("tanks").select("id, product_id").eq("station_id", stationId).abortSignal(signal()),
    sb.from("products").select("id, name").eq("station_id", stationId).abortSignal(signal()),
    sb.rpc("pump_board", { p_station: stationId }).abortSignal(signal()),
    sb.from("stations").select("cash_tolerance, max_shift_hours").eq("id", stationId).abortSignal(signal()).maybeSingle(),
  ]);
  const failed = [members, shiftsRes, tanks, products, board, station].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const names = Object.fromEntries((members.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  const productName = new Map((products.data ?? []).map((p) => [p.id as string, p.name as string]));
  const tankProduct = new Map((tanks.data ?? []).map((t) => [t.id as string, productName.get(t.product_id) ?? ""]));

  type RawShift = {
    id: string; status: ShiftStatus; attendant_id: string; opened_at: string; closed_at: string | null;
    shift_legs: { pumps: { number: number } | null; leg_readings: { nozzles: { tank_id: string } | null }[] }[];
  };
  const shifts: ShiftListRow[] = ((shiftsRes.data ?? []) as unknown as RawShift[]).map((s) => ({
    id: s.id, status: s.status, openedAt: s.opened_at, closedAt: s.closed_at, attendant: names[s.attendant_id] ?? "",
    pumps: [...new Set(s.shift_legs.map((l) => l.pumps?.number ?? 0))].sort((a, b) => a - b),
    products: [...new Set(s.shift_legs.flatMap((l) => l.leg_readings.map((r) => tankProduct.get(r.nozzles?.tank_id ?? "") ?? "")))].filter(Boolean),
  }));

  type BoardRow = { pump_id: string; number: number; held_by: string | null; nozzles: { product_name: string }[] };
  const pumps: PumpNow[] = ((board.data ?? []) as BoardRow[]).map((p) => ({
    id: p.pump_id, number: p.number, heldBy: p.held_by, products: [...new Set(p.nozzles.map((n) => n.product_name))],
  }));

  return {
    period: { from, to, timezone }, shifts, shiftsCount: shiftsRes.count ?? shifts.length, pumps, names,
    maxShiftHours: station.data?.max_shift_hours ?? 12,
    cashToleranceCents: Math.round(Number(station.data?.cash_tolerance ?? 0) * 100),
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- one shift ----------
export type SummaryLeg = {
  leg_id: string; pump_id: string; pump_number: number; started_at: string; ended_at: string | null; gap_note: string | null;
  liters: Num; amount: Num;
  nozzles: { nozzle_id: string; label: string; opening_reading: Num; closing_reading: Num | null; gap_liters: Num | null; liters: Num; amount: Num }[];
};
export type ShiftSummaryFull = {
  shift_id: string; liters: Num; meter_sales: Num; card: Num; credit: Num; voucher: Num;
  opening_cash: Num; expected_cash: Num; counted_cash: Num | null; cash_diff: Num | null;
  nozzles: { nozzle_id: string; price: Num | null }[];
  legs: SummaryLeg[];
};
export type ShiftSale = { id: string; leg_id: string | null; status: string; payment_method: Method; amount: Num; liters: Num };
export type ShiftRequest = {
  id: string; type: "shift_close" | "credit_over_limit" | "stock_adjustment" | "shift_reopen"; status: "pending" | "approved" | "rejected";
  requestedAt: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null; payload: Record<string, unknown>;
  /** for a credit request: the fill it is about */
  saleAmount?: Num;
};
export type ShiftDetail = { summary: ShiftSummaryFull; sales: ShiftSale[]; requests: ShiftRequest[]; diffReason: string | null };

export async function loadShiftDetail(stationId: string, shiftId: string): Promise<ShiftDetail> {
  const sb = supabase();
  const [summary, sales, shift, closeReqs] = await Promise.all([
    sb.rpc("shift_summary", { p_shift: shiftId }).abortSignal(signal()),
    sb.from("sales").select("id, leg_id, status, payment_method, amount, liters").eq("shift_id", shiftId).abortSignal(signal()),
    sb.from("shifts").select("diff_reason").eq("id", shiftId).abortSignal(signal()).maybeSingle(),
    sb.from("approval_requests")
      .select("id, type, status, requested_at, decided_by, decided_at, decision_note, payload")
      .eq("station_id", stationId).eq("ref_id", shiftId).order("requested_at", { ascending: false }).abortSignal(signal()),
  ]);
  const failed = [summary, sales, shift, closeReqs].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const saleRows = (sales.data ?? []) as ShiftSale[];
  const pendingSaleIds = saleRows.filter((s) => s.status === "pending_approval" || s.payment_method === "credit").map((s) => s.id);
  const creditReqs = pendingSaleIds.length === 0 ? { data: [], error: null } :
    await sb.from("approval_requests")
      .select("id, type, status, requested_at, decided_by, decided_at, decision_note, payload, ref_id")
      .eq("station_id", stationId).in("ref_id", pendingSaleIds).abortSignal(signal());
  if (creditReqs.error) throw new Error(creditReqs.error.message);

  type RawReq = {
    id: string; type: ShiftRequest["type"]; status: ShiftRequest["status"]; requested_at: string; decided_by: string | null;
    decided_at: string | null; decision_note: string | null; payload: Record<string, unknown> | null; ref_id?: string;
  };
  const saleAmount = new Map(saleRows.map((s) => [s.id, s.amount]));
  const toReq = (r: RawReq): ShiftRequest => ({
    id: r.id, type: r.type, status: r.status, requestedAt: r.requested_at, decidedBy: r.decided_by, decidedAt: r.decided_at,
    decisionNote: r.decision_note, payload: r.payload ?? {}, saleAmount: r.ref_id ? saleAmount.get(r.ref_id) : undefined,
  });
  return {
    summary: summary.data as ShiftSummaryFull,
    sales: saleRows,
    requests: [...(closeReqs.data as RawReq[]), ...(creditReqs.data as RawReq[])].map(toReq),
    diffReason: shift.data?.diff_reason ?? null,
  };
}
