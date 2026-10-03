"use client";
// C7 «شكاواي» — split out from the combined رewards/complaints screen now that the bottom nav gives it its own
// tab. Logic and queries are unchanged (lib/complaints-data.ts, lib/complaint-rules.ts).
import { formatDay, formatTime } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge, TextArea } from "@fuelos/ui";
import { useEffect, useState } from "react";
import { complaintBadge, KIND_LABEL, timelineStep, type ComplaintKind } from "@/lib/complaint-rules";
import {
  fileComplaint, loadComplaintMessages, loadComplaints, loadStationOptions, replyToComplaint,
  type ComplaintRow, type ComplaintsData, type Message, type Outcome, type StationOption,
} from "@/lib/complaints-data";
import { useCustomer } from "../customer-context";

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
      {load.status === "loading" && <span className="block h-40 animate-pulse rounded-lg bg-surface-muted" />}
      {load.status === "error" && <AlertBanner tone="danger" title="تعذّر التحميل" />}
      {load.status === "ready" && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-heading-h3-16">{load.data.complaints.length} {load.data.complaints.length === 1 ? "شكوى" : "شكاوى"}</h2>
            <Button variant="action" size="md" onClick={() => setNewOpen(true)}>شكوى جديدة +</Button>
          </div>
          {load.data.complaints.length === 0 ? (
            <p className="rounded-lg bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">لا توجد شكاوى — كل شيء على ما يرام.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {load.data.complaints.map((c) => {
                const badge = complaintBadge(c.status);
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => setSelected(c)} className="w-full rounded-lg bg-surface-card p-4 text-start shadow-card">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-body-strong-14">{c.subject}</p>
                        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                      </div>
                      <p className="mt-1 text-body-small-12 text-text-secondary">
                        {c.stationName}{c.invoiceNumber ? ` · فاتورة INV-${c.invoiceNumber}` : ` · ${KIND_LABEL[c.kind]}`} · {formatDay(c.createdAt)}
                      </p>
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
      <div className="w-full max-w-md rounded-lg bg-surface-card p-6 shadow-raised">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-heading-h2-20">شكوى جديدة</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted">✕</button>
        </div>
        <div className="flex flex-col gap-4">
          {error && <AlertBanner tone="danger" title={error} />}
          <div className="flex flex-col gap-1">
            <label className="text-label-12 text-text-secondary">المحطة</label>
            <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-large-16">
              {stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setKind("complaint")} className={`h-10 flex-1 rounded-md border text-body-strong-14 ${kind === "complaint" ? "border-brand-primary bg-brand-primary text-white" : "border-border-default"}`}>شكوى</button>
            <button type="button" onClick={() => setKind("price_report")} className={`h-10 flex-1 rounded-md border text-body-strong-14 ${kind === "price_report" ? "border-brand-primary bg-brand-primary text-white" : "border-border-default"}`}>بلاغ سعر</button>
          </div>
          <TextArea label="صف المشكلة" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Button variant="action" size="lg" block disabled={busy || !subject.trim() || !stationId} onClick={send}>{busy ? "جارٍ الإرسال…" : "إرسال"}</Button>
        </div>
      </div>
    </div>
  );
}
