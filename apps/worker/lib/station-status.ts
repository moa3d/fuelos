// «حالة المحطة» (spec §2, docs/superpowers/specs/2026-11-11-station-live-status-design.md). Status
// writes are online-only (fuelos-offline-sync): never put an open/crowd press in the offline outbox —
// a crowd reading that reaches customers an hour late is worse than none, and the outbox exists for
// sales/shifts that must never be lost, not for this.
import { errorMessage, stationStatusView, type CrowdLevel, type StationStatusView } from "@fuelos/core";
import { supabase } from "./supabase.ts";

export type StatusPatch = { open?: boolean; crowd?: CrowdLevel };
export type StatusOutcome = { ok: true; view: StationStatusView } | { ok: false; message: string };

/** The RPC's "null means leave this field alone" shape, out of a partial patch. Pure — unit-tested. */
export function statusRpcArgs(stationId: string, patch: StatusPatch): { p_station: string; p_open: boolean | null; p_crowd: string | null } {
  return { p_station: stationId, p_open: patch.open ?? null, p_crowd: patch.crowd ?? null };
}

/**
 * Reads `station_live_status` raw (no server-side freshness filtering, unlike `public_stations()`)
 * plus a `shifts` existence check for `has_open_shift`, and applies the one shared freshness rule
 * (`stationStatusView`, `@fuelos/core`) so this screen judges the data exactly like the other apps do.
 */
export async function loadStationStatus(stationId: string): Promise<StationStatusView> {
  const [{ data: row, error: rowError }, { count, error: shiftError }] = await Promise.all([
    supabase()
      .from("station_live_status")
      .select("is_open, open_set_at, crowd, crowd_set_at")
      .eq("station_id", stationId)
      .abortSignal(AbortSignal.timeout(15_000))
      .maybeSingle(),
    supabase()
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("station_id", stationId)
      .eq("status", "open")
      .is("closed_at", null)
      .abortSignal(AbortSignal.timeout(15_000)),
  ]);
  if (rowError) throw new Error(rowError.message);
  if (shiftError) throw new Error(shiftError.message);
  return stationStatusView({
    is_open: row?.is_open ?? null,
    open_set_at: row?.open_set_at ?? null,
    crowd: (row?.crowd as CrowdLevel | null) ?? null,
    crowd_set_at: row?.crowd_set_at ?? null,
    has_open_shift: (count ?? 0) > 0,
  });
}

/**
 * Direct, non-outbox RPC call (mirrors `customer-lookup.ts`'s error-mapping shape exactly) — this must
 * never go through `newOutboxRow`/`syncNow`. On success the RPC already returns the post-write status
 * in `public_stations()`'s resolved shape (freshness already applied server-side), so it is mapped
 * straight into a `StationStatusView` rather than re-run through `stationStatusView`.
 */
export async function setStationStatus(stationId: string, patch: StatusPatch): Promise<StatusOutcome> {
  const { data, error } = await supabase()
    .rpc("set_station_status", statusRpcArgs(stationId, patch))
    .abortSignal(AbortSignal.timeout(15_000));
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
