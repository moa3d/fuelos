// A2 «انضمام محطة جديدة». The platform admin creates the station and gets a one-time join link for the owner
// to share (WhatsApp/copy) — there is no self sign-up (owner decision, docs/briefs/06a). Everything goes
// through the onboard-station Edge Function (service role stays server-side).
import { OWNER_WEB_URL } from "./env";
import { supabase } from "./supabase";

export type PlanOption = { id: string; name: string };
export async function loadPlans(): Promise<PlanOption[]> {
  const { data, error } = await supabase().from("plans").select("id, name").order("monthly_price").abortSignal(AbortSignal.timeout(20_000));
  if (error) throw new Error(error.message);
  return (data ?? []) as PlanOption[];
}

export type Login = { tokenHash: string; type: "invite" };
export type CreateStationInput = {
  stationName: string; ownerName: string; ownerEmail: string; orgName: string | null;
  currency: string; city: string | null; planId: string | null; trialDays: number;
  lat: number | null; lng: number | null;
};
export type CreateStationResult =
  | { ok: true; organizationId: string; stationId: string; ownerUserId: string; login: Login | null }
  | { ok: false; message: string };

const LOCAL: Record<string, string> = {
  FUELOS_PERMISSION_DENIED: "إنشاء المحطات متاح لأدمن المنصة فقط",
  FUELOS_BAD_REQUEST: "تحقّق من الحقول المدخلة",
  FUELOS_NOT_FOUND: "لم نجد الباقة أو المالك المطلوب",
  FUELOS_ALREADY_ACTIVE: "المالك فعّل حسابه بالفعل — يستطيع استخدام «نسيت كلمة المرور»",
  FUELOS_INTERNAL: "تعذّر الإنشاء الآن — حاول بعد قليل",
};

async function errorCode(error: unknown): Promise<string> {
  try {
    const body = await (error as { context: Response }).context.json();
    return body?.error?.code ?? "FUELOS_INTERNAL";
  } catch {
    return "FUELOS_INTERNAL";
  }
}

export async function createStation(input: CreateStationInput): Promise<CreateStationResult> {
  const { data, error } = await supabase().functions.invoke("onboard-station", {
    body: {
      action: "create", station_name: input.stationName, owner_name: input.ownerName, owner_email: input.ownerEmail,
      org_name: input.orgName ?? undefined, currency: input.currency, city: input.city ?? undefined,
      plan_id: input.planId ?? undefined, trial_days: input.trialDays,
      lat: input.lat ?? undefined, lng: input.lng ?? undefined,
    },
  });
  if (error) {
    const code = await errorCode(error);
    return { ok: false, message: LOCAL[code] ?? LOCAL.FUELOS_INTERNAL };
  }
  return {
    ok: true, organizationId: data.organization_id, stationId: data.station_id, ownerUserId: data.owner_user_id,
    login: data.login ? { tokenHash: data.login.token_hash, type: "invite" } : null,
  };
}

export type FreshLinkResult = { ok: true; login: Login | null } | { ok: false; message: string };

export async function freshOwnerLink(stationId: string): Promise<FreshLinkResult> {
  const { data, error } = await supabase().functions.invoke("onboard-station", { body: { action: "link", station_id: stationId } });
  if (error) {
    const code = await errorCode(error);
    return { ok: false, message: LOCAL[code] ?? LOCAL.FUELOS_INTERNAL };
  }
  return { ok: true, login: data.login ? { tokenHash: data.login.token_hash, type: "invite" } : null };
}

export function joinLink(login: Login): string {
  return `${OWNER_WEB_URL}/welcome?token_hash=${encodeURIComponent(login.tokenHash)}&type=${login.type}`;
}

export function whatsappShareUrl(link: string, stationName: string): string {
  const text = `مرحباً، محطة «${stationName}» جاهزة على FuelOS. افتح الرابط واختر كلمة مرور لتبدأ:\n${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
