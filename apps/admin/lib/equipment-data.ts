// A2 steps 2-3 (docs/briefs/06b, delivered in 06e): setup_station_equipment() and station_readiness().
// The platform cannot read a station's own tables (RLS), so station_readiness is the only honest way to
// show the checklist — never a direct select on tanks/pumps/prices/etc.
import { errorMessage } from "@fuelos/core";
import type { EquipmentPayload, ReadinessData } from "./equipment-rules.ts";
import { supabase } from "./supabase.ts";

const signal = () => AbortSignal.timeout(20_000);

function messageOf(e: { message?: string; code?: string; details?: string | null } | null): string {
  if (e?.message === "FUELOS_BAD_REQUEST") return `تحقّق من البيانات: ${e.details ?? "قيمة غير صحيحة"}`;
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  const local: Record<string, string> = { FUELOS_PERMISSION_DENIED: "تجهيز المعدات متاح لأدمن المنصة أو صاحب المحطة فقط" };
  return (code && local[code]) || errorMessage(code);
}

export type SetupResult =
  | { ok: true; products: number; tanks: number; pumps: number; nozzles: number }
  | { ok: false; message: string };

export async function setupStationEquipment(stationId: string, equipment: EquipmentPayload): Promise<SetupResult> {
  const { data, error } = await supabase().rpc("setup_station_equipment", { p_station: stationId, p_equipment: equipment }).abortSignal(signal());
  if (error) return { ok: false, message: messageOf(error) };
  const r = data as { products: number; tanks: number; pumps: number; nozzles: number };
  return { ok: true, products: r.products, tanks: r.tanks, pumps: r.pumps, nozzles: r.nozzles };
}

export async function loadReadiness(stationId: string): Promise<ReadinessData> {
  const { data, error } = await supabase().rpc("station_readiness", { p_station: stationId }).abortSignal(signal());
  if (error) throw new Error(error.message);
  return data as ReadinessData;
}
