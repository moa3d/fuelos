"use client";
// O6 — التقارير والتحليلات (design/screens/O6.png). Owner/accountant only. Every card is one question an
// answer, built from the same posted ledger the other screens post to — see lib/reports-data.ts. «تصدير» is a
// browser-only CSV download; «مشاركة مع المحاسب» has no send-mail capability yet (docs/briefs/04a).
import { formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, StatusBadge } from "@fuelos/ui";
import type { Period } from "@/lib/dashboard";
import { useEffect, useState } from "react";
import { limitBadge, litersSharePercent, marginPercent, percentChange, wasteSharePercent, type Tone } from "@/lib/report-rules";
import { loadReports, pnlCsv, type ReportsData } from "@/lib/reports-data";
import { centsStr } from "@/lib/money";
import { useOffice } from "../office-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: ReportsData };
type CardKey = "pnl" | "products" | "cash" | "debts" | "inventory";

const PERIODS: [Period, string][] = [["today", "اليوم"], ["yesterday", "أمس"], ["week", "هذا الأسبوع"], ["month", "هذا الشهر"]];

export default function ReportsPage() {
  const { current } = useOffice();
  const canAccess = current.role === "owner" || current.role === "accountant";
  const money = (c: bigint) => formatMoney(centsStr(c), current.currencyLabel);

  const [period, setPeriod] = useState<Period>("month");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<CardKey>("pnl");

  useEffect(() => {
    if (!canAccess) return;
    let alive = true;
    loadReports(current.stationId, period).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [current.stationId, canAccess, period, tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  if (!canAccess) {
    return (
      <div className="mx-auto max-w-2xl">
        <AlertBanner tone="info" title="التقارير والتحليلات متاحة لصاحب المحطة والمحاسب فقط">
          هذا القسم يجمع أرقام المحطة المالية في مكان واحد.
        </AlertBanner>
      </div>
    );
  }

  const data = load.status === "ready" ? load.data : undefined;
  // the station's own time zone, not the browser's — a period start at local midnight can fall on the
  // previous UTC calendar day (e.g. Damascus is UTC+3), which would otherwise misname the month.
  const compareMonth = data
    ? new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", timeZone: data.period.timezone }).format(new Date(data.compare.from))
    : "";

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">التقارير والتحليلات</h1>
          <p className="text-body-regular-14 text-text-secondary">
            مكتبة تقارير بفئات واضحة — كل تقرير يجيب على سؤال إداري{data ? ` · آخر تحديث ${formatTime(data.fetchedAt)} · من الخادم` : ""}
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

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل التقارير" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}

      {data && (
        <>
          <p className="text-body-small-12 text-text-secondary">مقارنة بالفترة نفسها من {compareMonth}</p>

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <ReportCard icon="↗" pinned title="الربح والخسارة" question="«هل ربحت هذا الشهر بعد المصاريف؟»"
              value={money(data.pnl.netProfitCents)}
              hint={`صافي ${data.profitComplete ? "" : "تقديري "}· هامش ${marginPercent(data.pnl.netProfitCents, data.pnl.revenueCents + data.pnl.otherRevenueCents) ?? 0}%`}
              active={open === "pnl"} onOpen={() => setOpen("pnl")} />
            <ReportCard icon="⛽" title="المبيعات حسب الوقود والمضخة" question="«أي وقود وأي مضخة تبيع أكثر؟»"
              value={`${formatNumber(data.totalLiters, 0)} لتر`}
              hint={data.byProduct[0] ? `${data.byProduct[0].product} = ${litersSharePercent(data.byProduct[0].liters, data.totalLiters)}% من الكمية` : "لا مبيعات بعد"}
              active={open === "products"} onOpen={() => setOpen("products")} />
            <ReportCard icon="💵" title="فروقات الصندوق" question="«من لديه فروقات متكررة؟»"
              value={money(data.cashDiff.netCents < 0n ? -data.cashDiff.netCents : data.cashDiff.netCents)}
              hint={`${data.cashDiff.count} ${data.cashDiff.count === 1 ? "فرق" : "فروقات"}`}
              badge={limitBadge(data.cashDiff.count > 0)}
              active={open === "cash"} onOpen={() => setOpen("cash")} />
            <ReportCard icon="👥" title="أعمار الديون" question="«من تأخر في السداد؟»"
              value={money(data.agingTotalCents)}
              hint={`${money(data.aging["31-60"] + data.aging["60+"])} متأخرة أكثر من 30 يوماً`}
              badge={data.aging["31-60"] + data.aging["60+"] > 0n ? { tone: "danger" as Tone, label: "يحتاج انتباهاً" } : undefined}
              active={open === "debts"} onOpen={() => setOpen("debts")} />
            <ReportCard icon="💧" title="المخزون والتسويات" question="«أين يضيع الوقود؟»"
              value={`${wasteSharePercent(data.inventoryDiff.adjustmentCents, data.pnl.revenueCents + data.pnl.otherRevenueCents)}%`}
              hint="هدر وتسويات من المبيعات"
              badge={limitBadge(wasteSharePercent(data.inventoryDiff.adjustmentCents, data.pnl.revenueCents + data.pnl.otherRevenueCents) > 1)}
              active={open === "inventory"} onOpen={() => setOpen("inventory")} />
          </div>

          {open === "pnl" && <PnlPanel data={data} money={money} compareMonth={compareMonth} />}
          {open === "products" && <ProductsPanel data={data} money={money} />}
          {open === "cash" && <CashPanel data={data} money={money} />}
          {open === "debts" && <DebtsPanel data={data} money={money} />}
          {open === "inventory" && <InventoryPanel data={data} money={money} />}
        </>
      )}
    </div>
  );
}

// ---------- report cards ----------
function ReportCard({ icon, title, question, value, hint, pinned, badge, active, onOpen }: {
  icon: string; title: string; question: string; value: string; hint: string; pinned?: boolean;
  badge?: { tone: Tone; label: string }; active: boolean; onOpen: () => void;
}) {
  return (
    <article className={cx("flex flex-col gap-3 rounded-lg border p-4 shadow-card", active ? "border-2 border-brand-primary bg-brand-primary-50" : "border-transparent bg-surface-card")}>
      <div className="flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-md bg-surface-muted text-body-large-16" aria-hidden>{icon}</span>
        {pinned ? <StatusBadge tone="success">مثبَّت في اللوحة</StatusBadge> : badge && <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
      </div>
      <div>
        <h3 className="text-body-strong-14">{title}</h3>
        <p className="text-body-small-12 text-text-secondary">{question}</p>
      </div>
      <p className="text-number-l-24">{value}</p>
      <p className="text-body-small-12 text-text-secondary">{hint}</p>
      <Button variant="secondary" size="md" onClick={onOpen} aria-pressed={active}>فتح التقرير</Button>
    </article>
  );
}

// ---------- profit & loss detail ----------
function PnlPanel({ data, money, compareMonth }: { data: ReportsData; money: (c: bigint) => string; compareMonth: string }) {
  const change = percentChange(data.pnl.netProfitCents, data.prevPnl.netProfitCents);
  function download() {
    const blob = new Blob([pnlCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "profit-and-loss.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  const rows: [string, bigint, bigint, boolean][] = [
    ["مبيعات الوقود", data.pnl.revenueCents, data.prevPnl.revenueCents, false],
    ["تكلفة الوقود المباع", data.pnl.cogsCents, data.prevPnl.cogsCents, false],
    ["إجمالي الربح", data.pnl.grossProfitCents, data.prevPnl.grossProfitCents, true],
    ["المصاريف التشغيلية", data.pnl.opexCents, data.prevPnl.opexCents, false],
    ["صافي الربح التقديري", data.pnl.netProfitCents, data.prevPnl.netProfitCents, true],
  ];
  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-heading-h2-20">الربح والخسارة</h2>
          <p className="text-body-small-12 text-text-secondary">مقارنة بالفترة نفسها من {compareMonth}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled title="إرسال التقرير بالبريد غير متاح بعد">مشاركة مع المحاسب</Button>
          <Button variant="secondary" onClick={download}>تصدير CSV</Button>
        </div>
      </div>

      {!data.profitComplete && (
        <AlertBanner tone="info" title="الربح تقديري">
          بعض مناوبات الفترة لم تُعتمد بعد أو تكلفة توريد لم تُسعَّر — الرقم سيتغيّر قليلاً بعد اكتمالها.
        </AlertBanner>
      )}

      <table className="w-full text-body-regular-14">
        <thead>
          <tr className="border-b border-border-default text-body-small-12 text-text-secondary">
            <th className="p-2 text-start font-normal">البند</th>
            <th className="p-2 text-start font-normal">فترة المقارنة</th>
            <th className="p-2 text-start font-normal">الفترة الحالية</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-default">
          {rows.map(([label, cur, prev, strong]) => (
            <tr key={label}>
              <td className={cx("p-2", strong && "font-semibold")}>{label}</td>
              <td className="p-2 text-text-muted">{money(prev)}</td>
              <td className={cx("p-2", strong ? "font-semibold" : undefined, label === "صافي الربح التقديري" && (cur >= 0n ? "text-status-success-700" : "text-status-danger-700"))}>
                {money(cur)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {change !== null && (
        <p className="text-body-regular-14 text-text-secondary">
          صافي الربح {change >= 0 ? "أعلى" : "أقل"} بـ{Math.abs(change)}% من {compareMonth}
          {data.pnl.revenueCents > data.prevPnl.revenueCents ? "، والسبب الأساسي زيادة مبيعات الوقود مع ثبات المصاريف." : "."}
        </p>
      )}
    </section>
  );
}

// ---------- other drill-downs ----------
function ProductsPanel({ data, money }: { data: ReportsData; money: (c: bigint) => string }) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <Panel title="حسب الوقود">
        <Table head={["الوقود", "لتر", "المبلغ", "الحصة"]} rows={data.byProduct.map((r) => [
          r.product, formatNumber(r.liters, 0), money(r.amountCents), `${litersSharePercent(r.liters, data.totalLiters)}%`,
        ])} empty="لا مبيعات في هذه الفترة." />
      </Panel>
      <Panel title="حسب المضخة">
        <Table head={["المضخة", "لتر", "المبلغ"]} rows={data.byPump.map((r) => [`مضخة ${r.pump}`, formatNumber(r.liters, 0), money(r.amountCents)])}
          empty="لا مبيعات في هذه الفترة." />
      </Panel>
    </section>
  );
}

function CashPanel({ data, money }: { data: ReportsData; money: (c: bigint) => string }) {
  return (
    <Panel title="فروقات الصندوق">
      <p className="text-body-regular-14 text-text-secondary">
        {data.cashDiff.count === 0
          ? "لا فروقات صندوق في هذه الفترة."
          : `${data.cashDiff.count} ${data.cashDiff.count === 1 ? "مناوبة بها فرق صندوق" : "مناوبات بها فروقات صندوق"}، بصافي ${data.cashDiff.netCents >= 0n ? "عجز" : "زيادة"} ${money(data.cashDiff.netCents < 0n ? -data.cashDiff.netCents : data.cashDiff.netCents)}.`}
      </p>
      <p className="mt-2 text-body-small-12 text-text-secondary">التفاصيل بمناوبة بمناوبة متاحة من شاشة المبيعات والمناوبات.</p>
    </Panel>
  );
}

function DebtsPanel({ data, money }: { data: ReportsData; money: (c: bigint) => string }) {
  return (
    <Panel title="أعمار الديون">
      <Table head={["الفئة", "المبلغ"]} rows={[
        ["0–30 يوماً", money(data.aging["0-30"])],
        ["31–60 يوماً", money(data.aging["31-60"])],
        ["أكثر من 60 يوماً", money(data.aging["60+"])],
      ]} empty="لا ديون." />
      <p className="mt-2 text-body-small-12 text-text-secondary">تفاصيل كل شركة من شاشة العملاء والديون.</p>
    </Panel>
  );
}

function InventoryPanel({ data, money }: { data: ReportsData; money: (c: bigint) => string }) {
  const a = data.inventoryDiff.adjustmentCents;
  return (
    <Panel title="المخزون والتسويات">
      <p className="text-body-regular-14 text-text-secondary">
        {a === 0n ? "لا تسويات مخزون في هذه الفترة." : `صافي ${a > 0n ? "عجز" : "زيادة"} مخزون بقيمة ${money(a < 0n ? -a : a)} (حساب فروقات المخزون).`}
      </p>
      <p className="mt-2 text-body-small-12 text-text-secondary">تفاصيل كل خزان من شاشة الخزانات والمخزون.</p>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface-card p-6 shadow-card">
      <h2 className="text-heading-h2-20">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-body-regular-14 text-text-secondary">{empty}</p>;
  return (
    <table className="w-full text-body-regular-14">
      <thead>
        <tr className="border-b border-border-default text-body-small-12 text-text-secondary">
          {head.map((h) => <th key={h} className="p-2 text-start font-normal">{h}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-border-default">
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className="p-2">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="h-52 animate-pulse rounded-lg bg-surface-muted" />)}</div>
      <span className="h-72 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}
