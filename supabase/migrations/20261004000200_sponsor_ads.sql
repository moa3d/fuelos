-- =====================================================================
-- FuelOS — sponsor ads (الإعلانات): schema, image bucket, admin RPCs, public RPCs, stats
-- Sponsors pay the platform for ad space; the platform admin manages the ads from the admin app and the customer
-- app shows them to everyone (guests included). One ad = one image (jpg/png/webp/gif) + optional link + date window.
--   * tables ads / ad_events: RLS on, NO policies, all API privileges revoked -> reachable only through RPCs
--   * bucket ad-images: public read (they are adverts), 3 MB, four image MIME types; only platform admins write
--   * save_ad / archive_ad: platform ADMIN only, validated, audited (audit_log entity 'ads', station_id null)
--   * admin_ads: platform staff (admin + support), non-archived ads with computed status + total views/clicks
--   * active_ads / record_ad_event: public (anon + authenticated); record_ad_event stores one view / click per device per day
--   * ad_stats: platform staff (admin + support), per ad per day + totals with CTR
-- =====================================================================

-- ---------- 1. tables ----------
create table ads (
  id           uuid primary key default gen_random_uuid(),
  sponsor_name text not null check (char_length(sponsor_name) between 1 and 120),
  title        text not null check (char_length(title) between 1 and 120),
  image_path   text not null check (image_path ~ '^ads/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$'),
  link_url     text check (link_url ~ '^https://\S+$' or link_url ~ '^tel:\+?[0-9]{6,15}$'),
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,
  is_paused    boolean not null default false,
  sort_order   int not null default 0,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,
  check (ends_at is null or ends_at > starts_at)
);
create index on ads (sort_order, created_at desc) where archived_at is null;

