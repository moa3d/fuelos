"use client";
// «حالة المحطة» (spec §2) — the one-tap open/closed + crowd card at the top of the open-shift screen.
// Status writes are online-only: setStationStatus() calls the RPC directly, never the offline outbox
// (fuelos-offline-sync — a crowd reading that reaches customers an hour late is worse than none).
import { crowdBadge, openBadge, type CrowdLevel, type StationStatusView } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge } from "@fuelos/ui";
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

  async function load() {
    const v = await loadStationStatus(stationId).catch(() => undefined);
    if (v) { setView(v); setLoadError(undefined); }
    else setLoadError("تعذّر تحميل حالة المحطة");
  }

  // Effects call setState only from inside a .then()/.catch() callback, never directly in the effect
  // body (react-hooks/set-state-in-effect) — `load()` above is the same operation, reused by the retry
  // button below, which is a plain event handler and not subject to that rule.
  useEffect(() => {
    loadStationStatus(stationId)
      .then((v) => { setView(v); setLoadError(undefined); })
      .catch(() => setLoadError("تعذّر تحميل حالة المحطة"));
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
      <AlertBanner tone="danger" title={loadError}
        action={<Button variant="secondary" onClick={() => void load()}>إعادة المحاولة</Button>}>
        حاول مرة أخرى، وإن تكرر الخطأ فاتصل بالمدير.
      </AlertBanner>
    );
  }

  if (!view) {
    return <section aria-busy className="h-32 animate-pulse rounded-lg bg-surface-muted" />;
  }

  const disabled = !online || saving;

  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface-card p-4 shadow-card">
      <h2 className="text-body-strong-14 text-text-secondary">حالة المحطة</h2>

      <Button
        type="button"
        aria-pressed={view.isOpen === true}
        variant={view.isOpen === true ? "action" : "secondary"}
        block
        disabled={disabled}
        className="min-h-12"
        onClick={() => void apply({ open: view.isOpen !== true })}
      >
        {`المحطة ${openBadge(view.isOpen).label}`}
      </Button>
      {view.isOpen === true && view.openSource === "shift" && (
        <p className="text-label-11 text-text-muted">مفتوحة — مناوبة جارية</p>
      )}

      <div role="radiogroup" aria-label="الزحام" className="grid grid-cols-3 gap-2">
        {CROWD_LEVELS.map((level) => {
          const badge = crowdBadge(level);
          const active = view.crowd === level;
          return (
            <Button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              variant={active ? "primary" : "secondary"}
              block
              disabled={disabled}
              className="min-h-11"
              onClick={() => void apply({ crowd: level })}
            >
              <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            </Button>
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
