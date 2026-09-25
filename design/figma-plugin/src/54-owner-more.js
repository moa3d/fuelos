// ============================================================
// Owner screens — priority 2 + gap screens (O6–O11)
// ============================================================

function Toggle(on) {
  return Row({ name: 'Toggle', w: 40, h: 24, pad: 3, radius: 999, fill: on ? 'brand/action' : 'border/strong', main: on ? 'end' : 'start', cross: 'center' },
    Dot(18, 'surface/card', { name: 'Knob' }));
}
function Radio(on, label, sub) {
  return Row({ name: 'Radio', w: 'fill', pad: 12, gap: 10, radius: 12, fill: on ? 'brand/primary-50' : 'surface/card', stroke: on ? 'brand/primary' : 'border/default', strokeW: on ? 2 : 1, cross: 'start' },
    Row({ w: 20, h: 20, radius: 999, stroke: on ? 'brand/primary' : 'border/strong', strokeW: 2, main: 'center', cross: 'center' }, on ? Dot(10, 'brand/primary') : null),
    Col({ w: 'fill', gap: 0 }, Txt(label, { style: 'Body/Strong 14', w: 'fill' }), sub ? Txt(sub, { style: 'Body/Small 12', color: 'text/muted', w: 'fill' }) : null));
}
function Tabs(labels, activeIdx, tabW) {
  return Col({ name: 'Tabs', w: 'fill', gap: 0 },
    Row({ gap: 4 }, labels.map(function (t, i) {
      const on = i === activeIdx;
      return Col({ w: tabW || 120, gap: 8, cross: 'center' }, Txt(t, { style: 'Body/Strong 14', color: on ? 'brand/primary' : 'text/muted' }), Rect({ w: 'fill', h: 2, fill: on ? 'brand/primary' : 'border/default' }));
    })),
    Rect({ w: 'fill', h: 1, fill: 'border/default' }));
}
function Field(label, value, p) {
  p = p || {};
  return Col({ name: 'Field · ' + label, w: p.w || 'fill', gap: 6 },
    Txt(label, { style: 'Label/12', color: 'text/secondary' }),
    Row({ w: 'fill', h: p.h || 44, pad: [0, 12], gap: 8, radius: 10, fill: 'surface/card', stroke: p.focus ? 'brand/primary' : (p.error ? 'status/danger' : 'border/strong'), strokeW: p.focus || p.error ? 2 : 1, cross: p.h ? 'start' : 'center' },
      p.icon ? Ico(p.icon, { size: 18, color: 'text/muted' }) : null,
      Col({ w: 'fill', pad: p.h ? [10, 0] : 0 }, Txt(value, { style: p.valueStyle || 'Body/Large 16', color: p.placeholder ? 'text/muted' : 'text/primary', w: 'fill' })),
      p.suffix ? Txt(p.suffix, { style: 'Body/Small 12', color: 'text/muted' }) : null,
      p.chevron ? Ico('chevronDown', { size: 16, color: 'text/muted' }) : null),
    p.helper ? Txt(p.helper, { style: 'Body/Small 12', color: p.error ? 'status/danger-700' : 'text/muted', w: 'fill' }) : null);
}
function MiniBars(values, colors, w, h) { return Svg(barChartSvg(w, h, values, Math.max.apply(null, values) * 1.1, colors), w, h, { name: 'Mini bars' }); }

