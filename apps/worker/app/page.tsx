"use client";
// L2 — دخول العامل (PIN). Matches design/screens/L2.png.
import { LOGIN_NETWORK_MESSAGE, loginErrorMessage } from "@fuelos/core";
import { AlertBanner, Button, cx } from "@fuelos/ui";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { db, getDevice, type DeviceCredential } from "@/lib/db";
import { initials, shortName } from "@/lib/names";
import { fetchRoster, NetworkError, pinLogin, type Roster } from "@/lib/pin-login";
import { supabase } from "@/lib/supabase";
import { useOnline } from "@/lib/use-online";

const PIN_MIN = 4;
const PIN_MAX = 6;
const STORAGE_MESSAGE = "تعذّر قراءة بيانات هذا الجهاز — أغلق التطبيق وافتحه من جديد";

type RosterState =
  | { status: "loading" }
  | { status: "no-device" }
  | { status: "ready"; roster: Roster }
  | { status: "offline" }
  | { status: "error"; message: string; code?: string };

export default function PinLoginPage() {
  const router = useRouter();
  const online = useOnline();
  const [device, setDevice] = useState<DeviceCredential>();
  const [state, setState] = useState<RosterState>({ status: "loading" });
  const [selected, setSelected] = useState<string>();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  // Fetches the roster and replaces the state when done (callers set "loading" themselves if needed).
  const loadRoster = useCallback(async (d: DeviceCredential) => {
    try {
      const res = await fetchRoster(d.deviceId, d.deviceSecret);
      if (res.ok) {
        setState({ status: "ready", roster: res.data });
        if (res.data.members.length === 1) setSelected(res.data.members[0].user_id);
      } else {
        setState({ status: "error", code: res.error.code, message: loginErrorMessage(res.error.code, res.error) });
      }
    } catch (e) {
      setState(e instanceof NetworkError ? { status: "offline" } : { status: "error", message: loginErrorMessage(undefined) });
    }
  }, []);

  function retry() {
    if (!device) return;
    setState({ status: "loading" });
    void loadRoster(device);
  }

  useEffect(() => {
    getDevice().then(
      (d) => {
        if (!d) return setState({ status: "no-device" });
        setDevice(d);
        void loadRoster(d);
      },
      () => setState({ status: "error", message: STORAGE_MESSAGE }),
    );
  }, [loadRoster]);

  // back online → try again
  useEffect(() => {
    if (!device || state.status !== "offline") return;
    const onOnline = () => void loadRoster(device);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [device, state.status, loadRoster]);

  const submit = useCallback(async (value: string) => {
    if (!device || !selected || value.length < PIN_MIN || busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const res = await pinLogin(device.deviceId, device.deviceSecret, selected, value);
      if (!res.ok) {
        setMessage(loginErrorMessage(res.error.code, res.error));
        setPin("");
        return;
      }
      const { session, user_id, station_id } = res.data;
      const { error } = await supabase().auth.setSession({
        access_token: session.access_token, refresh_token: session.refresh_token,
      });
      if (error) {
        setMessage(isAuthRetryableFetchError(error) || !navigator.onLine ? LOGIN_NETWORK_MESSAGE : loginErrorMessage(undefined));
        setPin("");
        return;
      }
      const member = state.status === "ready" ? state.roster.members.find((m) => m.user_id === user_id) : undefined;
      await db.member.put({ key: "current", userId: user_id, stationId: station_id, displayName: member?.display_name ?? "" });
      router.replace("/shift/start");
    } catch (e) {
      setMessage(e instanceof NetworkError ? LOGIN_NETWORK_MESSAGE : loginErrorMessage(undefined));
      setPin("");
    } finally {
      setBusy(false);
    }
  }, [device, selected, busy, state, router]);

  function press(digit: string) {
    if (busy || !selected) return;
    setMessage(undefined);
    const next = (pin + digit).slice(0, PIN_MAX);
    setPin(next);
    if (next.length === PIN_MAX) void submit(next);
  }

  const stationName = state.status === "ready" ? state.roster.station.name : undefined;
  const deviceProblem = state.status === "error" && state.code === "FUELOS_DEVICE_NOT_REGISTERED";

  return (
    <main className="safe-top min-h-dvh bg-brand-dark text-text-on-dark">
      <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col px-6 pb-6 pt-10">
        <header className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-lg bg-brand-action text-brand-on-action">
            <PumpIcon />
          </span>
          {state.status === "loading" ? (
            <>
              <span className="mt-1 h-8 w-36 animate-pulse rounded-sm bg-brand-dark-800" />
              <span className="h-4 w-44 animate-pulse rounded-sm bg-brand-dark-800" />
            </>
          ) : (
            <>
              <h1 className="text-heading-h1-24">{stationName ?? "FuelOS"}</h1>
              {stationName && <p className="text-body-small-12 text-text-on-dark-muted">هذا الجهاز مسجّل في {stationName}</p>}
            </>
          )}
        </header>

        <section className="mt-8 flex-1">
          {state.status === "no-device" && (
            <div className="flex flex-col gap-4">
              <AlertBanner tone="warning" title="هذا الجهاز غير مسجّل بعد">
                أدخل معرّف الجهاز ورمزه مرة واحدة لربطه بالمحطة.
              </AlertBanner>
              <Button variant="action" size="lg" block onClick={() => router.push("/setup")}>إعداد الجهاز</Button>
            </div>
          )}

          {state.status === "offline" && (
            <AlertBanner tone="warning" title={LOGIN_NETWORK_MESSAGE}
              action={device && <Button variant="secondary" onClick={retry}>إعادة المحاولة</Button>} />
          )}

          {state.status === "error" && (
            <div className="flex flex-col gap-4">
              {deviceProblem ? (
                <>
                  <AlertBanner tone="danger" title={state.message} />
                  <Button variant="action" size="lg" block onClick={() => router.push("/setup")}>إعداد الجهاز</Button>
                </>
              ) : (
                <>
                  <AlertBanner tone="danger" title={state.message}
                    action={device && <Button variant="secondary" onClick={retry}>إعادة المحاولة</Button>} />
                  <Link href="/setup" className="text-center text-body-small-12 text-text-on-dark-muted underline">
                    تغيير بيانات الجهاز
                  </Link>
                </>
              )}
            </div>
          )}

          {state.status === "loading" && <RosterSkeleton />}

          {state.status === "ready" && state.roster.members.length === 0 && (
            <AlertBanner tone="info" title="لا يوجد عمّال لهم رمز دخول بعد">
              اطلب من صاحب المحطة تحديد رمز لكل عامل.
            </AlertBanner>
          )}

          {state.status === "ready" && state.roster.members.length > 0 && (
            <>
              <h2 className="text-center text-body-strong-14 text-text-on-dark-muted">من أنت؟</h2>
              <ul className="mt-4 flex flex-wrap justify-center gap-4">
                {state.roster.members.map((m) => {
                  const active = m.user_id === selected;
                  return (
                    <li key={m.user_id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        disabled={busy}
                        onClick={() => { setSelected(m.user_id); setPin(""); setMessage(undefined); }}
                        className="flex w-20 flex-col items-center gap-2 disabled:opacity-60"
                      >
                        <span className={cx(
                          "flex size-16 items-center justify-center rounded-full text-number-m-18 transition-colors",
                          active ? "bg-brand-primary ring-4 ring-brand-action" : "bg-brand-dark-800",
                        )}>
                          {initials(m.display_name)}
                        </span>
                        <span className={cx("text-center text-body-strong-14", active ? "text-text-on-dark" : "text-text-on-dark-muted")}>
                          {shortName(m.display_name, state.roster.members.map((o) => o.display_name))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <h2 className="mt-8 text-center text-heading-h3-16">أدخل رمزك السري</h2>
              <div className="mt-3 flex justify-center gap-3" aria-live="polite" aria-label={`تم إدخال ${pin.length} أرقام`}>
                {Array.from({ length: Math.max(PIN_MIN, pin.length) }, (_, i) => (
                  <span key={i} className={cx("size-4 rounded-full", i < pin.length ? "bg-brand-action" : "bg-brand-dark-700")} />
                ))}
              </div>

              <p role="alert" className="mt-3 min-h-6 text-center text-body-strong-14 text-status-warning">
                {message ?? (!selected ? "اختر اسمك أولاً" : null)}
              </p>

              <Keypad
                disabled={busy || !selected}
                canSubmit={pin.length >= PIN_MIN && !busy}
                busy={busy}
                onDigit={press}
                onDelete={() => { setPin((p) => p.slice(0, -1)); setMessage(undefined); }}
                onSubmit={() => submit(pin)}
              />
            </>
          )}
        </section>

        <footer className="mt-6 flex items-center justify-center gap-2 text-body-small-12 text-text-on-dark-muted">
          <span aria-hidden className={cx("size-2 rounded-full", online ? "bg-brand-action" : "bg-status-warning")} />
          الدخول يحتاج إنترنت
        </footer>
      </div>
    </main>
  );
}

/** Phone keypad as in L2.png: 1-2-3 left→right, «دخول» bottom-left, backspace bottom-right. */
function Keypad({ disabled, canSubmit, busy, onDigit, onDelete, onSubmit }: {
  disabled: boolean; canSubmit: boolean; busy: boolean;
  onDigit: (d: string) => void; onDelete: () => void; onSubmit: () => void;
}) {
  const key = "h-16 rounded-md bg-brand-dark-800 text-number-l-24 transition-colors active:bg-brand-dark-700 disabled:opacity-50";
  return (
    <div dir="ltr" className="mt-4 grid grid-cols-3 gap-3">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" className={key} disabled={disabled} onClick={() => onDigit(d)}>{d}</button>
      ))}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className="h-16 rounded-md bg-brand-action text-button-large-18 text-brand-on-action disabled:bg-brand-dark-800 disabled:text-text-on-dark-muted"
      >
        {busy ? "…" : "دخول"}
      </button>
      <button type="button" className={key} disabled={disabled} onClick={() => onDigit("0")}>0</button>
      <button type="button" aria-label="حذف" className={cx(key, "flex items-center justify-center")} disabled={disabled} onClick={onDelete}>
        <BackspaceIcon />
      </button>
    </div>
  );
}

function RosterSkeleton() {
  return (
    <div aria-busy className="flex flex-col items-center gap-4">
      <span className="h-5 w-16 animate-pulse rounded-sm bg-brand-dark-800" />
      <div className="flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex w-20 flex-col items-center gap-2">
            <span className="size-16 animate-pulse rounded-full bg-brand-dark-800" />
            <span className="h-4 w-12 animate-pulse rounded-sm bg-brand-dark-800" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid w-full grid-cols-3 gap-3">
        {Array.from({ length: 12 }, (_, i) => <span key={i} className="h-16 animate-pulse rounded-md bg-brand-dark-800" />)}
      </div>
    </div>
  );
}

function PumpIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 22h12M4 9h10M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" />
    </svg>
  );
}

function BackspaceIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 5h10a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H10l-7-7z" />
      <path d="m18 9-6 6M12 9l6 6" />
    </svg>
  );
}
