"use client";
// S8 «بيع آجل لشركة» and S9 «تجاوز الحد وطلب موافقة» (design/screens/S8.png, S9.png).
// Online only: the company and its remaining limit come from lookup_company_for_sale.
// record_sale is always queued with p_request_approval = true: if the limit moved before the row reaches
// the server, the fill becomes «بانتظار موافقة المدير» instead of a refusal that would stop the queue.
import { errorMessage, formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, Input, operationsText, StatusBadge } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { overBy, possibleLiters, remainingPercent } from "@/lib/credit-math";
import { currentLeg, db, getDevice, type CurrentMember, type LocalShift, type StationRef } from "@/lib/db";
import { centsToString, toCents } from "@/lib/money";
import { assertRoom, newOutboxRow, OutboxFullError, syncNow } from "@/lib/outbox";
import { normalizeDigits } from "@/lib/reading";
import { amountFromLiters, milliToString, parseLitersMilli } from "@/lib/sale-math";
import { signedInMember } from "@/lib/session";
import { priceAt } from "@/lib/shift-math";
import { supabase } from "@/lib/supabase";
import { useOnline } from "@/lib/use-online";
import { useOutbox } from "@/lib/use-sync";
import { newId } from "@/lib/uuid";
import { SavedSale } from "../../saved-sale";
import { CheckIcon } from "../../shift-parts";
import { HeaderChip, WorkerHeader } from "../../worker-header";

/** lookup_company_for_sale(). The optional fields are requested from Cowork (brief 02c) and shown when present. */
type Company = {
  company_id: string;
  name: string;
  status: "active" | "frozen" | "suspended";
  remaining_credit: number | string;
  vehicle_id: string | null;
  vehicle_label: string | null;
  plate: string | null;
  credit_limit?: number | string;
  drivers?: { driver_id: string; full_name: string }[];
  last_odometer?: number | null;
};

type Lookup =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "offline" }
  | { status: "error" }
  | { status: "found"; company: Company; at: string };

