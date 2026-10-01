"use client";
// A2 — انضمام محطة جديدة (design/screens/A2.png). Owner decision (docs/briefs/06a): the platform admin creates
// the station and shares a one-time join link with the owner — no self sign-up. onboard-station does the real
// work (organization + station + active owner + catalog defaults + trial subscription); nothing is emailed.
import { AlertBanner, Button, Input } from "@fuelos/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createStation, joinLink, loadPlans, whatsappShareUrl, type CreateStationResult, type Login, type PlanOption } from "@/lib/onboarding-data";

export default function NewStationPage() {
  const [plans, setPlans] = useState<PlanOption[]>();
  const [stationName, setStationName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [city, setCity] = useState("");
  const [currency, setCurrency] = useState("SYP");
  const [planId, setPlanId] = useState("");
  const [trialDays, setTrialDays] = useState("14");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ stationId: string; stationName: string; login: Login | null; ownerNew: boolean }>();

  useEffect(() => { loadPlans().then(setPlans); }, []);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim());
  const canSubmit = stationName.trim() && ownerName.trim() && emailValid && !busy;

  async function submit() {
    setBusy(true); setError(undefined);
    const latNum = lat.trim() ? Number(lat) : null;
    const lngNum = lng.trim() ? Number(lng) : null;
    const res: CreateStationResult = await createStation({
      stationName: stationName.trim(), ownerName: ownerName.trim(), ownerEmail: ownerEmail.trim(),
      orgName: orgName.trim() || null, currency, city: city.trim() || null, planId: planId || null,
      trialDays: Number(trialDays) || 0, lat: latNum, lng: lngNum,
    }).catch(() => ({ ok: false as const, message: "لا يوجد اتصال بالخادم" }));
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setResult({ stationId: res.stationId, stationName: stationName.trim(), login: res.login, ownerNew: !!res.login });
  }

  function reset() {
    setResult(undefined);
    setStationName(""); setOwnerName(""); setOwnerEmail(""); setOrgName(""); setCity("");
    setPlanId(""); setTrialDays("14"); setLat(""); setLng("");
  }

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <header>
        <h1 className="text-display-32">انضمام محطة جديدة</h1>
        <p className="text-body-regular-14 text-text-secondary">أنشئ المحطة، ثم شارك رابط الدخول مع صاحبها — لا يُرسل شيء بالبريد</p>
      </header>

      {result ? (
        <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
          <AlertBanner tone="success" title={`أُنشئت محطة «${result.stationName}»`}>
            {result.login ? "شارك هذا الرابط مع صاحب المحطة ليدخل ويختار كلمة مرور. صالح لنحو ساعة."
              : "صاحب المحطة يملك حساباً على FuelOS بالفعل — سيرى المحطة الجديدة عند دخوله المعتاد."}
          </AlertBanner>
          {result.login && (
            <div className="flex flex-col gap-2 rounded-md bg-surface-muted p-3">
              <p dir="ltr" className="break-all text-body-small-12 text-text-secondary">{joinLink(result.login)}</p>
              <div className="flex gap-2">
                <CopyButton text={joinLink(result.login)} />
                <a href={whatsappShareUrl(joinLink(result.login), result.stationName)} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="md">إرسال عبر واتساب</Button>
                </a>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Link href={`/stations/${result.stationId}`}><Button variant="action">تجهيز المعدات الآن</Button></Link>
            <Button variant="secondary" onClick={reset}>إنشاء محطة أخرى</Button>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-4 rounded-lg bg-surface-card p-6 shadow-card">
          {error && <AlertBanner tone="danger" title={error} />}
          <Input label="اسم المحطة" autoComplete="off" value={stationName} onChange={(e) => setStationName(e.target.value)} />
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="اسم المالك" autoComplete="off" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            <Input label="بريد المالك" dir="ltr" type="email" autoComplete="off" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)}
              helper="لبناء رابط الدخول — لن يُرسل بريد فعلي" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Input label="اسم المؤسسة (اختياري)" autoComplete="off" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            <Input label="المدينة (اختياري)" autoComplete="off" value={city} onChange={(e) => setCity(e.target.value)} />
            <Input label="العملة" dir="ltr" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-label-12 text-text-secondary">الباقة (اختياري — بلا اشتراك تجربة إن تُركت فارغة)</label>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="h-11 rounded-md border border-border-strong bg-surface-card px-3 text-body-large-16">
                <option value="">بلا باقة الآن</option>
                {plans?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <Input label="أيام التجربة" dir="ltr" inputMode="numeric" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} helper="0 إلى 90 يوماً" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="خط العرض (اختياري)" dir="ltr" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
            <Input label="خط الطول (اختياري)" dir="ltr" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>
          <Button variant="action" size="lg" disabled={!canSubmit} onClick={submit}>{busy ? "جارٍ الإنشاء…" : "إنشاء المحطة"}</Button>
        </section>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button variant="secondary" size="md" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); }}>
      {copied ? "تم النسخ ✓" : "نسخ الرابط"}
    </Button>
  );
}
