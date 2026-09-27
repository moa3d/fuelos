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
