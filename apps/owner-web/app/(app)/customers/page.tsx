"use client";
// O5 — العملاء والديون (design/screens/O5.png). Company accounts carry the credit (البيع الآجل من S8/S9); individual
// customers pay at the pump and have no station credit, so they get a lighter read-only tab. Layout adapted from the
// design's three columns to this app's list+detail pattern (O3/O7): a risk summary row, then the list and detail.
import { formatDay, formatMoney, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, Input, StatusBadge } from "@fuelos/ui";
import { useEffect, useRef, useState } from "react";
import { centsStr } from "@/lib/money";
import {
  addDriver, addVehicle, createCompany, loadCustomers, recordPayment, setCompanyStatus, setDriverAuthorized, setVehicleActive,
  type Company, type CustomerRow, type CustomersData, type Driver, type Outcome, type Txn, type Vehicle,
} from "@/lib/customers-data";
import { bucketOf, companyBadge, needsAttention, type AgingBucket, type CompanyStatus } from "@/lib/company-rules";
import { useOffice } from "../office-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: CustomersData };
type Category = "all" | "companies" | "individuals" | "overdue";

const CATS: [Category, string][] = [["all", "الكل"], ["companies", "شركات"], ["individuals", "أفراد"], ["overdue", "متأخر"]];
const STATUS_LABEL: Record<CompanyStatus, string> = { active: "نشط", frozen: "مجمّد", suspended: "موقوف" };

