# Brief 05b — no payment history for subscriptions (request for Cowork)

Written by Claude Code on 2026-09-28 while building the admin app's A3 (الاشتراكات والباقات). Needs the
Supabase connection, so it goes through Claude in Cowork. **Nothing here blocks A3**: `subscriptions` (status,
renews_at) and `plans` are fully admin-writable already (`subs_admin`/`plans_admin` RLS), so changing a plan,
cancelling, or marking a subscription active/renewed all work today.

## What's missing
`subscriptions` only tracks current state — `status`, `trial_ends_at`, `renews_at` — with no history of actual
payments (amount, date, method, who recorded it). `design/screens/A3.png`'s "تسجيل دفعة يدوية" implies a real
payment record; today the admin app can only mark a subscription `active` with a fresh `renews_at`, which is
honest about *current* standing but leaves no audit trail of what was actually paid, when, or by what method.

## Request
A small `subscription_payments(id, subscription_id, amount numeric, method text, recorded_by uuid, note text,
created_at)` table (append-only, like `invoice_corrections`/`loyalty_ledger`), admin-insert-only via
`is_platform_staff()`. "تسجيل دفعة يدوية" would insert a row here and then update `subscriptions.status`/
`renews_at` — giving a real ledger instead of just the latest state.
