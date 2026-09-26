"use client";
// O1 — لوحة القيادة (design/screens/O1.png). Most critical first: alerts, then KPIs, then detail.
// Amounts come from the server (shift_summary, tank_book_levels, approvals, ledger); see lib/dashboard.ts.
import { formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, StatusBadge, type BadgeTone } from "@fuelos/ui";
import { useEffect, useState } from "react";
import {
  cents, centsStr, loadDashboard, type Approval, type DashboardData, type Period, type ShiftRow, type TankRow,
} from "@/lib/dashboard";
import { useOffice } from "../office-context";
import { DailyChart } from "./daily-chart";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: DashboardData };

const PERIODS: [Period, string][] = [["today", "اليوم"], ["yesterday", "أمس"], ["week", "آخر 7 أيام"], ["month", "هذا الشهر"]];
const PERIOD_WORD: Record<Period, string> = { today: "اليوم", yesterday: "أمس", week: "آخر 7 أيام", month: "هذا الشهر" };

export default function DashboardPage() {
  const { current } = useOffice();
  const [period, setPeriod] = useState<Period>("today");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const canSeeFinance = current.role === "owner" || current.role === "accountant";

  useEffect(() => {
    let alive = true;
    loadDashboard(current.stationId, period).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [current.stationId, period, tick]);

  // refresh when the tab gets focus again
  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  const money = (v: string | number | bigint) => formatMoney(typeof v === "bigint" ? centsStr(v) : String(v), current.currencyLabel);

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">لوحة القيادة</h1>
          <p className="text-body-regular-14 text-text-secondary">
            {load.status === "ready" ? periodText(load.data.period) : "…"}
            {load.status === "ready" && ` · آخر تحديث ${formatTime(load.data.fetchedAt)} · من الخادم`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="الفترة" className="flex rounded-md border border-border-default bg-surface-card p-1">
            {PERIODS.map(([p, label]) => (
              <button key={p} role="tab" aria-selected={period === p}
                onClick={() => { if (p !== period) { setLoad({ status: "loading" }); setPeriod(p); } }}
                className={cx("h-9 rounded-sm px-4 text-body-strong-14", period === p ? "bg-brand-primary text-white" : "text-text-secondary")}>
                {label}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={refresh}>تحديث</Button>
        </div>
      </header>

      {load.status === "loading" && <DashboardSkeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل لوحة القيادة" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}

      {load.status === "ready" && (
        <>
          <Alerts data={load.data} money={money} />
          <Kpis data={load.data} money={money} canSeeFinance={canSeeFinance} period={period} />

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="rounded-lg bg-surface-card p-6 shadow-card lg:col-span-2">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-heading-h2-20">المبيعات اليومية</h2>
                <span className="text-body-small-12 text-text-secondary">باللتر · 15 يوماً حتى نهاية الفترة · من قراءات العدادات</span>
              </div>
              <DailyChart rows={load.data.daily} endDay={load.data.chartEndDay} />
            </section>
            <Tanks tanks={load.data.tanks} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <RecentOps approvals={load.data.approvals} money={money} />
            <Shifts shifts={load.data.shifts} total={load.data.shiftsCount} money={money} />
          </div>
        </>
      )}
    </div>
  );
}

/** One day: «الأحد 27 سبتمبر»; longer periods: «21 سبتمبر – 27 سبتمبر» (station time zone). */
function periodText(p: { from: string; to: string; timezone: string }): string {
  const last = new Date(Date.parse(p.to) - 1);
  const oneDay = Date.parse(p.to) - Date.parse(p.from) <= 25 * 3_600_000;
  const fmt = (d: Date, withWeekday: boolean) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    timeZone: p.timezone, day: "numeric", month: "long", ...(withWeekday ? { weekday: "long" } : {}),
  }).format(d).replace("،", "");
  return oneDay ? fmt(new Date(p.from), true) : `${fmt(new Date(p.from), false)} – ${fmt(last, false)}`;
}

// ---------- alerts: the riskiest first ----------
function Alerts({ data, money }: { data: DashboardData; money: (v: bigint) => string }) {
  const items: { tone: "danger" | "warning"; title: string; body: string; weight: number }[] = [];
  for (const a of data.approvals.filter((x) => x.status === "pending")) {
    if (a.type === "shift_close") {
      const diff = cents(a.payload.cash_diff as string | number | null);
      if (diff !== 0n) items.push({
        tone: "danger", weight: Number((diff < 0n ? -diff : diff) / 100n) + 1e9,
        title: `فرق صندوق ${money(diff)}`,
        body: `مناوبة ${a.requestedBy} · بانتظار اعتمادك`,
      });
    } else if (a.type === "credit_over_limit") {
      items.push({
        tone: "warning", weight: 5e8,
        title: "بيع آجل فوق الحد",
        body: `${String(a.payload.company ?? "")} · ${money(cents(a.payload.amount as string | number))} · بانتظار موافقتك`,
      });
    }
  }
  for (const t of data.tanks.filter((x) => x.bookPct < x.minPct)) {
    items.push({
      tone: "warning", weight: 1e8 - t.bookPct,
      title: `${t.product}: ${formatNumber(t.bookPct)}% من سعة ${t.name}`,
      body: `حسب المخزون الدفتري${t.lastDipAt ? ` · آخر قياس ${formatTime(t.lastDipAt)}` : ""} · اطلب توريداً`,
    });
  }
  if (items.length === 0) return null;
  const top = items.sort((a, b) => b.weight - a.weight).slice(0, 3);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {top.map((i) => (
        <AlertBanner key={i.title} tone={i.tone} title={i.title}>{i.body}</AlertBanner>
      ))}
    </div>
  );
}

// ---------- KPIs (all from dashboard_summary) ----------
function Kpis({ data, money, canSeeFinance, period }: {
  data: DashboardData; money: (v: string | number | bigint) => string; canSeeFinance: boolean; period: Period;
}) {
  const s = data.summary;
  const openFills = cents(s.recorded_open_fills);
  const finance = canSeeFinance && s.estimated_profit !== null;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Kpi title={`المبيعات · ${PERIOD_WORD[period]}`} value={money(s.meter_sales)}
        note={`${formatNumber(Math.round(Number(s.liters)))} لتر من العدادات${openFills > 0n ? ` · + ${money(openFills)} في ${s.recorded_open_fills_count} تعبئات على مضخات مفتوحة` : ""}`} />
      {finance ? (
        <Kpi title="الربح التقديري" badge={s.profit_complete ? undefined : <StatusBadge tone="info">تقديري</StatusBadge>}
          value={money(s.estimated_profit!)}
          note={s.profit_complete ? "كل المناوبات معتمدة وتكاليف التوريد مكتملة"
            : "يكتمل بعد اعتماد كل المناوبات وإدخال تكلفة كل توريد"} />
      ) : <LockedKpi title="الربح التقديري" />}
      <Kpi title="النقد المتوقع" value={money(s.expected_cash)}
        note={s.shifts_total === 0 ? "لا توجد مناوبات" : `${s.shifts_closed} من ${s.shifts_total} مناوبات مغلقة`} />
      {finance && s.receivables !== null ? (
        <Kpi title="الديون المستحقة" value={money(s.receivables)}
          note={s.overdue_companies ? `${s.overdue_companies} شركات متأخرة في السداد` : "لا توجد شركات متأخرة"}
          alert={(s.overdue_companies ?? 0) > 0} />
      ) : <LockedKpi title="الديون المستحقة" />}
    </div>
  );
}

function Kpi({ title, value, note, badge, alert }: { title: string; value: string; note: string; badge?: React.ReactNode; alert?: boolean }) {
  return (
    <section className={cx("flex flex-col gap-2 rounded-lg bg-surface-card p-5 shadow-card", alert && "ring-1 ring-status-danger")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-body-strong-14 text-text-secondary">{title}</h2>{badge}
      </div>
      <p className={cx("text-number-xl-32", alert && "text-status-danger-700")}>{value}</p>
      <p className="text-body-small-12 text-text-secondary">{note}</p>
    </section>
  );
}

/** Don't hide, explain: the shift manager sees the card and who can see it. */
function LockedKpi({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface-muted p-5">
      <h2 className="text-body-strong-14 text-text-secondary">{title}</h2>
      <p className="text-body-regular-14 text-text-secondary">متاح لصاحب المحطة والمحاسب فقط</p>
    </section>
  );
}

// ---------- tanks ----------
function Tanks({ tanks }: { tanks: TankRow[] }) {
  return (
    <section className="rounded-lg bg-surface-card p-6 shadow-card">
      <h2 className="mb-4 text-heading-h2-20">الخزانات</h2>
      {tanks.length === 0 ? (
        <p className="text-body-regular-14 text-text-secondary">لا توجد خزانات مفعّلة.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tanks.map((t) => {
            const low = t.bookPct < t.minPct;
            return (
              <li key={t.tankId} className="rounded-md border border-border-default p-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-body-strong-14">{t.product}</p>
                    <p className="text-body-small-12 text-text-secondary">{t.name} · سعة {formatNumber(t.capacityL)} لتر</p>
                  </div>
                  <p className={cx("text-number-m-18", low && "text-status-warning-700")}>{formatNumber(t.bookPct)}%</p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div className={cx("h-full rounded-full", low ? "bg-status-warning" : "bg-brand-primary")}
                    style={{ width: `${Math.max(0, Math.min(100, t.bookPct))}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-body-small-12 text-text-secondary">
                  <span>دفتري {formatNumber(Math.round(t.bookL))} لتر</span>
                  <span>{t.lastDipAt ? `آخر قياس ${formatTime(t.lastDipAt)}` : "لا يوجد قياس فعلي"}</span>
                </div>
                {low && <p className="mt-1 text-body-small-12 text-status-warning-700">⚠ أقل من الحد الأدنى ({formatNumber(t.minPct)}%)</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------- recent critical operations (approval requests) ----------
const APPROVAL_LABEL: Record<Approval["type"], string> = {
  shift_close: "إغلاق مناوبة", credit_over_limit: "بيع آجل فوق الحد", stock_adjustment: "تسوية مخزون", shift_reopen: "إعادة فتح مناوبة",
};
const APPROVAL_STATUS: Record<Approval["status"], [BadgeTone, string]> = {
  pending: ["warning", "بانتظار موافقة"], approved: ["success", "معتمدة"], rejected: ["danger", "مرفوضة"],
};

function RecentOps({ approvals, money }: { approvals: Approval[]; money: (v: bigint) => string }) {
  const rows = approvals.slice(0, 6);
  return (
    <section className="rounded-lg bg-surface-card p-6 shadow-card lg:col-span-2">
      <h2 className="mb-4 text-heading-h2-20">آخر العمليات الحرجة</h2>
      {rows.length === 0 ? (
        <p className="text-body-regular-14 text-text-secondary">لا توجد طلبات موافقة بعد.</p>
      ) : (
        <table className="w-full text-body-regular-14">
          <thead>
            <tr className="bg-surface-muted text-body-small-12 text-text-secondary">
              <th className="rounded-s-md p-3 text-start font-semibold">الوقت</th>
              <th className="p-3 text-start font-semibold">العملية</th>
              <th className="p-3 text-start font-semibold">المسؤول</th>
              <th className="p-3 text-end font-semibold">القيمة</th>
              <th className="rounded-e-md p-3 text-start font-semibold">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const value = a.type === "shift_close" ? cents(a.payload.cash_diff as string | number | null)
                : a.type === "credit_over_limit" ? cents(a.payload.amount as string | number) : null;
              const [tone, label] = APPROVAL_STATUS[a.status];
              return (
                <tr key={a.id} className="border-t border-border-default">
                  <td className="p-3 text-text-secondary">{formatTime(a.createdAt)}</td>
                  <td className="p-3 font-semibold">
                    {APPROVAL_LABEL[a.type]}{a.type === "credit_over_limit" && a.payload.company ? ` · ${String(a.payload.company)}` : ""}
                  </td>
                  <td className="p-3 text-text-secondary">{a.requestedBy}</td>
                  <td className={cx("p-3 text-end font-semibold", value !== null && value < 0n && "text-status-danger-700")}>
                    {value === null ? "—" : money(value)}
                  </td>
                  <td className="p-3"><StatusBadge tone={tone}>{label}</StatusBadge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------- shifts of the day ----------
const SHIFT_STATUS: Record<ShiftRow["status"], [BadgeTone, string]> = {
  open: ["info", "مفتوحة"], submitted: ["warning", "بانتظار الاعتماد"], approved: ["success", "معتمدة"],
  rejected: ["danger", "مرفوضة"], reopened: ["warning", "أعيد فتحها"],
};

function Shifts({ shifts, total, money }: { shifts: ShiftRow[]; total: number; money: (v: bigint) => string }) {
  const closed = shifts.filter((s) => s.status === "submitted" || s.status === "approved").length;
  return (
    <section className="rounded-lg bg-surface-card p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-heading-h2-20">المناوبات</h2>
        {shifts.length > 0 && <StatusBadge tone="success">{closed} مغلقة</StatusBadge>}
      </div>
      {shifts.length === 0 ? (
        <p className="text-body-regular-14 text-text-secondary">لا توجد مناوبات في هذا اليوم.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-default">
          {shifts.map((s) => {
            const [tone, label] = SHIFT_STATUS[s.status];
            const diff = s.cashDiff === null ? null : cents(s.cashDiff);
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 min-w-9 items-center justify-center rounded-md bg-surface-muted px-2 text-body-strong-14">
                  {s.pumps.join("·")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-strong-14">{s.attendantName}</p>
                  <p className="truncate text-body-small-12 text-text-secondary">
                    {s.products.join(" · ")} · {formatTime(s.opened_at)}{s.closed_at ? ` – ${formatTime(s.closed_at)}` : ""}
                    {diff !== null && diff !== 0n ? ` · فرق ${money(diff)}` : ""}
                  </p>
                </div>
                <StatusBadge tone={tone}>{label}</StatusBadge>
              </li>
            );
          })}
        </ul>
      )}
      {total > shifts.length && (
        <p className="mt-2 text-body-small-12 text-text-secondary">أحدث {shifts.length} من {total} مناوبة في هذه الفترة</p>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <span key={i} className="h-32 animate-pulse rounded-lg bg-surface-muted" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <span className="h-80 animate-pulse rounded-lg bg-surface-muted lg:col-span-2" />
        <span className="h-80 animate-pulse rounded-lg bg-surface-muted" />
      </div>
    </div>
  );
}
