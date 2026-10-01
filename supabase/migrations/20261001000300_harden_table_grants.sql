-- =====================================================================
-- FuelOS — pre-launch hardening (final review)
-- Supabase grants every public table to anon/authenticated by default and relies on RLS. RLS does not apply to
-- TRUNCATE, and the apps never need TRUNCATE / REFERENCES / TRIGGER, so take those away from the API roles
-- (now, and for tables created later). Reads and writes stay governed by RLS exactly as before.
-- =====================================================================
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
