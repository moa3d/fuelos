// ============================================================
// Platform admin screens (desktop 1440) — A1–A4
// ============================================================

function AdminDesktop(name, active, main, opt) {
  return Desktop(name, active, main, Object.assign({ sidebar: { nav: NAV_ADMIN, admin: true, user: ['رح', 'رهف حداد', 'أدمن المنصة'] } }, opt || {}));
}

function regionSvg(W, H) {
  let s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" fill="none" xmlns="http://www.w3.org/2000/svg">';
  s += '<rect width="' + W + '" height="' + H + '" rx="16" fill="#F1F5F9"/>';
  s += '<path d="M56 70 C 130 30, 245 40, 320 60 S 490 40, 550 90 C 585 150, 565 230, 525 270 S 395 310, 310 290 S 140 300, 85 250 S 28 120, 56 70 Z" fill="#E7F6F2" stroke="#0F766E" stroke-opacity="0.25" stroke-width="2"/>';
  s += '<path d="M110 160 C 205 150, 280 200, 395 170 S 505 150, 545 180" stroke="#CBD5E1" stroke-width="3" stroke-dasharray="6 6"/>';
  s += '<path d="M310 60 C 300 140, 330 220, 310 290" stroke="#CBD5E1" stroke-width="3" stroke-dasharray="6 6"/>';
  return s + '</svg>';
}

