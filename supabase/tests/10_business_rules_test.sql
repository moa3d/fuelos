-- =====================================================================
-- FuelOS — business-rule & security tests (run AFTER migrations + seed.sql)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/10_business_rules_test.sql
-- Runs in one transaction and rolls back, so the demo data is untouched.
-- Each check prints "PASS …"; the first failure aborts with "FAIL …".
-- =====================================================================
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

-- ---------- tiny test kit ----------
create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_user is null then '' else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true);
$$;
create function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS  %', p_label;
end $$;
-- p_expected matches the FUELOS_* message or the SQLSTATE (e.g. 42501, 23505)
create function pg_temp.throws(p_sql text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_expected or sqlstate = p_expected then
      raise notice 'PASS  % (%)', p_label, p_expected; return;
    end if;
    raise exception 'FAIL: % — expected %, got % / %', p_label, p_expected, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % — expected %, but no error', p_label, p_expected;
end $$;
create function pg_temp.balanced(p_station uuid) returns boolean language sql as $$
  select coalesce(sum(debit), 0) = coalesce(sum(credit), 0) from journal_lines where station_id = p_station;
$$;
create function pg_temp.balance(p_station uuid, p_code text) returns numeric language sql as $$
  select coalesce(sum(l.debit - l.credit), 0) from journal_lines l join accounts a on a.id = l.account_id
  where l.station_id = p_station and a.code = p_code;
$$;

-- ---------- fixtures from seed.sql ----------
select id as station from stations where name = 'محطة النور' \gset
select '11111111-0000-4000-8000-000000000001' as owner, '11111111-0000-4000-8000-000000000002' as acct,
       '11111111-0000-4000-8000-000000000003' as mgr,   '11111111-0000-4000-8000-000000000004' as khaled,
       '11111111-0000-4000-8000-000000000005' as mohamad, '11111111-0000-4000-8000-000000000006' as rana,
       '11111111-0000-4000-8000-000000000007' as admin,
       '22222222-0000-4000-8000-00000000000a' as shift_a, '22222222-0000-4000-8000-00000000000b' as shift_b \gset
select id as pump1 from pumps where station_id = :'station' and number = 1 \gset
select id as pump3 from pumps where station_id = :'station' and number = 3 \gset
select id as pump4 from pumps where station_id = :'station' and number = 4 \gset
select id as n1a from nozzles where pump_id = :'pump1' and label = 'بنزين 90' \gset
select id as n1b from nozzles where pump_id = :'pump1' and label = 'ديزل' \gset
select id as n3 from nozzles where pump_id = :'pump3' \gset
select id as n4, last_reading as n4_last from nozzles where pump_id = :'pump4' \gset
select id as t95 from tanks where station_id = :'station' and name = 'خزان 3' \gset
select id as company from company_accounts where station_id = :'station' \gset
select id as p95 from products where station_id = :'station' and code = 'gasoline_95' \gset
select id as first_entry from journal_entries where station_id = :'station' and number = 1 \gset
select organization_id as org from stations where id = :'station' \gset
select id as period from accounting_periods where station_id = :'station' and status = 'open' \gset

-- =====================================================================
-- 1. Ledger integrity
-- =====================================================================
select pg_temp.ok(pg_temp.balanced(:'station'), 'seeded ledger is balanced (debit = credit)');
select pg_temp.ok((select count(*) = 0 from journal_entries where station_id = :'station' and status = 'posted'
                   and id not in (select entry_id from journal_lines)), 'every posted entry has lines');
select pg_temp.ok(pg_temp.balance(:'station', '1000') = 145750 - 38000, 'cash = counted - opening - cash expense');
select pg_temp.ok(pg_temp.balance(:'station', '5300') = 500, 'cash shortage of 500 went to expense 5300');
select pg_temp.ok(pg_temp.balance(:'station', '4000') = -156250, 'meter sales 1,250 L x 125 credited to 4000');
select pg_temp.ok((select description like '%(تكلفة غير مكتملة)%' from journal_entries
                   where source_id = :'shift_a' and description like 'تكلفة%'), 'COGS flagged as estimate when a delivery has no cost');

select pg_temp.throws(format('update journal_entries set description = %L where id = %L', 'x', :'first_entry'),
                      'FUELOS_POSTED_IMMUTABLE', 'posted entry cannot be edited');
select pg_temp.throws(format('delete from journal_entries where id = %L', :'first_entry'),
                      'FUELOS_POSTED_IMMUTABLE', 'posted entry cannot be deleted');
select pg_temp.throws(format('update journal_lines set debit = debit + 1 where entry_id = %L', :'first_entry'),
                      'FUELOS_POSTED_IMMUTABLE', 'lines of a posted entry cannot change');
select pg_temp.throws(format('insert into journal_entries (station_id, description, status) values (%L, %L, %L)', :'station', 'x', 'posted'),
                      'FUELOS_POST_VIA_UPDATE', 'cannot insert an entry directly as posted');

-- unbalanced manual entry
select pg_temp.act_as(:'acct');
insert into journal_entries (id, station_id, description, created_by)
values ('44444444-0000-4000-8000-000000000001', :'station', 'قيد يدوي غير متوازن', :'acct');
insert into journal_lines (station_id, entry_id, account_id, debit) values (:'station', '44444444-0000-4000-8000-000000000001', acct(:'station', '5900'), 100);
insert into journal_lines (station_id, entry_id, account_id, credit) values (:'station', '44444444-0000-4000-8000-000000000001', acct(:'station', '1000'), 90);
select pg_temp.throws($$update journal_entries set status = 'posted' where id = '44444444-0000-4000-8000-000000000001'$$,
                      'FUELOS_UNBALANCED_ENTRY', 'unbalanced entry cannot be posted');
delete from journal_lines where entry_id = '44444444-0000-4000-8000-000000000001';
delete from journal_entries where id = '44444444-0000-4000-8000-000000000001';
select pg_temp.ok(true, 'draft entries can still be deleted');

-- reversal
select pg_temp.throws(format('select reverse_journal_entry(%L, %L)', :'first_entry', ''), 'FUELOS_REASON_REQUIRED', 'reversal needs a reason');
select reverse_journal_entry(:'first_entry', 'تصحيح توريد مسجل مرتين') as reversal \gset
select pg_temp.ok((select sum(debit) = sum(credit) from journal_lines where entry_id = :'reversal'), 'reversal entry is balanced');
select pg_temp.ok((select sum(l.debit - l.credit) = 0 from journal_lines l where l.entry_id in (:'first_entry', :'reversal')), 'entry + reversal net to zero');
select pg_temp.throws(format('select reverse_journal_entry(%L, %L)', :'first_entry', 'مرة ثانية'), '23505', 'an entry can be reversed only once');

-- =====================================================================
-- 2. Append-only & frozen records
-- =====================================================================
select pg_temp.throws('update inventory_movements set liters = liters + 1', 'FUELOS_APPEND_ONLY', 'stock movements are append-only');
select pg_temp.throws('delete from audit_log', 'FUELOS_APPEND_ONLY', 'audit log cannot be deleted');
select pg_temp.throws('update loyalty_ledger set points = 999', 'FUELOS_APPEND_ONLY', 'loyalty ledger is append-only');
select pg_temp.throws($$update sales set amount = 1 where id = '33333333-0000-4000-8000-000000000001'$$, 'FUELOS_SALE_FROZEN', 'sale amount is frozen');
select pg_temp.throws($$delete from sales where id = '33333333-0000-4000-8000-000000000001'$$, 'FUELOS_APPEND_ONLY', 'sales are never deleted');
select pg_temp.throws(format('update shifts set status = %L where id = %L', 'open', :'shift_a'), 'FUELOS_BAD_SHIFT_TRANSITION', 'approved shift cannot go back to open');
select pg_temp.throws($$delete from invoices$$, 'FUELOS_APPEND_ONLY', 'invoices are never deleted');

-- =====================================================================
-- 3. Shift rules (worker app)
-- =====================================================================
select pg_temp.act_as(:'mohamad');
select pg_temp.throws(format('select open_shift(gen_random_uuid(), %L, 0, %L::jsonb)', :'pump1',
                             json_build_array(json_build_object('nozzle_id', :'n1a', 'opening_reading', 99999),
                                              json_build_object('nozzle_id', :'n1b', 'opening_reading', 150000))),
                      'FUELOS_PUMP_BUSY', 'two open shifts on one pump are refused');
select pg_temp.throws(format('select open_shift(gen_random_uuid(), %L, 0, %L::jsonb)', :'pump4',
                             json_build_array(json_build_object('nozzle_id', :'n4', 'opening_reading', :'n4_last'::numeric - 10))),
                      'FUELOS_READING_BELOW_LAST', 'opening reading below the last closing reading is refused');
select pg_temp.throws(format('select open_shift(gen_random_uuid(), %L, 0, %L::jsonb)', :'pump4', '[]'),
                      'FUELOS_READING_MISSING', 'every nozzle needs an opening reading');

-- idempotent offline replay
select pg_temp.act_as(:'khaled');
select record_sale('55555555-0000-4000-8000-000000000001', :'shift_b', :'n1a', 10, 110, 'card');
select record_sale('55555555-0000-4000-8000-000000000001', :'shift_b', :'n1a', 10, 110, 'card') ->> 'replayed' as replayed \gset
select pg_temp.ok(:'replayed' = 'true', 'replaying the same sale id is a no-op');
select pg_temp.ok((select count(*) = 1 from sales where id = '55555555-0000-4000-8000-000000000001'), 'no duplicate sale after replay');
select pg_temp.ok((select (record_sale(gen_random_uuid(), :'shift_b', :'n1a', 5, 999, 'card') ->> 'unit_price')::numeric = 110),
                  'server price wins over a stale device price');
select pg_temp.throws(format('select record_sale(gen_random_uuid(), %L, %L, 5, 110, %L)', :'shift_b', :'n3', 'card'),
                      'FUELOS_NOT_FOUND', 'a nozzle from another pump is refused');
select pg_temp.act_as(:'mohamad');
select pg_temp.throws(format('select record_sale(gen_random_uuid(), %L, %L, 5, 110, %L)', :'shift_b', :'n1a', 'card'),
                      '42501', 'an attendant cannot record sales on a colleague''s shift');

-- company credit
select pg_temp.act_as(:'khaled');
update company_accounts set credit_limit = 10000 where id = :'company';          -- balance 2,500 => remaining 7,500
select pg_temp.throws(format('select record_sale(gen_random_uuid(), %L, %L, 100, 110, %L, p_company := %L)', :'shift_b', :'n1a', 'credit', :'company'),
                      'FUELOS_CREDIT_LIMIT', 'credit sale above the remaining limit is refused');
update company_accounts set status = 'frozen' where id = :'company';
select pg_temp.throws(format('select record_sale(gen_random_uuid(), %L, %L, 5, 110, %L, p_company := %L)', :'shift_b', :'n1a', 'credit', :'company'),
                      'FUELOS_COMPANY_FROZEN', 'frozen company cannot buy on credit');
update company_accounts set status = 'active' where id = :'company';
select record_sale('55555555-0000-4000-8000-000000000002', :'shift_b', :'n1a', 100, 110, 'credit',
                   p_company := :'company', p_request_approval := true) ->> 'status' as over_status \gset
select pg_temp.ok(:'over_status' = 'pending_approval', 'over-limit sale can wait for the owner''s approval');

-- submit shift B: 90 = 400 L x 110 = 44,000; diesel = 0 L
--   expected cash = 5,000 + 44,000 - card (2,750 + 1,100 + 550) - credit 11,000 = 33,600
select pg_temp.throws(format('select submit_shift(%L, %L::jsonb, 30000)', :'shift_b',
                             json_build_array(json_build_object('nozzle_id', :'n1a', 'closing_reading', 98810.0),
                                              json_build_object('nozzle_id', :'n1b', 'closing_reading', 143002.5))),
                      'FUELOS_REASON_REQUIRED', 'cash difference above tolerance needs a reason');
select submit_shift(:'shift_b', json_build_array(json_build_object('nozzle_id', :'n1a', 'closing_reading', 98810.0),
                                                 json_build_object('nozzle_id', :'n1b', 'closing_reading', 143002.5))::jsonb,
                    33600) ->> 'cash_diff' as diff_b \gset
select pg_temp.ok(:'diff_b'::numeric = 0, 'expected cash formula: opening + meter sales - card - credit - voucher');
select pg_temp.ok((select last_reading = 98810.0 from nozzles where id = :'n1a'), 'closing reading becomes the nozzle''s last reading');

select id as req_b from approval_requests where ref_id = :'shift_b' and status = 'pending' \gset
select pg_temp.throws(format('select decide_approval(%L, true)', :'req_b'), '42501', 'an attendant cannot approve a shift');
select pg_temp.act_as(:'owner');
select pg_temp.throws(format('select decide_approval(%L, true)', :'req_b'), 'FUELOS_PENDING_APPROVALS', 'shift waits for its over-limit credit decisions');
select id as req_credit from approval_requests where ref_id = '55555555-0000-4000-8000-000000000002' \gset
select pg_temp.throws(format('select decide_approval(%L, false)', :'req_credit'), 'FUELOS_REASON_REQUIRED', 'rejection needs a note');
select decide_approval(:'req_credit', false, null, 'تجاوز كبير للحد');
select pg_temp.ok((select status = 'voided' from sales where id = '55555555-0000-4000-8000-000000000002'), 'rejected over-limit sale is voided');
select pg_temp.ok((select status = 'cancelled' from invoices where sale_id = '55555555-0000-4000-8000-000000000002'), 'its invoice is cancelled');
select pg_temp.ok((select count(*) = 1 from approval_requests where ref_id = :'shift_b' and status = 'pending'), 'shift B still waits for approval');
-- the voided credit sale is no longer deducted from expected cash: the fuel was dispensed but not paid => 11,000 shortage
select decide_approval(:'req_b', true, null, 'اعتماد مع عجز');
select pg_temp.ok(pg_temp.balance(:'station', '5300') = 500 + 11000, 'rejected credit fill becomes a cash shortage (5300)');
select pg_temp.ok(pg_temp.balanced(:'station'), 'ledger still balanced after shift B');

-- =====================================================================
-- 4. Reopen an approved shift: postings reversed, stock returned, no double counting
-- =====================================================================
select tank_book_l(:'t95') as t95_before \gset
select pg_temp.throws(format('select reopen_shift(%L, %L)', :'shift_a', ' '), 'FUELOS_REASON_REQUIRED', 'reopening needs a reason');
select reopen_shift(:'shift_a', 'قراءة نهائية خاطئة');
select pg_temp.ok(tank_book_l(:'t95') = :'t95_before'::numeric + 1250, 'reopen returns the sold liters to the tank');
select pg_temp.ok((select sum(l.debit - l.credit) = 0 from journal_lines l join journal_entries e on e.id = l.entry_id
                   join accounts a on a.id = l.account_id where e.source_id = :'shift_a' and a.code = '4000'), 'reopen reverses the shift revenue');
select pg_temp.act_as(:'mohamad');
select submit_shift(:'shift_a', json_build_array(json_build_object('nozzle_id', :'n3', 'closing_reading', 185460.5))::jsonb, 149500, 'تصحيح');
select pg_temp.act_as(:'owner');
select id as req_a from approval_requests where ref_id = :'shift_a' and status = 'pending' \gset
select decide_approval(:'req_a', true, 'shortage_to_employee', 'بعد التصحيح');
select pg_temp.ok(tank_book_l(:'t95') = :'t95_before'::numeric + 10, 'corrected shift sells 1,240 L (10 L fewer)');
select pg_temp.ok(pg_temp.balance(:'station', '1150') > 0, 'shortage charged to the employee receivable when chosen');
select pg_temp.ok((select count(*) = 1 from loyalty_ledger), 'loyalty points are never granted twice');
select pg_temp.ok(pg_temp.balanced(:'station'), 'ledger balanced after reopen + re-approval');

-- =====================================================================
-- 5. Stock measurement beyond tolerance needs approval
-- =====================================================================
select pg_temp.act_as(:'mgr');
select record_tank_measurement(:'t95', tank_book_l(:'t95') - 300) ->> 'needs_approval' as needs \gset
select pg_temp.ok(:'needs' = 'true', '300 L difference (> 100 L tolerance) waits for approval');
select pg_temp.ok((select count(*) = 1 from approval_requests where type = 'stock_adjustment' and status = 'pending'), 'stock approval request created');

-- =====================================================================
-- 6. Accounting period close
-- =====================================================================
select pg_temp.act_as(:'acct');
select pg_temp.throws(format('select close_period(%L)', :'period'), '42501', 'only the owner closes a period');
insert into journal_entries (id, station_id, description, created_by) values ('44444444-0000-4000-8000-000000000002', :'station', 'مسودة', :'acct');
select pg_temp.act_as(:'owner');
select pg_temp.throws(format('select close_period(%L)', :'period'), 'FUELOS_DRAFTS_BLOCK_CLOSE', 'draft entries block the close');
delete from journal_entries where id = '44444444-0000-4000-8000-000000000002';
select close_period(:'period');
select pg_temp.act_as(:'acct');
insert into expenses (id, station_id, category, amount, description, created_by)
values ('66666666-0000-4000-8000-000000000001', :'station', 'other', 1000, 'بعد الإقفال', :'acct');
select pg_temp.throws($$select post_expense('66666666-0000-4000-8000-000000000001')$$, 'FUELOS_PERIOD_CLOSED', 'no posting into a closed period');
select pg_temp.throws(format('update accounting_periods set status = %L where id = %L', 'open', :'period'), 'FUELOS_PERIOD_CLOSED', 'a closed period cannot be reopened');

-- =====================================================================
-- 7. Row Level Security (as the API sees it)
-- =====================================================================
set local role authenticated;

select pg_temp.act_as(:'khaled');                                    -- attendant
select pg_temp.ok((select count(*) = 0 from journal_entries), 'attendant: no ledger');
select pg_temp.ok((select count(*) = 0 from fuel_deliveries), 'attendant: no purchase costs');
select pg_temp.ok((select count(*) = 0 from expenses), 'attendant: no expenses');
select pg_temp.ok((select count(*) = 0 from accounts), 'attendant: no chart of accounts');
select pg_temp.ok((select count(*) = 0 from audit_log), 'attendant: no audit log');
select pg_temp.ok((select count(*) = 1 from shifts), 'attendant: only own shift');
select pg_temp.ok((select bool_and(created_by = :'khaled') from sales), 'attendant: only own sales');
select pg_temp.ok((select count(*) = 3 from prices), 'attendant: sees prices');
select pg_temp.throws(format('insert into sales (id, station_id, shift_id, nozzle_id, liters, unit_price, amount, payment_method, created_by, client_created_at) values (gen_random_uuid(), %L, %L, %L, 1, 1, 1, %L, %L, now())',
                             :'station', :'shift_b', :'n1a', 'cash', :'khaled'), '42501', 'attendant: no direct writes (RPC only)');
select pg_temp.throws(format('select publish_price(%L, %L, 1)', :'station', :'p95'), '42501', 'attendant: cannot publish prices');
select pg_temp.throws($$select post_entry(null, null, null, null, null, '[]')$$, '42501', 'internal ledger helper is not callable');

select pg_temp.act_as(:'acct');                                      -- accountant
select pg_temp.ok((select count(*) > 0 from journal_entries), 'accountant: sees the ledger');
select pg_temp.ok((select count(*) = 0 from audit_log), 'accountant: audit log is owner-only');
update stations set name = 'x' where id = :'station';
select pg_temp.ok((select name = 'محطة النور' from stations where id = :'station'), 'accountant: cannot change station settings');

select pg_temp.act_as(:'owner');                                     -- owner
select pg_temp.ok((select count(*) > 0 from audit_log), 'owner: sees the audit log');

select pg_temp.act_as(:'rana');                                      -- customer
select pg_temp.ok((select count(*) = 1 from invoices), 'customer: only own invoice');
select pg_temp.ok((select coalesce(sum(points), 0) = 15 from loyalty_ledger), 'customer: sees own points');
select pg_temp.ok((select count(*) = 1 from customers), 'customer: only own profile');
select pg_temp.ok((select count(*) = 0 from company_accounts), 'customer: no company accounts');
select pg_temp.ok((select count(*) = 0 from shifts), 'customer: no shifts');

select pg_temp.act_as(:'admin');                                     -- platform staff
select pg_temp.ok((select count(*) = 0 from journal_entries), 'platform: no station finance without a grant');
select pg_temp.throws(format('insert into access_grants (user_id, station_id, reason, expires_at) values (%L, %L, %L, now() + interval ''48 hours'')',
                             :'admin', :'station', 'تذكرة'), '42501', 'platform: grants longer than 24 h are refused');
insert into access_grants (user_id, station_id, reason, expires_at) values (:'admin', :'station', 'تذكرة دعم #482', now() + interval '2 hours');
select pg_temp.ok((select count(*) > 0 from journal_entries), 'platform: time-boxed grant opens read access');

-- another tenant sees nothing of محطة النور
reset role;
insert into auth.users (id, email, created_at, updated_at) values ('11111111-0000-4000-8000-000000000099', 'other-owner@demo.fuelos.app', now(), now());
set local role authenticated;
select pg_temp.act_as('11111111-0000-4000-8000-000000000099');
select create_station(null, 'محطة أخرى', 'SYP') as other_station \gset
select pg_temp.ok((select count(*) = 1 from stations), 'tenant isolation: owner sees only own station');
select pg_temp.ok((select count(*) = 0 from shifts) and (select count(*) = 0 from sales), 'tenant isolation: no foreign shifts or sales');
select pg_temp.ok((select count(*) = 21 from accounts), 'new station gets the 21 system accounts');
select pg_temp.throws(format('select create_station(%L, %L)', :'org', 'تسلل'),
                      '42501', 'cannot add a station to someone else''s organization');

-- guests (anon)
reset role;
select pg_temp.act_as(null);
set local role anon;
select pg_temp.ok((select count(*) = 3 from public_station_prices), 'guest: sees public prices + availability');
select pg_temp.throws('select count(*) from shifts', '42501', 'guest: no access to operational tables');
select pg_temp.throws(format('select shift_summary(%L)', :'shift_a'), '42501', 'guest: cannot call RPCs');

reset role;
\o
select 'ALL BUSINESS-RULE TESTS PASSED' as result;
rollback;
