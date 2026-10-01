# Brief 06c — Storage buckets for meter/tank photos and invoice PDFs (request for Cowork)

Written by Claude Code on 2026-09-30. Needs the Supabase connection (Storage bucket + RLS policies), so it
goes through Claude in Cowork. This is CLAUDE.md's own milestone 1 "Next" item, still not started — flagging
it now since it's the last thing blocking a few already-built, already-disclosed placeholders.

**Status (2026-10-01): done.** Cowork shipped both `meter-photos` and `invoice-pdfs` buckets with their policies
(docs/briefs/06e). The worker app's `MeterPhotoCard` (S1/S4–S6/move) now uploads for real and never blocks a
shift online or off; owner-web's O7 approvals links to the signed photo URLs. `invoice-pdfs` still has nothing
to generate a PDF yet, so «تنزيل PDF» stays disabled on purpose — that part of this brief is unchanged.
Verified end to end in a real browser against the hosted project.

## What's already ready, waiting only on the bucket
The RPC layer was built photo-aware from the start — nothing here needs a schema or RPC change, just a bucket:
- `invoices.pdf_path text` (nullable) already exists.
- `shift_readings`/`leg_readings.opening_photo_path`/`closing_photo_path` and `tank_measurements.photo_path`
  already exist, and `record_meter_reading`/the leg-opening/closing RPCs/`record_tank_measurement` all already
  accept a `p_photo`/`photo_path` string parameter and store it as-is (`supabase/migrations/20260924000300_functions.sql`,
  `20260926000200_shift_legs.sql`).
- Three places in the app already show a correctly-disabled, honest placeholder for this exact reason:
  `apps/worker/app/shift-parts.tsx`'s `MeterPhotoCard` ("اختيارية — تُفعَّل بعد تجهيز تخزين الصور"),
  `apps/customer/app/(private)/invoices/[id]/page.tsx`'s «تنزيل PDF», and O10's "إصدار فاتورة مصحّحة" per
  `docs/briefs/04b-cowork-complaints.md` §3.

So the only missing piece is the bucket(s) themselves and their access policy — once that exists, the client
side is normal: upload the file first, get back a path, pass that path as the RPC's existing parameter.

## Request
Two buckets (or one bucket with two path prefixes, whichever Cowork prefers):
1. **`meter-photos`** (private) — attendants upload from the worker PWA when opening/closing a leg or
   recording a tank measurement. Suggested path shape: `{station_id}/{shift_id or leg_id}/{nozzle_id}-{opening|closing}.jpg`
   so a storage RLS policy can check `station_id` against `station_members`/`devices` the same way table RLS
   already does. Readable by that station's members (owner/accountant/shift_manager to review, the attendant
   who took it); writable by an authenticated attendant device for their own station only.
2. **`invoice-pdfs`** (private) — generated PDFs for `invoices.pdf_path` (both original and O10's "فاتورة
   مصحّحة" reissue). Suggested path: `{station_id}/{invoice_id}.pdf`. Readable by the invoice's own customer
   and that station's finance roles; writable only by whatever generates the PDF (a SECURITY DEFINER
   Edge Function, not the client directly — the client shouldn't be trusted to write someone else's invoice).

## Not part of this request
Actually *generating* an invoice PDF (a template/renderer) is a separate, bigger piece of work — this brief is
only about the bucket + policies existing so the upload/download plumbing can be wired up. Happy to take that
as its own brief once Cowork has a view on what should render the PDF (an Edge Function? a scheduled job?).
