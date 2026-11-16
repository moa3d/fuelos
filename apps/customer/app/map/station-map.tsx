"use client";
// T2 — خريطة المحطات (design/screens/T2.png). Leaflet + OpenStreetMap, coloured dot markers,
// bottom sheet on pin tap. Imported via next/dynamic with ssr:false from map/page.tsx so Leaflet
// never touches the SSR bundle (and stays out of the home page's chunk).
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { formatMoney, openBadge, crowdBadge } from "@fuelos/core";
import { Button, StatusBadge } from "@fuelos/ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { currencyLabel, mapUrl } from "@/lib/prices-rules";
import type { DirectoryStation } from "@/lib/stations-rules";
import type { Here, HereState } from "@/lib/use-here";

// ---------- helpers ----------

function dotColor(s: DirectoryStation): string {
  if (s.isOpen === false) return "#9ca3af";
  if (s.products.some((p) => p.availability === "available")) return "#22c55e";
  if (s.products.some((p) => p.availability === "limited")) return "#f59e0b";
  return "#9ca3af";
}

function makeIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.35)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function cheapestAvailable(s: DirectoryStation): string | null {
  const prices = s.products
    .filter((p) => p.availability === "available" && p.price !== null)
    .map((p) => Number(p.price));
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  return formatMoney(String(min), currencyLabel("SYP"));
}

// ---------- component ----------

export type StationMapProps = {
  stations: DirectoryStation[];
  here: Here | null;
  hereState: HereState;
  ask: () => void;
};

export default function StationMap({ stations, here, hereState, ask }: StationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [selected, setSelected] = useState<DirectoryStation | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Determine initial view
    const mapped = stations.filter((s) => s.lat !== null && s.lng !== null);

    let initialCenter: L.LatLngExpression;
    let initialZoom: number;

    if (hereState === "ok" && here !== null) {
      initialCenter = [here.lat, here.lng];
      initialZoom = 13;
    } else if (mapped.length > 0) {
      // Will use fitBounds below; set a temporary value
      initialCenter = [mapped[0].lat!, mapped[0].lng!];
      initialZoom = 10;
    } else {
      // Damascus fallback
      initialCenter = [33.5138, 36.2765];
      initialZoom = 10;
    }

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: true,
    });

    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Fit to bounding box when no user location
    if (hereState !== "ok" && mapped.length > 1) {
      const bounds = L.latLngBounds(mapped.map((s) => [s.lat!, s.lng!]));
      map.fitBounds(bounds, { padding: [32, 32] });
    }

    // Add markers for stations with coords (skip null-coord stations entirely)
    for (const s of mapped) {
      const marker = L.marker([s.lat!, s.lng!], { icon: makeIcon(dotColor(s)) });
      marker.on("click", () => setSelected(s));
      marker.addTo(map);
    }

    // Click on the map tile layer deselects
    map.on("click", () => setSelected(null));

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount; stations/here are captured at mount time

  function handleLocate() {
    if (hereState === "ok" && here !== null && mapRef.current) {
      mapRef.current.setView([here.lat, here.lng], 13);
    } else {
      ask();
    }
  }

  const open = selected ? openBadge(selected.isOpen) : null;
  const crowd = selected?.crowd != null ? crowdBadge(selected.crowd) : null;
  const price = selected ? cheapestAvailable(selected) : null;
  const dirUrl = selected ? mapUrl(selected.lat, selected.lng) : null;

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full">
      {/* Map container */}
      <div ref={containerRef} className="h-full w-full" />

      {/* موقعي button — floating top-start */}
      <div className="absolute start-4 top-4 z-[1000]">
        <Button
          variant="secondary"
          onClick={handleLocate}
          aria-busy={hereState === "asking"}
          disabled={hereState === "asking"}
          className="flex min-h-11 items-center gap-1.5 shadow-md"
        >
          <Icon name="pin" size={16} />
          موقعي
        </Button>
      </div>

      {/* Bottom sheet */}
      {selected && (
        <div
          className="absolute inset-x-0 bottom-0 z-[1000] rounded-t-2xl border-t border-border-default bg-surface-card p-4 shadow-[0_-4px_16px_rgba(0,0,0,.1)]"
          role="dialog"
          aria-label={selected.name}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label="إغلاق"
            className="absolute end-4 top-4 inline-flex size-11 items-center justify-center rounded-full bg-surface-muted text-text-secondary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            <Icon name="plus" size={16} className="rotate-45" />
          </button>

          {/* Name + badges */}
          <div className="mb-3 pe-10">
            <h2 className="text-heading-h1-24 text-text-primary">{selected.name}</h2>
            {(open || crowd) && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {open && <StatusBadge tone={open.tone}>{open.label}</StatusBadge>}
                {crowd && <StatusBadge tone={crowd.tone}>{crowd.label}</StatusBadge>}
              </div>
            )}
          </div>

          {/* Cheapest available price */}
          {price && (
            <p className="mb-3 text-body-regular-14 text-text-secondary">
              أرخص سعر متوفر:{" "}
              <span className="text-body-strong-14 text-text-primary">{price}</span>
            </p>
          )}

          {/* Action links */}
          <div className="flex items-center gap-3">
            <Link
              href={`/station/${selected.stationId}`}
              className="inline-flex min-h-11 items-center justify-center rounded-sm border border-border-strong bg-surface-card px-4 text-body-strong-14 text-text-primary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              التفاصيل
            </Link>
            {dirUrl && (
              <a
                href={dirUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-sm border border-border-strong bg-surface-card px-4 text-body-strong-14 text-text-primary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
              >
                <Icon name="external" size={16} className="me-1.5" />
                الاتجاهات
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
