# Brief 02a — database requests for Cowork (from the S1 slice)

Written by Claude Code on 2026-09-26 while building S1 «بداية المناوبة». These need the Supabase connection, so they go through Claude in Cowork. Nothing here blocks S1: the screen works without them and uses the server's `FUELOS_PUMP_BUSY` refusal instead.

## 1. Pump board for S1 (read RPC)
S1.png shows each pump's state («متاحة» / «مع يوسف») and the opening cash handed over by the previous shift («50,000 ل.س من مناوبة محمد خليل»). An attendant cannot read other attendants' shifts through RLS, so the app cannot show either today.

Proposal: `shift_start_board(p_station uuid) returns jsonb`, SECURITY DEFINER, `require_role(p_station, attendant/shift_manager/owner)`, returning per active pump:
- `pump_id`, `busy` (an `open`/`reopened` shift exists), `busy_with` (that attendant's `display_name` only — no amounts);
- `handover_cash` and `handover_from` (counted cash and attendant name of the last submitted/approved shift on that pump), or null.
Add a test in `supabase/tests` (attendant sees names but no other shift fields; guest gets 42501).

## 2. Device sync report (write RPC)
The offline-sync skill asks devices to report `pending_ops` / `last_sync_at` so the owner can spot a stuck device, but attendants have no update right on `devices`.

Proposal: `report_device_sync(p_device text, p_pending int)`, SECURITY DEFINER, caller must be an active member of the device's station; updates only those two columns.

## 3. Demo data note
Testing S1 on the dev project opens a real shift for خالد. Until S4 (close shift) exists, close or delete that test shift from Cowork after testing.
