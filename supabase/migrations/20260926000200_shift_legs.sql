-- =====================================================================
-- FuelOS — attendant shifts across several pumps ("pump legs")
-- Spec: docs/superpowers/specs/2026-09-26-shift-pump-legs-design.md
--   * a shift belongs to ONE attendant (cash stays with him) and is split into legs, one per pump worked
--   * one open leg per pump (Q4) and one open leg per shift (he holds one pump at a time)
--   * existing shifts become one-leg shifts; totals are unchanged (supabase/tests/local/legs_migration_check.sh)
-- =====================================================================

-- ---------- 1. new tables (additive) ----------
create table shift_legs (
  id                 uuid primary key,                -- generated on the device (idempotent sync)
  station_id         uuid not null references stations(id),
  shift_id           uuid not null,
  pump_id            uuid not null,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,                     -- null = the attendant is on this pump now
  gap_note           text,                            -- why the opening reading was above the last recorded one
  device_id          text references devices(id),
  client_created_at  timestamptz,
  created_at         timestamptz not null default now(),
  foreign key (station_id, shift_id) references shifts(station_id, id),
  foreign key (station_id, pump_id) references pumps(station_id, id),
  unique (station_id, id),
  check (ended_at is null or ended_at >= started_at)
);
create unique index one_open_leg_per_pump  on shift_legs (pump_id)  where ended_at is null;
create unique index one_open_leg_per_shift on shift_legs (shift_id) where ended_at is null;
create index shift_legs_shift_idx on shift_legs (shift_id, started_at);

create table leg_readings (
  leg_id              uuid not null references shift_legs(id),
  nozzle_id           uuid not null references nozzles(id),
  opening_reading     numeric(14,1) not null check (opening_reading >= 0),
  closing_reading     numeric(14,1),
  gap_liters          numeric(14,1) not null default 0 check (gap_liters >= 0),  -- opening − last_reading at leg start
  opening_photo_path  text,
  closing_photo_path  text,
  primary key (leg_id, nozzle_id),
  check (closing_reading is null or closing_reading >= opening_reading)
);

-- legs are never deleted (they carry the meter history)
create trigger shift_legs_no_delete before delete on shift_legs for each row execute function fn_forbid_change();
create trigger leg_readings_no_delete before delete on leg_readings for each row execute function fn_forbid_change();
create trigger shift_legs_audit after insert or update or delete on shift_legs for each row execute function fn_audit();

alter table shift_legs enable row level security;
alter table leg_readings enable row level security;
create policy legs_read on shift_legs for select to authenticated
  using (exists (select 1 from shifts s where s.id = shift_id and (s.attendant_id = auth.uid() or is_station_staff(s.station_id))));
create policy leg_readings_read on leg_readings for select to authenticated
  using (exists (select 1 from shift_legs l join shifts s on s.id = l.shift_id
                  where l.id = leg_id and (s.attendant_id = auth.uid() or is_station_staff(s.station_id))));
-- same pattern as the rls migration: table rights granted, RLS decides; no write policies => writes via RPCs only
revoke all on shift_legs, leg_readings from anon;
grant select, insert, update, delete on shift_legs, leg_readings to authenticated, service_role;

-- ---------- 2. existing data: every shift becomes one leg on its pump ----------
alter table sales add column leg_id uuid;

insert into shift_legs (id, station_id, shift_id, pump_id, started_at, ended_at, device_id, client_created_at, created_at)
select gen_random_uuid(), s.station_id, s.id, s.pump_id, s.opened_at,
       case when s.status in ('open', 'reopened') then null else greatest(coalesce(s.closed_at, s.opened_at), s.opened_at) end,
       s.device_id, s.client_created_at, s.created_at
  from shifts s;

insert into leg_readings (leg_id, nozzle_id, opening_reading, closing_reading, opening_photo_path, closing_photo_path)
select l.id, r.nozzle_id, r.opening_reading, r.closing_reading, r.opening_photo_path, r.closing_photo_path
  from shift_readings r join shift_legs l on l.shift_id = r.shift_id;

update sales x set leg_id = l.id from shift_legs l where l.shift_id = x.shift_id;

-- ---------- 3. cut-over: the shift no longer owns a pump ----------
alter table sales alter column leg_id set not null;
alter table sales add constraint sales_leg_fk foreign key (station_id, leg_id) references shift_legs(station_id, id);
create index sales_leg_idx on sales (leg_id);
drop table shift_readings;
drop index one_open_shift_per_pump;
alter table shifts drop column pump_id;
-- one open shift per attendant per station: his cash stays with him until he closes (Q2)
create unique index one_open_shift_per_attendant on shifts (station_id, attendant_id) where status in ('open', 'reopened');

