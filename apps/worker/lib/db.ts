// On-device storage (IndexedDB via Dexie). See .claude/skills/fuelos-offline-sync.
import Dexie, { type EntityTable } from "dexie";

/** The device credential from issue_device_credential(). Never log it. */
export type DeviceCredential = { key: "current"; deviceId: string; deviceSecret: string; savedAt: string };

/** Who is signed in on this device (for display while offline). */
export type CurrentMember = { key: "current"; userId: string; displayName: string; stationId: string };

export type OutboxRpc = "open_shift" | "switch_pump" | "record_sale" | "submit_shift";

/**
 * Offline outbox row. Rows are NEVER deleted: they are the proof of the operation.
 * A row belongs to the attendant who created it and is only sent with that attendant's session.
 */
export type OutboxRow = {
  seq?: number;                    // auto-increment: FIFO order (never the device clock)
  id: string;                      // client UUID of the operation (unique; the RPC is idempotent on it)
  userId: string;                  // attendant who created it
  rpc: OutboxRpc;
  params: Record<string, unknown>;
  meta?: Record<string, string>;    // device-only details for the screens (never sent: the RPC rejects unknown args)
  createdAt: string;
  attempts: number;
  status: "pending" | "sent" | "failed_permanent" | "cancelled";
  nextAttemptAt?: string;          // backoff after a network/server failure
  lastError?: string;              // raw error text, for support (never shown to the user)
  lastErrorCode?: string;          // FUELOS_* code of a permanent failure
  lastErrorDetail?: Record<string, unknown>;
  sentAt?: string;
  result?: Record<string, unknown>;  // the server's answer (e.g. record_sale: amount, unit_price) — authoritative
  cancelledAt?: string;            // a refused row the attendant redid (nothing changed on the server)
};

/** The pump board (pump_board RPC) and station settings, cached for offline use. */
export type NozzleRef = { id: string; label: string; productId: string; productName: string; lastReading: number };
export type PumpRef = {
  id: string; number: number; name: string | null;
  heldBy: string | null;           // display name of the attendant on it now (at fetch time)
  heldByMe: boolean;
  nozzles: NozzleRef[];
};
export type PriceRef = { productId: string; price: string; effectiveAt: string };
export type StationRef = {
  stationId: string;
  stationName: string;
  currencyLabel: string;
  offlineMaxOps: number;
  cashTolerance: string;           // money as a string (numeric), never a float
  maxShiftHours: number;
  pumps: PumpRef[];
  prices: PriceRef[];              // for the local «تقديري» preview only
  fetchedAt: string;
};

/** Readings of one nozzle on one leg. Liters with one decimal (numeric(14,1)). */
export type LegReading = { nozzleId: string; label: string; productId: string; opening: number; closing?: number };

/** «فترة على مضخة»: the part of the shift spent on one pump. */
export type LocalLeg = {
  legId: string;
  pumpId: string;
  pumpNumber: number;
  startedAt: string;
  endedAt?: string;
  gapNote?: string;
  readings: LegReading[];
};

/** The attendant's shift on this device (created locally, possibly not yet on the server). */
export type LocalShift = {
  userId: string;
  shiftId: string;
  stationId: string;
  openedAt: string;
  openingCash: string;             // money as a string of digits, never a float
  legs: LocalLeg[];                // in order; the last one without endedAt is the current pump
  /** open = working; submitted = waiting for the owner; approved / rejected = the owner's decision (from the server) */
  status: "open" | "submitted" | "approved" | "rejected";
  countedCash?: string;
  diffReason?: string;
  submittedAt?: string;
  /** the owner's note on an approval or rejection */
  decisionNote?: string;
  /** the owner returned the close for correction: shown on the shift screen until the next submit */
  returnedNote?: string;
};

export function currentLeg(shift: LocalShift): LocalLeg | undefined {
  const last = shift.legs.at(-1);
  return last && !last.endedAt ? last : undefined;
}

class WorkerDb extends Dexie {
  device!: EntityTable<DeviceCredential, "key">;
  member!: EntityTable<CurrentMember, "key">;
  outbox!: EntityTable<OutboxRow, "seq">;
  reference!: EntityTable<StationRef, "stationId">;
  shift!: EntityTable<LocalShift, "userId">;

  constructor() {
    super("fuelos-worker");
    this.version(1).stores({
      device: "key",
      member: "key",
      outbox: "++seq, &id, status",
    });
    this.version(2).stores({
      outbox: "++seq, &id, status, userId",
      reference: "stationId",
      shift: "userId",
    });
    // v3: shifts are split into pump legs. Old cached shapes are dropped (dev data only; the outbox is kept).
    this.version(3).stores({}).upgrade(async (tx) => {
      await tx.table("reference").clear();
      await tx.table("shift").clear();
      // open_shift rows in the pre-legs format can never be accepted by the new RPC: keep them, cancelled.
      await tx.table("outbox").toCollection()
        .filter((r: OutboxRow) => r.rpc === "open_shift" && r.status !== "sent" && !("p_leg_id" in r.params))
        .modify({ status: "cancelled", cancelledAt: new Date().toISOString(), lastError: "pre-legs format" });
    });
  }
}

export const db = new WorkerDb();

export async function getDevice(): Promise<DeviceCredential | undefined> {
  return db.device.get("current");
}

/** Throws if IndexedDB is unavailable (e.g. blocked storage); callers show the error state. */
export async function saveDevice(deviceId: string, deviceSecret: string): Promise<void> {
  await db.device.put({ key: "current", deviceId, deviceSecret, savedAt: new Date().toISOString() });
  await requestPersistentStorage();
}

/** Ask the browser not to evict our data (outbox = proof of sales). Called on every app start. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (!(await navigator.storage?.persisted?.())) await navigator.storage?.persist?.();
  } catch {
    // not supported — nothing to do
  }
}
