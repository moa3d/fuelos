"use client";
// «الإعلانات» — docs/briefs/10a; spec §5. Public like C1/C2 (active_ads() is anon-accessible): every running
// ad, stacked, each with its image, title and «إعلان · sponsor». A failed load just shows an empty state,
// never an error — the same ads never block anything philosophy as the home banner.
import { AlertBanner, cx } from "@fuelos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { useAdImpression } from "@/components/useAdImpression";
import { adImageUrl, getViewerKey, loadActiveAds, recordAdEvent, type ActiveAd } from "@/lib/ads-data";
import { adCaption, isClickable } from "@/lib/ads-rules";
import { customerAccess, type CustomerAccess } from "@/lib/customer-access";

type Load = { status: "loading" } | { status: "ready"; ads: ActiveAd[] };

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

export default function AdsPage() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [access, setAccess] = useState<CustomerAccess>();

  useEffect(() => { customerAccess().then(setAccess, () => setAccess({ kind: "error" })); }, []);
  useEffect(() => { loadActiveAds().then((ads) => setLoad({ status: "ready", ads })); }, []);

  const signedIn = access?.kind === "customer";

  return (
    <div className={`mx-auto flex max-w-[480px] flex-col gap-4 p-4 ${signedIn ? "pb-24" : "pb-10"}`}>
      <PageHeader title="الإعلانات" back={{ label: "رجوع", onBack: () => router.back() }} />

      {load.status === "loading" && (
        <div aria-busy className="flex flex-col gap-4">
          {[0, 1].map((i) => <span key={i} className="aspect-video w-full motion-safe:animate-pulse rounded-[18px] bg-surface-muted" />)}
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
      <img src={adImageUrl(ad.imagePath)} alt={ad.title} loading="lazy" className="aspect-video w-full rounded-[18px] object-cover" />
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-strong-14">{ad.title}</p>
          <p className="text-body-small-12 text-text-secondary">{adCaption(ad.sponsorName)}</p>
        </div>
        {clickable && (
          <span className="inline-flex shrink-0 items-center gap-1 text-label-12 text-brand-primary">
            زيارة
            <Icon name="external" size={14} />
          </span>
        )}
      </div>
    </>
  );

  return (
    <li ref={ref}>
      {clickable ? (
        <a href={ad.linkUrl!} target="_blank" rel="noopener noreferrer sponsored" onClick={onClick}
          className={cx("block rounded-[18px] transition-opacity motion-reduce:transition-none hover:opacity-90", FOCUS)}>{content}</a>
      ) : content}
    </li>
  );
}