-- one view and one click per device (random lower-case-UUID viewer_key kept by the customer app) per ad per day;
-- no user id, IP or user agent is stored
create table ad_events (
  ad_id      uuid not null references ads(id) on delete cascade,
  kind       text not null check (kind in ('view', 'click')),
  day        date not null,
  viewer_key text not null check (viewer_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  primary key (ad_id, kind, day, viewer_key)
);
create index on ad_events (day);  -- ad_stats scans a date range

alter table ads enable row level security;
alter table ad_events enable row level security;
revoke all on ads, ad_events from anon, authenticated;

-- ---------- 2. storage: public bucket, platform admins write ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('ad-images', 'ad-images', true, 3 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- public URLs need no policy; the select policy lets the admin app replace / delete (storage reads the row first)
-- every policy is confined to the ads/ folder of the bucket (the only place save_ad accepts image paths from)
create policy fuelos_ad_images_select on storage.objects for select to authenticated
  using (bucket_id = 'ad-images' and name like 'ads/%' and is_platform_admin());
create policy fuelos_ad_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ad-images' and name like 'ads/%' and is_platform_admin());
create policy fuelos_ad_images_update on storage.objects for update to authenticated
  using (bucket_id = 'ad-images' and name like 'ads/%' and is_platform_admin())
  with check (bucket_id = 'ad-images' and name like 'ads/%' and is_platform_admin());
create policy fuelos_ad_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ad-images' and name like 'ads/%' and is_platform_admin());

-- ---------- 3. save_ad: insert (p_id null) or update; platform admin only ----------
-- insert defaults: starts now, sort 0, not paused. update: null p_starts / p_sort / p_paused keep the stored values.
create or replace function save_ad(p_id uuid, p_sponsor text, p_title text, p_image_path text, p_link text,
                                   p_starts timestamptz, p_ends timestamptz, p_sort int, p_paused bool)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sponsor text := btrim(coalesce(p_sponsor, ''));
  v_title   text := btrim(coalesce(p_title, ''));
  v_image   text := btrim(coalesce(p_image_path, ''));
  v_link    text := nullif(btrim(coalesce(p_link, '')), '');
  v_starts  timestamptz := coalesce(p_starts, now());
  v_before  ads;
  v_row     ads;
begin
  if not coalesce(is_platform_admin(), false) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;

  if v_sponsor = '' or v_title = '' or v_image = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REQUIRED';
  end if;
  if char_length(v_sponsor) > 120 then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'sponsor_name';
  end if;
  if char_length(v_title) > 120 then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'title';
  end if;
  if v_image !~ '^ads/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$' then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'image_path';
  end if;
  if v_link is not null and not (v_link ~ '^https://\S+$' or v_link ~ '^tel:\+?[0-9]{6,15}$') then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'link';
  end if;
  -- on an update with a null p_starts the start is the stored one: that case is checked after the row is loaded
  if (p_id is null or p_starts is not null) and p_ends is not null and p_ends <= v_starts then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'dates';
  end if;

  if p_id is null then
    insert into ads (sponsor_name, title, image_path, link_url, starts_at, ends_at, sort_order, is_paused, created_by)
    values (v_sponsor, v_title, v_image, v_link, v_starts, p_ends, coalesce(p_sort, 0), coalesce(p_paused, false), auth.uid())
    returning * into v_row;
    insert into audit_log (actor_id, station_id, action, entity, entity_id, before, after)
    values (auth.uid(), null, 'insert', 'ads', v_row.id::text, null, to_jsonb(v_row));
  else
    select * into v_before from ads where id = p_id and archived_at is null for update;
    if v_before.id is null then
      raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND';
    end if;
    -- update: a null p_starts / p_sort / p_paused keeps the stored value; a null p_ends means open-ended
    v_starts := coalesce(p_starts, v_before.starts_at);
    if p_ends is not null and p_ends <= v_starts then
      raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'dates';
    end if;
    update ads
       set sponsor_name = v_sponsor, title = v_title, image_path = v_image, link_url = v_link,
           starts_at = v_starts, ends_at = p_ends, sort_order = coalesce(p_sort, v_before.sort_order),
           is_paused = coalesce(p_paused, v_before.is_paused), updated_at = clock_timestamp()
     where id = p_id
    returning * into v_row;
    insert into audit_log (actor_id, station_id, action, entity, entity_id, before, after)
    values (auth.uid(), null, 'update', 'ads', v_row.id::text, to_jsonb(v_before), to_jsonb(v_row));
  end if;

  return to_jsonb(v_row);
end $$;

revoke execute on function save_ad(uuid, text, text, text, text, timestamptz, timestamptz, int, bool) from public, anon, authenticated;
grant execute on function save_ad(uuid, text, text, text, text, timestamptz, timestamptz, int, bool) to authenticated, service_role;

-- ---------- 4. archive_ad: soft delete (the image file stays); platform admin only ----------
create or replace function archive_ad(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_before ads;
  v_row    ads;
begin
  if not coalesce(is_platform_admin(), false) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;

  select * into v_before from ads where id = p_id and archived_at is null for update;
  if v_before.id is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND';
  end if;

  update ads set archived_at = clock_timestamp(), updated_at = clock_timestamp()
   where id = p_id
  returning * into v_row;

  insert into audit_log (actor_id, station_id, action, entity, entity_id, before, after)
  values (auth.uid(), null, 'archive', 'ads', v_row.id::text, to_jsonb(v_before), to_jsonb(v_row));

  return jsonb_build_object('id', v_row.id, 'archived_at', v_row.archived_at);
end $$;

revoke execute on function archive_ad(uuid) from public, anon, authenticated;
grant execute on function archive_ad(uuid) to authenticated, service_role;

-- ---------- 5. admin_ads: every non-archived ad + computed status + total views / clicks; platform staff ----------
-- status: paused wins; then scheduled (not started), ended (window over), else running
create or replace function admin_ads()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_res jsonb;
begin
  if not coalesce(is_platform_staff(), false) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;

  select coalesce(jsonb_agg(
           to_jsonb(a) || jsonb_build_object(
             'status', case when a.is_paused then 'paused'
                            when a.starts_at > now() then 'scheduled'
                            when a.ends_at is not null and a.ends_at <= now() then 'ended'
                            else 'running' end,
             'views',  coalesce(e.views, 0),
             'clicks', coalesce(e.clicks, 0))
           order by a.sort_order, a.created_at desc, a.id), '[]'::jsonb)
    into v_res
    from ads a
    left join (select x.ad_id,
                      count(*) filter (where x.kind = 'view')  as views,
                      count(*) filter (where x.kind = 'click') as clicks
                 from ad_events x join ads xa on xa.id = x.ad_id and xa.archived_at is null
                group by x.ad_id) e on e.ad_id = a.id
   where a.archived_at is null;

  return v_res;
end $$;

revoke execute on function admin_ads() from public, anon, authenticated;
grant execute on function admin_ads() to authenticated, service_role;

-- ---------- 6. active_ads: the running ads, public (guests included) ----------
-- running = not archived, not paused, started, and not past ends_at; no created_by / audit fields are exposed
create or replace function active_ads()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'sponsor_name', a.sponsor_name, 'title', a.title, 'image_path', a.image_path,
             'link_url', a.link_url, 'sort_order', a.sort_order)
           order by a.sort_order, a.created_at desc, a.id)
      from ads a
     where a.archived_at is null and not a.is_paused
       and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())), '[]'::jsonb);