function O6_Reports() {
  function report(icon, title, q, stat, statSub, tone, badge, pinned, extra) {
    return Col({ name: 'Report · ' + title, w: 'fill', pad: 18, gap: 10, radius: 16, fill: 'surface/card', stroke: pinned ? 'brand/primary' : 'border/default', strokeW: pinned ? 2 : 1, shadow: 'Shadow/Card' },
      Row({ w: 'fill', main: 'between' }, IconBox(icon), pinned ? Badge('primary', 'مثبّت في اللوحة') : (badge ? Badge(badge[0], badge[1]) : null)),
      Txt(title, { style: 'Heading/H3 16', w: 'fill' }),
      Txt('«' + q + '»', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' }),
      Row({ w: 'fill', main: 'between', cross: 'end' },
        Col({ gap: 0 }, Txt(stat, { style: 'Number/M 18', color: tone || 'text/primary' }), Txt(statSub, { style: 'Body/Small 12', color: 'text/muted' })),
        extra || null),
      Divider(),
      Row({ w: 'fill', main: 'between' }, LinkText('فتح التقرير'), Row({ gap: 12 }, Ico('download', { size: 16, color: 'text/muted' }), Ico('share', { size: 16, color: 'text/muted' }))));
  }
  function pl(label, cur, prev, strong, tone) {
    return [Txt(label, { style: strong ? 'Body/Strong 14' : 'Body/Regular 14', w: 'fill' }), Txt(cur, { style: strong ? 'Number/M 18' : 'Body/Strong 14', w: 180, color: tone || 'text/primary' }), Txt(prev, { style: 'Body/Regular 14', color: 'text/muted', w: 160 })];
  }
  return Desktop('O6 · التقارير والتحليلات', 'reports', [
    PageHeader('التقارير والتحليلات', 'مكتبة تقارير بفئات واضحة — كل تقرير يجيب على سؤال إداري', [PeriodChips(3), Btn('secondary', 'مقارنة بأغسطس', 'calendar')]),
    Row({ gap: 8 }, ['الكل', 'الربحية', 'المبيعات', 'المخزون', 'الديون', 'الموظفون'].map(function (c, i) { return Chip(c, i === 0, { h: 32 }); })),
    Row({ name: 'Library', w: 'fill', gap: 14, cross: 'start' },
      report('trendUp', 'الربح والخسارة', 'هل ربحت هذا الشهر بعد المصاريف؟', '3,230,000 ل.س', 'صافٍ تقديري · هامش 6.6%', 'brand/action-700', ['warning', 'تكلفة ناقصة'], true),
      report('fuel', 'المبيعات حسب الوقود والمضخة', 'أي وقود وأي مضخة تبيع أكثر؟', '389,600 لتر', 'بنزين 95 = 46% من الكمية'),
      report('cash', 'فروقات الصندوق', 'من لديه فروقات متكررة؟', '9,800 ل.س', '3 فروقات · موظفان', 'status/danger-700', ['danger', 'يحتاج انتباهاً']),
      report('users', 'أعمار الديون', 'من تأخر في السداد؟', '684,000 ل.س', '272,000 متأخرة أكثر من 30 يوماً', 'status/warning-700'),
      report('droplet', 'المخزون والتسويات', 'أين يضيع الوقود؟', '0.3%', 'هدر وتسويات من المبيعات', null, ['success', 'ضمن الحد'])),
    Card({ name: 'P&L preview', gap: 14 },
      Row({ w: 'fill', main: 'between' },
        Col({ gap: 2 }, Row({ gap: 10 }, Txt('الربح والخسارة — سبتمبر 2026', { style: 'Heading/H2 20' }), Badge('info', 'حتى 24 سبتمبر')), Txt('مقارنة بالفترة نفسها من أغسطس', { style: 'Body/Small 12', color: 'text/muted' })),
        Row({ gap: 10 }, Btn('secondary', 'تصدير Excel', 'download'), Btn('secondary', 'مشاركة مع المحاسب', 'share'))),
      Row({ w: 'fill', gap: 20, cross: 'start' },
        Col({ w: 'fill', gap: 0 },
          Table([{ t: 'البند', w: 'fill' }, { t: 'سبتمبر (ل.س)', w: 180 }, { t: 'أغسطس (ل.س)', w: 160 }], [
            pl('مبيعات الوقود', '48,630,000', '47,210,000'),
            pl('تكلفة الوقود المباع', '43,480,000', '42,380,000'),
            pl('إجمالي الربح', '5,150,000', '4,830,000', true),
            pl('المصاريف التشغيلية', '1,920,000', '1,960,000'),
            pl('صافي الربح التقديري', '3,230,000', '2,870,000', true, 'brand/action-700')
          ], { rowPad: 10 })),
        Col({ w: 340, gap: 12 },
          Col({ w: 'fill', pad: 16, gap: 6, radius: 14, fill: 'brand/primary-50' },
            Txt('الخلاصة', { style: 'Label/12', color: 'brand/primary' }),
            Txt('صافي الربح أعلى بـ 12.5% من أغسطس، والسبب الأساسي زيادة مبيعات بنزين 95 مع ثبات المصاريف.', { style: 'Body/Strong 14', w: 'fill' })),
          Inst('Alert Banner', { tone: 'warning' }, { Title: 'تكلفة شراء ناقصة', Body: 'شحنة INV-2231 بلا سعر شراء، لذلك الصافي تقديري.', Action: 'إدخال' }, { w: 'fill' }),
          Row({ w: 'fill', pad: 12, gap: 8, radius: 12, fill: 'status/info-50' }, Ico('refresh', { size: 16, color: 'status/info-700' }), Txt('ملف Excel قيد التحضير — سيصلك إشعار عند الجاهزية', { style: 'Body/Small 12', color: 'status/info-700', w: 'fill' })))))
  ]);
}

function O7_Approvals() {
  function req(icon, title, sub, when, tone, st, sel) {
    return Row({ name: 'Request · ' + title, w: 'fill', pad: 14, gap: 12, radius: 14, fill: sel ? 'brand/primary-50' : 'surface/card', stroke: sel ? 'brand/primary' : 'border/default', strokeW: sel ? 2 : 1, cross: 'start' },
      IconBox(icon, { bg: tone === 'danger' ? 'status/danger-50' : (tone === 'warning' ? 'status/warning-50' : 'brand/action-50'), fg: tone === 'danger' ? 'status/danger' : (tone === 'warning' ? 'status/warning-700' : 'brand/action-700') }),
      Col({ w: 'fill', gap: 4 },
        Row({ w: 'fill', main: 'between' }, Txt(title, { style: 'Body/Strong 14' }), Txt(when, { style: 'Body/Small 12', color: 'text/muted' })),
        Txt(sub, { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }),
        Badge(tone, st)));
  }
  function evidence(icon, label) {
    return Col({ w: 'fill', gap: 6 },
      Row({ w: 'fill', h: 92, radius: 12, fill: 'brand/dark', main: 'center', cross: 'center' }, Ico(icon, { size: 28, color: 'text/on-dark-muted' })),
      Txt(label, { style: 'Body/Small 12', color: 'text/secondary' }));
  }
  return Desktop('O7 · الموافقات', 'approvals', [
    PageHeader('الموافقات', '3 طلبات بانتظارك · كل قرار يُسجَّل باسمك ووقته في سجل المراجعة', [Btn('secondary', 'سجل القرارات', 'history')]),
    Row({ gap: 8 }, [['الكل (3)', true], ['إغلاق مناوبة', false], ['تجاوز حد', false], ['تسوية مخزون', false], ['فتح مناوبة', false]].map(function (c) { return Chip(c[0], c[1], { h: 32 }); })),
    Row({ name: 'Split', w: 'fill', h: 'fill', gap: 20, cross: 'start' },
      Col({ name: 'Queue', w: 400, gap: 10 },
        Txt('بانتظار قرارك', { style: 'Label/12', color: 'text/muted' }),
        req('cash', 'إغلاق مناوبة · المضخة 3', 'فرق صندوق -4,500 ل.س · أحمد سالم · السبب والصورة مرفقان', 'منذ 25 د', 'danger', 'فرق أكبر من الحد', true),
        req('building', 'بيع آجل فوق الحد', 'شركة الأمل للنقل · 38,000 ل.س · يتجاوز المتبقي بـ 12,000', 'منذ ساعة', 'warning', 'العامل ينتظر'),
        req('ruler', 'تسوية مخزون · خزان 1', 'المقاس أقل من الدفتري بـ 310 لتر · سامي', 'منذ ساعتين', 'warning', 'يحتاج سبباً'),
        Txt('تمت معالجتها اليوم', { style: 'Label/12', color: 'text/muted' }),
        req('checkCircle', 'فتح مناوبة المضخة 1 للتصحيح', 'طلب محمد خليل لتعديل قراءة · وافقت 09:12', '09:12', 'success', 'تمت الموافقة')),
      Card({ name: 'Decision', gap: 16 },
        Row({ w: 'fill', main: 'between', cross: 'start' },
          Col({ gap: 2 }, Txt('إغلاق مناوبة المضخة 3', { style: 'Heading/H2 20' }), Txt('أحمد سالم · 06:00 – 14:05 · بنزين 95', { style: 'Body/Regular 14', color: 'text/secondary' })),
          Badge('danger', 'فرق -4,500 ل.س')),
        Row({ w: 'fill', gap: 12 },
          [['اللترات', '7,419.5'], ['المبيعات', '927,438'], ['النقد المتوقع', '639,438'], ['النقد الفعلي', '634,938']].map(function (k) {
            return Col({ w: 'fill', pad: 12, gap: 2, radius: 12, fill: 'surface/page' }, Txt(k[0], { style: 'Body/Small 12', color: 'text/muted' }), Txt(k[1], { style: 'Number/M 18' }));
          })),
        Col({ w: 'fill', gap: 8 },
          Txt('الأدلة المرفقة', { style: 'Heading/H3 16' }),
          Row({ w: 'fill', gap: 12 }, evidence('camera', 'صورة العداد 06:00'), evidence('camera', 'صورة العداد 14:05'), evidence('cash', 'صورة الصندوق')),
          Row({ w: 'fill', pad: 12, gap: 10, radius: 12, fill: 'surface/muted', cross: 'start' }, Avatar('أس', 28), Txt('«دفعة بطاقة بقيمة 4,500 سُجلت نقداً بالخطأ في الساعة 11:20.»', { style: 'Body/Strong 14', w: 'fill' }))),
        Col({ w: 'fill', gap: 8 },
          Txt('قرارك', { style: 'Heading/H3 16' }),
          Row({ w: 'fill', gap: 10, cross: 'start' },
            Radio(true, 'اعتماد وتحويل الفرق لحساب العجز', 'يُنشأ قيد تلقائي JE-1042'),
            Radio(false, 'اعتماد وتحميل الفرق على الموظف', 'يظهر في كشف الموظف'),
            Radio(false, 'إعادة للعامل للتصحيح', 'تُفتح المناوبة مؤقتاً'))),
        Field('ملاحظة القرار (تظهر في السجل)', 'تم التحقق من إيصال البطاقة رقم 88213', { focus: true }),
        Row({ w: 'fill', main: 'between' },
          Row({ gap: 8 }, Ico('lock', { size: 16, color: 'text/muted' }), Txt('القرار نهائي ويُسجَّل ولا يُحذف؛ أي تصحيح لاحق يكون بقيد عكسي.', { style: 'Body/Small 12', color: 'text/muted' })),
          Row({ gap: 10 }, Btn('danger', 'رفض'), Btn('action', 'اعتماد الإغلاق', 'check')))))
  ]);
}

function O8_Expenses() {
  function exp(d, cat, tone, desc, amt, att, by) {
    return [Txt(d, { style: 'Body/Small 12', color: 'text/secondary', w: 90 }), Row({ w: 96 }, Badge(tone, cat)), Txt(desc, { style: 'Body/Regular 14', w: 'fill' }), Txt(amt, { style: 'Body/Strong 14', w: 100 }),
      Row({ w: 36, main: 'center' }, Ico(att ? 'fileText' : 'x', { size: 16, color: att ? 'brand/primary' : 'text/muted' })), Txt(by, { style: 'Body/Small 12', color: 'text/secondary', w: 90 })];
  }
  function catBar(label, amt, w, color) {
    return Col({ w: 'fill', gap: 6 },
      Row({ w: 'fill', main: 'between' }, Txt(label, { style: 'Body/Regular 14', color: 'text/secondary' }), Txt(amt, { style: 'Body/Strong 14' })),
      Box({ w: 324, h: 8, radius: 999, fill: 'surface/muted' }, Rect({ w: w, h: 8, x: 324 - w, y: 0, radius: 999, fill: color })));
  }
  function supplier(name, due, date, tone, st) {
    return Row({ w: 'fill', pad: [10, 0], gap: 10 }, IconBox('truck', { size: 32, radius: 9 }),
      Col({ w: 'fill', gap: 0 }, Txt(name, { style: 'Body/Strong 14' }), Txt('مستحق ' + due + ' · ' + date, { style: 'Body/Small 12', color: 'text/muted' })), Badge(tone, st));
  }
  return Desktop('O8 · المصاريف والموردون', 'expenses', [
    PageHeader('المصاريف والموردون', 'الربح يصبح مؤكداً بعد إدخال مصاريف الفترة وتكاليف الشراء', [Btn('secondary', 'مورد جديد', 'truck'), Btn('primary', 'مصروف جديد', 'plus')]),
    Inst('Alert Banner', { tone: 'info' }, { Title: 'مصاريف اليوم غير مدخلة بعد', Body: 'الربح في لوحة القيادة سيبقى «تقديرياً» حتى تُدخل مصاريف 24 سبتمبر.', Action: 'إدخال الآن' }, { w: 'fill' }),
    Row({ name: 'Split', w: 'fill', gap: 20, cross: 'start' },
      Col({ name: 'Right column', w: 'fill', gap: 20 },
        Row({ w: 'fill', gap: 16, cross: 'start' },
          Card({ name: 'By category', gap: 12 },
            CardHeader('مصاريف سبتمبر', { right: Txt('1,920,000 ل.س', { style: 'Number/M 18' }) }),
            catBar('رواتب', '1,260,000', 212, 'brand/primary'), catBar('كهرباء ومياه', '312,000', 53, 'brand/action'), catBar('صيانة المضخات', '186,000', 31, 'status/warning'), catBar('نقل ومحروقات', '98,000', 17, 'status/info'), catBar('أخرى', '64,000', 11, 'text/muted')),
          Card({ name: 'Suppliers', w: 340, gap: 4 },
            CardHeader('الموردون', { icon: 'truck', right: LinkText('الكل (4)') }),
            supplier('الشام للمحروقات', '1,320,000', '30 سبتمبر', 'warning', '6 أيام'),
            Divider(), supplier('شركة البادية للنقل', '98,000', '5 أكتوبر', 'success', 'منتظم'),
            Divider(), supplier('ورشة الأمانة للصيانة', '0', '—', 'neutral', 'مسدد'))),
        Card({ name: 'Expenses table', pad: [16, 8, 8, 8], gap: 10 },
          Row({ w: 'fill', pad: [0, 8] }, CardHeader('آخر المصاريف', { right: Row({ gap: 8 }, Chip('الكل', true, { h: 30 }), Chip('بلا مرفق', false, { h: 30 })) })),
          Table([{ t: 'التاريخ', w: 90 }, { t: 'الفئة', w: 96 }, { t: 'البيان', w: 'fill' }, { t: 'المبلغ', w: 100 }, { t: 'مرفق', w: 36 }, { t: 'بواسطة', w: 90 }], [
            exp('23 سبتمبر', 'صيانة', 'warning', 'تغيير فلتر المضخة 4', '42,000', true, 'سامي'),
            exp('22 سبتمبر', 'كهرباء', 'success', 'فاتورة كهرباء أغسطس', '312,000', true, 'رنا (محاسبة)'),
            exp('20 سبتمبر', 'نقل', 'info', 'نقل شحنة ديزل', '98,000', false, 'خالد العمر'),
            exp('15 سبتمبر', 'رواتب', 'primary', 'رواتب النصف الأول', '630,000', true, 'رنا (محاسبة)')
          ], { rowPad: 10 }))),
      Card({ name: 'New expense', w: 380, gap: 14 },
        CardHeader('مصروف جديد', { icon: 'plus' }),
        Col({ w: 'fill', gap: 6 }, Txt('الفئة', { style: 'Label/12', color: 'text/secondary' }),
          Row({ w: 'fill', gap: 6 }, Chip('كهرباء', true, { h: 32 }), Chip('رواتب', false, { h: 32 }), Chip('صيانة', false, { h: 32 }), Chip('أخرى', false, { h: 32 }))),
        Field('المبلغ', '86,000', { suffix: 'ل.س', focus: true, valueStyle: 'Number/M 18' }),
        Row({ w: 'fill', gap: 10 }, Field('التاريخ', '24 سبتمبر', { icon: 'calendar' }), Field('الدفع', 'من الصندوق', { chevron: true })),
        Field('الجهة / المورد', 'شركة الكهرباء', { chevron: true }),
        Field('البيان', 'فاتورة كهرباء سبتمبر — العداد الرئيسي', {}),
        Row({ w: 'fill', pad: 14, gap: 10, radius: 12, stroke: 'border/strong', dash: true, main: 'center' }, Ico('camera', { size: 18, color: 'brand/primary' }), Txt('إرفاق صورة الفاتورة', { style: 'Body/Strong 14', color: 'brand/primary' })),
        Row({ w: 'fill', pad: 12, gap: 8, radius: 10, fill: 'surface/muted', cross: 'start' }, Ico('book', { size: 16, color: 'text/secondary' }), Txt('سيُنشأ قيد: مدين مصروف كهرباء / دائن الصندوق', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })),
        Row({ w: 'fill', gap: 10 }, Btn('secondary', 'حفظ كمسودة', null, { w: 'fill' }), Btn('action', 'حفظ المصروف', 'check', { w: 'fill' }))))
  ]);
}

