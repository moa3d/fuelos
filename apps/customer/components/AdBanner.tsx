"use client";
// Home banner (C1, guests included) — docs/briefs/10a; spec §5. Hidden entirely once loaded with no ads, and
// a failed active_ads() (lib/ads-data.ts never throws) renders the same way: nothing. 16:9, auto-advances
// every 5s, swipe on touch, dots, pauses while touched.
import Link from "next/link";
import { useEffect, useRef, useState, type TouchEvent } from "react";
import { adImageUrl, getViewerKey, loadActiveAds, recordAdEvent, type ActiveAd } from "@/lib/ads-data";
import { adCaption, clampIndex, isClickable, nextIndex, prevIndex, swipeDirection } from "@/lib/ads-rules";
import { useAdImpression } from "./useAdImpression";

const AUTO_ADVANCE_MS = 5000;

export function AdBanner() {
  const [ads, setAds] = useState<ActiveAd[]>();
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const seenViews = useRef(new Set<string>());

  useEffect(() => { loadActiveAds().then(setAds); }, []);

  const [bannerVisible, setBannerVisible] = useState(false);
  const containerRef = useAdImpression<HTMLDivElement>(() => setBannerVisible(true), (ads?.length ?? 0) > 0);

  // auto-advance, paused while the banner is touched or hidden off-screen
  useEffect(() => {
    if (!ads || ads.length < 2 || paused) return;
    const id = setInterval(() => setCurrent((c) => nextIndex(c, ads.length)), AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [ads, paused]);

  // record one view per ad per page load, for whichever ad is current while the banner is ≥50% visible
  useEffect(() => {
    if (!bannerVisible || !ads || ads.length === 0) return;
    const ad = ads[clampIndex(current, ads.length)];
    if (!ad || seenViews.current.has(ad.id)) return;
    seenViews.current.add(ad.id);
    recordAdEvent(ad.id, "view", getViewerKey());
  }, [bannerVisible, ads, current]);

  if (!ads || ads.length === 0) return null;
  const list = ads; // a plain const (unlike `ads` itself) so TS keeps it narrowed as non-undefined inside the closures below
  const index = clampIndex(current, list.length);

  function onTouchStart(e: TouchEvent) {
    setPaused(true);
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    setPaused(false);
    if (start === null) return;
    const delta = (e.changedTouches[0]?.clientX ?? start) - start;
    const dir = swipeDirection(delta);
    if (dir === "next") setCurrent((c) => nextIndex(c, list.length));
    else if (dir === "prev") setCurrent((c) => prevIndex(c, list.length));
  }

  function onClickAd(ad: ActiveAd) {
    recordAdEvent(ad.id, "click", getViewerKey());
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <div
        className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface-muted"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {ads.map((ad, i) => {
          const clickable = isClickable(ad.linkUrl);
          const slideClass = "absolute inset-0 transition-transform duration-300 ease-out";
          const style = { transform: `translateX(${(i - index) * 100}%)` };
          const content = (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage public URL */}
              <img src={adImageUrl(ad.imagePath)} alt={ad.title} loading={i === 0 ? "eager" : "lazy"}
                className="size-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-body-small-12 text-white">
                {adCaption(ad.sponsorName)}
              </span>
            </>
          );
          return clickable ? (
            <Link key={ad.id} href={ad.linkUrl!} target="_blank" rel="noopener noreferrer sponsored"
              onClick={() => onClickAd(ad)} className={slideClass} style={style} aria-hidden={i !== index}>
              {content}
            </Link>
          ) : (
            <div key={ad.id} className={slideClass} style={style} aria-hidden={i !== index}>
              {content}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="flex gap-1.5" role="tablist" aria-label="الإعلانات">
          {ads.map((ad, i) => (
            <button key={ad.id} role="tab" aria-selected={i === index} aria-label={`الإعلان ${i + 1}`}
              onClick={() => setCurrent(i)}
              className={`size-1.5 rounded-full ${i === index ? "bg-brand-primary" : "bg-border-strong"}`} />
          ))}
        </div>
        <Link href="/ads" className="text-body-small-12 text-brand-primary">عرض الكل</Link>
      </div>
    </div>
  );
}
