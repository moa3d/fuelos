"use client";
// C4 — تفاصيل الفاتورة (design/screens/C4.png). «تنزيل PDF» stays disabled: invoices.pdf_path exists but
// nothing populates it yet (Storage milestone, docs/briefs/04b item 3). «طلب تصحيح أو شكوى» is real: it files
// a complaint tied to this invoice (complaints + complaint_messages, both customer-scoped inserts).
import { formatDay, formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge, TextArea } from "@fuelos/ui";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { invoiceStatusBadge } from "@/lib/invoice-rules";
import { fileInvoiceComplaint, loadInvoiceDetail, type InvoiceDetail, type Outcome } from "@/lib/invoices-data";
import { useCustomer } from "../../customer-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: InvoiceDetail };

export default function InvoiceDetailPage() {
  const { userId } = useCustomer();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [complaintOpen, setComplaintOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    loadInvoiceDetail(userId, params.id).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [userId, params.id]);

  if (load.status === "loading") {
    return <div aria-busy className="mx-auto max-w-[480px] p-4"><span className="block h-96 animate-pulse rounded-lg bg-surface-muted" /></div>;
  }
  if (load.status === "error") {
    return (
      <div className="mx-auto max-w-[480px] p-4">
        <AlertBanner tone="danger" title="تعذّر تحميل الفاتورة" action={<Button variant="secondary" onClick={() => router.back()}>رجوع</Button>} />
      </div>
    );
  }

  const inv = load.data;
  const badge = invoiceStatusBadge(inv.status);
  const money = (v: string | number) => formatMoney(String(v), inv.currency);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-4 pb-10">
      <button type="button" onClick={() => router.back()} className="self-start text-body-strong-14 text-brand-primary">‹ رجوع</button>

      <div className="flex items-center gap-2">
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        <span className="text-body-regular-14 text-text-secondary">{inv.stationName} · فاتورة INV-{inv.number}</span>
      </div>

      <div>
        <p className="text-body-small-12 text-text-secondary">الإجمالي</p>
        <p className="text-number-l-24">{money(inv.amount)}</p>
      </div>

      <dl className="flex flex-col divide-y divide-border-default rounded-lg bg-surface-card p-4 shadow-card">
        <Row label="التاريخ" value={`${formatDay(inv.issuedAt)} · ${formatTime(inv.issuedAt)}`} />
        <Row label="الوقود" value={inv.product || "—"} />
        <Row label="الكمية" value={`${formatNumber(Number(inv.liters), 2)} لتر`} />
        <Row label="سعر اللتر" value={money(inv.unitPrice)} />
        <Row label="طريقة الدفع" value={inv.paymentMethod} />
        {inv.plate && <Row label="السيارة" value={inv.vehicleLabel ? `${inv.vehicleLabel} · ${inv.plate}` : inv.plate} />}
        {inv.odometerKm !== null && <Row label="قراءة العداد" value={`${formatNumber(inv.odometerKm, 0)} كم`} />}
      </dl>

      {inv.loyalty && (
        <div className="rounded-md bg-status-success-50 p-3 text-body-regular-14 text-status-success-700">
          🎁 أضيفت {inv.loyalty.points} نقطة إلى رصيدك · الرصيد {formatNumber(inv.loyalty.runningBalance, 0)}
        </div>
      )}

      {inv.corrections.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md bg-surface-muted p-3 text-body-small-12 text-text-secondary">
          {inv.corrections.map((c) => <p key={c.id}>تصحيح {money(c.amountDelta)} — «{c.reason}» · {formatDay(c.createdAt)}</p>)}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" block disabled title="إصدار ملف PDF غير متاح بعد">تنزيل PDF</Button>
      </div>

      {!complaintOpen ? (
        <button type="button" onClick={() => setComplaintOpen(true)} className="text-start text-body-strong-14 text-brand-primary">
          طلب تصحيح أو شكوى ›
        </button>
      ) : (
        <ComplaintForm customerId={userId} stationId={inv.stationId} invoiceId={inv.id} onClose={() => setComplaintOpen(false)} />
      )}

      <p className="text-body-small-12 text-text-secondary">أي تعديل على الفاتورة يظهر كتصحيح مع السبب، ولا يُحذف.</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-body-regular-14">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function ComplaintForm({ customerId, stationId, invoiceId, onClose }: { customerId: string; stationId: string; invoiceId: string; onClose: () => void }) {
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();

  async function send() {
    setBusy(true);
    const res: Outcome = await fileInvoiceComplaint(customerId, stationId, invoiceId, subject.trim()).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "أُرسل طلبك — تصلك المتابعة في تطبيقك." } : { ok: false, text: res.message });
    if (res.ok) setSubject("");
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-default p-3">
      <TextArea label="صف المشكلة" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثال: العرض لم يُطبَّق على الفاتورة" />
      {msg && <AlertBanner tone={msg.ok ? "success" : "danger"} title={msg.text} />}
      <div className="flex gap-2">
        <Button variant="action" disabled={busy || !subject.trim()} onClick={send}>{busy ? "جارٍ الإرسال…" : "إرسال"}</Button>
        <Button variant="ghost" onClick={onClose}>إلغاء</Button>
      </div>
    </div>
  );
}
