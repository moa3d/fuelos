# Shift Pump Legs — Database Implementation Plan (plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an attendant's shift span several pumps ("legs") in the database, the RPCs and the DB tests, then deploy that to the Supabase dev project, keeping every existing total identical.

**Architecture:**
- One new migration, `20260926000200_shift_legs.sql`, is built section by section across Tasks 1–4. It is applied to Supabase only in Task 8, after the whole local suite is green.
  1. It first adds `shift_legs` / `leg_readings` and backfills every existing shift as one leg (additive).
  2. Then it cuts over: it drops `shifts.pump_id` and `shift_readings`, and rewrites the shift RPCs on two internal helpers (`start_leg`, `end_leg`).
  3. Finally it adds `switch_pump` and `pump_board`.
- A second small migration, `20260926000300_device_sync_report.sql`, answers request 2 of `docs/briefs/02a-cowork-db-requests.md`.
- The worker-app screens (S1, move, S4–S7, outbox) are **plan 2**. It is written after Task 8, against the deployed signatures and the S1 code Claude Code already has.

**Tech Stack:**
- PostgreSQL 17 on Supabase (project `mpjcgarblfixceakyaxy`), plpgsql.
- Plain-psql tests run on the local PostgreSQL 16 harness (`supabase/tests/local/run_local.sh`).
- Supabase MCP (`apply_migration`, `execute_sql`, `get_advisors`, `list_migrations`).
- Remote-devices bridge to the owner's repo at `C:\Projects\fuelos`.

**Spec:** `docs/superpowers/specs/2026-09-26-shift-pump-legs-design.md` (approved 2026-09-26).

## Global Constraints

- **Executor and location:**
  - Claude in Cowork executes this plan in the cloud copy of the repo at `/home/claude/fuelos`.
  - Supabase is reached only through the Supabase MCP tools; the sandbox's shell cannot reach `*.supabase.co`.
  - The owner's repo is reached only through `device_stage_files` / `device_commit_files`; there is no shell on his computer.
  - Claude Code commits and pushes on the owner's computer.
- **Local Postgres:**
  - Start it with `su pgtest -c "/usr/lib/postgresql/16/bin/pg_ctl -D ~/pgdata -o '-k /tmp -p 54329 -c listen_addresses=' -l ~/pglog.txt start"`.
  - Every test command runs with `export PGHOST=/tmp PGPORT=54329 PGUSER=postgres` from `/home/claude/fuelos`.
- **RPC rules:**
  - Every RPC is `SECURITY DEFINER` with `set search_path = public, pg_temp`.
  - It checks the caller's role first.
  - It compares `auth.uid()` NULL-safely (`coalesce(x = auth.uid(), false)`).
- **Error codes:**
  - Errors are `SQLSTATE P0001` with a stable `FUELOS_*` code in `message`; permissions use `42501`.
  - New codes: `FUELOS_GAP_NOTE_REQUIRED`, `FUELOS_SHIFT_ALREADY_OPEN`, and `FUELOS_BAD_REQUEST` (device sync).
  - The Arabic texts belong to the app (plan 2):

    | Code | Arabic text |
    |---|---|
    | `FUELOS_GAP_NOTE_REQUIRED` | «القراءة أعلى من آخر قراءة مسجّلة — اكتب السبب» |
    | `FUELOS_SHIFT_ALREADY_OPEN` | «لديك مناوبة مفتوحة — أكملها أو أغلقها أولاً» |
    | `FUELOS_PUMP_BUSY` | «هذه المضخة مع زميل الآن» |
- **Client-generated UUIDs:**
  - Shift, leg and sale ids are generated on the device.
  - Every write RPC is replay-safe on its id (offline outbox, FIFO).
- **One price per shift:** `price_at(station, product, shift.opened_at)` applies to every leg.
- **Column types:** readings `numeric(14,1)`, liters `numeric(14,3)`, money `numeric(16,2)`.
- **Migrations:**
  - Never edit an applied migration. The new files are exactly `20260926000200_shift_legs.sql` and `20260926000300_device_sync_report.sql`.
  - After each `apply_migration`, set `supabase_migrations.schema_migrations.version` to the file's timestamp.
- **Existing tests:** the 107 existing tests stay green. The seed keeps going through the RPCs only.
- **Final test count:** 164 PASS lines in total: 107 existing + 52 in `30_shift_legs_test.sql` + 5 in `40_device_sync_test.sql`. The migration check passes too.
- **Breaking change:** deploying (Task 8) breaks the S1 screen Claude Code already built, because it calls the old `open_shift(p_shift_id, p_pump, …)`. It stays broken until plan 2 lands. This is the dev project only; tell the owner before deploying.
- **Language:** talk to the owner in Arabic, in short steps. He is not a developer.

## Review Focus

These are inputs the spec implies but its test list does not name. Each one has a test in the task that owns the code.

1. **Offline retries after the state moved on.** Two replays must return `replayed: true`, not an error that stops the queue:
   - `record_sale` replayed after its leg ended;
   - `switch_pump` replayed after the shift was submitted.
   → Task 2 (C) and Task 3 (F).
2. **A device clock behind the leg start at a move.** It must not trip the `ended_at >= started_at` check; the move is dated at the leg start. → Task 3 (F).
3. **A closing reading typed below the opening reading** (at a move or at close). It must give `FUELOS_READING_BELOW_LAST`, not a raw `23514` check violation that the app can only show as an internal error. → Task 2 (C).
4. **Reopening a shift when the owner of the shift or of the pump moved on:**
   - `FUELOS_SHIFT_ALREADY_OPEN` when the attendant has another open shift;
   - `FUELOS_PUMP_BUSY` when the last leg's pump is taken;
   - never a raw `23505`.
   → Task 2 (D).
5. **A readings entry without `opening_reading`** (a half-built offline payload). It must give `FUELOS_READING_MISSING`, not a NULL cast. → Task 2 (A).

**Deliberate additions beyond the spec text, flagged for review:**
- `leg_readings.gap_liters`. The spec asks for the gap to appear in the approval payload "with the liters per nozzle", and `last_reading` has already moved on by then, so the gap is stored at leg start.
- `pump_board.held_by_me`, so S1 can mark the attendant's own pump.
- `shift_summary.tanks[]`, which `decide_approval` uses for one stock movement per tank.

**Not in this plan:** brief 02a item 1b (`handover_cash` / `handover_from` on the pump board). It would show a colleague's counted cash to attendants and is not in the approved spec, so it waits for the owner's decision.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20260926000200_shift_legs.sql` | create (Tasks 1–4) | tables, backfill, cut-over, helpers, all shift RPCs, `switch_pump`, `pump_board` |
| `supabase/migrations/20260926000300_device_sync_report.sql` | create (Task 5) | `report_device_sync` |
| `supabase/tests/30_shift_legs_test.sql` | create (Tasks 2–4) | 52 rule tests (sections A–G) |
| `supabase/tests/40_device_sync_test.sql` | create (Task 5) | 5 tests |
| `supabase/tests/local/legs_migration_check.sh` | create (Task 1) | before/after proof that existing shifts keep identical totals |
| `supabase/tests/local/legs_migration_before.sql`, `legs_migration_after.sql` | create (Task 1) | snapshot and assertions for the check |
| `supabase/tests/local/fixtures/seed_pre_legs.sql` | create (Task 1) | frozen copy of today's `seed.sql` (old signatures) |
| `supabase/seed.sql`, `supabase/tests/10_business_rules_test.sql` | modify (Task 2) | new `open_shift` / `record_sale` signatures |
| `docs/data-model.md` | modify (Task 6) | ER diagram, lifecycle, rules, RPC table, error codes |
| `docs/superpowers/plans/2026-09-26-shift-pump-legs.md` | this file | |

**Signatures produced by this plan.** Plan 2 and the app depend on these; the names must match exactly.

```sql
open_shift(p_shift_id uuid, p_leg_id uuid, p_pump uuid, p_opening_cash numeric, p_readings jsonb,
           p_gap_note text default null, p_device text default null, p_client_created_at timestamptz default now()) returns uuid
switch_pump(p_shift uuid, p_new_leg_id uuid, p_closing jsonb, p_new_pump uuid, p_opening jsonb,
            p_gap_note text default null, p_device text default null, p_client_created_at timestamptz default now())
  returns jsonb  -- {leg_id, closed_leg_id, replayed:false} | {leg_id, replayed:true}
submit_shift(p_shift uuid, p_closing jsonb, p_counted_cash numeric, p_diff_reason text default null) returns jsonb  -- summary
shift_summary(p_shift uuid) returns jsonb
  -- {shift_id, liters, meter_sales, card, credit, voucher, opening_cash, expected_cash, counted_cash, cash_diff,
  --  nozzles:[{nozzle_id,tank_id,liters,price,amount}], tanks:[{tank_id,liters}],
  --  legs:[{leg_id,pump_id,pump_number,started_at,ended_at,gap_note,liters,amount,
  --         nozzles:[{nozzle_id,label,opening_reading,closing_reading,gap_liters,liters,amount}]}]}
record_sale(p_sale_id uuid, p_shift uuid, p_leg uuid, p_nozzle uuid, p_liters numeric, p_unit_price numeric,
            p_method payment_method, p_customer uuid default null, p_company uuid default null, p_driver uuid default null,
            p_vehicle uuid default null, p_odometer int default null, p_request_approval boolean default false,
            p_device text default null, p_client_created_at timestamptz default now()) returns jsonb
pump_board(p_station uuid) returns jsonb
  -- [{pump_id, number, name, held_by (display name | null), held_by_me,
  --   nozzles:[{nozzle_id,label,product_id,product_name,last_reading}]}]
report_device_sync(p_device text, p_pending int) returns void
-- readings payloads: opening [{nozzle_id, opening_reading, photo_path?}], closing [{nozzle_id, closing_reading, photo_path?}]
```

---

### Task 0: Sync the cloud copy and take a baseline

**Files:** none changed.

- [ ] **Step 1: Check that the owner's `supabase/` folder still matches the cloud copy**

  Call `device_list_dir` on `C:\Projects\fuelos\supabase` (recursive). Compare each file's `size` with `wc -c` of the same path under `/home/claude/fuelos/supabase`.

  - If any file differs, `device_stage_files` it and copy it over the cloud copy before continuing.
  - Expected today: identical (checked on 2026-09-26 16:20).

- [ ] **Step 2: Start Postgres and run the suite**

  Run:
  ```bash
  su pgtest -c "/usr/lib/postgresql/16/bin/pg_ctl -D ~/pgdata -o '-k /tmp -p 54329 -c listen_addresses=' -l ~/pglog.txt start" || true
  cd /home/claude/fuelos && export PGHOST=/tmp PGPORT=54329 PGUSER=postgres
  ./supabase/tests/local/run_local.sh > /tmp/run.txt 2>&1; echo exit $?; grep -c "NOTICE:  PASS" /tmp/run.txt
  ```
  Expected: `exit 0` and `107`.

- [ ] **Step 3: Make a local git baseline, used for review diffs only**

  ```bash
  cd /home/claude/fuelos && git init -q 2>/dev/null; git add -A && git commit -qm "baseline: repo as on the owner's computer" && git rev-parse --short HEAD
  ```
  Record the SHA as `BASE_SHA` for Task 7.

---

### Task 1: New tables and backfill (additive), with the migration check

**Files:**
- Create: `supabase/tests/local/fixtures/seed_pre_legs.sql` (a copy)
- Create: `supabase/tests/local/legs_migration_check.sh`
- Create: `supabase/tests/local/legs_migration_before.sql`
- Create: `supabase/tests/local/legs_migration_after.sql`
- Create: `supabase/migrations/20260926000200_shift_legs.sql` (sections 1–2)

**Interfaces:**
- Produces:
  - tables `shift_legs` (id, station_id, shift_id, pump_id, started_at, ended_at, gap_note, device_id, client_created_at, created_at);
  - table `leg_readings` (leg_id, nozzle_id, opening_reading, closing_reading, gap_liters, opening_photo_path, closing_photo_path);
  - column `sales.leg_id` (nullable in this task);
  - indexes `one_open_leg_per_pump` and `one_open_leg_per_shift`.
- The check script is re-run in Tasks 2 and 8.

- [ ] **Step 1: Freeze today's seed as the "before" fixture.** Do this before Task 2 changes `seed.sql`.

  ```bash
  cd /home/claude/fuelos && mkdir -p supabase/tests/local/fixtures && cp supabase/seed.sql supabase/tests/local/fixtures/seed_pre_legs.sql
  ```

- [ ] **Step 2: Write the check script `supabase/tests/local/legs_migration_check.sh`**, then `chmod +x` it.

```bash
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
```

- [ ] **Step 3: Write `supabase/tests/local/legs_migration_before.sql`**

```sql
-- Snapshot taken BEFORE migration 20260926000200_shift_legs (see legs_migration_check.sh).
do $$ begin perform set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', false); end $$;
create schema legs_check;
create table legs_check.shifts_before as
select s.id as shift_id, s.pump_id, s.status, s.opened_at, s.closed_at,
       shift_summary(s.id) as summary,
       (select jsonb_agg(jsonb_build_object('nozzle_id', r.nozzle_id, 'opening', r.opening_reading, 'closing', r.closing_reading)
                         order by r.nozzle_id) from shift_readings r where r.shift_id = s.id) as readings,
       (select count(*) from sales x where x.shift_id = s.id) as sales
  from shifts s;
