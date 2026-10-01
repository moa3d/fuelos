-- =====================================================================
-- FuelOS — station_devices() (migration 20261001000200)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/91_station_devices_test.sql
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

select id as station from stations where name = 'محطة النور' \gset
select '11111111-0000-4000-8000-000000000001' as owner, '11111111-0000-4000-8000-000000000002' as acct,
       '11111111-0000-4000-8000-000000000004' as khaled, '11111111-0000-4000-8000-000000000006' as rana \gset

-- a device registered the old way (a row, no credential) and one that gets a credential
insert into devices (id, station_id, label) values ('legacy-dev', :'station', 'جهاز قديم') on conflict do nothing;

set local role authenticated;
select pg_temp.act_as(:'owner');
select issue_device_credential(:'station', 'fresh-dev', 'جهاز جديد') as secret \gset
select pg_temp.ok((select (x ->> 'credential_status') = 'active' from jsonb_array_elements(station_devices(:'station')) x where x ->> 'device_id' = 'fresh-dev'),
                  'an issued device is active');
select pg_temp.ok((select (x ->> 'credential_status') = 'none' from jsonb_array_elements(station_devices(:'station')) x where x ->> 'device_id' = 'legacy-dev'),
                  'a device with no credential says none');
select revoke_device('fresh-dev', 'lost the phone');
select pg_temp.ok((select (x ->> 'credential_status') = 'revoked' and x ->> 'credential_revoked_at' is not null
                     from jsonb_array_elements(station_devices(:'station')) x where x ->> 'device_id' = 'fresh-dev'), 'a revoked device says revoked');
select issue_device_credential(:'station', 'fresh-dev') is not null as reissued \gset
select pg_temp.ok((select (x ->> 'credential_status') = 'active' and x ->> 'credential_revoked_at' is null
                     from jsonb_array_elements(station_devices(:'station')) x where x ->> 'device_id' = 'fresh-dev'), 're-issuing makes it active again');
select pg_temp.ok((select not (to_jsonb(station_devices(:'station'))::text like '%secret%')), 'no secret or hash is ever returned');
select pg_temp.ok((select jsonb_array_length(station_devices(:'station')) >= 2), 'the owner sees all the station''s devices');

select pg_temp.act_as(:'acct');
select pg_temp.throws(format('select station_devices(%L)', :'station'), '42501', 'an accountant cannot list devices');
select pg_temp.act_as(:'khaled');
select pg_temp.throws(format('select station_devices(%L)', :'station'), '42501', 'an attendant cannot');
select pg_temp.act_as(:'rana');
select pg_temp.throws(format('select station_devices(%L)', :'station'), '42501', 'a customer cannot');
reset role;
set local role anon;
select pg_temp.throws(format('select station_devices(%L)', :'station'), '42501', 'anon cannot');
reset role;

\o
select 'PASS 91_station_devices_test';
rollback;
