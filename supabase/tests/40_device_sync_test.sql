-- =====================================================================
-- FuelOS — device sync report (migration 20260926000300_device_sync_report.sql)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/40_device_sync_test.sql
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

set local role authenticated;
select pg_temp.act_as('11111111-0000-4000-8000-000000000004');           -- خالد, attendant
select report_device_sync('demo-phone-390', 3);
reset role;
select pg_temp.ok((select pending_ops = 3 and last_sync_at is not null from devices where id = 'demo-phone-390'),
                  'an attendant reports his device''s queue');
set local role authenticated;
select pg_temp.throws($$select report_device_sync('demo-phone-390', -1)$$, 'FUELOS_BAD_REQUEST', 'a negative queue size is refused');
select pg_temp.throws($$select report_device_sync('no-such-device', 0)$$, 'FUELOS_NOT_FOUND', 'an unknown device is refused');
update devices set pending_ops = 99 where id = 'demo-phone-390';                -- RLS: silently matches no row
reset role;
select pg_temp.ok((select pending_ops = 3 from devices where id = 'demo-phone-390'), 'attendant: a direct update of devices changes nothing');
set local role authenticated;
select pg_temp.act_as('11111111-0000-4000-8000-000000000006');           -- رنا, a customer
select pg_temp.throws($$select report_device_sync('demo-phone-390', 0)$$, '42501', 'a non-member cannot report for the device');
reset role;

\o
select 'ALL DEVICE SYNC TESTS PASSED' as result;
rollback;
