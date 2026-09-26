-- Snapshot taken BEFORE migration 20260926000200_shift_legs (see legs_migration_check.sh).
do $$ begin perform set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', false); end $$;
create schema legs_check;
create table legs_check.shifts_before as
select s.id as shift_id, s.pump_id, s.status, s.opened_at, s.closed_at,
       shift_summary(s.id) as summary,
       (select jsonb_agg(jsonb_build_object('nozzle_id', r.nozzle_id, 'opening', r.opening_reading, 'closing', r.closing_reading)
                         order by r.nozzle_id) from shift_readings r where r.shift_id = s.id) as readings,
       (select count(*) from sales x where x.shift_id = s.id) as sales
  from shifts s;
-- the whole books must not move either
create table legs_check.books_before as
select (select md5(string_agg(concat_ws('|', l.entry_id, l.account_id, l.debit, l.credit), ',' order by l.id)) from journal_lines l) as journal,
       (select md5(string_agg(concat_ws('|', m.id, m.tank_id, m.liters), ',' order by m.id)) from inventory_movements m) as stock,
       (select md5(string_agg(concat_ws('|', n.id, n.last_reading), ',' order by n.id)) from nozzles n) as meters;
