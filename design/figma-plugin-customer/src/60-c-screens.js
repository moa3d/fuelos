// ============================================================
// Customer app — current version (mirrors apps/customer as built):
// guest price board, sign-in / sign-up (email + password), 6-tab bottom bar,
// card QR, invoices, rewards & offers, complaints (list / new / thread),
// vehicles & spend, sponsor ads (home banner + /ads page). Mobile 390×844.
// ============================================================

// ---------- shared pieces ----------
function CTabBar(active) { return Inst('Customer Tab Bar', { active: active }, {}, { w: 'fill', name: 'Tab Bar' }); }

function CTop(title, opt) {
  opt = opt || {};
  return Row({ name: 'Top bar', w: 'fill', pad: [4, 16, 8, 16], gap: 10 },
    opt.back ? Row({ name: 'Back' }, IconBtn('arrowRight', { radius: 999 })) : null,
    Col({ w: 'fill', gap: 0 },
      Txt(title, { style: opt.back ? 'Heading/H2 20' : 'Heading/H1 24' }),
      opt.sub ? Txt(opt.sub, { style: 'Body/Small 12', color: 'text/muted', w: 'fill' }) : null),
    opt.right || null);
}

function CScroll(kids, p) {
  return Col(Object.assign({ name: 'Scroll', w: 'fill', h: 'fill', pad: [4, 16, 20, 16], gap: 16, clip: true }, p || {}), kids);
}

function Progress(width, pct, color) {
  const fw = Math.max(6, Math.round(width * pct));
  return Row({ name: 'Progress', w: 'fill', h: 8, radius: 999, fill: 'surface/muted', clip: true },
    Rect({ name: 'Value', w: fw, h: 8, radius: 999, fill: color || 'brand/primary' }));
}

function FuelChips(active) {
  const list = ['الكل', 'بنزين 95', 'بنزين 90', 'ديزل'];
  return Row({ name: 'Fuel filter', w: 'fill', gap: 8 }, list.map(function (l) { return Chip(l, l === active, { h: 34 }); }));
}

