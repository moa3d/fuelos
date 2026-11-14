-- =====================================================================
-- FuelOS — station live status (migration 20261111000200_station_live_status.sql)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/96_station_live_status_test.sql
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
create function pg_temp.throws_detail(p_sql text, p_expected text, p_detail text, p_label text) returns void language plpgsql as $$
declare v_detail text;
begin
  begin execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if (sqlerrm = p_expected or sqlstate = p_expected) and v_detail is not distinct from p_detail then
      raise notice 'PASS  % (% / %)', p_label, p_expected, p_detail; return; end if;
    raise exception 'FAIL: % — expected % / %, got % / % / %', p_label, p_expected, p_detail, sqlstate, sqlerrm, v_detail;
  end;
  raise exception 'FAIL: % — expected %, but no error', p_label, p_expected;
end $$;
-- one station of this directory, read as a plain jsonb object
create function pg_temp.st(p_station uuid) returns jsonb language sql as $$
  select coalesce((select e from jsonb_array_elements(public_stations()) e
                    where e->>'station_id' = p_station::text), '{}'::jsonb);
$$;

select id as station from stations where name = 'محطة النور' \gset
select '11111111-0000-4000-8000-000000000001' as owner, '11111111-0000-4000-8000-000000000002' as acct,
       '11111111-0000-4000-8000-000000000003' as mgr,   '11111111-0000-4000-8000-000000000004' as khaled,
       '11111111-0000-4000-8000-000000000005' as mohamad,
       '11111111-0000-4000-8000-000000000006' as rana,  '11111111-0000-4000-8000-000000000007' as admin \gset

-- the seed leaves a shift open for خالد; age it past max_shift_hours (no status change, so no transition
-- guard fires) so that each test below controls "is the station open" itself
update shifts set opened_at = now() - interval '500 hours' where closed_at is null;

-- ---------- 1. shape and grants ----------
select pg_temp.ok((select count(*) = 0 from pg_policies where schemaname = 'public' and tablename = 'station_live_status' and cmd <> 'SELECT'),
                  'station_live_status has no write policy');
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.station_live_status'::regclass), 'station_live_status has RLS enabled');
select pg_temp.ok((select not has_function_privilege('anon', 'set_station_status(uuid, boolean, text)', 'execute')
                          and has_function_privilege('authenticated', 'set_station_status(uuid, boolean, text)', 'execute')),
                  'set_station_status: authenticated only');
select pg_temp.ok((select has_function_privilege('anon', 'public_stations()', 'execute')
                          and has_function_privilege('authenticated', 'public_stations()', 'execute')),
                  'public_stations: anon + authenticated');
select pg_temp.ok((select not has_function_privilege('anon', 'station_live_row(uuid)', 'execute')
                          and not has_function_privilege('authenticated', 'station_live_row(uuid)', 'execute')),
                  'station_live_row is internal to the two RPCs');

-- ---------- 2. who may write ----------
set local role authenticated;
select pg_temp.act_as(:'khaled');
select pg_temp.ok(set_station_status(:'station', true, 'none') ? 'station_id', 'an attendant can set the status');
select pg_temp.act_as(:'mgr');
select pg_temp.ok(set_station_status(:'station', true, 'medium') ? 'station_id', 'a shift manager can set the status');
select pg_temp.act_as(:'owner');
select pg_temp.ok(set_station_status(:'station', true, 'high') ? 'station_id', 'the owner can set the status');
select pg_temp.act_as(:'acct');
select pg_temp.throws(format('select set_station_status(%L, true, null)', :'station'), '42501', 'the accountant cannot set the status');
select pg_temp.act_as(:'rana');
select pg_temp.throws(format('select set_station_status(%L, true, null)', :'station'), '42501', 'a customer cannot set the status');
select pg_temp.act_as(:'admin');
select pg_temp.throws(format('select set_station_status(%L, true, null)', :'station'), '42501', 'platform staff are not station staff');
select pg_temp.act_as(null);
select pg_temp.throws(format('select set_station_status(%L, true, null)', :'station'), '42501', 'a caller without a JWT cannot set the status');
reset role;
set local role anon;
select pg_temp.throws(format('select set_station_status(%L, true, null)', :'station'), '42501', 'anon cannot set the status');
reset role;

