// ============================================================
// Owner / accountant screens (desktop 1440)
// ============================================================

function O1_Dashboard() {
  const chartW = 640, chartH = 210;
  const series = [
    { color: '#0F766E', area: true, values: [6.8, 7.1, 6.9, 7.4, 7.2, 7.8, 8.1, 7.6, 7.7, 8.0, 8.4, 8.1, 8.3, 8.6, 8.9] },
    { color: '#10B981', values: [5.2, 5.0, 5.4, 5.3, 5.6, 5.5, 5.9, 5.7, 5.8, 6.0, 5.9, 6.2, 6.1, 6.3, 6.2] },
    { color: '#F59E0B', values: [3.9, 4.1, 3.8, 4.2, 4.0, 4.3, 4.1, 3.9, 4.2, 4.4, 4.1, 3.8, 3.6, 3.5, 3.3] }
  ];
  const days = ['10 سبت', '12', '14', '16', '18', '20', '22', '24 سبت'];
  function legend(c, t) { return Row({ gap: 6 }, Dot(8, c), Txt(t, { style: 'Body/Small 12', color: 'text/secondary' })); }
  function ops(t, what, who, amt, tone, st) {
    return [Txt(t, { style: 'Body/Small 12', color: 'text/muted', w: 48 }), Txt(what, { style: 'Body/Strong 14', w: 'fill' }), Txt(who, { style: 'Body/Small 12', color: 'text/secondary', w: 130 }), Txt(amt, { style: 'Body/Strong 14', w: 84, color: tone === 'danger' ? 'status/danger-700' : 'text/primary' }), Row({ w: 132 }, Badge(tone, st))];
  }
  function shift(p, who, st, tone, t) {
    return Row({ w: 'fill', gap: 10, pad: [10, 0] },
      Row({ w: 36, h: 36, radius: 10, fill: 'surface/muted', main: 'center', cross: 'center' }, Txt(p, { style: 'Body/Strong 14', color: 'text/secondary' })),
      Col({ w: 'fill', gap: 0 }, Txt(who, { style: 'Body/Strong 14' }), Txt(t, { style: 'Body/Small 12', color: 'text/muted' })),
      Badge(tone, st));
  }
  return Desktop('O1 · لوحة القيادة', 'dash', [
    PageHeader('لوحة القيادة', 'الخميس، 24 سبتمبر 2026 · آخر مزامنة قبل دقيقتين', [
      PeriodChips(0), Btn('secondary', 'تصفية', 'filter'), IconBtn('bell', { dot: true })]),
    Row({ name: 'Risks', w: 'fill', gap: 16, cross: 'start' },
      Inst('Alert Banner', { tone: 'danger' }, { Title: 'فرق صندوق 4,500 ل.س', Body: 'مناوبة المضخة 3 · أحمد سالم · السبب مرفق وبانتظار اعتمادك', Action: 'مراجعة' }, { w: 'fill' }),
      Inst('Alert Banner', { tone: 'warning' }, { Title: 'ديزل: يكفي يوماً ونصف تقريباً', Body: '18% من سعة خزان 2 · حسب المخزون الدفتري · آخر قياس 07:30', Action: 'طلب توريد' }, { w: 'fill' }),
      Inst('Alert Banner', { tone: 'warning' }, { Title: 'دين متأخر 45 يوماً', Body: 'شركة الأمل للنقل · 212,000 ل.س · 85% من الحد الائتماني', Action: 'كشف الحساب' }, { w: 'fill' })),
    Row({ name: 'KPIs', w: 'fill', gap: 16 },
      Inst('Fuel KPI Card', { state: 'default' }, { Title: 'مبيعات اليوم', Value: '2,026,400', Unit: 'ل.س', Meta: '+8.2% عن أمس · 18,420 لتر', '@Badge': { visible: false }, '^Icon': { icon: 'chart', color: 'brand/primary' } }, { w: 'fill' }),
      Inst('Fuel KPI Card', { state: 'default' }, { Title: 'الربح التقديري', Value: '162,100', Unit: 'ل.س', Meta: 'يكتمل بعد إدخال مصاريف اليوم', '@Badge': { comp: 'Status Badge', variant: { tone: 'info' }, text: { Label: 'تقديري' } }, '^Icon': { icon: 'trendUp', color: 'brand/primary' }, '^TrendIcon': { icon: 'info', color: 'status/info' } }, { w: 'fill' }),
      Inst('Fuel KPI Card', { state: 'default' }, { Title: 'النقد المتوقع', Value: '1,318,000', Unit: 'ل.س', Meta: '3 من 4 مناوبات مغلقة', '@Badge': { visible: false }, '^Icon': { icon: 'cash', color: 'brand/primary' }, '^TrendIcon': { icon: 'checkCircle', color: 'brand/action' } }, { w: 'fill' }),
      Inst('Fuel KPI Card', { state: 'alert' }, { Title: 'الديون المستحقة', Value: '684,000', Unit: 'ل.س', Meta: '14 عميلاً · 2 متأخران', '@Badge': { comp: 'Status Badge', variant: { tone: 'danger' }, text: { Label: 'متأخر' } }, '^Icon': { icon: 'users', color: 'status/danger' }, '^TrendIcon': { icon: 'alert', color: 'status/danger' } }, { w: 'fill' })),
    Row({ name: 'Charts row', w: 'fill', gap: 16, cross: 'start' },
      Card({ name: 'Sales chart', h: 456, clip: true },
        CardHeader('المبيعات اليومية', { sub: 'بالألف لتر · آخر 15 يوماً', right: Row({ gap: 16 }, legend('#0F766E', 'بنزين 95'), legend('#10B981', 'بنزين 90'), legend('#F59E0B', 'ديزل')) }),
        Row({ w: 'fill', gap: 12, cross: 'start' },
          Col({ h: chartH, main: 'between', w: 28 }, ['10', '7.5', '5', '2.5', '0'].map(function (v) { return Txt(v, { style: 'Body/Small 12', color: 'text/muted' }); })),
          Col({ w: 'fill', gap: 8 },
            Svg(lineChartSvg(chartW, chartH, series, 10), chartW, chartH, { name: 'Line chart' }),
            Row({ w: chartW, main: 'between' }, days.map(function (d) { return Txt(d, { style: 'Body/Small 12', color: 'text/muted' }); })))),
        Row({ w: 'fill', pad: [10, 12], gap: 8, radius: 10, fill: 'status/warning-50' },
          Ico('trendDown', { size: 16, color: 'status/warning-700' }),
          Txt('مبيعات الديزل تنخفض منذ 4 أيام بسبب انخفاض المخزون — التوريد القادم غير مسجل بعد.', { style: 'Body/Small 12', color: 'status/warning-700', w: 'fill' }))),
      Card({ name: 'Tanks', w: 360, h: 456, gap: 10, clip: true },
        CardHeader('الخزانات', { icon: 'droplet', right: LinkText('إدارة المخزون') }),
        Inst('Tank Level Bar', { level: '60' }, { Fuel: 'بنزين 90', Tank: 'خزان 1 · سعة 30,000 لتر', Percent: '62%', Current: 'دفتري 18,600 لتر', Updated: 'قياس 07:30' }, { w: 'fill' }),
        Inst('Tank Level Bar', { level: '40' }, { Fuel: 'بنزين 95', Tank: 'خزان 3 · سعة 20,000 لتر', Percent: '41%', Current: 'دفتري 8,200 لتر', Updated: 'قياس 07:30' }, { w: 'fill' }),
        Inst('Tank Level Bar', { level: '20' }, { Fuel: 'ديزل', Tank: 'خزان 2 · سعة 30,000 لتر', Percent: '18%', Current: 'دفتري 5,400 لتر', Updated: 'يكفي ~1.5 يوم' }, { w: 'fill' }))),
    Row({ name: 'Bottom row', w: 'fill', gap: 16, cross: 'start' },
      Card({ name: 'Critical ops', pad: [20, 12, 12, 12], gap: 10, h: 300, clip: true },
        Row({ w: 'fill', pad: [0, 8] }, CardHeader('آخر العمليات الحرجة', { right: LinkText('عرض الكل (10)') })),
        Table([{ t: 'الوقت', w: 48 }, { t: 'العملية', w: 'fill' }, { t: 'المسؤول', w: 130 }, { t: 'القيمة', w: 84 }, { t: 'الحالة', w: 132 }], [
          ops('10:42', 'فرق صندوق · المضخة 3', 'أحمد سالم', '-4,500', 'danger', 'بانتظار اعتمادك'),
          ops('10:15', 'بيع آجل فوق الحد', 'شركة الأمل للنقل', '38,000', 'warning', 'بانتظار موافقة'),
          ops('09:58', 'تسوية مخزون ديزل', 'سامي · مدير وردية', '-40 لتر', 'success', 'معتمدة'),
          ops('09:30', 'تعديل سعر بنزين 95', 'خالد العمر', '125 / لتر', 'success', 'منشور للزبائن')
        ], { rowPad: 10 })),
      Card({ name: 'Shifts', w: 360, h: 300, gap: 4, clip: true },
        CardHeader('مناوبات اليوم', { right: Badge('success', '3 مغلقة') }),
        shift('1', 'محمد خليل', 'مغلقة', 'success', 'بنزين 90 · 06:00 – 14:00'),
        Divider(),
        shift('3', 'أحمد سالم', 'بانتظار الاعتماد', 'warning', 'بنزين 95 · فرق -4,500'),
        Divider(),
        shift('4', 'علي حسن', 'مفتوحة 11 ساعة', 'danger', 'ديزل · منذ 23:40 أمس')))
  ], { h: 1226 });
}

