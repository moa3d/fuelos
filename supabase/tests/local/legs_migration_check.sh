#!/usr/bin/env bash
# Proves migration 20260926000200_shift_legs keeps every existing shift intact:
# builds the database as it was BEFORE the migration, loads the pre-legs demo data (a frozen copy of seed.sql),
# records each shift's totals, applies the migration, and compares.
# Usage:  PGHOST=/tmp PGPORT=54329 PGUSER=postgres ./supabase/tests/local/legs_migration_check.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
DB=${DB:-fuelos_legs_check}
LEGS=supabase/migrations/20260926000200_shift_legs.sql
dropdb --if-exists "$DB" && createdb "$DB"
run() { psql -d "$DB" -X -q -v ON_ERROR_STOP=1 -f "$1"; }
run supabase/tests/local/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do
  [[ "$f" < "$LEGS" ]] || continue
  run "$f"
done
run supabase/tests/local/fixtures/seed_pre_legs.sql
run supabase/tests/local/legs_migration_before.sql
echo "migrate: $LEGS"; run "$LEGS"
run supabase/tests/local/legs_migration_after.sql
echo "LEGS MIGRATION CHECK PASSED"
