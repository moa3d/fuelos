-- =====================================================================
-- FuelOS — devices report their offline queue (brief 02a, request 2)
-- The owner spots a stuck device from devices.pending_ops / last_sync_at (offline-sync skill).
-- Attendants have no update right on devices, so the app reports through this RPC.
-- =====================================================================
create function report_device_sync(p_device text, p_pending int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_station uuid;
begin
  select station_id into v_station from devices where id = p_device;
  if v_station is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'device';
  end if;
  perform require_role(v_station, array['attendant', 'shift_manager', 'owner', 'accountant']::member_role[]);
  if p_pending is null or p_pending < 0 then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_REQUEST', detail = 'pending must be >= 0';
  end if;
  update devices set pending_ops = p_pending, last_sync_at = now() where id = p_device;
end $$;

revoke execute on function report_device_sync(text, int) from public, anon;
grant execute on function report_device_sync(text, int) to authenticated, service_role;
