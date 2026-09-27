// C5 «سيارتي ومصروفي» helpers: month grouping, fill-to-fill distance, consumption and cost per km. No
// imports, so `node --test` runs it directly. All computed only from real odometer readings — null (not a
// guess) whenever there isn't enough data.

export type Fill = { receivedAt: string; amount: number; liters: number; odometerKm: number | null };

/** "2026-09" from an ISO timestamp — for grouping fills by month. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** The last `count` month keys ending with `iso`'s month, oldest first. */
export function lastMonthKeys(iso: string, count: number): string[] {
  const d = new Date(iso);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function spendByMonth(fills: Fill[], months: string[]): { month: string; amount: number }[] {
  return months.map((m) => ({ month: m, amount: fills.filter((f) => monthKey(f.receivedAt) === m).reduce((s, f) => s + f.amount, 0) }));
}

/**
 * Distance since the previous fill, oldest-first order assumed. Null when either odometer reading is
 * missing or the reading didn't increase (a reset, a correction, or simply never recorded).
 */
export function distancesSinceLast(fillsAscending: Fill[]): (number | null)[] {
  return fillsAscending.map((f, i) => {
    if (i === 0) return null;
    const prev = fillsAscending[i - 1].odometerKm;
    return prev !== null && f.odometerKm !== null && f.odometerKm > prev ? f.odometerKm - prev : null;
  });
}

/** L/100km for one fill-to-fill leg, one decimal place. Null without a usable distance. */
export function consumptionPer100km(liters: number, distanceKm: number | null): number | null {
  if (!distanceKm || distanceKm <= 0) return null;
  return Math.round((liters / distanceKm) * 1000) / 10;
}

/** Cost per km for one leg, one decimal place. Null without a usable distance. */
export function costPerKm(amount: number, distanceKm: number | null): number | null {
  if (!distanceKm || distanceKm <= 0) return null;
  return Math.round((amount / distanceKm) * 10) / 10;
}

/** Plain average of the non-null values; null when there are none. */
export function averageOf(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  if (v.length === 0) return null;
  return Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10;
}
