// O11 → «المحطة» (الموقع) و«المكافآت». Owner-only writes: stations lat/lng (station_owner_update RLS),
// loyalty_programs/reward_tiers/offers (loyalty_programs_owner/reward_tiers_owner/offers_owner — all
// `is_owner(station_id)`). New from docs/briefs/06a (Cowork): loyalty_programs, reward_tiers, offers.code.
import { errorMessage } from "@fuelos/core";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);
export type Outcome = { ok: true } | { ok: false; message: string };
function messageOf(e: { message?: string; code?: string } | null): string {
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  return (code && { FUELOS_PERMISSION_DENIED: "هذا الإجراء متاح لصاحب المحطة فقط" }[code]) || errorMessage(code);
}

// ---------- location ----------
export type Location = { lat: number | null; lng: number | null };

export async function loadLocation(stationId: string): Promise<Location> {
  const { data, error } = await supabase().from("stations").select("lat, lng").eq("id", stationId).abortSignal(signal()).single();
  if (error) throw new Error(error.message);
  return { lat: data.lat, lng: data.lng };
}

export async function updateLocation(stationId: string, lat: number | null, lng: number | null): Promise<Outcome> {
  const { error } = await supabase().from("stations").update({ lat, lng }).eq("id", stationId).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

// ---------- rewards ----------
export type RewardTier = { id: string; pointsThreshold: number; title: string; isActive: boolean };
export type OfferRow = { id: string; title: string; code: string | null; startsAt: string; endsAt: string };
export type RewardsSettings = { pointValue: number | null; tiers: RewardTier[]; offers: OfferRow[] };

export async function loadRewardsSettings(stationId: string): Promise<RewardsSettings> {
  const sb = supabase();
  const [programRes, tiersRes, offersRes] = await Promise.all([
    sb.from("loyalty_programs").select("point_value").eq("station_id", stationId).abortSignal(signal()).maybeSingle(),
    sb.from("reward_tiers").select("id, points_threshold, title, is_active").eq("station_id", stationId).order("points_threshold").abortSignal(signal()),
    sb.from("offers").select("id, title, code, starts_at, ends_at").eq("station_id", stationId).order("ends_at", { ascending: false }).abortSignal(signal()),
  ]);
  const failed = [programRes, tiersRes, offersRes].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return {
    pointValue: programRes.data?.point_value ?? null,
    tiers: (tiersRes.data ?? []).map((t) => ({ id: t.id, pointsThreshold: t.points_threshold, title: t.title, isActive: t.is_active })),
    offers: (offersRes.data ?? []).map((o) => ({ id: o.id, title: o.title, code: o.code, startsAt: o.starts_at, endsAt: o.ends_at })),
  };
}

export async function setPointValue(stationId: string, pointValue: number): Promise<Outcome> {
  const { error } = await supabase().from("loyalty_programs").upsert({ station_id: stationId, point_value: pointValue }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export async function addRewardTier(stationId: string, pointsThreshold: number, title: string): Promise<Outcome> {
  const { error } = await supabase().from("reward_tiers").insert({ station_id: stationId, points_threshold: pointsThreshold, title }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export async function setTierActive(tierId: string, isActive: boolean): Promise<Outcome> {
  const { error } = await supabase().from("reward_tiers").update({ is_active: isActive }).eq("id", tierId).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

const CODE_LOCAL: Record<string, string> = {
  FUELOS_PERMISSION_DENIED: "هذا الإجراء متاح لصاحب المحطة فقط",
  "23505": "هذا الكود مستخدم في عرض آخر لهذه المحطة",
  "23514": "الكود يجب أن يكون بأحرف إنجليزية كبيرة وأرقام وشرطة، من 3 إلى 20 رمزاً",
};
export async function setOfferCode(offerId: string, code: string | null): Promise<Outcome> {
  const { error } = await supabase().from("offers").update({ code: code ? code.toUpperCase() : null }).eq("id", offerId).abortSignal(signal());
  if (!error) return { ok: true };
  const key = error.code && CODE_LOCAL[error.code] ? error.code : undefined;
  return { ok: false, message: (key && CODE_LOCAL[key]) || messageOf(error) };
}
