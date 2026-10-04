"use client";
// A5 «مبيعات المحطات» (docs/briefs/08a): platform_sales_summary() is the only source for every number here —
// this screen computes nothing financial itself, only filtering/sorting/formatting what the RPC already
// aggregated. Every station gets a row, zeros included, for the chosen period; nothing is ever hidden.
import { formatDay, formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, Input, StatusBadge } from "@fuelos/ui";
import { useEffect, useMemo, useState } from "react";
import { subscriptionBadge } from "@/lib/dashboard-rules";
import { centsStr } from "@/lib/money";
import { loadPlatformSales, type PlatformSales } from "@/lib/sales-data";
import { copyTableTsv, exportToExcel } from "@/lib/sales-export";
import {
  nextSort, PERIOD_LABEL, periodRange, sortSalesRows, sumTotals, toISODate,
  type PeriodPreset, type SalesRow, type SortDir, type SortKey,
} from "@/lib/sales-rules";
import { matchesSearch, stationBadge, type StationStatus } from "@/lib/stations-rules";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: PlatformSales };
const PRESETS: PeriodPreset[] = ["today", "last7", "thisMonth", "lastMonth", "custom"];
const STATUS_FILTERS: ("all" | StationStatus)[] = ["all", "active", "setup", "suspended"];
const CURRENCY = "ل.س"; // platform-wide report; stations may differ, but this is an ops summary, not a per-station ledger

