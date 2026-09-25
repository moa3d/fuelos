// ============================================================
// Customer app screens (mobile 390x844)
// ============================================================

function StationCard(o) {
  function price(fuel, p, av, tone) {
    return Col({ w: 'fill', pad: [8, 10], gap: 0, radius: 12, fill: 'surface/page' },
      Txt(fuel, { style: 'Body/Small 12', color: 'text/secondary' }),
      Row({ gap: 3, cross: 'end' }, Txt(p, { style: 'Number/M 18' }), Txt('ل.س', { style: 'Label/11', color: 'text/muted' })),
      Row({ gap: 4 }, Dot(6, tone === 'warning' ? 'status/warning' : (tone === 'danger' ? 'status/danger' : 'brand/action')), Txt(av, { style: 'Label/11', color: tone === 'warning' ? 'status/warning-700' : (tone === 'danger' ? 'status/danger-700' : 'brand/action-700') })));
  }
  return Col({ name: 'Station · ' + o.name, w: 'fill', pad: 14, gap: 12, radius: 18, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Card' },
    Row({ w: 'fill', gap: 12 },
      IconBox('fuel', { size: 46, radius: 14, bg: o.bg || 'brand/primary-50' }),
      Col({ w: 'fill', gap: 2 },
        Row({ w: 'fill', main: 'between' }, Txt(o.name, { style: 'Heading/H3 16' }), Txt(o.dist, { style: 'Body/Strong 14', color: 'text/secondary' })),
        Row({ gap: 6 }, Badge(o.open ? 'success' : 'neutral', o.open ? 'مفتوحة' : 'مغلقة'), Txt(o.meta, { style: 'Body/Small 12', color: 'text/muted' })))),
    Row({ w: 'fill', gap: 8 }, o.prices.map(function (p) { return price(p[0], p[1], p[2], p[3]); })),
    Row({ gap: 6 }, Ico('clock', { size: 14, color: o.stale ? 'status/warning-700' : 'text/muted' }), Txt(o.updated, { style: 'Body/Small 12', color: o.stale ? 'status/warning-700' : 'text/muted' })));
}

function C1_Home() {
  function shortcut(icon, t, bg, fg) {
    return Col({ w: 'fill', gap: 6, cross: 'center' }, IconBox(icon, { size: 56, radius: 18, bg: bg, fg: fg, iconSize: 24 }), Txt(t, { style: 'Label/12', color: 'text/primary', align: 'center' }));
  }
  function pinMarker(x, y, label, main) {
    return Row({ abs: true, x: x, y: y, h: 30, pad: [0, 10], gap: 4, radius: 999, fill: main ? 'brand/primary' : 'surface/card', shadow: 'Shadow/Raised' },
      Ico('fuel', { size: 14, color: main ? 'text/on-dark' : 'brand/primary' }), Txt(label, { style: 'Label/12', color: main ? 'text/on-dark' : 'text/primary' }));
  }
  return Mobile('C1 · الرئيسية', [
    StatusBar(false),
    Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: [4, 16, 16, 16], gap: 16, clip: true },
      Row({ w: 'fill', main: 'between' },
        Col({ gap: 0 }, Txt('مساء الخير', { style: 'Body/Small 12', color: 'text/muted' }), Txt('سامر', { style: 'Heading/H1 24' })),
        Row({ gap: 8 }, IconBtn('bell', { dot: true, radius: 999, size: 44 }), Avatar('س', 44))),
      Row({ name: 'Search', w: 'fill', h: 48, pad: [0, 14], gap: 10, radius: 14, fill: 'surface/card', stroke: 'border/default' },
        Ico('search', { size: 20, color: 'text/muted' }), Txt('ابحث عن محطة أو خدمة', { style: 'Body/Regular 14', color: 'text/muted', w: 'fill' }), Ico('sliders', { size: 18, color: 'text/secondary' })),
      Box({ name: 'Map', w: 'fill', h: 170, radius: 20, clip: true, fill: 'surface/muted' },
        Svg(mapSvg(358, 170), 358, 170, { name: 'Map art', x: 0, y: 0 }),
        pinMarker(214, 96, '125', true), pinMarker(262, 62, '124'), pinMarker(24, 110, '126'),
        Dot(14, 'status/info', { name: 'Me', x: 183, y: 138, stroke: 'surface/card', strokeW: 3 }),
        Row({ name: 'Map chip', x: 186, y: 12, h: 28, pad: [0, 10], gap: 6, radius: 999, fill: 'surface/card', shadow: 'Shadow/Card' },
          Ico('pin', { size: 14, color: 'brand/primary' }), Txt('3 محطات ضمن 5 كم', { style: 'Label/12' }))),
      Row({ name: 'Shortcuts', w: 'fill', gap: 8 },
        shortcut('car', 'سيارتي', 'brand/primary-50', 'brand/primary'), shortcut('receipt', 'فواتيري', 'status/info-50', 'status/info'),
        shortcut('tag', 'العروض', 'status/warning-50', 'status/warning-700'), shortcut('message', 'الشكاوى', 'surface/muted', 'text/secondary')),
      Row({ w: 'fill', main: 'between' }, Txt('محطات قريبة', { style: 'Heading/H3 16' }), LinkText('عرض الكل')),
      Row({ gap: 8 }, Chip('الكل', true, { h: 32 }), Chip('بنزين 95', false, { h: 32 }), Chip('ديزل', false, { h: 32 }), Chip('غسيل', false, { h: 32 })),
      StationCard({ name: 'محطة النور', dist: '1.2 كم', open: true, meta: 'حتى 11:00 م · تقييم 4.6', prices: [['بنزين 95', '125', 'متوفر'], ['بنزين 90', '110', 'متوفر'], ['ديزل', '95', 'محدود', 'warning']], updated: 'الأسعار محدّثة قبل 20 دقيقة · من إدارة المحطة' }),
      StationCard({ name: 'محطة الربيع', dist: '2.8 كم', open: true, meta: '24 ساعة · تقييم 4.2', prices: [['بنزين 95', '124', 'متوفر'], ['بنزين 90', '110', 'غير متوفر', 'danger'], ['ديزل', '96', 'متوفر']], updated: 'آخر تحديث قبل 3 ساعات — قد لا يكون دقيقاً', stale: true })),
    Inst('Tab Bar', { active: 'home' }, {}, { w: 'fill' })
  ]);
}

