# Sponsor ads — database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the database side of sponsor ads (tables, storage bucket, RPCs, tests, deploy) so Claude Code can build the admin and customer screens against a live contract.

**Architecture:** One migration adds `ads`, `ad_events`, the public `ad-images` bucket with platform-admin write policies, and six SECURITY DEFINER RPCs; no table is directly readable by API roles. A psql test file covers permissions, validation, the active window, event dedupe and stats. The UI work (spec §4–5) is a separate plan owned by Claude Code, handed over through a delivered brief.

**Tech Stack:** Postgres 16 / Supabase (plpgsql, RLS, storage.buckets), plain psql tests run by `supabase/tests/local/run_local.sh`.

**Spec:** `docs/superpowers/specs/2026-10-04-sponsor-ads-design.md`

## Global Constraints

- Every RPC: `language plpgsql security definer set search_path = public, pg_temp`; permission check first; NULL-safe (`coalesce(is_platform_admin(), false)`).
- Errors: `42501` + `FUELOS_PERMISSION_DENIED`; `P0001` + `FUELOS_REQUIRED` / `FUELOS_BAD_REQUEST` (detail `link` | `dates` | `image_path` | `kind` | `viewer` | `period`) / `FUELOS_NOT_FOUND`.
- `revoke execute … from public, anon, authenticated` then grant exactly as the spec's RPC table says.
- sponsor_name and title 1–120 chars after trim; link `^https://\S+$` or `^tel:\+?[0-9]{6,15}$`; image_path `^ads/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$`.
- Bucket `ad-images`: public, 3 MB (`3 * 1024 * 1024`), MIME `image/jpeg, image/png, image/webp, image/gif`.
- Event day = `(now() at time zone 'UTC')::date`; stats period ≤ 400 days.
- Never edit an applied migration; new file `supabase/migrations/20261004000200_sponsor_ads.sql`.

## Review Focus

1. A paused, archived, not-yet-started or ended ad passed to `record_ad_event` → `{recorded:false}`, no row (no inflating numbers of dead ads).
2. Same device viewing the same ad twice in a day → second call `{recorded:false}`; next day counts again.
3. `p_viewer` that is not a UUID string (empty, 500 chars, SQL-ish text) → `FUELOS_BAD_REQUEST` detail `viewer`, no row.
4. `ends_at` equal to `starts_at` or earlier → `FUELOS_BAD_REQUEST` detail `dates`; `ends_at` null stays open-ended.
5. Support staff calling `save_ad` / `archive_ad` → 42501, while `admin_ads` and `ad_stats` still work for them.

---

### Task 1: Ads schema, bucket and admin RPCs

**Files:**
- Create: `supabase/migrations/20261004000200_sponsor_ads.sql`
- Test: `supabase/tests/94_sponsor_ads_test.sql`

**Interfaces:**
- Produces: tables `ads`, `ad_events` (spec §2); bucket `ad-images`; `save_ad(p_id uuid, p_sponsor text, p_title text, p_image_path text, p_link text, p_starts timestamptz, p_ends timestamptz, p_sort int, p_paused bool) returns jsonb` (the saved row as JSON); `archive_ad(p_id uuid) returns jsonb` (`{id, archived_at}`); `admin_ads() returns jsonb` (array of ad rows + `status` ∈ `scheduled|running|paused|ended` + `views`, `clicks`).

- [ ] **Step 1: Write failing tests** in `94_sponsor_ads_test.sql` (same harness helpers as `93_…`: `act_as`, `ok`, `throws`), using `admin` = `…0007` (platform_admin) and a test-local support user inserted into `platform_staff` with role `support`:
  - `save_ad` as admin inserts; returned `sponsor_name` trimmed; `audit_log` has a row with `entity = 'ads'`.
  - as owner / attendant / support / anon → `42501`.
  - blank sponsor → `FUELOS_REQUIRED`; link `http://x.com` and `javascript:alert(1)` → `FUELOS_BAD_REQUEST` (`link`); `tel:+963944123456` and `https://wa.me/963944123456` accepted; image_path `../evil.gif` → `FUELOS_BAD_REQUEST`; `p_ends <= p_starts` → `FUELOS_BAD_REQUEST`.
  - update with `p_id` changes fields and `updated_at`; unknown `p_id` → `FUELOS_NOT_FOUND`.
  - `admin_ads()` status: future start → `scheduled`; paused → `paused`; past `ends_at` → `ended`; otherwise `running`; archived ads absent.
  - API roles cannot `select` from `ads` or `ad_events` directly (permission error or 0 rows).
  - bucket row exists with `public = true`, `file_size_limit = 3145728`, the four MIME types.
