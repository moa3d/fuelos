"use client";
// A3 — الاشتراكات والباقات (design/screens/A3.png). Real plans/subscriptions data (plans_admin/subs_admin RLS:
// is_platform_staff() has full CRUD, no RPC needed for those). «تسجيل دفعة يدوية» goes through
// record_subscription_payment() — platform ADMIN only, support gets 42501 (docs/briefs/06a, done) — which
// appends a real subscription_payments row and activates the subscription until the new renewal date. The MRR
// trend reads mrr_snapshots and shows only the months that actually exist; no invented history.
import { formatDay, formatMoney, formatNumber } from "@fuelos/core";
import { AlertBanner, Button, Input, StatusBadge, TextArea } from "@fuelos/ui";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { subscriptionBadge } from "@/lib/dashboard-rules";
import { centsStr } from "@/lib/money";
import { featureChecklist } from "@/lib/subscriptions-rules";
import {
  cancelSubscription, changeSubscriptionPlan, isPlatformAdmin, loadMrrTrend, loadPaymentHistory, loadSubscriptions,
  recordPayment, PAYMENT_METHOD_LABEL, type MrrMonth, type Outcome, type Payment, type PaymentMethod,
  type PlanUsage, type SubscriptionRow, type SubscriptionsData,
} from "@/lib/subscriptions-data";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: SubscriptionsData };
type Filter = "all" | "attention";

export default function SubscriptionsPage() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [admin, setAdmin] = useState(false);
  const [trend, setTrend] = useState<MrrMonth[]>();
  const money = (c: bigint) => formatMoney(centsStr(c), "ل.س");

  useEffect(() => {
    loadSubscriptions().then((data) => setLoad({ status: "ready", data }), () => setLoad({ status: "error" }));
    isPlatformAdmin().then(setAdmin);
    loadMrrTrend().then(setTrend, () => setTrend([]));
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

          {trend && trend.length > 0 && <MrrTrendChart trend={trend} money={money} />}

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
                  <SubscriptionRowView key={s.id + s.stationId} row={s} plans={load.data.plans} admin={admin} onChanged={refresh} />
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

function MrrTrendChart({ trend, money }: { trend: MrrMonth[]; money: (c: bigint) => string }) {
  const max = trend.reduce((m, t) => (t.amountCents > m ? t.amountCents : m), 1n);
  return (
    <section className="rounded-lg bg-surface-card p-6 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-heading-h2-20">نمو الإيراد المتكرر</h2>
        <span className="text-body-small-12 text-text-secondary">من لقطات شهرية فعلية — لا تاريخ مُفترض قبل أول لقطة</span>
      </div>
      <div className="flex items-end justify-between gap-2" style={{ height: 140 }}>
        {trend.map((t, i) => (
          <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-body-small-12 text-text-secondary">{money(t.amountCents)}</span>
            <div className={`w-full rounded-t-sm ${i === trend.length - 1 ? "bg-brand-primary" : "bg-surface-muted"}`}
              style={{ height: Math.max(4, Number((t.amountCents * 90n) / max)) }} />
            <span className="text-body-small-12 text-text-muted">{monthArabic(t.month)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function monthArabic(isoMonth: string): string {
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "short" }).format(new Date(isoMonth));
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

function SubscriptionRowView({ row, plans, admin, onChanged }: { row: SubscriptionRow; plans: PlanUsage[]; admin: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [payOpen, setPayOpen] = useState(false);
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
                <button type="button" onClick={() => { setOpen(false); setPayOpen(true); }} className="rounded-sm px-2 py-1.5 text-start text-body-small-12 hover:bg-surface-muted">
                  تسجيل دفعة / سجل الدفعات
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
      {payOpen && <PaymentModal subscriptionId={row.id} stationName={row.stationName} admin={admin} onClose={() => setPayOpen(false)} onChanged={onChanged} />}
    </tr>
  );
}

function PaymentModal({ subscriptionId, stationName, admin, onClose, onChanged }: {
  subscriptionId: string; stationName: string; admin: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [history, setHistory] = useState<Payment[]>();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  useEffect(() => { loadPaymentHistory(subscriptionId).then(setHistory, () => setHistory([])); }, [subscriptionId]);

  async function submit() {
    setBusy(true); setMsg(undefined);
    const res = await recordPayment(subscriptionId, amount.trim(), method, note.trim() || null)
      .catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setMsg(res.message);
    setAmount(""); setNote("");
    loadPaymentHistory(subscriptionId).then(setHistory);
    onChanged();
  }

  // rendered via a portal: the trigger sits inside a <tr>, and a <tr> can't validly contain a bare <div> —
  // the fixed-position overlay doesn't care where in the DOM it lives, so it mounts on document.body instead.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="الدفعات">
      <div className="w-full max-w-md rounded-lg bg-surface-card p-6 shadow-raised">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-heading-h2-20">دفعات {stationName}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted">✕</button>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-heading-h3-16">السجل</h3>
          {history === undefined ? (
            <span className="block h-16 animate-pulse rounded-md bg-surface-muted" />
          ) : history.length === 0 ? (
            <p className="text-body-regular-14 text-text-secondary">لا دفعات مسجَّلة بعد.</p>
          ) : (
            <ul className="flex max-h-40 flex-col divide-y divide-border-default overflow-y-auto">
              {history.map((p) => (
                <li key={p.id} className="py-2 text-body-small-12">
                  <p className="text-body-strong-14">{formatMoney(centsStr(p.amountCents), "ل.س")} — {PAYMENT_METHOD_LABEL[p.method]}</p>
                  <p className="text-text-secondary">حتى {formatDay(p.renewsAt)} · {formatDay(p.createdAt)}{p.note ? ` · «${p.note}»` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-border-default pt-4">
          <h3 className="text-heading-h3-16">تسجيل دفعة جديدة</h3>
          {!admin && <AlertBanner tone="info" title="تسجيل الدفعات للمدير فقط">حسابك «دعم» ولا يملك هذه الصلاحية.</AlertBanner>}
          {msg && <AlertBanner tone="danger" title={msg} />}
          <Input label="المبلغ" dir="ltr" disabled={!admin} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} suffix="ل.س" />
          <div className="flex flex-col gap-1">
            <label className="text-label-12 text-text-secondary">طريقة الدفع</label>
            <select value={method} disabled={!admin} onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-large-16 disabled:opacity-50">
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
            </select>
          </div>
          <TextArea label="ملاحظة (اختياري)" disabled={!admin} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button variant="action" disabled={!admin || busy || !amount.trim()} onClick={submit}>{busy ? "جارٍ التسجيل…" : "تسجيل الدفعة"}</Button>
        </div>
      </div>
    </div>,
    document.body,
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