function O2_Tanks() {
  function tankRow(o) {
    const TW = 330;
    const bookW = Math.round(TW * o.book / o.cap), measW = Math.round(TW * o.meas / o.cap);
    const col = o.tone === 'danger' ? 'status/danger' : (o.tone === 'warning' ? 'status/warning' : 'brand/primary');
    return Row({ name: 'Tank · ' + o.name, w: 'fill', pad: 20, gap: 24, radius: 16, fill: 'surface/card', stroke: o.alert ? 'status/danger' : 'border/default', strokeOpacity: o.alert ? 0.5 : 1, shadow: 'Shadow/Card' },
      Col({ w: 230, gap: 8 },
        Row({ gap: 10 }, IconBox('droplet', { bg: o.tone === 'warning' ? 'status/warning-50' : 'brand/primary-50', fg: col }),
          Col({ gap: 0 }, Txt(o.name, { style: 'Heading/H3 16' }), Txt(o.tank + ' · سعة ' + o.capT + ' لتر', { style: 'Body/Small 12', color: 'text/muted' }))),
        o.badge ? Badge(o.badge[0], o.badge[1]) : null),
      Col({ w: TW, gap: 8 },
        Row({ w: 'fill', main: 'between' }, Txt(o.pct + '%', { style: 'Number/L 24', color: o.tone === 'danger' || o.tone === 'warning' ? col : 'text/primary' }), Txt('الحد الأدنى 20%', { style: 'Body/Small 12', color: 'text/muted' })),
        Box({ name: 'Track', w: TW, h: 16, radius: 999, fill: 'surface/muted' },
          Rect({ name: 'Book level', w: bookW, h: 16, x: TW - bookW, y: 0, radius: 999, fill: col }),
          Rect({ name: 'Measured marker', w: 3, h: 24, x: TW - measW - 1, y: -4, radius: 2, fill: 'brand/dark' }),
          Rect({ name: 'Min line', w: 1, h: 16, x: TW - Math.round(TW * 0.2), y: 0, fill: 'text/muted' })),
        Row({ gap: 14 },
          Row({ gap: 6 }, Rect({ w: 12, h: 8, radius: 4, fill: col }), Txt('دفتري (من الحركات)', { style: 'Body/Small 12', color: 'text/secondary' })),
          Row({ gap: 6 }, Rect({ w: 3, h: 12, radius: 2, fill: 'brand/dark' }), Txt('آخر قياس فعلي ' + o.time, { style: 'Body/Small 12', color: 'text/secondary' })))),
      Row({ w: 'fill', gap: 12 },
        [['الدفتري', o.bookT, 'text/primary', 'book'], ['المقاس', o.measT, 'text/primary', 'ruler'], ['الفرق', o.diff, o.diffTone, 'transfer'], ['يكفي', o.days, 'text/primary', 'clock']].map(function (k) {
          return Col({ w: 'fill', pad: [10, 12], gap: 2, radius: 12, fill: k[0] === 'الفرق' && o.diffTone === 'status/danger-700' ? 'status/danger-50' : 'surface/page' },
            Row({ gap: 6 }, Ico(k[3], { size: 14, color: 'text/muted' }), Txt(k[0], { style: 'Body/Small 12', color: 'text/muted' })),
            Txt(k[1], { style: 'Number/M 18', color: k[2] }));
        })));
  }
  function mv(date, type, tone, tank, qty, ref, by) {
    return [Txt(date, { style: 'Body/Small 12', color: 'text/secondary', w: 130 }), Row({ w: 110 }, Badge(tone, type)), Txt(tank, { style: 'Body/Regular 14', w: 150 }),
      Txt(qty, { style: 'Body/Strong 14', w: 120, color: qty.charAt(0) === '+' ? 'brand/action-700' : 'text/primary' }), Txt(ref, { style: 'Body/Regular 14', color: 'brand/primary', w: 'fill' }), Txt(by, { style: 'Body/Small 12', color: 'text/secondary', w: 160 }),
      Row({ w: 40, main: 'center' }, Ico('history', { size: 16, color: 'text/muted' }))];
  }
  return Desktop('O2 · الخزانات والمخزون', 'tanks', [
    PageHeader('الخزانات والمخزون', 'المخزون يُحسب من الحركات المسجلة ويُطابق بالقياس الفعلي — لا حساسات مطلوبة', [
      Btn('secondary', 'نقل بين الخزانات', 'transfer'), Btn('secondary', 'تسجيل قياس فعلي', 'ruler'), Btn('primary', 'إضافة توريد', 'plus')]),
    Inst('Alert Banner', { tone: 'danger' }, { Title: 'فرق كبير في خزان 1: المقاس أقل من الدفتري بـ 310 لتر', Body: 'تجاوز حد التسامح (100 لتر). التسوية تحتاج سبباً واعتماد المدير، وتُسجَّل كقيد عكسي في سجل المراجعة.', Action: 'بدء التسوية' }, { w: 'fill' }),
    tankRow({ name: 'بنزين 90', tank: 'خزان 1', capT: '30,000', cap: 30000, book: 18600, meas: 18290, pct: 62, time: '07:30', bookT: '18,600', measT: '18,290', diff: '-310', diffTone: 'status/danger-700', days: '3.1 يوم', alert: true, badge: ['danger', 'فرق يتطلب سبباً'] }),
    tankRow({ name: 'ديزل', tank: 'خزان 2', capT: '30,000', cap: 30000, book: 5400, meas: 5360, pct: 18, tone: 'warning', time: '07:30', bookT: '5,400', measT: '5,360', diff: '-40', diffTone: 'text/primary', days: '1.5 يوم', badge: ['warning', 'أقل من الحد الأدنى'] }),
    tankRow({ name: 'بنزين 95', tank: 'خزان 3', capT: '20,000', cap: 20000, book: 8200, meas: 8180, pct: 41, time: '07:30', bookT: '8,200', measT: '8,180', diff: '-20', diffTone: 'text/primary', days: '2.4 يوم', badge: ['info', 'سعر شراء الشحنة الأخيرة غير مدخل'] }),
    Card({ name: 'Movements', pad: [20, 12, 12, 12], gap: 12 },
      Row({ w: 'fill', main: 'between', pad: [0, 8] },
        CardHeader('سجل حركات المخزون', { icon: 'history' }),
        Row({ gap: 8 }, ['الكل', 'وارد', 'بيع', 'تسوية', 'هدر', 'إرجاع'].map(function (c, i) { return Chip(c, i === 0, { h: 32 }); }))),
      Table([{ t: 'التاريخ', w: 130 }, { t: 'النوع', w: 110 }, { t: 'الخزان', w: 150 }, { t: 'الكمية', w: 120 }, { t: 'المرجع', w: 'fill' }, { t: 'بواسطة', w: 160 }, { t: '', w: 40 }], [
        mv('اليوم 07:30', 'تسوية', 'warning', 'خزان 2 · ديزل', '-40 لتر', 'قياس فعلي QM-0921', 'سامي · مدير الوردية'),
        mv('اليوم 06:00', 'بيع', 'neutral', 'خزان 1 · بنزين 90', '-6,180 لتر', 'مناوبات 23 سبتمبر', 'النظام'),
        mv('أمس 16:20', 'وارد', 'success', 'خزان 3 · بنزين 95', '+12,000 لتر', 'فاتورة مورد INV-2231', 'خالد العمر'),
        mv('أمس 09:10', 'هدر', 'danger', 'خزان 1 · بنزين 90', '-15 لتر', 'تسرب أثناء التعبئة — صورة مرفقة', 'محمد خليل'),
        mv('22 سبتمبر', 'إرجاع', 'info', 'خزان 2 · ديزل', '+200 لتر', 'إرجاع من شركة الأمل للنقل', 'سامي · مدير الوردية')
      ], { rowPad: 10 }))
  ]);
}

