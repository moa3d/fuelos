# FuelOS — نظام تشغيل محطة الوقود

SaaS for fuel stations in Arabic (RTL). There are four interfaces:

| Interface | Users | Platform |
|---|---|---|
| Station owner / accountant | the station's office staff | web |
| Station worker | attendants at the pump | mobile, offline-first |
| Customer app | drivers | mobile |
| Platform admin | the FuelOS team | web |

The spec is `docs/spec/FuelStation_UIUX_Design_Spec_AR.pdf`, in Arabic. It is the product source of truth.

## Status
- ✅ **Design:** 38 Figma frames plus a clickable prototype. See the `fuelos-design-system` skill, `design/screens/*.png` and `design/tokens.json`.
- ✅ **Database draft:** 5 migrations, a seed and 88 automated checks, passing on Postgres 16. See `supabase/` and `docs/data-model.md`.
- ⏳ **Apps:** not started. Follow the milestones below.

## Stack
- **Backend:** Supabase.
  - Postgres with RLS.
  - Auth: email/phone OTP; the worker PIN is done through an Edge Function.
  - Storage for meter photos and invoice PDFs.
  - Edge Functions.
- **Owner + admin web:** Next.js (App Router, TypeScript), Tailwind, `dir="rtl"`, Cairo font. Deploys on Vercel.
- **Worker app + customer app:** Flutter. The worker app is offline-first (SQLite via drift + an outbox). iOS builds go through Codemagic, since there is no Mac.
- **Monitoring (later):** Sentry.

## Repo layout
```
.claude/skills/        5 project skills (auto-loaded) — read them before working in their area
docs/                  spec PDF, data-model.md
design/                screens/<CODE>.png, tokens.json, figma-plugin/ (generates the Figma file)
supabase/
  migrations/          SQL migrations (timestamped, append-only history)
  seed.sql             demo station «محطة النور» (dev only)
  tests/               10_business_rules_test.sql + local/ (stub + runner for plain Postgres)
apps/                  (planned) owner-web (Next.js) · worker_app (Flutter) · customer_app (Flutter)
packages/              (planned) fuelos_ui (Flutter design system) · fuelos_core (models, errors, sync)
```

## Skills — use them
| Skill | Use it when |
|---|---|
| `fuelos-accounting` | Anything that touches money, stock, shifts, ledger or profit |
| `fuelos-permissions` | Roles, RLS, RPC auth, approvals, the "don't hide, explain" rule |
| `fuelos-offline-sync` | Worker app, outbox, retries, error code → Arabic message |
| `fuelos-design-system` | Tokens, components, RTL, screen codes |
| `fuelos-ux-rules` | Copy, states, flows, the screen review checklist |

## Commands
```bash
# Database — Supabase CLI (hosted project; Docker is not needed)
npx supabase link --project-ref <ref>
npx supabase db push                      # apply new migrations
psql "<connection string>" -X -v ON_ERROR_STOP=1 -f supabase/tests/10_business_rules_test.sql   # dev DB with seed

# Database — plain local Postgres 16 (what CI / Claude can run without Docker)
PGHOST=localhost PGUSER=postgres ./supabase/tests/local/run_local.sh
```
`supabase/tests/*.sql` are plain psql scripts, **not pgTAP**, so do not use `supabase test db` for them. Porting them to pgTAP is a TODO.

## Non-negotiable rules
1. **Never edit an applied migration.** Add a new file `supabase/migrations/<yyyymmddhhmmss>_<name>.sql`.
2. **Every table has RLS enabled.** Every multi-table write is a SECURITY DEFINER RPC that starts with `require_role(...)` and uses NULL-safe checks.
3. **Money:** use double entry. Posted entries are immutable; corrections are reversals with a reason; closed periods stay closed. Never use float for money.
4. **Offline:** the client generates UUIDs and RPCs are idempotent. Never lose or duplicate a sale.
5. **UI:** Arabic RTL, Latin digits, one primary action, all 6 states, no raw error codes shown to the user, and "آخر تحديث" plus the source next to manual numbers.
6. **A change to business rules needs a test** in `supabase/tests/10_business_rules_test.sql` and must pass before commit.
7. **Secrets:** never commit `.env*` or service-role keys. Apps use only the anon key plus RLS.

## Glossary (Arabic UI ↔ code)
| Arabic | Code | Notes |
|---|---|---|
| محطة | station | |
| مضخة | pump | |
| مسدس | nozzle | one nozzle draws from exactly one tank |
| خزان | tank | |
| مناوبة | shift | states: open, submitted, approved, rejected, reopened |
| قراءة العداد | meter reading | opening_reading / closing_reading |
| النقد الفعلي | counted_cash | |
| النقد المتوقع | expected_cash | |
| فرق الصندوق | cash_diff | |
| تعبئة / عملية بيع | sale | |
| نقدي / بطاقة / آجل / قسيمة | cash / card / credit / voucher | |
| حساب شركة | company_account | also: سائق = driver, مركبة = vehicle, حد ائتماني = credit_limit |
| توريد | fuel_delivery | |
| قياس فعلي | tank_measurement | |
| مخزون دفتري | book stock | |
| تسوية | adjustment | |
| قيد | journal_entry | lines = journal_lines |
| عكس قيد | reversal | |
| فترة محاسبية | accounting_period | |
| اعتماد / موافقة | approval_request | |
| فاتورة | invoice | |
| نقاط الولاء | loyalty_ledger | |
| شكوى / بلاغ سعر | complaint (complaint / price_report) | |
| صاحب المحطة | owner | |
| محاسب | accountant | |
| مدير مناوبة | shift_manager | |
| موظف تعبئة / عامل | attendant | |
| زبون | customer | |
| أدمن المنصة | platform_staff | |
| ل.س | SYP | placeholder currency |

## Milestones
1. **DB + accounting core.**
   - Done: schema, RLS, ledger and tests.
   - Next: Supabase project, Storage buckets, the PIN Edge Function, and invoice PDFs.
2. **Worker app (Flutter):** L2 → S1 → S2/S3 → S4–S7 → S8/S9, offline outbox first.
3. **Owner dashboard (Next.js):** L1 → O1, O3, O7 (approvals), O2, O9, then O4/O5/O6/O8/O10/O11.
4. **Customer app:** L3, C1–C7, public prices for guests.
5. **Platform admin:** A1–A4, subscriptions, access grants.

Work in small vertical slices (DB → RPC → UI → test). Before building a screen, open `design/screens/<CODE>.png`.
