"use client";
// Target of the «نسيت كلمة المرور؟» email: the link signs the user in for recovery, then a new password is set.
import { authErrorMessage } from "@fuelos/core";
import { AlertBanner, Button, Input } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "yes" | "no">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);

  useEffect(() => {
    // the client reads the recovery session from the link; give it a moment, then check
    const { data } = supabase().auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady("yes");
    });
    const t = setTimeout(async () => {
      const { data: s } = await supabase().auth.getSession();
      setReady((r) => (r === "yes" || s.session ? "yes" : "no"));
    }, 1200);
    return () => { clearTimeout(t); data.subscription.unsubscribe(); };
  }, []);

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
      router.replace("/dashboard");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="w-full max-w-[420px] rounded-xl border border-border-default bg-surface-card p-8 shadow-raised">
        <h1 className="text-heading-h1-24">تعيين كلمة مرور جديدة</h1>
        {ready === "checking" && <span aria-busy className="mt-6 block h-24 animate-pulse rounded-md bg-surface-muted" />}
        {ready === "no" && (
          <AlertBanner tone="warning" className="mt-6" title="الرابط منتهي أو غير صالح"
            action={<Button variant="secondary" onClick={() => router.replace("/login")}>اطلب رابطاً جديداً</Button>}>
            روابط إعادة التعيين تعمل مرة واحدة ولوقت قصير.
          </AlertBanner>
        )}
        {ready === "yes" && (
          <form onSubmit={save} className="mt-6 flex flex-col gap-4" noValidate>
            {error && <AlertBanner tone="danger" title={error} />}
            <Input label="كلمة المرور الجديدة" type="password" dir="ltr" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              error={tooShort ? "8 أحرف على الأقل" : undefined} helper="8 أحرف على الأقل، ويُفضَّل أن تضم أرقاماً" />
            <Input label="أعد كتابتها" type="password" dir="ltr" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch ? "غير مطابقة" : undefined} />
            <Button type="submit" variant="primary" size="lg" block disabled={busy || password.length < 8 || password !== confirm}>
              {busy ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
