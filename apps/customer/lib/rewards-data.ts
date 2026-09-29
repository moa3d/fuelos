// C6 «مكافآتي والعروض». Points are earned per station (loyalty_ledger.station_id), and so are their value and
// tiers (loyalty_programs/reward_tiers — docs/briefs/06a, readable by anon/authenticated) — a customer's
// balance and next reward are compared against that same station's own program, one card per station where
// they have any points. Offers stay a flat list across stations (offers_read: anon+authenticated), each with
// its code if the owner set one. «متاح لك» personalized eligibility is still out of scope (offers.rule).
import { currencyLabel } from "./prices-rules";
import { nextTier } from "./rewards-rules";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type StationBalance = {
  stationId: string; stationName: string; pointsBalance: number;
  pointValue: number | null; currency: string; nextTier: { title: string; pointsNeeded: number } | null;
};
export type Offer = { id: string; title: string; stationName: string; startsAt: string; endsAt: string; code: string | null };
export type RewardsData = { balances: StationBalance[]; offers: Offer[]; fetchedAt: string };

export async function loadRewards(customerId: string | null): Promise<RewardsData> {
  const sb = supabase();
  const [loyaltyRes, offersRes] = await Promise.all([
    customerId ? sb.from("loyalty_ledger").select("station_id, points").eq("customer_id", customerId).abortSignal(signal()) : Promise.resolve({ data: [], error: null }),
    sb.from("offers").select("id, station_id, title, code, starts_at, ends_at").eq("is_active", true).order("ends_at", { ascending: false }).abortSignal(signal()),
  ]);
  if (loyaltyRes.error) throw new Error(loyaltyRes.error.message);
  if (offersRes.error) throw new Error(offersRes.error.message);

  const balanceByStation = new Map<string, number>();
  for (const l of loyaltyRes.data ?? []) balanceByStation.set(l.station_id as string, (balanceByStation.get(l.station_id as string) ?? 0) + (l.points as number));

  const stationIds = [...new Set([...balanceByStation.keys(), ...(offersRes.data ?? []).map((o) => o.station_id as string)])];
  const stationInfo = new Map<string, { name: string; currency: string }>();
  if (stationIds.length > 0) {
    const st = await sb.from("public_station_prices").select("station_id, station_name, currency_code").in("station_id", stationIds).abortSignal(signal());
    if (st.error) throw new Error(st.error.message);
    for (const r of st.data ?? []) if (!stationInfo.has(r.station_id as string)) stationInfo.set(r.station_id as string, { name: r.station_name as string, currency: currencyLabel(r.currency_code as string) });
  }

  const pointsStationIds = [...balanceByStation.keys()];
  const [programsRes, tiersRes] = await Promise.all([
    pointsStationIds.length === 0 ? { data: [], error: null } : sb.from("loyalty_programs").select("station_id, point_value").in("station_id", pointsStationIds).abortSignal(signal()),
    pointsStationIds.length === 0 ? { data: [], error: null } : sb.from("reward_tiers").select("station_id, points_threshold, title").in("station_id", pointsStationIds).abortSignal(signal()),
  ]);
  if (programsRes.error) throw new Error(programsRes.error.message);
  if (tiersRes.error) throw new Error(tiersRes.error.message);
  const pointValueOf = new Map((programsRes.data ?? []).map((p) => [p.station_id as string, Number(p.point_value)]));
  const tiersByStation = new Map<string, { title: string; pointsThreshold: number }[]>();
  for (const t of tiersRes.data ?? []) {
    const arr = tiersByStation.get(t.station_id as string);
    const row = { title: t.title as string, pointsThreshold: t.points_threshold as number };
    if (arr) arr.push(row); else tiersByStation.set(t.station_id as string, [row]);
  }

  const balances: StationBalance[] = [...balanceByStation.entries()]
    .filter(([, points]) => points > 0)
    .map(([stationId, pointsBalance]) => ({
      stationId, stationName: stationInfo.get(stationId)?.name ?? "", pointsBalance,
      pointValue: pointValueOf.get(stationId) ?? null, currency: stationInfo.get(stationId)?.currency ?? "ل.س",
      nextTier: nextTier(tiersByStation.get(stationId) ?? [], pointsBalance),
    }));

  return {
    balances,
    offers: (offersRes.data ?? []).map((o) => ({
      id: o.id, title: o.title, stationName: stationInfo.get(o.station_id as string)?.name ?? "",
      startsAt: o.starts_at, endsAt: o.ends_at, code: o.code,
    })),
    fetchedAt: new Date().toISOString(),
  };
}
