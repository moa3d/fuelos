# Brief 06d — no way to link a walk-in customer to a cash sale (request for Cowork)

Written by Claude Code on 2026-09-30, found while auditing the worker app for remaining gaps (not tied to a
specific screen build this time). Needs the Supabase connection (a new RPC, and maybe a column), so it goes
through Claude in Cowork. **Nothing here blocks anything today**: `apps/worker/app/shift/page.tsx` already
shows this as a correctly-disabled, honest placeholder ("ربط زبون (اختياري) — فقط إن أراد فاتورة رقمية أو
نقاطاً · قريباً") instead of pretending it works.

**Status (2026-10-01): done.** Cowork shipped `customers.qr_token` and `lookup_customer_for_sale()` (docs/briefs/06e).
The customer app has a «بطاقتي» screen with a real scannable QR; the worker app's S2 looks a customer up by
card code or phone and links any payment method, never blocking the sale offline. Verified end to end in a real
browser, including the offline case.

## What's missing
`sales.customer_id uuid references customers(id)` is already nullable and ready (`supabase/migrations/20260924000100_core.sql`) —
a fill *can* be tied to a customer, which is what makes a digital invoice (C3/C4) and loyalty points
(`loyalty_ledger`, C6) possible for that fill. But nothing lets an attendant actually **identify** which
customer is standing at the pump:
- `customers` has no `qr_token` (unlike `company_accounts.qr_token`, already used by S8's
  `lookup_company_for_sale` for the credit-account flow — see `docs/briefs/02c-cowork-company-lookup.md`).
- `customers.phone` exists and is unique, but there's no RPC to look a customer up by it from the worker app
  (and a plain `select` would leak every customer's phone/id to any attendant — needs the same
  least-privilege shape `lookup_company_for_sale` already uses).
- The customer app has nowhere that shows a QR code or any other code the customer could hand to an
  attendant — there's no "بطاقتي"/loyalty-card screen at all today.

## Request
Whichever shape Cowork prefers, roughly mirroring `lookup_company_for_sale`'s existing pattern:
- `customers.qr_token text unique` (nullable, generated at signup or on first request) — printed/shown on a
  customer-app screen the same way a company's is printed on a physical card.
- `lookup_customer_for_sale(p_station uuid, p_query text) returns jsonb` — SECURITY DEFINER,
  `require_role(attendant, shift_manager)`, matches `p_query` against `qr_token` or `phone`, returns just
  enough to confirm at the pump (e.g. `customer_id`, a first name or masked name) — **not** the full profile,
  no other stations' history, per the permissions skill's least-privilege rule. A no-match returns null/empty,
  not an error (a cash sale with no customer stays perfectly valid — this is optional, never required).
- On the customer app side: a small "بطاقتي" screen (or a QR block on C1's own signed-in header) rendering
  `qr_token` as a QR code for the attendant to scan, plus the same code shown as plain text/digits as a
  fallback for a phone lookup when the attendant has no scanner.

## Not part of this request
Actually rendering/scanning a QR code client-side is ordinary app work once the token and lookup RPC exist —
not something that needs Cowork beyond the schema/RPC above.
