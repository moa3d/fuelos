# Brief 08a — platform sales summary across every station (request for Cowork)

Written by Claude Code on 2026-10-04 while building A5 «مبيعات المحطات» (admin). Needs the Supabase connection
(a new SECURITY DEFINER RPC — platform staff cannot read a station's shifts/sales directly; RLS correctly keeps
a station's financials to its own members, per the permissions skill's own rule). **This DOES block A5**: the
screen is built end to end against the RPC shape below, but it has nothing real to show until the RPC exists —
it sits on the ordinary "تعذّر التحميل" error state in the meantime, same as any screen waiting on an
undeployed RPC.

## What's missing
`stations`/`subscriptions`/`plans`/`devices` are already platform-readable (`is_platform_staff()` policies,
e.g. `devices_platform_read`), but `shifts`/`sales`/`leg_readings` are correctly station-scoped only. A5 needs,
for a date range, per-station aggregates across *every* station: approved-shift counts, liters, sales value by
payment method, and basic health signals (last approved shift, last device sync, device count) — numbers only,
no invoice/customer/line-item detail.

## Request
```
platform_sales_summary(p_from date, p_to date) returns jsonb
```
- **Who:** platform staff only (`is_platform_staff()`); others get `42501`.
- **Scope:** every station, one row each, **plus one totals row** for the whole platform. Suggested shape —
  happy to take whatever's cleanest on your end; numbers as either a JSON number or a numeric string, the same
  convention `shift_summary()`/`dashboard_summary()` already use (the client already handles both):
  ```json
  {
    "rows": [
      {
        "station_id": "uuid", "station_name": "text", "organization_name": "text", "city": "text|null",
        "station_status": "setup|active|suspended", "plan_name": "text|null",
        "subscription_status": "trial|active|past_due|cancelled|legacy|null",
        "approved_shifts": 0, "liters": 0, "sales_amount": 0,
        "cash_amount": 0, "card_amount": 0, "credit_amount": 0, "voucher_amount": 0,
        "last_approved_shift_at": "timestamptz|null", "last_device_sync_at": "timestamptz|null",
        "device_count": 0
      }
    ],
    "totals": { "approved_shifts": 0, "liters": 0, "sales_amount": 0,
                "cash_amount": 0, "card_amount": 0, "credit_amount": 0, "voucher_amount": 0 }
  }
  ```
- **Only approved shifts, only within the period.** My assumption, flag it if you'd anchor on something else:
  a shift counts when `status = 'approved'` and `closed_at::date` falls between `p_from` and `p_to` inclusive —
  the period means "sales that happened then", not "approvals clicked then".
- **Aggregated numbers only** — no invoice, customer or per-sale detail; a platform ops/health view, not a
  bookkeeping one.
- **A station with nothing in the period still gets a row, all zeros** — the screen shows every station,
  never hides one.
- Logged to `audit_log` like any other platform-wide read.

## Not part of this request
Anything beyond what the RPC needs to feed — the admin screen itself (period filter, totals cards, the table,
sorting, the Excel/TSV export) is ordinary app work, being built against this shape now.
