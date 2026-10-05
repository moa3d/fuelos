"use client";
// Bottom tab bar for a signed-in customer — every (private) page (app/(private)/layout.tsx), plus C1 and C2
// when customerAccess() says "customer" (a guest keeps the plain "تسجيل الدخول" header instead).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "الرئيسية", icon: "home" },
  { href: "/invoices", label: "فواتيري", icon: "receipt" },
  { href: "/card", label: "بطاقتي", icon: "qr" },
  { href: "/rewards", label: "المكافآت", icon: "gift" },
  { href: "/complaints", label: "الشكاوى", icon: "message" },
  { href: "/vehicles", label: "سياراتي", icon: "car" },
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
              className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-label-11 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary ${active ? "text-brand-primary" : "text-text-muted"}`}
            >
              <span
                className={`flex h-7 w-11 items-center justify-center rounded-full ${active ? "bg-brand-primary-50" : ""}`}
              >
                <Icon name={item.icon} size={20} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
