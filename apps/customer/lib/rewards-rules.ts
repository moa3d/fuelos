// C6 «مكافآتي والعروض» helpers. No imports, so `node --test` runs it directly.

export type OfferStatus = "active" | "expired";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** design/screens/C6.png: فعّال / منتهٍ. There's no per-customer eligibility signal yet (see docs/briefs/04g),
 * so this is just whether the offer's own window is still open — not personalized "متاح لك". */
export function offerStatus(startsAt: string, endsAt: string, nowMs: number): OfferStatus {
  return Date.parse(endsAt) > nowMs && Date.parse(startsAt) <= nowMs ? "active" : "expired";
}

export function offerBadge(status: OfferStatus): { tone: Tone; label: string } {
  return status === "active" ? { tone: "success", label: "فعّال" } : { tone: "neutral", label: "منتهٍ" };
}

export type Tier = { title: string; pointsThreshold: number };

/** The nearest active tier still above the balance — null once every tier is already reached (or there are
 * none). Points are per station (docs/briefs/06a), so this is evaluated per station too. */
export function nextTier(tiers: Tier[], balance: number): { title: string; pointsNeeded: number } | null {
  const ahead = tiers.filter((t) => t.pointsThreshold > balance).sort((a, b) => a.pointsThreshold - b.pointsThreshold);
  return ahead[0] ? { title: ahead[0].title, pointsNeeded: ahead[0].pointsThreshold - balance } : null;
}
