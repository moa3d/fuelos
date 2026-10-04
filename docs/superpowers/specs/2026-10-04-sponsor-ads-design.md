# Sponsor ads (الإعلانات) — design

Date: 2026-10-04 · Status: approved in chat, spec under review
Owner of DB work: Cowork · Owner of UI work: Claude Code (apps/admin, apps/customer)

## 1. Intent

Abid sells ad space to **sponsors who pay the platform** (oil, tyres, insurance, …). He alone manages the ads
from the admin app. An ad is **one image: JPG, PNG, WEBP or animated GIF** — no video, no text-only ads. Ads are
shown to **everyone who opens the customer app, guests included**: a rotating banner at the top of the home
page plus a page «الإعلانات» listing all running ads. Each ad has a click-through link and a start/end date, and
the admin sees **views and clicks** per ad to report back to the sponsor.

Success = Abid uploads an image in the admin app, sets dates and a link, and within a minute the ad rotates on
the customer home page; the sponsor report shows believable view/click numbers he can export to Excel.

Out of scope (v1): city or station targeting, video, sponsor self-service, billing/invoicing of sponsors,
showing ads inside the worker or owner apps.

## 2. Data model (Cowork)

### `ads`
| column | type | rule |
|---|---|---|
| id | uuid pk | default gen_random_uuid() |
| sponsor_name | text | required, 1–120 chars (shown small under the image: «إعلان · {sponsor}») |
| title | text | required, 1–120 chars; the image's alt text, also the caption on the ads page |
| image_path | text | required; object name inside bucket `ad-images`, `ads/<uuid>.<ext>` |
| link_url | text | optional; must match `https://…` or `tel:+digits` (wa.me links are https) |
| starts_at | timestamptz | required, default now() |
| ends_at | timestamptz | optional (open-ended); when set must be > starts_at |
| is_paused | boolean | default false |
| sort_order | int | default 0, lower first |
| created_by, created_at, updated_at | | audit columns |
| archived_at | timestamptz | soft delete; archived ads never show and are hidden from the admin list |

RLS enabled, **no direct table access** for anon/authenticated — everything goes through the RPCs below.
Writes are audited to `audit_log`.

### `ad_events`
`(ad_id, kind ∈ {view, click}, day date, viewer_key text)` with a **unique key on all four** — one view and one
click per device per ad per day. `viewer_key` is a random UUID the customer app keeps in localStorage; it is not
linked to the customer account, and no user id, IP or user agent is stored. RLS enabled, no direct access.

### Storage bucket `ad-images`
Public read (the images are adverts). Upload/replace/delete only by platform admins. Allowed MIME types:
image/jpeg, image/png, image/webp, image/gif. Size limit **3 MB**. Recommended artwork: 1200×675 (16:9).

## 3. RPC contract (Cowork)

All return jsonb; errors are P0001 `FUELOS_*` or 42501 `FUELOS_PERMISSION_DENIED`.

| RPC | who | does |
|---|---|---|
| `active_ads()` | anon + authenticated | `[{id, sponsor_name, title, image_path, link_url, sort_order}]` — not archived, not paused, `starts_at <= now()`, `ends_at` null or in the future; ordered by sort_order, then newest |
| `record_ad_event(p_ad uuid, p_kind text, p_viewer text)` | anon + authenticated | records a view/click for today (UTC day) if the ad is currently active and `p_viewer` is a UUID string; duplicates are silently ignored; returns `{recorded: bool}` |
| `admin_ads()` | platform staff | every non-archived ad with a computed `status` ∈ scheduled / running / paused / ended, plus total views and clicks |
| `save_ad(p_id uuid, p_sponsor text, p_title text, p_image_path text, p_link text, p_starts timestamptz, p_ends timestamptz, p_sort int, p_paused bool)` | platform **admin** | insert when `p_id` is null, otherwise update; validates every rule above (`FUELOS_REQUIRED`, `FUELOS_BAD_REQUEST` with detail `link` / `dates` / `image_path`); returns the ad |
| `archive_ad(p_id uuid)` | platform admin | sets archived_at (the image file stays; the UI may delete it from storage) |
| `ad_stats(p_from date, p_to date)` | platform staff | per ad per day: `{rows:[{ad_id, sponsor_name, title, day, views, clicks}], totals:[{ad_id, views, clicks, ctr}]}`; period ≤ 400 days |

## 4. Admin app (Claude Code)

New sidebar item «الإعلانات» (`/ads`):
- List of ads with thumbnail, sponsor, title, dates, status chip (مجدول / يعمل / متوقف / منتهٍ), views, clicks.
- «+ إعلان جديد» / «تعديل»: image picker (accept only jpg/png/webp/gif, reject > 3 MB before upload, show
  preview incl. animated GIF), upload to `ad-images/ads/<uuid>.<ext>`, fields sponsor, title, link (with a
  helper for WhatsApp `https://wa.me/<number>` and phone), start/end, then `save_ad`.
- Actions: إيقاف / تشغيل (toggle is_paused via save_ad), ▲▼ order, «أرشفة» with confirmation.
- «إحصائيات الإعلانات»: period picker, per-ad table (views, clicks, CTR %), «تصدير Excel» (same exceljs
  approach as A5) with one sheet per sponsor-ready report.
- Write actions shown to platform_admin only; support sees read-only.

## 5. Customer app (Claude Code)

- **Home banner** (guests and signed-in): carousel of `active_ads()`, 16:9, auto-advances every 5 s, swipe on
  touch, dots, pauses while touched; hidden entirely when there are no ads. A small «عرض الكل» opens `/ads`.
- **`/ads` «الإعلانات»**: all running ads stacked, each with the image, title and «إعلان · sponsor».
- **Views**: when ≥ 50 % of an ad is visible (IntersectionObserver), call `record_ad_event(id,'view',key)` once
  per ad per page load. **Clicks**: call `record_ad_event(id,'click',key)` (fire and forget), then open the link in
  a new tab with `rel="noopener noreferrer sponsored"`. Ads without a link are not clickable.
- `viewer_key`: random UUID in localStorage (`fuelos.ad_viewer`), wrapped in try/catch; when storage is
  unavailable use a per-session key.
- Image URL = public URL of `ad-images/<image_path>`; `loading="lazy"` except the first banner slide.
- Ads never block the page: a failed `active_ads()` simply hides the banner.

## 6. Testing

- DB (Cowork): psql tests — permissions per role (anon/customer/support/admin), every validation, date window,
  pause/archive hiding, event dedupe, stats sums, audit rows.
- Apps (Claude Code): unit tests for status computation, carousel index logic, file validation, CTR formatting;
  manual run on the live project with the demo admin account and a guest browser.
