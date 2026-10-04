"use client";
// Shared meter-photo gallery + lightbox — O7 (الموافقات) and O1 («آخر المناوبات»). One row of thumbnails for
// «الافتتاح» and one for «الإغلاق» under a pump; clicking a thumbnail opens it full-size with the reading it
// documents, prev/next, and Esc/backdrop to close. lib/photo-rules.ts does the merge/dedupe/sort; this
// component only presents whatever shots it's given.
import { formatDay, formatNumber, formatTime } from "@fuelos/core";
import { useEffect, useState } from "react";
import type { PhotoShot } from "@/lib/photo-rules";

export type DisplayShot = PhotoShot & { url: string | undefined };

const KIND_LABEL: Record<PhotoShot["kind"], string> = { opening: "الافتتاح", closing: "الإغلاق" };

export function MeterPhotos({ pumpNumber, shots, onRetry }: {
  pumpNumber: number;
  shots: DisplayShot[];
  /** the signed URL expired (img onError) or was never resolved — ask the parent for a fresh one. Parent is
   * responsible for only actually re-signing once per path. */
  onRetry: (path: string) => void;
}) {
  const opening = shots.filter((s) => s.kind === "opening");
  const closing = shots.filter((s) => s.kind === "closing");
  const all = [...opening, ...closing];
  const [openIndex, setOpenIndex] = useState<number>();

  if (shots.length === 0) {
    return <p className="text-body-small-12 text-text-muted">لا صور عداد لهذه المضخة.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {opening.length > 0 && (
        <PhotoRow kind="opening" pumpNumber={pumpNumber} items={opening} onOpen={(s) => setOpenIndex(all.indexOf(s))} onRetry={onRetry} />
      )}
      {closing.length > 0 && (
        <PhotoRow kind="closing" pumpNumber={pumpNumber} items={closing} onOpen={(s) => setOpenIndex(all.indexOf(s))} onRetry={onRetry} />
      )}
      {openIndex !== undefined && (
        <Lightbox shots={all} index={openIndex} pumpNumber={pumpNumber}
          onClose={() => setOpenIndex(undefined)} onNavigate={setOpenIndex} onRetry={onRetry} />
      )}
    </div>
  );
}

function readingsText(shot: PhotoShot): string {
  return shot.readings.map((r) => `${r.nozzleLabel}: ${formatNumber(r.value, 1)}`).join(" · ");
}

function PhotoRow({ kind, pumpNumber, items, onOpen, onRetry }: {
  kind: PhotoShot["kind"]; pumpNumber: number; items: DisplayShot[]; onOpen: (s: DisplayShot) => void; onRetry: (path: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-label-11 text-text-secondary">{KIND_LABEL[kind]}</p>
      <div className="flex flex-wrap gap-3">
        {items.map((s) => (
          <button key={s.path} type="button" onClick={() => onOpen(s)} className="flex w-24 flex-col items-center gap-1 text-start">
            <span className="flex size-24 items-center justify-center overflow-hidden rounded-md border border-border-default bg-surface-muted">
              {s.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL, not a next/image asset
                <img src={s.url} alt={`مضخة ${pumpNumber} — صورة ${KIND_LABEL[kind]}`} loading="lazy"
                  className="size-full object-cover" onError={() => onRetry(s.path)} />
              ) : (
                <span className="text-label-11 text-text-muted">…</span>
              )}
            </span>
            <span dir="ltr" className="w-full truncate text-label-11 text-text-secondary" title={readingsText(s)}>{readingsText(s)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Lightbox({ shots, index, pumpNumber, onClose, onNavigate, onRetry }: {
  shots: DisplayShot[]; index: number; pumpNumber: number;
  onClose: () => void; onNavigate: (i: number) => void; onRetry: (path: string) => void;
}) {
  const shot = shots[index];
  const prev = () => onNavigate((index - 1 + shots.length) % shots.length);
  const next = () => onNavigate((index + 1) % shots.length);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prev/next close over index/shots.length, recreated with them
  }, [index, shots.length]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`صورة مضخة ${pumpNumber} — ${KIND_LABEL[shot.kind]}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative flex max-h-full w-full max-w-2xl flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="absolute -top-10 end-0 text-body-strong-14 text-white">✕ إغلاق</button>

        <div className="flex items-center gap-2 text-body-regular-14 text-white">
          <span>مضخة {pumpNumber}</span><span aria-hidden>·</span><span>{KIND_LABEL[shot.kind]}</span>
          {shot.at && (<><span aria-hidden>·</span><span dir="ltr">{formatDay(shot.at)} {formatTime(shot.at)}</span></>)}
        </div>

        <div className="flex w-full items-center justify-center">
          {shot.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL, not a next/image asset
            <img src={shot.url} alt={`مضخة ${pumpNumber} — صورة ${KIND_LABEL[shot.kind]}`}
              className="max-h-[65vh] max-w-full rounded-md object-contain" onError={() => onRetry(shot.path)} />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center text-body-regular-14 text-white">جارٍ التحميل…</div>
          )}
        </div>

        <p dir="ltr" className="text-body-small-12 text-white/80">{readingsText(shot)}</p>

        {shots.length > 1 && (
          <div className="flex items-center gap-4">
            <button type="button" onClick={prev} aria-label="الصورة السابقة" className="rounded-full bg-white/10 px-4 py-2 text-body-strong-14 text-white hover:bg-white/20">‹ السابق</button>
            <span className="text-body-small-12 text-white/70" dir="ltr">{index + 1} / {shots.length}</span>
            <button type="button" onClick={next} aria-label="الصورة التالية" className="rounded-full bg-white/10 px-4 py-2 text-body-strong-14 text-white hover:bg-white/20">التالي ›</button>
          </div>
        )}
      </div>
    </div>
  );
}
