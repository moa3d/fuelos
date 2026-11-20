"use client";
// Customer directory's "الأقرب إليّ" button (T1 spec §4). Never calls geolocation on mount — only `ask()`
// does, so a guest who never taps the button is never prompted. Any failure (denied, unavailable API,
// timeout) lands on "denied" rather than throwing, so the list keeps working sorted open-first (Review
// Focus 2 in task-5-brief.md).
import { useState } from "react";
import type { Here } from "./distance";

export type { Here };

export type HereState = "idle" | "asking" | "ok" | "denied";

export function useHere(): { here: Here | null; state: HereState; ask: () => void } {
  const [here, setHere] = useState<Here | null>(null);
  const [state, setState] = useState<HereState>("idle");

  function ask() {
    if (!("geolocation" in navigator)) {
      setHere(null);
      setState("denied");
      return;
    }
    setState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setState("ok");
      },
      () => {
        setHere(null);
        setState("denied");
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return { here, state, ask };
}