function C2_Station() {
  function priceRow(fuel, p, tone, av) {
    return Row({ w: 'fill', pad: [12, 0], gap: 12 },
      Row({ w: 36, h: 36, radius: 10, fill: 'brand/primary-50', main: 'center', cross: 'center' }, Ico('droplet', { size: 18, color: 'brand/primary' })),
      Col({ w: 'fill', gap: 2 }, Txt(fuel, { style: 'Body/Strong 14' }), Badge(tone, av)),
      Row({ gap: 4, cross: 'end' }, Txt(p, { style: 'Number/L 24' }), Txt('ل.س/لتر', { style: 'Body/Small 12', color: 'text/muted' })));
  }
  function svc(t, ok) { return Row({ h: 32, pad: [0, 12], gap: 6, radius: 999, fill: ok ? 'surface/card' : null, stroke: 'border/strong', dash: !ok }, Ico(ok ? 'check' : 'info', { size: 14, color: ok ? 'brand/action' : 'text/muted' }), Txt(t, { style: 'Label/12', color: ok ? 'text/primary' : 'text/muted' })); }
  return Mobile('C2 · صفحة المحطة', [
    Col({ name: 'Hero', w: 'fill', pad: [0, 16, 20, 16], gap: 14, fill: 'brand/dark' },
      StatusBar(true),
      Row({ w: 'fill', main: 'between' },
        IconBtn('arrowRight', { fill: 'brand/dark-800', stroke: null, color: 'text/on-dark', radius: 999 }),
        Row({ gap: 8 }, IconBtn('share', { fill: 'brand/dark-800', stroke: null, color: 'text/on-dark', radius: 999 }), IconBtn('star', { fill: 'brand/dark-800', stroke: null, color: 'status/warning', radius: 999 }))),
      Row({ w: 'fill', gap: 12 },
        Row({ w: 56, h: 56, radius: 16, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 28, color: 'brand/dark' })),
        Col({ w: 'fill', gap: 4 },
          Txt('محطة النور', { style: 'Heading/H1 24', color: 'text/on-dark' }),
          Row({ gap: 8 }, Badge('success', 'مفتوحة الآن'), Txt('حتى 11:00 م · 1.2 كم', { style: 'Body/Small 12', color: 'text/on-dark-muted' })))),
      Row({ gap: 6 }, Ico('star', { size: 14, color: 'status/warning' }), Txt('4.6 · 128 تقييماً · الطريق الدولي، المخرج 4', { style: 'Body/Small 12', color: 'text/on-dark-muted' }))),
    Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: 16, gap: 14, clip: true },
      Card({ name: 'Prices', gap: 0, pad: [14, 16] },
        Row({ w: 'fill', main: 'between', pad: [0, 0, 4, 0] }, Txt('الأسعار المنشورة', { style: 'Heading/H3 16' }), Badge('primary', 'من إدارة المحطة')),
        priceRow('بنزين 95', '125', 'success', 'متوفر'), Divider(),
        priceRow('بنزين 90', '110', 'success', 'متوفر'), Divider(),
        priceRow('ديزل', '95', 'warning', 'كمية محدودة'),
        Row({ w: 'fill', pad: [10, 12], gap: 8, radius: 10, fill: 'surface/page', main: 'between' },
          Row({ gap: 6 }, Ico('clock', { size: 14, color: 'text/muted' }), Txt('آخر تحديث اليوم 07:30', { style: 'Body/Small 12', color: 'text/secondary' })),
          Txt('السعر غير صحيح؟', { style: 'Label/12', color: 'status/danger-700' }))),
      Card({ name: 'Services', gap: 10, pad: [14, 16] },
        Txt('الخدمات', { style: 'Heading/H3 16' }),
        Row({ gap: 8 }, svc('غسيل', true), svc('تغيير زيت', true), svc('متجر', true)),
        Row({ gap: 8 }, svc('دورات مياه', true), svc('دفع بالبطاقة', true), svc('هواء', false)),
        Txt('الخدمة المنقطة غير مؤكدة من المحطة.', { style: 'Body/Small 12', color: 'text/muted' }))),
    BottomBar([Row({ w: 'fill', gap: 10 }, Btn('secondary', 'اتصال', 'phone', { size: 'lg', w: 130 }), Btn('primary', 'الاتجاهات', 'navigation', { size: 'lg', w: 'fill' }))])
  ]);
}

