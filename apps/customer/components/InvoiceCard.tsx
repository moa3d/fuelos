// Invoice list card (radius 18). Presentational only. The status word is passed in as `statusLabel`; the tone
// comes from `status` (confirmed = success, pending = warning, corrected = info, cancelled = neutral + muted).
import { cx, StatusBadge, type BadgeTone } from "@fuelos/ui";
import Link from "next/link";
import { IconBox } from "./IconBox";

export type InvoiceStatus = "confirmed" | "pending" | "corrected" | "cancelled";

const STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  confirmed: "success",
  pending: "warning",
  corrected: "info",
  cancelled: "neutral",
};

export function InvoiceCard({
  stationName,
  amount,
  detail,
  date,
  status,
  statusLabel,
  href,
  className,
}: {
  stationName: string;
  /** Already formatted, e.g. "5,000 ل.س". */
  amount: string;
  /** e.g. "بنزين 95 · 40.0 لتر". */
  detail: string;
  /** Already formatted date line. */
  date: string;
  status: InvoiceStatus;
  statusLabel: string;
  href?: string;
  className?: string;
}) {
  const muted = status === "cancelled";
  const body = (
    <>
      <IconBox icon="receipt" tone={muted ? "neutral" : "primary"} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cx("truncate text-body-strong-14", muted ? "text-text-muted" : "text-text-primary")}>{stationName}</span>
          <span className={cx("shrink-0 text-number-m-18", muted ? "text-text-muted" : "text-text-primary")}>{amount}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={cx("truncate text-body-small-12", muted ? "text-text-muted" : "text-text-secondary")}>{detail}</span>
          <StatusBadge tone={STATUS_TONE[status]}>{statusLabel}</StatusBadge>
        </div>
        <span className="text-body-small-12 text-text-muted">{date}</span>
      </div>
    </>
  );
  const shell = cx(
    "flex items-center gap-3 rounded-[18px] border border-border-default bg-surface-card p-4 shadow-card",
    className,
  );
  return href ? (
    <Link href={href} className={cx(shell, "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary")}>
      {body}
    </Link>
  ) : (
    <article className={shell}>{body}</article>
  );
}
