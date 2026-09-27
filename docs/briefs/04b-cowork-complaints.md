# Brief 04b — complaints follow-ups (request for Cowork)

Written by Claude Code on 2026-09-27 while building O10 «شكاوى الزبائن والبلاغات». Needs the Supabase
connection, so it goes through Claude in Cowork. **Nothing here blocks O10**: replying, closing a case as
resolved, and recording an invoice correction all work today as plain writes under the existing RLS.

**Status (2026-09-27):** items 1, 2 and 4 done (`20260927000200_complaints_invoices_members.sql`); item 3
deferred to the Storage milestone.

## 1. `complaint_messages_write` doesn't check the author belongs to the complaint — done
```sql
create policy complaint_messages_write on complaint_messages for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from complaints c where c.id = complaint_id));
```
This only checks the complaint exists, not that `auth.uid()` is that complaint's customer or station staff of
its station. Any authenticated user who knows (or guesses) a `complaint_id` could insert a message into someone
else's case — worth tightening to something like `exists (select 1 from complaints c where c.id = complaint_id
and (c.customer_id = auth.uid() or is_station_staff(c.station_id) or is_platform_staff()))`. It also doesn't
constrain `author_side` to match who the caller actually is (a customer could insert `author_side = 'station'`),
so the owner-web app sets that column itself and a test should confirm the server also enforces it.

## 2. No path to mark an invoice `corrected` — done
`invoice_corrections` (owner/accountant insert) records the reason and amount delta, and O10 uses that today.
But there is no RLS policy or RPC that lets a client set `invoices.status = 'corrected'` afterward — only the
internal `submit_shift` flow ever writes `invoices.status`, and it's not built for this. Right now the invoice
still reads its original status after a correction is recorded. A small RPC, e.g.
`record_invoice_correction(p_invoice uuid, p_reason text, p_amount_delta numeric) returns uuid` (SECURITY
DEFINER, `require_role(owner, accountant)`) that inserts the correction row and sets `invoices.status =
'corrected'` in one transaction, would close this.

## 3. No re-issued invoice file — deferred to the Storage milestone
O10.png's "إصدار فاتورة مصحّحة" implies a new invoice PDF. There's no Storage bucket or PDF generation yet
(CLAUDE.md's own roadmap already has "Storage buckets and invoice PDFs" as the next DB milestone), so O10 only
records the correction row today and says so in the UI rather than claiming to reissue a file.

## 4. No scheduled escalation to the platform — done
`complaints.sla_due_at` (default now()+48h) and the `escalated` status exist, but nothing currently flips a
complaint to `escalated` when its SLA passes — no trigger, cron job, or Edge Function does it. O10 shows the
countdown and an overdue warning, but the owner never sees a case actually reach «مصعّدة» until something (a
`pg_cron` job or a scheduled Edge Function) sets that status. Worth a small job: `update complaints set status =
'escalated' where status in ('open','awaiting_station') and sla_due_at < now()`.
