"use client";
// A1 — لوحة المنصة (design/screens/A1.png). Real KPIs from stations/station_members/subscriptions/support_tickets
// (is_platform_staff() RLS grants full read). «خريطة المحطات» groups by city with a health dot (past-due
// billing is the serious case) — A1's own mockup is a stylized region view, not a literal geographic map, so
// this needs no map library or lat/long. «طلب وصول مؤقت» is a real, audited, self-granted, ≤24h access_grants
// row (never someone else's access — grants_create RLS enforces both).
import { formatMoney, formatNumber } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge, TextArea } from "@fuelos/ui";
import { useEffect, useState } from "react";
import { ticketBadge } from "@/lib/dashboard-rules";
import {
  loadDashboard, loadStationOptions, requestTemporaryAccess, type DashboardData, type Outcome, type StationOption,
} from "@/lib/dashboard-data";
import { centsStr } from "@/lib/money";
import { useAdmin } from "../admin-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: DashboardData };

export default function DashboardPage() {
  const { userId } = useAdmin();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const money = (c: bigint) => formatMoney(centsStr(c), "ل.س");

  useEffect(() => {
    loadDashboard().then((data) => setLoad({ status: "ready", data }), () => setLoad({ status: "error" }));
  }, [tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">لوحة المنصة</h1>
          <p className="text-body-regular-14 text-text-secondary">إدارة شبكة محطات FuelOS</p>
        </div>
        <Button variant="secondary" onClick={refresh}>تحديث</Button>
      </header>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل اللوحة" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>} />
      )}

      {load.status === "ready" && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Kpi label="المحطات النشطة" value={`${load.data.activeStations} / ${load.data.totalStations}`} />
            <Kpi label="المستخدمون" value={formatNumber(load.data.totalUsers, 0)} />
            <Kpi label="الإيراد الشهري المتكرر" value={money(load.data.mrrCents)} />
            <Kpi label="تذاكر الدعم المفتوحة" value={String(load.data.openTickets)} sub={load.data.urgentTickets > 0 ? `${load.data.urgentTickets} عاجلة` : undefined} tone={load.data.urgentTickets > 0 ? "danger" : undefined} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg bg-surface-card p-6 shadow-card">
              <h2 className="mb-3 text-heading-h2-20">محطات تحتاج إجراء</h2>
              {load.data.attention.length === 0 ? (
                <p className="text-body-regular-14 text-text-secondary">لا توجد محطات تحتاج إجراء الآن. ✓</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border-default">
                  {load.data.attention.map((a, i) => (
                    <li key={i} className="py-3">
                      <p className="text-body-strong-14">{a.stationName}</p>
                      <p className="text-body-small-12 text-status-warning-700">{a.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg bg-surface-card p-6 shadow-card">
              <h2 className="mb-3 text-heading-h2-20">تذاكر الدعم</h2>
              {load.data.tickets.length === 0 ? (
                <p className="text-body-regular-14 text-text-secondary">لا توجد تذاكر مفتوحة. ✓</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border-default">
                  {load.data.tickets.map((t) => {
                    const badge = ticketBadge(t.priority);
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-2 py-3">
                        <div>
                          <p className="text-body-strong-14">#{t.number} · {t.subject}</p>
                          <p className="text-body-small-12 text-text-secondary">{t.stationName ?? "بلا محطة"}</p>
                        </div>
                        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="rounded-lg bg-surface-card p-6 shadow-card">
            <h2 className="mb-3 text-heading-h2-20">خريطة المحطات</h2>
            {load.data.cityGroups.length === 0 ? (
              <p className="text-body-regular-14 text-text-secondary">لا توجد محطات بعد.</p>
            ) : (
              <ul className="flex flex-wrap gap-3">
                {load.data.cityGroups.map((c) => (
                  <li key={c.city} className="flex min-w-40 flex-col gap-1.5 rounded-lg border border-border-default bg-surface-muted px-4 py-3">
                    <span className="text-body-strong-14">{c.city}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-body-small-12 text-text-secondary">{c.stationCount} محطة</span>
                      <StatusBadge tone={c.tone}>{c.label}</StatusBadge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-border-default bg-surface-card p-6 shadow-card">
            <h2 className="text-heading-h3-16">فصل الصحة التقنية عن المال</h2>
            <p className="mt-1 text-body-regular-14 text-text-secondary">
              لا تظهر هنا تفاصيل مالية داخلية لأي محطة. الوصول لبيانات محطة يحتاج صلاحية محددة وسبباً مكتوباً، ويُسجَّل في سجل النشاط.
            </p>
            <Button variant="secondary" className="mt-4" onClick={() => setRequesting(true)}>طلب وصول مؤقت</Button>
          </section>
        </>
      )}

      {requesting && <RequestAccessModal userId={userId} onClose={() => setRequesting(false)} onDone={() => setRequesting(false)} />}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" }) {
  return (
    <div className="rounded-lg bg-surface-card p-5 shadow-card">
      <p className="text-body-small-12 text-text-secondary">{label}</p>
      <p className="mt-1 text-number-l-24">{value}</p>
      {sub && <p className={`mt-1 text-body-small-12 ${tone === "danger" ? "text-status-danger-700" : "text-text-secondary"}`}>{sub}</p>}
    </div>
  );
}

function RequestAccessModal({ userId, onClose, onDone }: { userId: string; onClose: () => void; onDone: () => void }) {
  const [stations, setStations] = useState<StationOption[]>();
  const [stationId, setStationId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => { loadStationOptions().then((s) => { setStations(s); if (s[0]) setStationId(s[0].id); }); }, []);

  async function send() {
    setBusy(true); setError(undefined);
    const res: Outcome = await requestTemporaryAccess(userId, stationId, reason.trim(), null).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="طلب وصول مؤقت">
      <div className="w-full max-w-md rounded-lg bg-surface-card p-6 shadow-raised">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-heading-h2-20">طلب وصول مؤقت</h2>
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
          <TextArea label="السبب (إلزامي — يُسجَّل في سجل النشاط)" required value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-body-small-12 text-text-secondary">ينتهي الوصول تلقائياً خلال 24 ساعة كحد أقصى.</p>
          <Button variant="action" size="lg" block disabled={busy || !reason.trim() || !stationId} onClick={send}>{busy ? "جارٍ التسجيل…" : "تأكيد الطلب"}</Button>
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <span key={i} className="h-24 animate-pulse rounded-lg bg-surface-muted" />)}</div>
      <div className="grid gap-6 lg:grid-cols-2">{[0, 1].map((i) => <span key={i} className="h-64 animate-pulse rounded-lg bg-surface-muted" />)}</div>
    </div>
  );
}
