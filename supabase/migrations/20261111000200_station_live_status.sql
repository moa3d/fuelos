-- =====================================================================
-- FuelOS — station live status (spec docs/superpowers/specs/2026-11-11-station-live-status-design.md)
--   * crowd_level + station_live_status: one row per station, written only through set_station_status()
--   * set_station_status: owner / shift_manager / attendant of that station, audited
--   * public_stations: anon + authenticated read model for the customer directory, with the
--     freshness rules already applied — a stale value never leaves the database
-- Freshness (one definition, mirrored by packages/core for the staff apps):
--   crowd  lives 90 minutes · a manual open/closed press lives 12 hours
--   after that an open shift (newer than the station's max_shift_hours) still means "open"
-- =====================================================================

create type crowd_level as enum ('none', 'medium', 'high');

create table station_live_status (
  station_id   uuid primary key references stations(id) on delete cascade,
  is_open      boolean,                                   -- last manual press; null = never pressed
  open_set_at  timestamptz,
  crowd        crowd_level,
  crowd_set_at timestamptz,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint station_status_open_pair  check ((is_open is null) = (open_set_at is null)),
  constraint station_status_crowd_pair check ((crowd is null) = (crowd_set_at is null))
);
alter table station_live_status enable row level security;
-- explicit grants, not Supabase's defaults: read for signed-in users (RLS narrows it to their station),
-- and no insert / update / delete for anyone — set_station_status() is the only writer.
revoke all on station_live_status from anon, authenticated;
grant select on station_live_status to authenticated;
-- read: station members and platform staff. NO write policy: set_station_status() is the only writer.
create policy station_live_status_read on station_live_status for select to authenticated
  using (is_station_member(station_id) or is_platform_staff());

-- ---------- internal: the one row shape both RPCs return ----------
-- Not callable by the API roles; the SECURITY DEFINER functions below call it as the owner.
create or replace function station_live_row(p_station uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with s as (select * from stations where id = p_station),
  st as (select * from station_live_status where station_id = p_station),
  shift_open as (
    select exists (
      select 1 from shifts sh, s
      where sh.station_id = s.id and sh.status = 'open' and sh.closed_at is null
        and sh.opened_at > now() - make_interval(hours => s.max_shift_hours)) as yes),
  o as (
    select case
             when st.is_open is not null and st.open_set_at > now() - interval '12 hours' then st.is_open
             when shift_open.yes then true
             else null
           end as is_open,
           case
             when st.is_open is not null and st.open_set_at > now() - interval '12 hours' then 'manual'
             when shift_open.yes then 'shift'
             else null
           end as open_source,
           case when st.is_open is not null and st.open_set_at > now() - interval '12 hours'
                then st.open_set_at end as open_set_at,
           case when st.crowd_set_at > now() - interval '90 minutes' then st.crowd end as crowd,
           case when st.crowd_set_at > now() - interval '90 minutes' then st.crowd_set_at end as crowd_set_at
      from shift_open left join st on true)
  select jsonb_build_object(
           'station_id', s.id, 'name', s.name, 'city', s.city, 'address', s.address,
           'lat', s.lat, 'lng', s.lng,
           'is_open', o.is_open, 'open_source', o.open_source, 'open_set_at', o.open_set_at,
           'crowd', o.crowd, 'crowd_set_at', o.crowd_set_at,
           'products', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'product_id', p.id, 'name', p.name, 'price', cp.price,
                      'price_updated_at', cp.effective_at,
                      'availability', pa.status, 'availability_source', pa.source,
                      'availability_updated_at', pa.updated_at) order by p.name)
               from products p
               left join lateral (select pr.price, pr.effective_at from prices pr
                                   where pr.station_id = s.id and pr.product_id = p.id and pr.effective_at <= now()
                                   order by pr.effective_at desc limit 1) cp on true
               left join product_availability pa on pa.station_id = s.id and pa.product_id = p.id
              where p.station_id = s.id and p.is_active), '[]'::jsonb))
    from s, o;
$$;
revoke execute on function station_live_row(uuid) from public, anon, authenticated;

-- ---------- set_station_status ----------
-- p_open / p_crowd are independent: null means "leave this one alone". Both null is a bad request.
create or replace function set_station_status(p_station uuid, p_open boolean, p_crowd text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_crowd  crowd_level;
  v_now    timestamptz := now();
  v_before jsonb;
  v_after  station_live_status%rowtype;
begin
  perform require_role(p_station, array['owner', 'shift_manager', 'attendant']::member_role[]);
  if p_open is null and p_crowd is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'empty';
  end if;
  if p_crowd is not null then
    if p_crowd not in ('none', 'medium', 'high') then
      raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'crowd';
    end if;
    v_crowd := p_crowd::crowd_level;
  end if;

  select to_jsonb(s) into v_before from station_live_status s where s.station_id = p_station;

  insert into station_live_status as t (station_id, is_open, open_set_at, crowd, crowd_set_at, updated_by, updated_at)
  values (p_station,
          p_open,  case when p_open  is not null then v_now end,
          v_crowd, case when v_crowd is not null then v_now end,
          auth.uid(), v_now)
  on conflict (station_id) do update set
    is_open      = case when p_open  is not null then excluded.is_open      else t.is_open      end,
    open_set_at  = case when p_open  is not null then v_now                 else t.open_set_at  end,
    crowd        = case when v_crowd is not null then excluded.crowd        else t.crowd        end,
    crowd_set_at = case when v_crowd is not null then v_now                 else t.crowd_set_at end,
    updated_by   = auth.uid(),
    updated_at   = v_now
  returning * into v_after;

  insert into audit_log (actor_id, station_id, action, entity, entity_id, before, after)
  values (auth.uid(), p_station, case when v_before is null then 'insert' else 'update' end,
          'station_live_status', p_station::text, v_before, to_jsonb(v_after));

  return station_live_row(p_station);
end $$;
revoke execute on function set_station_status(uuid, boolean, text) from public, anon, authenticated;
grant execute on function set_station_status(uuid, boolean, text) to authenticated, service_role;

-- ---------- public_stations ----------
-- The customer directory in one call: every active station with its live status and its prices.
-- Nothing operational is exposed — no sales, no shifts, no staff names; open_source is one word.
create or replace function public_stations()
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(station_live_row(s.id) order by s.name), '[]'::jsonb)
    from stations s
   where s.status = 'active';
$$;
revoke execute on function public_stations() from public, anon, authenticated;
grant execute on function public_stations() to anon, authenticated, service_role;