function CStation(o) {
  const tone = { 'متوفر': 'success', 'كمية محدودة': 'warning', 'غير متوفر': 'danger' };
  return Col({ name: 'Station · ' + o.name, w: 'fill', pad: [14, 16], gap: 6, radius: 18, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Card' },
    Row({ w: 'fill', main: 'between', cross: 'start' },
      Col({ gap: 0 }, Txt(o.name, { style: 'Heading/H3 16' }), Txt(o.city, { style: 'Body/Small 12', color: 'text/muted' })),
      o.map ? Row({ name: 'Map link', gap: 4, pad: [6, 0, 0, 0] }, Ico('pin', { size: 14, color: 'brand/primary' }), LinkText('الموقع على الخريطة')) : null),
    Col({ name: 'Prices', w: 'fill', gap: 0 }, o.prices.map(function (p, i) {
      return [i ? Divider() : null,
        Row({ name: 'Price · ' + p[0], w: 'fill', pad: [10, 0], gap: 10 },
          Txt(p[0], { style: 'Body/Strong 14', w: 'fill' }),
          Badge(tone[p[2]], p[2]),
          Row({ gap: 3, cross: 'end', w: 92, main: 'end' }, Txt(p[1], { style: 'Number/M 18', color: p[2] === 'غير متوفر' ? 'text/muted' : 'text/primary' }), Txt('ل.س', { style: 'Label/11', color: 'text/muted' })))];
    })),
    Row({ gap: 6, pad: [4, 0, 0, 0] }, Ico('clock', { size: 14, color: o.stale ? 'status/warning-700' : 'text/muted' }),
      Txt(o.updated, { style: 'Body/Small 12', color: o.stale ? 'status/warning-700' : 'text/muted' })));
}

const ST_NOOR = { name: 'محطة النور', city: 'دمشق · المزة', map: true, prices: [['بنزين 95', '125', 'متوفر'], ['بنزين 90', '110', 'متوفر'], ['ديزل', '95', 'كمية محدودة']], updated: 'آخر تحديث قبل 20 دقيقة · من إدارة المحطة' };
const ST_HAIF = { name: 'محطة أبو الهيف', city: 'دمشق · أوتوستراد درعا', map: false, prices: [['بنزين 95', '124', 'متوفر'], ['بنزين 90', '110', 'غير متوفر'], ['ديزل', '96', 'متوفر']], updated: 'آخر تحديث قبل 3 ساعات — قد لا يكون دقيقاً', stale: true };

function AdBanner() {
  return Col({ name: 'Ads banner', w: 'fill', gap: 8 },
    Row({ w: 'fill', main: 'between' },
      Row({ gap: 6 }, Ico('megaphone', { size: 16, color: 'text/muted' }), Txt('من رعاة FuelOS', { style: 'Label/12', color: 'text/muted' })),
      LinkText('عرض الكل', { name: 'See all ads' })),
    Inst('Ad Slide', { art: 'oil' }, {}, { name: 'Banner slide' }),
    Row({ name: 'Dots', w: 'fill', gap: 6, main: 'center' },
      Rect({ name: 'Dot active', w: 18, h: 6, radius: 999, fill: 'brand/primary' }), Dot(6, 'border/strong'), Dot(6, 'border/strong')));
}

function StepDots(labels, current) {
  return Row({ name: 'Timeline', w: 'fill', cross: 'start', gap: 0 }, labels.map(function (l, i) {
    const done = i < current, now = i === current;
    const step = Col({ name: 'Step ' + (i + 1), w: 84, gap: 6, cross: 'center' },
      Row({ w: 28, h: 28, radius: 999, fill: done ? 'brand/action' : (now ? 'brand/primary' : 'surface/muted'), main: 'center', cross: 'center' },
        done ? Ico('check', { size: 14, color: 'brand/on-action' }) : Txt(String(i + 1), { style: 'Label/12', color: now ? 'text/on-dark' : 'text/muted' })),
      Txt(l, { style: 'Label/12', color: now || done ? 'text/primary' : 'text/muted', align: 'center' }));
    return i === labels.length - 1 ? [step] : [step, Col({ w: 'fill', pad: [13, 0, 0, 0] }, Rect({ w: 'fill', h: 2, fill: done ? 'brand/action' : 'border/default' }))];
  }));
}

function qrSvg(px) {
  const N = 25, m = px / N;
  let seed = 7;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  function finder(x, y) { return '<rect x="' + x * m + '" y="' + y * m + '" width="' + 7 * m + '" height="' + 7 * m + '" fill="#071E2D"/><rect x="' + (x + 1) * m + '" y="' + (y + 1) * m + '" width="' + 5 * m + '" height="' + 5 * m + '" fill="#fff"/><rect x="' + (x + 2) * m + '" y="' + (y + 2) * m + '" width="' + 3 * m + '" height="' + 3 * m + '" fill="#071E2D"/>'; }
  function inFinder(x, y) { return (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9); }
  let cells = '';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!inFinder(x, y) && rnd() > 0.52) cells += '<rect x="' + (x * m).toFixed(2) + '" y="' + (y * m).toFixed(2) + '" width="' + m.toFixed(2) + '" height="' + m.toFixed(2) + '" fill="#071E2D"/>';
  return '<svg width="' + px + '" height="' + px + '" viewBox="0 0 ' + px + ' ' + px + '" xmlns="http://www.w3.org/2000/svg"><rect width="' + px + '" height="' + px + '" fill="#fff"/>' + cells + finder(0, 0) + finder(N - 7, 0) + finder(0, N - 7) + '</svg>';
}

// ---------- screens ----------
function CU1_HomeGuest() {
  return Mobile('CU1 · الرئيسية — زائر', [
    StatusBar(false),
    CScroll([
      Row({ w: 'fill', main: 'between' },
        Col({ gap: 0 }, Txt('أسعار المحطات', { style: 'Heading/H1 24' }), Txt('تصفّح دون حساب، أو سجّل الدخول لمزيد', { style: 'Body/Small 12', color: 'text/muted' })),
        Btn('action', 'تسجيل الدخول')),
      AdBanner(),
      FuelChips('الكل'),
      CStation(ST_NOOR),
      CStation(ST_HAIF)
    ])
  ]);
}

function CU2_Home() {
  return Mobile('CU2 · الرئيسية', [
    StatusBar(false),
    CScroll([
      Row({ w: 'fill', main: 'between' },
        Col({ gap: 0 }, Txt('مرحباً، سامر', { style: 'Heading/H1 24' }), Txt('تصفّح المحطات القريبة وأسعارها', { style: 'Body/Small 12', color: 'text/muted' })),
        Row({ name: 'Sign out', gap: 6, h: 40, pad: [0, 4] }, Ico('logout', { size: 18, color: 'brand/primary' }), Txt('خروج', { style: 'Body/Strong 14', color: 'brand/primary' }))),
      AdBanner(),
      FuelChips('بنزين 95'),
      CStation({ name: ST_NOOR.name, city: ST_NOOR.city, map: true, prices: [ST_NOOR.prices[0]], updated: ST_NOOR.updated }),
      CStation({ name: ST_HAIF.name, city: ST_HAIF.city, map: false, prices: [ST_HAIF.prices[0]], updated: ST_HAIF.updated, stale: true })
    ]),
    CTabBar('home')
  ]);
}

