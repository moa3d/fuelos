# Brief 03a — one dashboard summary from the server (request for Cowork)

Written by Claude Code on 2026-09-26 while building O1 «لوحة القيادة». It needs the Supabase connection, so it goes through Claude in Cowork. **Nothing here blocks O1**: today and yesterday already work.

**Status (2026-09-27): done.** Cowork shipped `station_period_bounds`/`dashboard_summary` (`20260927000100_dashboard_summary.sql`); O1, O3, O6 all use it, and O6's self-computed profit & loss was verified to match `estimated_profit` exactly.

## What O1 does today (apps/owner-web/lib/dashboard.ts)
- Sales and expected cash: one `shift_summary()` call per shift of the day, added up on the page.
- Estimated profit: from posted journal lines of that day (4xxx − 5xxx). This covers approved shifts and posted expenses only.
- Receivables: the balance of account 1100.
- Tanks: the `tank_book_levels` view plus the last `tank_measurements.measured_at`.
- Chart: liters per fuel per day over 15 days, from `leg_readings` of ended legs.

That is fine for one day, with a handful of shifts. It does not scale to «هذا الأسبوع» / «هذا الشهر»: dozens of `shift_summary` calls per page load. Those two tabs are therefore shown disabled with the reason.

## Request: `dashboard_summary(p_station uuid, p_from timestamptz, p_to timestamptz) returns jsonb`
- SECURITY DEFINER, `require_role(owner, accountant, shift_manager)`.
- The finance fields are null for a shift manager (permissions skill), and the app shows them as «متاح لصاحب المحطة والمحاسب».
- It returns:
  - `meter_sales`, `liters`, `expected_cash`, `shifts_total`, `shifts_closed` — the same math as `shift_summary`, summed server-side;
  - `recorded_open_fills` — fills recorded on legs that are still open;
  - `estimated_profit` (finance only), with `profit_complete: false` when some shifts in the range are not approved yet or a delivery has no cost (accounting skill: «تقديري»);
  - `receivables` and `overdue_companies` (count), both finance only;
  - `daily: [{day, product_id, liters, amount}]` for the chart, in the station's `timezone`.
- Add a test in `supabase/tests`: totals equal the sum of `shift_summary` over the same shifts; a shift manager gets nulls for the finance fields; a guest gets 42501.

## Also noted
- "Today" is taken from the browser's clock today. The server version should use `stations.timezone`.
