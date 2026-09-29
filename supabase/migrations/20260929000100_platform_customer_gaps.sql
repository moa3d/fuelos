-- =====================================================================
-- FuelOS — gaps from the customer and platform-admin apps (briefs 04e, 04f, 04g, 05a, 05b, A2)
--   1. sales.product_name   — the fuel's name frozen on the sale (a receipt line), so a customer's invoice
--                             can show it without reading the station's catalog.
--   2. vehicles             — monthly budget + oil-service reminder fields, set by the customer.
--   3. rewards              — offers.code; per-station point value (loyalty_programs) and reward tiers.
--   4. stations.lat/lng     — map pins; also on the public price board.
--   5. platform             — platform staff read devices (last sync); monthly MRR snapshots (pg_cron);
--                             subscription_payments + record_subscription_payment().
--   6. onboarding (A2)      — admin_create_station(): the platform admin creates an organization + station for
--                             a client; the owner account comes from the onboard-station Edge Function.
-- =====================================================================

-- ---------- 1. the fuel's name on each sale ----------
alter table sales add column product_name text;

create function fn_sale_product_name() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.product_name is null then
    select p.name into new.product_name
      from nozzles n join tanks t on t.id = n.tank_id join products p on p.id = t.product_id
     where n.id = new.nozzle_id;
  end if;
  return new;
end $$;
create trigger sales_product_name before insert on sales
for each row execute function fn_sale_product_name();

-- backfill (a data fix, not a business change: no audit row per sale)
alter table sales disable trigger sales_audit;
update sales s set product_name = p.name
  from nozzles n join tanks t on t.id = n.tank_id join products p on p.id = t.product_id
 where n.id = s.nozzle_id and s.product_name is null;
alter table sales enable trigger sales_audit;

