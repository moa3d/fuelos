"use client";
// /welcome — shared target of a join link from O11 (invite-station-member) or admin's A2 (onboard-station).
// The link is never emailed; it's copied or sent over WhatsApp. It carries {token_hash, type: "invite"} and
// works only for an account that has never signed in (docs/briefs/06a). Flow: verifyOtp → set a password →
// accept_station_invites() (activates this user's own 'invited' memberships) → the office dashboard.
import { authErrorMessage } from "@fuelos/core";
import { AlertBanner, Button, Input } from "@fuelos/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type Ready = "checking" | "yes" | "no";

export default function WelcomePage() {
  return (
    <Suspense fallback={<main className="flex min-h-dvh items-center justify-center p-4"><span className="block h-40 w-full max-w-[420px] animate-pulse rounded-xl bg-surface-muted" /></main>}>
      <WelcomeForm />
    </Suspense>
  );
}

function WelcomeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [ready, setReady] = useState<Ready>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);

  useEffect(() => {
    const tokenHash = params.get("token_hash") ?? "";
    const type = params.get("type");
    if (type !== "invite" || !tokenHash) {
      // still resolves asynchronously, in the .then() below, not directly in the effect body
      Promise.resolve().then(() => setReady("no"));
      return;
    }
    supabase().auth.verifyOtp({ token_hash: tokenHash, type: "invite" }).then(({ data, error: err }) => {
      setReady(err || !data.session ? "no" : "yes");
    });
  }, [params]);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || password.length < 8 || password !== confirm) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const { error: err } = await supabase().auth.updateUser({ password });
      if (err) return setError(authErrorMessage(err));
      try { await supabase().rpc("accept_station_invites"); } catch { /* best-effort */ }
      router.replace("/");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="w-full max-w-[420px] rounded-xl border border-border-default bg-surface-card p-8 shadow-raised">
        <h1 className="text-heading-h1-24">مرحباً بك في FuelOS</h1>
        <p className="mt-1 text-body-regular-14 text-text-secondary">اختر كلمة مرور لإكمال حسابك</p>

        {ready === "checking" && <span aria-busy className="mt-6 block h-24 animate-pulse rounded-md bg-surface-muted" />}
        {ready === "no" && (
          <AlertBanner tone="warning" className="mt-6" title="انتهت صلاحية الرابط أو استُخدم من قبل">
            اطلب رابطاً جديداً ممن أرسله إليك (صاحب المحطة أو فريق FuelOS).
          </AlertBanner>
        )}
        {ready === "yes" && (
          <form onSubmit={save} className="mt-6 flex flex-col gap-4" noValidate>
            {error && <AlertBanner tone="danger" title={error} />}
            <Input label="كلمة المرور" type="password" dir="ltr" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              error={tooShort ? "8 أحرف على الأقل" : undefined} helper="8 أحرف على الأقل" />
            <Input label="أعد كتابتها" type="password" dir="ltr" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch ? "غير مطابقة" : undefined} />
            <Button type="submit" variant="primary" size="lg" block disabled={busy || password.length < 8 || password !== confirm}>
              {busy ? "جارٍ الحفظ…" : "دخول"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}

