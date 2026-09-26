# Design — attendant shifts across several pumps ("pump legs")

Status: approved in conversation with the owner on 2026-09-26. Next step: an implementation plan (writing-plans).
Author: Claude (Cowork). Scope: database, RPCs, tests, worker app screens S1 / move / S4–S7.

## 1. Why
The original spec and schema assumed one shift = one attendant on one pump. The owner confirmed how the station really works:
- **Q1 → C:** an attendant **moves** between pumps during a shift.
- **Q2 → A:** the **cash stays with the attendant** for the whole shift, whatever pumps he worked. It is counted once, at the end.
- **Q3 → C:** a pump he leaves is sometimes taken over by a colleague right away, and sometimes left idle.
- **Q4 → A:** only **one attendant per pump at a time**.

Under the current model, every move would mean a full shift close (cash count plus owner approval). That is rejected as unusable.

## 2. Decisions (what the owner said vs. what we assume)
**Said by the owner:** the four answers above, and "approach 1: shift per attendant, split into pump legs".

**Assumed (the owner may correct these):**
- An attendant holds **at most one pump at a time**. He moves; he never works two pumps in parallel. This follows from Q1-C, where B, "two pumps at once", was not chosen.
- **One price per shift** is kept. Every leg uses the price in force when the shift opened (existing rule, accounting skill).
- **Reopening a shift** reopens only its **last** leg. Correcting an earlier leg is a manager action and out of scope for this slice.
- Meter photos stay optional (existing columns). The camera UI is not in this slice.

## 3. Data model
**`shifts` (changed)**
- It keeps the attendant, `opening_cash`, `counted_cash`, the status machine, the decision fields and the device.
- **Drop `pump_id`** and the index `one_open_shift_per_pump`.
- **New unique index `one_open_shift_per_attendant`** on `(station_id, attendant_id)` where status is `open` or `reopened`.

**`shift_legs` (new) — «فترة على مضخة»**
- Columns:
  - `id uuid` (client-generated, for idempotent sync)
  - `station_id`, `shift_id`, `pump_id`
  - `started_at`, `ended_at` (null = current leg)
  - `gap_note text`
  - `device_id`, `client_created_at`, `created_at`
- Composite foreign keys `(station_id, shift_id)` → shifts and `(station_id, pump_id)` → pumps.
- `unique (station_id, id)`.
- `one_open_leg_per_pump`: unique `(pump_id)` where `ended_at is null`. This enforces Q4.
- `one_open_leg_per_shift`: unique `(shift_id)` where `ended_at is null`. This enforces the one-pump-at-a-time assumption.
- Check: `ended_at is null or ended_at >= started_at`.

**`leg_readings` (replaces `shift_readings`)**
- Columns: `leg_id`, `nozzle_id`, `opening_reading`, `closing_reading`, `opening_photo_path`, `closing_photo_path`.
- Primary key `(leg_id, nozzle_id)`.
- Check: `closing_reading is null or closing_reading >= opening_reading`.

**`sales` (changed)**
- Add `leg_id uuid not null`, with a composite foreign key to `shift_legs (station_id, id)`.
- `shift_id` stays for reporting and must equal the leg's shift. The RPC enforces this.

**`nozzles.last_reading`**
- Updated when a leg **ends**, whether by a move or a submit. It is no longer set at shift submit only.

**RLS**
- `shift_legs` and `leg_readings` are readable by the attendant who owns the shift, and by station staff or a live access grant. This mirrors the current `shifts` / `shift_readings` policies.
- There are no direct writes; writes go through RPCs only.
- Audit trigger on `shift_legs`.

**Data migration**
- Each existing shift gets one leg, with the same pump, `opened_at` → `started_at`, and `closed_at` → `ended_at` for shifts that are not open.
- `shift_readings` rows are copied into `leg_readings`.
- `sales.leg_id` is backfilled.
- Then `shift_readings` and `shifts.pump_id` are dropped.

## 4. RPCs (all SECURITY DEFINER, `require_role` first, NULL-safe, idempotent on client UUIDs)
| RPC | Change |
|---|---|
| `open_shift(p_shift_id, p_leg_id, p_pump, p_opening_cash, p_readings, p_gap_note, p_device, p_client_created_at)` | Creates the shift **and its first leg**. Replay-safe on `p_shift_id`. |
| `switch_pump(p_shift, p_new_leg_id, p_closing, p_new_pump, p_opening, p_gap_note, p_device, p_client_created_at)` | **New.** In one transaction: set the closing readings of the open leg, end it, update `last_reading`, then open the new leg on `p_new_pump` with the opening readings. Replay-safe on `p_new_leg_id`. |
| `submit_shift(p_shift, p_closing, p_counted_cash, p_diff_reason)` | Closes the **current leg** with `p_closing`, then behaves as today (tolerance check, `shift_close` approval). |
| `shift_summary(p_shift)` | Sums over all legs. Returns `legs[]`, each with pump, times, `gap_note` and per-nozzle liters and amount, plus the existing totals. |
| `record_sale(…, p_leg, …)` | New `p_leg` parameter. The leg must belong to the shift and be open, and the nozzle must be on the leg's pump. Otherwise `FUELOS_NOT_FOUND` ("nozzle is not on the current pump"). |
| `decide_approval` | Inventory `sale` movements and COGS are built per tank from **all legs**. `last_reading` is no longer touched here. |
| `reopen_shift` | Re-opens the **last** leg (`ended_at = null`). If the pump is now held by someone else → `FUELOS_PUMP_BUSY`. Other behaviour unchanged. |
| `pump_board(p_station)` | **New, read-only, for attendants.** One row per active pump:<br>• number<br>• nozzles (`id`, product, `last_reading`)<br>• `held_by` — **display name only** of the attendant on the open leg, or null<br>This feeds «مع محمد خليل». |

