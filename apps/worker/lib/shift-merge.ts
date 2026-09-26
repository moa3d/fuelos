// Reconciling the shift on the device with the server (brief 02b item 5). Pure, so `node --test` runs it.
// When the outbox has nothing unsent for the shift, the server is authoritative: the owner may have returned
// the close («إعادة للعامل للتصحيح» = reject + reopen), approved it, or rejected it.
import type { LocalLeg, LocalShift } from "./db";

export type ServerStatus = "open" | "submitted" | "approved" | "rejected" | "reopened";

export type ServerShift = {
  status: ServerStatus;
  decisionNote: string | null;
  countedCash: string | null;
  diffReason: string | null;
  /** legs in order, already mapped to the device's shape */
  legs: LocalLeg[];
};

export function localStatusOf(s: ServerStatus): LocalShift["status"] {
  return s === "reopened" ? "open" : s;
}

/** Where the attendant belongs: a working shift → the fill screen; a closed one → the closing screen. */
export function routeFor(shift: { status: LocalShift["status"] }): "/shift" | "/shift/done" {
  return shift.status === "open" ? "/shift" : "/shift/done";
}

export function mergeServerShift(local: LocalShift, server: ServerShift): { shift: LocalShift; changed: boolean } {
  const next = localStatusOf(server.status);
  const note = server.decisionNote ?? undefined;

  if (local.status === "open") {
    // still open on the server: the device's own legs are newer than anything the server could add
    if (next === "open") return { shift: local, changed: false };
    // closed on the server while this device thought it open (e.g. submitted on the attendant's behalf)
    return {
      shift: {
        ...local, status: next, decisionNote: note, countedCash: server.countedCash ?? local.countedCash,
        legs: server.legs.length > 0 ? server.legs : local.legs,
      },
      changed: true,
    };
  }

  if (next === "open") {
    // the owner returned the close: the last leg is open again and its closing readings were cleared
    const { countedCash: _c, diffReason: _d, submittedAt: _s, decisionNote: _n, ...rest } = local;
    void _c; void _d; void _s; void _n;
    return {
      shift: { ...rest, status: "open", legs: server.legs.length > 0 ? server.legs : local.legs, returnedNote: note },
      changed: true,
    };
  }

  if (next === local.status && note === local.decisionNote) return { shift: local, changed: false };
  return { shift: { ...local, status: next, decisionNote: note }, changed: true };
}
