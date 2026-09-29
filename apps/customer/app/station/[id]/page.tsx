"use client";
// C2 — تفاصيل المحطة (design/screens/C2.png), guest-accessible like C1: public_station_prices is granted to
// anon. Only what's real ships: prices/availability/freshness and a map link when the owner set lat/lng
// (docs/briefs/06a). Opening hours, rating, a services catalog and a phone number all need schema FuelOS
// doesn't have yet — omitted rather than faked, same principle as C1. «السعر غير صحيح؟» reuses the existing
// price-report flow on C7, which needs a signed-in customer (complaints RLS is customer-scoped); a guest is
// sent to sign in first, same as C1's quick actions.
import { formatMoney } from "@fuelos/core";
import { AlertBanner, Button, StatusBadge } from "@fuelos/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { customerAccess, type CustomerAccess } from "@/lib/customer-access";
import { loadStationDetail } from "@/lib/prices-data";
import { availabilityBadge, mapUrl, type Station } from "@/lib/prices-rules";
import { timeAgo } from "@/lib/time-ago";

type Load = { status: "loading" } | { status: "error" } | { status: "empty" } | { status: "ready"; data: Station };

export default function StationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [access, setAccess] = useState<CustomerAccess>();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    customerAccess().then(setAccess, () => setAccess({ kind: "error" }));
  }, []);

  useEffect(() => {
    let alive = true;
    loadStationDetail(params.id).then(
      (data) => { if (alive) { setLoad(data ? { status: "ready", data } : { status: "empty" }); setNow(Date.now()); } },
      () => { if (alive) setLoad({ status: "error" }); },
    );
    return () => { alive = false; };
  }, [params.id]);

  const signedIn = access?.kind === "customer";
  const reportHref = signedIn ? "/rewards?tab=complaints" : "/login";

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-4 pb-10">
      <button type="button" onClick={() => router.back()} className="self-start text-body-strong-14 text-text-secondary">→ رجوع</button>

      {load.status === "loading" && <span aria-busy className="block h-72 animate-pulse rounded-lg bg-surface-muted" />}
      {load.status === "error" && (
        <AlertBanner tone="danger" title="تعذّر تحميل بيانات المحطة" action={<Button variant="secondary" onClick={() => router.refresh()}>إعادة المحاولة</Button>} />
      )}
      {load.status === "empty" && <AlertBanner tone="info" title="لم نجد هذه المحطة" />}

      {load.status === "ready" && (
        <>
          <header>
            <h1 className="text-heading-h1-24">{load.data.name}</h1>
            {load.data.city && <p className="text-body-regular-14 text-text-secondary">{load.data.city}</p>}
          </header>

          {mapUrl(load.data.lat, load.data.lng) && (
            <a href={mapUrl(load.data.lat, load.data.lng)!} target="_blank" rel="noreferrer">
              <Button variant="action" size="lg" block>📍 الاتجاهات</Button>
            </a>
          )}

          <section className="rounded-lg bg-surface-card p-4 shadow-card">
            <h2 className="text-heading-h3-16">الأسعار المنشورة</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {load.data.products.map((p) => {
                const badge = p.availability ? availabilityBadge(p.availability) : undefined;
                return (
                  <li key={p.productId} className="flex items-center justify-between gap-2 rounded-md bg-surface-muted p-2.5">
                    <span className="text-body-regular-14">{p.name}</span>
                    <div className="flex items-center gap-2">
                      {p.price !== null && <span className="text-number-m-18">{formatMoney(String(p.price), load.data.currency)}</span>}
                      {badge && <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
                    </div>
                  </li>
                );
              })}
            </ul>
            {load.data.products[0]?.updatedAt && (
              <p className="mt-2 text-body-small-12 text-text-muted">
                آخر تحديث {timeAgo(load.data.products[0].updatedAt, now)} · {load.data.products[0].source === "manual" ? "من إدارة المحطة" : "محسوب تلقائياً"}
              </p>
            )}
            <Link href={reportHref} className="mt-3 block text-body-strong-14 text-brand-primary">السعر غير صحيح؟</Link>
          </section>
        </>
      )}
    </div>
  );
}
