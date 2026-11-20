import assert from "node:assert/strict";
import { test } from "node:test";
import { filterStations, fuelNames, parseStations, sortStations, type DirectoryStation } from "./stations-rules.ts";

const fullRow = {
  station_id: "a", name: "محطة النور", city: "دمشق", address: "شارع الثورة",
  lat: 33.5, lng: 36.3, is_open: true, open_source: "manual", open_set_at: "2026-11-14T08:00:00Z",
  crowd: "medium", crowd_set_at: "2026-11-14T08:10:00Z",
  products: [
    { product_id: "p1", name: "بنزين 95", price: "125", price_updated_at: "2026-11-14T07:30:00Z",
      availability: "available", availability_source: "manual", availability_updated_at: null },
  ],
};

test("parseStations: reads one full fixture row", () => {
  const stations = parseStations([fullRow]);
  assert.equal(stations.length, 1);
  assert.deepEqual(stations[0], {
    stationId: "a", name: "محطة النور", city: "دمشق", address: "شارع الثورة",
    lat: 33.5, lng: 36.3, isOpen: true, openSource: "manual", openSetAt: "2026-11-14T08:00:00Z",
    crowd: "medium", crowdSetAt: "2026-11-14T08:10:00Z",
    products: [
      { productId: "p1", name: "بنزين 95", price: "125", priceUpdatedAt: "2026-11-14T07:30:00Z",
        availability: "available", availabilitySource: "manual", availabilityUpdatedAt: null },
    ],
  });
});

test("parseStations: a row with no station_id is skipped", () => {
  const bad = { ...fullRow, station_id: undefined };
  assert.deepEqual(parseStations([bad, fullRow]), parseStations([fullRow]));
});

test("parseStations: null/a string/an object (not an array) return []", () => {
  assert.deepEqual(parseStations(null), []);
  assert.deepEqual(parseStations("oops"), []);
  assert.deepEqual(parseStations({ not: "an array" }), []);
});

test("parseStations: a station whose products is [] survives with products: []", () => {
  const row = { ...fullRow, products: [] };
  const stations = parseStations([row]);
  assert.equal(stations.length, 1);
  assert.deepEqual(stations[0].products, []);
});

function station(partial: Partial<DirectoryStation>): DirectoryStation {
  return {
    stationId: "x", name: "محطة", city: null, address: null, lat: null, lng: null,
    isOpen: null, openSource: null, openSetAt: null, crowd: null, crowdSetAt: null, products: [],
    ...partial,
  };
}

test("fuelNames: unique product names, Arabic-sorted", () => {
  const list = [
    station({ products: [{ productId: "p1", name: "ديزل", price: null, priceUpdatedAt: null, availability: null, availabilitySource: null, availabilityUpdatedAt: null }] }),
    station({ products: [
      { productId: "p2", name: "بنزين 95", price: null, priceUpdatedAt: null, availability: null, availabilitySource: null, availabilityUpdatedAt: null },
      { productId: "p3", name: "ديزل", price: null, priceUpdatedAt: null, availability: null, availabilitySource: null, availabilityUpdatedAt: null },
    ] }),
  ];
  assert.deepEqual(fuelNames(list), ["بنزين 95", "ديزل"]);
});

function product(name: string, availability: "available" | "limited" | "unavailable" | null): DirectoryStation["products"][number] {
  return { productId: name, name, price: null, priceUpdatedAt: null, availability, availabilitySource: null, availabilityUpdatedAt: null };
}

test("filterStations: fuel keeps stations with that product and narrows products to it", () => {
  const list = [
    station({ stationId: "a", products: [product("بنزين 95", "available"), product("ديزل", "available")] }),
    station({ stationId: "b", products: [product("ديزل", "available")] }),
  ];
  const out = filterStations(list, { fuel: "بنزين 95", openOnly: false, availableOnly: false });
  assert.equal(out.length, 1);
  assert.equal(out[0].stationId, "a");
  assert.deepEqual(out[0].products.map((p) => p.name), ["بنزين 95"]);
});

test("filterStations: openOnly keeps isOpen === true", () => {
  const list = [
    station({ stationId: "a", isOpen: true }),
    station({ stationId: "b", isOpen: false }),
    station({ stationId: "c", isOpen: null }),
  ];
  const out = filterStations(list, { fuel: null, openOnly: true, availableOnly: false });
  assert.deepEqual(out.map((s) => s.stationId), ["a"]);
});

test("filterStations: availableOnly keeps stations with at least one available product", () => {
  const list = [
    station({ stationId: "a", products: [product("بنزين 95", "available")] }),
    station({ stationId: "b", products: [product("بنزين 95", "limited")] }),
    station({ stationId: "c", products: [] }),
  ];
  const out = filterStations(list, { fuel: null, openOnly: false, availableOnly: true });
  assert.deepEqual(out.map((s) => s.stationId), ["a"]);
});

test("filterStations: all three filters combine", () => {
  const list = [
    station({ stationId: "a", isOpen: true, products: [product("بنزين 95", "available"), product("ديزل", "unavailable")] }),
    station({ stationId: "b", isOpen: true, products: [product("بنزين 95", "unavailable")] }),
    station({ stationId: "c", isOpen: false, products: [product("بنزين 95", "available")] }),
  ];
  const out = filterStations(list, { fuel: "بنزين 95", openOnly: true, availableOnly: true });
  assert.deepEqual(out.map((s) => s.stationId), ["a"]);
});

test("sortStations: with `here`, nearest first and no-coordinate stations go last", () => {
  const here = { lat: 33.5, lng: 36.3 };
  const list = [
    station({ stationId: "far", lat: 34.7324, lng: 36.7137 }),
    station({ stationId: "no-coords", lat: null, lng: null }),
    station({ stationId: "near", lat: 33.51, lng: 36.31 }),
  ];
  const out = sortStations(list, here);
  assert.deepEqual(out.map((s) => s.stationId), ["near", "far", "no-coords"]);
});

test("sortStations: without `here`, open stations come first, then Arabic name", () => {
  const list = [
    station({ stationId: "z-open", name: "محطة ب", isOpen: true }),
    station({ stationId: "closed", name: "محطة أ", isOpen: false }),
    station({ stationId: "a-open", name: "محطة أ", isOpen: true }),
  ];
  const out = sortStations(list, null);
  assert.deepEqual(out.map((s) => s.stationId), ["a-open", "z-open", "closed"]);
});
