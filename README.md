# FuelOS — نظام تشغيل محطة الوقود

هذا المستودع هو نقطة البداية لبرمجة النظام. فيه:

| المجلد / الملف | ما فيه |
|---|---|
| `CLAUDE.md` | دليل المشروع الذي يقرؤه Claude Code تلقائياً: التقنيات، القواعد، المصطلحات، المراحل |
| `.claude/skills/` | 5 مهارات خاصة بالمشروع: المحاسبة، الصلاحيات، العمل دون اتصال، نظام التصميم، قواعد تجربة المستخدم |
| `supabase/migrations/` | قاعدة البيانات كاملة: 41 جدولاً، سياسات أمان RLS، القيود المحاسبية، الموافقات، سجل المراجعة |
| `supabase/seed.sql` | بيانات تجريبية لـ «محطة النور» |
| `supabase/tests/` | 88 فحصاً آلياً لقواعد العمل والصلاحيات، وكلها ناجحة |
| `docs/data-model.md` | خريطة قاعدة البيانات وقواعد القيود |
| `docs/spec/` | ملف المواصفات الأصلي |
| `design/screens/` | صور الشاشات الـ 38 مرقّمة بالرمز: O1، S2، C3… |
| `design/tokens.json` | الألوان والخطوط والمسافات بصيغة قابلة للبرمجة |
| `design/figma-plugin/` | الإضافة التي تبني ملف فيجما، مع مصدرها |

---

## التشغيل على ويندوز خطوة بخطوة

### 1) ثبّت الأدوات مرة واحدة

- **Git for Windows**: من <https://git-scm.com/downloads/win>. يمنح Claude Code طرفية Bash.
- **Node.js LTS**: من <https://nodejs.org>. نحتاجه لـ Next.js ولأداة Supabase.
- **Claude Code**: افتح **PowerShell** (دون صلاحيات المسؤول) واكتب:
  ```powershell
  irm https://claude.ai/install.ps1 | iex
  ```
  ثم تحقّق بالأمر `claude --version`. يحتاج Claude Code إلى اشتراك Pro أو Max أو Team.
- **GitHub CLI**: الأمر `winget install GitHub.cli` ثم `gh auth login`.
- **PostgreSQL**: اختياري، لتشغيل الاختبارات محلياً. ثبّته من <https://www.postgresql.org/download/windows/>، وستحصل معه على `psql`.

### 2) جهّز المستودع على GitHub

فكّ الضغط في مجلد مثل `C:\Projects\fuelos`، ثم نفّذ في PowerShell:

```powershell
cd C:\Projects\fuelos
git init
git add .
git commit -m "FuelOS starter: design, database, skills"
gh repo create fuelos --private --source . --push
```

### 3) أنشئ مشروع Supabase واربطه

1. أنشئ مشروعاً جديداً في <https://supabase.com/dashboard> باسم `fuelos-dev`. هذا مشروع تطوير فقط.
2. من مجلد المشروع نفّذ:

   ```powershell
   npx supabase login
   npx supabase init            # ينشئ supabase/config.toml فقط، ولا يلمس المجلدات الموجودة
   npx supabase link --project-ref <رمز-المشروع>
   npx supabase db push --include-seed
   ```

   تجد رمز المشروع في رابط لوحة التحكم: `.../project/<ref>`.
3. **تحقّق من القاعدة** إن كان `psql` مثبتاً. انسخ «Connection string» من *Project Settings → Database* ثم نفّذ:

   ```powershell
   psql "<connection string>" -X -v ON_ERROR_STOP=1 -f supabase/tests/10_business_rules_test.sql
   ```

   يجب أن ترى في النهاية: `ALL BUSINESS-RULE TESTS PASSED`.

> ⚠️ ملف `seed.sql` ينشئ مستخدمين تجريبيين بكلمة مرور معروفة (`FuelOS-demo-2026`). استخدمه في مشروع التطوير فقط، ولا تشغّل `--include-seed` على مشروع الإنتاج أبداً.

### 4) افتح المشروع في Claude Code

```powershell
cd C:\Projects\fuelos
claude
```

- يقرأ Claude ملف `CLAUDE.md` تلقائياً، ويستعمل المهارات الخمس من `.claude/skills` عندما يعمل في مجالها.
- اكتب `/skills` لترى المهارات، و`/init` **لا تحتاجه** لأن `CLAUDE.md` جاهز.
- **اربط Supabase** ليقرأ Claude قاعدتك مباشرة. استعمل خادم MCP الرسمي من Supabase، وانسخ الأمر الحالي من صفحتهم <https://supabase.com/docs/guides/ai-tools/mcp>. يكون عادة بهذا الشكل:
  ```powershell
  claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<رمز-المشروع>&read_only=true"
  ```
  نبدأ بوضع القراءة فقط `read_only=true`، والتعديلات تمر عبر ملفات migrations في المستودع.
- **GitHub**: يكفي `gh` المثبت في الخطوة 1، إذ يستعمله Claude لإنشاء الفروع وطلبات الدمج.

### 5) أول طلبات مقترحة لـ Claude Code

1. «اقرأ CLAUDE.md و docs/data-model.md، ثم أنشئ Edge Function لدخول العامل بـ PIN على جهاز مسجّل (L2)».
2. «اقرأ docs/briefs/01-worker-pwa.md ونفّذه»: تطبيق العامل PWA بـ Next.js في apps/worker، يعمل من المتصفح ودون اتصال.
3. «أضف طبقة outbox دون اتصال حسب مهارة fuelos-offline-sync، واربط S2 بـ record_sale».
4. «أنشئ apps/owner-web بـ Next.js (RTL وخط Cairo)، وابدأ بـ L1 ثم O1 ثم O7».

اعمل على شرائح صغيرة: قاعدة ← دالة RPC ← واجهة ← اختبار، واطلب منه تشغيل الاختبارات قبل كل commit.

---

## اختبار القاعدة دون Supabase (اختياري)

إذا كان Postgres 16 مثبتاً محلياً، نفّذ من Git Bash:

```bash
PGHOST=localhost PGUSER=postgres ./supabase/tests/local/run_local.sh
```

يبني هذا الأمر قاعدة مؤقتة، ويطبّق كل الملفات والبيانات التجريبية، ثم يشغّل كل الفحوص (107).

## الحسابات التجريبية (مشروع التطوير فقط)

كلمة المرور لكل الحسابات: `FuelOS-demo-2026`

| الدور | البريد |
|---|---|
| صاحب المحطة (أحمد سالم) | owner@demo.fuelos.app |
| محاسبة (ليلى حداد) | accountant@demo.fuelos.app |
| مدير مناوبة (سامر يوسف) | manager@demo.fuelos.app |
| عامل (خالد العمر) | attendant1@demo.fuelos.app |
| عامل (محمد خليل) | attendant2@demo.fuelos.app |
| زبونة (رنا عيسى) | customer@demo.fuelos.app |
| أدمن المنصة | admin@demo.fuelos.app |

## قرارات مؤجلة تحتاج رأيك

ستجدها في `docs/data-model.md` §8:

- العملة النهائية.
- الضرائب.
- طريقة حساب التكلفة: متوسط مرجّح أم FIFO.
- قاعدة نقاط الولاء.
- سياسة تغيير السعر أثناء المناوبة.
