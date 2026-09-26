"use client";
// S4–S6 — إغلاق المناوبة (design/screens/S4.png, S5.png, S6.png; spec §6 with legs):
// 1. closing readings of the CURRENT pump, 2. counted cash, 3. review of every leg → «إرسال للاعتماد».
// Online: fresh station data, and totals from the server's shift_summary (price at shift open) plus the typed
// current pump. Offline: a device preview labelled «تقديري». submit_shift recomputes everything anyway.
import { formatMoney, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, Input, operationsText, StatusBadge, TextArea } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { currentLeg, db, type CurrentMember, type LocalShift, type StationRef } from "@/lib/db";
import { validateClosing } from "@/lib/leg-form";
import { centsToString, toCents } from "@/lib/money";
import { assertRoom, newOutboxRow, OutboxFullError, syncNow } from "@/lib/outbox";
import { litersToTenths, parseCash } from "@/lib/reading";
import { loadReference, patchBoard } from "@/lib/reference";
import { nonCashCents, salesOfShift, sumBy } from "@/lib/sales";
import { signedInMember } from "@/lib/session";
import { needsDiffReason, shiftTotals, totalsWithServer, type ServerSummary } from "@/lib/shift-math";
import { supabase } from "@/lib/supabase";
import { useOutbox } from "@/lib/use-sync";
import { newId } from "@/lib/uuid";
import { AutoTotals, CheckIcon, ClosingReadings, liters, MeterPhotoCard, StickyAction, Steps } from "../../shift-parts";
import { WorkerHeader } from "../../worker-header";

