-- =====================================================================
-- FuelOS — company lookup for S8 «بيع آجل لشركة» / S9 «تجاوز الحد» (brief 02c)
-- Adds to the attendant's lookup result: credit_limit (for the remaining-limit bar), the company's
-- AUTHORIZED drivers (id + name only), and the vehicle's last recorded odometer.
-- The attendant still sees nothing else: no balance history, no other companies, no phone numbers.
-- =====================================================================
create or replace function lookup_company_for_sale(p_station uuid, p_query text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  perform require_role(p_station, array['owner', 'shift_manager', 'attendant']::member_role[]);
  select jsonb_build_object(
           'company_id', c.id, 'name', c.name, 'status', c.status,
           'credit_limit', c.credit_limit,
           'remaining_credit', company_remaining_credit(c.id),
           'vehicle_id', v.id, 'vehicle_label', v.label, 'plate', v.plate,
           'drivers', coalesce((select jsonb_agg(jsonb_build_object('driver_id', d.id, 'full_name', d.full_name)
                                                 order by d.full_name)
                                  from company_drivers d
                                 where d.company_account_id = c.id and d.is_authorized), '[]'::jsonb),
           'last_odometer', (select s.odometer_km from sales s
                              where v.id is not null and s.vehicle_id = v.id and s.odometer_km is not null
                                and s.status <> 'voided'
                              order by s.client_created_at desc limit 1))
    into r
    from company_accounts c
    left join vehicles v on v.company_account_id = c.id and v.plate = p_query and v.is_active
   where c.station_id = p_station and (c.qr_token = p_query or v.id is not null)
   limit 1;
  return r;
end $$;
