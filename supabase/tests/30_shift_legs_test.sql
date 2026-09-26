-- =====================================================================
-- FuelOS — shifts across several pumps ("pump legs"), migration 20260926000200_shift_legs.sql
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/30_shift_legs_test.sql
-- Runs after migrations + seed.sql, in one transaction that is rolled back.
-- Seed state used here: خالد holds pump 1 (shift B, leg 7777…0b); محمد has no open shift; pumps 2–4 are free.
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
create function pg_temp.balanced(p_station uuid) returns boolean language sql as $$
  select coalesce(sum(debit), 0) = coalesce(sum(credit), 0) from journal_lines where station_id = p_station;
$$;
-- opening readings of a pump at its nozzles' last_reading (+ p_plus liters on every nozzle)
create function pg_temp.opening(p_pump uuid, p_plus numeric default 0) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('nozzle_id', id, 'opening_reading', last_reading + p_plus)) from nozzles where pump_id = p_pump;
$$;
-- closing readings of a leg: opening + p_plus liters on every nozzle
create function pg_temp.closing(p_leg uuid, p_plus numeric default 0) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('nozzle_id', nozzle_id, 'closing_reading', opening_reading + p_plus)) from leg_readings where leg_id = p_leg;
$$;

select id as station from stations where name = 'محطة النور' \gset
select '11111111-0000-4000-8000-000000000001' as owner, '11111111-0000-4000-8000-000000000003' as mgr,
       '11111111-0000-4000-8000-000000000004' as khaled, '11111111-0000-4000-8000-000000000005' as mohamad,
       '22222222-0000-4000-8000-00000000000b' as shift_b, '77777777-0000-4000-8000-00000000000b' as leg_b,
       '88888888-0000-4000-8000-000000000001' as shift_m,  '88888888-0000-4000-8000-0000000000a1' as leg_m1,
       '88888888-0000-4000-8000-000000000002' as shift_m2, '88888888-0000-4000-8000-0000000000a2' as leg_m2,
       '88888888-0000-4000-8000-000000000003' as shift_g,  '88888888-0000-4000-8000-0000000000a3' as leg_g,
       '88888888-0000-4000-8000-000000000004' as shift_o,  '88888888-0000-4000-8000-0000000000a4' as leg_o,
       '88888888-0000-4000-8000-0000000000b2' as leg_k2,   '88888888-0000-4000-8000-0000000000b3' as leg_k3 \gset
select id as pump1 from pumps where station_id = :'station' and number = 1 \gset
select id as pump2 from pumps where station_id = :'station' and number = 2 \gset
select id as pump3 from pumps where station_id = :'station' and number = 3 \gset
select id as pump4 from pumps where station_id = :'station' and number = 4 \gset
select id as n2a from nozzles where pump_id = :'pump2' and label = 'بنزين 90' \gset
select id as n3 from nozzles where pump_id = :'pump3' \gset
select id as n4, last_reading as n4_last from nozzles where pump_id = :'pump4' \gset

-- =====================================================================
-- A. Open a shift = shift + its first leg
-- =====================================================================
select pg_temp.act_as(:'mohamad');
select open_shift(:'shift_m', :'leg_m1', :'pump2', 1000, pg_temp.opening(:'pump2'));
select pg_temp.ok((select count(*) = 1 and bool_and(pump_id = :'pump2' and ended_at is null) from shift_legs where shift_id = :'shift_m'),
                  'open_shift creates the shift and one open leg on the chosen pump');
select pg_temp.ok((select count(*) = 2 and bool_and(gap_liters = 0) from leg_readings where leg_id = :'leg_m1'),
                  'opening readings are stored per nozzle of the leg');
select pg_temp.ok(open_shift(:'shift_m', :'leg_m1', :'pump2', 1000, pg_temp.opening(:'pump2')) = :'shift_m'
                  and (select count(*) = 1 from shift_legs where shift_id = :'shift_m'), 'replaying open_shift is a no-op');
select pg_temp.throws(format('select open_shift(gen_random_uuid(), gen_random_uuid(), %L, 0, %L::jsonb)', :'pump3', pg_temp.opening(:'pump3')),
                      'FUELOS_SHIFT_ALREADY_OPEN', 'an attendant cannot open a second shift');

select pg_temp.act_as(:'mgr');
select pg_temp.throws(format('select open_shift(gen_random_uuid(), gen_random_uuid(), %L, 0, %L::jsonb)', :'pump2', pg_temp.opening(:'pump2')),
                      'FUELOS_PUMP_BUSY', 'a pump held by a colleague is refused');
