// A3 «الاشتراكات والباقات». Platform-staff-only (plans_admin/subs_admin RLS: is_platform_staff() grants full
// CRUD, no RPC needed). There's no separate payment-history ledger for subscriptions — only current state
// (status, renews_at) is tracked, so "تسجيل دفعة يدوية" here means marking the subscription active with a
// fresh renewal date, not recording a payment row (docs/briefs/05b-cowork-subscription-payments.md).
import { mrrCents as computeMrr, type SubForMrr, type SubStatus } from "./dashboard-rules";
import { cents } from "./money";
import { supabase } from "./supabase";

const signal = () => AbortSignal.timeout(20_000);

export type PlanUsage = {
  id: string; code: string; name: string; monthlyPriceCents: bigint; perStation: boolean; features: string[];
  stationCount: number; userCount: number;
};
export type SubscriptionRow = {
  id: string; stationId: string; stationName: string; planId: string; planName: string;
  status: SubStatus; trialEndsAt: string | null; renewsAt: string | null;
};
export type SubscriptionsData = {
  plans: PlanUsage[]; subscriptions: SubscriptionRow[];
  pastDueStations: number; activeTrials: number; paidStations: number; mrrCents: bigint;
  fetchedAt: string;
};

export async function loadSubscriptions(): Promise<SubscriptionsData> {
  const sb = supabase();
  const [plansRes, subsRes, stationsRes, membersRes] = await Promise.all([
    sb.from("plans").select("id, code, name, monthly_price, per_station, features").order("monthly_price").abortSignal(signal()),
    sb.from("subscriptions").select("id, organization_id, plan_id, status, trial_ends_at, renews_at").abortSignal(signal()),
    sb.from("stations").select("id, name, organization_id").abortSignal(signal()),
    sb.from("station_members").select("station_id, user_id").eq("status", "active").abortSignal(signal()),
  ]);
  const failed = [plansRes, subsRes, stationsRes, membersRes].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const stations = stationsRes.data ?? [];
  const stationsByOrg = new Map<string, typeof stations>();
  for (const s of stations) {
    const arr = stationsByOrg.get(s.organization_id as string);
    if (arr) arr.push(s); else stationsByOrg.set(s.organization_id as string, [s]);
  }
  const usersByStation = new Map<string, Set<string>>();
  for (const m of membersRes.data ?? []) {
    const set = usersByStation.get(m.station_id as string);
    if (set) set.add(m.user_id as string); else usersByStation.set(m.station_id as string, new Set([m.user_id as string]));
  }

  // subscriptions expanded to one row per station they cover (today, 1 org almost always = 1 station; a
  // per_station "شبكة" plan's single subscription naturally covers every station in that organization)
  const subscriptions: SubscriptionRow[] = [];
  const planName = new Map((plansRes.data ?? []).map((p) => [p.id as string, p.name as string]));
  for (const s of subsRes.data ?? []) {
    for (const st of stationsByOrg.get(s.organization_id as string) ?? []) {
      subscriptions.push({
        id: s.id, stationId: st.id as string, stationName: st.name as string, planId: s.plan_id,
        planName: planName.get(s.plan_id as string) ?? "", status: s.status as SubStatus,
        trialEndsAt: s.trial_ends_at, renewsAt: s.renews_at,
      });
    }
  }

  const plans: PlanUsage[] = (plansRes.data ?? []).map((p) => {
    const rows = subscriptions.filter((s) => s.planId === p.id && (s.status === "active" || s.status === "trial"));
    const userCount = new Set(rows.flatMap((r) => [...(usersByStation.get(r.stationId) ?? [])])).size;
    return {
      id: p.id, code: p.code, name: p.name, monthlyPriceCents: cents(p.monthly_price), perStation: p.per_station,
      features: (p.features ?? []) as string[], stationCount: rows.length, userCount,
    };
  });

  const paidStations = subscriptions.filter((s) => s.status === "active").length;
  const pastDueStations = subscriptions.filter((s) => s.status === "past_due").length;
  const activeTrials = subsRes.data?.filter((s) => s.status === "trial").length ?? 0;

  const planOf = new Map((plansRes.data ?? []).map((p) => [p.id as string, p]));
  const subsForMrr: SubForMrr[] = (subsRes.data ?? []).map((s) => {
    const plan = planOf.get(s.plan_id as string);
    return {
      status: s.status as SubStatus, planMonthlyPriceCents: cents(plan?.monthly_price ?? "0"),
      perStation: !!plan?.per_station, stationCount: stationsByOrg.get(s.organization_id as string)?.length ?? 1,
    };
  });

  return {
    plans, subscriptions,
    pastDueStations, activeTrials, paidStations, mrrCents: computeMrr(subsForMrr),
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- writes (plans_admin/subs_admin RLS: platform_staff only) ----------
export type Outcome = { ok: true } | { ok: false; message: string };

/** No payment-history ledger exists — this just marks the subscription active with a fresh monthly renewal. */
export async function markSubscriptionPaid(subscriptionId: string): Promise<Outcome> {
  const renewsAt = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const { error } = await supabase().from("subscriptions").update({ status: "active", renews_at: renewsAt }).eq("id", subscriptionId).abortSignal(signal());
  return error ? { ok: false, message: "تعذّر التسجيل — حاول مرة أخرى" } : { ok: true };
}

export async function changeSubscriptionPlan(subscriptionId: string, planId: string): Promise<Outcome> {
  const { error } = await supabase().from("subscriptions").update({ plan_id: planId }).eq("id", subscriptionId).abortSignal(signal());
  return error ? { ok: false, message: "تعذّر تغيير الخطة — حاول مرة أخرى" } : { ok: true };
}

export async function cancelSubscription(subscriptionId: string): Promise<Outcome> {
  const { error } = await supabase().from("subscriptions").update({ status: "cancelled" }).eq("id", subscriptionId).abortSignal(signal());
  return error ? { ok: false, message: "تعذّر الإلغاء — حاول مرة أخرى" } : { ok: true };
}
