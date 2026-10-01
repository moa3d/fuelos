// O11 «الأجهزة» (docs/briefs/07a/07b): pure helpers. No imports, so `node --test` runs it directly.

export type CredentialStatus = "active" | "revoked" | "none";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function credentialBadge(status: CredentialStatus): { tone: Tone; label: string } {
  switch (status) {
    case "active": return { tone: "success", label: "فعّال" };
    case "revoked": return { tone: "danger", label: "مُبطَل" };
    case "none": return { tone: "neutral", label: "غير مفعّل" };
  }
}

/** «لم يتزامن منذ 3 أيام»: the same 3-day staleness rule the admin app uses (dashboard-rules.ts). Null (never
 * synced) isn't stale on its own — a freshly-registered device just hasn't connected yet. */
export function syncStale(lastSyncAt: string | null, nowMs: number, thresholdDays = 3): boolean {
  if (!lastSyncAt) return false;
  return nowMs - Date.parse(lastSyncAt) > thresholdDays * 86_400_000;
}

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A short, readable device id for the owner to relay by hand — e.g. "dev-k3f9qz". Not cryptographic; the
 * secret (issue_device_credential's real return value) is what actually has to stay confidential. */
export function generateDeviceId(random: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ID_CHARS[Math.floor(random() * ID_CHARS.length)];
  return `dev-${s}`;
}
