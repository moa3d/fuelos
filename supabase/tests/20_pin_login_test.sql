-- =====================================================================
-- FuelOS — attendant PIN login tests (migration 20260925000100_attendant_pin_login.sql)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/20_pin_login_test.sql
-- Runs after migrations + seed.sql, in one transaction that is rolled back.
-- =====================================================================
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;
create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', case when p_user is null then '' else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true); $$;
create function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin if p_cond is distinct from true then raise exception 'FAIL: %', p_label; end if; raise notice 'PASS  %', p_label; end $$;
create function pg_temp.throws(p_sql text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm = p_expected or sqlstate = p_expected then raise notice 'PASS  % (%)', p_label, p_expected; return; end if;
    raise exception 'FAIL: % — expected %, got % / %', p_label, p_expected, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % — expected %, but no error', p_label, p_expected;
end $$;

select id as station from stations where name = 'محطة النور' \gset
select '11111111-0000-4000-8000-000000000001' as owner, '11111111-0000-4000-8000-000000000003' as mgr,
       '11111111-0000-4000-8000-000000000004' as khaled, '11111111-0000-4000-8000-000000000002' as acct \gset

-- owner registers a new device and sets Khaled's PIN
select pg_temp.act_as(:'owner');
select issue_device_credential(:'station', 'test-device-1', 'جهاز اختبار') as secret \gset
select pg_temp.ok(length(:'secret') = 64, 'device secret is 256-bit hex, returned once');
select pg_temp.ok((select count(*) = 1 from device_credentials where device_id = 'test-device-1' and secret_hash <> convert_to(:'secret','UTF8')), 'only the hash is stored');
select pg_temp.throws(format('select set_member_pin(%L, %L, %L)', :'station', :'khaled', '12a4'), 'FUELOS_PIN_FORMAT', 'PIN must be 4-6 digits');
select set_member_pin(:'station', :'khaled', '4821');
select pg_temp.ok((select pin_hash like '$2%' from member_pins where user_id = :'khaled'), 'PIN stored as bcrypt hash');
-- compare whole values: a substring match also hits random UUIDs such as …d7ab4821282d (flaky)
select pg_temp.ok((select count(*) = 0 from audit_log a,
                          jsonb_each_text(coalesce(a.after, '{}'::jsonb) || coalesce(a.before, '{}'::jsonb)) kv
                    where kv.value = '4821'), 'PIN never written to audit log');

-- permissions
select pg_temp.act_as(:'acct');
select pg_temp.throws(format('select set_member_pin(%L, %L, %L)', :'station', :'khaled', '1111'), '42501', 'accountant cannot set PINs');
select pg_temp.act_as(:'khaled');
select pg_temp.throws(format('select issue_device_credential(%L, %L)', :'station', 'rogue'), '42501', 'attendant cannot register devices');

-- service-role functions (Edge Function); run as postgres here
select pg_temp.ok((device_roster('test-device-1', :'secret') -> 'members') @> json_build_array(json_build_object('user_id', :'khaled'))::jsonb, 'roster lists Khaled on the registered device');
select pg_temp.ok((device_roster('test-device-1', 'wrong') ->> 'code') = 'FUELOS_DEVICE_NOT_REGISTERED', 'wrong device secret is refused');
select pg_temp.ok((verify_member_pin('test-device-1', :'secret', :'khaled', '4821') ->> 'ok')::boolean, 'correct PIN logs in');
select pg_temp.ok((verify_member_pin('test-device-1', :'secret', :'khaled', '0000') ->> 'attempts_left')::int = 4, 'wrong PIN: 4 attempts left');
select verify_member_pin('test-device-1', :'secret', :'khaled', '0000');
select verify_member_pin('test-device-1', :'secret', :'khaled', '0000');
select verify_member_pin('test-device-1', :'secret', :'khaled', '0000');
select pg_temp.ok((verify_member_pin('test-device-1', :'secret', :'khaled', '0000') ->> 'code') = 'FUELOS_PIN_LOCKED', '5th wrong PIN locks the member');
select pg_temp.ok((verify_member_pin('test-device-1', :'secret', :'khaled', '4821') ->> 'code') = 'FUELOS_PIN_LOCKED', 'even the right PIN is refused while locked');
select pg_temp.act_as(:'owner');
select set_member_pin(:'station', :'khaled', '4821');
select pg_temp.ok((verify_member_pin('test-device-1', :'secret', :'khaled', '4821') ->> 'ok')::boolean, 'owner resetting the PIN clears the lock');
select revoke_device('test-device-1', 'فُقد الجهاز');
select pg_temp.ok((verify_member_pin('test-device-1', :'secret', :'khaled', '4821') ->> 'code') = 'FUELOS_DEVICE_NOT_REGISTERED', 'revoked device can no longer log in');

-- API roles cannot reach secrets or service-only functions
set local role authenticated;
select pg_temp.act_as(:'owner');
select pg_temp.throws('select * from member_pins', '42501', 'even the owner cannot read PIN hashes');
select pg_temp.throws('select * from device_credentials', '42501', 'device secrets are not readable');
select pg_temp.throws($$select verify_member_pin('x','y',gen_random_uuid(),'1')$$, '42501', 'signed-in users cannot call verify_member_pin directly');
reset role;
set local role anon;
select pg_temp.throws($$select device_roster('x','y')$$, '42501', 'guests cannot call device_roster');
reset role;
\o
select 'ALL PIN TESTS PASSED';
rollback;