function C3_Invoices() {
  return Mobile('C3 · فواتيري', [
    StatusBar(false),
    Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: [4, 16, 16, 16], gap: 14, clip: true },
      Row({ w: 'fill', main: 'between' }, Txt('فواتيري', { style: 'Heading/H1 24' }), Row({ gap: 8 }, IconBtn('filter', { radius: 999 }), IconBtn('download', { radius: 999 }))),
      Col({ name: 'Month', w: 'fill', pad: 18, gap: 10, radius: 20, fill: 'brand/dark' },
        Row({ w: 'fill', main: 'between' }, Txt('سبتمبر 2026', { style: 'Label/12', color: 'text/on-dark-muted' }), Row({ gap: 4 }, Ico('chevronRight', { size: 16, color: 'text/on-dark-muted' }), Ico('chevronLeft', { size: 16, color: 'text/on-dark-muted' }))),
        Row({ gap: 6, cross: 'end' }, Txt('186,500', { style: 'Number/XL 32', color: 'text/on-dark' }), Txt('ل.س', { style: 'Body/Strong 14', color: 'text/on-dark-muted' })),
        Row({ w: 'fill', gap: 8 },
          [['fuel', '9 تعبئات'], ['droplet', '1,492 لتر'], ['gift', '+120 نقطة']].map(function (s) {
            return Row({ w: 'fill', h: 32, gap: 6, radius: 10, fill: 'brand/dark-800', main: 'center' }, Ico(s[0], { size: 14, color: 'brand/action' }), Txt(s[1], { style: 'Label/12', color: 'text/on-dark' }));
          }))),
      Row({ gap: 8 }, Chip('كل السيارات', true, { h: 32 }), Chip('كيا ريو', false, { h: 32, icon: 'car' }), Chip('توسان', false, { h: 32, icon: 'car' })),
      Txt('هذا الأسبوع', { style: 'Label/12', color: 'text/muted' }),
      Inst('Invoice Card', { status: 'confirmed' }, { Station: 'محطة النور', Total: '5,000 ل.س', Details: 'بنزين 95 · 40.0 لتر · كيا ريو', Date: 'الخميس 24 سبتمبر · 10:48' }, { w: 'fill' }),
      Inst('Invoice Card', { status: 'pending' }, { Station: 'محطة الربيع', Total: '31,000 ل.س', Details: 'بنزين 95 · 250 لتر · توسان', Date: 'الثلاثاء 22 سبتمبر · 18:05' }, { w: 'fill' }),
      Inst('Invoice Card', { status: 'corrected' }, { Station: 'محطة النور', Total: '12,375 ل.س', Details: 'بنزين 90 · 112.5 لتر · كيا ريو', Date: 'الإثنين 21 سبتمبر · 08:12' }, { w: 'fill' }),
      Txt('الأسبوع الماضي', { style: 'Label/12', color: 'text/muted' }),
      Inst('Invoice Card', { status: 'confirmed' }, { Station: 'محطة النور', Total: '25,000 ل.س', Details: 'بنزين 95 · 200 لتر · توسان', Date: 'السبت 19 سبتمبر · 13:40' }, { w: 'fill' })),
    Inst('Tab Bar', { active: 'invoices' }, {}, { w: 'fill' })
  ]);
}

