"use client";
// T2 — خريطة المحطات (design/screens/T2.png). Shell: loads stations, handles states, dynamically
// imports StationMap with ssr:false so Leaflet never enters the SSR bundle or the home page's chunk.
import { AlertBanner } from "@fuelos/ui";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { loadStations, type StationsData } from "@/lib/stations-data";
import { useHere } from "@/lib/use-here";

// Dynamic import keeps Leaflet entirely out of every other page's bundle.
const StationMap = dynamic(() => import("./station-map"), { ssr: false });

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: StationsData };

export default function MapPage() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const { here, state: hereState, ask } = useHere();

  useEffect(() => {
    let alive = true;
    loadStations().then(
      (data) => { if (alive) setLoad({ status: "ready", data }); },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  const stations = load.status === "ready" ? load.data.stations : [];
  const mappable = stations.filter((s) => s.lat !== null && s.lng !== null);

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border-default bg-surface-card px-4">
        <Link
          href="/"
          aria-label="رجوع"
          className="inline-flex size-11 items-center justify-center rounded-full bg-surface-muted text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
        >
          <Icon name="chevron-left" size={20} className="rtl:rotate-180" />
        </Link>
        <h1 className="text-heading-h1-24 text-text-primary">الخريطة</h1>
      </header>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden">
        {load.status === "loading" && (
          <div className="flex h-full items-center justify-center" aria-busy>
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
          </div>
        )}

        {load.status === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
            <AlertBanner
              tone="danger"
              title="تعذّر تحميل المحطات"
              action={
                <button
                  type="button"
                  onClick={refresh}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong bg-surface-card px-4 text-body-strong-14 text-text-primary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                >
                  إعادة المحاولة
                </button>
              }
            >
              تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
            </AlertBanner>
          </div>
        )}

        {load.status === "ready" && mappable.length === 0 && (
          <div className="flex h-full items-center justify-center p-6">
            <p className="rounded-[18px] border border-border-default bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">
              لا محطات لعرضها على الخريطة
            </p>
          </div>
        )}

        {load.status === "ready" && mappable.length > 0 && (
          <StationMap
            stations={stations}
            here={here}
            hereState={hereState}
            ask={ask}
          />
        )}
      </div>
    </div>
  );
}
