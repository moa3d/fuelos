"use client";
// L3 — دخول الزبون (design/screens/L3.png). The design shows a phone SMS code; this build uses EMAIL OTP
// instead — phone OTP needs an SMS provider configured in the Supabase project (a Cowork/dashboard step),
// which isn't set up yet. Unlike office login (L1, invite-only), a customer may not have an account yet:
// signInWithOtp() here is allowed to create one (no `shouldCreateUser: false`).
import { AUTH_NETWORK_MESSAGE, authErrorMessage } from "@fuelos/core";
import { AlertBanner, Button, Input } from "@fuelos/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { customerAccess, ensureCustomerRow } from "@/lib/customer-access";
import { supabase } from "@/lib/supabase";

type Mode = "request" | "verify";
const RESEND_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  // already signed in → straight to the home screen
  useEffect(() => {
    customerAccess().then((a) => { if (a.kind === "customer") router.replace("/"); });
  }, [router]);

  useEffect(() => {
    if (resendAt <= now) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [resendAt, now]);

  const emailValid = EMAIL_RE.test(email.trim());
  const emailError = email.trim() !== "" && !emailValid ? "أدخل بريداً إلكترونياً صحيحاً" : undefined;

  async function once(fn: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch {
      setError(navigator.onLine ? authErrorMessage(null) : AUTH_NETWORK_MESSAGE);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const requestCode = (e?: FormEvent) => {
    e?.preventDefault();
    if (!emailValid) return;
    void once(async () => {
      const { error: err } = await supabase().auth.signInWithOtp({ email: email.trim().toLowerCase() });
      if (err) return setError(authErrorMessage(err));
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setNow(Date.now());
      setMode("verify");
    });
  };

  const verifyCode = (e: FormEvent) => {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length < 6) return;
    void once(async () => {
      const { data, error: err } = await supabase().auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: "email" });
      if (err) return setError(authErrorMessage(err));
      if (data.user) await ensureCustomerRow(data.user.id);
      router.replace("/");
    });
  };

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

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

        <h1 className="mt-6 text-display-32">{mode === "request" ? "تسجيل الدخول" : "أدخل رمز التحقق"}</h1>
        <p className="mt-1 text-body-regular-14 text-text-secondary">
          {mode === "request" ? "أدخل بريدك الإلكتروني لنرسل لك رمز تحقق" : `أرسلنا رمزاً من 6 أرقام إلى ${email}`}
        </p>

        {error && <AlertBanner tone="danger" className="mt-4" title={error} />}

        {mode === "request" && (
          <form onSubmit={requestCode} className="mt-6 flex flex-col gap-4" noValidate>
            <Input label="البريد الإلكتروني" dir="ltr" autoComplete="email" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} placeholder="you@example.com" />
            <Button type="submit" variant="action" size="lg" block disabled={!emailValid || busy}>
              {busy ? "جارٍ الإرسال…" : "تأكيد"}
            </Button>
          </form>
        )}

        {mode === "verify" && (
          <form onSubmit={verifyCode} className="mt-6 flex flex-col gap-4" noValidate>
            <Input label="الرمز" size="lg" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={8}
              value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••••" />
            <Button type="submit" variant="action" size="lg" block disabled={code.replace(/\D/g, "").length < 6 || busy}>
              {busy ? "جارٍ التحقق…" : "تأكيد"}
            </Button>
            <div className="flex items-center justify-between text-body-regular-14">
              <button type="button" onClick={() => { setMode("request"); setCode(""); setError(undefined); }} className="text-text-secondary">
                تغيير البريد
              </button>
              <button type="button" disabled={secondsLeft > 0 || busy} onClick={() => requestCode()}
                className={secondsLeft > 0 ? "text-text-muted" : "text-body-strong-14 text-brand-primary"}>
                {secondsLeft > 0 ? `إعادة الإرسال بعد ${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}` : "إعادة إرسال الرمز"}
              </button>
            </div>
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
