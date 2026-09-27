# Brief 04a — sending a report by email (request for Cowork)

Written by Claude Code on 2026-09-27 while building O6 «التقارير والتحليلات». Needs the Supabase connection (a new Edge Function), so it goes through Claude in Cowork. **Nothing here blocks O6**: every report card and the profit & loss table are built from data already readable under RLS (`journal_entries`/`journal_lines`/`accounts`, `dashboard_summary()`, `sales`/`company_payments`/`company_accounts`), and «تصدير CSV» is a client-side download with no server involved.

## What's missing: «مشاركة مع المحاسب»
O6.png shows a button that sends the open report (or an attached file) to the accountant's email/phone. There is no Edge Function or RPC for sending mail/SMS anywhere in the project yet, so the button in O6 is disabled with an explanation instead of pretending to send anything.

## Request
An Edge Function, something like `send_report(p_station uuid, p_to text, p_period jsonb, p_kind text)`:
- `require_role(owner, accountant)` — only finance roles may trigger it (never attendants/customers).
- `p_to`: an email already on `station_members` for that station (don't let the caller send to an arbitrary address — pick from the team, per the permissions skill's "don't hide, explain" and least-privilege spirit).
- Renders a simple HTML/CSV summary of the requested report for the given period and emails it (Resend, SES, or whatever Cowork already has configured for this project — none is wired up yet as far as this repo shows).
- Logs to `audit_log` (`action: 'send_report'`) so there's a record of who shared what with whom.

## Also useful, same shape
This is the same gap noted for O9 (sending the daily price list to customers) — one Edge Function could probably serve both if Cowork designs the payload generically (`p_kind: 'pl_report' | 'price_list' | ...`).
