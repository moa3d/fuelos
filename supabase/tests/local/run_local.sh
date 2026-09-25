#!/usr/bin/env bash
# Rebuild a throwaway database on a plain local Postgres 16 and run every test.
# Usage:  PGHOST=/tmp PGPORT=5432 PGUSER=postgres ./supabase/tests/local/run_local.sh
# (With the Supabase CLI you normally run `supabase db reset` instead; the tests in supabase/tests/*.sql
#  also run against that database: psql "$DB_URL" -f supabase/tests/<file>.sql)
set -euo pipefail
cd "$(dirname "$0")/../../.."
DB=${DB:-fuelos_test}
dropdb --if-exists "$DB" && createdb "$DB"
run() { psql -d "$DB" -X -q -v ON_ERROR_STOP=1 -f "$1"; }
run supabase/tests/local/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do echo "migrate: $f"; run "$f"; done
echo "seed: supabase/seed.sql"; run supabase/seed.sql
for f in supabase/tests/*.sql; do echo "test:  $f"; run "$f"; done
echo "ALL TESTS PASSED"
