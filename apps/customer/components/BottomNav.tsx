"use client";
// Bottom tab bar for a signed-in customer — every (private) page (app/(private)/layout.tsx), plus C1 and C2
// when customerAccess() says "customer" (a guest keeps the plain "تسجيل الدخول" header instead). Icons reuse
// the same plain-emoji style C1's old quick-action tiles used — no new icon library.
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "الرئيسية", icon: "🏠" },
  { href: "/invoices", label: "فواتيري", icon: "🧾" },
  { href: "/card", label: "بطاقتي", icon: "💳" },
  { href: "/rewards", label: "المكافآت", icon: "🎁" },
  { href: "/complaints", label: "الشكاوى", icon: "💬" },
  { href: "/vehicles", label: "سياراتي", icon: "🚗" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="أقسام التطبيق" className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-surface-card">
      <div className="mx-auto flex max-w-[480px] items-stretch justify-between px-1 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+6px)]">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-label-11 ${active ? "text-brand-primary" : "text-text-secondary"}`}
            >
              <span aria-hidden className="text-heading-h2-20 leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