function O9_Prices() {
  function avail(sel) {
    return Row({ w: 'fill', pad: 4, gap: 4, radius: 10, fill: 'surface/muted' }, [['متوفر', 'success'], ['محدود', 'warning'], ['غير متوفر', 'danger']].map(function (a, i) {
      const on = i === sel;
      return Row({ w: 'fill', h: 32, radius: 8, fill: on ? 'surface/card' : null, shadow: on ? 'Shadow/Card' : null, gap: 6, main: 'center' }, Dot(8, TONES[a[1]].fg), Txt(a[0], { style: 'Label/12', color: on ? 'text/primary' : 'text/muted' }));
    }));
  }
  function fuelCard(name, cur, next, cost, margin, availIdx, hint, changed) {
    return Card({ name: 'Price · ' + name, gap: 14, stroke: changed ? 'brand/primary' : 'border/default', strokeW: changed ? 2 : 1 },
      Row({ w: 'fill', main: 'between' }, Row({ gap: 10 }, IconBox('droplet'), Txt(name, { style: 'Heading/H3 16' })), changed ? Badge('primary', 'تغيير غير منشور') : Badge('neutral', 'دون تغيير')),
      Row({ w: 'fill', gap: 12, cross: 'end' },
        Col({ w: 'fill', gap: 2 }, Txt('السعر المنشور', { style: 'Body/Small 12', color: 'text/muted' }), Money(cur, { unit: 'ل.س/لتر' })),
        Ico('chevronLeft', { size: 20, color: 'text/muted' }),
        Col({ w: 'fill', gap: 6 }, Txt('السعر الجديد', { style: 'Label/12', color: 'text/secondary' }),
          Row({ w: 'fill', h: 48, pad: [0, 12], radius: 10, fill: 'surface/card', stroke: changed ? 'brand/primary' : 'border/strong', strokeW: changed ? 2 : 1 }, Txt(next, { style: 'Number/L 24', w: 'fill' })))),
      Row({ w: 'fill', pad: [10, 12], radius: 10, fill: 'surface/page', main: 'between' }, Txt('تكلفة الشراء ' + cost + ' · الهامش', { style: 'Body/Small 12', color: 'text/secondary' }), Txt(margin, { style: 'Body/Strong 14', color: 'brand/action-700' })),
      Col({ w: 'fill', gap: 6 }, Txt('التوفر المعروض للزبائن', { style: 'Label/12', color: 'text/secondary' }), avail(availIdx),
        Row({ gap: 6 }, Ico('info', { size: 14, color: 'text/muted' }), Txt(hint, { style: 'Body/Small 12', color: 'text/muted' }))));
  }
  return Desktop('O9 · أسعار الوقود', 'prices', [
    PageHeader('أسعار الوقود', 'السعر المنشور يظهر للزبائن مع وقت التحديث ومصدره · آخر نشر اليوم 07:30', [Btn('secondary', 'سجل الأسعار', 'history')]),
    Inst('Alert Banner', { tone: 'warning' }, { Title: 'بلاغان من الزبائن: سعر الديزل غير مطابق', Body: 'أبلغ زبونان أن السعر في المحطة 96 وليس 95 (منذ ساعة). راجع السعر قبل النشر.', Action: 'عرض البلاغات' }, { w: 'fill' }),
    Row({ name: 'Fuel cards', w: 'fill', gap: 16, cross: 'start' },
      fuelCard('بنزين 95', '125', '125', '112', '13 ل.س (10.4%)', 0, 'المخزون الدفتري 41% — متوفر'),
      fuelCard('بنزين 90', '110', '110', '99', '11 ل.س (10%)', 0, 'المخزون الدفتري 62% — متوفر'),
      fuelCard('ديزل', '95', '96', '86', '10 ل.س (10.4%)', 1, 'مقترح «محدود» لأن المخزون 18%', true)),
    Row({ name: 'Publish row', w: 'fill', gap: 16, cross: 'start' },
      Card({ name: 'Customer preview', w: 420, gap: 10 },
        CardHeader('ما سيراه الزبون', { icon: 'user' }),
        Col({ w: 'fill', pad: 14, gap: 10, radius: 14, fill: 'surface/page' },
          [['بنزين 95', '125', 'success', 'متوفر'], ['بنزين 90', '110', 'success', 'متوفر'], ['ديزل', '96', 'warning', 'كمية محدودة']].map(function (r) {
            return Row({ w: 'fill', main: 'between' }, Row({ gap: 8 }, Txt(r[0], { style: 'Body/Strong 14' }), Badge(r[2], r[3])), Row({ gap: 4, cross: 'end' }, Txt(r[1], { style: 'Number/M 18' }), Txt('ل.س/لتر', { style: 'Label/11', color: 'text/muted' })));
          }),
          Row({ gap: 6 }, Ico('clock', { size: 14, color: 'text/muted' }), Txt('آخر تحديث: الآن · من إدارة المحطة', { style: 'Body/Small 12', color: 'text/muted' })))),
      Card({ name: 'Publish', gap: 14 },
        CardHeader('نشر التغييرات', { icon: 'share' }),
        KV('عدد التغييرات', '2 (سعر الديزل + التوفر)'),
        KV('يُطبَّق على', 'المناوبات المفتوحة من لحظة النشر'),
        KV('المناوبات المفتوحة الآن', 'المضخة 2 والمضخة 4'),
        Row({ w: 'fill', pad: 12, gap: 8, radius: 10, fill: 'surface/muted', cross: 'start' }, Ico('history', { size: 16, color: 'text/secondary' }), Txt('يُسجَّل تغيير السعر في سجل المراجعة، وتُحسب عمليات ما قبل النشر بالسعر القديم.', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })),
        Row({ w: 'fill', gap: 10 }, Btn('secondary', 'جدولة النشر', 'clock', { w: 'fill' }), Btn('action', 'نشر الأسعار الآن', 'check', { w: 'fill' }))))
  ]);
}

