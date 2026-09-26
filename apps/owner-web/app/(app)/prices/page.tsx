"use client";
// O9 — أسعار الوقود (design/screens/O9.png). One card per fuel: the published price, the new price, margin (owner /
// accountant), availability for customers. Publishing = publish_price() (owner only); a price is locked per shift when
// the shift opens, so shifts open now keep the old price — the panel says so (the design's wording said the opposite).
import { formatDay, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, StatusBadge } from "@fuelos/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { cents, centsStr } from "@/lib/money";
import { isLargeChange, marginOf, parsePriceCents } from "@/lib/price-rules";
import { loadPrices, publishPrice, setAvailability, type Availability, type PricesData, type ProductRow } from "@/lib/prices-data";
import { timeAgo } from "@/lib/time-ago";
import { useOffice } from "../office-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: PricesData };
type Num = number | string;

const AVAIL: [Availability, string, string][] = [
  ["available", "متوفر", "bg-brand-action"], ["limited", "محدود", "bg-status-warning"], ["unavailable", "غير متوفر", "bg-status-danger"],
];
const AVAIL_BADGE: Record<Availability, [Parameters<typeof StatusBadge>[0]["tone"], string]> = {
  available: ["success", "متوفر"], limited: ["warning", "كمية محدودة"], unavailable: ["danger", "غير متوفر"],
};
const STATION_STATUS: Record<string, string> = { setup: "قيد الإعداد", suspended: "موقوفة", active: "فعّالة" };

const priceText = (v: Num) => `${formatNumber(Number(cents(v)) / 100, cents(v) % 100n === 0n ? 0 : 2)}`;

