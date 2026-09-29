-- FuelOS — advisor lint 0011: pin search_path on the payments append-only guard (20260929000100).
alter function fn_subscription_payments_append_only() set search_path = public, pg_temp;
