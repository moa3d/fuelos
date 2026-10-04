import assert from "node:assert/strict";
import { test } from "node:test";
import { adCaption, clampIndex, isClickable, nextIndex, prevIndex, swipeDirection } from "./ads-rules.ts";

test("nextIndex / prevIndex: wrap around the ends", () => {
  assert.equal(nextIndex(0, 3), 1);
  assert.equal(nextIndex(2, 3), 0);
  assert.equal(prevIndex(0, 3), 2);
  assert.equal(prevIndex(1, 3), 0);
});

test("nextIndex / prevIndex: an empty list never throws", () => {
  assert.equal(nextIndex(0, 0), 0);
  assert.equal(prevIndex(0, 0), 0);
});

test("clampIndex: stays in range after the list shrinks", () => {
  assert.equal(clampIndex(4, 2), 1);
  assert.equal(clampIndex(-1, 2), 0);
  assert.equal(clampIndex(0, 0), 0);
});

test("swipeDirection: below threshold is a tap, not a swipe", () => {
  assert.equal(swipeDirection(10), null);
  assert.equal(swipeDirection(-10), null);
  assert.equal(swipeDirection(50), "next");
  assert.equal(swipeDirection(-50), "prev");
});

test("adCaption: «إعلان · {sponsor}»", () => {
  assert.equal(adCaption("شركة الخليج"), "إعلان · شركة الخليج");
});

test("isClickable: a link is required and non-blank", () => {
  assert.equal(isClickable(null), false);
  assert.equal(isClickable(""), false);
  assert.equal(isClickable("  "), false);
  assert.equal(isClickable("https://wa.me/963911111111"), true);
});
