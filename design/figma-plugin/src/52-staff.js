// ============================================================
// Station worker screens (mobile 390x844)
// ============================================================

function Body(kids, p) { return Col(Object.assign({ name: 'Body', w: 'fill', h: 'fill', pad: 16, gap: 16, clip: true }, p || {}), kids); }
function Label(t, p) { return Txt(t, Object.assign({ style: 'Label/12', color: 'text/secondary' }, p || {})); }

function S1_ShiftStart() {
  function pumpTile(n, fuel, st, sel, busy) {
    return Col({ name: 'Pump ' + n, w: 'fill', h: 78, pad: 10, gap: 2, radius: 14, fill: sel ? 'brand/primary-50' : (busy ? 'surface/muted' : 'surface/card'), stroke: sel ? 'brand/primary' : 'border/default', strokeW: sel ? 2 : 1 },
      Row({ w: 'fill', main: 'between' }, Txt('مضخة ' + n, { style: 'Body/Strong 14', color: busy ? 'text/muted' : 'text/primary' }), sel ? Row({ w: 18, h: 18, radius: 999, fill: 'brand/primary', main: 'center', cross: 'center' }, Ico('check', { size: 12, color: 'text/on-dark' })) : Dot(8, busy ? 'status/warning' : 'brand/action')),
      Txt(fuel, { style: 'Body/Small 12', color: 'text/secondary' }),
      Txt(st, { style: 'Label/11', color: busy ? 'status/warning-700' : 'brand/action-700' }));
  }
  return Mobile('S1 · بداية المناوبة', [
    WorkerHeader({ sub: 'محطة النور · الخميس 24 سبتمبر · 06:00' }),
    Body([
      Col({ gap: 2 }, Txt('بداية المناوبة', { style: 'Heading/H1 24' }), Txt('ثلاث خطوات: المضخة، القراءة، الصندوق', { style: 'Body/Regular 14', color: 'text/secondary' })),
      Col({ w: 'fill', gap: 8 },
        Label('1. اختر المضخة'),
        Row({ w: 'fill', gap: 8 }, pumpTile(1, 'بنزين 90', 'متاحة'), pumpTile(2, 'بنزين 90', 'مع يوسف', false, true), pumpTile(3, 'بنزين 95', 'متاحة', true)),
        Row({ w: 'fill', gap: 8 }, pumpTile(4, 'ديزل', 'مع علي', false, true), pumpTile(5, 'بنزين 95', 'متاحة'), pumpTile(6, 'ديزل', 'متاحة'))),
      Inst('Input', { size: 'lg', state: 'focus' }, { Label: '2. القراءة الافتتاحية لعداد المضخة 3', Value: '184,220.5', Suffix: 'لتر', Helper: 'آخر قراءة إغلاق مسجلة: 184,220.5 — مطابقة' }, { w: 'fill' }),
      Row({ name: 'Photo', w: 'fill', pad: 12, gap: 12, radius: 14, fill: 'surface/card', stroke: 'border/default' },
        Row({ w: 52, h: 52, radius: 10, fill: 'brand/dark', main: 'center', cross: 'center' }, Ico('camera', { size: 22, color: 'text/on-dark' })),
        Col({ w: 'fill', gap: 0 }, Txt('صورة العداد', { style: 'Body/Strong 14' }), Txt('تثبت القراءة عند المراجعة', { style: 'Body/Small 12', color: 'text/muted' })),
        Badge('success', 'تم الالتقاط')),
      Row({ name: 'Cash box', w: 'fill', pad: 12, gap: 12, radius: 14, fill: 'surface/card', stroke: 'border/default' },
        Row({ w: 24, h: 24, radius: 6, fill: 'brand/primary', main: 'center', cross: 'center' }, Ico('check', { size: 16, color: 'text/on-dark' })),
        Col({ w: 'fill', gap: 0 }, Txt('3. استلمت صندوق البداية', { style: 'Body/Strong 14' }), Txt('50,000 ل.س من مناوبة محمد خليل', { style: 'Body/Small 12', color: 'text/muted' })),
        Ico('cash', { size: 22, color: 'text/secondary' }))
    ]),
    BottomBar([Btn('action', 'ابدأ المناوبة', 'check', { size: 'lg', w: 'fill' })])
  ]);
}