**Readings rules:** these apply both at `open_shift` and at the new leg in `switch_pump`.
- Opening reading **<** the nozzle's `last_reading` → `FUELOS_READING_BELOW_LAST` (existing behaviour).
- Opening reading **>** `last_reading` means unrecorded liters. This needs a non-empty `p_gap_note`, otherwise **`FUELOS_GAP_NOTE_REQUIRED`**. The note is stored on the leg and appears in the `shift_close` approval payload, together with the liters per nozzle.

**Pump taken:**
- An open leg already exists on the pump → `FUELOS_PUMP_BUSY` (existing code, new source).
- The attendant already has an open shift → **`FUELOS_SHIFT_ALREADY_OPEN`** (new code).

## 5. Money
- Meter sales = Σ over legs, Σ over nozzles, of (closing − opening) × price at shift open.
- **Expected cash = opening_cash + meter sales − card − credit − voucher.** The formula is unchanged, and it is computed once per shift.
- The approval posting stays the same (sales entry, shortage/surplus, COGS). Stock movements are grouped per tank across legs.

## 6. Worker app (Next.js PWA)
**S1 «بداية المناوبة»**
1. Pump picker from `pump_board`. A busy pump is shown disabled with «مع {name}», not hidden.
2. Opening reading per nozzle, prefilled with `last_reading`. If the typed value is higher, show «فرق {n} لتر عن آخر قراءة — اكتب السبب» with a required note.
3. Opening cash, then «ابدأ المناوبة».

**Shift screen:** current-pump card, earlier legs (collapsed list), and a primary button «الانتقال إلى مضخة أخرى». The warning when the shift is longer than `max_shift_hours` goes at the top.

**Move (new, 2 steps):**
1. «القراءة النهائية للمضخة {n}». Values must be ≥ opening.
2. Choose the new pump, with the opening readings prefilled, then «تأكيد الانتقال».

**S4–S7 (close):**
1. Closing readings of the **current** pump.
2. Counted cash.
3. Review that lists every leg (pump, liters, amount), then the expected cash and the difference.

**Arabic messages (added to `errors.ts`):**
| Code | Message |
|---|---|
| `FUELOS_GAP_NOTE_REQUIRED` | «القراءة أعلى من آخر قراءة مسجّلة — اكتب السبب» |
| `FUELOS_SHIFT_ALREADY_OPEN` | «لديك مناوبة مفتوحة — أكملها أو أغلقها أولاً» |
| `FUELOS_PUMP_BUSY` | «هذه المضخة مع زميل الآن» |

## 7. Offline
- The outbox operations are `open_shift`, `switch_pump`, `record_sale` and `submit_shift`, sent strictly FIFO (`++seq`). The client generates the shift, leg and sale UUIDs before the first attempt.
- `pump_board` is cached with its fetch time and shown with «آخر تحديث».
- An offline prefill can be stale; the server re-validates.
- **Two attendants take the same pump offline:** the server accepts the first leg to arrive. The second gets `FUELOS_PUMP_BUSY`:
  - its queue stops at that item (`failed_permanent`);
  - the message is «المضخة كانت مسجّلة مع زميل — راجع المدير»;
  - nothing is deleted.
  - Resolving it is a manager task, out of scope.

## 8. Testing (definition of done)
**DB (plain psql tests, all existing 107 kept green, updated for the new signatures)**
- New file `supabase/tests/30_shift_legs_test.sql`:
  - open with a first leg;
  - a switch closes one leg and opens another, and `last_reading` follows;
  - `PUMP_BUSY` on a held pump;
  - `SHIFT_ALREADY_OPEN`;
  - `GAP_NOTE_REQUIRED`, and acceptance with a note;
  - `READING_BELOW_LAST`;
  - a sale on a nozzle of another pump is refused;
  - idempotent replay of `switch_pump`;
  - expected cash across two legs;
  - approval posts balanced entries and per-tank stock across legs;
  - reopen puts the last leg back and returns `PUMP_BUSY` if the pump was taken;
  - RLS: an attendant sees only his own legs;
  - `pump_board` exposes the holder's name only.
- Migration check: seed shifts become one-leg shifts, with identical totals before and after.

**App:** `npm run build` and lint pass, plus manual runs:
- open on pump 1;
- move to pump 3, with the gap note path;
- close, with the review showing both legs;
- offline: open and move with DevTools set to offline, then back online, and the outbox drains in order.

## 9. Ownership
- Database, migrations, RPCs and DB tests: **Claude in Cowork**, applied to Supabase after the tests pass.
- Worker app screens and outbox: **Claude Code** on the owner's computer, following the implementation plan.

## 10. Out of scope (later)
- Correcting earlier legs.
- Resolving offline pump conflicts.
- The meter-photo camera UI.
- Sales UI (S2), which will use `p_leg`.
- Owner dashboard views of legs (O3 / O7 get the payload now; their UI comes later).
