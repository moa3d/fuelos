"use client";
// S1 — بداية المناوبة. Matches design/screens/S1.png; spec §6 (shift legs).
// Pumps come from pump_board (cached for offline). open_shift creates the shift AND its first leg.
import { formatTime } from "@fuelos/core";
import { AlertBanner, Button, Input, operationsText } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { db, getDevice, type CurrentMember, type LocalShift, type StationRef } from "@/lib/db";
import { validateOpening } from "@/lib/leg-form";
import { assertRoom, newOutboxRow, OutboxFullError, syncNow } from "@/lib/outbox";
import { parseCash } from "@/lib/reading";
import { findOpenShiftOnServer, loadReference, patchBoard } from "@/lib/reference";
import { signedInMember } from "@/lib/session";
import { newId } from "@/lib/uuid";
import { CheckIcon, MeterPhotoCard, OpeningReadings, PumpGrid, StickyAction } from "../../shift-parts";
import { WorkerHeader } from "../../worker-header";

type Phase =
  | { status: "loading" }
  | { status: "ready"; ref: StationRef; cached: boolean }
  | { status: "no-data" }
  | { status: "error" };

export default function ShiftStartPage() {
  const router = useRouter();
  const [me, setMe] = useState<CurrentMember>();
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [pumpId, setPumpId] = useState<string>();
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [gapNote, setGapNote] = useState("");
  const [cash, setCash] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const busy = useRef(false);

  const load = useCallback(async (m: CurrentMember) => {
    try {
      const res = await loadReference(m.stationId);
      if (res.source === "none") return setPhase({ status: "no-data" });
      // An open shift on the server (e.g. opened on another device) takes the attendant straight to it.
      if (res.source === "server") {
        const open = await findOpenShiftOnServer(m.userId, res.data);
        if (open) {
          await db.shift.put(open);
          return router.replace("/shift");
        }
      }
      setPhase({ status: "ready", ref: res.data, cached: res.source === "cache" });
    } catch {
      setPhase({ status: "error" });
    }
  }, [router]);

  useEffect(() => {
    (async () => {
      const m = await signedInMember();
      if (!m) return router.replace("/");
      const local = await db.shift.get(m.userId).catch(() => undefined);
      if (local) return router.replace(local.status === "submitted" ? "/shift/done" : "/shift");
      setMe(m);
      await load(m);
    })();
  }, [router, load]);

  function retry() {
    if (!me) return;
    setPhase({ status: "loading" });
    void load(me);
  }

  const ref = phase.status === "ready" ? phase.ref : undefined;
  const pump = ref?.pumps.find((p) => p.id === pumpId);
  const opening = validateOpening(pump?.nozzles ?? [], readings, gapNote);
  const cashValue = parseCash(cash);
  const missing =
    !pump ? "اختر المضخة أولاً"
    : opening.problem ? opening.problem
    : cashValue === null ? "أدخل مبلغ صندوق البداية"
    : undefined;

  function choosePump(id: string) {
    const p = ref?.pumps.find((x) => x.id === id);
    setPumpId(id);
    setGapNote("");
    // prefilled with the last closing reading (spec §6); the attendant checks it against the meter
    setReadings(Object.fromEntries(p?.nozzles.map((n) => [n.id, String(n.lastReading)]) ?? []));
  }

  async function start() {
    if (busy.current) return;                           // a double tap must not queue two rows
    busy.current = true;
    try {
      if (!me || !ref || !pump || missing || saving || cashValue === null) return;
      setSaving(true);
      setSaveError(undefined);
      const shiftId = newId();
      const legId = newId();
      const openedAt = new Date().toISOString();
      const tenths = new Map(opening.readings.map((r) => [r.nozzleId, r.tenths]));
      const note = opening.gapTenths > 0 ? gapNote.trim() : null;
      const device = await getDevice().catch(() => undefined);
      const params = {
        p_shift_id: shiftId,
        p_leg_id: legId,
        p_pump: pump.id,
        p_opening_cash: cashValue,                          // digits string → numeric on the server
        p_readings: pump.nozzles.map((n) => ({ nozzle_id: n.id, opening_reading: tenths.get(n.id)! / 10 })),
        p_gap_note: note,
        p_device: device?.deviceId ?? null,
        p_client_created_at: openedAt,
      };
      const local: LocalShift = {
        userId: me.userId, shiftId, stationId: me.stationId, openedAt, openingCash: cashValue, status: "open",
        legs: [{
          legId, pumpId: pump.id, pumpNumber: pump.number, startedAt: openedAt, gapNote: note ?? undefined,
          readings: pump.nozzles.map((n) => ({
            nozzleId: n.id, label: n.productName, productId: n.productId, opening: tenths.get(n.id)! / 10,
          })),
        }],
      };
      try {
        await db.transaction("rw", db.outbox, db.shift, async () => {
          await assertRoom(me.userId, ref.offlineMaxOps);
          await db.outbox.add(newOutboxRow(me.userId, "open_shift", shiftId, params));
          await db.shift.put(local);
        });
      } catch (e) {
        setSaving(false);
        setSaveError(e instanceof OutboxFullError
          ? `وصلت إلى ${operationsText(e.limit)} غير متزامنة — اتصل بالإنترنت لإكمال المزامنة`
          : "تعذّر الحفظ على هذا الجهاز — أغلق التطبيق وافتحه من جديد");
        return;
      }
      await patchBoard(me.stationId, (pumps) => {
        const p = pumps.find((x) => x.id === pump.id);
        if (p) { p.heldBy = me.displayName; p.heldByMe = true; }
      });
      void syncNow();
      router.replace("/shift");
    } finally {
      busy.current = false;
    }
  }

  if (!me) return <main className="min-h-dvh bg-surface-page" aria-busy />;

  return (
    <div className="min-h-dvh bg-surface-page pb-44">
      <WorkerHeader userId={me.userId} name={me.displayName} stationName={ref?.stationName} />

      <main className="mx-auto flex w-full max-w-[390px] flex-col gap-6 px-4 pt-6">
        <header>
          <h1 className="text-heading-h1-24">بداية المناوبة</h1>
          <p className="text-body-regular-14 text-text-secondary">ثلاث خطوات: المضخة، القراءة، الصندوق</p>
          {phase.status === "ready" && (
            <p className="mt-1 text-body-small-12 text-text-secondary">
              حالة المضخات: آخر تحديث {formatTime(phase.ref.fetchedAt)} · {phase.cached ? "محفوظة على الجهاز" : "من الخادم"}
            </p>
          )}
        </header>

        {phase.status === "loading" && <FormSkeleton />}

        {phase.status === "no-data" && (
          <AlertBanner tone="warning" title="لا توجد بيانات المضخات على هذا الجهاز بعد"
            action={<Button variant="secondary" onClick={retry}>إعادة المحاولة</Button>}>
            اتصل بالإنترنت مرة واحدة لتحميلها، ثم تعمل الشاشة دون اتصال.
          </AlertBanner>
        )}

        {phase.status === "error" && (
          <AlertBanner tone="danger" title="تعذّر تحميل بيانات المحطة"
            action={<Button variant="secondary" onClick={retry}>إعادة المحاولة</Button>}>
            حاول مرة أخرى، وإن تكرر الخطأ فاتصل بالمدير.
          </AlertBanner>
        )}

        {ref && ref.pumps.length === 0 && (
          <AlertBanner tone="info" title="لا توجد مضخات مفعّلة في المحطة">
            اطلب من صاحب المحطة إضافة المضخات من الإعدادات.
          </AlertBanner>
        )}

        {ref && ref.pumps.length > 0 && (
          <>
            <section>
              <h2 className="mb-2 text-body-strong-14 text-text-secondary">1. اختر المضخة</h2>
              <PumpGrid pumps={ref.pumps} selectedId={pumpId} onSelect={choosePump} />
            </section>

            <section className="flex flex-col gap-4">
              <h2 className="text-body-strong-14 text-text-secondary">
                2. القراءة الافتتاحية {pump ? `لعداد المضخة ${pump.number}` : "للعداد"}
              </h2>
              {!pump && <p className="text-body-regular-14 text-text-muted">اختر المضخة لتظهر عداداتها.</p>}
              {pump && (
                <OpeningReadings
                  pump={pump} values={readings} checks={opening.checks} gapTenths={opening.gapTenths} gapNote={gapNote}
                  onChange={(id, v) => setReadings((r) => ({ ...r, [id]: v }))} onGapNote={setGapNote}
                />
              )}
              {pump && <MeterPhotoCard title="صورة العداد" />}
            </section>

            <section>
              <h2 className="mb-2 text-body-strong-14 text-text-secondary">3. صندوق البداية</h2>
              <Input
                size="lg"
                label="النقد الذي استلمته في الصندوق"
                inputMode="numeric"
                autoComplete="off"
                suffix={ref.currencyLabel}
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                helper="اكتب المبلغ كما عددته، ويمكن أن يكون 0. يبقى معك حتى نهاية المناوبة مهما انتقلت بين المضخات."
                error={cash !== "" && cashValue === null ? "أدخل مبلغاً بالأرقام دون كسور" : undefined}
              />
            </section>
          </>
        )}
      </main>

      {ref && ref.pumps.length > 0 && (
        <StickyAction hint={missing} error={saveError} disabled={!!missing || saving} onClick={start}>
          <CheckIcon />
          {saving ? "جارٍ الحفظ…" : "ابدأ المناوبة"}
        </StickyAction>
      )}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="h-24 animate-pulse rounded-md bg-surface-muted" />)}
      </div>
      <span className="h-16 animate-pulse rounded-md bg-surface-muted" />
      <span className="h-16 animate-pulse rounded-md bg-surface-muted" />
    </div>
  );
}
