// Customer directory (T1/T2): parsing public_stations() rows, the fuel/open/available filters, and the
// nearest/open-then-name sort. Type-only imports only (erased by Node's type stripping), so this still
// runs under `node --test` with no runtime module resolution — same spirit as prices-rules.ts's
// "no imports" header, without redefining types that already exist elsewhere.
import type { CrowdLevel, OpenSource } from "@fuelos/core";
import type { Availability } from "./prices-rules";

export type DirectoryProduct = {
  productId: string; name: string; price: string | null; priceUpdatedAt: string | null;
  availability: Availability | null; availabilitySource: "computed" | "manual" | null;
  availabilityUpdatedAt: string | null;
};

export type DirectoryStation = {
  stationId: string; name: string; city: string | null; address: string | null;
  lat: number | null; lng: number | null;
  isOpen: boolean | null; openSource: OpenSource | null; openSetAt: string | null;
  crowd: CrowdLevel | null; crowdSetAt: string | null;
  products: DirectoryProduct[];
};

export type Here = { lat: number; lng: number };

// ---------- parsing ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function parseProduct(v: unknown): DirectoryProduct | null {
  if (!isRecord(v)) return null;
  const productId = str(v.product_id);
  if (productId === null) return null;
  const availability = v.availability === "available" || v.availability === "limited" || v.availability === "unavailable" ? v.availability : null;
  const availabilitySource = v.availability_source === "computed" || v.availability_source === "manual" ? v.availability_source : null;
  const price = typeof v.price === "string" || typeof v.price === "number" ? String(v.price) : null;
  return {
    productId, name: str(v.name) ?? "", price, priceUpdatedAt: str(v.price_updated_at),
    availability, availabilitySource, availabilityUpdatedAt: str(v.availability_updated_at),
  };
}

/** Parses `public_stations()`'s jsonb rows. Bad/missing rows (or a non-array payload) are skipped, never thrown. */
export function parseStations(json: unknown): DirectoryStation[] {
  if (!Array.isArray(json)) return [];
  const out: DirectoryStation[] = [];
  for (const row of json) {
    if (!isRecord(row)) continue;
    const stationId = str(row.station_id);
    if (stationId === null) continue;
    const openSource = row.open_source === "manual" || row.open_source === "shift" ? row.open_source : null;
    const crowd = row.crowd === "none" || row.crowd === "medium" || row.crowd === "high" ? row.crowd : null;
    const products = Array.isArray(row.products)
      ? row.products.map(parseProduct).filter((p): p is DirectoryProduct => p !== null)
      : [];
    out.push({
      stationId, name: str(row.name) ?? "", city: str(row.city), address: str(row.address),
      lat: num(row.lat), lng: num(row.lng),
      isOpen: bool(row.is_open), openSource, openSetAt: str(row.open_set_at),
      crowd, crowdSetAt: str(row.crowd_set_at),
      products,
    });
  }
  return out;
}

/** Unique product names across every station, Arabic-sorted — feeds the fuel filter chips. */
export function fuelNames(list: DirectoryStation[]): string[] {
  const names = new Set<string>();
  for (const s of list) for (const p of s.products) names.add(p.name);
  return [...names].sort((a, b) => a.localeCompare(b, "ar"));
}

// ---------- filtering ----------

export type Filters = { fuel: string | null; openOnly: boolean; availableOnly: boolean };

/** `fuel` narrows kept stations' `products` to the match; `openOnly`/`availableOnly` keep as described. */
export function filterStations(list: DirectoryStation[], f: Filters): DirectoryStation[] {
  let out = list;
  if (f.fuel !== null) {
    out = out
      .filter((s) => s.products.some((p) => p.name === f.fuel))
      .map((s) => ({ ...s, products: s.products.filter((p) => p.name === f.fuel) }));
  }
  if (f.openOnly) out = out.filter((s) => s.isOpen === true);
  if (f.availableOnly) out = out.filter((s) => s.products.some((p) => p.availability === "available"));
  return out;
}

// ---------- sorting ----------

function haversineKm(a: Here, b: Here): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** With `here`: nearest first, stations without coordinates last. Without it: open stations first, then Arabic name. */
export function sortStations(list: DirectoryStation[], here: Here | null): DirectoryStation[] {
  const out = [...list];
  if (here) {
    out.sort((a, b) => {
      const da = a.lat !== null && a.lng !== null ? haversineKm(here, { lat: a.lat, lng: a.lng }) : Infinity;
      const db = b.lat !== null && b.lng !== null ? haversineKm(here, { lat: b.lat, lng: b.lng }) : Infinity;
      return da - db;
    });
  } else {
    out.sort((a, b) => {
      if (a.isOpen === true && b.isOpen !== true) return -1;
      if (b.isOpen === true && a.isOpen !== true) return 1;
      return a.name.localeCompare(b.name, "ar");
    });
  }
  return out;
}
