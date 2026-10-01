"use client";
// O11 — الإعدادات (design/screens/O11.png). Owner-only writes. Scoped to the two sub-tabs that are real, data-
// backed settings today — «المستخدمون والصلاحيات» and «حدود التسامح» — the other three (المحطة، الخزانات
// والمضخات، الإشعارات) are placeholders. The permission list is read-only: roles are fixed in RLS/RPCs, not a
// configurable matrix, so this documents them rather than pretending they're editable toggles. Inviting a user
// goes through the invite-station-member Edge Function (Cowork); the app never holds the service role.
import { formatDay } from "@fuelos/core";
import { AlertBanner, Button, cx, Input, StatusBadge, TextArea } from "@fuelos/ui";
import { useEffect, useState } from "react";
import { credentialBadge, generateDeviceId, syncStale } from "@/lib/device-rules";
import {
  issueCredential, loadDevices, revokeDevice, type DeviceRow,
} from "@/lib/devices-data";
import {
  addPump, addTank, loadTankOptions, type NozzleInput, type ProductOption, type PumpRow, type TankOption,
} from "@/lib/equipment-data";
import {
  changeRole, inviteMember, joinLink, loadSettings, resendInviteLink, setAttendantPin, setMemberStatus,
  updateTolerances, whatsappShareUrl, type Login, type MemberRow, type Outcome, type SettingsData, type Tolerances,
} from "@/lib/settings-data";
import {
  canSetPin, CAPABILITIES, isSelfRow, matchesSearch, ROLE_LABEL, statusBadge, type MemberRole,
} from "@/lib/settings-rules";
import {
  addRewardTier, loadLocation, loadRewardsSettings, setOfferCode, setPointValue, setTierActive, updateLocation,
  type Location, type RewardsSettings,
} from "@/lib/rewards-settings-data";
import { timeAgo } from "@/lib/time-ago";
import { useOffice } from "../office-context";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: SettingsData };
type Tab = "station" | "tanks" | "users" | "devices" | "tolerances" | "rewards" | "notifications";
const TABS: [Tab, string][] = [
  ["station", "المحطة"], ["tanks", "الخزانات والمضخات"], ["users", "المستخدمون والصلاحيات"],
  ["devices", "الأجهزة"], ["tolerances", "حدود التسامح"], ["rewards", "المكافآت"], ["notifications", "الإشعارات"],
];
const ROLES: MemberRole[] = ["owner", "accountant", "shift_manager", "attendant"];