select pg_temp.throws(format('select open_shift(gen_random_uuid(), gen_random_uuid(), %L, 0, %L::jsonb)', :'pump4',
                             jsonb_build_array(jsonb_build_object('nozzle_id', :'n4'))),
                      'FUELOS_READING_MISSING', 'a reading without opening_reading counts as missing');
select pg_temp.throws(format('select open_shift(%L, %L, %L, 0, %L::jsonb)', :'shift_g', :'leg_g', :'pump4', pg_temp.opening(:'pump4', 50)),
                      'FUELOS_GAP_NOTE_REQUIRED', 'opening above the last reading needs a note');
select open_shift(:'shift_g', :'leg_g', :'pump4', 0, pg_temp.opening(:'pump4', 50), 'المضخة عملت أثناء انقطاع الشبكة');
select pg_temp.ok((select gap_note = 'المضخة عملت أثناء انقطاع الشبكة' from shift_legs where id = :'leg_g')
                  and (select gap_liters = 50 from leg_readings where leg_id = :'leg_g'),
                  'with a note the leg opens and keeps the note and the 50 unrecorded liters');

-- =====================================================================
-- B. Sales are bound to the current leg
-- =====================================================================
select pg_temp.act_as(:'mohamad');
select pg_temp.throws(format('select record_sale(gen_random_uuid(), %L, %L, %L, 5, 125, %L)', :'shift_m', :'leg_m1', :'n3', 'card'),
                      'FUELOS_NOT_FOUND', 'a nozzle that is not on the leg''s pump is refused');
select pg_temp.throws(format('select record_sale(gen_random_uuid(), %L, %L, %L, 5, 110, %L)', :'shift_m', :'leg_b', :'n2a', 'card'),
                      'FUELOS_NOT_FOUND', 'a leg of another shift is refused');
select record_sale('99999999-0000-4000-8000-000000000001', :'shift_m', :'leg_m1', :'n2a', 10, 110, 'card');
select pg_temp.ok((select leg_id = :'leg_m1' from sales where id = '99999999-0000-4000-8000-000000000001'), 'the sale keeps its leg');
select pg_temp.throws($$update sales set leg_id = '77777777-0000-4000-8000-00000000000b' where id = '99999999-0000-4000-8000-000000000001'$$,
                      'FUELOS_SALE_FROZEN', 'the leg of a sale is frozen');

-- =====================================================================
-- C. Submit closes the current leg
-- =====================================================================
select pg_temp.throws(format('select submit_shift(%L, %L::jsonb, 0)', :'shift_m', pg_temp.closing(:'leg_m1', -1)),
                      'FUELOS_READING_BELOW_LAST', 'a closing reading below the opening reading is refused');
-- n2a sells 100 L x 110 = 11,000 (10 L of it by card = 1,100) => expected cash = 1,000 + 11,000 - 1,100 = 10,900
select submit_shift(:'shift_m', jsonb_build_array(jsonb_build_object('nozzle_id', :'n2a', 'closing_reading', 77220.0),
                                                  jsonb_build_object('nozzle_id', (select id from nozzles where pump_id = :'pump2' and label = 'بنزين 95'),
                                                                     'closing_reading', 51230.0)),
                    10900) as sum_m \gset
select pg_temp.ok((:'sum_m'::jsonb ->> 'cash_diff')::numeric = 0, 'expected cash = opening + meter sales - card');
select pg_temp.ok(jsonb_array_length(:'sum_m'::jsonb -> 'legs') = 1 and (:'sum_m'::jsonb -> 'legs' -> 0 ->> 'pump_number')::int = 2,
                  'the summary lists the leg with its pump number');
select pg_temp.ok((select ended_at is not null from shift_legs where id = :'leg_m1'), 'submit ends the current leg');
select pg_temp.ok((select last_reading = 77220.0 from nozzles where id = :'n2a'), 'the leg''s closing reading becomes the nozzle''s last reading');
select pg_temp.ok((select payload -> 'legs' is not null from approval_requests where ref_id = :'shift_m' and status = 'pending'),
                  'the approval payload carries the legs');
select pg_temp.ok((record_sale('99999999-0000-4000-8000-000000000001', :'shift_m', :'leg_m1', :'n2a', 10, 110, 'card') ->> 'replayed')::boolean,
                  'replaying a sale after its leg ended is still a no-op (offline retry)');

