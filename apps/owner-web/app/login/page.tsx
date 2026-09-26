"use client";
// L1 — دخول المكتب (design/screens/L1.png): owner, accountant, shift manager (platform admin later).
// Email or phone + password, or a one-time code (OTP). Accounts are invited by the owner: no sign-up here.
import { AUTH_NETWORK_MESSAGE, authErrorMessage } from "@fuelos/core";
import { AlertBanner, Button, cx, Input } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { parseIdentifier, type Identifier } from "@/lib/identifier";
import { officeAccess } from "@/lib/office";
import { setRememberDevice, supabase } from "@/lib/supabase";

type Mode = "password" | "otp-request" | "otp-verify" | "forgot";
const RESEND_SECONDS = 60;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [who, setWho] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [otpTarget, setOtpTarget] = useState<Identifier>();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  // already signed in with office access → straight to the dashboard
  useEffect(() => {
    officeAccess().then((a) => { if (a.kind === "office") router.replace("/dashboard"); });
  }, [router]);

  // countdown for «أعد إرسال الرمز»
  useEffect(() => {
    if (resendAt <= now) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [resendAt, now]);

  const id = parseIdentifier(who);
  const whoError = who.trim() !== "" && !id ? "أدخل بريداً إلكترونياً صحيحاً أو رقم هاتف (09… أو +963…)" : undefined;

  function switchMode(next: Mode) {
    setMode(next);
    setError(undefined);
    setInfo(undefined);
    setCode("");
  }

  /** Runs `fn` once at a time (a double click must not send two requests). */
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

  /** After Supabase signed the user in: only office roles may stay. */
  async function afterSignIn() {
    const access = await officeAccess();
    if (access.kind === "office") return router.replace("/dashboard");
    await supabase().auth.signOut({ scope: "local" });
    setError(
      access.kind === "attendant-only" ? "هذا حساب عامل — العمال يدخلون من تطبيق العامل برمز PIN"
      : access.kind === "none" ? "هذا الحساب غير مرتبط بمحطة — اطلب من صاحب المحطة دعوتك"
      : "تعذّر التحقق من صلاحياتك — حاول مرة أخرى",
    );
  }

  const signInWithPassword = (e: FormEvent) => {
    e.preventDefault();
    if (!id || !password) return;
    void once(async () => {
      setRememberDevice(remember);
      const { error: err } = id.kind === "email"
        ? await supabase().auth.signInWithPassword({ email: id.value, password })
        : await supabase().auth.signInWithPassword({ phone: id.value, password });
      if (err) return setError(authErrorMessage(err));
      await afterSignIn();
    });
  };

  const requestOtp = (e?: FormEvent) => {
    e?.preventDefault();
    if (!id) return;
    void once(async () => {
      setRememberDevice(remember);
      const { error: err } = id.kind === "email"
        ? await supabase().auth.signInWithOtp({ email: id.value, options: { shouldCreateUser: false } })
        : await supabase().auth.signInWithOtp({ phone: id.value, options: { shouldCreateUser: false } });
      if (err) return setError(authErrorMessage(err));
      setOtpTarget(id);
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setNow(Date.now());
      setMode("otp-verify");
      setInfo(id.kind === "email" ? `أرسلنا رمزاً إلى ${id.value}` : `أرسلنا رمزاً برسالة نصية إلى ${id.value}`);
    });
  };

  const verifyOtp = (e: FormEvent) => {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (!otpTarget || token.length < 6) return;
    void once(async () => {
      const { error: err } = otpTarget.kind === "email"
        ? await supabase().auth.verifyOtp({ email: otpTarget.value, token, type: "email" })
        : await supabase().auth.verifyOtp({ phone: otpTarget.value, token, type: "sms" });
      if (err) return setError(authErrorMessage(err));
      await afterSignIn();
    });
  };

  const sendReset = (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (id.kind !== "email") return setError("إعادة تعيين كلمة المرور متاحة بالبريد فقط — أو استخدم الدخول برمز لمرة واحدة");
    void once(async () => {
      const { error: err } = await supabase().auth.resetPasswordForEmail(id.value, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) return setError(authErrorMessage(err));
      setInfo("إن كان البريد مسجّلاً، ستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة.");
    });
  };

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  return (
    <div className="flex min-h-dvh">
      <main className="flex flex-1 items-center justify-center p-4 lg:p-8">
        <section className="w-full max-w-[420px] rounded-xl border border-border-default bg-surface-card p-8 shadow-raised">
          <div className="flex items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-md bg-brand-action text-brand-on-action"><PumpIcon /></span>
            <span className="text-heading-h2-20">FuelOS</span>
          </div>
          <h1 className="mt-6 text-display-32">
            {mode === "forgot" ? "نسيت كلمة المرور" : mode === "otp-verify" ? "أدخل الرمز" : "تسجيل الدخول"}
          </h1>
          <p className="mt-1 text-body-regular-14 text-text-secondary">
            {mode === "forgot" ? "نرسل لك رابطاً لتعيين كلمة مرور جديدة"
              : mode === "otp-verify" ? "الرمز صالح لدقائق قليلة"
              : "لصاحب المحطة والمحاسب ومدير المناوبة"}
          </p>

          {error && <AlertBanner tone="danger" className="mt-4" title={error} />}
          {info && <AlertBanner tone="success" className="mt-4" title={info} />}

          {mode === "password" && (
            <form onSubmit={signInWithPassword} className="mt-6 flex flex-col gap-4" noValidate>
              <Input label="البريد الإلكتروني أو رقم الهاتف" dir="ltr" autoComplete="username" inputMode="email"
                value={who} onChange={(e) => setWho(e.target.value)} error={whoError} placeholder="owner@example.com" />
              <Input label="كلمة المرور" type="password" dir="ltr" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-body-regular-14">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                    className="size-4 accent-[var(--color-brand-primary)]" />
                  تذكّر هذا الجهاز
                </label>
                <button type="button" onClick={() => switchMode("forgot")} className="text-body-strong-14 text-brand-primary">
                  نسيت كلمة المرور؟
                </button>
              </div>
              <Button type="submit" variant="primary" size="lg" block disabled={!id || !password || busy}>
                {busy ? "جارٍ الدخول…" : "دخول"}
              </Button>
              <Divider />
              <Button variant="secondary" block onClick={() => switchMode("otp-request")}>
                <PhoneIcon /> الدخول برمز لمرة واحدة (OTP)
              </Button>
            </form>
          )}

          {mode === "otp-request" && (
            <form onSubmit={requestOtp} className="mt-6 flex flex-col gap-4" noValidate>
              <Input label="البريد الإلكتروني أو رقم الهاتف" dir="ltr" autoComplete="username"
                value={who} onChange={(e) => setWho(e.target.value)} error={whoError}
                helper="نرسل رمزاً من 6 أرقام إلى بريدك أو هاتفك" />
              <label className="flex items-center gap-2 text-body-regular-14">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                  className="size-4 accent-[var(--color-brand-primary)]" />
                تذكّر هذا الجهاز
              </label>
              <Button type="submit" variant="primary" size="lg" block disabled={!id || busy}>
                {busy ? "جارٍ الإرسال…" : "أرسل الرمز"}
              </Button>
              <Button variant="ghost" block onClick={() => switchMode("password")}>الدخول بكلمة المرور</Button>
            </form>
          )}

          {mode === "otp-verify" && (
            <form onSubmit={verifyOtp} className="mt-6 flex flex-col gap-4" noValidate>
              <Input label="الرمز" size="lg" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={8}
                value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••••" />
              <Button type="submit" variant="primary" size="lg" block disabled={code.replace(/\D/g, "").length < 6 || busy}>
                {busy ? "جارٍ التحقق…" : "دخول"}
              </Button>
              <div className="flex items-center justify-between text-body-regular-14">
                <button type="button" onClick={() => switchMode("otp-request")} className="text-text-secondary">تغيير البريد أو الهاتف</button>
                <button type="button" disabled={secondsLeft > 0 || busy} onClick={() => requestOtp()}
                  className={cx("text-body-strong-14", secondsLeft > 0 ? "text-text-muted" : "text-brand-primary")}>
                  {secondsLeft > 0 ? `أعد الإرسال بعد ${secondsLeft} ث` : "أعد إرسال الرمز"}
                </button>
              </div>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={sendReset} className="mt-6 flex flex-col gap-4" noValidate>
              <Input label="البريد الإلكتروني" dir="ltr" autoComplete="username" inputMode="email"
                value={who} onChange={(e) => setWho(e.target.value)} error={whoError} />
              <Button type="submit" variant="primary" size="lg" block disabled={!id || busy}>
                {busy ? "جارٍ الإرسال…" : "أرسل رابط إعادة التعيين"}
              </Button>
              <Button variant="ghost" block onClick={() => switchMode("password")}>رجوع إلى الدخول</Button>
            </form>
          )}

          <p className="mt-6 flex items-start gap-2 rounded-md bg-surface-muted p-3 text-body-small-12 text-text-secondary">
            <InfoIcon /> عمال المحطة يدخلون من تطبيق العامل برمز PIN على الجهاز المسجّل.
          </p>
        </section>
      </main>

      <aside className="hidden w-[43%] flex-col justify-center bg-brand-dark px-16 text-text-on-dark lg:flex">
        <p className="text-label-12 text-brand-action">FuelOS · نظام تشغيل محطة الوقود</p>
        <h2 className="mt-4 text-display-32">ضبط مالي وتشغيلي لمحطتك — دون أجهزة جديدة.</h2>
        <ul className="mt-8 flex flex-col gap-3 text-body-large-16 text-text-on-dark-muted">
          {["كل عملية بيع أو توريد أو مصروف تتحول إلى قيد قابل للتتبع",
            "إغلاق مناوبة بثلاث خطوات ومقارنة فورية للصندوق",
            "تطبيق زبائن يعرض الأسعار والفواتير والنقاط"].map((t) => (
            <li key={t} className="flex items-center gap-3">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand-action" />{t}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-body-small-12 text-text-muted">
      <span className="h-px flex-1 bg-border-default" />أو<span className="h-px flex-1 bg-border-default" />
    </div>
  );
}

const svg = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
function PumpIcon() {
  return <svg {...svg} width="22" height="22" viewBox="0 0 24 24"><path d="M3 22h12M4 9h10M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" /></svg>;
}
function PhoneIcon() {
  return <svg {...svg} width="18" height="18" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>;
}
function InfoIcon() {
  return <svg {...svg} width="16" height="16" viewBox="0 0 24 24" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>;
}
