-- =====================================================================
-- FuelOS — Row Level Security (role matrix from spec page 24)
--   owner         : everything in own stations; approvals, prices, permissions, period close
--   accountant    : ledger, reports, customers, suppliers, expenses (no station settings)
--   shift_manager : operations: shifts, tanks, small adjustments (no ledger)
--   attendant     : own shift, own sales, the pump — NOT profits, NOT purchase costs
--   customer      : own profile, vehicles, invoices, points, complaints
--   platform staff: stations health, subscriptions, support — station finance only via access_grants
-- Writes that span tables go through SECURITY DEFINER RPCs (functions migration); policies here
-- mostly cover reads and simple owner/accountant edits.
-- =====================================================================

create or replace function is_owner(p_station uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select has_station_role(p_station, array['owner']::member_role[]);
$$;
create or replace function is_finance(p_station uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select has_station_role(p_station, array['owner', 'accountant']::member_role[]) or has_access_grant(p_station);
$$;
create or replace function is_station_staff(p_station uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select has_station_role(p_station, array['owner', 'accountant', 'shift_manager']::member_role[]) or has_access_grant(p_station);
$$;

-- enable RLS everywhere
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------- tenancy ----------
create policy org_read on organizations for select to authenticated
  using (is_platform_staff() or exists (select 1 from stations s where s.organization_id = organizations.id and is_station_member(s.id)));

create policy station_read on stations for select to authenticated
  using (is_station_member(id) or is_platform_staff());
create policy station_owner_update on stations for update to authenticated
  using (is_owner(id)) with check (is_owner(id));

create policy staff_self_read on platform_staff for select to authenticated
  using (user_id = auth.uid() or is_platform_staff());

create policy members_read on station_members for select to authenticated
  using (is_station_member(station_id) or is_platform_staff());
create policy members_owner_write on station_members for all to authenticated
  using (is_owner(station_id)) with check (is_owner(station_id));

create policy customer_self on customers for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy customer_station_read on customers for select to authenticated
  using (exists (select 1 from invoices i where i.customer_id = customers.id and is_station_staff(i.station_id)));

create policy devices_members on devices for select to authenticated using (is_station_member(station_id));
create policy devices_register on devices for insert to authenticated
  with check (is_station_member(station_id) and registered_by = auth.uid());

-- ---------- catalog ----------
create policy products_read on products for select to authenticated using (is_station_member(station_id) or has_access_grant(station_id));
create policy products_owner on products for all to authenticated using (is_owner(station_id)) with check (is_owner(station_id));
create policy tanks_read on tanks for select to authenticated using (is_station_member(station_id) or has_access_grant(station_id));
create policy tanks_owner on tanks for all to authenticated using (is_owner(station_id)) with check (is_owner(station_id));
create policy pumps_read on pumps for select to authenticated using (is_station_member(station_id) or has_access_grant(station_id));
create policy pumps_owner on pumps for all to authenticated using (is_owner(station_id)) with check (is_owner(station_id));
create policy nozzles_read on nozzles for select to authenticated using (is_station_member(station_id) or has_access_grant(station_id));
create policy nozzles_owner on nozzles for all to authenticated using (is_owner(station_id)) with check (is_owner(station_id));

create policy prices_read on prices for select to authenticated using (is_station_member(station_id));   -- publish via publish_price()
create policy availability_read on product_availability for select to authenticated using (is_station_member(station_id));
create policy availability_write on product_availability for all to authenticated
  using (has_station_role(station_id, array['owner', 'shift_manager']::member_role[]))
  with check (has_station_role(station_id, array['owner', 'shift_manager']::member_role[]) and updated_by = auth.uid());

-- ---------- companies ----------
create policy companies_read on company_accounts for select to authenticated using (is_station_staff(station_id));
create policy companies_write on company_accounts for all to authenticated
  using (has_station_role(station_id, array['owner', 'accountant']::member_role[]))
  with check (has_station_role(station_id, array['owner', 'accountant']::member_role[]));
create policy drivers_read on company_drivers for select to authenticated
  using (exists (select 1 from company_accounts c where c.id = company_account_id and is_station_staff(c.station_id)));
create policy drivers_write on company_drivers for all to authenticated
  using (exists (select 1 from company_accounts c where c.id = company_account_id and has_station_role(c.station_id, array['owner', 'accountant']::member_role[])))
  with check (exists (select 1 from company_accounts c where c.id = company_account_id and has_station_role(c.station_id, array['owner', 'accountant']::member_role[])));
create policy vehicles_customer on vehicles for all to authenticated
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy vehicles_company_read on vehicles for select to authenticated
  using (exists (select 1 from company_accounts c where c.id = company_account_id and is_station_staff(c.station_id)));
create policy vehicles_company_write on vehicles for all to authenticated
  using (exists (select 1 from company_accounts c where c.id = company_account_id and has_station_role(c.station_id, array['owner', 'accountant']::member_role[])))
  with check (exists (select 1 from company_accounts c where c.id = company_account_id and has_station_role(c.station_id, array['owner', 'accountant']::member_role[])));
create policy payments_read on company_payments for select to authenticated
  using (exists (select 1 from company_accounts c where c.id = company_account_id and is_station_staff(c.station_id)));

-- ---------- shifts & sales (writes via open_shift / record_sale / submit_shift RPCs) ----------
create policy shifts_read on shifts for select to authenticated
  using (attendant_id = auth.uid() or is_station_staff(station_id));
create policy readings_read on shift_readings for select to authenticated
  using (exists (select 1 from shifts s where s.id = shift_id and (s.attendant_id = auth.uid() or is_station_staff(s.station_id))));
create policy sales_read on sales for select to authenticated
  using (created_by = auth.uid() or customer_id = auth.uid() or is_station_staff(station_id));
create policy invoices_read on invoices for select to authenticated
  using (customer_id = auth.uid() or is_station_staff(station_id)
         or exists (select 1 from sales s where s.id = sale_id and s.created_by = auth.uid()));
create policy invoice_corrections_read on invoice_corrections for select to authenticated
  using (exists (select 1 from invoices i where i.id = invoice_id and (i.customer_id = auth.uid() or is_station_staff(i.station_id))));
create policy invoice_corrections_write on invoice_corrections for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from invoices i where i.id = invoice_id
              and has_station_role(i.station_id, array['owner', 'accountant']::member_role[])));

-- ---------- inventory (costs hidden from attendants) ----------
create policy suppliers_read on suppliers for select to authenticated using (is_station_staff(station_id));
create policy suppliers_write on suppliers for all to authenticated
  using (has_station_role(station_id, array['owner', 'accountant']::member_role[]))
  with check (has_station_role(station_id, array['owner', 'accountant']::member_role[]));
create policy deliveries_read on fuel_deliveries for select to authenticated using (is_station_staff(station_id));
create policy measurements_read on tank_measurements for select to authenticated using (is_station_staff(station_id));
create policy movements_read on inventory_movements for select to authenticated using (is_station_staff(station_id));

-- ---------- expenses & ledger ----------
create policy expenses_read on expenses for select to authenticated using (is_finance(station_id));
create policy expenses_draft_write on expenses for insert to authenticated
  with check (has_station_role(station_id, array['owner', 'accountant']::member_role[]) and status = 'draft' and created_by = auth.uid());
create policy expenses_draft_update on expenses for update to authenticated
  using (has_station_role(station_id, array['owner', 'accountant']::member_role[]) and status = 'draft')
  with check (status = 'draft');     -- posting goes through post_expense()

create policy accounts_read on accounts for select to authenticated using (is_finance(station_id));
create policy accounts_write on accounts for all to authenticated
  using (has_station_role(station_id, array['owner', 'accountant']::member_role[]))
  with check (has_station_role(station_id, array['owner', 'accountant']::member_role[]));
create policy periods_read on accounting_periods for select to authenticated using (is_finance(station_id));
create policy periods_insert on accounting_periods for insert to authenticated
  with check (has_station_role(station_id, array['owner', 'accountant']::member_role[]) and status = 'open');

create policy entries_read on journal_entries for select to authenticated using (is_finance(station_id));
create policy entries_manual_draft on journal_entries for insert to authenticated
  with check (has_station_role(station_id, array['owner', 'accountant']::member_role[]) and status = 'draft' and created_by = auth.uid());
create policy entries_manual_update on journal_entries for update to authenticated
  using (has_station_role(station_id, array['owner', 'accountant']::member_role[]) and status = 'draft')
  with check (has_station_role(station_id, array['owner', 'accountant']::member_role[]));   -- draft -> posted validated by trigger
create policy entries_draft_delete on journal_entries for delete to authenticated
  using (has_station_role(station_id, array['owner', 'accountant']::member_role[]) and status = 'draft');
create policy lines_read on journal_lines for select to authenticated using (is_finance(station_id));
create policy lines_write on journal_lines for all to authenticated
  using (has_station_role(station_id, array['owner', 'accountant']::member_role[]))
  with check (has_station_role(station_id, array['owner', 'accountant']::member_role[]));   -- trigger blocks posted parents

-- ---------- approvals ----------
create policy approvals_read on approval_requests for select to authenticated
  using (requested_by = auth.uid() or is_station_staff(station_id));

-- ---------- customers: loyalty, offers, complaints ----------
create policy loyalty_read on loyalty_ledger for select to authenticated
  using (customer_id = auth.uid() or is_finance(station_id));
create policy offers_read on offers for select to anon, authenticated using (is_active and ends_at > now());
create policy offers_owner on offers for all to authenticated using (is_owner(station_id)) with check (is_owner(station_id));

create policy complaints_read on complaints for select to authenticated
  using (customer_id = auth.uid()
         or has_station_role(station_id, array['owner', 'shift_manager']::member_role[])
         or (is_platform_staff() and status = 'escalated'));
create policy complaints_create on complaints for insert to authenticated
  with check (customer_id = auth.uid() and status = 'open');
create policy complaints_station_update on complaints for update to authenticated
  using (has_station_role(station_id, array['owner', 'shift_manager']::member_role[]) or is_platform_staff());
create policy complaint_messages_read on complaint_messages for select to authenticated
  using (exists (select 1 from complaints c where c.id = complaint_id));      -- inherits complaints RLS
create policy complaint_messages_write on complaint_messages for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from complaints c where c.id = complaint_id));

