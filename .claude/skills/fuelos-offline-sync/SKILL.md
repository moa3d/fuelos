---
name: fuelos-offline-sync
description: Use when building the FuelOS worker app (Flutter) or any client that writes shifts or sales, or when handling network errors, the sync indicator, the offline outbox, retries, or mapping FUELOS_* error codes to Arabic messages.
---

# FuelOS offline-first sync (worker app)

The spec says stations have no new hardware and the internet drops. The worker app **must keep working offline** and must never lose or duplicate a sale.

## Model
- **Local DB**: SQLite, using `drift`. It stores reference data (pumps, nozzles, prices, companies for lookup) and the **outbox**.
- **Outbox row** fields:
  - `id` (the client UUID of the operation)
  - `rpc` (`open_shift` | `record_sale` | `submit_shift`)
  - `params` (JSON)
  - `created_at`
  - `attempts`
  - `last_error`
  - `status` (`pending` | `sent` | `failed_permanent`)
- **Client-generated UUID v4** for every shift and sale, created **before** the first attempt and never regenerated. The server RPCs are idempotent on that id: replaying `record_sale` with the same id returns `{"replayed": true}`, and replaying `open_shift` returns the same shift.
- Send in **FIFO order**, one at a time. `record_sale` depends on its `open_shift`, and `submit_shift` depends on all its sales.
- Keep `client_created_at` (device time) in the params. The server keeps both that and `received_at`.

## Limits & UI
- `stations.offline_max_ops` (default **50**) caps pending operations. At the limit:
  - Block new sales with a clear message.
  - Allow closing the shift only after sync.
  - Message: «وصلت إلى 50 عملية غير متزامنة — اتصل بالإنترنت لإكمال المزامنة».
- The **Sync Indicator** component is always visible in the worker app header. It has three states:
  - متصل — «تمت المزامنة»
  - غير متصل — «محفوظ على الجهاز · N عمليات بانتظار المزامنة»
  - جاري المزامنة
- The saved screen (S3 «تم الحفظ (دون اتصال)») shows the pending count and that the sale is safe on the device.
- Also report `pending_ops` / `last_sync_at` on `devices`, so the owner can see a device that is stuck.

## Retry policy
| Result | Action |
|---|---|
| network error / timeout / 5xx | keep `pending`, exponential backoff (2s → 5 min), retry on connectivity change |
| success or `replayed: true` | mark `sent`, refresh local state from the response |
| `P0001` business error (see table) | stop the queue at this item, mark `failed_permanent`, show the Arabic message with an action; do **not** auto-retry |
| `42501` permission | stop the queue, show the permission message, ask the user to sign in again or call the manager |

The server is authoritative. For example, `record_sale` returns the server `unit_price` and `amount`; overwrite the local copy.

## Error code → Arabic (never show the code itself)
| Code | Message (worker) | Action |
|---|---|---|
| `FUELOS_PUMP_BUSY` | «هذه المضخة لديها مناوبة مفتوحة مع زميل آخر» | اختر مضخة أخرى / اتصل بالمدير |
| `FUELOS_READING_MISSING` | «أدخل قراءة كل مسدس قبل المتابعة» | highlight the empty field |
| `FUELOS_READING_BELOW_LAST` | «القراءة أقل من آخر قراءة مسجلة لهذا المسدس» | re-enter / take a photo of the meter |
| `FUELOS_SHIFT_NOT_OPEN` | «المناوبة مغلقة أو بانتظار الاعتماد» | افتح مناوبة جديدة |
| `FUELOS_CREDIT_LIMIT` | «الحد المتبقي لا يكفي: يمكن تعبئة X لتر فقط» (X from `detail.possible_liters`) | «املأ X لتر» / «اطلب موافقة المدير» |
| `FUELOS_COMPANY_FROZEN` / `_SUSPENDED` | «حساب الشركة مجمّد / موقوف — البيع نقداً فقط» | اختر طريقة دفع أخرى |
| `FUELOS_DRIVER_NOT_AUTHORIZED` | «السائق غير مصرّح له على حساب الشركة» | |
| `FUELOS_REASON_REQUIRED` | «الفرق أكبر من الحد المسموح — اكتب السبب» | focus the reason field |
| `FUELOS_NO_PRICE` | «لا يوجد سعر منشور لهذا الوقود — اتصل بالمدير» | |
| `FUELOS_ID_CONFLICT` | «تعذّر حفظ العملية — تواصل مع الدعم» | log to Sentry with the id |
| `FUELOS_PERMISSION_DENIED` / `42501` | «هذا الإجراء متاح لـ … فقط» | name the role that can do it |
| `FUELOS_PENDING_APPROVALS` (owner) | «هناك عمليات آجل بانتظار قرارك في هذه المناوبة» | open O7 |
| `FUELOS_PERIOD_CLOSED` (office) | «الفترة المحاسبية مغلقة — سجّل التسوية في الفترة الحالية» | |
| `FUELOS_PIN_INVALID` (L2) | «الرمز غير صحيح — بقيت X محاولات» (X from `attempts_left`) | clear the dots |
| `FUELOS_PIN_LOCKED` (L2) | «تم إيقاف الدخول مؤقتاً بعد محاولات خاطئة — حاول بعد HH:MM أو اطلب من المالك رمزاً جديداً» (from `locked_until`) | |
| `FUELOS_PIN_NOT_SET` (L2) | «لم يُحدَّد لك رمز بعد — اطلبه من صاحب المحطة» | |
| `FUELOS_DEVICE_NOT_REGISTERED` (L2) | «هذا الجهاز غير مسجّل للمحطة — اطلب من المدير تسجيله» | show device setup (manager OTP) |
| `FUELOS_PIN_LOGIN_UNAVAILABLE` (L2) | «تعذّر الدخول بالرمز لهذا الحساب — اتصل بالدعم» | log to Sentry |

Keep the mapping in one shared place (`packages/fuelos_core/lib/errors.dart` and `apps/owner-web/lib/errors.ts`), with a fallback: «حدث خطأ غير متوقع — حاول مرة أخرى». Unknown codes go to Sentry.

## Supabase client calls
```dart
final res = await supabase.rpc('record_sale', params: {
  'p_sale_id': op.id, 'p_shift': shiftId, 'p_nozzle': nozzleId,
  'p_liters': liters, 'p_unit_price': price, 'p_method': 'card',
  'p_device': deviceId, 'p_client_created_at': op.createdAt.toIso8601String(),
});
// PostgrestException: e.code == 'P0001' | '42501', e.message == 'FUELOS_…', e.details == detail
```

## Don'ts
- Don't delete outbox rows on failure. They are the proof of the sale.
- Don't compute the expected cash on the device for the final number. Show a local preview, then the server's `shift_summary` once it is online.
- Don't let two devices open the same pump. The server refuses with `PUMP_BUSY`, and the UI should explain it.
