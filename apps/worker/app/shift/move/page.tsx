"use client";
// «الانتقال إلى مضخة أخرى» (spec §6): step 1 closing readings of the current pump, step 2 the new pump
// with its opening readings. One switch_pump in the outbox; the cash stays with the attendant.
import { AlertBanner, Button, operationsText } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  currentLeg, db, getDevice, type CurrentMember, type LocalShift, type StationRef,
} from "@/lib/db";
import { validateClosing, validateOpening } from "@/lib/leg-form";
import { centsToString } from "@/lib/money";
import { assertRoom, newOutboxRow, OutboxFullError, syncNow } from "@/lib/outbox";
import { litersToTenths } from "@/lib/reading";
import { loadReference, patchBoard } from "@/lib/reference";
import { signedInMember } from "@/lib/session";
import { shiftTotals } from "@/lib/shift-math";
import { newId } from "@/lib/uuid";
import {
  AutoTotals, CheckIcon, ClosingReadings, MeterPhotoCard, OpeningReadings, PumpGrid, StickyAction, Steps,
} from "../../shift-parts";
import { WorkerHeader } from "../../worker-header";

export default function MovePage() {
  const router = useRouter();
  const [me, setMe] = useState<CurrentMember>();
  const [shift, setShift] = useState<LocalShift>();
  const [ref, setRef] = useState<StationRef>();
  const [refCached, setRefCached] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [closing, setClosing] = useState<Record<string, string>>({});
  const [pumpId, setPumpId] = useState<string>();
  const [opening, setOpening] = useState<Record<string, string>>({});
  const [gapNote, setGapNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  useEffect(() => {
    (async () => {
      const m = await signedInMember();
      if (!m) return router.replace("/");
      const local = await db.shift.get(m.userId).catch(() => undefined);
      if (!local || local.status !== "open" || !currentLeg(local)) return router.replace("/shift");
      setMe(m);
      setShift(local);
      // refresh the board when online: who is on which pump, and the last readings for the prefill
      const res = await loadReference(m.stationId).catch(() => undefined);
      if (res && res.source !== "none") { setRef(res.data); setRefCached(res.source === "cache"); }
      else setRef(await db.reference.get(m.stationId).catch(() => undefined));
    })();
  }, [router]);

  if (!me || !shift) return <main className="min-h-dvh bg-surface-page" aria-busy />;

  const leg = currentLeg(shift)!;
  const closeCheck = validateClosing(leg.readings, closing);
  const typedClosing = new Map(closeCheck.readings.map((r) => [r.nozzleId, r.tenths]));
  const preview = shiftTotals(
    [{ legId: leg.legId, readings: leg.readings.map((r) => ({
      nozzleId: r.nozzleId, productId: r.productId, openingTenths: litersToTenths(r.opening),
      closingTenths: typedClosing.get(r.nozzleId),
    })) }],
    ref?.prices ?? [], shift.openedAt, 0n);
  const pump = ref?.pumps.find((p) => p.id === pumpId);
  const openCheck = validateOpening(pump?.nozzles ?? [], opening, gapNote);
  const missing2 = !pump ? "اختر المضخة الجديدة" : openCheck.problem;

  function choosePump(id: string) {
    const p = ref?.pumps.find((x) => x.id === id);
    setPumpId(id);
    setGapNote("");
    setOpening(Object.fromEntries(p?.nozzles.map((n) => [n.id, String(n.lastReading)]) ?? []));
  }

  async function confirm() {
    if (!me || !shift || !ref || !pump || missing2 || closeCheck.problem || saving) return;
    setSaving(true);
    setSaveError(undefined);
    const newLegId = newId();
    const at = new Date().toISOString();
    const openTenths = new Map(openCheck.readings.map((r) => [r.nozzleId, r.tenths]));
    const note = openCheck.gapTenths > 0 ? gapNote.trim() : null;
    const device = await getDevice().catch(() => undefined);
    const params = {
      p_shift: shift.shiftId,
      p_new_leg_id: newLegId,
      p_closing: leg.readings.map((r) => ({ nozzle_id: r.nozzleId, closing_reading: typedClosing.get(r.nozzleId)! / 10 })),
      p_new_pump: pump.id,
      p_opening: pump.nozzles.map((n) => ({ nozzle_id: n.id, opening_reading: openTenths.get(n.id)! / 10 })),
      p_gap_note: note,
      p_device: device?.deviceId ?? null,
      p_client_created_at: at,
    };
    const next: LocalShift = {
      ...shift,
      legs: [
        ...shift.legs.slice(0, -1),
        { ...leg, endedAt: at, readings: leg.readings.map((r) => ({ ...r, closing: typedClosing.get(r.nozzleId)! / 10 })) },
        {
          legId: newLegId, pumpId: pump.id, pumpNumber: pump.number, startedAt: at, gapNote: note ?? undefined,
          readings: pump.nozzles.map((n) => ({
            nozzleId: n.id, label: n.productName, productId: n.productId, opening: openTenths.get(n.id)! / 10,
          })),
        },
      ],
    };
    try {
      await db.transaction("rw", db.outbox, db.shift, async () => {
        await assertRoom(me.userId, ref.offlineMaxOps);
        await db.outbox.add(newOutboxRow(me.userId, "switch_pump", newLegId, params));
        await db.shift.put(next);
      });
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof OutboxFullError
        ? `وصلت إلى ${operationsText(e.limit)} غير متزامنة — اتصل بالإنترنت لإكمال المزامنة`
        : "تعذّر الحفظ على هذا الجهاز — أغلق التطبيق وافتحه من جديد");
      return;
    }
    // keep the cached board in step for the next offline move
    await patchBoard(me.stationId, (pumps) => {
      const old = pumps.find((p) => p.id === leg.pumpId);
      if (old) {
        old.heldBy = null; old.heldByMe = false;
        old.nozzles.forEach((n) => { const t = typedClosing.get(n.id); if (t !== undefined) n.lastReading = t / 10; });
      }
      const neu = pumps.find((p) => p.id === pump.id);
      if (neu) { neu.heldBy = me.displayName; neu.heldByMe = true; }
    });
    void syncNow();
    router.replace("/shift");
  }

  return (
    <div className="min-h-dvh bg-surface-page pb-44">
      <WorkerHeader userId={me.userId} name={me.displayName} backHref="/shift"
        title="الانتقال إلى مضخة أخرى" subtitle={`من المضخة ${leg.pumpNumber} · الخطوة ${step} من 2`} />

      <main className="mx-auto flex w-full max-w-[390px] flex-col gap-4 px-4 pt-6">
        <Steps step={step} labels={[`القراءة النهائية للمضخة ${leg.pumpNumber}`, "المضخة الجديدة"]} />

        {step === 1 && (
          <>
            <h1 className="text-heading-h2-20">القراءة النهائية للمضخة {leg.pumpNumber}</h1>
            <ClosingReadings readings={leg.readings} startedAt={leg.startedAt} values={closing}
              checks={closeCheck.checks} onChange={(id, v) => setClosing((c) => ({ ...c, [id]: v }))} />
            <AutoTotals litersTenths={preview.litersTenths} amountCents={centsToString(preview.meterSalesCents)}
              currencyLabel={ref?.currencyLabel ?? "ل.س"} missingPrice={preview.missingPrice} />
            <MeterPhotoCard title="صورة العداد النهائية" />
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-heading-h2-20">اختر المضخة الجديدة</h1>
            {!ref ? (
              <AlertBanner tone="warning" title="لا توجد بيانات المضخات على هذا الجهاز">
                اتصل بالإنترنت مرة واحدة لتحميلها.
              </AlertBanner>
            ) : (
              <>
                {refCached && (
                  <p className="text-body-small-12 text-text-secondary">حالة المضخات محفوظة على الجهاز وقد تكون قديمة — الخادم يتحقق منها.</p>
                )}
                <PumpGrid pumps={ref.pumps} currentId={leg.pumpId} selectedId={pumpId} onSelect={choosePump} />
                {pump && (
                  <div className="flex flex-col gap-4">
                    <h2 className="text-body-strong-14 text-text-secondary">القراءة الافتتاحية لعداد المضخة {pump.number}</h2>
                    <OpeningReadings pump={pump} values={opening} checks={openCheck.checks} gapTenths={openCheck.gapTenths}
                      gapNote={gapNote} onChange={(id, v) => setOpening((o) => ({ ...o, [id]: v }))} onGapNote={setGapNote} />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {step === 1 ? (
        <StickyAction hint={closeCheck.problem} disabled={!!closeCheck.problem} onClick={() => setStep(2)}>
          التالي: المضخة الجديدة
        </StickyAction>
      ) : (
        <StickyAction hint={missing2} error={saveError} disabled={!!missing2 || saving} onClick={confirm}
          secondary={<Button variant="ghost" onClick={() => setStep(1)}>رجوع إلى القراءة النهائية</Button>}>
          <CheckIcon />
          {saving ? "جارٍ الحفظ…" : "تأكيد الانتقال"}
        </StickyAction>
      )}
    </div>
  );
}