function CU3_Station() {
  function price(fuel, p, tone, av, last) {
    return [Row({ name: 'Price · ' + fuel, w: 'fill', pad: [12, 0], gap: 12 },
      Row({ w: 40, h: 40, radius: 12, fill: 'brand/primary-50', main: 'center', cross: 'center' }, Ico('droplet', { size: 20, color: 'brand/primary' })),
      Col({ w: 'fill', gap: 4 }, Txt(fuel, { style: 'Body/Strong 14' }), Badge(tone, av)),
      Row({ gap: 4, cross: 'end' }, Txt(p, { style: 'Number/L 24', color: tone === 'danger' ? 'text/muted' : 'text/primary' }), Txt('ل.س/لتر', { style: 'Body/Small 12', color: 'text/muted' }))),
    last ? null : Divider()];
  }
  return Mobile('CU3 · صفحة المحطة', [
    Col({ name: 'Hero', w: 'fill', pad: [0, 16, 20, 16], gap: 14, fill: 'brand/dark' },
      StatusBar(true),
      Row({ name: 'Back', gap: 8 }, IconBtn('arrowRight', { fill: 'brand/dark-800', stroke: null, color: 'text/on-dark', radius: 999 }), Txt('رجوع', { style: 'Body/Strong 14', color: 'text/on-dark' })),
      Row({ w: 'fill', gap: 12 },
        Row({ w: 56, h: 56, radius: 16, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 28, color: 'brand/dark' })),
        Col({ w: 'fill', gap: 2 }, Txt('محطة النور', { style: 'Heading/H1 24', color: 'text/on-dark' }), Txt('دمشق · المزة', { style: 'Body/Small 12', color: 'text/on-dark-muted' }))),
      Btn('action', 'الاتجاهات', 'navigation', { w: 'fill', size: 'lg' })),
    CScroll([
      Card({ name: 'Prices', gap: 0, pad: [14, 16] },
        Row({ w: 'fill', main: 'between', pad: [0, 0, 4, 0] }, Txt('الأسعار المنشورة', { style: 'Heading/H3 16' }), Badge('primary', 'من إدارة المحطة')),
        price('بنزين 95', '125', 'success', 'متوفر'),
        price('بنزين 90', '110', 'success', 'متوفر'),
        price('ديزل', '95', 'warning', 'كمية محدودة', true),
        Row({ gap: 6, pad: [8, 0, 0, 0] }, Ico('clock', { size: 14, color: 'text/muted' }), Txt('آخر تحديث اليوم 08:40 · من إدارة المحطة', { style: 'Body/Small 12', color: 'text/muted' }))),
      Row({ name: 'Wrong price', w: 'fill', pad: [14, 16], gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default' },
        IconBox('alert', { bg: 'status/warning-50', fg: 'status/warning-700' }),
        Col({ w: 'fill', gap: 0 }, Txt('السعر غير صحيح؟', { style: 'Body/Strong 14' }), Txt('أرسل بلاغ سعر للمحطة وسنتابعه', { style: 'Body/Small 12', color: 'text/muted' })),
        Ico('chevronLeft', { size: 18, color: 'text/muted' }))
    ]),
    CTabBar('home')
  ]);
}