end $$;

revoke execute on function active_ads() from public, anon, authenticated;
grant execute on function active_ads() to anon, authenticated, service_role;

-- ---------- 7. record_ad_event: one view / click per device (viewer UUID) per ad per UTC day; public ----------
-- Anonymous write endpoint, so it is bounded:
--   * circuit breaker: once ad_events (with indexes) outgrows ad_events_budget_bytes() nothing more is recorded
--   * kind and viewer are validated first (malformed input never reaches the tables); the viewer is stored lower-cased
--   * only a running ad counts; a click counts only for an ad that has a link_url (an ad without a link is not clickable)
--   * a valid click also records the same viewer's missing same-day view, so clicks can never exceed views (CTR <= 100%)
-- recorded = whether THIS event's row was new; unknown / not running / unlinked ad, duplicate, or full table -> false
create or replace function ad_events_budget_bytes()
returns bigint
language sql immutable set search_path = public, pg_temp as $$ select 104857600::bigint $$;  -- 100 MB, the one place the ad_events size limit lives

revoke execute on function ad_events_budget_bytes() from public, anon, authenticated;

create or replace function record_ad_event(p_ad uuid, p_kind text, p_viewer text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rows   int;
  v_day    date := (now() at time zone 'UTC')::date;
  v_viewer text;
begin
  if p_kind is null or p_kind not in ('view', 'click') then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'kind';
  end if;
  if p_viewer is null or p_viewer !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'viewer';
  end if;
  if pg_total_relation_size('public.ad_events') > ad_events_budget_bytes() then
    return jsonb_build_object('recorded', false);
  end if;
  v_viewer := lower(p_viewer);

  if p_kind = 'click' then
    insert into ad_events (ad_id, kind, day, viewer_key)
    select a.id, 'view', v_day, v_viewer
      from ads a
     where a.id = p_ad and a.archived_at is null and not a.is_paused and a.link_url is not null
       and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
    on conflict do nothing;
  end if;

  insert into ad_events (ad_id, kind, day, viewer_key)
  select a.id, p_kind, v_day, v_viewer
    from ads a
   where a.id = p_ad and a.archived_at is null and not a.is_paused
     and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
     and (p_kind = 'view' or a.link_url is not null)
  on conflict do nothing;
  get diagnostics v_rows = row_count;

  return jsonb_build_object('recorded', v_rows > 0);
end $$;

revoke execute on function record_ad_event(uuid, text, text) from public, anon, authenticated;
grant execute on function record_ad_event(uuid, text, text) to anon, authenticated, service_role;

-- ---------- 8. ad_stats: per ad per day + totals (views, clicks, CTR %) over [p_from, p_to]; platform staff ----------
-- archived ads keep their history; the period must be finite, ordered and at most 400 days
create or replace function ad_stats(p_from date, p_to date)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rows   jsonb;
  v_totals jsonb;
begin
  if not coalesce(is_platform_staff(), false) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'period';
  end if;
  if p_from > p_to or p_to - p_from > 400 then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'period';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ad_id', d.ad_id, 'sponsor_name', d.sponsor_name, 'title', d.title, 'day', d.day,
           'views', d.views, 'clicks', d.clicks)
         order by d.day desc, d.sponsor_name, d.ad_id), '[]'::jsonb)
    into v_rows
    from (select e.ad_id, a.sponsor_name, a.title, e.day,
                 count(*) filter (where e.kind = 'view')  as views,
                 count(*) filter (where e.kind = 'click') as clicks
            from ad_events e join ads a on a.id = e.ad_id
           where e.day between p_from and p_to
           group by e.ad_id, a.sponsor_name, a.title, e.day) d;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ad_id', t.ad_id, 'sponsor_name', t.sponsor_name, 'title', t.title,
           'views', t.views, 'clicks', t.clicks,
           'ctr', case when t.views = 0 then 0 else round(t.clicks * 100.0 / t.views, 1) end)
         order by t.sponsor_name, t.title, t.ad_id), '[]'::jsonb)
    into v_totals
    from (select e.ad_id, a.sponsor_name, a.title,
                 count(*) filter (where e.kind = 'view')  as views,
                 count(*) filter (where e.kind = 'click') as clicks
            from ad_events e join ads a on a.id = e.ad_id
           where e.day between p_from and p_to
           group by e.ad_id, a.sponsor_name, a.title) t;

  return jsonb_build_object('rows', v_rows, 'totals', v_totals);
end $$;

revoke execute on function ad_stats(date, date) from public, anon, authenticated;
grant execute on function ad_stats(date, date) to authenticated, service_role;
