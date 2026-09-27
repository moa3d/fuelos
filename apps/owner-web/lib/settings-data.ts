// O11 «الإعدادات والمستخدمون» — users & permissions, tolerance limits. Owner-only writes (members_owner_write,
// station_owner_update RLS). «آخر دخول» isn't shown: auth.users isn't exposed to the client and no view reads it
// yet (docs/briefs/04c-cowork-settings.md). Inviting a brand-new user needs an Edge Function (creating the
// auth.users row needs the service role, which the app never holds — same brief) — this screen manages only
// members who already have an account.
import { errorMessage } from "@fuelos/core";
import type { MemberRole, MemberStatus } from "./settings-rules";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type MemberRow = { userId: string; name: string; role: MemberRole; status: MemberStatus };

export type Tolerances = {
  cashTolerance: string; stockToleranceL: string; maxShiftHours: number;
  defaultCreditLimit: string; offlineMaxOps: number;
};

export type SettingsData = { members: MemberRow[]; tolerances: Tolerances; fetchedAt: string };

export async function loadSettings(stationId: string): Promise<SettingsData> {
  const sb = supabase();
  const [membersRes, stationRes] = await Promise.all([
    sb.from("station_members").select("user_id, role, status, display_name").eq("station_id", stationId).order("display_name").abortSignal(signal()),
    sb.from("stations").select("cash_tolerance, stock_tolerance_l, max_shift_hours, default_credit_limit, offline_max_ops").eq("id", stationId).abortSignal(signal()).single(),
  ]);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (stationRes.error) throw new Error(stationRes.error.message);

  const roleOrder: Record<MemberRole, number> = { owner: 0, accountant: 1, shift_manager: 2, attendant: 3 };
  const members: MemberRow[] = (membersRes.data ?? [])
    .map((m) => ({ userId: m.user_id as string, name: m.display_name, role: m.role as MemberRole, status: m.status as MemberStatus }))
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.name.localeCompare(b.name, "ar"));

  const s = stationRes.data;
  return {
    members,
    tolerances: {
      cashTolerance: String(s.cash_tolerance), stockToleranceL: String(s.stock_tolerance_l),
      maxShiftHours: s.max_shift_hours, defaultCreditLimit: String(s.default_credit_limit), offlineMaxOps: s.offline_max_ops,
    },
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- writes ----------
export type Outcome = { ok: true } | { ok: false; message: string };
const LOCAL: Record<string, string> = {
  FUELOS_PERMISSION_DENIED: "إدارة المستخدمين والإعدادات متاحة لصاحب المحطة فقط",
  "42501": "إدارة المستخدمين والإعدادات متاحة لصاحب المحطة فقط",
  FUELOS_PIN_FORMAT: "الرمز يجب أن يكون 4 إلى 6 أرقام",
  FUELOS_NOT_FOUND: "لا يمكن تعيين رمز دخول لهذا الدور",
};
function messageOf(e: { message?: string; code?: string } | null): string {
  const code = e?.message?.startsWith("FUELOS_") ? e.message.trim() : e?.code === "42501" ? "FUELOS_PERMISSION_DENIED" : undefined;
  return (code && LOCAL[code]) || errorMessage(code);
}

export async function changeRole(stationId: string, userId: string, role: MemberRole): Promise<Outcome> {
  const { error } = await supabase().from("station_members").update({ role }).eq("station_id", stationId).eq("user_id", userId).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export async function setMemberStatus(stationId: string, userId: string, status: "active" | "suspended"): Promise<Outcome> {
  const { error } = await supabase().from("station_members").update({ status }).eq("station_id", stationId).eq("user_id", userId).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export async function setAttendantPin(stationId: string, userId: string, pin: string): Promise<Outcome> {
  const { error } = await supabase().rpc("set_member_pin", { p_station: stationId, p_user: userId, p_pin: pin }).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}

export async function updateTolerances(stationId: string, t: Tolerances): Promise<Outcome> {
  const { error } = await supabase().from("stations").update({
    cash_tolerance: t.cashTolerance, stock_tolerance_l: t.stockToleranceL,
    max_shift_hours: t.maxShiftHours, default_credit_limit: t.defaultCreditLimit, offline_max_ops: t.offlineMaxOps,
  }).eq("id", stationId).abortSignal(signal());
  return error ? { ok: false, message: messageOf(error) } : { ok: true };
}
