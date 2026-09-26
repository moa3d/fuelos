"use client";
// S7 — تم إرسال الإغلاق (design/screens/S7.png). Shows the device preview until submit_shift is on the
// server, then the server's shift_summary. «تم» hands the device to the next attendant.
import { formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, StatusBadge } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db, type CurrentMember, type StationRef } from "@/lib/db";
import { centsToString, toCents } from "@/lib/money";
import { litersToTenths } from "@/lib/reading";
import { signedInMember } from "@/lib/session";
import { routeFor } from "@/lib/shift-merge";
import { shiftTotals } from "@/lib/shift-math";
import { signOutLocally, supabase } from "@/lib/supabase";
import { useLiveShift, useOutbox } from "@/lib/use-sync";
import { liters } from "../../shift-parts";
import { WorkerHeader } from "../../worker-header";

type ServerSummary = { liters: number; meter_sales: number; cash_diff: number | null };

export default function ShiftDonePage() {
  const router = useRouter();
  const [me, setMe] = useState<CurrentMember>();
  const [ref, setRef] = useState<StationRef>();
  const [server, setServer] = useState<ServerSummary>();
  const outbox = useOutbox(me?.userId);
  // live: the owner's decision is reconciled from the server into this shift (lib/shift-sync.ts)
  const { shift, loaded } = useLiveShift(me?.userId);

  useEffect(() => {
    (async () => {
      const m = await signedInMember();
      if (!m) return router.replace("/");
      const local = await db.shift.get(m.userId).catch(() => undefined);
      if (!local) return router.replace("/shift/start");
      if (local.status === "open") return router.replace(routeFor(local));
      setRef(await db.reference.get(m.stationId).catch(() => undefined));
      setMe(m);
    })();
  }, [router]);

  useEffect(() => {
    if (!loaded) return;
    if (!shift) router.replace("/shift/start");
    else if (shift.status === "open") router.replace(routeFor(shift));   // the owner returned the close
  }, [loaded, shift, router]);

  const submitRow = shift
    ? [...outbox.byId.values()].find((r) => r.rpc === "submit_shift" && r.params.p_shift === shift.shiftId && r.status !== "cancelled")
    : undefined;
  const sent = submitRow?.status === "sent";

  // the server's numbers replace the device preview once the close is on the server
  useEffect(() => {
    if (!sent || !shift) return;
    let alive = true;
    supabase().rpc("shift_summary", { p_shift: shift.shiftId }).abortSignal(AbortSignal.timeout(15_000))
      .then(({ data }) => { if (alive && data) setServer(data as ServerSummary); });
    return () => { alive = false; };
  }, [sent, shift]);

  if (!me || !shift) return <main className="min-h-dvh bg-surface-page" aria-busy />;

  const currency = ref?.currencyLabel ?? "ل.س";
  const preview = shiftTotals(
    shift.legs.map((l) => ({ legId: l.legId, readings: l.readings.map((r) => ({
      nozzleId: r.nozzleId, productId: r.productId, openingTenths: litersToTenths(r.opening),
      closingTenths: r.closing === undefined ? undefined : litersToTenths(r.closing),
    })) })),
    ref?.prices ?? [], shift.openedAt, toCents(shift.openingCash) ?? 0n);
  const litersText = server ? formatNumber(Number(server.liters), 1) : liters(preview.litersTenths);
  const salesText = server ? formatMoney(String(server.meter_sales), currency) : formatMoney(centsToString(preview.meterSalesCents), currency);
  const diffCents = server
    ? (server.cash_diff === null ? null : toCents(String(server.cash_diff)))
    : toCents(shift.countedCash ?? "0")! - preview.expectedCashCents;
  const pumps = [...new Set(shift.legs.map((l) => l.pumpNumber))].join(" · ");

  async function finish() {
    if (!me) return;
    // keep it while the close is unsent; once the server knows (or decided) it is only history
    if (sent || shift?.status === "approved" || shift?.status === "rejected") await db.shift.delete(me.userId).catch(() => undefined);
    await signOutLocally();
    await db.member.delete("current").catch(() => undefined);
    router.replace("/");
  }

  return (
    <div className="min-h-dvh bg-surface-page pb-48">
      <WorkerHeader userId={me.userId} name={me.displayName} stationName={ref?.stationName} />

      <main className="mx-auto flex w-full max-w-[390px] flex-col items-center gap-4 px-4 pt-8 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-brand-action-50">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand-action text-brand-on-action">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
          </span>
        </span>
        <h1 className="text-heading-h1-24">
          {shift.status === "approved" ? "اعتمد صاحب المحطة الإغلاق"
            : shift.status === "rejected" ? "لم يُعتمد الإغلاق"
            : sent ? "تم إرسال الإغلاق" : "تم حفظ الإغلاق على الجهاز"}
        </h1>
        {shift.status === "approved" ? <StatusBadge tone="success">معتمدة</StatusBadge>
          : shift.status === "rejected" ? <StatusBadge tone="danger">مرفوض</StatusBadge>
          : <StatusBadge tone="warning">{sent ? "بانتظار اعتماد صاحب المحطة" : "بانتظار المزامنة"}</StatusBadge>}

        <section className="w-full rounded-lg bg-surface-card p-4 text-start shadow-card">
          {!server && <div className="mb-2 flex justify-end"><StatusBadge tone="info">تقديري</StatusBadge></div>}
          <dl className="flex flex-col gap-2 text-body-regular-14">
            <Row label={shift.legs.length > 1 ? "المضخات" : "المضخة"} value={pumps} />
            <Row label="الوقت" value={`${formatTime(shift.openedAt)} – ${formatTime(shift.submittedAt ?? shift.openedAt)}`} />
            <Row label="اللترات" value={`${litersText} لتر`} />
            <Row label="المبيعات" value={salesText} />
            {diffCents !== null && (
              <div className="flex items-baseline justify-between">
                <dt className="text-text-secondary">فرق الصندوق</dt>
                <dd className={cx("font-semibold", diffCents < 0n ? "text-status-danger-700" : diffCents > 0n ? "text-status-warning-700" : "text-brand-action-700")}>
                  {formatMoney(centsToString(diffCents), currency)}
                </dd>
              </div>
            )}
          </dl>
          {shift.diffReason && <p className="mt-2 text-body-small-12 text-brand-action-700">✓ السبب مرفق</p>}
        </section>

        {shift.status === "rejected" && (
          <AlertBanner tone="danger" className="w-full text-start" title="رفض صاحب المحطة الإغلاق">
            {shift.decisionNote ? `السبب: «${shift.decisionNote}». ` : ""}سيعيد فتح المناوبة لتصحيحها، أو يتواصل معك.
          </AlertBanner>
        )}
        {shift.status === "approved" && shift.decisionNote && (
          <AlertBanner tone="success" className="w-full text-start" title="ملاحظة صاحب المحطة">«{shift.decisionNote}»</AlertBanner>
        )}
        {shift.status === "submitted" && !sent && (
          <AlertBanner tone="info" className="w-full text-start" title="الإغلاق محفوظ على هذا الجهاز ولم يُرسل بعد">
            يُرسل تلقائياً عند الاتصال. إن ضغطت «تم» قبل ذلك، يُرسل عندما تدخل برمزك مرة أخرى.
          </AlertBanner>
        )}
        <p className="flex w-full items-center gap-2 rounded-md bg-surface-muted p-3 text-start text-body-small-12 text-text-secondary">
          {shift.status === "rejected" ? "بعد أن يعيد المالك فتح المناوبة تظهر هنا تلقائياً عند دخولك."
            : "المناوبة مقفلة. أي تعديل يحتاج طلب فتح من المدير."}
        </p>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-border-default bg-surface-card">
        <div className="mx-auto flex w-full max-w-[390px] flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
          <Button variant="secondary" size="lg" block onClick={() => window.print()}>طباعة الملخص</Button>
          <Button variant="action" size="lg" block onClick={finish}>تم</Button>
        </div>
      </footer>
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