function A1_Platform() {
  function pin(x, y, label, n, tone) {
    return Row({ abs: true, x: x, y: y, h: 30, pad: [0, 10], gap: 6, radius: 999, fill: 'surface/card', shadow: 'Shadow/Raised' },
      Dot(10, TONES[tone].fg), Txt(label, { style: 'Label/12' }), Txt(n, { style: 'Label/12', color: 'text/muted' }));
  }
  function action(tone, station, issue, btn) {
    return Row({ w: 'fill', pad: [10, 0], gap: 12 },
      Dot(10, TONES[tone].fg),
      Col({ w: 'fill', gap: 0 }, Txt(station, { style: 'Body/Strong 14' }), Txt(issue, { style: 'Body/Small 12', color: 'text/secondary' })),
      Btn('secondary', btn));
  }
  return AdminDesktop('A1 · لوحة المنصة', 'a-dash', [
    PageHeader('لوحة المنصة', 'الخميس 24 سبتمبر · 38 محطة نشطة في 5 مناطق', [PeriodChips(3), Btn('secondary', 'تصدير', 'download')]),
    Row({ name: 'KPIs', w: 'fill', gap: 16 },
      Inst('Fuel KPI Card', { state: 'default' }, { Title: 'المحطات النشطة', Value: '38', Unit: 'محطة', Meta: '+4 هذا الشهر · 4 تجارب', '@Badge': { visible: false }, '^Icon': { icon: 'pin', color: 'brand/primary' } }, { w: 'fill' }),
      Inst('Fuel KPI Card', { state: 'default' }, { Title: 'المستخدمون', Value: '412', Unit: 'مستخدم', Meta: '286 عاملاً · 126 إدارياً', '@Badge': { visible: false }, '^Icon': { icon: 'users', color: 'brand/primary' } }, { w: 'fill' }),
      Inst('Fuel KPI Card', { state: 'default' }, { Title: 'الإيراد الشهري المتكرر', Value: '17.1M', Unit: 'ل.س', Meta: '+11% عن أغسطس', '@Badge': { visible: false }, '^Icon': { icon: 'trendUp', color: 'brand/primary' } }, { w: 'fill' }),
      Inst('Fuel KPI Card', { state: 'alert' }, { Title: 'تذاكر دعم مفتوحة', Value: '12', Unit: 'تذكرة', Meta: '2 عالية الأولوية', '@Badge': { comp: 'Status Badge', variant: { tone: 'danger' }, text: { Label: 'عاجل' } }, '^Icon': { icon: 'message', color: 'status/danger' }, '^TrendIcon': { icon: 'alert', color: 'status/danger' } }, { w: 'fill' })),
    Row({ name: 'Middle', w: 'fill', gap: 16, cross: 'start' },
      Card({ name: 'Map', gap: 12, h: 420 },
        CardHeader('خريطة المحطات', { icon: 'pin', right: Row({ gap: 12 }, Row({ gap: 6 }, Dot(8, 'brand/action'), Txt('سليمة', { style: 'Body/Small 12', color: 'text/secondary' })), Row({ gap: 6 }, Dot(8, 'status/warning'), Txt('تحتاج متابعة', { style: 'Body/Small 12', color: 'text/secondary' })), Row({ gap: 6 }, Dot(8, 'status/danger'), Txt('مشكلة', { style: 'Body/Small 12', color: 'text/secondary' }))) }),
        Box({ name: 'Map canvas', w: 'fill', h: 330, radius: 16, clip: true },
          Svg(regionSvg(604, 330), 604, 330, { x: 0, y: 0 }),
          pin(400, 70, 'الشمال', '9', 'success'), pin(120, 100, 'الساحل', '7', 'warning'), pin(280, 150, 'الوسط', '12', 'success'), pin(430, 210, 'الشرق', '4', 'danger'), pin(160, 230, 'الجنوب', '6', 'success'))),
      Card({ name: 'Needs action', w: 460, gap: 2, h: 420 },
        CardHeader('محطات تحتاج إجراء', { right: Badge('danger', '5') }),
        action('danger', 'محطة الربيع', 'لم تزامن منذ 3 أيام · 42 عملية معلّقة على أجهزتها', 'تواصل'), Divider(),
        action('warning', 'محطة الساحل', 'دفعة الاشتراك متأخرة 12 يوماً', 'تذكير'), Divider(),
        action('info', 'محطة الشمال', 'حساب صاحب المحطة لم يُفعَّل بعد', 'تفعيل'), Divider(),
        action('danger', 'محطة النور', 'تذكرة دعم عالية الأولوية #482', 'فتح'), Divider(),
        action('warning', 'محطة الوادي', 'الفترة التجريبية تنتهي خلال 3 أيام', 'عرض خطة'))),
    Row({ name: 'Bottom', w: 'fill', gap: 16, cross: 'start' },
      Card({ name: 'Growth', gap: 12 },
        CardHeader('نمو الإيراد المتكرر', { sub: 'بالمليون ل.س · آخر 6 أشهر' }),
        Row({ w: 'fill', gap: 24, cross: 'end' },
          Col({ gap: 6 }, Svg(barChartSvg(360, 90, [11.2, 12.4, 13.1, 14.6, 15.4, 17.1], 18, ['#CBD5E1', '#CBD5E1', '#CBD5E1', '#CBD5E1', '#CBD5E1', '#0F766E']), 360, 90, { name: 'MRR bars' }),
            Row({ w: 360, main: 'between' }, ['أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر'].map(function (m, i) { return Txt(m, { style: 'Label/11', color: i === 5 ? 'brand/primary' : 'text/muted', w: 56, align: 'center' }); }))),
          Col({ w: 'fill', gap: 10 }, KV('تجارب نشطة', '4'), KV('تحويل التجارب لمدفوعة', '68%'), KV('إلغاءات هذا الشهر', '1')))),
      Col({ name: 'Privacy', w: 460, pad: 20, gap: 10, radius: 16, fill: 'brand/primary-50' },
        Row({ gap: 8 }, Ico('shield', { size: 20, color: 'brand/primary' }), Txt('فصل الصحة التقنية عن المال', { style: 'Heading/H3 16', color: 'brand/primary' })),
        Txt('لا تظهر هنا تفاصيل مالية داخلية لأي محطة. الوصول لبيانات محطة يحتاج صلاحية محددة وسبباً مكتوباً، ويُسجَّل في سجل النشاط.', { style: 'Body/Regular 14', w: 'fill' }),
        Btn('secondary', 'طلب وصول مؤقت', 'lock')))
  ]);
}

