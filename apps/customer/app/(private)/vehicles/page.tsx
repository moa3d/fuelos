"use client";
// C5 — سيارتي ومصروفي (design/screens/C5.png). Real fills from `sales` (not through invoices — every fill
// counts here regardless of invoice status). Cost/km and consumption only show when two consecutive fills
// both have a real odometer reading; otherwise "بيانات غير كافية" rather than a guess. Monthly budget and the
// oil-service reminder are the customer's own fields on `vehicles` (docs/briefs/06a) — an empty state offers
// to set them rather than showing a fabricated number.
import { formatMoney, formatNumber } from "@fuelos/core";
import { AlertBanner, Button, Input } from "@fuelos/ui";
import { useEffect, useState } from "react";
import {
  averageOf, costPerKm, consumptionPer100km, distancesSinceLast, kmUntilService, spendByMonth,
} from "@/lib/vehicle-rules";
import {
  loadVehicleDashboard, loadVehicles, setMonthlyBudget, setServiceReminder,
  type Outcome, type VehicleDashboard, type VehicleOption,
} from "@/lib/vehicles-data";
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
  }, [userId, tick]);

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

  function refresh() { setTick((t) => t + 1); }

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
        <AlertBanner tone="danger" title="تعذّر التحميل" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>} />
      )}
      {load.status === "empty" && (
        <p className="rounded-lg bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">لا توجد سيارة مضافة إلى حسابك بعد.</p>
      )}
      {load.status === "ready" && <Dashboard data={load.data} onChanged={refresh} />}
    </div>
  );
}

function Dashboard({ data, onChanged }: { data: VehicleDashboard; onChanged: () => void }) {
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
  const latestOdometer = [...data.fills].reverse().find((f) => f.odometerKm !== null)?.odometerKm ?? null;

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

      <BudgetCard vehicleId={data.vehicle.id} budgetCents={data.vehicle.monthlyBudgetCents} spentCents={BigInt(thisMonth)} currency={data.currency} onChanged={onChanged} />
      <ServiceCard vehicleId={data.vehicle.id} lastServiceOdometerKm={data.vehicle.lastServiceOdometerKm} serviceIntervalKm={data.vehicle.serviceIntervalKm} latestOdometer={latestOdometer} onChanged={onChanged} />
    </>
  );
}

function BudgetCard({ vehicleId, budgetCents, spentCents, currency, onChanged }: {
  vehicleId: string; budgetCents: bigint | null; spentCents: bigint; currency: string; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const money = (c: bigint) => formatMoney((Number(c) / 100).toFixed(2), currency);

  async function save() {
    setBusy(true); setMsg(undefined);
    const res: Outcome = await setMonthlyBudget(vehicleId, value.trim()).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (res.ok) { setEditing(false); return onChanged(); }
    setMsg(res.message);
  }

  if (budgetCents === null && !editing) {
    return (
      <div className="rounded-lg bg-surface-card p-4 text-center shadow-card">
        <p className="text-body-regular-14 text-text-secondary">لم تحدّد ميزانية شهرية بعد.</p>
        <Button variant="secondary" size="md" className="mt-2" onClick={() => setEditing(true)}>أضف ميزانية</Button>
      </div>
    );
  }
  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-surface-card p-4 shadow-card">
        <Input label="الميزانية الشهرية" dir="ltr" inputMode="decimal" suffix={currency} value={value} onChange={(e) => setValue(e.target.value)} />
        {msg && <p className="text-body-small-12 text-status-danger-700">{msg}</p>}
        <div className="flex gap-2">
          <Button variant="action" size="md" disabled={busy || !value.trim()} onClick={save}>{busy ? "…" : "حفظ"}</Button>
          <Button variant="ghost" size="md" onClick={() => setEditing(false)}>إلغاء</Button>
        </div>
      </div>
    );
  }

  const pct = budgetCents! > 0n ? Math.min(100, Number((spentCents * 100n) / budgetCents!)) : 0;
  const over = spentCents > budgetCents!;
  return (
    <div className="rounded-lg bg-surface-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-body-strong-14">الميزانية الشهرية</p>
        <button type="button" onClick={() => { setValue((Number(budgetCents) / 100).toString()); setEditing(true); }} className="text-body-small-12 text-brand-primary">تعديل</button>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className={`h-full ${over ? "bg-status-danger" : "bg-brand-primary"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-body-small-12 text-text-secondary">
        {money(spentCents)} / {money(budgetCents!)}{!over && ` · متبقي ${money(budgetCents! - spentCents)}`}
      </p>
    </div>
  );
}

function ServiceCard({ vehicleId, lastServiceOdometerKm, serviceIntervalKm, latestOdometer, onChanged }: {
  vehicleId: string; lastServiceOdometerKm: number | null; serviceIntervalKm: number | null; latestOdometer: number | null; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [lastKm, setLastKm] = useState("");
  const [interval, setIntervalKm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const remaining = kmUntilService(lastServiceOdometerKm, serviceIntervalKm, latestOdometer);

  async function save() {
    setBusy(true); setMsg(undefined);
    const res: Outcome = await setServiceReminder(vehicleId, Number(lastKm), Number(interval)).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (res.ok) { setEditing(false); return onChanged(); }
    setMsg(res.message);
  }

  if (remaining === null && !editing) {
    return (
      <div className="rounded-lg bg-surface-card p-4 text-center shadow-card">
        <p className="text-body-regular-14 text-text-secondary">لم تحدّد موعد الصيانة بعد.</p>
        <Button variant="secondary" size="md" className="mt-2" onClick={() => setEditing(true)}>أضف موعد الصيانة</Button>
      </div>
    );
  }
  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-surface-card p-4 shadow-card">
        <Input label="قراءة العداد عند آخر تغيير زيت" dir="ltr" inputMode="numeric" suffix="كم" value={lastKm} onChange={(e) => setLastKm(e.target.value)} />
        <Input label="الفاصل بين الصيانات" dir="ltr" inputMode="numeric" suffix="كم" value={interval} onChange={(e) => setIntervalKm(e.target.value)} />
        {msg && <p className="text-body-small-12 text-status-danger-700">{msg}</p>}
        <div className="flex gap-2">
          <Button variant="action" size="md" disabled={busy || !lastKm.trim() || !interval.trim()} onClick={save}>{busy ? "…" : "حفظ"}</Button>
          <Button variant="ghost" size="md" onClick={() => setEditing(false)}>إلغاء</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-card p-4 shadow-card">
      <div>
        <p className="text-body-strong-14">🔧 {remaining! > 0 ? `تغيير الزيت بعد ${formatNumber(remaining!, 0)} كم` : "حان وقت تغيير الزيت"}</p>
        <p className="text-body-small-12 text-text-secondary">محسوب من قراءات العداد في فواتيرك</p>
      </div>
      <button type="button" onClick={() => { setLastKm(String(lastServiceOdometerKm)); setIntervalKm(String(serviceIntervalKm)); setEditing(true); }} className="text-body-small-12 text-brand-primary">تعديل</button>
    </div>
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
