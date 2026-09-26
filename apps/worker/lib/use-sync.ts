"use client";
import type { SyncState } from "@fuelos/ui";
import { liveQuery } from "dexie";
import { useEffect, useState, useSyncExternalStore } from "react";
import { db, type LocalShift, type OutboxRow } from "./db";
import { getEngineStatus, subscribeEngine } from "./outbox";
import { useOnline } from "./use-online";

export type OutboxSnapshot = {
  /** operations not yet accepted by the server */
  unsent: number;
  /** the row the queue stopped at, if any */
  failed?: OutboxRow;
  byId: Map<string, OutboxRow>;
};

const EMPTY: OutboxSnapshot = { unsent: 0, byId: new Map() };

/** Live view of one attendant's outbox (updates whenever IndexedDB changes). */
export function useOutbox(userId: string | undefined): OutboxSnapshot {
  const [snap, setSnap] = useState<OutboxSnapshot>(EMPTY);
  useEffect(() => {
    if (!userId) return;
    const sub = liveQuery(() => db.outbox.where("userId").equals(userId).sortBy("seq")).subscribe({
      next: (rows) => setSnap({
        unsent: rows.filter((r) => r.status === "pending" || r.status === "failed_permanent").length,
        failed: rows.find((r) => r.status === "failed_permanent"),
        byId: new Map(rows.map((r) => [r.id, r])),
      }),
      error: () => setSnap(EMPTY),
    });
    return () => sub.unsubscribe();
  }, [userId]);
  return snap;
}

/** State for the Sync Indicator: syncing while sending, otherwise online/offline. */
export function useSyncState(): { state: SyncState; needsSignIn: boolean } {
  const online = useOnline();
  const engine = useSyncExternalStore(subscribeEngine, getEngineStatus, getEngineStatus);
  return { state: engine.syncing ? "syncing" : online ? "online" : "offline", needsSignIn: engine.needsSignIn };
}

/** The attendant's shift on this device, live: it changes when the owner's decision is reconciled from the server. */
export function useLiveShift(userId: string | undefined): { shift: LocalShift | undefined; loaded: boolean } {
  const [state, setState] = useState<{ shift: LocalShift | undefined; loaded: boolean }>({ shift: undefined, loaded: false });
  useEffect(() => {
    if (!userId) return;
    const sub = liveQuery(() => db.shift.get(userId)).subscribe({
      next: (shift) => setState({ shift, loaded: true }),
      error: () => setState({ shift: undefined, loaded: true }),
    });
    return () => sub.unsubscribe();
  }, [userId]);
  return state;
}
