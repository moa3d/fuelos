-- =====================================================================
-- FuelOS — station equipment, file storage, customer card (briefs 06b, 06c, 06d)
--   1. setup_station_equipment(): tanks → pumps → nozzles (and extra products) in one all-or-nothing step.
--      The platform admin during onboarding (A2) or the station's owner later (the station grows).
--      station_readiness(): the A2 checklist counts (platform staff / owner).
--   2. Storage: private buckets 'meter-photos' (station members upload/read their own station's photos) and
--      'invoice-pdfs' (written only by the service role; read by the invoice's customer and finance roles).
--      Paths start with the station id: {station_id}/…
--   3. Customer card: customers.qr_token (shown as a QR + text in the customer app) and
--      lookup_customer_for_sale() — the attendant identifies a walk-in customer by card or phone, least-privilege.
-- =====================================================================

-- ---------- 1. station equipment ----------
-- p_equipment:
-- { "products": [ { "code": "lpg", "name": "غاز" } ],                              -- optional: products not yet in the catalog
--   "tanks":    [ { "key": "T1", "product_code": "gasoline_95", "name": "خزان 95", "capacity_l": 20000, "min_level_pct": 20 } ],
--   "pumps":    [ { "number": 1, "name": "مضخة 1",
--                   "nozzles": [ { "label": "1", "tank_key": "T1", "last_reading": 184220.5 } ] } ] }
-- A nozzle names a tank of this call ("tank_key") or an existing tank of the station ("tank_id").
-- last_reading = the meter as it reads today (the first shift's opening reading is checked against it).
-- Additive only: nothing existing is changed or removed.
create function setup_station_equipment(p_station uuid, p_equipment jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tanks jsonb := '{}'::jsonb;              -- key → tank id
  r jsonb; n jsonb; v_product uuid; v_tank uuid; v_pump uuid; v_nozzle uuid;
  c_products int := 0; c_tanks int := 0; c_pumps int := 0; c_nozzles int := 0;
begin
  if not exists (select 1 from stations where id = p_station) then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'station';
  end if;
  if not (is_platform_admin() or is_owner(p_station)) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;
  if p_equipment is null or jsonb_typeof(p_equipment) <> 'object' then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'equipment';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_equipment -> 'products', '[]')) loop
    if coalesce(r ->> 'code', '') !~ '^[a-z0-9_]{2,30}$' or coalesce(trim(r ->> 'name'), '') = '' then
      raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'product';
    end if;
    insert into products (station_id, code, name) values (p_station, r ->> 'code', trim(r ->> 'name'))
    on conflict (station_id, code) do nothing;
    if found then c_products := c_products + 1; end if;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_equipment -> 'tanks', '[]')) loop
    select id into v_product from products where station_id = p_station and code = r ->> 'product_code';
    if v_product is null then
      raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = format('tank %s: unknown product', r ->> 'key');
    end if;
    if coalesce(r ->> 'key', '') = '' or v_tanks ? (r ->> 'key') or coalesce(trim(r ->> 'name'), '') = ''
       or coalesce((r ->> 'capacity_l')::numeric, 0) <= 0 then
      raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = format('tank %s', coalesce(r ->> 'key', '?'));
    end if;
    insert into tanks (station_id, product_id, name, capacity_l, min_level_pct)
    values (p_station, v_product, trim(r ->> 'name'), (r ->> 'capacity_l')::numeric, coalesce((r ->> 'min_level_pct')::numeric, 20))
    returning id into v_tank;
    v_tanks := v_tanks || jsonb_build_object(r ->> 'key', v_tank);
    c_tanks := c_tanks + 1;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_equipment -> 'pumps', '[]')) loop
    if coalesce((r ->> 'number')::int, 0) <= 0 or jsonb_array_length(coalesce(r -> 'nozzles', '[]')) = 0 then
      raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = format('pump %s', coalesce(r ->> 'number', '?'));
    end if;
    if exists (select 1 from pumps where station_id = p_station and number = (r ->> 'number')::int) then
      raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = format('pump %s already exists', r ->> 'number');
    end if;
    insert into pumps (station_id, number, name) values (p_station, (r ->> 'number')::int, nullif(trim(r ->> 'name'), ''))
    returning id into v_pump;
    c_pumps := c_pumps + 1;

    for n in select * from jsonb_array_elements(r -> 'nozzles') loop
      v_tank := case when n ? 'tank_key' then (v_tanks ->> (n ->> 'tank_key'))::uuid
                     else (select id from tanks where id = (n ->> 'tank_id')::uuid and station_id = p_station) end;
      if v_tank is null or coalesce((n ->> 'last_reading')::numeric, 0) < 0 then
        raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = format('pump %s: nozzle tank/reading', r ->> 'number');
      end if;
      insert into nozzles (station_id, pump_id, tank_id, label, last_reading)
      values (p_station, v_pump, v_tank, coalesce(nullif(trim(n ->> 'label'), ''), '1'), coalesce((n ->> 'last_reading')::numeric, 0))
      returning id into v_nozzle;
      c_nozzles := c_nozzles + 1;
    end loop;
  end loop;

  insert into audit_log (actor_id, station_id, action, entity, entity_id, after)
  values (auth.uid(), p_station, 'setup_equipment', 'stations', p_station::text,
          jsonb_build_object('products', c_products, 'tanks', c_tanks, 'pumps', c_pumps, 'nozzles', c_nozzles));
  return jsonb_build_object('products', c_products, 'tanks', c_tanks, 'pumps', c_pumps, 'nozzles', c_nozzles);
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'equipment values';
end $$;

