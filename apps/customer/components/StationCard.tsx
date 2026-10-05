// Station price card (radius 18, border + shadow-card). Presentational only: the caller passes already-formatted
// strings, so no data fetching or formatting happens here.
import { cx } from "@fuelos/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export type StationPriceRow = {
  id: string;
  fuel: string;
  /** Already formatted, e.g. "5,000 ل.س"; null when the price is not published. */
  price: string | null;
  /** Optional availability badge (e.g. a StatusBadge). */
  badge?: ReactNode;
};

export function StationCard({
  name,
  href,
  city,
  mapHref,
  prices,
  updated,
  stale = false,
  className,
}: {
  name: string;
  href?: string;
  city?: string;
  mapHref?: string;
  prices: StationPriceRow[];
  /** Already formatted freshness line, e.g. "آخر تحديث منذ 5 دقائق · من إدارة المحطة". */
  updated?: string;
  /** Marks the freshness line as old (warning color + clock icon). */
  stale?: boolean;
  className?: string;
}) {
  return (
    <article className={cx("rounded-[18px] border border-border-default bg-surface-card px-4 py-3.5 shadow-card", className)}>
      <div className="flex items-baseline justify-between gap-2">
        {href ? (
          <Link href={href} className="text-body-strong-14 text-text-primary hover:underline">{name}</Link>
        ) : (
          <h2 className="text-body-strong-14 text-text-primary">{name}</h2>
        )}
        {city && <span className="text-body-small-12 text-text-secondary">{city}</span>}
      </div>

      {mapHref && (
        <a href={mapHref} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-1 text-body-small-12 text-brand-primary">
          <Icon name="pin" size={14} />
          الموقع على الخريطة
        </a>
      )}

      <ul className="mt-2 flex flex-col gap-2">
        {prices.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-muted p-2.5">
            <span className="text-body-regular-14 text-text-primary">{row.fuel}</span>
            <div className="flex items-center gap-2">
              {row.price !== null && <span className="text-number-m-18 text-text-primary">{row.price}</span>}
              {row.badge}
            </div>
          </li>
        ))}
      </ul>

      {updated && (
        <p className={cx("mt-2 flex items-center gap-1 text-body-small-12", stale ? "text-status-warning-700" : "text-text-muted")}>
          <Icon name="clock" size={14} />
          {updated}
        </p>
      )}
    </article>
  );
}
