---
name: fuelos-permissions
description: Use when adding tables, RLS policies, RPCs, screens, buttons or API calls in FuelOS, or when a feature depends on who the user is (owner, accountant, shift manager, attendant, customer, platform admin). Holds the role matrix, RLS patterns, approvals, access grants and the "don't hide, explain" UI rule.
---

# FuelOS permissions

## Role matrix (spec p. 24 — source of truth)
| Role | Sees | Never sees | Sensitive powers |
|---|---|---|---|
| `owner` صاحب المحطة | everything in own stations/branches | other stations | approve shift closes, prices, permissions, close period, reopen shift, audit log |
| `accountant` محاسب | ledger, reports, customers, suppliers, expenses | platform settings, station settings | manual entries, exports, adjustments, reversals |
| `shift_manager` مدير مناوبة | shifts, tanks, deliveries, measurements, complaints | ledger | small stock adjustments, submit on behalf of an attendant |
| `attendant` موظف محطة | own shift, own sales, own pump, prices | **profits, purchase costs**, other shifts | none — cannot approve large adjustments |
| customer زبون | own profile, vehicles, invoices, points, complaints | fuel cost, station profit | edit own data, request invoice correction |
| platform admin أدمن المنصة | station health, subscriptions, support, escalated complaints | **station finances** unless a live `access_grants` row exists | activate/suspend stations, plans, support |

## Database is the gate (Supabase RLS)
- RLS is enabled on **every** table in `public`. When you add a table, add `alter table … enable row level security` plus policies in a new migration. A table with no policy is invisible, which is the safe default.
- Helper functions (SECURITY DEFINER, `stable`):
  - `is_station_member(station)`
  - `has_station_role(station, array[...]::member_role[])`
  - `is_owner(station)`
  - `is_finance(station)` = owner/accountant or an access grant
  - `is_station_staff(station)` = owner/accountant/shift_manager or an access grant
  - `is_platform_staff()`
  - `has_access_grant(station)`
- Clients **read** through RLS. **Multi-table writes go through RPCs** that start with `perform require_role(station, array[...])`, which raises `42501 FUELOS_PERMISSION_DENIED`. Attendants have no direct insert policy on `sales` or `shifts`.
- Always write NULL-safe checks. `auth.uid()` is NULL for guests, and `NULL <> x` is not true, so a check can silently pass. Use `coalesce(col = auth.uid(), false)` or `is distinct from`. The tests cover guests.
- Internal helpers (`post_entry`, `apply_stock_adjustment`, `acct`, `company_balance`, `tank_avg_cost`, …) have `execute` revoked from `authenticated`. Keep it that way for anything that skips role checks.
- `anon` (guests) gets only `public_station_prices`, `plans` and `offers`.

### Policy template
```sql
alter table my_table enable row level security;
create policy my_table_read  on my_table for select to authenticated using (is_station_staff(station_id));
create policy my_table_write on my_table for all to authenticated
  using (has_station_role(station_id, array['owner','accountant']::member_role[]))
  with check (has_station_role(station_id, array['owner','accountant']::member_role[]));
-- audit if sensitive:
create trigger my_table_audit after insert or update or delete on my_table for each row execute function fn_audit();
```
Then add RLS checks to `supabase/tests/10_business_rules_test.sql`, using `set local role authenticated` and `pg_temp.act_as(user)`.

## Approvals (صندوق الموافقات — O7)
`approval_requests.type` has four values:
- `shift_close`: owner
- `credit_over_limit`: owner
- `stock_adjustment`: owner or shift manager
- `shift_reopen`: owner

Every request stores a `payload` snapshot for the approver. A rejection **requires a note**. The decision (who, when, option, note) is kept and audited.

## Platform access to station data
- There is no standing access. Support must create an `access_grants` row with a reason (ticket), at most **24 h**, enforced by RLS.
- The owner can see grants on their station, and the audit log records them. The admin UI (A4) shows: «وصول مؤقت لبيانات محطة الساحل — السبب: تذكرة #482».

## UI rule: don't hide, explain
Spec: «قل من يملك الصلاحية، ولا تخفِ الزر دون تفسير».
- If a user lacks a permission for an action on a screen they can see, show the control **disabled**, with a one-line reason and who can do it. Example: «اعتماد الإغلاق متاح لصاحب المحطة فقط».
- A whole screen without access shows the Permission state (ST4). It names the owner of the permission and offers «اطلب الصلاحية».
- Exception: data the role must never know exists stays out of the UI entirely. Purchase cost and profit are never shown to attendants, not even as disabled fields.
- Map `42501` / `FUELOS_PERMISSION_DENIED` to that Arabic explanation. Never show the raw code.

## Sessions
- Office users (owner, accountant, admin) sign in with email or phone plus OTP (L1).
- Attendants use a PIN on a **registered device** (L2; `devices`, `station_members.pin_hash`). Build that as an Edge Function that verifies device + PIN and issues a session.
- Customers use phone OTP (L3). Guests can browse prices without signing in.
