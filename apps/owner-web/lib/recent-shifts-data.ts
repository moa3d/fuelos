// O1 «آخر المناوبات»: every shift regardless of status, paginated — deliberately independent of the
// dashboard's own period filter (اليوم/أمس/...), which only ever shows one day or week at a time.
// liters/amount reuse the exact snapshot shift_summary() already wrote into the shift_close approval request
// at submit time (docs/briefs/02b) — never recomputed here, and only shown once a shift reaches that stage.
import { cents } from "./money.ts";
import { supabase } from "./supabase.ts";

const signal = () => AbortSignal.timeout(20_000);
export const RECENT_SHIFTS_PAGE_SIZE = 10;

export type RecentShift = {
  id: string;
  status: "open" | "submitted" | "approved" | "rejected" | "reopened";
  attendantName: string;
  openedAt: string;
  closedAt: string | null;
  litersL: number | null;
  amountCents: bigint | null;
  legs: { legId: string; pumpNumber: number }[];
};

export type RecentShiftsPage = { shifts: RecentShift[]; hasMore: boolean; fetchedAt: string };

export async function loadRecentShifts(stationId: string, offset: number): Promise<RecentShiftsPage> {
  const sb = supabase();
  const [shiftsRes, membersRes] = await Promise.all([
    sb.from("shifts")
      .select("id, status, attendant_id, opened_at, closed_at, shift_legs(id, pumps(number))")
      .eq("station_id", stationId)
      .order("opened_at", { ascending: false })
      .range(offset, offset + RECENT_SHIFTS_PAGE_SIZE) // one extra row, just to know whether there's a next page
      .abortSignal(signal()),
    sb.from("station_members").select("user_id, display_name").eq("station_id", stationId).abortSignal(signal()),
  ]);
  if (shiftsRes.error) throw new Error(shiftsRes.error.message);
  if (membersRes.error) throw new Error(membersRes.error.message);

  const nameOf = new Map((membersRes.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  type RawShift = {
    id: string; status: RecentShift["status"]; attendant_id: string; opened_at: string; closed_at: string | null;
    shift_legs: { id: string; pumps: { number: number } | null }[];
  };
  const rows = (shiftsRes.data ?? []) as unknown as RawShift[];
  const hasMore = rows.length > RECENT_SHIFTS_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, RECENT_SHIFTS_PAGE_SIZE) : rows;

  const closedIds = page.filter((s) => s.status === "submitted" || s.status === "approved").map((s) => s.id);
  const snapRes = closedIds.length === 0
    ? { data: [] as { ref_id: string; payload: Record<string, unknown> }[], error: null }
    : await sb.from("approval_requests").select("ref_id, payload").eq("type", "shift_close")
        .in("ref_id", closedIds).order("requested_at", { ascending: true }).abortSignal(signal());
  if (snapRes.error) throw new Error(snapRes.error.message);
  // ascending + Map's last-write-wins picks the shift's LATEST submission if it was ever reopened and resent
  const snapOf = new Map((snapRes.data ?? []).map((a) => [a.ref_id as string, a.payload as { liters?: number | string; meter_sales?: number | string }]));

  const shifts: RecentShift[] = page.map((s) => {
    const snap = snapOf.get(s.id);
    return {
      id: s.id, status: s.status, attendantName: nameOf.get(s.attendant_id) ?? "",
      openedAt: s.opened_at, closedAt: s.closed_at,
      litersL: snap ? Number(snap.liters ?? 0) : null,
      amountCents: snap ? cents(snap.meter_sales ?? 0) : null,
      legs: s.shift_legs.map((l) => ({ legId: l.id, pumpNumber: l.pumps?.number ?? 0 })),
    };
  });
  return { shifts, hasMore, fetchedAt: new Date().toISOString() };
}
