# Brief 06e — delivered by Cowork: station equipment, Storage, customer card (answers 06b, 06c, 06d)

Written by Claude in Cowork on 2026-10-01. Everything below is already deployed to Supabase (migration
20261001000100_equipment_storage_customer_card.sql; 300 DB checks pass).

Correction to 06b: a new station is NOT empty. `admin_create_station()` already creates the 3 default products
(gasoline_90, gasoline_95, diesel), the chart of accounts and the first period. Only tanks, pumps and nozzles
were missing.

## 1. Station equipment (06b): A2 steps 2–3, plus owner-web later

`rpc('setup_station_equipment', { p_station, p_equipment })` returns `{ products, tanks, pumps, nozzles }`, the
counts it created.

- Who: a platform admin (onboarding) OR the station's owner (when the station grows; decided: yes). Anyone else
  gets 42501.
- All or nothing. Additive only; nothing existing changes. Audited as `'setup_equipment'`.
- Shape:
  ```json
  { "products": [ { "code": "lpg", "name": "غاز" } ],
    "tanks":    [ { "key": "T1", "product_code": "gasoline_95", "name": "خزان 95", "capacity_l": 20000, "min_level_pct": 20 } ],
    "pumps":    [ { "number": 1, "name": "مضخة 1",
                    "nozzles": [ { "label": "1", "tank_key": "T1", "last_reading": 184220.5 } ] } ] }
  ```
  - `products` is optional: only for a fuel outside the 3 defaults. Its `code` uses a-z 0-9 _.
  - A nozzle uses `tank_key` (a tank in the same call) OR `tank_id` (an existing tank of this station).
  - `last_reading` = what the meter shows TODAY. Ask per nozzle with the helper «اكتب الرقم الظاهر على العداد
    الآن». The first shift's opening reading is compared against it, so 0 is only right for a brand-new meter.
  - Templates («صغيرة · 4 مضخات», «متوسطة · 6», «كبيرة · 10») live in the client and only pre-fill this JSON.
- Errors: `FUELOS_BAD_REQUEST` (detail names it, e.g. "pump 3 already exists", "tank T1: unknown product",
  "pump 2: nozzle tank/reading", "equipment values"), `FUELOS_NOT_FOUND` (station), 42501.
- A2 readiness checklist: `rpc('station_readiness', { p_station })`, for platform staff or the owner. The
  platform cannot read a station's tables, so use this, not selects. It returns
  `{ station_status, products, tanks, pumps, nozzles, prices_set, owner_signed_in, attendants,
  attendants_with_pin, devices, subscription, first_shift_at }`. The 7 items:
  1. station created
  2. tanks > 0 && nozzles > 0
  3. prices_set >= 1
  4. owner_signed_in
  5. attendants_with_pin >= 1
  6. subscription not null
  7. first_shift_at not null
- Owner-web: settings «إضافة مضخة / خزان» with the same RPC. Owners can already read their tanks, pumps and
  nozzles.

## 2. Storage (06c): two PRIVATE buckets; each path starts with the station id

`meter-photos`: images only (jpeg, png, webp), up to 5 MB.

- Path: `{station_id}/{leg_id or tank_id}/{nozzle_id}-{opening|closing}-{uuid}.jpg`
- Upload: any active member of that station. Read: that station's members (plus support with an access grant).
  No update and no delete: a photo is evidence.
- Offline outbox: generate the uuid once and store the path in the outbox row. Upload with `upsert: false`. On
  retry, a 409 "already exists" counts as SUCCESS (idempotent). Then pass the path to the RPC's existing
  `photo_path` / `p_photo`. If the photo keeps failing, still send the reading WITHOUT it: the photo is optional
  and must never block a shift.
- Show it with `supabase.storage.from('meter-photos').createSignedUrl(path, 300)`. Never use a public URL.

`invoice-pdfs`: PDF only, up to 10 MB. Path: `{station_id}/{invoice_id}.pdf`

- The apps CANNOT write here (service role only). Read: the invoice's own customer, plus the station's owner or
  accountant.
- Nothing generates PDFs yet (a later Edge Function). Keep «تنزيل PDF» disabled with its explanation until
  `invoices.pdf_path` is set; then use `createSignedUrl(invoices.pdf_path)`.

## 3. Customer card (06d)

- `customers.qr_token`: 12 characters (0-9 A-F), unique. Every customer has one, existing customers included.
  Customer app: a «بطاقتي» screen (or a block on C1) shows a QR of `qr_token`, with the same 12 characters below
  in groups of 4 (AB12 CD34 EF56) for typing. The customer reads it from his own `customers` row.
- Worker app «ربط زبون (اختياري)»: `rpc('lookup_customer_for_sale', { p_station, p_query })`.
  - `p_query` = a scanned or typed card code (spaces and case ignored) OR a phone number. A phone matches on
    its last 9 digits: `0900 000 006` finds `+963900000006`.
  - Returns `{ customer_id, display_name (first name only), matched_by: "card"|"phone", points (balance at
    this station) }`, or NULL for no match, more than one match, or under 6 characters.
  - Show «تأكد من الاسم: رنا» and let the attendant confirm. Then pass `customer_id` as `p_customer` to
    `record_sale`, as before.
  - Who: attendant, shift manager or owner (others get 42501).
  - Offline: the lookup needs the network. Show «الربط يحتاج اتصالاً — يمكن البيع بدون ربط»; never block the
    sale.

## Done when

- lint, test and build pass in every app.
- Browser test:
  1. As admin, equip a test station (e.g. «ابو الهيف») from a template, with meter readings. The checklist
     moves.
  2. As its owner, add one more pump.
  3. As an attendant, open a shift on the new pump, take a meter photo and see it from owner-web.
  4. As the customer, open «بطاقتي». As an attendant, link a cash sale by typing the code; it appears under
     «فواتيري».
- One commit and a push, then a short Arabic summary for the owner.
