import type { ReactNode } from "react";
import { cx } from "./cx";

export type AlertTone = "danger" | "warning" | "success" | "info";

const tones: Record<AlertTone, string> = {
  danger: "bg-status-danger-50 border-status-danger text-status-danger-700",
  warning: "bg-status-warning-50 border-status-warning text-status-warning-700",
  success: "bg-brand-action-50 border-brand-action text-brand-action-700",
  info: "bg-status-info-50 border-status-info text-status-info-700",
};

export function AlertBanner({ tone = "info", title, children, action, className }: {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cx("flex items-start gap-3 rounded-md border-s-4 p-4", tones[tone], className)}
    >
      <div className="flex-1">
        <p className="text-body-strong-14">{title}</p>
        {children && <div className="mt-1 text-body-regular-14 text-text-primary">{children}</div>}
      </div>
      {action}
    </div>
  );
}
