"use client";
// أدمن المنصة — دخول (design spec: platform staff, invited internally, not self-service). Email + password
// only — no OTP here, unlike L1/L3, since staff accounts are created directly and OTP email is currently
// blocked on Supabase's side anyway (docs/briefs/04d).
import { authErrorMessage, AUTH_NETWORK_MESSAGE } from "@fuelos/core";
import { AlertBanner, Button, Input } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { adminAccess } from "@/lib/admin-access";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);

  useEffect(() => {
    adminAccess().then((a) => { if (a.kind === "admin") router.replace("/"); });
  }, [router]);

  async function afterSignIn() {
    const access = await adminAccess();
    if (access.kind === "admin") return router.replace("/");
    await supabase().auth.signOut({ scope: "local" });
    setError(access.kind === "none" ? "هذا الحساب ليس من فريق المنصة" : "تعذّر التحقق من صلاحياتك — حاول مرة أخرى");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || !email.trim() || !password) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    supabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password }).then(({ error: err }) => {
      if (err) { setError(authErrorMessage(err)); inFlight.current = false; setBusy(false); return; }
      afterSignIn().finally(() => { inFlight.current = false; setBusy(false); });
    }).catch(() => {
      setError(navigator.onLine ? authErrorMessage(null) : AUTH_NETWORK_MESSAGE);
      inFlight.current = false; setBusy(false);
    });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <section className="w-full max-w-[420px] rounded-xl border border-border-default bg-surface-card p-8 shadow-raised">
        <div className="flex items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-md bg-brand-action text-brand-on-action"><PumpIcon /></span>
          <span className="text-heading-h2-20">FuelOS Admin</span>
        </div>
        <h1 className="mt-6 text-display-32">تسجيل الدخول</h1>
        <p className="mt-1 text-body-regular-14 text-text-secondary">لفريق FuelOS فقط</p>

        {error && <AlertBanner tone="danger" className="mt-4" title={error} />}

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
          <Input label="البريد الإلكتروني" dir="ltr" autoComplete="username" inputMode="email"
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@fuelos.app" />
          <Input label="كلمة المرور" type="password" dir="ltr" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" variant="primary" size="lg" block disabled={!email.trim() || !password || busy}>
            {busy ? "جارٍ الدخول…" : "دخول"}
          </Button>
        </form>
      </section>
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
