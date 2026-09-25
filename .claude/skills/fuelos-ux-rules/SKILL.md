---
name: fuelos-ux-rules
description: Use when designing screens, writing UI copy, error/empty/loading states, or reviewing any FuelOS screen for usability — Arabic copy tone, one primary action, worker-app ergonomics, "last updated + source" labels, the six general states and the screen inventory.
---

# FuelOS UX rules (from the spec + design review)

## The ten rules
1. **Put the most critical information at the top.** On O1 the first thing is the riskiest alert, for example «فرق صندوق 12,000 ل.س في المضخة 3». Then KPIs, then detail.
2. **One primary button per screen.** Use `brand/action` for save, approve or pay. Everything else is secondary or ghost.
3. **Worker ergonomics:** buttons are 56px high (`Button size=lg`), inputs 64px, and numbers use `Number/Hero 44`. Give one task per screen, with thumb-reachable actions at the bottom. The app works in sunlight, so use strong status colors and never rely on color alone: always add a word or icon.
4. **Every manually entered or estimated number shows «آخر تحديث» + its source**, e.g. «آخر قياس 07:30 · يدوي» or «محسوب من المخزون الدفتري». Prices and availability shown to customers always carry their time and source, plus «أبلغ عن خطأ».
5. **Numbers:** Latin digits with thousands separators; liters to one decimal in the worker app (`40.0 لتر`); money without decimals unless the currency needs them. The unit always follows the number.
6. **Don't hide, explain.** A disabled action says who can do it (see the `fuelos-permissions` skill).
7. **No technical error codes** for users. Every error has three parts: what happened, why, and what to do. Example: «لم نتمكن من حفظ الإغلاق — الفرق أكبر من الحد المسموح — اكتب سبب الفرق». Codes are mapped in the `fuelos-offline-sync` skill.
8. **No silent delete.** Destructive or financial corrections ask for a reason and show up in the Audit Drawer.
9. **Estimates are labeled.** Profit without full purchase costs shows «تقديري» (Status Badge info) and a link to complete the missing cost.
10. **Offline is normal.** The worker always sees the Sync Indicator and the count of pending operations. Saving offline is a success state (S3), not an error.

## The six general states (every data screen must handle them)
| State | Rule | Reference |
|---|---|---|
| Loading | Skeleton that matches the layout, never a white screen or a lone spinner, especially for tables and reports | ST1 |
| Empty | Explain the next step and give one action: «أضف خزاناً» · «افتح مناوبة» · «اربط أول فاتورة» | ST2 |
| Error | Short message + reason + clear action (retry / contact). No stack traces or codes | ST3 |
| Offline | Worker app saves locally and shows «N عمليات بانتظار المزامنة» | S3 |
| Permission denied | Say who has the permission; offer «اطلب الصلاحية» | ST4 |
| Audit | Every sensitive change is visible: who, when, what changed, why | Audit Drawer |

## Copy style (Arabic)
- Use Modern Standard Arabic that is short and direct. Address the user politely in the second person: «أدخل القراءة النهائية».
- Buttons are verbs describing the result: «ابدأ المناوبة», «حفظ العملية», «إرسال للاعتماد», «اعتماد الإغلاق». Avoid «موافق» and «إرسال» on their own.
- Use the domain terms consistently:
  - مناوبة (shift)
  - مضخة (pump)
  - مسدس (nozzle)
  - خزان (tank)
  - قيد (journal entry)
  - آجل (credit)
  - قسيمة (voucher)
  - توريد (delivery)
  - قياس فعلي (dip)
  - مخزون دفتري (book stock)
  - فرق الصندوق (cash difference)
- Dates look like «الخميس 24 سبتمبر · 10:48». Use relative time for freshness: «منذ 5 دقائق».

## Key flows (keep them this short)
- **Open shift (S1):** pick pump → opening reading per nozzle (photo optional) → opening cash → «ابدأ المناوبة».
- **Quick fill (S2):** by liters or by amount → the price is locked from the shift → payment method → optional QR / customer link → «حفظ العملية» → S3.
- **Credit fill (S8/S9):** scan QR or type the plate → the remaining limit is shown → over the limit gives «املأ X لتر فقط» or «طلب موافقة المدير».
- **Close shift (S4–S7):** a wizard, not a long page. Step 1 is the final readings, step 2 the counted cash, step 3 the review. If the difference is above the tolerance, the reason is required before «إرسال للاعتماد».
- **Owner approval (O7):** a snapshot of the numbers, then approve or reject. A rejection needs a note. For a cash shortage, the owner chooses «مصروف عجز» or «على الموظف».

## Review checklist for a new screen
- [ ] RTL correct (start = right), with no `left`/`right` in styles
- [ ] One primary action; worker screens use `lg` sizes
- [ ] All six states handled
- [ ] Manual or estimated numbers show time + source
- [ ] Errors use the Arabic mapping, with no codes
- [ ] Permission-limited actions are explained, not hidden
- [ ] Matches `design/screens/<CODE>.png`
