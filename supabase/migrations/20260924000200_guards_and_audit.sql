-- =====================================================================
-- FuelOS — integrity guards + audit trail
-- Spec rules enforced in the database (not only in the UI):
--   * no silent delete of financial movements; corrections are reversing entries with a reason
--   * a posted journal entry is immutable and must balance
--   * a closed accounting period cannot receive postings and cannot be reopened
--   * sensitive changes are written to an append-only audit log (who, when, what, why)
-- Errors use SQLSTATE P0001 and a stable code in MESSAGE ('FUELOS_...'); the apps map codes to Arabic text.
-- =====================================================================

-- ---------- generic: append-only tables ----------
create or replace function fn_forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = 'FUELOS_APPEND_ONLY',
    detail = format('%s rows cannot be %s; add a correcting row instead', tg_table_name, lower(tg_op));
end $$;

do $$
declare t text;
begin
  foreach t in array array['audit_log', 'inventory_movements', 'loyalty_ledger', 'invoice_corrections',
                           'company_payments', 'tank_measurements', 'complaint_messages']
  loop
    execute format('create trigger %I before update or delete on %I for each row execute function fn_forbid_change()',
                   t || '_append_only', t);
  end loop;
end $$;

-- ---------- journal entries ----------
create or replace function fn_journal_entry_guard() returns trigger
language plpgsql as $$
declare
  v_debit numeric; v_credit numeric; v_lines int;
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception using errcode = 'P0001', message = 'FUELOS_POSTED_IMMUTABLE', detail = 'posted entries cannot be deleted; reverse them';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'posted' then
      raise exception using errcode = 'P0001', message = 'FUELOS_POST_VIA_UPDATE', detail = 'insert as draft, add lines, then set status = posted';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.status = 'posted' then
    raise exception using errcode = 'P0001', message = 'FUELOS_POSTED_IMMUTABLE', detail = 'posted entries cannot be changed; create a reversing entry';
  end if;

  if new.status = 'posted' then
    select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
      into v_debit, v_credit, v_lines
      from journal_lines where entry_id = new.id;
    if v_lines < 2 or v_debit = 0 or v_debit <> v_credit then
      raise exception using errcode = 'P0001', message = 'FUELOS_UNBALANCED_ENTRY',
        detail = format('debit %s <> credit %s (lines: %s)', v_debit, v_credit, v_lines);
    end if;
    if exists (select 1 from accounting_periods p
               where p.station_id = new.station_id and p.status = 'closed'
                 and new.entry_date between p.starts_on and p.ends_on) then
      raise exception using errcode = 'P0001', message = 'FUELOS_PERIOD_CLOSED',
        detail = format('entry date %s is inside a closed period', new.entry_date);
    end if;
    perform pg_advisory_xact_lock(hashtext('journal_number:' || new.station_id::text));
    select coalesce(max(number), 0) + 1 into new.number from journal_entries where station_id = new.station_id;
    new.posted_at := now();
  end if;
  return new;
end $$;

create trigger journal_entries_guard
before insert or update or delete on journal_entries
for each row execute function fn_journal_entry_guard();

create or replace function fn_journal_line_guard() returns trigger
language plpgsql as $$
declare v_status entry_status;
begin
  select status into v_status from journal_entries
   where id = coalesce(new.entry_id, old.entry_id);
  if v_status = 'posted' then
    raise exception using errcode = 'P0001', message = 'FUELOS_POSTED_IMMUTABLE', detail = 'lines of a posted entry cannot change';
  end if;
  return coalesce(new, old);
end $$;

create trigger journal_lines_guard
before insert or update or delete on journal_lines
for each row execute function fn_journal_line_guard();

-- ---------- accounting periods ----------
create or replace function fn_period_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'closed' then
      raise exception using errcode = 'P0001', message = 'FUELOS_PERIOD_CLOSED', detail = 'closed periods cannot be deleted';
    end if;
    return old;
  end if;
  if old.status = 'closed' then
    raise exception using errcode = 'P0001', message = 'FUELOS_PERIOD_CLOSED', detail = 'closed periods cannot be reopened or edited; post an adjustment in an open period';
  end if;
  if new.status = 'closed' then
    if exists (select 1 from journal_entries e
               where e.station_id = new.station_id and e.status = 'draft'
                 and e.entry_date between new.starts_on and new.ends_on) then
      raise exception using errcode = 'P0001', message = 'FUELOS_DRAFTS_BLOCK_CLOSE', detail = 'post or discard draft entries in this period first';
    end if;
    new.closed_at := now();
  end if;
  return new;
