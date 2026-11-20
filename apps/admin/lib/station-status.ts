import { stationStatusView, type StationStatusView } from "@fuelos/core";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export async function loadLiveStatuses(stationIds: string[]): Promise<Map<string, StationStatusView>> {
  if (stationIds.length === 0) return new Map();
  const { data, error } = await supabase()
    .from("station_live_status")
    .select("station_id, is_open, open_set_at, crowd, crowd_set_at, updated_by, updated_at")
    .in("station_id", stationIds)
    .abortSignal(signal());
  if (error) throw new Error(error.message);
  const map = new Map<string, StationStatusView>();
  for (const row of data ?? []) {
    map.set(row.station_id as string, stationStatusView({
      is_open: row.is_open as boolean | null,
      open_set_at: row.open_set_at as string | null,
      crowd: row.crowd as "none" | "medium" | "high" | null,
      crowd_set_at: row.crowd_set_at as string | null,
      // has_open_shift intentionally omitted — plan §Task 7 says don't query shifts here
    }));
  }
  return map;
}
