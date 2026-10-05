// 8px track with a rounded fill. `value` is a percentage; it is clamped to 0–100.
// Fill is brand-action (default) or brand-primary via `tone`.
import { cx } from "@fuelos/ui";

const FILLS = {
  action: "bg-brand-action",
  primary: "bg-brand-primary",
} as const;

export function ProgressBar({
  value,
  tone = "action",
  label,
  className,
}: {
  value: number;
  tone?: keyof typeof FILLS;
  label: string;
  className?: string;
}) {
  const pct = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cx("h-2 w-full overflow-hidden rounded-full bg-border-default", className)}
    >
      <div
        className={cx("h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none", FILLS[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
