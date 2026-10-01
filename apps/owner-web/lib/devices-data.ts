// O11 «الأجهزة» (docs/briefs/07a/07b): station_devices() exposes a derived credential status without ever
// reading device_credentials.secret_hash. issue_device_credential()/revoke_device() do the actual writes —
// both already existed for the worker app's own /setup screen; this is the office-side front door for them.
import { errorMessage } from "@fuelos/core";
import type { CredentialStatus } from "./device-rules.ts";
import { supabase } from "./supabase.ts";

const signal = () => AbortSignal.timeout(20_000);

export type DeviceRow = {
  deviceId: string; label: string | null; lastSyncAt: string | null; pendingOps: number; createdAt: string;
  credentialStatus: CredentialStatus; credentialIssuedAt: string | null; credentialRevokedAt: string | null;
};

export async function loadDevices(stationId: string): Promise<DeviceRow[]> {
  const { data, error } = await supabase().rpc("station_devices", { p_station: stationId }).abortSignal(signal());
  if (error) throw new Error(error.message);
  type Raw = {
    device_id: string; label: string | null; last_sync_at: string | null; pending_ops: number; created_at: string;
    credential_status: CredentialStatus; credential_issued_at: string | null; credential_revoked_at: string | null;
  };
  return ((data ?? []) as Raw[]).map((d) => ({
    deviceId: d.device_id, label: d.label, lastSyncAt: d.last_sync_at, pendingOps: d.pending_ops, createdAt: d.created_at,
    credentialStatus: d.credential_status, credentialIssuedAt: d.credential_issued_at, credentialRevokedAt: d.credential_revoked_at,
  }));
}

const LOCAL: Record<string, string> = {
  FUELOS_PERMISSION_DENIED: "إدارة الأجهزة متاحة لصاحب المحطة أو مدير المناوبة فقط",
  FUELOS_REQUIRED: "أدخل معرّف الجهاز",
  FUELOS_ID_CONFLICT: "هذا المعرّف مستخدم بجهاز آخر — حاول مرة أخرى",
  FUELOS_REASON_REQUIRED: "اكتب سبب الإبطال",
  FUELOS_NOT_FOUND: "لم نجد هذا الجهاز — ربما أُبطل من مكان آخر. حدّث الصفحة",
};
function messageOf(e: { message?: string; code?: string } | null): string {
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  return (code && LOCAL[code]) || errorMessage(code);
}

export type RegisterResult = { ok: true; secret: string } | { ok: false; message: string };

/** The same RPC rotates an existing device's secret when `deviceId` already belongs to this station (and
 * un-revokes it) — so this one function serves both «تسجيل جهاز» and «إعادة إصدار الرمز». */
export async function issueCredential(stationId: string, deviceId: string, label?: string): Promise<RegisterResult> {
  const { data, error } = await supabase()
    .rpc("issue_device_credential", { p_station: stationId, p_device_id: deviceId, p_label: label ?? null })
    .abortSignal(signal());
  if (error) return { ok: false, message: messageOf(error) };
  return { ok: true, secret: data as string };
}

export type Outcome = { ok: true } | { ok: false; message: string };

export async function revokeDevice(deviceId: string, reason: string): Promise<Outcome> {
  const { error } = await supabase().rpc("revoke_device", { p_device_id: deviceId, p_reason: reason }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}