export default function PricesPage() {
  const { current, userId } = useOffice();
  const canPublish = current.role === "owner";
  const canAvail = current.role === "owner" || current.role === "shift_manager";
  const canSeeCost = current.role === "owner" || current.role === "accountant";

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [availEdits, setAvailEdits] = useState<Record<string, Availability>>({});
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState("");
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());   // «الآن» for scheduling checks, refreshed with the data
  const [result, setResult] = useState<{ tone: "success" | "danger"; title: string; lines: string[] }>();
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    loadPrices(current.stationId, canSeeCost).then(
      (data) => { if (alive) { setLoad({ status: "ready", data }); setNow(Date.now()); } },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [current.stationId, canSeeCost, tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  const data = load.status === "ready" ? load.data : undefined;
  const products = useMemo(() => data?.products ?? [], [data]);

  // pending changes
  const priceChanges = products.flatMap((p) => {
    const typed = priceEdits[p.id];
    if (typed === undefined || typed.trim() === "") return [];
    const c = parsePriceCents(typed);
    const old = p.price === null ? null : cents(p.price);
    return c !== null && c !== old ? [{ p, cents: c, old }] : [];
  });
  const availChanges = products.filter((p) => availEdits[p.id] !== undefined && availEdits[p.id] !== p.availability);
  const invalid = products.filter((p) => (priceEdits[p.id] ?? "").trim() !== "" && parsePriceCents(priceEdits[p.id]) === null);
  const large = priceChanges.filter((c) => c.old !== null && isLargeChange(c.old, c.cents));
  const changeCount = priceChanges.length + availChanges.length;
  const whenMs = when ? Date.parse(when) : NaN;
  const scheduleOk = !schedule || (Number.isFinite(whenMs) && whenMs > now + 2 * 60_000);

  const blockedReason =
    changeCount === 0 ? "لا توجد تغييرات لنشرها"
    : invalid.length > 0 ? "صحّح السعر المكتوب (أرقام بخانتين عشريتين على الأكثر)"
    : priceChanges.length > 0 && !canPublish ? "نشر الأسعار متاح لصاحب المحطة فقط"
    : availChanges.length > 0 && !canAvail ? "تغيير التوفر متاح لصاحب المحطة ومدير المناوبة"
    : schedule && priceChanges.length > 0 && !scheduleOk ? "اختر موعداً بعد دقيقتين من الآن على الأقل"
    : large.length > 0 && !confirmLarge ? "أكّد أن التغيير الكبير في السعر صحيح"
    : undefined;

  async function publish() {
    if (inFlight.current || blockedReason || !data) return;
    inFlight.current = true;
    setBusy(true);
    setResult(undefined);
    try {
      const at = schedule && priceChanges.length > 0 ? new Date(whenMs).toISOString() : null;
      const done: string[] = [];
      const failed: string[] = [];
      for (const c of priceChanges) {
        const res = await publishPrice(current.stationId, c.p.id, centsStr(c.cents), at).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
        (res.ok ? done : failed).push(res.ok ? `سعر ${c.p.name}: ${priceText(centsStr(c.cents))}${at ? ` من ${formatDay(new Date(at))} ${formatTime(at)}` : ""}` : `سعر ${c.p.name} لم يُنشر — ${res.message}`);
        if (res.ok) setPriceEdits((e) => { const { [c.p.id]: _drop, ...rest } = e; void _drop; return rest; });
      }
      for (const p of availChanges) {
        const res = await setAvailability(current.stationId, p.id, availEdits[p.id], userId).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
        (res.ok ? done : failed).push(res.ok ? `توفر ${p.name}: ${AVAIL_BADGE[availEdits[p.id]][1]}` : `توفر ${p.name} لم يُحفظ — ${res.message}`);
        if (res.ok) setAvailEdits((e) => { const { [p.id]: _drop, ...rest } = e; void _drop; return rest; });
      }
      setConfirmLarge(false);
      setResult(failed.length === 0
        ? { tone: "success", title: at ? "جُدوِل النشر" : "تم النشر", lines: done }
        : { tone: "danger", title: "لم يكتمل النشر", lines: [...failed, ...done.map((d) => `✓ ${d}`)] });
      refresh();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const lastPublished = products.map((p) => p.priceSince).filter((s): s is string => !!s).sort().at(-1);

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">أسعار الوقود</h1>
          <p className="text-body-regular-14 text-text-secondary">
            السعر المنشور يظهر للزبائن مع وقت التحديث ومصدره
            {lastPublished ? ` · آخر نشر ${timeAgo(lastPublished, now)}` : ""}
            {data ? ` · آخر تحديث للصفحة ${formatTime(data.fetchedAt)} · من الخادم` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowHistory((h) => !h)} disabled={!data}>{showHistory ? "إخفاء السجل" : "سجل الأسعار"}</Button>
          <Button variant="secondary" onClick={refresh}>تحديث</Button>
        </div>
      </header>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل الأسعار" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}

      {data && (
        <>
          {!canPublish && (
            <AlertBanner tone="info" title="نشر الأسعار متاح لصاحب المحطة فقط">
              {canAvail ? "يمكنك تغيير توفر الوقود للزبائن." : "يمكنك الاطلاع على الأسعار والتوفر دون تغييرها."}
            </AlertBanner>
          )}
          {data.priceReports.count > 0 && (
            <AlertBanner tone="warning" title={`${data.priceReports.count === 1 ? "بلاغ سعر" : `${data.priceReports.count} بلاغات سعر`} من الزبائن`}
              action={<Button variant="secondary" disabled title="شاشة الشكاوى قريباً">عرض البلاغات</Button>}>
              {data.priceReports.latest ? `آخرها: «${data.priceReports.latest}». ` : ""}راجع السعر المنشور قبل النشر.
            </AlertBanner>
          )}
          {result && (
            <AlertBanner tone={result.tone} title={result.title}>
              <ul className="list-disc ps-5">{result.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            </AlertBanner>
          )}

          {products.length === 0 ? (
            <AlertBanner tone="info" title="لا توجد أنواع وقود مفعّلة">أضف أنواع الوقود من الإعدادات.</AlertBanner>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {products.map((p) => (
                <ProductCard key={p.id} p={p} currency={current.currencyLabel} canPublish={canPublish} canAvail={canAvail} canSeeCost={canSeeCost}
                  typed={priceEdits[p.id]} avail={availEdits[p.id]}
                  onPrice={(v) => setPriceEdits((e) => ({ ...e, [p.id]: v }))}
                  onAvail={(a) => setAvailEdits((e) => (a === p.availability ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== p.id)) : { ...e, [p.id]: a }))} />
              ))}
            </div>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <section className="rounded-lg bg-surface-card p-6 shadow-card">
              <h2 className="mb-4 text-heading-h2-20">نشر التغييرات</h2>
              <dl className="flex flex-col gap-3 text-body-regular-14">
                <Row label="عدد التغييرات" value={changeCount === 0 ? "لا شيء" : [priceChanges.length > 0 ? `${priceChanges.length} أسعار` : "", availChanges.length > 0 ? `${availChanges.length} توفر` : ""].filter(Boolean).join(" + ")} />
                <div className="flex justify-between gap-4">
                  <dt className="text-text-secondary">المناوبات المفتوحة الآن</dt>
                  <dd className="text-end font-semibold">
                    {data.openShifts.length === 0 ? "لا توجد"
                      : data.openShifts.map((s) => `${s.pumps.length > 1 ? "المضخات" : "المضخة"} ${s.pumps.join("، ")} (${s.attendant})`).join(" · ")}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 rounded-md bg-status-info-50 p-3 text-body-small-12 text-status-info-700">
                {data.openShifts.length > 0
                  ? "المناوبات المفتوحة الآن تبقى على السعر القديم حتى تُغلق، والمناوبات التي تُفتح بعد النشر تأخذ السعر الجديد. يُسجَّل التغيير في سجل المراجعة."
                  : "لا توجد مناوبات مفتوحة: السعر الجديد يسري على أول مناوبة تُفتح بعد النشر. يُسجَّل التغيير في سجل المراجعة."}
              </p>

              {large.length > 0 && (
                <label className="mt-3 flex items-start gap-2 rounded-md bg-status-warning-50 p-3 text-body-regular-14 text-status-warning-700">
                  <input type="checkbox" checked={confirmLarge} onChange={(e) => setConfirmLarge(e.target.checked)} className="mt-1 size-4 accent-[var(--color-status-warning)]" />
                  <span>تغيير كبير في سعر {large.map((l) => l.p.name).join("، ")} (أكثر من 25%). أؤكد أن الرقم صحيح.</span>
                </label>
              )}

              {schedule && (
                <label className="mt-3 flex flex-col gap-1 text-label-12 text-text-secondary">
                  موعد سريان الأسعار الجديدة
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
                    className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-regular-14 text-text-primary" />
                  <span className="text-body-small-12 text-text-muted">التوفر يُحفظ فوراً؛ الأسعار تسري عند الموعد على المناوبات التي تُفتح بعده.</span>
                </label>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="action" size="lg" disabled={!!blockedReason || busy} onClick={publish}>
                  {busy ? "جارٍ النشر…" : schedule ? "جدولة الأسعار" : "نشر الأسعار الآن"}
                </Button>
                <Button variant="secondary" size="lg" disabled={busy || !canPublish} onClick={() => setSchedule((s) => !s)}
                  title={canPublish ? undefined : "نشر الأسعار متاح لصاحب المحطة فقط"}>
                  {schedule ? "نشر فوري" : "جدولة النشر"}
                </Button>
                {changeCount > 0 && <Button variant="ghost" onClick={() => { setPriceEdits({}); setAvailEdits({}); setConfirmLarge(false); }}>تراجع عن التعديلات</Button>}
              </div>
              {blockedReason && changeCount > 0 && <p role="status" className="mt-2 text-body-small-12 text-text-secondary">{blockedReason}</p>}
            </section>

            <CustomerView data={data} />
          </div>

          {showHistory && <History data={data} now={now} />}
        </>
      )}
    </div>
  );
}

// ---------- one fuel ----------
function ProductCard({ p, currency, canPublish, canAvail, canSeeCost, typed, avail, onPrice, onAvail }: {
  p: ProductRow; currency: string; canPublish: boolean; canAvail: boolean; canSeeCost: boolean;
  typed: string | undefined; avail: Availability | undefined; onPrice: (v: string) => void; onAvail: (a: Availability) => void;
}) {
  const old = p.price === null ? null : cents(p.price);
  const newC = typed !== undefined && typed.trim() !== "" ? parsePriceCents(typed) : null;
  const bad = typed !== undefined && typed.trim() !== "" && newC === null;
  const changed = newC !== null && newC !== old;
  const shownAvail = avail ?? p.availability;
  const effective = newC ?? old;
  const margin = effective !== null && p.avgCostCents !== null ? marginOf(effective, p.avgCostCents) : null;
  const badge = changed ? ["warning", "تغيير غير منشور"] as const : p.scheduled.length > 0 ? ["info", "مجدول"] as const : ["neutral", "دون تغيير"] as const;

  return (
    <section className={cx("flex flex-col gap-4 rounded-lg bg-surface-card p-5 shadow-card", changed && "ring-2 ring-brand-primary")}>
      <header className="flex items-center justify-between">
        <h2 className="text-heading-h2-20">{p.name}</h2>
        <StatusBadge tone={badge[0]}>{badge[1]}</StatusBadge>
      </header>

      <div className="grid grid-cols-2 items-end gap-3">
        <div>
          <p className="text-body-small-12 text-text-secondary">السعر المنشور</p>
          <p className="text-number-xl-32">{p.price === null ? "—" : priceText(p.price)}</p>
          <p className="text-body-small-12 text-text-muted">{currency}/لتر{p.priceSince ? ` · ${timeAgo(p.priceSince)}` : ""}</p>
        </div>
        <label className="flex flex-col gap-1 text-body-small-12 text-text-secondary">
          السعر الجديد
          <input inputMode="decimal" autoComplete="off" disabled={!canPublish} value={typed ?? ""} placeholder={p.price === null ? "0" : priceText(p.price)}
            onChange={(e) => onPrice(e.target.value)} aria-invalid={bad || undefined}
            title={canPublish ? undefined : "نشر الأسعار متاح لصاحب المحطة فقط"}
            className={cx("h-14 rounded-md border bg-surface-card px-3 text-number-l-24 text-text-primary outline-none focus:ring-2 focus:ring-brand-primary-50 disabled:bg-surface-muted",
              bad ? "border-status-danger" : changed ? "border-2 border-brand-primary" : "border-border-strong")} />
        </label>
      </div>
      {bad && <p className="-mt-2 text-body-small-12 text-status-danger-700">أدخل رقماً موجباً بخانتين عشريتين على الأكثر</p>}
      {p.scheduled.length > 0 && (
        <p className="-mt-2 text-body-small-12 text-status-info-700">
          مجدول: {p.scheduled.map((s) => `${priceText(s.price)} ${currency} من ${formatDay(new Date(s.effectiveAt))} ${formatTime(s.effectiveAt)}`).join(" ثم ")}
        </p>
      )}

      {canSeeCost ? (
        <div className={cx("flex items-baseline justify-between rounded-md p-3 text-body-small-12", margin && margin.marginC < 0n ? "bg-status-danger-50 text-status-danger-700" : "bg-surface-muted")}>
          {margin && p.avgCostCents !== null ? (
            <>
              <span className="text-text-secondary">متوسط تكلفة الشراء {priceText(centsStr(p.avgCostCents))} <span className="text-text-muted">(تقديري)</span></span>
              <span className={cx("text-body-strong-14", margin.marginC < 0n ? "text-status-danger-700" : "text-brand-action-700")}>
                الهامش {priceText(centsStr(margin.marginC))} {currency} ({formatNumber(margin.percentTenths / 10, 1)}%)
              </span>
            </>
          ) : (
            <span className="text-text-secondary">لا توجد تكلفة شراء مسجّلة لهذا الوقود بعد — أدخل سعر أول توريد ليظهر الهامش.</span>
          )}
        </div>
      ) : (
        <p className="rounded-md bg-surface-muted p-3 text-body-small-12 text-text-secondary">الهامش متاح لصاحب المحطة والمحاسب فقط</p>
      )}

      <div>
        <p className="mb-2 text-body-strong-14">التوفر المعروض للزبائن</p>
        <div role="radiogroup" aria-label={`توفر ${p.name}`} className="grid grid-cols-3 gap-1 rounded-md bg-surface-muted p-1">
          {AVAIL.map(([id, label, dot]) => (
            <button key={id} type="button" role="radio" aria-checked={shownAvail === id} disabled={!canAvail} onClick={() => onAvail(id)}
              title={canAvail ? undefined : "تغيير التوفر متاح لصاحب المحطة ومدير المناوبة"}
              className={cx("flex h-10 items-center justify-center gap-2 rounded-sm text-body-strong-14 disabled:cursor-not-allowed",
                shownAvail === id ? "bg-surface-card shadow-card" : "text-text-secondary")}>
              <span aria-hidden className={cx("size-2 rounded-full", dot)} />{label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-body-small-12 text-text-secondary">
          {p.bookPct !== null ? `المخزون الدفتري ${p.bookPct}%` : "لا توجد خزانات"}
          {p.suggestion === "limited" && shownAvail !== "limited" ? ` — مقترح «محدود» لأن المخزون تحت الحد الأدنى (${p.minPct}%)` : ""}
          {p.availabilityAt ? ` · آخر تحديث ${timeAgo(p.availabilityAt)} · ${p.availabilitySource === "manual" ? "يدوي" : "محسوب من المخزون"}` : " · لم يُحدَّد التوفر بعد"}
        </p>
      </div>
    </section>
  );
}

// ---------- what the customer sees ----------
function CustomerView({ data }: { data: PricesData }) {
  return (
    <section className="rounded-lg bg-surface-card p-6 shadow-card">
      <h2 className="mb-4 text-heading-h2-20">ما سيراه الزبون</h2>
      {!data.publicVisible ? (
        <AlertBanner tone="info" title="المحطة غير ظاهرة لتطبيق الزبائن بعد">
          حالة المحطة: {STATION_STATUS[data.stationStatus] ?? data.stationStatus}. تظهر الأسعار للزبائن عندما تصبح المحطة فعّالة.
        </AlertBanner>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.products.map((p) => {
            const a = p.publicAvailability ? AVAIL_BADGE[p.publicAvailability] : undefined;
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-md bg-surface-muted p-3">
                <span className="text-body-strong-14">{p.name}</span>
                <span className="flex items-center gap-3">
                  {a ? <StatusBadge tone={a[0]}>{a[1]}</StatusBadge> : <StatusBadge tone="neutral">غير محدد</StatusBadge>}
                  <span className="text-number-m-18">{p.publicPrice === null ? "—" : priceText(p.publicPrice)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-body-small-12 text-text-muted">
        {data.products.some((p) => p.publicUpdatedAt) ? `آخر تحديث ${timeAgo(data.products.map((p) => p.publicUpdatedAt).filter((s): s is string => !!s).sort().at(-1)!)} · من إدارة المحطة` : "لا يوجد تحديث بعد"}
      </p>
    </section>
  );
}

// ---------- history ----------
function History({ data, now }: { data: PricesData; now: number }) {
  return (
    <section className="rounded-lg bg-surface-card p-6 shadow-card">
      <h2 className="mb-4 text-heading-h2-20">سجل الأسعار</h2>
      {data.history.length === 0 ? (
        <p className="text-body-regular-14 text-text-secondary">لم يُنشر أي سعر بعد.</p>
      ) : (
        <table className="w-full text-body-regular-14">
          <thead>
            <tr className="bg-surface-muted text-body-small-12 text-text-secondary">
              <th className="rounded-s-md p-3 text-start font-semibold">الوقود</th>
              <th className="p-3 text-start font-semibold">السعر</th>
              <th className="p-3 text-start font-semibold">يسري من</th>
              <th className="rounded-e-md p-3 text-start font-semibold">نشره</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((h) => (
              <tr key={h.id} className="border-t border-border-default">
                <td className="p-3 font-semibold">{h.product}</td>
                <td className="p-3">{priceText(h.price)}</td>
                <td className="p-3 text-text-secondary">
                  {formatDay(new Date(h.effectiveAt))} {formatTime(h.effectiveAt)}
                  {h.inForce && <span className="ms-2"><StatusBadge tone="success">الحالي</StatusBadge></span>}
                  {Date.parse(h.effectiveAt) > now && <span className="ms-2"><StatusBadge tone="info">مجدول</StatusBadge></span>}
                </td>
                <td className="p-3 text-text-secondary">{h.by || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-text-secondary">{label}</dt><dd className="font-semibold">{value}</dd></div>;
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <span key={i} className="h-96 animate-pulse rounded-lg bg-surface-muted" />)}</div>
      <span className="h-56 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}
