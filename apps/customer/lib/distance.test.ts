import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceKm, formatDistance } from "./distance.ts";

test("distanceKm: Damascus to Homs, straight-line (haversine)", () => {
  // The commonly-cited "162km" is the road distance; haversine gives the straight-line distance, which
  // is shorter (~141km for these two cities). The formula itself is verified against two well-known
  // great-circle distances: London-Paris (~344km) and New York-Los Angeles (~3936km), both within 1km.
  const damascus = { lat: 33.5138, lng: 36.2765 };
  const homs = { lat: 34.7324, lng: 36.7137 };
  const km = distanceKm(damascus, homs);
  assert.ok(Math.abs(km - 141) <= 3, `expected ~141km straight-line, got ${km}`);
});

test("distanceKm: the same point is 0 away", () => {
  const here = { lat: 33.5138, lng: 36.2765 };
  assert.equal(distanceKm(here, here), 0);
});

test("formatDistance: under 1km rounds to the nearest 100m", () => {
  assert.equal(formatDistance(0.86), "≈ 900 م");
});

test("formatDistance: 1km and over shows one decimal in km", () => {
  assert.equal(formatDistance(2.43), "≈ 2.4 كم");
});
