-- =====================================================================
-- FuelOS — complaints, invoice corrections, team activity (briefs 04b and 04c)
--   1. complaint_messages: a message is written only by the case's customer (side 'customer'), its station's
--      owner / shift manager (side 'station') or platform staff (side 'platform') — the side must match the writer.
--   2. record_invoice_correction(): the correction row + invoices.status = 'corrected' in one step (owner/accountant).
--   3. escalate_overdue_complaints(): open cases past sla_due_at go to «مصعّدة» (platform); run by pg_cron every
--      15 minutes where pg_cron exists (Supabase), never callable from the apps.
--   4. station_members_activity(): last sign-in of the station's members (owner / accountant / shift manager).
--      accept_station_invites(): an invited person activates his own 'invited' memberships on sign-in.
-- =====================================================================

-- ---------- 1. complaint messages ----------
drop policy complaint_messages_write on complaint_messages;
create policy complaint_messages_write on complaint_messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from complaints c
                 where c.id = complaint_id
                   and (   (author_side = 'customer' and c.customer_id = (select auth.uid()))
                        or (author_side = 'station'  and has_station_role(c.station_id, array['owner', 'shift_manager']::member_role[]))
                        or (author_side = 'platform' and is_platform_staff()))));

-- ---------- 2. invoice correction ----------
create function record_invoice_correction(p_invoice uuid, p_reason text, p_amount_delta numeric) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  i invoices; v_id uuid;
begin
  select * into i from invoices where id = p_invoice for update;
  if i.id is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'invoice';
  end if;
  perform require_role(i.station_id, array['owner', 'accountant']::member_role[]);
  if coalesce(trim(p_reason), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REASON_REQUIRED';
  end if;
  if i.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'a cancelled invoice cannot be corrected';
  end if;
  insert into invoice_corrections (invoice_id, reason, amount_delta, created_by)
  values (p_invoice, trim(p_reason), coalesce(p_amount_delta, 0), auth.uid()) returning id into v_id;
  update invoices set status = 'corrected' where id = p_invoice;
  insert into audit_log (actor_id, station_id, action, entity, entity_id, before, after, reason)
  values (auth.uid(), i.station_id, 'correct_invoice', 'invoices', p_invoice::text,
          jsonb_build_object('status', i.status),
          jsonb_build_object('status', 'corrected', 'correction_id', v_id, 'amount_delta', p_amount_delta), trim(p_reason));
  return v_id;
end $$;

-- ---------- 3. escalation of overdue complaints ----------
create function escalate_overdue_complaints() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update complaints set status = 'escalated'
   where status in ('open', 'awaiting_station') and sla_due_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- every 15 minutes on Supabase (pg_cron); skipped where pg_cron is not available (plain Postgres test runs)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('fuelos-escalate-complaints', '*/15 * * * *', 'select public.escalate_overdue_complaints()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;

-- ---------- 4. team activity + accepting an invitation ----------
create function station_members_activity(p_station uuid)
returns table (user_id uuid, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform require_role(p_station, array['owner', 'accountant', 'shift_manager']::member_role[]);
  return query
    select m.user_id, u.last_sign_in_at
      from station_members m join auth.users u on u.id = m.user_id
     where m.station_id = p_station;
end $$;

-- An invited person (invite_station_member Edge Function) signs in, then the app calls this once.
-- Only the caller's own 'invited' rows move to 'active'; suspended members stay suspended.
create function accept_station_invites() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;
  update station_members set status = 'active' where user_id = auth.uid() and status = 'invited';
  get diagnostics n = row_count;
  return n;
end $$;

-- For the invite_station_member Edge Function (service role only): an existing account with this email, if any.
create function user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

-- ---------- grants ----------
revoke execute on function record_invoice_correction(uuid, text, numeric), station_members_activity(uuid),
                           accept_station_invites(), escalate_overdue_complaints()
  from public, anon;
revoke execute on function escalate_overdue_complaints(), user_id_by_email(text) from public, anon, authenticated;
grant execute on function record_invoice_correction(uuid, text, numeric), station_members_activity(uuid),
                          accept_station_invites()
  to authenticated, service_role;
grant execute on function escalate_overdue_complaints(), user_id_by_email(text) to service_role;