export default function CloseShiftPage() {
  const router = useRouter();
  const [me, setMe] = useState<CurrentMember>();
  const [shift, setShift] = useState<LocalShift>();
  const [ref, setRef] = useState<StationRef>();
  const [summary, setSummary] = useState<ServerSummary>();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [closing, setClosing] = useState<Record<string, string>>({});
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const busy = useRef(false);
  const outbox = useOutbox(me?.userId);
  const [now] = useState(() => new Date().toISOString());

  useEffect(() => {
    (async () => {
      const m = await signedInMember();
      if (!m) return router.replace("/");
      const local = await db.shift.get(m.userId).catch(() => undefined);
      if (!local) return router.replace("/shift/start");
      if (local.status === "submitted") return router.replace("/shift/done");
      if (!currentLeg(local)) return router.replace("/shift");
      setRef(await db.reference.get(m.stationId).catch(() => undefined));
      setMe(m);
      setShift(local);
      // online: fresh tolerance and prices, and the server's view of the shift (if nothing is still queued for it)
      const res = await loadReference(m.stationId).catch(() => undefined);
      if (res && res.source === "server") setRef(res.data);
      if (res?.source === "server" && !(await hasUnsentFor(m.userId, local.shiftId))) {
        const { data, error } = await supabase().rpc("shift_summary", { p_shift: local.shiftId })
          .abortSignal(AbortSignal.timeout(15_000));
        const s = data as ServerSummary | null;
        if (!error && s && s.legs.length === local.legs.length) setSummary(s);
      }
    })();
  }, [router]);

  if (!me || !shift) return <main className="min-h-dvh bg-surface-page" aria-busy />;

  const leg = currentLeg(shift)!;
  const sales = salesOfShift(outbox.byId.values(), shift.shiftId);
  const currency = ref?.currencyLabel ?? "ل.س";
  const closeCheck = validateClosing(leg.readings, closing);
  const typed = new Map(closeCheck.readings.map((r) => [r.nozzleId, r.tenths]));
  const totals = summary
    ? totalsWithServer(summary, leg.legId, leg.readings.map((r) => ({
        nozzleId: r.nozzleId, openingTenths: litersToTenths(r.opening), closingTenths: typed.get(r.nozzleId),
      })))
    : shiftTotals(
    shift.legs.map((l) => ({
      legId: l.legId,
      readings: l.readings.map((r) => ({
        nozzleId: r.nozzleId, productId: r.productId, openingTenths: litersToTenths(r.opening),
        closingTenths: l === leg ? typed.get(r.nozzleId) : r.closing === undefined ? undefined : litersToTenths(r.closing),
      })),
    })),
    ref?.prices ?? [], shift.openedAt, toCents(shift.openingCash) ?? 0n, nonCashCents(sales));
  const currentTotals = totals.legs.find((t) => t.legId === leg.legId)!;
  const countedValue = parseCash(counted);
  const countedCents = countedValue === null ? null : toCents(countedValue)!;
  const diffCents = countedCents === null ? null : countedCents - totals.expectedCashCents;
  const tolerance = toCents(ref?.cashTolerance ?? "0") ?? 0n;
  const reasonRequired = countedCents !== null && needsDiffReason(countedCents, totals.expectedCashCents, tolerance);
  const money = (c: bigint) => formatMoney(centsToString(c), currency);
  const subtitle = `المضخة ${leg.pumpNumber} · ${leg.readings.map((r) => r.label).join(" · ")} · ${formatTime(shift.openedAt)} – ${formatTime(now)}`;

  async function submit() {
    if (busy.current) return;                           // a double tap must not queue two rows
    busy.current = true;
    try {
      if (!me || !shift || countedValue === null || closeCheck.problem || (reasonRequired && !reason.trim()) || saving) return;
      setSaving(true);
      setSaveError(undefined);
      const at = new Date().toISOString();
      const rowId = newId();
      const params = {
        p_shift: shift.shiftId,
        p_closing: leg.readings.map((r) => ({ nozzle_id: r.nozzleId, closing_reading: typed.get(r.nozzleId)! / 10 })),
        p_counted_cash: countedValue,                        // digits string → numeric on the server
        p_diff_reason: reason.trim() || null,
      };
      const next: LocalShift = {
        ...shift, status: "submitted", countedCash: countedValue, diffReason: reason.trim() || undefined, submittedAt: at,
        legs: [
          ...shift.legs.slice(0, -1),
          { ...leg, endedAt: at, readings: leg.readings.map((r) => ({ ...r, closing: typed.get(r.nozzleId)! / 10 })) },
        ],
      };
      try {
        await db.transaction("rw", db.outbox, db.shift, async () => {
          await assertRoom(me.userId, ref?.offlineMaxOps ?? 50);
          await db.outbox.add(newOutboxRow(me.userId, "submit_shift", rowId, params));
          await db.shift.put(next);
        });
      } catch (e) {
        setSaving(false);
        setSaveError(e instanceof OutboxFullError
          ? `وصلت إلى ${operationsText(e.limit)} غير متزامنة — اتصل بالإنترنت لإكمال المزامنة`
          : "تعذّر الحفظ على هذا الجهاز — أغلق التطبيق وافتحه من جديد");
        return;
      }
      await patchBoard(me.stationId, (pumps) => {
        const p = pumps.find((x) => x.id === leg.pumpId);
        if (!p) return;
        p.heldBy = null; p.heldByMe = false;
        p.nozzles.forEach((n) => { const t = typed.get(n.id); if (t !== undefined) n.lastReading = t / 10; });
      });
      void syncNow();
      router.replace("/shift/done");
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="min-h-dvh bg-surface-page pb-44">
      <WorkerHeader userId={me.userId} name={me.displayName} backHref="/shift" title="إغلاق المناوبة" subtitle={subtitle} />

      <main className="mx-auto flex w-full max-w-[390px] flex-col gap-4 px-4 pt-6">
        <Steps step={step} labels={["القراءة النهائية", "النقد الفعلي", "المراجعة"]} />

        {step === 1 && (
          <>
            <ClosingReadings readings={leg.readings} startedAt={leg.startedAt} values={closing}
              checks={closeCheck.checks} onChange={(id, v) => setClosing((c) => ({ ...c, [id]: v }))} />
            <AutoTotals litersTenths={currentTotals.litersTenths} amountCents={centsToString(currentTotals.amountCents)}
              currencyLabel={currency} missingPrice={currentTotals.missingPrice} estimate={!summary} />
            <MeterPhotoCard title="صورة العداد النهائية" />
          </>
        )}

        {step === 2 && (
          <>
            <section className="rounded-lg bg-surface-card p-4 shadow-card">
              {!summary && <div className="mb-2 flex justify-end"><StatusBadge tone="info">تقديري</StatusBadge></div>}
              <dl className="flex flex-col gap-2 text-body-regular-14">
                <Row label={`إجمالي المبيعات${shift.legs.length > 1 ? ` (${shift.legs.length} مضخات)` : ""}`}
                  value={totals.missingPrice ? "لا يوجد سعر" : money(totals.meterSalesCents)} />
                <Row label="صندوق البداية" value={`+ ${formatMoney(shift.openingCash, currency)}`} />
                {(["card", "credit", "voucher"] as const).map((m) => {
                  const t = sumBy(sales, m);
                  return t.count === 0 ? null : (
                    <div key={m} className="flex items-baseline justify-between">
                      <dt className="text-text-secondary">
                        {{ card: "بطاقة", credit: "آجل لشركات", voucher: "قسائم" }[m]}
                        <span className="block text-body-small-12 text-text-muted">{operationsText(t.count)}</span>
                      </dt>
                      <dd className="font-semibold">- {money(t.cents)}</dd>
                    </div>
                  );
                })}
                <div className="mt-1 flex items-baseline justify-between border-t border-border-default pt-3">
                  <dt className="text-heading-h3-16">النقد المتوقع</dt>
                  <dd className="text-number-l-24">{money(totals.expectedCashCents)}</dd>
                </div>
              </dl>
            </section>
            <Input
              size="lg"
              label="عدّ النقد في الصندوق وأدخله"
              inputMode="numeric"
              autoComplete="off"
              suffix={currency}
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              error={counted !== "" && countedValue === null ? "أدخل مبلغاً بالأرقام دون كسور"
                : reasonRequired && diffCents !== null ? `فرق ${money(diffCents)} عن المتوقع` : undefined}
              helper={diffCents === null ? undefined : diffCents === 0n ? "مطابق للمتوقع" : `فرق ${money(diffCents)} عن المتوقع`}
            />
            {reasonRequired && (
              <AlertBanner tone="danger" title={`الفرق أكبر من الحد المسموح (${formatMoney(ref?.cashTolerance ?? "0", currency)})`}
                action={<Button variant="ghost" onClick={() => setCounted("")}>إعادة العد</Button>}>
                ستحتاج لكتابة سبب في الخطوة التالية. يمكنك إعادة العد قبل المتابعة.
              </AlertBanner>
            )}
          </>
        )}

        {step === 3 && diffCents !== null && (
          <>
            <section className="rounded-lg bg-surface-card p-4 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-heading-h3-16">المضخات في هذه المناوبة</h2>
                {!summary && <StatusBadge tone="info">تقديري</StatusBadge>}
              </div>
              <ul className="flex flex-col gap-2">
                {shift.legs.map((l) => {
                  const t = totals.legs.find((x) => x.legId === l.legId)!;
                  return (
                    <li key={l.legId} className="flex items-center justify-between border-t border-border-default pt-2 text-body-regular-14">
                      <div>
                        <p className="font-semibold">مضخة {l.pumpNumber}</p>
                        <p className="text-body-small-12 text-text-secondary">
                          {formatTime(l.startedAt)} – {formatTime(l.endedAt ?? now)}{l.gapNote ? ` · فرق قراءة: ${l.gapNote}` : ""}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="font-semibold">{liters(t.litersTenths)} لتر</p>
                        <p className="text-body-small-12 text-text-secondary">{t.missingPrice ? "لا يوجد سعر" : money(t.amountCents)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="rounded-lg bg-surface-card p-4 shadow-card">
              <dl className="flex flex-col gap-2 text-body-regular-14">
                <Row label="اللترات المباعة" value={`${liters(totals.litersTenths)} لتر`} />
                <Row label="المبيعات" value={money(totals.meterSalesCents)} />
                <Row label="النقد المتوقع" value={money(totals.expectedCashCents)} />
                <Row label="النقد الفعلي" value={money(countedCents!)} />
              </dl>
              <div className={cx("mt-3 flex items-baseline justify-between rounded-md px-3 py-2",
                diffCents === 0n ? "bg-brand-action-50 text-brand-action-700"
                : reasonRequired ? "bg-status-danger-50 text-status-danger-700" : "bg-status-warning-50 text-status-warning-700")}>
                <span className="text-body-strong-14">فرق الصندوق</span>
                <span className="text-number-l-24">{money(diffCents)}</span>
              </div>
            </section>

            <TextArea
              label="سبب الفرق"
              required={reasonRequired}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonRequired ? "اشرح سبب الفرق كما حدث" : "اختياري"}
              error={reasonRequired && !reason.trim() ? "الفرق أكبر من الحد المسموح — اكتب السبب" : undefined}
            />
            <p className="flex items-center gap-2 text-body-small-12 text-text-secondary">
              <LockIcon /> بعد الإرسال لا يمكنك التعديل إلا بطلب فتح من المدير.
            </p>
          </>
        )}
      </main>

      {step === 1 && (
        <StickyAction hint={closeCheck.problem} disabled={!!closeCheck.problem} onClick={() => setStep(2)}>
          التالي: النقد الفعلي
        </StickyAction>
      )}
      {step === 2 && (
        <StickyAction hint={countedValue === null ? "أدخل النقد الذي عددته" : undefined} disabled={countedValue === null}
          onClick={() => setStep(3)} secondary={<Button variant="ghost" onClick={() => setStep(1)}>رجوع</Button>}>
          التالي: المراجعة
        </StickyAction>
      )}
      {step === 3 && (
        <StickyAction hint={reasonRequired && !reason.trim() ? "اكتب سبب الفرق قبل الإرسال" : undefined} error={saveError}
          disabled={(reasonRequired && !reason.trim()) || saving} onClick={submit}
          secondary={<Button variant="ghost" onClick={() => setStep(2)}>رجوع</Button>}>
          <CheckIcon />
          {saving ? "جارٍ الحفظ…" : "إرسال للاعتماد"}
        </StickyAction>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Moves or an open still in the outbox: the server does not know every leg yet. */
async function hasUnsentFor(userId: string, shiftId: string): Promise<boolean> {
  const n = await db.outbox.where("userId").equals(userId)
    .filter((r) => (r.params.p_shift_id ?? r.params.p_shift) === shiftId && (r.status === "pending" || r.status === "failed_permanent"))
    .count().catch(() => 1);
  return n > 0;
}
