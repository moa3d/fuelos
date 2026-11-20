"use client";
// «حالة المحطة» (spec §2) at the top of the owner dashboard — the same one-tap open/closed + crowd
// controls as the worker app's card (apps/worker/app/station-status-card.tsx), plus who last touched it:
// the owner isn't usually the one pressing these buttons, so "don't hide, explain" (fuelos-permissions)
// means naming the attendant/shift manager who did, not just a bare timestamp.
import { crowdBadge, openBadge, type CrowdLevel } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge } from "@fuelos/ui";
import { useEffect, useRef, useState } from "react";
import { loadStationStatus, setStationStatus, type OwnerStatusView, type StatusOutcome, type StatusPatch } from "@/lib/station-status";
import { timeAgo } from "@/lib/time-ago";
import { useOffice } from "../office-context";

const RPC_FALLBACK_MESSAGE = "تعذّر تحديث الحالة — تحقق من الاتصال";
const CROWD_LEVELS: CrowdLevel[] = ["none", "medium", "high"];

export function StationStatusCard({ stationId }: { stationId: string }) {
  const { current } = useOffice();
  const [view, setView] = useState<OwnerStatusView>();
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const lastPatch = useRef<StatusPatch | undefined>(undefined);

  async function load() {
    const v = await loadStationStatus(stationId).catch(() => undefined);
    if (v) { setView(v); setLoadError(undefined); }
    else setLoadError("تعذّر تحميل حالة المحطة");
  }

  // Effects call setState only from inside a .then()/.catch() callback, never directly in the effect body
  // (react-hooks/set-state-in-effect) — `load()` above is the same operation, reused by the retry button
  // below, which is a plain event handler and not subject to that rule. The dashboard remounts this
  // component (`key={current.stationId}`, see page.tsx) on a station switch, so there is no stale state
  // to clear here — a fresh mount always starts from the initial "loading" state.
  useEffect(() => {
    loadStationStatus(stationId)
      .then((v) => { setView(v); setLoadError(undefined); })
      .catch(() => setLoadError("تعذّر تحميل حالة المحطة"));
  }, [stationId]);

  async function apply(patch: StatusPatch) {
    if (busy.current || !view) return;
    busy.current = true;
    lastPatch.current = patch;
    setSaving(true);
    setSaveError(undefined);
    const previous = view;
    const now = new Date().toISOString();
    setView({
      ...previous,
      ...(patch.open !== undefined ? { isOpen: patch.open, openSource: "manual" as const, openSetAt: now } : {}),
      ...(patch.crowd !== undefined ? { crowd: patch.crowd, crowdSetAt: now, crowdStale: false } : {}),
      updatedByName: current.displayName,
    });
    const res: StatusOutcome = await setStationStatus(stationId, patch).catch(() => ({ ok: false, message: RPC_FALLBACK_MESSAGE }));
    if (res.ok) setView({ ...res.view, updatedByName: current.displayName });
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
        حاول مرة أخرى، وإن تكرر الخطأ فاتصل بالدعم.
      </AlertBanner>
    );
  }

  if (!view) {
    return <section aria-busy className="h-40 animate-pulse rounded-lg bg-surface-muted" />;
  }

  // set_station_status() allows owner, shift_manager and attendant (RPC's require_role) — this app's
  // roles are owner / accountant / shift_manager, so the accountant is the one who is not allowed.
  // "Don't hide, explain" (fuelos-permissions): disable + say who can, same as ledger/page.tsx:90.
  const canChangeStatus = current.role !== "accountant";
  const changeDisabledTitle = canChangeStatus ? undefined : "تغيير حالة المحطة متاح لصاحب المحطة ومدير المناوبة فقط";
  const disabled = saving || !canChangeStatus;

  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface-card p-4 shadow-card">
      <h2 className="text-body-strong-14 text-text-secondary">حالة المحطة</h2>

      <Button
        type="button"
        aria-pressed={view.isOpen === true}
        variant={view.isOpen === true ? "action" : "secondary"}
        block
        disabled={disabled}
        title={changeDisabledTitle}
        className="min-h-12"
        onClick={() => void apply({ open: view.isOpen !== true })}
      >
        {`المحطة ${openBadge(view.isOpen).label}`}
      </Button>
      <p className="text-label-11 text-text-muted">
        {view.openSource === "manual" ? `حدّثها ${view.updatedByName ?? "غير معروف"} ${timeAgo(view.openSetAt!)}`
          : view.openSource === "shift" ? "مفتوحة — مناوبة جارية"
          : "لم تُحدَّث بعد"}
      </p>

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
              title={changeDisabledTitle}
              className="min-h-11"
              onClick={() => void apply({ crowd: level })}
            >
              <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            </Button>
          );
        })}
      </div>

      {view.crowdStale ? (
        <p className="text-body-small-12 text-status-warning-700">حدّث الزحام ليراه الزبائن</p>
      ) : (
        <p className="text-body-small-12 text-text-secondary">آخر تحديث {timeAgo(view.crowdSetAt!)}</p>
      )}

      {saveError && (
        <AlertBanner tone="danger" title={saveError}
          action={<Button variant="secondary" onClick={() => void apply(lastPatch.current!)}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}
    </section>
  );
}
