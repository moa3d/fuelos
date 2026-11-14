"use client";
// «حالة المحطة» (spec §2) — the one-tap open/closed + crowd card at the top of the open-shift screen.
// Status writes are online-only: setStationStatus() calls the RPC directly, never the offline outbox
// (fuelos-offline-sync — a crowd reading that reaches customers an hour late is worse than none).
import { crowdBadge, openBadge, type CrowdLevel, type StationStatusView } from "@fuelos/core";
import { cx } from "@fuelos/ui";
import { useEffect, useRef, useState } from "react";
import { loadStationStatus, setStationStatus, type StatusOutcome, type StatusPatch } from "@/lib/station-status";
import { timeAgo } from "@/lib/time-ago";
import { useOnline } from "@/lib/use-online";

const OFFLINE_MESSAGE = "تحديث الحالة يحتاج اتصالاً";
const RPC_FALLBACK_MESSAGE = "تعذّر تحديث الحالة — تحقق من الاتصال";
const CROWD_LEVELS: CrowdLevel[] = ["none", "medium", "high"];

export function StationStatusCard({ stationId }: { stationId: string }) {
  const online = useOnline();
  const [view, setView] = useState<StationStatusView>();
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    loadStationStatus(stationId)
      .then((v) => { if (alive) { setView(v); setLoadError(undefined); } })
      .catch(() => { if (alive) setLoadError("تعذّر تحميل حالة المحطة"); });
    return () => { alive = false; };
  }, [stationId]);

  async function apply(patch: StatusPatch) {
    if (busy.current || !online || !view) return;
    busy.current = true;
    setSaving(true);
    setSaveError(undefined);
    const previous = view;
    const now = new Date().toISOString();
    setView({
      ...previous,
      ...(patch.open !== undefined ? { isOpen: patch.open, openSource: "manual" as const, openSetAt: now } : {}),
      ...(patch.crowd !== undefined ? { crowd: patch.crowd, crowdSetAt: now, crowdStale: false } : {}),
    });
    const res: StatusOutcome = await setStationStatus(stationId, patch).catch(() => ({ ok: false, message: RPC_FALLBACK_MESSAGE }));
    if (res.ok) setView(res.view);
    else {
      setView(previous);
      setSaveError(res.message);
    }
    setSaving(false);
    busy.current = false;
  }

  if (loadError) {
    return (
      <section className="rounded-lg bg-surface-card p-4 shadow-card">
        <p className="text-body-small-12 text-status-danger-700">{loadError}</p>
      </section>
    );
  }

  if (!view) {
    return <section aria-busy className="h-32 animate-pulse rounded-lg bg-surface-muted" />;
  }

  const disabled = !online || saving;
  const openTone = openBadge(view.isOpen).tone;

  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface-card p-4 shadow-card">
      <h2 className="text-body-strong-14 text-text-secondary">حالة المحطة</h2>

      <button
        type="button"
        aria-pressed={view.isOpen === true}
        disabled={disabled}
        onClick={() => void apply({ open: view.isOpen !== true })}
        className={cx(
          "h-12 rounded-md text-body-strong-14 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          TONE_BORDER[openTone],
        )}
      >
        {view.isOpen === true ? "المحطة مفتوحة" : view.isOpen === false ? "المحطة مغلقة" : "حالة الفتح غير معروفة"}
      </button>
      {view.isOpen === true && view.openSource === "shift" && (
        <p className="text-label-11 text-text-muted">مفتوحة — مناوبة جارية</p>
      )}

      <div role="radiogroup" aria-label="الزحام" className="grid grid-cols-3 gap-2">
        {CROWD_LEVELS.map((level) => {
          const badge = crowdBadge(level);
          const active = view.crowd === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => void apply({ crowd: level })}
              className={cx(
                "h-11 rounded-md text-body-strong-14 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                active ? TONE_BORDER[badge.tone] : "border border-border-default bg-surface-card text-text-secondary",
              )}
            >
              {badge.label}
            </button>
          );
        })}
      </div>

      {!online ? (
        <p className="text-body-small-12 text-status-warning-700">{OFFLINE_MESSAGE}</p>
      ) : view.crowdStale ? (
        <p className="text-body-small-12 text-status-warning-700">حدّث الزحام ليراه الزبائن</p>
      ) : (
        <p className="text-body-small-12 text-text-secondary">آخر تحديث {timeAgo(view.crowdSetAt!)}</p>
      )}

      {saveError && <p role="alert" className="text-body-small-12 text-status-danger-700">{saveError}</p>}
    </section>
  );
}

const TONE_BORDER: Record<"success" | "warning" | "danger" | "neutral", string> = {
  success: "border-2 border-brand-action bg-brand-action-50 text-brand-action-700",
  warning: "border-2 border-status-warning bg-status-warning-50 text-status-warning-700",
  danger: "border-2 border-status-danger bg-status-danger-50 text-status-danger-700",
  neutral: "border border-border-default bg-surface-card text-text-secondary",
};
