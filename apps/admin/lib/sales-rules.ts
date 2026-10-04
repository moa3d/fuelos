// A5 «مبيعات المحطات» — period presets, sorting and the flat export rows. No imports, so `node --test` runs it
// directly. Money stays BigInt cents until the very last step (Excel/TSV cells, where a real spreadsheet number
// is what was asked for — see lib/sales-export.ts).
import type { SubStatus } from "./dashboard-rules.ts";
import type { StationStatus } from "./stations-rules.ts";

export type SalesRow = {
  stationId: string;
  stationName: string;
  organizationName: string;
  city: string | null;
  stationStatus: StationStatus;
  planName: string | null;
  subscriptionStatus: SubStatus | null;
  approvedShifts: number;
  litersL: number;
  salesCents: bigint;
  cashCents: bigint;
  cardCents: bigint;
  creditCents: bigint;
  voucherCents: bigint;
  lastApprovedShiftAt: string | null;
  lastDeviceSyncAt: string | null;
  deviceCount: number;
};

export type SalesTotals = {
  approvedShifts: number; litersL: number; salesCents: bigint;
  cashCents: bigint; cardCents: bigint; creditCents: bigint; voucherCents: bigint;
};

// ---------- period presets ----------
export type PeriodPreset = "today" | "last7" | "thisMonth" | "lastMonth" | "custom";
export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  today: "اليوم", last7: "آخر 7 أيام", thisMonth: "هذا الشهر", lastMonth: "الشهر الماضي", custom: "مدى مخصص",
};

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** [from, to] as plain YYYY-MM-DD (inclusive, calendar days in UTC — matches how the RPC compares dates). */
export function periodRange(preset: PeriodPreset, nowMs: number, custom?: { from: string; to: string }): { from: string; to: string } {
  const now = new Date(nowMs);
  const today = toISODate(now);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "last7": {
      const from = new Date(now);
      from.setUTCDate(from.getUTCDate() - 6);
      return { from: toISODate(from), to: today };
    }
    case "thisMonth": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { from: toISODate(from), to: today };
    }
    case "lastMonth": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      return { from: toISODate(from), to: toISODate(to) };
    }
    case "custom":
      return custom ?? { from: today, to: today };
  }
}

// ---------- sorting ----------
export type SortKey =
  | "stationName" | "organizationName" | "city" | "stationStatus" | "planName" | "subscriptionStatus"
  | "approvedShifts" | "litersL" | "salesCents" | "cashCents" | "cardCents" | "creditCents" | "voucherCents"
  | "lastApprovedShiftAt" | "lastDeviceSyncAt" | "deviceCount";
export type SortDir = "asc" | "desc";

/** Nulls always sort last, regardless of direction — a station with no activity shouldn't jump to the top of
 * a "most recent" sort just because `null` compares oddly. */
export function sortSalesRows(rows: SalesRow[], key: SortKey, dir: SortDir): SalesRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key] as string | number | bigint | null;
    const bv = b[key] as string | number | bigint | null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === "bigint" && typeof bv === "bigint") return av < bv ? -sign : av > bv ? sign : 0;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
    return String(av).localeCompare(String(bv), "ar") * sign;
  });
}

const TEXT_SORT_KEYS = new Set<SortKey>(["stationName", "organizationName", "city", "stationStatus", "planName", "subscriptionStatus"]);

/** Clicking the active column flips direction; clicking a new one picks a sensible default (text columns start
 * A→Z, money/count/date columns start biggest/most-recent first). */
export function nextSort(current: { key: SortKey; dir: SortDir }, clicked: SortKey): { key: SortKey; dir: SortDir } {
  if (current.key === clicked) return { key: clicked, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key: clicked, dir: TEXT_SORT_KEYS.has(clicked) ? "asc" : "desc" };
}

/** The table's own totals row and the export both sum whatever rows are currently visible (filtered/sorted) —
 * deliberately separate from the RPC's own platform-wide `totals`, which feeds the summary cards instead and
 * stays true to the whole period regardless of the search/city/status filters. */
export function sumTotals(rows: SalesRow[]): SalesTotals {
  const t: SalesTotals = { approvedShifts: 0, litersL: 0, salesCents: 0n, cashCents: 0n, cardCents: 0n, creditCents: 0n, voucherCents: 0n };
  for (const r of rows) {
    t.approvedShifts += r.approvedShifts;
    t.litersL += r.litersL;
    t.salesCents += r.salesCents;
    t.cashCents += r.cashCents;
    t.cardCents += r.cardCents;
    t.creditCents += r.creditCents;
    t.voucherCents += r.voucherCents;
  }
  return t;
}

// ---------- export (Excel + TSV share this table shape) ----------
export const EXPORT_HEADERS = [
  "المحطة", "المنظمة", "المدينة", "حالة المحطة", "الخطة", "حالة الاشتراك",
  "عدد الورديات المعتمدة", "إجمالي اللترات", "إجمالي المبيعات", "نقد", "بطاقة", "آجل", "قسائم",
  "آخر وردية معتمدة", "آخر مزامنة جهاز", "عدد الأجهزة",
] as const;

export type ExportCell = string | number;

function centsToNumber(c: bigint): number {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return (neg ? -1 : 1) * Number(a) / 100;
}

/** One array per row, same column order as EXPORT_HEADERS. Money/liters/counts are real numbers (so Excel's
 * own SUM works on them); dates are ISO strings formatted by the caller before this if a display string is
 * wanted — here they stay ISO (or "—") so the pure function needs no Intl/timezone dependency. */
export function toExportRow(r: SalesRow, statusLabel: (s: StationStatus) => string, subLabel: (s: SubStatus | null) => string): ExportCell[] {
  return [
    r.stationName, r.organizationName, r.city ?? "—", statusLabel(r.stationStatus), r.planName ?? "—", subLabel(r.subscriptionStatus),
    r.approvedShifts, r.litersL, centsToNumber(r.salesCents), centsToNumber(r.cashCents), centsToNumber(r.cardCents),
    centsToNumber(r.creditCents), centsToNumber(r.voucherCents),
    r.lastApprovedShiftAt ?? "—", r.lastDeviceSyncAt ?? "—", r.deviceCount,
  ];
}

export function toExportTotalsRow(t: SalesTotals): ExportCell[] {
  return [
    "الإجمالي", "", "", "", "", "",
    t.approvedShifts, t.litersL, centsToNumber(t.salesCents), centsToNumber(t.cashCents), centsToNumber(t.cardCents),
    centsToNumber(t.creditCents), centsToNumber(t.voucherCents),
    "", "", "",
  ];
}
