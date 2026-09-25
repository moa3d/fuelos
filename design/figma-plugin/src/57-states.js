// ============================================================
// Desktop login + general states (loading / empty / error / permission)
// ============================================================

function L1_Login() {
  function mini(label, v, tone) {
    return Col({ w: 'fill', pad: 14, gap: 2, radius: 14, fill: 'brand/dark-800', stroke: 'brand/dark-700' },
      Txt(label, { style: 'Body/Small 12', color: 'text/on-dark-muted' }), Txt(v, { style: 'Number/M 18', color: tone || 'text/on-dark' }));
  }
  return Row({ name: 'L1 · تسجيل الدخول (المكتب)', w: 1440, h: 1024, fill: 'surface/page', clip: true },
    Col({ name: 'Form side', w: 'fill', h: 'fill', main: 'center', cross: 'center' },
      Col({ name: 'Login card', w: 440, pad: 36, gap: 18, radius: 24, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Raised' },
        Row({ gap: 10 }, Row({ w: 40, h: 40, radius: 12, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 22, color: 'brand/dark' })), Txt('FuelOS', { style: 'Heading/H2 20' })),
        Col({ w: 'fill', gap: 4 }, Txt('تسجيل الدخول', { style: 'Display/32' }), Txt('لصاحب المحطة والمحاسب وأدمن المنصة', { style: 'Body/Regular 14', color: 'text/secondary' })),
        Field('البريد الإلكتروني أو رقم الهاتف', 'khaled@example.com', { icon: 'user' }),
        Field('كلمة المرور', '••••••••••', { icon: 'lock', focus: true }),
        Row({ w: 'fill', main: 'between' },
          Row({ gap: 8 }, Row({ w: 20, h: 20, radius: 6, fill: 'brand/primary', main: 'center', cross: 'center' }, Ico('check', { size: 14, color: 'text/on-dark' })), Txt('تذكّر هذا الجهاز', { style: 'Body/Regular 14' })),
          LinkText('نسيت كلمة المرور؟')),
        Btn('primary', 'دخول', null, { size: 'lg', w: 'fill' }),
        Row({ w: 'fill', gap: 10 }, Rect({ w: 'fill', h: 1, fill: 'border/default' }), Txt('أو', { style: 'Body/Small 12', color: 'text/muted' }), Rect({ w: 'fill', h: 1, fill: 'border/default' })),
        Btn('secondary', 'الدخول برمز لمرة واحدة (OTP)', 'phone', { w: 'fill' }),
        Row({ w: 'fill', pad: 12, gap: 8, radius: 12, fill: 'surface/muted', cross: 'start' }, Ico('info', { size: 16, color: 'text/secondary' }), Txt('عمال المحطة يدخلون من تطبيق الهاتف برمز PIN، حتى دون إنترنت.', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })))),
    Col({ name: 'Brand side', w: 620, h: 'fill', pad: 64, gap: 28, fill: 'brand/dark', main: 'center' },
      Txt('FuelOS · نظام تشغيل محطة الوقود', { style: 'Label/12', color: 'brand/action' }),
      Txt('ضبط مالي وتشغيلي لمحطتك — دون أجهزة جديدة.', { style: 'Display/32', color: 'text/on-dark', w: 'fill' }),
      Bullets(['كل عملية بيع أو توريد أو مصروف تتحول إلى قيد قابل للتتبع', 'إغلاق مناوبة بثلاث خطوات ومقارنة فورية للصندوق', 'تطبيق زبائن يعرض الأسعار والفواتير والنقاط'], { style: 'Body/Large 16', color: 'text/on-dark-muted', dot: 'brand/action', gap: 10 }),
      Row({ w: 'fill', gap: 12 }, mini('مبيعات اليوم', '2,026,400'), mini('فرق الصندوق', '-4,500', 'status/warning'), mini('المناوبات المغلقة', '3 / 4', 'brand/action'))));
}

