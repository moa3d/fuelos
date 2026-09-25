-- =====================================================================
-- FuelOS — attendant PIN login on a registered device (screen L2)
--
-- Flow:
--   1. An owner or shift manager, signed in with OTP on the new device, calls issue_device_credential().
--      The device keeps the returned secret in secure storage; the server keeps only its SHA-256.
--   2. The owner sets each attendant's PIN with set_member_pin(). Only a bcrypt hash is stored.
--   3. The Edge Function `attendant-pin-login` (service role) calls device_roster() to show «من أنت؟»
--      and verify_member_pin() to check the PIN, then issues a Supabase session for that user.
--
-- Secrets live in their own tables with RLS on and NO policies, so no client role can read them,
-- and they never pass through fn_audit() (station_members is audited, so the placeholder
-- station_members.pin_hash column is dropped here; it was never populated).
-- =====================================================================

alter table station_members drop column pin_hash;

create table member_pins (
  station_id       uuid not null,
  user_id          uuid not null,
  pin_hash         text not null,                    -- bcrypt (pgcrypto crypt / gen_salt('bf'))
  failed_attempts  int not null default 0 check (failed_attempts >= 0),
  locked_until     timestamptz,
  updated_by       uuid references auth.users(id),
  updated_at       timestamptz not null default now(),
  primary key (station_id, user_id),
  foreign key (station_id, user_id) references station_members(station_id, user_id) on delete cascade
);

create table device_credentials (
  device_id    text primary key references devices(id) on delete cascade,
  secret_hash  bytea not null,                       -- sha256 of a 256-bit random secret
  issued_by    uuid references auth.users(id),
  issued_at    timestamptz not null default now(),
  revoked_at   timestamptz
);

alter table member_pins enable row level security;
alter table device_credentials enable row level security;
revoke all on member_pins, device_credentials from public, anon, authenticated;
grant select, insert, update, delete on member_pins, device_credentials to service_role;

-- Lockout policy: 5 wrong PINs lock that member on every device for 15 minutes.
create or replace function pin_max_attempts() returns int language sql immutable as $$ select 5 $$;
create or replace function pin_lock_interval() returns interval language sql immutable as $$ select interval '15 minutes' $$;

-- ---------- office-side RPCs (called by a signed-in owner / manager) ----------

