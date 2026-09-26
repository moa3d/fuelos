"use client";
// S1 — بداية المناوبة. Matches design/screens/S1.png.
// Works offline: pumps come from the device cache, and open_shift goes into the outbox.
import { formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, Input, operationsText, StatusBadge } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { db, getDevice, type LocalShift, type StationRef } from "@/lib/db";
import { assertRoom, newOutboxRow, OutboxFullError, syncNow } from "@/lib/outbox";
import { checkReading, parseCash, tenthsToLiters, type ReadingCheck } from "@/lib/reading";
import { findOpenShiftOnServer, loadReference } from "@/lib/reference";
import { supabase } from "@/lib/supabase";
import { useOutbox } from "@/lib/use-sync";
import { newId } from "@/lib/uuid";
import { WorkerHeader } from "../../worker-header";

type Me = { userId: string; name: string; stationId: string };
type Phase =
  | { status: "loading" }
  | { status: "ready"; ref: StationRef; cached: boolean }
  | { status: "no-data" }
  | { status: "error" };

export default function ShiftStartPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me>();
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [pumpId, setPumpId] = useState<string>();
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [cash, setCash] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const outbox = useOutbox(me?.userId);

  const load = useCallback(async (m: Me) => {
    try {
      const res = await loadReference(m.stationId);
      if (res.source === "none") return setPhase({ status: "no-data" });
      // An open shift on the server (e.g. opened on another device) takes the attendant straight to it.
      if (navigator.onLine) {
        const open = await findOpenShiftOnServer(m.userId);
        if (open) {
          const pump = res.data.pumps.find((p) => p.id === open.pump_id);
          const nozzleLabel = new Map(pump?.nozzles.map((n) => [n.id, n.productName]) ?? []);
          const local: LocalShift = {
            userId: m.userId, shiftId: open.id, stationId: open.station_id, pumpId: open.pump_id,
            pumpNumber: pump?.number ?? 0, openedAt: open.opened_at, openingCash: String(open.opening_cash),
            readings: (open.shift_readings ?? []).map((r: { nozzle_id: string; opening_reading: number }) => ({
              nozzleId: r.nozzle_id, label: nozzleLabel.get(r.nozzle_id) ?? "", reading: Number(r.opening_reading),
            })),
          };
          await db.shift.put(local);
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
      const { data } = await supabase().auth.getSession();
      const userId = data.session?.user.id;
      const member = await db.member.get("current").catch(() => undefined);
      if (!userId || !member || member.userId !== userId) return router.replace("/");
      if (await db.shift.get(userId).catch(() => undefined)) return router.replace("/shift");
      const m = { userId, name: member.displayName, stationId: member.stationId };
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
  const checks: [string, ReadingCheck][] = pump?.nozzles.map((n) => [n.id, checkReading(readings[n.id] ?? "", n.lastReading)]) ?? [];
  const cashValue = parseCash(cash);
  const missing =
    !pump ? "اختر المضخة أولاً"
    : checks.some(([, c]) => c.kind === "empty") ? "أدخل القراءة الافتتاحية للعداد"
    : checks.some(([, c]) => c.kind === "invalid" || c.kind === "lower") ? "صحّح القراءة الافتتاحية"
    : cashValue === null ? "أدخل مبلغ صندوق البداية"
    : undefined;

  async function start() {
    if (!me || !ref || !pump || missing || saving || cashValue === null) return;
    setSaving(true);
    setSaveError(undefined);
    const shiftId = newId();
    const openedAt = new Date().toISOString();
    const tenths = new Map(checks.map(([id, c]) => [id, "tenths" in c ? c.tenths : 0]));
    const device = await getDevice().catch(() => undefined);
    const params = {
      p_shift_id: shiftId,
      p_pump: pump.id,
      p_opening_cash: cashValue,                          // digits string → numeric on the server
      p_readings: pump.nozzles.map((n) => ({ nozzle_id: n.id, opening_reading: tenthsToLiters(tenths.get(n.id)!) })),
      p_device: device?.deviceId ?? null,
      p_client_created_at: openedAt,
    };
    const local: LocalShift = {
      userId: me.userId, shiftId, stationId: me.stationId, pumpId: pump.id, pumpNumber: pump.number,
      openedAt, openingCash: cashValue,
      readings: pump.nozzles.map((n) => ({ nozzleId: n.id, label: n.productName, reading: tenthsToLiters(tenths.get(n.id)!) })),
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
    void syncNow();
    router.replace("/shift");
  }

  if (!me) return <main className="min-h-dvh bg-surface-page" aria-busy />;

  return (
    <div className="min-h-dvh bg-surface-page pb-40">
      <WorkerHeader userId={me.userId} name={me.name} stationName={ref?.stationName} pending={outbox.unsent} />

      <main className="mx-auto flex w-full max-w-[390px] flex-col gap-6 px-4 pt-6">
        <header>
          <h1 className="text-heading-h1-24">بداية المناوبة</h1>
          <p className="text-body-regular-14 text-text-secondary">ثلاث خطوات: المضخة، القراءة، الصندوق</p>
          {phase.status === "ready" && phase.cached && (
            <p className="mt-1 text-body-small-12 text-text-secondary">
              بيانات المضخات من آخر تحديث {formatTime(phase.ref.fetchedAt)} · محفوظة على الجهاز
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
              <h2 className="text-body-strong-14 text-text-secondary">1. اختر المضخة</h2>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {ref.pumps.map((p) => {
                  const active = p.id === pumpId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => { setPumpId(p.id); setReadings({}); }}
                      className={cx(
                        "flex min-h-20 flex-col items-start gap-1 rounded-md border p-3 text-start transition-colors",
                        active ? "border-2 border-brand-primary bg-brand-primary-50" : "border-border-default bg-surface-card",
                      )}
                    >
                      <span className="flex w-full items-center justify-between">
                        <span className="text-body-strong-14">مضخة {p.number}</span>
                        {active && <span className="text-brand-primary"><CheckIcon /></span>}
                      </span>
                      <span className="text-body-small-12 text-text-secondary">
                        {[...new Set(p.nozzles.map((n) => n.productName))].join(" · ") || "بلا مسدسات"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="flex flex-col gap-4">
              <h2 className="text-body-strong-14 text-text-secondary">
                2. القراءة الافتتاحية {pump ? `لعداد المضخة ${pump.number}` : "للعداد"}
              </h2>
              {!pump && <p className="text-body-regular-14 text-text-muted">اختر المضخة لتظهر عداداتها.</p>}
              {pump?.nozzles.length === 0 && (
                <AlertBanner tone="warning" title="لا يوجد مسدس مفعّل على هذه المضخة">اختر مضخة أخرى أو اتصل بالمدير.</AlertBanner>
              )}
              {pump?.nozzles.map((n) => {
                const check = checks.find(([id]) => id === n.id)?.[1] ?? { kind: "empty" as const };
                const last = `آخر قراءة إغلاق مسجلة: ${formatNumber(n.lastReading, 1)}`;
                const note = readingNote(check, last);
                return (
                  <Input
                    key={n.id}
                    size="lg"
                    label={pump.nozzles.length > 1 ? `مسدس ${n.productName}` : `عداد ${n.productName}`}
                    inputMode="decimal"
                    autoComplete="off"
                    suffix="لتر"
                    placeholder={formatNumber(n.lastReading, 1)}
                    value={readings[n.id] ?? ""}
                    onChange={(e) => setReadings((r) => ({ ...r, [n.id]: e.target.value }))}
                    helper={note.helper}
                    error={note.error}
                  />
                );
              })}

              <div className="flex items-center gap-3 rounded-md border border-border-default bg-surface-card p-3" aria-disabled>
                <span className="flex size-12 items-center justify-center rounded-md bg-surface-muted text-text-muted">
                  <CameraIcon />
                </span>
                <div className="flex-1">
                  <p className="text-body-strong-14">صورة العداد</p>
                  <p className="text-body-small-12 text-text-secondary">اختيارية — تُفعَّل بعد تجهيز تخزين الصور</p>
                </div>
                <StatusBadge tone="neutral">قريباً</StatusBadge>
              </div>
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
                helper="اكتب المبلغ كما عددته، ويمكن أن يكون 0"
                error={cash !== "" && cashValue === null ? "أدخل مبلغاً بالأرقام دون كسور" : undefined}
              />
            </section>
          </>
        )}
      </main>

      {ref && ref.pumps.length > 0 && (
        <footer className="fixed inset-x-0 bottom-0 border-t border-border-default bg-surface-card">
          <div className="mx-auto flex w-full max-w-[390px] flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
            {(saveError || missing) && (
              <p role="status" className={cx("text-center text-body-small-12", saveError ? "text-status-danger-700" : "text-text-secondary")}>
                {saveError ?? missing}
              </p>
            )}
            <Button variant="action" size="lg" block disabled={!!missing || saving} onClick={start}>
              <CheckIcon />
              {saving ? "جارٍ الحفظ…" : "ابدأ المناوبة"}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

function readingNote(c: ReadingCheck, last: string): { helper?: string; error?: string } {
  switch (c.kind) {
    case "empty": return { helper: last };
    case "invalid": return { error: "أدخل رقماً صحيحاً، بخانة عشرية واحدة على الأكثر" };
    case "equal": return { helper: `${last} — مطابقة` };
    case "higher": return { helper: `${last} — أعلى بـ ${formatNumber(c.diffTenths / 10, 1)} لتر، تأكد من العداد` };
    case "lower": return { error: `أقل من آخر قراءة مسجلة بـ ${formatNumber(c.diffTenths / 10, 1)} لتر — أعد قراءة العداد` };
  }
}

function FormSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="h-20 animate-pulse rounded-md bg-surface-muted" />)}
      </div>
      <span className="h-16 animate-pulse rounded-md bg-surface-muted" />
      <span className="h-16 animate-pulse rounded-md bg-surface-muted" />
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
