"use client";
// O2 — الخزانات والمخزون (design/screens/O2.png). Book stock is computed from movements; no manual edits.
// «إضافة توريد» → record_fuel_delivery, «تسجيل قياس فعلي» → record_tank_measurement (posts a stock-adjustment
// approval request when the gap exceeds the station's tolerance — decided in O7, opened from here).
import { formatDay, formatNumber, formatTime } from "@fuelos/core";
import { AlertBanner, Button, cx, Input, StatusBadge } from "@fuelos/ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  loadTanks, recordDelivery, recordMeasurement, type MovementRow, type TankRow, type TanksData,
} from "@/lib/tanks-data";
import { cardFlag, daysOfStock, levelTone, matchesFilter, MOVEMENT_LABEL, MOVEMENT_TONE, type MovementFilter } from "@/lib/tank-rules";
import { useOffice } from "../office-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: TanksData };
const FILTERS: [MovementFilter, string][] = [
  ["all", "الكل"], ["receipt", "وارد"], ["sale", "بيع"], ["adjustment", "تسوية"], ["waste", "هدر"], ["return", "إرجاع"],
];

export default function TanksPage() {
  const { current } = useOffice();
  const canWrite = current.role === "owner" || current.role === "accountant" || current.role === "shift_manager";
  const canMeasure = current.role === "owner" || current.role === "shift_manager";

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<MovementFilter>("all");
  const [modal, setModal] = useState<"delivery" | "measure">();
  const [presetTank, setPresetTank] = useState<string>();

  useEffect(() => {
    let alive = true;
    loadTanks(current.stationId).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [current.stationId, tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }
  function openModal(m: "delivery" | "measure", tankId?: string) {
    setPresetTank(tankId);
    setModal(m);
  }

  const data = load.status === "ready" ? load.data : undefined;
  const alerted = data?.tanks.find((t) => t.pendingAdjustment);

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">الخزانات والمخزون</h1>
          <p className="text-body-regular-14 text-text-secondary">
            المخزون يُحسب من الحركات المسجّلة ويُطابق بالقياس الفعلي — لا حسابات مطلوبة
            {data ? ` · آخر تحديث ${formatTime(data.fetchedAt)} · من الخادم` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="action" disabled={!canWrite} title={canWrite ? undefined : "إضافة توريد متاحة لصاحب المحطة أو المحاسب أو مدير المناوبة"} onClick={() => openModal("delivery")}>+ إضافة توريد</Button>
          <Button variant="secondary" disabled={!canMeasure} title={canMeasure ? undefined : "تسجيل القياس متاح لصاحب المحطة أو مدير المناوبة"} onClick={() => openModal("measure")}>تسجيل قياس فعلي</Button>
          <Button variant="secondary" disabled title="نقل الوقود بين الخزانات يحتاج دعماً من الخادم — قريباً">نقل بين الخزانات</Button>
          <Button variant="secondary" onClick={refresh}>تحديث</Button>
        </div>
      </header>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل الخزانات" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}

      {data && (
        <>
          {alerted?.pendingAdjustment && (
            <AlertBanner tone="danger" title={`فرق كبير في ${alerted.name}: المقاس ${alerted.pendingAdjustment.diffL < 0 ? "أقل" : "أعلى"} من الدفتري بـ ${formatNumber(Math.abs(alerted.pendingAdjustment.diffL))} لتر`}
              action={<Link href={`/approvals?select=${alerted.pendingAdjustment.id}`} className="inline-flex h-10 items-center rounded-sm border border-border-strong bg-surface-card px-4 text-body-strong-14">راجع التسوية</Link>}>
              تجاوز حدّ التسامح. التسوية تحتاج سبباً واعتماد المدير، وتُسجَّل كقيد عكسي في سجل المراجعة إن رُفضت.
            </AlertBanner>
          )}

          {data.tanks.length === 0 ? (
            <AlertBanner tone="info" title="لا توجد خزانات مفعّلة">أضف خزاناً من الإعدادات.</AlertBanner>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {data.tanks.map((t) => (
                <TankCard key={t.id} t={t} canMeasure={canMeasure} onMeasure={() => openModal("measure", t.id)} onDeliver={() => openModal("delivery", t.id)} />
              ))}
            </div>
          )}

          <section className="rounded-lg bg-surface-card p-6 shadow-card">
            <h2 className="mb-3 text-heading-h2-20">سجل حركات المخزون</h2>
            <div role="tablist" aria-label="نوع الحركة" className="mb-3 flex flex-wrap gap-2">
              {FILTERS.map(([f, label]) => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={cx("h-9 rounded-full border px-4 text-body-strong-14", filter === f ? "border-brand-primary bg-brand-primary text-white" : "border-border-default bg-surface-card text-text-secondary")}>
                  {label}
                </button>
              ))}
            </div>
            <MovementTable rows={data.movements.filter((m) => matchesFilter(m.type, filter))} />
          </section>
        </>
      )}

      {modal === "delivery" && data && (
        <DeliveryModal tanks={data.tanks} suppliers={data.suppliers} presetTank={presetTank} onClose={() => setModal(undefined)} onDone={() => { setModal(undefined); refresh(); }} />
      )}
      {modal === "measure" && data && (
        <MeasureModal tanks={data.tanks} presetTank={presetTank} onClose={() => setModal(undefined)} onDone={() => { setModal(undefined); refresh(); }} />
      )}
    </div>
  );
}

// ---------- card ----------
function TankCard({ t, canMeasure, onMeasure, onDeliver }: { t: TankRow; canMeasure: boolean; onMeasure: () => void; onDeliver: () => void }) {
  const tone = levelTone(t.bookPct, t.minPct);
  const flag = cardFlag({ hasPendingAdjustment: !!t.pendingAdjustment, belowMin: t.bookPct < t.minPct, lastDeliveryMissingCost: t.lastDeliveryMissingCost });
  const diff = t.lastMeasured ? Math.round(t.lastMeasured.liters - t.bookL) : null;
  const days = daysOfStock(t.bookL, t.avgDailyL);

  return (
    <section className={cx("flex flex-col gap-4 rounded-lg bg-surface-card p-5 shadow-card", t.pendingAdjustment && "ring-2 ring-status-danger")}>
      <header className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-heading-h2-20">{t.product}</h2>
            <span className="flex size-7 items-center justify-center rounded-md bg-status-info-50 text-status-info-700"><DropIcon /></span>
          </div>
          <p className="text-body-small-12 text-text-secondary">{t.name} · سعة {formatNumber(t.capacityL)} لتر</p>
        </div>
        {flag && <StatusBadge tone={flag.tone}>{flag.label}</StatusBadge>}
      </header>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-body-small-12 text-text-secondary">الحد الأدنى {t.minPct}%</span>
          <span className={cx("text-number-xl-32", tone === "danger" ? "text-status-danger-700" : tone === "warning" ? "text-status-warning-700" : "text-text-primary")}>
            {formatNumber(t.bookPct)}%
          </span>
        </div>
        <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
          <div className={cx("h-full rounded-full", tone === "danger" ? "bg-status-danger" : tone === "warning" ? "bg-status-warning" : "bg-brand-primary")}
            style={{ width: `${Math.max(0, Math.min(100, t.bookPct))}%` }} />
          <div className="absolute top-0 h-2 w-px bg-text-muted" style={{ insetInlineEnd: `${100 - t.minPct}%` }} aria-hidden />
        </div>
        <p className="mt-1 flex justify-between text-body-small-12 text-text-muted">
          <span>دفتري (من الحركات){t.lastMeasured ? ` · آخر قياس فعلي ${formatTime(t.lastMeasured.at)}` : " · لا يوجد قياس فعلي بعد"}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="يكفي" value={days === null ? "—" : `${formatNumber(days, 1)} يوم`} />
        <Stat label="الفرق" value={diff === null ? "—" : `${diff > 0 ? "+" : ""}${formatNumber(diff)}`} tone={diff !== null && diff < 0 ? "danger" : undefined} />
        <Stat label="المقاس" value={t.lastMeasured ? formatNumber(t.lastMeasured.liters) : "—"} />
        <Stat label="الدفتري" value={formatNumber(Math.round(t.bookL))} />
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="md" onClick={onDeliver} className="flex-1">توريد</Button>
        <Button variant="secondary" size="md" disabled={!canMeasure} title={canMeasure ? undefined : "متاح لصاحب المحطة ومدير المناوبة"} onClick={onMeasure} className="flex-1">قياس فعلي</Button>
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-md bg-surface-muted p-3">
      <p className="flex items-center gap-1 text-body-small-12 text-text-secondary">{label}</p>
      <p className={cx("text-number-m-18", tone === "danger" && "text-status-danger-700")}>{value}</p>
    </div>
  );
}

// ---------- movement log ----------
function MovementTable({ rows }: { rows: MovementRow[] }) {
  if (rows.length === 0) return <p className="text-body-regular-14 text-text-secondary">لا توجد حركات من هذا النوع.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body-regular-14">
        <thead>
          <tr className="bg-surface-muted text-body-small-12 text-text-secondary">
            <th className="rounded-s-md p-3 text-start font-semibold">التاريخ</th>
            <th className="p-3 text-start font-semibold">النوع</th>
            <th className="p-3 text-start font-semibold">الخزان</th>
            <th className="p-3 text-start font-semibold">الكمية</th>
            <th className="p-3 text-start font-semibold">المرجع</th>
            <th className="rounded-e-md p-3 text-start font-semibold">بواسطة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-t border-border-default">
              <td className="whitespace-nowrap p-3 text-text-secondary">{formatDay(new Date(m.createdAt))} {formatTime(m.createdAt)}</td>
              <td className="p-3"><StatusBadge tone={MOVEMENT_TONE[m.type]}>{MOVEMENT_LABEL[m.type]}</StatusBadge></td>
              <td className="p-3">{m.tankName}</td>
              <td className={cx("whitespace-nowrap p-3 font-semibold", Number(m.liters) < 0 ? "text-status-danger-700" : "text-brand-action-700")}>
                {Number(m.liters) > 0 ? "+" : ""}{formatNumber(Number(m.liters))} لتر
              </td>
              <td className="p-3 text-text-secondary">{m.refLabel}</td>
              <td className="p-3 text-text-secondary">{m.by}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- modal shell ----------
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-lg bg-surface-card p-6 shadow-raised">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-heading-h2-20">{title}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- add delivery ----------
function DeliveryModal({ tanks, suppliers, presetTank, onClose, onDone }: {
  tanks: TankRow[]; suppliers: { id: string; name: string }[]; presetTank?: string; onClose: () => void; onDone: () => void;
}) {
  const { current } = useOffice();
  const [tankId, setTankId] = useState(presetTank ?? tanks[0]?.id ?? "");
  const [liters, setLiters] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [extraCosts, setExtraCosts] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);

  const litersOk = /^\d+(\.\d{1,3})?$/.test(liters.trim()) && Number(liters) > 0;
  const costOk = unitCost.trim() === "" || (/^\d+(\.\d{1,2})?$/.test(unitCost.trim()) && Number(unitCost) > 0);
  const canSave = !!tankId && litersOk && costOk;

  async function save() {
    if (inFlight.current || !canSave) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const res = await recordDelivery({
        stationId: current.stationId, tankId, liters: liters.trim(),
        unitCost: unitCost.trim() === "" ? null : unitCost.trim(), extraCosts: extraCosts.trim(),
        supplierId: supplierId || null, invoiceNo: invoiceNo.trim() || null,
      }).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
      if (!res.ok) return setError(res.message);
      onDone();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal title="إضافة توريد" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <AlertBanner tone="danger" title={error} />}
        <label className="flex flex-col gap-1 text-label-12 text-text-secondary">
          الخزان
          <select value={tankId} onChange={(e) => setTankId(e.target.value)} className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-regular-14">
            {tanks.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.product}</option>)}
          </select>
        </label>
        <Input label="الكمية" inputMode="decimal" autoComplete="off" suffix="لتر" value={liters} onChange={(e) => setLiters(e.target.value)}
          error={liters !== "" && !litersOk ? "أدخل عدداً موجباً من اللترات" : undefined} />
        <Input label="سعر الشراء لكل لتر (اختياري)" inputMode="decimal" autoComplete="off" suffix="ل.س" value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
          error={!costOk ? "أدخل رقماً موجباً بخانتين عشريتين على الأكثر" : undefined}
          helper="بلا سعر: تتحرك الكمية في المخزون، ويبقى الربح تقديرياً حتى تُدخله" />
        <Input label="تكاليف إضافية (نقل، جمارك)" inputMode="decimal" autoComplete="off" suffix="ل.س" value={extraCosts} onChange={(e) => setExtraCosts(e.target.value)} />
        <label className="flex flex-col gap-1 text-label-12 text-text-secondary">
          المورد (اختياري)
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-regular-14">
            <option value="">بلا مورد محدد</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <Input label="رقم الفاتورة (اختياري)" dir="ltr" autoComplete="off" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="action" size="lg" block disabled={!canSave || busy} onClick={save}>{busy ? "جارٍ الحفظ…" : "حفظ التوريد"}</Button>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- record measurement ----------
