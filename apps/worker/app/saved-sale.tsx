"use client";
// S3 «تم حفظ العملية» (design/screens/S3.png), shared by S2 (quick fill) and S8/S9 (company credit).
import { formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, operationsText, StatusBadge } from "@fuelos/ui";
import type { OutboxRow } from "@/lib/db";
import { toCents, centsToString } from "@/lib/money";
import type { PaymentMethod } from "@/lib/sales";

export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: "نقدي", card: "بطاقة", credit: "آجل لشركة", voucher: "قسيمة" };

export function SavedSale({ row, unsent, currency, onNew, newLabel = "+ عملية جديدة" }: {
  row: OutboxRow; unsent: number; currency: string; onNew: () => void; newLabel?: string;
}) {
  const serverAmount = row.result?.amount;
  const total = (serverAmount !== undefined ? toCents(String(serverAmount)) : null) ?? toCents(row.meta?.amount ?? "0") ?? 0n;
  const unit = row.result?.unit_price ?? row.params.p_unit_price;
  const method = row.params.p_method as PaymentMethod;
  const pendingApproval = row.result?.status === "pending_approval";
  const askedApproval = row.meta?.overLimit === "true";

  return (
    <>
      <main className="mx-auto flex w-full max-w-[390px] flex-col items-center gap-4 px-4 pt-8 text-center">
        <span className={cx("flex size-20 items-center justify-center rounded-full",
          pendingApproval ? "bg-status-warning-50 text-status-warning-700" : "bg-brand-action-50 text-brand-action-700")}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
        </span>
        <h1 className="text-heading-h1-24">{pendingApproval ? "تم حفظ العملية — بانتظار موافقة المدير" : "تم حفظ العملية"}</h1>
        <p className="text-body-regular-14 text-text-secondary">
          رقم العملية <span dir="ltr">{row.id.slice(0, 8).toUpperCase()}</span> · {formatTime(row.createdAt)}
        </p>

        {row.status === "pending" && (
          <AlertBanner tone="warning" className="w-full text-start" title="محفوظة على الجهاز">
            ستُرسل تلقائياً عند عودة الاتصال · {operationsText(unsent)} بانتظار المزامنة
            {askedApproval && " · ومعها طلب موافقة المدير"}
          </AlertBanner>
        )}
        {row.status === "sent" && (pendingApproval
          ? <StatusBadge tone="warning">أُرسل طلب الموافقة إلى المدير</StatusBadge>
          : <StatusBadge tone="success">أُرسلت إلى الخادم</StatusBadge>)}

        <section className="w-full rounded-lg bg-surface-card p-4 text-start shadow-card">
          <dl className="flex flex-col gap-2 text-body-regular-14">
            {row.meta?.company && <Row label="الشركة" value={row.meta.company} />}
            {row.meta?.vehicle && <Row label="المركبة" value={row.meta.vehicle} />}
            <Row label="الوقود" value={row.meta?.product ?? ""} />
            <Row label="الكمية" value={`${formatNumber(Number(row.params.p_liters), 2)} لتر`} />
            <Row label="سعر اللتر" value={formatMoney(String(unit), currency)} />
            <Row label="طريقة الدفع" value={METHOD_LABEL[method]} />
            {method !== "credit" && <Row label="الزبون" value="غير مرتبط" muted />}
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-border-default pt-3">
            <span className="text-heading-h3-16">الإجمالي</span>
            <span className="text-number-xl-32">{formatMoney(centsToString(total), currency)}</span>
          </div>
        </section>
      </main>
      <footer className="fixed inset-x-0 bottom-0 border-t border-border-default bg-surface-card">
        <div className="mx-auto flex w-full max-w-[390px] flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
          <Button variant="secondary" size="lg" block onClick={() => window.print()}>طباعة</Button>
          <Button variant="action" size="lg" block onClick={onNew}>{newLabel}</Button>
        </div>
      </footer>
    </>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-text-secondary">{label}</dt>
      <dd className={cx("font-semibold", muted && "text-text-muted")}>{value}</dd>
    </div>
  );
}
