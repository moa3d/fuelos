// Pure rules for the offline outbox (no imports, so `node --test` can run them directly).
// See .claude/skills/fuelos-offline-sync → "Retry policy".

/** What the Supabase client returned for a failed RPC. `status` 0 = the request never completed. */
export type RpcFailure = { status: number; code?: string; message?: string; details?: string | null };

/**
 * retry     — network error, timeout or server error: keep the row pending and back off.
 * auth      — the session expired and could not refresh: keep pending, ask the attendant to sign in.
 * permanent — business rule (P0001) or permission (42501): stop the queue at this row, show the message.
 */
export type FailureKind = "retry" | "auth" | "permanent";

export function classifyFailure(f: RpcFailure): FailureKind {
  if (f.status === 0 || f.status === 408 || f.status === 429 || f.status >= 500) return "retry";
  if (f.status === 401 || f.code === "PGRST301" || f.code === "PGRST303") return "auth";
  return "permanent";
}

/** 2 s, 4 s, 8 s … capped at 5 minutes. `attempts` counts the failures so far (1 = first failure). */
export function backoffMs(attempts: number): number {
  return Math.min(2_000 * 2 ** Math.max(0, attempts - 1), 300_000);
}

/** The FUELOS_* code of a failure (RPCs put it in the message), for the Arabic error map. */
export function errorCodeOf(f: RpcFailure): string {
  if (f.message?.startsWith("FUELOS_")) return f.message.trim();
  if (f.code === "42501") return "FUELOS_PERMISSION_DENIED";
  return f.code || "UNKNOWN";
}

/** RPC `detail` is either a JSON object (e.g. FUELOS_CREDIT_LIMIT) or plain text. */
export function parseDetail(details: string | null | undefined): Record<string, unknown> | undefined {
  if (!details) return undefined;
  try {
    const v: unknown = JSON.parse(details);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // plain text
  }
  return { detail: details };
}
