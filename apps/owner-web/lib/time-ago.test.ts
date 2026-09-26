import assert from "node:assert/strict";
import { test } from "node:test";
import { timeAgo } from "./time-ago.ts";

const now = Date.parse("2026-09-27T12:00:00Z");
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

test("minutes", () => {
  assert.equal(timeAgo(ago(0), now), "منذ لحظات");
  assert.equal(timeAgo(ago(1), now), "منذ دقيقة");
  assert.equal(timeAgo(ago(2), now), "منذ دقيقتين");
  assert.equal(timeAgo(ago(5), now), "منذ 5 دقائق");
  assert.equal(timeAgo(ago(25), now), "منذ 25 دقيقة");
});

test("hours and days", () => {
  assert.equal(timeAgo(ago(60), now), "منذ ساعة");
  assert.equal(timeAgo(ago(120), now), "منذ ساعتين");
  assert.equal(timeAgo(ago(3 * 60), now), "منذ 3 ساعات");
  assert.equal(timeAgo(ago(11 * 60), now), "منذ 11 ساعة");
  assert.equal(timeAgo(ago(24 * 60), now), "منذ يوم");
  assert.equal(timeAgo(ago(3 * 24 * 60), now), "منذ 3 أيام");
});

test("a clock a little ahead of the server never shows a negative age", () => {
  assert.equal(timeAgo(new Date(now + 5 * 60_000).toISOString(), now), "منذ لحظات");
});
