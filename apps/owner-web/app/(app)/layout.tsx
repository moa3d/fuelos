"use client";
// Everything behind the office login: checks the session and the office role, then draws the desktop shell
// (1440 wide design: 256px dark sidebar on the right, content with 32px padding).
import { AlertBanner, Button, cx } from "@fuelos/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { officeAccess, ROLE_LABEL, type Membership, type OfficeAccess } from "@/lib/office";
import { supabase } from "@/lib/supabase";
import { OfficeContext } from "./office-context";

const STATION_KEY = "fuelos-office-station";

/** O-screens in the order of the milestone; only the built ones are links. */
const NAV: { href: string; label: string; ready: boolean }[] = [
  { href: "/dashboard", label: "لوحة القيادة", ready: true },
  { href: "/sales", label: "المبيعات والمناوبات", ready: false },
  { href: "/approvals", label: "الموافقات", ready: false },
  { href: "/tanks", label: "الخزانات والمخزون", ready: false },
  { href: "/prices", label: "أسعار الوقود", ready: false },
  { href: "/ledger", label: "القيود المحاسبية", ready: false },
  { href: "/customers", label: "العملاء والديون", ready: false },
  { href: "/reports", label: "التقارير والتحليلات", ready: false },
  { href: "/expenses", label: "المصاريف والموردون", ready: false },
  { href: "/complaints", label: "الشكاوى والبلاغات", ready: false },
  { href: "/settings", label: "الإعدادات والمستخدمون", ready: false },
];

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; userId: string; memberships: Membership[]; stationId: string };

export default function OfficeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>({ status: "loading" });

  // turns the result of officeAccess() into the page state (runs in a promise callback, not in the effect body)
  const apply = useCallback(async (access: OfficeAccess) => {
    if (access.kind === "office") {
      let saved: string | null = null;
      try { saved = localStorage.getItem(STATION_KEY); } catch { /* storage blocked */ }
      const stationId = access.memberships.some((m) => m.stationId === saved) ? saved! : access.memberships[0].stationId;
      setState({ status: "ready", userId: access.userId, memberships: access.memberships, stationId });
    } else if (access.kind === "error") {
      setState({ status: "error" });
    } else {
      if (access.kind !== "signed-out") await supabase().auth.signOut({ scope: "local" });
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    officeAccess().then(apply, () => setState({ status: "error" }));
    const { data } = supabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => data.subscription.unsubscribe();
  }, [apply, router]);

  function retry() {
    setState({ status: "loading" });
    officeAccess().then(apply, () => setState({ status: "error" }));
  }

  if (state.status === "loading") {
    return (
      <div className="flex min-h-dvh" aria-busy>
        <aside className="w-64 shrink-0 bg-brand-dark" />
        <main className="flex-1 p-8"><span className="block h-10 w-72 animate-pulse rounded-md bg-surface-muted" /></main>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <AlertBanner tone="danger" title="تعذّر التحقق من حسابك" action={<Button variant="secondary" onClick={retry}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      </main>
    );
  }

  const current = state.memberships.find((m) => m.stationId === state.stationId)!;
  const value = {
    userId: state.userId,
    memberships: state.memberships,
    current,
    switchStation: (stationId: string) => {
      try { localStorage.setItem(STATION_KEY, stationId); } catch { /* storage blocked */ }
      setState({ ...state, stationId });
    },
    signOut: async () => {
      await supabase().auth.signOut({ scope: "local" });
      router.replace("/login");
    },
  };

  return (
    <OfficeContext.Provider value={value}>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col bg-brand-dark text-text-on-dark">
          <div className="flex items-center gap-2 px-6 py-6">
            <span className="flex size-9 items-center justify-center rounded-md bg-brand-action text-brand-on-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 22h12M4 9h10M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" /></svg>
            </span>
            <span className="text-heading-h3-16">FuelOS</span>
          </div>

          {state.memberships.length > 1 ? (
            <label className="mx-4 mb-4 flex flex-col gap-1 text-label-11 text-text-on-dark-muted">
              المحطة
              <select value={state.stationId} onChange={(e) => value.switchStation(e.target.value)}
                className="h-10 rounded-md bg-brand-dark-800 px-3 text-body-strong-14 text-text-on-dark">
                {state.memberships.map((m) => <option key={m.stationId} value={m.stationId}>{m.stationName}</option>)}
              </select>
            </label>
          ) : (
            <p className="mx-6 mb-4 text-body-strong-14 text-text-on-dark-muted">{current.stationName}</p>
          )}

          <nav aria-label="الأقسام" className="flex-1 overflow-y-auto px-3">
            <ul className="flex flex-col gap-1">
              {NAV.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    {item.ready ? (
                      <Link href={item.href} aria-current={active ? "page" : undefined}
                        className={cx("flex h-10 items-center rounded-md px-3 text-body-strong-14",
                          active ? "bg-brand-dark-700 text-text-on-dark" : "text-text-on-dark-muted hover:bg-brand-dark-800")}>
                        {item.label}
                      </Link>
                    ) : (
                      <span aria-disabled className="flex h-10 items-center justify-between rounded-md px-3 text-body-regular-14 text-text-on-dark-muted opacity-60">
                        {item.label}<span className="text-label-11">قريباً</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t border-brand-dark-700 px-6 py-4">
            <p className="truncate text-body-strong-14">{current.displayName}</p>
            <p className="text-body-small-12 text-text-on-dark-muted">{ROLE_LABEL[current.role]}</p>
            <button type="button" onClick={value.signOut} className="mt-2 text-body-small-12 text-text-on-dark-muted underline">
              تسجيل الخروج
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-8">{children}</main>
      </div>
    </OfficeContext.Provider>
  );
}
