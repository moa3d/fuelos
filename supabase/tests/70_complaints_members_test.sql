-- =====================================================================
-- FuelOS — complaints, invoice corrections, team activity (migration 20260927000200_complaints_invoices_members.sql)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/70_complaints_members_test.sql
-- Runs after migrations + seed.sql, in one transaction that is rolled back.
-- Seed: رنا's price report on محطة النور, and رنا's invoice for her cash fill on shift A.
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
select id as complaint from complaints where station_id = :'station' \gset
select id as invoice from invoices where customer_id = '11111111-0000-4000-8000-000000000006' \gset
select '11111111-0000-4000-8000-000000000001' as owner, '11111111-0000-4000-8000-000000000002' as acct,
       '11111111-0000-4000-8000-000000000003' as mgr,   '11111111-0000-4000-8000-000000000004' as khaled,
       '11111111-0000-4000-8000-000000000006' as rana,  '11111111-0000-4000-8000-000000000098' as stranger \gset
-- another customer who has nothing to do with رنا's case
insert into auth.users (id, email, created_at, updated_at) values (:'stranger', 'stranger@demo.fuelos.app', now(), now());
insert into customers (id, full_name) values (:'stranger', 'زبون آخر');

-- =====================================================================
-- 1. Complaint messages: only the case's customer, its station staff, or the platform — each on its own side
-- =====================================================================
set local role authenticated;
select pg_temp.act_as(:'rana');
insert into complaint_messages (complaint_id, author_id, author_side, body) values (:'complaint', :'rana', 'customer', 'السعر ما زال خطأ');
select pg_temp.ok(true, 'the customer writes in her own case');
select pg_temp.throws(format('insert into complaint_messages (complaint_id, author_id, author_side, body) values (%L, %L, %L, %L)',
                             :'complaint', :'rana', 'station', 'رد مزيّف'), '42501', 'a customer cannot write as the station');
select pg_temp.act_as(:'stranger');
select pg_temp.throws(format('insert into complaint_messages (complaint_id, author_id, author_side, body) values (%L, %L, %L, %L)',
                             :'complaint', :'stranger', 'customer', 'تطفّل'), '42501', 'another customer cannot write in the case');
select pg_temp.act_as(:'owner');
insert into complaint_messages (complaint_id, author_id, author_side, body) values (:'complaint', :'owner', 'station', 'تم تصحيح السعر');
select pg_temp.ok(true, 'the owner answers as the station');
select pg_temp.throws(format('insert into complaint_messages (complaint_id, author_id, author_side, body) values (%L, %L, %L, %L)',
                             :'complaint', :'owner', 'customer', 'x'), '42501', 'station staff cannot write as the customer');
select pg_temp.act_as(:'khaled');
select pg_temp.throws(format('insert into complaint_messages (complaint_id, author_id, author_side, body) values (%L, %L, %L, %L)',
                             :'complaint', :'khaled', 'station', 'x'), '42501', 'an attendant does not answer complaints');
reset role;

-- =====================================================================
-- 2. Invoice correction: the row and the invoice status in one step
-- =====================================================================
set local role authenticated;
select pg_temp.act_as(:'khaled');
select pg_temp.throws(format('select record_invoice_correction(%L, %L, -500)', :'invoice', 'خطأ في السعر'), '42501',
                      'an attendant cannot correct an invoice');
select pg_temp.act_as(:'acct');
select pg_temp.throws(format('select record_invoice_correction(%L, %L, -500)', :'invoice', ' '), 'FUELOS_REASON_REQUIRED',
                      'a correction needs a reason');
select record_invoice_correction(:'invoice', 'خطأ في السعر المعروض', -500) as correction \gset
reset role;
select pg_temp.ok((select status = 'corrected' from invoices where id = :'invoice'), 'the invoice is marked corrected');
select pg_temp.ok((select amount_delta = -500 and created_by = :'acct' from invoice_corrections where id = :'correction'),
                  'the correction keeps the amount and who made it');
select pg_temp.ok((select count(*) = 1 from audit_log where action = 'correct_invoice' and entity_id = :'invoice'),
                  'the correction is in the audit log');

-- =====================================================================
-- 3. Overdue complaints are escalated to the platform
-- =====================================================================
update complaints set sla_due_at = now() - interval '1 hour' where id = :'complaint';
insert into complaints (station_id, customer_id, subject, status, sla_due_at, resolved_at)
values (:'station', :'rana', 'قديمة ومحلولة', 'resolved', now() - interval '3 days', now() - interval '2 days');
select pg_temp.ok(escalate_overdue_complaints() = 1, 'one overdue open case is escalated');
select pg_temp.ok((select status = 'escalated' from complaints where id = :'complaint'), 'its status is «مصعّدة»');
select pg_temp.ok((select count(*) = 1 from complaints where status = 'resolved'), 'a resolved case is never escalated');
set local role authenticated;
select pg_temp.act_as(:'owner');
select pg_temp.throws('select escalate_overdue_complaints()', '42501', 'the escalation job is not callable from the apps');
reset role;

-- =====================================================================
-- 4. Team activity (last sign-in) and accepting an invitation
-- =====================================================================
update auth.users set last_sign_in_at = now() - interval '2 hours' where id = :'khaled';
set local role authenticated;
select pg_temp.act_as(:'owner');
select pg_temp.ok((select last_sign_in_at is not null from station_members_activity(:'station') where user_id = :'khaled'),
                  'the owner sees a member''s last sign-in');
select pg_temp.ok((select count(*) = (select count(*) from station_members where station_id = :'station')
                     from station_members_activity(:'station')), 'one row per member of this station, nobody else');
select pg_temp.act_as(:'khaled');
select pg_temp.throws(format('select * from station_members_activity(%L)', :'station'), '42501', 'an attendant cannot list the team''s sign-ins');
reset role;

insert into station_members (station_id, user_id, role, status, display_name) values (:'station', :'stranger', 'accountant', 'invited', 'محاسب جديد');
set local role authenticated;
select pg_temp.act_as(:'stranger');
select pg_temp.ok(accept_station_invites() = 1, 'the invited person activates the invitation on first sign-in');
reset role;
select pg_temp.ok((select status = 'active' from station_members where user_id = :'stranger'), 'the membership is active');
update station_members set status = 'suspended' where user_id = :'stranger';
set local role authenticated;
select pg_temp.act_as(:'stranger');
select pg_temp.ok(accept_station_invites() = 0, 'a suspended member cannot reactivate himself');
reset role;

select pg_temp.ok(user_id_by_email('Owner@Demo.FuelOS.app') = :'owner'::uuid, 'the invite function finds an existing account by email (any case)');
set local role authenticated;
select pg_temp.act_as(:'owner');
select pg_temp.throws($$select user_id_by_email('owner@demo.fuelos.app')$$, '42501', 'looking up accounts by email is not callable from the apps');
reset role;

\o
select 'ALL COMPLAINTS / MEMBERS TESTS PASSED' as result;
rollback;