-- the leg of a sale is frozen like its other financial fields
create or replace function fn_sale_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'FUELOS_APPEND_ONLY', detail = 'void the sale with a reason instead of deleting it';
  end if;
  if (new.liters, new.unit_price, new.amount, new.payment_method, new.shift_id, new.leg_id, new.nozzle_id,
      new.company_account_id, new.created_by, new.client_created_at)
     is distinct from
     (old.liters, old.unit_price, old.amount, old.payment_method, old.shift_id, old.leg_id, old.nozzle_id,
      old.company_account_id, old.created_by, old.client_created_at) then
    raise exception using errcode = 'P0001', message = 'FUELOS_SALE_FROZEN', detail = 'financial fields of a sale cannot change; void and re-record';
  end if;
  if old.status = 'voided' and new.status <> 'voided' then
    raise exception using errcode = 'P0001', message = 'FUELOS_SALE_FROZEN', detail = 'a voided sale cannot be revived';
  end if;
  return new;
end $$;

-- ---------- 4. internal helpers (not callable through the API) ----------
-- Opens leg p_leg_id of shift p_shift on p_pump and stores its opening readings.
-- p_readings: [{"nozzle_id": "...", "opening_reading": 184220.5, "photo_path": "..."}] — one per active nozzle of the pump.
-- Opening < last_reading => FUELOS_READING_BELOW_LAST. Opening > last_reading => unrecorded liters => p_gap_note required.
create or replace function start_leg(p_shift shifts, p_leg_id uuid, p_pump uuid, p_readings jsonb, p_gap_note text,
                                     p_device text, p_at timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n nozzles; r jsonb; v_open numeric; v_gaps text[] := '{}'; v_constraint text;
begin
  if not exists (select 1 from pumps where id = p_pump and station_id = p_shift.station_id and is_active) then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'pump';
  end if;
  begin
    insert into shift_legs (id, station_id, shift_id, pump_id, started_at, gap_note, device_id, client_created_at)
    values (p_leg_id, p_shift.station_id, p_shift.id, p_pump, p_at, nullif(trim(p_gap_note), ''), p_device, p_at);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'one_open_leg_per_pump' then
      raise exception using errcode = 'P0001', message = 'FUELOS_PUMP_BUSY', detail = 'another attendant is on this pump';
    end if;
    raise exception using errcode = 'P0001', message = 'FUELOS_ID_CONFLICT', detail = v_constraint;
  end;

  for n in select * from nozzles where pump_id = p_pump and is_active order by label loop
    r := null;
    select value into r from jsonb_array_elements(coalesce(p_readings, '[]'::jsonb))
     where value ->> 'nozzle_id' = n.id::text limit 1;
    if r is null or r ->> 'opening_reading' is null then
      raise exception using errcode = 'P0001', message = 'FUELOS_READING_MISSING', detail = n.id::text;
    end if;
    v_open := (r ->> 'opening_reading')::numeric;
    if v_open < n.last_reading then
      raise exception using errcode = 'P0001', message = 'FUELOS_READING_BELOW_LAST',
        detail = format('nozzle %s: %s < last %s', n.label, v_open, n.last_reading);
    end if;
    if v_open > n.last_reading then
      v_gaps := v_gaps || format('%s: %s L', n.label, v_open - n.last_reading);
    end if;
    insert into leg_readings (leg_id, nozzle_id, opening_reading, gap_liters, opening_photo_path)
    values (p_leg_id, n.id, v_open, v_open - n.last_reading, r ->> 'photo_path');
  end loop;

  if cardinality(v_gaps) > 0 and coalesce(trim(p_gap_note), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_GAP_NOTE_REQUIRED', detail = array_to_string(v_gaps, ', ');
  end if;
end $$;

-- Stores the closing readings of leg p_leg, ends it at p_at and moves the nozzles' last_reading forward
-- (skipped when a leg created later already exists on that pump, e.g. when a rejected shift is corrected afterwards;
-- server arrival order, not device clocks, decides what "later" means).
-- p_closing: [{"nozzle_id": "...", "closing_reading": 191640.0, "photo_path": "..."}]
create or replace function end_leg(p_leg shift_legs, p_closing jsonb, p_at timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r jsonb; lr leg_readings; v_next numeric;
begin
  for r in select * from jsonb_array_elements(coalesce(p_closing, '[]'::jsonb)) loop
    select * into lr from leg_readings where leg_id = p_leg.id and nozzle_id::text = r ->> 'nozzle_id';
    continue when lr.leg_id is null or r ->> 'closing_reading' is null;
    if (r ->> 'closing_reading')::numeric < lr.opening_reading then
      raise exception using errcode = 'P0001', message = 'FUELOS_READING_BELOW_LAST',
        detail = format('closing %s < opening %s', r ->> 'closing_reading', lr.opening_reading);
    end if;
    -- a reopened leg corrected after a colleague used the pump cannot claim the liters of the leg that followed it
    select min(nr.opening_reading) into v_next
      from shift_legs later join leg_readings nr on nr.leg_id = later.id
     where later.pump_id = p_leg.pump_id and later.created_at > p_leg.created_at and nr.nozzle_id = lr.nozzle_id;
    if (r ->> 'closing_reading')::numeric > v_next then
      raise exception using errcode = 'P0001', message = 'FUELOS_READING_ABOVE_NEXT',
        detail = format('closing %s > %s, where the next leg on this pump started', r ->> 'closing_reading', v_next);
    end if;
    update leg_readings
       set closing_reading = (r ->> 'closing_reading')::numeric, closing_photo_path = r ->> 'photo_path'
     where leg_id = p_leg.id and nozzle_id = lr.nozzle_id;
  end loop;
  if exists (select 1 from leg_readings where leg_id = p_leg.id and closing_reading is null) then
    raise exception using errcode = 'P0001', message = 'FUELOS_READING_MISSING', detail = 'closing reading';
  end if;

  update shift_legs set ended_at = greatest(p_at, started_at) where id = p_leg.id;
  update nozzles nzl set last_reading = lr2.closing_reading
    from leg_readings lr2
   where lr2.leg_id = p_leg.id and lr2.nozzle_id = nzl.id
     and not exists (select 1 from shift_legs later where later.pump_id = p_leg.pump_id and later.created_at > p_leg.created_at);
end $$;

-- ---------- 5. shift RPCs ----------
drop function open_shift(uuid, uuid, numeric, jsonb, text, timestamptz);
create function open_shift(p_shift_id uuid, p_leg_id uuid, p_pump uuid, p_opening_cash numeric, p_readings jsonb,
                           p_gap_note text default null, p_device text default null,
                           p_client_created_at timestamptz default now())
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_station uuid; v_existing shifts; sh shifts; v_at timestamptz := coalesce(p_client_created_at, now()); v_constraint text;
begin
  select station_id into v_station from pumps where id = p_pump and is_active;
  if v_station is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'pump';
  end if;
  perform require_role(v_station, array['attendant', 'shift_manager', 'owner']::member_role[]);

  select * into v_existing from shifts where id = p_shift_id;
  if v_existing.id is not null then                              -- idempotent replay from the offline outbox
    if v_existing.attendant_id is distinct from auth.uid() then
      raise exception using errcode = 'P0001', message = 'FUELOS_ID_CONFLICT';
    end if;
    return v_existing.id;
  end if;

  begin
    insert into shifts (id, station_id, attendant_id, opening_cash, device_id, client_created_at, opened_at)
    values (p_shift_id, v_station, auth.uid(), coalesce(p_opening_cash, 0), p_device, v_at, v_at)
    returning * into sh;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'one_open_shift_per_attendant' then
      raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_ALREADY_OPEN';
    end if;
    raise exception using errcode = 'P0001', message = 'FUELOS_ID_CONFLICT', detail = v_constraint;
  end;
  perform start_leg(sh, p_leg_id, p_pump, p_readings, p_gap_note, p_device, v_at);
  return p_shift_id;
end $$;

-- Meter-based totals over all legs. One price per product per shift: the price in force when the shift opened.
-- Returns the old keys (liters, meter_sales, card, credit, voucher, opening_cash, expected_cash, counted_cash,
-- cash_diff, nozzles[]) plus tanks[] (liters per tank, used for stock) and legs[] (pump, times, gap note, readings).
create or replace function shift_summary(p_shift uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  sh shifts; v_liters numeric; v_sales numeric; v_card numeric; v_credit numeric; v_voucher numeric;
  v_expected numeric; v_nozzles jsonb; v_tanks jsonb; v_legs jsonb;
begin
  select * into sh from shifts where id = p_shift;
  if sh.id is null then raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'shift'; end if;
  -- NULL-safe: an anonymous caller (auth.uid() is null) must fail, not slip through a NULL comparison
  if not (coalesce(sh.attendant_id = auth.uid(), false)
          or has_station_role(sh.station_id, array['owner', 'accountant', 'shift_manager']::member_role[])
          or has_access_grant(sh.station_id)) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;

  with rows as (
    select l.id as leg_id, lr.nozzle_id, nz.label, t.id as tank_id, lr.opening_reading, lr.closing_reading, lr.gap_liters,
           coalesce(lr.closing_reading, lr.opening_reading) - lr.opening_reading as liters,
           price_at(sh.station_id, t.product_id, sh.opened_at) as price
      from shift_legs l join leg_readings lr on lr.leg_id = l.id
      join nozzles nz on nz.id = lr.nozzle_id join tanks t on t.id = nz.tank_id
     where l.shift_id = p_shift),
  priced as (select rows.*, round(rows.liters * coalesce(rows.price, 0), 2) as amount from rows)
  select coalesce(sum(priced.liters), 0), coalesce(sum(priced.amount), 0),
         coalesce((select jsonb_agg(jsonb_build_object('nozzle_id', z.nozzle_id, 'tank_id', z.tank_id, 'liters', z.liters,
                                                       'price', z.price, 'amount', z.amount) order by z.nozzle_id)
                     from (select nozzle_id, tank_id, price, sum(liters) as liters, sum(amount) as amount
                             from priced group by nozzle_id, tank_id, price) z), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('tank_id', z.tank_id, 'liters', z.liters) order by z.tank_id)
                     from (select tank_id, sum(liters) as liters from priced group by tank_id) z), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object(
                            'leg_id', l.id, 'pump_id', l.pump_id, 'pump_number', p.number,
                            'started_at', l.started_at, 'ended_at', l.ended_at, 'gap_note', l.gap_note,
                            'liters', coalesce(g.liters, 0), 'amount', coalesce(g.amount, 0),
                            'nozzles', coalesce(g.nozzles, '[]'::jsonb)) order by l.started_at, l.created_at)
                     from shift_legs l join pumps p on p.id = l.pump_id
                     left join (select leg_id, sum(liters) as liters, sum(amount) as amount,
                                       jsonb_agg(jsonb_build_object('nozzle_id', nozzle_id, 'label', label,
                                                   'opening_reading', opening_reading, 'closing_reading', closing_reading,
                                                   'gap_liters', gap_liters, 'liters', liters, 'amount', amount)
                                                 order by label) as nozzles
                                  from priced group by leg_id) g on g.leg_id = l.id
                    where l.shift_id = p_shift), '[]'::jsonb)
    into v_liters, v_sales, v_nozzles, v_tanks, v_legs
    from priced;

  select coalesce(sum(amount) filter (where payment_method = 'card'), 0),
         coalesce(sum(amount) filter (where payment_method = 'credit'), 0),
         coalesce(sum(amount) filter (where payment_method = 'voucher'), 0)
    into v_card, v_credit, v_voucher
    from sales where shift_id = p_shift and status <> 'voided';
  v_expected := sh.opening_cash + v_sales - v_card - v_credit - v_voucher;
  return jsonb_build_object(
    'shift_id', p_shift, 'liters', v_liters, 'meter_sales', v_sales,
    'card', v_card, 'credit', v_credit, 'voucher', v_voucher,
    'opening_cash', sh.opening_cash, 'expected_cash', v_expected,
    'counted_cash', sh.counted_cash, 'cash_diff', case when sh.counted_cash is null then null else sh.counted_cash - v_expected end,
    'nozzles', v_nozzles, 'tanks', v_tanks, 'legs', v_legs);
