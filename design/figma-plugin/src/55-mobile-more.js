// ============================================================
// Worker + customer — priority 2 and login screens
// ============================================================

function L2_WorkerPin() {
  function worker(init, name, sel) {
    return Col({ gap: 6, cross: 'center', w: 72 },
      Row({ w: 56, h: 56, radius: 999, fill: sel ? 'brand/primary' : 'brand/dark-800', stroke: sel ? 'brand/action' : null, strokeW: 3, main: 'center', cross: 'center' }, Txt(init, { style: 'Body/Strong 14', color: 'text/on-dark' })),
      Txt(name, { style: 'Label/12', color: sel ? 'text/on-dark' : 'text/on-dark-muted', align: 'center' }));
  }
  function key(label, icon, ghost) {
    return Row({ name: 'Key ' + (label || icon || 'blank'), w: 88, h: 60, radius: 18, fill: ghost ? null : 'brand/dark-800', main: 'center', cross: 'center' },
      icon ? Ico(icon, { size: 24, color: 'text/on-dark' }) : (label ? Txt(label, { style: 'Number/L 24', color: 'text/on-dark' }) : null));
  }
  // keypad rows are LTR (1 2 3): Row() lists children right→left, so reverse
  function krow(ks) { return Row({ gap: 14 }, ks.slice().reverse()); }
  return Mobile('L2 · دخول العامل (PIN)', [
    StatusBar(true),
    Col({ name: 'Content', w: 'fill', h: 'fill', pad: [16, 24, 28, 24], gap: 22, cross: 'center' },
      Col({ gap: 8, cross: 'center' },
        Row({ w: 56, h: 56, radius: 16, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 28, color: 'brand/dark' })),
        Txt('محطة النور', { style: 'Heading/H2 20', color: 'text/on-dark', align: 'center' }),
        Txt('هذا الجهاز مسجّل لمحطة النور', { style: 'Body/Small 12', color: 'text/on-dark-muted', align: 'center' })),
      Col({ gap: 10, cross: 'center' },
        Txt('من أنت؟', { style: 'Label/12', color: 'text/on-dark-muted' }),
        Row({ gap: 8 }, worker('أس', 'أحمد', true), worker('يد', 'يوسف'), worker('عح', 'علي'), worker('رن', 'رامي'))),
      Col({ gap: 12, cross: 'center' },
        Txt('أدخل رمزك السري', { style: 'Body/Strong 14', color: 'text/on-dark' }),
        Row({ gap: 14 }, [1, 1, 0, 0].reverse().map(function (f) { return Dot(16, f ? 'brand/action' : 'brand/dark-700'); }))),
      Col({ name: 'Keypad', gap: 12, cross: 'center' },
        krow([key('1'), key('2'), key('3')]), krow([key('4'), key('5'), key('6')]), krow([key('7'), key('8'), key('9')]), krow([key(null, null, true), key('0'), key(null, 'backspace', true)])),
      VSpacer(),
      Row({ gap: 8 }, Ico('wifiOff', { size: 16, color: 'text/on-dark-muted' }), Txt('يعمل الدخول دون إنترنت على هذا الجهاز', { style: 'Body/Small 12', color: 'text/on-dark-muted' })))
  ], { fill: 'brand/dark' });
}

function CompanyCard(remaining, usedW) {
  return Col({ name: 'Company', w: 'fill', pad: 14, gap: 10, radius: 16, fill: 'surface/card', stroke: 'brand/primary', strokeW: 2 },
    Row({ w: 'fill', gap: 12 },
      IconBox('building', { size: 42, radius: 12 }),
      Col({ w: 'fill', gap: 0 }, Txt('شركة الأمل للنقل', { style: 'Heading/H3 16' }), Txt('فان توصيل 45817 · السائق فادي', { style: 'Body/Small 12', color: 'text/muted' })),
      Badge('success', 'سائق مصرّح')),
    Row({ w: 'fill', main: 'between' }, Txt('الحد المتبقي هذا الشهر', { style: 'Body/Small 12', color: 'text/secondary' }), Money(remaining, { style: 'Number/M 18' })),
    Box({ w: 330, h: 8, radius: 999, fill: 'surface/muted' }, Rect({ w: usedW, h: 8, x: 330 - usedW, y: 0, radius: 999, fill: 'status/warning' })));
}

