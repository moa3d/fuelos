// «تذاكر الدعم» — every ticket ever opened, not just A4's open/in-progress panel (tickets_admin RLS:
// is_platform_staff() sees and manages all of them; claim/resolve/priority reuse the same writes as A4 so
// there's one place that changes a ticket, not two).
import type { TicketPriority } from "./dashboard-rules";
import type { TicketStatus } from "./support-rules";
import { supabase } from "./supabase";

export { claimTicket, resolveTicket, setTicketPriority, type Outcome } from "./audit-data";

const signal = () => AbortSignal.timeout(20_000);

export type TicketFull = {
  id: string; number: number; subject: string; priority: TicketPriority; status: TicketStatus;
  stationName: string | null; assigneeId: string | null; assigneeName: string | null;
  openedByName: string | null; slaDueAt: string | null; createdAt: string;
};

export async function loadTickets(): Promise<TicketFull[]> {
  const sb = supabase();
  const [ticketsRes, stationsRes] = await Promise.all([
    sb.from("support_tickets").select("id, number, subject, priority, status, station_id, assignee_id, opened_by, sla_due_at, created_at")
      .order("created_at", { ascending: false }).abortSignal(signal()),
    sb.from("stations").select("id, name").abortSignal(signal()),
  ]);
  if (ticketsRes.error) throw new Error(ticketsRes.error.message);
  if (stationsRes.error) throw new Error(stationsRes.error.message);

  const stationName = new Map((stationsRes.data ?? []).map((s) => [s.id as string, s.name as string]));
  const userIds = [...new Set((ticketsRes.data ?? []).flatMap((t) => [t.assignee_id, t.opened_by]).filter(Boolean) as string[])];
  const membersRes = userIds.length === 0 ? { data: [], error: null } :
    await sb.from("station_members").select("user_id, display_name").in("user_id", userIds).abortSignal(signal());
  if (membersRes.error) throw new Error(membersRes.error.message);
  const displayName = new Map((membersRes.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));

  return (ticketsRes.data ?? []).map((t) => ({
    id: t.id, number: t.number, subject: t.subject, priority: t.priority as TicketPriority, status: t.status as TicketStatus,
    stationName: t.station_id ? stationName.get(t.station_id as string) ?? null : null,
    assigneeId: t.assignee_id, assigneeName: t.assignee_id ? displayName.get(t.assignee_id as string) ?? "أدمن" : null,
    openedByName: t.opened_by ? displayName.get(t.opened_by as string) ?? "غير معروف" : null,
    slaDueAt: t.sla_due_at, createdAt: t.created_at,
  }));
}
