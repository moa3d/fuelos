// 40×40 rounded square with an icon inside (radius 12). Default tone is the primary tint (brand-primary-50).
import { cx } from "@fuelos/ui";
import { Icon, type IconName } from "./Icon";

const TONES = {
  primary: "bg-brand-primary-50 text-brand-primary",
  action: "bg-brand-action-50 text-brand-action-700",
  warning: "bg-status-warning-50 text-status-warning-700",
  info: "bg-status-info-50 text-status-info-700",
  neutral: "bg-surface-muted text-text-muted",
} as const;

export function IconBox({ icon, tone = "primary", className }: { icon: IconName; tone?: keyof typeof TONES; className?: string }) {
  return (
    <span className={cx("inline-flex size-10 shrink-0 items-center justify-center rounded-md", TONES[tone], className)}>
      <Icon name={icon} size={20} />
    </span>
  );
}
