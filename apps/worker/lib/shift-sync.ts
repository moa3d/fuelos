// Keeps the device's shift in step with the server while nothing of it waits in the outbox:
// the owner's decision on the close (approved, rejected, or returned for correction) reaches the attendant.
import { db, type LocalShift } from "./db";
import { loadServerShift } from "./reference";
import { mergeServerShift } from "./shift-merge";
import { supabase } from "./supabase";

/** Rows of this shift not yet accepted by the server: the device is ahead of the server, never overwrite it. */
async function hasUnsent(userId: string, shiftId: string): Promise<boolean> {
  const n = await db.outbox.where("userId").equals(userId)
    .filter((r) => (r.params.p_shift_id ?? r.params.p_shift) === shiftId && (r.status === "pending" || r.status === "failed_permanent"))
    .count();
  return n > 0;
}

/** Safe to call often; does nothing offline, with no shift, or while the outbox still holds rows for it. */
export async function reconcileShift(): Promise<LocalShift | undefined> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return undefined;
  const { data } = await supabase().auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return undefined;
  const local = await db.shift.get(userId);
  if (!local || (await hasUnsent(userId, local.shiftId))) return undefined;
  const ref = await db.reference.get(local.stationId);
  if (!ref) return undefined;

  const server = await loadServerShift(local.shiftId, ref);
  if (!server) return undefined;
  const { shift, changed } = mergeServerShift(local, server);
  if (!changed) return undefined;

  // the attendant may have acted while we were asking: apply only if nothing moved on the device
  return db.transaction("rw", db.shift, db.outbox, async () => {
    const cur = await db.shift.get(userId);
    if (!cur || cur.shiftId !== local.shiftId || cur.status !== local.status || cur.legs.length !== local.legs.length) return undefined;
    if (await hasUnsent(userId, local.shiftId)) return undefined;
    await db.shift.put(shift);
    return shift;
  });
}
