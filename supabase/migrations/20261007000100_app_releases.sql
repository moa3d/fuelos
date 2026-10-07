-- =====================================================================
-- FuelOS — Android app releases (spec docs/superpowers/specs/2026-10-07-worker-android-capacitor-design.md)
--   * bucket app-releases: public read (APK downloads + latest.json), 100 MB, APK + JSON only.
--     NO write policies: only the Edge Function `release-upload` writes, with the service role.
--   * release_tokens: SHA-256 of the CI upload token(s). Readable by nobody but the service role.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('app-releases', 'app-releases', true, 100 * 1024 * 1024,
   array['application/vnd.android.package-archive', 'application/json'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

create table release_tokens (
  id          uuid primary key default gen_random_uuid(),
  label       text not null check (char_length(label) between 1 and 80),
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
alter table release_tokens enable row level security;
revoke all on release_tokens from public, anon, authenticated;
