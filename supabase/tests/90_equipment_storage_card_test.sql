-- =====================================================================
-- FuelOS — equipment setup, storage policies, customer card (migration 20261001000100)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/90_equipment_storage_card_test.sql
-- Runs after migrations + seed.sql, in one transaction that is rolled back. Storage needs the local stub
-- (or Supabase's real storage schema).
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
       '11111111-0000-4000-8000-000000000003' as mgr,   '11111111-0000-4000-8000-000000000004' as khaled,
       '11111111-0000-4000-8000-000000000006' as rana,  '11111111-0000-4000-8000-000000000007' as admin,
       '11111111-0000-4000-8000-000000000095' as newowner \gset

-- a freshly onboarded station: default products only, no equipment
insert into auth.users (id, email, created_at, updated_at) values (:'newowner', 'fresh.owner@example.com', now(), now());
select station_id as fresh from admin_create_station(:'admin', :'newowner', 'مالك', 'محطة جديدة') \gset
select pg_temp.ok((select count(*) = 0 from tanks where station_id = :'fresh'), 'a new station starts without tanks');

-- =====================================================================
-- 1. Equipment: admin during onboarding, owner later; all or nothing
-- =====================================================================
set local role authenticated;
select pg_temp.act_as(:'admin');
select setup_station_equipment(:'fresh', '{
  "products": [ { "code": "lpg", "name": "غاز" } ],
  "tanks": [ { "key": "T1", "product_code": "gasoline_95", "name": "خزان 95", "capacity_l": 20000 },
             { "key": "T2", "product_code": "diesel",      "name": "خزان ديزل", "capacity_l": 30000, "min_level_pct": 15 } ],
  "pumps": [ { "number": 1, "nozzles": [ { "label": "1", "tank_key": "T1", "last_reading": 1000.5 },
                                          { "label": "2", "tank_key": "T2" } ] },
             { "number": 2, "name": "مضخة الشاحنات", "nozzles": [ { "tank_key": "T2", "last_reading": 50 } ] } ] }'::jsonb) as res \gset
select pg_temp.ok((:'res')::jsonb = '{"products": 1, "tanks": 2, "pumps": 2, "nozzles": 3}'::jsonb, 'the admin equips a new station in one step');
select pg_temp.ok((select (r ->> 'tanks')::int = 2 and (r ->> 'nozzles')::int = 3 and (r ->> 'products')::int = 4
                          and (r ->> 'owner_signed_in')::boolean = false and r ->> 'subscription' is null
                     from station_readiness(:'fresh') r), 'the admin reads the readiness counts');
reset role;
select pg_temp.ok((select last_reading = 1000.5 from nozzles n join pumps p on p.id = n.pump_id
                    where p.station_id = :'fresh' and p.number = 1 and n.label = '1'), 'the meter''s current reading is kept');
select pg_temp.ok((select count(*) = 1 from audit_log where action = 'setup_equipment' and station_id = :'fresh'), 'equipment setup is audited');
set local role authenticated;
select pg_temp.act_as(:'admin');

-- all or nothing: pump 3 is fine, pump 1 already exists → nothing from this call stays
select pg_temp.throws(format('select setup_station_equipment(%L, %L)', :'fresh',
  '{"tanks":[{"key":"T9","product_code":"gasoline_90","name":"خزان 90","capacity_l":10000}],
    "pumps":[{"number":3,"nozzles":[{"tank_key":"T9"}]},{"number":1,"nozzles":[{"tank_key":"T9"}]}]}'),
  'FUELOS_BAD_REQUEST', 'an existing pump number refuses the whole call');
select pg_temp.ok((select (r ->> 'tanks')::int = 2 and (r ->> 'pumps')::int = 2 from station_readiness(:'fresh') r),
                  'nothing of a refused call is kept');
select pg_temp.throws(format('select setup_station_equipment(%L, %L)', :'fresh', '{"tanks":[{"key":"X","product_code":"kerosene","name":"x","capacity_l":5}]}'),
                      'FUELOS_BAD_REQUEST', 'a tank of an unknown product is refused');
select pg_temp.throws(format('select setup_station_equipment(%L, %L)', :'fresh', '{"pumps":[{"number":"one","nozzles":[{"tank_key":"T1"}]}]}'),
                      'FUELOS_BAD_REQUEST', 'garbage values are a bad request, not a crash');
select pg_temp.throws(format('select setup_station_equipment(%L, %L)', :'fresh', '{"pumps":[{"number":5,"nozzles":[{"tank_key":"NOPE"}]}]}'),
                      'FUELOS_BAD_REQUEST', 'a nozzle must name a tank');

-- the owner adds a pump later, on an existing tank of his own station
select pg_temp.act_as(:'newowner');
select setup_station_equipment(:'fresh', format('{"pumps":[{"number":3,"nozzles":[{"tank_id":"%s"}]}]}',
       (select id from tanks where station_id = :'fresh' and name = 'خزان 95'))::jsonb);
select pg_temp.ok((select count(*) = 3 from pumps where station_id = :'fresh'), 'the owner adds a pump later');
select pg_temp.ok((select (r ->> 'owner_signed_in') is not null from station_readiness(:'fresh') r), 'the owner reads his readiness too');
select pg_temp.throws(format('select setup_station_equipment(%L, %L)', :'fresh',
       format('{"pumps":[{"number":4,"nozzles":[{"tank_id":"%s"}]}]}', (select id from tanks where station_id = :'station' limit 1))),
       'FUELOS_BAD_REQUEST', 'a nozzle cannot draw from another station''s tank');
select pg_temp.act_as(:'acct');
select pg_temp.throws(format('select setup_station_equipment(%L, %L)', :'station', '{"pumps":[]}'), '42501', 'an accountant cannot change equipment');
select pg_temp.throws(format('select station_readiness(%L)', :'station'), '42501', 'an accountant does not read readiness');
select pg_temp.act_as(:'owner');
select pg_temp.throws(format('select setup_station_equipment(%L, %L)', :'fresh', '{"pumps":[]}'), '42501', 'another station''s owner cannot');
reset role;

-- =====================================================================
-- 2. Storage policies
-- =====================================================================
select pg_temp.ok((select count(*) = 2 and bool_and(not public) from storage.buckets where id in ('meter-photos', 'invoice-pdfs')),
                  'two private buckets');
set local role authenticated;
select pg_temp.act_as(:'khaled');
insert into storage.objects (bucket_id, name, owner) values ('meter-photos', :'station' || '/leg-1/nozzle-1-opening.jpg', :'khaled');
select pg_temp.ok(true, 'an attendant uploads a meter photo for his station');
select pg_temp.throws(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'meter-photos', :'fresh' || '/x/y.jpg'),
                      '42501', 'not into another station''s folder');
