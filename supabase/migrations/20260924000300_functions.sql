-- =====================================================================
-- FuelOS — permission helpers + business RPCs (reference implementation)
-- All RPCs are SECURITY DEFINER and check the caller's role explicitly, because
-- they write across several tables in one transaction (shift -> ledger -> stock -> invoices).
-- =====================================================================

-- ---------- permission helpers ----------
create or replace function is_platform_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from platform_staff where user_id = auth.uid());
$$;

create or replace function has_station_role(p_station uuid, p_roles member_role[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from station_members m
                 where m.station_id = p_station and m.user_id = auth.uid()
                   and m.status = 'active' and m.role = any (p_roles));
$$;

create or replace function is_station_member(p_station uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select has_station_role(p_station, array['owner', 'accountant', 'shift_manager', 'attendant']::member_role[]);
$$;

-- Platform staff can read a station's financial data only with a live, reasoned grant.
create or replace function has_access_grant(p_station uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from access_grants g
                 where g.station_id = p_station and g.user_id = auth.uid() and g.expires_at > now());
$$;

create or replace function require_role(p_station uuid, p_roles member_role[]) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not has_station_role(p_station, p_roles) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED',
      detail = format('requires one of %s', p_roles);
  end if;
end $$;

-- ---------- ledger helpers ----------
create or replace function acct(p_station uuid, p_code text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from accounts where station_id = p_station and code = p_code;
$$;

-- lines: [{"code":"1000","debit":100},{"code":"4000","credit":100,"memo":"..."}]; zero lines are skipped.
create or replace function post_entry(p_station uuid, p_date date, p_description text,
                                      p_source_table text, p_source_id uuid, p_lines jsonb,
                                      p_reverses uuid default null, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_entry uuid; v_line jsonb; v_acct uuid; v_debit numeric; v_credit numeric;
begin
  insert into journal_entries (station_id, entry_date, description, source_table, source_id, reverses_entry_id, reason, created_by)
  values (p_station, p_date, p_description, p_source_table, p_source_id, p_reverses, p_reason, auth.uid())
  returning id into v_entry;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_debit  := round(coalesce((v_line ->> 'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_line ->> 'credit')::numeric, 0), 2);
    continue when v_debit = 0 and v_credit = 0;
    v_acct := acct(p_station, v_line ->> 'code');
    if v_acct is null then
      raise exception using errcode = 'P0001', message = 'FUELOS_UNKNOWN_ACCOUNT', detail = v_line ->> 'code';
    end if;
    insert into journal_lines (station_id, entry_id, account_id, debit, credit, memo)
    values (p_station, v_entry, v_acct, v_debit, v_credit, v_line ->> 'memo');
  end loop;

  update journal_entries set status = 'posted' where id = v_entry;   -- guard validates balance + period
  return v_entry;
end $$;

create or replace function reverse_journal_entry(p_entry uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e journal_entries; v_new uuid;
begin
  select * into e from journal_entries where id = p_entry;
  if e.id is null or e.status <> 'posted' then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'only posted entries can be reversed';
  end if;
  perform require_role(e.station_id, array['owner', 'accountant']::member_role[]);
  if coalesce(trim(p_reason), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REASON_REQUIRED';
  end if;
  insert into journal_entries (station_id, entry_date, description, source_table, source_id, reverses_entry_id, reason, created_by)
  values (e.station_id, current_date, 'عكس القيد ' || e.number || ': ' || e.description, e.source_table, e.source_id, e.id, p_reason, auth.uid())
  returning id into v_new;
  insert into journal_lines (station_id, entry_id, account_id, debit, credit, memo)
  select station_id, v_new, account_id, credit, debit, 'عكس: ' || coalesce(memo, '') from journal_lines where entry_id = e.id;
  update journal_entries set status = 'posted' where id = v_new;
  return v_new;
end $$;

-- ---------- stock & cost ----------
create or replace function tank_book_l(p_tank uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(liters), 0) from inventory_movements where tank_id = p_tank;
$$;

-- Simplified weighted average cost of deliveries with a known cost (NULL if none known).
create or replace function tank_avg_cost(p_tank uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select round(sum(liters * unit_cost + extra_costs) / nullif(sum(liters), 0), 4)
  from fuel_deliveries where tank_id = p_tank and unit_cost is not null;
$$;

create or replace function price_at(p_station uuid, p_product uuid, p_at timestamptz) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select price from prices where station_id = p_station and product_id = p_product and effective_at <= p_at
  order by effective_at desc limit 1;
$$;

create or replace function publish_price(p_station uuid, p_product uuid, p_price numeric,
                                         p_effective_at timestamptz default now()) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform require_role(p_station, array['owner']::member_role[]);
  insert into prices (station_id, product_id, price, effective_at, published_by)
  values (p_station, p_product, p_price, p_effective_at, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function record_fuel_delivery(p_station uuid, p_tank uuid, p_liters numeric, p_unit_cost numeric,
                                                p_extra_costs numeric default 0, p_supplier uuid default null,
                                                p_invoice_no text default null, p_attachment text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_value numeric;
begin
  perform require_role(p_station, array['owner', 'accountant', 'shift_manager']::member_role[]);
  insert into fuel_deliveries (station_id, supplier_id, tank_id, liters, unit_cost, extra_costs, supplier_invoice_no, attachment_path, created_by)
  values (p_station, p_supplier, p_tank, p_liters, p_unit_cost, coalesce(p_extra_costs, 0), p_invoice_no, p_attachment, auth.uid())
  returning id into v_id;
  insert into inventory_movements (station_id, tank_id, type, liters, ref_table, ref_id, created_by)
  values (p_station, p_tank, 'receipt', p_liters, 'fuel_deliveries', v_id, auth.uid());
  if p_unit_cost is not null then
    v_value := round(p_liters * p_unit_cost + coalesce(p_extra_costs, 0), 2);
    perform post_entry(p_station, current_date, 'توريد وقود ' || coalesce(p_invoice_no, ''), 'fuel_deliveries', v_id,
      jsonb_build_array(jsonb_build_object('code', '1200', 'debit', v_value),
                        jsonb_build_object('code', '2000', 'credit', v_value)));
  end if;
  return v_id;
end $$;

-- Physical dip measurement. Within tolerance: auto-adjust. Beyond: approval request (spec: "يطلب سبباً قبل الاعتماد").
create or replace function record_tank_measurement(p_tank uuid, p_measured_l numeric, p_photo text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t tanks; s stations; v_book numeric; v_diff numeric; v_meas uuid; v_req uuid;
begin
  select * into t from tanks where id = p_tank;
  select * into s from stations where id = t.station_id;
  perform require_role(t.station_id, array['owner', 'shift_manager']::member_role[]);
  v_book := tank_book_l(p_tank);
  v_diff := p_measured_l - v_book;
  insert into tank_measurements (station_id, tank_id, measured_l, book_l, measured_by, photo_path)
  values (t.station_id, p_tank, p_measured_l, v_book, auth.uid(), p_photo) returning id into v_meas;
  if v_diff = 0 then
    return jsonb_build_object('measurement_id', v_meas, 'diff_l', 0, 'needs_approval', false);
  end if;
  if abs(v_diff) <= s.stock_tolerance_l then
    perform apply_stock_adjustment(t.station_id, p_tank, v_diff, 'قياس فعلي ضمن حد التسامح', v_meas);
    return jsonb_build_object('measurement_id', v_meas, 'diff_l', v_diff, 'needs_approval', false);
  end if;
  insert into approval_requests (station_id, type, ref_table, ref_id, payload, requested_by)
  values (t.station_id, 'stock_adjustment', 'tank_measurements', v_meas,
          jsonb_build_object('tank_id', p_tank, 'book_l', v_book, 'measured_l', p_measured_l, 'diff_l', v_diff), auth.uid())
  returning id into v_req;
  return jsonb_build_object('measurement_id', v_meas, 'diff_l', v_diff, 'needs_approval', true, 'approval_id', v_req);
end $$;

create or replace function apply_stock_adjustment(p_station uuid, p_tank uuid, p_diff_l numeric, p_reason text, p_measurement uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cost numeric; v_value numeric;
begin
  insert into inventory_movements (station_id, tank_id, type, liters, ref_table, ref_id, reason, created_by)
  values (p_station, p_tank, 'adjustment', p_diff_l, 'tank_measurements', p_measurement, p_reason, auth.uid());
  v_cost := tank_avg_cost(p_tank);
  if v_cost is not null then
    v_value := round(abs(p_diff_l) * v_cost, 2);
    if p_diff_l < 0 then
      perform post_entry(p_station, current_date, 'تسوية مخزون (عجز)', 'tank_measurements', p_measurement,
        jsonb_build_array(jsonb_build_object('code', '5400', 'debit', v_value), jsonb_build_object('code', '1200', 'credit', v_value)));
    else
      perform post_entry(p_station, current_date, 'تسوية مخزون (زيادة)', 'tank_measurements', p_measurement,
        jsonb_build_array(jsonb_build_object('code', '1200', 'debit', v_value), jsonb_build_object('code', '5400', 'credit', v_value)));
    end if;
  end if;
end $$;

-- ---------- company credit ----------
create or replace function company_balance(p_company uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select sum(amount) from sales where company_account_id = p_company and status <> 'voided'), 0)
       - coalesce((select sum(amount) from company_payments where company_account_id = p_company), 0);
$$;

create or replace function company_remaining_credit(p_company uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select greatest(c.credit_limit - company_balance(c.id), 0) from company_accounts c where c.id = p_company;
$$;

-- What the attendant needs at the pump — and nothing more (no full statement, no other companies).
create or replace function lookup_company_for_sale(p_station uuid, p_query text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  perform require_role(p_station, array['owner', 'shift_manager', 'attendant']::member_role[]);
  select jsonb_build_object(
           'company_id', c.id, 'name', c.name, 'status', c.status,
           'remaining_credit', company_remaining_credit(c.id),
           'vehicle_id', v.id, 'vehicle_label', v.label, 'plate', v.plate)
    into r
    from company_accounts c
    left join vehicles v on v.company_account_id = c.id and v.plate = p_query and v.is_active
   where c.station_id = p_station and (c.qr_token = p_query or v.id is not null)
   limit 1;
  return r;
end $$;

-- ---------- shifts ----------
-- p_readings: [{"nozzle_id": "...", "opening_reading": 184220.5, "photo_path": "..."}]
create or replace function open_shift(p_shift_id uuid, p_pump uuid, p_opening_cash numeric, p_readings jsonb,
                                      p_device text default null, p_client_created_at timestamptz default now())
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_station uuid; v_existing shifts; r jsonb; n nozzles;
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
    insert into shifts (id, station_id, pump_id, attendant_id, opening_cash, device_id, client_created_at, opened_at)
    values (p_shift_id, v_station, p_pump, auth.uid(), coalesce(p_opening_cash, 0), p_device, p_client_created_at, p_client_created_at);
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'FUELOS_PUMP_BUSY', detail = 'another shift is open on this pump';
  end;

  for n in select * from nozzles where pump_id = p_pump and is_active loop
    select value into r from jsonb_array_elements(p_readings) where (value ->> 'nozzle_id')::uuid = n.id;
    if r is null then
      raise exception using errcode = 'P0001', message = 'FUELOS_READING_MISSING', detail = n.id::text;
    end if;
    if (r ->> 'opening_reading')::numeric < n.last_reading then
      raise exception using errcode = 'P0001', message = 'FUELOS_READING_BELOW_LAST',
        detail = format('nozzle %s: %s < last %s', n.label, r ->> 'opening_reading', n.last_reading);
    end if;
    insert into shift_readings (shift_id, nozzle_id, opening_reading, opening_photo_path)
    values (p_shift_id, n.id, (r ->> 'opening_reading')::numeric, r ->> 'photo_path');
  end loop;
  return p_shift_id;
end $$;

-- Meter-based totals. Assumes one price per product during a shift: a price change must close and reopen
-- the shift (documented in the accounting skill).
create or replace function shift_summary(p_shift uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  sh shifts; v_liters numeric := 0; v_sales numeric := 0; v_card numeric; v_credit numeric; v_voucher numeric;
  v_expected numeric; v_nozzles jsonb := '[]'::jsonb; r record;
begin
  select * into sh from shifts where id = p_shift;
  if sh.id is null then raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'shift'; end if;
  -- NULL-safe: an anonymous caller (auth.uid() is null) must fail, not slip through a NULL comparison
  if not (coalesce(sh.attendant_id = auth.uid(), false)
          or has_station_role(sh.station_id, array['owner', 'accountant', 'shift_manager']::member_role[])
          or has_access_grant(sh.station_id)) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;
  for r in
    select sr.nozzle_id, t.id as tank_id, t.product_id,
           coalesce(sr.closing_reading, sr.opening_reading) - sr.opening_reading as liters,
           price_at(sh.station_id, t.product_id, sh.opened_at) as price
      from shift_readings sr join nozzles nz on nz.id = sr.nozzle_id join tanks t on t.id = nz.tank_id
     where sr.shift_id = p_shift
  loop
    v_liters := v_liters + r.liters;
    v_sales  := v_sales + round(r.liters * coalesce(r.price, 0), 2);
    v_nozzles := v_nozzles || jsonb_build_object('nozzle_id', r.nozzle_id, 'tank_id', r.tank_id, 'liters', r.liters,
                                                 'price', r.price, 'amount', round(r.liters * coalesce(r.price, 0), 2));
  end loop;
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
    'nozzles', v_nozzles);
end $$;

-- p_closing: [{"nozzle_id": "...", "closing_reading": 191640.0, "photo_path": "..."}]
create or replace function submit_shift(p_shift uuid, p_closing jsonb, p_counted_cash numeric, p_diff_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sh shifts; st stations; r jsonb; v_sum jsonb; v_diff numeric;
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

  for r in select * from jsonb_array_elements(p_closing) loop
    update shift_readings
       set closing_reading = (r ->> 'closing_reading')::numeric, closing_photo_path = r ->> 'photo_path'
     where shift_id = p_shift and nozzle_id = (r ->> 'nozzle_id')::uuid;
  end loop;
  if exists (select 1 from shift_readings where shift_id = p_shift and closing_reading is null) then
    raise exception using errcode = 'P0001', message = 'FUELOS_READING_MISSING', detail = 'closing reading';
  end if;

  update shifts set counted_cash = p_counted_cash, closed_at = now() where id = p_shift;
  v_sum  := shift_summary(p_shift);
  v_diff := (v_sum ->> 'cash_diff')::numeric;
  if abs(v_diff) > st.cash_tolerance and coalesce(trim(p_diff_reason), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REASON_REQUIRED',
      detail = format('cash difference %s exceeds tolerance %s', v_diff, st.cash_tolerance);
  end if;

  update shifts set status = 'submitted', diff_reason = p_diff_reason where id = p_shift;
  -- the next shift on this pump must start at or above these closing readings
  -- (skipped when a later shift already exists, e.g. when a rejected shift is corrected afterwards)
  update nozzles nzl set last_reading = sr.closing_reading
    from shift_readings sr
   where sr.shift_id = p_shift and sr.nozzle_id = nzl.id
     and not exists (select 1 from shifts later where later.pump_id = sh.pump_id and later.opened_at > sh.opened_at);
  insert into approval_requests (station_id, type, ref_table, ref_id, payload, requested_by)
  values (sh.station_id, 'shift_close', 'shifts', p_shift, v_sum, auth.uid());
  return v_sum;
end $$;

-- ---------- sales ----------
create or replace function record_sale(p_sale_id uuid, p_shift uuid, p_nozzle uuid, p_liters numeric, p_unit_price numeric,
                                       p_method payment_method, p_customer uuid default null, p_company uuid default null,
                                       p_driver uuid default null, p_vehicle uuid default null, p_odometer int default null,
                                       p_request_approval boolean default false, p_device text default null,
                                       p_client_created_at timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sh shifts; v_amount numeric; v_status sale_status := 'recorded'; v_remaining numeric; c company_accounts;
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
    if v_existing.created_by is distinct from auth.uid() or v_existing.shift_id <> p_shift then
      raise exception using errcode = 'P0001', message = 'FUELOS_ID_CONFLICT';
    end if;
    return jsonb_build_object('sale_id', p_sale_id, 'replayed', true, 'amount', v_existing.amount, 'status', v_existing.status);
  end if;

  if sh.status not in ('open', 'reopened') then
    raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_NOT_OPEN';
  end if;
  -- the nozzle must be on this shift's pump; the price is the server price at shift open (one price per shift)
  select price_at(sh.station_id, t.product_id, sh.opened_at) into v_price
    from nozzles n join tanks t on t.id = n.tank_id
   where n.id = p_nozzle and n.pump_id = sh.pump_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'nozzle is not on this pump';
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

  insert into sales (id, station_id, shift_id, nozzle_id, liters, unit_price, amount, payment_method, customer_id,
                     company_account_id, driver_id, vehicle_id, odometer_km, status, created_by, device_id, client_created_at)
  values (p_sale_id, sh.station_id, p_shift, p_nozzle, p_liters, v_price, v_amount, p_method, p_customer,
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

-- ---------- approvals ----------
-- p_option for shift_close: 'shortage_to_expense' (default) | 'shortage_to_employee'
create or replace function decide_approval(p_request uuid, p_approve boolean, p_option text default null, p_note text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ar approval_requests; sh shifts; v_sum jsonb; v_diff numeric; v_cash_in numeric; nz jsonb; v_cost numeric;
  v_cogs numeric := 0; v_missing_cost boolean := false; m tank_measurements;
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

    perform post_entry(sh.station_id, current_date,
      'مبيعات مناوبة — المضخة ' || (select number from pumps where id = sh.pump_id), 'shifts', sh.id, jsonb_build_array(
      jsonb_build_object('code', '1000', 'debit', greatest(v_cash_in, 0)),
      jsonb_build_object('code', '1000', 'credit', greatest(-v_cash_in, 0)),
      jsonb_build_object('code', '1020', 'debit', (v_sum ->> 'card')::numeric),
      jsonb_build_object('code', '1100', 'debit', (v_sum ->> 'credit')::numeric),
      jsonb_build_object('code', '2100', 'debit', (v_sum ->> 'voucher')::numeric),
      jsonb_build_object('code', case when p_option = 'shortage_to_employee' then '1150' else '5300' end,
                         'debit', greatest(-v_diff, 0), 'memo', 'عجز صندوق'),
      jsonb_build_object('code', '4200', 'credit', greatest(v_diff, 0), 'memo', 'زيادة صندوق'),
      jsonb_build_object('code', '4000', 'credit', (v_sum ->> 'meter_sales')::numeric)));

    for nz in select * from jsonb_array_elements(v_sum -> 'nozzles') loop
      continue when (nz ->> 'liters')::numeric = 0;
      insert into inventory_movements (station_id, tank_id, type, liters, ref_table, ref_id, created_by)
      values (sh.station_id, (nz ->> 'tank_id')::uuid, 'sale', -(nz ->> 'liters')::numeric, 'shifts', sh.id, auth.uid());
      v_cost := tank_avg_cost((nz ->> 'tank_id')::uuid);
      if v_cost is null then v_missing_cost := true;
      else v_cogs := v_cogs + round((nz ->> 'liters')::numeric * v_cost, 2);
      end if;
      -- a delivery without a purchase price makes the cost (and profit) an estimate
      if exists (select 1 from fuel_deliveries d where d.tank_id = (nz ->> 'tank_id')::uuid and d.unit_cost is null) then
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

-- ---------- expenses & payments ----------
create or replace function post_expense(p_expense uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare ex expenses; v_code text; v_entry uuid;
begin
  select * into ex from expenses where id = p_expense for update;
  perform require_role(ex.station_id, array['owner', 'accountant']::member_role[]);
  if ex.status = 'posted' then raise exception using errcode = 'P0001', message = 'FUELOS_POSTED_IMMUTABLE'; end if;
  v_code := case ex.category when 'salaries' then '5100' when 'utilities' then '5200' when 'maintenance' then '5250'
                             when 'transport' then '5260' else '5900' end;
  v_entry := post_entry(ex.station_id, ex.expense_date, 'مصروف: ' || ex.description, 'expenses', ex.id,
    jsonb_build_array(jsonb_build_object('code', v_code, 'debit', ex.amount),
                      jsonb_build_object('code', case ex.paid_from when 'bank' then '1010' else '1000' end, 'credit', ex.amount)));
  update expenses set status = 'posted' where id = ex.id;
  return v_entry;
end $$;

create or replace function record_company_payment(p_company uuid, p_amount numeric, p_paid_to cash_source default 'cash', p_note text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare c company_accounts; v_id uuid;
begin
  select * into c from company_accounts where id = p_company;
  perform require_role(c.station_id, array['owner', 'accountant']::member_role[]);
  insert into company_payments (company_account_id, amount, paid_to, note, created_by)
  values (p_company, p_amount, p_paid_to, p_note, auth.uid()) returning id into v_id;
  perform post_entry(c.station_id, current_date, 'سداد من ' || c.name, 'company_payments', v_id,
    jsonb_build_array(jsonb_build_object('code', case p_paid_to when 'bank' then '1010' else '1000' end, 'debit', p_amount),
                      jsonb_build_object('code', '1100', 'credit', p_amount)));
  return v_id;
end $$;

create or replace function close_period(p_period uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare p accounting_periods;
begin
  select * into p from accounting_periods where id = p_period;
  perform require_role(p.station_id, array['owner']::member_role[]);
  update accounting_periods set status = 'closed', closed_by = auth.uid() where id = p_period;
end $$;

-- ---------- reopen a shift ----------
-- rejected -> reopened: the attendant fixes readings/cash and submits again.
-- approved -> reopened: its postings are reversed (reason required) and its stock movements are returned,
-- so re-approving does not double count. Invoices stay confirmed; loyalty is never granted twice.
create or replace function reopen_shift(p_shift uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sh shifts; e record; t record;
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

  begin
    update shifts set status = 'reopened', decision_note = p_reason, decided_by = auth.uid(), decided_at = now()
     where id = sh.id;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'FUELOS_PUMP_BUSY', detail = 'another shift is open on this pump';
  end;
end $$;
