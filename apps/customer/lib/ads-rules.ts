// Sponsor ads (docs/briefs/10a; spec §5): carousel index math and swipe-gesture detection for the home banner,
// plus the small per-ad display rules shared by the banner and the /ads page. No imports, so `node --test`
// runs it directly.

export function nextIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return (current + 1) % length;
}

export function prevIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return (current - 1 + length) % length;
}

/** Clamp a stale index after the ad list reloads with fewer items (e.g. one paused mid-session). */
export function clampIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(current, 0), length - 1);
}

export type SwipeDir = "next" | "prev" | null;

/** A horizontal swipe past the threshold picks a direction; RTL means a left-to-right drag (positive delta)
 * reveals the NEXT slide, same as a right-to-left reading flow's forward swipe. Below the threshold, null —
 * the caller treats it as a tap, not a swipe. */
export function swipeDirection(deltaX: number, threshold = 40): SwipeDir {
  if (Math.abs(deltaX) < threshold) return null;
  return deltaX > 0 ? "next" : "prev";
}

export function adCaption(sponsorName: string): string {
  return `إعلان · ${sponsorName}`;
}

export function isClickable(linkUrl: string | null): boolean {
  return !!linkUrl && linkUrl.trim() !== "";
}
