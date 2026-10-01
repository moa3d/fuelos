"use client";
// S2 «تعبئة سريعة» (design/screens/S2.png) and S3 «تم حفظ العملية» (S3.png) — the home of an open shift.
// Every fill is recorded (owner's decision 2026-09-26; cash fills don't change expected cash).
// The price is the one locked at shift open; record_sale goes into the outbox with the current leg (p_leg).
import { formatMoney, formatNumber } from "@fuelos/core";
import { AlertBanner, Button, cx, Input, operationsText, StatusBadge } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { lookupCustomerForSale, type CustomerMatch } from "@/lib/customer-lookup";
import { currentLeg, db, getDevice, type CurrentMember, type StationRef } from "@/lib/db";
import { centsToString, toCents } from "@/lib/money";
import { assertRoom, newOutboxRow, OutboxFullError, syncNow } from "@/lib/outbox";
import { parseCash } from "@/lib/reading";
import { amountFromLiters, litersFromAmount, milliToString, parseLitersMilli } from "@/lib/sale-math";
import { salesOfShift, type PaymentMethod } from "@/lib/sales";
import { signedInMember } from "@/lib/session";
import { routeFor } from "@/lib/shift-merge";
import { priceAt } from "@/lib/shift-math";
import { useOnline } from "@/lib/use-online";
import { useLiveShift, useOutbox } from "@/lib/use-sync";
import { newId } from "@/lib/uuid";
import { CheckIcon, StickyAction } from "../shift-parts";
import { SavedSale } from "../saved-sale";
import { HeaderChip, WorkerHeader } from "../worker-header";

type Mode = "liters" | "amount";
const QUICK_AMOUNTS = ["2000", "5000", "10000"];
const METHODS: { id: PaymentMethod; label: string; icon: ReactNode; soon?: string }[] = [
  { id: "cash", label: "نقدي", icon: <CashIcon /> },
  { id: "card", label: "بطاقة", icon: <CardIcon /> },
  { id: "credit", label: "آجل لشركة", icon: <BuildingIcon /> },
  { id: "voucher", label: "قسيمة", icon: <TicketIcon /> },
];

