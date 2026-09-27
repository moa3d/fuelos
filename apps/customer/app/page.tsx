"use client";
// C1 — الرئيسية, guest-accessible slice (design/screens/C1.png). No login required: public_station_prices is
// granted to anon. The map/distance/rating parts of the full design need schema FuelOS doesn't have yet
// (station lat/long, ratings, services catalog) — omitted here rather than faked; this shows a plain station
// list with real prices, availability and freshness/source instead. Quick-action tiles (شكاوى/عروض/فواتير/
// سياراتي) point at screens not built yet (C2–C7) and stay disabled with an explanation.
import { formatMoney } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge } from "@fuelos/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { customerAccess, type CustomerAccess } from "@/lib/customer-access";
import { loadPrices, type PricesData } from "@/lib/prices-data";
import { availabilityBadge } from "@/lib/prices-rules";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/time-ago";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: PricesData };
const QUICK_ACTIONS = [
  { icon: "💬", label: "الشكاوى" }, { icon: "🎁", label: "العروض" },
  { icon: "🧾", label: "فواتيري" }, { icon: "🚗", label: "سياراتي" },
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
        {QUICK_ACTIONS.map((a) => (
          <button key={a.label} type="button" disabled title="قيد الإعداد — قريباً"
            className="flex flex-col items-center gap-1 rounded-lg bg-surface-card p-3 text-body-small-12 text-text-secondary shadow-card disabled:opacity-50">
            <span aria-hidden className="text-heading-h2-20">{a.icon}</span>{a.label}
          </button>
        ))}
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
              <span className="text-body-strong-14">{s.name}</span>
              {s.city && <span className="text-body-small-12 text-text-secondary">{s.city}</span>}
            </div>
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