function AuthShell(name, active, fields, cta) {
  return Mobile(name, [
    StatusBar(false),
    Col({ name: 'Auth', w: 'fill', h: 'fill', pad: [24, 20, 28, 20], gap: 20 },
      Row({ w: 56, h: 56, radius: 16, fill: 'brand/dark', main: 'center', cross: 'center' }, Ico('fuel', { size: 28, color: 'brand/action' })),
      Col({ w: 'fill', gap: 4 },
        Txt('أهلاً بك في FuelOS', { style: 'Heading/H1 24' }),
        Txt('فواتيرك ونقاطك وأسعار المحطات في مكان واحد', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' })),
      Inst('Segmented Control', { active: active }, { 'Option 1': 'دخول', 'Option 2': 'حساب جديد' }, { w: 'fill', name: 'Auth tabs' }),
      fields,
      cta,
      VSpacer(),
      Row({ name: 'Browse as guest', w: 'fill', main: 'center', gap: 6 }, Txt('تصفّح المحطات دون حساب', { style: 'Body/Strong 14', color: 'brand/primary' }), Ico('chevronLeft', { size: 16, color: 'brand/primary' })))
  ]);
}

function CField(label, value, opt) {
  opt = opt || {};
  const over = { Label: label, Value: value };
  if (opt.suffix) over.Suffix = opt.suffix; else over['!Suffix'] = true;
  if (opt.helper) over.Helper = opt.helper; else over['!Helper'] = true;
  return Inst('Input', { size: 'md', state: opt.state || 'default' }, over, { w: 'fill', name: 'Field · ' + label });
}

function CU4_SignIn() {
  return AuthShell('CU4 · تسجيل الدخول', '1', [
    CField('البريد الإلكتروني', 'samer@example.com'),
    CField('كلمة المرور', '••••••••••', { suffix: 'إظهار' })
  ], Btn('primary', 'دخول', null, { w: 'fill', size: 'lg' }));
}

function CU5_SignUp() {
  return AuthShell('CU5 · حساب جديد', '2', [
    CField('البريد الإلكتروني', 'samer@example.com'),
    CField('كلمة المرور', '••••••••••', { suffix: 'إظهار', helper: '8 أحرف على الأقل' }),
    CField('تأكيد كلمة المرور', '•••••••', { state: 'error', helper: 'كلمتا المرور غير متطابقتين' })
  ], Btn('primary', 'إنشاء الحساب', null, { w: 'fill', size: 'lg' }));
}

function MonthSwitch(label) {
  return Row({ name: 'Month', w: 'fill', main: 'between', pad: [6, 6], radius: 14, fill: 'surface/card', stroke: 'border/default' },
    IconBtn('chevronRight', { stroke: null, fill: 'surface/muted', radius: 10, size: 36 }),
    Txt(label, { style: 'Heading/H3 16' }),
    IconBtn('chevronLeft', { stroke: null, fill: 'surface/muted', radius: 10, size: 36, color: 'text/muted' }));
}

function CInvoice(i, o) {
  const b = { 'مؤكدة': 'success', 'بانتظار المحطة': 'warning', 'مصحّحة': 'info', 'ملغاة': 'neutral' }[o.status];
  return Row({ name: 'Invoice · ' + i, w: 'fill', pad: 14, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default', cross: 'start' },
    IconBox('receipt', { size: 40, radius: 12, bg: o.status === 'ملغاة' ? 'surface/muted' : 'brand/primary-50', fg: o.status === 'ملغاة' ? 'text/muted' : 'brand/primary' }),
    Col({ w: 'fill', gap: 4 },
      Row({ w: 'fill', main: 'between' }, Txt(o.station, { style: 'Body/Strong 14' }), Money(o.total, { style: 'Number/M 18', color: o.status === 'ملغاة' ? 'text/muted' : 'text/primary' })),
      Row({ w: 'fill', main: 'between' }, Txt(o.details, { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }), Badge(b, o.status)),
      Txt(o.date, { style: 'Body/Small 12', color: 'text/muted' })));
}

function CU6_Invoices() {
  function stat(v, l) { return Col({ w: 'fill', gap: 0, cross: 'center' }, Txt(v, { style: 'Number/M 18' }), Txt(l, { style: 'Body/Small 12', color: 'text/muted' })); }
  return Mobile('CU6 · فواتيري', [
    StatusBar(false),
    CTop('فواتيري', { sub: 'كل تعبئة رُبطت ببطاقتك واعتمدتها المحطة' }),
    CScroll([
      MonthSwitch('أكتوبر 2026'),
      Row({ name: 'Totals', w: 'fill', pad: [14, 8], radius: 16, fill: 'brand/primary-50' },
        stat('+120', 'نقطة'), Rect({ w: 1, h: 32, fill: 'border/strong' }), stat('186.4', 'لتر'), Rect({ w: 1, h: 32, fill: 'border/strong' }), stat('6', 'تعبئات')),
      Row({ name: 'Car filter', w: 'fill', gap: 8 }, Chip('كل السيارات', true, { h: 32 }), Chip('كيا ريو', false, { h: 32, icon: 'car' }), Chip('هيونداي', false, { h: 32, icon: 'car' })),
      CInvoice(1, { station: 'محطة النور', total: '5,000', details: 'بنزين 95 · 40.0 لتر · كيا ريو', status: 'مؤكدة', date: 'الخميس 1 أكتوبر · 10:48' }),
      CInvoice(2, { station: 'محطة أبو الهيف', total: '3,720', details: 'بنزين 95 · 30.0 لتر · كيا ريو', status: 'بانتظار المحطة', date: 'الثلاثاء 29 سبتمبر · 18:05' }),
      CInvoice(3, { station: 'محطة النور', total: '4,750', details: 'ديزل · 50.0 لتر · هيونداي', status: 'مصحّحة', date: 'الأحد 27 سبتمبر · 07:30' }),
      CInvoice(4, { station: 'محطة النور', total: '2,500', details: 'بنزين 90 · 22.7 لتر · كيا ريو', status: 'ملغاة', date: 'السبت 26 سبتمبر · 13:12' })
    ]),
    CTabBar('invoices')
  ]);
}

function CU7_InvoiceDetail() {
  return Mobile('CU7 · تفاصيل الفاتورة', [
    StatusBar(false),
    CTop('تفاصيل الفاتورة', { back: true, right: Badge('info', 'مصحّحة') }),
    CScroll([
      Card({ name: 'Summary', gap: 6, cross: 'center' },
        Txt('محطة النور', { style: 'Body/Strong 14', color: 'text/secondary', align: 'center' }),
        Money('4,750', { style: 'Number/XL 32' }),
        Txt('الأحد 27 سبتمبر 2026 · 07:30', { style: 'Body/Small 12', color: 'text/muted' })),
      Card({ name: 'Details', gap: 12 },
        KV('الوقود', 'ديزل'), KV('الكمية', '50.0 لتر'), KV('سعر اللتر', '95 ل.س'), KV('طريقة الدفع', 'نقدي'),
        KV('السيارة', 'هيونداي · 774120'), KV('قراءة العداد', '88,900 كم')),
      Row({ name: 'Points', w: 'fill', pad: [12, 14], gap: 10, radius: 14, fill: 'brand/action-50' },
        Ico('gift', { size: 20, color: 'brand/action-700' }), Txt('+19 نقطة أُضيفت إلى رصيدك في محطة النور', { style: 'Body/Strong 14', color: 'brand/action-700', w: 'fill' })),
      Col({ name: 'Correction', w: 'fill', pad: [12, 14], gap: 4, radius: 14, fill: 'status/info-50' },
        Txt('صُحّحت الفاتورة: −250 ل.س', { style: 'Body/Strong 14', color: 'status/info-700' }),
        Txt('السبب: خطأ في إدخال الكمية — صحّحتها إدارة المحطة في 28 سبتمبر', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })),
      Row({ w: 'fill', gap: 10 },
        Row({ name: 'PDF disabled', w: 'fill', opacity: 0.5 }, Btn('secondary', 'تنزيل PDF', 'download', { w: 'fill' })),
        Txt('قريباً', { style: 'Label/12', color: 'text/muted' })),
      Row({ name: 'Report link', w: 'fill', main: 'between', pad: [12, 4] },
        Txt('طلب تصحيح أو شكوى', { style: 'Body/Strong 14', color: 'brand/primary' }), Ico('chevronLeft', { size: 18, color: 'brand/primary' }))
    ]),
    CTabBar('invoices')
  ]);
}

function CU8_Card() {
  return Mobile('CU8 · بطاقتي', [
    StatusBar(false),
    CTop('بطاقتي', { sub: 'أرِ هذا الرمز للعامل عند التعبئة' }),
    CScroll([
      Col({ name: 'Fuel card', w: 'fill', pad: 20, gap: 18, radius: 24, fill: 'brand/dark', shadow: 'Shadow/Raised', cross: 'center' },
        Row({ w: 'fill', main: 'between' },
          Row({ gap: 8 }, Row({ w: 32, h: 32, radius: 9, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 18, color: 'brand/dark' })), Txt('FuelOS', { style: 'Heading/H3 16', color: 'text/on-dark' })),
          Txt('بطاقة الزبون', { style: 'Label/12', color: 'text/on-dark-muted' })),
        Row({ name: 'QR', pad: 14, radius: 18, fill: 'surface/card' }, Svg(qrSvg(184), 184, 184, { name: 'QR code' })),
        Col({ gap: 2, cross: 'center' },
          Txt('7K2M  94QD  X81F', { style: 'Number/L 24', color: 'text/on-dark', align: 'center' }),
          Txt('سامر الحلبي', { style: 'Body/Small 12', color: 'text/on-dark-muted', align: 'center' }))),
      Btn('secondary', 'نسخ الرمز', 'copy', { w: 'fill' }),
      Row({ name: 'How it works', w: 'fill', pad: 14, gap: 10, radius: 14, fill: 'surface/card', stroke: 'border/default', cross: 'start' },
        Ico('info', { size: 18, color: 'brand/primary' }),
        Txt('يمسح العامل الرمز أو يكتبه، فتصلك فاتورة التعبئة وتُضاف نقاطك بعد اعتماد المناوبة. إن لم يكن الرمز معك يستطيع البحث برقم هاتفك.', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }))
    ]),
    CTabBar('card')
  ]);
}

