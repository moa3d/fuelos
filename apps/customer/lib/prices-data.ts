// C1 (guest price board). public_station_prices is an owner-rights view granted to anon — this works
// whether the visitor is signed in or not; no station scoping yet (lists every active station).
import { groupByStation, type PriceRow, type Station } from "./prices-rules";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type PricesData = { stations: Station[]; fetchedAt: string };

export async function loadPrices(): Promise<PricesData> {
  const { data, error } = await supabase()
    .from("public_station_prices")
    .select("station_id, station_name, city, currency_code, product_id, product_name, price, price_updated_at, availability, availability_source, availability_updated_at, lat, lng")
    .order("station_name")
    .order("product_name")
    .abortSignal(signal());
  if (error) throw new Error(error.message);
  return { stations: groupByStation((data ?? []) as PriceRow[]), fetchedAt: new Date().toISOString() };
}