function O10_Complaints() {
  function item(title, who, when, tone, st, sel, kind) {
    return Row({ name: 'Complaint · ' + title, w: 'fill', pad: 14, gap: 12, radius: 14, fill: sel ? 'brand/primary-50' : 'surface/card', stroke: sel ? 'brand/primary' : 'border/default', strokeW: sel ? 2 : 1, cross: 'start' },
      IconBox(kind === 'price' ? 'tag' : 'message', { size: 36, bg: kind === 'price' ? 'status/info-50' : 'brand/primary-50', fg: kind === 'price' ? 'status/info' : 'brand/primary' }),
      Col({ w: 'fill', gap: 4 }, Row({ w: 'fill', main: 'between' }, Txt(title, { style: 'Body/Strong 14' }), Txt(when, { style: 'Body/Small 12', color: 'text/muted' })),
        Txt(who, { style: 'Body/Small 12', color: 'text/secondary' }), Badge(tone, st)));
  }
  function bubble(me, text, meta) {
    return Row({ w: 'fill', main: me ? 'end' : 'start' },
      Col({ w: 420, pad: 14, gap: 4, radius: 16, fill: me ? 'brand/primary' : 'surface/muted' },
        Txt(text, { style: 'Body/Regular 14', color: me ? 'text/on-dark' : 'text/primary', w: 'fill' }),
        Txt(meta, { style: 'Label/11', color: me ? 'text/on-dark-muted' : 'text/muted' })));
  }
  return Desktop('O10 · الشكاوى والبلاغات', 'complaints', [
    PageHeader('شكاوى الزبائن والبلاغات', 'ردّ المحطة يظهر للزبون في التطبيق · ما لا يُحل خلال 48 ساعة يُصعَّد للمنصة', [Btn('secondary', 'قوالب الردود', 'fileText')]),
    Row({ gap: 8 }, Chip('مفتوحة (4)', true, { h: 32 }), Chip('قيد الرد (2)', false, { h: 32 }), Chip('محلولة', false, { h: 32 }), Chip('مصعّدة (1)', false, { h: 32 })),
    Row({ name: 'Split', w: 'fill', h: 'fill', gap: 20, cross: 'start' },
      Col({ name: 'Inbox', w: 400, gap: 10 },
        item('خصم لم يُطبَّق على الفاتورة', 'سامر يوسف · INV-10477', 'منذ 3 س', 'warning', 'بانتظار ردك', true),
        item('بلاغ سعر: الديزل 96 وليس 95', 'زبونان · صفحة المحطة', 'منذ ساعة', 'info', 'بلاغ سعر', false, 'price'),
        item('تأخير في الخدمة مساءً', 'ليلى حداد', 'أمس', 'danger', 'مصعّدة للمنصة'),
        item('العامل لم يرسل الفاتورة', 'مازن ديب · INV-10420', 'أمس', 'warning', 'بانتظار ردك')),
      Card({ name: 'Thread', gap: 14 },
        Row({ w: 'fill', main: 'between', cross: 'start' },
          Row({ gap: 12 }, Avatar('سي', 44), Col({ gap: 2 }, Txt('سامر يوسف', { style: 'Heading/H3 16' }), Txt('زبون منذ مارس 2026 · 38 فاتورة · 1,240 نقطة', { style: 'Body/Small 12', color: 'text/muted' }))),
          Row({ gap: 8 }, Badge('warning', 'بانتظار ردك'), Badge('neutral', 'متبقٍ 45 ساعة قبل التصعيد'))),
        Row({ w: 'fill', gap: 12, cross: 'start' },
          Col({ w: 'fill', gap: 6 }, Txt('الفاتورة المرتبطة', { style: 'Label/12', color: 'text/muted' }),
            Inst('Invoice Card', { status: 'confirmed' }, { Station: 'محطة النور', Total: '25,000 ل.س', Details: 'بنزين 95 · 200 لتر · توسان', Date: 'السبت 19 سبتمبر · 13:40' }, { w: 'fill' })),
          Col({ w: 300, gap: 6 }, Txt('ما يقوله النظام', { style: 'Label/12', color: 'text/muted' }),
            Col({ w: 'fill', pad: 14, gap: 4, radius: 14, fill: 'status/info-50' },
              Txt('العرض «خصم 5% فوق 150 لتر» كان فعالاً وقت التعبئة لكنه لم يُطبَّق.', { style: 'Body/Small 12', color: 'status/info-700', w: 'fill' }),
              Txt('الفرق المستحق: 1,250 ل.س', { style: 'Body/Strong 14', color: 'status/info-700' })))),
        Col({ w: 'fill', gap: 10, pad: [8, 0] },
          bubble(false, 'عبّيت 200 لتر يوم السبت وكان في عرض خصم 5% لكن الفاتورة طلعت بدون خصم.', 'سامر · 21 سبتمبر 18:40'),
          bubble(true, 'شكراً لتنبيهك. تحققنا من العرض وسنصدر فاتورة مصحّحة بالخصم اليوم.', 'محطة النور · مسودة')),
        Row({ gap: 8 }, Chip('تم تصحيح الفاتورة', false, { h: 30 }), Chip('سنتواصل معك هاتفياً', false, { h: 30 }), Chip('نعتذر عن التأخير', false, { h: 30 })),
        Field('الرد', 'شكراً لتنبيهك. تحققنا من العرض وسنصدر فاتورة مصحّحة بالخصم اليوم.', { focus: true, h: 72 }),
        Row({ w: 'fill', main: 'between' },
          Btn('secondary', 'إصدار فاتورة مصحّحة', 'receipt'),
          Row({ gap: 10 }, Btn('secondary', 'إغلاق كمحلولة', 'checkCircle'), Btn('primary', 'إرسال الرد', 'share')))))
  ]);
}

