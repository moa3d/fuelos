-- =====================================================================
-- LOCAL ONLY — a tiny stand-in for what Supabase already provides, so the migrations
-- can be tested on a plain Postgres 16 without Docker. Do NOT run this on Supabase.
--   psql -f supabase/tests/local/00_supabase_stub.sql
--   then every file in supabase/migrations in order, then seed.sql, then supabase/tests/*.sql
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- same column names as Supabase's auth.users for the columns the seed uses
create table if not exists auth.users (
  instance_id         uuid,
  id                  uuid primary key,
  aud                 varchar(255),
  role                varchar(255),
  email               varchar(255) unique,
  phone               text unique,
  encrypted_password  varchar(255),
  email_confirmed_at  timestamptz,
  phone_confirmed_at  timestamptz,
  raw_app_meta_data   jsonb,
  raw_user_meta_data  jsonb,
  confirmation_token      varchar(255),
  recovery_token          varchar(255),
  email_change_token_new  varchar(255),
  email_change            varchar(255),
  created_at          timestamptz,               -- no default, exactly like Supabase (seed must set it)
  updated_at          timestamptz
);
-- Supabase Auth cannot load users whose created_at/updated_at are NULL; fail loudly here too.
alter table auth.users add constraint local_users_have_timestamps
  check (created_at is not null and updated_at is not null) not valid;

-- same behaviour as Supabase: the user id comes from the request JWT
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))
$$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
