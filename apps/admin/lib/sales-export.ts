// A5's export buttons. exceljs is dynamically imported only when «تصدير Excel» is actually clicked, so it
// never weighs down the initial page load. SheetJS (the npm "xlsx" package) is intentionally not used — it's
// unmaintained upstream.
import { formatDay, formatMoney, formatNumber, formatTime } from "@fuelos/core";
import { subscriptionBadge, type SubStatus } from "./dashboard-rules.ts";
import { centsStr } from "./money.ts";
import {
  EXPORT_HEADERS, toExportRow, toExportTotalsRow, type ExportCell, type SalesRow, type SalesTotals,
} from "./sales-rules.ts";
import { stationBadge, type StationStatus } from "./stations-rules.ts";

const statusLabel = (s: StationStatus) => stationBadge(s).label;
const subLabel = (s: SubStatus | null) => (s ? subscriptionBadge(s).label : "—");

function dateCell(iso: string | null): string {
  return iso ? `${formatDay(iso)} ${formatTime(iso)}` : "—";
}

function buildTable(rows: SalesRow[], totals: SalesTotals): { headers: readonly string[]; body: ExportCell[][] } {
  const body = rows.map((r) => {
    const cells = toExportRow(r, statusLabel, subLabel);
    // toExportRow leaves dates as raw ISO so the pure function stays Intl-free; format them here for display.
    cells[13] = dateCell(r.lastApprovedShiftAt);
    cells[14] = dateCell(r.lastDeviceSyncAt);
    return cells;
  });
  body.push(toExportTotalsRow(totals));
  return { headers: EXPORT_HEADERS, body };
}

export type ExportMeta = { from: string; to: string; periodLabel: string };

/** fuelos-sales_YYYY-MM-DD_to_YYYY-MM-DD.xlsx — an Arabic, right-to-left sheet: bold/shaded header, real
 * numbers in the money/count columns (so SUM works in Excel), a totals row, and a line at the top naming the
 * period and when the export was made. */
export async function exportToExcel(rows: SalesRow[], totals: SalesTotals, meta: ExportMeta): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FuelOS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("مبيعات المحطات", { views: [{ rightToLeft: true }] });
  const { headers, body } = buildTable(rows, totals);

  const infoRow = sheet.addRow([`الفترة: ${meta.periodLabel} (${meta.from} إلى ${meta.to}) · صُدِّر في ${formatDay(new Date())} ${formatTime(new Date())}`]);
  infoRow.font = { italic: true, color: { argb: "FF666666" } };
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.addRow([]);

  const headerRow = sheet.addRow([...headers]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  const moneyColumns = new Set([8, 9, 10, 11, 12]); // إجمالي المبيعات..قسائم (1-indexed)
  for (const cells of body) {
    const row = sheet.addRow(cells);
    for (const col of moneyColumns) row.getCell(col).numFmt = "#,##0.00";
  }
  const totalsRow = sheet.getRow(sheet.rowCount);
  totalsRow.font = { bold: true };

  sheet.columns.forEach((col, i) => {
    const header = headers[i] ?? "";
    col.width = Math.max(12, header.length + 4, i === 0 ? 20 : 0);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fuelos-sales_${meta.from}_to_${meta.to}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** «نسخ الجدول»: TSV on the clipboard pastes straight into Excel/Sheets as real columns. Money stays formatted
 * text here (formatMoney), since a clipboard paste has no numeric-format concept — the Excel export above is
 * the path for actual spreadsheet numbers. */
export async function copyTableTsv(rows: SalesRow[], totals: SalesTotals, currency = "ل.س"): Promise<void> {
  const lines = [EXPORT_HEADERS.join("\t")];
  for (const r of rows) {
    lines.push([
      r.stationName, r.organizationName, r.city ?? "—", statusLabel(r.stationStatus), r.planName ?? "—", subLabel(r.subscriptionStatus),
      formatNumber(r.approvedShifts, 0), formatNumber(r.litersL, 1),
      formatMoney(centsStr(r.salesCents), currency), formatMoney(centsStr(r.cashCents), currency),
      formatMoney(centsStr(r.cardCents), currency), formatMoney(centsStr(r.creditCents), currency), formatMoney(centsStr(r.voucherCents), currency),
      dateCell(r.lastApprovedShiftAt), dateCell(r.lastDeviceSyncAt), formatNumber(r.deviceCount, 0),
    ].join("\t"));
  }
  lines.push([
    "الإجمالي", "", "", "", "", "",
    formatNumber(totals.approvedShifts, 0), formatNumber(totals.litersL, 1),
    formatMoney(centsStr(totals.salesCents), currency), formatMoney(centsStr(totals.cashCents), currency),
    formatMoney(centsStr(totals.cardCents), currency), formatMoney(centsStr(totals.creditCents), currency), formatMoney(centsStr(totals.voucherCents), currency),
    "", "", "",
  ].join("\t"));
  await navigator.clipboard.writeText(lines.join("\n"));
}