function WizardSteps(labels, current) {
  const kids = [];
  labels.forEach(function (l, i) {
    const n = i + 1, done = n < current, now = n === current;
    kids.push(Row({ name: 'Step ' + n, gap: 8 },
      Row({ w: 32, h: 32, radius: 999, fill: done ? 'brand/action' : (now ? 'brand/primary' : 'surface/muted'), main: 'center', cross: 'center' },
        done ? Ico('check', { size: 16, color: 'brand/on-action' }) : Txt(String(n), { style: 'Body/Strong 14', color: now ? 'text/on-dark' : 'text/muted' })),
      Txt(l, { style: 'Body/Strong 14', color: now ? 'text/primary' : (done ? 'text/secondary' : 'text/muted') })));
    if (i < labels.length - 1) kids.push(Rect({ w: 'fill', h: 2, fill: done ? 'brand/action' : 'border/default' }));
  });
  return Row({ name: 'Wizard steps', w: 'fill', pad: [16, 20], gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default' }, kids);
}

function A2_Onboarding() {
  function pump(n, tank, nozzles, tone, st, err) {
    return [Txt('المضخة ' + n, { style: 'Body/Strong 14', w: 110 }),
      Row({ w: 'fill', h: 40, pad: [0, 12], radius: 10, fill: 'surface/card', stroke: err ? 'status/danger' : 'border/strong', strokeW: err ? 2 : 1 }, Txt(tank, { style: 'Body/Regular 14', color: err ? 'text/muted' : 'text/primary', w: 'fill' }), Ico('chevronDown', { size: 16, color: 'text/muted' })),
      Row({ w: 110, h: 40, pad: [0, 12], radius: 10, fill: 'surface/card', stroke: 'border/strong' }, Txt(nozzles, { style: 'Body/Regular 14', w: 'fill' })),
      Row({ w: 150 }, Badge(tone, st))];
  }
  function check(state, t) {
    const m = { done: ['brand/action', 'check'], warn: ['status/warning', 'alert'], todo: ['border/strong', null] }[state];
    return Row({ w: 'fill', pad: [8, 0], gap: 10 },
      Row({ w: 22, h: 22, radius: 999, fill: state === 'todo' ? null : m[0], stroke: state === 'todo' ? m[0] : null, strokeW: 2, main: 'center', cross: 'center' }, m[1] ? Ico(m[1], { size: 12, color: 'text/on-dark' }) : null),
      Txt(t, { style: 'Body/Regular 14', color: state === 'done' ? 'text/secondary' : 'text/primary', w: 'fill' }));
  }
  return AdminDesktop('A2 · انضمام محطة جديدة', 'a-onboard', [
    PageHeader('انضمام محطة جديدة', 'محطة الوادي · حُفظت كمسودة تلقائياً 14:20', [Btn('ghost', 'إلغاء'), Btn('secondary', 'حفظ كمسودة', 'download')]),
    WizardSteps(['بيانات المحطة', 'الخزانات', 'المضخات', 'المستخدمون', 'الخطة والمراجعة'], 3),
    Row({ name: 'Split', w: 'fill', gap: 20, cross: 'start' },
      Card({ name: 'Pumps', gap: 16 },
        Col({ gap: 2 }, Txt('المضخات وربطها بالخزانات', { style: 'Heading/H2 20' }), Txt('كل مضخة يجب أن ترتبط بخزان واحد ليُحسب المخزون من المبيعات تلقائياً.', { style: 'Body/Regular 14', color: 'text/secondary' })),
        Row({ gap: 8 }, Txt('قوالب جاهزة:', { style: 'Label/12', color: 'text/muted' }), Chip('محطة صغيرة · 4 مضخات', true, { h: 32 }), Chip('متوسطة · 6', false, { h: 32 }), Chip('كبيرة · 10', false, { h: 32 })),
        Table([{ t: 'المضخة', w: 110 }, { t: 'الخزان ونوع الوقود', w: 'fill' }, { t: 'عدد المسدسات', w: 110 }, { t: 'الحالة', w: 150 }], [
          pump(1, 'خزان 1 · بنزين 90', '2', 'success', 'جاهزة'),
          pump(2, 'خزان 1 · بنزين 90', '2', 'success', 'جاهزة'),
          pump(3, 'خزان 3 · بنزين 95', '2', 'success', 'جاهزة'),
          pump(4, '— اختر خزاناً —', '2', 'danger', 'مضخة بلا خزان', true)
        ], { rowPad: 10 }),
        Btn('ghost', 'إضافة مضخة', 'plus'),
        Divider(),
        Row({ w: 'fill', main: 'between' },
          Btn('secondary', 'السابق: الخزانات', 'arrowRight'),
          Row({ gap: 10 }, Txt('اربط المضخة 4 بخزان للمتابعة', { style: 'Body/Small 12', color: 'status/danger-700' }), Btn('primary', 'التالي: المستخدمون', 'chevronLeft')))),
      Card({ name: 'Readiness', w: 380, gap: 6 },
        CardHeader('جاهزية أول يوم تشغيل', { icon: 'checkCircle' }),
        Row({ w: 'fill', main: 'between' }, Txt('اكتمل 2 من 7', { style: 'Body/Small 12', color: 'text/secondary' }), Txt('29%', { style: 'Body/Strong 14', color: 'brand/primary' })),
        Box({ w: 340, h: 8, radius: 999, fill: 'surface/muted' }, Rect({ w: 98, h: 8, x: 242, y: 0, radius: 999, fill: 'brand/action' })),
        check('done', 'بيانات المحطة والعنوان وساعات العمل'),
        check('done', '3 خزانات بأنواع الوقود والسعات'),
        check('warn', '4 مضخات — واحدة بلا خزان'),
        check('todo', 'دعوة صاحب المحطة (مطلوب)'),
        check('todo', 'دعوة العمال وتعيين أرقام PIN'),
        check('todo', 'اختيار الخطة أو بدء تجربة 14 يوماً'),
        check('todo', 'اختبار إدخال أول مناوبة'),
        Row({ w: 'fill', pad: 12, gap: 8, radius: 10, fill: 'brand/primary-50', cross: 'start' }, Ico('clock', { size: 16, color: 'brand/primary' }), Txt('الهدف: محطة تعمل خلال جلسة واحدة (أقل من 30 دقيقة) دون فريق تقني.', { style: 'Body/Small 12', color: 'brand/primary', w: 'fill' }))))
  ]);
}

function A3_Plans() {
  function stat(label, v, sub, tone) {
    return Col({ w: 'fill', pad: 16, gap: 2, radius: 14, fill: tone === 'danger' ? 'status/danger-50' : 'surface/card', stroke: tone === 'danger' ? 'status/danger' : 'border/default', strokeOpacity: tone === 'danger' ? 0.4 : 1 },
      Txt(label, { style: 'Body/Small 12', color: 'text/muted' }), Txt(v, { style: 'Number/L 24', color: tone === 'danger' ? 'status/danger-700' : 'text/primary' }), Txt(sub, { style: 'Body/Small 12', color: 'text/secondary' }));
  }
  function feat(t, on) { return Row({ w: 'fill', gap: 8 }, Ico(on ? 'check' : 'x', { size: 16, color: on ? 'brand/action' : 'text/muted' }), Txt(t, { style: 'Body/Regular 14', color: on ? 'text/primary' : 'text/muted', w: 'fill' })); }
  function plan(name, price, unit, pitch, feats, limits, count, hot) {
    return Col({ name: 'Plan · ' + name, w: 'fill', pad: 20, gap: 10, radius: 18, fill: hot ? 'brand/dark' : 'surface/card', stroke: hot ? null : 'border/default', shadow: 'Shadow/Card' },
      Row({ w: 'fill', main: 'between' }, Txt(name, { style: 'Heading/H2 20', color: hot ? 'text/on-dark' : 'text/primary' }), hot ? Badge('success', 'الأكثر طلباً') : null),
      Txt(pitch, { style: 'Body/Small 12', color: hot ? 'text/on-dark-muted' : 'text/secondary', w: 'fill' }),
      Row({ gap: 6, cross: 'end' }, Txt(price, { style: 'Number/XL 32', color: hot ? 'text/on-dark' : 'text/primary' }), Txt(unit, { style: 'Body/Small 12', color: hot ? 'text/on-dark-muted' : 'text/muted' })),
      Col({ w: 'fill', gap: 6, pad: 12, radius: 12, fill: 'surface/card' }, feats.map(function (f) { return feat(f[0], f[1]); })),
      Row({ w: 'fill', main: 'between' }, Txt(limits, { style: 'Body/Small 12', color: hot ? 'text/on-dark-muted' : 'text/secondary' }), Txt(count, { style: 'Label/12', color: hot ? 'brand/action' : 'brand/primary' })));
  }
  function sub(st, planName, tone, status, renew, act) {
    return [Txt(st, { style: 'Body/Strong 14', w: 'fill' }), Txt(planName, { style: 'Body/Regular 14', w: 160 }), Row({ w: 180 }, Badge(tone, status)), Txt(renew, { style: 'Body/Small 12', color: 'text/secondary', w: 110 }), Row({ w: 170 }, act ? Btn('secondary', act) : Txt('—', { style: 'Body/Small 12', color: 'text/muted' }))];
  }
  const F = ['المخزون والمناوبات والصندوق', 'فواتير رقمية وتطبيق الزبون', 'حسابات الشركات والسائقين', 'التقارير المتقدمة ولوحة الفروع'];
  return AdminDesktop('A3 · الاشتراكات والباقات', 'a-plans', [
    PageHeader('الاشتراكات والباقات', 'كل باقة مرتبطة بقيمة تجارية واضحة، لا بميزات تقنية فقط', [Btn('secondary', 'فواتير المنصة', 'receipt'), Btn('primary', 'منح فترة تجريبية', 'gift')]),
    Row({ w: 'fill', gap: 16 },
      stat('الإيراد الشهري المتكرر', '17,100,000 ل.س', '+11% عن أغسطس'), stat('محطات مدفوعة', '34', 'من 38 محطة نشطة'), stat('تجارب نشطة', '4', 'تنتهي إحداها خلال 3 أيام'), stat('متأخرة في الدفع', '2', 'إيقاف تدريجي للميزات غير المدفوعة', 'danger')),
    Row({ name: 'Plans', w: 'fill', gap: 16, cross: 'start' },
      plan('أساسية', '350,000', 'ل.س / شهرياً', 'لمحطة واحدة تبدأ الضبط المالي', [[F[0], true], [F[1], true], [F[2], false], [F[3], false]], 'محطة واحدة · 5 مستخدمين', '14 محطة'),
      plan('احترافية', '650,000', 'ل.س / شهرياً', 'للمحطات التي تبيع بالآجل للشركات', [[F[0], true], [F[1], true], [F[2], true], [F[3], false]], 'محطة واحدة · 15 مستخدماً', '17 محطة', true),
      plan('شبكة محطات', '550,000', 'ل.س / لكل محطة', 'لأصحاب عدة فروع وشركات أساطيل', [[F[0], true], [F[1], true], [F[2], true], [F[3], true]], 'حتى 10 محطات · مستخدمون بلا حد', '7 محطات')),
    Card({ name: 'Subscriptions', pad: [16, 8, 8, 8], gap: 8 },
      Row({ w: 'fill', pad: [0, 8] }, CardHeader('اشتراكات المحطات', { right: Row({ gap: 8 }, Chip('الكل', true, { h: 30 }), Chip('تحتاج إجراء (3)', false, { h: 30 })) })),
      Table([{ t: 'المحطة', w: 'fill' }, { t: 'الخطة', w: 160 }, { t: 'الحالة', w: 180 }, { t: 'التجديد', w: 110 }, { t: 'إجراء', w: 170 }], [
        sub('محطة النور', 'احترافية', 'success', 'نشطة', '1 أكتوبر'),
        sub('محطة الساحل', 'أساسية', 'danger', 'متأخرة 12 يوماً', '12 سبتمبر', 'تسجيل دفعة يدوية'),
        sub('محطة الوادي', 'تجربة', 'warning', 'تنتهي خلال 3 أيام', '27 سبتمبر', 'تحويل لخطة'),
        sub('محطة الربيع', 'أساسية (قديمة)', 'info', 'خطة قديمة', '5 أكتوبر', 'ترقية')
      ], { rowPad: 8 }))
  ]);
}

function A4_Audit() {
  function role(name, n, note, sel) {
    return Row({ w: 'fill', pad: 12, gap: 10, radius: 12, fill: sel ? 'brand/primary-50' : null, stroke: sel ? 'brand/primary' : null },
      IconBox('shield', { size: 32, radius: 9 }), Col({ w: 'fill', gap: 0 }, Txt(name, { style: 'Body/Strong 14' }), Txt(note, { style: 'Body/Small 12', color: 'text/muted' })), Txt(n, { style: 'Label/12', color: 'text/secondary' }));
  }
  function logRow(t, who, what, where, tone, sev) {
    return [Txt(t, { style: 'Body/Small 12', color: 'text/muted', w: 44 }), Col({ w: 'fill', gap: 0 }, Txt(what, { style: 'Body/Strong 14', w: 'fill' }), Txt(who + ' · ' + where, { style: 'Body/Small 12', color: 'text/muted' })), Row({ w: 104 }, Badge(tone, sev))];
  }
  function ticket(no, title, st, pr, tone, assignee) {
    return Col({ w: 'fill', pad: 12, gap: 6, radius: 12, fill: 'surface/card', stroke: tone === 'danger' ? 'status/danger' : 'border/default', strokeOpacity: tone === 'danger' ? 0.5 : 1 },
      Row({ w: 'fill', gap: 8, cross: 'start' }, Txt(no + ' · ' + title, { style: 'Body/Strong 14', w: 'fill' }), Badge(tone, pr)),
      Row({ w: 'fill', main: 'between' }, Txt(st, { style: 'Body/Small 12', color: 'text/muted' }), assignee ? Avatar(assignee, 24) : Btn('secondary', 'إسناد لي')));
  }
  return AdminDesktop('A4 · الصلاحيات والسجلات والدعم', 'a-audit', [
    PageHeader('الصلاحيات والسجلات والدعم', 'ثلاثة مراكز مترابطة: الأدوار، سجل نشاط لا يُحذف، وتذاكر الدعم', [Btn('secondary', 'تصدير السجل', 'download')]),
    Row({ name: 'Three', w: 'fill', gap: 16, cross: 'start' },
      Col({ w: 300, gap: 16 },
        Card({ name: 'Roles', gap: 4, pad: 14 },
          CardHeader('قوالب الأدوار', { right: LinkText('قالب جديد') }),
          role('صاحب محطة', '12', 'كل بيانات محطته وفروعه', true),
          role('محاسب', '9', 'قيود، تقارير، تسويات'),
          role('مدير وردية', '6', 'تسويات صغيرة، فتح مناوبة'),
          role('عامل تعبئة', '4', 'مناوبته وعملياته فقط'),
          role('أدمن دعم', '5', 'دون تفاصيل مالية')),
        Card({ name: 'Flags', gap: 10, pad: 14 },
          CardHeader('ميزات تجريبية', { icon: 'layers' }),
          Row({ w: 'fill', gap: 10 }, Col({ w: 'fill', gap: 2 }, Txt('التقارير المتقدمة', { style: 'Body/Strong 14' }), Row({ gap: 6 }, Badge('warning', 'غير مستقرة'), Txt('3 محطات', { style: 'Body/Small 12', color: 'text/muted' }))), Toggle(true)),
          Divider(),
          Row({ w: 'fill', gap: 10 }, Col({ w: 'fill', gap: 2 }, Txt('الدفع عبر المحفظة', { style: 'Body/Strong 14' }), Txt('متوقفة', { style: 'Body/Small 12', color: 'text/muted' })), Toggle(false)))),
      Card({ name: 'Audit log', gap: 10 },
        CardHeader('سجل النشاط', { icon: 'history', right: Row({ gap: 8 }, Chip('الكل', true, { h: 30 }), Chip('مالي حساس', false, { h: 30 }), Chip('أمني', false, { h: 30 })) }),
        Table([{ t: 'الوقت', w: 44 }, { t: 'الحدث', w: 'fill' }, { t: 'النوع', w: 104 }], [
          logRow('14:32', 'خالد العمر', 'اعتماد فرق صندوق 4,500 ل.س', 'محطة النور', 'warning', 'مالي حساس'),
          logRow('13:05', 'رهف (أدمن)', 'وصول مؤقت لبيانات محطة الساحل — السبب: تذكرة #482', 'محطة الساحل', 'info', 'وصول'),
          logRow('11:48', 'جهاز غير معروف', '5 محاولات دخول فاشلة لحساب المدير', 'محطة الربيع', 'danger', 'أمني'),
          logRow('10:20', 'رنا عيسى', 'قيد يدوي: رواتب النصف الأول 630,000', 'محطة النور', 'warning', 'مالي حساس'),
          logRow('09:00', 'النظام', 'تفعيل «التقارير المتقدمة» لـ 3 محطات', 'المنصة', 'neutral', 'إعداد'),
          logRow('08:41', 'سامي مراد', 'تجميد مستخدم: عمر ملص', 'محطة النور', 'info', 'صلاحيات')
        ], { rowPad: 9 }),
        Row({ w: 'fill', pad: 12, gap: 8, radius: 10, fill: 'surface/muted' }, Ico('lock', { size: 16, color: 'text/secondary' }), Txt('السجل للقراءة فقط ولا يمكن حذفه أو تعديله من أي دور.', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }))),
      Col({ name: 'Support', w: 320, gap: 10 },
        Row({ w: 'fill', main: 'between' }, Txt('تذاكر الدعم', { style: 'Heading/H3 16' }), Badge('danger', '2 عاجلة')),
        ticket('#482', 'فواتير لا تظهر للزبائن', 'محطة الساحل · متأخرة 6 ساعات', 'عالية', 'danger', 'رح'),
        ticket('#475', 'مزامنة فاشلة', 'محطة الربيع · منذ 3 أيام', 'عالية', 'danger', null),
        ticket('#479', 'طلب تغيير الخطة', 'محطة النور · منذ يومين', 'متوسطة', 'warning', 'رح'),
        ticket('#471', 'سؤال عن الكشف', 'محطة الشمال · تم الرد', 'منخفضة', 'neutral', 'مع'),
        Row({ w: 'fill', pad: 12, gap: 8, radius: 10, fill: 'brand/primary-50', cross: 'start' }, Ico('info', { size: 16, color: 'brand/primary' }), Txt('كل تذكرة مرتبطة بمحطة وشاشة، ويمكن فتح وصول مؤقت منها بسبب مسجّل.', { style: 'Body/Small 12', color: 'brand/primary', w: 'fill' }))))
  ]);
}

const ADMIN_SCREENS = [A1_Platform, A2_Onboarding, A3_Plans, A4_Audit];
