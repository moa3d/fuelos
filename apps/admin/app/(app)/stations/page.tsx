"use client";
// «المحطات» — every station on the platform, one row each (station_read RLS: is_platform_staff() sees
// everything). A simple, real list first: name, city, status, plan, active users and whether an owner has set
// its map location yet. Row actions and the full A2 setup wizard (tanks/pumps/readiness checklist) are a
// bigger slice for later — this only reads, it doesn't manage a station.
import { formatDay, formatNumber } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge } from "@fuelos/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadStations, type StationRow } from "@/lib/stations-data";
import { matchesSearch, stationBadge, type StationStatus } from "@/lib/stations-rules";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: StationRow[] };
type Filter = "all" | StationStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" }, { key: "active", label: "نشطة" },
  { key: "setup", label: "قيد الإعداد" }, { key: "suspended", label: "موقوفة" },
];

export default function StationsPage() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadStations().then((data) => setLoad({ status: "ready", data }), () => setLoad({ status: "error" }));
  }, [tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  const shown = useMemo(() => {
    if (load.status !== "ready") return [];
    return load.data.filter((s) => (filter === "all" || s.status === filter) && matchesSearch(s.name, s.city, query));
  }, [load, filter, query]);

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-display-32">المحطات</h1>
          <p className="text-body-regular-14 text-text-secondary">
            {load.status === "ready" ? `${formatNumber(load.data.length, 0)} محطة على المنصة` : "كل محطات صاحبي المحطات المشتركين"}
          </p>
        </div>
        <Link href="/stations/new"><Button variant="action" size="md">+ انضمام محطة</Button></Link>
      </header>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر التحميل" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>} />
      )}

      {load.status === "ready" && (
        <section className="rounded-lg bg-surface-card shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div role="tablist" aria-label="الحالة" className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <FilterChip key={f.key} label={f.key === "all" ? f.label : `${f.label} (${load.data.filter((s) => s.status === f.key).length})`}
                  active={filter === f.key} onClick={() => setFilter(f.key)} />
              ))}
            </div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو المدينة" aria-label="بحث"
              className="h-10 w-64 rounded-md border border-border-default bg-surface-card px-3 text-body-regular-14" />
          </div>

          {load.data.length === 0 ? (
            <p className="p-8 text-center text-body-regular-14 text-text-secondary">لا توجد محطات بعد. ابدأ بـ«+ انضمام محطة».</p>
          ) : shown.length === 0 ? (
            <p className="p-8 text-center text-body-regular-14 text-text-secondary">لا نتائج تطابق البحث أو الفلتر.</p>
          ) : (
            <table className="w-full text-body-regular-14">
              <thead>
                <tr className="border-b border-border-default text-body-small-12 text-text-secondary">
                  <th className="p-3 text-start font-normal">المحطة</th>
                  <th className="p-3 text-start font-normal">المدينة</th>
                  <th className="p-3 text-start font-normal">الحالة</th>
                  <th className="p-3 text-start font-normal">الخطة</th>
                  <th className="p-3 text-start font-normal">مستخدمون نشطون</th>
                  <th className="p-3 text-start font-normal">تاريخ الانضمام</th>
                  <th className="p-3 text-start font-normal">الموقع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {shown.map((s) => {
                  const badge = stationBadge(s.status);
                  return (
                    <tr key={s.id}>
                      <td className="p-3 text-body-strong-14"><Link href={`/stations/${s.id}`} className="hover:underline">{s.name}</Link></td>
                      <td className="p-3 text-text-secondary">{s.city ?? "—"}</td>
                      <td className="p-3"><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></td>
                      <td className="p-3 text-text-secondary">{s.planName ?? "—"}</td>
                      <td className="p-3">{formatNumber(s.activeUsers, 0)}</td>
                      <td className="p-3 text-text-secondary">{formatDay(s.createdAt)}</td>
                      <td className="p-3 text-text-secondary">{s.hasLocation ? "📍 محدَّد" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
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

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => <span key={i} className="h-14 animate-pulse rounded-lg bg-surface-muted" />)}
    </div>
  );
}
