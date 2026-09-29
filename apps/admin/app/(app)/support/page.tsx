"use client";
// «تذاكر الدعم» — the full queue, every ticket ever opened (A4's own panel only shows a handful of open ones
// alongside roles/the audit log). Claim/resolve/raise-priority reuse the exact same writes as A4
// (tickets_admin RLS: is_platform_staff()), so a ticket only ever changes in one place.
import { formatTime } from "@fuelos/core";
import { AlertBanner, Button, Input, StatusBadge } from "@fuelos/ui";
import { useEffect, useMemo, useState } from "react";
import { ticketBadge, type TicketPriority } from "@/lib/dashboard-rules";
import {
  claimTicket, loadTickets, resolveTicket, setTicketPriority, type Outcome, type TicketFull,
} from "@/lib/support-data";
import { hoursUntilSla, matchesSearch, slaText, STATUS_LABEL, type TicketStatus } from "@/lib/support-rules";
import { useAdmin } from "../admin-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: TicketFull[] };
type Filter = "all" | TicketStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" }, { key: "open", label: STATUS_LABEL.open },
  { key: "in_progress", label: STATUS_LABEL.in_progress }, { key: "resolved", label: STATUS_LABEL.resolved },
];

export default function SupportPage() {
  const { userId } = useAdmin();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    loadTickets().then((data) => { setLoad({ status: "ready", data }); setNow(Date.now()); }, () => setLoad({ status: "error" }));
  }, [tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  const shown = useMemo(() => {
    if (load.status !== "ready") return [];
    return load.data.filter((t) => (filter === "all" || t.status === filter) && matchesSearch(t.subject, t.stationName, query));
  }, [load, filter, query]);

  const open = load.status === "ready" ? load.data.filter((t) => t.status === "open").length : 0;
  const urgent = load.status === "ready" ? load.data.filter((t) => t.status !== "resolved" && t.priority === "high").length : 0;
  const inProgress = load.status === "ready" ? load.data.filter((t) => t.status === "in_progress").length : 0;

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6">
      <header>
        <h1 className="text-display-32">تذاكر الدعم</h1>
        <p className="text-body-regular-14 text-text-secondary">كل تذكرة عبر كل المحطات، وليس فقط ما يظهر في «الصلاحيات والسجلات»</p>
      </header>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر التحميل" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>} />
      )}

      {load.status === "ready" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi label="مفتوحة" value={open} />
            <Kpi label="عاجلة" value={urgent} tone={urgent > 0 ? "danger" : undefined} />
            <Kpi label="قيد المعالجة" value={inProgress} />
          </div>

          <section className="rounded-lg bg-surface-card shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div role="tablist" aria-label="الحالة" className="flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                  <FilterChip key={f.key} label={f.key === "all" ? f.label : `${f.label} (${load.data.filter((t) => t.status === f.key).length})`}
                    active={filter === f.key} onClick={() => setFilter(f.key)} />
                ))}
              </div>
              <Input label="" placeholder="ابحث بالموضوع أو المحطة" aria-label="بحث" value={query} onChange={(e) => setQuery(e.target.value)} className="w-64" />
            </div>

            {load.data.length === 0 ? (
              <p className="p-8 text-center text-body-regular-14 text-text-secondary">لا توجد تذاكر دعم بعد. ✓</p>
            ) : shown.length === 0 ? (
              <p className="p-8 text-center text-body-regular-14 text-text-secondary">لا نتائج تطابق البحث أو الفلتر.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border-default px-4 pb-4">
                {shown.map((t) => <TicketRow key={t.id} t={t} userId={userId} now={now} onChanged={refresh} />)}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-lg bg-surface-card p-5 shadow-card">
      <p className="text-body-small-12 text-text-secondary">{label}</p>
      <p className={`mt-1 text-number-l-24 ${tone === "danger" ? "text-status-danger-700" : ""}`}>{value}</p>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={`h-9 rounded-full border px-4 text-body-strong-14 ${active ? "border-brand-primary bg-brand-primary text-white" : "border-border-default bg-surface-card text-text-secondary"}`}>
      {label}
    </button>
  );
}

function TicketRow({ t, userId, now, onChanged }: { t: TicketFull; userId: string; now: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const badge = ticketBadge(t.priority);
  const slaHours = hoursUntilSla(t.slaDueAt, now, t.status);

  async function run(fn: () => Promise<Outcome>) {
    setBusy(true); setMsg(undefined);
    const res = await fn().catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (res.ok) return onChanged();
    setMsg(res.message); setBusy(false);
  }

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-body-strong-14">#{t.number} · {t.subject}</p>
          <p className="text-body-small-12 text-text-secondary">
            {t.stationName ?? "بلا محطة"} · فتحها {t.openedByName ?? "غير معروف"} · {formatTime(t.createdAt)}
            {t.assigneeName && ` · مسندة إلى ${t.assigneeName}${t.assigneeId === userId ? " (أنت)" : ""}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          <span className="text-body-small-12 text-text-secondary">{STATUS_LABEL[t.status]}</span>
        </div>
      </div>
      {slaHours !== null && (() => {
        const sla = slaText(slaHours);
        return <p className={`mt-1 text-body-small-12 ${sla.tone === "danger" ? "text-status-danger-700" : sla.tone === "warning" ? "text-status-warning-700" : "text-text-secondary"}`}>{sla.label}</p>;
      })()}
      {msg && <p className="mt-1 text-body-small-12 text-status-danger-700">{msg}</p>}
      {t.status !== "resolved" && (
        <div className="mt-2 flex flex-wrap gap-2">
          {t.assigneeId !== userId && <Button variant="secondary" size="md" disabled={busy} onClick={() => run(() => claimTicket(t.id, userId))}>إسناد لي</Button>}
          <Button variant="secondary" size="md" disabled={busy} onClick={() => run(() => resolveTicket(t.id))}>حلّ التذكرة</Button>
          {t.priority !== ("high" as TicketPriority) && <Button variant="ghost" size="md" disabled={busy} onClick={() => run(() => setTicketPriority(t.id, "high"))}>رفع الأولوية</Button>}
        </div>
      )}
    </li>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <span key={i} className="h-24 animate-pulse rounded-lg bg-surface-muted" />)}</div>
      <span className="h-64 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}
