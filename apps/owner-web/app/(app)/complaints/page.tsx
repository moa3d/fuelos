"use client";
// O10 — شكاوى الزبائن والبلاغات (design/screens/O10.png). Owner/shift_manager only (RLS: complaints_read).
// Replying/closing are plain table writes; recording an invoice correction is owner-only here (invoice_corrections
// RLS is owner/accountant, and accountant can't open this screen at all) and only records the correction row —
// there is no capability yet to reissue the invoice file (docs/briefs/04b-cowork-complaints.md).
import { formatDay, formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, Input, StatusBadge, TextArea } from "@fuelos/ui";
import { useEffect, useState } from "react";
import {
  CANNED_REPLIES, canCorrectInvoice, canHandle, hoursUntilSla, KIND_ICON, KIND_LABEL, slaText, statusBadge,
  STATUS_LABEL, type ComplaintStatus,
} from "@/lib/complaint-rules";
import {
  closeResolved, loadComplaintDetail, loadComplaints, recordInvoiceCorrection, sendReply,
  type ComplaintDetail, type ComplaintRow, type ComplaintsData, type Outcome,
} from "@/lib/complaints-data";
import { timeAgo } from "@/lib/time-ago";
import { useOffice } from "../office-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: ComplaintsData };
const TABS: ComplaintStatus[] = ["open", "awaiting_station", "resolved", "escalated"];

