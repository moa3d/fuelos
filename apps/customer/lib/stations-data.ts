// T1/T2 (guest directory + map). public_stations() is one RPC returning every active station with its live
// status already freshness-filtered server-side (supabase/migrations/20261111000200_station_live_status.sql)
// and its current prices/availability — anon-callable, same "no sign-in needed" pattern as prices-data.ts.
import { parseStations, type DirectoryStation } from "./stations-rules";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type StationsData = { stations: DirectoryStation[]; fetchedAt: string };

export async function loadStations(): Promise<StationsData> {
  const { data, error } = await supabase().rpc("public_stations").abortSignal(signal());
  if (error) throw new Error(error.message);
  return { stations: parseStations(data), fetchedAt: new Date().toISOString() };
}
