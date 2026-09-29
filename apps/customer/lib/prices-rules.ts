// C1 (guest price board) helpers: the availability badge and grouping public_station_prices rows by
// station. No imports, so `node --test` runs it directly.

export type Availability = "available" | "limited" | "unavailable";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export const CURRENCY_LABEL: Record<string, string> = { SYP: "ل.س" };
export function currencyLabel(code: string): string {
  return CURRENCY_LABEL[code] ?? code;
}

/** «متوفر» / «كمية محدودة» / «غير متوفر» — design/screens/C1.png, C2.png. */
export function availabilityBadge(status: Availability): { tone: Tone; label: string } {
  switch (status) {
    case "available": return { tone: "success", label: "متوفر" };
    case "limited": return { tone: "warning", label: "كمية محدودة" };
    case "unavailable": return { tone: "neutral", label: "غير متوفر" };
  }
}

export type PriceRow = {
  station_id: string; station_name: string; city: string | null; currency_code: string;
  product_id: string; product_name: string; price: string | number | null;
  price_updated_at: string | null; availability: Availability | null; availability_source: "computed" | "manual" | null;
  availability_updated_at: string | null; lat: number | null; lng: number | null;
};

export type Product = {
  productId: string; name: string; price: string | number | null; updatedAt: string | null;
  availability: Availability | null; source: "computed" | "manual" | null;
};
export type Station = {
  stationId: string; name: string; city: string | null; currency: string; products: Product[];
  lat: number | null; lng: number | null;
};

/** google maps deep link for a station with both lat/lng set (docs/briefs/06a); null when either is missing. */
export function mapUrl(lat: number | null, lng: number | null): string | null {
  return lat !== null && lng !== null ? `https://www.google.com/maps?q=${lat},${lng}` : null;
}

/** Groups public_station_prices rows by station, each station's products sorted by name. */
export function groupByStation(rows: PriceRow[]): Station[] {
  const byId = new Map<string, Station>();
  for (const r of rows) {
    let s = byId.get(r.station_id);
    if (!s) {
      s = { stationId: r.station_id, name: r.station_name, city: r.city, currency: currencyLabel(r.currency_code), products: [], lat: r.lat ?? null, lng: r.lng ?? null };
      byId.set(r.station_id, s);
    }
    s.products.push({ productId: r.product_id, name: r.product_name, price: r.price, updatedAt: r.price_updated_at, availability: r.availability, source: r.availability_source });
  }
  const stations = [...byId.values()];
  for (const s of stations) s.products.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  return stations.sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
