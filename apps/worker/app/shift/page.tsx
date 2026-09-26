"use client";
// The attendant's open shift (spec §6): current pump, earlier pumps, «الانتقال إلى مضخة أخرى».
// S2 «تعبئة سريعة» will be added here; sales will carry the current leg (p_leg).
import { formatDay, formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { currentLeg, db, type CurrentMember, type LocalLeg, type LocalShift, type StationRef } from "@/lib/db";
import { litersToTenths } from "@/lib/reading";
import { signedInMember } from "@/lib/session";
import { useOutbox } from "@/lib/use-sync";
import { liters, StickyAction } from "../shift-parts";
import { WorkerHeader } from "../worker-header";

export default function ShiftPage() {
  const router = useRouter();
  const [me, setMe] = useState<CurrentMember>();
  const [shift, setShift] = useState<LocalShift>();
  const [ref, setRef] = useState<StationRef>();
  const [now] = useState(() => Date.now());
  const outbox = useOutbox(me?.userId);

  useEffect(() => {
    (async () => {
      const m = await signedInMember();
      if (!m) return router.replace("/");
      const local = await db.shift.get(m.userId).catch(() => undefined);
      if (!local) return router.replace("/shift/start");
      if (local.status === "submitted") return router.replace("/shift/done");
      setRef(await db.reference.get(m.stationId).catch(() => undefined));
      setMe(m);
      setShift(local);
    })();
  }, [router]);

  if (!me || !shift) return <main className="min-h-dvh bg-surface-page" aria-busy />;

  const leg = currentLeg(shift);
  const earlier = shift.legs.filter((l) => l !== leg);
  const unsentForShift = shift.legs.some((l) => outbox.byId.get(l.legId)?.status === "pending")
    || outbox.byId.get(shift.shiftId)?.status === "pending";
  const hours = (now - Date.parse(shift.openedAt)) / 3_600_000;
  const tooLong = ref && hours > ref.maxShiftHours;
  const currency = ref?.currencyLabel ?? "ل.س";

  return (
    <div className="min-h-dvh bg-surface-page pb-48">
      <WorkerHeader userId={me.userId} name={me.displayName} stationName={ref?.stationName} />

      <main className="mx-auto flex w-full max-w-[390px] flex-col gap-4 px-4 pt-6">
        {tooLong && (
          <AlertBanner tone="warning" title={`مرّت أكثر من ${ref.maxShiftHours} ساعة على بداية المناوبة`}>
            أغلق المناوبة، أو اتصل بالمدير إن كان عليك الاستمرار.
          </AlertBanner>
        )}
        {unsentForShift && (
          <AlertBanner tone="success" title="محفوظة على هذا الجهاز">
            ستُرسل تلقائياً عند الاتصال بالإنترنت، ولا تحتاج لفعل شيء.
          </AlertBanner>
        )}

        {leg ? (
          <section className="rounded-lg bg-surface-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-label-12 text-text-secondary">المضخة الحالية</p>
                <h1 className="text-display-32">مضخة {leg.pumpNumber}</h1>
              </div>
              <StatusBadge tone={unsentForShift ? "warning" : "success"}>
                {unsentForShift ? "بانتظار المزامنة" : "مسجّلة على الخادم"}
              </StatusBadge>
            </div>
            <p className="mt-1 text-body-small-12 text-text-secondary">
              منذ {formatTime(leg.startedAt)} · بدأت المناوبة {formatDay(shift.openedAt)} {formatTime(shift.openedAt)}
            </p>
            <dl className="mt-4 flex flex-col gap-2 text-body-regular-14">
              {leg.readings.map((r) => (
                <div key={r.nozzleId} className="flex justify-between">
                  <dt className="text-text-secondary">القراءة الافتتاحية · {r.label}</dt>
                  <dd className="font-semibold">{formatNumber(r.opening, 1)} لتر</dd>
                </div>
              ))}
              {leg.gapNote && (
                <div className="flex justify-between gap-4">
                  <dt className="text-text-secondary">سبب فرق القراءة</dt>
                  <dd className="text-end">{leg.gapNote}</dd>
                </div>
              )}
            </dl>
          </section>
        ) : (
          <AlertBanner tone="danger" title="لا توجد مضخة حالية لهذه المناوبة">اتصل بالمدير.</AlertBanner>
        )}

        {earlier.length > 0 && (
          <details className="rounded-lg bg-surface-card p-4 shadow-card">
            <summary className="cursor-pointer text-body-strong-14">المضخات السابقة ({earlier.length})</summary>
            <ul className="mt-3 flex flex-col gap-3">
              {earlier.map((l) => <EarlierLeg key={l.legId} leg={l} />)}
            </ul>
          </details>
        )}

        <section className="flex justify-between rounded-lg bg-surface-card p-4 text-body-regular-14 shadow-card">
          <span className="text-text-secondary">صندوق البداية (معك حتى نهاية المناوبة)</span>
          <span className="font-semibold">{formatMoney(shift.openingCash, currency)}</span>
        </section>

        <p className="text-center text-body-small-12 text-text-muted">التعبئة السريعة (S2) قادمة في الخطوة التالية.</p>
      </main>

      {leg && (
        <StickyAction
          onClick={() => router.push("/shift/move")}
          secondary={<Button variant="secondary" size="lg" block onClick={() => router.push("/shift/close")}>إغلاق المناوبة</Button>}
        >
          الانتقال إلى مضخة أخرى
        </StickyAction>
      )}
    </div>
  );
}

function EarlierLeg({ leg }: { leg: LocalLeg }) {
  const tenths = leg.readings.reduce(
    (sum, r) => sum + (r.closing === undefined ? 0 : litersToTenths(r.closing) - litersToTenths(r.opening)), 0);
  return (
    <li className="flex items-center justify-between border-t border-border-default pt-3 text-body-regular-14">
      <div>
        <p className="font-semibold">مضخة {leg.pumpNumber}</p>
        <p className="text-body-small-12 text-text-secondary">
          {formatTime(leg.startedAt)} – {leg.endedAt ? formatTime(leg.endedAt) : "…"}
          {leg.gapNote ? ` · فرق قراءة: ${leg.gapNote}` : ""}
        </p>
      </div>
      <span className="font-semibold">{liters(tenths)} لتر</span>
    </li>
  );
}
