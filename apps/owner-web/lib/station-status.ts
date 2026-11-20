// «حالة المحطة» (spec §2, docs/superpowers/specs/2026-11-11-station-live-status-design.md) on the owner
// dashboard — same RPC and freshness rule as the worker/customer apps (packages/core's stationStatusView),
// plus who last touched it: station_live_status only stores the raw updated_by uuid, resolved to a name via
// station_members the same way apps/owner-web/lib/approvals.ts does. Status writes are online-only
// (fuelos-offline-sync): this app has no offline outbox at all, so setStationStatus() below is the plain,
// direct way to write here — never wrap it in anything outbox-like.
import { errorMessage, stationStatusView, type CrowdLevel, type StationStatusView } from "@fuelos/core";
import { supabase } from "./supabase.ts";

export type StatusPatch = { open?: boolean; crowd?: CrowdLevel };
export type StatusOutcome = { ok: true; view: StationStatusView } | { ok: false; message: string };
/** `StationStatusView` plus who last touched the row (`station_members.display_name`); null when unknown
 * (never set, or the member record is gone). */
export type OwnerStatusView = StationStatusView & { updatedByName: string | null };

const signal = () => AbortSignal.timeout(15_000);

/** The RPC's "null means leave this field alone" shape, out of a partial patch. Pure — unit-tested. */
export function statusRpcArgs(stationId: string, patch: StatusPatch): { p_station: string; p_open: boolean | null; p_crowd: string | null } {
  return { p_station: stationId, p_open: patch.open ?? null, p_crowd: patch.crowd ?? null };
}

/**
 * Reads `station_live_status` raw (no server-side freshness filtering, unlike `public_stations()`) plus a
 * `shifts` existence check for `has_open_shift` and the station's roster (to resolve `updated_by`'s name),
 * then applies the one shared freshness rule (`stationStatusView`, `@fuelos/core`) so this screen judges the
 * data exactly like the worker and customer apps do.
 */
export async function loadStationStatus(stationId: string): Promise<OwnerStatusView> {
  const sb = supabase();
  const [{ data: row, error: rowError }, { count, error: shiftError }, { data: members, error: memberError }] = await Promise.all([
    sb.from("station_live_status")
      .select("is_open, open_set_at, crowd, crowd_set_at, updated_by")
      .eq("station_id", stationId)
      .abortSignal(signal())
      .maybeSingle(),
    sb.from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("station_id", stationId)
      .eq("status", "open")
      .is("closed_at", null)
      .abortSignal(signal()),
    sb.from("station_members").select("user_id, display_name").eq("station_id", stationId).abortSignal(signal()),
  ]);
  if (rowError) throw new Error(rowError.message);
  if (shiftError) throw new Error(shiftError.message);
  if (memberError) throw new Error(memberError.message);

  const nameOf = new Map((members ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  const view = stationStatusView({
    is_open: row?.is_open ?? null,
    open_set_at: row?.open_set_at ?? null,
    crowd: (row?.crowd as CrowdLevel | null) ?? null,
    crowd_set_at: row?.crowd_set_at ?? null,
    has_open_shift: (count ?? 0) > 0,
  });
  return { ...view, updatedByName: row?.updated_by ? nameOf.get(row.updated_by) ?? null : null };
}

/**
 * Direct, non-outbox RPC call (mirrors the worker app's `station-status.ts` exactly) — this must never be
 * routed through any outbox-like mechanism; this app doesn't have one. On success the RPC already returns
 * the post-write status in `public_stations()`'s resolved shape (freshness already applied server-side), so
 * it is mapped straight into a `StationStatusView`. It does not return `updated_by`'s name — the caller
 * already knows who just wrote (the signed-in user), so the card fills `updatedByName` in locally instead
 * of round-tripping for it.
 */
export async function setStationStatus(stationId: string, patch: StatusPatch): Promise<StatusOutcome> {
  const { data, error } = await supabase()
    .rpc("set_station_status", statusRpcArgs(stationId, patch))
    .abortSignal(signal());
  if (error) {
    const code = error.message?.startsWith("FUELOS_") ? error.message.trim() : error.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
    return { ok: false, message: errorMessage(code) };
  }
  const r = data as {
    is_open: boolean | null; open_source: "manual" | "shift" | null; open_set_at: string | null;
    crowd: CrowdLevel | null; crowd_set_at: string | null;
  } | null;
  return {
    ok: true,
    view: {
      isOpen: r?.is_open ?? null,
      openSource: r?.open_source ?? null,
      openSetAt: r?.open_set_at ?? null,
      crowd: r?.crowd ?? null,
      crowdSetAt: r?.crowd_set_at ?? null,
      crowdStale: (r?.crowd ?? null) === null,
    },
  };
}