-- =====================================================================
-- D. Reopen reopens the LAST leg
-- =====================================================================
select pg_temp.act_as(:'owner');
select decide_approval((select id from approval_requests where ref_id = :'shift_m' and status = 'pending'), false, null, 'أعد العد');
select pg_temp.act_as(:'mohamad');
select open_shift(:'shift_m2', :'leg_m2', :'pump3', 0, pg_temp.opening(:'pump3'));
select pg_temp.act_as(:'owner');
select pg_temp.throws(format('select reopen_shift(%L, %L)', :'shift_m', 'تصحيح'), 'FUELOS_SHIFT_ALREADY_OPEN',
                      'reopen is refused while the attendant has another open shift');
select open_shift(:'shift_o', :'leg_o', :'pump2', 0, pg_temp.opening(:'pump2'));
select pg_temp.throws(format('select reopen_shift(%L, %L)', :'shift_m', 'تصحيح'), 'FUELOS_PUMP_BUSY',
                      'reopen is refused while the last leg''s pump is taken');
select submit_shift(:'shift_o', pg_temp.closing(:'leg_o'), 0);
select pg_temp.act_as(:'mohamad');
select submit_shift(:'shift_m2', pg_temp.closing(:'leg_m2'), 0);
select pg_temp.act_as(:'owner');
select reopen_shift(:'shift_m', 'تصحيح');
select pg_temp.ok((select ended_at is null from shift_legs where id = :'leg_m1')
                  and (select status = 'reopened' from shifts where id = :'shift_m'), 'reopen puts the last leg back on its pump');

-- =====================================================================
-- E. Row Level Security and internal helpers
-- =====================================================================
set local role authenticated;
select pg_temp.act_as(:'khaled');
select pg_temp.ok((select count(*) = 1 and bool_and(id = :'leg_b') from shift_legs), 'attendant: sees only his own legs');
select pg_temp.ok((select bool_and(leg_id = :'leg_b') from leg_readings), 'attendant: sees only his own leg readings');
select pg_temp.throws(format('insert into shift_legs (id, station_id, shift_id, pump_id) values (gen_random_uuid(), %L, %L, %L)',
                             :'station', :'shift_b', :'pump3'), '42501', 'attendant: no direct writes to legs (RPC only)');
select pg_temp.throws(format('select start_leg(null::shifts, gen_random_uuid(), %L, %L::jsonb, null, null, now())', :'pump3', '[]'),
                      '42501', 'internal start_leg is not callable');
select pg_temp.throws(format('select end_leg(null::shift_legs, %L::jsonb, now())', '[]'), '42501', 'internal end_leg is not callable');
select pg_temp.act_as(:'mgr');
select pg_temp.ok((select count(*) >= 5 from shift_legs), 'shift manager: sees every leg of the station');
reset role;

-- =====================================================================
-- F. Moving to another pump (switch_pump)
-- =====================================================================
-- خالد: pump 1 (leg B, since 06:00) -> pump 3 at 08:00 -> back to pump 1; one cash drawer for the whole shift
select date_trunc('day', now()) + interval '8 hours' as t_move \gset
select id as n1a from nozzles where pump_id = :'pump1' and label = 'بنزين 90' \gset
select id as n1b from nozzles where pump_id = :'pump1' and label = 'ديزل' \gset
select last_reading as n3_last from nozzles where id = :'n3' \gset
select pg_temp.act_as(:'khaled');
select switch_pump(:'shift_b', :'leg_k2',
                   jsonb_build_array(jsonb_build_object('nozzle_id', :'n1a', 'closing_reading', 98510.0),
                                     jsonb_build_object('nozzle_id', :'n1b', 'closing_reading', 143002.5)),
                   :'pump3', pg_temp.opening(:'pump3'), null, 'demo-phone-390', :'t_move') ->> 'replayed' as sw1 \gset
select pg_temp.ok(:'sw1' = 'false' and (select ended_at = :'t_move'::timestamptz from shift_legs where id = :'leg_b')
                  and (select pump_id = :'pump3' and ended_at is null and started_at = :'t_move'::timestamptz from shift_legs where id = :'leg_k2'),
                  'switch ends the pump-1 leg and opens a pump-3 leg at the move time');
select pg_temp.ok((select last_reading = 98510.0 from nozzles where id = :'n1a'), 'the left pump''s closing reading becomes its last reading');
select pg_temp.ok((switch_pump(:'shift_b', :'leg_k2', '[]', :'pump3', '[]') ->> 'replayed')::boolean
                  and (select count(*) = 2 from shift_legs where shift_id = :'shift_b'), 'replaying switch_pump is a no-op');
