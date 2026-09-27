# Brief 02c — company lookup for S8/S9 (request for Cowork)

Written by Claude Code on 2026-09-26 while building S8 «بيع آجل لشركة» and S9 «تجاوز الحد». Needs the Supabase connection, so it goes through Claude in Cowork. **Nothing here blocks S8/S9**: the screens already work with today's `lookup_company_for_sale` and show the extra parts only when the fields are present.

**Status (2026-09-27): done.** Cowork extended `lookup_company_for_sale` (see `20260926000400_company_lookup_details.sql`); the worker app shows the added fields.

## What the screens need that the RPC does not return yet
`lookup_company_for_sale(p_station, p_query)` returns `company_id, name, status, remaining_credit, vehicle_id, vehicle_label, plate`. S8.png also shows:

| Field (optional, added to the same jsonb) | Used for |
|---|---|
| `credit_limit` | the bar «الحد المتبقي» (remaining ÷ limit) |
| `drivers: [{driver_id, full_name}]` — **authorized drivers of that company only** | picking the driver → `p_driver`, badge «سائق مصرّح» |
| `last_odometer` — the latest `sales.odometer_km` for that vehicle, or null | «السابق 84,512» under «عداد السيارة» |

Keep the attendant's view minimal (permissions skill): no balance history, no other companies, no phone numbers.

## Also useful
- Looking up by the QR token of a **driver card** could return that driver directly (`driver_id` preselected). Today the QR token is per company (`company_accounts.qr_token`).
- A test in `supabase/tests` that an attendant sees only these fields and a guest gets 42501.

## App behaviour to know (no DB change needed)
The app always sends `record_sale(..., p_request_approval => true)` for credit fills. If the remaining limit moved between the lookup and the row reaching the server (offline queue), the fill becomes `pending_approval` instead of `FUELOS_CREDIT_LIMIT`, which would otherwise stop the attendant's outbox after the fuel is already in the truck.