-- ---------- 3. validation ----------
set local role authenticated;
select pg_temp.act_as(:'khaled');
select pg_temp.throws_detail(format('select set_station_status(%L, null, null)', :'station'), 'FUELOS_BAD_REQUEST', 'empty', 'both arguments null is rejected');
select pg_temp.throws_detail(format('select set_station_status(%L, null, %L)', :'station', 'busy'), 'FUELOS_BAD_REQUEST', 'crowd', 'an unknown crowd level is rejected');
select pg_temp.throws_detail(format('select set_station_status(%L, null, %L)', :'station', 'NONE'), 'FUELOS_BAD_REQUEST', 'crowd', 'the crowd level is case sensitive');

-- ---------- 4. each field moves on its own ----------
select set_station_status(:'station', false, null);
select pg_temp.ok((select crowd = 'high' and is_open = false from station_live_status where station_id = :'station'),
                  'setting only the open flag keeps the stored crowd');
select set_station_status(:'station', null, 'none');
select pg_temp.ok((select crowd = 'none' and is_open = false from station_live_status where station_id = :'station'),
                  'setting only the crowd keeps the stored open flag');
select pg_temp.ok((select count(*) = 1 from station_live_status where station_id = :'station'), 'one row per station');
reset role;
select pg_temp.ok((select count(*) >= 5 from audit_log where entity = 'station_live_status' and station_id = :'station'), 'every change is audited');

-- ---------- 5. freshness: crowd lives 90 minutes ----------
update station_live_status set crowd = 'high', crowd_set_at = now() - interval '89 minutes' where station_id = :'station';
select pg_temp.ok(pg_temp.st(:'station')->>'crowd' = 'high', 'a crowd report 89 minutes old is still shown');
update station_live_status set crowd_set_at = now() - interval '91 minutes' where station_id = :'station';
select pg_temp.ok(pg_temp.st(:'station')->'crowd' = 'null'::jsonb, 'a crowd report 91 minutes old is dropped');
select pg_temp.ok(pg_temp.st(:'station')->'crowd_set_at' = 'null'::jsonb, 'a dropped crowd report carries no timestamp');
update station_live_status set crowd_set_at = now() + interval '5 minutes' where station_id = :'station';
select pg_temp.ok(pg_temp.st(:'station')->>'crowd' = 'high', 'a crowd timestamp in the future counts as fresh, not stale');

-- ---------- 6. freshness: a manual press lives 12 hours, then the open shift speaks ----------
update station_live_status set is_open = true, open_set_at = now() - interval '11 hours' where station_id = :'station';
select pg_temp.ok((pg_temp.st(:'station')->>'is_open')::boolean and pg_temp.st(:'station')->>'open_source' = 'manual',
                  'a press 11 hours old still decides');
update station_live_status set open_set_at = now() - interval '13 hours' where station_id = :'station';
select pg_temp.ok(pg_temp.st(:'station')->'is_open' = 'null'::jsonb and pg_temp.st(:'station')->'open_source' = 'null'::jsonb,
                  'a press 13 hours old with no open shift leaves the status unknown');

insert into shifts (id, station_id, attendant_id, opened_at, opening_cash, status, device_id)
values ('33333333-0000-4000-8000-0000000000f1', :'station', :'mohamad', now() - interval '1 hour', 0, 'open', null);
select pg_temp.ok((pg_temp.st(:'station')->>'is_open')::boolean and pg_temp.st(:'station')->>'open_source' = 'shift',
                  'an open shift means the station is open once the press has expired');
update station_live_status set is_open = false, open_set_at = now() - interval '1 hour' where station_id = :'station';
select pg_temp.ok((pg_temp.st(:'station')->>'is_open')::boolean is false and pg_temp.st(:'station')->>'open_source' = 'manual',
                  'a fresh press beats the open shift');
