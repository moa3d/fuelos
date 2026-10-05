import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adImagePath, ctrPercent, endOfDayLocal, extensionFor, filterBySponsor, reorderChanges, sortStatTotals, sponsorNames,
  startOfDayLocal, statsExportFileName, statusBadge, ALL_SPONSORS,
  toDateInputValue, toStatsExportRow, validateImageFile, validateLink, whatsappLink,
} from "./ads-rules.ts";

test("statusBadge: one label per status", () => {
  assert.equal(statusBadge("scheduled").label, "مجدول");
  assert.equal(statusBadge("running").label, "يعمل");
  assert.equal(statusBadge("paused").label, "متوقف");
  assert.equal(statusBadge("ended").label, "منتهٍ");
  assert.equal(statusBadge("running").tone, "success");
});

test("validateImageFile: type and size, mirroring save_ad's own rule", () => {
  assert.equal(validateImageFile({ type: "image/png", size: 1024 }), undefined);
  assert.equal(validateImageFile({ type: "image/gif", size: 3 * 1024 * 1024 }), undefined); // exactly at the limit
  assert.match(validateImageFile({ type: "application/pdf", size: 10 })!, /JPG|PNG|WEBP|GIF/);
  assert.match(validateImageFile({ type: "image/png", size: 3 * 1024 * 1024 + 1 })!, /3 ميغابايت/);
});

test("extensionFor / adImagePath: ads/<uuid>.<ext>", () => {
  assert.equal(extensionFor("image/jpeg"), "jpg");
  assert.equal(extensionFor("image/webp"), "webp");
  assert.equal(adImagePath("abc-123", "image/png"), "ads/abc-123.png");
});

test("validateLink: https, tel, or empty", () => {
  assert.equal(validateLink(""), undefined);
  assert.equal(validateLink("  "), undefined);
  assert.equal(validateLink("https://wa.me/963911111111"), undefined);
  assert.equal(validateLink("tel:+963911111111"), undefined);
  assert.notEqual(validateLink("ftp://x"), undefined);
  assert.notEqual(validateLink("www.example.com"), undefined);
  assert.notEqual(validateLink("tel:abc"), undefined);
});

test("whatsappLink: strips non-digits", () => {
  assert.equal(whatsappLink("+963 911 111 111"), "https://wa.me/963911111111");
});

test("startOfDayLocal / endOfDayLocal: the picked day's boundaries, round-trippable via toDateInputValue", () => {
  const start = startOfDayLocal("2026-10-04");
  const end = endOfDayLocal("2026-10-04");
  assert.equal(toDateInputValue(start), "2026-10-04");
  assert.equal(toDateInputValue(end), "2026-10-04");
  assert.ok(new Date(end).getTime() > new Date(start).getTime());
});

test("reorderChanges: moving down swaps the pair and renumbers the list", () => {
  const list = [{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 1 }, { id: "c", sortOrder: 2 }];
  // a↔b swap: b becomes 0, a becomes 1; c keeps 2 and is not re-saved
  assert.deepEqual(reorderChanges(list, 0, "down"), [{ id: "b", sortOrder: 0 }, { id: "a", sortOrder: 1 }]);
});

test("reorderChanges: ties (every new ad starts at 0) still move — a plain swap would do nothing", () => {
  const list = [{ id: "b", sortOrder: 0 }, { id: "a", sortOrder: 0 }, { id: "x", sortOrder: 0 }];
  // a moves above b: a already sits at 0 so it's not re-saved; b and x get their new positions
  assert.deepEqual(reorderChanges(list, 1, "up"), [{ id: "b", sortOrder: 1 }, { id: "x", sortOrder: 2 }]);
});

test("reorderChanges: first ▲ and last ▼ are no-ops; untouched ads are not re-saved", () => {
  const list = [{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 1 }, { id: "c", sortOrder: 2 }];
  assert.deepEqual(reorderChanges(list, 0, "up"), []);
  assert.deepEqual(reorderChanges(list, 2, "down"), []);
  assert.deepEqual(reorderChanges(list, 2, "up"), [{ id: "c", sortOrder: 1 }, { id: "b", sortOrder: 2 }]);
});

test("sortStatTotals: numeric and Arabic-aware text sort, either direction", () => {
  const rows = [
    { adId: "1", sponsorName: "ب", title: "ب", views: 10, clicks: 1, ctr: 10 },
    { adId: "2", sponsorName: "أ", title: "أ", views: 50, clicks: 5, ctr: 10 },
  ];
  assert.deepEqual(sortStatTotals(rows, "views", "asc").map((r) => r.adId), ["1", "2"]);
  assert.deepEqual(sortStatTotals(rows, "views", "desc").map((r) => r.adId), ["2", "1"]);
  assert.deepEqual(sortStatTotals(rows, "sponsorName", "asc").map((r) => r.adId), ["2", "1"]);
});

test("ctrPercent: one decimal, zero views is 0 (never NaN)", () => {
  assert.equal(ctrPercent(0, 0), 0);
  assert.equal(ctrPercent(100, 12), 12);
  assert.equal(ctrPercent(3, 1), 33.3);
  assert.equal(ctrPercent(3, 2), 66.7);
  assert.equal(ctrPercent(1, 1), 100);
});

test("toStatsExportRow: sponsor, title, views, clicks, ctr in order", () => {
  const row = toStatsExportRow({ adId: "1", sponsorName: "شركة الخليج", title: "عرض الصيف", views: 100, clicks: 12, ctr: 12 });
  assert.deepEqual(row, ["شركة الخليج", "عرض الصيف", 100, 12, 12]);
});

const sample = [
  { adId: "1", sponsorName: "شركة الخليج", title: "أ", views: 10, clicks: 1, ctr: 10 },
  { adId: "2", sponsorName: "إطارات النور", title: "ب", views: 5, clicks: 0, ctr: 0 },
  { adId: "3", sponsorName: "شركة الخليج", title: "ج", views: 3, clicks: 1, ctr: 33.3 },
];

test("sponsorNames: distinct, Arabic-sorted", () => {
  assert.deepEqual(sponsorNames(sample), ["إطارات النور", "شركة الخليج"]);
});

test("filterBySponsor: all keeps every ad; one sponsor keeps all of that sponsor’s ads", () => {
  assert.equal(filterBySponsor(sample, ALL_SPONSORS).length, 3);
  assert.deepEqual(filterBySponsor(sample, "شركة الخليج").map((t) => t.adId), ["1", "3"]);
  assert.deepEqual(filterBySponsor(sample, "غير موجود"), []);
});

test("statsExportFileName: all keeps the original name; a sponsor gets its own", () => {
  assert.equal(statsExportFileName(null, "2026-10-01", "2026-10-04"), "fuelos-ads-stats_2026-10-01_to_2026-10-04.xlsx");
  assert.equal(statsExportFileName("شركة الخليج", "2026-10-01", "2026-10-04"), "fuelos-ads_شركة الخليج_2026-10-01_2026-10-04.xlsx");
});

test("statsExportFileName: characters Windows forbids in file names are replaced", () => {
  assert.equal(statsExportFileName("a/b:c*", "2026-10-01", "2026-10-04"), "fuelos-ads_a-b-c-_2026-10-01_2026-10-04.xlsx");
});
