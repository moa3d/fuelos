-- =====================================================================
-- FuelOS — app releases (migration 20261007000100_app_releases.sql)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/95_app_releases_test.sql
-- Runs after migrations + seed.sql, in one transaction that is rolled back.
-- =====================================================================
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;
create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', case when p_user is null then '' else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true); $$;
create function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin if p_cond is distinct from true then raise exception 'FAIL: %', p_label; end if; raise notice 'PASS  %', p_label; end $$;
create function pg_temp.throws(p_sql text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm = p_expected or sqlstate = p_expected then raise notice 'PASS  % (%)', p_label, p_expected; return; end if;
    raise exception 'FAIL: % — expected %, got % / %', p_label, p_expected, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % — expected %, but no error', p_label, p_expected;
end $$;
grant execute on function pg_temp.ok(boolean, text), pg_temp.throws(text, text, text), pg_temp.act_as(uuid) to anon, authenticated;

select '11111111-0000-4000-8000-000000000001' as owner, '11111111-0000-4000-8000-000000000007' as admin \gset

-- bucket shape
select pg_temp.ok((select public from storage.buckets where id = 'app-releases'), 'app-releases is public-read');
select pg_temp.ok((select file_size_limit from storage.buckets where id = 'app-releases') = 104857600, 'app-releases limit is 100 MB');
select pg_temp.ok((select allowed_mime_types from storage.buckets where id = 'app-releases')
                  = array['application/vnd.android.package-archive', 'application/json'], 'app-releases accepts APK + JSON only');

-- no policy anywhere lets the API roles write into app-releases
select pg_temp.ok(not exists (
  select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and (coalesce(qual, '') || coalesce(with_check, '')) like '%app-releases%'), 'no storage policy mentions app-releases');

-- token hashes: shape enforced, invisible to every API role
insert into release_tokens (label, token_hash) values ('test', repeat('a', 64));
select pg_temp.throws($q$insert into release_tokens (label, token_hash) values ('bad', 'not-a-hash')$q$, '23514', 'token_hash must be 64 hex');
select pg_temp.throws($q$insert into release_tokens (label, token_hash) values ('dup', repeat('a', 64))$q$, '23505', 'token_hash is unique');

set local role anon;
select pg_temp.throws('select count(*) from release_tokens', '42501', 'anon cannot read release_tokens');
reset role;

set local role authenticated;
select pg_temp.act_as(:'admin');
select pg_temp.throws('select count(*) from release_tokens', '42501', 'platform admin (API) cannot read release_tokens');
select pg_temp.throws($q$insert into release_tokens (label, token_hash) values ('x', repeat('b', 64))$q$, '42501', 'authenticated cannot add a token');
select pg_temp.throws($q$insert into storage.objects (bucket_id, name) values ('app-releases', 'worker/fuelos-worker-1.0.1.apk')$q$, '42501', 'platform admin (API) cannot upload a release');
select pg_temp.act_as(:'owner');
select pg_temp.throws($q$insert into storage.objects (bucket_id, name) values ('app-releases', 'worker/latest.json')$q$, '42501', 'station owner cannot upload a release');
reset role;

rollback;
\o
\echo '95_app_releases_test: ALL PASSED'