function O3_Sales() {
  function pump(n, fuel, who, tone, st, sel) {
    return Row({ name: 'Pump ' + n, w: 'fill', pad: 12, gap: 12, radius: 12, fill: sel ? 'brand/primary-50' : 'surface/card', stroke: sel ? 'brand/primary' : 'border/default', strokeW: sel ? 2 : 1 },
      Row({ w: 40, h: 40, radius: 10, fill: sel ? 'brand/primary' : 'surface/muted', main: 'center', cross: 'center' }, Txt(String(n), { style: 'Heading/H3 16', color: sel ? 'text/on-dark' : 'text/secondary' })),
      Col({ w: 'fill', gap: 0 }, Txt('المضخة ' + n + ' · ' + fuel, { style: 'Body/Strong 14' }), Txt(who, { style: 'Body/Small 12', color: 'text/muted' })),
      Badge(tone, st));
  }
  function stat(label, value, sub, icon, tone) {
    return Col({ w: 'fill', pad: 14, gap: 4, radius: 12, fill: tone === 'danger' ? 'status/danger-50' : 'surface/page', stroke: tone === 'danger' ? 'status/danger' : null, strokeOpacity: 0.4 },
      Row({ gap: 6 }, Ico(icon, { size: 14, color: tone === 'danger' ? 'status/danger' : 'text/muted' }), Txt(label, { style: 'Body/Small 12', color: 'text/secondary' })),
      Txt(value, { style: 'Number/L 24', color: tone === 'danger' ? 'status/danger-700' : 'text/primary' }),
      sub ? Txt(sub, { style: 'Body/Small 12', color: tone === 'danger' ? 'status/danger-700' : 'text/muted' }) : null);
  }
  function pay(icon, m, n, amt) { return [Row({ w: 'fill', gap: 8 }, Ico(icon, { size: 16, color: 'text/secondary' }), Txt(m, { style: 'Body/Strong 14' })), Txt(n, { style: 'Body/Regular 14', w: 120 }), Txt(amt, { style: 'Body/Strong 14', w: 160 })]; }
  return Desktop('O3 · المبيعات والمناوبات', 'sales', [
    PageHeader('المبيعات والمضخات والمناوبات', 'الخميس 24 سبتمبر · 6 مضخات · 4 مناوبات', [PeriodChips(0), Btn('secondary', 'تصدير', 'download')]),
    Row({ name: 'Split', w: 'fill', h: 'fill', gap: 20, cross: 'start' },
      Card({ name: 'Pumps', w: 380, gap: 10 },
        CardHeader('المضخات والمناوبات', { right: LinkText('الكل') }),
        pump(1, 'بنزين 90', 'محمد خليل · 06:00 – 14:00', 'success', 'مغلقة', false),
        pump(2, 'بنزين 90', 'يوسف ديب · منذ 14:00', 'info', 'مفتوحة', false),
        pump(3, 'بنزين 95', 'أحمد سالم · 06:00 – 14:05', 'warning', 'بانتظار الاعتماد', true),
        pump(4, 'ديزل', 'علي حسن · منذ 23:40 أمس', 'danger', 'مفتوحة طويلاً', false),
        pump(5, 'بنزين 95', 'رامي نصر · 06:00 – 14:00', 'success', 'مغلقة', false),
        pump(6, 'ديزل', 'لا توجد مناوبة', 'neutral', 'متوقفة', false)),
      Card({ name: 'Shift detail', gap: 18 },
        Row({ w: 'fill', main: 'between', cross: 'start' },
          Col({ gap: 4 },
            Row({ gap: 10 }, Txt('مناوبة المضخة 3', { style: 'Heading/H2 20' }), Badge('warning', 'بانتظار اعتمادك')),
            Txt('أحمد سالم · 06:00 – 14:05 · بنزين 95 · سعر اللتر 125 ل.س', { style: 'Body/Regular 14', color: 'text/secondary' })),
          Row({ gap: 10 }, Btn('secondary', 'طلب تصحيح', 'message'), Btn('action', 'اعتماد الإغلاق', 'check'))),
        Row({ w: 'fill', gap: 12 },
          stat('القراءة الافتتاحية', '184,220.5', '06:00 · صورة مرفقة', 'camera'),
          stat('القراءة النهائية', '191,640.0', '14:05 · صورة مرفقة', 'camera'),
          stat('اللترات المباعة', '7,419.5', 'محسوبة تلقائياً', 'droplet'),
          stat('قيمة المبيعات', '927,438', 'ل.س', 'chart')),
        Col({ w: 'fill', gap: 8 },
          Txt('طرق الدفع', { style: 'Heading/H3 16' }),
          Table([{ t: 'الطريقة', w: 'fill' }, { t: 'عدد العمليات', w: 120 }, { t: 'المبلغ (ل.س)', w: 160 }], [
            pay('cash', 'نقدي', '94', '639,438'), pay('card', 'بطاقة مسجلة', '14', '180,000'), pay('building', 'آجل (شركات)', '3', '96,000'), pay('ticket', 'قسيمة / خصم', '2', '12,000')
          ], { rowPad: 9 }),
          Row({ w: 'fill', pad: [10, 16], radius: 10, fill: 'brand/primary-50', main: 'between' }, Txt('الإجمالي · 113 عملية', { style: 'Body/Strong 14', color: 'brand/primary' }), Txt('927,438 ل.س', { style: 'Number/M 18', color: 'brand/primary' }))),
        Row({ w: 'fill', gap: 12 },
          stat('النقد المتوقع في الصندوق', '639,438', 'المبيعات - البطاقة - الآجل - القسائم', 'cash'),
          stat('النقد الفعلي (أدخله العامل)', '634,938', '14:05', 'wallet'),
          stat('فرق الصندوق', '-4,500', 'أكبر من الحد المسموح (1,000 ل.س)', 'alert', 'danger')),
        Row({ w: 'fill', pad: 14, gap: 12, radius: 12, fill: 'surface/muted', cross: 'start' },
          Avatar('أس', 32),
          Col({ w: 'fill', gap: 2 }, Txt('سبب العامل', { style: 'Label/12', color: 'text/muted' }), Txt('«دفعة بطاقة بقيمة 4,500 سُجلت نقداً بالخطأ في الساعة 11:20.»', { style: 'Body/Strong 14', w: 'fill' })),
          Badge('info', 'صورة الصندوق مرفقة')),
        Row({ w: 'fill', pad: 14, gap: 12, radius: 12, fill: 'status/warning-50', stroke: 'status/warning', strokeOpacity: 0.4 },
          Ico('alert', { size: 20, color: 'status/warning-700' }),
          Col({ w: 'fill', gap: 0 }, Txt('عملية معلّقة ضمن المناوبة', { style: 'Body/Strong 14', color: 'status/warning-700' }), Txt('بيع آجل لشركة الأمل للنقل · 38,000 ل.س · يتجاوز الحد المتبقي (26,000 ل.س)', { style: 'Body/Small 12', color: 'text/secondary' })),
          Btn('secondary', 'رفض'), Btn('primary', 'موافقة'))))
  ]);
}

