# Brief 10a — delivered: sponsor ads (الإعلانات) — database ready, build the screens

**Status: deployed** to the live project (migration `20261004000200_sponsor_ads`), tested locally
(`supabase/tests/94_sponsor_ads_test.sql`, full runner green). Spec: `docs/superpowers/specs/2026-10-04-sponsor-ads-design.md`
(sections 4–5 are your UI requirements). Do **not** create files in `supabase/migrations`.

## What exists now
- Tables `ads`, `ad_events` — RLS on, **no direct access** for anon/authenticated. Use only the RPCs below.
- Storage bucket **`ad-images`**: public read, 3 MB max, `image/jpeg | image/png | image/webp | image/gif` only.
  Platform **admins** may upload/replace/delete, and **only under `ads/`**. Path rule (enforced by `save_ad`):
  `ads/<uuid v4 lower-case>.<jpg|jpeg|png|webp|gif>` — generate the uuid client-side, upload, then call `save_ad`.
  Image URL for display: `supabase.storage.from('ad-images').getPublicUrl(image_path).data.publicUrl`.

## RPCs
| RPC | who | returns |
|---|---|---|
| `active_ads()` | anyone (guest too) | `[{id, sponsor_name, title, image_path, link_url, sort_order}]` running ads, ordered |
| `record_ad_event(p_ad, p_kind 'view'\|'click', p_viewer)` | anyone | `{recorded: bool}` |
| `admin_ads()` | platform staff | every non-archived ad (all columns) + `status` (`scheduled`/`running`/`paused`/`ended`) + `views`, `clicks` (totals) |
| `save_ad(p_id, p_sponsor, p_title, p_image_path, p_link, p_starts, p_ends, p_sort, p_paused)` | platform **admin** | the saved ad row; `p_id = null` → insert |
| `archive_ad(p_id)` | platform admin | `{id, archived_at}` |
| `ad_stats(p_from date, p_to date)` | platform staff | `{rows:[{ad_id,sponsor_name,title,day,views,clicks}], totals:[{ad_id,sponsor_name,title,views,clicks,ctr}]}` |

Notes that matter for the UI:
- **save_ad on update:** `null` for `p_starts`, `p_sort` or `p_paused` keeps the stored value; `null` `p_ends` means
  open-ended (no end). On insert: start = now, sort 0, not paused. Pause/resume = `save_ad` with the ad's own values and
  `p_paused` true/false; reorder = `save_ad` with a new `p_sort` (e.g. swap two ads' sort values).
- **Dates:** convert the picked local date/time to `timestamptz` before sending; an "end date" picked as a day should
  mean the end of that day in the admin's local time.
- **Link:** `https://…` (WhatsApp = `https://wa.me/<digits>`) or `tel:+<digits>`; empty = not clickable.
- **viewer key:** random UUID kept in localStorage `fuelos.ad_viewer` (wrap in try/catch; fall back to a per-session
  UUID). One view and one click per device per ad per **UTC** day are counted; repeats return `recorded:false`.
- **Views:** call once per ad per page load when ≥ 50 % visible. **Clicks:** call fire-and-forget, then open the link in
  a new tab (`rel="noopener noreferrer sponsored"`). A click also counts the view if it wasn't recorded yet, so CTR ≤ 100 %.
  Ads without a link: render without click handler (the RPC ignores their clicks anyway).
- Numbers are **approximate, not audited** (a determined script can still add fake devices). Label the stats
  «أرقام تقديرية» in the admin screen and the Excel export. Counting pauses itself if the events table ever passes 100 MB
  (abuse guard); `record_ad_event` then just returns `recorded:false` — never show an error to the customer.
- `ad_stats`: period ≤ 400 days (difference between dates), sort client-side as you like (server order: rows by day desc,
  totals by sponsor).

## Errors → Arabic copy
| code (detail) | message |
|---|---|
| 42501 / `FUELOS_PERMISSION_DENIED` | «هذا الإجراء لمدير المنصة فقط» |
| `FUELOS_REQUIRED` | «أكمل اسم الراعي والعنوان والصورة» |
| `FUELOS_BAD_REQUEST` (`sponsor_name` / `title`) | «الاسم أو العنوان أطول من 120 حرفاً» |
| `FUELOS_BAD_REQUEST` (`image_path`) | «ارفع صورة بصيغة JPG أو PNG أو WEBP أو GIF» |
| `FUELOS_BAD_REQUEST` (`link`) | «الرابط يجب أن يبدأ بـ https:// أو يكون رقم هاتف tel:+…» |
| `FUELOS_BAD_REQUEST` (`dates`) | «تاريخ النهاية يجب أن يكون بعد تاريخ البداية» |
| `FUELOS_BAD_REQUEST` (`period`) | «اختر فترة صحيحة (حتى 13 شهراً)» |
| `FUELOS_NOT_FOUND` | «الإعلان غير موجود أو مؤرشف» |
| storage 413 / mime error | «الصورة أكبر من 3 ميغابايت أو صيغتها غير مدعومة» |

## Build checklist
**apps/admin** — sidebar «الإعلانات» (`/ads`): list (thumbnail, sponsor, title, dates, status chip مجدول/يعمل/متوقف/منتهٍ,
views, clicks); «+ إعلان جديد» / «تعديل» form with image picker (validate type + ≤ 3 MB before upload, preview incl. GIF),
sponsor, title, link (WhatsApp/phone helpers), start/end; إيقاف/تشغيل; ▲▼ order; «أرشفة» with confirm (may also remove
the image file); «إحصائيات الإعلانات» with period + per-ad table + «تصدير Excel» (same exceljs approach as A5).
Write actions visible to platform_admin only (support = read-only).

**apps/customer** — home banner carousel (guests too): 16:9, auto-advance 5 s, swipe, dots, pause on touch, hidden when
no ads, «عرض الكل» → `/ads` page «الإعلانات» listing all running ads with «إعلان · {sponsor}». First slide eager,
others `loading="lazy"`. A failed `active_ads()` simply hides the banner.

Test on the live project with `admin@demo.fuelos.app` (platform admin) and a guest browser.
