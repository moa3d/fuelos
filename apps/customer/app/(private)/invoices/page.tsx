"use client";
// C3 — فواتيري (design/screens/C3.png, CU6; the empty state is CU15). Real invoices/sales/loyalty data, one month at a time.
import { formatDay, formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx } from "@fuelos/ui";
import Link from "next/link";
import { useState } from "react";
import { useEffect } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { InvoiceCard } from "@/components/InvoiceCard";
import { invoiceStatusBadge, monthEnd, monthStart, monthTotals } from "@/lib/invoice-rules";
import { loadInvoices, type InvoicesData } from "@/lib/invoices-data";
import { useCustomer } from "../customer-context";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

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
      <h1 className="text-heading-h1-24 text-text-primary">فواتيري</h1>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-border-default bg-surface-card p-1.5 text-text-primary shadow-card">
        <button type="button" aria-label="الشهر السابق" onClick={() => setMonthFrom(monthStart(monthFrom, -1))}
          className={cx("inline-flex size-11 shrink-0 items-center justify-center rounded-[10px]", FOCUS)}>
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-surface-muted">
            <Icon name="chevron-left" size={18} className="rtl:rotate-180" />
          </span>
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
          <span className="text-heading-h3-16">{monthLabel}</span>
          <span className="text-number-l-24">{formatMoney(String(totals.amount), currency)}</span>
        </div>
        <button type="button" aria-label="الشهر التالي" onClick={() => setMonthFrom(monthStart(monthFrom, 1))}
          className={cx("inline-flex size-11 shrink-0 items-center justify-center rounded-[10px]", FOCUS)}>
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-surface-muted">
            <Icon name="chevron-left" size={18} />
          </span>
        </button>
      </div>

      {data && (
        <div className="flex items-stretch rounded-lg bg-brand-primary-50 px-2 py-3.5">
          <SummaryStat value={formatNumber(data.pointsThisMonth, 0)} label="نقطة" />
          <span aria-hidden className="my-auto h-8 w-px shrink-0 bg-border-strong" />
          <SummaryStat value={formatNumber(totals.liters, 0)} label="لتر" />
          <span aria-hidden className="my-auto h-8 w-px shrink-0 bg-border-strong" />
          <SummaryStat value={String(totals.fillCount)} label="تعبئات" />
        </div>
      )}

      {data && data.vehicles.length > 0 && (
        <div role="tablist" aria-label="السيارة" className="flex flex-wrap gap-2">
          <FilterChip label="كل السيارات" active={vehicle === "all"} onClick={() => setVehicle("all")} />
          {data.vehicles.map((v) => (
            <FilterChip key={v.id} label={v.label} icon="car" active={vehicle === v.id} onClick={() => setVehicle(v.id)} />
          ))}
        </div>
      )}

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل الفواتير" action={<Button variant="secondary" className="min-h-11" onClick={() => setTick((t) => t + 1)}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}
      {load.status === "ready" && shown.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-border-default bg-surface-card px-6 py-14 text-center shadow-card">
          <span className="flex size-[72px] items-center justify-center rounded-full bg-brand-primary-50 text-brand-primary">
            <Icon name="receipt" size={32} />
          </span>
          <p className="text-heading-h3-16 text-text-primary">لا توجد فواتير في {monthLabel}.</p>
          <Link href="/card"
            className={cx("inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-brand-primary px-4 text-body-strong-14 text-white transition-colors hover:bg-brand-primary-hover motion-reduce:transition-none", FOCUS)}>
            <Icon name="qr" size={18} />
            اعرض بطاقتي
          </Link>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {shown.map((inv) => {
          const badge = invoiceStatusBadge(inv.status);
          return (
            <li key={inv.id}>
              <InvoiceCard
                stationName={inv.stationName}
                amount={formatMoney(String(inv.amount), inv.currency)}
                detail={[inv.product, `${formatNumber(Number(inv.liters), 1)} لتر`, inv.vehicleLabel].filter(Boolean).join(" · ")}
                date={`${formatDay(inv.issuedAt)} · ${formatTime(inv.issuedAt)}`}
                status={inv.status}
                statusLabel={badge.label}
                href={`/invoices/${inv.id}`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
      <span className="text-number-m-18 text-text-primary">{value}</span>
      <span className="text-body-small-12 text-text-secondary">{label}</span>
    </div>
  );
}

function FilterChip({ label, active, icon, onClick }: { label: string; active: boolean; icon?: IconName; onClick: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={cx(
        "relative inline-flex h-[34px] items-center gap-1.5 rounded-full border px-4 text-body-strong-14 transition-colors motion-reduce:transition-none",
        "before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-['']",
        FOCUS,
        active ? "border-brand-primary bg-brand-primary text-text-on-dark" : "border-border-default bg-surface-card text-text-secondary",
      )}>
      {icon && <Icon name={icon} size={14} />}
      {label}
    </button>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => <span key={i} className="h-[88px] motion-safe:animate-pulse rounded-[18px] bg-surface-muted" />)}
    </div>
  );
}
