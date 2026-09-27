# Brief 04f — vehicle budget and service-reminder fields (request for Cowork)

Written by Claude Code on 2026-09-27 while building the customer app's C5 (سيارتي ومصروفي). Needs the
Supabase connection, so it goes through Claude in Cowork. **Nothing here blocks C5**: monthly spend, the
6-month trend, cost/km and average consumption are all computed from real `sales` rows (customer_id +
vehicle_id, already RLS-readable) — these two specific widgets are just left out rather than faked.

## What's missing
`design/screens/C5.png` shows two things with no backing data:
1. **الميزانية الشهرية** — a monthly budget cap the customer sets, with a progress bar against actual spend.
   No such field exists on `vehicles` or anywhere else.
2. **تذكير تغيير الزيت** — "بعد 420 كم", computed from the odometer at the last service plus an interval.
   No `vehicles` column records when the oil was last changed or what interval to use.

## Request
Two small additions to `vehicles` (or a new `vehicle_settings` table if that's cleaner): a nullable
`monthly_budget numeric(16,2)` the customer sets themselves (RLS: `vehicles_customer` already lets them
update their own row, so no new policy needed), and either `last_service_odometer_km int` +
`service_interval_km int` (also customer-set) or, if the product wants the interval to come from the
station's own service records instead, a small read model over whatever the workshop/service tracking ends
up being (not designed yet anywhere in this repo).
