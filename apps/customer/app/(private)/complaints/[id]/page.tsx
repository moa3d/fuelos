"use client";
// C7 — complaint conversation, now a real route (/complaints/[id]) instead of in-page `selected` state, so
// the browser back button returns to the list and F5 reopens the same conversation. `ComplaintDetail`'s body
// (stages, bubbles, reply bar) is unchanged from the old complaints/page.tsx — only how the row is loaded
// (by id, via the new `loadComplaint`) and where the back button goes are different.
import { formatTime } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge, cx } from "@fuelos/ui";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { complaintBadge, timelineStep } from "@/lib/complaint-rules";
import { loadComplaint, loadComplaintMessages, replyToComplaint, type ComplaintRow, type Message, type Outcome } from "@/lib/complaints-data";
import { useCustomer } from "../../customer-context";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

type Load = { status: "loading" } | { status: "error" } | { status: "notfound" } | { status: "ready"; row: ComplaintRow };

export default function ComplaintDetailPage() {
  const { userId } = useCustomer();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    loadComplaint(userId, params.id).then(
      (row) => { if (alive) setLoad(row ? { status: "ready", row } : { status: "notfound" }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [userId, params.id]);

  if (load.status === "loading") {
    return (
      <div aria-busy className="mx-auto flex max-w-[480px] flex-col gap-4 p-4">
        <span className="block h-20 motion-safe:animate-pulse rounded-[18px] bg-surface-muted" />
        <span className="block h-24 motion-safe:animate-pulse rounded-[18px] bg-surface-muted" />
        <span className="block h-16 motion-safe:animate-pulse rounded-[16px] bg-surface-muted" />
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div className="mx-auto max-w-[480px] p-4">
        <AlertBanner tone="danger" title="تعذّر التحميل" action={<Button variant="secondary" className="min-h-11" onClick={() => router.push("/complaints")}>رجوع</Button>} />
      </div>
    );
  }
  if (load.status === "notfound") {
    return (
      <div className="mx-auto flex max-w-[480px] flex-col items-center gap-4 p-6 text-center">
        <p className="text-body-regular-14 text-text-secondary">لم نجد هذه الشكوى</p>
        <Link href="/complaints"
          className={cx("inline-flex min-h-11 items-center rounded-sm bg-brand-primary px-4 text-body-strong-14 text-white transition-colors motion-reduce:transition-none hover:bg-brand-primary-hover", FOCUS)}>
          رجوع إلى الشكاوى
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[480px] p-4 pb-10">
      <ComplaintDetail row={load.row} onBack={() => router.push("/complaints")} />
    </div>
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
  const doneFlags = [true, step !== "sent", step === "resolved"];
  const firstOpen = doneFlags.indexOf(false);
  const stages = ["أُرسلت", "قيد الرد", "تم الحل"].map((label, i) => ({
    label,
    done: doneFlags[i],
    state: (doneFlags[i] ? "done" : i === firstOpen ? "current" : "upcoming") as StageState,
  }));

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
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="رجوع"
          className={cx("inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-muted text-text-primary transition-colors motion-reduce:transition-none hover:bg-border-default", FOCUS)}>
          <Icon name="chevron-left" size={20} className="rtl:rotate-180" />
        </button>
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-heading-h2-20">{row.subject}</p>
            <p className="text-body-small-12 text-text-secondary">{row.stationName}{row.invoiceNumber ? ` · فاتورة INV-${row.invoiceNumber}` : ""}</p>
          </div>
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border border-border-default bg-surface-card p-4 shadow-card">
        <div className="flex items-start text-body-small-12">
          {stages.map((st, i) => (
            <Fragment key={st.label}>
              {i > 0 && <div aria-hidden className={cx("mt-[11px] h-0.5 flex-1", stages[i - 1].done ? "bg-brand-action" : "bg-border-default")} />}
              <div className="flex shrink-0 flex-col items-center gap-1.5">
                <StageDot state={st.state} />
                <span className={cx("whitespace-nowrap", st.state === "upcoming" ? "text-text-secondary" : "text-text-primary")}>{st.label}</span>
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {messages === undefined ? (
          <span className="block h-16 motion-safe:animate-pulse rounded-[16px] bg-surface-muted" />
        ) : messages.length === 0 ? (
          <p className="text-body-regular-14 text-text-secondary">لا رسائل بعد.</p>
        ) : messages.map((m) => (
          <div key={m.id} className={cx("max-w-[85%] rounded-[16px] p-3 text-body-regular-14 text-text-primary", m.authorSide === "customer" ? "self-end bg-brand-primary-50" : "self-start border border-border-default bg-surface-card")}>
            <p>{m.body}</p>
            <p className="mt-1 text-body-small-12 text-text-secondary">{formatTime(m.createdAt)}</p>
          </div>
        ))}
      </div>

      {error && <AlertBanner tone="danger" title={error} />}

      {row.status !== "resolved" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <textarea rows={1} aria-label="ردّك" placeholder="ردّك" value={reply} onChange={(e) => setReply(e.target.value)}
              className="min-h-11 flex-1 resize-none rounded-full border border-border-strong bg-surface-card px-4 py-2.5 font-sans text-body-large-16 text-text-primary outline-none placeholder:text-text-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-50" />
            <button type="button" aria-label={busy ? "جارٍ الإرسال…" : "إرسال"} disabled={busy || !reply.trim()} onClick={send}
              className={cx("inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white transition-colors motion-reduce:transition-none hover:bg-brand-primary-hover disabled:opacity-50", FOCUS)}>
              <Icon name="send" size={18} />
            </button>
          </div>
          {busy && <p className="text-body-small-12 text-text-secondary">جارٍ الإرسال…</p>}
        </div>
      )}
    </div>
  );
}

type StageState = "done" | "current" | "upcoming";

// Done points come from the same flags the timeline always used; the first undone point is the current one.
function StageDot({ state }: { state: StageState }) {
  if (state === "done") {
    return <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-brand-action text-white"><Icon name="check" size={14} /></span>;
  }
  if (state === "current") {
    return <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-brand-primary ring-4 ring-brand-primary-50"><span className="size-2 rounded-full bg-white" /></span>;
  }
  return <span aria-hidden className="size-6 rounded-full border-2 border-border-strong bg-surface-card" />;
}
