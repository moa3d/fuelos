-- =====================================================================
-- FuelOS — demo data: «محطة النور» (Syrian pound, 4 pumps, 3 tanks)
-- Runs after the migrations (`supabase db reset` runs it automatically).
-- Everything goes through the same RPCs the apps use, so the demo ledger is produced by real postings.
-- Demo logins (LOCAL/DEV ONLY): <role>@demo.fuelos.app / FuelOS-demo-2026
-- =====================================================================
begin;

-- impersonate a user for the RPC role checks (same JWT claim Supabase sets for API calls)
create or replace function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- ---------- demo users ----------
insert into auth.users (instance_id, id, aud, role, email, phone, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email, u.phone,
       extensions.crypt('FuelOS-demo-2026', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u.full_name),
       '', '', '', ''
from (values
  ('11111111-0000-4000-8000-000000000001', 'owner@demo.fuelos.app',      null,           'أحمد سالم'),
  ('11111111-0000-4000-8000-000000000002', 'accountant@demo.fuelos.app', null,           'ليلى حداد'),
  ('11111111-0000-4000-8000-000000000003', 'manager@demo.fuelos.app',    null,           'سامر يوسف'),
  ('11111111-0000-4000-8000-000000000004', 'attendant1@demo.fuelos.app', null,           'خالد العمر'),
  ('11111111-0000-4000-8000-000000000005', 'attendant2@demo.fuelos.app', null,           'محمد خليل'),
  ('11111111-0000-4000-8000-000000000006', 'customer@demo.fuelos.app',   '+963900000006', 'رنا عيسى'),
  ('11111111-0000-4000-8000-000000000007', 'admin@demo.fuelos.app',      null,           'فريق المنصة')
) as u(id, email, phone, full_name);

-- Supabase needs an identity row for email/password sign-in; skipped on plain Postgres.
do $$ begin
  if to_regclass('auth.identities') is not null then
    execute $q$
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now()
      from auth.users u where u.email like '%@demo.fuelos.app'
    $q$;
  end if;
exception when others then
  raise notice 'demo identities skipped: %', sqlerrm;
end $$;

-- ---------- platform ----------
insert into plans (code, name, monthly_price, per_station, limits, features) values
  ('basic',   'أساسية', 150000, false, '{"stations":1,"users":5}',  '{}'),
  ('pro',     'احترافية', 300000, false, '{"stations":1,"users":15}', '{credit_accounts,advanced_reports,loyalty}'),
  ('network', 'شبكة',    250000, true,  '{"stations":null,"users":null}', '{credit_accounts,advanced_reports,loyalty,multi_station}');
insert into platform_staff (user_id, role) values ('11111111-0000-4000-8000-000000000007', 'platform_admin');
insert into customers (id, full_name, phone) values ('11111111-0000-4000-8000-000000000006', 'رنا عيسى', '+963900000006');

do $$
declare
  u_owner   constant uuid := '11111111-0000-4000-8000-000000000001';
  u_acct    constant uuid := '11111111-0000-4000-8000-000000000002';
  u_mgr     constant uuid := '11111111-0000-4000-8000-000000000003';
  u_khaled  constant uuid := '11111111-0000-4000-8000-000000000004';
  u_mohamad constant uuid := '11111111-0000-4000-8000-000000000005';
  u_rana    constant uuid := '11111111-0000-4000-8000-000000000006';
  v_station uuid; v_org uuid;
  p90 uuid; p95 uuid; pdsl uuid;
  t90 uuid; t95 uuid; tdsl uuid;
  pump1 uuid; pump2 uuid; pump3 uuid; pump4 uuid;
  n1a uuid; n1b uuid; n2a uuid; n2b uuid; n3 uuid; n4 uuid;
  v_sup uuid; v_company uuid; v_driver uuid; v_truck uuid; v_rana_car uuid;
  v_shift_a uuid := '22222222-0000-4000-8000-00000000000a';
  v_shift_b uuid := '22222222-0000-4000-8000-00000000000b';
  v_req uuid; v_exp uuid; v_opened timestamptz := date_trunc('day', now()) - interval '1 day' + interval '6 hours';
begin
  -- station (the owner onboards it through the same RPC as the web app)
  perform pg_temp.act_as(u_owner);
  v_station := create_station(null, 'محطة النور', 'SYP', 'دمشق', 'أحمد سالم');
  update stations set status = 'active', address = 'طريق المطار، الفرع الرئيسي', timezone = 'Asia/Damascus'
   where id = v_station returning organization_id into v_org;
  update organizations set name = 'شركة النور للمحروقات' where id = v_org;
  insert into subscriptions (organization_id, plan_id, status, trial_ends_at)
  select v_org, id, 'trial', now() + interval '14 days' from plans where code = 'pro';

  insert into station_members (station_id, user_id, role, status, display_name) values
    (v_station, u_acct,    'accountant',    'active', 'ليلى حداد'),
    (v_station, u_mgr,     'shift_manager', 'active', 'سامر يوسف'),
    (v_station, u_khaled,  'attendant',     'active', 'خالد العمر'),
    (v_station, u_mohamad, 'attendant',     'active', 'محمد خليل');
  insert into devices (id, station_id, label, registered_by) values
    ('demo-phone-390', v_station, 'هاتف العامل — المضخة 1', u_mgr),
    ('demo-tablet-01', v_station, 'تابلت المناوبة', u_mgr);

  select id into p90  from products where station_id = v_station and code = 'gasoline_90';
  select id into p95  from products where station_id = v_station and code = 'gasoline_95';
  select id into pdsl from products where station_id = v_station and code = 'diesel';

  -- tanks, pumps, nozzles
  insert into tanks (station_id, product_id, name, capacity_l) values (v_station, p90,  'خزان 1', 30000) returning id into t90;
  insert into tanks (station_id, product_id, name, capacity_l) values (v_station, pdsl, 'خزان 2', 30000) returning id into tdsl;
  insert into tanks (station_id, product_id, name, capacity_l) values (v_station, p95,  'خزان 3', 20000) returning id into t95;
  insert into pumps (station_id, number, name) values (v_station, 1, 'المضخة 1') returning id into pump1;
  insert into pumps (station_id, number, name) values (v_station, 2, 'المضخة 2') returning id into pump2;
  insert into pumps (station_id, number, name) values (v_station, 3, 'المضخة 3') returning id into pump3;
  insert into pumps (station_id, number, name) values (v_station, 4, 'المضخة 4') returning id into pump4;
  insert into nozzles (station_id, pump_id, tank_id, label, last_reading) values (v_station, pump1, t90,  'بنزين 90', 98410.0)  returning id into n1a;
  insert into nozzles (station_id, pump_id, tank_id, label, last_reading) values (v_station, pump1, tdsl, 'ديزل',     143002.5) returning id into n1b;
  insert into nozzles (station_id, pump_id, tank_id, label, last_reading) values (v_station, pump2, t90,  'بنزين 90', 77120.0)  returning id into n2a;
  insert into nozzles (station_id, pump_id, tank_id, label, last_reading) values (v_station, pump2, t95,  'بنزين 95', 51230.0)  returning id into n2b;
  insert into nozzles (station_id, pump_id, tank_id, label, last_reading) values (v_station, pump3, t95,  'بنزين 95', 184220.5) returning id into n3;
  insert into nozzles (station_id, pump_id, tank_id, label, last_reading) values (v_station, pump4, tdsl, 'ديزل',     120875.0) returning id into n4;

  -- prices (published 10 days ago so yesterday's shift uses them)
  perform publish_price(v_station, p90,  110, now() - interval '10 days');
  perform publish_price(v_station, p95,  125, now() - interval '10 days');
  perform publish_price(v_station, pdsl,  95, now() - interval '10 days');
  insert into product_availability (station_id, product_id, status, source, updated_by) values
    (v_station, p90,  'available', 'computed', u_owner),
    (v_station, p95,  'limited',   'computed', u_owner),
    (v_station, pdsl, 'available', 'manual',   u_owner);

  -- deliveries (the last 95 delivery has no cost yet => profit shows as estimated)
  insert into suppliers (station_id, name, phone) values (v_station, 'مورد المحروقات الرئيسي', '+963110000000') returning id into v_sup;
  perform pg_temp.act_as(u_mgr);
  perform record_fuel_delivery(v_station, t90,  24000, 98,  120000, v_sup, 'INV-2026-0911');
  perform record_fuel_delivery(v_station, tdsl, 22000, 84,  100000, v_sup, 'INV-2026-0912');
  perform record_fuel_delivery(v_station, t95,   6000, 112,  60000, v_sup, 'INV-2026-0913');
  perform record_fuel_delivery(v_station, t95,   4000, null,     0, v_sup, 'INV-2026-0920');

  -- company credit account + driver + truck; a customer with a car
  perform pg_temp.act_as(u_acct);
  insert into company_accounts (station_id, name, credit_limit, billing_day, qr_token)
  values (v_station, 'شركة الأمل للنقل', 250000, 1, 'AMAL-DEMO-7F3K') returning id into v_company;
  insert into company_drivers (company_account_id, full_name, phone) values (v_company, 'سعيد ناصر', '+963933000111') returning id into v_driver;
  insert into vehicles (company_account_id, plate, label) values (v_company, '512384', 'شاحنة إيسوزو 2018') returning id into v_truck;
  insert into vehicles (customer_id, plate, label) values (u_rana, '774120', 'كيا ريو 2019') returning id into v_rana_car;

  -- ---------- shift A (yesterday, pump 3, محمد خليل): sales -> submit -> owner approves ----------
  perform pg_temp.act_as(u_mohamad);
  perform open_shift(v_shift_a, pump3, 5000, jsonb_build_array(jsonb_build_object('nozzle_id', n3, 'opening_reading', 184220.5)),
                     'demo-tablet-01', v_opened);
  perform record_sale('33333333-0000-4000-8000-000000000001', v_shift_a, n3, 20, 125, 'card',
                      p_device := 'demo-tablet-01', p_client_created_at := v_opened + interval '1 hour');
  perform record_sale('33333333-0000-4000-8000-000000000002', v_shift_a, n3, 60, 125, 'credit',
                      p_company := v_company, p_driver := v_driver, p_vehicle := v_truck, p_odometer := 214300,
                      p_device := 'demo-tablet-01', p_client_created_at := v_opened + interval '3 hours');
  perform record_sale('33333333-0000-4000-8000-000000000003', v_shift_a, n3, 30, 125, 'cash',
                      p_customer := u_rana, p_vehicle := v_rana_car,
                      p_device := 'demo-tablet-01', p_client_created_at := v_opened + interval '5 hours');
  -- 1,250 L x 125 = 156,250; expected cash = 5,000 + 156,250 - 2,500 card - 7,500 credit = 151,250; counted 150,750 (-500, within tolerance)
  perform submit_shift(v_shift_a, jsonb_build_array(jsonb_build_object('nozzle_id', n3, 'closing_reading', 185470.5)), 150750);
  perform pg_temp.act_as(u_owner);
  select id into v_req from approval_requests where ref_id = v_shift_a and status = 'pending';
  perform decide_approval(v_req, true, 'shortage_to_expense', 'اعتماد مناوبة الصباح');

  -- ---------- shift B (today, pump 1, خالد العمر): still open ----------
  perform pg_temp.act_as(u_khaled);
  perform open_shift(v_shift_b, pump1, 5000,
                     jsonb_build_array(jsonb_build_object('nozzle_id', n1a, 'opening_reading', 98410.0),
                                       jsonb_build_object('nozzle_id', n1b, 'opening_reading', 143002.5)),
                     'demo-phone-390', date_trunc('day', now()) + interval '6 hours');
  perform record_sale('33333333-0000-4000-8000-000000000004', v_shift_b, n1a, 25, 110, 'card',
                      p_device := 'demo-phone-390', p_client_created_at := date_trunc('day', now()) + interval '7 hours');

  -- ---------- back office ----------
  perform pg_temp.act_as(u_acct);
  insert into expenses (station_id, category, amount, paid_from, description, created_by)
  values (v_station, 'utilities', 38000, 'cash', 'فاتورة الكهرباء — سبتمبر', u_acct) returning id into v_exp;
  perform post_expense(v_exp);
  perform record_company_payment(v_company, 5000, 'bank', 'دفعة على الحساب');

  perform pg_temp.act_as(u_mgr);
  perform record_tank_measurement(t95, (select tank_book_l(t95)) - 20);   -- -20 L: auto-adjusted (within 100 L)

  -- ---------- customer side ----------
  insert into offers (station_id, title, rule, starts_at, ends_at)
  values (v_station, 'نقاط مضاعفة يوم الجمعة', '{"type":"points_multiplier","x":2,"weekday":5}', now() - interval '1 day', now() + interval '30 days');
  insert into complaints (station_id, customer_id, kind, subject)
  values (v_station, u_rana, 'price_report', 'سعر بنزين 95 في التطبيق لا يطابق اللوحة');

  perform set_config('request.jwt.claims', '', true);
end $$;

commit;
