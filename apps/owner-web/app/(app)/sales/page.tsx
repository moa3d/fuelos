"use client";
// O3 — المبيعات والمضخات والمناوبات (design/screens/O3.png). List of the period's shifts on the right (each with its
// pumps — a shift can span several), the selected shift with its numbers on the left. Decisions are made in O7:
// the buttons here open the request there. All totals come from shift_summary() on the server.
import { formatDay, formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, StatusBadge } from "@fuelos/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Period } from "@/lib/dashboard";
import { absCents, cents, centsStr } from "@/lib/money";
import { loadSalesList, loadShiftDetail, type SalesList, type ShiftDetail, type ShiftListRow } from "@/lib/sales-data";
import { openHours, openLegFills, paymentBreakdown, statusOf } from "@/lib/shift-report";
import { timeAgo } from "@/lib/time-ago";
import { useOffice } from "../office-context";

type ListLoad = { status: "loading" } | { status: "error" } | { status: "ready"; data: SalesList };
type DetailLoad = { status: "loading" } | { status: "error" } | { status: "ready"; data: ShiftDetail };

const PERIODS: [Period, string][] = [["today", "اليوم"], ["yesterday", "أمس"], ["week", "آخر 7 أيام"], ["month", "هذا الشهر"]];

export default function SalesPage() {
  const { current } = useOffice();
  const [period, setPeriod] = useState<Period>("today");
  const [list, setList] = useState<ListLoad>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    loadSalesList(current.stationId, period).then(
      (data) => { if (alive) { setList({ status: "ready", data }); setNow(Date.now()); } },
      () => { if (alive) setList({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [current.stationId, period, tick]);

  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  function refresh() {
    setList({ status: "loading" });
    setTick((t) => t + 1);
  }

  const shifts = list.status === "ready" ? list.data.shifts : [];
  // the shift that needs attention first: waiting for approval, otherwise the newest
  const selected = shifts.find((s) => s.id === selectedId) ?? shifts.find((s) => s.status === "submitted") ?? shifts[0];

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">المبيعات والمضخات والمناوبات</h1>
          <p className="text-body-regular-14 text-text-secondary">
            {list.status === "ready"
              ? `${periodText(list.data.period)} · ${list.data.shiftsCount} مناوبات · ${list.data.pumps.length} مضخات · آخر تحديث ${formatTime(list.data.fetchedAt)} · من الخادم`
              : "…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="الفترة" className="flex rounded-md border border-border-default bg-surface-card p-1">
            {PERIODS.map(([p, label]) => (
              <button key={p} role="tab" aria-selected={period === p}
                onClick={() => { if (p !== period) { setList({ status: "loading" }); setSelectedId(undefined); setPeriod(p); } }}
                className={cx("h-9 rounded-sm px-4 text-body-strong-14", period === p ? "bg-brand-primary text-white" : "text-text-secondary")}>
                {label}
              </button>
            ))}
          </div>
          <Button variant="secondary" disabled title="التصدير يحتاج تقريراً من الخادم — قريباً">تصدير</Button>
          <Button variant="secondary" onClick={refresh}>تحديث</Button>
        </div>
      </header>

      {list.status === "loading" && <Skeleton />}
      {list.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل المناوبات" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}

      {list.status === "ready" && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-6">
            <section className="rounded-lg bg-surface-card p-5 shadow-card" aria-label="المناوبات">
              <h2 className="mb-3 text-heading-h2-20">المناوبات</h2>
              {shifts.length === 0 ? (
                <p className="text-body-regular-14 text-text-secondary">لا توجد مناوبات في هذه الفترة.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {shifts.map((s) => (
                    <ShiftCard key={s.id} s={s} now={now} maxHours={list.data.maxShiftHours} selected={s.id === selected?.id}
                      onSelect={() => setSelectedId(s.id)} />
                  ))}
                </ul>
              )}
              {list.data.shiftsCount > shifts.length && (
                <p className="mt-2 text-body-small-12 text-text-secondary">أحدث {shifts.length} من {list.data.shiftsCount} مناوبة</p>
              )}
            </section>
            <Pumps pumps={list.data.pumps} />
          </div>

          <div className="lg:sticky lg:top-8">
            {selected ? (
              <Detail key={selected.id} shift={selected} list={list.data} now={now} currency={current.currencyLabel} />
            ) : (
              <p className="rounded-lg bg-surface-card p-8 text-center text-body-regular-14 text-text-secondary shadow-card">
                اختر مناوبة من القائمة لترى تفاصيلها هنا.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function periodText(p: { from: string; to: string; timezone: string }): string {
  const last = new Date(Date.parse(p.to) - 1);
  if (Date.parse(p.to) - Date.parse(p.from) <= 25 * 3_600_000) return formatDay(new Date(p.from));
  const fmt = (d: Date) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: p.timezone, day: "numeric", month: "long" }).format(d);
  return `${fmt(new Date(p.from))} – ${fmt(last)}`;
}

// ---------- list ----------
function ShiftCard({ s, now, maxHours, selected, onSelect }: {
  s: ShiftListRow; now: number; maxHours: number; selected: boolean; onSelect: () => void;
}) {
  const st = statusOf(s.status, s.openedAt, now, maxHours);
  const long = st.label === "مفتوحة طويلاً";
  return (
    <li>
      <button type="button" onClick={onSelect} aria-current={selected ? "true" : undefined}
        className={cx("flex w-full items-center gap-3 rounded-lg border p-3 text-start transition-colors",
          selected ? "border-2 border-brand-primary bg-brand-primary-50" : "border-border-default bg-surface-card hover:bg-surface-muted")}>
        <span className="flex h-10 min-w-10 items-center justify-center rounded-md bg-surface-muted px-2 text-body-strong-14">{s.pumps.join("·") || "—"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-strong-14">
            {s.pumps.length > 1 ? "المضخات" : "المضخة"} {s.pumps.join("، ")}{s.products.length > 0 ? ` · ${s.products.join(" · ")}` : ""}
          </span>
          <span className="block truncate text-body-small-12 text-text-secondary">
            {s.attendant} · {formatTime(s.openedAt)}{s.closedAt ? ` – ${formatTime(s.closedAt)}` : ""}
            {long ? ` · منذ ${openHours(s.openedAt, now)} ساعة` : ""}
          </span>
        </span>
        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
      </button>
    </li>
  );
}

function Pumps({ pumps }: { pumps: { id: string; number: number; products: string[]; heldBy: string | null }[] }) {
  return (
    <section className="rounded-lg bg-surface-card p-5 shadow-card" aria-label="المضخات الآن">
      <h2 className="mb-3 text-heading-h2-20">المضخات الآن</h2>
      {pumps.length === 0 ? (
        <p className="text-body-regular-14 text-text-secondary">لا توجد مضخات مفعّلة.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {pumps.map((p) => (
            <li key={p.id} className="rounded-md border border-border-default p-3">
              <p className="text-body-strong-14">مضخة {p.number} <span className="font-normal text-text-secondary">· {p.products.join(" · ")}</span></p>
              <p className={cx("mt-1 text-body-small-12", p.heldBy ? "text-brand-primary" : "text-text-muted")}>
                {p.heldBy ? `مع ${p.heldBy}` : "متوقفة · لا توجد مناوبة"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- detail ----------
function Detail({ shift, list, now, currency }: { shift: ShiftListRow; list: SalesList; now: number; currency: string }) {
  const [load, setLoad] = useState<DetailLoad>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const { current } = useOffice();

  useEffect(() => {
    let alive = true;
    loadShiftDetail(current.stationId, shift.id).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [current.stationId, shift.id, tick]);

  const st = statusOf(shift.status, shift.openedAt, now, list.maxShiftHours);
  const money = (c: bigint) => formatMoney(centsStr(c), currency);
  const title = `مناوبة ${shift.pumps.length > 1 ? "المضخات" : "المضخة"} ${shift.pumps.join("، ")}`;

  return (
    <article className="rounded-lg bg-surface-card p-6 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-heading-h1-24">{title}</h2>
            <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
          </div>
          <p className="mt-1 text-body-regular-14 text-text-secondary">
            {[shift.attendant, `${formatTime(shift.openedAt)}${shift.closedAt ? ` – ${formatTime(shift.closedAt)}` : ""}`, shift.products.join(" · ")].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>

      {load.status === "loading" && <span aria-busy className="mt-6 block h-64 animate-pulse rounded-lg bg-surface-muted" />}
      {load.status === "error" && (
        <AlertBanner tone="danger" className="mt-6" title="تعذّر تحميل تفاصيل المناوبة"
          action={<Button variant="secondary" onClick={() => { setLoad({ status: "loading" }); setTick((t) => t + 1); }}>إعادة المحاولة</Button>}>
          حاول مرة أخرى.
        </AlertBanner>
      )}
      {load.status === "ready" && <DetailBody shift={shift} d={load.data} list={list} money={money} now={now} />}
    </article>
  );
}

function DetailBody({ shift, d, list, money, now }: { shift: ShiftListRow; d: ShiftDetail; list: SalesList; money: (c: bigint) => string; now: number }) {
  const s = d.summary;
  const isOpen = shift.status === "open" || shift.status === "reopened";
  const pay = paymentBreakdown(s, d.sales);
  const openIds = new Set(s.legs.filter((l) => !l.ended_at).map((l) => l.leg_id));
  const open = openLegFills(d.sales, openIds);
  const diff = s.cash_diff === null ? null : cents(s.cash_diff);
  const bigDiff = diff !== null && absCents(diff) > BigInt(list.cashToleranceCents);
  const closeReq = d.requests.find((r) => r.type === "shift_close" && r.status === "pending");
  const decided = d.requests.find((r) => r.type === "shift_close" && r.status !== "pending");
  const creditPending = d.requests.filter((r) => r.type === "credit_over_limit" && r.status === "pending");
  const single = s.legs.length === 1 && s.legs[0].nozzles.length === 1 ? s.legs[0].nozzles[0] : undefined;
  const price = s.nozzles.length > 0 && s.nozzles.every((n) => String(n.price) === String(s.nozzles[0].price)) && s.nozzles[0].price !== null
    ? cents(s.nozzles[0].price) : undefined;
  const nameOf = (id: string | null) => (id ? list.names[id] ?? "" : "");
  const { current } = useOffice();

  return (
    <div className="mt-4 flex flex-col gap-6">
      {price !== undefined && <p className="-mt-2 text-body-small-12 text-text-secondary">سعر اللتر {money(price)} · سعر بداية المناوبة</p>}

      {(closeReq || (shift.status === "submitted")) && (
        <div className="flex flex-wrap gap-2">
          <Link href={closeReq ? `/approvals?select=${closeReq.id}` : "/approvals"}
            className="inline-flex h-10 items-center justify-center rounded-sm bg-brand-action px-4 text-body-strong-14 text-brand-on-action hover:bg-brand-action-700 hover:text-white">
            اعتماد الإغلاق
          </Link>
          <Link href={closeReq ? `/approvals?select=${closeReq.id}` : "/approvals"}
            className="inline-flex h-10 items-center justify-center rounded-sm border border-border-strong bg-surface-card px-4 text-body-strong-14 hover:bg-surface-muted">
            طلب تصحيح
          </Link>
          <span className="self-center text-body-small-12 text-text-muted">يُفتح الطلب في «الموافقات» لاتخاذ القرار.</span>
        </div>
      )}

      {isOpen && (
        <AlertBanner tone="info" title="المناوبة ما زالت مفتوحة">
          مبيعات المضخة الحالية تُحسب من العداد عند إغلاقها.
          {open.count > 0 && ` سُجّلت عليها ${open.count} تعبئات بقيمة ${money(open.cents)}.`}
        </AlertBanner>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {single && <Stat label="القراءة الافتتاحية" value={formatNumber(Number(single.opening_reading), 1)} />}
        {single && <Stat label="القراءة النهائية" value={single.closing_reading === null ? "—" : formatNumber(Number(single.closing_reading), 1)} />}
        <Stat label="اللترات المباعة" value={formatNumber(Math.round(Number(s.liters) * 10) / 10, 1)} note={isOpen ? "من المضخات المُنهاة" : "محسوبة تلقائياً"} />
        <Stat label="قيمة المبيعات" value={money(cents(s.meter_sales))} />
      </div>

      {s.legs.length > 0 && (
        <section>
          <h3 className="mb-2 text-heading-h3-16">المضخات في هذه المناوبة</h3>
          <ul className="flex flex-col divide-y divide-border-default rounded-md border border-border-default">
            {s.legs.map((l) => (
              <li key={l.leg_id} className="flex items-start justify-between gap-3 p-3 text-body-regular-14">
                <div>
                  <p className="font-semibold">مضخة {l.pump_number}</p>
                  <p className="text-body-small-12 text-text-secondary">
                    {formatTime(l.started_at)} – {l.ended_at ? formatTime(l.ended_at) : "…"}
                    {l.nozzles.map((n) => ` · ${n.label}: ${formatNumber(Number(n.opening_reading), 1)}${n.closing_reading === null ? "" : ` → ${formatNumber(Number(n.closing_reading), 1)}`}`).join("")}
                  </p>
                  {l.gap_note && <p className="mt-1 text-body-small-12 text-status-warning-700">فرق قراءة عند البداية: {l.gap_note}</p>}
                </div>
                <div className="text-end">
                  <p className="font-semibold">{formatNumber(Number(l.liters), 1)} لتر</p>
                  <p className="text-body-small-12 text-text-secondary">{money(cents(l.amount))}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-heading-h3-16">طرق الدفع</h3>
        <table className="w-full text-body-regular-14">
          <thead>
            <tr className="bg-surface-muted text-body-small-12 text-text-secondary">
              <th className="rounded-s-md p-3 text-start font-semibold">الطريقة</th>
              <th className="p-3 text-start font-semibold">عدد العمليات</th>
              <th className="rounded-e-md p-3 text-end font-semibold">المبلغ ({current.currencyLabel})</th>
            </tr>
          </thead>
          <tbody>
            {pay.rows.map((r) => (
              <tr key={r.method} className="border-t border-border-default">
                <td className="p-3 font-semibold">{r.label}</td>
                <td className="p-3">{formatNumber(r.count)}</td>
                <td className="p-3 text-end font-semibold">{formatNumber(Number(r.amountCents / 100n))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex items-baseline justify-between rounded-md bg-brand-action-50 p-3">
          <span className="text-body-strong-14 text-brand-action-700">الإجمالي · {formatNumber(pay.totalCount)} عملية</span>
          <span className="text-number-m-18 text-brand-action-700">{money(pay.totalCents)}</span>
        </div>
        <p className="mt-1 text-body-small-12 text-text-muted">النقدي = مبيعات العداد − البطاقة − الآجل − القسائم. العدد هو التعبئات المسجّلة على الأجهزة.</p>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="النقد المتوقع في الصندوق" value={money(cents(s.expected_cash))} note={`صندوق البداية ${money(cents(s.opening_cash))} + المبيعات − البطاقات − الآجل − القسائم`} />
        <Stat label="النقد الفعلي (أدخله العامل)" value={s.counted_cash === null ? "لم يُعدّ بعد" : money(cents(s.counted_cash))} />
        <div className={cx("rounded-md p-3", diff === null ? "bg-surface-muted" : diff === 0n ? "bg-brand-action-50 text-brand-action-700" : bigDiff ? "bg-status-danger-50 text-status-danger-700" : "bg-status-warning-50 text-status-warning-700")}>
          <p className="text-body-small-12">فرق الصندوق</p>
          <p className="text-number-l-24">{diff === null ? "—" : money(diff)}</p>
          {diff !== null && diff !== 0n && (
            <p className="text-body-small-12">{bigDiff ? `أكبر من الحد المسموح (${money(BigInt(list.cashToleranceCents))})` : "ضمن الحد المسموح"}</p>
          )}
        </div>
      </section>

      {d.diffReason && (
        <section className="rounded-md bg-surface-muted p-4">
          <p className="text-label-12 text-text-secondary">سبب العامل</p>
          <p className="mt-1 text-body-large-16">«{d.diffReason}»</p>
        </section>
      )}

      {creditPending.length > 0 && (
        <AlertBanner tone="warning" title={creditPending.length === 1 ? "عملية آجل معلّقة ضمن المناوبة" : `${creditPending.length} عمليات آجل معلّقة ضمن المناوبة`}
          action={<Link href={`/approvals?select=${creditPending[0].id}`} className="inline-flex h-10 items-center rounded-sm border border-border-strong bg-surface-card px-4 text-body-strong-14">راجع</Link>}>
          {creditPending.map((r) => `${String(r.payload.company ?? "")} · ${money(cents(r.saleAmount ?? (r.payload.amount as string | number)))}`).join(" — ")}
          {" · "}يجب البتّ فيها قبل اعتماد الإغلاق.
        </AlertBanner>
      )}

      {decided && (
        <p className="text-body-small-12 text-text-secondary">
          {decided.status === "approved" ? "اعتُمد الإغلاق" : "رُفض الإغلاق"} · {nameOf(decided.decidedBy) || "—"}
          {decided.decidedAt ? ` · ${timeAgo(decided.decidedAt, now)}` : ""}{decided.decisionNote ? ` · «${decided.decisionNote}»` : ""}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md bg-surface-muted p-3">
      <p className="text-body-small-12 text-text-secondary">{label}</p>
      <p className="text-number-m-18">{value}</p>
      {note && <p className="text-body-small-12 text-text-muted">{note}</p>}
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="grid gap-6 lg:grid-cols-[5fr_7fr]">
      <div className="flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <span key={i} className="h-16 animate-pulse rounded-lg bg-surface-muted" />)}</div>
      <span className="h-[32rem] animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}