function O11_Settings() {
  function user(init, name, role, tone, perms, last, st, stTone) {
    return [Row({ w: 'fill', gap: 10 }, Avatar(init, 32), Col({ w: 'fill', gap: 0 }, Txt(name, { style: 'Body/Strong 14' }), Txt(perms, { style: 'Body/Small 12', color: 'text/muted' }))), Row({ w: 130 }, Badge(tone, role)), Txt(last, { style: 'Body/Small 12', color: 'text/muted', w: 110 }), Row({ w: 110 }, Badge(stTone, st)), Row({ w: 32, main: 'center' }, Ico('more', { size: 18, color: 'text/muted' }))];
  }
  function perm(label, on, note) {
    return Row({ w: 'fill', pad: [10, 0], gap: 10 },
      Col({ w: 'fill', gap: 0 }, Txt(label, { style: 'Body/Strong 14' }), note ? Txt(note, { style: 'Body/Small 12', color: 'text/muted' }) : null),
      Toggle(on));
  }
  function limit(label, value, sub) {
    return Col({ w: 'fill', pad: 14, gap: 4, radius: 12, fill: 'surface/page' }, Txt(label, { style: 'Body/Small 12', color: 'text/muted' }), Txt(value, { style: 'Number/M 18' }), Txt(sub, { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }));
  }
  return Desktop('O11 · الإعدادات والمستخدمون', 'settings', [
    PageHeader('الإعدادات', 'محطة النور · الفرع الرئيسي', [Btn('primary', 'دعوة مستخدم', 'plus')]),
    Tabs(['المحطة', 'الخزانات والمضخات', 'المستخدمون والصلاحيات', 'حدود التسامح', 'الإشعارات'], 2, 170),
    Row({ name: 'Split', w: 'fill', gap: 20, cross: 'start' },
      Col({ w: 'fill', gap: 20 },
        Card({ name: 'Users', pad: [16, 8, 8, 8], gap: 10 },
          Row({ w: 'fill', pad: [0, 8] }, CardHeader('المستخدمون (7)', { right: Row({ w: 220, h: 36, pad: [0, 10], gap: 8, radius: 10, fill: 'surface/page', stroke: 'border/default' }, Ico('search', { size: 16, color: 'text/muted' }), Txt('بحث', { style: 'Body/Regular 14', color: 'text/muted' })) })),
          Table([{ t: 'المستخدم', w: 'fill' }, { t: 'الدور', w: 130 }, { t: 'آخر دخول', w: 110 }, { t: 'الحالة', w: 110 }, { t: '', w: 32 }], [
            user('خع', 'خالد العمر', 'صاحب المحطة', 'primary', 'كل الصلاحيات', 'الآن', 'نشط', 'success'),
            user('رع', 'رنا عيسى', 'محاسبة', 'info', 'قيود، تقارير، تسويات', 'اليوم 09:40', 'نشط', 'success'),
            user('سم', 'سامي مراد', 'مدير وردية', 'warning', 'تسويات صغيرة، فتح مناوبة', 'اليوم 07:30', 'نشط', 'success'),
            user('أس', 'أحمد سالم', 'عامل تعبئة', 'neutral', 'مناوبته وعملياته فقط', 'اليوم 06:00', 'نشط', 'success'),
            user('يد', 'يوسف ديب', 'عامل تعبئة', 'neutral', 'مناوبته وعملياته فقط', 'اليوم 14:00', 'نشط', 'success'),
            user('نح', 'نادر حمود', 'عامل تعبئة', 'neutral', 'مناوبته وعملياته فقط', '—', 'دعوة معلّقة', 'warning'),
            user('عم', 'عمر ملص', 'عامل تعبئة', 'neutral', '—', '3 سبتمبر', 'موقوف', 'danger')
          ], { rowPad: 9 })),
        Card({ name: 'Tolerances', gap: 12 },
          CardHeader('حدود التسامح', { icon: 'sliders', right: LinkText('تعديل') }),
          Row({ w: 'fill', gap: 12 },
            limit('فرق الصندوق المسموح', '1,000 ل.س', 'فوقه يطلب النظام سبباً واعتمادك'),
            limit('فرق المخزون المسموح', '100 لتر', 'لكل خزان في القياس الفعلي'),
            limit('أقصى مدة مناوبة', '12 ساعة', 'بعدها تنبيه «مفتوحة طويلاً»'),
            limit('حد البيع الآجل الافتراضي', '250,000 ل.س', 'لكل شركة جديدة')))),
      Card({ name: 'Role editor', w: 360, gap: 4 },
        CardHeader('صلاحيات: عامل تعبئة', { icon: 'shield' }),
        Txt('قالب جاهز — يمكنك تعديله لهذه المحطة', { style: 'Body/Small 12', color: 'text/muted' }),
        perm('بدء وإغلاق مناوبة', true), Divider(),
        perm('تسجيل تعبئة وإصدار فاتورة', true), Divider(),
        perm('بيع آجل للشركات', true, 'حتى الحد المتبقي فقط'), Divider(),
        perm('العمل دون اتصال', true, 'حتى 50 عملية غير متزامنة'), Divider(),
        perm('تعديل سعر اللتر', false, 'صاحب المحطة فقط'), Divider(),
        perm('اعتماد التسويات', false, 'مدير الوردية فأعلى'), Divider(),
        perm('رؤية الأرباح وتكاليف الشراء', false, 'مخفية عن العمال حسب الملف'),
        Row({ w: 'fill', pad: [12, 0, 0, 0] }, Btn('primary', 'حفظ الصلاحيات', null, { w: 'fill' }))))
  ]);
}

const OWNER_MORE = [O6_Reports, O7_Approvals, O8_Expenses, O9_Prices, O10_Complaints, O11_Settings];