-- ---------- 2. vehicle budget and service reminder (vehicles_customer RLS already covers the owner's updates) ----------
alter table vehicles
  add column monthly_budget          numeric(16,2) check (monthly_budget >= 0),
  add column last_service_odometer_km int          check (last_service_odometer_km >= 0),
  add column service_interval_km     int           check (service_interval_km > 0);

-- ---------- 3. rewards ----------
alter table offers add column code text check (code ~ '^[A-Z0-9-]{3,20}$');
create unique index offers_station_code on offers (station_id, code) where code is not null;

-- what one point is worth at a station (points are earned per station: loyalty_ledger.station_id)
create table loyalty_programs (
  station_id   uuid primary key references stations(id) on delete cascade,
  point_value  numeric(16,4) not null check (point_value > 0),
  updated_at   timestamptz not null default now()
);
-- what a customer can get for his points at a station
create table reward_tiers (
  id                uuid primary key default gen_random_uuid(),
  station_id        uuid not null references stations(id) on delete cascade,
  points_threshold  int  not null check (points_threshold > 0),
  title             text not null check (length(trim(title)) between 1 and 80),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);
create index on reward_tiers (station_id, points_threshold);

alter table loyalty_programs enable row level security;
alter table reward_tiers enable row level security;
-- public marketing information, like offers: anyone may read; only the station's owner writes
create policy loyalty_programs_read on loyalty_programs for select to anon, authenticated using (true);
create policy loyalty_programs_owner on loyalty_programs for all to authenticated
  using (is_owner(station_id)) with check (is_owner(station_id));
create policy reward_tiers_read on reward_tiers for select to anon, authenticated using (is_active);
-- (the owner also sees his inactive tiers through reward_tiers_owner)
create policy reward_tiers_owner on reward_tiers for all to authenticated
  using (is_owner(station_id)) with check (is_owner(station_id));
revoke all on loyalty_programs, reward_tiers from anon;
grant select on loyalty_programs, reward_tiers to anon;
grant select, insert, update, delete on loyalty_programs, reward_tiers to authenticated, service_role;

-- ---------- 4. station location ----------
alter table stations
  add column lat numeric(9,6) check (lat between -90 and 90),
  add column lng numeric(9,6) check (lng between -180 and 180),
  add constraint stations_lat_lng_together check ((lat is null) = (lng is null));

-- Public price board: + lat/lng (a station's location is public). Reviewed: still public columns of ACTIVE stations only.
create or replace view public_station_prices as
select s.id as station_id, s.name as station_name, s.city, s.currency_code,
       p.id as product_id, p.name as product_name,
       cp.price, cp.effective_at as price_updated_at,
       pa.status as availability, pa.source as availability_source, pa.updated_at as availability_updated_at,
       s.lat, s.lng
from stations s
join products p on p.station_id = s.id and p.is_active
left join lateral (
  select price, effective_at from prices pr
  where pr.station_id = s.id and pr.product_id = p.id and pr.effective_at <= now()
  order by pr.effective_at desc limit 1
) cp on true
left join product_availability pa on pa.station_id = s.id and pa.product_id = p.id
where s.status = 'active';
comment on view public_station_prices is
  'Public price board for guests and customers. Owner-rights on purpose; public columns (incl. location) of active stations only.';

-- ---------- 5a. platform staff see device sync health (devices.last_sync_at / pending_ops) ----------
create policy devices_platform_read on devices for select to authenticated using (is_platform_staff());

-- ---------- 5b. monthly MRR snapshots ----------
create function is_platform_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from platform_staff where user_id = auth.uid() and role = 'platform_admin');
$$;

create table mrr_snapshots (
  month            date not null check (month = date_trunc('month', month)::date),
  organization_id  uuid not null references organizations(id),
  plan_id          uuid not null references plans(id),
  stations         int  not null check (stations >= 0),
  amount           numeric(16,2) not null check (amount >= 0),
  taken_at         timestamptz not null default now(),
  primary key (month, organization_id)
);
alter table mrr_snapshots enable row level security;
create policy mrr_snapshots_read on mrr_snapshots for select to authenticated using (is_platform_staff());
grant select on mrr_snapshots to authenticated;

-- Recurring revenue of each organization with an ACTIVE subscription at the moment of the snapshot:
-- the plan's monthly price, × the organization's station count for per-station plans. Re-running a month replaces it.
create function snapshot_mrr(p_month date default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_month date := date_trunc('month', coalesce(p_month, current_date))::date; n int;
begin
  insert into mrr_snapshots (month, organization_id, plan_id, stations, amount)
  select v_month, sub.organization_id, sub.plan_id, st.n,
         case when pl.per_station then pl.monthly_price * st.n else pl.monthly_price end
    from subscriptions sub
    join plans pl on pl.id = sub.plan_id
    cross join lateral (select count(*)::int as n from stations s where s.organization_id = sub.organization_id) st
   where sub.status = 'active'
  on conflict (month, organization_id) do update
    set plan_id = excluded.plan_id, stations = excluded.stations, amount = excluded.amount, taken_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- 5c. subscription payments (append-only ledger) ----------
create table subscription_payments (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references subscriptions(id),
  amount           numeric(16,2) not null check (amount > 0),
  method           text not null check (method in ('cash', 'transfer', 'card', 'other')),
  renews_at        date not null,                    -- the subscription's paid-until date after this payment
  note             text,
  recorded_by      uuid not null references auth.users(id),
  created_at       timestamptz not null default now()
);
create index on subscription_payments (subscription_id, created_at desc);
alter table subscription_payments enable row level security;
create policy subscription_payments_read on subscription_payments for select to authenticated
  using (is_platform_staff() or exists (select 1 from subscriptions sub join stations s on s.organization_id = sub.organization_id
                                        where sub.id = subscription_id and is_owner(s.id)));
grant select on subscription_payments to authenticated;   -- written only through record_subscription_payment()

create function fn_subscription_payments_append_only() returns trigger
language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = 'FUELOS_APPEND_ONLY', detail = 'record a new payment instead';
end $$;
create trigger subscription_payments_guard before update or delete on subscription_payments
for each row execute function fn_subscription_payments_append_only();

-- «تسجيل دفعة يدوية»: the payment row + the subscription becomes active until p_renews_at (default: one month after
-- the later of today and the current paid-until date). Platform admins only.
create function record_subscription_payment(p_subscription uuid, p_amount numeric, p_method text,
                                            p_note text default null, p_renews_at date default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare sub subscriptions; v_until date; v_id uuid;
begin
  if not is_platform_admin() then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;
  select * into sub from subscriptions where id = p_subscription for update;
  if sub.id is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'subscription';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'amount';
  end if;
  if p_method is null or p_method not in ('cash', 'transfer', 'card', 'other') then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'method';
  end if;
  v_until := coalesce(p_renews_at, (greatest(coalesce(sub.renews_at, current_date), current_date) + interval '1 month')::date);
  if v_until <= current_date then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'renews_at must be in the future';
  end if;

  insert into subscription_payments (subscription_id, amount, method, renews_at, note, recorded_by)
  values (p_subscription, p_amount, p_method, v_until, nullif(trim(p_note), ''), auth.uid()) returning id into v_id;
  update subscriptions set status = 'active', renews_at = v_until where id = p_subscription;
  insert into audit_log (actor_id, action, entity, entity_id, before, after, reason)
  values (auth.uid(), 'record_subscription_payment', 'subscriptions', p_subscription::text,
          jsonb_build_object('status', sub.status, 'renews_at', sub.renews_at),
          jsonb_build_object('status', 'active', 'renews_at', v_until, 'payment_id', v_id, 'amount', p_amount, 'method', p_method),
          nullif(trim(p_note), ''));
  return v_id;
end $$;

-- ---------- 6. onboarding a client's station (A2) ----------
-- Called by the onboard-station Edge Function (service role) after it checked the caller is a platform admin
-- and created/found the owner's account. New organization + station + active owner + catalog defaults,
-- and a trial subscription when a plan is given.
create function admin_create_station(p_actor uuid, p_owner uuid, p_owner_name text, p_station_name text,
                                     p_org_name text default null, p_currency char(3) default 'SYP',
                                     p_city text default null, p_plan uuid default null, p_trial_days int default 14,
                                     p_lat numeric default null, p_lng numeric default null)
returns table (organization_id uuid, station_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_station uuid;
begin
  if not exists (select 1 from platform_staff where user_id = p_actor and role = 'platform_admin') then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;
  if coalesce(trim(p_station_name), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REQUIRED', detail = 'station_name';
  end if;
  if coalesce(trim(p_owner_name), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REQUIRED', detail = 'owner_name';
  end if;
  if not exists (select 1 from auth.users where id = p_owner) then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'owner';
  end if;
  if p_plan is not null and not exists (select 1 from plans where id = p_plan) then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'plan';
  end if;
  if p_trial_days is null or p_trial_days not between 0 and 90 then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'trial_days';
  end if;

  insert into organizations (name) values (coalesce(nullif(trim(p_org_name), ''), trim(p_station_name))) returning id into v_org;
  insert into stations (organization_id, name, city, currency_code, lat, lng)
  values (v_org, trim(p_station_name), nullif(trim(p_city), ''), upper(p_currency), p_lat, p_lng) returning id into v_station;
  insert into station_members (station_id, user_id, role, status, display_name)
  values (v_station, p_owner, 'owner', 'active', trim(p_owner_name));
  perform create_station_defaults(v_station);
  if p_plan is not null then
    insert into subscriptions (organization_id, plan_id, status, trial_ends_at)
    values (v_org, p_plan, 'trial', now() + make_interval(days => p_trial_days));
  end if;
  insert into audit_log (actor_id, station_id, action, entity, entity_id, after)
  values (p_actor, v_station, 'onboard_station', 'stations', v_station::text,
          jsonb_build_object('organization_id', v_org, 'owner', p_owner, 'plan', p_plan, 'trial_days', p_trial_days));
  return query select v_org, v_station;
end $$;

-- ---------- grants ----------
revoke all on mrr_snapshots, subscription_payments from anon;
revoke insert, update, delete, truncate on mrr_snapshots, subscription_payments from authenticated;
revoke execute on function fn_sale_product_name(), fn_subscription_payments_append_only(), is_platform_admin(),
                           snapshot_mrr(date), record_subscription_payment(uuid, numeric, text, text, date),
                           admin_create_station(uuid, uuid, text, text, text, char, text, uuid, int, numeric, numeric)
  from public, anon;
revoke execute on function fn_sale_product_name(), fn_subscription_payments_append_only(), snapshot_mrr(date),
                           admin_create_station(uuid, uuid, text, text, text, char, text, uuid, int, numeric, numeric)
  from authenticated;
grant execute on function is_platform_admin(), record_subscription_payment(uuid, numeric, text, text, date)
  to authenticated, service_role;
grant execute on function snapshot_mrr(date),
                          admin_create_station(uuid, uuid, text, text, text, char, text, uuid, int, numeric, numeric)
  to service_role;

-- this month's snapshot now, then on the 1st of every month (Supabase / pg_cron only)
select snapshot_mrr();
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fuelos-mrr-snapshot', '5 0 1 * *', 'select public.snapshot_mrr()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;
