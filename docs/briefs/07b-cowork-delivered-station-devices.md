# Brief 07b — delivered by Cowork: device list with credential status (answers 07a)

Written by Claude in Cowork on 2026-10-01. **Already deployed** to Supabase as migration
`20261001000200_station_devices.sql`, tests in `supabase/tests/91_station_devices_test.sql` (all pass locally).
**Do not edit `supabase/`** — commit the files as they are. Your reading of 07a was right; the shape chosen is the RPC.

## `rpc('station_devices', { p_station })` → jsonb array
- **Who:** owner or shift manager of the station (same as `issue_device_credential` / `revoke_device`). Others get `42501`.
- **Each element:**
  `{ device_id, label, last_sync_at, pending_ops, created_at, credential_status, credential_issued_at, credential_revoked_at }`
  - `credential_status` is `'active' | 'revoked' | 'none'`. `none` = a device row that was never issued a secret
    (old seed or manual rows). `revoked` = revoked and unusable until re-issued.
  - Oldest device first. An empty array when the station has none.
- No secret or hash is ever returned (a test pins this). `device_credentials` stays readable by `service_role` only.

## For the screen (your build, nothing else needed from the DB)
- **List:** status badge «فعّال / مُبطَل / غير مفعّل», label, «آخر مزامنة», «عمليات معلّقة». Use the 3-day rule
  (`last_sync_at` older than 3 days → «لم يتزامن منذ…») like the admin app.
- **«+ تسجيل جهاز»:** generate `device_id` client-side (short slug or `crypto.randomUUID()`), call
  `issue_device_credential(p_station, p_device_id, p_label)`, show the returned secret **once** with «نسخ»
  and a warning that it can't be shown again.
- **«إعادة إصدار الرمز»:** the same call with the same `device_id` rotates the secret (the old one stops working).
  It also un-revokes a revoked device. Warn first: «الرمز القديم سيتوقف».
- **«إبطال الجهاز»:** `revoke_device(p_device_id, p_reason)`; the reason is required.
- Errors: `FUELOS_REQUIRED` (blank device id), `FUELOS_ID_CONFLICT` (id belongs to another station),
  `FUELOS_REASON_REQUIRED`, `FUELOS_NOT_FOUND`, `42501`.

## Done when
- lint, test and build pass in owner-web.
- Browser test: register a device → badge «فعّال» and the secret shows once → revoke with a reason → «مُبطَل» →
  re-issue → «فعّال» again. As an accountant, the screen explains it is for owner / shift manager only.
- One commit and a push, then a short Arabic summary for the owner.
