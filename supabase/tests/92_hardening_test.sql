-- =====================================================================
-- FuelOS — API roles cannot TRUNCATE / REFERENCES / TRIGGER any public table (migration 20261001000300)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/92_hardening_test.sql
-- =====================================================================
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;
create function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin if p_cond is distinct from true then raise exception 'FAIL: %', p_label; end if; raise notice 'PASS  %', p_label; end $$;

select pg_temp.ok((select count(*) = 0 from information_schema.role_table_grants
                    where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
                  'no API role can truncate, reference or trigger a public table');
create table public.zz_future_table (id int);
select pg_temp.ok((select count(*) = 0 from information_schema.role_table_grants
                    where table_schema = 'public' and table_name = 'zz_future_table' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
                  'a table created later gets the same treatment');
\o
select 'PASS 92_hardening_test';
rollback;
