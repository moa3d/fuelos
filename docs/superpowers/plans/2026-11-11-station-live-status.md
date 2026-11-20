# Station Directory & Live Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the customer app's price list into a station directory — open/closed, crowding, distance, filters and a map — fed by a one-tap status control in the worker app and the owner dashboard.

**Architecture:** Cowork adds `station_live_status` plus two RPCs: `set_station_status` (station staff write) and `public_stations` (anon read, freshness already applied). The customer app reads that one RPC and does distance/sort/filter in the browser. The worker, owner and admin apps read the raw table and share one pure helper in `packages/core` so all four apps judge freshness identically.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, `@fuelos/ui`, `@fuelos/core`, Supabase JS, Leaflet (plain, no React wrapper) with OpenStreetMap tiles, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-11-station-live-status-design.md` — read it in full before Task 1.

## Global Constraints
- Talk to the user in Arabic, in short steps; he is not a developer.
- **Never create or edit anything under `supabase/`** — Task C1 is Cowork's and is already deployed.
- Arabic RTL, Latin digits, touch targets ≥ 44px, `focus-visible` rings, no horizontal scroll at 360px, all six states per screen.
- Exact copy comes from §6 of the spec. Do not invent or reword Arabic strings.
- Freshness constants live only in `packages/core`: crowd 90 minutes, open 12 hours.
- Status updates are **online-only**. Never put them in the worker's offline outbox.
- Prices, availability, invoices, shifts and every existing screen keep working unchanged.
- `npm run lint`, `npm test`, `npm run build` pass in every app touched, after every task.
- Branch `feat/station-directory`. One commit per task. No merge to `main` before the user approves the preview.
- Read `.claude/skills/fuelos-design-system` and `fuelos-ux-rules` before Task 2.

## Review Focus
1. **A station with no `lat`/`lng`** — it must stay in the list (sorted last when sorting by distance) and simply not appear on the map; nothing may crash or show "NaN كم" → Task 2 and Task 6 tests.
2. **Geolocation denied, unavailable or timing out** — the list still renders, sorted open-first then by name, with the spec's invite line; no spinner that never ends → Task 5 test.
3. **A station whose `products` array is empty** — the card renders with name/status only, no price rows, no crash → Task 2 test.
4. **A timestamp in the future (device clock skew)** — counts as fresh, never as stale, and never renders a negative age → Task 1 test.
5. **The status RPC fails or the device is offline** — the optimistic UI reverts to the previous state and shows the Arabic message; it never looks saved when it was not → Task 3 test.

---

## Task C1 — Cowork (done before Claude Code starts; do not re-do)

**Files:** `supabase/migrations/20261111000200_station_status.sql`, `supabase/tests/96_station_status_test.sql`.

Creates enum `crowd_level` (`none|medium|high`), table `station_live_status` (columns exactly as spec §1), RLS read for station members and platform staff with **no write policy**, and:
- `set_station_status(p_station uuid, p_open boolean, p_crowd text) returns jsonb` — `require_role(owner, shift_manager, attendant)`; `FUELOS_BAD_REQUEST` detail `empty` when both args are null, detail `crowd` for a bad level; audits; returns the same station shape `public_stations()` returns.
- `public_stations() returns jsonb` — anon + authenticated, STABLE, active stations only, freshness already applied, shape exactly as spec §1.

Deployed to the live project; local suite green. **Claude Code commits these two files unchanged and never edits them.**

---

## Task 1: Shared freshness helper in `packages/core`

**Files:**
- Create: `packages/core/src/station-status.ts`, `packages/core/src/station-status.test.ts`
- Modify: `packages/core/src/index.ts` (re-export), `packages/core/package.json` (add `"test": "node --test \"src/*.test.ts\""`)

**Interfaces — Produces (imported by Tasks 2–7 from `@fuelos/core`):**
```ts
export type CrowdLevel = "none" | "medium" | "high";
export type OpenSource = "manual" | "shift";
export type StatusTone = "success" | "warning" | "danger" | "neutral";
export const CROWD_FRESH_MS: number;   // 90 * 60_000
export const OPEN_FRESH_MS: number;    // 12 * 60 * 60_000
export type StationStatusRow = {
  is_open: boolean | null; open_set_at: string | null;
  crowd: CrowdLevel | null; crowd_set_at: string | null;
  has_open_shift?: boolean;
};
export type StationStatusView = {
  isOpen: boolean | null; openSource: OpenSource | null; openSetAt: string | null;
  crowd: CrowdLevel | null; crowdSetAt: string | null; crowdStale: boolean;
};
export function stationStatusView(row: StationStatusRow, now?: number): StationStatusView;
export function openBadge(isOpen: boolean | null): { tone: StatusTone; label: string };
export function crowdBadge(crowd: CrowdLevel): { tone: StatusTone; label: string };
```
`openBadge`: `true` → `{success, "مفتوحة"}`, `false` → `{neutral, "مغلقة"}`, `null` → `{neutral, "غير معروف"}`.
`crowdBadge`: `none` → `{success, "لا زحام"}`, `medium` → `{warning, "زحام متوسط"}`, `high` → `{danger, "زحمة شديدة"}`.

- [ ] **Step 1: Write the failing tests** in `station-status.test.ts` (`node:test` + `node:assert/strict`), with `NOW = Date.parse("2026-11-11T12:00:00Z")`:
  - a manual press 1 hour old wins → `isOpen` is that value, `openSource: "manual"`
  - `is_open: false` 1 hour old **with** `has_open_shift: true` → `isOpen === false` (manual beats the shift)
  - a manual press 13 hours old with `has_open_shift: true` → `isOpen === true`, `openSource: "shift"`
  - a manual press 13 hours old with no open shift → `isOpen === null`, `openSource === null`
  - never pressed (`is_open: null`) with no shift → `isOpen === null`
  - crowd 89 minutes old → returned, `crowdStale === false`; crowd 91 minutes old → `crowd === null`, `crowdStale === true`
  - `crowd_set_at` 5 minutes **in the future** → returned, `crowdStale === false` (Review Focus 4)
  - `openBadge(null).label === "غير معروف"`; `crowdBadge("high").tone === "danger"`
- [ ] **Step 2:** `npm test -w packages/core` → FAIL (module not found).
- [ ] **Step 3:** Implement the module; export it from `index.ts`.
- [ ] **Step 4:** `npm test -w packages/core` → PASS.
- [ ] **Step 5: Commit** `feat(core): shared station live-status freshness rules`

---

## Task 2: Customer directory data layer

**Files:**
- Create: `apps/customer/lib/stations-data.ts`, `apps/customer/lib/stations-rules.ts`, `apps/customer/lib/stations-rules.test.ts`, `apps/customer/lib/distance.ts`, `apps/customer/lib/distance.test.ts`
- Leave untouched: `lib/prices-data.ts`, `lib/prices-rules.ts` (the station page and complaints still use them)

**Interfaces:**
- Consumes: `CrowdLevel`, `OpenSource` (`@fuelos/core`); `Availability`, `availabilityBadge`, `currencyLabel`, `mapUrl` (`./prices-rules`).
- Produces:
```ts
export type DirectoryProduct = {
  productId: string; name: string; price: string | null; priceUpdatedAt: string | null;
  availability: Availability | null; availabilitySource: "computed" | "manual" | null;
  availabilityUpdatedAt: string | null;
};
export type DirectoryStation = {
  stationId: string; name: string; city: string | null; address: string | null;
  lat: number | null; lng: number | null;
  isOpen: boolean | null; openSource: OpenSource | null; openSetAt: string | null;
  crowd: CrowdLevel | null; crowdSetAt: string | null;
  products: DirectoryProduct[];
};
export type Here = { lat: number; lng: number };
export function parseStations(json: unknown): DirectoryStation[];          // bad/missing rows are skipped, never thrown
export function fuelNames(list: DirectoryStation[]): string[];             // unique product names, Arabic-sorted
export type Filters = { fuel: string | null; openOnly: boolean; availableOnly: boolean };
export function filterStations(list: DirectoryStation[], f: Filters): DirectoryStation[];
export function sortStations(list: DirectoryStation[], here: Here | null): DirectoryStation[];
export function loadStations(): Promise<{ stations: DirectoryStation[]; fetchedAt: string }>;  // stations-data.ts
// distance.ts
export function distanceKm(a: Here, b: Here): number;
export function formatDistance(km: number): string;
```
`filterStations`: `fuel` keeps stations having a product with that name (and narrows `products` to it, like today's home filter); `openOnly` keeps `isOpen === true`; `availableOnly` keeps stations with at least one product whose `availability === "available"`.
`sortStations`: with `here`, nearest first and stations without coordinates last; without `here`, `isOpen === true` first, then Arabic name.
`formatDistance`: `< 1` → `«≈ 900 م»` rounded to the nearest 100 m; otherwise `«≈ 2.4 كم»` to one decimal.

- [ ] **Step 1: Write the failing tests.** `distance.test.ts`: Damascus→Homs ≈ 162 km (±2); same point → 0; `formatDistance(0.86) === "≈ 900 م"`; `formatDistance(2.43) === "≈ 2.4 كم"`. `stations-rules.test.ts`: `parseStations` reads one full fixture row; skips a row with no `station_id`; returns `[]` for `null`/a string/an object; **a station whose `products` is `[]` survives with `products: []`** (Review Focus 3); `filterStations` for each of the three filters and their combination; `sortStations` with `here` puts the nearer first and **a station with `lat: null` last** (Review Focus 1); `sortStations(list, null)` puts an open station before a closed one.
- [ ] **Step 2:** `npm test -w apps/customer` → FAIL.
- [ ] **Step 3:** Implement `distance.ts` (haversine, Earth radius 6371 km) and `stations-rules.ts`.
- [ ] **Step 4:** Implement `loadStations()` in `stations-data.ts`: `supabase().rpc("public_stations")` with `AbortSignal.timeout(20_000)`, throw on `error`, pass `data` through `parseStations`.
- [ ] **Step 5:** `npm test -w apps/customer` → PASS; `npm run lint -w apps/customer` → PASS.
- [ ] **Step 6: Commit** `feat(customer): station directory data layer`

---

## Task 3: Worker — «حالة المحطة» card

**Files:**
- Create: `apps/worker/lib/station-status.ts`, `apps/worker/lib/station-status.test.ts`, `apps/worker/app/station-status-card.tsx`
- Modify: `apps/worker/app/shift/page.tsx` (mount the card above the existing content when a shift is open)

**Interfaces:**
- Consumes: `stationStatusView`, `openBadge`, `crowdBadge`, `CrowdLevel` (`@fuelos/core`); `supabase()` (`@/lib/supabase`); `useOnline()` (`@/lib/use-online`); `timeAgo` (`@/lib/time-ago`); `errorMessage` (`@fuelos/core`).
- Produces:
```ts
export type StatusOutcome = { ok: true; view: StationStatusView } | { ok: false; message: string };
export function loadStationStatus(stationId: string): Promise<StationStatusView>;
export function setStationStatus(stationId: string, patch: { open?: boolean; crowd?: CrowdLevel }): Promise<StatusOutcome>;
```
`loadStationStatus` selects `is_open, open_set_at, crowd, crowd_set_at` from `station_live_status` (plus a `shifts` existence check for `has_open_shift`) and returns `stationStatusView(row)`. `setStationStatus` calls `rpc("set_station_status", { p_station, p_open, p_crowd })` with the untouched field as `null`, and maps a failure through `errorMessage` exactly as the other worker RPC clients do.

- [ ] **Step 1: Write the failing test** `station-status.test.ts` for the pure part only — a helper `statusRpcArgs(stationId, patch)` returning `{ p_station, p_open: boolean|null, p_crowd: string|null }`: a crowd-only patch sends `p_open: null`; an open-only patch sends `p_crowd: null`; both set sends both.
- [ ] **Step 2:** `npm test -w apps/worker` → FAIL.
- [ ] **Step 3:** Implement `station-status.ts`.
- [ ] **Step 4:** Build `StationStatusCard` per spec §2: an open/closed toggle, three crowd buttons (≥ 44px, the chosen one highlighted), the `timeAgo` line, and the warning line «حدّث الزحام ليراه الزبائن» when `crowdStale`. Offline (`!useOnline()`): all controls disabled with «تحديث الحالة يحتاج اتصالاً». On press: update local state immediately, call the RPC, and **on failure restore the previous state and show the returned Arabic message** (Review Focus 5).
- [ ] **Step 5:** Mount it in `apps/worker/app/shift/page.tsx`, visible only while the attendant's shift is open.
- [ ] **Step 6:** `npm test -w apps/worker`, `npm run lint -w apps/worker`, `npm run build -w apps/worker` → PASS. Manually verify in the browser with the network throttled to offline that the buttons disable and no outbox row is created.
- [ ] **Step 7: Commit** `feat(worker): one-tap station status card`

---

## Task 4: Owner dashboard — station status card

**Files:**
- Create: `apps/owner-web/lib/station-status.ts`, `apps/owner-web/app/(app)/dashboard/station-status-card.tsx`
- Modify: `apps/owner-web/app/(app)/dashboard/page.tsx` (mount at the top)

**Interfaces:**
- Consumes: the same `@fuelos/core` helpers; the owner app's `timeAgo` and Supabase client.
- Produces: the same two function signatures as Task 3, in the owner app's own `lib` (the two apps have separate Supabase clients; do not share the data layer).

- [ ] **Step 1:** Implement `station-status.ts` mirroring Task 3's signatures.
- [ ] **Step 2:** Build the card: current state, the same controls, and «حدّثها {الاسم} {timeAgo}» from `updated_by`'s display name; when `openSource === "shift"` show «مفتوحة — مناوبة جارية» instead of a press time.
- [ ] **Step 3:** Mount it at the top of the dashboard; loading, error and "never set" states follow `fuelos-ux-rules`.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npm run build` in `apps/owner-web` → PASS.
- [ ] **Step 5: Commit** `feat(owner): station status card on the dashboard`

