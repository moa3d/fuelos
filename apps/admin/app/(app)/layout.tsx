"use client";
// Everything behind the admin login: checks the session and platform-staff role, then draws the shell.
import { cx } from "@fuelos/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { adminAccess, ROLE_LABEL, type PlatformRole } from "@/lib/admin-access";
import { supabase } from "@/lib/supabase";
import { AdminContext } from "./admin-context";

const NAV: { href: string; label: string; ready: boolean }[] = [
  { href: "/dashboard", label: "لوحة المنصة", ready: true },
  { href: "/stations", label: "المحطات", ready: true },
  { href: "/stations/new", label: "انضمام محطة", ready: true },
  { href: "/sales", label: "مبيعات المحطات", ready: true },
  { href: "/subscriptions", label: "الاشتراكات والباقات", ready: true },
  { href: "/support", label: "تذاكر الدعم", ready: true },
  { href: "/audit", label: "الصلاحيات والسجلات", ready: true },
];

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; userId: string; role: PlatformRole };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    adminAccess().then((a) => {
      if (a.kind === "admin") setState({ status: "ready", userId: a.userId, role: a.role });
      else if (a.kind === "error") setState({ status: "error" });
      else router.replace("/login");
    }, () => setState({ status: "error" }));
    const { data } = supabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

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
        <p className="text-body-regular-14 text-text-secondary">تعذّر التحقق من حسابك — أعد فتح الصفحة.</p>
      </main>
    );
  }

  async function signOut() {
    await supabase().auth.signOut({ scope: "local" });
    router.replace("/login");
  }

  return (
    <AdminContext.Provider value={{ userId: state.userId, role: state.role }}>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col bg-brand-dark text-text-on-dark">
          <div className="flex items-center gap-2 px-6 py-6">
            <span className="flex size-9 items-center justify-center rounded-md bg-brand-action text-brand-on-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 22h12M4 9h10M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" /></svg>
            </span>
            <div>
              <p className="text-heading-h3-16">FuelOS Admin</p>
              <p className="text-label-11 text-text-on-dark-muted">إدارة شبكة المحطات</p>
            </div>
          </div>

          <nav aria-label="الأقسام" className="flex-1 overflow-y-auto px-3">
            <ul className="flex flex-col gap-1">
              {NAV.map((item) => {
                // exact match for "/stations" so it doesn't also light up on "/stations/new"'s own entry
                const active = item.href === "/stations" ? pathname === "/stations" : pathname.startsWith(item.href);
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
            <p className="text-body-small-12 text-text-on-dark-muted">{ROLE_LABEL[state.role]}</p>
            <button type="button" onClick={signOut} className="mt-2 text-body-small-12 text-text-on-dark-muted underline">
              تسجيل الخروج
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-8">{children}</main>
      </div>
    </AdminContext.Provider>
  );
}
