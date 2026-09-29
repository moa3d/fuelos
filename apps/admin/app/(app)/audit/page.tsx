"use client";
// A4 — الصلاحيات والسجلات والدعم (design/screens/A4.png). Role templates are read-only reference (roles are
// fixed in RLS/RPCs, not a configurable matrix). Activity log reads every station's audit_log (is_platform_staff()
// RLS). Support tickets and feature flags are fully admin-writable (tickets_admin/flags_admin). Flags toggle
// all-or-nothing across every active station — the design's per-station targeting needs a station picker not
// built here yet.
import { formatTime } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge } from "@fuelos/ui";
import { useEffect, useState } from "react";
import {
  claimTicket, loadAuditData, resolveTicket, setFlagEverywhere, setTicketPriority,
  type AuditData, type AuditRow, type Outcome, type Ticket,
} from "@/lib/audit-data";
import { auditCategory, auditTag, CATEGORY_LABEL, ROLE_TEMPLATE_LABEL, type AuditCategory } from "@/lib/audit-rules";
import { ticketBadge } from "@/lib/dashboard-rules";
import { useAdmin } from "../admin-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: AuditData };
type Filter = "all" | AuditCategory;
const FILTERS: Filter[] = ["all", "security", "financial"];

export default function AuditPage() {
  const { userId } = useAdmin();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    loadAuditData().then((data) => setLoad({ status: "ready", data }), () => setLoad({ status: "error" }));
  }, [tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <header>
        <h1 className="text-display-32">الصلاحيات والسجلات والدعم</h1>
        <p className="text-body-regular-14 text-text-secondary">ثلاثة مراكز مترابطة: الأدوار، سجل نشاط لا يُحذف، وتذاكر الدعم</p>
      </header>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر التحميل" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>} />
      )}

      {load.status === "ready" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,5fr)_minmax(0,4fr)]">
          <section className="flex flex-col gap-3 rounded-lg bg-surface-card p-5 shadow-card">
            <h2 className="text-heading-h3-16">قوالب الأدوار</h2>
            <ul className="flex flex-col divide-y divide-border-default">
              {load.data.roleCounts.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="text-body-strong-14">{ROLE_TEMPLATE_LABEL[r.key]?.title ?? r.key}</p>
                    <p className="text-body-small-12 text-text-secondary">{ROLE_TEMPLATE_LABEL[r.key]?.description}</p>
                  </div>
                  <span className="text-number-m-18">{r.count}</span>
                </li>
              ))}
            </ul>
            <p className="text-body-small-12 text-text-secondary">هذه الصلاحيات ثابتة في النظام حسب الدور، وليست قابلة للتخصيص من هنا.</p>
          </section>

          <section className="flex flex-col gap-3 rounded-lg bg-surface-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-heading-h3-16">سجل النشاط</h2>
              <div role="tablist" aria-label="الفئة" className="flex gap-1">
                {FILTERS.map((f) => (
                  <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                    className={`h-8 rounded-full border px-3 text-body-small-12 ${filter === f ? "border-brand-primary bg-brand-primary text-white" : "border-border-default text-text-secondary"}`}>
                    {f === "all" ? "الكل" : CATEGORY_LABEL[f]}
                  </button>
                ))}
              </div>
            </div>
            <ul className="flex max-h-[560px] flex-col divide-y divide-border-default overflow-y-auto">
              {load.data.activity.filter((a) => filter === "all" || auditCategory(a.entity) === filter).map((a) => <ActivityRow key={a.id} row={a} />)}
              {load.data.activity.filter((a) => filter === "all" || auditCategory(a.entity) === filter).length === 0 && (
                <p className="py-6 text-center text-body-regular-14 text-text-secondary">لا نشاط من هذه الفئة.</p>
              )}
            </ul>
            <p className="flex items-center gap-2 text-body-small-12 text-text-secondary"><LockIcon /> السجل للقراءة فقط ولا يمكن حذفه أو تعديله من أي دور.</p>
          </section>

          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3 rounded-lg bg-surface-card p-5 shadow-card">
              <h2 className="text-heading-h3-16">تذاكر الدعم ({load.data.tickets.length})</h2>
              {load.data.tickets.length === 0 ? (
                <p className="text-body-regular-14 text-text-secondary">لا توجد تذاكر مفتوحة. ✓</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border-default">
                  {load.data.tickets.map((t) => <TicketRow key={t.id} t={t} userId={userId} onChanged={refresh} />)}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-3 rounded-lg bg-surface-card p-5 shadow-card">
              <h2 className="text-heading-h3-16">ميزات تجريبية</h2>
              {load.data.flags.length === 0 ? (
                <p className="text-body-regular-14 text-text-secondary">لا توجد ميزات تجريبية معرَّفة.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border-default">
                  {load.data.flags.map((f) => (
                    <FlagRow key={f.key} flag={f} totalStations={load.data.stationIds.length} allStationIds={load.data.stationIds} onChanged={refresh} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ row }: { row: AuditRow }) {
  return (
    <li className="py-2.5 text-body-regular-14">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body-strong-14">{auditTag(row.entity)}</span>
        <span className="text-body-small-12 text-text-muted">{formatTime(row.at)}</span>
      </div>
      <p className="text-body-small-12 text-text-secondary">
        {row.actorName}{row.stationName ? ` · ${row.stationName}` : ""} · {ACTION_LABEL[row.action] ?? row.action}
      </p>
      {row.reason && <p className="mt-0.5 text-body-small-12">«{row.reason}»</p>}
    </li>
  );
}
const ACTION_LABEL: Record<string, string> = { insert: "إنشاء", update: "تعديل", delete: "حذف" };

function TicketRow({ t, userId, onChanged }: { t: Ticket; userId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const badge = ticketBadge(t.priority);

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
          <p className="text-body-small-12 text-text-secondary">{t.stationName ?? "بلا محطة"}{t.assigneeId === userId ? " · مسندة لك" : ""}</p>
        </div>
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </div>
      {msg && <p className="mt-1 text-body-small-12 text-status-danger-700">{msg}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {t.assigneeId !== userId && <Button variant="secondary" size="md" disabled={busy} onClick={() => run(() => claimTicket(t.id, userId))}>إسناد لي</Button>}
        <Button variant="secondary" size="md" disabled={busy} onClick={() => run(() => resolveTicket(t.id))}>حلّ التذكرة</Button>
        {t.priority !== "high" && <Button variant="ghost" size="md" disabled={busy} onClick={() => run(() => setTicketPriority(t.id, "high"))}>رفع الأولوية</Button>}
      </div>
    </li>
  );
}

function FlagRow({ flag, totalStations, allStationIds, onChanged }: {
  flag: AuditData["flags"][number]; totalStations: number; allStationIds: string[]; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await setFlagEverywhere(flag.key, !flag.enabledEverywhere, allStationIds).catch(() => ({ ok: false as const, message: "" }));
    setBusy(false);
    if (res.ok) onChanged();
  }

  return (
    <li className="flex items-center justify-between gap-2 py-2.5">
      <div>
        <p className="text-body-strong-14">{flag.description ?? flag.key}</p>
        <p className="text-body-small-12 text-text-secondary">
          {flag.isUnstable && <span className="text-status-warning-700">غير مستقرة · </span>}
          {flag.stationCount} من {totalStations} محطة
        </p>
      </div>
      <button type="button" role="switch" aria-checked={flag.enabledEverywhere} disabled={busy} onClick={toggle}
        className={`relative h-6 w-11 rounded-full transition-colors ${flag.enabledEverywhere ? "bg-brand-primary" : "bg-border-strong"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${flag.enabledEverywhere ? "translate-x-[-1.375rem]" : "translate-x-[-0.125rem]"} end-0`} />
      </button>
    </li>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="grid gap-6 lg:grid-cols-3">
      {[0, 1, 2].map((i) => <span key={i} className="h-96 animate-pulse rounded-lg bg-surface-muted" />)}
    </div>
  );
}
