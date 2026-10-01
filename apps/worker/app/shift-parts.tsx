"use client";
// Pieces shared by S1, the move flow and the close wizard (S4–S6).
import { formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { Button, cx, Input, StatusBadge, TextArea } from "@fuelos/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LegReading, PumpRef } from "@/lib/db";
import { newId } from "@/lib/uuid";
import { uploadMeterPhoto, type PhotoKind } from "@/lib/meter-photo";
import type { ReadingCheck } from "@/lib/reading";

/** Pump picker. A busy pump stays visible but disabled, with who has it («مع …»): don't hide, explain. */
export function PumpGrid({ pumps, selectedId, currentId, onSelect }: {
  pumps: PumpRef[]; selectedId?: string; currentId?: string; onSelect: (pumpId: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {pumps.map((p) => {
        const mine = p.id === currentId || p.heldByMe;
        const busy = !mine && !!p.heldBy;
        const active = p.id === selectedId;
        const disabled = mine || busy;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onSelect(p.id)}
            className={cx(
              "flex min-h-24 flex-col items-start gap-1 rounded-md border p-3 text-start transition-colors",
              active ? "border-2 border-brand-primary bg-brand-primary-50"
              : disabled ? "border-border-default bg-surface-muted"
              : "border-border-default bg-surface-card",
            )}
          >
            <span className="flex w-full items-center justify-between">
              <span className={cx("text-body-strong-14", disabled && "text-text-muted")}>مضخة {p.number}</span>
              {active && <span className="text-brand-primary"><CheckIcon /></span>}
            </span>
            <span className="text-body-small-12 text-text-secondary">
              {[...new Set(p.nozzles.map((n) => n.productName))].join(" · ") || "بلا مسدسات"}
            </span>
            <span className={cx("mt-auto flex items-center gap-1 text-label-11",
              mine ? "text-brand-primary" : busy ? "text-status-warning-700" : "text-brand-action-700")}>
              <span aria-hidden className={cx("size-1.5 rounded-full",
                mine ? "bg-brand-primary" : busy ? "bg-status-warning" : "bg-brand-action")} />
              {mine ? "أنت عليها" : busy ? `مع ${p.heldBy}` : "متاحة"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Opening readings, prefilled with the last closing reading; a higher value asks for the reason. */
export function OpeningReadings({ pump, values, checks, gapTenths, gapNote, onChange, onGapNote }: {
  pump: PumpRef;
  values: Record<string, string>;
  checks: Map<string, ReadingCheck>;
  gapTenths: number;
  gapNote: string;
  onChange: (nozzleId: string, value: string) => void;
  onGapNote: (value: string) => void;
}) {
  return (
    <>
      {pump.nozzles.map((n) => {
        const c = checks.get(n.id) ?? { kind: "empty" as const };
        const last = `آخر قراءة مسجّلة: ${formatNumber(n.lastReading, 1)}`;
        const note =
          c.kind === "invalid" ? { error: "أدخل رقماً صحيحاً، بخانة عشرية واحدة على الأكثر" }
          : c.kind === "lower" ? { error: `أقل من آخر قراءة مسجّلة بـ ${liters(c.diffTenths)} لتر — أعد قراءة العداد` }
          : c.kind === "equal" ? { helper: `${last} — مطابقة` }
          : c.kind === "higher" ? { helper: `${last} — أعلى بـ ${liters(c.diffTenths)} لتر` }
          : { helper: last };
        return (
          <Input
            key={n.id}
            size="lg"
            label={pump.nozzles.length > 1 ? `مسدس ${n.productName}` : `عداد ${n.productName}`}
            inputMode="decimal"
            autoComplete="off"
            suffix="لتر"
            value={values[n.id] ?? ""}
            onChange={(e) => onChange(n.id, e.target.value)}
            {...note}
          />
        );
      })}
      {gapTenths > 0 && (
        <TextArea
          label={`فرق ${liters(gapTenths)} لتر عن آخر قراءة — اكتب السبب`}
          required
          value={gapNote}
          onChange={(e) => onGapNote(e.target.value)}
          placeholder="مثلاً: تعبئة تجربة للعداد بعد الصيانة"
          helper="يصل السبب إلى صاحب المحطة مع الإغلاق"
        />
      )}
    </>
  );
}

/** Closing readings of a leg, with the opening shown above each field. */
export function ClosingReadings({ readings, startedAt, values, checks, onChange }: {
  readings: LegReading[];
  startedAt: string;
  values: Record<string, string>;
  checks: Map<string, ReadingCheck>;
  onChange: (nozzleId: string, value: string) => void;
}) {
  return (
    <>
      {readings.map((r) => {
        const c = checks.get(r.nozzleId) ?? { kind: "empty" as const };
        return (
          <div key={r.nozzleId} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between rounded-md border border-border-default bg-surface-card px-4 py-3">
              <div>
                <p className="text-label-12 text-text-secondary">القراءة الافتتاحية{readings.length > 1 ? ` · ${r.label}` : ""}</p>
                <p className="text-number-m-18">{formatNumber(r.opening, 1)} لتر</p>
              </div>
              <span className="text-body-small-12 text-text-muted">{formatTime(startedAt)}</span>
            </div>
            <Input
              size="lg"
              label={readings.length > 1 ? `القراءة النهائية · ${r.label}` : "القراءة النهائية للعداد"}
              inputMode="decimal"
              autoComplete="off"
              suffix="لتر"
              value={values[r.nozzleId] ?? ""}
              onChange={(e) => onChange(r.nozzleId, e.target.value)}
              {...(c.kind === "invalid" ? { error: "أدخل رقماً صحيحاً، بخانة عشرية واحدة على الأكثر" }
                : c.kind === "lower" ? { error: `أقل من القراءة الافتتاحية بـ ${liters(c.diffTenths)} لتر — أعد قراءة العداد` }
                : { helper: "لا تقل عن القراءة الافتتاحية" })}
            />
          </div>
        );
      })}
    </>
  );
}

/** «يُحسب تلقائياً»: liters and value of the typed readings (a device preview, labelled as an estimate). */
export function AutoTotals({ litersTenths, amountCents, currencyLabel, missingPrice, estimate = true }: {
  litersTenths: number; amountCents: string; currencyLabel: string; missingPrice: boolean;
  /** false when the price came from the server's shift_summary */
  estimate?: boolean;
}) {
  return (
    <div className="rounded-md bg-brand-primary-50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-label-12 text-brand-primary">يُحسب تلقائياً</p>
        {estimate && <StatusBadge tone="info">تقديري</StatusBadge>}
      </div>
      <dl className="mt-2 flex flex-col gap-1">
        <div className="flex justify-between"><dt className="text-body-regular-14">اللترات المباعة</dt>
          <dd className="text-number-m-18">{liters(litersTenths)} لتر</dd></div>
        <div className="flex justify-between"><dt className="text-body-regular-14">قيمة المبيعات</dt>
          <dd className="text-number-m-18">{missingPrice ? "لا يوجد سعر" : formatMoney(amountCents, currencyLabel)}</dd></div>
      </dl>
    </div>
  );
}

/**
 * Meter photo (docs/briefs/06c, delivered in 06e): optional, uploaded immediately while online. One photo
 * documents the whole pump, so `onChange` is called once with the path shared by every nozzle of this
 * opening/closing — never blocks the screen's primary action, online or not.
 */
export function MeterPhotoCard({ title, stationId, legId, nozzleId, kind, value, onChange }: {
  title: string; stationId: string; legId: string; nozzleId: string; kind: PhotoKind;
  value: string | null; onChange: (path: string | null) => void;
}) {
  const [preview, setPreview] = useState<string>();
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(value ? "done" : "idle");
  const [error, setError] = useState<string>();
  const photoId = useRef(newId());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function pick(file: File) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setStatus("uploading");
    setError(undefined);
    const res = await uploadMeterPhoto({ stationId, legId, nozzleId, kind, file, photoId: photoId.current })
      .catch(() => ({ ok: false as const, message: "تعذّر رفع الصورة — يمكنك المتابعة بدون صورة" }));
    if (res.ok) {
      setStatus("done");
      onChange(res.path);
    } else {
      setStatus("error");
      setError(res.message);
      onChange(null);
    }
  }

  function retake() {
    photoId.current = newId();
    inputRef.current?.click();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border-strong bg-surface-card p-3">
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted text-text-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, not a next/image asset
            <img src={preview} alt="" className="size-full object-cover" />
          ) : <CameraIcon />}
        </span>
        <div className="flex-1">
          <p className="text-body-strong-14">{title}</p>
          <p className="text-body-small-12 text-text-secondary">
            {status === "uploading" ? "جارٍ الرفع…" : status === "done" ? "أُرفقت الصورة ✓" : status === "error" ? error : "اختيارية"}
          </p>
        </div>
        {status === "uploading" ? (
          <StatusBadge tone="info">جارٍ الرفع</StatusBadge>
        ) : status === "idle" ? (
          <Button variant="secondary" size="md" onClick={() => inputRef.current?.click()}>إضافة</Button>
        ) : (
          <Button variant="ghost" size="md" onClick={retake}>{status === "error" ? "إعادة المحاولة" : "تغيير"}</Button>
        )}
      </div>
    </div>
  );
}

/** Bottom bar with the screen's one primary action and, when it is disabled, why. */
export function StickyAction({ hint, error, children, disabled, onClick, secondary }: {
  hint?: string; error?: string; children: ReactNode; disabled?: boolean; onClick: () => void; secondary?: ReactNode;
}) {
  return (
    <footer className="fixed inset-x-0 bottom-0 border-t border-border-default bg-surface-card">
      <div className="mx-auto flex w-full max-w-[390px] flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
        {(error || hint) && (
          <p role="status" className={cx("text-center text-body-small-12", error ? "text-status-danger-700" : "text-text-secondary")}>
            {error ?? hint}
          </p>
        )}
        {secondary}
        <Button variant="action" size="lg" block disabled={disabled} onClick={onClick}>{children}</Button>
      </div>
    </footer>
  );
}

/** Wizard steps (S4–S6 design): done ✓, current, next. */
export function Steps({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol className="flex items-start gap-2">
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1 text-center">
            <span className={cx("flex size-9 items-center justify-center rounded-full text-body-strong-14",
              done ? "bg-brand-action text-brand-on-action" : active ? "bg-brand-primary text-white" : "bg-surface-muted text-text-muted")}>
              {done ? <CheckIcon /> : n}
            </span>
            <span className={cx("text-label-11", active ? "text-text-primary" : "text-text-muted")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Tenths of a liter → «7,419.5» */
export function liters(tenths: number): string {
  return formatNumber(tenths / 10, 1);
}

export function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