function S2_QuickFill() {
  function quick(t, on) { return Row({ w: 'fill', h: 40, radius: 12, fill: on ? 'brand/primary-50' : 'surface/card', stroke: on ? 'brand/primary' : 'border/default', main: 'center' }, Txt(t, { style: 'Body/Strong 14', color: on ? 'brand/primary' : 'text/primary' })); }
  function payOpt(label, icon, on) { return Inst('Payment Option', { state: on ? 'selected' : 'default' }, { Label: label, '^Icon': { icon: icon, color: on ? 'brand/primary' : 'text/secondary' } }, { w: 'fill' }); }
  return Mobile('S2 · تعبئة سريعة', [
    WorkerHeader({ chips: [['clock', 'المناوبة مفتوحة · 04:12'], ['fuel', 'المضخة 3 · بنزين 95']] }),
    Body([
      Inst('Segmented Control', { active: '2' }, { 'Option 1': 'باللتر', 'Option 2': 'بالمبلغ' }, { w: 'fill' }),
      Col({ name: 'Amount', w: 'fill', pad: 16, gap: 6, radius: 18, fill: 'surface/card', stroke: 'brand/primary', strokeW: 2 },
        Row({ w: 'fill', main: 'between' }, Label('المبلغ المدفوع'), Txt('مسح', { style: 'Label/12', color: 'status/danger-700' })),
        Row({ gap: 8, cross: 'end' }, Txt('5,000', { style: 'Number/Hero 44' }), Col({ pad: [0, 0, 8, 0] }, Txt('ل.س', { style: 'Heading/H3 16', color: 'text/muted' }))),
        Divider(),
        Row({ w: 'fill', main: 'between' },
          Txt('= 40.00 لتر', { style: 'Number/M 18', color: 'brand/primary' }),
          Row({ gap: 6 }, Ico('lock', { size: 14, color: 'text/muted' }), Txt('125 ل.س/لتر · سعر مقفل', { style: 'Body/Small 12', color: 'text/muted' })))),
      Row({ name: 'Quick amounts', w: 'fill', gap: 8 }, quick('2,000'), quick('5,000', true), quick('10,000'), quick('ملء كامل')),
      Col({ w: 'fill', gap: 8 },
        Label('طريقة الدفع'),
        Row({ w: 'fill', gap: 10 }, payOpt('نقدي', 'cash', true), payOpt('بطاقة', 'card')),
        Row({ w: 'fill', gap: 10 }, payOpt('آجل لشركة', 'building'), payOpt('قسيمة', 'ticket'))),
      Row({ name: 'Customer link', w: 'fill', pad: [12, 14], gap: 12, radius: 14, fill: 'surface/card', stroke: 'border/strong', dash: true },
        Ico('scan', { size: 22, color: 'brand/primary' }),
        Col({ w: 'fill', gap: 0 }, Txt('ربط زبون (اختياري)', { style: 'Body/Strong 14' }), Txt('فقط إن أراد فاتورة رقمية أو نقاطاً', { style: 'Body/Small 12', color: 'text/muted' })),
        Txt('مسح QR', { style: 'Label/12', color: 'brand/primary' }))
    ]),
    BottomBar([Btn('action', 'حفظ العملية', 'check', { size: 'lg', w: 'fill' })])
  ]);
}

function S3_Saved() {
  return Mobile('S3 · تم الحفظ (دون اتصال)', [
    WorkerHeader({ sync: 'offline', syncLabel: 'غير متصل', chips: [['clock', 'المناوبة مفتوحة · 04:13'], ['fuel', 'المضخة 3 · بنزين 95']] }),
    Body([
      Col({ w: 'fill', gap: 8, cross: 'center', pad: [8, 0, 0, 0] },
        Row({ w: 72, h: 72, radius: 999, fill: 'brand/action-50', main: 'center', cross: 'center' }, Ico('check', { size: 36, color: 'brand/action' })),
        Txt('تم حفظ العملية', { style: 'Heading/H1 24', align: 'center' }),
        Txt('رقم العملية A-10482 · 10:48', { style: 'Body/Regular 14', color: 'text/secondary', align: 'center' })),
      Inst('Alert Banner', { tone: 'warning' }, { Title: 'محفوظة على الجهاز', Body: 'ستُرسل تلقائياً عند عودة الاتصال · 3 عمليات بانتظار المزامنة', '!Action': true }, { w: 'fill' }),
      Col({ name: 'Receipt', w: 'fill', pad: 16, gap: 10, radius: 16, fill: 'surface/card', stroke: 'border/default' },
        KV('الوقود', 'بنزين 95'), KV('الكمية', '40.00 لتر'), KV('سعر اللتر', '125 ل.س'), KV('طريقة الدفع', 'نقدي'), KV('الزبون', 'غير مرتبط', { vColor: 'text/muted' }),
        Divider(),
        Row({ w: 'fill', main: 'between' }, Txt('الإجمالي', { style: 'Heading/H3 16' }), Money('5,000'))),
      Row({ w: 'fill', gap: 10 }, Btn('secondary', 'طباعة', 'printer', { w: 'fill' }), Btn('secondary', 'إرسال للزبون', 'share', { w: 'fill' }))
    ]),
    BottomBar([Btn('action', 'عملية جديدة', 'plus', { size: 'lg', w: 'fill' })])
  ]);
}

