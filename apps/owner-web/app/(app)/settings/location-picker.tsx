"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";

interface Props {
  lat: string;
  lng: string;
  disabled?: boolean;
  onChange: (lat: string, lng: string) => void;
}

const DAMASCUS: [number, number] = [33.5138, 36.2765];
const CITY_ZOOM = 11;
const DETAIL_ZOOM = 15;

function pinIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function addMarker(
  map: L.Map,
  lat: number,
  lng: number,
  draggable: boolean,
  onDragEnd: (lat: string, lng: string) => void,
): L.Marker {
  const marker = L.marker([lat, lng], { icon: pinIcon(), draggable }).addTo(map);
  marker.on("dragend", () => {
    const p = marker.getLatLng();
    onDragEnd(p.lat.toFixed(6), p.lng.toFixed(6));
  });
  return marker;
}

function parseCoords(lat: string, lng: string): [number, number] | null {
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!lat.trim() || !lng.trim() || Number.isNaN(latN) || Number.isNaN(lngN)) return null;
  return [latN, lngN];
}

export function LocationPicker({ lat, lng, disabled, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  const [offline, setOffline] = useState(() => typeof window !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Map initialization — runs on mount and when coming back online
  useEffect(() => {
    if (!containerRef.current || offline) return;

    const map = L.map(containerRef.current, { attributionControl: true });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const coords = parseCoords(lat, lng);
    if (coords) {
      map.setView(coords, DETAIL_ZOOM);
      markerRef.current = addMarker(map, coords[0], coords[1], !disabled, (a, b) => onChangeRef.current(a, b));
    } else {
      map.setView(DAMASCUS, CITY_ZOOM);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          ({ coords: c }) => {
            if (!mapRef.current) return;
            map.setView([c.latitude, c.longitude], DETAIL_ZOOM);
            if (!markerRef.current && !disabled) {
              markerRef.current = addMarker(map, c.latitude, c.longitude, true, (a, b) =>
                onChangeRef.current(a, b),
              );
              onChangeRef.current(c.latitude.toFixed(6), c.longitude.toFixed(6));
            }
          },
          () => { /* silent: map already on Damascus */ },
          { timeout: 8000 },
        );
      }
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (disabled) return;
      const { lat: clickLat, lng: clickLng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([clickLat, clickLng]);
      } else {
        markerRef.current = addMarker(map, clickLat, clickLng, true, (a, b) => onChangeRef.current(a, b));
      }
      onChangeRef.current(clickLat.toFixed(6), clickLng.toFixed(6));
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  // Sync marker when parent updates lat/lng (manual input or clear)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const coords = parseCoords(lat, lng);
    if (coords) {
      if (markerRef.current) {
        markerRef.current.setLatLng(coords);
      } else {
        markerRef.current = addMarker(map, coords[0], coords[1], !disabled, (a, b) =>
          onChangeRef.current(a, b),
        );
      }
      map.setView(coords, Math.max(map.getZoom(), CITY_ZOOM));
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  function centerOnMe() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => {
        const map = mapRef.current;
        if (!map) return;
        map.setView([c.latitude, c.longitude], DETAIL_ZOOM);
        if (!disabled) {
          if (markerRef.current) {
            markerRef.current.setLatLng([c.latitude, c.longitude]);
          } else {
            markerRef.current = addMarker(map, c.latitude, c.longitude, true, (a, b) =>
              onChangeRef.current(a, b),
            );
          }
          onChangeRef.current(c.latitude.toFixed(6), c.longitude.toFixed(6));
        }
      },
      () => {},
      { timeout: 8000 },
    );
  }

  if (offline) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-lg border border-border-muted bg-surface-muted">
        <p className="px-4 text-center text-body-small-12 text-text-secondary">
          تعذّر تحميل الخريطة — أنت غير متصل بالإنترنت
          <br />
          يمكنك إدخال الإحداثيات يدوياً في الحقول أدناه
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-small-12 text-text-secondary">انقر على الخريطة أو اسحب الدبوس لتحديد الموقع</span>
        <button
          type="button"
          onClick={centerOnMe}
          className="min-h-11 rounded-sm px-3 text-body-small-12 text-brand-primary hover:bg-brand-primary-50 focus-visible:outline-2 focus-visible:outline-brand-primary"
        >
          تمركز على موقعي الحالي
        </button>
      </div>
      <div ref={containerRef} className="h-[280px] overflow-hidden rounded-lg border border-border-muted" />
    </div>
  );
}
