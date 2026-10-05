"use client";
// C1 — الرئيسية, guest-accessible slice (design/screens/C1.png). No login required: public_station_prices is
// granted to anon. A station's location shows as a "الموقع على الخريطة" link when the owner set lat/lng
// (docs/briefs/06a) — distance/rating/services-catalog parts of the full design still need schema FuelOS
// doesn't have, so those stay omitted rather than faked. Quick-action tiles need a signed-in customer (RLS is
// customer-scoped for all of C3–C7), so guests see a "sign in first" prompt instead.
import { formatMoney } from "@fuelos/core";
import { AlertBanner, StatusBadge, cx } from "@fuelos/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AdBanner } from "@/components/AdBanner";
import { BottomNav } from "@/components/BottomNav";
import { FuelChips } from "@/components/FuelChips";
import { Icon } from "@/components/Icon";
import { StationCard, type StationPriceRow } from "@/components/StationCard";
import { customerAccess, type CustomerAccess } from "@/lib/customer-access";
import { loadPrices, type PricesData } from "@/lib/prices-data";
import { availabilityBadge, mapUrl } from "@/lib/prices-rules";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/time-ago";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: PricesData };

export default function HomePage() {
  const [access, setAccess] = useState<CustomerAccess>();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState("الكل");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    customerAccess().then(setAccess, () => setAccess({ kind: "error" }));
  }, [tick]);

  useEffect(() => {
    let alive = true;
    loadPrices().then(
      (data) => { if (alive) { setLoad({ status: "ready", data }); setNow(Date.now()); } },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [tick]);

  function refresh() {
    setLoad({ status: "loading" });
    setTick((t) => t + 1);
  }

  const stations = load.status === "ready" ? load.data.stations : [];
  const products = ["الكل", ...new Set(stations.flatMap((s) => s.products.map((p) => p.name)))];
  const shown = filter === "الكل" ? stations : stations.map((s) => ({ ...s, products: s.products.filter((p) => p.name === filter) })).filter((s) => s.products.length > 0);
  const signedIn = access?.kind === "customer";

  return (
    <div className={`mx-auto flex max-w-[480px] flex-col gap-6 p-4 ${signedIn ? "pb-24" : "pb-10"}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-heading-h1-24 text-text-primary">{signedIn ? `مرحباً${access.name ? "، " + access.name : ""}` : "أسعار المحطات"}</h1>
          <p className="text-body-small-12 text-text-secondary">{signedIn ? "تصفّح المحطات القريبة وأسعارها" : "تصفّح دون حساب، أو سجّل الدخول لمزيد"}</p>
        </div>
        {signedIn ? (
          <button type="button" onClick={() => supabase().auth.signOut().then(() => setTick((t) => t + 1))}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-body-strong-14 text-brand-action-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
            <Icon name="logout" size={18} />
            خروج
          </button>
        ) : (
          <Link href="/login"
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-brand-action px-4 text-body-strong-14 text-brand-on-action transition-colors hover:bg-brand-action-700 hover:text-white motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
            تسجيل الدخول
          </Link>
        )}
      </header>

      <AdBanner />

      <FuelChips items={products} value={filter} onChange={setFilter} label="الوقود" />

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل الأسعار" action={<RetryButton onClick={refresh} />}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}
      {load.status === "ready" && shown.length === 0 && (
        <p className="rounded-[18px] border border-border-default bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">لا توجد محطات نشطة بعرض هذا الوقود حالياً.</p>
      )}

      <ul className="flex flex-col gap-3">
        {shown.map((s) => {
          const first = s.products[0];
          const prices: StationPriceRow[] = s.products.map((p) => {
            const badge = p.availability ? availabilityBadge(p.availability) : undefined;
            return {
              id: p.productId,
              fuel: p.name,
              price: p.price !== null ? formatMoney(String(p.price), s.currency) : null,
              badge: badge ? <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge> : undefined,
            };
          });
          return (
            <li key={s.stationId}>
              <StationCard
                name={s.name}
                href={`/station/${s.stationId}`}
                city={s.city ?? undefined}
                mapHref={mapUrl(s.lat, s.lng) ?? undefined}
                prices={prices}
                updated={first?.updatedAt
                  ? `آخر تحديث ${timeAgo(first.updatedAt, now)} · ${first.source === "manual" ? "من إدارة المحطة" : "محسوب تلقائياً"}`
                  : undefined}
              />
            </li>
          );
        })}
      </ul>

      {signedIn && <BottomNav />}
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cx("inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong bg-surface-card px-4 text-body-strong-14 text-text-primary transition-colors hover:bg-surface-muted motion-reduce:transition-none", "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary")}>
      إعادة المحاولة
    </button>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-[18px] border border-border-default bg-surface-card p-4 shadow-card">
          <span className="h-4 w-36 motion-safe:animate-pulse rounded-full bg-surface-muted" />
          <span className="h-11 motion-safe:animate-pulse rounded-md bg-surface-muted" />
          <span className="h-11 motion-safe:animate-pulse rounded-md bg-surface-muted" />
          <span className="h-3 w-48 motion-safe:animate-pulse rounded-full bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}
