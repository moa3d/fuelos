// O11 «الخزانات والمضخات» tab (docs/briefs/06b, delivered in 06e): an owner growing their station adds a tank
// or a pump later, through the same setup_station_equipment() A2 onboarding uses — additive only, one call per
// save (CLAUDE.md rule 2: a multi-table write stays a single SECURITY DEFINER RPC).
import { errorMessage } from "@fuelos/core";
import { supabase } from "./supabase.ts";

const signal = () => AbortSignal.timeout(20_000);

export type TankOption = { id: string; name: string; productName: string };
export type ProductOption = { code: string; name: string };
export type PumpRow = { id: string; number: number; name: string | null; nozzles: { label: string; productName: string }[] };

export async function loadTankOptions(stationId: string): Promise<{ tanks: TankOption[]; products: ProductOption[]; pumps: PumpRow[] }> {
  const sb = supabase();
  const [tanksRes, productsRes, pumpsRes] = await Promise.all([
    sb.from("tanks").select("id, name, product_id").eq("station_id", stationId).eq("is_active", true).abortSignal(signal()),
    sb.from("products").select("id, code, name").eq("station_id", stationId).eq("is_active", true).abortSignal(signal()),
    sb.from("pumps").select("id, number, name, nozzles(label, tanks(product_id))").eq("station_id", stationId).eq("is_active", true)
      .order("number").abortSignal(signal()),
  ]);
  if (tanksRes.error) throw new Error(tanksRes.error.message);
  if (productsRes.error) throw new Error(productsRes.error.message);
  if (pumpsRes.error) throw new Error(pumpsRes.error.message);
  const nameOfId = new Map((productsRes.data ?? []).map((p) => [p.id as string, p.name as string]));
  const tanks = (tanksRes.data ?? []).map((t) => ({ id: t.id, name: t.name, productName: nameOfId.get(t.product_id) ?? "" }));
  type RawPump = { id: string; number: number; name: string | null; nozzles: { label: string; tanks: { product_id: string } | null }[] };
  const pumps: PumpRow[] = ((pumpsRes.data ?? []) as unknown as RawPump[]).map((p) => ({
    id: p.id, number: p.number, name: p.name,
    nozzles: p.nozzles.map((n) => ({ label: n.label, productName: nameOfId.get(n.tanks?.product_id ?? "") ?? "" })),
  }));
  return { tanks, products: (productsRes.data ?? []).map((p) => ({ code: p.code, name: p.name })), pumps };
}

export type Outcome = { ok: true } | { ok: false; message: string };
function messageOf(e: { message?: string; code?: string; details?: string | null } | null): string {
  if (e?.message === "FUELOS_BAD_REQUEST") return `تحقّق من البيانات: ${e.details ?? "قيمة غير صحيحة"}`;
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  const local: Record<string, string> = { FUELOS_PERMISSION_DENIED: "إضافة معدات متاحة لصاحب المحطة فقط" };
  return (code && local[code]) || errorMessage(code);
}

export async function addTank(stationId: string, params: { productCode: string; name: string; capacityL: string; minLevelPct: string }): Promise<Outcome> {
  const { error } = await supabase().rpc("setup_station_equipment", {
    p_station: stationId,
    p_equipment: { tanks: [{ key: "new", product_code: params.productCode, name: params.name, capacity_l: Number(params.capacityL), min_level_pct: Number(params.minLevelPct) }] },
  }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export type NozzleInput = { label: string; tankId: string; lastReading: string };

export async function addPump(stationId: string, params: { number: string; name: string; nozzles: NozzleInput[] }): Promise<Outcome> {
  const { error } = await supabase().rpc("setup_station_equipment", {
    p_station: stationId,
    p_equipment: {
      pumps: [{
        number: Number(params.number), name: params.name || null,
        nozzles: params.nozzles.map((n) => ({ label: n.label, tank_id: n.tankId, last_reading: Number(n.lastReading) })),
      }],
    },
  }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}