-- the whole books must not move either
create table legs_check.books_before as
select (select md5(string_agg(concat_ws('|', l.entry_id, l.account_id, l.debit, l.credit), ',' order by l.id)) from journal_lines l) as journal,
       (select md5(string_agg(concat_ws('|', m.id, m.tank_id, m.liters), ',' order by m.id)) from inventory_movements m) as stock,
       (select md5(string_agg(concat_ws('|', n.id, n.last_reading), ',' order by n.id)) from nozzles n) as meters;
```

- [ ] **Step 4: Write `supabase/tests/local/legs_migration_after.sql`**

```sql
-- Checks run AFTER migration 20260926000200_shift_legs (see legs_migration_check.sh).
\set QUIET on
do $$ begin perform set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', false); end $$;
-- summary without the keys the migration adds, nozzles in a fixed order
create function legs_check.norm(p jsonb) returns jsonb language sql as $$
  select (p - 'legs' - 'tanks') || jsonb_build_object('nozzles',
         coalesce((select jsonb_agg(e order by e ->> 'nozzle_id') from jsonb_array_elements(p -> 'nozzles') e), '[]'::jsonb));
$$;
do $$
declare b record; v_legs int; lg shift_legs; v_readings jsonb;
begin
  if (select count(*) from legs_check.shifts_before) < 2 then
    raise exception 'FAIL: the fixture should hold at least 2 shifts';
  end if;
  for b in select * from legs_check.shifts_before loop
    select count(*) into v_legs from shift_legs where shift_id = b.shift_id;
    if v_legs <> 1 then raise exception 'FAIL: shift % has % legs, expected 1', b.shift_id, v_legs; end if;
    select * into lg from shift_legs where shift_id = b.shift_id;
    if lg.pump_id <> b.pump_id or lg.started_at <> b.opened_at then
      raise exception 'FAIL: leg of shift % has the wrong pump or start', b.shift_id;
    end if;
    if (b.status in ('open', 'reopened')) <> (lg.ended_at is null) then
      raise exception 'FAIL: leg of shift % open/closed does not match status %', b.shift_id, b.status;
    end if;
    select jsonb_agg(jsonb_build_object('nozzle_id', r.nozzle_id, 'opening', r.opening_reading, 'closing', r.closing_reading)
                     order by r.nozzle_id) into v_readings from leg_readings r where r.leg_id = lg.id;
    if v_readings is distinct from b.readings then
      raise exception 'FAIL: readings of shift % changed: % -> %', b.shift_id, b.readings, v_readings;
    end if;
    if (select count(*) from sales where shift_id = b.shift_id and leg_id = lg.id) <> b.sales then
      raise exception 'FAIL: sales of shift % not all linked to its leg', b.shift_id;
    end if;
    if legs_check.norm(shift_summary(b.shift_id)) is distinct from legs_check.norm(b.summary) then
      raise exception 'FAIL: totals of shift % changed: % -> %', b.shift_id, legs_check.norm(b.summary), legs_check.norm(shift_summary(b.shift_id));
    end if;
    raise notice 'PASS  shift % migrated as one leg with identical totals', b.shift_id;
  end loop;
  if exists (select 1 from sales where leg_id is null) then raise exception 'FAIL: a sale has no leg'; end if;
  if (select row(journal, stock, meters) from legs_check.books_before) is distinct from
     (select row(
       (select md5(string_agg(concat_ws('|', l.entry_id, l.account_id, l.debit, l.credit), ',' order by l.id)) from journal_lines l),
       (select md5(string_agg(concat_ws('|', m.id, m.tank_id, m.liters), ',' order by m.id)) from inventory_movements m),
       (select md5(string_agg(concat_ws('|', n.id, n.last_reading), ',' order by n.id)) from nozzles n))) then
    raise exception 'FAIL: journal, stock or meter readings changed during the migration';
  end if;
  raise notice 'PASS  journal, stock and meter readings unchanged';
end $$;
```

- [ ] **Step 5: Run the check. It must fail because the migration does not exist yet.**

  Run: `./supabase/tests/local/legs_migration_check.sh 2>&1 | tail -2`

  Expected: FAIL with `psql: error: supabase/migrations/20260926000200_shift_legs.sql: No such file or directory`.

- [ ] **Step 6: Create `supabase/migrations/20260926000200_shift_legs.sql` with sections 1–2**

```sql
-- =====================================================================
-- FuelOS — attendant shifts across several pumps ("pump legs")
-- Spec: docs/superpowers/specs/2026-09-26-shift-pump-legs-design.md
--   * a shift belongs to ONE attendant (cash stays with him) and is split into legs, one per pump worked
--   * one open leg per pump (Q4) and one open leg per shift (he holds one pump at a time)
--   * existing shifts become one-leg shifts; totals are unchanged (supabase/tests/local/legs_migration_check.sh)
-- =====================================================================

-- ---------- 1. new tables (additive) ----------
create table shift_legs (
  id                 uuid primary key,                -- generated on the device (idempotent sync)
  station_id         uuid not null references stations(id),
  shift_id           uuid not null,
  pump_id            uuid not null,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,                     -- null = the attendant is on this pump now
  gap_note           text,                            -- why the opening reading was above the last recorded one
  device_id          text references devices(id),
  client_created_at  timestamptz,
  created_at         timestamptz not null default now(),
  foreign key (station_id, shift_id) references shifts(station_id, id),
  foreign key (station_id, pump_id) references pumps(station_id, id),
  unique (station_id, id),
  check (ended_at is null or ended_at >= started_at)
);
create unique index one_open_leg_per_pump  on shift_legs (pump_id)  where ended_at is null;
create unique index one_open_leg_per_shift on shift_legs (shift_id) where ended_at is null;
create index shift_legs_shift_idx on shift_legs (shift_id, started_at);

create table leg_readings (
  leg_id              uuid not null references shift_legs(id),
  nozzle_id           uuid not null references nozzles(id),
  opening_reading     numeric(14,1) not null check (opening_reading >= 0),
  closing_reading     numeric(14,1),
  gap_liters          numeric(14,1) not null default 0 check (gap_liters >= 0),  -- opening − last_reading at leg start
  opening_photo_path  text,
  closing_photo_path  text,
  primary key (leg_id, nozzle_id),
  check (closing_reading is null or closing_reading >= opening_reading)
);

-- legs are never deleted (they carry the meter history)
create trigger shift_legs_no_delete before delete on shift_legs for each row execute function fn_forbid_change();
create trigger leg_readings_no_delete before delete on leg_readings for each row execute function fn_forbid_change();
create trigger shift_legs_audit after insert or update or delete on shift_legs for each row execute function fn_audit();

alter table shift_legs enable row level security;
alter table leg_readings enable row level security;
create policy legs_read on shift_legs for select to authenticated
  using (exists (select 1 from shifts s where s.id = shift_id and (s.attendant_id = auth.uid() or is_station_staff(s.station_id))));
create policy leg_readings_read on leg_readings for select to authenticated
  using (exists (select 1 from shift_legs l join shifts s on s.id = l.shift_id
                  where l.id = leg_id and (s.attendant_id = auth.uid() or is_station_staff(s.station_id))));
-- same pattern as the rls migration: table rights granted, RLS decides; no write policies => writes via RPCs only
revoke all on shift_legs, leg_readings from anon;
grant select, insert, update, delete on shift_legs, leg_readings to authenticated, service_role;

-- ---------- 2. existing data: every shift becomes one leg on its pump ----------
alter table sales add column leg_id uuid;

insert into shift_legs (id, station_id, shift_id, pump_id, started_at, ended_at, device_id, client_created_at, created_at)
select gen_random_uuid(), s.station_id, s.id, s.pump_id, s.opened_at,
       case when s.status in ('open', 'reopened') then null else greatest(coalesce(s.closed_at, s.opened_at), s.opened_at) end,
       s.device_id, s.client_created_at, s.created_at
  from shifts s;

insert into leg_readings (leg_id, nozzle_id, opening_reading, closing_reading, opening_photo_path, closing_photo_path)
select l.id, r.nozzle_id, r.opening_reading, r.closing_reading, r.opening_photo_path, r.closing_photo_path
  from shift_readings r join shift_legs l on l.shift_id = r.shift_id;

update sales x set leg_id = l.id from shift_legs l where l.shift_id = x.shift_id;
```

- [ ] **Step 7: Run the check and the full suite**

  Run:
  ```bash
  ./supabase/tests/local/legs_migration_check.sh 2>&1 | tail -4
  ./supabase/tests/local/run_local.sh > /tmp/run.txt 2>&1; echo exit $?; grep -c "NOTICE:  PASS" /tmp/run.txt
  ```
  Expected:
  - the check prints 3 `PASS` lines (shift …0a, shift …0b, journal/stock/meters) and `LEGS MIGRATION CHECK PASSED`;
  - the suite prints `exit 0` and `107`. The old RPCs still work because nothing was dropped yet.

- [ ] **Step 8: Commit**

  ```bash
  git add supabase && git commit -qm "feat(db): shift_legs + leg_readings, backfill existing shifts as one leg"
  ```

---

### Task 2: Cut-over — shift RPCs work on legs

**Files:**
- Modify: `supabase/migrations/20260926000200_shift_legs.sql` (append sections 3–9)
- Modify: `supabase/seed.sql` and `supabase/tests/10_business_rules_test.sql` (new signatures, through a script)
- Create: `supabase/tests/30_shift_legs_test.sql` (sections A–E)

**Interfaces:**
- Consumes: the tables from Task 1.
- Produces:
  - `open_shift`, `submit_shift`, `shift_summary`, `record_sale`, `decide_approval` and `reopen_shift`, with the exact signatures in the File map;
  - internal helpers, revoked from `authenticated`:
    - `start_leg(p_shift shifts, p_leg_id uuid, p_pump uuid, p_readings jsonb, p_gap_note text, p_device text, p_at timestamptz) returns void`
    - `end_leg(p_leg shift_legs, p_closing jsonb, p_at timestamptz) returns void`
  - index `one_open_shift_per_attendant`.
- Seed leg ids:
  - shift A → `77777777-0000-4000-8000-00000000000a`
  - shift B → `77777777-0000-4000-8000-00000000000b`

- [ ] **Step 1: Move the seed and the business-rule tests to the new signatures.** Save this as `/tmp/legs_signatures.py` and run it from the repo root: `python3 /tmp/legs_signatures.py`.

```python
# Moves supabase/seed.sql and supabase/tests/10_business_rules_test.sql to the new RPC signatures:
#   open_shift(p_shift_id, p_leg_id, p_pump, p_opening_cash, p_readings, p_gap_note, p_device, p_client_created_at)
#   record_sale(p_sale_id, p_shift, p_leg, p_nozzle, ...)
# Run from the repo root: python3 legs_signatures.py
import pathlib

def edit(path, pairs):
    p = pathlib.Path(path)
    s = p.read_text(encoding="utf-8")
    for old, new, count in pairs:
        found = s.count(old)
        if found != count:
            raise SystemExit(f"{path}: expected {count} match(es), found {found}: {old[:70]!r}")
        s = s.replace(old, new)
    p.write_text(s, encoding="utf-8")
    print("updated", path)

edit("supabase/seed.sql", [
    ("  v_shift_b uuid := '22222222-0000-4000-8000-00000000000b';\n",
     "  v_shift_b uuid := '22222222-0000-4000-8000-00000000000b';\n"
     "  v_leg_a   uuid := '77777777-0000-4000-8000-00000000000a';   -- each shift starts with one leg (pump) — see shift_legs\n"
     "  v_leg_b   uuid := '77777777-0000-4000-8000-00000000000b';\n", 1),
    ("  perform open_shift(v_shift_a, pump3, 5000, jsonb_build_array(jsonb_build_object('nozzle_id', n3, 'opening_reading', 184220.5)),\n"
     "                     'demo-tablet-01', v_opened);",
     "  perform open_shift(v_shift_a, v_leg_a, pump3, 5000, jsonb_build_array(jsonb_build_object('nozzle_id', n3, 'opening_reading', 184220.5)),\n"
     "                     null, 'demo-tablet-01', v_opened);", 1),
    ("v_shift_a, n3,", "v_shift_a, v_leg_a, n3,", 3),
    ("  perform open_shift(v_shift_b, pump1, 5000,", "  perform open_shift(v_shift_b, v_leg_b, pump1, 5000,", 1),
    ("                     'demo-phone-390', date_trunc('day', now()) + interval '6 hours');",
     "                     null, 'demo-phone-390', date_trunc('day', now()) + interval '6 hours');", 1),
    ("v_shift_b, n1a,", "v_shift_b, v_leg_b, n1a,", 1),
])

