-- =====================================================================
-- FuelOS — fixes from the Supabase security advisor (first deploy, 2026-09-25)
-- =====================================================================

-- 1) Trigger functions get a fixed search_path (lint 0011 function_search_path_mutable).
alter function fn_forbid_change()       set search_path = public, pg_temp;
alter function fn_journal_entry_guard() set search_path = public, pg_temp;
alter function fn_journal_line_guard()  set search_path = public, pg_temp;
alter function fn_period_guard()        set search_path = public, pg_temp;
alter function fn_sale_guard()          set search_path = public, pg_temp;
alter function fn_invoice_guard()       set search_path = public, pg_temp;
alter function fn_shift_guard()         set search_path = public, pg_temp;

-- 2) INTENTIONAL, reviewed: public_station_prices is an owner-rights view (lint 0010 security_definer_view).
--    It is the ONLY way guests and customers read other stations' data, and it exposes public columns only
--    (name, city, currency, product, price + time, availability + source + time) for ACTIVE stations.
--    Do not add columns to it without a security review.
comment on view public_station_prices is
  'Public price board for guests and customers. Owner-rights on purpose; public columns of active stations only.';

-- 3) INTENTIONAL, reviewed: SECURITY DEFINER RPCs are executable by `authenticated` (lint 0029).
--    Each one starts with require_role()/an explicit NULL-safe ownership check; internal helpers that skip
--    checks (post_entry, apply_stock_adjustment, acct, company_balance, tank_avg_cost, ...) are revoked.