function C4_InvoiceDetail() {
  return Mobile('C4 · تفاصيل الفاتورة', [
    StatusBar(false),
    Row({ w: 'fill', pad: [4, 16, 8, 16], main: 'between' },
      Row({ gap: 10 }, IconBtn('arrowRight', { radius: 999 }), Txt('تفاصيل الفاتورة', { style: 'Heading/H2 20' })),
      IconBtn('share', { radius: 999 })),
    Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: [8, 16, 16, 16], gap: 14, clip: true },
      Col({ name: 'Receipt', w: 'fill', pad: 16, gap: 10, radius: 20, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Card' },
        Row({ w: 'fill', gap: 12 },
          IconBox('fuel', { size: 44, radius: 12 }),
          Col({ w: 'fill', gap: 0 }, Txt('محطة النور', { style: 'Heading/H3 16' }), Txt('فاتورة INV-2026-10482', { style: 'Body/Small 12', color: 'text/muted' })),
          Badge('success', 'مؤكدة')),
        Col({ w: 'fill', gap: 2, cross: 'center', pad: [8, 0] },
          Txt('الإجمالي', { style: 'Body/Small 12', color: 'text/muted', align: 'center' }),
          Row({ gap: 6, cross: 'end' }, Txt('5,000', { style: 'Number/Hero 44' }), Txt('ل.س', { style: 'Heading/H3 16', color: 'text/muted' }))),
        Rect({ w: 'fill', h: 1, fill: 'border/strong' }),
        KV('التاريخ', '24 سبتمبر 2026 · 10:48'), KV('الوقود', 'بنزين 95'), KV('الكمية', '40.00 لتر'), KV('سعر اللتر', '125 ل.س'),
        KV('طريقة الدفع', 'نقدي'), KV('السيارة', 'كيا ريو · 123456'), KV('قراءة العداد', '84,210 كم')),
      Row({ w: 'fill', pad: 14, gap: 10, radius: 14, fill: 'brand/primary-50' },
        Ico('gift', { size: 20, color: 'brand/primary' }), Txt('أضيفت 18 نقطة إلى رصيدك', { style: 'Body/Strong 14', color: 'brand/primary', w: 'fill' }), Txt('الرصيد 1,240', { style: 'Label/12', color: 'brand/primary' })),
      Row({ w: 'fill', gap: 10 }, Btn('secondary', 'تنزيل PDF', 'download', { w: 'fill' }), Btn('secondary', 'مشاركة', 'share', { w: 'fill' })),
      Row({ w: 'fill', main: 'between', pad: [4, 4] },
        Row({ gap: 8 }, Ico('message', { size: 18, color: 'text/secondary' }), Txt('طلب تصحيح أو شكوى', { style: 'Body/Strong 14' })),
        Ico('chevronLeft', { size: 18, color: 'text/muted' })),
      Txt('أي تعديل على الفاتورة يظهر كتصحيح مع السبب، ولا يُحذف.', { style: 'Body/Small 12', color: 'text/muted', w: 'fill' })),
    Inst('Tab Bar', { active: 'invoices' }, {}, { w: 'fill' })
  ]);
}