end $$;

-- p_closing: closing readings of the CURRENT pump: [{"nozzle_id": "...", "closing_reading": 191640.0, "photo_path": "..."}]
create or replace function submit_shift(p_shift uuid, p_closing jsonb, p_counted_cash numeric, p_diff_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sh shifts; st stations; lg shift_legs; v_sum jsonb; v_diff numeric;
begin
  select * into sh from shifts where id = p_shift for update;
  if sh.id is null then raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND'; end if;
  if not ((coalesce(sh.attendant_id = auth.uid(), false) and is_station_member(sh.station_id))
          or has_station_role(sh.station_id, array['owner', 'shift_manager']::member_role[])) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;
  if sh.status not in ('open', 'reopened') then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_SHIFT_TRANSITION', detail = sh.status::text;
  end if;
  select * into st from stations where id = sh.station_id;

  select * into lg from shift_legs where shift_id = p_shift and ended_at is null for update;
  if lg.id is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'open leg';
  end if;
  perform end_leg(lg, p_closing, now());

  update shifts set counted_cash = p_counted_cash, closed_at = now() where id = p_shift;
  v_sum  := shift_summary(p_shift);
  v_diff := (v_sum ->> 'cash_diff')::numeric;
  if abs(v_diff) > st.cash_tolerance and coalesce(trim(p_diff_reason), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REASON_REQUIRED',
      detail = format('cash difference %s exceeds tolerance %s', v_diff, st.cash_tolerance);
  end if;

  update shifts set status = 'submitted', diff_reason = p_diff_reason where id = p_shift;
  insert into approval_requests (station_id, type, ref_table, ref_id, payload, requested_by)
  values (sh.station_id, 'shift_close', 'shifts', p_shift, v_sum, auth.uid());
  return v_sum;
end $$;

-- ---------- 6. sales: bound to the leg the device knew ----------
drop function record_sale(uuid, uuid, uuid, numeric, numeric, payment_method, uuid, uuid, uuid, uuid, int, boolean, text, timestamptz);
create function record_sale(p_sale_id uuid, p_shift uuid, p_leg uuid, p_nozzle uuid, p_liters numeric, p_unit_price numeric,
                            p_method payment_method, p_customer uuid default null, p_company uuid default null,
                            p_driver uuid default null, p_vehicle uuid default null, p_odometer int default null,
                            p_request_approval boolean default false, p_device text default null,
                            p_client_created_at timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sh shifts; lg shift_legs; v_amount numeric; v_status sale_status := 'recorded'; v_remaining numeric; c company_accounts;
  v_invoice uuid; v_number bigint; v_req uuid; v_price numeric; v_existing sales;
begin
  select * into sh from shifts where id = p_shift;
  if sh.id is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_NOT_OPEN';
  end if;
  if coalesce(sh.attendant_id = auth.uid(), false) then
    perform require_role(sh.station_id, array['attendant', 'shift_manager', 'owner']::member_role[]);
  else
    perform require_role(sh.station_id, array['owner', 'shift_manager']::member_role[]);
  end if;

  select * into v_existing from sales where id = p_sale_id;       -- idempotent replay from the offline outbox
  if v_existing.id is not null then
    if v_existing.created_by is distinct from auth.uid() or v_existing.shift_id <> p_shift
       or v_existing.leg_id is distinct from p_leg then
      raise exception using errcode = 'P0001', message = 'FUELOS_ID_CONFLICT';
    end if;
    return jsonb_build_object('sale_id', p_sale_id, 'replayed', true, 'amount', v_existing.amount, 'status', v_existing.status);
  end if;

  if sh.status not in ('open', 'reopened') then
    raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_NOT_OPEN';
  end if;
  -- the leg must be this shift's CURRENT leg and the nozzle must be on its pump;
  -- the price is the server price at shift open (one price per shift)
  select * into lg from shift_legs where id = p_leg and shift_id = p_shift and ended_at is null;
  select price_at(sh.station_id, t.product_id, sh.opened_at) into v_price
    from nozzles n join tanks t on t.id = n.tank_id
   where n.id = p_nozzle and n.pump_id = lg.pump_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'nozzle is not on the current pump';
  end if;
  if v_price is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NO_PRICE';
  end if;
  v_amount := round(p_liters * v_price, 2);

  if p_method = 'credit' then
    select * into c from company_accounts where id = p_company and station_id = sh.station_id;
    if c.id is null then raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'company'; end if;
    if c.status <> 'active' then
      raise exception using errcode = 'P0001', message = 'FUELOS_COMPANY_' || upper(c.status::text);
    end if;
    if p_driver is not null and not exists (select 1 from company_drivers where id = p_driver and company_account_id = c.id and is_authorized) then
      raise exception using errcode = 'P0001', message = 'FUELOS_DRIVER_NOT_AUTHORIZED';
    end if;
    v_remaining := company_remaining_credit(c.id);
    if v_amount > v_remaining then
      if not p_request_approval then
        raise exception using errcode = 'P0001', message = 'FUELOS_CREDIT_LIMIT',
          detail = json_build_object('remaining', v_remaining, 'possible_liters', floor(v_remaining / v_price))::text;
      end if;
      v_status := 'pending_approval';
    end if;
  end if;

  insert into sales (id, station_id, shift_id, leg_id, nozzle_id, liters, unit_price, amount, payment_method, customer_id,
                     company_account_id, driver_id, vehicle_id, odometer_km, status, created_by, device_id, client_created_at)
  values (p_sale_id, sh.station_id, p_shift, p_leg, p_nozzle, p_liters, v_price, v_amount, p_method, p_customer,
          p_company, p_driver, p_vehicle, p_odometer, v_status, auth.uid(), p_device, p_client_created_at);

  if v_status = 'pending_approval' then
    insert into approval_requests (station_id, type, ref_table, ref_id, payload, requested_by)
    values (sh.station_id, 'credit_over_limit', 'sales', p_sale_id,
            jsonb_build_object('company', c.name, 'amount', v_amount, 'remaining', v_remaining), auth.uid())
    returning id into v_req;
  end if;

  -- invoice for linked customers and company fills; confirmed when the shift is approved
  if p_customer is not null or p_method = 'credit' then
    perform pg_advisory_xact_lock(hashtext('invoice_number:' || sh.station_id::text));
    select coalesce(max(number), 0) + 1 into v_number from invoices where station_id = sh.station_id;
    insert into invoices (station_id, sale_id, number, customer_id, status)
    values (sh.station_id, p_sale_id, v_number, p_customer, 'pending') returning id into v_invoice;
  end if;

  return jsonb_build_object('sale_id', p_sale_id, 'amount', v_amount, 'unit_price', v_price, 'status', v_status,
                            'price_adjusted', p_unit_price is distinct from v_price,
                            'invoice_id', v_invoice, 'approval_id', v_req);
end $$;

-- ---------- 7. approvals: stock per tank across all legs ----------
-- p_option for shift_close: 'shortage_to_expense' (default) | 'shortage_to_employee'
create or replace function decide_approval(p_request uuid, p_approve boolean, p_option text default null, p_note text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ar approval_requests; sh shifts; v_sum jsonb; v_diff numeric; v_cash_in numeric; tk jsonb; v_cost numeric;
  v_cogs numeric := 0; v_missing_cost boolean := false; m tank_measurements; v_pumps text; v_pump_count int;
begin
  select * into ar from approval_requests where id = p_request for update;
  if ar.id is null or ar.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'no pending request';
  end if;
  if ar.type = 'stock_adjustment' then
    perform require_role(ar.station_id, array['owner', 'shift_manager']::member_role[]);
  else
    perform require_role(ar.station_id, array['owner']::member_role[]);
  end if;
  if coalesce(trim(p_note), '') = '' and not p_approve then
    raise exception using errcode = 'P0001', message = 'FUELOS_REASON_REQUIRED', detail = 'rejections need a note';
  end if;

  update approval_requests
     set status = case when p_approve then 'approved'::approval_status else 'rejected'::approval_status end,
         decided_by = auth.uid(), decided_at = now(), decision_option = p_option, decision_note = p_note
   where id = p_request;

  if ar.type = 'shift_close' then
    select * into sh from shifts where id = ar.ref_id for update;
    if not p_approve then
      update shifts set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = sh.id;
      return;
    end if;
    if exists (select 1 from sales where shift_id = sh.id and status = 'pending_approval') then
      raise exception using errcode = 'P0001', message = 'FUELOS_PENDING_APPROVALS', detail = 'decide the over-limit credit sales of this shift first';
    end if;
    update shifts set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = sh.id;
    v_sum := shift_summary(sh.id);
    v_diff := (v_sum ->> 'cash_diff')::numeric;
    v_cash_in := (v_sum ->> 'counted_cash')::numeric - sh.opening_cash;
    select string_agg(x.number::text, '، ' order by x.number), count(*) into v_pumps, v_pump_count
      from (select distinct p.number from shift_legs l join pumps p on p.id = l.pump_id where l.shift_id = sh.id) x;

    perform post_entry(sh.station_id, current_date,
      'مبيعات مناوبة — ' || case when v_pump_count > 1 then 'المضخات ' else 'المضخة ' end || v_pumps, 'shifts', sh.id, jsonb_build_array(
      jsonb_build_object('code', '1000', 'debit', greatest(v_cash_in, 0)),
      jsonb_build_object('code', '1000', 'credit', greatest(-v_cash_in, 0)),
      jsonb_build_object('code', '1020', 'debit', (v_sum ->> 'card')::numeric),
      jsonb_build_object('code', '1100', 'debit', (v_sum ->> 'credit')::numeric),
      jsonb_build_object('code', '2100', 'debit', (v_sum ->> 'voucher')::numeric),
      jsonb_build_object('code', case when p_option = 'shortage_to_employee' then '1150' else '5300' end,
                         'debit', greatest(-v_diff, 0), 'memo', 'عجز صندوق'),
      jsonb_build_object('code', '4200', 'credit', greatest(v_diff, 0), 'memo', 'زيادة صندوق'),
      jsonb_build_object('code', '4000', 'credit', (v_sum ->> 'meter_sales')::numeric)));

    -- one stock movement per tank, summed over every leg and nozzle of the shift
    for tk in select * from jsonb_array_elements(v_sum -> 'tanks') loop
      continue when (tk ->> 'liters')::numeric = 0;
      insert into inventory_movements (station_id, tank_id, type, liters, ref_table, ref_id, created_by)
      values (sh.station_id, (tk ->> 'tank_id')::uuid, 'sale', -(tk ->> 'liters')::numeric, 'shifts', sh.id, auth.uid());
      v_cost := tank_avg_cost((tk ->> 'tank_id')::uuid);
      if v_cost is null then v_missing_cost := true;
      else v_cogs := v_cogs + round((tk ->> 'liters')::numeric * v_cost, 2);
      end if;
      -- a delivery without a purchase price makes the cost (and profit) an estimate
      if exists (select 1 from fuel_deliveries d where d.tank_id = (tk ->> 'tank_id')::uuid and d.unit_cost is null) then
        v_missing_cost := true;
      end if;
    end loop;
    if v_cogs > 0 then
      perform post_entry(sh.station_id, current_date,
        'تكلفة الوقود المباع' || case when v_missing_cost then ' (تكلفة غير مكتملة)' else '' end, 'shifts', sh.id,
        jsonb_build_array(jsonb_build_object('code', '5000', 'debit', v_cogs), jsonb_build_object('code', '1200', 'credit', v_cogs)));
    end if;

    update invoices set status = 'confirmed'
     where status = 'pending' and sale_id in (select id from sales where shift_id = sh.id and status = 'recorded');
    -- loyalty: 1 point per 250 of currency on confirmed customer invoices (configurable later)
    insert into loyalty_ledger (customer_id, station_id, invoice_id, points, reason)
    select i.customer_id, i.station_id, i.id, floor(s.amount / 250)::int, 'فاتورة مؤكدة'
      from invoices i join sales s on s.id = i.sale_id
     where s.shift_id = sh.id and i.customer_id is not null and i.status = 'confirmed' and floor(s.amount / 250) > 0
       and not exists (select 1 from loyalty_ledger l where l.invoice_id = i.id);

  elsif ar.type = 'credit_over_limit' then
    if p_approve then
      update sales set status = 'recorded' where id = ar.ref_id;
    else
      update sales set status = 'voided', void_reason = 'رُفض تجاوز الحد: ' || p_note where id = ar.ref_id;
      update invoices set status = 'cancelled' where sale_id = ar.ref_id;
    end if;

  elsif ar.type = 'stock_adjustment' then
    if p_approve then
      select * into m from tank_measurements where id = ar.ref_id;
      perform apply_stock_adjustment(m.station_id, m.tank_id, m.measured_l - m.book_l,
                                     coalesce(p_note, 'تسوية معتمدة'), m.id);
    end if;
  end if;
end $$;

-- ---------- 8. reopen: the LAST leg is reopened ----------
-- rejected -> reopened: the attendant fixes readings/cash and submits again.
-- approved -> reopened: its postings are reversed (reason required) and its stock movements are returned,
-- so re-approving does not double count. Invoices stay confirmed; loyalty is never granted twice.
-- The last leg's pump must be free (FUELOS_PUMP_BUSY) and the attendant must not have another open shift
-- (FUELOS_SHIFT_ALREADY_OPEN).
create or replace function reopen_shift(p_shift uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sh shifts; lg shift_legs; e record; t record;
begin
  select * into sh from shifts where id = p_shift for update;
  if sh.id is null then raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND'; end if;
  perform require_role(sh.station_id, array['owner']::member_role[]);
  if coalesce(trim(p_reason), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REASON_REQUIRED';
  end if;

  if sh.status = 'approved' then
    for e in select id from journal_entries je
              where je.source_table = 'shifts' and je.source_id = sh.id and je.status = 'posted'
                and je.reverses_entry_id is null
                and not exists (select 1 from journal_entries r where r.reverses_entry_id = je.id)
    loop
      perform reverse_journal_entry(e.id, 'إعادة فتح المناوبة: ' || p_reason);
    end loop;
    for t in select tank_id, sum(liters) as net from inventory_movements
              where ref_table = 'shifts' and ref_id = sh.id group by tank_id having sum(liters) < 0
    loop
      insert into inventory_movements (station_id, tank_id, type, liters, ref_table, ref_id, reason, created_by)
      values (sh.station_id, t.tank_id, 'return', -t.net, 'shifts', sh.id, 'إعادة فتح المناوبة: ' || p_reason, auth.uid());
    end loop;
  elsif sh.status <> 'rejected' then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_SHIFT_TRANSITION', detail = sh.status::text;
  end if;

  select * into lg from shift_legs where shift_id = sh.id order by started_at desc, created_at desc limit 1 for update;
  begin
    update shift_legs set ended_at = null where id = lg.id;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'FUELOS_PUMP_BUSY', detail = 'the pump of the last leg is taken';
  end;
  -- the corrected close must send every closing reading again (no silent reuse of the rejected ones)
  update leg_readings set closing_reading = null, closing_photo_path = null where leg_id = lg.id;
  begin
    update shifts set status = 'reopened', decision_note = p_reason, decided_by = auth.uid(), decided_at = now()
     where id = sh.id;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_ALREADY_OPEN', detail = 'the attendant has another open shift';
  end;
end $$;

-- ---------- 9. grants ----------
revoke execute on function start_leg(shifts, uuid, uuid, jsonb, text, text, timestamptz),
                           end_leg(shift_legs, jsonb, timestamptz)
  from public, anon, authenticated;
revoke execute on function open_shift(uuid, uuid, uuid, numeric, jsonb, text, text, timestamptz),
                           record_sale(uuid, uuid, uuid, uuid, numeric, numeric, payment_method, uuid, uuid, uuid, uuid, int, boolean, text, timestamptz)
  from public, anon;
grant execute on function open_shift(uuid, uuid, uuid, numeric, jsonb, text, text, timestamptz),
                          record_sale(uuid, uuid, uuid, uuid, numeric, numeric, payment_method, uuid, uuid, uuid, uuid, int, boolean, text, timestamptz)
  to authenticated, service_role;

-- ---------- 10. moving to another pump ----------
-- Moves the attendant to another pump in one transaction: closes the current leg with p_closing (its pump's
-- closing readings, which become the nozzles' last_reading) and opens leg p_new_leg_id on p_new_pump with p_opening.
-- The cash stays with the attendant; nothing is counted here. Replay-safe on p_new_leg_id (offline outbox).
create function switch_pump(p_shift uuid, p_new_leg_id uuid, p_closing jsonb, p_new_pump uuid, p_opening jsonb,
                            p_gap_note text default null, p_device text default null,
                            p_client_created_at timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sh shifts; lg shift_legs; v_existing shift_legs; v_at timestamptz;
begin
  select * into sh from shifts where id = p_shift for update;
  if sh.id is null then raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'shift'; end if;
  if not ((coalesce(sh.attendant_id = auth.uid(), false) and is_station_member(sh.station_id))
          or has_station_role(sh.station_id, array['owner', 'shift_manager']::member_role[])) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;

  select * into v_existing from shift_legs where id = p_new_leg_id;   -- idempotent replay from the offline outbox
  if v_existing.id is not null then
    if v_existing.shift_id <> p_shift then
      raise exception using errcode = 'P0001', message = 'FUELOS_ID_CONFLICT';
    end if;
    return jsonb_build_object('leg_id', p_new_leg_id, 'replayed', true);
  end if;

  if sh.status not in ('open', 'reopened') then
    raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_NOT_OPEN';
  end if;
  select * into lg from shift_legs where shift_id = p_shift and ended_at is null for update;
  if lg.id is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'open leg';
  end if;
  -- a device clock behind the leg start must not break the move: the move happens no earlier than the leg began
  v_at := greatest(coalesce(p_client_created_at, now()), lg.started_at);
  perform end_leg(lg, p_closing, v_at);
  perform start_leg(sh, p_new_leg_id, p_new_pump, p_opening, p_gap_note, p_device, v_at);
  return jsonb_build_object('leg_id', p_new_leg_id, 'closed_leg_id', lg.id, 'replayed', false);
end $$;

revoke execute on function switch_pump(uuid, uuid, jsonb, uuid, jsonb, text, text, timestamptz) from public, anon;
grant execute on function switch_pump(uuid, uuid, jsonb, uuid, jsonb, text, text, timestamptz) to authenticated, service_role;

-- ---------- 11. pump board for S1 «بداية المناوبة» ----------
-- One row per active pump: number, nozzles (with last_reading for the prefill) and who holds it now.
-- An attendant cannot read colleagues' shifts through RLS; this exposes ONLY the holder's display name.
create function pump_board(p_station uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform require_role(p_station, array['attendant', 'shift_manager', 'owner', 'accountant']::member_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'pump_id', p.id, 'number', p.number, 'name', p.name,
             'held_by', h.display_name,
             'held_by_me', coalesce(h.attendant_id = auth.uid(), false),
             'nozzles', coalesce((select jsonb_agg(jsonb_build_object(
                                           'nozzle_id', n.id, 'label', n.label, 'product_id', t.product_id,
                                           'product_name', pr.name, 'last_reading', n.last_reading) order by n.label)
                                    from nozzles n join tanks t on t.id = n.tank_id join products pr on pr.id = t.product_id
                                   where n.pump_id = p.id and n.is_active), '[]'::jsonb))
           order by p.number)
      from pumps p
      left join lateral (
        select s.attendant_id, coalesce(m.display_name, 'زميل') as display_name
          from shift_legs l join shifts s on s.id = l.shift_id
          left join station_members m on m.station_id = s.station_id and m.user_id = s.attendant_id
         where l.pump_id = p.id and l.ended_at is null
         limit 1) h on true
     where p.station_id = p_station and p.is_active), '[]'::jsonb);
end $$;

revoke execute on function pump_board(uuid) from public, anon;
grant execute on function pump_board(uuid) to authenticated, service_role;
