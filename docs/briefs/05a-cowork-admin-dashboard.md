# Brief 05a — admin dashboard gaps (request for Cowork)

Written by Claude Code on 2026-09-27 while building the platform admin app's A1 (لوحة المنصة). Needs the
Supabase connection, so it goes through Claude in Cowork. **Nothing here blocks A1**: active/total station
counts, distinct active users, MRR (from `subscriptions` × `plans.monthly_price`, per-station plans multiplied
by that organization's station count), open/urgent support tickets, past-due and trial-ending-soon stations,
and the self-granted ≤24h «طلب وصول مؤقت» (a real `access_grants` insert, RLS-enforced) all work today.

## What's missing
`design/screens/A1.png` shows three things with no backing data:
1. **خريطة المحطات** (a map with per-region pins) — `stations` has no latitude/longitude, only `address`/`city`
   text. Same gap already flagged for the customer app's C1/C2 (`docs/briefs/*`).
2. **"لم تزامن منذ 3 أيام"** (a station whose devices haven't synced) — there's no device-heartbeat/last-seen
   tracking anywhere in the schema. `devices`/`device_credentials` exist for the attendant PIN login but don't
   record a last-sync timestamp.
3. **نمو الإيراد المتكرر** (a 6-month MRR history chart) — `subscriptions` has no historical snapshots, only
   current state. Computing a true trend needs either a monthly snapshot table or an event log of plan/status
   changes with timestamps.

## Request
Any of, independently:
- `stations.lat numeric`, `stations.lng numeric` (nullable) for a real map — same fix would also unblock the
  customer app's map/distance features.
- A `devices.last_seen_at timestamptz` column, updated by the worker app's sync engine on each successful
  push, for the "needs a technical check" signal.
- A monthly `mrr_snapshots(month date, organization_id uuid, cents bigint)` table (populated by a small
  monthly job) for the revenue trend chart — much simpler and more honest than deriving history from
  `subscriptions.created_at` alone, which can't reconstruct past plan changes.
