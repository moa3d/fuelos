-- =====================================================================
-- FuelOS — platform_sales_summary (migration 20261004000100_platform_sales_summary.sql, brief 08a)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/93_platform_sales_summary_test.sql
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

select id as station from stations where name = 'محطة النور' \gset
select organization_id as org from stations where id = :'station' \gset
select '11111111-0000-4000-8000-000000000001' as owner, '11111111-0000-4000-8000-000000000004' as attendant,
       '11111111-0000-4000-8000-000000000007' as admin \gset
-- ground truth: the approved shifts of the demo station, summed through shift_summary (as its owner)
set local role authenticated;
select pg_temp.act_as(:'owner');
create temp table _truth as
  select s.id, (s.closed_at at time zone st.timezone)::date as d, shift_summary(s.id) as sm
    from shifts s join stations st on st.id = s.station_id where s.station_id = :'station' and s.status = 'approved';
grant all on _truth to authenticated;
reset role;
select pg_temp.ok((select count(*) >= 1 from _truth), 'seed has at least one approved shift on the demo station');
select min(d) as d1 from _truth \gset
-- a station with no activity at all
insert into stations (organization_id, name, currency_code) values (:'org', 'محطة بلا حركة', 'SYP');

-- 1. who may call it
set local role authenticated;
select pg_temp.act_as(:'owner');
select pg_temp.throws('select platform_sales_summary(current_date - 30, current_date)', '42501', 'a station owner cannot read platform sales');
select pg_temp.act_as(:'attendant');
select pg_temp.throws('select platform_sales_summary(current_date - 30, current_date)', '42501', 'an attendant cannot');
select pg_temp.act_as(null);
select pg_temp.throws('select platform_sales_summary(current_date - 30, current_date)', '42501', 'an anonymous caller cannot');
reset role;
set local role anon;
select pg_temp.throws('select platform_sales_summary(current_date - 30, current_date)', '42501', 'anon role has no execute grant');
reset role;

-- 2. platform staff: numbers match the shift summaries
set local role authenticated;
select pg_temp.act_as(:'admin');
select platform_sales_summary(:'d1'::date - 1, :'d1'::date + 1)::text as res \gset
reset role;
create temp table _res as select :'res'::jsonb as j;
select pg_temp.ok((select jsonb_array_length(j->'rows') = (select count(*) from stations) from _res), 'one row per station, including idle ones');
select pg_temp.ok((select (r->>'approved_shifts')::int = 0 and (r->>'sales_amount')::numeric = 0 and (r->>'cash_amount')::numeric = 0
                     from _res, jsonb_array_elements(j->'rows') r where r->>'station_name' = 'محطة بلا حركة'),
                  'an idle station still appears, all zeros');
select pg_temp.ok((select (r->>'sales_amount')::numeric = (select sum((sm->>'meter_sales')::numeric) from _truth)
                     from _res, jsonb_array_elements(j->'rows') r where (r->>'station_id')::uuid = :'station'),
                  'sales amount equals the meter sales of the approved shifts');
select pg_temp.ok((select (r->>'liters')::numeric = (select sum((sm->>'liters')::numeric) from _truth)
                     from _res, jsonb_array_elements(j->'rows') r where (r->>'station_id')::uuid = :'station'),
                  'liters equal the approved shifts liters');
select pg_temp.ok((select (r->>'card_amount')::numeric = (select sum((sm->>'card')::numeric) from _truth)
                      and (r->>'credit_amount')::numeric = (select sum((sm->>'credit')::numeric) from _truth)
                      and (r->>'voucher_amount')::numeric = (select sum((sm->>'voucher')::numeric) from _truth)
                     from _res, jsonb_array_elements(j->'rows') r where (r->>'station_id')::uuid = :'station'),
                  'card / credit / voucher equal the recorded fills');
select pg_temp.ok((select (r->>'cash_amount')::numeric = (r->>'sales_amount')::numeric - (r->>'card_amount')::numeric
                                                          - (r->>'credit_amount')::numeric - (r->>'voucher_amount')::numeric
                     from _res, jsonb_array_elements(j->'rows') r where (r->>'station_id')::uuid = :'station'),
                  'cash = sales − card − credit − voucher');
select pg_temp.ok((select (r->>'approved_shifts')::int = (select count(*) from _truth)
                     from _res, jsonb_array_elements(j->'rows') r where (r->>'station_id')::uuid = :'station'),
                  'approved shift count matches');
select pg_temp.ok((select (j->'totals'->>'sales_amount')::numeric = (select sum((r->>'sales_amount')::numeric) from jsonb_array_elements(j->'rows') r)
                       and (j->'totals'->>'approved_shifts')::int = (select sum((r->>'approved_shifts')::int) from jsonb_array_elements(j->'rows') r)
                     from _res), 'totals row equals the sum of the station rows');
select pg_temp.ok((select (r->>'plan_name') is not null and (r->>'subscription_status') is not null and (r->>'organization_name') is not null
                     from _res, jsonb_array_elements(j->'rows') r where (r->>'station_id')::uuid = :'station'),
                  'plan, subscription and organization come along');
select pg_temp.ok((select not (j::text ~ '(customer|invoice|attendant|national|phone|email)') from _res),
                  'no customer / invoice / attendant detail leaks into the payload');

-- 3. the period filters
set local role authenticated;
select pg_temp.act_as(:'admin');
select pg_temp.ok((select (r->>'approved_shifts')::int = 0 and (r->>'sales_amount')::numeric = 0
                     from jsonb_array_elements(platform_sales_summary(:'d1'::date - 300, :'d1'::date - 2)->'rows') r
                    where (r->>'station_id')::uuid = :'station'),
                  'a period with no approved shift gives zeros, not a missing row');
select pg_temp.ok((select (j->'totals'->>'approved_shifts')::int = (select count(*) from _truth where d = :'d1'::date)
                     from (select platform_sales_summary(:'d1'::date, :'d1'::date) as j) q),
                  'the period is inclusive on both ends, anchored on the closing date');

-- 4. bad periods
select pg_temp.throws('select platform_sales_summary(current_date, current_date - 1)', 'FUELOS_BAD_REQUEST', 'from after to is rejected');
select pg_temp.throws('select platform_sales_summary(null, current_date)', 'FUELOS_BAD_REQUEST', 'a null bound is rejected');
select pg_temp.throws('select platform_sales_summary(current_date - 1000, current_date)', 'FUELOS_BAD_REQUEST', 'a period longer than ~13 months is rejected');

-- 5. audited
reset role;
select pg_temp.ok((select count(*) >= 3 from audit_log where entity = 'platform_sales_summary' and action = 'platform_read' and actor_id = :'admin'),
                  'every call is written to audit_log');
select pg_temp.ok((select count(*) = 0 from audit_log where entity = 'platform_sales_summary' and actor_id in (:'owner', :'attendant')),
                  'rejected callers leave no read record');
\o
select 'PASS 93_platform_sales_summary_test';
rollback;
