import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stationStatusView,
  openBadge,
  crowdBadge,
  CROWD_FRESH_MS,
  OPEN_FRESH_MS,
  type CrowdLevel,
} from "./station-status.ts";

const NOW = Date.parse("2026-11-11T12:00:00Z");

test("manual press 1 hour old wins → isOpen is that value, openSource: manual", () => {
  const oneHourAgo = new Date(NOW - 60 * 60_000).toISOString();
  const result = stationStatusView(
    { is_open: true, open_set_at: oneHourAgo, crowd: null, crowd_set_at: null },
    NOW
  );
  assert.equal(result.isOpen, true);
  assert.equal(result.openSource, "manual");
});

test("is_open: false 1 hour old with has_open_shift: true → isOpen === false (manual beats shift)", () => {
  const oneHourAgo = new Date(NOW - 60 * 60_000).toISOString();
  const result = stationStatusView(
    {
      is_open: false,
      open_set_at: oneHourAgo,
      crowd: null,
      crowd_set_at: null,
      has_open_shift: true,
    },
    NOW
  );
  assert.equal(result.isOpen, false);
  assert.equal(result.openSource, "manual");
});

test("manual press 13 hours old with has_open_shift: true → isOpen === true, openSource: shift", () => {
  const thirteenHoursAgo = new Date(NOW - 13 * 60 * 60_000).toISOString();
  const result = stationStatusView(
    {
      is_open: false,
      open_set_at: thirteenHoursAgo,
      crowd: null,
      crowd_set_at: null,
      has_open_shift: true,
    },
    NOW
  );
  assert.equal(result.isOpen, true);
  assert.equal(result.openSource, "shift");
});

test("manual press 13 hours old with no open shift → isOpen === null, openSource === null", () => {
  const thirteenHoursAgo = new Date(NOW - 13 * 60 * 60_000).toISOString();
  const result = stationStatusView(
    {
      is_open: true,
      open_set_at: thirteenHoursAgo,
      crowd: null,
      crowd_set_at: null,
      has_open_shift: false,
    },
    NOW
  );
  assert.equal(result.isOpen, null);
  assert.equal(result.openSource, null);
});

test("never pressed (is_open: null) with no shift → isOpen === null", () => {
  const result = stationStatusView(
    {
      is_open: null,
      open_set_at: null,
      crowd: null,
      crowd_set_at: null,
      has_open_shift: false,
    },
    NOW
  );
  assert.equal(result.isOpen, null);
  assert.equal(result.openSource, null);
});

test("crowd 89 minutes old → returned, crowdStale === false", () => {
  const eightynineMinutesAgo = new Date(NOW - 89 * 60_000).toISOString();
  const result = stationStatusView(
    {
      is_open: null,
      open_set_at: null,
      crowd: "high",
      crowd_set_at: eightynineMinutesAgo,
    },
    NOW
  );
  assert.equal(result.crowd, "high");
  assert.equal(result.crowdStale, false);
});

test("crowd 91 minutes old → crowd === null, crowdStale === true", () => {
  const ninetyoneMinutesAgo = new Date(NOW - 91 * 60_000).toISOString();
  const result = stationStatusView(
    {
      is_open: null,
      open_set_at: null,
      crowd: "high",
      crowd_set_at: ninetyoneMinutesAgo,
    },
    NOW
  );
  assert.equal(result.crowd, null);
  assert.equal(result.crowdStale, true);
});

test("crowd_set_at 5 minutes in the future → returned, crowdStale === false", () => {
  const fiveMinutesInTheFuture = new Date(NOW + 5 * 60_000).toISOString();
  const result = stationStatusView(
    {
      is_open: null,
      open_set_at: null,
      crowd: "medium",
      crowd_set_at: fiveMinutesInTheFuture,
    },
    NOW
  );
  assert.equal(result.crowd, "medium");
  assert.equal(result.crowdStale, false);
});

test("openBadge(null).label === 'غير معروف'", () => {
  const badge = openBadge(null);
  assert.equal(badge.label, "غير معروف");
});

test("crowdBadge('high').tone === 'danger'", () => {
  const badge = crowdBadge("high");
  assert.equal(badge.tone, "danger");
});