export default function ComplaintsPage() {
  const { current, userId } = useOffice();
  const canAccess = canHandle(current.role);

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<ComplaintStatus>("open");
  const [selectedId, setSelectedId] = useState<string>();
  const [showTemplates, setShowTemplates] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!canAccess) return;
    let alive = true;
    loadComplaints(current.stationId).then(
      (data) => { if (alive) { setLoad({ status: "ready", data }); setNow(Date.now()); } },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [current.stationId, canAccess, tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  const rows = load.status === "ready" ? load.data.complaints : [];
  const counts = Object.fromEntries(TABS.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<ComplaintStatus, number>;

  if (!canAccess) {
    return (
      <div className="mx-auto max-w-2xl">
        <AlertBanner tone="info" title="الشكاوى والبلاغات متاحة لصاحب المحطة ومدير المناوبة فقط">
          هذا القسم يخص التعامل اليومي مع الزبائن، وليس من مهام المحاسب.
        </AlertBanner>
      </div>
    );
  }

  const shown = rows.filter((r) => r.status === tab);
  const selected = shown.find((r) => r.id === selectedId) ?? shown[0];

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">شكاوى الزبائن والبلاغات</h1>
          <p className="text-body-regular-14 text-text-secondary">
            ردّ المحطة يظهر للزبون في التطبيق · ما لا يُحل خلال 48 ساعة يُصعَّد للمنصة
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowTemplates(true)}>قوالب الردود</Button>
          <Button variant="secondary" onClick={refresh}>تحديث</Button>
        </div>
      </header>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل الشكاوى" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}

      {load.status === "ready" && (
        <>
          <div role="tablist" aria-label="الحالة" className="flex flex-wrap gap-2">
            {TABS.map((s) => (
              <button key={s} role="tab" aria-selected={tab === s} onClick={() => { setTab(s); setSelectedId(undefined); }}
                className={cx("h-10 rounded-full border px-4 text-body-strong-14",
                  tab === s ? "border-brand-primary bg-brand-primary text-white" : "border-border-default bg-surface-card text-text-secondary")}>
                {STATUS_LABEL[s]} ({counts[s]})
              </button>
            ))}
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <ul className="flex flex-col gap-3">
              {shown.length === 0 ? (
                <p className="rounded-lg bg-surface-card p-6 text-body-regular-14 text-text-secondary shadow-card">لا توجد حالات هنا.</p>
              ) : shown.map((r) => <ComplaintCard key={r.id} r={r} now={now} selected={r.id === selected?.id} onSelect={() => setSelectedId(r.id)} />)}
            </ul>

            <div className="lg:sticky lg:top-8">
              {selected ? (
                <Detail key={selected.id} row={selected} stationId={current.stationId} role={current.role} userId={userId}
                  currency={current.currencyLabel} now={now} onChanged={refresh} />
              ) : (
                <p className="rounded-lg bg-surface-card p-8 text-center text-body-regular-14 text-text-secondary shadow-card">اختر حالة من القائمة لتراها هنا.</p>
              )}
            </div>
          </div>
        </>
      )}

      {showTemplates && (
        <Modal title="قوالب الردود" onClose={() => setShowTemplates(false)}>
          <ul className="flex flex-col gap-3">
            {CANNED_REPLIES.map((t) => (
              <li key={t.label} className="rounded-md bg-surface-muted p-3">
                <p className="text-body-strong-14">{t.label}</p>
                <p className="mt-1 text-body-regular-14 text-text-secondary">{t.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-body-small-12 text-text-secondary">اختر حالة أولاً لإدراج أحد هذه الردود مباشرة في مربع الرد.</p>
        </Modal>
      )}
    </div>
  );
}

function ComplaintCard({ r, now, selected, onSelect }: { r: ComplaintRow; now: number; selected: boolean; onSelect: () => void }) {
  const badge = statusBadge(r.status);
  return (
    <li>
      <button type="button" onClick={onSelect} aria-current={selected ? "true" : undefined}
        className={cx("w-full rounded-lg border p-4 text-start transition-colors",
          selected ? "border-2 border-brand-primary bg-brand-primary-50" : "border-border-default bg-surface-card hover:bg-surface-muted")}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-2 text-body-strong-14"><span aria-hidden>{KIND_ICON[r.kind]}</span>{r.customerName}</span>
          <span className="shrink-0 text-body-small-12 text-text-muted">{timeAgo(r.createdAt, now)}</span>
        </div>
        <p className="mt-1 text-body-small-12 text-text-secondary">
          {r.invoiceNumber ? `فاتورة INV-${r.invoiceNumber}` : "صفحة المحطة"} · {r.subject}
        </p>
        <div className="mt-2">
          {r.kind === "price_report" && r.status !== "resolved" ? <StatusBadge tone="info">{KIND_LABEL.price_report}</StatusBadge> : <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
        </div>
      </button>
    </li>
  );
}

// ---------- detail ----------
function Detail({ row, stationId, role, userId, currency, now, onChanged }: {
  row: ComplaintRow; stationId: string; role: string; userId: string; currency: string; now: number; onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ComplaintDetail>();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let alive = true;
    loadComplaintDetail(stationId, row).then((d) => { if (alive) setDetail(d); }, () => { if (alive) setDetail(undefined); });
    return () => { alive = false; };
  }, [stationId, row]);

  const money = (v: string | number) => formatMoney(String(v), currency);
  const hours = hoursUntilSla(row.slaDueAt, now, row.status);
  const pending = row.status === "open" || row.status === "awaiting_station";

  async function run(fn: () => Promise<Outcome>) {
    setBusy(true);
    setError(undefined);
    const res = await fn().catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (res.ok) { onChanged(); return; }
    setError(res.message);
    setBusy(false);
  }

  return (
    <article className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-heading-h1-24">{row.customerName}</h2>
          <p className="mt-1 text-body-regular-14 text-text-secondary">{row.subject}</p>
        </div>
        {hours !== null && <StatusBadge tone={slaText(hours).tone}>{slaText(hours).label}</StatusBadge>}
      </header>

      {detail && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="زبون منذ" value={detail.customer.customerSince ? formatDay(detail.customer.customerSince) : "—"} />
          <Stat label="عدد الفواتير" value={formatNumber(detail.customer.invoiceCount, 0)} />
          <Stat label="نقاط الولاء" value={formatNumber(detail.customer.loyaltyPoints, 0)} />
          <Stat label="نوع الحالة" value={KIND_LABEL[row.kind]} />
        </div>
      )}

      {detail?.invoice && (
        <section className="rounded-md bg-surface-muted p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-body-strong-14">الفاتورة المرتبطة · INV-{detail.invoice.number}</h3>
            <StatusBadge tone={detail.invoice.status === "corrected" ? "info" : detail.invoice.status === "cancelled" ? "neutral" : "success"}>
              {INVOICE_STATUS_LABEL[detail.invoice.status] ?? detail.invoice.status}
            </StatusBadge>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="المبلغ" value={money(detail.invoice.amount)} />
            <Stat label="الكمية" value={`${formatNumber(Number(detail.invoice.liters), 2)} لتر`} />
            <Stat label="السعر" value={money(detail.invoice.unitPrice)} />
            <Stat label="التاريخ" value={formatDay(detail.invoice.issuedAt)} />
          </div>
          {detail.invoice.corrections.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-body-small-12 text-text-secondary">
              {detail.invoice.corrections.map((c) => (
                <li key={c.id}>تصحيح {money(c.amountDelta)} — «{c.reason}» · {formatDay(c.createdAt)}</li>
              ))}
            </ul>
          )}
          <InvoiceCorrectionForm invoiceId={detail.invoice.id} role={role} userId={userId} onDone={onChanged} />
        </section>
      )}

      <section>
        <h3 className="mb-2 text-heading-h3-16">المحادثة</h3>
        {!detail ? (
          <span className="block h-24 animate-pulse rounded-md bg-surface-muted" />
        ) : detail.messages.length === 0 ? (
          <p className="text-body-regular-14 text-text-secondary">لا رسائل بعد.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.messages.map((m) => (
              <li key={m.id} className={cx("max-w-[85%] rounded-lg p-3 text-body-regular-14",
                m.authorSide === "station" ? "self-end bg-brand-primary text-white" : m.authorSide === "platform" ? "self-start bg-status-info-50" : "self-start bg-surface-muted")}>
                <p>{m.body}</p>
                <p className={cx("mt-1 text-body-small-12", m.authorSide === "station" ? "text-white/80" : "text-text-secondary")}>{m.authorName} · {formatTime(m.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <AlertBanner tone="danger" title={error} />}

      {row.status === "resolved" ? (
        <p className="text-body-small-12 text-text-secondary">أُغلقت هذه الحالة كمحلولة{row.resolvedAt ? ` بتاريخ ${formatDay(row.resolvedAt)}` : ""}.</p>
      ) : row.status === "escalated" ? (
        <AlertBanner tone="danger" title="مصعّدة إلى المنصة">تجاوزت هذه الحالة مهلة الرد وأصبحت مرئية لفريق FuelOS.</AlertBanner>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {CANNED_REPLIES.map((t) => (
              <button key={t.label} type="button" onClick={() => setReply(t.body)}
                className="rounded-full border border-border-default bg-surface-card px-3 py-1.5 text-body-small-12 text-text-secondary hover:bg-surface-muted">
                {t.label}
              </button>
            ))}
          </div>
          <TextArea label="الرد" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="اكتب ردك للزبون…" />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="action" size="lg" disabled={busy || reply.trim() === ""}
              onClick={() => run(async () => { const res = await sendReply(row.id, userId, reply.trim(), row.status === "open"); if (res.ok) setReply(""); return res; })}>
              {busy ? "جارٍ الإرسال…" : "إرسال الرد"}
            </Button>
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => run(() => closeResolved(row.id))}>إغلاق كمحلولة</Button>
          </div>
        </>
      )}
      {pending && <p className="text-body-small-12 text-text-secondary">الرد يظهر للزبون في التطبيق فوراً.</p>}
    </article>
  );
}

const INVOICE_STATUS_LABEL: Record<string, string> = { pending: "قيد الإصدار", confirmed: "مؤكَّدة", corrected: "مصحَّحة", cancelled: "ملغاة" };

function InvoiceCorrectionForm({ invoiceId, role, userId, onDone }: { invoiceId: string; role: string; userId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const allowed = canCorrectInvoice(role);

  if (!open) {
    return (
      <div className="mt-3">
        <Button variant="secondary" size="md" disabled={!allowed} title={allowed ? undefined : "تسجيل تصحيح الفاتورة متاح لصاحب المحطة فقط"} onClick={() => setOpen(true)}>
          تسجيل تصحيح على الفاتورة
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-border-default p-3">
      <Input label="فرق المبلغ (سالب لتخفيض الفاتورة)" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <TextArea label="السبب (يظهر في سجل الفاتورة)" required value={reason} onChange={(e) => setReason(e.target.value)} />
      <p className="text-body-small-12 text-text-secondary">يسجَّل التصحيح في سجل الفاتورة فوراً. إصدار ملف فاتورة جديد غير متاح بعد.</p>
      {msg && <p className="text-body-small-12 text-status-danger-700">{msg}</p>}
      <div className="flex gap-2">
        <Button variant="action" disabled={busy || !reason.trim() || !amount.trim()} onClick={async () => {
          setBusy(true); setMsg(undefined);
          const res = await recordInvoiceCorrection(invoiceId, userId, reason.trim(), amount.trim()).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
          if (res.ok) { setOpen(false); onDone(); return; }
          setMsg(res.message); setBusy(false);
        }}>{busy ? "جارٍ التسجيل…" : "تسجيل التصحيح"}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-surface-muted p-3"><p className="text-body-small-12 text-text-secondary">{label}</p><p className="text-body-strong-14">{value}</p></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-lg bg-surface-card p-6 shadow-raised">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-heading-h2-20">{title}</h2><button type="button" onClick={onClose} aria-label="إغلاق" className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="grid gap-6 lg:grid-cols-[5fr_7fr]">
      <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <span key={i} className="h-24 animate-pulse rounded-lg bg-surface-muted" />)}</div>
      <span className="h-96 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}