update shifts set opened_at = now() - interval '40 hours' where id = '33333333-0000-4000-8000-0000000000f1';
update station_live_status set open_set_at = now() - interval '13 hours' where station_id = :'station';
select pg_temp.ok(pg_temp.st(:'station')->'is_open' = 'null'::jsonb,
                  'a shift left open longer than max_shift_hours does not mean open');
-- shifts are append-only (FUELOS_APPEND_ONLY), so the test shift stays; it is already older than
-- max_shift_hours above, which is exactly the state the rest of this file expects.

-- ---------- 7. the public read model ----------
select pg_temp.ok((select jsonb_typeof(public_stations()) = 'array'), 'public_stations returns an array');
select pg_temp.ok(pg_temp.st(:'station') ?& array['station_id', 'name', 'city', 'address', 'lat', 'lng',
                                                  'is_open', 'open_source', 'open_set_at', 'crowd', 'crowd_set_at', 'products'],
                  'a station carries every directory field');
select pg_temp.ok((select count(*) = 12 from jsonb_object_keys(pg_temp.st(:'station'))), 'and nothing else');
select pg_temp.ok(jsonb_typeof(pg_temp.st(:'station')->'products') = 'array' and jsonb_array_length(pg_temp.st(:'station')->'products') > 0,
                  'products are included');
select pg_temp.ok((select bool_and(p ?& array['product_id', 'name', 'price', 'price_updated_at',
                                              'availability', 'availability_source', 'availability_updated_at'])
                     from jsonb_array_elements(pg_temp.st(:'station')->'products') p), 'every product carries its price and availability');
select pg_temp.ok((select bool_and((select count(*) from jsonb_object_keys(p)) = 7)
                     from jsonb_array_elements(pg_temp.st(:'station')->'products') p), 'a product exposes nothing else');
select pg_temp.ok(pg_temp.st(:'station')::text not like '%attendant%' and pg_temp.st(:'station')::text not like '%updated_by%',
                  'no operational field leaks into the public read model');

update stations set status = 'suspended' where id = :'station';
select pg_temp.ok(pg_temp.st(:'station') = '{}'::jsonb, 'a station that is not active is not published');
update stations set status = 'active' where id = :'station';

-- a station with no products still appears, with an empty array
insert into stations (id, organization_id, name, timezone, currency_code, status)
select '44444444-0000-4000-8000-0000000000f2', organization_id, 'محطة بلا منتجات', timezone, currency_code, 'active'
  from stations where id = :'station';
select pg_temp.ok(pg_temp.st('44444444-0000-4000-8000-0000000000f2')->'products' = '[]'::jsonb,
                  'a station with no products is published with an empty products array');

set local role anon;
select pg_temp.ok((select jsonb_typeof(public_stations()) = 'array'), 'anon can read the directory');
select pg_temp.throws('select count(*) from station_live_status', '42501', 'anon cannot read station_live_status directly');
reset role;

-- ---------- 8. direct writes are impossible for every API role ----------
set local role authenticated;
select pg_temp.act_as(:'owner');
select pg_temp.ok((select count(*) = 1 from station_live_status where station_id = :'station'), 'the owner can read his station''s status row');
select pg_temp.throws(format('insert into station_live_status (station_id, is_open, open_set_at) values (%L, true, now())', '44444444-0000-4000-8000-0000000000f2'),
                      '42501', 'the owner cannot insert a status row by hand');
select pg_temp.throws(format('update station_live_status set crowd = ''none'', crowd_set_at = now() where station_id = %L', :'station'),
                      '42501', 'the owner cannot update a status row by hand');
select pg_temp.throws(format('delete from station_live_status where station_id = %L', :'station'), '42501', 'the owner cannot delete a status row');
select pg_temp.act_as(:'rana');
select pg_temp.ok((select count(*) = 0 from station_live_status), 'a customer sees no status rows');
select pg_temp.act_as(:'admin');
select pg_temp.ok((select count(*) >= 1 from station_live_status), 'platform staff can read every status row');
reset role;

rollback;
\o
\echo '96_station_live_status_test: ALL PASSED'