-- Registers the device (or rotates its secret) and returns the new secret ONCE.
create or replace function issue_device_credential(p_station uuid, p_device_id text, p_label text default null)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existing devices; v_secret text;
begin
  perform require_role(p_station, array['owner', 'shift_manager']::member_role[]);
  if coalesce(trim(p_device_id), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REQUIRED', detail = 'device_id';
  end if;

  select * into v_existing from devices where id = p_device_id;
  if v_existing.id is null then
    insert into devices (id, station_id, label, registered_by) values (p_device_id, p_station, p_label, auth.uid());
  elsif v_existing.station_id is distinct from p_station then
    raise exception using errcode = 'P0001', message = 'FUELOS_ID_CONFLICT', detail = 'device belongs to another station';
  elsif p_label is not null then
    update devices set label = p_label where id = p_device_id;
  end if;

  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into device_credentials (device_id, secret_hash, issued_by)
  values (p_device_id, sha256(convert_to(v_secret, 'UTF8')), auth.uid())
  on conflict (device_id) do update
    set secret_hash = excluded.secret_hash, issued_by = excluded.issued_by, issued_at = now(), revoked_at = null;

  insert into audit_log (actor_id, station_id, action, entity, entity_id)
  values (auth.uid(), p_station, 'issue_credential', 'devices', p_device_id);
  return v_secret;
end $$;

create or replace function revoke_device(p_device_id text, p_reason text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_station uuid;
begin
  select station_id into v_station from devices where id = p_device_id;
  if v_station is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'device';
  end if;
  perform require_role(v_station, array['owner', 'shift_manager']::member_role[]);
  if coalesce(trim(p_reason), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REASON_REQUIRED';
  end if;
  update device_credentials set revoked_at = now() where device_id = p_device_id and revoked_at is null;
  insert into audit_log (actor_id, station_id, action, entity, entity_id, reason)
  values (auth.uid(), v_station, 'revoke_credential', 'devices', p_device_id, p_reason);
end $$;

-- PIN: 4–6 digits. Owner only (permissions belong to the owner). Setting a PIN clears any lock.
create or replace function set_member_pin(p_station uuid, p_user uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform require_role(p_station, array['owner']::member_role[]);
  if not exists (select 1 from station_members where station_id = p_station and user_id = p_user
                   and role in ('attendant', 'shift_manager')) then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'attendant or shift manager';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception using errcode = 'P0001', message = 'FUELOS_PIN_FORMAT', detail = '4 to 6 digits';
  end if;

  insert into member_pins (station_id, user_id, pin_hash, updated_by)
  values (p_station, p_user, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), auth.uid())
  on conflict (station_id, user_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null,
        updated_by = excluded.updated_by, updated_at = now();

  -- audit without the hash
  insert into audit_log (actor_id, station_id, action, entity, entity_id)
  values (auth.uid(), p_station, 'set_pin', 'station_members', p_user::text);
end $$;

-- ---------- service-role RPCs (Edge Function only) ----------

-- Returns the device's station, or NULL when the id/secret pair is unknown or revoked.
create or replace function device_station(p_device_id text, p_secret text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select d.station_id
  from devices d join device_credentials c on c.device_id = d.id
  where d.id = p_device_id and c.revoked_at is null
    and c.secret_hash = sha256(convert_to(coalesce(p_secret, ''), 'UTF8'));
$$;

-- «من أنت؟»: active attendants / shift managers of the device's station who have a PIN.
create or replace function device_roster(p_device_id text, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_station uuid;
begin
  v_station := device_station(p_device_id, p_secret);
  if v_station is null then
    return jsonb_build_object('ok', false, 'code', 'FUELOS_DEVICE_NOT_REGISTERED');
  end if;
  return jsonb_build_object(
    'ok', true,
    'station', (select jsonb_build_object('id', s.id, 'name', s.name) from stations s where s.id = v_station),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', m.display_name, 'role', m.role)
                       order by m.display_name)
      from station_members m join member_pins p on p.station_id = m.station_id and p.user_id = m.user_id
      where m.station_id = v_station and m.status = 'active' and m.role in ('attendant', 'shift_manager')), '[]'::jsonb));
end $$;

-- Checks the PIN. Returns jsonb instead of raising, so a failed attempt is still counted
-- (an exception would roll the counter back).
create or replace function verify_member_pin(p_device_id text, p_secret text, p_user uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_station uuid; v_pin member_pins; v_left int;
begin
  v_station := device_station(p_device_id, p_secret);
  if v_station is null then
    return jsonb_build_object('ok', false, 'code', 'FUELOS_DEVICE_NOT_REGISTERED');
  end if;

  select p.* into v_pin
  from member_pins p join station_members m on m.station_id = p.station_id and m.user_id = p.user_id
  where p.station_id = v_station and p.user_id = p_user
    and m.status = 'active' and m.role in ('attendant', 'shift_manager')
  for update of p;
  if v_pin.user_id is null then
    return jsonb_build_object('ok', false, 'code', 'FUELOS_PIN_NOT_SET');
  end if;

  if v_pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'code', 'FUELOS_PIN_LOCKED', 'locked_until', v_pin.locked_until);
  end if;

  if v_pin.pin_hash = extensions.crypt(coalesce(p_pin, ''), v_pin.pin_hash) then
    update member_pins set failed_attempts = 0, locked_until = null
    where station_id = v_station and user_id = p_user;
    insert into audit_log (actor_id, station_id, action, entity, entity_id)
    values (p_user, v_station, 'pin_login', 'devices', p_device_id);
    return jsonb_build_object('ok', true, 'user_id', p_user, 'station_id', v_station);
  end if;

  -- locking resets the counter, so an expired lock starts a fresh count
  v_left := pin_max_attempts() - v_pin.failed_attempts - 1;
  if v_left <= 0 then
    update member_pins set failed_attempts = 0, locked_until = now() + pin_lock_interval()
    where station_id = v_station and user_id = p_user;
    insert into audit_log (actor_id, station_id, action, entity, entity_id)
    values (p_user, v_station, 'pin_locked', 'devices', p_device_id);
    return jsonb_build_object('ok', false, 'code', 'FUELOS_PIN_LOCKED', 'locked_until', now() + pin_lock_interval());
  end if;
  update member_pins set failed_attempts = pin_max_attempts() - v_left, locked_until = null
  where station_id = v_station and user_id = p_user;
  return jsonb_build_object('ok', false, 'code', 'FUELOS_PIN_INVALID', 'attempts_left', v_left);
end $$;

-- ---------- grants ----------
revoke execute on function issue_device_credential(uuid, text, text), revoke_device(text, text),
                           set_member_pin(uuid, uuid, text), device_station(text, text),
                           device_roster(text, text), verify_member_pin(text, text, uuid, text),
                           pin_max_attempts(), pin_lock_interval()
  from public, anon, authenticated;
grant execute on function issue_device_credential(uuid, text, text), revoke_device(text, text),
                          set_member_pin(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function device_station(text, text), device_roster(text, text),
                          verify_member_pin(text, text, uuid, text), pin_max_attempts(), pin_lock_interval()
  to service_role;
