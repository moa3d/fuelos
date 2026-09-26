import type { ReactNode } from "react";
import { cx } from "./cx";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

const tones: Record<BadgeTone, { box: string; dot: string }> = {
  success: { box: "bg-brand-action-50 text-brand-action-700", dot: "bg-brand-action" },
  warning: { box: "bg-status-warning-50 text-status-warning-700", dot: "bg-status-warning" },
  danger: { box: "bg-status-danger-50 text-status-danger-700", dot: "bg-status-danger" },
  info: { box: "bg-status-info-50 text-status-info-700", dot: "bg-status-info" },
  neutral: { box: "bg-surface-muted text-text-secondary", dot: "bg-text-muted" },
  primary: { box: "bg-brand-primary-50 text-brand-primary", dot: "bg-brand-primary" },
};

/** 24px pill with a dot. */
export function StatusBadge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  const t = tones[tone];
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-label-12", t.box, className)}>
      <span aria-hidden className={cx("size-1.5 rounded-full", t.dot)} />
      {children}
    </span>
  );
}
