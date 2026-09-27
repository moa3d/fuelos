"use client";
// O11 — الإعدادات (design/screens/O11.png). Owner-only writes. Scoped to the two sub-tabs that are real, data-
// backed settings today — «المستخدمون والصلاحيات» and «حدود التسامح» — the other three (المحطة، الخزانات
// والمضخات، الإشعارات) are placeholders. The permission list is read-only: roles are fixed in RLS/RPCs, not a
// configurable matrix, so this documents them rather than pretending they're editable toggles.
import { AlertBanner, Button, cx, Input, StatusBadge } from "@fuelos/ui";
import { useEffect, useState } from "react";
import {
  changeRole, loadSettings, setAttendantPin, setMemberStatus, updateTolerances,
  type MemberRow, type Outcome, type SettingsData, type Tolerances,
} from "@/lib/settings-data";
import {
  canSetPin, CAPABILITIES, isSelfRow, matchesSearch, ROLE_LABEL, statusBadge, type MemberRole,
} from "@/lib/settings-rules";
import { useOffice } from "../office-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: SettingsData };
type Tab = "station" | "tanks" | "users" | "tolerances" | "notifications";
const TABS: [Tab, string][] = [
  ["station", "المحطة"], ["tanks", "الخزانات والمضخات"], ["users", "المستخدمون والصلاحيات"],
  ["tolerances", "حدود التسامح"], ["notifications", "الإشعارات"],
];
const ROLES: MemberRole[] = ["owner", "accountant", "shift_manager", "attendant"];

export default function SettingsPage() {
  const { current, userId } = useOffice();
  const canManage = current.role === "owner";

  const [tab, setTab] = useState<Tab>("users");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    loadSettings(current.stationId).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [current.stationId, tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  return (
    <div className="mx-auto flex max-w-[1152px] flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-32">الإعدادات</h1>
          <p className="text-body-regular-14 text-text-secondary">{current.stationName} · الفرع الرئيسي</p>
        </div>
        <Button variant="action" disabled title="دعوة مستخدم جديد تحتاج دالة خادم تُنشئ له حساباً — بانتظار Cowork (docs/briefs/04c)">
          + دعوة مستخدم
        </Button>
      </header>

      <div role="tablist" aria-label="قسم الإعدادات" className="flex flex-wrap gap-2 border-b border-border-default">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cx("h-10 border-b-2 px-3 text-body-strong-14",
              tab === t ? "border-brand-primary text-brand-primary" : "border-transparent text-text-secondary")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "station" && <ComingSoon text="ملف المحطة (الاسم، العنوان، المنطقة الزمنية) — قريباً." />}
      {tab === "tanks" && <ComingSoon text="إعداد الخزانات والمضخات (إضافة خزان أو مضخة جديدة) — قريباً." />}
      {tab === "notifications" && <ComingSoon text="تفضيلات الإشعارات — قريباً." />}

      {tab === "users" && (
        <>
          {load.status === "loading" && <Skeleton />}
          {load.status === "error" && (
            <AlertBanner tone="danger" title="تعذّر تحميل المستخدمين" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
              تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
            </AlertBanner>
          )}
          {load.status === "ready" && <UsersTab data={load.data} canManage={canManage} stationId={current.stationId} userId={userId} onChanged={refresh} />}
        </>
      )}

      {tab === "tolerances" && (
        <>
          {load.status === "loading" && <Skeleton />}
          {load.status === "error" && (
            <AlertBanner tone="danger" title="تعذّر التحميل" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>} />
          )}
          {load.status === "ready" && <TolerancesTab tolerances={load.data.tolerances} canManage={canManage} stationId={current.stationId} onChanged={refresh} />}
        </>
      )}
    </div>
  );
}

function ComingSoon({ text }: { text: string }) {
  return <AlertBanner tone="info" title="هذا القسم قيد الإعداد">{text}</AlertBanner>;
}

