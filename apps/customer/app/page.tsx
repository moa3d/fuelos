"use client";
// C1 — الرئيسية, guest-accessible slice (design/screens/C1.png). No login required: public_station_prices is
// granted to anon. A station's location shows as a "الموقع على الخريطة" link when the owner set lat/lng
// (docs/briefs/06a) — distance/rating/services-catalog parts of the full design still need schema FuelOS
// doesn't have, so those stay omitted rather than faked. Quick-action tiles need a signed-in customer (RLS is
// customer-scoped for all of C3–C7), so guests see a "sign in first" prompt instead.
import { formatMoney } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge } from "@fuelos/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { customerAccess, type CustomerAccess } from "@/lib/customer-access";
import { loadPrices, type PricesData } from "@/lib/prices-data";
import { availabilityBadge, mapUrl } from "@/lib/prices-rules";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/time-ago";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: PricesData };
// href: null until that screen is built (C2/C6/C7 still ahead) — same one-screen-at-a-time order as O1–O11.
const QUICK_ACTIONS: { icon: string; label: string; href: string | null }[] = [
  { icon: "💬", label: "الشكاوى", href: "/rewards?tab=complaints" }, { icon: "🎁", label: "العروض", href: "/rewards" },
  { icon: "🧾", label: "فواتيري", href: "/invoices" }, { icon: "🚗", label: "سياراتي", href: "/vehicles" },
];

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
    <div className="mx-auto flex max-w-[480px] flex-col gap-6 p-4 pb-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-heading-h1-24">{signedIn ? `مرحباً${access.name ? "، " + access.name : ""}` : "أسعار المحطات"}</h1>
          <p className="text-body-small-12 text-text-secondary">{signedIn ? "تصفّح المحطات القريبة وأسعارها" : "تصفّح دون حساب، أو سجّل الدخول لمزيد"}</p>
        </div>
        {signedIn ? (
          <button type="button" onClick={() => supabase().auth.signOut().then(() => setTick((t) => t + 1))} className="text-body-strong-14 text-brand-primary">
            خروج
          </button>
        ) : (
          <Link href="/login"><Button variant="action" size="md">تسجيل الدخول</Button></Link>
        )}
      </header>

      <div className="grid grid-cols-4 gap-2">
        {QUICK_ACTIONS.map((a) => {
          const content = <><span aria-hidden className="text-heading-h2-20">{a.icon}</span>{a.label}</>;
          const tileClass = "flex flex-col items-center gap-1 rounded-lg bg-surface-card p-3 text-body-small-12 text-text-secondary shadow-card";
          if (a.href && signedIn) return <Link key={a.label} href={a.href} className={tileClass}>{content}</Link>;
          if (!signedIn) return <Link key={a.label} href="/login" title="سجّل الدخول لعرض هذا القسم" className={tileClass}>{content}</Link>;
          return <button key={a.label} type="button" disabled title="قيد الإعداد — قريباً" className={`${tileClass} disabled:opacity-50`}>{content}</button>;
        })}
      </div>

      <div role="tablist" aria-label="الوقود" className="flex flex-wrap gap-2">
        {products.map((p) => (
          <button key={p} role="tab" aria-selected={filter === p} onClick={() => setFilter(p)}
            className={`h-9 rounded-full border px-4 text-body-strong-14 ${filter === p ? "border-brand-primary bg-brand-primary text-white" : "border-border-default bg-surface-card text-text-secondary"}`}>
            {p}
          </button>
        ))}
      </div>

      {load.status === "loading" && <Skeleton />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل الأسعار" action={<Button variant="secondary" onClick={refresh}>إعادة المحاولة</Button>}>
          تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.
        </AlertBanner>
      )}
      {load.status === "ready" && shown.length === 0 && (
        <p className="rounded-lg bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">لا توجد محطات نشطة بعرض هذا الوقود حالياً.</p>
      )}

      <ul className="flex flex-col gap-3">
        {shown.map((s) => (
          <li key={s.stationId} className="rounded-lg bg-surface-card p-4 shadow-card">
            <div className="flex items-baseline justify-between">
              <Link href={`/station/${s.stationId}`} className="text-body-strong-14 hover:underline">{s.name}</Link>
              {s.city && <span className="text-body-small-12 text-text-secondary">{s.city}</span>}
            </div>
            {mapUrl(s.lat, s.lng) && (
              <a href={mapUrl(s.lat, s.lng)!} target="_blank" rel="noreferrer" className="mt-1 inline-block text-body-small-12 text-brand-primary">
                📍 الموقع على الخريطة
              </a>
            )}
            <ul className="mt-3 flex flex-col gap-2">
              {s.products.map((p) => {
                const badge = p.availability ? availabilityBadge(p.availability) : undefined;
                return (
                  <li key={p.productId} className="flex items-center justify-between gap-2 rounded-md bg-surface-muted p-2.5">
                    <span className="text-body-regular-14">{p.name}</span>
                    <div className="flex items-center gap-2">
                      {p.price !== null && <span className="text-number-m-18">{formatMoney(String(p.price), s.currency)}</span>}
                      {badge && <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
                    </div>
                  </li>
                );
              })}
            </ul>
            {s.products[0]?.updatedAt && (
              <p className="mt-2 text-body-small-12 text-text-muted">
                آخر تحديث {timeAgo(s.products[0].updatedAt, now)} · {s.products[0].source === "manual" ? "من إدارة المحطة" : "محسوب تلقائياً"}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => <span key={i} className="h-32 animate-pulse rounded-lg bg-surface-muted" />)}
    </div>
  );
}
