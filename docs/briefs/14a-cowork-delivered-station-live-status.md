# 14a — سلّمه Cowork: حالة المحطة اللحظية (Task C1 من الخطة)

الخطة: `docs/superpowers/plans/2026-11-11-station-live-status.md` · المواصفات: `docs/superpowers/specs/2026-11-11-station-live-status-design.md`.
منشور على المشروع الحي في 2026-11-12، وكل الاختبارات المحلية (15 ملفاً) ناجحة. **لا تعدّل أي ملف في `supabase/`.**

## الملفان
- `supabase/migrations/20261111000200_station_live_status.sql`
- `supabase/tests/96_station_live_status_test.sql` (45 تحققاً)

اعمل لهما commit كما هما مع ملفَي الخطة والمواصفات.

## تنبيه على الاسم
اسم الجدول هو **`station_live_status`** وليس `station_status`، لأن `station_status` اسم نوع قائم بالفعل (حالة المحطة: setup / active / suspended). **اسم الدالة بقي `set_station_status`.** المواصفات والخطة محدَّثتان بهذا الاسم.

## الكتابة: `set_station_status(p_station uuid, p_open boolean, p_crowd text) returns jsonb`
متاحة لـ `authenticated` فقط، وتتحقق من الدور: **owner · shift_manager · attendant** لتلك المحطة. المحاسب والزبون وموظفو المنصّة يحصلون على `42501`.

- `p_open` و`p_crowd` مستقلان: `null` يعني «لا تغيّر هذا الحقل».
- `p_crowd` من `none` \| `medium` \| `high` فقط، وحرفياً بأحرف صغيرة.
- تُرجع نفس شكل المحطة الذي تُرجعه `public_stations()` بعد التحديث مباشرة، فاستعمل الناتج لتحديث الواجهة بدل استدعاء ثانٍ.
- كل تغيير يُسجَّل في `audit_log` (entity `station_live_status`).

الأخطاء — رسالة الخطأ هي `FUELOS_*` والتفصيل في `detail`:

| الحالة | الكود | detail |
|---|---|---|
| `p_open` و`p_crowd` كلاهما null | `FUELOS_BAD_REQUEST` | `empty` |
| مستوى زحام غير معروف | `FUELOS_BAD_REQUEST` | `crowd` |
| ليس من طاقم المحطة | `42501` | — |

## القراءة العامة: `public_stations() returns jsonb`
متاحة لـ `anon` و`authenticated`. مصفوفة فيها كل محطة حالتها `active`، مرتّبة بالاسم، **وقواعد الصلاحية مطبَّقة في الخادم**: الزحام الأقدم من 90 دقيقة يعود `null`، والضغطة اليدوية الأقدم من 12 ساعة تُترك للمناوبة المفتوحة ثم لـ `null`. العميل لا يحسب شيئاً.

```json
{
  "station_id": "…", "name": "محطة النور", "city": "دمشق", "address": null,
  "lat": null, "lng": null,
  "is_open": true, "open_source": "manual", "open_set_at": "2026-11-12T08:00:00Z",
  "crowd": "medium", "crowd_set_at": "2026-11-12T08:40:00Z",
  "products": [
    { "product_id": "…", "name": "بنزين 95", "price": "195", "price_updated_at": "…",
      "availability": "available", "availability_source": "manual", "availability_updated_at": "…" }
  ]
}
```
`is_open` و`open_source` و`crowd` قد تكون `null` (غير معروف). `products` قد تكون `[]`. `lat`/`lng` قد تكونان `null`.

## القراءة الخام: جدول `station_live_status`
لتطبيق العامل ولوحة صاحب المحطة ولوحة الأدمن. `select` فقط لـ `authenticated`، وسياسة RLS تحصرها في أعضاء المحطة وموظفي المنصّة. **لا إدراج ولا تعديل ولا حذف لأي دور** — أي محاولة كتابة مباشرة تُرجع `42501`، فاستعمل الدالة.

الأعمدة: `station_id`, `is_open`, `open_set_at`, `crowd`, `crowd_set_at`, `updated_by`, `updated_at`.
هذه قيم **خام** بلا تطبيق للصلاحية، لذلك مرّرها على `stationStatusView` من `packages/core` (المهمة 1 في الخطة).

## حالة البيانات الحقيقية الآن
- محطتان نشطتان: «محطة النور» و«محطة ابو الهيف»، لكل منهما 3 منتجات.
- لا توجد حالة محفوظة بعد لأي محطة (`is_open` و`crowd` فارغان) — طبيعي قبل أول ضغطة.
- **لا إحداثيات لأي من المحطتين** (`lat` و`lng` فارغان). لذلك الخريطة ستكون فارغة والترتيب حسب القرب لن يعمل حتى يُدخل صاحب المحطة الإحداثيات من «الإعدادات ← الموقع» في لوحته. تعامل مع الحالتين كما تقول الخطة: المحطة بلا إحداثيات تبقى في القائمة وتُستثنى من الخريطة.