edit("supabase/tests/10_business_rules_test.sql", [
    ("'22222222-0000-4000-8000-00000000000b' as shift_b \\gset",
     "'22222222-0000-4000-8000-00000000000b' as shift_b,\n       '77777777-0000-4000-8000-00000000000b' as leg_b \\gset", 1),
    ("'select open_shift(gen_random_uuid(), %L, 0,", "'select open_shift(gen_random_uuid(), gen_random_uuid(), %L, 0,", 3),
    (":'shift_b', :'n1a'", ":'shift_b', :'leg_b', :'n1a'", 8),
    ("%L, %L, 5, 110, %L)', :'shift_b', :'n3'", "%L, %L, %L, 5, 110, %L)', :'shift_b', :'leg_b', :'n3'", 1),
    ("'select record_sale(gen_random_uuid(), %L, %L, 5, 110, %L)', :'shift_b', :'leg_b', :'n1a'",
     "'select record_sale(gen_random_uuid(), %L, %L, %L, 5, 110, %L)', :'shift_b', :'leg_b', :'n1a'", 1),
    ("'select record_sale(gen_random_uuid(), %L, %L, 100, 110, %L, p_company := %L)', :'shift_b', :'leg_b', :'n1a'",
     "'select record_sale(gen_random_uuid(), %L, %L, %L, 100, 110, %L, p_company := %L)', :'shift_b', :'leg_b', :'n1a'", 1),
    ("'select record_sale(gen_random_uuid(), %L, %L, 5, 110, %L, p_company := %L)', :'shift_b', :'leg_b', :'n1a'",
     "'select record_sale(gen_random_uuid(), %L, %L, %L, 5, 110, %L, p_company := %L)', :'shift_b', :'leg_b', :'n1a'", 1),
    ("format('insert into sales (id, station_id, shift_id, nozzle_id, liters, unit_price, amount, payment_method, created_by, client_created_at) "
     "values (gen_random_uuid(), %L, %L, %L, 1, 1, 1, %L, %L, now())',",
     "format('insert into sales (id, station_id, shift_id, leg_id, nozzle_id, liters, unit_price, amount, payment_method, created_by, client_created_at) "
     "values (gen_random_uuid(), %L, %L, %L, %L, 1, 1, 1, %L, %L, now())',", 1),
])
```

  Expected output: `updated supabase/seed.sql` and `updated supabase/tests/10_business_rules_test.sql`.

- [ ] **Step 2: Write `supabase/tests/30_shift_legs_test.sql` (sections A–E and the closing lines)**

```sql
-- =====================================================================
-- FuelOS — shifts across several pumps ("pump legs"), migration 20260926000200_shift_legs.sql
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/30_shift_legs_test.sql
-- Runs after migrations + seed.sql, in one transaction that is rolled back.
-- Seed state used here: خالد holds pump 1 (shift B, leg 7777…0b); محمد has no open shift; pumps 2–4 are free.
-- =====================================================================
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;
create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', case when p_user is null then '' else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true); $$;
create function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin if p_cond is distinct from true then raise exception 'FAIL: %', p_label; end if; raise notice 'PASS  %', p_label; end $$;
create function pg_temp.throws(p_sql text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm = p_expected or sqlstate = p_expected then raise notice 'PASS  % (%)', p_label, p_expected; return; end if;
    raise exception 'FAIL: % — expected %, got % / %', p_label, p_expected, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % — expected %, but no error', p_label, p_expected;
end $$;
create function pg_temp.balanced(p_station uuid) returns boolean language sql as $$
  select coalesce(sum(debit), 0) = coalesce(sum(credit), 0) from journal_lines where station_id = p_station;
$$;
-- opening readings of a pump at its nozzles' last_reading (+ p_plus liters on every nozzle)
create function pg_temp.opening(p_pump uuid, p_plus numeric default 0) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('nozzle_id', id, 'opening_reading', last_reading + p_plus)) from nozzles where pump_id = p_pump;
$$;
-- closing readings of a leg: opening + p_plus liters on every nozzle
create function pg_temp.closing(p_leg uuid, p_plus numeric default 0) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('nozzle_id', nozzle_id, 'closing_reading', opening_reading + p_plus)) from leg_readings where leg_id = p_leg;
$$;

select id as station from stations where name = 'محطة النور' \gset
select '11111111-0000-4000-8000-000000000001' as owner, '11111111-0000-4000-8000-000000000003' as mgr,
       '11111111-0000-4000-8000-000000000004' as khaled, '11111111-0000-4000-8000-000000000005' as mohamad,
       '22222222-0000-4000-8000-00000000000b' as shift_b, '77777777-0000-4000-8000-00000000000b' as leg_b,
       '88888888-0000-4000-8000-000000000001' as shift_m,  '88888888-0000-4000-8000-0000000000a1' as leg_m1,
       '88888888-0000-4000-8000-000000000002' as shift_m2, '88888888-0000-4000-8000-0000000000a2' as leg_m2,
       '88888888-0000-4000-8000-000000000003' as shift_g,  '88888888-0000-4000-8000-0000000000a3' as leg_g,
       '88888888-0000-4000-8000-000000000004' as shift_o,  '88888888-0000-4000-8000-0000000000a4' as leg_o,
       '88888888-0000-4000-8000-0000000000b2' as leg_k2,   '88888888-0000-4000-8000-0000000000b3' as leg_k3 \gset
select id as pump1 from pumps where station_id = :'station' and number = 1 \gset
select id as pump2 from pumps where station_id = :'station' and number = 2 \gset
select id as pump3 from pumps where station_id = :'station' and number = 3 \gset
select id as pump4 from pumps where station_id = :'station' and number = 4 \gset
select id as n2a from nozzles where pump_id = :'pump2' and label = 'بنزين 90' \gset
select id as n3 from nozzles where pump_id = :'pump3' \gset
select id as n4, last_reading as n4_last from nozzles where pump_id = :'pump4' \gset

-- =====================================================================
-- A. Open a shift = shift + its first leg
-- =====================================================================
select pg_temp.act_as(:'mohamad');
select open_shift(:'shift_m', :'leg_m1', :'pump2', 1000, pg_temp.opening(:'pump2'));
select pg_temp.ok((select count(*) = 1 and bool_and(pump_id = :'pump2' and ended_at is null) from shift_legs where shift_id = :'shift_m'),
                  'open_shift creates the shift and one open leg on the chosen pump');
select pg_temp.ok((select count(*) = 2 and bool_and(gap_liters = 0) from leg_readings where leg_id = :'leg_m1'),
                  'opening readings are stored per nozzle of the leg');
select pg_temp.ok(open_shift(:'shift_m', :'leg_m1', :'pump2', 1000, pg_temp.opening(:'pump2')) = :'shift_m'
                  and (select count(*) = 1 from shift_legs where shift_id = :'shift_m'), 'replaying open_shift is a no-op');
select pg_temp.throws(format('select open_shift(gen_random_uuid(), gen_random_uuid(), %L, 0, %L::jsonb)', :'pump3', pg_temp.opening(:'pump3')),
                      'FUELOS_SHIFT_ALREADY_OPEN', 'an attendant cannot open a second shift');

select pg_temp.act_as(:'mgr');
select pg_temp.throws(format('select open_shift(gen_random_uuid(), gen_random_uuid(), %L, 0, %L::jsonb)', :'pump2', pg_temp.opening(:'pump2')),
                      'FUELOS_PUMP_BUSY', 'a pump held by a colleague is refused');
select pg_temp.throws(format('select open_shift(gen_random_uuid(), gen_random_uuid(), %L, 0, %L::jsonb)', :'pump4',
                             jsonb_build_array(jsonb_build_object('nozzle_id', :'n4'))),
                      'FUELOS_READING_MISSING', 'a reading without opening_reading counts as missing');
select pg_temp.throws(format('select open_shift(%L, %L, %L, 0, %L::jsonb)', :'shift_g', :'leg_g', :'pump4', pg_temp.opening(:'pump4', 50)),
                      'FUELOS_GAP_NOTE_REQUIRED', 'opening above the last reading needs a note');
select open_shift(:'shift_g', :'leg_g', :'pump4', 0, pg_temp.opening(:'pump4', 50), 'المضخة عملت أثناء انقطاع الشبكة');
select pg_temp.ok((select gap_note = 'المضخة عملت أثناء انقطاع الشبكة' from shift_legs where id = :'leg_g')
                  and (select gap_liters = 50 from leg_readings where leg_id = :'leg_g'),
                  'with a note the leg opens and keeps the note and the 50 unrecorded liters');

-- =====================================================================
-- B. Sales are bound to the current leg
-- =====================================================================
select pg_temp.act_as(:'mohamad');
select pg_temp.throws(format('select record_sale(gen_random_uuid(), %L, %L, %L, 5, 125, %L)', :'shift_m', :'leg_m1', :'n3', 'card'),
                      'FUELOS_NOT_FOUND', 'a nozzle that is not on the leg''s pump is refused');
select pg_temp.throws(format('select record_sale(gen_random_uuid(), %L, %L, %L, 5, 110, %L)', :'shift_m', :'leg_b', :'n2a', 'card'),
                      'FUELOS_NOT_FOUND', 'a leg of another shift is refused');
select record_sale('99999999-0000-4000-8000-000000000001', :'shift_m', :'leg_m1', :'n2a', 10, 110, 'card');
select pg_temp.ok((select leg_id = :'leg_m1' from sales where id = '99999999-0000-4000-8000-000000000001'), 'the sale keeps its leg');
select pg_temp.throws($$update sales set leg_id = '77777777-0000-4000-8000-00000000000b' where id = '99999999-0000-4000-8000-000000000001'$$,
                      'FUELOS_SALE_FROZEN', 'the leg of a sale is frozen');

-- =====================================================================
-- C. Submit closes the current leg
-- =====================================================================
select pg_temp.throws(format('select submit_shift(%L, %L::jsonb, 0)', :'shift_m', pg_temp.closing(:'leg_m1', -1)),
                      'FUELOS_READING_BELOW_LAST', 'a closing reading below the opening reading is refused');
-- n2a sells 100 L x 110 = 11,000 (10 L of it by card = 1,100) => expected cash = 1,000 + 11,000 - 1,100 = 10,900
select submit_shift(:'shift_m', jsonb_build_array(jsonb_build_object('nozzle_id', :'n2a', 'closing_reading', 77220.0),
                                                  jsonb_build_object('nozzle_id', (select id from nozzles where pump_id = :'pump2' and label = 'بنزين 95'),
                                                                     'closing_reading', 51230.0)),
                    10900) as sum_m \gset
select pg_temp.ok((:'sum_m'::jsonb ->> 'cash_diff')::numeric = 0, 'expected cash = opening + meter sales - card');
select pg_temp.ok(jsonb_array_length(:'sum_m'::jsonb -> 'legs') = 1 and (:'sum_m'::jsonb -> 'legs' -> 0 ->> 'pump_number')::int = 2,
                  'the summary lists the leg with its pump number');
select pg_temp.ok((select ended_at is not null from shift_legs where id = :'leg_m1'), 'submit ends the current leg');
select pg_temp.ok((select last_reading = 77220.0 from nozzles where id = :'n2a'), 'the leg''s closing reading becomes the nozzle''s last reading');
select pg_temp.ok((select payload -> 'legs' is not null from approval_requests where ref_id = :'shift_m' and status = 'pending'),
                  'the approval payload carries the legs');
select pg_temp.ok((record_sale('99999999-0000-4000-8000-000000000001', :'shift_m', :'leg_m1', :'n2a', 10, 110, 'card') ->> 'replayed')::boolean,
                  'replaying a sale after its leg ended is still a no-op (offline retry)');

-- =====================================================================
-- D. Reopen reopens the LAST leg
-- =====================================================================
select pg_temp.act_as(:'owner');
select decide_approval((select id from approval_requests where ref_id = :'shift_m' and status = 'pending'), false, null, 'أعد العد');
select pg_temp.act_as(:'mohamad');
select open_shift(:'shift_m2', :'leg_m2', :'pump3', 0, pg_temp.opening(:'pump3'));
select pg_temp.act_as(:'owner');
select pg_temp.throws(format('select reopen_shift(%L, %L)', :'shift_m', 'تصحيح'), 'FUELOS_SHIFT_ALREADY_OPEN',
                      'reopen is refused while the attendant has another open shift');
select open_shift(:'shift_o', :'leg_o', :'pump2', 0, pg_temp.opening(:'pump2'));
select pg_temp.throws(format('select reopen_shift(%L, %L)', :'shift_m', 'تصحيح'), 'FUELOS_PUMP_BUSY',
                      'reopen is refused while the last leg''s pump is taken');
select submit_shift(:'shift_o', pg_temp.closing(:'leg_o'), 0);
select pg_temp.act_as(:'mohamad');
select submit_shift(:'shift_m2', pg_temp.closing(:'leg_m2'), 0);
select pg_temp.act_as(:'owner');
select reopen_shift(:'shift_m', 'تصحيح');
select pg_temp.ok((select ended_at is null from shift_legs where id = :'leg_m1')
                  and (select status = 'reopened' from shifts where id = :'shift_m'), 'reopen puts the last leg back on its pump');