export default function SettingsPage() {
  const { current, userId } = useOffice();
  const canManage = current.role === "owner";
  const canManageDevices = current.role === "owner" || current.role === "shift_manager";

  const [tab, setTab] = useState<Tab>("users");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [inviting, setInviting] = useState(false);

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
        <Button variant="action" disabled={!canManage} title={canManage ? undefined : "دعوة مستخدمين متاحة لصاحب المحطة فقط"} onClick={() => setInviting(true)}>
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

      {tab === "station" && <LocationTab stationId={current.stationId} canManage={canManage} />}
      {tab === "tanks" && <EquipmentTab stationId={current.stationId} canManage={canManage} />}
      {tab === "rewards" && <RewardsTab stationId={current.stationId} canManage={canManage} currency={current.currencyLabel} />}
      {tab === "devices" && <DevicesTab stationId={current.stationId} canManage={canManageDevices} />}
      {tab === "notifications" && <ComingSoon text="تفضيلات الإشعارات — قريباً." />}

      {tab === "users" && (
        <>
          {load.status === "loading" && <Skeleton />}
          {load.status === "error" && (
            <AlertBanner tone="danger" title="تعذّر تحميل المستخدمين" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
              تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
            </AlertBanner>
          )}
          {load.status === "ready" && <UsersTab data={load.data} canManage={canManage} stationId={current.stationId} stationName={current.stationName} userId={userId} now={Date.parse(load.data.fetchedAt)} onChanged={refresh} />}
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

      {inviting && <InviteModal stationId={current.stationId} stationName={current.stationName} onClose={() => setInviting(false)} onDone={() => { setInviting(false); refresh(); }} />}
    </div>
  );
}

// ---------- invite a user ----------
function InviteModal({ stationId, stationName, onClose, onDone }: { stationId: string; stationName: string; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState<MemberRole>("attendant");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ status: "invited" | "active"; login: Login | null }>();
  const emailRequired = role !== "attendant";

  async function send() {
    setBusy(true); setError(undefined);
    const res = await inviteMember({ stationId, role, displayName: name.trim(), email: email.trim() || null })
      .catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (!res.ok) { setError(res.message); setBusy(false); return; }
    setDone({ status: res.status, login: res.login });
    setBusy(false);
  }

  return (
    <Modal title="دعوة مستخدم" onClose={onClose}>
      {done ? (
        <div className="flex flex-col gap-3">
          <AlertBanner tone="success" title={done.status === "active" ? "تمت إضافة الحساب" : "جاهز للمشاركة"}>
            {done.status === "active" ? "الحساب نشط الآن. اضبط له رمز دخول من قائمة «⋯» في جدول المستخدمين."
              : done.login ? "شارك هذا الرابط مع الشخص ليدخل ويختار كلمة مرور. صالح لنحو ساعة."
              : "أُضيف حساب موجود مسبقاً إلى المحطة — يدخل بحسابه المعتاد."}
          </AlertBanner>
          {done.login && <JoinLinkCard login={done.login} stationName={stationName} />}
          <Button variant="secondary" onClick={onDone}>تم</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && <AlertBanner tone="danger" title={error} />}
          <div className="flex flex-col gap-1">
            <label className="text-label-12 text-text-secondary">الدور</label>
            <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}
              className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-large-16">
              {(["owner", "accountant", "shift_manager", "attendant"] as MemberRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <Input label="الاسم" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label={emailRequired ? "البريد الإلكتروني" : "البريد الإلكتروني (اختياري)"} dir="ltr" type="email" autoComplete="off"
            value={email} onChange={(e) => setEmail(e.target.value)}
            helper={emailRequired ? "لإنشاء رابط انضمام له" : "بلا بريد: يمكنك تسجيل دخوله برمز عند الجهاز مباشرة"} />
          <Button variant="action" size="lg" block disabled={busy || !name.trim() || (emailRequired && !email.trim())} onClick={send}>
            {busy ? "جارٍ الإنشاء…" : "دعوة"}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function JoinLinkCard({ login, stationName }: { login: Login; stationName: string }) {
  const [copied, setCopied] = useState(false);
  const link = joinLink(login);
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-muted p-3">
      <p dir="ltr" className="break-all text-body-small-12 text-text-secondary">{link}</p>
      <div className="flex gap-2">
        <Button variant="secondary" size="md" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}>{copied ? "تم النسخ ✓" : "نسخ الرابط"}</Button>
        <a href={whatsappShareUrl(link, stationName)} target="_blank" rel="noreferrer">
          <Button variant="secondary" size="md">إرسال عبر واتساب</Button>
        </a>
      </div>
    </div>
  );
}

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

function ComingSoon({ text }: { text: string }) {
  return <AlertBanner tone="info" title="هذا القسم قيد الإعداد">{text}</AlertBanner>;
}

// ---------- الخزانات والمضخات (docs/briefs/06b/06e): additive only, through setup_station_equipment() ----------
function EquipmentTab({ stationId, canManage }: { stationId: string; canManage: boolean }) {
  const [options, setOptions] = useState<{ tanks: TankOption[]; products: ProductOption[]; pumps: PumpRow[] }>();
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState<"tank" | "pump">();

  useEffect(() => { loadTankOptions(stationId).then(setOptions); }, [stationId, tick]);
  function refresh() { setTick((t) => t + 1); }

  if (!options) return <span className="block h-48 animate-pulse rounded-lg bg-surface-muted" />;

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-heading-h2-20">الخزانات والمضخات</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" disabled={!canManage} title={canManage ? undefined : "إضافة معدات متاحة لصاحب المحطة فقط"} onClick={() => setModal("tank")}>+ إضافة خزان</Button>
          <Button variant="action" size="md" disabled={!canManage || options.tanks.length === 0} title={!canManage ? "إضافة معدات متاحة لصاحب المحطة فقط" : options.tanks.length === 0 ? "أضف خزاناً أولاً" : undefined} onClick={() => setModal("pump")}>+ إضافة مضخة</Button>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-heading-h3-16">الخزانات ({options.tanks.length})</h3>
          {options.tanks.length === 0 ? (
            <p className="text-body-regular-14 text-text-secondary">لا توجد خزانات بعد.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-default">
              {options.tanks.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2 text-body-regular-14">
                  <span>{t.name}</span><span className="text-text-secondary">{t.productName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-heading-h3-16">المضخات ({options.pumps.length})</h3>
          {options.pumps.length === 0 ? (
            <p className="text-body-regular-14 text-text-secondary">لا توجد مضخات بعد.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-default">
              {options.pumps.map((p) => (
                <li key={p.id} className="flex flex-col py-2 text-body-regular-14">
                  <span>{p.name ?? `مضخة ${p.number}`}</span>
                  <span className="text-body-small-12 text-text-secondary">
                    {p.nozzles.map((n) => `${n.label} · ${n.productName}`).join(" — ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="text-body-small-12 text-text-secondary">التعديل التفصيلي (السعة، الحد الأدنى) من صفحة «الخزانات والمخزون».</p>

      {modal === "tank" && <TankModal stationId={stationId} products={options.products} onClose={() => setModal(undefined)} onDone={() => { setModal(undefined); refresh(); }} />}
      {modal === "pump" && <PumpModal stationId={stationId} tanks={options.tanks} onClose={() => setModal(undefined)} onDone={() => { setModal(undefined); refresh(); }} />}
    </section>
  );
}

function TankModal({ stationId, products, onClose, onDone }: { stationId: string; products: ProductOption[]; onClose: () => void; onDone: () => void }) {
  const [productCode, setProductCode] = useState(products[0]?.code ?? "");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [minPct, setMinPct] = useState("20");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const capacityOk = /^\d+$/.test(capacity.trim()) && Number(capacity) > 0;
  const minPctOk = /^\d+$/.test(minPct.trim()) && Number(minPct) >= 0 && Number(minPct) <= 100;
  const canSave = !!productCode && name.trim() && capacityOk && minPctOk;

  async function save() {
    if (!canSave || busy) return;
    setBusy(true); setError(undefined);
    const res = await addTank(stationId, { productCode, name: name.trim(), capacityL: capacity.trim(), minLevelPct: minPct.trim() })
      .catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onDone();
  }

  return (
    <Modal title="إضافة خزان" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <AlertBanner tone="danger" title={error} />}
        <label className="flex flex-col gap-1 text-label-12 text-text-secondary">
          الوقود
          <select value={productCode} onChange={(e) => setProductCode(e.target.value)} className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-regular-14">
            {products.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
        <Input label="اسم الخزان" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="السعة" inputMode="numeric" autoComplete="off" suffix="لتر" value={capacity} onChange={(e) => setCapacity(e.target.value)}
          error={capacity !== "" && !capacityOk ? "أدخل عدداً صحيحاً موجباً" : undefined} />
        <Input label="الحد الأدنى" inputMode="numeric" autoComplete="off" suffix="%" value={minPct} onChange={(e) => setMinPct(e.target.value)}
          error={!minPctOk ? "أدخل نسبة من 0 إلى 100" : undefined} />
        <div className="flex gap-2">
          <Button variant="action" size="lg" block disabled={!canSave || busy} onClick={save}>{busy ? "جارٍ الحفظ…" : "إضافة"}</Button>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
        </div>
      </div>
    </Modal>
  );
}

function PumpModal({ stationId, tanks, onClose, onDone }: { stationId: string; tanks: TankOption[]; onClose: () => void; onDone: () => void }) {
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [nozzles, setNozzles] = useState<NozzleInput[]>([{ label: "1", tankId: tanks[0]?.id ?? "", lastReading: "0" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const numberOk = /^\d+$/.test(number.trim()) && Number(number) > 0;
  const nozzlesOk = nozzles.every((n) => n.tankId && /^\d+(\.\d{1,1})?$/.test(n.lastReading.trim()));
  const canSave = numberOk && nozzlesOk && nozzles.length > 0;

  function setNozzle(i: number, patch: Partial<NozzleInput>) {
    setNozzles((ns) => ns.map((n, idx) => idx === i ? { ...n, ...patch } : n));
  }
  function addNozzle() {
    setNozzles((ns) => [...ns, { label: String(ns.length + 1), tankId: tanks[0]?.id ?? "", lastReading: "0" }]);
  }
  function removeNozzle(i: number) {
    setNozzles((ns) => ns.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!canSave || busy) return;
    setBusy(true); setError(undefined);
    const res = await addPump(stationId, { number: number.trim(), name: name.trim(), nozzles })
      .catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onDone();
  }

  return (
    <Modal title="إضافة مضخة" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <AlertBanner tone="danger" title={error} />}
        <div className="grid grid-cols-2 gap-3">
          <Input label="رقم المضخة" inputMode="numeric" autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value)}
            error={number !== "" && !numberOk ? "أدخل رقماً صحيحاً" : undefined} />
          <Input label="اسم المضخة (اختياري)" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-label-12 text-text-secondary">المسدسات</p>
          {nozzles.map((n, i) => (
            <div key={i} className="flex items-end gap-2 rounded-md bg-surface-muted p-2">
              <Input label="التسمية" autoComplete="off" value={n.label} onChange={(e) => setNozzle(i, { label: e.target.value })} className="w-20" />
              <label className="flex flex-1 flex-col gap-1 text-label-12 text-text-secondary">
                الخزان
                <select value={n.tankId} onChange={(e) => setNozzle(i, { tankId: e.target.value })} className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-regular-14">
                  {tanks.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.productName}</option>)}
                </select>
              </label>
              <Input label="القراءة الحالية" inputMode="decimal" autoComplete="off" suffix="لتر" value={n.lastReading} onChange={(e) => setNozzle(i, { lastReading: e.target.value })} className="w-32" />
              {nozzles.length > 1 && <Button variant="ghost" size="md" onClick={() => removeNozzle(i)}>حذف</Button>}
            </div>
          ))}
          <Button variant="secondary" size="md" onClick={addNozzle}>+ مسدس آخر</Button>
        </div>
        <div className="flex gap-2">
          <Button variant="action" size="lg" block disabled={!canSave || busy} onClick={save}>{busy ? "جارٍ الحفظ…" : "إضافة"}</Button>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- الأجهزة (docs/briefs/07a/07b): station_devices() + issue_device_credential()/revoke_device() ----------
function DevicesTab({ stationId, canManage }: { stationId: string; canManage: boolean }) {
  const [load, setLoad] = useState<{ status: "loading" } | { status: "error" } | { status: "ready"; data: DeviceRow[] }>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [registering, setRegistering] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!canManage) return;   // station_devices() itself is owner/shift_manager only — a doomed fetch otherwise
    let alive = true;
    loadDevices(stationId).then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [stationId, canManage, tick]);

  function refresh() { setLoad({ status: "loading" }); setTick((t) => t + 1); }

  if (!canManage) {
    return (
      <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
        <h2 className="text-heading-h2-20">الأجهزة</h2>
        <AlertBanner tone="info" title="إدارة الأجهزة متاحة لصاحب المحطة أو مدير المناوبة فقط">
          هذا القسم يسجّل الأجهزة التي يدخل منها العمال برموزهم في تطبيق العامل.
        </AlertBanner>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-heading-h2-20">الأجهزة</h2>
        <Button variant="action" size="md" onClick={() => setRegistering(true)}>+ تسجيل جهاز</Button>
      </div>

      {load.status === "loading" && <span className="block h-32 animate-pulse rounded-lg bg-surface-muted" />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل الأجهزة" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>} />
      )}
      {load.status === "ready" && (
        load.data.length === 0 ? (
          <p className="text-body-regular-14 text-text-secondary">لا توجد أجهزة مسجّلة بعد — سجّل جهازاً ليدخل العمال من تطبيق العامل برموزهم.</p>
        ) : (
          <table className="w-full text-body-regular-14">
            <thead>
              <tr className="border-b border-border-default text-body-small-12 text-text-secondary">
                <th className="p-2 text-start font-normal">الجهاز</th>
                <th className="p-2 text-start font-normal">الحالة</th>
                <th className="p-2 text-start font-normal">آخر مزامنة</th>
                <th className="p-2 text-start font-normal">عمليات معلّقة</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {load.data.map((d) => <DeviceRowView key={d.deviceId} d={d} stationId={stationId} now={now} onChanged={refresh} />)}
            </tbody>
          </table>
        )
      )}

      {registering && <RegisterDeviceModal stationId={stationId} onClose={() => setRegistering(false)} onDone={() => { setRegistering(false); refresh(); }} />}
    </section>
  );
}

function DeviceRowView({ d, stationId, now, onChanged }: {
  d: DeviceRow; stationId: string; now: number; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "reissue" | "revoke">("menu");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [newSecret, setNewSecret] = useState<string>();
  const [copied, setCopied] = useState(false);
  const badge = credentialBadge(d.credentialStatus);
  const stale = syncStale(d.lastSyncAt, now);

  function close() { setOpen(false); setMode("menu"); setReason(""); setMsg(undefined); setNewSecret(undefined); setCopied(false); }

  async function doReissue() {
    setBusy(true); setMsg(undefined);
    const res = await issueCredential(stationId, d.deviceId).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setMsg(res.message);
    setNewSecret(res.secret);
  }

  async function doRevoke() {
    if (!reason.trim()) return;
    setBusy(true); setMsg(undefined);
    const res = await revokeDevice(d.deviceId, reason.trim()).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setMsg(res.message);
    close();
    onChanged();
  }

  return (
    <tr>
      <td className="p-2">
        <p className="font-semibold">{d.label || "بلا اسم"}</p>
        <p dir="ltr" className="text-body-small-12 text-text-muted">{d.deviceId}</p>
      </td>
      <td className="p-2"><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></td>
      <td className="p-2 text-text-secondary">
        <span className={stale ? "text-status-warning-700" : undefined}>{d.lastSyncAt ? timeAgo(d.lastSyncAt, now) : "لم يتزامن بعد"}</span>
      </td>
      <td className="p-2 text-text-secondary">{d.pendingOps}</td>
      <td className="p-2 text-end">
        <div className="relative inline-block">
          <button type="button" onClick={() => (open ? close() : setOpen(true))} aria-label="خيارات" className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted">⋯</button>
          {open && (
            <div className="absolute end-0 z-10 mt-1 w-72 rounded-md border border-border-default bg-surface-card p-3 text-start shadow-raised">
              {mode === "menu" && (
                <div className="flex flex-col gap-1">
                  <button type="button" className="rounded-sm px-2 py-1.5 text-start text-body-small-12 hover:bg-surface-muted" onClick={() => setMode("reissue")}>
                    إعادة إصدار الرمز
                  </button>
                  <button type="button" className="rounded-sm px-2 py-1.5 text-start text-body-small-12 text-status-danger-700 hover:bg-surface-muted" onClick={() => setMode("revoke")}>
                    إبطال الجهاز
                  </button>
                </div>
              )}
              {mode === "reissue" && !newSecret && (
                <div className="flex flex-col gap-2">
                  <p className="text-body-small-12 text-status-warning-700">الرمز القديم سيتوقف فوراً — هذا الجهاز يحتاج الرمز الجديد ليعمل من جديد.</p>
                  {msg && <p className="text-body-small-12 text-status-danger-700">{msg}</p>}
                  <div className="flex gap-2">
                    <Button variant="action" size="md" disabled={busy} onClick={doReissue}>{busy ? "…" : "تأكيد"}</Button>
                    <Button variant="ghost" size="md" onClick={close}>إلغاء</Button>
                  </div>
                </div>
              )}
              {mode === "revoke" && (
                <div className="flex flex-col gap-2">
                  <TextArea label="سبب الإبطال" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: ضاع الجهاز" />
                  {msg && <p className="text-body-small-12 text-status-danger-700">{msg}</p>}
                  <div className="flex gap-2">
                    <Button variant="danger" size="md" disabled={busy || !reason.trim()} onClick={doRevoke}>{busy ? "…" : "تأكيد الإبطال"}</Button>
                    <Button variant="ghost" size="md" onClick={close}>إلغاء</Button>
                  </div>
                </div>
              )}
              {newSecret && <NewSecretPanel deviceId={d.deviceId} secret={newSecret} copied={copied} onCopy={() => setCopied(true)} onDone={() => { close(); onChanged(); }} />}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Shown once, right after issue_device_credential() returns — the server never gives the secret back again. */
function NewSecretPanel({ deviceId, secret, copied, onCopy, onDone }: {
  deviceId: string; secret: string; copied: boolean; onCopy: () => void; onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <AlertBanner tone="success" title="جاهز">انسخ البيانات الآن وأدخلها في «إعداد الجهاز» بتطبيق العامل — لن تظهر مرة أخرى.</AlertBanner>
      <Field label="معرّف الجهاز" value={deviceId} />
      <Field label="الرمز السري" value={secret} />
      <div className="flex gap-2">
        <Button variant="secondary" size="md" onClick={() => { navigator.clipboard?.writeText(`${deviceId}\n${secret}`); onCopy(); }}>
          {copied ? "تم النسخ ✓" : "نسخ الاثنين"}
        </Button>
        <Button variant="action" size="md" onClick={onDone}>تم</Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-label-11 text-text-secondary">{label}</p>
      <p dir="ltr" className="break-all rounded-md bg-surface-muted p-2 font-mono text-body-small-12">{value}</p>
    </div>
  );
}

function RegisterDeviceModal({ stationId, onClose, onDone }: { stationId: string; onClose: () => void; onDone: () => void }) {
  const [label, setLabel] = useState("");
  const [deviceId] = useState(() => generateDeviceId());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const [copied, setCopied] = useState(false);

  async function save() {
    setBusy(true); setError(undefined);
    const res = await issueCredential(stationId, deviceId, label.trim() || undefined)
      .catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setSecret(res.secret);
  }

  if (secret) {
    return (
      <Modal title="تسجيل جهاز" onClose={onDone}>
        <NewSecretPanel deviceId={deviceId} secret={secret} copied={copied} onCopy={() => setCopied(true)} onDone={onDone} />
      </Modal>
    );
  }

  return (
    <Modal title="تسجيل جهاز" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <AlertBanner tone="danger" title={error} />}
        <Input label="اسم الجهاز (اختياري)" autoComplete="off" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثلاً: تابلت المضخة 3" />
        <Field label="معرّف الجهاز (يُولَّد تلقائياً)" value={deviceId} />
        <div className="flex gap-2">
          <Button variant="action" size="lg" block disabled={busy} onClick={save}>{busy ? "جارٍ التسجيل…" : "تسجيل"}</Button>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- users & permissions ----------
function UsersTab({ data, canManage, stationId, stationName, userId, now, onChanged }: {
  data: SettingsData; canManage: boolean; stationId: string; stationName: string; userId: string; now: number; onChanged: () => void;
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
              <th className="p-2 text-start font-normal">آخر دخول</th>
              <th className="p-2 text-start font-normal">الحالة</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {shown.map((m) => <MemberRowView key={m.userId} m={m} canManage={canManage} self={isSelfRow(m.userId, userId)} stationId={stationId} stationName={stationName} now={now} onChanged={onChanged} />)}
          </tbody>
        </table>
        {shown.length === 0 && <p className="p-4 text-center text-body-regular-14 text-text-secondary">لا نتائج.</p>}
      </section>
    </div>
  );
}

function MemberRowView({ m, canManage, self, stationId, stationName, now, onChanged }: {
  m: MemberRow; canManage: boolean; self: boolean; stationId: string; stationName: string; now: number; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [pin, setPin] = useState("");
  const [freshLink, setFreshLink] = useState<Login>();
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const badge = statusBadge(m.status);

  async function run(fn: () => Promise<Outcome>) {
    setBusy(true); setMsg(undefined);
    const res = await fn().catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    if (res.ok) { setOpen(false); onChanged(); return; }
    setMsg(res.message); setBusy(false);
  }

  async function getFreshLink() {
    if (!resendEmail.trim()) return;
    setBusy(true); setMsg(undefined);
    const res = await resendInviteLink({ stationId, role: m.role, displayName: m.name, email: resendEmail.trim() })
      .catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setMsg(res.message);
    if (res.login) setFreshLink(res.login); else setMsg("هذا الحساب دخل من قبل — استخدم «نسيت كلمة المرور»");
  }

  return (
    <tr>
      <td className="p-2">{m.name}</td>
      <td className="p-2"><StatusBadge tone="info">{ROLE_LABEL[m.role]}</StatusBadge></td>
      <td className="p-2 text-text-secondary">{m.lastSignInAt ? timeAgo(m.lastSignInAt, now) : "لم يسجّل الدخول بعد"}</td>
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
                  {m.status === "invited" && !resending && (
                    <button type="button" onClick={() => setResending(true)} className="rounded-sm px-2 py-1.5 text-start text-body-small-12 hover:bg-surface-muted">
                      رابط جديد
                    </button>
                  )}
                  {resending && !freshLink && (
                    <div className="mt-1 border-t border-border-default pt-2">
                      <p className="px-2 text-body-small-12 text-text-secondary">أدخل البريد الذي دُعي به لإصدار رابط جديد</p>
                      <div className="mt-1 flex gap-1 px-2">
                        <input value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} dir="ltr" placeholder="email@example.com"
                          className="h-8 flex-1 rounded-md border border-border-default bg-surface-card px-2 text-body-regular-14" />
                        <Button variant="secondary" size="md" disabled={busy || !resendEmail.trim()} onClick={getFreshLink}>إنشاء</Button>
                      </div>
                    </div>
                  )}
                  {freshLink && <div className="mt-1 border-t border-border-default px-2 pt-2"><JoinLinkCard login={freshLink} stationName={stationName} /></div>}
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

// ---------- المحطة: الموقع ----------
function LocationTab({ stationId, canManage }: { stationId: string; canManage: boolean }) {
  const [loc, setLoc] = useState<Location>();
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    loadLocation(stationId).then((l) => { setLoc(l); setLat(l.lat?.toString() ?? ""); setLng(l.lng?.toString() ?? ""); });
  }, [stationId]);

  if (!loc) return <span className="block h-40 animate-pulse rounded-lg bg-surface-muted" />;

  async function save() {
    setBusy(true); setMsg(undefined);
    const bothEmpty = !lat.trim() && !lng.trim();
    const latNum = bothEmpty ? null : Number(lat);
    const lngNum = bothEmpty ? null : Number(lng);
    if (!bothEmpty && (Number.isNaN(latNum) || Number.isNaN(lngNum))) { setMsg("أدخل إحداثيتين صحيحتين، أو اترك الحقلين فارغين"); setBusy(false); return; }
    const res = await updateLocation(stationId, latNum, lngNum).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (res.ok) { setLoc({ lat: latNum, lng: lngNum }); return; }
    setMsg(res.message);
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
      <h2 className="text-heading-h2-20">موقع المحطة</h2>
      <p className="text-body-small-12 text-text-secondary">يظهر للزبائن على خريطة الأسعار العامة. اتركهما فارغين لإخفاء الموقع.</p>
      {!canManage && <AlertBanner tone="info" title="التعديل متاح لصاحب المحطة فقط" />}
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="خط العرض (Latitude)" dir="ltr" disabled={!canManage} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="33.5138" />
        <Input label="خط الطول (Longitude)" dir="ltr" disabled={!canManage} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="36.2765" />
      </div>
      {msg && <AlertBanner tone="danger" title={msg} />}
      {canManage && <Button variant="action" disabled={busy} onClick={save}>{busy ? "جارٍ الحفظ…" : "حفظ الموقع"}</Button>}
    </section>
  );
}

// ---------- المكافآت ----------
function RewardsTab({ stationId, canManage, currency }: { stationId: string; canManage: boolean; currency: string }) {
  const [data, setData] = useState<RewardsSettings>();
  const [tick, setTick] = useState(0);
  const [pointValue, setPointValueInput] = useState("");
  const [tierPoints, setTierPoints] = useState("");
  const [tierTitle, setTierTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    loadRewardsSettings(stationId).then((d) => { setData(d); setPointValueInput(d.pointValue !== null ? String(d.pointValue) : ""); });
  }, [stationId, tick]);

  function refresh() { setTick((t) => t + 1); }
  async function run(fn: () => Promise<Outcome>) {
    setBusy(true); setMsg(undefined);
    const res = await fn().catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (res.ok) return refresh();
    setMsg(res.message);
  }

  if (!data) return <span className="block h-64 animate-pulse rounded-lg bg-surface-muted" />;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
        <h2 className="text-heading-h2-20">قيمة النقطة</h2>
        <p className="text-body-small-12 text-text-secondary">ما تساويه نقطة واحدة نقداً في هذه المحطة — تظهر للزبون كـ«≈» فقط بعد تحديدها.</p>
        {!canManage && <AlertBanner tone="info" title="التعديل متاح لصاحب المحطة فقط" />}
        <div className="flex items-end gap-2">
          <Input label="قيمة النقطة" suffix={currency} dir="ltr" disabled={!canManage} inputMode="decimal" value={pointValue} onChange={(e) => setPointValueInput(e.target.value)} />
          {canManage && (
            <Button variant="action" disabled={busy || !pointValue.trim() || Number(pointValue) <= 0} onClick={() => run(() => setPointValue(stationId, Number(pointValue)))}>
              حفظ
            </Button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
        <h2 className="text-heading-h2-20">درجات المكافآت</h2>
        {msg && <AlertBanner tone="danger" title={msg} />}
        <ul className="flex flex-col divide-y divide-border-default">
          {data.tiers.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2.5 text-body-regular-14">
              <span>{t.title} — {t.pointsThreshold} نقطة</span>
              {canManage && (
                <Button variant="ghost" size="md" disabled={busy} onClick={() => run(() => setTierActive(t.id, !t.isActive))}>
                  {t.isActive ? "إخفاء" : "إظهار"}
                </Button>
              )}
              {!canManage && <StatusBadge tone={t.isActive ? "success" : "neutral"}>{t.isActive ? "ظاهرة" : "مخفية"}</StatusBadge>}
            </li>
          ))}
          {data.tiers.length === 0 && <p className="py-2 text-body-regular-14 text-text-secondary">لا توجد درجات بعد.</p>}
        </ul>
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <Input label="عدد النقاط" dir="ltr" inputMode="numeric" value={tierPoints} onChange={(e) => setTierPoints(e.target.value)} className="w-32" />
            <Input label="اسم المكافأة" value={tierTitle} onChange={(e) => setTierTitle(e.target.value)} className="flex-1" />
            <Button variant="secondary" disabled={busy || !tierPoints.trim() || !tierTitle.trim()}
              onClick={() => run(() => addRewardTier(stationId, Number(tierPoints), tierTitle.trim())).then(() => { setTierPoints(""); setTierTitle(""); })}>
              إضافة
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
        <h2 className="text-heading-h2-20">أكواد العروض</h2>
        <p className="text-body-small-12 text-text-secondary">أحرف إنجليزية كبيرة وأرقام وشرطة، من 3 إلى 20 رمزاً.</p>
        <ul className="flex flex-col gap-2">
          {data.offers.map((o) => <OfferCodeRow key={o.id} offer={o} canManage={canManage} onChanged={refresh} />)}
          {data.offers.length === 0 && <p className="text-body-regular-14 text-text-secondary">لا توجد عروض بعد.</p>}
        </ul>
      </section>
    </div>
  );
}

function OfferCodeRow({ offer, canManage, onChanged }: { offer: RewardsSettings["offers"][number]; canManage: boolean; onChanged: () => void }) {
  const [code, setCode] = useState(offer.code ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  async function save() {
    setBusy(true); setMsg(undefined);
    const res = await setOfferCode(offer.id, code.trim() || null).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (res.ok) return onChanged();
    setMsg(res.message);
  }

  return (
    <li className="flex flex-wrap items-end gap-2 rounded-md bg-surface-muted p-3">
      <div className="flex-1">
        <p className="text-body-strong-14">{offer.title}</p>
        <p className="text-body-small-12 text-text-secondary">ينتهي {formatDay(offer.endsAt)}</p>
        {msg && <p className="text-body-small-12 text-status-danger-700">{msg}</p>}
      </div>
      <Input label="الكود" dir="ltr" disabled={!canManage} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="w-40" />
      {canManage && <Button variant="secondary" size="md" disabled={busy || code === (offer.code ?? "")} onClick={save}>{busy ? "…" : "حفظ"}</Button>}
    </li>
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
