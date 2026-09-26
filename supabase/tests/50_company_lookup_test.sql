-- =====================================================================
-- FuelOS — company lookup for S8/S9 (migration 20260926000400_company_lookup_details.sql)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/50_company_lookup_test.sql
-- Runs after migrations + seed.sql, in one transaction that is rolled back.
-- Seed: «شركة الأمل للنقل» (QR AMAL-DEMO-7F3K, limit 250,000), driver سعيد ناصر, truck 512384 (last odometer 214,300).
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
select id as company from company_accounts where station_id = :'station' \gset
-- a driver the company has not authorized must never be offered
insert into company_drivers (company_account_id, full_name, phone, is_authorized)
values (:'company', 'سائق موقوف', '+963933000999', false);

set local role authenticated;
select pg_temp.act_as('11111111-0000-4000-8000-000000000004');          -- خالد, attendant
select lookup_company_for_sale(:'station', 'AMAL-DEMO-7F3K') as by_qr \gset
select pg_temp.ok((:'by_qr'::jsonb ->> 'credit_limit')::numeric = 250000, 'lookup returns the credit limit for the «الحد المتبقي» bar');
select pg_temp.ok((select jsonb_agg(d ->> 'full_name') from jsonb_array_elements(:'by_qr'::jsonb -> 'drivers') d) = '["سعيد ناصر"]'::jsonb,
                  'only authorized drivers are listed');
select pg_temp.ok((select bool_and(d ? 'driver_id' and d ? 'full_name' and not d ? 'phone')
                     from jsonb_array_elements(:'by_qr'::jsonb -> 'drivers') d), 'drivers carry id and name only, no phone');
select pg_temp.ok(:'by_qr'::jsonb -> 'last_odometer' = 'null'::jsonb, 'no vehicle (QR lookup) → no previous odometer');

select lookup_company_for_sale(:'station', '512384') as by_plate \gset
select pg_temp.ok((:'by_plate'::jsonb ->> 'last_odometer')::int = 214300, 'plate lookup returns the vehicle''s last recorded odometer');
select pg_temp.ok((select array_agg(k order by k) from jsonb_object_keys(:'by_plate'::jsonb) k)
                  = array['company_id', 'credit_limit', 'drivers', 'last_odometer', 'name', 'plate', 'remaining_credit', 'status',
                          'vehicle_id', 'vehicle_label'],
                  'the attendant sees exactly these fields (no balance history, no phones)');
select pg_temp.ok(lookup_company_for_sale(:'station', 'no-such-card') is null, 'an unknown card or plate returns nothing');

select pg_temp.act_as('11111111-0000-4000-8000-000000000006');          -- رنا, a customer
select pg_temp.throws(format('select lookup_company_for_sale(%L, %L)', :'station', 'AMAL-DEMO-7F3K'), '42501',
                      'a customer cannot look up companies');
reset role;
select pg_temp.act_as(null);
set local role anon;
select pg_temp.throws(format('select lookup_company_for_sale(%L, %L)', :'station', 'AMAL-DEMO-7F3K'), '42501',
                      'guest: cannot call the company lookup');
reset role;

\o
select 'ALL COMPANY LOOKUP TESTS PASSED' as result;
rollback;
