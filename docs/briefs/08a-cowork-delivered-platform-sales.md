# Brief 08a — delivered: `platform_sales_summary` (admin A5 «مبيعات المحطات»)

**Status: deployed** to the live project (migration `20261004000100_platform_sales_summary`), tested locally
(`supabase/tests/93_platform_sales_summary_test.sql`, all tests pass).

```
platform_sales_summary(p_from date, p_to date) returns jsonb   -- { rows: [...], totals: {...} }
```

The shape is exactly the one in `08a-cowork-platform-sales.md`. Decisions on the open points:

- **Who:** `is_platform_staff()` only; anyone else (owner, attendant, anon) gets `42501 FUELOS_PERMISSION_DENIED`.
- **Period:** approved shifts whose `closed_at` falls between `p_from` and `p_to` inclusive, **in the station's own timezone**
  (`stations.timezone`), as you assumed. Reopened / submitted / rejected shifts do not count.
- **Amounts follow the posting rules:** `sales_amount` = meter sales (liters × price in force when the shift opened);
  `card_amount` / `credit_amount` / `voucher_amount` = recorded, non-voided fills; `cash_amount` = sales − card − credit − voucher.
  They match `shift_summary()` shift by shift (the test checks it).
- **Every station gets a row** (zeros when idle), sorted by `sales_amount` desc then name; the `totals` row sums them.
  `approved_shifts`, `liters` and the amounts are JSON numbers; `last_approved_shift_at` / `last_device_sync_at` are `null` when none.
- **`plan_name` / `subscription_status`** come from the organization's newest subscription (`null` when it has none).
- **Errors:** `FUELOS_BAD_REQUEST` (detail `period`) when a bound is null, `p_from > p_to`, or the period is longer than 400 days
  — show «اختر فترة صحيحة (حتى 13 شهراً)».
- **Aggregated numbers only:** no invoice, customer, attendant or per-sale detail ever leaves this function.
- **Audited:** every successful call writes `audit_log` (`action = 'platform_read'`, `entity = 'platform_sales_summary'`,
  `after = {from, to, stations}`); rejected callers leave no record.

Nothing else changes for the apps: call it with `supabase.rpc('platform_sales_summary', { p_from: 'YYYY-MM-DD', p_to: 'YYYY-MM-DD' })`
as a signed-in platform-staff user (`admin@demo.fuelos.app` in the demo data).