function S8_CreditSale() {
  return Mobile('S8 · بيع آجل لشركة', [
    WorkerHeader({ chips: [['clock', 'المناوبة مفتوحة · 05:02'], ['fuel', 'المضخة 3 · بنزين 95']] }),
    Body([
      Row({ w: 'fill', main: 'between' }, Txt('بيع آجل لشركة', { style: 'Heading/H1 24' }), Badge('primary', 'دون دفع الآن')),
      Row({ name: 'Search', w: 'fill', h: 48, pad: [0, 6, 0, 12], gap: 8, radius: 14, fill: 'surface/card', stroke: 'border/strong' },
        Ico('search', { size: 20, color: 'text/muted' }), Txt('45817', { style: 'Body/Large 16', w: 'fill' }),
        Row({ h: 36, pad: [0, 12], gap: 6, radius: 10, fill: 'brand/primary', main: 'center' }, Ico('scan', { size: 16, color: 'text/on-dark' }), Txt('مسح QR', { style: 'Label/12', color: 'text/on-dark' }))),
      CompanyCard('26,000', 277),
      Row({ w: 'fill', gap: 10 },
        Inst('Input', { size: 'lg', state: 'default' }, { Label: 'عداد السيارة', Value: '84,960', Suffix: 'كم', Helper: 'السابق 84,512' }, { w: 'fill' }),
        Inst('Input', { size: 'lg', state: 'focus' }, { Label: 'الكمية', Value: '160', Suffix: 'لتر', Helper: '= 20,000 ل.س' }, { w: 'fill' })),
      Row({ w: 'fill', pad: 12, gap: 10, radius: 12, fill: 'brand/primary-50' },
        Ico('fileText', { size: 18, color: 'brand/primary' }), Txt('تُضاف العملية فوراً إلى كشف الشركة الشهري، ويبقى 6,000 ل.س من الحد.', { style: 'Body/Small 12', color: 'brand/primary', w: 'fill' }))
    ]),
    BottomBar([Btn('action', 'اعتماد العملية', 'check', { size: 'lg', w: 'fill' })])
  ]);
}

function S9_OverLimit() {
  return Mobile('S9 · تجاوز الحد وطلب موافقة', [
    WorkerHeader({ chips: [['clock', 'المناوبة مفتوحة · 05:06'], ['fuel', 'المضخة 3 · بنزين 95']] }),
    Body([
      CompanyCard('26,000', 277),
      Inst('Input', { size: 'lg', state: 'error' }, { Label: 'الكمية المطلوبة', Value: '300', Suffix: 'لتر', Helper: '= 37,500 ل.س · أكثر من المتبقي بـ 11,500' }, { w: 'fill' }),
      Inst('Alert Banner', { tone: 'danger' }, { Title: 'العملية تتجاوز الحد المتبقي', Body: 'لن تُرفض بصمت: اختر تعبئة الممكن الآن أو اطلب موافقة المدير.', '!Action': true }, { w: 'fill' }),
      Col({ name: 'Say to driver', w: 'fill', pad: 14, gap: 6, radius: 14, fill: 'surface/muted' },
        Row({ gap: 6 }, Ico('message', { size: 16, color: 'text/secondary' }), Txt('قل للسائق', { style: 'Label/12', color: 'text/secondary' })),
        Txt('«رصيد الشركة يكفي 208 لترات الآن. أعبّيها لك، أو أطلب موافقة المدير على الكمية كاملة.»', { style: 'Body/Strong 14', w: 'fill' }))
    ]),
    BottomBar([Btn('secondary', 'تعبئة 208 لترات فقط', null, { w: 'fill' }), Btn('primary', 'طلب موافقة المدير', 'share', { size: 'lg', w: 'fill' })])
  ]);
}

