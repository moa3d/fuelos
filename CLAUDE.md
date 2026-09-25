# FuelOS — نظام تشغيل محطة الوقود

SaaS for fuel stations in Arabic (RTL). There are four interfaces:

| Interface | Users | Platform |
|---|---|---|
| Station owner / accountant | the station's office staff | web |
| Station worker | attendants at the pump | mobile PWA, offline-first |
| Customer app | drivers | mobile (likely PWA too) |
| Platform admin | the FuelOS team | web |

The spec is `docs/spec/FuelStation_UIUX_Design_Spec_AR.pdf`, in Arabic. It is the product source of truth.

## Status
- ✅ **Design:** 38 Figma frames plus a clickable prototype. See the `fuelos-design-system` skill, `design/screens/*.png` and `design/tokens.json`.
- ✅ **Database draft:** 7 migrations, a seed and 107 automated checks (88 business rules + 19 PIN login), passing on Postgres 16. See `supabase/` and `docs/data-model.md`.
- ✅ **Attendant PIN login:** Edge Function `attendant-pin-login`, deployed and tested.
- ⏳ **Apps:** worker PWA in progress (`docs/briefs/01-worker-pwa.md`). Follow the milestones below.

## Stack
- **Backend:** Supabase.
  - Postgres with RLS.
  - Auth: email/phone OTP; the worker PIN is done through an Edge Function.
  - Storage for meter photos and invoice PDFs.
  - Edge Functions.
- **Owner + admin web:** Next.js (App Router, TypeScript), Tailwind, `dir="rtl"`, Cairo font. Deploys on Vercel.
- **Worker app:** Next.js PWA (`apps/worker`), installable from the browser and offline-first: IndexedDB via Dexie for the outbox and reference data, a Serwist service worker for the app shell. The customer app will most likely follow the same path.
- **Shared packages:** `packages/ui` (Tailwind preset from `design/tokens.json` + React components), `packages/core` (Supabase client, `errors.ts`, number/money format).
- **Store builds (later):** wrap the PWA with Capacitor and build in the cloud (Codemagic or GitHub Actions). Never install Android Studio locally.
- **Monitoring (later):** Sentry.

## Repo layout
```
.claude/skills/        5 project skills (auto-loaded) — read them before working in their area
docs/                  spec PDF, data-model.md, briefs/ (task briefs agreed with the owner)
design/                screens/<CODE>.png, tokens.json, figma-plugin/ (generates the Figma file)
supabase/
  migrations/          SQL migrations (timestamped, append-only history)
  functions/           Edge Functions (attendant-pin-login)
  seed.sql             demo station «محطة النور» (dev only)
  tests/               10_business_rules, 20_pin_login + local/ (stub + runner for plain Postgres)
apps/worker/           worker PWA (Next.js) · (planned) owner-web, customer
packages/ui/           Tailwind preset from tokens + React components
packages/core/         Supabase client factory, errors.ts, formatting
package.json           npm workspaces: apps/*, packages/* (npm only, no pnpm/yarn)
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

# Apps (npm workspaces, from the repo root)
npm install
npm run dev -w apps/worker                # http://localhost:3000
npm run build && npm run lint
```
If `npm install` hangs on one large package, stop after ~3 minutes and tell the user; he downloads the `.tgz` in the browser and you run `npm install <path>.tgz`.
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
   - Done: Supabase project, the PIN Edge Function.
   - Next: Storage buckets and invoice PDFs.
2. **Worker app (Next.js PWA):** L2 → S1 → S2/S3 → S4–S7 → S8/S9, offline outbox first.
3. **Owner dashboard (Next.js):** L1 → O1, O3, O7 (approvals), O2, O9, then O4/O5/O6/O8/O10/O11.
4. **Customer app:** L3, C1–C7, public prices for guests.
5. **Platform admin:** A1–A4, subscriptions, access grants.

Work in small vertical slices (DB → RPC → UI → test). Before building a screen, open `design/screens/<CODE>.png`.

## Decisions
- **2026-09-26 — Worker app is a Next.js PWA, not Flutter** (`docs/briefs/01-worker-pwa.md`): the owner works on Windows with no Mac and large downloads stall on his network; Node is already installed and one TypeScript/React stack serves every interface. Store builds later via Capacitor in the cloud.
- **Database and Edge Function changes go through Claude in Cowork**, which has the Supabase connection. Do not edit `supabase/migrations` here; tell the user what to relay instead.
