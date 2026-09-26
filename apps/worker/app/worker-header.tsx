"use client";
// Dark worker header (S1/S2): avatar, name, station · day · time, Sync Indicator, «تبديل العامل».
import { formatDay, formatTime } from "@fuelos/core";
import { AlertBanner, Button, operationsText, SyncIndicator } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { db } from "@/lib/db";
import { initials } from "@/lib/names";
import { unsentCount } from "@/lib/outbox";
import { signOutLocally } from "@/lib/supabase";
import { useSyncState } from "@/lib/use-sync";

export function WorkerHeader({ userId, name, stationName, pending }: {
  userId: string; name: string; stationName?: string; pending: number;
}) {
  const router = useRouter();
  const { state, needsSignIn } = useSyncState();
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
            <SyncIndicator state={state} pending={pending} />
            <button type="button" onClick={() => switchWorker()} className="text-label-11 text-text-on-dark-muted underline">
              تبديل العامل
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[390px] px-4">
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