function L3_CustomerOtp() {
  const boxes = ['4', '8', '2', '7', '', ''].map(function (d, i) {
    const active = i === 4;
    return Row({ name: 'OTP ' + (i + 1), w: 46, h: 56, radius: 12, fill: 'surface/card', stroke: active ? 'brand/primary' : 'border/strong', strokeW: active ? 2 : 1, main: 'center', cross: 'center' },
      d ? Txt(d, { style: 'Number/L 24' }) : (active ? Rect({ w: 2, h: 24, fill: 'brand/primary' }) : null));
  });
  return Mobile('L3 · دخول الزبون (OTP)', [
    StatusBar(false),
    Col({ name: 'Content', w: 'fill', h: 'fill', pad: [8, 24, 28, 24], gap: 20 },
      Row({ w: 'fill', main: 'between' }, IconBtn('arrowRight', { radius: 999 }), LinkText('تصفّح المحطات دون حساب')),
      Row({ gap: 10 }, Row({ w: 44, h: 44, radius: 12, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 22, color: 'brand/dark' })), Txt('FuelOS', { style: 'Heading/H2 20' })),
      Col({ w: 'fill', gap: 6 },
        Txt('أدخل رمز التحقق', { style: 'Display/32' }),
        Txt('أرسلنا رمزاً من 6 أرقام إلى رقمك المنتهي بـ 678', { style: 'Body/Large 16', color: 'text/secondary', w: 'fill' })),
      Row({ name: 'OTP', w: 'fill', gap: 8, main: 'center' }, boxes.slice().reverse()),
      Row({ w: 'fill', main: 'between' }, Txt('إعادة الإرسال بعد 00:42', { style: 'Body/Small 12', color: 'text/muted' }), LinkText('تغيير الرقم')),
      Col({ name: 'Why account', w: 'fill', pad: 16, gap: 8, radius: 16, fill: 'brand/primary-50' },
        Txt('لماذا حساب؟', { style: 'Body/Strong 14', color: 'brand/primary' }),
        Bullets(['كل فواتير التعبئة في مكان واحد', 'نقاط ولاء من الفواتير المؤكدة فقط', 'مصروف سيارتك الشهري بلغة بسيطة'], { style: 'Body/Small 12' })),
      VSpacer(),
      Btn('primary', 'تأكيد', null, { size: 'lg', w: 'fill' }),
      Txt('بالمتابعة توافق على الشروط وسياسة الخصوصية', { style: 'Body/Small 12', color: 'text/muted', w: 'fill', align: 'center' }))
  ]);
}

function RewardsHeader(active) {
  return [
    StatusBar(false),
    Row({ w: 'fill', pad: [4, 16, 8, 16], gap: 10 }, IconBtn('arrowRight', { radius: 999 }), Txt('المكافآت والشكاوى', { style: 'Heading/H2 20' })),
    Col({ w: 'fill', pad: [0, 16, 8, 16] }, Inst('Segmented Control', { active: active }, { 'Option 1': 'مكافآتي', 'Option 2': 'شكاواي' }, { w: 'fill' }))
  ];
}

function C6_Rewards() {
  function offer(title, sub, tone, st, muted) {
    return Row({ name: 'Offer · ' + title, w: 'fill', pad: 14, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default', opacity: muted ? 0.55 : 1 },
      IconBox('tag', { size: 40, radius: 12, bg: muted ? 'surface/muted' : 'status/warning-50', fg: muted ? 'text/muted' : 'status/warning-700' }),
      Col({ w: 'fill', gap: 2 }, Txt(title, { style: 'Body/Strong 14', w: 'fill' }), Txt(sub, { style: 'Body/Small 12', color: 'text/muted' })),
      Badge(tone, st));
  }
  return Mobile('C6 · مكافآتي والعروض', [
    RewardsHeader('1'),
    Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: [8, 16, 16, 16], gap: 14, clip: true },
      Col({ name: 'Points', w: 'fill', pad: 18, gap: 10, radius: 20, fill: 'brand/dark' },
        Row({ w: 'fill', main: 'between' }, Txt('رصيد نقاطك', { style: 'Label/12', color: 'text/on-dark-muted' }), Ico('gift', { size: 20, color: 'brand/action' })),
        Row({ gap: 6, cross: 'end' }, Txt('1,240', { style: 'Number/XL 32', color: 'text/on-dark' }), Txt('نقطة', { style: 'Body/Strong 14', color: 'text/on-dark-muted' })),
        Txt('تساوي تقريباً 6,200 ل.س خصماً على الوقود أو الخدمات', { style: 'Body/Small 12', color: 'text/on-dark-muted', w: 'fill' }),
        Box({ w: 322, h: 8, radius: 999, fill: 'brand/dark-700' }, Rect({ w: 267, h: 8, x: 55, y: 0, radius: 999, fill: 'brand/action' })),
        Txt('باقي 260 نقطة لغسيل سيارة مجاني', { style: 'Label/12', color: 'brand/action' })),
      Row({ w: 'fill', pad: 12, gap: 8, radius: 12, fill: 'status/info-50', cross: 'start' }, Ico('info', { size: 16, color: 'status/info-700' }), Txt('تُضاف النقاط فقط من الفواتير المؤكدة من المحطة — 1 نقطة لكل 250 ل.س.', { style: 'Body/Small 12', color: 'status/info-700', w: 'fill' })),
      Row({ w: 'fill', main: 'between' }, Txt('عروض المحطات القريبة', { style: 'Heading/H3 16' }), LinkText('الكل')),
      offer('غسيل مجاني عند تعبئة 50 لتراً', 'محطة النور · ينتهي 30 سبتمبر', 'primary', 'فعّال'),
      Col({ name: 'Coupon', w: 'fill', pad: 14, gap: 10, radius: 16, fill: 'surface/card', stroke: 'brand/action', dash: true },
        Row({ w: 'fill', main: 'between' }, Txt('خصم 10% على تغيير الزيت', { style: 'Body/Strong 14' }), Badge('success', 'متاح لك')),
        Row({ w: 'fill', gap: 10 },
          Row({ w: 'fill', h: 40, radius: 10, fill: 'surface/page', main: 'center' }, Txt('NOOR-10', { style: 'Number/M 18', color: 'brand/primary' })),
          Btn('secondary', 'نسخ', 'fileText'))),
      offer('خصم 3 ل.س لكل لتر يوم الجمعة', 'محطة الربيع · انتهى 20 سبتمبر', 'neutral', 'منتهٍ', true),
      Btn('primary', 'استبدال 1,000 نقطة بخصم 5,000 ل.س', null, { w: 'fill' })),
    Inst('Tab Bar', { active: 'home' }, {}, { w: 'fill' })
  ]);
}