- [ ] **Step 2: Run** `./supabase/tests/local/run_local.sh` → FAIL on `save_ad` missing.
- [ ] **Step 3: Implement** the tables (RLS on, no policies for API roles, `revoke all` from anon/authenticated), `updated_at` maintained by `save_ad`, audit inserts in `save_ad`/`archive_ad`, the bucket insert (`on conflict (id) do nothing`) and storage policies: insert/update/delete on `storage.objects` for `bucket_id = 'ad-images' and is_platform_admin()`.
- [ ] **Step 4: Run** the runner → all tests pass.
- [ ] **Step 5: Commit** `db: sponsor ads schema + admin RPCs`.

### Task 2: Public RPCs and stats

**Files:**
- Modify: `supabase/migrations/20261004000200_sponsor_ads.sql` (not yet applied anywhere)
- Test: `supabase/tests/94_sponsor_ads_test.sql`

**Interfaces:**
- Consumes: Task 1 tables.
- Produces: `active_ads() returns jsonb` (array `{id, sponsor_name, title, image_path, link_url, sort_order}`), `record_ad_event(p_ad uuid, p_kind text, p_viewer text) returns jsonb` (`{recorded: bool}`), `ad_stats(p_from date, p_to date) returns jsonb` (`{rows:[{ad_id,sponsor_name,title,day,views,clicks}], totals:[{ad_id,sponsor_name,title,views,clicks,ctr}]}`, ctr = clicks/views×100 rounded to 1 decimal, 0 when no views).

- [ ] **Step 1: Write failing tests:**
  - as `anon`: `active_ads()` returns only running ads, ordered by sort_order then newest; contains no `created_by`.
  - `record_ad_event(running, 'view', <uuid>)` → `recorded:true`; same again → `false`; `'click'` → `true`; kind `'like'` → `FUELOS_BAD_REQUEST` (`kind`); viewer `'abc'` → `FUELOS_BAD_REQUEST` (`viewer`); paused / archived / scheduled / ended ad → `recorded:false`; unknown ad → `recorded:false`.
  - an event row backdated to yesterday + a new one today for the same viewer both count.
  - `ad_stats` as support works; as owner/anon → `42501`; totals equal the sum of rows; ctr for 1 click / 2 views = 50.0; period of 401 days or `p_from > p_to` → `FUELOS_BAD_REQUEST` (`period`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the three RPCs; grants: `active_ads`, `record_ad_event` to anon + authenticated + service_role; `ad_stats`, `admin_ads` to authenticated + service_role (checked inside).
- [ ] **Step 4: Run** the runner → ALL TESTS PASSED.
- [ ] **Step 5: Commit** `db: sponsor ads public RPCs + stats`.

### Task 3: Deploy and hand over

**Files:**
- Create: `docs/briefs/10a-cowork-delivered-sponsor-ads.md`

- [ ] **Step 1:** `apply_migration` on project `mpjcgarblfixceakyaxy` (name `sponsor_ads`), then set its `schema_migrations.version` to `20261004000200`.
- [ ] **Step 2: Verify live:** `has_function_privilege` for anon on `active_ads` = true and on `save_ad` = false; bucket row present; `get_advisors(security)` shows no new ERROR.
- [ ] **Step 3:** Write the delivered brief: RPC contract (copy of spec §3 with final return shapes), upload path rule, error codes → Arabic copy suggestions, the viewer_key rule, and the UI checklist (spec §4–5).
- [ ] **Step 4:** Commit locally, copy migration + test + brief into the user's folder, give Abid the message for Claude Code.