function CU9_Rewards() {
  function offer(title, station, code, active) {
    return Row({ name: 'Offer · ' + code, w: 'fill', pad: 14, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default', opacity: active ? 1 : 0.6 },
      IconBox('tag', { bg: active ? 'status/warning-50' : 'surface/muted', fg: active ? 'status/warning-700' : 'text/muted' }),
      Col({ w: 'fill', gap: 2 }, Txt(title, { style: 'Body/Strong 14', w: 'fill' }), Row({ gap: 6 }, Txt(station, { style: 'Body/Small 12', color: 'text/muted' }), Badge(active ? 'success' : 'neutral', active ? 'فعّال' : 'منتهٍ'))),
      Row({ name: 'Code', h: 32, pad: [0, 10], gap: 6, radius: 10, fill: 'surface/muted', stroke: 'border/default', dash: true }, Txt(code, { style: 'Body/Strong 14' }), Ico('copy', { size: 14, color: 'text/secondary' })));
  }
  return Mobile('CU9 · المكافآت والعروض', [
    StatusBar(false),
    CTop('المكافآت والعروض'),
    CScroll([
      Card({ name: 'Points · النور', gap: 10 },
        Row({ w: 'fill', main: 'between' }, Txt('محطة النور', { style: 'Body/Strong 14', color: 'text/secondary' }), Txt('≈ 3,400 ل.س', { style: 'Label/12', color: 'brand/action-700' })),
        Row({ gap: 6, cross: 'end' }, Txt('340', { style: 'Number/Hero 44', color: 'brand/primary' }), Txt('نقطة', { style: 'Body/Strong 14', color: 'text/muted' })),
        Progress(318, 0.68, 'brand/action'),
        Txt('باقي 160 نقطة لـ «غسيل مجاني»', { style: 'Body/Small 12', color: 'text/secondary' })),
      Row({ name: 'Points · أبو الهيف', w: 'fill', pad: [12, 16], gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default' },
        Txt('محطة أبو الهيف', { style: 'Body/Strong 14', w: 'fill' }), Txt('85 نقطة', { style: 'Number/M 18' })),
      Row({ w: 'fill', main: 'between' }, Txt('عروض المحطات', { style: 'Heading/H3 16' }), Txt('انسخ الكود وأعطه للعامل', { style: 'Body/Small 12', color: 'text/muted' })),
      offer('خصم 10% على غسيل السيارة', 'محطة النور · حتى 31 أكتوبر', 'WASH10', true),
      offer('ضعف النقاط يوم الجمعة', 'محطة أبو الهيف', 'FRI2X', true),
      offer('فحص إطارات مجاني', 'محطة النور · انتهى 30 سبتمبر', 'TYRE0', false)
    ]),
    CTabBar('rewards')
  ]);
}

function ComplaintItem(i, o) {
  return Col({ name: 'Complaint · ' + i, w: 'fill', pad: 14, gap: 8, radius: 16, fill: 'surface/card', stroke: 'border/default' },
    Row({ w: 'fill', main: 'between' }, Row({ gap: 8 }, Txt(o.station, { style: 'Body/Strong 14' }), Badge(o.type === 'بلاغ سعر' ? 'warning' : 'primary', o.type)), Badge(o.tone, o.status)),
    Txt(o.last, { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill', truncate: 2 }),
    Txt(o.time, { style: 'Body/Small 12', color: 'text/muted' }));
}

function CU10_Complaints() {
  return Mobile('CU10 · الشكاوى', [
    StatusBar(false),
    CTop('الشكاوى', { right: Btn('primary', 'شكوى جديدة', 'plus') }),
    CScroll([
      ComplaintItem(1, { station: 'محطة النور', type: 'بلاغ سعر', status: 'قيد الرد', tone: 'warning', last: 'المحطة: شكراً لتنبيهك، نراجع لوحة الأسعار الآن وسنحدّث التطبيق.', time: 'قبل ساعة' }),
      ComplaintItem(2, { station: 'محطة أبو الهيف', type: 'شكوى', status: 'أُرسلت', tone: 'info', last: 'أنت: انتظرت 20 دقيقة عند المضخة 3 ولم يحضر أي عامل.', time: 'أمس 19:40' }),
      ComplaintItem(3, { station: 'محطة النور', type: 'شكوى', status: 'تم الحل', tone: 'success', last: 'المحطة: صحّحنا الفاتورة وأُضيف الفرق إلى رصيدك.', time: '28 سبتمبر' })
    ]),
    CTabBar('complaints')
  ]);
}

function CU11_NewComplaint() {
  return Mobile('CU11 · شكوى جديدة', [
    StatusBar(false),
    CTop('شكوى جديدة', { back: true }),
    CScroll([
      Col({ name: 'Station select', w: 'fill', gap: 6 },
        Txt('المحطة', { style: 'Label/12', color: 'text/secondary' }),
        Row({ w: 'fill', h: 44, pad: [0, 14], gap: 8, radius: 10, fill: 'surface/card', stroke: 'border/strong' },
          Txt('محطة النور', { style: 'Body/Large 16', w: 'fill' }), Ico('chevronDown', { size: 18, color: 'text/muted' }))),
      Col({ w: 'fill', gap: 6 },
        Txt('النوع', { style: 'Label/12', color: 'text/secondary' }),
        Inst('Segmented Control', { active: '2' }, { 'Option 1': 'شكوى', 'Option 2': 'بلاغ سعر' }, { w: 'fill' })),
      Col({ name: 'Description', w: 'fill', gap: 6 },
        Txt('صف المشكلة', { style: 'Label/12', color: 'text/secondary' }),
        Col({ w: 'fill', h: 148, pad: 14, radius: 12, fill: 'surface/card', stroke: 'brand/primary', strokeW: 2 },
          Txt('سعر بنزين 95 على لوحة المحطة 125، لكنه يظهر في التطبيق 130.', { style: 'Body/Large 16', w: 'fill' })),
        Txt('يصل البلاغ لإدارة المحطة، وإن لم يُرد عليه خلال 48 ساعة يُحوَّل لفريق FuelOS.', { style: 'Body/Small 12', color: 'text/muted', w: 'fill' })),
      Btn('primary', 'إرسال', 'send', { w: 'fill', size: 'lg' })
    ]),
    CTabBar('complaints')
  ]);
}

function CU12_Thread() {
  function bubble(mine, who, text, time) {
    return Row({ name: mine ? 'Mine' : 'Station', w: 'fill', main: mine ? 'end' : 'start' },  // RTL chat: own messages on the left
      Col({ w: 280, pad: [10, 14], gap: 4, radius: 16, fill: mine ? 'brand/primary-50' : 'surface/card', stroke: mine ? null : 'border/default' },
        Txt(who, { style: 'Label/12', color: mine ? 'brand/primary' : 'text/secondary' }),
        Txt(text, { style: 'Body/Regular 14', w: 'fill' }),
        Txt(time, { style: 'Label/11', color: 'text/muted' })));
  }
  return Mobile('CU12 · محادثة الشكوى', [
    StatusBar(false),
    CTop('محطة النور', { back: true, sub: 'بلاغ سعر · فُتح اليوم 09:12', right: Badge('warning', 'قيد الرد') }),
    CScroll([
      Card({ name: 'Progress', pad: [14, 12], gap: 0 }, StepDots(['أُرسلت', 'قيد الرد', 'تم الحل'], 1)),
      bubble(true, 'أنت', 'سعر بنزين 95 على لوحة المحطة 125، لكنه يظهر في التطبيق 130.', '09:12'),
      bubble(false, 'إدارة المحطة', 'شكراً لتنبيهك. نراجع لوحة الأسعار الآن وسنحدّث التطبيق خلال ساعة.', '09:40'),
      VSpacer()
    ], { gap: 12 }),
    Row({ name: 'Reply', w: 'fill', pad: [10, 16], gap: 10, fill: 'surface/card' },
      Row({ w: 'fill', h: 44, pad: [0, 14], radius: 999, fill: 'surface/muted' }, Txt('ردّك', { style: 'Body/Regular 14', color: 'text/muted', w: 'fill' })),
      Row({ w: 44, h: 44, radius: 999, fill: 'brand/primary', main: 'center', cross: 'center' }, Ico('send', { size: 18, color: 'text/on-dark' }))),
    CTabBar('complaints')
  ]);
}

function CU13_Vehicles() {
  function tile(icon, label, value, unit) {
    return Col({ w: 'fill', pad: 14, gap: 6, radius: 16, fill: 'surface/card', stroke: 'border/default' },
      Row({ gap: 6 }, Ico(icon, { size: 16, color: 'brand/primary' }), Txt(label, { style: 'Label/12', color: 'text/secondary' })),
      Row({ gap: 4, cross: 'end' }, Txt(value, { style: 'Number/L 24' }), Txt(unit, { style: 'Body/Small 12', color: 'text/muted' })));
  }
  return Mobile('CU13 · سياراتي ومصروفي', [
    StatusBar(false),
    CTop('سياراتي ومصروفي'),
    CScroll([
      Row({ name: 'Vehicles', w: 'fill', gap: 8 }, Chip('كيا ريو · 512346', true, { h: 34, icon: 'car' }), Chip('هيونداي · 774120', false, { h: 34, icon: 'car' })),
      Card({ name: 'Spend', gap: 8 },
        Row({ w: 'fill', main: 'between' }, Txt('مصروف أكتوبر', { style: 'Body/Strong 14', color: 'text/secondary' }), Badge('warning', '+12% عن سبتمبر')),
        Money('186,500', { style: 'Number/XL 32' })),
      Row({ w: 'fill', gap: 10 }, tile('gauge', 'تكلفة الكيلومتر', '312', 'ل.س'), tile('droplet', 'متوسط الاستهلاك', '8.4', 'لتر/100 كم')),
      Card({ name: 'Budget', gap: 10 },
        Row({ w: 'fill', main: 'between' }, Txt('الميزانية الشهرية', { style: 'Heading/H3 16' }), LinkText('تعديل')),
        Progress(318, 0.75, 'brand/primary'),
        Row({ w: 'fill', main: 'between' }, Txt('صرفت 186,500', { style: 'Body/Small 12', color: 'text/secondary' }), Txt('من 250,000 ل.س', { style: 'Body/Small 12', color: 'text/muted' }))),
      Row({ name: 'Oil change', w: 'fill', pad: 14, gap: 12, radius: 16, fill: 'status/warning-50', cross: 'start' },
        IconBox('wrench', { bg: 'surface/card', fg: 'status/warning-700' }),
        Col({ w: 'fill', gap: 2 },
          Txt('تغيير الزيت بعد 600 كم', { style: 'Body/Strong 14', color: 'status/warning-700' }),
          Txt('آخر تغيير عند 84,500 كم · كل 5,000 كم · العداد الآن 88,900', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })))
    ]),
    CTabBar('vehicles')
  ]);
}

function CU14_Ads() {
  function item(art, sponsor, title) {
    return Col({ name: 'Ad · ' + art, w: 'fill', gap: 8 },
      Inst('Ad Slide', { art: art }, {}, { name: 'Ad image' }),
      Row({ w: 'fill', main: 'between' },
        Col({ gap: 0 }, Txt(title, { style: 'Body/Strong 14' }), Txt('إعلان · ' + sponsor, { style: 'Body/Small 12', color: 'text/muted' })),
        Row({ gap: 4 }, Txt('زيارة', { style: 'Label/12', color: 'brand/primary' }), Ico('external', { size: 14, color: 'brand/primary' }))));
  }
  return Mobile('CU14 · الإعلانات', [
    StatusBar(false),
    CTop('الإعلانات', { back: true, sub: 'عروض من رعاة FuelOS' }),
    CScroll([
      item('oil', 'الأفق للزيوت', 'زيت محركات بخصم 15%'),
      item('tyres', 'إطارات الشام', 'إطارات صيفية بسعر الجملة'),
      item('insurance', 'درع للتأمين', 'أمّن سيارتك بالتقسيط')
    ], { gap: 20 }),
    CTabBar('home')
  ]);
}

function CU15_Empty() {
  return Mobile('CU15 · فواتيري — فارغة', [
    StatusBar(false),
    CTop('فواتيري', { sub: 'كل تعبئة رُبطت ببطاقتك واعتمدتها المحطة' }),
    CScroll([
      MonthSwitch('نوفمبر 2026'),
      Col({ name: 'Empty', w: 'fill', pad: [56, 24], gap: 12, cross: 'center', radius: 20, fill: 'surface/card', stroke: 'border/default', dash: true },
        Row({ w: 72, h: 72, radius: 999, fill: 'brand/primary-50', main: 'center', cross: 'center' }, Ico('receipt', { size: 32, color: 'brand/primary' })),
        Txt('لا فواتير في نوفمبر', { style: 'Heading/H3 16', align: 'center' }),
        Txt('تظهر الفاتورة هنا بعد أن تعتمد المحطة تعبئة رُبطت ببطاقتك.', { style: 'Body/Regular 14', color: 'text/secondary', align: 'center', w: 280 }),
        Btn('primary', 'اعرض بطاقتي', 'qr'))
    ]),
    CTabBar('invoices')
  ]);
}

const C_SCREENS = [
  [CU1_HomeGuest, CU2_Home, CU3_Station, CU4_SignIn, CU5_SignUp],
  [CU6_Invoices, CU7_InvoiceDetail, CU8_Card, CU9_Rewards, CU15_Empty],
  [CU10_Complaints, CU11_NewComplaint, CU12_Thread, CU13_Vehicles, CU14_Ads]
];