select pg_temp.throws(format('select switch_pump(%L, gen_random_uuid(), %L::jsonb, %L, %L::jsonb)',
                             :'shift_b', pg_temp.closing(:'leg_k2'), :'pump4', pg_temp.opening(:'pump4')),
                      'FUELOS_PUMP_BUSY', 'moving to a pump held by a colleague is refused');
select pg_temp.ok((select ended_at is null from shift_legs where id = :'leg_k2'), 'a refused move leaves the current leg open');
select pg_temp.throws(format('select record_sale(gen_random_uuid(), %L, %L, %L, 5, 110, %L)', :'shift_b', :'leg_b', :'n1a', 'card'),
                      'FUELOS_NOT_FOUND', 'no sale on a leg that has ended');
select record_sale(gen_random_uuid(), :'shift_b', :'leg_k2', :'n3', 4, 125, 'card');          -- 500 by card
-- back to pump 1 with a device clock two days behind: the move is dated at the leg start, not rejected
select switch_pump(:'shift_b', :'leg_k3',
                   jsonb_build_array(jsonb_build_object('nozzle_id', :'n3', 'closing_reading', :'n3_last'::numeric + 40)),
                   :'pump1', pg_temp.opening(:'pump1'), null, 'demo-phone-390', now() - interval '2 days');
select pg_temp.ok((select ended_at = started_at from shift_legs where id = :'leg_k2'), 'a device clock behind the leg start does not break the move');
select pg_temp.ok((select last_reading = :'n3_last'::numeric + 40 from nozzles where id = :'n3'), 'pump 3 keeps the 40 L its leg sold');

-- close: pump 1 sells 10 more liters of 90
--   meter = (100 + 10) L x 110 + 40 L x 125 = 17,100; card = 2,750 (seed) + 500 = 3,250
--   expected cash = 5,000 + 17,100 - 3,250 = 18,850
select submit_shift(:'shift_b', jsonb_build_array(jsonb_build_object('nozzle_id', :'n1a', 'closing_reading', 98520.0),
                                                  jsonb_build_object('nozzle_id', :'n1b', 'closing_reading', 143002.5)),
                    18850) as sum_b \gset
select pg_temp.ok((:'sum_b'::jsonb ->> 'meter_sales')::numeric = 17100 and (:'sum_b'::jsonb ->> 'cash_diff')::numeric = 0,
                  'expected cash is computed once over all legs');
select pg_temp.ok(jsonb_array_length(:'sum_b'::jsonb -> 'legs') = 3, 'the review lists all three legs');
select pg_temp.ok((switch_pump(:'shift_b', :'leg_k3', '[]', :'pump1', '[]') ->> 'replayed')::boolean,
                  'replaying a move after the shift was submitted is still a no-op (offline retry)');

select pg_temp.act_as(:'owner');
select decide_approval((select id from approval_requests where ref_id = :'shift_b' and status = 'pending'), true, null, 'اعتماد');
select pg_temp.ok(pg_temp.balanced(:'station'), 'ledger stays balanced after a multi-pump shift');
select pg_temp.ok((select count(*) = 2 from inventory_movements where ref_id = :'shift_b'), 'one stock movement per tank (diesel sold nothing)');
select pg_temp.ok((select m.liters = -110 from inventory_movements m join nozzles n on n.tank_id = m.tank_id
                    where m.ref_id = :'shift_b' and n.id = :'n1a'), 'the 90 tank loses the liters of both pump-1 legs');
select pg_temp.ok((select description = 'مبيعات مناوبة — المضخات 1، 3' from journal_entries
                    where source_id = :'shift_b' and description like 'مبيعات%'), 'the sales entry names every pump worked');
set local role authenticated;
select pg_temp.act_as(:'khaled');
select pg_temp.ok((select count(*) = 3 and bool_and(shift_id = :'shift_b') from shift_legs), 'attendant: sees the three legs of his shift, nothing else');
reset role;

-- =====================================================================
-- G. Pump board (S1): who holds which pump — name only
-- =====================================================================
set local role authenticated;
select pg_temp.act_as(:'mohamad');                  -- محمد is back on pump 2 (reopened), سامر holds pump 4
select pump_board(:'station') as board \gset
select pg_temp.ok(jsonb_array_length(:'board'::jsonb) = 4, 'pump board lists the 4 active pumps');
select pg_temp.ok((select e ->> 'held_by' = 'محمد خليل' and (e ->> 'held_by_me')::boolean
                     from jsonb_array_elements(:'board'::jsonb) e where (e ->> 'number')::int = 2), 'my pump shows my name and held_by_me');
