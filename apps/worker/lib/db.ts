// On-device storage (IndexedDB via Dexie). See .claude/skills/fuelos-offline-sync.
import Dexie, { type EntityTable } from "dexie";

/** The device credential from issue_device_credential(). Never log it. */
export type DeviceCredential = { key: "current"; deviceId: string; deviceSecret: string; savedAt: string };

/** Who is signed in on this device (for display while offline). */
export type CurrentMember = { key: "current"; userId: string; displayName: string; stationId: string };

/** Offline outbox row — filled by later slices (S1/S2); rows are never deleted on failure. */
export type OutboxRow = {
  seq?: number;                    // auto-increment: FIFO order (never the device clock)
  id: string;                      // client UUID of the operation (unique)
  rpc: "open_shift" | "record_sale" | "submit_shift";
  params: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
  status: "pending" | "sent" | "failed_permanent";
};

class WorkerDb extends Dexie {
  device!: EntityTable<DeviceCredential, "key">;
  member!: EntityTable<CurrentMember, "key">;
  outbox!: EntityTable<OutboxRow, "seq">;

  constructor() {
    super("fuelos-worker");
    this.version(1).stores({
      device: "key",
      member: "key",
      outbox: "++seq, &id, status",
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
