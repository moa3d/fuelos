// Page header: title, optional subtitle, optional round back button (start side), optional trailing slot.
// variant="dark" puts it on the brand-dark background with on-dark text (used by the station page).
import { cx } from "@fuelos/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export type PageHeaderBack = { label: string } & ({ href: string } | { onBack: () => void });

export function PageHeader({
  title,
  subtitle,
  variant = "light",
  back,
  trailing,
  className,
}: {
  title: string;
  subtitle?: string;
  variant?: "light" | "dark";
  back?: PageHeaderBack;
  trailing?: ReactNode;
  className?: string;
}) {
  const dark = variant === "dark";
  const backClass = cx(
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
    dark ? "bg-brand-dark-800 text-text-on-dark" : "bg-surface-muted text-text-primary",
  );
  // The arrow points start-ward; mirror it so it points right in the RTL layout.
  const backIcon = <Icon name="chevron-left" size={20} className="rtl:rotate-180" />;

  return (
    <header className={cx("flex items-center gap-3", dark && "bg-brand-dark px-4 py-4 text-text-on-dark", className)}>
      {back &&
        ("href" in back ? (
          <Link href={back.href} aria-label={back.label} className={backClass}>{backIcon}</Link>
        ) : (
          <button type="button" onClick={back.onBack} aria-label={back.label} className={backClass}>{backIcon}</button>
        ))}
      <div className="min-w-0 flex-1">
        <h1 className={cx("text-heading-h1-24", dark ? "text-text-on-dark" : "text-text-primary")}>{title}</h1>
        {subtitle && (
          <p className={cx("text-body-small-12", dark ? "text-text-on-dark-muted" : "text-text-secondary")}>{subtitle}</p>
        )}
      </div>
      {trailing}
    </header>
  );
}
