"use client";
// «الإعلانات» — docs/briefs/10a; spec §5. Public like C1/C2 (active_ads() is anon-accessible): every running
// ad, stacked, each with its image, title and «إعلان · sponsor». A failed load just shows an empty state,
// never an error — the same ads never block anything philosophy as the home banner.
import { AlertBanner } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { useAdImpression } from "@/components/useAdImpression";
import { adImageUrl, getViewerKey, loadActiveAds, recordAdEvent, type ActiveAd } from "@/lib/ads-data";
import { adCaption, isClickable } from "@/lib/ads-rules";
import { customerAccess, type CustomerAccess } from "@/lib/customer-access";

type Load = { status: "loading" } | { status: "ready"; ads: ActiveAd[] };

export default function AdsPage() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [access, setAccess] = useState<CustomerAccess>();

  useEffect(() => { customerAccess().then(setAccess, () => setAccess({ kind: "error" })); }, []);
  useEffect(() => { loadActiveAds().then((ads) => setLoad({ status: "ready", ads })); }, []);

  const signedIn = access?.kind === "customer";

  return (
    <div className={`mx-auto flex max-w-[480px] flex-col gap-4 p-4 ${signedIn ? "pb-24" : "pb-10"}`}>
      <button type="button" onClick={() => router.back()} className="self-start text-body-strong-14 text-text-secondary">→ رجوع</button>

      <header>
        <h1 className="text-heading-h1-24">الإعلانات</h1>
      </header>

      {load.status === "loading" && (
        <div aria-busy className="flex flex-col gap-4">
          {[0, 1].map((i) => <span key={i} className="aspect-video w-full animate-pulse rounded-lg bg-surface-muted" />)}
        </div>
      )}

      {load.status === "ready" && load.ads.length === 0 && (
        <AlertBanner tone="info" title="لا توجد إعلانات حالياً" />
      )}

      {load.status === "ready" && load.ads.length > 0 && (
        <ul className="flex flex-col gap-4">
          {load.ads.map((ad) => <AdCard key={ad.id} ad={ad} />)}
        </ul>
      )}

      {signedIn && <BottomNav />}
    </div>
  );
}

function AdCard({ ad }: { ad: ActiveAd }) {
  const ref = useAdImpression<HTMLLIElement>(() => recordAdEvent(ad.id, "view", getViewerKey()));
  const fired = useRef(false);

  function onClick() {
    if (fired.current) return;
    fired.current = true;
    recordAdEvent(ad.id, "click", getViewerKey());
  }

  const clickable = isClickable(ad.linkUrl);
  const content = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage public URL */}
      <img src={adImageUrl(ad.imagePath)} alt={ad.title} loading="lazy" className="aspect-video w-full rounded-lg object-cover" />
      <p className="mt-2 text-body-strong-14">{ad.title}</p>
      <p className="text-body-small-12 text-text-secondary">{adCaption(ad.sponsorName)}</p>
    </>
  );

  return (
    <li ref={ref} className="rounded-lg bg-surface-card p-3 shadow-card">
      {clickable ? (
        <a href={ad.linkUrl!} target="_blank" rel="noopener noreferrer sponsored" onClick={onClick}>{content}</a>
      ) : content}
    </li>
  );
}
