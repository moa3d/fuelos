// O2 «الخزانات والمخزون»: book stock from tank_book_levels, the last physical dip, pending stock-adjustment
// requests, recent movements, and the average daily draw for «يكفي X يوم». Writes go through record_fuel_delivery()
// and record_tank_measurement(); tank-to-tank transfer has no RPC yet (see docs/briefs Cowork request).
import { errorMessage } from "@fuelos/core";
import { avgDailyFromSales } from "./tank-rules";
import { supabase } from "./supabase";

type Num = number | string;
const signal = () => AbortSignal.timeout(20_000);
const SALES_WINDOW_DAYS = 14;

export type TankRow = {
  id: string; name: string; product: string; capacityL: number; minPct: number;
  bookL: number; bookPct: number;
  lastMeasured: { liters: number; at: string; by: string } | null;
  avgDailyL: number;
  pendingAdjustment: { id: string; diffL: number } | null;
  lastDeliveryMissingCost: boolean;
};

export type MovementRow = {
  id: number; tankId: string; tankName: string; type: import("./tank-rules").MovementType;
  liters: Num; reason: string | null; createdAt: string; by: string;
  refLabel: string;
};

export type TanksData = { tanks: TankRow[]; movements: MovementRow[]; suppliers: { id: string; name: string }[]; fetchedAt: string };