export default function CreditSalePage() {
  const router = useRouter();
  const online = useOnline();
  const [me, setMe] = useState<CurrentMember>();
  const [shift, setShift] = useState<LocalShift>();
  const [ref, setRef] = useState<StationRef>();
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [driverId, setDriverId] = useState<string>();
  const [nozzleId, setNozzleId] = useState<string>();
  const [odometer, setOdometer] = useState("");
  const [liters, setLiters] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [savedId, setSavedId] = useState<string>();
  const busy = useRef(false);
  const outbox = useOutbox(me?.userId);

  useEffect(() => {
    (async () => {
      const m = await signedInMember();
      if (!m) return router.replace("/");
      const local = await db.shift.get(m.userId).catch(() => undefined);
      if (!local || local.status !== "open" || !currentLeg(local)) return router.replace("/shift");
      setRef(await db.reference.get(m.stationId).catch(() => undefined));
      setMe(m);
      setShift(local);
      setNozzleId(currentLeg(local)?.readings[0]?.nozzleId);
    })();
  }, [router]);

  if (!me || !shift) return <main className="min-h-dvh bg-surface-page" aria-busy />;

  const leg = currentLeg(shift)!;
  const currency = ref?.currencyLabel ?? "ل.س";
  const money = (c: bigint) => formatMoney(centsToString(c), currency);
  const nozzle = leg.readings.find((r) => r.nozzleId === nozzleId) ?? leg.readings[0];
  const price = nozzle && ref ? priceAt(ref.prices, nozzle.productId, shift.openedAt) : null;
  const company = lookup.status === "found" ? lookup.company : undefined;
  const remaining = company ? toCents(String(company.remaining_credit)) ?? 0n : 0n;
  const litersMilli = parseLitersMilli(liters);
  const amount = litersMilli !== null && price !== null ? amountFromLiters(litersMilli, price) : null;
  const over = amount !== null ? overBy(amount, remaining) : 0n;
  const possible = price !== null ? possibleLiters(remaining, price) : 0;
  const odometerValue = normalizeDigits(odometer);
  const odometerOk = odometerValue === "" || /^\d{1,7}$/.test(odometerValue);
  const problem =
    !company ? "ابحث عن الشركة أولاً"
    : company.status !== "active" ? errorMessage(`FUELOS_COMPANY_${company.status.toUpperCase()}`)
    : price === null ? "لا يوجد سعر لهذا الوقود في بداية المناوبة — اتصل بالمدير"
    : liters === "" ? "أدخل الكمية باللتر"
    : litersMilli === null || litersMilli <= 0 ? "أدخل الكمية بثلاث خانات عشرية على الأكثر"
    : !odometerOk ? "عداد السيارة أرقام فقط"
    : undefined;

  async function find(e?: FormEvent) {
    e?.preventDefault();
    const q = normalizeDigits(query).trim() || query.trim();
    if (!q || !me) return;
    if (!navigator.onLine) return setLookup({ status: "offline" });
    setLookup({ status: "loading" });
    setDriverId(undefined);
    const { data, error, status } = await supabase()
      .rpc("lookup_company_for_sale", { p_station: me.stationId, p_query: q })
      .abortSignal(AbortSignal.timeout(15_000));
    if (error) return setLookup({ status: status === 0 ? "offline" : "error" });
    if (!data) return setLookup({ status: "not-found" });
    setLookup({ status: "found", company: data as Company, at: new Date().toISOString() });
  }

  async function save() {
    if (busy.current) return;                           // a double tap must not record two fills
    busy.current = true;
    try {
      if (!me || !shift || !company || !nozzle || price === null || litersMilli === null || amount === null || problem || saving) return;
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
        p_method: "credit",
        p_company: company.company_id,
        p_driver: driverId ?? null,
        p_vehicle: company.vehicle_id,
        p_odometer: odometerValue === "" ? null : Number(odometerValue),
        p_request_approval: true,
        p_device: device?.deviceId ?? null,
        p_client_created_at: new Date().toISOString(),
      };
      const meta = {
        amount: centsToString(amount), product: nozzle.label, pump: String(leg.pumpNumber), company: company.name,
        vehicle: [company.vehicle_label, company.plate].filter(Boolean).join(" · "), overLimit: String(over > 0n),
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

  const chips = (
    <>
      <HeaderChip>المناوبة مفتوحة · منذ {formatTime(shift.openedAt)}</HeaderChip>
      <HeaderChip>المضخة {leg.pumpNumber} · {nozzle?.label}</HeaderChip>
    </>
  );

  const saved = savedId ? outbox.byId.get(savedId) : undefined;
  if (savedId && saved) {
    return (
      <div className="min-h-dvh bg-surface-page pb-48">
        <WorkerHeader userId={me.userId} name={me.displayName} stationName={ref?.stationName} chips={chips} />
        <SavedSale row={saved} unsent={outbox.unsent} currency={currency} onNew={() => router.replace("/shift")}
          newLabel="العودة إلى التعبئة" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-surface-page pb-52">
      <WorkerHeader userId={me.userId} name={me.displayName} stationName={ref?.stationName} chips={chips} />

      <main className="mx-auto flex w-full max-w-[390px] flex-col gap-4 px-4 pt-4">
        <header className="flex items-center justify-between">
          <h1 className="text-heading-h1-24">بيع آجل لشركة</h1>
          <StatusBadge tone="primary">دون دفع الآن</StatusBadge>
        </header>

        {!online && lookup.status !== "found" && (
          <AlertBanner tone="warning" title="البيع الآجل يحتاج اتصالاً">
            نتحقق من رصيد الشركة على الخادم قبل التعبئة. اطلب الدفع نقداً أو انتظر الاتصال.
          </AlertBanner>
        )}

        <form onSubmit={find} className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-card p-2">
          <input
            aria-label="رقم اللوحة أو رمز بطاقة الشركة"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="رقم اللوحة أو رمز البطاقة"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent px-2 font-sans text-body-large-16 outline-none placeholder:text-text-muted"
          />
          <Button type="submit" variant="primary" disabled={!query.trim() || lookup.status === "loading"}>
            {lookup.status === "loading" ? "جارٍ البحث…" : "بحث"}
          </Button>
        </form>
        <p className="-mt-2 text-body-small-12 text-text-muted">مسح QR من بطاقة السائق: قريباً. اكتب رقم اللوحة أو الرمز المطبوع على البطاقة.</p>

        {lookup.status === "loading" && <span aria-busy className="h-28 animate-pulse rounded-lg bg-surface-muted" />}
        {lookup.status === "not-found" && (
          <AlertBanner tone="info" title="لا توجد شركة بهذه اللوحة أو الرمز">
            تأكد من الرقم، أو اطلب الدفع نقداً أو بالبطاقة.
          </AlertBanner>
        )}
        {lookup.status === "offline" && (
          <AlertBanner tone="warning" title="لا يوجد اتصال — البيع الآجل يحتاج إنترنت">حاول مرة أخرى عند عودة الاتصال.</AlertBanner>
        )}
        {lookup.status === "error" && (
          <AlertBanner tone="danger" title="تعذّر البحث عن الشركة" action={<Button variant="secondary" onClick={() => find()}>إعادة المحاولة</Button>}>
            حاول مرة أخرى، وإن تكرر الخطأ فاتصل بالمدير.
          </AlertBanner>
        )}

        {company && lookup.status === "found" && (
          <>
            <section className={cx("rounded-lg border-2 bg-surface-card p-4",
              company.status === "active" ? "border-brand-primary" : "border-status-danger")}>
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-primary-50 text-brand-primary"><BuildingIcon /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-heading-h3-16">{company.name}</p>
                  <p className="text-body-small-12 text-text-secondary">
                    {[company.vehicle_label, company.plate].filter(Boolean).join(" · ") || "المركبة غير محددة"}
                  </p>
                </div>
                {driverId && <StatusBadge tone="success">سائق مصرّح</StatusBadge>}
              </div>
              {company.status === "active" ? (
                <>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-body-regular-14 text-text-secondary">الحد المتبقي</span>
                    <span className="text-number-l-24">{money(remaining)}</span>
                  </div>
                  {company.credit_limit !== undefined && (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted" role="img"
                      aria-label={`المتبقي ${remainingPercent(remaining, toCents(String(company.credit_limit)) ?? 0n)}% من الحد`}>
                      <div className="h-full rounded-full bg-status-warning"
                        style={{ width: `${remainingPercent(remaining, toCents(String(company.credit_limit)) ?? 0n)}%` }} />
                    </div>
                  )}
                  <p className="mt-2 text-body-small-12 text-text-muted">آخر تحديث {formatTime(lookup.at)} · من الخادم</p>
                </>
              ) : (
                <AlertBanner tone="danger" className="mt-3"
                  title={errorMessage(`FUELOS_COMPANY_${company.status.toUpperCase()}`)} />
              )}
            </section>

            {company.status === "active" && (
              <>
                {company.drivers && company.drivers.length > 0 && (
                  <div role="radiogroup" aria-label="السائق" className="flex flex-wrap gap-2">
                    {company.drivers.map((d) => (
                      <button key={d.driver_id} type="button" role="radio" aria-checked={driverId === d.driver_id}
                        onClick={() => setDriverId(driverId === d.driver_id ? undefined : d.driver_id)}
                        className={cx("h-10 rounded-full border px-4 text-body-strong-14",
                          driverId === d.driver_id ? "border-brand-primary bg-brand-primary-50" : "border-border-default bg-surface-card")}>
                        {d.full_name}
                      </button>
                    ))}
                  </div>
                )}

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

                <div className="grid grid-cols-2 gap-3">
                  <Input size="lg" label="الكمية" inputMode="decimal" autoComplete="off" suffix="لتر"
                    value={liters} onChange={(e) => setLiters(e.target.value)}
                    error={over > 0n && amount !== null ? `= ${money(amount)} · أكثر من المتبقي بـ ${money(over)}` : undefined}
                    helper={amount !== null ? `= ${money(amount)}` : undefined} />
                  <Input size="lg" label="عداد السيارة" inputMode="numeric" autoComplete="off" suffix="كم"
                    value={odometer} onChange={(e) => setOdometer(e.target.value)}
                    error={odometerOk ? undefined : "أرقام فقط"}
                    helper={company.last_odometer != null ? `السابق ${formatNumber(company.last_odometer)}` : "اختياري"} />
                </div>

                {amount !== null && over === 0n && (
                  <AlertBanner tone="success" title="تُضاف العملية فوراً إلى كشف الشركة">
                    ويبقى {money(remaining - amount)} من الحد.
                  </AlertBanner>
                )}

                {over > 0n && (
                  <>
                    <AlertBanner tone="danger" title="العملية تتجاوز الحد المتبقي">
                      لن تُرفض بصمت: اختر تعبئة الممكن الآن أو اطلب موافقة المدير.
                    </AlertBanner>
                    <section className="rounded-lg bg-surface-muted p-4">
                      <p className="text-label-12 text-text-secondary">قل للسائق</p>
                      <p className="mt-1 text-heading-h3-16">
                        {possible > 0
                          ? `«رصيد الشركة يكفي ${formatNumber(possible)} لتر الآن. أعبّيها لك، أو أطلب موافقة المدير على الكمية كاملة.»`
                          : "«رصيد الشركة لا يكفي الآن. أطلب موافقة المدير على الكمية كاملة، أو ادفع نقداً.»"}
                      </p>
                    </section>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>

      {company?.status === "active" && (
        <footer className="fixed inset-x-0 bottom-0 border-t border-border-default bg-surface-card">
          <div className="mx-auto flex w-full max-w-[390px] flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
            {(saveError || problem) && (
              <p role="status" className={cx("text-center text-body-small-12", saveError ? "text-status-danger-700" : "text-text-secondary")}>
                {saveError ?? problem}
              </p>
            )}
            {over > 0n && possible > 0 && (
              <Button variant="secondary" size="lg" block onClick={() => setLiters(String(possible))}>
                تعبئة {formatNumber(possible)} لتر فقط
              </Button>
            )}
            <Button variant={over > 0n ? "primary" : "action"} size="lg" block disabled={!!problem || saving} onClick={save}>
              <CheckIcon />
              {saving ? "جارٍ الحفظ…" : over > 0n ? "طلب موافقة المدير" : "اعتماد العملية"}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

function BuildingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
    </svg>
  );
}
