-- =====================================================================
-- FuelOS — customer & platform gaps (migration 20260929000100_platform_customer_gaps.sql)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/80_platform_customer_gaps_test.sql
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
select id as sub from subscriptions where organization_id = :'org' \gset
select id as pro from plans where code = 'pro' \gset
select '11111111-0000-4000-8000-000000000001' as owner, '11111111-0000-4000-8000-000000000002' as acct,
       '11111111-0000-4000-8000-000000000006' as rana,  '11111111-0000-4000-8000-000000000007' as admin,
       '11111111-0000-4000-8000-000000000097' as newowner, '11111111-0000-4000-8000-000000000096' as support \gset

-- =====================================================================
-- 1. Every sale carries its fuel's name; the customer reads it on her own sales
-- =====================================================================
select pg_temp.ok((select count(*) = 0 from sales where product_name is null), 'seed sales all have a product name');
select pg_temp.ok((select product_name = 'بنزين 95' from sales where id = '33333333-0000-4000-8000-000000000001'),
                  'the name follows nozzle → tank → product');
set local role authenticated;
select pg_temp.act_as(:'rana');
select pg_temp.ok((select count(*) > 0 and bool_and(product_name is not null) from sales where customer_id = :'rana'),
                  'the customer sees the fuel name on her own sales');
reset role;

-- =====================================================================
-- 2. Vehicle budget and service reminder — the customer edits her own car only
-- =====================================================================
set local role authenticated;
select pg_temp.act_as(:'rana');
update vehicles set monthly_budget = 500000, last_service_odometer_km = 84000, service_interval_km = 5000
 where customer_id = :'rana';
select pg_temp.ok((select monthly_budget = 500000 and service_interval_km = 5000 from vehicles where customer_id = :'rana'),
                  'the customer sets budget and service interval');
select pg_temp.throws(format('update vehicles set service_interval_km = 0 where customer_id = %L', :'rana'), '23514',
                      'a zero service interval is refused');
reset role;

-- =====================================================================
-- 3. Rewards: offer codes, point value and tiers — owner writes, everyone reads
-- =====================================================================
set local role authenticated;
select pg_temp.act_as(:'owner');
update offers set code = 'NOOR-10' where station_id = :'station';
insert into loyalty_programs (station_id, point_value) values (:'station', 5);
insert into reward_tiers (station_id, points_threshold, title) values (:'station', 1500, 'غسيل سيارة مجاني');
select pg_temp.ok(true, 'the owner sets an offer code, the point value and a reward tier');
select pg_temp.throws(format('update offers set code = %L where station_id = %L', 'noor 10', :'station'), '23514',
                      'a lowercase / spaced code is refused');
select pg_temp.act_as(:'acct');
select pg_temp.throws(format('insert into reward_tiers (station_id, points_threshold, title) values (%L, 100, %L)', :'station', 'x'),
                      '42501', 'an accountant cannot add reward tiers');
select pg_temp.act_as(:'rana');
select pg_temp.ok((select point_value = 5 from loyalty_programs where station_id = :'station'), 'a customer reads the point value');
select pg_temp.ok((select count(*) = 1 from reward_tiers where station_id = :'station'), 'a customer reads the reward tiers');
reset role;
set local role anon;
select pg_temp.ok((select count(*) = 1 from reward_tiers where station_id = :'station'), 'a guest reads the reward tiers');
select pg_temp.throws(format('insert into loyalty_programs (station_id, point_value) values (%L, 1)', :'station'), '42501',
                      'a guest cannot write the point value');
reset role;

-- =====================================================================
-- 4. Station location on the public board
-- =====================================================================
set local role authenticated;
select pg_temp.act_as(:'owner');
update stations set lat = 33.5138, lng = 36.2765 where id = :'station';
select pg_temp.throws(format('update stations set lat = 33.5 , lng = null where id = %L', :'station'), '23514',
                      'lat without lng is refused');
reset role;
set local role anon;
select pg_temp.ok((select bool_and(lat = 33.5138 and lng = 36.2765) from public_station_prices where station_id = :'station'),
                  'guests see the station location on the price board');
reset role;

-- =====================================================================
-- 5. Platform: device health, MRR snapshots, subscription payments
-- =====================================================================
insert into auth.users (id, email, created_at, updated_at) values (:'support', 'support@demo.fuelos.app', now(), now());
insert into platform_staff (user_id, role) values (:'support', 'support');

set local role authenticated;
select pg_temp.act_as(:'admin');
select pg_temp.ok((select count(*) > 0 from devices where station_id = :'station'), 'platform staff see the station''s devices');
select pg_temp.ok(is_platform_admin(), 'is_platform_admin() for the admin');
select pg_temp.throws('select snapshot_mrr()', '42501', 'the apps cannot take MRR snapshots');

-- payment: trial → active until next month
select record_subscription_payment(:'sub', 300000, 'transfer', 'حوالة أيلول') as pay \gset
select pg_temp.ok((select status = 'active' and renews_at = (current_date + interval '1 month')::date from subscriptions where id = :'sub'),
                  'a payment activates the subscription for one month');
select pg_temp.ok((select count(*) = 1 from subscription_payments where id = :'pay' and recorded_by = :'admin'),
                  'the payment is on the ledger with who recorded it');
select pg_temp.ok((select count(*) = 1 from audit_log where action = 'record_subscription_payment' and entity_id = :'sub'),
                  'the payment is audited');
