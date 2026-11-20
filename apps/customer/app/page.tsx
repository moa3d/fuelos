"use client";
// T1 — دليل المحطات (design/screens/T1.png). Guest-accessible: public_stations() is granted to anon, same
// pattern as the old public_station_prices view it replaces (see docs/briefs for the station-live-status
// plan). Shows every active station's live open/crowd status, prices and availability, with fuel/open/
// available filters and an optional "nearest first" sort once the visitor shares their location.
import { formatMoney, openBadge, crowdBadge } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge, cx } from "@fuelos/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AdBanner } from "@/components/AdBanner";
import { BottomNav } from "@/components/BottomNav";
import { FuelChips } from "@/components/FuelChips";
import { Icon } from "@/components/Icon";
import { StationCard, type StationPriceRow } from "@/components/StationCard";
import { customerAccess, type CustomerAccess } from "@/lib/customer-access";
import { availabilityBadge, currencyLabel, mapUrl } from "@/lib/prices-rules";
import { distanceKm, formatDistance } from "@/lib/distance";
import { filterStations, fuelNames, sortStations, type DirectoryStation } from "@/lib/stations-rules";
import { loadStations, type StationsData } from "@/lib/stations-data";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/time-ago";
import { useHere } from "@/lib/use-here";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: StationsData };

const ALL_FUEL = "الكل";

export default function HomePage() {
  const [access, setAccess] = useState<CustomerAccess>();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [fuel, setFuel] = useState(ALL_FUEL);
  const [openOnly, setOpenOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { here, state: hereState, ask: askHere } = useHere();

  useEffect(() => {
    customerAccess().then(setAccess, () => setAccess({ kind: "error" }));
  }, [tick]);

  useEffect(() => {
    let alive = true;
    loadStations().then(
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
  const products = fuelNames(stations);
  const filtered = filterStations(stations, { fuel: fuel === ALL_FUEL ? null : fuel, openOnly, availableOnly });
  const shown = sortStations(filtered, hereState === "ok" ? here : null);
  const signedIn = access?.kind === "customer";
  const city = stations[0]?.city ?? null;
  const filtersActive = fuel !== ALL_FUEL || openOnly || availableOnly;

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

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-body-regular-14 text-text-secondary">{city}</div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/map" className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-body-strong-14 text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
            <Icon name="pin" size={16} />
            الخريطة
          </Link>
          <Button variant="secondary" className="min-h-11" onClick={askHere} disabled={hereState === "asking"} aria-busy={hereState === "asking"}>
            <Icon name="pin" size={16} />
            الأقرب إليّ
          </Button>
        </div>
      </div>

      <AdBanner />

      <div className="flex flex-col gap-2">
        <FuelChips items={[ALL_FUEL, ...products]} value={fuel} onChange={setFuel} label="الوقود" />
        <div role="group" aria-label="فلاتر إضافية" className="flex flex-wrap gap-2">
          <ToggleChip label="مفتوحة الآن" pressed={openOnly} onToggle={() => setOpenOnly((v) => !v)} />
          <ToggleChip label="المتوفر فقط" pressed={availableOnly} onToggle={() => setAvailableOnly((v) => !v)} />
        </div>
      </div>

      {hereState === "denied" && (
        <AlertBanner tone="info" title="فعّل الموقع لترتيب المحطات حسب قربها منك" />
      )}

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل المحطات" action={<RetryButton onClick={refresh} />}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}
      {load.status === "ready" && shown.length === 0 && (
        <p className="rounded-[18px] border border-border-default bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">
          {filtersActive ? "لا محطات تطابق الفلاتر — جرّب إزالة أحدها" : "لا توجد محطات نشطة حالياً."}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {shown.map((s) => (
          <li key={s.stationId}>
            <StationCard {...stationCardProps(s, hereState === "ok" ? here : null, now)} />
          </li>
        ))}
      </ul>

      {signedIn && <BottomNav />}
    </div>
  );
}

function stationCardProps(s: DirectoryStation, here: { lat: number; lng: number } | null, now: number) {
  const prices: StationPriceRow[] = s.products.map((p) => {
    const badge = p.availability ? availabilityBadge(p.availability) : undefined;
    return {
      id: p.productId,
      fuel: p.name,
      price: p.price !== null ? formatMoney(p.price, currencyLabel("SYP")) : null,
      badge: badge ? <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge> : undefined,
    };
  });

  const open = openBadge(s.isOpen);
  const crowd = s.crowd !== null ? crowdBadge(s.crowd) : null;
  const badges = (
    <span className="flex items-center gap-1.5">
      <StatusBadge tone={open.tone}>{open.label}</StatusBadge>
      {crowd && <StatusBadge tone={crowd.tone}>{crowd.label}</StatusBadge>}
    </span>
  );

  const distance = here !== null && s.lat !== null && s.lng !== null
    ? formatDistance(distanceKm(here, { lat: s.lat, lng: s.lng }))
    : undefined;

  const timestamps = [
    s.openSetAt, s.crowdSetAt,
    ...s.products.flatMap((p) => [p.priceUpdatedAt, p.availabilityUpdatedAt]),
  ].filter((t): t is string => t !== null);
  const newest = timestamps.length > 0
    ? timestamps.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a))
    : null;

  return {
    name: s.name,
    href: `/station/${s.stationId}`,
    city: s.city ?? undefined,
    mapHref: mapUrl(s.lat, s.lng) ?? undefined,
    badges,
    distance,
    prices,
    updated: newest ? `آخر تحديث ${timeAgo(newest, now)} · من إدارة المحطة` : undefined,
  };
}

function ToggleChip({ label, pressed, onToggle }: { label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cx(
        "relative h-[34px] rounded-full border px-4 text-body-strong-14 transition-colors motion-reduce:transition-none",
        "before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-['']",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
        pressed
          ? "border-brand-primary bg-brand-primary text-text-on-dark"
          : "border-border-default bg-surface-card text-text-secondary",
      )}
    >
      {label}
    </button>
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