---

## Task 5: Customer home becomes the directory

**Files:**
- Create: `apps/customer/lib/use-here.ts`
- Modify: `apps/customer/app/page.tsx`

**Interfaces:**
- Consumes: Task 2's data layer; `openBadge`, `crowdBadge` (`@fuelos/core`); existing `AdBanner`, `BottomNav`, `customerAccess`, `timeAgo`, `availabilityBadge`, `mapUrl`.
- Produces: `useHere(): { here: Here | null; state: "idle" | "asking" | "ok" | "denied"; ask: () => void }` — calls `navigator.geolocation.getCurrentPosition` only from `ask()`, with a 10 s timeout; any failure or an absent API sets `denied`.

- [ ] **Step 1:** Implement `use-here.ts`.
- [ ] **Step 2:** Rewrite the home page per spec §4: header with city and an «الأقرب إليّ» button; the existing fuel chips plus two toggles «مفتوحة الآن» and «المتوفر فقط»; station cards carrying name, area, open badge, crowd badge (hidden when absent), the existing price/availability rows, distance when `here` is set, a «الاتجاهات» link from `mapUrl`, and the «آخر تحديث … · من إدارة المحطة» line; a link to `/map`.
- [ ] **Step 3:** States: loading skeleton; error with retry; «لا محطات تطابق الفلاتر — جرّب إزالة أحدها» when filtering empties the list; and, when `state === "denied"`, the line «فعّل الموقع لترتيب المحطات حسب قربها منك» above a list that still works (Review Focus 2).
- [ ] **Step 4:** Keep the signed-in and guest behaviour exactly as today (greeting, sign-out, bottom nav only when signed in).
- [ ] **Step 5:** `npm test`, `npm run lint`, `npm run build` in `apps/customer` → PASS.
- [ ] **Step 6: Commit** `feat(customer): station directory home`