export async function loadTanks(stationId: string): Promise<TanksData> {
  const sb = supabase();
  const since = new Date(Date.now() - SALES_WINDOW_DAYS * 86_400_000).toISOString();

  const [tanks, levels, products, dips, pending, deliveries, movements, members, suppliers, salesMoves] = await Promise.all([
    sb.from("tanks").select("id, name, product_id, capacity_l, min_level_pct").eq("station_id", stationId).eq("is_active", true).abortSignal(signal()),
    sb.from("tank_book_levels").select("tank_id, book_l, book_pct").eq("station_id", stationId).abortSignal(signal()),
    sb.from("products").select("id, name").eq("station_id", stationId).abortSignal(signal()),
    sb.from("tank_measurements").select("tank_id, measured_l, measured_at, measured_by").eq("station_id", stationId)
      .order("measured_at", { ascending: false }).limit(200).abortSignal(signal()),
    sb.from("approval_requests").select("id, ref_id, payload").eq("station_id", stationId).eq("type", "stock_adjustment").eq("status", "pending").abortSignal(signal()),
    sb.from("fuel_deliveries").select("tank_id, unit_cost, supplier_id, supplier_invoice_no, liters, received_at").eq("station_id", stationId)
      .order("received_at", { ascending: false }).limit(200).abortSignal(signal()),
    sb.from("inventory_movements").select("id, tank_id, type, liters, ref_table, ref_id, reason, created_by, created_at")
      .eq("station_id", stationId).order("created_at", { ascending: false }).limit(80).abortSignal(signal()),
    sb.from("station_members").select("user_id, display_name").eq("station_id", stationId).abortSignal(signal()),
    sb.from("suppliers").select("id, name").eq("station_id", stationId).eq("is_active", true).order("name").abortSignal(signal()),
    sb.from("inventory_movements").select("tank_id, liters").eq("station_id", stationId).eq("type", "sale").gte("created_at", since).abortSignal(signal()),
  ]);
  const failed = [tanks, levels, products, dips, pending, deliveries, movements, members, suppliers, salesMoves].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const productName = new Map((products.data ?? []).map((p) => [p.id as string, p.name as string]));
  const bookOf = new Map((levels.data ?? []).map((l) => [l.tank_id as string, l]));
  const nameOf = new Map((members.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  const lastDip = new Map<string, { liters: number; at: string; by: string }>();
  for (const d of dips.data ?? []) if (!lastDip.has(d.tank_id)) lastDip.set(d.tank_id, { liters: Number(d.measured_l), at: d.measured_at, by: nameOf.get(d.measured_by) ?? "" });
  const lastDelivery = new Map<string, boolean>();
  for (const d of deliveries.data ?? []) if (!lastDelivery.has(d.tank_id)) lastDelivery.set(d.tank_id, d.unit_cost === null);
  const pendingByTank = new Map((pending.data ?? []).map((r) => [r.payload?.tank_id as string, { id: r.id as string, diffL: Number(r.payload?.diff_l ?? 0) }]));
  const salesByTank = new Map<string, number[]>();
  for (const m of salesMoves.data ?? []) {
    const list = salesByTank.get(m.tank_id) ?? [];
    list.push(Math.abs(Number(m.liters)));
    salesByTank.set(m.tank_id, list);
  }

  const tankRows: TankRow[] = (tanks.data ?? []).map((t) => ({
    id: t.id, name: t.name, product: productName.get(t.product_id) ?? "", capacityL: Number(t.capacity_l), minPct: Number(t.min_level_pct),
    bookL: Number(bookOf.get(t.id)?.book_l ?? 0), bookPct: Number(bookOf.get(t.id)?.book_pct ?? 0),
    lastMeasured: lastDip.get(t.id) ?? null,
    avgDailyL: avgDailyFromSales(salesByTank.get(t.id) ?? [], SALES_WINDOW_DAYS),
    pendingAdjustment: pendingByTank.get(t.id) ?? null,
    lastDeliveryMissingCost: lastDelivery.get(t.id) ?? false,
  }));

  const tankName = new Map(tankRows.map((t) => [t.id, t.name]));
  const invoiceOf = new Map((deliveries.data ?? []).map((d) => [`${d.tank_id}|${d.received_at}`, d.supplier_invoice_no as string | null]));
  type RawMove = { id: number; tank_id: string; type: import("./tank-rules").MovementType; liters: Num; ref_table: string | null; ref_id: string | null; reason: string | null; created_by: string | null; created_at: string };
  const moveRows: MovementRow[] = ((movements.data ?? []) as unknown as RawMove[]).map((m) => ({
    id: m.id, tankId: m.tank_id, tankName: tankName.get(m.tank_id) ?? "", type: m.type, liters: m.liters, reason: m.reason, createdAt: m.created_at,
    by: m.created_by ? nameOf.get(m.created_by) ?? "" : "النظام",
    refLabel: refLabelOf(m, invoiceOf),
  }));

  return { tanks: tankRows, movements: moveRows, suppliers: (suppliers.data ?? []) as { id: string; name: string }[], fetchedAt: new Date().toISOString() };
}

function refLabelOf(
  m: { ref_table: string | null; ref_id: string | null; reason: string | null; tank_id: string },
  invoiceOf: Map<string, string | null>,
): string {
  if (m.ref_table === "fuel_deliveries") {
    const inv = [...invoiceOf].find(([k]) => k.startsWith(`${m.tank_id}|`))?.[1];
    return inv ? `فاتورة مورد ${inv}` : "توريد";
  }
  if (m.ref_table === "shifts") return "من مناوبة";
  if (m.ref_table === "tank_measurements") return `قياس فعلي QM-${(m.ref_id ?? "").replace(/-/g, "").slice(0, 4).toUpperCase()}`;
  return m.reason ?? "—";
}

// ---------- writes ----------
export type Outcome = { ok: true } | { ok: false; message: string };
const LOCAL: Record<string, string> = {
  FUELOS_PERMISSION_DENIED: "هذا الإجراء متاح لصاحب المحطة أو المحاسب أو مدير المناوبة",
};
function messageOf(e: { message?: string; code?: string } | null): string {
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  return (code && LOCAL[code]) || errorMessage(code);
}

export async function recordDelivery(params: {
  stationId: string; tankId: string; liters: string; unitCost: string | null; extraCosts: string; supplierId: string | null; invoiceNo: string | null;
}): Promise<Outcome> {
  const { error } = await supabase().rpc("record_fuel_delivery", {
    p_station: params.stationId, p_tank: params.tankId, p_liters: params.liters,
    p_unit_cost: params.unitCost, p_extra_costs: params.extraCosts || "0",
    p_supplier: params.supplierId, p_invoice_no: params.invoiceNo,
  }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export type MeasurementResult = { ok: true; diffL: number; needsApproval: boolean } | { ok: false; message: string };

export async function recordMeasurement(tankId: string, measuredL: string): Promise<MeasurementResult> {
  const { data, error } = await supabase().rpc("record_tank_measurement", { p_tank: tankId, p_measured_l: measuredL }).abortSignal(signal());
  if (error) return { ok: false, message: messageOf(error) };
  const r = data as { diff_l: Num; needs_approval: boolean };
  return { ok: true, diffL: Number(r.diff_l), needsApproval: r.needs_approval };
}