export default function PlatformSalesPage() {
  const [now] = useState(() => Date.now());
  const [preset, setPreset] = useState<PeriodPreset>("thisMonth");
  const [customFrom, setCustomFrom] = useState(toISODate(new Date(now)));
  const [customTo, setCustomTo] = useState(toISODate(new Date(now)));
  const range = useMemo(
    () => periodRange(preset, now, { from: customFrom, to: customTo }),
    [preset, now, customFrom, customTo],
  );

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const [status, setStatus] = useState<"all" | StationStatus>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "salesCents", dir: "desc" });
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string>();
  const [copied, setCopied] = useState(false);

  // the "loading" reset happens in whichever handler changes range.from/to/tick (below), not here — setting
  // state synchronously inside an effect body (rather than from its async completion) triggers cascading renders.
  useEffect(() => {
    let alive = true;
    loadPlatformSales(range.from, range.to).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      (e) => { if (alive) setLoad({ status: "error", message: e instanceof Error ? e.message : "تعذّر تحميل المبيعات" }); },
    );
    return () => { alive = false; };
  }, [range.from, range.to, tick]);

  function selectPreset(p: PeriodPreset) { setLoad({ status: "loading" }); setPreset(p); }
  function setFrom(v: string) { setLoad({ status: "loading" }); setCustomFrom(v); }
  function setTo(v: string) { setLoad({ status: "loading" }); setCustomTo(v); }
  function refresh() { setLoad({ status: "loading" }); setTick((t) => t + 1); }
  function onSort(key: SortKey) { setSort((s) => nextSort(s, key)); }

  const cities = useMemo(() => {
    if (load.status !== "ready") return [];
    return [...new Set(load.data.rows.map((r) => r.city).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "ar"));
  }, [load]);

  const filtered = useMemo(() => {
    if (load.status !== "ready") return [];
    return load.data.rows.filter((r) =>
      matchesSearch(r.stationName, r.city, query)
      && (city === "all" || r.city === city)
      && (status === "all" || r.stationStatus === status));
  }, [load, query, city, status]);

  const shown = useMemo(() => sortSalesRows(filtered, sort.key, sort.dir), [filtered, sort]);
  const visibleTotals = useMemo(() => sumTotals(shown), [shown]);
  const serverTotals = load.status === "ready" ? load.data.totals : undefined;
  const stationsWithSales = load.status === "ready" ? load.data.rows.filter((r) => r.salesCents > 0n).length : 0;
  const money = (c: bigint) => formatMoney(centsStr(c), CURRENCY);

  async function onExportExcel() {
    if (load.status !== "ready" || exporting) return;
    setExporting(true); setExportMsg(undefined);
    try {
      await exportToExcel(shown, visibleTotals, { from: range.from, to: range.to, periodLabel: PERIOD_LABEL[preset] });
    } catch {
      setExportMsg("تعذّر إنشاء ملف Excel — حاول مرة أخرى");
    } finally {
      setExporting(false);
    }
  }

  async function onCopy() {
    if (load.status !== "ready") return;
    try {
      await copyTableTsv(shown, visibleTotals, CURRENCY);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setExportMsg("تعذّر النسخ — انسخ يدوياً أو جرّب مرة أخرى");
    }
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">مبيعات المحطات</h1>
          <p className="text-body-regular-14 text-text-secondary">
            أرقام مجمّعة من الورديات المعتمدة فقط — بلا فواتير أو تفاصيل عمليات
            {load.status === "ready" && ` · آخر تحديث ${formatTime(load.data.fetchedAt)} · من الخادم`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={load.status !== "ready"} onClick={onCopy}>{copied ? "تم النسخ ✓" : "نسخ الجدول"}</Button>
          <Button variant="action" disabled={load.status !== "ready" || exporting} onClick={onExportExcel}>
            {exporting ? "جارٍ التصدير…" : "تصدير Excel"}
          </Button>
        </div>
      </header>

      {exportMsg && <AlertBanner tone="danger" title={exportMsg} />}

      <section className="flex flex-wrap items-end gap-3 rounded-lg bg-surface-card p-4 shadow-card">
        <div role="tablist" aria-label="الفترة" className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p} role="tab" aria-selected={preset === p} onClick={() => selectPreset(p)}
              className={cx("h-9 rounded-full border px-4 text-body-strong-14",
                preset === p ? "border-brand-primary bg-brand-primary text-white" : "border-border-default bg-surface-card text-text-secondary")}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-end gap-2">
            <Input label="من" type="date" dir="ltr" value={customFrom} onChange={(e) => setFrom(e.target.value)} />
            <Input label="إلى" type="date" dir="ltr" value={customTo} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
        <p className="text-body-small-12 text-text-muted" dir="ltr">{range.from} → {range.to}</p>
      </section>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title={load.message} action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
          {load.message === "تعذّر تحميل المبيعات"
            ? "تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى. إن تكرر الخطأ، راجع ما إذا كانت دالة platform_sales_summary متاحة بعد."
            : "عدّل الفترة أعلاه ثم حاول مرة أخرى."}
        </AlertBanner>
      )}

      {load.status === "ready" && serverTotals && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="إجمالي المبيعات" value={money(serverTotals.salesCents)} />
            <StatCard label="إجمالي اللترات" value={`${formatNumber(serverTotals.litersL, 1)} لتر`} />
            <StatCard label="عدد الورديات المعتمدة" value={formatNumber(serverTotals.approvedShifts, 0)} />
            <StatCard label="محطات لها مبيعات" value={`${formatNumber(stationsWithSales, 0)} / ${formatNumber(load.data.rows.length, 0)}`} />
          </div>

          <section className="rounded-lg bg-surface-card shadow-card">
            <div className="flex flex-wrap items-center gap-3 p-4">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو المدينة" aria-label="بحث"
                className="h-10 w-64 rounded-md border border-border-default bg-surface-card px-3 text-body-regular-14" />
              <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="المدينة"
                className="h-10 rounded-md border border-border-default bg-surface-card px-2 text-body-regular-14">
                <option value="all">كل المدن</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value as "all" | StationStatus)} aria-label="حالة المحطة"
                className="h-10 rounded-md border border-border-default bg-surface-card px-2 text-body-regular-14">
                {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "all" ? "كل الحالات" : stationBadge(s).label}</option>)}
              </select>
              <span className="text-body-small-12 text-text-secondary">{formatNumber(shown.length, 0)} محطة</span>
            </div>

            {shown.length === 0 ? (
              <p className="p-8 text-center text-body-regular-14 text-text-secondary">لا توجد محطات تطابق البحث أو الفلاتر.</p>
            ) : (
              <div className="overflow-x-auto border-t border-border-default">
                <table className="w-full min-w-[1400px] text-body-regular-14">
                  <thead>
                    <tr className="border-b border-border-default bg-surface-muted">
                      <Th label="المحطة" sortKey="stationName" sort={sort} onSort={onSort} sticky />
                      <Th label="المنظمة" sortKey="organizationName" sort={sort} onSort={onSort} />
                      <Th label="المدينة" sortKey="city" sort={sort} onSort={onSort} />
                      <Th label="حالة المحطة" sortKey="stationStatus" sort={sort} onSort={onSort} />
                      <Th label="الخطة" sortKey="planName" sort={sort} onSort={onSort} />
                      <Th label="حالة الاشتراك" sortKey="subscriptionStatus" sort={sort} onSort={onSort} />
                      <Th label="الورديات المعتمدة" sortKey="approvedShifts" sort={sort} onSort={onSort} />
                      <Th label="اللترات" sortKey="litersL" sort={sort} onSort={onSort} />
                      <Th label="المبيعات" sortKey="salesCents" sort={sort} onSort={onSort} />
                      <Th label="نقد" sortKey="cashCents" sort={sort} onSort={onSort} />
                      <Th label="بطاقة" sortKey="cardCents" sort={sort} onSort={onSort} />
                      <Th label="آجل" sortKey="creditCents" sort={sort} onSort={onSort} />
                      <Th label="قسائم" sortKey="voucherCents" sort={sort} onSort={onSort} />
                      <Th label="آخر وردية معتمدة" sortKey="lastApprovedShiftAt" sort={sort} onSort={onSort} />
                      <Th label="آخر مزامنة جهاز" sortKey="lastDeviceSyncAt" sort={sort} onSort={onSort} />
                      <Th label="الأجهزة" sortKey="deviceCount" sort={sort} onSort={onSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default">
                    {shown.map((r) => <Row key={r.stationId} r={r} money={money} />)}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border-strong bg-surface-muted font-semibold">
                      <td className="sticky end-0 z-10 bg-surface-muted p-3">الإجمالي ({formatNumber(shown.length, 0)} محطة)</td>
                      <td className="p-3" colSpan={5} />
                      <td className="p-3">{formatNumber(visibleTotals.approvedShifts, 0)}</td>
                      <td className="p-3">{formatNumber(visibleTotals.litersL, 1)}</td>
                      <td className="p-3">{money(visibleTotals.salesCents)}</td>
                      <td className="p-3">{money(visibleTotals.cashCents)}</td>
                      <td className="p-3">{money(visibleTotals.cardCents)}</td>
                      <td className="p-3">{money(visibleTotals.creditCents)}</td>
                      <td className="p-3">{money(visibleTotals.voucherCents)}</td>
                      <td className="p-3" colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Row({ r, money }: { r: SalesRow; money: (c: bigint) => string }) {
  const sBadge = stationBadge(r.stationStatus);
  const subBadge = r.subscriptionStatus ? subscriptionBadge(r.subscriptionStatus) : undefined;
  return (
    <tr>
      <td className="sticky end-0 z-10 bg-surface-card p-3 text-body-strong-14">{r.stationName}</td>
      <td className="p-3 text-text-secondary">{r.organizationName}</td>
      <td className="p-3 text-text-secondary">{r.city ?? "—"}</td>
      <td className="p-3"><StatusBadge tone={sBadge.tone}>{sBadge.label}</StatusBadge></td>
      <td className="p-3 text-text-secondary">{r.planName ?? "—"}</td>
      <td className="p-3">{subBadge ? <StatusBadge tone={subBadge.tone}>{subBadge.label}</StatusBadge> : "—"}</td>
      <td className="p-3">{formatNumber(r.approvedShifts, 0)}</td>
      <td className="p-3">{formatNumber(r.litersL, 1)}</td>
      <td className="p-3 text-body-strong-14">{money(r.salesCents)}</td>
      <td className="p-3">{money(r.cashCents)}</td>
      <td className="p-3">{money(r.cardCents)}</td>
      <td className="p-3">{money(r.creditCents)}</td>
      <td className="p-3">{money(r.voucherCents)}</td>
      <td className="whitespace-nowrap p-3 text-text-secondary">{r.lastApprovedShiftAt ? `${formatDay(r.lastApprovedShiftAt)} ${formatTime(r.lastApprovedShiftAt)}` : "—"}</td>
      <td className="whitespace-nowrap p-3 text-text-secondary">{r.lastDeviceSyncAt ? `${formatDay(r.lastDeviceSyncAt)} ${formatTime(r.lastDeviceSyncAt)}` : "—"}</td>
      <td className="p-3">{formatNumber(r.deviceCount, 0)}</td>
    </tr>
  );
}

function Th({ label, sortKey, sort, onSort, sticky }: {
  label: string; sortKey: SortKey; sort: { key: SortKey; dir: SortDir }; onSort: (k: SortKey) => void; sticky?: boolean;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={cx("whitespace-nowrap p-3 text-start font-normal", sticky && "sticky end-0 z-10 bg-surface-muted")}>
      <button type="button" onClick={() => onSort(sortKey)}
        className={cx("flex items-center gap-1 text-body-small-12", active ? "text-brand-primary" : "text-text-secondary hover:text-text-primary")}>
        {label}
        {active && <span aria-hidden>{sort.dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-card p-5 shadow-card">
      <p className="text-body-small-12 text-text-secondary">{label}</p>
      <p className="mt-1 text-number-xl-32">{value}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <span key={i} className="h-24 animate-pulse rounded-lg bg-surface-muted" />)}
      </div>
      <span className="h-72 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}