-- Onboarding readiness (A2 «جاهزية أول يوم تشغيل»): counts only — the platform cannot read a station's tables.
create function station_readiness(p_station uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare st stations; v_owner uuid;
begin
  select * into st from stations where id = p_station;
  if st.id is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'station';
  end if;
  if not (is_platform_staff() or is_owner(p_station)) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;
  select user_id into v_owner from station_members where station_id = p_station and role = 'owner' order by created_at limit 1;
  return jsonb_build_object(
    'station_status',      st.status,
    'products',            (select count(*) from products where station_id = p_station and is_active),
    'tanks',               (select count(*) from tanks where station_id = p_station and is_active),
    'pumps',               (select count(*) from pumps where station_id = p_station and is_active),
    'nozzles',             (select count(*) from nozzles where station_id = p_station and is_active),
    'prices_set',          (select count(distinct product_id) from prices where station_id = p_station),
    'owner_signed_in',     coalesce((select last_sign_in_at is not null from auth.users where id = v_owner), false),
    'attendants',          (select count(*) from station_members where station_id = p_station and role = 'attendant' and status = 'active'),
    'attendants_with_pin', (select count(*) from station_members m join member_pins p on p.station_id = m.station_id and p.user_id = m.user_id
                             where m.station_id = p_station and m.role = 'attendant' and m.status = 'active'),
    'devices',             (select count(*) from devices where station_id = p_station),
    'subscription',        (select status from subscriptions where organization_id = st.organization_id order by created_at desc limit 1),
    'first_shift_at',      (select min(opened_at) from shifts where station_id = p_station));
end $$;

-- ---------- 2. storage ----------
-- NULL instead of an error for a path segment that is not a uuid (storage policies must never throw)
create function try_uuid(p text) returns uuid
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('meter-photos', 'meter-photos', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']),
  ('invoice-pdfs', 'invoice-pdfs', false, 10 * 1024 * 1024, array['application/pdf'])
on conflict (id) do nothing;

-- meter / tank photos: {station_id}/{shift|leg|tank id}/{file}. Evidence: no update, no delete.
create policy fuelos_meter_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'meter-photos' and is_station_member(try_uuid((storage.foldername(name))[1])));
create policy fuelos_meter_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'meter-photos'
         and (is_station_member(try_uuid((storage.foldername(name))[1])) or has_access_grant(try_uuid((storage.foldername(name))[1]))));

-- invoice PDFs: {station_id}/{invoice_id}.pdf — written only by the service role (no insert policy).
create policy fuelos_invoice_pdfs_read on storage.objects for select to authenticated
  using (bucket_id = 'invoice-pdfs'
         and (is_finance(try_uuid((storage.foldername(name))[1]))
              or exists (select 1 from invoices i
                          where i.id = try_uuid(split_part(storage.filename(name), '.', 1))
                            and i.station_id = try_uuid((storage.foldername(name))[1])
                            and i.customer_id = (select auth.uid()))));

-- ---------- 3. customer card ----------
-- 12 random hex characters, unique; every existing customer gets his own on this migration.
alter table customers
  add column qr_token text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

-- The attendant identifies a walk-in customer (optional: a cash sale without a customer stays valid).
-- p_query: the card token (QR or typed) or a phone number (the last 9 digits must match).
-- Returns NULL when nothing — or more than one customer — matches; never the full profile.
create function lookup_customer_for_sale(p_station uuid, p_query text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  q text := upper(regexp_replace(coalesce(p_query, ''), '\s', '', 'g'));
  digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  ids uuid[]; v_by text := 'card'; c customers;
begin
  perform require_role(p_station, array['owner', 'shift_manager', 'attendant']::member_role[]);
  if length(q) < 6 then return null; end if;

  select array_agg(id) into ids from customers where qr_token = q;
  if ids is null and length(digits) >= 9 then
    v_by := 'phone';
    select array_agg(id) into ids from (
      select id from customers where right(regexp_replace(phone, '\D', '', 'g'), 9) = right(digits, 9) limit 2) x;
  end if;
  if ids is null or array_length(ids, 1) <> 1 then return null; end if;

  select * into c from customers where id = ids[1];
  return jsonb_build_object(
    'customer_id', c.id,
    'display_name', coalesce(nullif(split_part(trim(c.full_name), ' ', 1), ''), 'زبون'),
    'matched_by', v_by,
    'points', coalesce((select sum(points) from loyalty_ledger where customer_id = c.id and station_id = p_station), 0));
end $$;

-- ---------- grants ----------
revoke execute on function setup_station_equipment(uuid, jsonb), station_readiness(uuid), lookup_customer_for_sale(uuid, text) from public, anon;
grant execute on function setup_station_equipment(uuid, jsonb), station_readiness(uuid), lookup_customer_for_sale(uuid, text) to authenticated, service_role;
revoke execute on function try_uuid(text) from public, anon;
grant execute on function try_uuid(text) to authenticated, service_role;
