// A1 «لوحة المنصة». Platform-staff-only reads (station_read/members_read/subs_admin/tickets_read: is_platform_staff()
// grants full visibility). The map, per-station "لم تُزامن منذ X أيام" device-sync signal, and the 6-month revenue
// history chart aren't built: stations have no lat/long, there's no device-heartbeat tracking, and there's no
// historical MRR snapshot table — see docs/briefs/05a-cowork-admin-dashboard.md. «طلب وصول مؤقت» is real.
import {
  mrrCents, trialEndingSoon, type SubForMrr, type SubStatus, type TicketPriority, type TicketStatus,
} from "./dashboard-rules";
import { cents } from "./money";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type Ticket = { id: string; number: number; subject: string; priority: TicketPriority; status: TicketStatus; stationName: string | null; createdAt: string };
export type AttentionItem = { stationId: string; stationName: string; reason: string };

export type DashboardData = {
  activeStations: number; totalStations: number;
  totalUsers: number;
  mrrCents: bigint;
  openTickets: number; urgentTickets: number;
  tickets: Ticket[];
  attention: AttentionItem[];
  fetchedAt: string;
};

export async function loadDashboard(): Promise<DashboardData> {
  const sb = supabase();
  const [stationsRes, membersRes, subsRes, ticketsRes] = await Promise.all([
    sb.from("stations").select("id, name, status, organization_id").abortSignal(signal()),
    sb.from("station_members").select("user_id").eq("status", "active").abortSignal(signal()),
    sb.from("subscriptions").select("id, organization_id, status, trial_ends_at, plans(monthly_price, per_station)").abortSignal(signal()),
    sb.from("support_tickets").select("id, number, subject, priority, status, station_id, created_at").neq("status", "resolved").order("created_at", { ascending: false }).abortSignal(signal()),
  ]);
  const failed = [stationsRes, membersRes, subsRes, ticketsRes].find((r) => r.error);
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

  const tickets: Ticket[] = (ticketsRes.data ?? []).map((t) => ({
    id: t.id, number: t.number, subject: t.subject, priority: t.priority as TicketPriority, status: t.status as TicketStatus,
    stationName: t.station_id ? stationName.get(t.station_id as string) ?? null : null, createdAt: t.created_at ?? "",
  }));

  return {
    activeStations: stations.filter((s) => s.status === "active").length,
    totalStations: stations.length,
    totalUsers: new Set((membersRes.data ?? []).map((m) => m.user_id as string)).size,
    mrrCents: mrrCents(subsForMrr),
    openTickets: tickets.filter((t) => t.status === "open").length,
    urgentTickets: tickets.filter((t) => t.priority === "high").length,
    tickets: tickets.slice(0, 6),
    attention: attention.slice(0, 6),
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
