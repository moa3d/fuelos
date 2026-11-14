-- =====================================================================
-- FuelOS — ad_stats: mark the rows that belong to an archived ad
-- admin_ads() hides archived ads, but ad_stats() deliberately keeps their history. So a sponsor whose
-- old ad was archived and replaced by a new one with the same title shows two rows that look identical
-- in «إحصائيات الإعلانات». Add `archived` to every per-day row and every total so the admin app can
-- label the archived one.
-- Nothing else changes: same signature, same permission check, same roles and grants, same numbers.
-- =====================================================================
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
           'views', d.views, 'clicks', d.clicks, 'archived', d.archived)
         order by d.day desc, d.sponsor_name, d.ad_id), '[]'::jsonb)
    into v_rows
    from (select e.ad_id, a.sponsor_name, a.title, e.day, a.archived_at is not null as archived,
                 count(*) filter (where e.kind = 'view')  as views,
                 count(*) filter (where e.kind = 'click') as clicks
            from ad_events e join ads a on a.id = e.ad_id
           where e.day between p_from and p_to
           group by e.ad_id, a.sponsor_name, a.title, e.day, a.archived_at) d;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ad_id', t.ad_id, 'sponsor_name', t.sponsor_name, 'title', t.title,
           'views', t.views, 'clicks', t.clicks,
           'ctr', case when t.views = 0 then 0 else round(t.clicks * 100.0 / t.views, 1) end,
           'archived', t.archived)
         order by t.sponsor_name, t.title, t.ad_id), '[]'::jsonb)
    into v_totals
    from (select e.ad_id, a.sponsor_name, a.title, a.archived_at is not null as archived,
                 count(*) filter (where e.kind = 'view')  as views,
                 count(*) filter (where e.kind = 'click') as clicks
            from ad_events e join ads a on a.id = e.ad_id
           where e.day between p_from and p_to
           group by e.ad_id, a.sponsor_name, a.title, a.archived_at) t;

  return jsonb_build_object('rows', v_rows, 'totals', v_totals);
end $$;
