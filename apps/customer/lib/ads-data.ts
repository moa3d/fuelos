// Sponsor ads (docs/briefs/10a; spec §5): active_ads() and record_ad_event() are public (anon + authenticated)
// — no login needed, by design, since guests see the banner too. A failed active_ads() must never block the
// page, so this file never throws; callers get an empty list instead.
import { supabase } from "./supabase.ts";

const AD_IMAGES_BUCKET = "ad-images";
const VIEWER_KEY_STORAGE = "fuelos.ad_viewer";

export function adImageUrl(imagePath: string): string {
  return supabase().storage.from(AD_IMAGES_BUCKET).getPublicUrl(imagePath).data.publicUrl;
}

export type ActiveAd = { id: string; sponsorName: string; title: string; imagePath: string; linkUrl: string | null; sortOrder: number };
type Num = number | string;
type RawAd = { id: string; sponsor_name: string; title: string; image_path: string; link_url: string | null; sort_order: Num };

/** Never throws — a guest's banner simply shows nothing on any failure (brief 10a / spec §5). */
export async function loadActiveAds(): Promise<ActiveAd[]> {
  try {
    const { data, error } = await supabase().rpc("active_ads").abortSignal(AbortSignal.timeout(15_000));
    if (error || !Array.isArray(data)) return [];
    return (data as RawAd[]).map((r) => ({
      id: r.id, sponsorName: r.sponsor_name, title: r.title, imagePath: r.image_path,
      linkUrl: r.link_url, sortOrder: Number(r.sort_order),
    }));
  } catch {
    return [];
  }
}

let sessionViewerKey: string | undefined;

/** A random UUID kept in localStorage so repeat visits from the same device don't inflate counts; wrapped in
 * try/catch (private browsing, blocked storage) with a per-session fallback that still de-dupes within one
 * page load but not across visits. */
export function getViewerKey(): string {
  try {
    const existing = localStorage.getItem(VIEWER_KEY_STORAGE);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(VIEWER_KEY_STORAGE, fresh);
    return fresh;
  } catch {
    sessionViewerKey ??= crypto.randomUUID();
    return sessionViewerKey;
  }
}

/** Fire-and-forget by design (brief 10a): the caller never awaits this for the UI to proceed, and a failure
 * (network, paused ad, abuse-guard full table) is silently swallowed — ads tracking never blocks or errors
 * toward the customer. */
export function recordAdEvent(adId: string, kind: "view" | "click", viewerKey: string): void {
  supabase().rpc("record_ad_event", { p_ad: adId, p_kind: kind, p_viewer: viewerKey }).then(() => undefined, () => undefined);
}