export default function QuickFillPage() {
  const router = useRouter();
  const [me, setMe] = useState<CurrentMember>();
  const [ref, setRef] = useState<StationRef>();
  const [now] = useState(() => Date.now());
  const [mode, setMode] = useState<Mode>("amount");
  const [value, setValue] = useState("");
  const [nozzleId, setNozzleId] = useState<string>();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [customer, setCustomer] = useState<CustomerMatch | null>(null);
  const [hint, setHint] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [savedId, setSavedId] = useState<string>();
  const busy = useRef(false);
  const outbox = useOutbox(me?.userId);
  const online = useOnline();
  // live: when the owner returns or decides the close, the device learns it (lib/shift-sync.ts) and this follows
  const { shift, loaded } = useLiveShift(me?.userId);

  useEffect(() => {
    (async () => {
      const m = await signedInMember();
      if (!m) return router.replace("/");
      const local = await db.shift.get(m.userId).catch(() => undefined);
      if (!local) return router.replace("/shift/start");
      if (local.status !== "open") return router.replace(routeFor(local));
      setRef(await db.reference.get(m.stationId).catch(() => undefined));
      setMe(m);
      setNozzleId(currentLeg(local)?.readings[0]?.nozzleId);
    })();
  }, [router]);

  useEffect(() => {
    if (!loaded) return;
    if (!shift) router.replace("/shift/start");
    else if (shift.status !== "open") router.replace(routeFor(shift));
  }, [loaded, shift, router]);

  if (!me || !shift) return <main className="min-h-dvh bg-surface-page" aria-busy />;

  const leg = currentLeg(shift);
  const currency = ref?.currencyLabel ?? "ل.س";
  const nozzle = leg?.readings.find((r) => r.nozzleId === nozzleId) ?? leg?.readings[0];
  const price = nozzle && ref ? priceAt(ref.prices, nozzle.productId, shift.openedAt) : null;
  const amountTyped = mode === "amount" ? parseCash(value) : null;
  const litersMilli =
    price === null ? null
    : mode === "amount" ? (amountTyped === null ? null : litersFromAmount(toCents(amountTyped)!, price))
    : parseLitersMilli(value);
  const recordedCents = litersMilli !== null && price !== null ? amountFromLiters(litersMilli, price) : null;
  const money = (c: bigint) => formatMoney(centsToString(c), currency);
  const hours = (now - Date.parse(shift.openedAt)) / 3_600_000;
  const elapsed = `${Math.floor(hours)}:${String(Math.floor((hours % 1) * 60)).padStart(2, "0")}`;
  const shiftSales = salesOfShift(outbox.byId.values(), shift.shiftId);
  const problem =
    !leg ? "لا توجد مضخة حالية — اتصل بالمدير"
    : price === null ? "لا يوجد سعر لهذا الوقود في بداية المناوبة — اتصل بالمدير"
    : value === "" ? (mode === "amount" ? "أدخل المبلغ المدفوع" : "أدخل عدد اللترات")
    : litersMilli === null ? (mode === "amount" ? "أدخل مبلغاً بالأرقام دون كسور" : "أدخل اللترات بثلاث خانات عشرية على الأكثر")
    : litersMilli <= 0 ? "الكمية يجب أن تكون أكبر من صفر"
    : undefined;

  function setAmountQuick(v: string) {
    setMode("amount");
    setValue(v);
    setHint(undefined);
  }

  function fullTank() {
    setMode("liters");
    setValue("");
    setHint("املأ حتى يمتلئ الخزان، ثم اكتب اللترات كما تظهر على شاشة المضخة");
  }

  function resetForm() {
    setValue("");
    setHint(undefined);
    setMethod("cash");
    setCustomer(null);
    setSaveError(undefined);
    setSavedId(undefined);
  }

  async function save() {
    if (busy.current) return;                           // a double tap must not record two fills
    busy.current = true;
    try {
      if (!me || !shift || !leg || !nozzle || price === null || litersMilli === null || recordedCents === null || problem || saving) return;
      setSaving(true);
      setSaveError(undefined);
      const saleId = newId();
      const device = await getDevice().catch(() => undefined);
      const params = {
        p_sale_id: saleId,
        p_shift: shift.shiftId,
        p_leg: leg.legId,
        p_nozzle: nozzle.nozzleId,
        p_liters: milliToString(litersMilli),
        p_unit_price: centsToString(price),
        p_method: method,
        p_customer: customer?.customerId ?? null,
        p_device: device?.deviceId ?? null,
        p_client_created_at: new Date().toISOString(),
      };
      const meta = {
        amount: centsToString(recordedCents), product: nozzle.label, pump: String(leg.pumpNumber),
        ...(customer ? { customer: customer.displayName } : {}),
      };
      try {
        await db.transaction("rw", db.outbox, async () => {
          await assertRoom(me.userId, ref?.offlineMaxOps ?? 50);
          await db.outbox.add(newOutboxRow(me.userId, "record_sale", saleId, params, meta));
        });
      } catch (e) {
        setSaveError(e instanceof OutboxFullError
          ? `وصلت إلى ${operationsText(e.limit)} غير متزامنة — اتصل بالإنترنت لإكمال المزامنة`
          : "تعذّر الحفظ على هذا الجهاز — أغلق التطبيق وافتحه من جديد");
        return;
      }
      void syncNow();
      setSavedId(saleId);
    } finally {
      setSaving(false);
      busy.current = false;
    }
  }

  const chips = leg && (
    <>
      <HeaderChip><ClockIcon /> المناوبة مفتوحة · {elapsed}</HeaderChip>
      <HeaderChip><PumpIcon /> المضخة {leg.pumpNumber} · {nozzle?.label}</HeaderChip>
    </>
  );

  // ---------- S3: تم حفظ العملية ----------
  const saved = savedId ? outbox.byId.get(savedId) : undefined;
  if (savedId && saved) {
    return (
      <div className="min-h-dvh bg-surface-page pb-48">
        <WorkerHeader userId={me.userId} name={me.displayName} stationName={ref?.stationName} chips={chips} />
        <SavedSale row={saved} unsent={outbox.unsent} currency={currency} onNew={resetForm} />
      </div>
    );
  }

  // ---------- S2: تعبئة سريعة ----------
  return (
    <div className="min-h-dvh bg-surface-page pb-48">
      <WorkerHeader userId={me.userId} name={me.displayName} stationName={ref?.stationName} chips={chips} />

      <main className="mx-auto flex w-full max-w-[390px] flex-col gap-4 px-4 pt-4">
        {ref && hours > ref.maxShiftHours && (
          <AlertBanner tone="warning" title={`مرّت أكثر من ${ref.maxShiftHours} ساعة على بداية المناوبة`}>
            أغلق المناوبة، أو اتصل بالمدير إن كان عليك الاستمرار.
          </AlertBanner>
        )}
        {shift.returnedNote && (
          <AlertBanner tone="warning" title="أعاد صاحب المحطة إغلاقك للتصحيح"
            action={<Button variant="secondary" onClick={() => router.push("/shift/close")}>أغلق من جديد</Button>}>
            ملاحظته: «{shift.returnedNote}». صحّح ما طلبه ثم أغلق المناوبة مرة أخرى؛ القراءات النهائية تُدخَل من جديد.
          </AlertBanner>
        )}
        {!leg && <AlertBanner tone="danger" title="لا توجد مضخة حالية لهذه المناوبة">اتصل بالمدير.</AlertBanner>}

        {leg && (
          <>
            <div role="radiogroup" aria-label="طريقة الإدخال" className="grid grid-cols-2 gap-1 rounded-md bg-surface-muted p-1">
              {(["liters", "amount"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m}
                  onClick={() => { setMode(m); setValue(""); setHint(undefined); }}
                  className={cx("h-11 rounded-sm text-body-strong-14", mode === m ? "bg-surface-card shadow-card" : "text-text-secondary")}>
                  {m === "liters" ? "باللتر" : "بالمبلغ"}
                </button>
              ))}
            </div>

            {leg.readings.length > 1 && (
              <div role="radiogroup" aria-label="المسدس" className="flex gap-2">
                {leg.readings.map((r) => (
                  <button key={r.nozzleId} type="button" role="radio" aria-checked={r.nozzleId === nozzle?.nozzleId}
                    onClick={() => setNozzleId(r.nozzleId)}
                    className={cx("h-11 flex-1 rounded-md border text-body-strong-14",
                      r.nozzleId === nozzle?.nozzleId ? "border-2 border-brand-primary bg-brand-primary-50" : "border-border-default bg-surface-card")}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            <section className="rounded-lg border-2 border-brand-primary bg-surface-card p-4">
              <div className="flex items-center justify-between">
                <label htmlFor="fill-value" className="text-label-12 text-text-secondary">
                  {mode === "amount" ? "المبلغ المدفوع" : "عدد اللترات"}
                </label>
                {value && <button type="button" onClick={() => setValue("")} className="text-label-12 text-status-danger-700">مسح</button>}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <input id="fill-value" inputMode={mode === "amount" ? "numeric" : "decimal"} autoComplete="off"
                  value={value} onChange={(e) => setValue(e.target.value)} placeholder="0"
                  className="min-w-0 flex-1 bg-transparent font-sans text-number-hero-44 outline-none placeholder:text-text-muted" />
                <span className="text-heading-h3-16 text-text-muted">{mode === "amount" ? currency : "لتر"}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border-default pt-3">
                <span className="text-number-m-18 text-brand-primary">
                  {litersMilli === null || recordedCents === null ? "=" :
                    mode === "amount" ? `= ${formatNumber(litersMilli / 1000, 2)} لتر` : `= ${money(recordedCents)}`}
                </span>
                <span className="flex items-center gap-1 text-body-small-12 text-text-secondary">
                  <LockIcon /> {price === null ? "لا يوجد سعر" : `${formatMoney(centsToString(price), currency)}/لتر · سعر مقفل`}
                </span>
              </div>
              {mode === "amount" && amountTyped !== null && recordedCents !== null && recordedCents !== toCents(amountTyped) && (
                <p className="mt-2 text-body-small-12 text-text-secondary">
                  يُسجَّل {money(recordedCents)} لأن اللترات تُقرَّب إلى ثلاث خانات عشرية.
                </p>
              )}
              {hint && <p className="mt-2 text-body-small-12 text-status-info-700">{hint}</p>}
            </section>

            <div className="grid grid-cols-4 gap-2">
              {QUICK_AMOUNTS.map((a) => (
                <button key={a} type="button" onClick={() => setAmountQuick(a)}
                  className={cx("h-12 rounded-md border text-body-strong-14",
                    mode === "amount" && value === a ? "border-brand-primary bg-brand-primary-50" : "border-border-default bg-surface-card")}>
                  {formatNumber(Number(a))}
                </button>
              ))}
              <button type="button" onClick={fullTank} className="h-12 rounded-md border border-border-default bg-surface-card text-body-strong-14">
                ملء كامل
              </button>
            </div>

            <section>
              <h2 className="mb-2 text-body-strong-14 text-text-secondary">طريقة الدفع</h2>
              <div role="radiogroup" aria-label="طريقة الدفع" className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => {
                  const active = method === m.id;
                  // company credit needs the server to check the company's remaining limit (S8)
                  const offlineCredit = m.id === "credit" && !online;
                  const note = offlineCredit ? "يحتاج اتصالاً للتحقق من رصيد الشركة" : m.soon;
                  return (
                    <button key={m.id} type="button" role="radio" aria-checked={active} disabled={!!note}
                      onClick={() => (m.id === "credit" ? router.push("/shift/credit") : setMethod(m.id))}
                      className={cx("flex min-h-16 items-center gap-3 rounded-md border px-4 text-start",
                        active ? "border-2 border-brand-primary bg-brand-primary-50"
                        : note ? "border-border-default bg-surface-muted text-text-muted" : "border-border-default bg-surface-card")}>
                      <span className={active ? "text-brand-primary" : "text-text-secondary"}>{m.icon}</span>
                      <span className="flex-1">
                        <span className="block text-body-strong-14">{m.label}</span>
                        {note && <span className="block text-label-11">{note}</span>}
                      </span>
                      {active && <span className="text-brand-primary"><CheckIcon /></span>}
                    </button>
                  );
                })}
              </div>
            </section>

            <CustomerLinkCard stationId={ref?.stationId} online={online} customer={customer} onChange={setCustomer} />

            <section className="flex flex-col gap-2 rounded-lg bg-surface-card p-4 shadow-card">
              <p className="text-body-small-12 text-text-secondary">
                {shiftSales.length === 0 ? "لم تُسجَّل تعبئات في هذه المناوبة بعد"
                  : `سجّلت ${operationsText(shiftSales.length)} في هذه المناوبة`}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => router.push("/shift/move")}>الانتقال إلى مضخة أخرى</Button>
                <Button variant="secondary" onClick={() => router.push("/shift/close")}>إغلاق المناوبة</Button>
              </div>
            </section>
          </>
        )}
      </main>

      {leg && (
        <StickyAction hint={problem} error={saveError} disabled={!!problem || saving} onClick={save}>
          <CheckIcon />
          {saving ? "جارٍ الحفظ…" : "حفظ العملية"}
        </StickyAction>
      )}
    </div>
  );
}

/** «ربط زبون (اختياري)» (docs/briefs/06d, delivered in 06e): needs the network, and never blocks the sale. */
function CustomerLinkCard({ stationId, online, customer, onChange }: {
  stationId: string | undefined; online: boolean; customer: CustomerMatch | null; onChange: (c: CustomerMatch | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  async function search() {
    if (!stationId || !query.trim() || busy) return;
    setBusy(true); setMsg(undefined);
    const res = await lookupCustomerForSale(stationId, query.trim()).catch(() => ({ ok: false as const, message: "تعذّر البحث — تحقق من الاتصال" }));
    setBusy(false);
    if (!res.ok) return setMsg(res.message);
    if (!res.match) return setMsg("لم يُعثر على زبون بهذا الرمز أو الرقم");
    onChange(res.match);
    setOpen(false);
    setQuery("");
  }

  if (customer) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-brand-primary bg-brand-primary-50 p-3">
        <span className="text-brand-primary"><QrIcon /></span>
        <div className="flex-1">
          <p className="text-body-strong-14">تأكد من الاسم: {customer.displayName}</p>
          <p className="text-body-small-12 text-text-secondary">{customer.matchedBy === "card" ? "بالبطاقة" : "بالهاتف"} · نقاطه {formatNumber(customer.points, 0)}</p>
        </div>
        <Button variant="ghost" size="md" onClick={() => onChange(null)}>إلغاء الربط</Button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-3 rounded-md border border-dashed border-border-strong bg-surface-card p-3 text-start">
        <span className="text-text-muted"><QrIcon /></span>
        <div className="flex-1">
          <p className="text-body-strong-14">ربط زبون (اختياري)</p>
          <p className="text-body-small-12 text-text-secondary">فقط إن أراد فاتورة رقمية أو نقاطاً</p>
        </div>
        <StatusBadge tone="neutral">ربط</StatusBadge>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-default bg-surface-card p-3">
      {!online ? (
        <p className="text-body-small-12 text-status-warning-700">الربط يحتاج اتصالاً — يمكن البيع بدون ربط</p>
      ) : (
        <>
          <Input size="md" label="رمز البطاقة أو رقم الهاتف" dir="ltr" autoComplete="off" value={query}
            onChange={(e) => setQuery(e.target.value)} error={msg} />
          <div className="flex gap-2">
            <Button variant="action" size="md" disabled={!query.trim() || busy} onClick={search}>{busy ? "جارٍ البحث…" : "بحث"}</Button>
            <Button variant="ghost" size="md" onClick={() => { setOpen(false); setQuery(""); setMsg(undefined); }}>إلغاء</Button>
          </div>
        </>
      )}
      {!online && <Button variant="ghost" size="md" onClick={() => setOpen(false)}>إغلاق</Button>}
    </div>
  );
}

const svg = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
function CashIcon() { return <svg {...svg}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>; }
function CardIcon() { return <svg {...svg}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>; }
function BuildingIcon() { return <svg {...svg}><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" /></svg>; }
function TicketIcon() { return <svg {...svg}><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2z" /><path d="M13 6v12" strokeDasharray="2 2" /></svg>; }
function QrIcon() { return <svg {...svg}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" /></svg>; }
function LockIcon() { return <svg {...svg} width={14} height={14}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>; }
function ClockIcon() { return <svg {...svg} width={14} height={14}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>; }
function PumpIcon() { return <svg {...svg} width={14} height={14}><path d="M3 22h12M4 9h10M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" /></svg>; }
