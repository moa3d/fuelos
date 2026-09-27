# Brief 04e — a customer can't resolve which fuel a sale was for (request for Cowork)

Written by Claude Code on 2026-09-27 while building the customer app's C3/C4 (فواتيري, تفاصيل الفاتورة).
Needs the Supabase connection, so it goes through Claude in Cowork. **Nothing here blocks C3/C4**: everything
else (invoice list, totals, loyalty points, vehicle link, filing a complaint) works today — the fuel name just
shows blank instead of a guess.

## What happened
`sales` only stores `nozzle_id`, not a product name or `product_id` directly. To show "بنزين 95" on an
invoice, the client would need to resolve `nozzle_id → tanks.product_id → products.name`. A read-only probe
against the live project (signed in as the demo customer) confirmed all three of those tables are unreadable
by a customer:
```sql
create policy nozzles_read  on nozzles  for select to authenticated using (is_station_member(station_id) or has_access_grant(station_id));
create policy tanks_read    on tanks    for select to authenticated using (is_station_member(station_id) or has_access_grant(station_id));
create policy products_read on products for select to authenticated using (is_station_member(station_id) or has_access_grant(station_id));
```
A customer is never a station member, so all three return zero rows for them — not an error, just silently
empty. (The same probe found `stations` has the same restriction; `public_station_prices` already solves that
one for station name/currency, but has no per-sale linkage.)

## Request
One customer-safe way to get a sale's product name, e.g. either:
- add `sales.product_name text` (denormalized at insert time, like a receipt line — never changes even if the
  product is renamed later, which is arguably more correct for a historical invoice anyway), or
- a small SECURITY DEFINER RPC `invoice_products(p_invoice_ids uuid[]) returns table(invoice_id uuid,
  product_name text)` that checks each invoice's `customer_id = auth.uid()` before resolving its nozzle chain.

Either closes this for C3/C4; the denormalized-column option also means the worker app's own receipt/history
views get it for free.