// ---------- users & permissions ----------
function UsersTab({ data, canManage, stationId, userId, onChanged }: {
  data: SettingsData; canManage: boolean; stationId: string; userId: string; onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [refRole, setRefRole] = useState<MemberRole>("attendant");
  const shown = data.members.filter((m) => matchesSearch(m.name, query));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <section className="flex flex-col gap-3 rounded-lg bg-surface-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-heading-h3-16">صلاحيات: {ROLE_LABEL[refRole]}</h2>
          <span aria-hidden>🛡️</span>
        </div>
        <select value={refRole} onChange={(e) => setRefRole(e.target.value as MemberRole)}
          className="h-10 rounded-md border border-border-default bg-surface-card px-2 text-body-regular-14">
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <ul className="flex flex-col divide-y divide-border-default">
          {CAPABILITIES.map((c) => {
            const allowed = c.roles.includes(refRole);
            return (
              <li key={c.label} className="flex items-center justify-between gap-3 py-2 text-body-regular-14">
                <span className={allowed ? undefined : "text-text-muted"}>{c.label}</span>
                <span aria-hidden className={cx("text-body-strong-14", allowed ? "text-status-success-700" : "text-text-muted")}>{allowed ? "✓" : "—"}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-body-small-12 text-text-secondary">هذه الصلاحيات ثابتة في النظام حالياً حسب الدور، وليست قابلة للتخصيص من هنا.</p>
      </section>

      <section className="flex flex-col gap-3 rounded-lg bg-surface-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-heading-h2-20">المستخدمون ({data.members.length})</h2>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث"
          className="h-10 w-full rounded-md border border-border-default bg-surface-card px-3 text-body-regular-14" />
        <table className="w-full text-body-regular-14">
          <thead>
            <tr className="border-b border-border-default text-body-small-12 text-text-secondary">
              <th className="p-2 text-start font-normal">المستخدم</th>
              <th className="p-2 text-start font-normal">الدور</th>
              <th className="p-2 text-start font-normal">الحالة</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {shown.map((m) => <MemberRowView key={m.userId} m={m} canManage={canManage} self={isSelfRow(m.userId, userId)} stationId={stationId} onChanged={onChanged} />)}
          </tbody>
        </table>
        {shown.length === 0 && <p className="p-4 text-center text-body-regular-14 text-text-secondary">لا نتائج.</p>}
      </section>
    </div>
  );
}

function MemberRowView({ m, canManage, self, stationId, onChanged }: {
  m: MemberRow; canManage: boolean; self: boolean; stationId: string; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [pin, setPin] = useState("");
  const badge = statusBadge(m.status);

  async function run(fn: () => Promise<Outcome>) {
    setBusy(true); setMsg(undefined);
    const res = await fn().catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (res.ok) { setOpen(false); onChanged(); return; }
    setMsg(res.message); setBusy(false);
  }

  return (
    <tr>
      <td className="p-2">{m.name}</td>
      <td className="p-2"><StatusBadge tone="info">{ROLE_LABEL[m.role]}</StatusBadge></td>
      <td className="p-2"><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></td>
      <td className="p-2 text-end">
        {!self && canManage && (
          <div className="relative inline-block">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-label="خيارات" className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted">⋯</button>
            {open && (
              <div className="absolute end-0 z-10 mt-1 w-64 rounded-md border border-border-default bg-surface-card p-2 shadow-raised">
                {msg && <p className="mb-2 text-body-small-12 text-status-danger-700">{msg}</p>}
                <div className="flex flex-col gap-1">
                  {ROLES.filter((r) => r !== m.role).map((r) => (
                    <button key={r} type="button" disabled={busy} onClick={() => run(() => changeRole(stationId, m.userId, r))}
                      className="rounded-sm px-2 py-1.5 text-start text-body-small-12 hover:bg-surface-muted">
                      نقل إلى «{ROLE_LABEL[r]}»
                    </button>
                  ))}
                  <button type="button" disabled={busy} onClick={() => run(() => setMemberStatus(stationId, m.userId, m.status === "suspended" ? "active" : "suspended"))}
                    className="rounded-sm px-2 py-1.5 text-start text-body-small-12 hover:bg-surface-muted">
                    {m.status === "suspended" ? "إعادة التفعيل" : "إيقاف الحساب"}
                  </button>
                  {canSetPin(m.role) && (
                    <div className="mt-1 border-t border-border-default pt-2">
                      <p className="px-2 text-body-small-12 text-text-secondary">رمز دخول جديد (4-6 أرقام)</p>
                      <div className="mt-1 flex gap-1 px-2">
                        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} maxLength={6} dir="ltr"
                          className="h-8 w-20 rounded-md border border-border-default bg-surface-card px-2 text-body-regular-14" />
                        <Button variant="secondary" size="md" disabled={busy || pin.length < 4} onClick={() => run(() => setAttendantPin(stationId, m.userId, pin))}>تعيين</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ---------- tolerance limits ----------
function TolerancesTab({ tolerances, canManage, stationId, onChanged }: {
  tolerances: Tolerances; canManage: boolean; stationId: string; onChanged: () => void;
}) {
  const [form, setForm] = useState(tolerances);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const dirty = JSON.stringify(form) !== JSON.stringify(tolerances);

  async function save() {
    setBusy(true); setMsg(undefined);
    const res = await updateTolerances(stationId, form).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (res.ok) { onChanged(); return; }
    setMsg(res.message); setBusy(false);
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
      <h2 className="text-heading-h2-20">حدود التسامح</h2>
      <p className="text-body-small-12 text-text-secondary">فروق فوق هذه الحدود تطلب سبباً واعتماداً بدل قبولها تلقائياً.</p>
      {!canManage && <AlertBanner tone="info" title="التعديل متاح لصاحب المحطة فقط">يمكنك الاطلاع على القيم الحالية.</AlertBanner>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Input label="فرق الصندوق المسموح" suffix="ل.س" disabled={!canManage} inputMode="decimal" value={form.cashTolerance} onChange={(e) => setForm({ ...form, cashTolerance: e.target.value })} />
        <Input label="فرق المخزون المسموح" suffix="لتر" disabled={!canManage} inputMode="decimal" value={form.stockToleranceL} onChange={(e) => setForm({ ...form, stockToleranceL: e.target.value })} />
        <Input label="أقصى مدة مناوبة" suffix="ساعة" disabled={!canManage} inputMode="numeric" value={String(form.maxShiftHours)} onChange={(e) => setForm({ ...form, maxShiftHours: Number(e.target.value) || 0 })} />
        <Input label="حد البيع الآجل الافتراضي" suffix="ل.س" disabled={!canManage} inputMode="decimal" value={form.defaultCreditLimit} onChange={(e) => setForm({ ...form, defaultCreditLimit: e.target.value })} />
        <Input label="أقصى عمليات غير متزامنة (دون اتصال)" suffix="عملية" disabled={!canManage} inputMode="numeric" value={String(form.offlineMaxOps)} onChange={(e) => setForm({ ...form, offlineMaxOps: Number(e.target.value) || 0 })} />
      </div>
      {msg && <AlertBanner tone="danger" title={msg} />}
      {canManage && (
        <div className="flex gap-2">
          <Button variant="action" disabled={!dirty || busy} onClick={save}>{busy ? "جارٍ الحفظ…" : "حفظ الحدود"}</Button>
          {dirty && <Button variant="ghost" onClick={() => setForm(tolerances)}>تراجع</Button>}
        </div>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="grid gap-6 lg:grid-cols-[4fr_8fr]">
      <span className="h-72 animate-pulse rounded-lg bg-surface-muted" />
      <span className="h-72 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  );
}