select pg_temp.ok((select e ->> 'held_by' = 'سامر يوسف' and not (e ->> 'held_by_me')::boolean
                     from jsonb_array_elements(:'board'::jsonb) e where (e ->> 'number')::int = 4), 'a colleague''s pump shows his display name');
select pg_temp.ok((select e -> 'held_by' = 'null'::jsonb and jsonb_array_length(e -> 'nozzles') = 2
                     from jsonb_array_elements(:'board'::jsonb) e where (e ->> 'number')::int = 1), 'a free pump has no holder and lists its nozzles');
select pg_temp.ok((select (e -> 'nozzles' -> 0 ->> 'last_reading')::numeric = 98520.0
                     from jsonb_array_elements(:'board'::jsonb) e where (e ->> 'number')::int = 1), 'nozzles carry last_reading for the prefill');
select pg_temp.ok((select bool_and((select array_agg(k order by k) from jsonb_object_keys(e) k)
                                   = array['held_by', 'held_by_me', 'name', 'nozzles', 'number', 'pump_id'])
                     from jsonb_array_elements(:'board'::jsonb) e)
                  and position(:'mgr' in :'board') = 0, 'pump board exposes no ids, cash or shift data of colleagues');
select pg_temp.act_as('11111111-0000-4000-8000-000000000006');           -- رنا, a customer
select pg_temp.throws(format('select pump_board(%L)', :'station'), '42501', 'a customer cannot read the pump board');
reset role;
select pg_temp.act_as(null);
set local role anon;
select pg_temp.throws(format('select pump_board(%L)', :'station'), '42501', 'guest: cannot call pump_board');
reset role;

-- =====================================================================
-- H. Correcting a reopened leg after a colleague used the same pump (final-review fixes)
-- =====================================================================
-- خالد works pump 3 (+10 L), the owner rejects; the owner then works pump 3 (+20 L); the shift is reopened.
select last_reading as h_last from nozzles where id = :'n3' \gset
select '88888888-0000-4000-8000-000000000005' as shift_h1, '88888888-0000-4000-8000-0000000000c1' as leg_h1,
       '88888888-0000-4000-8000-000000000006' as shift_h2, '88888888-0000-4000-8000-0000000000c2' as leg_h2 \gset
select pg_temp.act_as(:'khaled');
select open_shift(:'shift_h1', :'leg_h1', :'pump3', 0, pg_temp.opening(:'pump3'));
select submit_shift(:'shift_h1', pg_temp.closing(:'leg_h1', 10), 1250);
select pg_temp.act_as(:'owner');
select decide_approval((select id from approval_requests where ref_id = :'shift_h1' and status = 'pending'), false, null, 'أعد القراءة');
select open_shift(:'shift_h2', :'leg_h2', :'pump3', 0, pg_temp.opening(:'pump3'));
select submit_shift(:'shift_h2', pg_temp.closing(:'leg_h2', 20), 2500);
update shift_legs set created_at = created_at + interval '1 minute' where id = :'leg_h2';   -- it arrived later
select reopen_shift(:'shift_h1', 'تصحيح القراءة');
select pg_temp.ok((select bool_and(closing_reading is null) from leg_readings where leg_id = :'leg_h1'),
                  'reopen clears the closing readings of the reopened leg');
select pg_temp.act_as(:'khaled');
select pg_temp.throws(format('select submit_shift(%L, %L::jsonb, 0)', :'shift_h1', '[]'),
                      'FUELOS_READING_MISSING', 'a corrected close must send every closing reading again');
select pg_temp.throws(format('select submit_shift(%L, %L::jsonb, 1875)', :'shift_h1',
                             jsonb_build_array(jsonb_build_object('nozzle_id', :'n3', 'closing_reading', :'h_last'::numeric + 15))),
                      'FUELOS_READING_ABOVE_NEXT', 'a corrected closing cannot claim liters of the leg that came after it');
select submit_shift(:'shift_h1', jsonb_build_array(jsonb_build_object('nozzle_id', :'n3', 'closing_reading', :'h_last'::numeric + 8)), 1000);
select pg_temp.ok((select last_reading = :'h_last'::numeric + 30 from nozzles where id = :'n3'),
                  'a corrected earlier leg does not move the pump''s last reading back');

\o
select 'ALL SHIFT-LEG TESTS PASSED' as result;
rollback;
