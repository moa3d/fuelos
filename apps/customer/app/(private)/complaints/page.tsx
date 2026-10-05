"use client";
// C7 «شكاواي» — split out from the combined رewards/complaints screen now that the bottom nav gives it its own
// tab. Logic and queries are unchanged (lib/complaints-data.ts, lib/complaint-rules.ts).
import { formatDay, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, StatusBadge, TextArea } from "@fuelos/ui";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { complaintBadge, KIND_LABEL, timelineStep, type ComplaintKind } from "@/lib/complaint-rules";
import {
  fileComplaint, loadComplaintMessages, loadComplaints, loadStationOptions, replyToComplaint,
  type ComplaintRow, type ComplaintsData, type Message, type Outcome, type StationOption,
} from "@/lib/complaints-data";
import { useCustomer } from "../customer-context";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

export default function ComplaintsPage() {
  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-4 pb-10">
      <h1 className="text-heading-h1-24">الشكاوى</h1>
      <ComplaintsTab />
    </div>
  );
}

type CLoad = { status: "loading" } | { status: "error" } | { status: "ready"; data: ComplaintsData };

function ComplaintsTab() {
  const { userId } = useCustomer();
  const [load, setLoad] = useState<CLoad>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<ComplaintRow>();
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    loadComplaints(userId).then((data) => setLoad({ status: "ready", data }), () => setLoad({ status: "error" }));
  }, [userId, tick]);

  function refresh() { setTick((t) => t + 1); setSelected(undefined); }

  if (selected) return <ComplaintDetail row={selected} onBack={() => setSelected(undefined)} />;

  return (
    <>
      {load.status === "loading" && (
        <div aria-busy className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <span key={i} className="block h-[120px] motion-safe:animate-pulse rounded-[18px] bg-surface-muted" />)}
        </div>
      )}
      {load.status === "error" && <AlertBanner tone="danger" title="تعذّر التحميل" />}
      {load.status === "ready" && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-heading-h3-16">{load.data.complaints.length} {load.data.complaints.length === 1 ? "شكوى" : "شكاوى"}</h2>
            <button type="button" onClick={() => setNewOpen(true)}
              className={cx("inline-flex h-11 items-center gap-2 rounded-sm bg-brand-primary px-4 text-body-strong-14 text-white transition-colors motion-reduce:transition-none hover:bg-brand-primary-hover", FOCUS)}>
              <Icon name="plus" size={16} />
              شكوى جديدة
            </button>
          </div>
          {load.data.complaints.length === 0 ? (
            <p className="rounded-[18px] border border-dashed border-border-default bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">لا توجد شكاوى — كل شيء على ما يرام.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {load.data.complaints.map((c) => {
                const badge = complaintBadge(c.status);
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => setSelected(c)}
                      className={cx("flex w-full flex-col gap-2 rounded-[18px] border border-border-default bg-surface-card p-4 text-start shadow-card transition-colors motion-reduce:transition-none hover:bg-surface-muted", FOCUS)}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-body-strong-14">{c.stationName}</p>
                        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={c.kind === "price_report" ? "warning" : "primary"}>{KIND_LABEL[c.kind]}</StatusBadge>
                        {c.invoiceNumber && <span className="text-body-small-12 text-text-secondary">فاتورة INV-{c.invoiceNumber}</span>}
                      </div>
                      <p className="line-clamp-2 text-body-regular-14 text-text-secondary">{c.subject}</p>
                      <p className="text-body-small-12 text-text-secondary">{formatDay(c.createdAt)}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {newOpen && <NewComplaintModal onClose={() => setNewOpen(false)} onDone={() => { setNewOpen(false); refresh(); }} />}
    </>
  );
}

function ComplaintDetail({ row, onBack }: { row: ComplaintRow; onBack: () => void }) {
  const { userId } = useCustomer();
  const [messages, setMessages] = useState<Message[]>();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const badge = complaintBadge(row.status);
  const step = timelineStep(row.status);

  useEffect(() => {
    loadComplaintMessages(row.id).then(setMessages, () => setMessages([]));
  }, [row.id]);

  async function send() {
    setBusy(true); setError(undefined);
    const res: Outcome = await replyToComplaint(row.id, userId, reply.trim()).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setReply("");
    loadComplaintMessages(row.id).then(setMessages);
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-body-strong-14 text-brand-primary">‹ رجوع</button>
      <div className="flex items-start justify-between gap-2">
        <p className="text-heading-h2-20">{row.subject}</p>
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </div>
      <p className="text-body-small-12 text-text-secondary">{row.stationName}{row.invoiceNumber ? ` · فاتورة INV-${row.invoiceNumber}` : ""}</p>

      <div className="flex items-center gap-1 text-body-small-12">
        <TimelineDot done label="أُرسلت" />
        <div className="h-px flex-1 bg-border-default" />
        <TimelineDot done={step !== "sent"} label="قيد الرد" />
        <div className="h-px flex-1 bg-border-default" />
        <TimelineDot done={step === "resolved"} label="تم الحل" />
      </div>

      <div className="flex flex-col gap-2">
        {messages === undefined ? (
          <span className="block h-16 animate-pulse rounded-md bg-surface-muted" />
        ) : messages.length === 0 ? (
          <p className="text-body-regular-14 text-text-secondary">لا رسائل بعد.</p>
        ) : messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-lg p-3 text-body-regular-14 ${m.authorSide === "customer" ? "self-end bg-brand-primary text-white" : "self-start bg-surface-muted"}`}>
            <p>{m.body}</p>
            <p className={`mt-1 text-body-small-12 ${m.authorSide === "customer" ? "text-white/80" : "text-text-secondary"}`}>{formatTime(m.createdAt)}</p>
          </div>
        ))}
      </div>

      {error && <AlertBanner tone="danger" title={error} />}

      {row.status !== "resolved" && (
        <div className="flex flex-col gap-2">
          <TextArea label="ردّك" value={reply} onChange={(e) => setReply(e.target.value)} />
          <Button variant="action" disabled={busy || !reply.trim()} onClick={send}>{busy ? "جارٍ الإرسال…" : "إرسال"}</Button>
        </div>
      )}
    </div>
  );
}

function TimelineDot({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span aria-hidden className={`size-2.5 rounded-full ${done ? "bg-status-success" : "bg-border-default"}`} />
      <span className="text-text-muted">{label}</span>
    </div>
  );
}

function NewComplaintModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { userId } = useCustomer();
  const [stations, setStations] = useState<StationOption[]>();
  const [stationId, setStationId] = useState("");
  const [kind, setKind] = useState<ComplaintKind>("complaint");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => { loadStationOptions().then((s) => { setStations(s); if (s[0]) setStationId(s[0].id); }); }, []);

  async function send() {
    setBusy(true); setError(undefined);
    const res = await fileComplaint(userId, stationId, kind, subject.trim()).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="شكوى جديدة">
      <div className="w-full max-w-md rounded-[24px] bg-surface-card p-5 shadow-raised">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-heading-h2-20">شكوى جديدة</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className={cx("flex size-11 items-center justify-center rounded-full bg-surface-muted text-text-primary transition-colors motion-reduce:transition-none hover:bg-border-default", FOCUS)}>✕</button>
        </div>
        <div className="flex flex-col gap-4">
          {error && <AlertBanner tone="danger" title={error} />}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="complaint-station" className="text-label-12 text-text-secondary">المحطة</label>
            <select id="complaint-station" value={stationId} onChange={(e) => setStationId(e.target.value)}
              className={cx("h-11 rounded-[10px] border border-border-strong bg-surface-card px-3 text-body-large-16 text-text-primary", FOCUS)}>
              {stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div role="group" aria-label="نوع البلاغ" className="flex gap-1 rounded-[12px] bg-surface-muted p-1">
            <button type="button" aria-pressed={kind === "complaint"} onClick={() => setKind("complaint")}
              className={cx("h-11 flex-1 rounded-[10px] text-body-strong-14 transition-colors motion-reduce:transition-none", FOCUS, kind === "complaint" ? "bg-brand-primary text-white" : "text-text-secondary")}>شكوى</button>
            <button type="button" aria-pressed={kind === "price_report"} onClick={() => setKind("price_report")}
              className={cx("h-11 flex-1 rounded-[10px] text-body-strong-14 transition-colors motion-reduce:transition-none", FOCUS, kind === "price_report" ? "bg-brand-primary text-white" : "text-text-secondary")}>بلاغ سعر</button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="complaint-subject" className="text-label-12 text-text-secondary">صف المشكلة</label>
            <textarea id="complaint-subject" value={subject} onChange={(e) => setSubject(e.target.value)}
              className="h-[148px] resize-none rounded-[12px] border-2 border-border-strong bg-surface-card p-3.5 text-body-large-16 text-text-primary outline-none placeholder:text-text-muted focus:border-brand-primary" />
          </div>
          <Button variant="primary" size="lg" block disabled={busy || !subject.trim() || !stationId} onClick={send}
            className="gap-2">
            <Icon name="send" size={18} />
            {busy ? "جارٍ الإرسال…" : "إرسال"}
          </Button>
        </div>
      </div>
    </div>
  );
}