function Sk(w, h, p) { return Rect(Object.assign({ name: 'Skeleton', w: w, h: h, radius: 8, fill: 'surface/muted' }, p || {})); }
function SkCard(p) {
  const kids = Array.prototype.slice.call(arguments, 1);
  return Col(Object.assign({ name: 'Skeleton card', w: 'fill', pad: 20, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default' }, p || {}), kids);
}

function ST1_Loading() {
  return Desktop('ST1 · حالة التحميل (Skeleton)', 'dash', [
    Row({ w: 'fill', main: 'between' }, Col({ gap: 8 }, Sk(220, 28), Sk(320, 14)), Row({ gap: 10 }, Sk(320, 40, { radius: 12 }), Sk(40, 40, { radius: 10 }))),
    Row({ w: 'fill', pad: 12, gap: 8, radius: 12, fill: 'status/info-50' }, Ico('refresh', { size: 16, color: 'status/info-700' }), Txt('جارٍ تحميل بيانات اليوم… تُعرض آخر نسخة محفوظة (14:02) فور جاهزيتها.', { style: 'Body/Small 12', color: 'status/info-700', w: 'fill' })),
    Row({ w: 'fill', gap: 16 }, [1, 2, 3].map(function () { return SkCard({ h: 84, gap: 10 }, Sk(200, 14), Sk(280, 12)); })),
    Row({ w: 'fill', gap: 16 }, [1, 2, 3, 4].map(function () { return SkCard({ h: 150 }, Row({ w: 'fill', main: 'between' }, Sk(110, 14), Sk(36, 36, { radius: 10 })), Sk(170, 30), Sk(130, 12)); })),
    Row({ w: 'fill', gap: 16, cross: 'start' },
      SkCard({ h: 420 }, Sk(180, 18), Sk('fill', 300, { radius: 12 }), Sk(360, 12)),
      SkCard({ w: 360, h: 420 }, Sk(120, 18), Sk('fill', 100, { radius: 12 }), Sk('fill', 100, { radius: 12 }), Sk('fill', 100, { radius: 12 })))
  ]);
}

function ST2_Empty() {
  function step(n, t, sub, state, cta) {
    const done = state === 'done', now = state === 'now';
    return Row({ w: 'fill', pad: 14, gap: 12, radius: 14, fill: now ? 'brand/primary-50' : 'surface/card', stroke: now ? 'brand/primary' : 'border/default', strokeW: now ? 2 : 1 },
      Row({ w: 32, h: 32, radius: 999, fill: done ? 'brand/action' : (now ? 'brand/primary' : 'surface/muted'), main: 'center', cross: 'center' }, done ? Ico('check', { size: 16, color: 'brand/on-action' }) : Txt(String(n), { style: 'Body/Strong 14', color: now ? 'text/on-dark' : 'text/muted' })),
      Col({ w: 'fill', gap: 0 }, Txt(t, { style: 'Body/Strong 14' }), Txt(sub, { style: 'Body/Small 12', color: 'text/muted' })),
      cta ? Btn(now ? 'primary' : 'secondary', cta) : (done ? Badge('success', 'تم') : null));
  }
  return Desktop('ST2 · محطة جديدة بلا بيانات (Empty)', 'dash', [
    PageHeader('لوحة القيادة', 'محطة الوادي · أول يوم تشغيل'),
    Col({ name: 'Center', w: 'fill', h: 'fill', main: 'center', cross: 'center' },
      Col({ name: 'Empty card', w: 640, pad: 36, gap: 18, radius: 24, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Card', cross: 'center' },
        IconBox('layers', { size: 72, radius: 22, iconSize: 34 }),
        Txt('لا توجد بيانات بعد', { style: 'Heading/H1 24', align: 'center' }),
        Txt('اللوحة تمتلئ تلقائياً بعد أول مناوبة. ابدأ بالخطوات التالية — تستغرق أقل من 30 دقيقة.', { style: 'Body/Large 16', color: 'text/secondary', w: 520, align: 'center' }),
        Col({ w: 'fill', gap: 10 },
          step(1, 'بيانات المحطة', 'الاسم والعنوان وساعات العمل', 'done'),
          step(2, 'أضف الخزانات', 'نوع الوقود والسعة وأول قياس', 'now', 'إضافة خزان'),
          step(3, 'أضف المضخات واربطها', 'كل مضخة بخزان واحد', 'todo'),
          step(4, 'افتح أول مناوبة', 'من تطبيق العامل على الهاتف', 'todo')))),
  ], { sidebar: { station: 'محطة الوادي', stationSub: 'محطة جديدة · قيد الإعداد' } });
}

function ST3_Error() {
  return Desktop('ST3 · خطأ مع سبب وإجراء (Error)', 'reports', [
    PageHeader('التقارير والتحليلات', 'الربح والخسارة · سبتمبر 2026'),
    Col({ name: 'Center', w: 'fill', h: 'fill', main: 'center', cross: 'center', gap: 16 },
      Col({ name: 'Error card', w: 620, pad: 32, gap: 16, radius: 24, fill: 'surface/card', stroke: 'status/danger', strokeOpacity: 0.35, shadow: 'Shadow/Card' },
        IconBox('alert', { size: 56, radius: 16, bg: 'status/danger-50', fg: 'status/danger', iconSize: 28 }),
        Txt('تعذّر حساب تقرير الربح والخسارة', { style: 'Heading/H1 24' }),
        Col({ w: 'fill', gap: 4 }, Txt('السبب', { style: 'Label/12', color: 'text/muted' }), Txt('شحنة بنزين 95 (فاتورة المورد INV-2231) مسجّلة دون سعر شراء، لذلك لا يمكن حساب تكلفة الوقود المباع بدقة.', { style: 'Body/Large 16', w: 'fill' })),
        Row({ w: 'fill', gap: 10 }, Btn('primary', 'إدخال تكلفة الشراء', 'plus'), Btn('secondary', 'عرض تقرير تقديري بدونها'))),
      Row({ name: 'Network error', w: 620, pad: 16, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default' },
        IconBox('wifiOff', { size: 40, radius: 12, bg: 'status/warning-50', fg: 'status/warning-700' }),
        Col({ w: 'fill', gap: 0 }, Txt('مثال آخر: انقطع الاتصال أثناء التحميل', { style: 'Body/Strong 14' }), Txt('بياناتك محفوظة. سنعيد المحاولة تلقائياً خلال 10 ثوانٍ.', { style: 'Body/Small 12', color: 'text/muted' })),
        Btn('secondary', 'إعادة المحاولة الآن', 'refresh')),
      Txt('قاعدة: رسالة مختصرة + سبب + إجراء واضح. لا رموز أخطاء تقنية للمستخدم العادي.', { style: 'Body/Small 12', color: 'text/muted' }))
  ]);
}

function ST4_Permission() {
  return Desktop('ST4 · لا تملك الصلاحية (Permission)', 'approvals', [
    PageHeader('الموافقات', '3 طلبات بانتظار صاحب المحطة'),
    Col({ name: 'Center', w: 'fill', h: 'fill', main: 'center', cross: 'center' },
      Col({ name: 'Permission card', w: 620, pad: 32, gap: 16, radius: 24, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Card' },
        IconBox('lock', { size: 56, radius: 16, bg: 'status/warning-50', fg: 'status/warning-700', iconSize: 28 }),
        Txt('اعتماد إغلاق المناوبات من صلاحية صاحب المحطة', { style: 'Heading/H1 24', w: 'fill' }),
        Txt('دورك: محاسبة. يمكنك رؤية الطلبات وتفاصيلها وأدلتها، لكن لا يمكنك اعتمادها أو رفضها.', { style: 'Body/Large 16', color: 'text/secondary', w: 'fill' }),
        Col({ w: 'fill', gap: 8 }, Txt('من يملك الصلاحية؟', { style: 'Label/12', color: 'text/muted' }),
          Row({ w: 'fill', pad: 12, gap: 10, radius: 12, fill: 'surface/page' }, Avatar('خع', 36), Col({ w: 'fill', gap: 0 }, Txt('خالد العمر', { style: 'Body/Strong 14' }), Txt('صاحب المحطة · آخر ظهور الآن', { style: 'Body/Small 12', color: 'text/muted' })))),
        Row({ w: 'fill', gap: 10 }, Btn('primary', 'طلب الصلاحية من خالد', 'share'), Btn('secondary', 'عرض الطلبات للقراءة فقط')),
        Txt('الزر لا يُخفى دون تفسير — نوضّح لماذا ومن يملك الصلاحية.', { style: 'Body/Small 12', color: 'text/muted' })))
  ], { sidebar: { user: ['رع', 'رنا عيسى', 'محاسبة'] } });
}

const STATE_SCREENS = [L1_Login, ST1_Loading, ST2_Empty, ST3_Error, ST4_Permission];
