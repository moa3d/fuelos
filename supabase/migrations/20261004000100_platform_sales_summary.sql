-- =====================================================================
-- FuelOS — brief 08a: platform-wide sales summary for the admin app (A5 «مبيعات المحطات»)
-- Platform staff cannot read a station's shifts/sales (RLS keeps financials to station members or a live
-- access grant). This RPC gives them AGGREGATED NUMBERS ONLY, per station, for a date range:
--   * approved shifts only, anchored on the shift's closed_at date in the STATION's own timezone
--   * amounts follow the posting rules: sales_amount = meter sales (liters x price in force at shift open);
--     card/credit/voucher come from recorded, non-voided fills; cash = sales - card - credit - voucher
--   * no invoice, customer, attendant or per-sale detail
--   * every station gets a row (zeros when idle) + one totals row
--   * each call is written to audit_log
-- =====================================================================

create or replace function platform_sales_summary(p_from date, p_to date)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rows jsonb; v_totals jsonb;
begin
  if not coalesce(is_platform_staff(), false) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 400 then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'period';
  end if;

  with sh as (
    select s.id as shift_id, s.station_id, s.closed_at, s.opened_at
      from shifts s join stations st on st.id = s.station_id
     where s.status = 'approved' and s.closed_at is not null
       and (s.closed_at at time zone st.timezone)::date between p_from and p_to),
  meter as (
    select sh.shift_id, sh.station_id,
           sum(coalesce(lr.closing_reading, lr.opening_reading) - lr.opening_reading) as liters,
           sum(round((coalesce(lr.closing_reading, lr.opening_reading) - lr.opening_reading)
                     * coalesce(price_at(sh.station_id, t.product_id, sh.opened_at), 0), 2)) as amount
      from sh join shift_legs l on l.shift_id = sh.shift_id
      join leg_readings lr on lr.leg_id = l.id
      join nozzles nz on nz.id = lr.nozzle_id join tanks t on t.id = nz.tank_id
     group by sh.shift_id, sh.station_id),
  fills as (
    select sa.shift_id,
           coalesce(sum(sa.amount) filter (where sa.payment_method = 'card'), 0) as card,
           coalesce(sum(sa.amount) filter (where sa.payment_method = 'credit'), 0) as credit,
           coalesce(sum(sa.amount) filter (where sa.payment_method = 'voucher'), 0) as voucher
      from sales sa where sa.shift_id in (select shift_id from sh) and sa.status <> 'voided'
     group by sa.shift_id),
  per_shift as (
    select sh.station_id, sh.closed_at, coalesce(m.liters, 0) as liters, coalesce(m.amount, 0) as amount,
           coalesce(f.card, 0) as card, coalesce(f.credit, 0) as credit, coalesce(f.voucher, 0) as voucher
      from sh left join meter m on m.shift_id = sh.shift_id left join fills f on f.shift_id = sh.shift_id),
  agg as (
    select station_id, count(*) as shifts, sum(liters) as liters, sum(amount) as amount,
           sum(card) as card, sum(credit) as credit, sum(voucher) as voucher, max(closed_at) as last_at
      from per_shift group by station_id),
  sub as (
    select distinct on (organization_id) organization_id, plan_id, status
      from subscriptions order by organization_id, created_at desc, id),
  dev as (
    select station_id, count(*) as n, max(last_sync_at) as last_sync from devices group by station_id)
  , final as (
  select st.id as station_id, st.name as station_name, o.name as organization_name, st.city,
         st.status::text as station_status, p.name as plan_name, sub.status::text as subscription_status,
         coalesce(a.shifts, 0)::int as approved_shifts,
         coalesce(a.liters, 0) as liters, coalesce(a.amount, 0) as sales_amount,
         coalesce(a.amount, 0) - coalesce(a.card, 0) - coalesce(a.credit, 0) - coalesce(a.voucher, 0) as cash_amount,
         coalesce(a.card, 0) as card_amount, coalesce(a.credit, 0) as credit_amount, coalesce(a.voucher, 0) as voucher_amount,
         a.last_at as last_approved_shift_at, d.last_sync as last_device_sync_at, coalesce(d.n, 0)::int as device_count
    from stations st join organizations o on o.id = st.organization_id
    left join agg a on a.station_id = st.id
    left join sub on sub.organization_id = st.organization_id
    left join plans p on p.id = sub.plan_id
    left join dev d on d.station_id = st.id)
  select coalesce(jsonb_agg(to_jsonb(r) order by r.sales_amount desc, r.station_name, r.station_id), '[]'::jsonb),
         jsonb_build_object(
           'approved_shifts', coalesce(sum(r.approved_shifts), 0), 'liters', coalesce(sum(r.liters), 0),
           'sales_amount', coalesce(sum(r.sales_amount), 0), 'cash_amount', coalesce(sum(r.cash_amount), 0),
           'card_amount', coalesce(sum(r.card_amount), 0), 'credit_amount', coalesce(sum(r.credit_amount), 0),
           'voucher_amount', coalesce(sum(r.voucher_amount), 0))
    into v_rows, v_totals
    from final r;

  insert into audit_log (actor_id, station_id, action, entity, entity_id, after)
  values (auth.uid(), null, 'platform_read', 'platform_sales_summary', null,
          jsonb_build_object('from', p_from, 'to', p_to, 'stations', jsonb_array_length(v_rows)));

  return jsonb_build_object('rows', v_rows, 'totals', v_totals);
end $$;

revoke execute on function platform_sales_summary(date, date) from public, anon, authenticated;
grant execute on function platform_sales_summary(date, date) to authenticated, service_role;
