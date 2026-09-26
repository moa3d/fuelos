"use client";
// «المبيعات اليومية» — liters per fuel per day over the last 15 days (from the meters of ended legs).
// dataviz skill: validated categorical palette (reference slots 1–3, fixed per fuel, never by rank), 2px lines,
// one axis, recessive grid, legend + direct end labels, crosshair tooltip listing every fuel, and a table view.
// RTL: time runs from right (oldest) to left (newest), as in design/screens/O1.png.
import { formatNumber } from "@fuelos/core";
import { cx } from "@fuelos/ui";
import { useMemo, useState, type PointerEvent } from "react";

/** Validated with scripts/validate_palette.js (light): all checks pass; contrast WARN → labels + table view. */
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];

const W = 640;
const H = 240;
const PAD = { top: 12, right: 44, bottom: 28, left: 64 };

export function DailyChart({ rows, endDay }: { rows: { day: string; product: string; liters: number }[]; endDay: string }) {
  const [hover, setHover] = useState<number>();
  const [asTable, setAsTable] = useState(false);

  const { days, products, values, max } = useMemo(() => {
    // endDay is «YYYY-MM-DD» in the station's time zone; step back in whole calendar days
    const [ey, em, ed] = endDay.split("-").map(Number);
    const days = Array.from({ length: 15 }, (_, i) => new Date(Date.UTC(ey, em - 1, ed - 14 + i)).toISOString().slice(0, 10));
    // colour follows the fuel: fixed alphabetical order, so a missing fuel never repaints the others
    const products = [...new Set(rows.map((r) => r.product))].sort((a, b) => a.localeCompare(b, "ar")).slice(0, SERIES_COLORS.length);
    const values = products.map((p) => days.map((d) => rows.filter((r) => r.day === d && r.product === p).reduce((s, r) => s + r.liters, 0)));
    const max = Math.max(1, ...values.flat());
    return { days, products, values, max };
  }, [rows, endDay]);

  const niceMax = niceCeil(max);
  const x = (i: number) => W - PAD.right - (i / (days.length - 1)) * (W - PAD.left - PAD.right);  // RTL
  const y = (v: number) => PAD.top + (1 - v / niceMax) * (H - PAD.top - PAD.bottom);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);
  const dayLabel = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;

  function onMove(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((W - PAD.right - px) / (W - PAD.left - PAD.right)) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  }

  const empty = products.length === 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-4 text-body-small-12 text-text-secondary" aria-label="مفتاح الرسم">
          {products.map((p, i) => (
            <li key={p} className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded-full" style={{ background: SERIES_COLORS[i] }} />{p}
            </li>
          ))}
        </ul>
        {!empty && (
          <button type="button" onClick={() => setAsTable((t) => !t)} className="text-body-small-12 text-brand-primary underline">
            {asTable ? "عرض كرسم" : "عرض كجدول"}
          </button>
        )}
      </div>

      {empty ? (
        <p className="flex h-48 items-center justify-center rounded-md bg-surface-muted text-body-regular-14 text-text-secondary">
          لا توجد قراءات عدادات مغلقة في آخر 15 يوماً بعد.
        </p>
      ) : asTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-body-small-12">
            <thead><tr className="text-text-secondary">
              <th className="p-2 text-start font-semibold">اليوم</th>
              {products.map((p) => <th key={p} className="p-2 text-end font-semibold">{p} (لتر)</th>)}
            </tr></thead>
            <tbody>
              {days.map((d, di) => (
                <tr key={d} className="border-t border-border-default">
                  <td className="p-2">{dayLabel(d)}</td>
                  {products.map((p, pi) => <td key={p} className="p-2 text-end">{formatNumber(Math.round(values[pi][di]))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="اللترات المباعة يومياً لكل وقود في آخر 15 يوماً">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-border-default)" strokeWidth={1} />
                <text x={W - PAD.right + 8} y={y(t) + 4} fontSize={11} fill="var(--color-text-muted)" textAnchor="start">
                  {formatNumber(Math.round(t))}
                </text>
              </g>
            ))}
            {days.map((d, i) => (i % 2 === 0 || i === days.length - 1) && (
              <text key={d} x={x(i)} y={H - 8} fontSize={11} fill="var(--color-text-muted)" textAnchor="middle">{dayLabel(d)}</text>
            ))}
            {hover !== undefined && (
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-border-strong)" strokeWidth={1} />
            )}
            {products.map((p, pi) => (
              <g key={p}>
                <polyline fill="none" stroke={SERIES_COLORS[pi]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                  points={values[pi].map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
                {hover !== undefined && (
                  <circle cx={x(hover)} cy={y(values[pi][hover])} r={4} fill={SERIES_COLORS[pi]} stroke="var(--color-surface-card)" strokeWidth={2} />
                )}
                {/* direct label at the newest point (left end) */}
                <text x={x(days.length - 1) - 6} y={y(values[pi][days.length - 1]) + 4} fontSize={11} textAnchor="end"
                  fill="var(--color-text-secondary)">{p}</text>
              </g>
            ))}
            <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom}
              fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(undefined)} />
          </svg>
          {hover !== undefined && (
            <div role="status" className={cx("pointer-events-none absolute top-2 rounded-md border border-border-default bg-surface-card p-2 text-body-small-12 shadow-raised",
              hover > days.length / 2 ? "left-2" : "right-2")}>
              <p className="mb-1 text-text-secondary">{dayLabel(days[hover])}</p>
              {products.map((p, pi) => (
                <p key={p} className="flex items-center gap-2">
                  <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: SERIES_COLORS[pi] }} />
                  <span className="font-semibold text-text-primary">{formatNumber(Math.round(values[pi][hover]))} لتر</span>
                  <span className="text-text-secondary">{p}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 1, 2, 2.5, 5 × 10ⁿ above `v`, so the grid reads in round numbers. */
function niceCeil(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