-- ---------- platform ----------
create policy plans_read on plans for select to anon, authenticated using (true);
create policy plans_admin on plans for all to authenticated using (is_platform_staff()) with check (is_platform_staff());
create policy subs_read on subscriptions for select to authenticated
  using (is_platform_staff() or exists (select 1 from stations s where s.organization_id = subscriptions.organization_id and is_owner(s.id)));
create policy subs_admin on subscriptions for all to authenticated using (is_platform_staff()) with check (is_platform_staff());
create policy tickets_read on support_tickets for select to authenticated
  using (is_platform_staff() or opened_by = auth.uid() or (station_id is not null and is_owner(station_id)));
create policy tickets_open on support_tickets for insert to authenticated
  with check (opened_by = auth.uid() and (station_id is null or is_station_member(station_id)));
create policy tickets_admin on support_tickets for update to authenticated using (is_platform_staff()) with check (is_platform_staff());
create policy flags_read on feature_flags for select to authenticated using (true);
create policy flags_admin on feature_flags for all to authenticated using (is_platform_staff()) with check (is_platform_staff());
create policy grants_read on access_grants for select to authenticated using (user_id = auth.uid() or is_owner(station_id) or is_platform_staff());
create policy grants_create on access_grants for insert to authenticated
  with check (is_platform_staff() and user_id = auth.uid() and expires_at <= now() + interval '24 hours');

create policy audit_read on audit_log for select to authenticated
  using ((station_id is not null and is_owner(station_id)) or is_platform_staff());

-- ---------- grants ----------
-- Supabase grants everything to anon/authenticated by default; RLS above is what protects rows.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke all on all tables in schema public from anon;
grant select on public_station_prices, plans, offers to anon;       -- guests: prices, availability, offers
revoke insert, update, delete on audit_log from authenticated;

-- Functions: nothing for anon; RPCs for signed-in users; internal helpers for nobody but the owner role.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;

-- internal helpers skip role checks by design; only SECURITY DEFINER code may call them
revoke execute on function post_entry(uuid, date, text, text, uuid, jsonb, uuid, text) from authenticated;
revoke execute on function apply_stock_adjustment(uuid, uuid, numeric, text, uuid) from authenticated;
revoke execute on function acct(uuid, text) from authenticated;
revoke execute on function company_balance(uuid) from authenticated;
revoke execute on function company_remaining_credit(uuid) from authenticated;
revoke execute on function tank_book_l(uuid) from authenticated;
revoke execute on function tank_avg_cost(uuid) from authenticated;
revoke execute on function fn_audit() from authenticated;
