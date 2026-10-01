# Brief 06e — delivered by Cowork: station equipment, Storage, customer card (answers 06b, 06c, 06d)

Written by Claude in Cowork on 2026-10-01. Everything below is **already deployed** to Supabase as migration
`20261001000100_equipment_storage_customer_card.sql`, with tests in `supabase/tests/90_equipment_storage_card_test.sql`
(300 checks pass locally). The local test stub (`supabase/tests/local/00_supabase_stub.sql`) now includes Storage.
**Do not edit `supabase/`** — commit the files as they are.

One correction to 06b: a new station is **not** empty. `admin_create_station()` already creates the 3 default
products (`gasoline_90`, `gasoline_95`, `diesel`), the chart of accounts and the first period. Only tanks, pumps
and nozzles were missing.

## 1. Station equipment (06b) — A2 steps 2–3, plus owner-web later
Call `rpc('setup_station_equipment', { p_station, p_equipment })`. It returns `{ products, tanks, pumps, nozzles }`,
which are the counts it created.
- **Who:** a platform admin (during onboarding) **or** the station's owner (when the station grows; decided: yes).
  Others get 42501.
- **All or nothing.** It is additive only, so nothing that exists is changed. It is audited as `setup_equipment`.
- **Shape:**
  ```json
  { "products": [ { "code": "lpg", "name": "غاز" } ],
    "tanks":    [ { "key": "T1", "product_code": "gasoline_95", "name": "خزان 95", "capacity_l": 20000, "min_level_pct": 20 } ],
    "pumps":    [ { "number": 1, "name": "مضخة 1",
                    "nozzles": [ { "label": "1", "tank_key": "T1", "last_reading": 184220.5 } ] } ] }
  ```
  - `products` is optional and only needed for a fuel outside the 3 defaults. Its `code` uses `a-z 0-9 _`.
  - A nozzle uses `tank_key` (a tank in the same call) **or** `tank_id` (an existing tank of this station).
  - `last_reading` is **what the meter shows today**. Ask for it per nozzle with the helper «اكتب الرقم الظاهر على
    العداد الآن». The first shift's opening reading is compared against it, so 0 is only right for a brand-new meter.
  - **Templates** («صغيرة · 4 مضخات», «متوسطة · 6», «كبيرة · 10») live in the client. They only pre-fill this JSON,
    which the admin then edits.
- **Errors:**
  - `FUELOS_BAD_REQUEST`, where `detail` names what is wrong. Examples: `pump 3 already exists`,
    `tank T1: unknown product`, `pump 2: nozzle tank/reading`, `equipment values`.
  - `FUELOS_NOT_FOUND` (station).
  - `42501` (permission).
- **A2 readiness checklist:** call `rpc('station_readiness', { p_station })`. It is for platform staff or the owner.
  The platform can't read a station's tables, so use this RPC rather than selects. It returns:
  `{ station_status, products, tanks, pumps, nozzles, prices_set, owner_signed_in, attendants, attendants_with_pin,
  devices, subscription, first_shift_at }`.
  The 7 items are:
  1. station created
  2. `tanks > 0 && nozzles > 0`
  3. `prices_set >= 1`
  4. `owner_signed_in`
  5. `attendants_with_pin >= 1`
  6. `subscription` not null
  7. `first_shift_at` not null
- **Owner-web:** add «إضافة مضخة / خزان» under settings using the same RPC. Owners can already read their own
  tanks, pumps and nozzles.

## 2. Storage (06c)
There are two **private** buckets, and each path starts with the station id.

**`meter-photos`** holds images only (jpeg, png or webp), up to 5 MB each.
- Path: `{station_id}/{leg_id or tank_id}/{nozzle_id}-{opening|closing}-{uuid}.jpg`.
- **Upload:** any active member of that station. **Read:** that station's members (plus support with an access grant).
- No update and no delete: a photo is evidence.
- **Offline outbox:**
  1. Generate the uuid once and store the path in the outbox row.
  2. On retry, upload with `upsert: false`. A **409 / "already exists" counts as success**, which keeps it idempotent.
  3. Then pass the path to the RPC's existing `photo_path` / `p_photo`.
  4. If the photo upload keeps failing, still send the reading **without** the photo: the photo is optional and
     must never block a shift.
- **Show:** `supabase.storage.from('meter-photos').createSignedUrl(path, 300)`. Never use a public URL.

**`invoice-pdfs`** holds PDFs only, up to 10 MB each.
- Path: `{station_id}/{invoice_id}.pdf`.
- The apps **cannot write** here; only the service role can.
- **Read:** the invoice's own customer, and the station's owner or accountant.
- Nothing generates PDFs yet; that will be a separate Edge Function later. Keep «تنزيل PDF» disabled with its
  explanation until `invoices.pdf_path` is set. When it is set, use `createSignedUrl` with `invoices.pdf_path`.

## 3. Customer card (06d)
- **`customers.qr_token`** is 12 characters (`0-9 A-F`). It is unique, and every customer has one, including existing customers.
  - Customer app: add a «بطاقتي» screen, or a block on C1, with a QR of `qr_token`. Show the same 12 characters
    below it in groups of 4 (`AB12 CD34 EF56`) for typing.
  - The customer reads it from his own `customers` row.
- **Worker app:** «ربط زبون (اختياري)» calls `rpc('lookup_customer_for_sale', { p_station, p_query })`.
  - `p_query` is a scanned or typed card code (spaces and case are ignored) **or** a phone number. A phone matches
    on its last 9 digits, so `0900 000 006` finds `+963900000006`.
  - It returns `{ customer_id, display_name, matched_by: "card"|"phone", points }` or **null**.
    - `display_name` is the first name only.
    - `points` is the customer's balance at this station.
  - It returns **null** for: no match, more than one match, or under 6 characters.
  - Show «تأكد من الاسم: رنا» and let the attendant confirm. Then pass `customer_id` as `p_customer` to `record_sale`,
    as before.
  - Who: attendant, shift manager or owner (others get 42501).
  - **Offline:** the lookup needs the network. Offline, show «الربط يحتاج اتصالاً — يمكن البيع بدون ربط»
    and never block the sale.

## Done when
- lint, test and build pass in every app.
- Browser test:
  1. As admin, equip one of the test stations (for example «ابو الهيف») with a template and its meter readings. The checklist moves.
  2. As its owner, add one more pump.
  3. As an attendant, open a shift on the new pump, take a meter photo and see it from owner-web.
  4. As the customer, open «بطاقتي». As an attendant, link a cash sale by typing the code. The sale then appears
     under «فواتيري».
- One commit and a push, then a short Arabic summary for the owner.
