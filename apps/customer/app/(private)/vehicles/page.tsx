"use client";
// C5 — سيارتي ومصروفي (design/screens/C5.png). Real fills from `sales` (not through invoices — every fill
// counts here regardless of invoice status). Cost/km and consumption only show when two consecutive fills
// both have a real odometer reading; otherwise "بيانات غير كافية" rather than a guess. Monthly budget and an
// oil-change reminder aren't built — no such fields exist yet (docs/briefs/04f-cowork-vehicle-fields.md).
import { formatMoney, formatNumber } from "@fuelos/core";
import { AlertBanner, Button } from "@fuelos/ui";
import { useEffect, useState } from "react";
import {
  averageOf, costPerKm, consumptionPer100km, distancesSinceLast, spendByMonth,
} from "@/lib/vehicle-rules";
import { loadVehicleDashboard, loadVehicles, type VehicleDashboard, type VehicleOption } from "@/lib/vehicles-data";
import { useCustomer } from "../customer-context";

type Load = { status: "loading" } | { status: "error" } | { status: "empty" } | { status: "ready"; data: VehicleDashboard };

export default function VehiclesPage() {
  const { userId } = useCustomer();
  const [vehicles, setVehicles] = useState<VehicleOption[]>();
  const [vehicleId, setVehicleId] = useState<string>();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    loadVehicles(userId).then(
      (v) => { setVehicles(v); if (v.length > 0) setVehicleId(v[0].id); else setLoad({ status: "empty" }); },
      () => setLoad({ status: "error" }),
    );
  }, [userId]);

  useEffect(() => {
    if (!vehicleId || !vehicles) return;
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return;
    let alive = true;
    loadVehicleDashboard(userId, vehicle).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [userId, vehicleId, vehicles, tick]);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-4 pb-10">
      <h1 className="text-heading-h1-24">سيارتي ومصروفي</h1>

      {vehicles && vehicles.length > 1 && (
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}
          className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-large-16">
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label || v.plate}</option>)}
        </select>
      )}
      {vehicles && vehicles.length === 1 && (
        <p className="rounded-lg bg-surface-card p-3 text-body-strong-14 shadow-card">{vehicles[0].label || vehicles[0].plate} · {vehicles[0].plate}</p>
      )}

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر التحميل" action={<Button variant="secondary" onClick={() => setTick((t) => t + 1)}>إعادة المحاولة</Button>} />
      )}
      {load.status === "empty" && (
        <p className="rounded-lg bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">لا توجد سيارة مضافة إلى حسابك بعد.</p>
      )}
      {load.status === "ready" && <Dashboard data={load.data} />}
    </div>
  );
}

function Dashboard({ data }: { data: VehicleDashboard }) {
  const money = (v: number) => formatMoney(String(v), data.currency);
  const currentMonth = data.months[data.months.length - 1];
  const monthly = spendByMonth(data.fills, data.months);
  const thisMonth = monthly[monthly.length - 1]?.amount ?? 0;
  const lastMonth = monthly[monthly.length - 2]?.amount ?? 0;
  const delta = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;
  const maxSpend = Math.max(1, ...monthly.map((m) => m.amount));

  const distances = distancesSinceLast(data.fills);
  const consumptions = data.fills.map((f, i) => consumptionPer100km(f.liters, distances[i]));
  const costs = data.fills.map((f, i) => costPerKm(f.amount, distances[i]));
  const avgConsumption = averageOf(consumptions);
  const avgCost = averageOf(costs);

  if (data.fills.length === 0) {
    return <p className="rounded-lg bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">لا توجد تعبئات مسجَّلة لهذه السيارة بعد.</p>;
  }

  return (
    <>
      <div className="rounded-lg bg-surface-card p-4 shadow-card">
        <div className="flex items-baseline justify-between">
          <span className="text-body-small-12 text-text-secondary">{monthArabic(currentMonth)}</span>
          {delta !== null && <span className={`text-body-small-12 ${delta > 0 ? "text-status-warning-700" : "text-status-success-700"}`}>{delta > 0 ? "↗" : "↘"} {Math.abs(delta)}%</span>}
        </div>
        <p className="mt-1 text-number-l-24">{money(thisMonth)}</p>
        {lastMonth > 0 && delta !== null && (
          <p className="mt-1 text-body-small-12 text-text-secondary">
            {delta > 0 ? `صرفت أكثر من الشهر الماضي بـ ${money(thisMonth - lastMonth)}` : `صرفت أقل من الشهر الماضي بـ ${money(lastMonth - thisMonth)}`}
          </p>
        )}
      </div>

      <div className="flex items-end justify-between gap-1 rounded-lg bg-surface-card p-4 shadow-card" style={{ height: 140 }}>
        {monthly.map((m) => (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
            <div className={`w-full rounded-t-sm ${m.month === currentMonth ? "bg-brand-primary" : "bg-surface-muted"}`} style={{ height: Math.max(4, (m.amount / maxSpend) * 90) }} />
            <span className="text-body-small-12 text-text-muted">{monthArabic(m.month, true)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="تكلفة الكيلومتر" value={avgCost !== null ? `${formatNumber(avgCost, 1)} ${data.currency}` : "بيانات غير كافية"} />
        <Stat label="متوسط الاستهلاك" value={avgConsumption !== null ? `${formatNumber(avgConsumption, 1)} لتر/100 كم` : "بيانات غير كافية"} />
      </div>
      {(avgCost === null || avgConsumption === null) && (
        <p className="text-body-small-12 text-text-secondary">تحتاج هذه الأرقام قراءتي عداد متتاليتين على الأقل — بعض تعبئاتك لم تُسجَّل معها قراءة عداد.</p>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-card p-3 shadow-card">
      <p className="text-body-small-12 text-text-secondary">{label}</p>
      <p className="text-body-strong-14">{value}</p>
    </div>
  );
}

function monthArabic(key: string, short = false): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", short ? { month: "short" } : { month: "long", year: "numeric" }).format(d);
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      <span className="h-24 animate-pulse rounded-lg bg-surface-muted" />
      <span className="h-32 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}
