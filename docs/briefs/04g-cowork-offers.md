# Brief 04g — offer promo codes and personalized eligibility (request for Cowork)

Written by Claude Code on 2026-09-27 while building the customer app's C6 (مكافآتي والعروض). Needs the
Supabase connection, so it goes through Claude in Cowork. **Nothing here blocks C6**: the loyalty balance and
the list of active offers (title, station, validity window) are real and already work.

## What's missing
`design/screens/C6.png` shows two things `offers` doesn't carry yet:
1. A **promo code** per offer (e.g. "NOOR-10") with a copy button — `offers` has no `code` column.
2. A **personalized "متاح لك"** state, distinct from just "still within its date window" — `offers.rule jsonb`
   exists but nothing (server or client) interprets it to say whether *this* customer qualifies. C6 today only
   shows «فعّال» (within the window) vs «منتهٍ» (expired), which is honest but not the same distinction the
   design wants.
3. A **points-to-currency conversion rate** and reward tiers (design: "1,240 نقطة ≈ 6,200 ل.س", "باقي 260
   نقطة لغسيل سيارة مجاني") — no such table/config exists; only the fixed "1 point per 250 on confirmed
   invoices" earn rate is hard-coded (already flagged in docs/data-model.md §8.4's own "known simplifications").

## Request
Whichever of these the product wants first: an `offers.code text` column (simple); and/or a small rewards
catalog (`reward_tiers(points_threshold, title)`) plus a conversion rate, read the same way
`public_station_prices` exposes prices to guests. `offers.rule` interpretation (radius, minimum-liters,
new-customer-only, etc.) is a bigger design conversation — flagging it here rather than guessing at a schema
for it.
