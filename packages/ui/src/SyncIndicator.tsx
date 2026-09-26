import { cx } from "./cx";

export type SyncState = "online" | "offline" | "syncing";

const styles: Record<SyncState, { box: string; dot: string; label: string }> = {
  online: { box: "bg-brand-action-50 text-brand-action-700", dot: "bg-brand-action", label: "متصل" },
  offline: { box: "bg-status-warning-50 text-status-warning-700", dot: "bg-status-warning", label: "غير متصل" },
  syncing: { box: "bg-status-info-50 text-status-info-700", dot: "bg-status-info animate-pulse", label: "جارٍ المزامنة" },
};

/** Always visible in the worker app header. `pending` = operations waiting in the outbox. */
export function SyncIndicator({ state, pending = 0, className }: { state: SyncState; pending?: number; className?: string }) {
  const s = styles[state];
  const waiting = pending > 0 ? `${pending} عمليات بانتظار المزامنة` : null;
  const detail =
    state === "offline" ? ["محفوظ على الجهاز", waiting].filter(Boolean).join(" · ")
    : state === "online" && !waiting ? "تمت المزامنة"
    : waiting;
  return (
    <span role="status" className={cx("inline-flex h-8 items-center gap-2 rounded-full px-3 text-label-12", s.box, className)}>
      <span aria-hidden className={cx("size-2 rounded-full", s.dot)} />
      <span>{s.label}</span>
      {detail && <span className="font-normal opacity-80">· {detail}</span>}
    </span>
  );
}
