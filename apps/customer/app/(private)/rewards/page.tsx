"use client";
// C6 «مكافآتي والعروض» (design/screens/C6.png, CU9). Complaints (C7) moved to their own page (/complaints) now
// that the bottom nav gives every section its own tab; the old combined URL still works as a redirect for
// anyone with /rewards?tab=complaints bookmarked or shared.
// Points, their value and reward tiers are all per station (docs/briefs/06a) — one balance card per station
// with any points; offer codes show with a copy button when the owner set one. Personalized offer eligibility
// (offers.rule) still isn't built (docs/briefs/04g).
import { formatDay, formatMoney, formatNumber } from "@fuelos/core";
import { AlertBanner, StatusBadge, cx } from "@fuelos/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IconBox } from "@/components/IconBox";
import { ProgressBar } from "@/components/ProgressBar";
import { Icon } from "@/components/Icon";
import { offerBadge, offerStatus } from "@/lib/rewards-rules";
import { loadRewards, type RewardsData } from "@/lib/rewards-data";
import { useCustomer } from "../customer-context";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

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
      <h1 className="text-heading-h1-24 text-text-primary">المكافآت والعروض</h1>
      <RewardsTab />
    </div>
  );
}

type RLoad = { status: "loading" } | { status: "error" } | { status: "ready"; data: RewardsData };
type Balance = RewardsData["balances"][number];

function RewardsTab() {
  const { userId } = useCustomer();
  const [load, setLoad] = useState<RLoad>({ status: "loading" });
  const [now] = useState(() => Date.now());

  useEffect(() => {
    loadRewards(userId).then((data) => setLoad({ status: "ready", data }), () => setLoad({ status: "error" }));
  }, [userId]);

  if (load.status === "loading") {
    return (
      <div aria-busy className="flex flex-col gap-4">
        <span className="block h-44 motion-safe:animate-pulse rounded-lg bg-surface-muted" />
        <span className="block h-6 w-32 motion-safe:animate-pulse rounded-full bg-surface-muted" />
        <span className="block h-24 motion-safe:animate-pulse rounded-lg bg-surface-muted" />
        <span className="block h-24 motion-safe:animate-pulse rounded-lg bg-surface-muted" />
      </div>
    );
  }
  if (load.status === "error") return <AlertBanner tone="danger" title="تعذّر التحميل" />;
  const { data } = load;
  const [primary, ...others] = data.balances;

  return (
    <>
      {primary ? (
        <PointsCard balance={primary} />
      ) : (
        <section className="flex items-start gap-3 rounded-lg border border-border-default bg-surface-card p-4 shadow-card">
          <IconBox icon="gift" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-body-strong-14 text-text-secondary">رصيد نقاطك</p>
            <p className="text-body-regular-14 text-text-primary">لا نقاط بعد — اربط أول فاتورة مؤكدة لتبدأ.</p>
          </div>
        </section>
      )}

      {others.length > 0 && (
        <ul className="flex flex-col gap-3">
          {others.map((b) => (
            <li key={b.stationId} className="flex items-center gap-3 rounded-lg border border-border-default bg-surface-card p-3.5 shadow-card">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-body-strong-14 text-text-primary">{b.stationName}</p>
                {b.pointValue !== null && (
                  <p className="text-body-small-12 text-brand-action-700">≈ {formatMoney((b.pointsBalance * b.pointValue).toFixed(2), b.currency)}</p>
                )}
                {b.nextTier && (
                  <p className="text-body-small-12 text-text-secondary">باقي {formatNumber(b.nextTier.pointsNeeded, 0)} نقطة لـ«{b.nextTier.title}»</p>
                )}
              </div>
              <p className="shrink-0 text-number-m-18 text-text-primary">
                {formatNumber(b.pointsBalance, 0)} <span className="text-body-small-12 text-text-secondary">نقطة</span>
              </p>
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-heading-h3-16 text-text-primary">عروض المحطات</h2>
      {data.offers.length === 0 ? (
        <p className="rounded-[18px] border border-border-default bg-surface-card p-6 text-center text-body-regular-14 text-text-secondary shadow-card">لا توجد عروض حالياً.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.offers.map((o) => {
            const status = offerStatus(o.startsAt, o.endsAt, now);
            const badge = offerBadge(status);
            const active = status === "active";
            return (
              <li key={o.id} className="flex items-start gap-3 rounded-lg border border-border-default bg-surface-card p-3.5 shadow-card">
                <span className={cx("shrink-0", !active && "opacity-60")}>
                  <IconBox icon="tag" tone={active ? "warning" : "neutral"} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-body-strong-14 text-text-primary">{o.title}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body-small-12 text-text-secondary">{o.stationName} · ينتهي {formatDay(o.endsAt)}</span>
                    <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                  </div>
                  {o.code && <CodeChip code={o.code} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function PointsCard({ balance: b }: { balance: Balance }) {
  const pct = b.nextTier ? (b.pointsBalance / (b.pointsBalance + b.nextTier.pointsNeeded)) * 100 : 0;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border-default bg-surface-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-body-strong-14 text-text-secondary">رصيد نقاطك · {b.stationName}</p>
        {b.pointValue !== null && (
          <p className="shrink-0 text-label-12 text-brand-action-700">≈ {formatMoney((b.pointsBalance * b.pointValue).toFixed(2), b.currency)}</p>
        )}
      </div>
      <p className="flex items-baseline gap-2">
        <span className="text-number-hero-44 text-brand-primary">{formatNumber(b.pointsBalance, 0)}</span>
        <span className="text-body-strong-14 text-text-secondary">نقطة</span>
      </p>
      {b.nextTier && (
        <>
          <ProgressBar value={pct} tone="action" label={`باقي ${formatNumber(b.nextTier.pointsNeeded, 0)} نقطة لـ«${b.nextTier.title}»`} />
          <p className="text-body-small-12 text-text-secondary">باقي {formatNumber(b.nextTier.pointsNeeded, 0)} نقطة لـ«{b.nextTier.title}»</p>
        </>
      )}
    </section>
  );
}

function CodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); }} dir="ltr"
      className={cx("mt-1 inline-flex min-h-11 items-center self-start rounded-[10px] text-body-small-12 text-brand-primary transition-colors motion-reduce:transition-none", FOCUS)}>
      <span className="inline-flex h-8 items-center gap-2 rounded-[10px] border border-dashed border-border-strong bg-surface-muted px-3">
        <span className="text-body-strong-14 text-text-primary">{code}</span>
        <Icon name="copy" size={14} className="text-text-secondary" />
        <span className="text-brand-primary">{copied ? "تم النسخ ✓" : "نسخ"}</span>
      </span>
    </button>
  );
}