---

## Task 6: Customer map page

**Files:**
- Create: `apps/customer/app/map/page.tsx`, `apps/customer/app/map/station-map.tsx`
- Modify: `apps/customer/package.json` (add `leaflet` and `@types/leaflet`)

**Interfaces:** Consumes Task 2's `loadStations`, `DirectoryStation`, `distanceKm`; Task 5's `useHere`.

- [ ] **Step 1:** Add the dependencies; `station-map.tsx` is a client component imported with `next/dynamic` and `ssr: false`, importing `leaflet/dist/leaflet.css`.
- [ ] **Step 2:** Render an OpenStreetMap tile layer with the required attribution, centred on `here` when available, else on the stations' bounding box. Use `L.divIcon` with an inline coloured dot (never Leaflet's default image icons): green when any product is `available`, amber when the best is `limited`, grey when none is available or `isOpen === false`. **Stations with a null `lat` or `lng` are skipped** (Review Focus 1).
- [ ] **Step 3:** Tapping a pin opens a bottom sheet with the name, the two badges, the cheapest available price and «التفاصيل» / «الاتجاهات». Add a «موقعي» button that recentres on `here`.
- [ ] **Step 4:** Loading and error states for the data; a station list of zero shows «لا محطات لعرضها على الخريطة».
- [ ] **Step 5:** `npm run lint` and `npm run build` in `apps/customer` → PASS; confirm the home page's JS bundle does not grow (the map must be loaded only on `/map`).
- [ ] **Step 6: Commit** `feat(customer): stations map`

