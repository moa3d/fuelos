"use client";
// C6 «مكافآتي والعروض» (design/screens/C6.png). Complaints (C7) moved to their own page (/complaints) now
// that the bottom nav gives every section its own tab; the old combined URL still works as a redirect for
// anyone with /rewards?tab=complaints bookmarked or shared.
// Points, their value and reward tiers are all per station (docs/briefs/06a) — one balance card per station
// with any points; offer codes show with a copy button when the owner set one. Personalized offer eligibility
// (offers.rule) still isn't built (docs/briefs/04g).
import { formatDay, formatMoney, formatNumber } from "@fuelos/core";
import { AlertBanner, StatusBadge } from "@fuelos/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { offerBadge, offerStatus } from "@/lib/rewards-rules";
import { loadRewards, type RewardsData } from "@/lib/rewards-data";
import { useCustomer } from "../customer-context";

export default function RewardsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const legacyComplaints = params.get("tab") === "complaints";

  useEffect(() => {
    if (legacyComplaints) router.replace("/complaints");
  }, [legacyComplaints, router]);

  if (legacyComplaints) return null;   // redirecting

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-4 pb-10">
      <h1 className="text-heading-h1-24">المكافآت والعروض</h1>
      <RewardsTab />
    </div>
  );
}

type RLoad = { status: "loading" } | { status: "error" } | { status: "ready"; data: RewardsData };

function RewardsTab() {
  const { userId } = useCustomer();
  const [load, setLoad] = useState<RLoad>({ status: "loading" });
  const [now] = useState(() => Date.now());

  useEffect(() => {
    loadRewards(userId).then((data) => setLoad({ status: "ready", data }), () => setLoad({ status: "error" }));
  }, [userId]);

  if (load.status === "loading") return <span className="block h-64 animate-pulse rounded-lg bg-surface-muted" />;
  if (load.status === "error") return <AlertBanner tone="danger" title="تعذّر التحميل" />;
  const { data } = load;

  return (
    <>
      {data.balances.length === 0 ? (
        <div className="rounded-lg bg-brand-dark p-4 text-text-on-dark">
          <p className="text-body-small-12 text-text-on-dark-muted">🎁 رصيد نقاطك</p>
          <p className="mt-1 text-body-regular-14">لا نقاط بعد — اربط أول فاتورة مؤكدة لتبدأ.</p>
        </div>
      ) : data.balances.map((b) => (
        <div key={b.stationId} className="rounded-lg bg-brand-dark p-4 text-text-on-dark">
          <p className="text-body-small-12 text-text-on-dark-muted">🎁 رصيد نقاطك · {b.stationName}</p>
          <p className="mt-1 text-number-l-24">{formatNumber(b.pointsBalance, 0)} نقطة</p>
          {b.pointValue !== null && (
            <p className="mt-1 text-body-small-12 text-text-on-dark-muted">
              ≈ {formatMoney((b.pointsBalance * b.pointValue).toFixed(2), b.currency)}
            </p>
          )}
          {b.nextTier && (
            <p className="mt-2 text-body-small-12 text-text-on-dark-muted">باقي {formatNumber(b.nextTier.pointsNeeded, 0)} نقطة لـ«{b.nextTier.title}»</p>
          )}
        </div>
      ))}

      <h2 className="text-heading-h3-16">عروض المحطات</h2>
      {data.offers.length === 0 ? (
        <p className="rounded-lg bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">لا توجد عروض حالياً.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.offers.map((o) => {
            const status = offerStatus(o.startsAt, o.endsAt, now);
            const badge = offerBadge(status);
            return (
              <li key={o.id} className="rounded-lg bg-surface-card p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-body-strong-14">{o.title}</p>
                  <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                </div>
                <p className="mt-1 text-body-small-12 text-text-secondary">{o.stationName} · ينتهي {formatDay(o.endsAt)}</p>
                {o.code && <CodeChip code={o.code} />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function CodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); }}
      className="mt-2 flex items-center gap-2 rounded-md bg-surface-muted px-3 py-1.5 text-body-small-12" dir="ltr">
      <span className="font-mono text-body-strong-14">{code}</span>
      <span className="text-brand-primary">{copied ? "تم النسخ ✓" : "نسخ"}</span>
    </button>
  );
}
