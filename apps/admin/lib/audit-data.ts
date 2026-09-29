// A4 «الصلاحيات والسجلات والدعم». Platform-staff-only (audit_read/tickets_admin/flags_admin RLS: is_platform_staff()
// sees every station's audit_log/support_tickets, and has full CRUD on feature_flags — no RPC needed).
// The role reference panel is read-only: roles are fixed in RLS/RPCs across the schema, not configurable.
import type { RoleKey } from "./audit-rules";
import type { TicketPriority, TicketStatus } from "./dashboard-rules";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type AuditRow = { id: number; at: string; actorName: string; action: string; entity: string; stationName: string | null; reason: string | null };
export type RoleCount = { key: RoleKey; count: number };
export type Ticket = { id: string; number: number; subject: string; priority: TicketPriority; status: TicketStatus; stationName: string | null; assigneeId: string | null; createdAt: string };
export type FeatureFlag = { key: string; description: string | null; isUnstable: boolean; stationCount: number; enabledEverywhere: boolean };

export type AuditData = {
  roleCounts: RoleCount[]; activity: AuditRow[]; tickets: Ticket[]; flags: FeatureFlag[];
  stationIds: string[]; fetchedAt: string;
};

export async function loadAuditData(): Promise<AuditData> {
  const sb = supabase();
  const [membersRes, staffRes, activityRes, ticketsRes, flagsRes, stationsRes] = await Promise.all([
    sb.from("station_members").select("role").eq("status", "active").abortSignal(signal()),
    sb.from("platform_staff").select("role").abortSignal(signal()),
    sb.from("audit_log").select("id, at, actor_id, station_id, action, entity, entity_id, reason").order("at", { ascending: false }).limit(60).abortSignal(signal()),
    sb.from("support_tickets").select("id, number, subject, priority, status, station_id, assignee_id, created_at").neq("status", "resolved").order("created_at", { ascending: false }).abortSignal(signal()),
    sb.from("feature_flags").select("key, description, is_unstable, station_ids").abortSignal(signal()),
    sb.from("stations").select("id, name").abortSignal(signal()),
  ]);
  const failed = [membersRes, staffRes, activityRes, ticketsRes, flagsRes, stationsRes].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const stationName = new Map((stationsRes.data ?? []).map((s) => [s.id as string, s.name as string]));
  const actorIds = [...new Set((activityRes.data ?? []).map((a) => a.actor_id as string).filter(Boolean))];
  const actors = actorIds.length === 0 ? { data: [], error: null } :
    await sb.from("station_members").select("user_id, display_name").in("user_id", actorIds).abortSignal(signal());
  if (actors.error) throw new Error(actors.error.message);
  const actorName = new Map((actors.data ?? []).map((a) => [a.user_id as string, a.display_name as string]));

  const roleCounts = new Map<string, number>();
  for (const m of membersRes.data ?? []) roleCounts.set(m.role as string, (roleCounts.get(m.role as string) ?? 0) + 1);
  for (const s of staffRes.data ?? []) roleCounts.set(s.role as string, (roleCounts.get(s.role as string) ?? 0) + 1);

  return {
    roleCounts: [...roleCounts.entries()].map(([key, count]) => ({ key: key as RoleKey, count })),
    activity: (activityRes.data ?? []).map((a) => ({
      id: a.id, at: a.at, actorName: actorName.get(a.actor_id as string) ?? "النظام", action: a.action, entity: a.entity,
      stationName: a.station_id ? stationName.get(a.station_id as string) ?? null : null, reason: a.reason,
    })),
    tickets: (ticketsRes.data ?? []).map((t) => ({
      id: t.id, number: t.number, subject: t.subject, priority: t.priority as TicketPriority, status: t.status as TicketStatus,
      stationName: t.station_id ? stationName.get(t.station_id as string) ?? null : null, assigneeId: t.assignee_id, createdAt: t.created_at,
    })),
    flags: (flagsRes.data ?? []).map((f) => {
      const ids = (f.station_ids ?? []) as string[];
      return { key: f.key, description: f.description, isUnstable: f.is_unstable, stationCount: ids.length, enabledEverywhere: ids.length >= (stationsRes.data?.length ?? 0) && ids.length > 0 };
    }),
    stationIds: (stationsRes.data ?? []).map((s) => s.id as string),
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- writes ----------
export type Outcome = { ok: true } | { ok: false; message: string };

export async function claimTicket(ticketId: string, userId: string): Promise<Outcome> {
  const { error } = await supabase().from("support_tickets").update({ assignee_id: userId, status: "in_progress" }).eq("id", ticketId).abortSignal(signal());
  return error ? { ok: false, message: "تعذّر الإسناد — حاول مرة أخرى" } : { ok: true };
}

export async function resolveTicket(ticketId: string): Promise<Outcome> {
  const { error } = await supabase().from("support_tickets").update({ status: "resolved" }).eq("id", ticketId).abortSignal(signal());
  return error ? { ok: false, message: "تعذّر التحديث — حاول مرة أخرى" } : { ok: true };
}

export async function setTicketPriority(ticketId: string, priority: TicketPriority): Promise<Outcome> {
  const { error } = await supabase().from("support_tickets").update({ priority }).eq("id", ticketId).abortSignal(signal());
  return error ? { ok: false, message: "تعذّر التحديث — حاول مرة أخرى" } : { ok: true };
}

/** Toggles a flag on for every active station, or off entirely — a simplified all-or-nothing rollout (the
 * design's per-station targeting would need a station picker; not built for this first pass). */
export async function setFlagEverywhere(key: string, enabled: boolean, allStationIds: string[]): Promise<Outcome> {
  const { error } = await supabase().from("feature_flags").update({ station_ids: enabled ? allStationIds : [] }).eq("key", key).abortSignal(signal());
  return error ? { ok: false, message: "تعذّر التحديث — حاول مرة أخرى" } : { ok: true };
}
