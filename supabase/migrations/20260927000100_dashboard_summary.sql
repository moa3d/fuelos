-- =====================================================================
-- FuelOS — owner dashboard O1 from one server call (brief 03a)
--   station_period_bounds(station, 'today'|'yesterday'|'week'|'month') → {from, to, timezone, period}
--     in the station's time zone (stations.timezone), not the browser's clock.
--     week = the last 7 local days including today; month = the 1st of this month until the end of today.
--   dashboard_summary(station, from, to) → totals of the shifts OPENED in [from, to):
--     meter_sales / liters / expected_cash = Σ shift_summary (same math, summed on the server),
--     shifts_total / shifts_closed, recorded_open_fills (+ _count) = fills on pumps still open,
--     daily[{day, product_id, liters, amount}] = closed pumps only, day = local day the pump leg started;
--     finance fields (owner / accountant only, null for a shift manager):
--       estimated_profit = revenue − expenses of posted entries dated in the range (local dates),
--       profit_complete = every shift in the range approved and no COGS entry flagged «(تكلفة غير مكتملة)»,
--       receivables = balance of account 1100 up to the end of the range,
--       overdue_companies = companies whose credit fills before their last billing day (on or before the end
--         of the range) are more than everything they have paid.
-- =====================================================================
create function station_period_bounds(p_station uuid, p_period text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tz text; v_today date; v_from date; v_to date;
begin
  if not is_station_member(p_station) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;
  select timezone into v_tz from stations where id = p_station;
  v_today := (now() at time zone v_tz)::date;
  case p_period
    when 'today'     then v_from := v_today;                                v_to := v_today + 1;
    when 'yesterday' then v_from := v_today - 1;                            v_to := v_today;
    when 'week'      then v_from := v_today - 6;                            v_to := v_today + 1;
    when 'month'     then v_from := date_trunc('month', v_today)::date;     v_to := v_today + 1;
    else raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'period: today | yesterday | week | month';
  end case;
  return jsonb_build_object('from', v_from::timestamp at time zone v_tz, 'to', v_to::timestamp at time zone v_tz,
                            'timezone', v_tz, 'period', p_period);
end $$;

create function dashboard_summary(p_station uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_finance boolean; v_tz text; s record; v_sum jsonb;
  v_sales numeric := 0; v_liters numeric := 0; v_expected numeric := 0; v_total int := 0; v_closed int := 0;
  v_open_fills numeric; v_open_count int; v_daily jsonb;
  v_profit numeric; v_complete boolean; v_receivables numeric; v_overdue int;
  v_from_day date; v_to_day date; v_end_day date;
begin
  perform require_role(p_station, array['owner', 'accountant', 'shift_manager']::member_role[]);
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'from must be before to';
  end if;
  v_finance := has_station_role(p_station, array['owner', 'accountant']::member_role[]);
  select timezone into v_tz from stations where id = p_station;
  v_from_day := (p_from at time zone v_tz)::date;
  v_to_day   := (p_to at time zone v_tz)::date;                 -- exclusive when p_to is a local midnight
  v_end_day  := ((p_to - interval '1 microsecond') at time zone v_tz)::date;   -- last local day inside the range

  -- the same math as shift_summary, summed
  for s in select id, status from shifts where station_id = p_station and opened_at >= p_from and opened_at < p_to loop
    v_sum := shift_summary(s.id);
    v_sales    := v_sales + (v_sum ->> 'meter_sales')::numeric;
    v_liters   := v_liters + (v_sum ->> 'liters')::numeric;
    v_expected := v_expected + (v_sum ->> 'expected_cash')::numeric;
    v_total    := v_total + 1;
    if s.status not in ('open', 'reopened') then v_closed := v_closed + 1; end if;
  end loop;

  select coalesce(sum(x.amount), 0), count(*) into v_open_fills, v_open_count
    from sales x join shift_legs l on l.id = x.leg_id join shifts sh on sh.id = x.shift_id
   where sh.station_id = p_station and sh.opened_at >= p_from and sh.opened_at < p_to
     and l.ended_at is null and x.status <> 'voided';

  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'product_id', d.product_id, 'liters', d.liters, 'amount', d.amount)
                            order by d.day, d.product_id), '[]'::jsonb)
    into v_daily
    from (select (l.started_at at time zone v_tz)::date as day, t.product_id,
                 sum(lr.closing_reading - lr.opening_reading) as liters,
                 sum(round((lr.closing_reading - lr.opening_reading)
                           * coalesce(price_at(sh.station_id, t.product_id, sh.opened_at), 0), 2)) as amount
            from shifts sh join shift_legs l on l.shift_id = sh.id join leg_readings lr on lr.leg_id = l.id
            join nozzles nz on nz.id = lr.nozzle_id join tanks t on t.id = nz.tank_id
           where sh.station_id = p_station and sh.opened_at >= p_from and sh.opened_at < p_to
             and l.ended_at is not null and lr.closing_reading is not null
           group by 1, 2) d;

  if v_finance then
    select coalesce(sum(case a.type when 'revenue' then l.credit - l.debit
                                    when 'expense' then l.credit - l.debit else 0 end), 0)
      into v_profit
      from journal_lines l join journal_entries e on e.id = l.entry_id join accounts a on a.id = l.account_id
     where e.station_id = p_station and e.status = 'posted'
       and e.entry_date >= v_from_day and e.entry_date <= v_end_day;

    v_complete := not exists (select 1 from shifts where station_id = p_station and opened_at >= p_from and opened_at < p_to
                                                   and status <> 'approved')
              and not exists (select 1 from journal_entries e
                               where e.station_id = p_station and e.status = 'posted'
                                 and e.entry_date >= v_from_day and e.entry_date <= v_end_day
                                 and e.description like '%(تكلفة غير مكتملة)%'
                                 and not exists (select 1 from journal_entries r where r.reverses_entry_id = e.id));

    select coalesce(sum(l.debit - l.credit), 0) into v_receivables
      from journal_lines l join journal_entries e on e.id = l.entry_id join accounts a on a.id = l.account_id
     where e.station_id = p_station and e.status = 'posted' and a.code = '1100' and e.entry_date <= v_end_day;

    select count(*) into v_overdue
      from company_accounts c
      cross join lateral (
        select case when make_date(extract(year from v_end_day)::int, extract(month from v_end_day)::int, c.billing_day) <= v_end_day
                    then make_date(extract(year from v_end_day)::int, extract(month from v_end_day)::int, c.billing_day)
                    else (make_date(extract(year from v_end_day)::int, extract(month from v_end_day)::int, c.billing_day)
                          - interval '1 month')::date end as bill_day) b
     where c.station_id = p_station
       and (select coalesce(sum(x.amount), 0) from sales x
             where x.company_account_id = c.id and x.status = 'recorded'
               and x.client_created_at < (b.bill_day::timestamp at time zone v_tz))
         > (select coalesce(sum(pm.amount), 0) from company_payments pm
             where pm.company_account_id = c.id and pm.received_at < p_to);
  end if;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'timezone', v_tz,
    'meter_sales', v_sales, 'liters', v_liters, 'expected_cash', v_expected,
    'shifts_total', v_total, 'shifts_closed', v_closed,
    'recorded_open_fills', v_open_fills, 'recorded_open_fills_count', v_open_count,
    'daily', v_daily,
    'estimated_profit', v_profit, 'profit_complete', v_complete,
    'receivables', v_receivables, 'overdue_companies', v_overdue);
end $$;

revoke execute on function station_period_bounds(uuid, text), dashboard_summary(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function station_period_bounds(uuid, text), dashboard_summary(uuid, timestamptz, timestamptz) to authenticated, service_role;