select record_subscription_payment(:'sub', 300000, 'cash') \gset
select pg_temp.ok((select renews_at = ((current_date + interval '1 month')::date + interval '1 month')::date from subscriptions where id = :'sub'),
                  'a second payment extends from the paid-until date');
select pg_temp.throws(format('select record_subscription_payment(%L, 100, %L)', :'sub', 'bitcoin'), 'FUELOS_BAD_REQUEST',
                      'an unknown payment method is refused');
select pg_temp.throws(format('select record_subscription_payment(%L, 0, %L)', :'sub', 'cash'), 'FUELOS_BAD_REQUEST',
                      'a zero payment is refused');
select pg_temp.throws(format('update subscription_payments set amount = 1 where id = %L', :'pay'), '42501',
                      'payments cannot be edited from the apps');
select pg_temp.act_as(:'support');
select pg_temp.throws(format('select record_subscription_payment(%L, 100, %L)', :'sub', 'cash'), '42501',
                      'support staff cannot record payments');
select pg_temp.ok((select count(*) = 2 from subscription_payments where subscription_id = :'sub'), 'support staff read payments');
select pg_temp.act_as(:'owner');
select pg_temp.ok((select count(*) = 2 from subscription_payments where subscription_id = :'sub'), 'the owner reads his own payments');
select pg_temp.throws(format('select record_subscription_payment(%L, 100, %L)', :'sub', 'cash'), '42501',
                      'the owner cannot record a payment');
select pg_temp.act_as(:'rana');
select pg_temp.ok((select count(*) = 0 from subscription_payments), 'a customer sees no payments');
reset role;

-- snapshots (service role / pg_cron): the now-active subscription counts
select pg_temp.ok(snapshot_mrr() >= 1, 'snapshot_mrr() records active subscriptions');
select pg_temp.ok((select amount = 300000 and stations = 1 from mrr_snapshots
                    where organization_id = :'org' and month = date_trunc('month', current_date)::date),
                  'the snapshot is the plan price for a non-per-station plan');
select snapshot_mrr();
select pg_temp.ok((select count(*) = 1 from mrr_snapshots where organization_id = :'org'), 're-running a month replaces it');
select pg_temp.throws(format('update subscription_payments set amount = 1 where id = %L', :'pay'), 'FUELOS_APPEND_ONLY',
                      'the payment ledger is append-only even for the service role');
set local role authenticated;
select pg_temp.act_as(:'admin');
select pg_temp.ok((select count(*) >= 1 from mrr_snapshots), 'platform staff read snapshots');
select pg_temp.act_as(:'owner');
select pg_temp.ok((select count(*) = 0 from mrr_snapshots), 'an owner does not read platform revenue');
reset role;

-- =====================================================================
-- 6. Onboarding: the platform admin creates a client's organization + station
-- =====================================================================
insert into auth.users (id, email, created_at, updated_at) values (:'newowner', 'new.owner@example.com', now(), now());
select organization_id as neworg, station_id as newstation
  from admin_create_station(:'admin', :'newowner', 'مالك جديد', 'محطة الأمل', 'شركة الأمل', 'SYP', 'حمص', :'pro', 14, 34.7324, 36.7137) \gset
select pg_temp.ok((select role = 'owner' and status = 'active' and display_name = 'مالك جديد' from station_members
                    where station_id = :'newstation' and user_id = :'newowner'), 'the new owner is the station''s active owner');
select pg_temp.ok((select count(*) = 3 from products where station_id = :'newstation'), 'the station gets the default catalog');
select pg_temp.ok((select status = 'trial' and trial_ends_at > now() + interval '13 days' from subscriptions where organization_id = :'neworg'),
                  'a trial subscription on the chosen plan');
select pg_temp.ok((select name = 'شركة الأمل' from organizations where id = :'neworg'), 'the organization has the client''s name');
select pg_temp.ok((select count(*) = 1 from audit_log where action = 'onboard_station' and entity_id = :'newstation'), 'onboarding is audited');
select pg_temp.throws(format('select * from admin_create_station(%L, %L, %L, %L)', :'support', :'newowner', 'x', 'y'), '42501',
                      'support staff cannot onboard stations');
select pg_temp.throws(format('select * from admin_create_station(%L, %L, %L, %L)', :'owner', :'newowner', 'x', 'y'), '42501',
                      'a station owner cannot onboard stations');
select pg_temp.throws(format('select * from admin_create_station(%L, %L, %L, %L)', :'admin', gen_random_uuid(), 'x', 'y'), 'FUELOS_NOT_FOUND',
                      'the owner account must exist');
select pg_temp.throws(format('select * from admin_create_station(%L, %L, %L, %L)', :'admin', :'newowner', 'x', ' '), 'FUELOS_REQUIRED',
                      'a station name is required');
set local role authenticated;
select pg_temp.act_as(:'admin');
select pg_temp.throws(format('select * from admin_create_station(%L, %L, %L, %L)', :'admin', :'newowner', 'x', 'y'), '42501',
                      'the apps cannot call admin_create_station directly');
select pg_temp.act_as(:'newowner');
select pg_temp.ok((select count(*) = 1 from stations where id = :'newstation'), 'the new owner sees his station');
reset role;

\o
select 'PASS 80_platform_customer_gaps_test';
rollback;
