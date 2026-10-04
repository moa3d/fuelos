"use client";
// O7 — الموافقات (design/screens/O7.png): requests waiting for a decision on the right, the selected request with
// its numbers and choices on the left. Decisions are final and recorded (audit); a correction later is a reversal.
import { formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, StatusBadge, TextArea } from "@fuelos/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { MeterPhotos, type DisplayShot } from "@/components/MeterPhotos";
import {
  canDecide, closeChoices, decisionSupported, defaultChoice, noteHint, noteRequired, whoCanDecide,
  type ApprovalType, type Choice,
} from "@/lib/approval-rules";
import {
  decide, loadApprovals, reopenShift, type ApprovalsData, type CloseSnapshot, type Request,
} from "@/lib/approvals";
import { cents, centsStr } from "@/lib/dashboard";
import { loadShiftPhotos, signPaths, type ShiftPhotos } from "@/lib/photos-data";
import { timeAgo } from "@/lib/time-ago";
import { useOffice } from "../office-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: ApprovalsData };
type Filter = "all" | ApprovalType;

const TYPE_LABEL: Record<ApprovalType, string> = {
  shift_close: "إغلاق مناوبة", credit_over_limit: "بيع آجل فوق الحد", stock_adjustment: "تسوية مخزون", shift_reopen: "فتح مناوبة",
};
const FILTERS: [Filter, string][] = [
  ["all", "الكل"], ["shift_close", "إغلاق مناوبة"], ["credit_over_limit", "تجاوز حد"], ["stock_adjustment", "تسوية مخزون"], ["shift_reopen", "فتح مناوبة"],
];
const OPTION_LABEL: Record<string, string> = {
  shortage_to_expense: "حُمّل الفرق على حساب العجز", shortage_to_employee: "حُمّل الفرق على الموظف",
};

