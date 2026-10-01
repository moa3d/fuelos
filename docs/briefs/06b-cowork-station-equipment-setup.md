# Brief 06b — a new station has no products, tanks, pumps or nozzles (request for Cowork)

Written by Claude Code on 2026-09-29 while building A2's onboarding flow further (`design/screens/A2.png`).
Needs the Supabase connection (a new SECURITY DEFINER RPC, multi-table), so it goes through Claude in Cowork.
**Nothing here blocks today's A2**: `admin_create_station()` (docs/briefs/06a) creates the organization,
station and owner, and a real join link, all of which work. This is the next layer down.

**Status (2026-10-01): done.** Cowork shipped `setup_station_equipment()`/`station_readiness()` (docs/briefs/06e).
Admin equips a station from a template with live meter readings and sees the 7-item readiness checklist
(`apps/admin/app/(app)/stations/[id]/page.tsx`); owner-web's settings «الخزانات والمضخات» tab uses the same RPC
to add a tank or pump later. Verified end to end in a real browser against the hosted project.

## What's missing
A station created by `admin_create_station()` has **no equipment at all** — zero rows in `products`, `tanks`,
`pumps`, `nozzles`. Nothing in the app layer can create them either: I checked, and neither admin nor
owner-web has any tank/pump/nozzle creation code anywhere in the repo. A brand-new station can't actually run
a shift (`shifts`/`shift_legs` need a nozzle, which needs a pump and a tank, which needs a product) until
someone inserts these rows directly in the database — there's no UI path for it today.

`design/screens/A2.png`'s wizard shows this as steps 2–3 (خزانات، مضخات) during onboarding, with a live
readiness checklist ("جاهزية أول يوم تشغيل: اكتمل 2 من 7"). The checklist items themselves don't need new
schema — they're all computable from existing tables (station row exists, ≥1 product/tank, ≥1 pump with a
tank linked, an invited owner, an invited attendant with a PIN, a chosen plan, a first shift) — but the
equipment rows themselves need a real write path first.

## The ordering constraint
`tanks.product_id` and `nozzles.{pump_id,tank_id}` are all `station_id`-scoped foreign keys (a tank must
reference a product of the *same* station, a nozzle a pump and tank of the *same* station) — see
`supabase/migrations/20260924000100_core.sql`'s `products`/`tanks`/`pumps`/`nozzles` tables. Creating a
station's starting equipment is a genuine multi-table, order-dependent write (products → tanks → pumps →
nozzles), which is exactly why this needs a SECURITY DEFINER RPC rather than four separate client inserts
(CLAUDE.md rule 2).

## Request
Something like `admin_setup_station_equipment(p_actor uuid, p_station uuid, p_equipment jsonb)`:
- `require_role` — platform admin only if called from the admin app; or reuse whatever role check
  `admin_create_station` already uses.
- `p_equipment` shaped as a list of products, each with its tanks, each pump with which tank(s) its nozzles
  draw from — exact shape is Cowork's call, whatever's cleanest to write. The 3 canonical templates the design
  shows ("محطة صغيرة · 4 مضخات", "متوسطة · 6", "كبيرة · 10") could be seed data the RPC reads, or just
  templates the client sends — either works, no strong opinion here.
- Inserts `products`, then `tanks`, then `pumps`, then `nozzles`, all inside one transaction (all-or-nothing —
  a station shouldn't end up half-equipped).
- Logs to `audit_log`.

## Also worth deciding (product question, not urgent)
Should a station's owner be able to add a pump/tank *later* too (e.g., the station physically expands), from
owner-web — not just once during admin onboarding? If yes, the same RPC (or a smaller single-equipment
version of it) would need an owner-role check as well, not just platform-admin. Flagging it since it's the
same schema gap either way; happy to build whichever surface(s) Cowork/the owner want first.