end $$;

create trigger accounting_periods_guard
before update or delete on accounting_periods
for each row execute function fn_period_guard();

-- ---------- sales: no delete, financial fields frozen, only status moves ----------
create or replace function fn_sale_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'FUELOS_APPEND_ONLY', detail = 'void the sale with a reason instead of deleting it';
  end if;
  if (new.liters, new.unit_price, new.amount, new.payment_method, new.shift_id, new.nozzle_id,
      new.company_account_id, new.created_by, new.client_created_at)
     is distinct from
     (old.liters, old.unit_price, old.amount, old.payment_method, old.shift_id, old.nozzle_id,
      old.company_account_id, old.created_by, old.client_created_at) then
    raise exception using errcode = 'P0001', message = 'FUELOS_SALE_FROZEN', detail = 'financial fields of a sale cannot change; void and re-record';
  end if;
  if old.status = 'voided' and new.status <> 'voided' then
    raise exception using errcode = 'P0001', message = 'FUELOS_SALE_FROZEN', detail = 'a voided sale cannot be revived';
  end if;
  return new;
end $$;

create trigger sales_guard before update or delete on sales
for each row execute function fn_sale_guard();

-- ---------- invoices: never deleted; status moves forward ----------
create or replace function fn_invoice_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'FUELOS_APPEND_ONLY', detail = 'invoices are never deleted; cancel or correct them';
  end if;
  if (new.sale_id, new.number, new.station_id) is distinct from (old.sale_id, old.number, old.station_id) then
    raise exception using errcode = 'P0001', message = 'FUELOS_INVOICE_FROZEN';
  end if;
  return new;
end $$;

create trigger invoices_guard before update or delete on invoices
for each row execute function fn_invoice_guard();

-- ---------- shifts: no delete; allowed status transitions only ----------
create or replace function fn_shift_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'FUELOS_APPEND_ONLY', detail = 'shifts are never deleted';
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'open'      and new.status = 'submitted')
         or (old.status = 'reopened'  and new.status = 'submitted')
         or (old.status = 'submitted' and new.status in ('approved', 'rejected'))
         or (old.status = 'rejected'  and new.status = 'reopened')
         or (old.status = 'approved'  and new.status = 'reopened')) then
      raise exception using errcode = 'P0001', message = 'FUELOS_BAD_SHIFT_TRANSITION',
        detail = format('%s -> %s is not allowed', old.status, new.status);
    end if;
    if new.status = 'submitted' and (new.counted_cash is null or new.closed_at is null) then
      raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_INCOMPLETE', detail = 'counted cash and close time are required';
    end if;
    if new.status in ('approved', 'rejected') and new.decided_by is null then
      raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_INCOMPLETE', detail = 'decided_by is required';
    end if;
    if old.status = 'approved' and new.decision_note is null then
      raise exception using errcode = 'P0001', message = 'FUELOS_REASON_REQUIRED', detail = 'reopening an approved shift needs a note';
    end if;
  end if;
  return new;
end $$;

create trigger shifts_guard before update or delete on shifts
for each row execute function fn_shift_guard();

-- ---------- audit trail ----------
-- SECURITY DEFINER so users can write audit rows without having insert rights on audit_log.
create or replace function fn_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;
  insert into audit_log (actor_id, station_id, action, entity, entity_id, before, after, reason)
  values (auth.uid(),
          nullif(coalesce(v_row ->> 'station_id', case when tg_table_name = 'stations' then v_row ->> 'id' end), '')::uuid,
          lower(tg_op), tg_table_name,
          coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'key'),
          v_old, v_new,
          coalesce(v_row ->> 'reason', v_row ->> 'decision_note', v_row ->> 'diff_reason', v_row ->> 'void_reason'));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['stations', 'station_members', 'prices', 'product_availability', 'shifts', 'sales',
                           'company_accounts', 'journal_entries', 'accounting_periods', 'approval_requests',
                           'expenses', 'fuel_deliveries', 'access_grants', 'feature_flags', 'platform_staff']
  loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function fn_audit()',
                   t || '_audit', t);
  end loop;
end $$;