export default function ApprovalsPage() {
  const { current } = useOffice();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  // /approvals?select=<request id> (links from O3) opens that request
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => (typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("select") ?? undefined),
  );
  const [history, setHistory] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    loadApprovals(current.stationId).then(
      (data) => { if (alive) { setLoad({ status: "ready", data }); setNow(Date.now()); } },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [current.stationId, tick]);

  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const requests = useMemo(() => (load.status === "ready" ? load.data.requests : []), [load]);
  const pending = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);
  const done = useMemo(() => {
    const decided = requests.filter((r) => r.status !== "pending");
    if (history) return decided;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    return decided.filter((r) => Date.parse(r.decidedAt ?? r.requestedAt) >= startOfToday.getTime());
  }, [requests, history]);
  const matches = (r: Request) => filter === "all" || r.type === filter;
  const shownPending = pending.filter(matches);
  const shownDone = done.filter(matches);
  const selected = requests.find((r) => r.id === selectedId) ?? shownPending[0] ?? shownDone[0];

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  /** After a decision: reload, and move on to the next request that waits. */
  function decided(nextId?: string) {
    setSelectedId(nextId);
    refresh();
  }

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">الموافقات</h1>
          <p className="text-body-regular-14 text-text-secondary">
            {load.status === "ready" ? `${pending.length === 0 ? "لا توجد طلبات" : `${pending.length} طلبات`} بانتظار قرارك · ` : ""}
            كل قرار يُسجَّل باسمك في سجل المراجعة
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setHistory((h) => !h)}>{history ? "طلبات اليوم" : "سجل القرارات"}</Button>
          <Button variant="secondary" onClick={refresh}>تحديث</Button>
        </div>
      </header>

      <div role="tablist" aria-label="نوع الطلب" className="flex flex-wrap gap-2">
        {FILTERS.map(([f, label]) => {
          const n = f === "all" ? pending.length : pending.filter((r) => r.type === f).length;
          return (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              className={cx("h-10 rounded-full border px-4 text-body-strong-14",
                filter === f ? "border-brand-primary bg-brand-primary text-white" : "border-border-default bg-surface-card text-text-secondary")}>
              {label}{n > 0 ? ` (${n})` : ""}
            </button>
          );
        })}
      </div>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل الموافقات" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}

      {load.status === "ready" && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-6">
            <section aria-label="بانتظار قرارك">
              <h2 className="mb-2 text-label-12 text-text-secondary">بانتظار قرارك</h2>
              {shownPending.length === 0 ? (
                <p className="rounded-lg bg-surface-card p-6 text-body-regular-14 text-text-secondary shadow-card">
                  {pending.length === 0 ? "لا توجد طلبات بانتظار قرارك الآن. ✓" : "لا توجد طلبات من هذا النوع."}
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {shownPending.map((r) => (
                    <RequestCard key={r.id} r={r} now={now} tolerance={load.data.cashToleranceCents} money={(c) => moneyOf(c, current.currencyLabel)}
                      selected={r.id === selected?.id} onSelect={() => setSelectedId(r.id)} />
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="تمت معالجتها">
              <h2 className="mb-2 text-label-12 text-text-secondary">{history ? "سجل القرارات" : "تمت معالجتها اليوم"}</h2>
              {shownDone.length === 0 ? (
                <p className="text-body-regular-14 text-text-muted">لا توجد قرارات {history ? "" : "اليوم"} بعد.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {shownDone.map((r) => (
                    <RequestCard key={r.id} r={r} now={now} tolerance={load.data.cashToleranceCents} money={(c) => moneyOf(c, current.currencyLabel)}
                      selected={r.id === selected?.id} onSelect={() => setSelectedId(r.id)} />
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="lg:sticky lg:top-8">
            {selected ? (
              <Detail key={selected.id} r={selected} role={current.role} currency={current.currencyLabel}
                onSelect={setSelectedId}
                onDone={() => decided(shownPending.find((p) => p.id !== selected.id)?.id)} onReopened={refresh} />
            ) : (
              <p className="rounded-lg bg-surface-card p-8 text-center text-body-regular-14 text-text-secondary shadow-card">
                اختر طلباً من القائمة لتراه هنا.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const moneyOf = (c: bigint, label: string) => formatMoney(centsStr(c), label);

// ---------- list card ----------
function cardInfo(r: Request, money: (c: bigint) => string): { title: string; body: string } {
  switch (r.type) {
    case "shift_close": {
      const diff = closeSnapshot(r).cash_diff;
      const pumps = r.shift?.pumps.length ? `${r.shift.pumps.length > 1 ? "المضخات" : "المضخة"} ${r.shift.pumps.join("، ")}` : "";
      return {
        title: `إغلاق مناوبة${pumps ? ` · ${pumps}` : ""}`,
        body: [diff !== null && diff !== undefined && cents(diff) !== 0n ? `فرق صندوق ${money(cents(diff))}` : "الصندوق مطابق", r.requestedBy].join(" · "),
      };
    }
    case "credit_over_limit": {
      const remaining = cents(r.payload.remaining as string | number);
      const amount = cents(r.payload.amount as string | number);
      return {
        title: "بيع آجل فوق الحد",
        body: `${String(r.payload.company ?? "")} · ${money(amount)} · يتجاوز المتبقي بـ ${money(amount > remaining ? amount - remaining : 0n)}`,
      };
    }
    case "stock_adjustment": {
      const diff = Number(r.payload.diff_l ?? 0);
      return {
        title: `تسوية مخزون${r.tank ? ` · ${r.tank.name}` : ""}`,
        body: `المقاس ${diff < 0 ? "أقل" : "أعلى"} من الدفتري بـ ${formatNumber(Math.abs(diff))} لتر · ${r.requestedBy}`,
      };
    }
    default:
      return { title: "فتح مناوبة", body: r.requestedBy };
  }
}

function RequestCard({ r, now, tolerance, money, selected, onSelect }: {
  r: Request; now: number; tolerance: bigint; money: (c: bigint) => string; selected: boolean; onSelect: () => void;
}) {
  const { title, body } = cardInfo(r, money);
  const diff = r.type === "shift_close" ? closeSnapshot(r).cash_diff : null;
  const bigDiff = diff !== null && diff !== undefined && absC(cents(diff)) > tolerance;
  const status = r.status === "approved" ? ["success", "تمت الموافقة"] as const
    : r.status === "rejected" ? ["danger", "رُفضت"] as const
    : bigDiff ? ["danger", "فرق أكبر من الحد"] as const
    : r.blockingCredit.length > 0 ? ["warning", "ينتظر قرارات الآجل"] as const
    : r.type === "credit_over_limit" ? ["warning", "العامل ينتظر"] as const
    : r.type === "stock_adjustment" ? ["warning", "يحتاج سبباً"] as const
    : ["info", "بانتظار قرارك"] as const;
  return (
    <li>
      <button type="button" onClick={onSelect} aria-current={selected ? "true" : undefined}
        className={cx("w-full rounded-lg border p-4 text-start transition-colors",
          selected ? "border-2 border-brand-primary bg-brand-primary-50" : "border-border-default bg-surface-card hover:bg-surface-muted")}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-body-strong-14">{title}</span>
          <span className="shrink-0 text-body-small-12 text-text-muted">{timeAgo(r.decidedAt ?? r.requestedAt, now)}</span>
        </div>
        <p className="mt-1 text-body-small-12 text-text-secondary">{body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge tone={status[0]}>{status[1]}</StatusBadge>
          {r.status !== "pending" && r.decidedBy && <span className="text-body-small-12 text-text-muted">{r.decidedBy}</span>}
        </div>
      </button>
    </li>
  );
}

// ---------- detail ----------
function Detail({ r, role, currency, onDone, onReopened, onSelect }: {
  r: Request; role: "owner" | "accountant" | "shift_manager"; currency: string;
  onDone: () => void; onReopened: () => void; onSelect: (id: string) => void;
}) {
  const money = (c: bigint) => moneyOf(c, currency);
  const snap = closeSnapshot(r);
  const diff = snap.cash_diff === null || snap.cash_diff === undefined ? 0n : cents(snap.cash_diff);
  const pending = r.status === "pending";

  const [choice, setChoice] = useState<Choice>(defaultChoice(r.type, diff));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [reopenFailed, setReopenFailed] = useState(false);
  const inFlight = useRef(false);

  const allowed = canDecide(role, r.type);
  const supported = decisionSupported(r.type);
  const blocked = r.blockingCredit.length > 0 && (choice === "approve" || choice === "shortage_to_expense" || choice === "shortage_to_employee");
  const needsNote = noteRequired(r.type, choice);
  const noteMissing = needsNote && note.trim() === "";
  const canSubmit = allowed && supported && !blocked && !noteMissing && !busy;

  async function submit(c: Choice) {
    if (inFlight.current || !allowed || !supported) return;
    if (noteRequired(r.type, c) && note.trim() === "") return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const res = await decide(r, c, note);
      if (res.ok) return onDone();
      setError(res.message);
      if ("reopenFailed" in res) setReopenFailed(true);
    } catch {
      setError("لا يوجد اتصال بالخادم — لم يُسجَّل القرار. حاول مرة أخرى.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const primaryLabel =
    choice === "return" ? "إعادة للعامل للتصحيح"
    : r.type === "shift_close" ? "اعتماد الإغلاق"
    : r.type === "credit_over_limit" ? "موافقة على البيع الآجل"
    : r.type === "stock_adjustment" ? "اعتماد التسوية" : "موافقة";

  return (
    <article className="rounded-lg bg-surface-card p-6 shadow-card">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-heading-h1-24">{r.type === "shift_close" && r.shift
            ? `إغلاق مناوبة ${r.shift.pumps.length > 1 ? "المضخات" : "المضخة"} ${r.shift.pumps.join("، ")}`
            : TYPE_LABEL[r.type]}</h2>
          <p className="mt-1 text-body-regular-14 text-text-secondary">
            {r.type === "shift_close" && r.shift
              ? [r.shift.attendant, r.shift.products.join(" · "), `${formatTime(r.shift.openedAt)}${r.shift.closedAt ? ` – ${formatTime(r.shift.closedAt)}` : ""}`].filter(Boolean).join(" · ")
              : `طلب ${r.requestedBy} · ${formatTime(r.requestedAt)}`}
          </p>
        </div>
        {r.type === "shift_close" && diff !== 0n && <StatusBadge tone="danger">فرق {money(diff)}</StatusBadge>}
      </header>

      {r.type === "shift_close" && <CloseBody r={r} snap={snap} money={money} diff={diff} />}
      {r.type === "credit_over_limit" && <CreditBody r={r} money={money} />}
      {r.type === "stock_adjustment" && <StockBody r={r} />}
      {r.type === "shift_reopen" && (
        <AlertBanner tone="info" className="mt-4" title="طلب فتح مناوبة">
          {r.requestedBy ? `طلب ${r.requestedBy} فتح المناوبة للتصحيح.` : "طلب فتح المناوبة للتصحيح."}
        </AlertBanner>
      )}

      {!pending ? (
        <DecisionRecord r={r} onReopened={onReopened} role={role} />
      ) : (
        <>
          {r.blockingCredit.length > 0 && r.type === "shift_close" && (
            <AlertBanner tone="warning" className="mt-4" title={`هناك ${r.blockingCredit.length === 1 ? "عملية آجل" : `${r.blockingCredit.length} عمليات آجل`} بانتظار قرارك في هذه المناوبة`}
              action={<Button variant="secondary" onClick={() => onSelect(r.blockingCredit[0])}>افتح العملية</Button>}>
              قرّرها أولاً، ثم يصبح اعتماد الإغلاق متاحاً. يمكنك مع ذلك إعادة الإغلاق للعامل أو رفضه.
            </AlertBanner>
          )}

          {r.type === "shift_close" && allowed && (
            <fieldset className="mt-6">
              <legend className="mb-2 text-heading-h3-16">قرارك</legend>
              <div className="grid gap-3 md:grid-cols-3" role="radiogroup">
                {closeChoices(diff).map((o) => (
                  <label key={o.id} className={cx("flex cursor-pointer gap-3 rounded-md border p-3",
                    choice === o.id ? "border-2 border-brand-primary bg-brand-primary-50" : "border-border-default bg-surface-card")}>
                    <input type="radio" name="choice" checked={choice === o.id} onChange={() => setChoice(o.id)} className="mt-1 size-4 accent-[var(--color-brand-primary)]" />
                    <span>
                      <span className="block text-body-strong-14">{o.title}</span>
                      <span className="block text-body-small-12 text-text-secondary">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {allowed && supported && (
            <TextArea className="mt-4" label="ملاحظة القرار (تظهر في السجل)" required={needsNote} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={noteHint(r.type, choice)}
              helper={noteMissing ? noteHint(r.type, choice) : undefined} />
          )}

          {error && <AlertBanner tone="danger" className="mt-4" title={error}
            action={reopenFailed && r.refId ? <ReopenRetry shiftId={r.refId} reason={note.trim()} onDone={onDone} /> : undefined} />}

          {!allowed && (
            <AlertBanner tone="info" className="mt-6" title={whoCanDecide(r.type)}>
              يمكنك الاطلاع على تفاصيل الطلب، وسيُبلَّغ صاحب المحطة بقراره.
            </AlertBanner>
          )}
          {allowed && !supported && (
            <AlertBanner tone="info" className="mt-6" title="قرارات فتح المناوبة تحتاج دعماً من الخادم — قريباً">
              الموافقة على هذا النوع لا تفتح المناوبة بعد، لذلك أوقفنا الزر حتى لا تُسجَّل موافقة دون أثر.
            </AlertBanner>
          )}

          {allowed && supported && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="action" size="lg" disabled={!canSubmit} onClick={() => submit(choice)}>
                {busy ? "جارٍ الحفظ…" : primaryLabel}
              </Button>
              <Button variant="danger" size="lg" disabled={busy || note.trim() === ""} onClick={() => submit("reject")}
                title={note.trim() === "" ? "اكتب سبب الرفض أولاً" : undefined}>
                رفض
              </Button>
              <p className="flex items-center gap-2 text-body-small-12 text-text-secondary">
                <LockIcon /> القرار نهائي ويُسجَّل ولا يُحذف؛ أي تصحيح لاحق يكون بقيد عكسي.
              </p>
            </div>
          )}
          {allowed && supported && (blocked || noteMissing) && (
            <p role="status" className="mt-2 text-body-small-12 text-text-secondary">
              {blocked ? "اعتماد الإغلاق متوقف حتى تُقرَّر عمليات الآجل المعلّقة." : noteHint(r.type, choice)}
            </p>
          )}
        </>
      )}
    </article>
  );
}

function ReopenRetry({ shiftId, reason, onDone }: { shiftId: string; reason: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" disabled={busy} onClick={async () => {
        setBusy(true);
        const res = await reopenShift(shiftId, reason).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
        if (res.ok) return onDone();
        setMsg(res.message);
        setBusy(false);
      }}>إعادة فتح المناوبة</Button>
      {msg && <span className="text-body-small-12">{msg}</span>}
    </div>
  );
}

// ---------- bodies per type ----------
type PhotosLoad = { status: "loading" } | { status: "error" } | ShiftPhotos & { status: "ready" };

function CloseBody({ r, snap, money, diff }: { r: Request; snap: CloseSnapshot; money: (c: bigint) => string; diff: bigint }) {
  const stat = (label: string, value: string) => (
    <div className="rounded-md bg-surface-muted p-3"><p className="text-body-small-12 text-text-secondary">{label}</p><p className="text-number-m-18">{value}</p></div>
  );

  const legIds = useMemo(() => (snap.legs ?? []).map((l) => l.leg_id).filter((x): x is string => !!x), [snap.legs]);
  const [photos, setPhotos] = useState<PhotosLoad>({ status: "loading" });
  const retried = useRef(new Set<string>());

  // No need to reset to "loading" here: Detail renders this with key={selected.id} (see ApprovalsPage), so
  // CloseBody remounts fresh — with its own initial "loading" state — whenever the selected request changes.
  useEffect(() => {
    let alive = true;
    loadShiftPhotos(legIds).then(
      ({ shots, urls }) => { if (alive) setPhotos({ status: "ready", shots, urls }); },
      () => { if (alive) setPhotos({ status: "error" }); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the request itself changes, not on every legIds array identity
  }, [r.id]);

  async function retryUrl(path: string) {
    if (retried.current.has(path)) return; // ask for a fresh link once per path, never loop on a second failure
    retried.current.add(path);
    const fresh = await signPaths([path]).catch(() => new Map<string, string>());
    const url = fresh.get(path);
    if (!url) return;
    setPhotos((prev) => (prev.status === "ready" ? { ...prev, urls: new Map(prev.urls).set(path, url) } : prev));
  }

  function shotsFor(legId: string): DisplayShot[] {
    if (photos.status !== "ready") return [];
    return photos.shots.filter((s) => s.legId === legId).map((s) => ({ ...s, url: photos.urls.get(s.path) }));
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("اللترات", `${formatNumber(Math.round(Number(snap.liters ?? 0) * 10) / 10, 1)}`)}
        {stat("المبيعات", money(cents(snap.meter_sales)))}
        {stat("النقد المتوقع", money(cents(snap.expected_cash)))}
        {stat("النقد الفعلي", money(cents(snap.counted_cash)))}
      </div>
      {(cents(snap.card) > 0n || cents(snap.credit) > 0n || cents(snap.voucher) > 0n) && (
        <p className="text-body-small-12 text-text-secondary">
          مطروح من النقد المتوقع:{" "}
          {[["بطاقة", snap.card], ["آجل", snap.credit], ["قسائم", snap.voucher]].filter(([, v]) => cents(v as string | number) > 0n)
            .map(([l, v]) => `${l} ${money(cents(v as string | number))}`).join(" · ")}
        </p>
      )}
      {snap.legs && snap.legs.length > 0 && (
        <section>
          <h3 className="mb-2 text-heading-h3-16">المضخات في هذه المناوبة</h3>
          <ul className="flex flex-col divide-y divide-border-default rounded-md border border-border-default">
            {snap.legs.map((l, i) => (
              <li key={i} className="flex flex-col gap-2 p-3 text-body-regular-14">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">مضخة {l.pump_number}</p>
                    <p className="text-body-small-12 text-text-secondary">{formatTime(l.started_at)} – {l.ended_at ? formatTime(l.ended_at) : "…"}</p>
                    {l.gap_note && <p className="mt-1 text-body-small-12 text-status-warning-700">فرق قراءة عند البداية: {l.gap_note}</p>}
                  </div>
                  <div className="text-end"><p className="font-semibold">{formatNumber(Number(l.liters), 1)} لتر</p><p className="text-body-small-12 text-text-secondary">{money(cents(l.amount))}</p></div>
                </div>
                {l.leg_id && (
                  photos.status === "loading" ? <span className="block h-24 w-24 animate-pulse rounded-md bg-surface-muted" /> :
                  photos.status === "error" ? <p className="text-body-small-12 text-status-danger-700">تعذّر تحميل الصور</p> :
                  <MeterPhotos pumpNumber={l.pump_number} shots={shotsFor(l.leg_id)} onRetry={retryUrl} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-heading-h3-16">{diff !== 0n ? "سبب الفرق" : "ملاحظة العامل"}</h3>
        {r.shift?.diffReason ? (
          <p className="rounded-md bg-surface-muted p-3 text-body-large-16"><span className="text-status-info-700">{r.shift.attendant}: </span>«{r.shift.diffReason}»</p>
        ) : (
          <p className="text-body-regular-14 text-text-secondary">{diff !== 0n ? "لم يكتب العامل سبباً." : "لم يكتب العامل ملاحظة."}</p>
        )}
      </section>
    </div>
  );
}

function CreditBody({ r, money }: { r: Request; money: (c: bigint) => string }) {
  const amount = cents(r.payload.amount as string | number);
  const remaining = cents(r.payload.remaining as string | number);
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-md bg-surface-muted p-3"><p className="text-body-small-12 text-text-secondary">الشركة</p><p className="text-body-strong-14">{String(r.payload.company ?? "")}</p></div>
        <div className="rounded-md bg-surface-muted p-3"><p className="text-body-small-12 text-text-secondary">قيمة العملية</p><p className="text-number-m-18">{money(amount)}</p></div>
        <div className="rounded-md bg-surface-muted p-3"><p className="text-body-small-12 text-text-secondary">الحد المتبقي</p><p className="text-number-m-18">{money(remaining)}</p></div>
        <div className="rounded-md bg-status-danger-50 p-3"><p className="text-body-small-12 text-status-danger-700">يتجاوز الحد بـ</p><p className="text-number-m-18 text-status-danger-700">{money(amount > remaining ? amount - remaining : 0n)}</p></div>
      </div>
      {r.sale && (
        <p className="text-body-regular-14 text-text-secondary">
          {r.sale.product} · {formatNumber(Number(r.sale.liters), 2)} لتر بسعر {money(cents(r.sale.unitPrice))} · طلب {r.requestedBy}
        </p>
      )}
      <p className="text-body-small-12 text-text-secondary">
        الموافقة تُسجّل العملية على حساب الشركة. الرفض يُلغيها مع سببك، والعامل ينتظر قرارك.
      </p>
    </div>
  );
}

function StockBody({ r }: { r: Request }) {
  const book = Number(r.payload.book_l ?? 0);
  const measured = Number(r.payload.measured_l ?? 0);
  const diff = Number(r.payload.diff_l ?? measured - book);
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-md bg-surface-muted p-3"><p className="text-body-small-12 text-text-secondary">الخزان</p><p className="text-body-strong-14">{r.tank ? `${r.tank.name} · ${r.tank.product}` : "—"}</p></div>
        <div className="rounded-md bg-surface-muted p-3"><p className="text-body-small-12 text-text-secondary">المخزون الدفتري</p><p className="text-number-m-18">{formatNumber(book)} لتر</p></div>
        <div className="rounded-md bg-surface-muted p-3"><p className="text-body-small-12 text-text-secondary">القياس الفعلي</p><p className="text-number-m-18">{formatNumber(measured)} لتر</p></div>
        <div className={cx("rounded-md p-3", diff < 0 ? "bg-status-danger-50 text-status-danger-700" : "bg-status-warning-50 text-status-warning-700")}>
          <p className="text-body-small-12">الفرق</p><p className="text-number-m-18">{diff > 0 ? "+" : ""}{formatNumber(diff)} لتر</p>
        </div>
      </div>
      <p className="text-body-small-12 text-text-secondary">الاعتماد يسجّل حركة تسوية في المخزون بهذا الفرق، مع سببك.</p>
    </div>
  );
}

/** Who decided, when, which option and note — decisions stay visible (audit). */
function DecisionRecord({ r, role, onReopened }: { r: Request; role: string; onReopened: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const canReopen = role === "owner" && r.type === "shift_close" && r.status === "rejected" && r.shift?.status === "rejected" && !!r.refId;
  return (
    <div className="mt-6 rounded-md bg-surface-muted p-4">
      <p className="text-body-strong-14">
        {r.status === "approved" ? "تمت الموافقة" : "رُفض الطلب"} · {r.decidedBy || "—"}{r.decidedAt ? ` · ${formatTime(r.decidedAt)}` : ""}
      </p>
      {r.decisionOption && OPTION_LABEL[r.decisionOption] && <p className="mt-1 text-body-regular-14 text-text-secondary">{OPTION_LABEL[r.decisionOption]}</p>}
      {r.decisionNote && <p className="mt-2 text-body-regular-14">«{r.decisionNote}»</p>}
      <p className="mt-2 flex items-center gap-2 text-body-small-12 text-text-secondary"><LockIcon /> القرار نهائي؛ أي تصحيح لاحق يكون بقيد عكسي.</p>
      {canReopen && (
        <div className="mt-3">
          <Button variant="secondary" disabled={busy} onClick={async () => {
            setBusy(true);
            const res = await reopenShift(r.refId!, r.decisionNote || "إعادة الإغلاق للتصحيح").catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
            if (res.ok) return onReopened();
            setMsg(res.message);
            setBusy(false);
          }}>إعادة فتح المناوبة للعامل</Button>
          <p className="mt-1 text-body-small-12 text-text-secondary">المناوبة ما زالت مرفوضة. أعد فتحها ليصحّح العامل إغلاقه.</p>
          {msg && <p className="mt-1 text-body-small-12 text-status-danger-700">{msg}</p>}
        </div>
      )}
    </div>
  );
}

// ---------- helpers ----------
function closeSnapshot(r: Request): CloseSnapshot {
  return r.payload as unknown as CloseSnapshot;
}
function absC(c: bigint): bigint {
  return c < 0n ? -c : c;
}

function Skeleton() {
  return (
    <div aria-busy className="grid gap-6 lg:grid-cols-[5fr_7fr]">
      <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <span key={i} className="h-24 animate-pulse rounded-lg bg-surface-muted" />)}</div>
      <span className="h-96 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