function CloseHeader(step) {
  return [
    WorkerHeader({ back: true, title: 'إغلاق المناوبة', sub: 'المضخة 3 · بنزين 95 · 06:00 – 14:05' }),
    Col({ name: 'Stepper band', w: 'fill', pad: [14, 16], fill: 'surface/card' }, Inst('Shift Closing Wizard', { step: String(step) }, {}, { w: 'fill' })),
    Rect({ w: 'fill', h: 1, fill: 'border/default' })
  ];
}

function S4_CloseReading() {
  return Mobile('S4 · إغلاق 1/3 القراءة النهائية', [
    CloseHeader(1),
    Body([
      Row({ w: 'fill', pad: [12, 14], radius: 14, fill: 'surface/card', stroke: 'border/default', main: 'between' },
        Col({ gap: 0 }, Label('القراءة الافتتاحية'), Txt('184,220.5 لتر', { style: 'Number/M 18' })),
        Txt('06:00 · صورة', { style: 'Body/Small 12', color: 'text/muted' })),
      Inst('Input', { size: 'lg', state: 'focus' }, { Label: 'القراءة النهائية للعداد', Value: '191,640.0', Suffix: 'لتر', Helper: 'يجب أن تكون أكبر من القراءة الافتتاحية' }, { w: 'fill' }),
      Col({ name: 'Computed', w: 'fill', pad: 16, gap: 10, radius: 16, fill: 'brand/primary-50' },
        Row({ gap: 6 }, Ico('refresh', { size: 14, color: 'brand/primary' }), Txt('يُحسب تلقائياً', { style: 'Label/12', color: 'brand/primary' })),
        Row({ w: 'fill', main: 'between' }, Txt('اللترات المباعة', { style: 'Body/Regular 14', color: 'text/secondary' }), Txt('7,419.5 لتر', { style: 'Number/M 18' })),
        Row({ w: 'fill', main: 'between' }, Txt('قيمة المبيعات', { style: 'Body/Regular 14', color: 'text/secondary' }), Money('927,438', { style: 'Number/M 18' }))),
      Row({ name: 'Photo', w: 'fill', pad: 12, gap: 12, radius: 14, fill: 'surface/card', stroke: 'border/strong', dash: true },
        Ico('camera', { size: 22, color: 'brand/primary' }),
        Col({ w: 'fill', gap: 0 }, Txt('صورة العداد النهائية', { style: 'Body/Strong 14' }), Txt('اختيارية — تسرّع الاعتماد', { style: 'Body/Small 12', color: 'text/muted' })),
        Txt('التقاط', { style: 'Label/12', color: 'brand/primary' }))
    ]),
    BottomBar([Btn('primary', 'التالي: النقد الفعلي', null, { size: 'lg', w: 'fill' })])
  ]);
}

function S5_CloseCash() {
  function line(label, v, sub) { return Row({ w: 'fill', main: 'between' }, Col({ gap: 0 }, Txt(label, { style: 'Body/Regular 14', color: 'text/secondary' }), sub ? Txt(sub, { style: 'Body/Small 12', color: 'text/muted' }) : null), Txt(v, { style: 'Body/Strong 14' })); }
  return Mobile('S5 · إغلاق 2/3 النقد الفعلي', [
    CloseHeader(2),
    Body([
      Col({ name: 'Expected', w: 'fill', pad: 16, gap: 10, radius: 16, fill: 'surface/card', stroke: 'border/default' },
        line('إجمالي المبيعات', '927,438'),
        line('بطاقة', '- 180,000', '14 عملية'),
        line('آجل لشركات', '- 96,000', '3 عمليات'),
        line('قسائم', '- 12,000', 'عمليتان'),
        Divider(),
        Row({ w: 'fill', main: 'between' }, Txt('النقد المتوقع', { style: 'Heading/H3 16' }), Money('639,438', { style: 'Number/M 18' }))),
      Inst('Input', { size: 'lg', state: 'error' }, { Label: 'عدّ النقد في الصندوق وأدخله', Value: '634,938', Suffix: 'ل.س', Helper: 'فرق -4,500 ل.س عن المتوقع' }, { w: 'fill' }),
      Inst('Alert Banner', { tone: 'danger' }, { Title: 'الفرق أكبر من الحد المسموح (1,000 ل.س)', Body: 'ستحتاج لكتابة سبب في الخطوة التالية. يمكنك إعادة العد قبل المتابعة.', Action: 'إعادة العد' }, { w: 'fill' })
    ]),
    BottomBar([Btn('primary', 'التالي: المراجعة', null, { size: 'lg', w: 'fill' })])
  ]);
}

