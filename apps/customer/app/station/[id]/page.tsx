"use client";
// C2 — تفاصيل المحطة (design/screens/C2.png), guest-accessible like C1: public_station_prices is granted to
// anon. Only what's real ships: prices/availability/freshness and a map link when the owner set lat/lng
// (docs/briefs/06a). Opening hours, rating, a services catalog and a phone number all need schema FuelOS
// doesn't have yet — omitted rather than faked, same principle as C1. «السعر غير صحيح؟» reuses the existing
// price-report flow on C7, which needs a signed-in customer (complaints RLS is customer-scoped); a guest is
// sent to sign in first, same as C1's quick actions.
import { formatMoney } from "@fuelos/core";
import { AlertBanner, StatusBadge, cx } from "@fuelos/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { Icon } from "@/components/Icon";
import { IconBox } from "@/components/IconBox";
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
  const reportHref = signedIn ? "/complaints" : "/login";

  const focusOnDark = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action";
  const data = load.status === "ready" ? load.data : undefined;
  const directionsHref = data ? mapUrl(data.lat, data.lng) : null;

  return (
    <div className={signedIn ? "pb-24" : "pb-10"}>
      <section className="bg-brand-dark text-text-on-dark">
        <div className="mx-auto flex max-w-[480px] flex-col gap-4 px-4 pt-4 pb-6">
          <button type="button" onClick={() => router.back()}
            className={cx("inline-flex min-h-11 items-center gap-2 self-start rounded-full text-body-strong-14 text-text-on-dark", focusOnDark)}>
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-brand-dark-800">
              <Icon name="chevron-left" size={20} className="rtl:rotate-180" />
            </span>
            رجوع
          </button>

          {load.status === "loading" && (
            <div aria-busy className="flex items-center gap-3">
              <span className="size-14 shrink-0 motion-safe:animate-pulse rounded-lg bg-brand-dark-700" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="h-6 w-40 motion-safe:animate-pulse rounded-full bg-brand-dark-700" />
                <span className="h-3 w-24 motion-safe:animate-pulse rounded-full bg-brand-dark-700" />
              </span>
            </div>
          )}

          {data && (
            <>
              <header className="flex items-center gap-3">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-brand-action">
                  <Icon name="fuel" size={28} className="text-brand-dark" />
                </span>
                <div className="min-w-0">
                  <h1 className="text-heading-h1-24 text-text-on-dark">{data.name}</h1>
                  {data.city && <p className="text-body-small-12 text-text-on-dark-muted">{data.city}</p>}
                </div>
              </header>

              {directionsHref && (
                <a href={directionsHref} target="_blank" rel="noreferrer"
                  className={cx("inline-flex h-14 w-full items-center justify-center gap-2 rounded-md bg-brand-action text-button-large-18 text-brand-on-action transition-colors hover:bg-brand-action-700 hover:text-white motion-reduce:transition-none", focusOnDark)}>
                  <Icon name="pin" size={20} />
                  الاتجاهات
                </a>
              )}
            </>
          )}
        </div>
      </section>

      <main className="mx-auto flex max-w-[480px] flex-col gap-4 p-4">
        {load.status === "loading" && (
          <div aria-hidden className="flex flex-col gap-3 rounded-[18px] border border-border-default bg-surface-card p-4 shadow-card">
            <span className="h-5 w-40 motion-safe:animate-pulse rounded-full bg-surface-muted" />
            <span className="h-14 motion-safe:animate-pulse rounded-md bg-surface-muted" />
            <span className="h-14 motion-safe:animate-pulse rounded-md bg-surface-muted" />
          </div>
        )}
        {load.status === "error" && (
          <AlertBanner tone="danger" title="تعذّر تحميل بيانات المحطة" action={<RetryButton onClick={() => router.refresh()} />} />
        )}
        {load.status === "empty" && <AlertBanner tone="info" title="لم نجد هذه المحطة" />}

        {data && (
          <section className="rounded-[18px] border border-border-default bg-surface-card px-4 py-3.5 shadow-card">
            <h2 className="text-heading-h3-16 text-text-primary">الأسعار المنشورة</h2>
            <ul className="mt-1 flex flex-col">
              {data.products.map((p, i) => {
                const badge = p.availability ? availabilityBadge(p.availability) : undefined;
                return (
                  <li key={p.productId} className={cx("flex items-center gap-3 py-3", i > 0 && "border-t border-border-default")}>
                    <IconBox icon="droplet" tone="primary" />
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <span className="text-body-strong-14 text-text-primary">{p.name}</span>
                      {badge && <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
                    </div>
                    {p.price !== null && (
                      <div className="flex shrink-0 items-baseline gap-1">
                        <span className="text-number-l-24 text-text-primary">{formatMoney(String(p.price), "").trim()}</span>
                        <span className="text-body-small-12 text-text-secondary">{`${data.currency}/لتر`}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {data.products[0]?.updatedAt && (
              <p className="mt-2 flex items-center gap-1.5 text-body-small-12 text-text-secondary">
                <Icon name="clock" size={14} />
                آخر تحديث {timeAgo(data.products[0].updatedAt, now)} · {data.products[0].source === "manual" ? "من إدارة المحطة" : "محسوب تلقائياً"}
              </p>
            )}
            <Link href={reportHref}
              className="mt-2 flex min-h-11 items-center gap-3 border-t border-border-default pt-3 text-body-strong-14 text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
              <IconBox icon="warning" tone="warning" />
              <span className="flex-1">السعر غير صحيح؟</span>
              <Icon name="chevron-left" size={18} className="rtl:rotate-180" />
            </Link>
          </section>
        )}
      </main>

      {signedIn && <BottomNav />}
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong bg-surface-card px-4 text-body-strong-14 text-text-primary transition-colors hover:bg-surface-muted motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
      إعادة المحاولة
    </button>
  );
}
