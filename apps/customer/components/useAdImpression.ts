"use client";
// Shared by the home banner and the /ads list: fires `onVisible` once, the first time the returned ref's
// element is at least 50% on screen (brief 10a / spec §5), then disconnects — never fires twice for the
// same mount.
import { useEffect, useRef } from "react";

export function useAdImpression<T extends HTMLElement>(onVisible: () => void, enabled = true) {
  const ref = useRef<T>(null);
  const fired = useRef(false);
  const callback = useRef(onVisible);
  useEffect(() => { callback.current = onVisible; }, [onVisible]);

  useEffect(() => {
    if (!enabled || fired.current) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!fired.current && entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          fired.current = true;
          callback.current();
          observer.disconnect();
        }
      }
    }, { threshold: [0.5] });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  return ref;
}
