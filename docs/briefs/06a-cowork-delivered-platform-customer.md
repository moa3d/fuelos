# Brief 06a — delivered by Cowork: A2 onboarding, join links, customer & admin gaps

Written by Claude in Cowork on 2026-09-29. It answers briefs **04c** (invites), **04e**, **04f**, **04g**, **05a**, **05b** and
the A2 question. Everything below is **already deployed** to Supabase (migrations `20260929000100`, `20260929000200`;
Edge Functions `invite-station-member` v2 and `onboard-station` v1). **Do not edit `supabase/`** — commit the files as they are.

Owner decisions (2026-09-29):
- **A2:** the platform admin creates the station and sends the owner a join link (WhatsApp). There is no self sign-up.
- **Email:** later. No SMTP yet, so customer email-OTP login (L3, brief 04d) and report emails (04a) stay blocked.
  **Invites no longer need email.**
- **Rewards:** offer code, plus a per-station point value, plus reward tiers.

## 1. Join links instead of invitation emails (owner-web + admin)
Both functions return `login: { token_hash, type: "invite" } | null`. **Nothing is emailed.** The app builds a link and
shows it with «نسخ الرابط» and «إرسال عبر واتساب» (`https://wa.me/?text=` + an encoded Arabic message containing the link).

**New page: owner-web `/welcome`** (public route). It is shared by both flows.
1. Read `token_hash` and `type` from the query string.
2. Call `supabase.auth.verifyOtp({ token_hash, type })`. On error, show «انتهت صلاحية الرابط أو استُخدم من قبل — اطلب رابطاً جديداً من صاحب المحطة» (or «من فريق FuelOS» for an owner).
3. Show a form «اختر كلمة مرور» (password + confirm, 8 characters or more), then call `supabase.auth.updateUser({ password })`.
4. Call `rpc('accept_station_invites')`, then go to `/`.

Links expire in about **1 hour** (the Supabase default). Asking again gives a fresh link.
A link is only ever made for an account that has **never signed in**. Nobody can get a link into an account already in use.

### invite-station-member (changed — O11)
`POST { station_id, role, display_name, email? }` returns `200 { user_id, status: "invited" | "active", login }`.
- New office member: `login` is set. Show the link card.
- Attendant: `login` is null and the status is `active`. Continue to set the PIN (`set_member_pin`) as today.
- An account that already exists and is in use: `login` is null. Show «أُضيف — يدخل بحسابه المعتاد».
- Inviting an `invited` member again returns a **fresh link** and adds nothing. Use this for the «رابط جديد» button on invited rows (send the same body).
- `email_sent` and `FUELOS_EMAIL_UNAVAILABLE` are **gone**.
- Errors: 400 FUELOS_BAD_REQUEST · 403 FUELOS_PERMISSION_DENIED · 409 FUELOS_ALREADY_MEMBER · 500 FUELOS_INTERNAL.

### onboard-station (new — A2, platform admin only)
`supabase.functions.invoke('onboard-station', { body })`:
- **Create:** `{ action: "create", station_name, owner_name, owner_email, org_name?, currency? ("SYP"), city?, plan_id?, trial_days? (14, range 0–90), lat?, lng? }`
  - Returns `200 { organization_id, station_id, owner_user_id, login }`.
  - Creates the organization, the station, the active owner, the default catalog (products, accounts, period), and a
    `trial` subscription when `plan_id` is given. It is audited as `onboard_station`.
  - `login` is null when the owner already uses FuelOS. He will see the new station on his next sign-in.
  - Build the link as `${NEXT_PUBLIC_OWNER_WEB_URL}/welcome?token_hash=…&type=invite`. Add `NEXT_PUBLIC_OWNER_WEB_URL` to the admin app's `.env.local` / `.env.example` (e.g. `http://localhost:3001`).
- **Fresh link:** `{ action: "link", station_id }` returns `200 { owner_user_id, login }`, or
  **409 FUELOS_ALREADY_ACTIVE** when the owner has already signed in. Show «المالك فعّل حسابه — يستطيع استخدام "نسيت كلمة المرور"».
