// Haversine great-circle distance for the customer directory's "nearest first" sort and the distance pill
// shown on each station card (design/screens/T1/T2). No imports, so `node --test` runs it directly.

export type Here = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points, in kilometers. */
export function distanceKm(a: Here, b: Here): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** «≈ 900 م» under 1km (nearest 100m); «≈ 2.4 كم» at 1km and over (one decimal). */
export function formatDistance(km: number): string {
  if (km < 1) {
    const meters = Math.round((km * 1000) / 100) * 100;
    return `≈ ${meters} م`;
  }
  return `≈ ${km.toFixed(1)} كم`;
}