function O4_Journal() {
  function je(no, date, desc, amt, src, tone, st, sel) {
    const r = [Col({ w: 96, gap: 0 }, Txt(no, { style: 'Body/Strong 14', color: sel ? 'brand/primary' : 'text/primary' }), Txt(date, { style: 'Body/Small 12', color: 'text/muted' })),
      Txt(desc, { style: 'Body/Regular 14', w: 'fill' }), Txt(amt, { style: 'Body/Strong 14', w: 92 }), Txt(src, { style: 'Body/Small 12', color: 'brand/primary', w: 100 }), Row({ w: 104 }, Badge(tone, st))];
    if (sel) r.highlight = 'brand/primary-50';
    return r;
  }
  return Desktop('O4 · القيود المحاسبية', 'journal', [
    PageHeader('القيود المحاسبية', 'سبتمبر 2026 · الفترة مفتوحة', [Btn('secondary', 'تصدير', 'download'), Btn('primary', 'قيد يدوي', 'plus')]),
    Row({ w: 'fill', main: 'between' },
      Row({ gap: 8 }, ['كل الحسابات', 'الصندوق', 'المبيعات', 'المخزون', 'الذمم'].map(function (c, i) { return Chip(c, i === 0, { h: 32 }); })),
      Row({ name: 'View mode', pad: 4, gap: 2, radius: 10, fill: 'surface/muted' },
        Row({ h: 28, pad: [0, 10], radius: 7, main: 'center' }, Txt('عرض مبسّط', { style: 'Label/12', color: 'text/secondary' })),
        Row({ h: 28, pad: [0, 10], radius: 7, fill: 'surface/card', main: 'center', shadow: 'Shadow/Card' }, Txt('عرض المحاسب', { style: 'Label/12' })))),
    Card({ name: 'Entries', pad: [8, 8, 8, 8], gap: 0 },
      Table([{ t: 'القيد', w: 96 }, { t: 'البيان', w: 'fill' }, { t: 'المبلغ', w: 92 }, { t: 'المصدر', w: 100 }, { t: 'الحالة', w: 104 }], [
        je('JE-1043', 'اليوم 15:10', 'مسودة: مصاريف كهرباء سبتمبر', '86,000', 'قيد يدوي', 'danger', 'غير متوازن'),
        je('JE-1042', 'اليوم 14:05', 'فرق صندوق · مناوبة المضخة 3', '4,500', 'إغلاق مناوبة', 'success', 'معتمد', true),
        je('JE-1041', 'اليوم 14:00', 'مبيعات نقدية · المضخة 1', '712,300', 'إغلاق مناوبة', 'neutral', 'آلي'),
        je('JE-1040', 'اليوم 14:00', 'مبيعات بطاقة · تسوية يومية', '210,000', 'تسوية بطاقات', 'neutral', 'آلي'),
        je('JE-1039', 'أمس 16:20', 'توريد بنزين 95 · 12,000 لتر', '1,320,000', 'INV-2231', 'neutral', 'آلي'),
        je('JE-1038', 'اليوم 07:30', 'تسوية مخزون ديزل -40 لتر', '3,800', 'قياس فعلي', 'success', 'معتمد'),
        je('JE-1037', 'اليوم 10:15', 'بيع آجل · شركة الأمل للنقل', '38,000', 'فاتورة آجل', 'warning', 'معلّق'),
        je('JE-1036', '22 سبتمبر', 'عكس القيد JE-1029 (خطأ إدخال)', '12,000', 'تصحيح', 'info', 'قيد عكسي')
      ], { rowPad: 10 }),
      Divider(),
      Row({ w: 'fill', pad: [14, 16], main: 'between' },
        Row({ gap: 8 }, Ico('checkCircle', { size: 18, color: 'brand/action' }), Txt('إجمالي المدين = إجمالي الدائن = 2,300,600 ل.س', { style: 'Body/Strong 14', color: 'brand/action-700' })),
        Txt('قيد واحد غير متوازن يمنع إغلاق الفترة', { style: 'Body/Small 12', color: 'status/danger-700' }))),
    Row({ w: 'fill', pad: 14, gap: 10, radius: 12, fill: 'status/info-50' },
      Ico('info', { size: 18, color: 'status/info-700' }),
      Txt('اضغط أي قيد لفتح مصدره وسجله في الدرج الجانبي. إغلاق الفترة يمنع التعديل إلا بتسوية.', { style: 'Body/Small 12', color: 'status/info-700', w: 'fill' }))
  ], { left: Inst('Audit Drawer', {}, {}, { h: 'fill', name: 'Audit Drawer' }) });
}

