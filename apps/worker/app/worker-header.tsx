"use client";
// Dark worker header. Two looks from the designs:
//  - S1/shift: avatar, name, station · day · time, Sync Indicator, «تبديل العامل»;
//  - S4–S6: back arrow, title and subtitle («إغلاق المناوبة»), Sync Indicator.
// It also shows, on every screen, where the outbox stopped (a refused operation) and how to go on.
import { errorMessage, formatDay, formatTime, PUMP_TAKEN_OFFLINE_MESSAGE } from "@fuelos/core";
import { AlertBanner, Button, operationsText, SyncIndicator } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { db, type OutboxRow } from "@/lib/db";
import { initials } from "@/lib/names";
import { redoRefused, unsentCount } from "@/lib/outbox";
import { signOutLocally } from "@/lib/supabase";
import { useOutbox, useSyncState } from "@/lib/use-sync";

export function WorkerHeader({ userId, name, stationName, title, subtitle, backHref }: {
  userId: string; name: string; stationName?: string;
  title?: string; subtitle?: string; backHref?: string;
}) {
  const router = useRouter();
  const { state, needsSignIn } = useSyncState();
  const outbox = useOutbox(userId);
  const [confirm, setConfirm] = useState<number>();
  const [now] = useState(() => new Date());

  async function switchWorker(force = false) {
    const unsent = await unsentCount(userId).catch(() => 0);
    if (unsent > 0 && !force) return setConfirm(unsent);
    await signOutLocally();
    await db.member.delete("current").catch(() => undefined);
    router.replace("/");
  }

  return (
    <>
      <header className="bg-brand-dark text-text-on-dark">
        <div className="mx-auto flex w-full max-w-[390px] items-center gap-3 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
          {title ? (
            <>
              <button type="button" aria-label="رجوع" onClick={() => router.push(backHref ?? "/shift")}
                className="flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-dark-800">
                <BackIcon />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-heading-h3-16">{title}</p>
                {subtitle && <p className="truncate text-body-small-12 text-text-on-dark-muted">{subtitle}</p>}
              </div>
              <SyncIndicator state={state} pending={outbox.unsent} />
            </>
          ) : (
            <>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-primary text-body-strong-14">
                {initials(name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-heading-h3-16">{name}</p>
                <p className="truncate text-body-small-12 text-text-on-dark-muted">
                  {[stationName, formatDay(now), formatTime(now)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <SyncIndicator state={state} pending={outbox.unsent} />
                <button type="button" onClick={() => switchWorker()} className="text-label-11 text-text-on-dark-muted underline">
                  تبديل العامل
                </button>
              </div>
            </>
          )}
        </div>
      </header>
      <div className="mx-auto w-full max-w-[390px] px-4">
        {outbox.failed && <RefusedBanner row={outbox.failed} userId={userId} />}
        {needsSignIn && (
          <AlertBanner tone="warning" className="mt-4" title="انتهت جلسة الدخول — عملياتك محفوظة على الجهاز"
            action={<Button variant="secondary" onClick={() => switchWorker(true)}>ادخل من جديد</Button>}>
            ستُرسل بعد أن تدخل برمزك مرة أخرى.
          </AlertBanner>
        )}
        {confirm !== undefined && (
          <AlertBanner tone="warning" className="mt-4" title={`لديك ${operationsText(confirm)} لم تُرسل بعد`}>
            <p>هي محفوظة على هذا الجهاز، وستُرسل عندما تدخل برمزك مرة أخرى.</p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => switchWorker(true)}>تبديل على أي حال</Button>
              <Button variant="ghost" onClick={() => setConfirm(undefined)}>إلغاء</Button>
            </div>
          </AlertBanner>
        )}
      </div>
    </>
  );
}

/**
 * The queue stopped at a row the server refused. Nothing changed on the server for that row.
 * open_shift / submit_shift can be redone by the attendant; a refused move needs the manager (spec §7).
 */
function RefusedBanner({ row, userId }: { row: OutboxRow; userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const reason = row.rpc === "switch_pump" && row.lastErrorCode === "FUELOS_PUMP_BUSY"
    ? PUMP_TAKEN_OFFLINE_MESSAGE
    : errorMessage(row.lastErrorCode, row.lastErrorDetail);
  const what = { open_shift: "لم تُفتح المناوبة", switch_pump: "لم يُسجَّل الانتقال", submit_shift: "لم يُرسل الإغلاق", record_sale: "لم تُسجَّل العملية" }[row.rpc];

  async function redo() {
    setBusy(true);
    try {
      if (row.rpc === "open_shift") {
        await redoRefused(userId, row.id, () => db.shift.delete(userId));
        router.replace("/shift/start");
      } else {
        await redoRefused(userId, row.id, async () => {
          await db.shift.where("userId").equals(userId).modify((s) => {
            s.status = "open";
            delete s.countedCash; delete s.diffReason; delete s.submittedAt;
            const last = s.legs.at(-1);
            if (last) { delete last.endedAt; last.readings.forEach((r) => { delete r.closing; }); }
          });
        });
        router.replace("/shift/close");
      }
    } finally {
      setBusy(false);
    }
  }

  const canRedo = row.rpc === "open_shift" || row.rpc === "submit_shift";
  return (
    <AlertBanner tone="danger" className="mt-4" title={`${what} — ${reason}`}
      action={canRedo ? <Button variant="secondary" disabled={busy} onClick={redo}>
        {row.rpc === "open_shift" ? "ابدأ من جديد" : "عدّل الإغلاق"}</Button> : undefined}>
      {canRedo ? "لم يتغيّر شيء على الخادم. صحّح البيانات وأرسلها من جديد."
        : "العملية محفوظة على الجهاز، وتوقفت المزامنة عندها. اتصل بالمدير."}
    </AlertBanner>
  );
}

function BackIcon() {
  // RTL: «back» points to the start edge, which is the right
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