function S6_CloseReview() {
  return Mobile('S6 · إغلاق 3/3 المراجعة', [
    CloseHeader(3),
    Body([
      Col({ name: 'Summary', w: 'fill', pad: [12, 16], gap: 8, radius: 16, fill: 'surface/card', stroke: 'border/default' },
        KV('اللترات المباعة', '7,419.5 لتر'), KV('المبيعات', '927,438 ل.س'), KV('النقد المتوقع', '639,438 ل.س'), KV('النقد الفعلي', '634,938 ل.س'),
        Row({ w: 'fill', pad: [8, 10], radius: 10, fill: 'status/danger-50', main: 'between' }, Txt('فرق الصندوق', { style: 'Body/Strong 14', color: 'status/danger-700' }), Txt('-4,500 ل.س', { style: 'Number/M 18', color: 'status/danger-700' }))),
      Col({ name: 'Reason', w: 'fill', gap: 6 },
        Row({ gap: 6 }, Label('سبب الفرق'), Badge('danger', 'إلزامي')),
        Col({ w: 'fill', h: 76, pad: 12, radius: 14, fill: 'surface/card', stroke: 'brand/primary', strokeW: 2 },
          Txt('دفعة بطاقة بقيمة 4,500 سُجلت نقداً بالخطأ الساعة 11:20.', { style: 'Body/Regular 14', w: 'fill' })),
        Row({ gap: 8 }, Ico('camera', { size: 16, color: 'brand/action' }), Txt('صورة الصندوق مرفقة', { style: 'Body/Small 12', color: 'brand/action-700' }))),
      Inst('Alert Banner', { tone: 'warning' }, { Title: 'عملية معلّقة واحدة', Body: 'بيع آجل لشركة الأمل للنقل بانتظار موافقة المدير.', '!Action': true }, { w: 'fill' }),
      Row({ w: 'fill', gap: 8 }, Ico('lock', { size: 16, color: 'text/muted' }), Txt('بعد الإرسال لا يمكنك التعديل إلا بطلب فتح من المدير.', { style: 'Body/Small 12', color: 'text/muted', w: 'fill' }))
    ], { gap: 14 }),
    BottomBar([Btn('action', 'إرسال للاعتماد', 'check', { size: 'lg', w: 'fill' })])
  ]);
}

function S7_CloseDone() {
  return Mobile('S7 · تم إرسال الإغلاق', [
    WorkerHeader({ sub: 'محطة النور · المناوبة انتهت 14:05' }),
    Body([
      Col({ w: 'fill', gap: 10, cross: 'center', pad: [24, 0, 8, 0] },
        Row({ w: 88, h: 88, radius: 999, fill: 'brand/action-50', main: 'center', cross: 'center' }, Row({ w: 60, h: 60, radius: 999, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('check', { size: 32, color: 'brand/on-action' }))),
        Txt('تم إرسال الإغلاق', { style: 'Heading/H1 24', align: 'center' }),
        Badge('warning', 'بانتظار اعتماد خالد العمر')),
      Col({ name: 'Summary', w: 'fill', pad: 16, gap: 10, radius: 16, fill: 'surface/card', stroke: 'border/default' },
        KV('المضخة', '3 · بنزين 95'), KV('الوقت', '06:00 – 14:05'), KV('اللترات', '7,419.5 لتر'), KV('المبيعات', '927,438 ل.س'),
        KV('فرق الصندوق', '-4,500 ل.س', { vColor: 'status/danger-700' }),
        Row({ w: 'fill', gap: 6 }, Ico('checkCircle', { size: 14, color: 'brand/action' }), Txt('السبب والصورة مرفقان', { style: 'Body/Small 12', color: 'text/secondary' }))),
      Row({ w: 'fill', pad: 12, gap: 8, radius: 12, fill: 'surface/muted' }, Ico('lock', { size: 16, color: 'text/secondary' }), Txt('المناوبة مقفلة. أي تعديل يحتاج طلب فتح من المدير.', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }))
    ]),
    BottomBar([Btn('secondary', 'طباعة الملخص', 'printer', { w: 'fill' }), Btn('action', 'تم', null, { size: 'lg', w: 'fill' })])
  ]);
}

const STAFF_SCREENS = [S1_ShiftStart, S2_QuickFill, S3_Saved, S4_CloseReading, S5_CloseCash, S6_CloseReview, S7_CloseDone];