-- =====================================================================
-- E. Row Level Security and internal helpers
-- =====================================================================
set local role authenticated;
select pg_temp.act_as(:'khaled');
select pg_temp.ok((select count(*) = 1 and bool_and(id = :'leg_b') from shift_legs), 'attendant: sees only his own legs');
select pg_temp.ok((select bool_and(leg_id = :'leg_b') from leg_readings), 'attendant: sees only his own leg readings');
select pg_temp.throws(format('insert into shift_legs (id, station_id, shift_id, pump_id) values (gen_random_uuid(), %L, %L, %L)',
                             :'station', :'shift_b', :'pump3'), '42501', 'attendant: no direct writes to legs (RPC only)');
select pg_temp.throws(format('select start_leg(null::shifts, gen_random_uuid(), %L, %L::jsonb, null, null, now())', :'pump3', '[]'),
                      '42501', 'internal start_leg is not callable');
select pg_temp.throws(format('select end_leg(null::shift_legs, %L::jsonb, now())', '[]'), '42501', 'internal end_leg is not callable');
select pg_temp.act_as(:'mgr');
select pg_temp.ok((select count(*) >= 5 from shift_legs), 'shift manager: sees every leg of the station');
reset role;

\o
select 'ALL SHIFT-LEG TESTS PASSED' as result;
rollback;
```

- [ ] **Step 3: Run the suite. It must fail because the new signatures do not exist yet.**

  Run: `./supabase/tests/local/run_local.sh 2>&1 | grep -m1 ERROR`

  Expected: `psql:supabase/seed.sql:182: ERROR:  function open_shift(uuid, uuid, uuid, integer, jsonb, unknown, unknown, timestamp with time zone) does not exist`

- [ ] **Step 4: Append sections 3–9 to the migration**

  Add these to the end of `supabase/migrations/20260926000200_shift_legs.sql`, keeping one blank line before them:

```sql
-- ---------- 3. cut-over: the shift no longer owns a pump ----------
alter table sales alter column leg_id set not null;
alter table sales add constraint sales_leg_fk foreign key (station_id, leg_id) references shift_legs(station_id, id);
create index sales_leg_idx on sales (leg_id);
drop table shift_readings;
drop index one_open_shift_per_pump;
alter table shifts drop column pump_id;
-- one open shift per attendant per station: his cash stays with him until he closes (Q2)
create unique index one_open_shift_per_attendant on shifts (station_id, attendant_id) where status in ('open', 'reopened');

-- the leg of a sale is frozen like its other financial fields
create or replace function fn_sale_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'FUELOS_APPEND_ONLY', detail = 'void the sale with a reason instead of deleting it';
  end if;
  if (new.liters, new.unit_price, new.amount, new.payment_method, new.shift_id, new.leg_id, new.nozzle_id,
      new.company_account_id, new.created_by, new.client_created_at)
     is distinct from
     (old.liters, old.unit_price, old.amount, old.payment_method, old.shift_id, old.leg_id, old.nozzle_id,
      old.company_account_id, old.created_by, old.client_created_at) then
    raise exception using errcode = 'P0001', message = 'FUELOS_SALE_FROZEN', detail = 'financial fields of a sale cannot change; void and re-record';
  end if;
  if old.status = 'voided' and new.status <> 'voided' then
    raise exception using errcode = 'P0001', message = 'FUELOS_SALE_FROZEN', detail = 'a voided sale cannot be revived';
  end if;
  return new;
end $$;

-- ---------- 4. internal helpers (not callable through the API) ----------
-- Opens leg p_leg_id of shift p_shift on p_pump and stores its opening readings.
-- p_readings: [{"nozzle_id": "...", "opening_reading": 184220.5, "photo_path": "..."}] — one per active nozzle of the pump.
-- Opening < last_reading => FUELOS_READING_BELOW_LAST. Opening > last_reading => unrecorded liters => p_gap_note required.
create or replace function start_leg(p_shift shifts, p_leg_id uuid, p_pump uuid, p_readings jsonb, p_gap_note text,
                                     p_device text, p_at timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n nozzles; r jsonb; v_open numeric; v_gaps text[] := '{}'; v_constraint text;
begin
  if not exists (select 1 from pumps where id = p_pump and station_id = p_shift.station_id and is_active) then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'pump';
  end if;
  begin
    insert into shift_legs (id, station_id, shift_id, pump_id, started_at, gap_note, device_id, client_created_at)
    values (p_leg_id, p_shift.station_id, p_shift.id, p_pump, p_at, nullif(trim(p_gap_note), ''), p_device, p_at);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'one_open_leg_per_pump' then
      raise exception using errcode = 'P0001', message = 'FUELOS_PUMP_BUSY', detail = 'another attendant is on this pump';
    end if;
    raise exception using errcode = 'P0001', message = 'FUELOS_ID_CONFLICT', detail = v_constraint;
  end;

  for n in select * from nozzles where pump_id = p_pump and is_active order by label loop
    r := null;
    select value into r from jsonb_array_elements(coalesce(p_readings, '[]'::jsonb))
     where value ->> 'nozzle_id' = n.id::text limit 1;
    if r is null or r ->> 'opening_reading' is null then
      raise exception using errcode = 'P0001', message = 'FUELOS_READING_MISSING', detail = n.id::text;
    end if;
    v_open := (r ->> 'opening_reading')::numeric;
    if v_open < n.last_reading then
      raise exception using errcode = 'P0001', message = 'FUELOS_READING_BELOW_LAST',
        detail = format('nozzle %s: %s < last %s', n.label, v_open, n.last_reading);
    end if;
    if v_open > n.last_reading then
      v_gaps := v_gaps || format('%s: %s L', n.label, v_open - n.last_reading);
    end if;
    insert into leg_readings (leg_id, nozzle_id, opening_reading, gap_liters, opening_photo_path)
    values (p_leg_id, n.id, v_open, v_open - n.last_reading, r ->> 'photo_path');
  end loop;

  if cardinality(v_gaps) > 0 and coalesce(trim(p_gap_note), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_GAP_NOTE_REQUIRED', detail = array_to_string(v_gaps, ', ');
  end if;
end $$;

-- Stores the closing readings of leg p_leg, ends it at p_at and moves the nozzles' last_reading forward
-- (skipped when a leg created later already exists on that pump, e.g. when a rejected shift is corrected afterwards;
-- server arrival order, not device clocks, decides what "later" means).
-- p_closing: [{"nozzle_id": "...", "closing_reading": 191640.0, "photo_path": "..."}]
create or replace function end_leg(p_leg shift_legs, p_closing jsonb, p_at timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r jsonb; lr leg_readings;
begin
  for r in select * from jsonb_array_elements(coalesce(p_closing, '[]'::jsonb)) loop
    select * into lr from leg_readings where leg_id = p_leg.id and nozzle_id::text = r ->> 'nozzle_id';
    continue when lr.leg_id is null or r ->> 'closing_reading' is null;
    if (r ->> 'closing_reading')::numeric < lr.opening_reading then
      raise exception using errcode = 'P0001', message = 'FUELOS_READING_BELOW_LAST',
        detail = format('closing %s < opening %s', r ->> 'closing_reading', lr.opening_reading);
    end if;
    update leg_readings
       set closing_reading = (r ->> 'closing_reading')::numeric, closing_photo_path = r ->> 'photo_path'
     where leg_id = p_leg.id and nozzle_id = lr.nozzle_id;
  end loop;
  if exists (select 1 from leg_readings where leg_id = p_leg.id and closing_reading is null) then
    raise exception using errcode = 'P0001', message = 'FUELOS_READING_MISSING', detail = 'closing reading';
  end if;

  update shift_legs set ended_at = greatest(p_at, started_at) where id = p_leg.id;
  update nozzles nzl set last_reading = lr2.closing_reading
    from leg_readings lr2
   where lr2.leg_id = p_leg.id and lr2.nozzle_id = nzl.id
     and not exists (select 1 from shift_legs later where later.pump_id = p_leg.pump_id and later.created_at > p_leg.created_at);
end $$;

-- ---------- 5. shift RPCs ----------
drop function open_shift(uuid, uuid, numeric, jsonb, text, timestamptz);
create function open_shift(p_shift_id uuid, p_leg_id uuid, p_pump uuid, p_opening_cash numeric, p_readings jsonb,
                           p_gap_note text default null, p_device text default null,
                           p_client_created_at timestamptz default now())
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_station uuid; v_existing shifts; sh shifts; v_at timestamptz := coalesce(p_client_created_at, now()); v_constraint text;
begin
  select station_id into v_station from pumps where id = p_pump and is_active;
  if v_station is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'pump';
  end if;
  perform require_role(v_station, array['attendant', 'shift_manager', 'owner']::member_role[]);

  select * into v_existing from shifts where id = p_shift_id;
  if v_existing.id is not null then                              -- idempotent replay from the offline outbox
    if v_existing.attendant_id is distinct from auth.uid() then
      raise exception using errcode = 'P0001', message = 'FUELOS_ID_CONFLICT';
    end if;
    return v_existing.id;
  end if;

  begin
    insert into shifts (id, station_id, attendant_id, opening_cash, device_id, client_created_at, opened_at)
    values (p_shift_id, v_station, auth.uid(), coalesce(p_opening_cash, 0), p_device, v_at, v_at)
    returning * into sh;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'one_open_shift_per_attendant' then
      raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_ALREADY_OPEN';
    end if;
    raise exception using errcode = 'P0001', message = 'FUELOS_ID_CONFLICT', detail = v_constraint;
  end;
  perform start_leg(sh, p_leg_id, p_pump, p_readings, p_gap_note, p_device, v_at);
  return p_shift_id;
end $$;

-- Meter-based totals over all legs. One price per product per shift: the price in force when the shift opened.
-- Returns the old keys (liters, meter_sales, card, credit, voucher, opening_cash, expected_cash, counted_cash,
-- cash_diff, nozzles[]) plus tanks[] (liters per tank, used for stock) and legs[] (pump, times, gap note, readings).
create or replace function shift_summary(p_shift uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  sh shifts; v_liters numeric; v_sales numeric; v_card numeric; v_credit numeric; v_voucher numeric;
  v_expected numeric; v_nozzles jsonb; v_tanks jsonb; v_legs jsonb;
begin
  select * into sh from shifts where id = p_shift;
  if sh.id is null then raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'shift'; end if;
  -- NULL-safe: an anonymous caller (auth.uid() is null) must fail, not slip through a NULL comparison
  if not (coalesce(sh.attendant_id = auth.uid(), false)
          or has_station_role(sh.station_id, array['owner', 'accountant', 'shift_manager']::member_role[])
          or has_access_grant(sh.station_id)) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;

  with rows as (
    select l.id as leg_id, lr.nozzle_id, nz.label, t.id as tank_id, lr.opening_reading, lr.closing_reading, lr.gap_liters,
           coalesce(lr.closing_reading, lr.opening_reading) - lr.opening_reading as liters,
           price_at(sh.station_id, t.product_id, sh.opened_at) as price
      from shift_legs l join leg_readings lr on lr.leg_id = l.id
      join nozzles nz on nz.id = lr.nozzle_id join tanks t on t.id = nz.tank_id
     where l.shift_id = p_shift),
  priced as (select rows.*, round(rows.liters * coalesce(rows.price, 0), 2) as amount from rows)
  select coalesce(sum(priced.liters), 0), coalesce(sum(priced.amount), 0),
         coalesce((select jsonb_agg(jsonb_build_object('nozzle_id', z.nozzle_id, 'tank_id', z.tank_id, 'liters', z.liters,
                                                       'price', z.price, 'amount', z.amount) order by z.nozzle_id)
                     from (select nozzle_id, tank_id, price, sum(liters) as liters, sum(amount) as amount
                             from priced group by nozzle_id, tank_id, price) z), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('tank_id', z.tank_id, 'liters', z.liters) order by z.tank_id)
                     from (select tank_id, sum(liters) as liters from priced group by tank_id) z), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object(
                            'leg_id', l.id, 'pump_id', l.pump_id, 'pump_number', p.number,
                            'started_at', l.started_at, 'ended_at', l.ended_at, 'gap_note', l.gap_note,
                            'liters', coalesce(g.liters, 0), 'amount', coalesce(g.amount, 0),
                            'nozzles', coalesce(g.nozzles, '[]'::jsonb)) order by l.started_at, l.created_at)
                     from shift_legs l join pumps p on p.id = l.pump_id
                     left join (select leg_id, sum(liters) as liters, sum(amount) as amount,
                                       jsonb_agg(jsonb_build_object('nozzle_id', nozzle_id, 'label', label,
                                                   'opening_reading', opening_reading, 'closing_reading', closing_reading,
                                                   'gap_liters', gap_liters, 'liters', liters, 'amount', amount)
                                                 order by label) as nozzles
                                  from priced group by leg_id) g on g.leg_id = l.id
                    where l.shift_id = p_shift), '[]'::jsonb)
    into v_liters, v_sales, v_nozzles, v_tanks, v_legs
    from priced;

  select coalesce(sum(amount) filter (where payment_method = 'card'), 0),
         coalesce(sum(amount) filter (where payment_method = 'credit'), 0),
         coalesce(sum(amount) filter (where payment_method = 'voucher'), 0)
    into v_card, v_credit, v_voucher
    from sales where shift_id = p_shift and status <> 'voided';
  v_expected := sh.opening_cash + v_sales - v_card - v_credit - v_voucher;
  return jsonb_build_object(
    'shift_id', p_shift, 'liters', v_liters, 'meter_sales', v_sales,
    'card', v_card, 'credit', v_credit, 'voucher', v_voucher,
    'opening_cash', sh.opening_cash, 'expected_cash', v_expected,
    'counted_cash', sh.counted_cash, 'cash_diff', case when sh.counted_cash is null then null else sh.counted_cash - v_expected end,
    'nozzles', v_nozzles, 'tanks', v_tanks, 'legs', v_legs);
