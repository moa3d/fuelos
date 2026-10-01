// «المحطات» — every station on the platform, one row per station (station_read RLS: is_platform_staff()
// grants full visibility, same as A1's dashboard). Plan/subscription and active-member count are read the
// same way A3 does it, joined in on the client since a subscription covers a whole organization (one or more
// stations for a per-station plan).
import type { StationStatus } from "./stations-rules";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type StationRow = {
  id: string; name: string; city: string | null; status: StationStatus;
  planName: string | null; activeUsers: number; hasLocation: boolean; createdAt: string;
};

export async function loadStations(): Promise<StationRow[]> {
  const sb = supabase();
  const [stationsRes, subsRes, plansRes, membersRes] = await Promise.all([
    sb.from("stations").select("id, name, city, status, organization_id, lat, lng, created_at").order("created_at", { ascending: false }).abortSignal(signal()),
    sb.from("subscriptions").select("organization_id, plan_id").abortSignal(signal()),
    sb.from("plans").select("id, name").abortSignal(signal()),
    sb.from("station_members").select("station_id, user_id").eq("status", "active").abortSignal(signal()),
  ]);
  const failed = [stationsRes, subsRes, plansRes, membersRes].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const planName = new Map((plansRes.data ?? []).map((p) => [p.id as string, p.name as string]));
  const planByOrg = new Map((subsRes.data ?? []).map((s) => [s.organization_id as string, planName.get(s.plan_id as string) ?? null]));
  const activeUsersByStation = new Map<string, number>();
  for (const m of membersRes.data ?? []) activeUsersByStation.set(m.station_id as string, (activeUsersByStation.get(m.station_id as string) ?? 0) + 1);

  return (stationsRes.data ?? []).map((s) => ({
    id: s.id as string, name: s.name as string, city: s.city as string | null, status: s.status as StationStatus,
    planName: planByOrg.get(s.organization_id as string) ?? null,
    activeUsers: activeUsersByStation.get(s.id as string) ?? 0,
    hasLocation: s.lat !== null && s.lng !== null,
    createdAt: s.created_at as string,
  }));
}

export type StationHeader = { id: string; name: string; city: string | null; status: StationStatus };

/** For the station detail page's header — a single row, not the whole platform-wide join. */
export async function loadStationHeader(stationId: string): Promise<StationHeader | undefined> {
  const { data, error } = await supabase().from("stations").select("id, name, city, status").eq("id", stationId).abortSignal(signal()).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: data.id, name: data.name, city: data.city, status: data.status as StationStatus } : undefined;
}