select pg_temp.throws(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'meter-photos', 'not-a-uuid/x.jpg'),
                      '42501', 'a path without a station is refused (no crash)');
select pg_temp.throws(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'invoice-pdfs', :'station' || '/x.pdf'),
                      '42501', 'apps cannot write invoice PDFs');
select pg_temp.act_as(:'acct');
select pg_temp.ok((select count(*) = 1 from storage.objects where bucket_id = 'meter-photos'), 'station staff see the photo');
select pg_temp.act_as(:'newowner');
select pg_temp.ok((select count(*) = 0 from storage.objects where bucket_id = 'meter-photos'), 'another station does not');
select pg_temp.act_as(:'rana');
select pg_temp.ok((select count(*) = 0 from storage.objects where bucket_id = 'meter-photos'), 'customers do not');
reset role;

-- an invoice PDF written by the service role: the invoice's customer and finance roles read it
select id as inv from invoices where customer_id = :'rana' limit 1 \gset
insert into storage.objects (bucket_id, name) values ('invoice-pdfs', :'station' || '/' || :'inv' || '.pdf');
insert into storage.objects (bucket_id, name) values ('invoice-pdfs', :'station' || '/' || gen_random_uuid() || '.pdf');
set local role authenticated;
select pg_temp.act_as(:'rana');
select pg_temp.ok((select count(*) = 1 from storage.objects where bucket_id = 'invoice-pdfs'), 'the customer reads only her own invoice PDF');
select pg_temp.act_as(:'acct');
select pg_temp.ok((select count(*) = 2 from storage.objects where bucket_id = 'invoice-pdfs'), 'the accountant reads the station''s PDFs');
select pg_temp.act_as(:'khaled');
select pg_temp.ok((select count(*) = 0 from storage.objects where bucket_id = 'invoice-pdfs'), 'an attendant does not');
reset role;

-- =====================================================================
-- 3. Customer card and lookup at the pump
-- =====================================================================
select qr_token as token from customers where id = :'rana' \gset
select pg_temp.ok(:'token' ~ '^[0-9A-F]{12}$', 'every customer has a 12-character card token');
set local role authenticated;
select pg_temp.act_as(:'khaled');
select pg_temp.ok((select lookup_customer_for_sale(:'station', lower(:'token')) ->> 'customer_id') = :'rana', 'the attendant finds her by card (any case)');
select pg_temp.ok((select lookup_customer_for_sale(:'station', '0900 000 006') ->> 'matched_by') = 'phone', '…or by a local phone number');
select pg_temp.ok((select lookup_customer_for_sale(:'station', :'token') ->> 'display_name') = 'رنا', 'only her first name is returned');
select pg_temp.ok((select lookup_customer_for_sale(:'station', :'token') ? 'phone') = false, 'never her phone');
select pg_temp.ok(lookup_customer_for_sale(:'station', 'ABCDEF123456') is null, 'no match is NULL, not an error');
select pg_temp.ok(lookup_customer_for_sale(:'station', '12') is null, 'too short is NULL');
select pg_temp.act_as(:'acct');
select pg_temp.throws(format('select lookup_customer_for_sale(%L, %L)', :'station', :'token'), '42501', 'an accountant does not look up customers at the pump');
select pg_temp.act_as(:'newowner');
select pg_temp.throws(format('select lookup_customer_for_sale(%L, %L)', :'station', :'token'), '42501', 'nor someone from another station');
select pg_temp.act_as(:'rana');
select pg_temp.ok((select qr_token = :'token' from customers where id = :'rana'), 'the customer reads her own token for the QR');
reset role;

\o
select 'PASS 90_equipment_storage_card_test';
rollback;