- Errors: 400 FUELOS_BAD_REQUEST (`detail` names the field) · 403 FUELOS_PERMISSION_DENIED (support staff too) · 404 FUELOS_NOT_FOUND (plan / owner) · 500 FUELOS_INTERNAL.
- Read `error.code` with `await error.context.json()`.

## 2. Customer app
- **04e:** `sales.product_name` holds the fuel's name, frozen at sale time. Every existing sale is filled in, and new ones fill themselves. Read it straight from `sales`.
- **04f:** `vehicles.monthly_budget numeric(16,2)`, `last_service_odometer_km int` and `service_interval_km int (> 0)` are all nullable. The customer updates his own row, which the existing RLS allows.
  - Next service = `last_service_odometer_km + service_interval_km − latest sale odometer`.
  - Show a C5 empty state with «أضف ميزانية» / «أضف موعد الصيانة» until they are set.
- **04g:** these are readable by guests and customers:
  - `offers.code`: nullable, uppercase `A-Z 0-9 -`, 3–20 characters, unique per station.
  - `loyalty_programs (station_id pk, point_value)`: what one point is worth in that station's currency. Show «≈» only when a row exists.
  - `reward_tiers (id, station_id, points_threshold, title, is_active)`: only active tiers are visible.
  - Points are per station (`loyalty_ledger.station_id`). Compare a customer's balance **at that station** with its tiers.
  - «متاح لك» by `offers.rule` is still out of scope; keep «فعّال / منتهٍ».
- **Map:** `public_station_prices` now also has `lat` and `lng`, which are null until the owner sets them.

## 3. Owner-web (small additions)
- **Settings → location of the station:** update `stations.lat` and `lng` directly (owner RLS). Both must be set, or both empty.
- **Settings → rewards:**
  - upsert `loyalty_programs` (point value > 0);
  - add, edit or deactivate `reward_tiers`;
  - set `offers.code`.
  - All three are owner only.

## 4. Admin app
- **05a devices:** platform staff can now read `devices` (`station_id`, `label`, `last_sync_at`, `pending_ops`). «لم تزامن منذ 3 أيام» = the station's latest `last_sync_at` is older than 3 days. `last_sync_at` has been updated by the worker's `report_device_sync` since plan 1.
- **05a MRR trend:** read `mrr_snapshots (month, organization_id, plan_id, stations, amount)` (platform staff only).
  - There is one row per organization per month, taken on the 1st by pg_cron. This month's row was taken today.
  - It counts **active** subscriptions only. If A1's live MRR also counts `past_due`, align A1 to `active`.
  - History before today can't be rebuilt. Show only the months that exist and don't invent past values.
- **05b payments:** call `rpc('record_subscription_payment', { p_subscription, p_amount, p_method, p_note?, p_renews_at? })` and get back the payment id. **Platform admins only**; support gets 42501.
  - `p_method` is one of `'cash' | 'transfer' | 'card' | 'other'`, shown as «نقداً / حوالة / بطاقة / أخرى».
  - It sets the subscription `active` until `p_renews_at`. The default is one month after the later of today and the current `renews_at`.
  - It is audited. Errors: FUELOS_BAD_REQUEST (`detail` amount / method / renews_at) and FUELOS_NOT_FOUND.
  - Read the history from `subscription_payments`, which is append-only. The owner can read his own payments too.
  - `rpc('is_platform_admin')` returns a boolean. Use it to disable the admin-only buttons for support staff, with a «للمدير فقط» hint.

## Done when
- lint, test and build all pass for owner-web and admin.
- Browser test:
  1. As admin, onboard «محطة تجريبية» with a **new** email (any made-up address, since nothing is sent) and copy the link.
  2. Open the link in a private window, set a password, and land on the new station's dashboard.
  3. The link's second use shows the expired message.
  4. Record a manual payment in A3 and see the history row.
  5. In O11, invite an accountant with a new email, open the link, and the member becomes «نشط».
- One commit and a push, then a short Arabic summary for the owner. Update the brief statuses (04c, 04e, 04f, 04g, 05a, 05b: done; 04a and 04d: waiting on email).
