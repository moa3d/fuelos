// On-device storage (IndexedDB via Dexie). See .claude/skills/fuelos-offline-sync.
import Dexie, { type EntityTable } from "dexie";

/** The device credential from issue_device_credential(). Never log it. */
export type DeviceCredential = { key: "current"; deviceId: string; deviceSecret: string; savedAt: string };

/** Who is signed in on this device (for display while offline). */
export type CurrentMember = { key: "current"; userId: string; displayName: string; stationId: string };

export type OutboxRpc = "open_shift" | "record_sale" | "submit_shift";

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
  createdAt: string;
  attempts: number;
  status: "pending" | "sent" | "failed_permanent" | "cancelled";
  nextAttemptAt?: string;          // backoff after a network/server failure
  lastError?: string;              // raw error text, for support (never shown to the user)
  lastErrorCode?: string;          // FUELOS_* code of a permanent failure
  lastErrorDetail?: Record<string, unknown>;
  sentAt?: string;
  cancelledAt?: string;            // only for an open_shift the server refused (nothing was created)
};

/** Pumps, nozzles and fuels of the station, cached for offline use. */
export type NozzleRef = { id: string; label: string; productName: string; lastReading: number };
export type PumpRef = { id: string; number: number; name: string | null; nozzles: NozzleRef[] };
export type StationRef = {
  stationId: string;
  stationName: string;
  currencyLabel: string;
  offlineMaxOps: number;
  pumps: PumpRef[];
  fetchedAt: string;
};

/** The attendant's open shift on this device (created locally, possibly not yet on the server). */
export type LocalShift = {
  userId: string;
  shiftId: string;
  stationId: string;
  pumpId: string;
  pumpNumber: number;
  openedAt: string;
  openingCash: string;             // money as a string of digits, never a float
  readings: { nozzleId: string; label: string; reading: number }[];
};

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
