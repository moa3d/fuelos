-- =====================================================================
-- FuelOS — station onboarding: default chart of accounts, products, first open period
-- Account codes are referenced by the posting RPCs (see .claude/skills/fuelos-accounting).
-- Do not renumber system accounts; add new ones with new codes.
-- =====================================================================

create or replace function create_station_defaults(p_station uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into accounts (station_id, code, name, type, is_system)
  select p_station, a.code, a.name, a.type::account_type, true
  from (values
    ('1000', 'الصندوق (نقد)',                'asset'),
    ('1010', 'البنك',                        'asset'),
    ('1020', 'مستحقات البطاقات',             'asset'),
    ('1100', 'ذمم الشركات (آجل)',            'asset'),
    ('1150', 'ذمم الموظفين (عجز صندوق)',     'asset'),
    ('1200', 'مخزون الوقود',                 'asset'),
    ('2000', 'ذمم الموردين',                 'liability'),
    ('2100', 'قسائم ورصيد مسبق للعملاء',     'liability'),
    ('2200', 'مصروفات مستحقة',               'liability'),
    ('3000', 'رأس المال',                    'equity'),
    ('3900', 'الأرباح المحتجزة',             'equity'),
    ('4000', 'مبيعات الوقود',                'revenue'),
    ('4200', 'زيادة الصندوق',                'revenue'),
    ('5000', 'تكلفة الوقود المباع',          'expense'),
    ('5100', 'الرواتب',                      'expense'),
    ('5200', 'الكهرباء والمياه',             'expense'),
    ('5250', 'الصيانة',                      'expense'),
    ('5260', 'النقل',                        'expense'),
    ('5300', 'عجز الصندوق',                  'expense'),
    ('5400', 'فروقات المخزون',               'expense'),
    ('5900', 'مصروفات أخرى',                 'expense')
  ) as a(code, name, type)
  on conflict (station_id, code) do nothing;

  insert into products (station_id, code, name)
  values (p_station, 'gasoline_90', 'بنزين 90'),
         (p_station, 'gasoline_95', 'بنزين 95'),
         (p_station, 'diesel',      'ديزل')
  on conflict (station_id, code) do nothing;

  insert into accounting_periods (station_id, starts_on, ends_on)
  values (p_station, date_trunc('month', current_date)::date,
          (date_trunc('month', current_date) + interval '1 month - 1 day')::date)
  on conflict (station_id, starts_on) do nothing;
end $$;

-- Onboarding RPC for the owner web app. The caller becomes the station's active owner.
-- p_org NULL = create a new organization named after the station.
create or replace function create_station(p_org uuid, p_name text, p_currency char(3) default 'SYP',
                                          p_city text default null, p_display_name text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid := p_org; v_station uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED', detail = 'sign in first';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REQUIRED', detail = 'name';
  end if;
  if v_org is null then
    insert into organizations (name) values (p_name) returning id into v_org;
  elsif not exists (select 1 from stations s where s.organization_id = v_org
                      and has_station_role(s.id, array['owner']::member_role[])) then
    -- only an owner of an existing station in this organization may add stations to it
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;

  insert into stations (organization_id, name, city, currency_code)
  values (v_org, p_name, p_city, upper(p_currency)) returning id into v_station;

  insert into station_members (station_id, user_id, role, status, display_name)
  values (v_station, auth.uid(), 'owner', 'active', coalesce(p_display_name, 'المالك'));

  perform create_station_defaults(v_station);
  return v_station;
end $$;

-- Next accounting period (monthly). Owners/accountants can also insert periods directly (RLS allows 'open' only).
create or replace function open_next_period(p_station uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_last date; v_id uuid;
begin
  perform require_role(p_station, array['owner', 'accountant']::member_role[]);
  select max(ends_on) into v_last from accounting_periods where station_id = p_station;
  insert into accounting_periods (station_id, starts_on, ends_on)
  values (p_station, coalesce(v_last + 1, date_trunc('month', current_date)::date),
          (date_trunc('month', coalesce(v_last + 1, current_date)) + interval '1 month - 1 day')::date)
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function create_station_defaults(uuid) from public, anon, authenticated;
revoke execute on function create_station(uuid, text, char, text, text) from public, anon;
revoke execute on function open_next_period(uuid) from public, anon;
grant execute on function create_station(uuid, text, char, text, text) to authenticated, service_role;
grant execute on function open_next_period(uuid) to authenticated, service_role;
grant execute on function create_station_defaults(uuid) to service_role;
