-- Checks run AFTER migration 20260926000200_shift_legs (see legs_migration_check.sh).
\set QUIET on
do $$ begin perform set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', false); end $$;
-- summary without the keys the migration adds, nozzles in a fixed order
create function legs_check.norm(p jsonb) returns jsonb language sql as $$
  select (p - 'legs' - 'tanks') || jsonb_build_object('nozzles',
         coalesce((select jsonb_agg(e order by e ->> 'nozzle_id') from jsonb_array_elements(p -> 'nozzles') e), '[]'::jsonb));
$$;
do $$
declare b record; v_legs int; lg shift_legs; v_readings jsonb;
begin
  if (select count(*) from legs_check.shifts_before) < 2 then
    raise exception 'FAIL: the fixture should hold at least 2 shifts';
  end if;
  for b in select * from legs_check.shifts_before loop
    select count(*) into v_legs from shift_legs where shift_id = b.shift_id;
    if v_legs <> 1 then raise exception 'FAIL: shift % has % legs, expected 1', b.shift_id, v_legs; end if;
    select * into lg from shift_legs where shift_id = b.shift_id;
    if lg.pump_id <> b.pump_id or lg.started_at <> b.opened_at then
      raise exception 'FAIL: leg of shift % has the wrong pump or start', b.shift_id;
    end if;
    if (b.status in ('open', 'reopened')) <> (lg.ended_at is null) then
      raise exception 'FAIL: leg of shift % open/closed does not match status %', b.shift_id, b.status;
    end if;
    select jsonb_agg(jsonb_build_object('nozzle_id', r.nozzle_id, 'opening', r.opening_reading, 'closing', r.closing_reading)
                     order by r.nozzle_id) into v_readings from leg_readings r where r.leg_id = lg.id;
    if v_readings is distinct from b.readings then
      raise exception 'FAIL: readings of shift % changed: % -> %', b.shift_id, b.readings, v_readings;
    end if;
    if (select count(*) from sales where shift_id = b.shift_id and leg_id = lg.id) <> b.sales then
      raise exception 'FAIL: sales of shift % not all linked to its leg', b.shift_id;
    end if;
    if legs_check.norm(shift_summary(b.shift_id)) is distinct from legs_check.norm(b.summary) then
      raise exception 'FAIL: totals of shift % changed: % -> %', b.shift_id, legs_check.norm(b.summary), legs_check.norm(shift_summary(b.shift_id));
    end if;
    raise notice 'PASS  shift % migrated as one leg with identical totals', b.shift_id;
  end loop;
  if exists (select 1 from sales where leg_id is null) then raise exception 'FAIL: a sale has no leg'; end if;
  if (select row(journal, stock, meters) from legs_check.books_before) is distinct from
     (select row(
       (select md5(string_agg(concat_ws('|', l.entry_id, l.account_id, l.debit, l.credit), ',' order by l.id)) from journal_lines l),
       (select md5(string_agg(concat_ws('|', m.id, m.tank_id, m.liters), ',' order by m.id)) from inventory_movements m),
       (select md5(string_agg(concat_ws('|', n.id, n.last_reading), ',' order by n.id)) from nozzles n))) then
    raise exception 'FAIL: journal, stock or meter readings changed during the migration';
  end if;
  raise notice 'PASS  journal, stock and meter readings unchanged';
end $$;
