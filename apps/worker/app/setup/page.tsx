"use client";
// Device setup (dev). In production this becomes: manager signs in with OTP → issue_device_credential().
import { AlertBanner, Button, Input } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getDevice, saveDevice } from "@/lib/db";

const SECRET_RE = /^[0-9a-f]{64}$/i;

export default function SetupPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState("");
  const [secret, setSecret] = useState("");
  const [errors, setErrors] = useState<{ id?: string; secret?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string>();
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    getDevice().then(
      (d) => { if (d) { setDeviceId(d.deviceId); setSaved(d.deviceId); } },
      () => setStorageError(true),
    );
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const id = deviceId.trim();
    const s = secret.trim().toLowerCase();
    const next = {
      id: id ? undefined : "أدخل معرّف الجهاز",
      secret: SECRET_RE.test(s) ? undefined : "الرمز يتكوّن من 64 حرفاً ورقماً (0-9 و a-f)",
    };
    setErrors(next);
    if (next.id || next.secret) return;
    setSaving(true);
    setStorageError(false);
    try {
      await saveDevice(id, s);
    } catch {
      setStorageError(true);
      setSaving(false);
      return;
    }
    router.replace("/");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col gap-6 px-6 pb-10 pt-[calc(env(safe-area-inset-top)+40px)]">
      <header>
        <h1 className="text-heading-h1-24">إعداد الجهاز</h1>
        <p className="mt-1 text-body-regular-14 text-text-secondary">
          مرة واحدة فقط: أدخل بيانات الجهاز التي أعطاك إياها المدير، ثم يدخل العمال برموزهم.
        </p>
        {saved && (
          <p className="mt-2 text-body-small-12 text-text-secondary">
            الجهاز مسجّل حالياً باسم <span dir="ltr" className="font-semibold">{saved}</span>. الحفظ يستبدل البيانات القديمة.
          </p>
        )}
      </header>

      {storageError && (
        <AlertBanner tone="danger" title="تعذّر حفظ البيانات على هذا الجهاز">
          تأكد أن المتصفح ليس في وضع التصفح الخفي، ثم حاول مرة أخرى.
        </AlertBanner>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="معرّف الجهاز"
          dir="ltr"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          error={errors.id}
          placeholder="cowork-test-device"
        />
        {/* plain text on purpose: type=password would offer to save it in the browser's password manager */}
        <Input
          label="رمز الجهاز السري"
          type="text"
          name="fuelos-device-secret"
          dir="ltr"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          error={errors.secret}
          helper="لا تشاركه مع أحد — يُحفظ على هذا الجهاز فقط"
        />
        <Button type="submit" variant="action" size="lg" block disabled={saving}>
          {saving ? "جارٍ الحفظ…" : "حفظ الجهاز"}
        </Button>
      </form>
    </main>
  );
}
