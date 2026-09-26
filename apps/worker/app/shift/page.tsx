"use client";
// The attendant's open shift. S2 «تعبئة سريعة» will live here; for now it shows the shift and its sync state.
import { errorMessage, formatDay, formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db, type LocalShift } from "@/lib/db";
import { cancelRefusedOpenShift } from "@/lib/outbox";
import { supabase } from "@/lib/supabase";
import { useOutbox } from "@/lib/use-sync";
import { WorkerHeader } from "../worker-header";

type Me = { userId: string; name: string; stationName?: string; currencyLabel: string };

export default function ShiftPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me>();
  const [shift, setShift] = useState<LocalShift>();
  const outbox = useOutbox(me?.userId);

  useEffect(() => {
    (async () => {
      const { data } = await supabase().auth.getSession();
      const userId = data.session?.user.id;
      const member = await db.member.get("current").catch(() => undefined);
      if (!userId || !member || member.userId !== userId) return router.replace("/");
      const local = await db.shift.get(userId).catch(() => undefined);
      if (!local) return router.replace("/shift/start");
      const ref = await db.reference.get(member.stationId).catch(() => undefined);
      setMe({ userId, name: member.displayName, stationName: ref?.stationName, currencyLabel: ref?.currencyLabel ?? "ل.س" });
      setShift(local);
    })();
  }, [router]);

  if (!me || !shift) return <main className="min-h-dvh bg-surface-page" aria-busy />;

  const row = outbox.byId.get(shift.shiftId);
  const refused = row?.status === "failed_permanent" ? row : undefined;
  const otherFailure = outbox.failed && outbox.failed.id !== shift.shiftId ? outbox.failed : undefined;

  async function chooseAgain() {
    if (!me || !shift) return;
    await cancelRefusedOpenShift(me.userId, shift.shiftId);
    router.replace("/shift/start");
  }

  return (
    <div className="min-h-dvh bg-surface-page pb-10">
      <WorkerHeader userId={me.userId} name={me.name} stationName={me.stationName} pending={outbox.unsent} />

      <main className="mx-auto flex w-full max-w-[390px] flex-col gap-4 px-4 pt-6">
        {refused && (
          <AlertBanner tone="danger" title={`لم تُفتح المناوبة — ${errorMessage(refused.lastErrorCode, refused.lastErrorDetail)}`}
            action={<Button variant="secondary" onClick={chooseAgain}>ابدأ من جديد</Button>}>
            لم يُسجَّل شيء على الخادم. اختر المضخة وأدخل القراءة من جديد.
          </AlertBanner>
        )}
        {otherFailure && (
          <AlertBanner tone="danger" title={errorMessage(otherFailure.lastErrorCode, otherFailure.lastErrorDetail)}>
            توقفت المزامنة عند هذه العملية، وهي محفوظة على الجهاز. اتصل بالمدير.
          </AlertBanner>
        )}
        {row?.status === "pending" && (
          <AlertBanner tone="success" title="تم فتح المناوبة على هذا الجهاز">
            ستُرسل تلقائياً عند الاتصال بالإنترنت، ولا تحتاج لفعل شيء.
          </AlertBanner>
        )}

        <section className="rounded-lg bg-surface-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h1 className="text-heading-h1-24">مضخة {shift.pumpNumber}</h1>
            {refused ? <StatusBadge tone="danger">مرفوضة</StatusBadge>
              : row?.status === "pending" ? <StatusBadge tone="warning">بانتظار المزامنة</StatusBadge>
              : <StatusBadge tone="success">مسجّلة على الخادم</StatusBadge>}
          </div>
          <p className="mt-1 text-body-small-12 text-text-secondary">
            بدأت {formatDay(shift.openedAt)} · {formatTime(shift.openedAt)}
          </p>
          <dl className="mt-4 flex flex-col gap-2 text-body-regular-14">
            {shift.readings.map((r) => (
              <div key={r.nozzleId} className="flex justify-between">
                <dt className="text-text-secondary">القراءة الافتتاحية {r.label && `· ${r.label}`}</dt>
                <dd className="font-semibold">{formatNumber(r.reading, 1)} لتر</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt className="text-text-secondary">صندوق البداية</dt>
              <dd className="font-semibold">{formatMoney(shift.openingCash, me.currencyLabel)}</dd>
            </div>
          </dl>
        </section>

        <p className="text-center text-body-regular-14 text-text-secondary">التعبئة السريعة (S2) قادمة في الخطوة التالية.</p>
      </main>
    </div>
  );
}
