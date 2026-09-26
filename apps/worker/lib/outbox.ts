// Offline outbox: every write (open_shift, record_sale, submit_shift) is saved on the device first,
// then sent in FIFO order, one at a time, with the session of the attendant who created it.
// Rules: .claude/skills/fuelos-offline-sync. Never delete a row.
import { db, type OutboxRow, type OutboxRpc } from "./db";
import { backoffMs, classifyFailure, errorCodeOf, parseDetail } from "./outbox-policy";
import { supabase } from "./supabase";

const RPC_TIMEOUT_MS = 15_000;

/** Too many operations waiting: new sales are blocked until the device syncs. */
export class OutboxFullError extends Error {
  constructor(readonly limit: number) {
    super("outbox full");
  }
}

export function newOutboxRow(userId: string, rpc: OutboxRpc, id: string, params: Record<string, unknown>): OutboxRow {
  return { id, userId, rpc, params, createdAt: new Date().toISOString(), attempts: 0, status: "pending" };
}

/** Rows not yet accepted by the server (pending, or stopped on an error). */
export async function unsentCount(userId: string): Promise<number> {
  return db.outbox.where("userId").equals(userId)
    .filter((r) => r.status === "pending" || r.status === "failed_permanent").count();
}

/** Throws OutboxFullError at the station limit (stations.offline_max_ops). Call inside the write transaction. */
export async function assertRoom(userId: string, limit: number): Promise<void> {
  if ((await unsentCount(userId)) >= limit) throw new OutboxFullError(limit);
}

// ---------- engine status (for the Sync Indicator) ----------
export type EngineStatus = { syncing: boolean; needsSignIn: boolean };
let status: EngineStatus = { syncing: false, needsSignIn: false };
const listeners = new Set<() => void>();

export function getEngineStatus(): EngineStatus {
  return status;
}
export function subscribeEngine(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setStatus(patch: Partial<EngineStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

// ---------- sending ----------
let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleRetry(ms: number) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void syncNow(), ms);
}

/** Sends the signed-in attendant's pending rows. Safe to call often: only one run at a time. */
export function syncNow(): Promise<void> {
  running ??= run().finally(() => { running = null; });
  return running;
}

async function run(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const { data } = await supabase().auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;

  const rows = await db.outbox.where("userId").equals(userId).sortBy("seq");
  if (!rows.some((r) => r.status === "pending")) return;

  setStatus({ syncing: true });
  try {
    for (const row of rows) {
      if (row.status === "sent" || row.status === "cancelled") continue;
      if (row.status === "failed_permanent") return;            // the queue stops at this row
      const wait = row.nextAttemptAt ? Date.parse(row.nextAttemptAt) - Date.now() : 0;
      if (wait > 0) return scheduleRetry(wait);
      if (!(await send(row))) return;                           // later rows depend on this one
    }
    setStatus({ needsSignIn: false });
  } finally {
    setStatus({ syncing: false });
  }
}

/** Returns true when the row was accepted (or replayed) by the server. */
async function send(row: OutboxRow): Promise<boolean> {
  const key = row.seq!;
  let res;
  try {
    res = await supabase().rpc(row.rpc, row.params).abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
  } catch (e) {
    res = { error: { message: String(e), code: "", details: "", hint: "" }, status: 0 };  // treat as network
  }
  const { error, status: http } = res;

  if (!error) {
    await db.outbox.update(key, {
      status: "sent", sentAt: new Date().toISOString(),
      nextAttemptAt: undefined, lastError: undefined, lastErrorCode: undefined, lastErrorDetail: undefined,
    });
    return true;
  }

  const failure = { status: http, code: error.code, message: error.message, details: error.details };
  const attempts = row.attempts + 1;
  switch (classifyFailure(failure)) {
    case "permanent":
      await db.outbox.update(key, {
        status: "failed_permanent", attempts, lastError: error.message,
        lastErrorCode: errorCodeOf(failure), lastErrorDetail: parseDetail(error.details),
      });
      return false;
    case "auth":
      await db.outbox.update(key, { attempts, lastError: error.message });
      setStatus({ needsSignIn: true });
      return false;
    case "retry": {
      const delay = backoffMs(attempts);
      await db.outbox.update(key, {
        attempts, lastError: error.message, nextAttemptAt: new Date(Date.now() + delay).toISOString(),
      });
      scheduleRetry(delay);
      return false;
    }
  }
}

/**
 * The server refused to open the shift (e.g. pump busy), so nothing exists on the server.
 * The row is kept as a record but marked cancelled, and the local shift is cleared.
 */
export async function cancelRefusedOpenShift(userId: string, shiftId: string): Promise<void> {
  await db.transaction("rw", db.outbox, db.shift, async () => {
    const row = await db.outbox.where("id").equals(shiftId).first();
    if (!row || row.rpc !== "open_shift" || row.status !== "failed_permanent" || row.userId !== userId) {
      throw new Error("only a refused open_shift can be cancelled");
    }
    await db.outbox.update(row.seq!, { status: "cancelled", cancelledAt: new Date().toISOString() });
    await db.shift.delete(userId);
  });
}
