// «إحصائيات الإعلانات» export — same exceljs approach as A5's lib/sales-export.ts (dynamic import, RTL sheet,
// bold header, a totals row); SheetJS ("xlsx") is intentionally not used.
import { formatDay, formatTime } from "@fuelos/core";
import { ctrPercent, STATS_HEADERS, toStatsExportRow, type StatTotal } from "./ads-rules.ts";

export type AdsExportMeta = { from: string; to: string };

/** Numbers here are approximate device-based counts, not an audited ledger — label it on the sheet itself so a
 * sponsor report never reads as more precise than it is (brief 10a: "أرقام تقديرية"). */
export async function exportAdsStatsToExcel(totals: StatTotal[], meta: AdsExportMeta): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FuelOS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("إحصائيات الإعلانات", { views: [{ rightToLeft: true }] });

  const infoRow = sheet.addRow([`الفترة: ${meta.from} إلى ${meta.to} · أرقام تقديرية (جهاز واحد = مشاهدة/نقرة واحدة باليوم) · صُدِّر في ${formatDay(new Date())} ${formatTime(new Date())}`]);
  infoRow.font = { italic: true, color: { argb: "FF666666" } };
  sheet.mergeCells(1, 1, 1, STATS_HEADERS.length);
  sheet.addRow([]);

  const headerRow = sheet.addRow([...STATS_HEADERS]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  let totalViews = 0; let totalClicks = 0;
  for (const t of totals) {
    sheet.addRow(toStatsExportRow(t));
    totalViews += t.views; totalClicks += t.clicks;
  }
  const totalsRow = sheet.addRow(["الإجمالي", "", totalViews, totalClicks, ctrPercent(totalViews, totalClicks)]);
  totalsRow.font = { bold: true };

  sheet.columns.forEach((col, i) => {
    const header = STATS_HEADERS[i] ?? "";
    col.width = Math.max(14, header.length + 4, i < 2 ? 24 : 0);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fuelos-ads-stats_${meta.from}_to_${meta.to}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
