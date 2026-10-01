# Brief 07a — owner-web has no «تسجيل جهاز جديد» screen (request for Cowork)

Written by Claude Code on 2026-10-01, found while manually browser-testing brief 06e end to end: the only way
to get a worker-app device registered was calling `issue_device_credential()` by hand over the REST API — there
is no owner-web screen for it. **Nothing here blocks anything today**: a station that already has a registered
device (the demo seed, or one set up by hand) works fine; this is only about the office-side screen to do it
without a direct API call.

This is a **description of what the DB already gives this screen, and the one gap I found** — not a request to
build the screen. I'm not implementing it until you've looked this over.

**Status (2026-10-01): done.** Cowork shipped `station_devices()` (docs/briefs/07b) exposing exactly the derived
`credential_status` this brief asked for. O11's new «الأجهزة» tab (`apps/owner-web/app/(app)/settings/page.tsx`)
registers, revokes and re-issues a device; verified end to end in a real browser.

## What already exists and needs no change
Everything here is from `supabase/migrations/20260925000100_attendant_pin_login.sql`, already deployed.

- **`issue_device_credential(p_station uuid, p_device_id text, p_label text default null) returns text`**
  - Role: owner or shift_manager of `p_station` (`require_role`); others get `42501`.
  - `p_device_id` is a plain text primary key the *caller* picks — there's no server-side generation. The
    worker app's `/setup` screen (`apps/worker/app/setup/page.tsx`) just asks for whatever string the manager
    gives it, so this screen should generate one client-side (e.g. a short slug or `crypto.randomUUID()`) and
    show it alongside the secret, for the owner to relay to whoever sets up the device.
  - First call for a `p_device_id` inserts into `devices`; calling it again for the **same** id **rotates** the
    secret for that existing device (`on conflict (device_id) do update ...`) rather than erroring — handy for
    "إعادة إصدار الرمز" without a separate RPC.
  - Returns the **plaintext secret once**. Nothing stores it — only its SHA-256 (`device_credentials.secret_hash`).
    Shown to the owner it must be copy-once, never fetchable again (same posture as the join-link flows elsewhere
    in the app).
  - Errors: `FUELOS_REQUIRED` (detail `device_id`, i.e. blank), `FUELOS_ID_CONFLICT` (detail: "device belongs to
    another station" — this id is already someone else's device), `42501`.

- **`revoke_device(p_device_id text, p_reason text) returns void`**
  - Role: owner or shift_manager of the device's station.
  - `p_reason` is required (`FUELOS_REASON_REQUIRED` otherwise) — matches the "a decision needs a note" rule
    used for approvals/rejections elsewhere.
  - Sets `device_credentials.revoked_at`; the device row itself is untouched (so its sync history/label survive
    a revoke). A revoked device fails `attendant-pin-login` with `FUELOS_DEVICE_NOT_REGISTERED`, same as one
    that was never registered.
  - Errors: `FUELOS_NOT_FOUND` (detail `device`), `FUELOS_REASON_REQUIRED`, `42501`.

- **Reading the device list needs no RPC** — `devices` already has a station-member RLS policy
  (`devices_members`, `supabase/migrations/20260924000400_rls.sql`), so a plain
  `select id, label, last_sync_at, pending_ops, created_at from devices where station_id = ...` works for any
  station member today, same pattern as every other office list screen.

## The one gap: whether a device currently has a working credential
`device_credentials` (the table holding `secret_hash`/`revoked_at`) is locked down on purpose — `revoke all ...
from public, anon, authenticated`, readable only by `service_role`. That's correct; a client should never read
secret hashes. But it also means owner-web **cannot tell**, for a row in `devices`, whether it:
- has never been issued a credential (registered the old way, e.g. by seed data, but never actually usable), or
- has an active credential, or
- had its credential revoked (and is currently unusable until re-issued).

Right now the screen could only show the `devices` columns themselves (label, last sync, pending ops) and a
blind "إعادة إصدار الرمز" button — no honest status badge, which breaks the "don't hide, explain" rule for a
screen whose whole purpose is explaining device access.

**Request:** a small read, in whichever shape is cleanest on your end — either works for this screen:
- a SECURITY DEFINER RPC, e.g. `station_devices(p_station uuid) returns jsonb`, same `require_role` as the two
  above, returning `[{ device_id, label, last_sync_at, pending_ops, created_at, credential_status }]` where
  `credential_status` is `'active' | 'revoked' | 'none'`; **or**
- a view (`device_status` or similar) exposing just that one derived boolean/enum per device, grantable to
  `authenticated` and filtered by the same RLS `devices` already uses, so the client still does its own
  `station_id` filter.

No strong opinion on which — whatever keeps `device_credentials.secret_hash` itself exposed to nobody but
`service_role`, which the current design already gets right.

## Not part of this request
The actual screen (device list, "+ تسجيل جهاز" flow showing the one-time secret, "إعادة إصدار الرمز", "إبطال
الجهاز" with a reason) is ordinary app work once the status read above exists — I'll build it once you've
confirmed the shape, not before.
