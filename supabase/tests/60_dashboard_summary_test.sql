-- =====================================================================
-- FuelOS — owner dashboard summary O1 (migration 20260927000100_dashboard_summary.sql)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/60_dashboard_summary_test.sql
-- Runs after migrations + seed.sql, in one transaction that is rolled back.
-- Seed: shift A (yesterday, pump 3, approved, 1,250 L of 95 = 156,250) and shift B (today, pump 1, open,
-- one 2,750 card fill); company «الأمل» owes 7,500 − 5,000 paid = 2,500.
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
select id as p95 from products where station_id = :'station' and code = 'gasoline_95' \gset
select '22222222-0000-4000-8000-00000000000a' as shift_a, '22222222-0000-4000-8000-00000000000b' as shift_b,
       now() - interval '3 days' as t_from, now() + interval '40 days' as t_to \gset

-- ---------- period bounds in the station's time zone (Asia/Damascus in the seed) ----------
select pg_temp.act_as('11111111-0000-4000-8000-000000000001');          -- owner
select station_period_bounds(:'station', 'today') as today \gset
select pg_temp.ok((:'today'::jsonb ->> 'timezone') = 'Asia/Damascus'
                  and ((:'today'::jsonb ->> 'to')::timestamptz - (:'today'::jsonb ->> 'from')::timestamptz) = interval '1 day'
                  and now() >= (:'today'::jsonb ->> 'from')::timestamptz and now() < (:'today'::jsonb ->> 'to')::timestamptz
                  and ((:'today'::jsonb ->> 'from')::timestamptz at time zone 'Asia/Damascus')::time = '00:00',
                  'today = the station''s local calendar day');
select pg_temp.ok((select extract(day from ((b ->> 'from')::timestamptz at time zone 'Asia/Damascus')) = 1
                     from (select station_period_bounds(:'station', 'month') b) x), 'month starts on the 1st, local time');
select pg_temp.ok((select (b ->> 'to')::timestamptz - (b ->> 'from')::timestamptz = interval '7 days'
                     from (select station_period_bounds(:'station', 'week') b) x), 'week = the last 7 local days including today');
select pg_temp.throws(format('select station_period_bounds(%L, %L)', :'station', 'decade'), 'FUELOS_BAD_REQUEST',
                      'an unknown period is refused');

-- ---------- totals = the sum of shift_summary over the same shifts ----------
select dashboard_summary(:'station', :'t_from', :'t_to') as s \gset
select (shift_summary(:'shift_a')::jsonb ->> 'meter_sales')::numeric + (shift_summary(:'shift_b')::jsonb ->> 'meter_sales')::numeric as sales_ab,
       (shift_summary(:'shift_a')::jsonb ->> 'liters')::numeric + (shift_summary(:'shift_b')::jsonb ->> 'liters')::numeric as liters_ab,
       (shift_summary(:'shift_a')::jsonb ->> 'expected_cash')::numeric + (shift_summary(:'shift_b')::jsonb ->> 'expected_cash')::numeric as cash_ab \gset
select pg_temp.ok((:'s'::jsonb ->> 'meter_sales')::numeric = :'sales_ab'::numeric
                  and (:'s'::jsonb ->> 'liters')::numeric = :'liters_ab'::numeric
                  and (:'s'::jsonb ->> 'expected_cash')::numeric = :'cash_ab'::numeric,
                  'sales, liters and expected cash equal the sum of shift_summary');
select pg_temp.ok((:'s'::jsonb ->> 'shifts_total')::int = 2 and (:'s'::jsonb ->> 'shifts_closed')::int = 1, 'two shifts, one closed');
select pg_temp.ok((:'s'::jsonb ->> 'recorded_open_fills')::numeric = 2750 and (:'s'::jsonb ->> 'recorded_open_fills_count')::int = 1,
                  'fills recorded on pumps still open are counted separately');
select pg_temp.ok((:'s'::jsonb ->> 'profit_complete')::boolean = false, 'profit is an estimate while a shift is not approved');
select pg_temp.ok((:'s'::jsonb ->> 'estimated_profit') is not null, 'the owner sees the estimated profit');
select pg_temp.ok((:'s'::jsonb ->> 'receivables')::numeric = 2500, 'receivables = balance of account 1100');
select pg_temp.ok((:'s'::jsonb ->> 'overdue_companies')::int = 1,
                  'a company billed at its billing day and not fully paid counts as overdue');
select pg_temp.ok((select count(*) = 1 and bool_and((d ->> 'product_id')::uuid = :'p95'
                          and (d ->> 'liters')::numeric = 1250 and (d ->> 'amount')::numeric = 156250)
                     from jsonb_array_elements(:'s'::jsonb -> 'daily') d),
                  'daily chart: one row per local day and fuel, closed pumps only');

-- a range with no shift is all zeros, not nulls
select dashboard_summary(:'station', now() - interval '30 days', now() - interval '20 days') as empty \gset
select pg_temp.ok((:'empty'::jsonb ->> 'meter_sales')::numeric = 0 and (:'empty'::jsonb ->> 'shifts_total')::int = 0
                  and jsonb_array_length(:'empty'::jsonb -> 'daily') = 0, 'an empty range returns zeros');

-- ---------- permissions ----------
select pg_temp.act_as('11111111-0000-4000-8000-000000000003');          -- shift manager
select dashboard_summary(:'station', :'t_from', :'t_to') as m \gset
select pg_temp.ok((:'m'::jsonb ->> 'meter_sales')::numeric = :'sales_ab'::numeric
                  and :'m'::jsonb -> 'estimated_profit' = 'null'::jsonb and :'m'::jsonb -> 'profit_complete' = 'null'::jsonb
                  and :'m'::jsonb -> 'receivables' = 'null'::jsonb and :'m'::jsonb -> 'overdue_companies' = 'null'::jsonb,
                  'a shift manager sees operations but no finance figures');
select pg_temp.act_as('11111111-0000-4000-8000-000000000002');          -- accountant
select pg_temp.ok((dashboard_summary(:'station', :'t_from', :'t_to') ->> 'receivables')::numeric = 2500, 'the accountant sees finance figures');
set local role authenticated;
select pg_temp.act_as('11111111-0000-4000-8000-000000000004');          -- attendant
select pg_temp.throws(format('select dashboard_summary(%L, %L, %L)', :'station', :'t_from', :'t_to'), '42501',
                      'an attendant cannot read the dashboard');
reset role;
select pg_temp.act_as(null);
set local role anon;
select pg_temp.throws(format('select dashboard_summary(%L, %L, %L)', :'station', :'t_from', :'t_to'), '42501',
                      'guest: cannot call the dashboard');
reset role;

\o
select 'ALL DASHBOARD TESTS PASSED' as result;
rollback;