---

## Task 7: Station page badges and admin status column

**Files:**
- Modify: `apps/customer/app/station/[id]/page.tsx`, `apps/admin/app/(app)/stations/page.tsx`
- Create: `apps/admin/lib/station-status.ts`

**Interfaces:** Consumes `stationStatusView`, `openBadge`, `crowdBadge` (`@fuelos/core`).

- [ ] **Step 1:** Customer station page — read the station from `loadStations()` (Task 2) by id and add the open and crowd badges to the hero; everything else stays.
- [ ] **Step 2:** Admin — read `station_live_status` for the listed stations in one query, run each row through `stationStatusView` **without `has_open_shift`** (this column is about who keeps the status current, not about serving customers; do not query `shifts` here), and add a «الحالة» column showing the open badge, the crowd badge and `timeAgo` of the newer of the two timestamps; a station with no row shows «لم تُحدَّث بعد».
- [ ] **Step 3:** `npm test`, `npm run lint`, `npm run build` in both apps → PASS.
- [ ] **Step 4: Commit** `feat: station status on the station page and the admin list`

---

## Task 8: Manual acceptance with the user
- [ ] Push `feat/station-directory`; send the user the Vercel preview links for the customer, worker, owner and admin apps.
- [ ] Walk him in Arabic, one step at a time: press the crowd buttons in the worker app → see the change in the customer app within seconds → «الأقرب إليّ» → deny the location permission once and confirm the list still works → the filters → the map → a station with no coordinates.
- [ ] Fix any failure in the task that owns it, then re-run that task's checks.
- [ ] Merge to `main` only after he says so.
