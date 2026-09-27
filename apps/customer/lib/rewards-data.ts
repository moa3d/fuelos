// C6 «مكافآتي والعروض». Loyalty balance (loyalty_read RLS: customer_id = auth.uid()) and the offers list
// (offers_read: select to anon, authenticated — visible to guests too, per CLAUDE.md's "public prices for
// guests" milestone, offers ride along the same policy). No promo-code column and no personalized "متاح لك"
// eligibility exist yet (docs/briefs/04g-cowork-offers.md).
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type Offer = { id: string; title: string; stationName: string; startsAt: string; endsAt: string };
export type RewardsData = { pointsBalance: number; offers: Offer[]; fetchedAt: string };

export async function loadRewards(customerId: string | null): Promise<RewardsData> {
  const sb = supabase();
  const [loyalty, offersRes] = await Promise.all([
    customerId ? sb.from("loyalty_ledger").select("points").eq("customer_id", customerId).abortSignal(signal()) : Promise.resolve({ data: [], error: null }),
    sb.from("offers").select("id, station_id, title, starts_at, ends_at").eq("is_active", true).order("ends_at", { ascending: false }).abortSignal(signal()),
  ]);
  if (loyalty.error) throw new Error(loyalty.error.message);
  if (offersRes.error) throw new Error(offersRes.error.message);

  const stationIds = [...new Set((offersRes.data ?? []).map((o) => o.station_id as string))];
  const stationName = new Map<string, string>();
  if (stationIds.length > 0) {
    const st = await sb.from("public_station_prices").select("station_id, station_name").in("station_id", stationIds).abortSignal(signal());
    if (st.error) throw new Error(st.error.message);
    for (const r of st.data ?? []) if (!stationName.has(r.station_id as string)) stationName.set(r.station_id as string, r.station_name as string);
  }

  return {
    pointsBalance: (loyalty.data ?? []).reduce((s, l) => s + (l.points as number), 0),
    offers: (offersRes.data ?? []).map((o) => ({ id: o.id, title: o.title, stationName: stationName.get(o.station_id as string) ?? "", startsAt: o.starts_at, endsAt: o.ends_at })),
    fetchedAt: new Date().toISOString(),
  };
}
