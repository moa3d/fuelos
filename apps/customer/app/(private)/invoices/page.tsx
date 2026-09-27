"use client";
// C3 — فواتيري (design/screens/C3.png). Real invoices/sales/loyalty data, one month at a time.
import { formatDay, formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge } from "@fuelos/ui";
import Link from "next/link";
import { useState } from "react";
import { useEffect } from "react";
import { invoiceStatusBadge, monthEnd, monthStart, monthTotals } from "@/lib/invoice-rules";
import { loadInvoices, type InvoicesData } from "@/lib/invoices-data";
import { useCustomer } from "../customer-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: InvoicesData };

export default function InvoicesPage() {
  const { userId } = useCustomer();
  const [monthFrom, setMonthFrom] = useState(() => monthStart(new Date().toISOString()));
  const [vehicle, setVehicle] = useState<string>("all");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    loadInvoices(userId, monthFrom, monthEnd(monthFrom)).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [userId, monthFrom, tick]);

  const monthLabel = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric" }).format(new Date(monthFrom));
  const data = load.status === "ready" ? load.data : undefined;
  const shown = data ? (vehicle === "all" ? data.invoices : data.invoices.filter((i) => i.vehicleId === vehicle)) : [];
  const totals = monthTotals(shown);
  const currency = shown[0]?.currency ?? "ل.س";

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-4 pb-10">
      <h1 className="text-heading-h1-24">فواتيري</h1>

      <div className="rounded-lg bg-brand-dark p-4 text-text-on-dark">
        <div className="flex items-center justify-between text-body-strong-14">
          <button type="button" aria-label="الشهر السابق" onClick={() => setMonthFrom(monthStart(monthFrom, -1))}>‹</button>
          <span>{monthLabel}</span>
          <button type="button" aria-label="الشهر التالي" onClick={() => setMonthFrom(monthStart(monthFrom, 1))}>›</button>
        </div>
        <p className="mt-2 text-number-l-24">{formatMoney(String(totals.amount), currency)}</p>
        {data && (
          <div className="mt-3 flex gap-4 text-body-small-12 text-text-on-dark-muted">
            <span>🎁 {formatNumber(data.pointsThisMonth, 0)} نقطة</span>
            <span>💧 {formatNumber(totals.liters, 0)} لتر</span>
            <span>⛽ {totals.fillCount} تعبئات</span>
          </div>
        )}
      </div>

      {data && data.vehicles.length > 0 && (
        <div role="tablist" aria-label="السيارة" className="flex flex-wrap gap-2">
          <FilterChip label="كل السيارات" active={vehicle === "all"} onClick={() => setVehicle("all")} />
          {data.vehicles.map((v) => <FilterChip key={v.id} label={v.label} active={vehicle === v.id} onClick={() => setVehicle(v.id)} />)}
        </div>
      )}

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل الفواتير" action={<Button variant="secondary" onClick={() => setTick((t) => t + 1)}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}
      {load.status === "ready" && shown.length === 0 && (
        <p className="rounded-lg bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">لا توجد فواتير في {monthLabel}.</p>
      )}

      <ul className="flex flex-col gap-3">
        {shown.map((inv) => {
          const badge = invoiceStatusBadge(inv.status);
          return (
            <li key={inv.id}>
              <Link href={`/invoices/${inv.id}`} className="flex flex-col gap-1 rounded-lg bg-surface-card p-4 shadow-card">
                <div className="flex items-baseline justify-between">
                  <span className="text-number-m-18">{formatMoney(String(inv.amount), inv.currency)}</span>
                  <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                </div>
                <p className="text-body-regular-14">{inv.stationName}</p>
                <p className="text-body-small-12 text-text-secondary">
                  {[inv.product, `${formatNumber(Number(inv.liters), 1)} لتر`, inv.vehicleLabel].filter(Boolean).join(" · ")}
                </p>
                <p className="text-body-small-12 text-text-muted">{formatDay(inv.issuedAt)} · {formatTime(inv.issuedAt)}</p>
              </Link>
            </li>
          );
        })}
      </ul>
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
      {[0, 1, 2].map((i) => <span key={i} className="h-24 animate-pulse rounded-lg bg-surface-muted" />)}
    </div>
  );
}
