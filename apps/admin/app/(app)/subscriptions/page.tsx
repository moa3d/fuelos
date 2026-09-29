"use client";
// A3 — الاشتراكات والباقات (design/screens/A3.png). Real plans/subscriptions data (plans_admin/subs_admin RLS:
// is_platform_staff() has full CRUD, no RPC needed). No payment-history ledger exists — only current state —
// so "تسجيل دفعة يدوية" marks the subscription active with a fresh renewal date rather than recording a
// payment row (docs/briefs/05b-cowork-subscription-payments.md).
import { formatDay, formatMoney, formatNumber } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge } from "@fuelos/ui";
import { useEffect, useState } from "react";
import { subscriptionBadge } from "@/lib/dashboard-rules";
import { centsStr } from "@/lib/money";
import { featureChecklist } from "@/lib/subscriptions-rules";
import {
  cancelSubscription, changeSubscriptionPlan, loadSubscriptions, markSubscriptionPaid,
  type Outcome, type PlanUsage, type SubscriptionRow, type SubscriptionsData,
} from "@/lib/subscriptions-data";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: SubscriptionsData };
type Filter = "all" | "attention";

export default function SubscriptionsPage() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const money = (c: bigint) => formatMoney(centsStr(c), "ل.س");

  useEffect(() => {
    loadSubscriptions().then((data) => setLoad({ status: "ready", data }), () => setLoad({ status: "error" }));
  }, [tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header>
        <h1 className="text-display-32">الاشتراكات والباقات</h1>
        <p className="text-body-regular-14 text-text-secondary">كل باقة مرتبطة بقيمة تجارية واضحة، لا بميزات تقنية فقط</p>
      </header>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر التحميل" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>} />
      )}

      {load.status === "ready" && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Kpi label="متأخرة الدفع" value={String(load.data.pastDueStations)} tone={load.data.pastDueStations > 0 ? "danger" : undefined} />
            <Kpi label="تجارب نشطة" value={String(load.data.activeTrials)} />
            <Kpi label="محطات مدفوعة" value={String(load.data.paidStations)} />
            <Kpi label="الإيراد الشهري المتكرر" value={money(load.data.mrrCents)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {load.data.plans.map((p) => <PlanCard key={p.id} plan={p} money={money} />)}
          </div>

          <section className="rounded-lg bg-surface-card shadow-card">
            <div className="flex items-center justify-between p-4">
              <h2 className="text-heading-h2-20">اشتراكات المحطات</h2>
              <div role="tablist" aria-label="عرض" className="flex gap-2">
                <FilterChip label="الكل" active={filter === "all"} onClick={() => setFilter("all")} />
                <FilterChip label={`تحتاج إجراء (${load.data.subscriptions.filter(needsAction).length})`} active={filter === "attention"} onClick={() => setFilter("attention")} />
              </div>
            </div>
            <table className="w-full text-body-regular-14">
              <thead>
                <tr className="border-b border-border-default text-body-small-12 text-text-secondary">
                  <th className="p-3 text-start font-normal">المحطة</th>
                  <th className="p-3 text-start font-normal">الخطة</th>
                  <th className="p-3 text-start font-normal">الحالة</th>
                  <th className="p-3 text-start font-normal">التجديد</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {load.data.subscriptions.filter((s) => filter === "all" || needsAction(s)).map((s) => (
                  <SubscriptionRowView key={s.id + s.stationId} row={s} plans={load.data.plans} onChanged={refresh} />
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function needsAction(s: SubscriptionRow): boolean {
  return s.status === "past_due" || (s.status === "trial" && !!s.trialEndsAt && Date.parse(s.trialEndsAt) - Date.now() < 3 * 86_400_000);
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-lg bg-surface-card p-5 shadow-card">
      <p className="text-body-small-12 text-text-secondary">{label}</p>
      <p className={`mt-1 text-number-l-24 ${tone === "danger" ? "text-status-danger-700" : ""}`}>{value}</p>
    </div>
  );
}

function PlanCard({ plan, money }: { plan: PlanUsage; money: (c: bigint) => string }) {
  const checklist = featureChecklist(plan.features);
  return (
    <div className="rounded-lg border border-border-default bg-surface-card p-5 shadow-card">
      <p className="text-heading-h3-16">{plan.name}</p>
      <p className="mt-2 text-number-l-24">{money(plan.monthlyPriceCents)} <span className="text-body-small-12 font-normal text-text-secondary">/ شهرياً{plan.perStation ? " لكل محطة" : ""}</span></p>
      <ul className="mt-4 flex flex-col gap-1.5 text-body-small-12">
        {checklist.map((f) => (
          <li key={f.key} className={f.included ? "text-text-primary" : "text-text-muted line-through"}>
            {f.included ? "✓" : "✕"} {f.label}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-body-small-12 text-text-secondary">{plan.stationCount} محطة · {formatNumber(plan.userCount, 0)} مستخدم</p>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={`h-9 rounded-full border px-4 text-body-strong-14 ${active ? "border-brand-primary bg-brand-primary text-white" : "border-border-default bg-surface-card text-text-secondary"}`}>
      {label}
    </button>
  );
}

function SubscriptionRowView({ row, plans, onChanged }: { row: SubscriptionRow; plans: PlanUsage[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const badge = subscriptionBadge(row.status);

  async function run(fn: () => Promise<Outcome>) {
    setBusy(true); setMsg(undefined);
    const res = await fn().catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (res.ok) { setOpen(false); onChanged(); return; }
    setMsg(res.message); setBusy(false);
  }

  return (
    <tr>
      <td className="p-3">{row.stationName}</td>
      <td className="p-3">{row.planName}</td>
      <td className="p-3"><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></td>
      <td className="p-3 text-text-secondary">{row.renewsAt ? formatDay(row.renewsAt) : row.trialEndsAt ? `تجربة حتى ${formatDay(row.trialEndsAt)}` : "—"}</td>
      <td className="p-3 text-end">
        <div className="relative inline-block">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label="خيارات" className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted">⋯</button>
          {open && (
            <div className="absolute end-0 z-10 mt-1 w-64 rounded-md border border-border-default bg-surface-card p-2 shadow-raised">
              {msg && <p className="mb-2 text-body-small-12 text-status-danger-700">{msg}</p>}
              <div className="flex flex-col gap-1">
                <button type="button" disabled={busy} onClick={() => run(() => markSubscriptionPaid(row.id))} className="rounded-sm px-2 py-1.5 text-start text-body-small-12 hover:bg-surface-muted">
                  تسجيل دفعة يدوية (تفعيل + تجديد شهر)
                </button>
                {plans.filter((p) => p.id !== row.planId).map((p) => (
                  <button key={p.id} type="button" disabled={busy} onClick={() => run(() => changeSubscriptionPlan(row.id, p.id))} className="rounded-sm px-2 py-1.5 text-start text-body-small-12 hover:bg-surface-muted">
                    تحويل إلى «{p.name}»
                  </button>
                ))}
                <button type="button" disabled={busy || row.status === "cancelled"} onClick={() => run(() => cancelSubscription(row.id))} className="rounded-sm px-2 py-1.5 text-start text-body-small-12 text-status-danger-700 hover:bg-surface-muted">
                  إلغاء الاشتراك
                </button>
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <span key={i} className="h-24 animate-pulse rounded-lg bg-surface-muted" />)}</div>
      <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <span key={i} className="h-56 animate-pulse rounded-lg bg-surface-muted" />)}</div>
    </div>
  );
}