function C7_Complaints() {
  function steps(cur) {
    const labels = ['أُرسلت', 'قيد الرد', 'تم الحل'];
    return Row({ w: 'fill', gap: 6 }, labels.map(function (l, i) {
      const done = i < cur, now = i === cur;
      return Row({ w: 'fill', gap: 6 }, Dot(10, done ? 'brand/action' : (now ? 'status/warning' : 'border/strong')), Txt(l, { style: 'Label/11', color: now ? 'text/primary' : 'text/muted' }));
    }));
  }
  function complaint(title, meta, tone, st, cur, extra) {
    return Col({ name: 'Complaint · ' + title, w: 'fill', pad: 14, gap: 10, radius: 16, fill: 'surface/card', stroke: 'border/default' },
      Row({ w: 'fill', main: 'between' }, Txt(title, { style: 'Heading/H3 16' }), Badge(tone, st)),
      Txt(meta, { style: 'Body/Small 12', color: 'text/muted', w: 'fill' }),
      cur !== null ? steps(cur) : null,
      extra);
  }
  return Mobile('C7 · شكاواي', [
    RewardsHeader('2'),
    Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: [8, 16, 16, 16], gap: 12, clip: true },
      Row({ w: 'fill', main: 'between' }, Txt('3 شكاوى', { style: 'Heading/H3 16' }), Btn('primary', 'شكوى جديدة', 'plus')),
      complaint('خصم لم يُطبَّق', 'محطة النور · فاتورة INV-10477 · 21 سبتمبر', 'warning', 'قيد الرد', 1,
        Col({ w: 'fill', pad: 12, gap: 4, radius: 12, fill: 'surface/muted' },
          Txt('محطة النور', { style: 'Label/12', color: 'brand/primary' }),
          Txt('سنصدر فاتورة مصحّحة بالخصم اليوم. شكراً لتنبيهك.', { style: 'Body/Regular 14', w: 'fill' }),
          Txt('منذ ساعة', { style: 'Label/11', color: 'text/muted' }))),
      complaint('سعر الديزل غير مطابق', 'محطة الربيع · بلاغ سعر · 18 سبتمبر', 'success', 'تم الحل', 3,
        Col({ w: 'fill', gap: 8 },
          Row({ w: 'fill', pad: 10, gap: 8, radius: 10, fill: 'brand/action-50' }, Ico('checkCircle', { size: 16, color: 'brand/action-700' }), Txt('حدّثت المحطة السعر إلى 96 ل.س', { style: 'Body/Small 12', color: 'brand/action-700', w: 'fill' })),
          Row({ w: 'fill', main: 'between' }, Txt('قيّم الحل', { style: 'Label/12', color: 'text/secondary' }),
            Row({ gap: 4 }, [1, 2, 3, 4, 5].map(function (i) { return Ico('star', { size: 18, color: i <= 4 ? 'status/warning' : 'border/strong' }); }))))),
      complaint('تأخير في الخدمة', 'محطة النور · 23 سبتمبر', 'info', 'مصعّدة للمنصة', null,
        Txt('لم تردّ المحطة خلال 48 ساعة، فانتقلت الشكوى لفريق المنصة وسيتواصلون معك.', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }))),
    Inst('Tab Bar', { active: 'home' }, {}, { w: 'fill' })
  ]);
}

const STAFF_MORE = [S8_CreditSale, S9_OverLimit];
const CUSTOMER_MORE = [C6_Rewards, C7_Complaints];