end $$;

-- p_closing: closing readings of the CURRENT pump: [{"nozzle_id": "...", "closing_reading": 191640.0, "photo_path": "..."}]
create or replace function submit_shift(p_shift uuid, p_closing jsonb, p_counted_cash numeric, p_diff_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sh shifts; st stations; lg shift_legs; v_sum jsonb; v_diff numeric;
begin
  select * into sh from shifts where id = p_shift for update;
  if sh.id is null then raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND'; end if;
  if not ((coalesce(sh.attendant_id = auth.uid(), false) and is_station_member(sh.station_id))
          or has_station_role(sh.station_id, array['owner', 'shift_manager']::member_role[])) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;
  if sh.status not in ('open', 'reopened') then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_SHIFT_TRANSITION', detail = sh.status::text;
  end if;
  select * into st from stations where id = sh.station_id;

  select * into lg from shift_legs where shift_id = p_shift and ended_at is null for update;
  if lg.id is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'open leg';
  end if;
  perform end_leg(lg, p_closing, now());

  update shifts set counted_cash = p_counted_cash, closed_at = now() where id = p_shift;
  v_sum  := shift_summary(p_shift);
  v_diff := (v_sum ->> 'cash_diff')::numeric;
  if abs(v_diff) > st.cash_tolerance and coalesce(trim(p_diff_reason), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REASON_REQUIRED',
      detail = format('cash difference %s exceeds tolerance %s', v_diff, st.cash_tolerance);
  end if;

  update shifts set status = 'submitted', diff_reason = p_diff_reason where id = p_shift;
  insert into approval_requests (station_id, type, ref_table, ref_id, payload, requested_by)
  values (sh.station_id, 'shift_close', 'shifts', p_shift, v_sum, auth.uid());
  return v_sum;
end $$;

-- ---------- 6. sales: bound to the leg the device knew ----------
drop function record_sale(uuid, uuid, uuid, numeric, numeric, payment_method, uuid, uuid, uuid, uuid, int, boolean, text, timestamptz);
create function record_sale(p_sale_id uuid, p_shift uuid, p_leg uuid, p_nozzle uuid, p_liters numeric, p_unit_price numeric,
                            p_method payment_method, p_customer uuid default null, p_company uuid default null,
                            p_driver uuid default null, p_vehicle uuid default null, p_odometer int default null,
                            p_request_approval boolean default false, p_device text default null,
                            p_client_created_at timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sh shifts; lg shift_legs; v_amount numeric; v_status sale_status := 'recorded'; v_remaining numeric; c company_accounts;
  v_invoice uuid; v_number bigint; v_req uuid; v_price numeric; v_existing sales;
begin
  select * into sh from shifts where id = p_shift;
  if sh.id is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_NOT_OPEN';
  end if;
  if coalesce(sh.attendant_id = auth.uid(), false) then
    perform require_role(sh.station_id, array['attendant', 'shift_manager', 'owner']::member_role[]);
  else
    perform require_role(sh.station_id, array['owner', 'shift_manager']::member_role[]);
  end if;

  select * into v_existing from sales where id = p_sale_id;       -- idempotent replay from the offline outbox
  if v_existing.id is not null then
    if v_existing.created_by is distinct from auth.uid() or v_existing.shift_id <> p_shift
       or v_existing.leg_id is distinct from p_leg then
      raise exception using errcode = 'P0001', message = 'FUELOS_ID_CONFLICT';
    end if;
    return jsonb_build_object('sale_id', p_sale_id, 'replayed', true, 'amount', v_existing.amount, 'status', v_existing.status);
  end if;

  if sh.status not in ('open', 'reopened') then
    raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_NOT_OPEN';
  end if;
  -- the leg must be this shift's CURRENT leg and the nozzle must be on its pump;
  -- the price is the server price at shift open (one price per shift)
  select * into lg from shift_legs where id = p_leg and shift_id = p_shift and ended_at is null;
  select price_at(sh.station_id, t.product_id, sh.opened_at) into v_price
    from nozzles n join tanks t on t.id = n.tank_id
   where n.id = p_nozzle and n.pump_id = lg.pump_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'nozzle is not on the current pump';
  end if;
  if v_price is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NO_PRICE';
  end if;
  v_amount := round(p_liters * v_price, 2);

  if p_method = 'credit' then
    select * into c from company_accounts where id = p_company and station_id = sh.station_id;
    if c.id is null then raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'company'; end if;
    if c.status <> 'active' then
      raise exception using errcode = 'P0001', message = 'FUELOS_COMPANY_' || upper(c.status::text);
    end if;
    if p_driver is not null and not exists (select 1 from company_drivers where id = p_driver and company_account_id = c.id and is_authorized) then
      raise exception using errcode = 'P0001', message = 'FUELOS_DRIVER_NOT_AUTHORIZED';
    end if;
    v_remaining := company_remaining_credit(c.id);
    if v_amount > v_remaining then
      if not p_request_approval then
        raise exception using errcode = 'P0001', message = 'FUELOS_CREDIT_LIMIT',
          detail = json_build_object('remaining', v_remaining, 'possible_liters', floor(v_remaining / v_price))::text;
      end if;
      v_status := 'pending_approval';
    end if;
  end if;

  insert into sales (id, station_id, shift_id, leg_id, nozzle_id, liters, unit_price, amount, payment_method, customer_id,
                     company_account_id, driver_id, vehicle_id, odometer_km, status, created_by, device_id, client_created_at)
  values (p_sale_id, sh.station_id, p_shift, p_leg, p_nozzle, p_liters, v_price, v_amount, p_method, p_customer,
          p_company, p_driver, p_vehicle, p_odometer, v_status, auth.uid(), p_device, p_client_created_at);

  if v_status = 'pending_approval' then
    insert into approval_requests (station_id, type, ref_table, ref_id, payload, requested_by)
    values (sh.station_id, 'credit_over_limit', 'sales', p_sale_id,
            jsonb_build_object('company', c.name, 'amount', v_amount, 'remaining', v_remaining), auth.uid())
    returning id into v_req;
  end if;

  -- invoice for linked customers and company fills; confirmed when the shift is approved
  if p_customer is not null or p_method = 'credit' then
    perform pg_advisory_xact_lock(hashtext('invoice_number:' || sh.station_id::text));
    select coalesce(max(number), 0) + 1 into v_number from invoices where station_id = sh.station_id;
    insert into invoices (station_id, sale_id, number, customer_id, status)
    values (sh.station_id, p_sale_id, v_number, p_customer, 'pending') returning id into v_invoice;
  end if;

  return jsonb_build_object('sale_id', p_sale_id, 'amount', v_amount, 'unit_price', v_price, 'status', v_status,
                            'price_adjusted', p_unit_price is distinct from v_price,
                            'invoice_id', v_invoice, 'approval_id', v_req);
end $$;

-- ---------- 7. approvals: stock per tank across all legs ----------
-- p_option for shift_close: 'shortage_to_expense' (default) | 'shortage_to_employee'
create or replace function decide_approval(p_request uuid, p_approve boolean, p_option text default null, p_note text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ar approval_requests; sh shifts; v_sum jsonb; v_diff numeric; v_cash_in numeric; tk jsonb; v_cost numeric;
  v_cogs numeric := 0; v_missing_cost boolean := false; m tank_measurements; v_pumps text; v_pump_count int;
begin
  select * into ar from approval_requests where id = p_request for update;
  if ar.id is null or ar.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'no pending request';
  end if;
  if ar.type = 'stock_adjustment' then
    perform require_role(ar.station_id, array['owner', 'shift_manager']::member_role[]);
  else
    perform require_role(ar.station_id, array['owner']::member_role[]);
  end if;
  if coalesce(trim(p_note), '') = '' and not p_approve then
    raise exception using errcode = 'P0001', message = 'FUELOS_REASON_REQUIRED', detail = 'rejections need a note';
  end if;

  update approval_requests
     set status = case when p_approve then 'approved'::approval_status else 'rejected'::approval_status end,
         decided_by = auth.uid(), decided_at = now(), decision_option = p_option, decision_note = p_note
   where id = p_request;

  if ar.type = 'shift_close' then
    select * into sh from shifts where id = ar.ref_id for update;
    if not p_approve then
      update shifts set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = sh.id;
      return;
    end if;
    if exists (select 1 from sales where shift_id = sh.id and status = 'pending_approval') then
      raise exception using errcode = 'P0001', message = 'FUELOS_PENDING_APPROVALS', detail = 'decide the over-limit credit sales of this shift first';
    end if;
    update shifts set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = sh.id;
    v_sum := shift_summary(sh.id);
    v_diff := (v_sum ->> 'cash_diff')::numeric;
    v_cash_in := (v_sum ->> 'counted_cash')::numeric - sh.opening_cash;
    select string_agg(x.number::text, '، ' order by x.number), count(*) into v_pumps, v_pump_count
      from (select distinct p.number from shift_legs l join pumps p on p.id = l.pump_id where l.shift_id = sh.id) x;

    perform post_entry(sh.station_id, current_date,
      'مبيعات مناوبة — ' || case when v_pump_count > 1 then 'المضخات ' else 'المضخة ' end || v_pumps, 'shifts', sh.id, jsonb_build_array(
      jsonb_build_object('code', '1000', 'debit', greatest(v_cash_in, 0)),
      jsonb_build_object('code', '1000', 'credit', greatest(-v_cash_in, 0)),
      jsonb_build_object('code', '1020', 'debit', (v_sum ->> 'card')::numeric),
      jsonb_build_object('code', '1100', 'debit', (v_sum ->> 'credit')::numeric),
      jsonb_build_object('code', '2100', 'debit', (v_sum ->> 'voucher')::numeric),
      jsonb_build_object('code', case when p_option = 'shortage_to_employee' then '1150' else '5300' end,
                         'debit', greatest(-v_diff, 0), 'memo', 'عجز صندوق'),
      jsonb_build_object('code', '4200', 'credit', greatest(v_diff, 0), 'memo', 'زيادة صندوق'),
      jsonb_build_object('code', '4000', 'credit', (v_sum ->> 'meter_sales')::numeric)));

    -- one stock movement per tank, summed over every leg and nozzle of the shift
    for tk in select * from jsonb_array_elements(v_sum -> 'tanks') loop
      continue when (tk ->> 'liters')::numeric = 0;
      insert into inventory_movements (station_id, tank_id, type, liters, ref_table, ref_id, created_by)
      values (sh.station_id, (tk ->> 'tank_id')::uuid, 'sale', -(tk ->> 'liters')::numeric, 'shifts', sh.id, auth.uid());
      v_cost := tank_avg_cost((tk ->> 'tank_id')::uuid);
      if v_cost is null then v_missing_cost := true;
      else v_cogs := v_cogs + round((tk ->> 'liters')::numeric * v_cost, 2);
      end if;
      -- a delivery without a purchase price makes the cost (and profit) an estimate
      if exists (select 1 from fuel_deliveries d where d.tank_id = (tk ->> 'tank_id')::uuid and d.unit_cost is null) then
        v_missing_cost := true;
      end if;
    end loop;
    if v_cogs > 0 then
      perform post_entry(sh.station_id, current_date,
        'تكلفة الوقود المباع' || case when v_missing_cost then ' (تكلفة غير مكتملة)' else '' end, 'shifts', sh.id,
        jsonb_build_array(jsonb_build_object('code', '5000', 'debit', v_cogs), jsonb_build_object('code', '1200', 'credit', v_cogs)));
    end if;

    update invoices set status = 'confirmed'
     where status = 'pending' and sale_id in (select id from sales where shift_id = sh.id and status = 'recorded');
    -- loyalty: 1 point per 250 of currency on confirmed customer invoices (configurable later)
    insert into loyalty_ledger (customer_id, station_id, invoice_id, points, reason)
    select i.customer_id, i.station_id, i.id, floor(s.amount / 250)::int, 'فاتورة مؤكدة'
      from invoices i join sales s on s.id = i.sale_id
     where s.shift_id = sh.id and i.customer_id is not null and i.status = 'confirmed' and floor(s.amount / 250) > 0
       and not exists (select 1 from loyalty_ledger l where l.invoice_id = i.id);

  elsif ar.type = 'credit_over_limit' then
    if p_approve then
      update sales set status = 'recorded' where id = ar.ref_id;
    else
      update sales set status = 'voided', void_reason = 'رُفض تجاوز الحد: ' || p_note where id = ar.ref_id;
      update invoices set status = 'cancelled' where sale_id = ar.ref_id;
    end if;

  elsif ar.type = 'stock_adjustment' then
    if p_approve then
      select * into m from tank_measurements where id = ar.ref_id;
      perform apply_stock_adjustment(m.station_id, m.tank_id, m.measured_l - m.book_l,
                                     coalesce(p_note, 'تسوية معتمدة'), m.id);
    end if;
  end if;
end $$;

-- ---------- 8. reopen: the LAST leg is reopened ----------
-- rejected -> reopened: the attendant fixes readings/cash and submits again.
-- approved -> reopened: its postings are reversed (reason required) and its stock movements are returned,
-- so re-approving does not double count. Invoices stay confirmed; loyalty is never granted twice.
-- The last leg's pump must be free (FUELOS_PUMP_BUSY) and the attendant must not have another open shift
-- (FUELOS_SHIFT_ALREADY_OPEN).
create or replace function reopen_shift(p_shift uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sh shifts; lg shift_legs; e record; t record;
begin
  select * into sh from shifts where id = p_shift for update;
  if sh.id is null then raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND'; end if;
  perform require_role(sh.station_id, array['owner']::member_role[]);
  if coalesce(trim(p_reason), '') = '' then
    raise exception using errcode = 'P0001', message = 'FUELOS_REASON_REQUIRED';
  end if;

  if sh.status = 'approved' then
    for e in select id from journal_entries je
              where je.source_table = 'shifts' and je.source_id = sh.id and je.status = 'posted'
                and je.reverses_entry_id is null
                and not exists (select 1 from journal_entries r where r.reverses_entry_id = je.id)
    loop
      perform reverse_journal_entry(e.id, 'إعادة فتح المناوبة: ' || p_reason);
    end loop;
    for t in select tank_id, sum(liters) as net from inventory_movements
              where ref_table = 'shifts' and ref_id = sh.id group by tank_id having sum(liters) < 0
    loop
      insert into inventory_movements (station_id, tank_id, type, liters, ref_table, ref_id, reason, created_by)
      values (sh.station_id, t.tank_id, 'return', -t.net, 'shifts', sh.id, 'إعادة فتح المناوبة: ' || p_reason, auth.uid());
    end loop;
  elsif sh.status <> 'rejected' then
    raise exception using errcode = 'P0001', message = 'FUELOS_BAD_SHIFT_TRANSITION', detail = sh.status::text;
  end if;

  select * into lg from shift_legs where shift_id = sh.id order by started_at desc, created_at desc limit 1 for update;
  begin
    update shift_legs set ended_at = null where id = lg.id;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'FUELOS_PUMP_BUSY', detail = 'the pump of the last leg is taken';
  end;
  begin
    update shifts set status = 'reopened', decision_note = p_reason, decided_by = auth.uid(), decided_at = now()
     where id = sh.id;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_ALREADY_OPEN', detail = 'the attendant has another open shift';
  end;
end $$;

-- ---------- 9. grants ----------
revoke execute on function start_leg(shifts, uuid, uuid, jsonb, text, text, timestamptz),
                           end_leg(shift_legs, jsonb, timestamptz)
  from public, anon, authenticated;
revoke execute on function open_shift(uuid, uuid, uuid, numeric, jsonb, text, text, timestamptz),
                           record_sale(uuid, uuid, uuid, uuid, numeric, numeric, payment_method, uuid, uuid, uuid, uuid, int, boolean, text, timestamptz)
  from public, anon;
grant execute on function open_shift(uuid, uuid, uuid, numeric, jsonb, text, text, timestamptz),
                          record_sale(uuid, uuid, uuid, uuid, numeric, numeric, payment_method, uuid, uuid, uuid, uuid, int, boolean, text, timestamptz)
  to authenticated, service_role;
```

- [ ] **Step 5: Run the suite and the migration check**

  Run:
  ```bash
  ./supabase/tests/local/run_local.sh > /tmp/run.txt 2>&1; echo exit $?; grep -c "NOTICE:  PASS" /tmp/run.txt; tail -3 /tmp/run.txt
  ./supabase/tests/local/legs_migration_check.sh 2>&1 | tail -1
  ```
  Expected:
  - `exit 0`, then `135` (107 + 28), then `ALL SHIFT-LEG TESTS PASSED` / `ALL TESTS PASSED`;
  - then `LEGS MIGRATION CHECK PASSED`. From now on the "after" totals come from the new leg-based `shift_summary`.

- [ ] **Step 6: Commit**

  ```bash
  git add supabase && git commit -qm "feat(db): cut over shift RPCs to pump legs (open/submit/summary/sale/approve/reopen)"
  ```

---

### Task 3: `switch_pump` — move to another pump without closing the shift

**Files:**
- Modify: `supabase/migrations/20260926000200_shift_legs.sql` (append section 10)
- Modify: `supabase/tests/30_shift_legs_test.sql` (insert section F)

**Interfaces:**
- Consumes: `start_leg` and `end_leg` from Task 2.
- Produces: `switch_pump(p_shift uuid, p_new_leg_id uuid, p_closing jsonb, p_new_pump uuid, p_opening jsonb, p_gap_note text default null, p_device text default null, p_client_created_at timestamptz default now()) returns jsonb`.

- [ ] **Step 1: Insert section F into `supabase/tests/30_shift_legs_test.sql`**

  Put it directly above the three closing lines (`\o`, `select 'ALL SHIFT-LEG TESTS PASSED' as result;`, `rollback;`). The ids `leg_k2` and `leg_k3` are already in the fixture list from Task 2.

  Section F:

```sql
-- =====================================================================
-- F. Moving to another pump (switch_pump)
-- =====================================================================
-- خالد: pump 1 (leg B, since 06:00) -> pump 3 at 08:00 -> back to pump 1; one cash drawer for the whole shift
select date_trunc('day', now()) + interval '8 hours' as t_move \gset
select id as n1a from nozzles where pump_id = :'pump1' and label = 'بنزين 90' \gset
select id as n1b from nozzles where pump_id = :'pump1' and label = 'ديزل' \gset
select last_reading as n3_last from nozzles where id = :'n3' \gset
select pg_temp.act_as(:'khaled');
select switch_pump(:'shift_b', :'leg_k2',
                   jsonb_build_array(jsonb_build_object('nozzle_id', :'n1a', 'closing_reading', 98510.0),
                                     jsonb_build_object('nozzle_id', :'n1b', 'closing_reading', 143002.5)),
                   :'pump3', pg_temp.opening(:'pump3'), null, 'demo-phone-390', :'t_move') ->> 'replayed' as sw1 \gset
select pg_temp.ok(:'sw1' = 'false' and (select ended_at = :'t_move'::timestamptz from shift_legs where id = :'leg_b')
                  and (select pump_id = :'pump3' and ended_at is null and started_at = :'t_move'::timestamptz from shift_legs where id = :'leg_k2'),
                  'switch ends the pump-1 leg and opens a pump-3 leg at the move time');
select pg_temp.ok((select last_reading = 98510.0 from nozzles where id = :'n1a'), 'the left pump''s closing reading becomes its last reading');
select pg_temp.ok((switch_pump(:'shift_b', :'leg_k2', '[]', :'pump3', '[]') ->> 'replayed')::boolean
                  and (select count(*) = 2 from shift_legs where shift_id = :'shift_b'), 'replaying switch_pump is a no-op');
select pg_temp.throws(format('select switch_pump(%L, gen_random_uuid(), %L::jsonb, %L, %L::jsonb)',
                             :'shift_b', pg_temp.closing(:'leg_k2'), :'pump4', pg_temp.opening(:'pump4')),
                      'FUELOS_PUMP_BUSY', 'moving to a pump held by a colleague is refused');
select pg_temp.ok((select ended_at is null from shift_legs where id = :'leg_k2'), 'a refused move leaves the current leg open');
select pg_temp.throws(format('select record_sale(gen_random_uuid(), %L, %L, %L, 5, 110, %L)', :'shift_b', :'leg_b', :'n1a', 'card'),
                      'FUELOS_NOT_FOUND', 'no sale on a leg that has ended');
select record_sale(gen_random_uuid(), :'shift_b', :'leg_k2', :'n3', 4, 125, 'card');          -- 500 by card
-- back to pump 1 with a device clock two days behind: the move is dated at the leg start, not rejected
select switch_pump(:'shift_b', :'leg_k3',
                   jsonb_build_array(jsonb_build_object('nozzle_id', :'n3', 'closing_reading', :'n3_last'::numeric + 40)),
                   :'pump1', pg_temp.opening(:'pump1'), null, 'demo-phone-390', now() - interval '2 days');
select pg_temp.ok((select ended_at = started_at from shift_legs where id = :'leg_k2'), 'a device clock behind the leg start does not break the move');
select pg_temp.ok((select last_reading = :'n3_last'::numeric + 40 from nozzles where id = :'n3'), 'pump 3 keeps the 40 L its leg sold');

-- close: pump 1 sells 10 more liters of 90
--   meter = (100 + 10) L x 110 + 40 L x 125 = 17,100; card = 2,750 (seed) + 500 = 3,250
--   expected cash = 5,000 + 17,100 - 3,250 = 18,850
select submit_shift(:'shift_b', jsonb_build_array(jsonb_build_object('nozzle_id', :'n1a', 'closing_reading', 98520.0),
                                                  jsonb_build_object('nozzle_id', :'n1b', 'closing_reading', 143002.5)),
                    18850) as sum_b \gset
select pg_temp.ok((:'sum_b'::jsonb ->> 'meter_sales')::numeric = 17100 and (:'sum_b'::jsonb ->> 'cash_diff')::numeric = 0,
                  'expected cash is computed once over all legs');
select pg_temp.ok(jsonb_array_length(:'sum_b'::jsonb -> 'legs') = 3, 'the review lists all three legs');
select pg_temp.ok((switch_pump(:'shift_b', :'leg_k3', '[]', :'pump1', '[]') ->> 'replayed')::boolean,
                  'replaying a move after the shift was submitted is still a no-op (offline retry)');

select pg_temp.act_as(:'owner');
select decide_approval((select id from approval_requests where ref_id = :'shift_b' and status = 'pending'), true, null, 'اعتماد');
select pg_temp.ok(pg_temp.balanced(:'station'), 'ledger stays balanced after a multi-pump shift');
select pg_temp.ok((select count(*) = 2 from inventory_movements where ref_id = :'shift_b'), 'one stock movement per tank (diesel sold nothing)');
select pg_temp.ok((select m.liters = -110 from inventory_movements m join nozzles n on n.tank_id = m.tank_id
                    where m.ref_id = :'shift_b' and n.id = :'n1a'), 'the 90 tank loses the liters of both pump-1 legs');
select pg_temp.ok((select description = 'مبيعات مناوبة — المضخات 1، 3' from journal_entries
                    where source_id = :'shift_b' and description like 'مبيعات%'), 'the sales entry names every pump worked');
set local role authenticated;
select pg_temp.act_as(:'khaled');
select pg_temp.ok((select count(*) = 3 and bool_and(shift_id = :'shift_b') from shift_legs), 'attendant: sees the three legs of his shift, nothing else');
reset role;

```

- [ ] **Step 2: Run the suite. It must fail.**

  Run: `./supabase/tests/local/run_local.sh 2>&1 | grep -m1 ERROR`

  Expected: `ERROR:  function switch_pump(unknown, unknown, jsonb, unknown, jsonb, unknown, unknown, unknown) does not exist`. The exact argument types may differ; what matters is that it names `switch_pump`.

- [ ] **Step 3: Append section 10 to the migration**

  Add it to the end of `supabase/migrations/20260926000200_shift_legs.sql`, keeping one blank line before it:

```sql
-- ---------- 10. moving to another pump ----------
-- Moves the attendant to another pump in one transaction: closes the current leg with p_closing (its pump's
-- closing readings, which become the nozzles' last_reading) and opens leg p_new_leg_id on p_new_pump with p_opening.
-- The cash stays with the attendant; nothing is counted here. Replay-safe on p_new_leg_id (offline outbox).
create function switch_pump(p_shift uuid, p_new_leg_id uuid, p_closing jsonb, p_new_pump uuid, p_opening jsonb,
                            p_gap_note text default null, p_device text default null,
                            p_client_created_at timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sh shifts; lg shift_legs; v_existing shift_legs; v_at timestamptz;
begin
  select * into sh from shifts where id = p_shift for update;
  if sh.id is null then raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'shift'; end if;
  if not ((coalesce(sh.attendant_id = auth.uid(), false) and is_station_member(sh.station_id))
          or has_station_role(sh.station_id, array['owner', 'shift_manager']::member_role[])) then
    raise exception using errcode = '42501', message = 'FUELOS_PERMISSION_DENIED';
  end if;

  select * into v_existing from shift_legs where id = p_new_leg_id;   -- idempotent replay from the offline outbox
  if v_existing.id is not null then
    if v_existing.shift_id <> p_shift then
      raise exception using errcode = 'P0001', message = 'FUELOS_ID_CONFLICT';
    end if;
    return jsonb_build_object('leg_id', p_new_leg_id, 'replayed', true);
  end if;

  if sh.status not in ('open', 'reopened') then
    raise exception using errcode = 'P0001', message = 'FUELOS_SHIFT_NOT_OPEN';
  end if;
  select * into lg from shift_legs where shift_id = p_shift and ended_at is null for update;
  if lg.id is null then
    raise exception using errcode = 'P0001', message = 'FUELOS_NOT_FOUND', detail = 'open leg';
  end if;
  -- a device clock behind the leg start must not break the move: the move happens no earlier than the leg began
  v_at := greatest(coalesce(p_client_created_at, now()), lg.started_at);
  perform end_leg(lg, p_closing, v_at);
  perform start_leg(sh, p_new_leg_id, p_new_pump, p_opening, p_gap_note, p_device, v_at);
  return jsonb_build_object('leg_id', p_new_leg_id, 'closed_leg_id', lg.id, 'replayed', false);
end $$;

revoke execute on function switch_pump(uuid, uuid, jsonb, uuid, jsonb, text, text, timestamptz) from public, anon;
grant execute on function switch_pump(uuid, uuid, jsonb, uuid, jsonb, text, text, timestamptz) to authenticated, service_role;
```

- [ ] **Step 4: Run the suite**

  Run: `./supabase/tests/local/run_local.sh > /tmp/run.txt 2>&1; echo exit $?; grep -c "NOTICE:  PASS" /tmp/run.txt`

  Expected: `exit 0` and `151` (135 + 16).

- [ ] **Step 5: Commit**

  ```bash
  git add supabase && git commit -qm "feat(db): switch_pump — move to another pump, one cash drawer"
  ```

---

### Task 4: `pump_board` for S1

**Files:**
- Modify: `supabase/migrations/20260926000200_shift_legs.sql` (append section 11)
- Modify: `supabase/tests/30_shift_legs_test.sql` (insert section G)

**Interfaces:**
- Consumes: `shift_legs` and `station_members.display_name`.
- Produces: `pump_board(p_station uuid) returns jsonb`. The shape is in the File map. It is read by S1 in plan 2 and replaces the `shift_start_board` proposal of brief 02a item 1a.

- [ ] **Step 1: Insert section G** directly above the three closing lines of `supabase/tests/30_shift_legs_test.sql`

```sql
-- =====================================================================
-- G. Pump board (S1): who holds which pump — name only
-- =====================================================================
set local role authenticated;
select pg_temp.act_as(:'mohamad');                  -- محمد is back on pump 2 (reopened), سامر holds pump 4
select pump_board(:'station') as board \gset
select pg_temp.ok(jsonb_array_length(:'board'::jsonb) = 4, 'pump board lists the 4 active pumps');
select pg_temp.ok((select e ->> 'held_by' = 'محمد خليل' and (e ->> 'held_by_me')::boolean
                     from jsonb_array_elements(:'board'::jsonb) e where (e ->> 'number')::int = 2), 'my pump shows my name and held_by_me');
select pg_temp.ok((select e ->> 'held_by' = 'سامر يوسف' and not (e ->> 'held_by_me')::boolean
                     from jsonb_array_elements(:'board'::jsonb) e where (e ->> 'number')::int = 4), 'a colleague''s pump shows his display name');
select pg_temp.ok((select e -> 'held_by' = 'null'::jsonb and jsonb_array_length(e -> 'nozzles') = 2
                     from jsonb_array_elements(:'board'::jsonb) e where (e ->> 'number')::int = 1), 'a free pump has no holder and lists its nozzles');
select pg_temp.ok((select (e -> 'nozzles' -> 0 ->> 'last_reading')::numeric = 98520.0
                     from jsonb_array_elements(:'board'::jsonb) e where (e ->> 'number')::int = 1), 'nozzles carry last_reading for the prefill');
select pg_temp.ok((select bool_and((select array_agg(k order by k) from jsonb_object_keys(e) k)
                                   = array['held_by', 'held_by_me', 'name', 'nozzles', 'number', 'pump_id'])
                     from jsonb_array_elements(:'board'::jsonb) e)
                  and position(:'mgr' in :'board') = 0, 'pump board exposes no ids, cash or shift data of colleagues');
select pg_temp.act_as('11111111-0000-4000-8000-000000000006');           -- رنا, a customer
select pg_temp.throws(format('select pump_board(%L)', :'station'), '42501', 'a customer cannot read the pump board');
reset role;
select pg_temp.act_as(null);
set local role anon;
select pg_temp.throws(format('select pump_board(%L)', :'station'), '42501', 'guest: cannot call pump_board');
reset role;

```

- [ ] **Step 2: Run the suite. It must fail.**

  Run: `./supabase/tests/local/run_local.sh 2>&1 | grep -m1 ERROR`

  Expected: `ERROR:  function pump_board(unknown) does not exist`.

- [ ] **Step 3: Append section 11 to the migration**

  Add it to the end of `supabase/migrations/20260926000200_shift_legs.sql`, keeping one blank line before it:

```sql
-- ---------- 11. pump board for S1 «بداية المناوبة» ----------
-- One row per active pump: number, nozzles (with last_reading for the prefill) and who holds it now.
-- An attendant cannot read colleagues' shifts through RLS; this exposes ONLY the holder's display name.
create function pump_board(p_station uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform require_role(p_station, array['attendant', 'shift_manager', 'owner', 'accountant']::member_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'pump_id', p.id, 'number', p.number, 'name', p.name,
             'held_by', h.display_name,
             'held_by_me', coalesce(h.attendant_id = auth.uid(), false),
             'nozzles', coalesce((select jsonb_agg(jsonb_build_object(
                                           'nozzle_id', n.id, 'label', n.label, 'product_id', t.product_id,
                                           'product_name', pr.name, 'last_reading', n.last_reading) order by n.label)
                                    from nozzles n join tanks t on t.id = n.tank_id join products pr on pr.id = t.product_id
                                   where n.pump_id = p.id and n.is_active), '[]'::jsonb))
           order by p.number)
      from pumps p
      left join lateral (
        select s.attendant_id, coalesce(m.display_name, 'زميل') as display_name
          from shift_legs l join shifts s on s.id = l.shift_id
          left join station_members m on m.station_id = s.station_id and m.user_id = s.attendant_id
         where l.pump_id = p.id and l.ended_at is null
         limit 1) h on true
     where p.station_id = p_station and p.is_active), '[]'::jsonb);
end $$;

revoke execute on function pump_board(uuid) from public, anon;
grant execute on function pump_board(uuid) to authenticated, service_role;
```

- [ ] **Step 4: Run the suite and the migration check**

  Run:
  ```bash
  ./supabase/tests/local/run_local.sh > /tmp/run.txt 2>&1; echo exit $?; grep -c "NOTICE:  PASS" /tmp/run.txt
  ./supabase/tests/local/legs_migration_check.sh 2>&1 | tail -1
  ```
  Expected: `exit 0`, `159` (151 + 8), then `LEGS MIGRATION CHECK PASSED`.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase && git commit -qm "feat(db): pump_board — who holds which pump (display name only)"
  ```

---

### Task 5: `report_device_sync` (brief 02a, request 2)

**Files:**
- Create: `supabase/tests/40_device_sync_test.sql`
- Create: `supabase/migrations/20260926000300_device_sync_report.sql`

**Interfaces:**
- Produces: `report_device_sync(p_device text, p_pending int) returns void`. It updates only `devices.pending_ops` and `devices.last_sync_at`.

- [ ] **Step 1: Write `supabase/tests/40_device_sync_test.sql`**

```sql
-- =====================================================================
-- FuelOS — device sync report (migration 20260926000300_device_sync_report.sql)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/40_device_sync_test.sql
-- Runs after migrations + seed.sql, in one transaction that is rolled back.
-- =====================================================================
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;
create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', case when p_user is null then '' else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true); $$;
create function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin if p_cond is distinct from true then raise exception 'FAIL: %', p_label; end if; raise notice 'PASS  %', p_label; end $$;
create function pg_temp.throws(p_sql text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm = p_expected or sqlstate = p_expected then raise notice 'PASS  % (%)', p_label, p_expected; return; end if;
    raise exception 'FAIL: % — expected %, got % / %', p_label, p_expected, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % — expected %, but no error', p_label, p_expected;
end $$;

set local role authenticated;
select pg_temp.act_as('11111111-0000-4000-8000-000000000004');           -- خالد, attendant
select report_device_sync('demo-phone-390', 3);
reset role;
select pg_temp.ok((select pending_ops = 3 and last_sync_at is not null from devices where id = 'demo-phone-390'),
                  'an attendant reports his device''s queue');
set local role authenticated;
select pg_temp.throws($$select report_device_sync('demo-phone-390', -1)$$, 'FUELOS_BAD_REQUEST', 'a negative queue size is refused');
select pg_temp.throws($$select report_device_sync('no-such-device', 0)$$, 'FUELOS_NOT_FOUND', 'an unknown device is refused');
update devices set pending_ops = 99 where id = 'demo-phone-390';                -- RLS: silently matches no row
reset role;
select pg_temp.ok((select pending_ops = 3 from devices where id = 'demo-phone-390'), 'attendant: a direct update of devices changes nothing');
set local role authenticated;
select pg_temp.act_as('11111111-0000-4000-8000-000000000006');           -- رنا, a customer
select pg_temp.throws($$select report_device_sync('demo-phone-390', 0)$$, '42501', 'a non-member cannot report for the device');
reset role;

\o
select 'ALL DEVICE SYNC TESTS PASSED' as result;
rollback;
```

- [ ] **Step 2: Run the suite. It must fail.**

  Run: `./supabase/tests/local/run_local.sh 2>&1 | grep -m1 ERROR`

  Expected: `ERROR:  function report_device_sync(unknown, integer) does not exist`.

- [ ] **Step 3: Write `supabase/migrations/20260926000300_device_sync_report.sql`**

```sql
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
```

- [ ] **Step 4: Run the suite**

  Run: `./supabase/tests/local/run_local.sh > /tmp/run.txt 2>&1; echo exit $?; grep -c "NOTICE:  PASS" /tmp/run.txt`

  Expected: `exit 0` and `164` (159 + 5).

- [ ] **Step 5: Commit**

  ```bash
  git add supabase && git commit -qm "feat(db): report_device_sync — devices report their offline queue"
  ```

---

### Task 6: Update `docs/data-model.md`

**Files:**
- Modify: `docs/data-model.md` (sections 2, 3, 4, 5, 6 and 7)

- [ ] **Step 1: Stage the owner's current copy.** Claude Code may have edited it.

  Call `device_stage_files` on `C:\Projects\fuelos\docs\data-model.md`, then:
  ```bash
  mkdir -p /home/claude/fuelos/docs && cp /mnt/user-data/uploads/fuelos/docs/data-model.md /home/claude/fuelos/docs/data-model.md
  ```
  Record its `mtimeMs` for Task 7.

- [ ] **Step 2: Apply the edits.** Save this as `/tmp/update_data_model.py` and run `python3 /tmp/update_data_model.py` from the repo root. The script stops if any anchor text is missing or duplicated.

```python
# Updates docs/data-model.md for migrations 20260926000200 (shift legs) and 20260926000300 (device sync report).
import pathlib
p = pathlib.Path("docs/data-model.md")
s = p.read_text(encoding="utf-8")
edits = [
("""  pumps ||--o{ shifts : "one open at a time"
  shifts ||--o{ shift_readings : "opening/closing per nozzle"
  shifts ||--o{ sales : "recorded fills (card/credit/voucher/linked)"
""",
"""  shifts ||--|{ shift_legs : "one leg per pump worked; one open at a time"
  pumps ||--o{ shift_legs : "one open leg per pump"
  shift_legs ||--|{ leg_readings : "opening/closing per nozzle"
  shift_legs ||--o{ sales : "recorded fills (card/credit/voucher/linked)"
"""),
("""  [*] --> open : open_shift (readings per nozzle)
  open --> submitted : submit_shift (closing readings + counted cash)
""",
"""  [*] --> open : open_shift (first pump + readings per nozzle)
  open --> open : switch_pump (close this pump's leg, open a leg on another pump)
  open --> submitted : submit_shift (closing readings of the current pump + counted cash)
"""),
("""where `meter_sales = Σ (closing − opening) × price at shift open`. Cash fills are *not* recorded one by one: they come out of the meter.
""",
"""where `meter_sales = Σ legs Σ nozzles (closing − opening) × price at shift open`. Cash fills are *not* recorded one by one: they come out of the meter.
A shift belongs to one attendant and his cash drawer; it is split into **legs**, one per pump he worked (`shift_legs`). He holds one pump at a time, a pump has one open leg at a time, and the cash is counted once, at the end.
An opening reading above the nozzle's `last_reading` means liters nobody recorded: the leg needs a `gap_note`, and the liters are kept in `leg_readings.gap_liters` and shown in the approval payload.
"""),
("""| Shift approved (`decide_approval`) | 1000 Cash (counted − opening), 1020 Card, 1100 Companies, 2100 Vouchers | 4000 Fuel sales (meter sales) | One balanced entry per shift |
""",
"""| Shift approved (`decide_approval`) | 1000 Cash (counted − opening), 1020 Card, 1100 Companies, 2100 Vouchers | 4000 Fuel sales (meter sales) | One balanced entry per shift, over all its legs; one stock movement per tank |
"""),
("""- `shifts`: only the allowed transitions; one open shift per pump (`FUELOS_PUMP_BUSY`).
""",
"""- `shifts`: only the allowed transitions; one open shift per attendant (`FUELOS_SHIFT_ALREADY_OPEN`).
- `shift_legs`: one open leg per pump (`FUELOS_PUMP_BUSY`) and per shift; never deleted. A sale's `leg_id` is frozen like its other financial fields.
"""),
("""| `open_shift(shift_id, pump, opening_cash, readings, device, client_created_at)` | attendant / manager / owner | ✅ client UUID |
| `record_sale(sale_id, shift, nozzle, liters, unit_price, method, …, request_approval)` | shift's attendant, manager, owner | ✅ client UUID |
""",
"""| `open_shift(shift_id, leg_id, pump, opening_cash, readings, gap_note, device, client_created_at)` | attendant / manager / owner | ✅ client UUIDs |
| `switch_pump(shift, new_leg_id, closing, new_pump, opening, gap_note, device, client_created_at)` | shift's attendant, manager, owner | ✅ client UUID |
| `pump_board(station)` | station members | read (holder's display name only) |
| `record_sale(sale_id, shift, leg, nozzle, liters, unit_price, method, …, request_approval)` | shift's attendant, manager, owner | ✅ client UUID |
"""),
("""| `shift_summary(shift)` | shift's attendant, staff | read |
""",
"""| `shift_summary(shift)` | shift's attendant, staff | read (totals + `tanks[]` + `legs[]`) |
"""),
("""| `close_period(period)` / `open_next_period(station)` | owner / owner+accountant | — |
""",
"""| `close_period(period)` / `open_next_period(station)` | owner / owner+accountant | — |
| `report_device_sync(device, pending)` | members of the device's station | — |
"""),
("""`FUELOS_PUMP_BUSY` · `FUELOS_READING_MISSING`""",
"""`FUELOS_PUMP_BUSY` · `FUELOS_SHIFT_ALREADY_OPEN` · `FUELOS_GAP_NOTE_REQUIRED` · `FUELOS_BAD_REQUEST` · `FUELOS_READING_MISSING`"""),
]
for old, new in edits:
    if s.count(old) != 1:
        raise SystemExit(f"expected exactly one match for: {old[:60]!r}")
    s = s.replace(old, new)
p.write_text(s, encoding="utf-8")
print("data-model.md updated")
```

- [ ] **Step 3: Verify that no stale text remains**

  Run: `grep -c "shift_readings\|one open shift per pump" docs/data-model.md`

  Expected: `0`.

- [ ] **Step 4: Commit**

  ```bash
  git add docs/data-model.md && git commit -qm "docs: data model for pump legs and device sync report"
  ```

---

### Task 7: Final local verification, independent review, deliver to the owner's repo

**Files:** none new.

- [ ] **Step 1: Run everything from a clean database**

  ```bash
  ./supabase/tests/local/run_local.sh > /tmp/run.txt 2>&1; echo exit $?; grep -c "NOTICE:  PASS" /tmp/run.txt; grep -c "FAIL" /tmp/run.txt
  ./supabase/tests/local/legs_migration_check.sh 2>&1 | tail -1
  ```
  Expected: `exit 0`, `164`, `0`, `LEGS MIGRATION CHECK PASSED`.

- [ ] **Step 2: Independent review.** Dispatch one reviewer subagent with the template in the `superpowers:requesting-code-review` skill (`code-reviewer.md`).

  - Range: `BASE_SHA..HEAD` in `/home/claude/fuelos`.
  - Requirements: the spec, plus this plan's Global Constraints and Review Focus.
  - Handle the findings with `superpowers:receiving-code-review`. Every fix gets its own failing test first. Re-run Step 1 after the fixes.

- [ ] **Step 3: Copy the deliverables to the outputs folder**

  ```bash
  O=/mnt/user-data/outputs/fuelos-legs; rm -rf $O; mkdir -p $O
  cd /home/claude/fuelos
  for f in supabase/migrations/20260926000200_shift_legs.sql supabase/migrations/20260926000300_device_sync_report.sql \
           supabase/seed.sql supabase/tests/10_business_rules_test.sql supabase/tests/30_shift_legs_test.sql \
           supabase/tests/40_device_sync_test.sql supabase/tests/local/legs_migration_check.sh \
           supabase/tests/local/legs_migration_before.sql supabase/tests/local/legs_migration_after.sql \
           supabase/tests/local/fixtures/seed_pre_legs.sql docs/data-model.md; do
    mkdir -p "$O/$(dirname $f)"; cp "$f" "$O/$f"; done; find $O -type f | wc -l
  ```
  Expected: `11`.

- [ ] **Step 4: Write the files into `C:\Projects\fuelos`**

  Use one `device_commit_files` call with `stagedPath` `/mnt/user-data/outputs/fuelos-legs/<path>` and `devicePath` `C:\Projects\fuelos\<path with backslashes>` for all 11 files.

  - For `supabase\seed.sql`, `supabase\tests\10_business_rules_test.sql` and `docs\data-model.md`, pass `expectedMtimeMs`:
    - seed: `1790370589581`
    - test 10: `1790370590352`
    - data-model: from Task 6 Step 1
  - If a commit is refused because the file changed, re-stage it, merge the owner's change, re-run Step 1, and retry. Never `force`.

- [ ] **Step 5: Hand over to Claude Code (via the owner, in Arabic).** Ask the owner to paste this to Claude Code:

  > Cowork wrote the database part of the shift-legs plan: files under `supabase/` plus `docs/data-model.md`. Don't edit them. Commit and push them as-is:
  > `git add supabase docs/data-model.md docs/superpowers/plans && git commit -m "feat(db): shift legs — one attendant shift across several pumps" && git push`
  > Don't change the app yet. Plan 2 (app) comes after the database is deployed.

---

### Task 8: Deploy to Supabase and prove nothing moved

**Files:** none (remote only). Project id for every call: `mpjcgarblfixceakyaxy`.

- [ ] **Step 1: Tell the owner (in Arabic) before deploying** that S1 will show «تعذّر…» until plan 2 is done, and wait for his OK.

- [ ] **Step 2: Pre-flight check.** No attendant may have two open shifts, or the new unique index fails.

  `execute_sql`:
  ```sql
  select station_id, attendant_id, count(*) from shifts where status in ('open', 'reopened') group by 1, 2 having count(*) > 1;
  ```
  Expected: `[]`. If there are rows, stop and ask the owner which shift to close.

- [ ] **Step 3: Fingerprint before the migration**

  `execute_sql`; save the result to `/tmp/claude-0/supabase_before.json`:
  ```sql
  select jsonb_build_object(
    'shifts', (select jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'pump', p.number,
                 'liters', (select sum(coalesce(r.closing_reading, r.opening_reading) - r.opening_reading) from shift_readings r where r.shift_id = s.id),
                 'readings', (select md5(string_agg(concat_ws('|', r.nozzle_id, r.opening_reading, r.closing_reading), ',' order by r.nozzle_id)) from shift_readings r where r.shift_id = s.id),
                 'sales', (select count(*) from sales x where x.shift_id = s.id)) order by s.id)
               from shifts s join pumps p on p.id = s.pump_id),
    'journal', (select md5(string_agg(concat_ws('|', l.entry_id, l.account_id, l.debit, l.credit), ',' order by l.id)) from journal_lines l),
    'stock',   (select md5(string_agg(concat_ws('|', m.id, m.tank_id, m.liters), ',' order by m.id)) from inventory_movements m),
    'meters',  (select md5(string_agg(concat_ws('|', n.id, n.last_reading), ',' order by n.id)) from nozzles n)) as fingerprint;
  ```

- [ ] **Step 4: Apply both migrations and fix their versions**

  1. `apply_migration` with name `shift_legs` and query = the full content of `supabase/migrations/20260926000200_shift_legs.sql`.
  2. `apply_migration` with name `device_sync_report` and query = the full content of `supabase/migrations/20260926000300_device_sync_report.sql`.
  3. Then `execute_sql`:
     ```sql
     update supabase_migrations.schema_migrations set version = '20260926000200' where name = 'shift_legs';
     update supabase_migrations.schema_migrations set version = '20260926000300' where name = 'device_sync_report';
     select version, name from supabase_migrations.schema_migrations order by version desc limit 3;
     ```
     Expected: `20260926000300 device_sync_report`, `20260926000200 shift_legs`, `20260926000100 pin_helpers_search_path`.

  If an apply fails, nothing is half-applied (the migration is one transaction). Read the error, fix it locally with a failing test first, re-run Task 7 Step 1, then retry.

- [ ] **Step 5: Fingerprint after the migration.** It must equal the saved one.

  `execute_sql`:
  ```sql
  select jsonb_build_object(
    'shifts', (select jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'pump', p.number,
                 'liters', (select sum(coalesce(r.closing_reading, r.opening_reading) - r.opening_reading) from leg_readings r where r.leg_id = l.id),
                 'readings', (select md5(string_agg(concat_ws('|', r.nozzle_id, r.opening_reading, r.closing_reading), ',' order by r.nozzle_id)) from leg_readings r where r.leg_id = l.id),
                 'sales', (select count(*) from sales x where x.shift_id = s.id and x.leg_id = l.id)) order by s.id)
               from shifts s join shift_legs l on l.shift_id = s.id join pumps p on p.id = l.pump_id),
    'journal', (select md5(string_agg(concat_ws('|', l.entry_id, l.account_id, l.debit, l.credit), ',' order by l.id)) from journal_lines l),
    'stock',   (select md5(string_agg(concat_ws('|', m.id, m.tank_id, m.liters), ',' order by m.id)) from inventory_movements m),
    'meters',  (select md5(string_agg(concat_ws('|', n.id, n.last_reading), ',' order by n.id)) from nozzles n)) as fingerprint;
  ```
  Expected: byte-for-byte the same JSON as Step 3. Compare with `python3 -c "import json,sys; a,b=(json.load(open(f)) for f in sys.argv[1:]); print(a==b)" before.json after.json`, which should print `True`.

- [ ] **Step 6: Check grants and overloads**

  `execute_sql`:
  ```sql
  select p.proname, pg_get_function_identity_arguments(p.oid) as args,
         has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('open_shift', 'switch_pump', 'record_sale', 'submit_shift', 'shift_summary', 'pump_board',
                       'report_device_sync', 'start_leg', 'end_leg', 'reopen_shift', 'decide_approval')
   order by 1;
  ```
  Expected: 11 rows, one per name (no leftover old overloads).
  - `start_leg` and `end_leg` have `auth = false`; every other row has `auth = true`.
  - Every row has `anon = false`.

- [ ] **Step 7: Read-only smoke test as خالد**

  `execute_sql`:
  ```sql
  with ctx as materialized (
    select set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-000000000004","role":"authenticated"}', true) as c)
  select pump_board((select s.id from stations s, ctx where s.name = 'محطة النور')) as board;
  ```
  Expected: 4 pumps. Pump 1 has `held_by: "خالد العمر"`. The others have `held_by: null`, unless the owner opened test shifts.

- [ ] **Step 8: Advisors**

  Run `get_advisors` (type `security`). The only lints allowed are the known intentional ones:
  - `security_definer_view` on `public_station_prices`;
  - `authenticated_security_definer_function_executable`, now also listing `switch_pump`, `pump_board` and `report_device_sync`. These are intentional: each one checks roles first;
  - `auth_leaked_password_protection`;
  - `rls_enabled_no_policy` (INFO) on `member_pins` / `device_credentials`.

  Anything else (for example `function_search_path_mutable`) gets a new fix migration with a test, then re-run this step. Also run `get_advisors` (type `performance`) and report new entries to the owner without acting on them.

- [ ] **Step 9: Report to the owner in Arabic**, in 3–4 short lines:
  - the database now supports moving between pumps;
  - the totals were checked before and after, and are identical;
  - S1 needs plan 2;
  - the next step is plan 2 for the app.

---

## After this plan

- **Plan 2 (app, executed by Claude Code).** Write it with `superpowers:writing-plans` after Task 8, from the spec's section 6 and section 7 and the S1 code Claude Code already built. Stage `apps/worker` and `packages/core` first. It covers:
  - `errors.ts` for the new codes;
  - the outbox op `switch_pump` and `p_leg` on sales;
  - S1 on `pump_board`;
  - the shift screen, the move flow, and S4–S7 showing legs;
  - `report_device_sync` in the sync loop;
  - updating `.claude/skills/fuelos-offline-sync/SKILL.md` for the new RPC list.
- **Open question for the owner:** handover cash on the pump board (brief 02a item 1b).
