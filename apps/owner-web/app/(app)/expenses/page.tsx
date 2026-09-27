"use client";
// O8 — المصاريف والموردون (design/screens/O8.png). Owner/accountant only. «حفظ المصروف» inserts a draft then posts
// it (post_expense — immutable once posted); «حفظ كمسودة» leaves it for later. Supplier debt is read-only: no RPC
// records a payment to a supplier yet (see docs/briefs Cowork request).
import { formatDay, formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, Input, StatusBadge, TextArea } from "@fuelos/ui";
import { useEffect, useRef, useState } from "react";
import {
  createSupplier, loadExpenses, saveAndPostExpense, saveDraft, type ExpenseRow, type ExpensesData, type NewExpense, type SupplierRow,
} from "@/lib/expenses-data";
import {
  CATEGORY_LABEL, CATEGORY_TONE, hasTodayEntry, ledgerPreview, monthlyByCategory, PAID_FROM_LABEL, sharePercent, type Category, type PaidFrom,
} from "@/lib/expense-rules";
import { centsStr } from "@/lib/money";
import { useOffice } from "../office-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: ExpensesData };
const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];

export default function ExpensesPage() {
  const { current } = useOffice();
  const canAccess = current.role === "owner" || current.role === "accountant";
  const money = (c: bigint) => formatMoney(centsStr(c), current.currencyLabel);

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [newSupplier, setNewSupplier] = useState(false);

  useEffect(() => {
    if (!canAccess) return;
    let alive = true;
    loadExpenses(current.stationId).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [current.stationId, canAccess, tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  if (!canAccess) {
    return (
      <div className="mx-auto max-w-2xl">
        <AlertBanner tone="info" title="المصاريف والموردون متاحة لصاحب المحطة والمحاسب فقط">
          هذا القسم يظهر تكاليف المحطة وحسابات الموردين، وهي بيانات مالية داخلية.
        </AlertBanner>
      </div>
    );
  }

  const data = load.status === "ready" ? load.data : undefined;
  const month = data ? monthlyByCategory(data.monthRows) : undefined;
  const todayEntered = data ? hasTodayEntry(data.recent.map((e) => e.expenseDate), data.todayISODate) : true;
  const shown = data ? data.recent.filter((e) => filter === "all" || e.category === filter) : [];

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">المصاريف والموردون</h1>
          <p className="text-body-regular-14 text-text-secondary">
            الربح يصبح مؤكداً بعد إدخال مصاريف الفترة وتكاليف الشراء{data ? ` · آخر تحديث ${formatTime(data.fetchedAt)} · من الخادم` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setNewSupplier(true)}>+ مورد جديد</Button>
          <Button variant="secondary" onClick={refresh}>تحديث</Button>
        </div>
      </header>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل المصاريف" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}

      {data && month && (
        <>
          {!todayEntered && (
            <AlertBanner tone="info" title="مصاريف اليوم غير مدخلة بعد">
              الربح في لوحة القيادة يبقى «تقديرياً» حتى تُدخل مصاريف اليوم.
            </AlertBanner>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <MonthlyCard month={month} money={money} periodTo={data.period.to} />
            <SuppliersCard suppliers={data.suppliers} money={money} />
            <NewExpenseForm stationId={current.stationId} suppliers={data.suppliers} currency={current.currencyLabel} onSaved={refresh} />
          </div>

          <section className="rounded-lg bg-surface-card p-6 shadow-card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-heading-h2-20">آخر المصاريف</h2>
              <div role="tablist" aria-label="الفئة" className="flex flex-wrap gap-2">
                <FilterChip label="الكل" active={filter === "all"} onClick={() => setFilter("all")} />
                {CATEGORIES.map((c) => <FilterChip key={c} label={CATEGORY_LABEL[c]} active={filter === c} onClick={() => setFilter(c)} />)}
              </div>
            </div>
            <ExpensesTable rows={shown} />
          </section>
        </>
      )}

      {newSupplier && (
        <NewSupplierModal stationId={current.stationId} onClose={() => setNewSupplier(false)} onDone={() => { setNewSupplier(false); refresh(); }} />
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={cx("h-9 rounded-full border px-4 text-body-strong-14", active ? "border-brand-primary bg-brand-primary text-white" : "border-border-default bg-surface-card text-text-secondary")}>
      {label}
    </button>
  );
}

// ---------- monthly breakdown ----------
function MonthlyCard({ month, money, periodTo }: { month: ReturnType<typeof monthlyByCategory>; money: (c: bigint) => string; periodTo: string }) {
  const monthName = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long" }).format(new Date(Date.parse(periodTo) - 1));
  return (
    <section className="rounded-lg bg-surface-card p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-heading-h2-20">مصاريف {monthName}</h2>
        <span className="text-number-l-24">{money(month.totalCents)}</span>
      </div>
      {month.rows.length === 0 ? (
        <p className="mt-3 text-body-regular-14 text-text-secondary">لم يُرحَّل أي مصروف هذا الشهر بعد.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {month.rows.map((r) => (
            <li key={r.category}>
              <div className="flex items-baseline justify-between text-body-regular-14">
                <span className="font-semibold">{money(r.amountCents)}</span>
                <span className="text-text-secondary">{CATEGORY_LABEL[r.category]}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div className={cx("h-full rounded-full", toneBg(CATEGORY_TONE[r.category]))} style={{ width: `${sharePercent(r.amountCents, month.totalCents)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function toneBg(tone: string): string {
  return { primary: "bg-brand-primary", info: "bg-status-info", warning: "bg-status-warning", neutral: "bg-text-muted" }[tone] ?? "bg-text-muted";
}

// ---------- suppliers ----------
function SuppliersCard({ suppliers, money }: { suppliers: SupplierRow[]; money: (c: bigint) => string }) {
  return (
    <section className="rounded-lg bg-surface-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-heading-h2-20">الموردون</h2>
        <StatusBadge tone="neutral">{suppliers.length}</StatusBadge>
      </div>
      {suppliers.length === 0 ? (
        <p className="text-body-regular-14 text-text-secondary">لا يوجد موردون مسجّلون بعد.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {suppliers.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted text-text-secondary"><TruckIcon /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-strong-14">{s.name}</p>
                <p className="text-body-small-12 text-text-secondary">
                  {s.owedCents > 0n ? `مستحق ${money(s.owedCents)}` : "لا يوجد مستحق من التوريدات"}
                  {s.lastDeliveryAt ? ` · آخر توريد ${formatDay(new Date(s.lastDeliveryAt))}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-body-small-12 text-text-muted">من فواتير التوريد المسعّرة فقط؛ تسجيل سداد المورد قريباً.</p>
    </section>
  );
}

// ---------- new expense ----------
function NewExpenseForm({ stationId, suppliers, currency, onSaved }: { stationId: string; suppliers: SupplierRow[]; currency: string; onSaved: () => void }) {
  const [category, setCategory] = useState<Category>("utilities");
  const [amount, setAmount] = useState("");
  const [paidFrom, setPaidFrom] = useState<PaidFrom>("cash");
  const [supplierId, setSupplierId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState<"post" | "draft">();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<"posted" | "draft">();
  const inFlight = useRef(false);

  const amountOk = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;
  const canSave = amountOk && description.trim() !== "" && date !== "";

  async function submit(mode: "post" | "draft") {
    if (inFlight.current || !canSave) return;
    inFlight.current = true;
    setBusy(mode);
    setError(undefined);
    setSaved(undefined);
    const params: NewExpense = { stationId, category, amount: amount.trim(), paidFrom, supplierId: supplierId || null, description: description.trim(), expenseDate: date };
    const res = await (mode === "post" ? saveAndPostExpense(params) : saveDraft(params)).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    inFlight.current = false;
    setBusy(undefined);
    if (!res.ok) return setError(res.message);
    setSaved(mode === "post" ? "posted" : "draft");
    setAmount("");
    setDescription("");
    onSaved();
  }

  return (
    <section className="rounded-lg bg-surface-card p-5 shadow-card">
      <h2 className="mb-4 flex items-center gap-2 text-heading-h2-20">+ مصروف جديد</h2>
      {error && <AlertBanner tone="danger" className="mb-3" title={error} />}
      {saved && <AlertBanner tone="success" className="mb-3" title={saved === "posted" ? "تم حفظ المصروف وترحيله" : "حُفظ كمسودة — لم يُرحَّل بعد"} />}

      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-label-12 text-text-secondary">الفئة</p>
          <div role="radiogroup" aria-label="فئة المصروف" className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)}
                className={cx("h-10 rounded-md border text-body-strong-14", category === c ? "border-2 border-brand-primary bg-brand-primary-50" : "border-border-default bg-surface-card")}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        <Input label="المبلغ" inputMode="decimal" autoComplete="off" suffix={currency} value={amount} onChange={(e) => setAmount(e.target.value)}
          error={amount !== "" && !amountOk ? "أدخل رقماً موجباً بخانتين عشريتين على الأكثر" : undefined} />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-label-12 text-text-secondary">
            الدفع
            <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as PaidFrom)} className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-regular-14">
              <option value="cash">{PAID_FROM_LABEL.cash}</option>
              <option value="bank">{PAID_FROM_LABEL.bank}</option>
            </select>
          </label>
          <Input label="التاريخ" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <label className="flex flex-col gap-1 text-label-12 text-text-secondary">
          الجهة / المورد (اختياري)
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-regular-14">
            <option value="">بلا جهة محددة</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <TextArea label="البيان" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثلاً: فاتورة كهرباء سبتمبر — العداد الرئيسي" rows={2} />
        <div className="flex items-center gap-3 rounded-md border border-dashed border-border-strong bg-surface-card p-3" aria-disabled>
          <span className="flex size-10 items-center justify-center rounded-md bg-surface-muted text-text-muted"><CameraIcon /></span>
          <div className="flex-1"><p className="text-body-strong-14">إرفاق صورة الفاتورة</p><p className="text-body-small-12 text-text-secondary">قريباً — بعد تجهيز تخزين الملفات</p></div>
          <StatusBadge tone="neutral">قريباً</StatusBadge>
        </div>

        {canSave && <p className="rounded-md bg-brand-primary-50 p-3 text-body-small-12 text-brand-primary">{ledgerPreview(category, paidFrom)}</p>}

        <div className="flex gap-2">
          <Button variant="action" size="lg" block disabled={!canSave || !!busy} onClick={() => submit("post")}>{busy === "post" ? "جارٍ الحفظ…" : "حفظ المصروف"}</Button>
          <Button variant="secondary" size="lg" disabled={!canSave || !!busy} onClick={() => submit("draft")}>{busy === "draft" ? "…" : "حفظ كمسودة"}</Button>
        </div>
      </div>
    </section>
  );
}

// ---------- recent table ----------
function ExpensesTable({ rows }: { rows: ExpenseRow[] }) {
  if (rows.length === 0) return <p className="text-body-regular-14 text-text-secondary">لا توجد مصاريف من هذه الفئة.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body-regular-14">
        <thead><tr className="bg-surface-muted text-body-small-12 text-text-secondary">
          <th className="rounded-s-md p-3 text-start font-semibold">التاريخ</th>
          <th className="p-3 text-start font-semibold">الفئة</th>
          <th className="p-3 text-start font-semibold">البيان</th>
          <th className="p-3 text-start font-semibold">المبلغ</th>
          <th className="p-3 text-start font-semibold">الحالة</th>
          <th className="rounded-e-md p-3 text-start font-semibold">بواسطة</th>
        </tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t border-border-default">
              <td className="whitespace-nowrap p-3 text-text-secondary">{formatDay(new Date(e.expenseDate))}</td>
              <td className="p-3"><StatusBadge tone={CATEGORY_TONE[e.category]}>{CATEGORY_LABEL[e.category]}</StatusBadge></td>
              <td className="p-3">{e.description}{e.supplier ? <span className="text-text-secondary"> · {e.supplier}</span> : null}</td>
              <td className="whitespace-nowrap p-3 font-semibold">{formatNumber(Number(e.amount))} <span className="font-normal text-text-muted">{PAID_FROM_LABEL[e.paidFrom]}</span></td>
              <td className="p-3">{e.status === "posted" ? <StatusBadge tone="success">مُرحَّل</StatusBadge> : <StatusBadge tone="warning">مسودة</StatusBadge>}</td>
              <td className="p-3 text-text-secondary">{e.by}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- new supplier ----------
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-lg bg-surface-card p-6 shadow-raised">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-heading-h2-20">{title}</h2><button type="button" onClick={onClose} aria-label="إغلاق" className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function NewSupplierModal({ stationId, onClose, onDone }: { stationId: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setError(undefined);
    const res = await createSupplier(stationId, name.trim(), phone.trim() || null).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (!res.ok) { setError(res.message); setBusy(false); return; }
    onDone();
  }

  return (
    <Modal title="مورد جديد" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <AlertBanner tone="danger" title={error} />}
        <Input label="اسم المورد" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="الهاتف (اختياري)" dir="ltr" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="flex gap-2"><Button variant="action" size="lg" block disabled={!name.trim() || busy} onClick={save}>{busy ? "جارٍ الحفظ…" : "حفظ المورد"}</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></div>
      </div>
    </Modal>
  );
}

function TruckIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 3h15v13H1z" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>; }
function CameraIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3" /></svg>; }

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <span key={i} className="h-72 animate-pulse rounded-lg bg-surface-muted" />)}</div>
      <span className="h-56 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}
