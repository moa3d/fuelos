// A1 «لوحة المنصة». Platform-staff-only reads (station_read/members_read/subs_admin/tickets_read/devices_platform_read:
// is_platform_staff() grants full visibility). Device sync health and MRR (docs/briefs/06a, delivered) feed the
// "تحتاج إجراء" list alongside subscriptions. «خريطة المحطات» groups by city, not real coordinates — A1's own
// mockup is really a health-by-region view, not a literal map, so no map library/lat-long is needed for it (a
// real geographic map is still a separate, later thing). «طلب وصول مؤقت» stays real, unrelated to any of this.
import {
  cityHealth, deviceSyncStale, mrrCents, trialEndingSoon, type SubForMrr, type SubStatus, type TicketPriority, type TicketStatus, type Tone,
} from "./dashboard-rules";
import { cents } from "./money";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type Ticket = { id: string; number: number; subject: string; priority: TicketPriority; status: TicketStatus; stationName: string | null; createdAt: string };
export type AttentionItem = { stationId: string; stationName: string; reason: string };
export type CityGroup = { city: string; stationCount: number; tone: Tone; label: string };

export type DashboardData = {
  activeStations: number; totalStations: number;
  totalUsers: number;
  mrrCents: bigint;
  openTickets: number; urgentTickets: number;
  tickets: Ticket[];
  attention: AttentionItem[];
  cityGroups: CityGroup[];
  fetchedAt: string;
};

export async function loadDashboard(): Promise<DashboardData> {
  const sb = supabase();
  const [stationsRes, membersRes, subsRes, ticketsRes, devicesRes] = await Promise.all([
    sb.from("stations").select("id, name, city, status, organization_id").abortSignal(signal()),
    sb.from("station_members").select("user_id").eq("status", "active").abortSignal(signal()),
    sb.from("subscriptions").select("id, organization_id, status, trial_ends_at, plans(monthly_price, per_station)").abortSignal(signal()),
    sb.from("support_tickets").select("id, number, subject, priority, status, station_id, created_at").neq("status", "resolved").order("created_at", { ascending: false }).abortSignal(signal()),
    sb.from("devices").select("station_id, last_sync_at").abortSignal(signal()),
  ]);
  const failed = [stationsRes, membersRes, subsRes, ticketsRes, devicesRes].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const stations = stationsRes.data ?? [];
  const stationName = new Map(stations.map((s) => [s.id as string, s.name as string]));
  const stationsByOrg = new Map<string, number>();
  for (const s of stations) stationsByOrg.set(s.organization_id as string, (stationsByOrg.get(s.organization_id as string) ?? 0) + 1);

  const subsForMrr: SubForMrr[] = (subsRes.data ?? []).map((s) => {
    const plan = s.plans as unknown as { monthly_price: string; per_station: boolean } | null;
    return {
      status: s.status as SubStatus, planMonthlyPriceCents: cents(plan?.monthly_price ?? "0"),
      perStation: !!plan?.per_station, stationCount: stationsByOrg.get(s.organization_id as string) ?? 1,
    };
  });

  const now = Date.now();
  const attention: AttentionItem[] = [];
  for (const s of subsRes.data ?? []) {
    const orgStations = stations.filter((st) => st.organization_id === s.organization_id);
    if (s.status === "past_due") {
      for (const st of orgStations) attention.push({ stationId: st.id, stationName: st.name, reason: "دفعة الاشتراك متأخرة" });
    } else if (trialEndingSoon(s.trial_ends_at, now)) {
      for (const st of orgStations) attention.push({ stationId: st.id, stationName: st.name, reason: "الفترة التجريبية تنتهي قريباً" });
    }
  }
  const latestSyncByStation = new Map<string, string>();
  for (const d of devicesRes.data ?? []) {
    if (!d.last_sync_at) continue;
    const cur = latestSyncByStation.get(d.station_id as string);
    if (!cur || d.last_sync_at > cur) latestSyncByStation.set(d.station_id as string, d.last_sync_at as string);
  }
  for (const st of stations) {
    const latest = latestSyncByStation.get(st.id as string) ?? null;
    if (deviceSyncStale(latest, now)) attention.push({ stationId: st.id as string, stationName: st.name as string, reason: "لم تُزامن أجهزتها منذ 3 أيام" });
  }

  const tickets: Ticket[] = (ticketsRes.data ?? []).map((t) => ({
    id: t.id, number: t.number, subject: t.subject, priority: t.priority as TicketPriority, status: t.status as TicketStatus,
    stationName: t.station_id ? stationName.get(t.station_id as string) ?? null : null, createdAt: t.created_at ?? "",
  }));

  // «خريطة المحطات»: grouped by city, not real coordinates (stations have no lat/long — docs/briefs/05a).
  const reasonsByCity = new Map<string, string[]>();
  const countByCity = new Map<string, number>();
  for (const st of stations) {
    const city = (st.city as string | null) ?? "بلا مدينة";
    countByCity.set(city, (countByCity.get(city) ?? 0) + 1);
  }
  for (const a of attention) {
    const st = stations.find((s) => s.id === a.stationId);
    const city = (st?.city as string | null) ?? "بلا مدينة";
    const arr = reasonsByCity.get(city);
    if (arr) arr.push(a.reason); else reasonsByCity.set(city, [a.reason]);
  }
  const cityGroups: CityGroup[] = [...countByCity.entries()]
    .map(([city, stationCount]) => ({ city, stationCount, ...cityHealth(reasonsByCity.get(city) ?? []) }))
    .sort((a, b) => b.stationCount - a.stationCount);

  return {
    activeStations: stations.filter((s) => s.status === "active").length,
    totalStations: stations.length,
    totalUsers: new Set((membersRes.data ?? []).map((m) => m.user_id as string)).size,
    mrrCents: mrrCents(subsForMrr),
    openTickets: tickets.filter((t) => t.status === "open").length,
    urgentTickets: tickets.filter((t) => t.priority === "high").length,
    tickets: tickets.slice(0, 6),
    attention: attention.slice(0, 6),
    cityGroups,
    fetchedAt: new Date().toISOString(),
  };
}

export type StationOption = { id: string; name: string };
export async function loadStationOptions(): Promise<StationOption[]> {
  const { data, error } = await supabase().from("stations").select("id, name").order("name").abortSignal(signal());
  if (error) throw new Error(error.message);
  return (data ?? []) as StationOption[];
}

// ---------- «طلب وصول مؤقت» (self-granted, ≤24h — grants_create RLS enforces both) ----------
export type Outcome = { ok: true } | { ok: false; message: string };

export async function requestTemporaryAccess(userId: string, stationId: string, reason: string, ticketId: string | null): Promise<Outcome> {
  const expiresAt = new Date(Date.now() + 24 * 3_600_000).toISOString();
  const { error } = await supabase().from("access_grants").insert({ user_id: userId, station_id: stationId, reason, ticket_id: ticketId, expires_at: expiresAt }).abortSignal(signal());
  return error ? { ok: false, message: "تعذّر تسجيل الوصول — تحقق من السبب ثم حاول مرة أخرى" } : { ok: true };
}
