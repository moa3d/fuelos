"use client";
// L3 — دخول الزبون (design/screens/L3.png showed a phone SMS code; email OTP replaced that, and email OTP is
// now replaced by this — email + password, two tabs «دخول» / «حساب جديد» — owner's decision 2026-10-03, since
// OTP email delivery stayed unreliable with no SMTP provider configured, docs/briefs/04d). «نسيت كلمة المرور»
// is intentionally not here yet — a later addition.
import { AUTH_NETWORK_MESSAGE, authErrorMessage } from "@fuelos/core";
import { AlertBanner, Button, Input } from "@fuelos/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { customerAccess, ensureCustomerRow } from "@/lib/customer-access";
import { supabase } from "@/lib/supabase";

type Tab = "signin" | "signup";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// authErrorMessage's shared "signup_disabled" wording is written for the invite-only office apps ("اطلب من
// صاحب المحطة دعوتك") — wrong here, where self sign-up is the whole point. "user_already_exists" isn't in the
// shared map at all yet (only this screen can hit it).
const SIGNUP_LOCAL: Record<string, string> = {
  signup_disabled: "إنشاء الحسابات غير متاح حالياً — تواصل مع فريق FuelOS",
  user_already_exists: "هذا البريد مسجَّل مسبقاً — سجّل الدخول بدلاً من ذلك",
};

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const inFlight = useRef(false);

  // already signed in → straight to the home screen
  useEffect(() => {
    customerAccess().then((a) => { if (a.kind === "customer") router.replace("/"); });
  }, [router]);

  const emailValid = EMAIL_RE.test(email.trim());
  const emailError = email.trim() !== "" && !emailValid ? "أدخل بريداً إلكترونياً صحيحاً" : undefined;
  const passwordError = tab === "signup" && password !== "" && password.length < MIN_PASSWORD
    ? `كلمة المرور يجب أن تكون ${MIN_PASSWORD} أحرف على الأقل` : undefined;
  const confirmError = tab === "signup" && confirm !== "" && confirm !== password ? "كلمتا المرور غير متطابقتين" : undefined;
  const signupReady = emailValid && password.length >= MIN_PASSWORD && password === confirm;

  function switchTab(next: Tab) {
    setTab(next);
    setError(undefined);
    setInfo(undefined);
    setPassword("");
    setConfirm("");
  }

  async function once(fn: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    try {
      await fn();
    } catch {
      setError(navigator.onLine ? authErrorMessage(null) : AUTH_NETWORK_MESSAGE);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const signIn = (e: FormEvent) => {
    e.preventDefault();
    if (!emailValid || !password) return;
    void once(async () => {
      const { data, error: err } = await supabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (err) return setError(authErrorMessage(err));
      if (data.user) await ensureCustomerRow(data.user.id);
      router.replace("/");
    });
  };

  const signUp = (e: FormEvent) => {
    e.preventDefault();
    if (!signupReady) return;
    void once(async () => {
      const { data, error: err } = await supabase().auth.signUp({ email: email.trim().toLowerCase(), password });
      if (err) return setError(SIGNUP_LOCAL[err.code ?? ""] ?? authErrorMessage(err));
      // Supabase answers an email that's already fully registered with a "success" carrying no identities,
      // rather than an error — the only way to tell it apart from a genuinely new account.
      if (data.user && data.user.identities?.length === 0) return setError(SIGNUP_LOCAL.user_already_exists);
      if (!data.session) {
        // the project requires confirming the email before a session is issued
        setInfo("أنشأنا حسابك — افتح رسالة التأكيد في بريدك لتفعيله، ثم سجّل الدخول.");
        return;
      }
      if (data.user) await ensureCustomerRow(data.user.id);
      router.replace("/");
    });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-between p-6">
      <div>
        <div className="flex items-center justify-between">
          <Link href="/" className="text-body-strong-14 text-brand-primary">تصفّح المحطات دون حساب ‹</Link>
        </div>

        <div className="mt-8 flex items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-md bg-brand-action text-brand-on-action"><PumpIcon /></span>
          <span className="text-heading-h2-20">FuelOS</span>
        </div>

        <h1 className="mt-6 text-display-32">{tab === "signin" ? "تسجيل الدخول" : "حساب جديد"}</h1>

        <div role="tablist" aria-label="الدخول أو إنشاء حساب" className="mt-6 flex overflow-hidden rounded-full border border-border-default">
          <button type="button" role="tab" aria-selected={tab === "signin"} onClick={() => switchTab("signin")}
            className={`h-10 flex-1 text-body-strong-14 ${tab === "signin" ? "bg-brand-primary text-white" : "bg-surface-card text-text-secondary"}`}>
            دخول
          </button>
          <button type="button" role="tab" aria-selected={tab === "signup"} onClick={() => switchTab("signup")}
            className={`h-10 flex-1 text-body-strong-14 ${tab === "signup" ? "bg-brand-primary text-white" : "bg-surface-card text-text-secondary"}`}>
            حساب جديد
          </button>
        </div>

        {error && <AlertBanner tone="danger" className="mt-4" title={error} />}
        {info && <AlertBanner tone="success" className="mt-4" title={info} />}

        {tab === "signin" ? (
          <form onSubmit={signIn} className="mt-6 flex flex-col gap-4" noValidate>
            <Input label="البريد الإلكتروني" dir="ltr" autoComplete="email" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} placeholder="you@example.com" />
            <Input label="كلمة المرور" type="password" dir="ltr" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" variant="action" size="lg" block disabled={!emailValid || !password || busy}>
              {busy ? "جارٍ الدخول…" : "دخول"}
            </Button>
          </form>
        ) : (
          <form onSubmit={signUp} className="mt-6 flex flex-col gap-4" noValidate>
            <Input label="البريد الإلكتروني" dir="ltr" autoComplete="email" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} placeholder="you@example.com" />
            <Input label="كلمة المرور" type="password" dir="ltr" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} error={passwordError}
              helper={passwordError ? undefined : `${MIN_PASSWORD} أحرف على الأقل`} />
            <Input label="تأكيد كلمة المرور" type="password" dir="ltr" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirmError} />
            <Button type="submit" variant="action" size="lg" block disabled={!signupReady || busy}>
              {busy ? "جارٍ الإنشاء…" : "إنشاء الحساب"}
            </Button>
          </form>
        )}

        <div className="mt-6 rounded-md bg-brand-primary-50 p-4 text-body-regular-14">
          <p className="text-body-strong-14">لماذا حساب؟</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-text-secondary">
            <li>· كل فواتير التعبئة في مكان واحد</li>
            <li>· نقاط ولاء من الفواتير المؤكدة فقط</li>
            <li>· مصروف سيارتك الشهري بلغة بسيطة</li>
          </ul>
        </div>
      </div>

      <p className="mt-6 text-center text-body-small-12 text-text-muted">بالمتابعة توافق على الشروط وسياسة الخصوصية</p>
    </div>
  );
}

function PumpIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 22h12M4 9h10M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" />
    </svg>
  );
}