function MeasureModal({ tanks, presetTank, onClose, onDone }: { tanks: TankRow[]; presetTank?: string; onClose: () => void; onDone: () => void }) {
  const [tankId, setTankId] = useState(presetTank ?? tanks[0]?.id ?? "");
  const [measured, setMeasured] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [ok, setOk] = useState<{ diffL: number; needsApproval: boolean }>();
  const inFlight = useRef(false);
  const tank = tanks.find((t) => t.id === tankId);

  const measuredOk = /^\d+(\.\d{1,3})?$/.test(measured.trim());

  async function save() {
    if (inFlight.current || !measuredOk) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const res = await recordMeasurement(tankId, measured.trim()).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
      if (!res.ok) return setError(res.message);
      setOk({ diffL: res.diffL, needsApproval: res.needsApproval });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (ok) {
    return (
      <Modal title="تسجيل قياس فعلي" onClose={onDone}>
        <AlertBanner tone={ok.diffL === 0 ? "success" : ok.needsApproval ? "warning" : "info"}
          title={ok.diffL === 0 ? "القياس مطابق للدفتري — لا تسوية لازمة"
            : ok.needsApproval ? `الفرق ${formatNumber(Math.abs(ok.diffL))} لتر يتجاوز حدّ التسامح — أُرسل طلب اعتماد`
            : `الفرق ${formatNumber(Math.abs(ok.diffL))} لتر ضمن حدّ التسامح — طُبِّق تلقائياً`} />
        <Button variant="action" size="lg" block className="mt-4" onClick={onDone}>تم</Button>
      </Modal>
    );
  }

  return (
    <Modal title="تسجيل قياس فعلي" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <AlertBanner tone="danger" title={error} />}
        <label className="flex flex-col gap-1 text-label-12 text-text-secondary">
          الخزان
          <select value={tankId} onChange={(e) => setTankId(e.target.value)} className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-regular-14">
            {tanks.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.product}</option>)}
          </select>
        </label>
        {tank && <p className="text-body-small-12 text-text-secondary">المخزون الدفتري الآن: {formatNumber(Math.round(tank.bookL))} لتر</p>}
        <Input label="القياس الفعلي (القياس بالعصا)" inputMode="decimal" autoComplete="off" suffix="لتر" value={measured} onChange={(e) => setMeasured(e.target.value)}
          error={measured !== "" && !measuredOk ? "أدخل عدداً موجباً من اللترات" : undefined} />
        <p className="text-body-small-12 text-text-muted">صورة القياس: قريباً — بعد تجهيز تخزين الصور.</p>
        <div className="flex gap-2">
          <Button variant="action" size="lg" block disabled={!measuredOk || busy} onClick={save}>{busy ? "جارٍ الحفظ…" : "حفظ القياس"}</Button>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
        </div>
      </div>
    </Modal>
  );
}

function DropIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 2s7 8.5 7 13a7 7 0 0 1-14 0c0-4.5 7-13 7-13z" /></svg>;
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <span key={i} className="h-72 animate-pulse rounded-lg bg-surface-muted" />)}</div>
      <span className="h-56 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}