function O5_Customers() {
  function cust(name, type, bal, tone, st, sel) {
    return Row({ w: 'fill', pad: 12, gap: 10, radius: 12, fill: sel ? 'brand/primary-50' : null, stroke: sel ? 'brand/primary' : null },
      Avatar(name.split(' ').map(function (w) { return w.charAt(0); }).slice(0, 2).join(''), 36, { fill: sel ? 'brand/primary' : 'surface/muted', color: sel ? 'text/on-dark' : 'text/secondary' }),
      Col({ w: 'fill', gap: 0 }, Txt(name, { style: 'Body/Strong 14' }), Txt(type + ' · ' + bal, { style: 'Body/Small 12', color: 'text/muted' })),
      Badge(tone, st));
  }
  function op(d, who, l, a, tone, st) { return [Col({ w: 'fill', gap: 0 }, Txt(who, { style: 'Body/Strong 14' }), Txt(d + (l !== '—' ? ' · ' + l + ' لتر' : ''), { style: 'Body/Small 12', color: 'text/muted' })), Txt(a, { style: 'Body/Strong 14', w: 84 }), Row({ w: 116 }, Badge(tone, st))]; }
  function aging(label, amt, pctW, tone) {
    return Col({ w: 'fill', gap: 6 },
      Row({ w: 'fill', main: 'between' }, Txt(label, { style: 'Body/Regular 14', color: 'text/secondary' }), Txt(amt, { style: 'Body/Strong 14', color: tone === 'danger' ? 'status/danger-700' : 'text/primary' })),
      Box({ w: 240, h: 8, radius: 999, fill: 'surface/muted' }, Rect({ w: pctW, h: 8, x: 240 - pctW, y: 0, radius: 999, fill: tone === 'danger' ? 'status/danger' : (tone === 'warning' ? 'status/warning' : 'brand/primary') })));
  }
  return Desktop('O5 · العملاء والديون', 'customers', [
    PageHeader('العملاء والديون وحسابات الشركات', 'البيع الآجل وسقوف الائتمان وكشوف الحساب', [Btn('secondary', 'كشوف الشهر (4)', 'fileText'), Btn('primary', 'عميل جديد', 'plus')]),
    Row({ name: 'Three columns', w: 'fill', gap: 16, cross: 'start' },
      Card({ name: 'List', w: 300, gap: 10, pad: 14 },
        Row({ w: 'fill', h: 40, pad: [0, 12], gap: 8, radius: 10, fill: 'surface/page', stroke: 'border/default' }, Ico('search', { size: 16, color: 'text/muted' }), Txt('ابحث بالاسم أو رقم السيارة', { style: 'Body/Regular 14', color: 'text/muted', w: 'fill' })),
        Row({ gap: 6 }, Chip('الكل', true, { h: 30 }), Chip('شركات', false, { h: 30 }), Chip('أفراد', false, { h: 30 }), Chip('متأخر', false, { h: 30 })),
        cust('شركة الأمل للنقل', 'شركة', '212,000', 'danger', 'متأخر', true),
        cust('مؤسسة البناء', 'شركة', '164,000', 'warning', 'قرب الحد'),
        cust('تكسي المدينة', 'شركة', '98,500', 'success', 'منتظم'),
        cust('سامر يوسف', 'فرد', '12,000', 'success', 'منتظم'),
        cust('نقليات الساحل', 'شركة', '0', 'neutral', 'موقوف'),
        cust('ليلى حداد', 'فرد', '4,500', 'info', 'نزاع فاتورة')),
      Card({ name: 'Details', gap: 16 },
        Row({ w: 'fill', main: 'between', cross: 'start' },
          Row({ gap: 12 }, IconBox('building', { size: 48, radius: 14 }),
            Col({ gap: 2 }, Txt('شركة الأمل للنقل', { style: 'Heading/H2 20' }), Txt('حساب شركة · 12 سائقاً · 18 مركبة', { style: 'Body/Small 12', color: 'text/muted' }))),
          Badge('danger', 'متأخر 45 يوماً')),
        Row({ w: 'fill', gap: 12 },
          Col({ w: 'fill', pad: 14, gap: 2, radius: 12, fill: 'surface/page' }, Txt('الرصيد المستحق', { style: 'Body/Small 12', color: 'text/muted' }), Money('212,000')),
          Col({ w: 'fill', pad: 14, gap: 2, radius: 12, fill: 'surface/page' }, Txt('الحد الائتماني', { style: 'Body/Small 12', color: 'text/muted' }), Money('250,000'))),
        Col({ w: 'fill', gap: 6 },
          Row({ w: 'fill', main: 'between' }, Txt('المستخدم من الحد', { style: 'Body/Small 12', color: 'text/secondary' }), Txt('85%', { style: 'Body/Strong 14', color: 'status/warning-700' })),
          Box({ w: 'fill', h: 10, radius: 999, fill: 'surface/muted' }, Rect({ w: 398, h: 10, x: 70, y: 0, radius: 999, fill: 'status/warning', constraints: { horizontal: 'SCALE', vertical: 'SCALE' } }))),
        Row({ gap: 0 }, ['العمليات', 'السائقون', 'المركبات', 'كشف الحساب'].map(function (t, i) {
          return Col({ w: 92, gap: 6, cross: 'center' }, Txt(t, { style: 'Body/Strong 14', color: i === 0 ? 'brand/primary' : 'text/muted' }), Rect({ w: 'fill', h: 2, fill: i === 0 ? 'brand/primary' : 'border/default' }));
        })),
        Table([{ t: 'العملية', w: 'fill' }, { t: 'المبلغ', w: 84 }, { t: 'الحالة', w: 116 }], [
          op('اليوم 10:15', 'ماهر · شاحنة 45821', '304', '38,000', 'warning', 'بانتظار موافقة'),
          op('22 سبتمبر', 'فادي · شاحنة 45817', '280', '35,000', 'success', 'مسجلة'),
          op('20 سبتمبر', 'ماهر · شاحنة 45821', '296', '37,000', 'success', 'مسجلة'),
          op('15 سبتمبر', 'سداد جزئي', '—', '-60,000', 'info', 'دفعة')
        ], { rowPad: 9 }),
        Row({ w: 'fill', gap: 10 }, Btn('secondary', 'تسجيل دفعة', 'wallet', { w: 'fill' }), Btn('secondary', 'إرسال الكشف', 'share', { w: 'fill' }), Btn('danger', 'تجميد الحساب', 'snow', { w: 'fill' }))),
      Card({ name: 'Risk', w: 280, gap: 14 },
        CardHeader('مخاطر الديون', { icon: 'alert' }),
        aging('0 – 30 يوماً', '412,000', 150, 'ok'),
        aging('31 – 60 يوماً', '212,000', 78, 'warning'),
        aging('أكثر من 60 يوماً', '60,000', 22, 'danger'),
        Divider(),
        KV('عملاء تجاوزوا الحد', '1'),
        KV('فواتير متنازع عليها', '1'),
        KV('كشوف جاهزة للإرسال', '4'),
        Col({ w: 'fill', pad: 14, gap: 8, radius: 12, fill: 'brand/primary-50' },
          Row({ gap: 6 }, Ico('info', { size: 16, color: 'brand/primary' }), Txt('إجراء مقترح', { style: 'Label/12', color: 'brand/primary' })),
          Txt('شركة الأمل استخدمت 85% من حدها ومتأخرة 45 يوماً. أرسل الكشف وحدّد موعد سداد قبل التجميد.', { style: 'Body/Small 12', color: 'text/primary', w: 'fill' }),
          Btn('primary', 'إرسال الكشف الآن', null, { w: 'fill' }))))
  ]);
}

const OWNER_SCREENS = [O1_Dashboard, O2_Tanks, O3_Sales, O4_Journal, O5_Customers];
