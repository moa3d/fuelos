-- =====================================================================
-- FuelOS — advisor fix after 20260925000100_attendant_pin_login.sql
-- lint 0011 function_search_path_mutable: give the two PIN policy helpers a fixed search_path,
-- like every other function in the schema.
-- =====================================================================
alter function pin_max_attempts()  set search_path = public, pg_temp;
alter function pin_lock_interval() set search_path = public, pg_temp;