export default function CustomersPage() {
  const { current } = useOffice();
  const canManage = current.role === "owner" || current.role === "accountant";
  const money = (c: bigint) => formatMoney(centsStr(c), current.currencyLabel);

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCustomers(current.stationId).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [current.stationId, tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  const data = load.status === "ready" ? load.data : undefined;
  const companies = data?.companies ?? [];
  const customers = data?.customers ?? [];

  const q = query.trim();
  const matchCompany = (c: Company) => !q || c.name.includes(q) || c.vehicles.some((v) => v.plate.includes(q));
  const matchCustomer = (c: CustomerRow) => !q || c.name.includes(q) || (c.phone ?? "").includes(q);
  const shownCompanies = companies.filter((c) => matchCompany(c) && (category === "all" || category === "companies" || (category === "overdue" && (c.overdueDays ?? 0) > 30)));
  const shownCustomers = category === "companies" || category === "overdue" ? [] : customers.filter(matchCustomer);
  const selected = companies.find((c) => c.id === selectedId);

  const attention = companies.find((c) => needsAttention(c.overdueDays, c.utilPct));

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">العملاء والديون وحسابات الشركات</h1>
          <p className="text-body-regular-14 text-text-secondary">
            البيع الآجل وسقوف الائتمان وكشوف الحساب{data ? ` · آخر تحديث ${formatTime(data.fetchedAt)} · من الخادم` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="action" disabled={!canManage} title={canManage ? undefined : "إضافة عميل متاحة لصاحب المحطة أو المحاسب"} onClick={() => setShowNew(true)}>+ عميل جديد</Button>
          <Button variant="secondary" disabled title="إرسال كشوف الشهر يحتاج تكامل بريد/رسائل — قريباً">كشوف الشهر</Button>
          <Button variant="secondary" onClick={refresh}>تحديث</Button>
        </div>
      </header>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل العملاء" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}

      {data && (
        <>
          <RiskPanel companies={companies} money={money} />
          {attention && (
            <AlertBanner tone="warning" title="إجراء مقترح">
              {`${attention.name} استخدمت ${attention.utilPct}% من حدها ومتأخرة ${attention.overdueDays} يوماً. أرسل الكشف وحدّد موعداً للتحصيل قبل التجميد.`}
              {" "}<Button variant="ghost" onClick={() => setSelectedId(attention.id)}>افتح الحساب</Button>
            </AlertBanner>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
            <section className="flex flex-col gap-3 rounded-lg bg-surface-card p-4 shadow-card">
              <label className="relative">
                <span className="sr-only">ابحث بالاسم أو رقم السيارة</span>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو رقم السيارة"
                  className="h-11 w-full rounded-md border border-border-strong bg-surface-card ps-3 pe-9 text-body-regular-14 outline-none focus:ring-2 focus:ring-brand-primary-50" />
              </label>
              <div role="tablist" aria-label="التصنيف" className="grid grid-cols-4 gap-1 rounded-md bg-surface-muted p-1">
                {CATS.map(([c, label]) => (
                  <button key={c} role="tab" aria-selected={category === c} onClick={() => setCategory(c)}
                    className={cx("h-9 rounded-sm text-body-strong-14", category === c ? "bg-surface-card shadow-card" : "text-text-secondary")}>{label}</button>
                ))}
              </div>
              <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
                {shownCompanies.map((c) => (
                  <CompanyListRow key={c.id} c={c} money={money} selected={c.id === selectedId} onSelect={() => setSelectedId(c.id)} />
                ))}
                {shownCustomers.map((c) => (
                  <li key={c.id} className="rounded-md border border-border-default bg-surface-card p-3">
                    <p className="text-body-strong-14">{c.name} <span className="text-label-11 font-normal text-text-muted">فرد</span></p>
                    <p className="text-body-small-12 text-text-secondary">{c.invoiceCount} فاتورة · {money(c.totalCents)}</p>
                  </li>
                ))}
                {shownCompanies.length === 0 && shownCustomers.length === 0 && (
                  <p className="p-4 text-center text-body-regular-14 text-text-secondary">لا نتائج مطابقة.</p>
                )}
              </ul>
            </section>

            {selected ? (
              <CompanyDetail key={selected.id} c={selected} canManage={canManage} money={money} onChanged={refresh} />
            ) : (
              <p className="rounded-lg bg-surface-card p-8 text-center text-body-regular-14 text-text-secondary shadow-card">
                اختر شركة من القائمة لترى حسابها هنا. الأفراد للاطلاع فقط: لا يحمل حساب الفرد ديناً في المحطة.
              </p>
            )}
          </div>
        </>
      )}

      {showNew && <NewCompanyModal onClose={() => setShowNew(false)} onDone={(id) => { setShowNew(false); refresh(); setSelectedId(id); }} />}
    </div>
  );
}

// ---------- risk summary ----------
function RiskPanel({ companies, money }: { companies: Company[]; money: (c: bigint) => string }) {
  const buckets: Record<AgingBucket, bigint> = { "0-30": 0n, "31-60": 0n, "60+": 0n };
  let overCount = 0;
  for (const c of companies) {
    if (c.overdueDays === null || c.balanceCents <= 0n) continue;
    buckets[bucketOf(c.overdueDays)] += c.balanceCents;
    if (c.overdueDays > 30) overCount++;
  }
  const nearLimit = companies.filter((c) => c.status === "active" && c.utilPct >= 80).length;
  const bar = (v: bigint, tone: string) => (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"><div className={cx("h-full rounded-full", tone)} style={{ width: v > 0n ? "100%" : "0%" }} /></div>
  );
  return (
    <section className="rounded-lg bg-surface-card p-5 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 text-heading-h2-20"><WarnIcon /> مخاطر الديون</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {([["0-30", "0 – 30 يوماً", "bg-brand-action"], ["31-60", "31 – 60 يوماً", "bg-status-warning"], ["60+", "أكثر من 60 يوماً", "bg-status-danger"]] as const).map(([k, label, tone]) => (
          <div key={k} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className={cx("text-heading-h3-16", k === "60+" && buckets[k] > 0n && "text-status-danger-700")}>{money(buckets[k])}</p>
              <p className="text-body-small-12 text-text-secondary">{label}</p>
              {bar(buckets[k], tone)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-6 text-body-small-12 text-text-secondary">
        <span><span className="text-body-strong-14 text-text-primary">{overCount}</span> عملاء تجاوزوا 30 يوماً</span>
        <span><span className="text-body-strong-14 text-text-primary">{nearLimit}</span> قرب الحد الائتماني (80%+)</span>
      </div>
    </section>
  );
}

// ---------- list row ----------
function CompanyListRow({ c, money, selected, onSelect }: { c: Company; money: (c: bigint) => string; selected: boolean; onSelect: () => void }) {
  const badge = companyBadge(c.status, c.overdueDays, c.utilPct);
  return (
    <li>
      <button type="button" onClick={onSelect} aria-current={selected ? "true" : undefined}
        className={cx("flex w-full items-center gap-3 rounded-md border p-3 text-start", selected ? "border-2 border-brand-primary bg-brand-primary-50" : "border-border-default bg-surface-card hover:bg-surface-muted")}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-primary-50 text-body-strong-14 text-brand-primary">{initials(c.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-strong-14">{c.name}</span>
          <span className="block text-body-small-12 text-text-secondary">{money(c.balanceCents)}</span>
        </span>
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </button>
    </li>
  );
}

function initials(name: string): string {
  const w = name.trim().split(/\s+/);
  return w.slice(0, 2).map((x) => x[0]).join("");
}

// ---------- detail ----------
type Tab = "txns" | "statement" | "vehicles" | "drivers";
const TABS: [Tab, string][] = [["txns", "العمليات"], ["statement", "كشف الحساب"], ["vehicles", "المركبات"], ["drivers", "السائقون"]];

function CompanyDetail({ c, canManage, money, onChanged }: { c: Company; canManage: boolean; money: (c: bigint) => string; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("txns");
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string }>();
  const inFlight = useRef(false);
  const badge = companyBadge(c.status, c.overdueDays, c.utilPct);

  async function changeStatus(status: CompanyStatus) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const res = await setCompanyStatus(c.id, status).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    report(res, status === "frozen" ? "جُمِّد الحساب" : status === "suspended" ? "أُوقف الحساب" : "أُعيد تفعيل الحساب");
    inFlight.current = false;
  }
  function report(res: Outcome, okText: string) {
    setMsg(res.ok ? { tone: "success", text: okText } : { tone: "danger", text: res.message });
    setBusy(false);
    if (res.ok) onChanged();
  }

  return (
    <article className="rounded-lg bg-surface-card p-6 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-11 items-center justify-center rounded-md bg-brand-primary-50 text-brand-primary"><BuildingIcon /></span>
          <div>
            <div className="flex items-center gap-2"><h2 className="text-heading-h1-24">{c.name}</h2><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></div>
            <p className="text-body-small-12 text-text-secondary">حساب شركة · {STATUS_LABEL[c.status]} · {c.drivers.length} سائقاً · {c.vehicles.length} مركبة · يوم الفوترة {c.billingDay}</p>
          </div>
        </div>
      </header>

      {msg && <AlertBanner tone={msg.tone} className="mt-4" title={msg.text} />}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-2">
        <Stat label="الحد الائتماني" value={money(centsOf(c.creditLimit))} />
        <Stat label="الرصيد المستحق" value={money(c.balanceCents)} tone={c.balanceCents > 0n ? "danger" : undefined} />
      </div>
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-body-small-12 text-text-secondary"><span>{c.utilPct}%</span><span>المستخدم من الحد</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted"><div className={cx("h-full rounded-full", c.utilPct >= 80 ? "bg-status-warning" : "bg-brand-primary")} style={{ width: `${c.utilPct}%` }} /></div>
      </div>

      <div role="tablist" aria-label="أقسام الحساب" className="mt-5 flex gap-2 border-b border-border-default">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cx("border-b-2 px-1 pb-2 text-body-strong-14", tab === t ? "border-brand-primary text-brand-primary" : "border-transparent text-text-secondary")}>{label}</button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "txns" && <TxnList txns={c.txns} money={money} withBalance={false} />}
        {tab === "statement" && <TxnList txns={c.txns} money={money} withBalance />}
        {tab === "vehicles" && <VehiclesTab c={c} canManage={canManage} onDone={onChanged} />}
        {tab === "drivers" && <DriversTab c={c} canManage={canManage} onDone={onChanged} />}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border-default pt-4">
        {canManage ? (
          <>
            {c.status !== "suspended" && (
              <Button variant="secondary" disabled={busy} onClick={() => changeStatus(c.status === "frozen" ? "active" : "frozen")}>
                {c.status === "frozen" ? "إلغاء التجميد" : "تجميد الحساب"}
              </Button>
            )}
            <Button variant={c.status === "suspended" ? "action" : "danger"} disabled={busy} onClick={() => changeStatus(c.status === "suspended" ? "active" : "suspended")}>
              {c.status === "suspended" ? "إعادة التفعيل" : "إيقاف الحساب"}
            </Button>
            <Button variant="secondary" disabled title="إرسال الكشف يحتاج تكامل بريد/رسائل — قريباً">إرسال الكشف</Button>
            <Button variant="action" onClick={() => setPayOpen(true)}>تسجيل دفعة</Button>
          </>
        ) : (
          <p className="text-body-small-12 text-text-secondary">تجميد الحساب وتسجيل الدفعات متاحان لصاحب المحطة والمحاسب.</p>
        )}
      </div>

      {payOpen && <PaymentModal c={c} onClose={() => setPayOpen(false)} onDone={() => { setPayOpen(false); onChanged(); }} />}
    </article>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return <div className="rounded-md bg-surface-muted p-3"><p className="text-body-small-12 text-text-secondary">{label}</p><p className={cx("text-number-l-24", tone === "danger" && "text-status-danger-700")}>{value}</p></div>;
}

function centsOf(v: number | string): bigint {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?/.exec(String(v).trim());
  if (!m) return 0n;
  const c = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -c : c;
}

const SALE_STATUS_BADGE: Record<string, [Parameters<typeof StatusBadge>[0]["tone"], string]> = {
  recorded: ["success", "مسجّلة"], pending_approval: ["warning", "بانتظار موافقة"], voided: ["danger", "ملغاة"],
};

function TxnList({ txns, money, withBalance }: { txns: Txn[]; money: (c: bigint) => string; withBalance: boolean }) {
  if (txns.length === 0) return <p className="text-body-regular-14 text-text-secondary">لا توجد عمليات بعد.</p>;
  let running = 0n;
  const withRunning = withBalance ? [...txns].reverse().map((t) => {
    running += t.kind === "sale" ? centsOf(t.amount) : -centsOf(t.amount);
    return { t, running };
  }).reverse() : txns.map((t) => ({ t, running: 0n }));
  return (
    <table className="w-full text-body-regular-14">
      <thead><tr className="bg-surface-muted text-body-small-12 text-text-secondary">
        <th className="rounded-s-md p-3 text-start font-semibold">العملية</th>
        <th className="p-3 text-start font-semibold">المبلغ</th>
        {withBalance && <th className="p-3 text-start font-semibold">الرصيد</th>}
        <th className="rounded-e-md p-3 text-start font-semibold">الحالة</th>
      </tr></thead>
      <tbody>
        {withRunning.map(({ t, running: r }) => {
          const amt = centsOf(t.amount);
          const status = t.kind === "payment" ? ["info", "دفعة"] as const : SALE_STATUS_BADGE[t.status ?? "recorded"] ?? SALE_STATUS_BADGE.recorded;
          return (
            <tr key={t.id} className="border-t border-border-default">
              <td className="p-3"><p className="font-semibold">{t.kind === "payment" ? "سداد" : "تعبئة آجلة"}</p><p className="text-body-small-12 text-text-secondary">{formatDay(new Date(t.at))} · {formatTime(t.at)}</p></td>
              <td className={cx("whitespace-nowrap p-3 font-semibold", t.kind === "payment" ? "text-brand-action-700" : undefined)}>{t.kind === "payment" ? "-" : ""}{money(amt)}</td>
              {withBalance && <td className="whitespace-nowrap p-3">{money(r)}</td>}
              <td className="p-3"><StatusBadge tone={status[0]}>{status[1]}</StatusBadge></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function VehiclesTab({ c, canManage, onDone }: { c: Company; canManage: boolean; onDone: () => void }) {
  const [adding, setAdding] = useState(false);
  const [plate, setPlate] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    if (!plate.trim()) return;
    setBusy(true);
    setError(undefined);
    const res = await addVehicle(c.id, plate.trim(), label.trim() || null).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (!res.ok) { setError(res.message); setBusy(false); return; }
    setAdding(false); setPlate(""); setLabel(""); setBusy(false); onDone();
  }
  async function toggle(v: Vehicle) {
    await setVehicleActive(v.id, !v.active).catch(() => undefined);
    onDone();
  }

  return (
    <div className="flex flex-col gap-3">
      {c.vehicles.length === 0 && <p className="text-body-regular-14 text-text-secondary">لا توجد مركبات مسجّلة بعد.</p>}
      <ul className="flex flex-col gap-2">
        {c.vehicles.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 rounded-md border border-border-default p-3">
            <div><p className="font-semibold" dir="ltr">{v.plate}</p><p className="text-body-small-12 text-text-secondary">{v.label ?? "بلا وصف"}</p></div>
            {canManage ? (
              <Button variant="ghost" onClick={() => toggle(v)}>{v.active ? "إلغاء التفعيل" : "تفعيل"}</Button>
            ) : <StatusBadge tone={v.active ? "success" : "neutral"}>{v.active ? "مفعّلة" : "معطّلة"}</StatusBadge>}
          </li>
        ))}
      </ul>
      {canManage && (adding ? (
        <div className="flex flex-col gap-2 rounded-md border border-border-default p-3">
          {error && <p className="text-body-small-12 text-status-danger-700">{error}</p>}
          <Input label="رقم اللوحة" dir="ltr" autoComplete="off" value={plate} onChange={(e) => setPlate(e.target.value)} />
          <Input label="الوصف (اختياري)" autoComplete="off" value={label} onChange={(e) => setLabel(e.target.value)} />
          <div className="flex gap-2"><Button variant="action" disabled={!plate.trim() || busy} onClick={save}>حفظ</Button><Button variant="ghost" onClick={() => setAdding(false)}>إلغاء</Button></div>
        </div>
      ) : <Button variant="secondary" onClick={() => setAdding(true)}>+ إضافة مركبة</Button>)}
    </div>
  );
}

function DriversTab({ c, canManage, onDone }: { c: Company; canManage: boolean; onDone: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setError(undefined);
    const res = await addDriver(c.id, name.trim(), phone.trim() || null).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (!res.ok) { setError(res.message); setBusy(false); return; }
    setAdding(false); setName(""); setPhone(""); setBusy(false); onDone();
  }
  async function toggle(d: Driver) {
    await setDriverAuthorized(d.id, !d.authorized).catch(() => undefined);
    onDone();
  }

  return (
    <div className="flex flex-col gap-3">
      {c.drivers.length === 0 && <p className="text-body-regular-14 text-text-secondary">لا يوجد سائقون مسجّلون بعد.</p>}
      <ul className="flex flex-col gap-2">
        {c.drivers.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 rounded-md border border-border-default p-3">
            <div><p className="font-semibold">{d.name}</p>{d.phone && <p dir="ltr" className="text-body-small-12 text-text-secondary">{d.phone}</p>}</div>
            <div className="flex items-center gap-2">
              <StatusBadge tone={d.authorized ? "success" : "neutral"}>{d.authorized ? "مصرّح" : "غير مصرّح"}</StatusBadge>
              {canManage && <Button variant="ghost" onClick={() => toggle(d)}>{d.authorized ? "إلغاء التصريح" : "تصريح"}</Button>}
            </div>
          </li>
        ))}
      </ul>
      {canManage && (adding ? (
        <div className="flex flex-col gap-2 rounded-md border border-border-default p-3">
          {error && <p className="text-body-small-12 text-status-danger-700">{error}</p>}
          <Input label="اسم السائق" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="الهاتف (اختياري)" dir="ltr" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="flex gap-2"><Button variant="action" disabled={!name.trim() || busy} onClick={save}>حفظ</Button><Button variant="ghost" onClick={() => setAdding(false)}>إلغاء</Button></div>
        </div>
      ) : <Button variant="secondary" onClick={() => setAdding(true)}>+ إضافة سائق</Button>)}
    </div>
  );
}

// ---------- modals ----------
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

function NewCompanyModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { current } = useOffice();
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [billingDay, setBillingDay] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const limitOk = /^\d+(\.\d{1,2})?$/.test(limit.trim());
  const dayOk = /^([1-9]|1\d|2[0-8])$/.test(billingDay.trim());

  async function save() {
    if (!name.trim() || !limitOk || !dayOk) return;
    setBusy(true);
    setError(undefined);
    const res = await createCompany(current.stationId, name.trim(), limit.trim(), Number(billingDay)).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (!res.ok) { setError(res.message); setBusy(false); return; }
    onDone("");
  }

  return (
    <Modal title="عميل جديد (حساب شركة)" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <AlertBanner tone="danger" title={error} />}
        <Input label="اسم الشركة" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="الحد الائتماني" inputMode="decimal" autoComplete="off" suffix={current.currencyLabel} value={limit} onChange={(e) => setLimit(e.target.value)}
          error={limit !== "" && !limitOk ? "أدخل رقماً موجباً بخانتين عشريتين على الأكثر" : undefined} />
        <Input label="يوم الفوترة الشهري" inputMode="numeric" autoComplete="off" value={billingDay} onChange={(e) => setBillingDay(e.target.value)}
          helper="من 1 إلى 28" error={billingDay !== "" && !dayOk ? "رقم من 1 إلى 28" : undefined} />
        <p className="text-body-small-12 text-text-secondary">تُضاف السيارات والسائقون بعد إنشاء الحساب.</p>
        <div className="flex gap-2"><Button variant="action" size="lg" block disabled={!name.trim() || !limitOk || !dayOk || busy} onClick={save}>{busy ? "جارٍ الحفظ…" : "إنشاء الحساب"}</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></div>
      </div>
    </Modal>
  );
}

function PaymentModal({ c, onClose, onDone }: { c: Company; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [paidTo, setPaidTo] = useState<"cash" | "bank">("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const amountOk = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;

  async function save() {
    if (!amountOk) return;
    setBusy(true);
    setError(undefined);
    const res = await recordPayment(c.id, amount.trim(), paidTo, note.trim() || null).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (!res.ok) { setError(res.message); setBusy(false); return; }
    onDone();
  }

  return (
    <Modal title={`تسجيل دفعة — ${c.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <AlertBanner tone="danger" title={error} />}
        <Input label="المبلغ" inputMode="decimal" autoComplete="off" suffix="ل.س" value={amount} onChange={(e) => setAmount(e.target.value)}
          error={amount !== "" && !amountOk ? "أدخل رقماً موجباً بخانتين عشريتين على الأكثر" : undefined} />
        <div role="radiogroup" aria-label="طريقة الاستلام" className="grid grid-cols-2 gap-2">
          {(["cash", "bank"] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={paidTo === p} onClick={() => setPaidTo(p)}
              className={cx("h-11 rounded-md border text-body-strong-14", paidTo === p ? "border-2 border-brand-primary bg-brand-primary-50" : "border-border-default bg-surface-card")}>
              {p === "cash" ? "نقداً" : "تحويل بنكي"}
            </button>
          ))}
        </div>
        <Input label="ملاحظة (اختياري)" autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2"><Button variant="action" size="lg" block disabled={!amountOk || busy} onClick={save}>{busy ? "جارٍ الحفظ…" : "حفظ الدفعة"}</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></div>
      </div>
    </Modal>
  );
}

function WarnIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>; }
function BuildingIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" /></svg>; }

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <span className="h-32 animate-pulse rounded-lg bg-surface-muted" />
      <div className="grid gap-6 lg:grid-cols-[4fr_8fr]"><span className="h-96 animate-pulse rounded-lg bg-surface-muted" /><span className="h-96 animate-pulse rounded-lg bg-surface-muted" /></div>
    </div>
  );
}
