-- =====================================================================
-- FuelOS — brief 07a: the office can see whether each device has a working credential
-- device_credentials stays unreadable by every client (secret_hash); this RPC exposes only a derived status.
-- =====================================================================

create or replace function station_devices(p_station uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform require_role(p_station, array['owner', 'shift_manager']::member_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'device_id', d.id,
      'label', d.label,
      'last_sync_at', d.last_sync_at,
      'pending_ops', d.pending_ops,
      'created_at', d.created_at,
      'credential_status', case when c.device_id is null then 'none'
                                when c.revoked_at is not null then 'revoked'
                                else 'active' end,
      'credential_issued_at', c.issued_at,
      'credential_revoked_at', c.revoked_at
    ) order by d.created_at, d.id)
    from devices d left join device_credentials c on c.device_id = d.id
    where d.station_id = p_station), '[]'::jsonb);
end $$;

revoke execute on function station_devices(uuid) from public, anon, authenticated;
grant execute on function station_devices(uuid) to authenticated, service_role;
