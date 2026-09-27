# Brief 04c — inviting a new user + last sign-in (request for Cowork)

Written by Claude Code on 2026-09-27 while building O11 «الإعدادات». Needs the Supabase connection (a new
Edge Function, and/or a SECURITY DEFINER view over `auth.users`), so it goes through Claude in Cowork.
**Status (2026-09-27): done** (`20260927000200_complaints_invoices_members.sql` + the `invite-station-member`
Edge Function). Both wired into O11: the users table shows «آخر دخول» via `station_members_activity`, «+ دعوة
مستخدم» calls the Edge Function, and `accept_station_invites()` runs once on every office sign-in
(`apps/owner-web/lib/office.ts`).

**Nothing here blocks O11**: managing an *existing* member's role/status, setting an attendant's PIN
(`set_member_pin`, already built), and editing the station's tolerance limits (`cash_tolerance`,
`stock_tolerance_l`, `max_shift_hours`, `default_credit_limit`, `offline_max_ops`) all work today as owner-only
writes under the existing RLS (`members_owner_write`, `station_owner_update`).

## 1. «+ دعوة مستخدم» has no way to create the account
`station_members.user_id` is a not-null FK to `auth.users(id)`, so a client can only add a row for someone who
already has an account — there's no lookup-by-phone/email RPC for that either. Creating a brand-new
`auth.users` row (an invite email, or a temporary password) needs the Supabase Admin API, which only runs with
the service role — the app never holds that key (CLAUDE.md rule 7). Request: an Edge Function, e.g.
`invite_station_member(p_station uuid, p_phone_or_email text, p_role member_role, p_display_name text)`:
- `require_role(owner)`.
- Calls `supabase.auth.admin.inviteUserByEmail` (or the phone equivalent) with the service role, then inserts
  the `station_members` row itself (`status = 'invited'`), so the owner-web app only ever calls the function.
- Logs to `audit_log`.

## 2. No way to show «آخر دخول» (last sign-in)
`auth.users.last_sign_in_at` isn't exposed to PostgREST. A small view or RPC would do, e.g.
`station_members_activity(p_station uuid) returns table(user_id uuid, last_sign_in_at timestamptz)`
(SECURITY DEFINER, `require_role(owner, accountant, shift_manager)`, reading `auth.users` internally). O11
shows the users table without that column today rather than a fake or stale one.