function C5_Expense() {
  const months = ['أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر'];
  const vals = [142, 155, 171, 160, 166, 186.5];
  return Mobile('C5 · سيارتي ومصروفي', [
    StatusBar(false),
    Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: [4, 16, 16, 16], gap: 14, clip: true },
      Txt('سيارتي ومصروفي', { style: 'Heading/H1 24' }),
      Row({ name: 'Car', w: 'fill', pad: 12, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default' },
        IconBox('car', { size: 44, radius: 12 }),
        Col({ w: 'fill', gap: 0 }, Txt('كيا ريو 2019', { style: 'Heading/H3 16' }), Txt('لوحة 123456 · بنزين 95 · 84,210 كم', { style: 'Body/Small 12', color: 'text/muted' })),
        Ico('chevronDown', { size: 18, color: 'text/secondary' })),
      Card({ name: 'Spend', gap: 12, pad: 16 },
        Row({ w: 'fill', main: 'between', cross: 'start' },
          Col({ gap: 0 }, Txt('مصروف سبتمبر', { style: 'Body/Small 12', color: 'text/muted' }), Money('186,500', { style: 'Number/XL 32', unitStyle: 'Body/Strong 14' })),
          Badge('warning', '+12%')),
        Row({ w: 'fill', pad: [8, 10], gap: 8, radius: 10, fill: 'status/warning-50' }, Ico('trendUp', { size: 16, color: 'status/warning-700' }), Txt('صرفت أكثر من الشهر الماضي بـ 20,500 ل.س', { style: 'Body/Small 12', color: 'status/warning-700', w: 'fill' })),
        Svg(barChartSvg(326, 96, vals, 200, ['#CBD5E1', '#CBD5E1', '#CBD5E1', '#CBD5E1', '#CBD5E1', '#0F766E']), 326, 96, { name: 'Bar chart' }),
        Row({ w: 326, main: 'between' }, months.map(function (m, i) { return Txt(m, { style: 'Label/11', color: i === 5 ? 'brand/primary' : 'text/muted', w: 52, align: 'center' }); }))),
      Row({ w: 'fill', gap: 10 },
        Col({ w: 'fill', pad: 14, gap: 2, radius: 14, fill: 'surface/card', stroke: 'border/default' }, Txt('متوسط الاستهلاك', { style: 'Body/Small 12', color: 'text/muted' }), Row({ gap: 4, cross: 'end' }, Txt('7.8', { style: 'Number/L 24' }), Txt('لتر/100 كم', { style: 'Label/11', color: 'text/muted' }))),
        Col({ w: 'fill', pad: 14, gap: 2, radius: 14, fill: 'surface/card', stroke: 'border/default' }, Txt('تكلفة الكيلومتر', { style: 'Body/Small 12', color: 'text/muted' }), Row({ gap: 4, cross: 'end' }, Txt('9.8', { style: 'Number/L 24' }), Txt('ل.س', { style: 'Label/11', color: 'text/muted' })))),
      Col({ name: 'Budget', w: 'fill', pad: 14, gap: 8, radius: 14, fill: 'surface/card', stroke: 'border/default' },
        Row({ w: 'fill', main: 'between' }, Txt('الميزانية الشهرية', { style: 'Body/Strong 14' }), Txt('186,500 / 200,000', { style: 'Body/Small 12', color: 'text/secondary' })),
        Box({ w: 330, h: 10, radius: 999, fill: 'surface/muted' }, Rect({ w: 307, h: 10, x: 23, y: 0, radius: 999, fill: 'status/warning' })),
        Txt('متبقٍ 13,500 ل.س لنهاية الشهر', { style: 'Body/Small 12', color: 'status/warning-700' })),
      Row({ name: 'Maintenance', w: 'fill', pad: 14, gap: 12, radius: 14, fill: 'surface/card', stroke: 'border/default' },
        IconBox('wrench', { size: 40, radius: 12, bg: 'status/info-50', fg: 'status/info' }),
        Col({ w: 'fill', gap: 0 }, Txt('تغيير الزيت بعد 420 كم', { style: 'Body/Strong 14' }), Txt('محسوب من قراءات العداد في فواتيرك', { style: 'Body/Small 12', color: 'text/muted' })),
        Txt('تذكير', { style: 'Label/12', color: 'brand/primary' }))),
    Inst('Tab Bar', { active: 'account' }, {}, { w: 'fill' })
  ]);
}

const CUSTOMER_SCREENS = [C1_Home, C2_Station, C3_Invoices, C4_InvoiceDetail, C5_Expense];
