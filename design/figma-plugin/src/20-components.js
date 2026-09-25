// ============================================================
// Components (the 6 from the spec + the ones the screens need)
// ============================================================

const TONES = {
  success: { bg: 'brand/action-50', fg: 'brand/action', text: 'brand/action-700', icon: 'checkCircle' },
  warning: { bg: 'status/warning-50', fg: 'status/warning', text: 'status/warning-700', icon: 'alert' },
  danger: { bg: 'status/danger-50', fg: 'status/danger', text: 'status/danger-700', icon: 'alert' },
  info: { bg: 'status/info-50', fg: 'status/info', text: 'status/info-700', icon: 'info' },
  neutral: { bg: 'surface/muted', fg: 'text/muted', text: 'text/secondary', icon: 'info' },
  primary: { bg: 'brand/primary-50', fg: 'brand/primary', text: 'brand/primary', icon: 'info' }
};

// Small helper used in many places: tinted square with an icon
function IconBox(icon, opt) {
  opt = opt || {};
  const size = opt.size || 36;
  return Row({ name: opt.name || 'IconBox', w: size, h: size, radius: opt.radius || 10, fill: opt.bg || 'brand/primary-50', main: 'center', cross: 'center' },
    Ico(icon, { name: opt.iconName || 'Icon', size: opt.iconSize || Math.round(size * 0.5), color: opt.fg || 'brand/primary' }));
}

const COMPONENT_DEFS = [
  // ---------- Button ----------
  {
    name: 'Button', group: 'أساسيات',
    description: 'زر عام. primary للإجراءات العامة، action للحفظ والاعتماد والدفع (لون الإجراء)، lg لواجهة العامل.',
    props: { type: ['primary', 'action', 'secondary', 'ghost', 'danger'], size: ['md', 'lg'] },
    defaults: { type: 'primary', size: 'md' },
    textProps: { Label: 'زر' },
    boolProps: { 'Show icon': { layer: 'Icon', default: false } },
    render: function (vp) {
      const map = {
        primary: { fill: 'brand/primary', text: 'text/on-dark' },
        action: { fill: 'brand/action', text: 'brand/on-action' },
        secondary: { fill: 'surface/card', text: 'text/primary', stroke: 'border/strong' },
        ghost: { fill: null, text: 'brand/primary' },
        danger: { fill: 'status/danger-50', text: 'status/danger-700' }
      }[vp.type];
      const lg = vp.size === 'lg';
      return Row({ name: 'Button', h: lg ? 56 : 40, pad: lg ? [0, 24] : [0, 16], gap: 8, radius: lg ? 14 : 10, fill: map.fill, stroke: map.stroke, main: 'center', cross: 'center' },
        Ico('plus', { name: 'Icon', size: lg ? 22 : 18, color: map.text }),
        Txt('زر', { name: 'Label', style: lg ? 'Button/Large 18' : 'Body/Strong 14', color: map.text }));
    }
  },
  // ---------- Status Badge ----------
  {
    name: 'Status Badge', group: 'أساسيات',
    description: 'وسم حالة صغير ملوّن: متوفر، محدود، متأخر، معتمد، معلق.',
    props: { tone: ['success', 'warning', 'danger', 'info', 'neutral', 'primary'] },
    defaults: { tone: 'success' },
    textProps: { Label: 'حالة' },
    render: function (vp) {
      const t = TONES[vp.tone];
      return Row({ name: 'Badge', h: 24, pad: [0, 10], gap: 6, radius: 999, fill: t.bg, cross: 'center' },
        Dot(6, t.fg, { name: 'Dot' }),
        Txt('حالة', { name: 'Label', style: 'Label/12', color: t.text }));
    }
  },
  // ---------- Sync indicator ----------
  {
    name: 'Sync Indicator', group: 'أساسيات',
    description: 'مؤشر الاتصال والمزامنة — ضروري لأن النظام يعمل دون أجهزة ويحفظ محلياً عند انقطاع الإنترنت.',
    props: { state: ['online', 'offline', 'syncing'] },
    defaults: { state: 'online' },
    textProps: { Label: 'متصل' },
    render: function (vp) {
      const m = { online: ['brand/action-50', 'brand/action-700', 'wifi'], offline: ['status/danger-50', 'status/danger-700', 'wifiOff'], syncing: ['status/warning-50', 'status/warning-700', 'refresh'] }[vp.state];
      return Row({ name: 'Sync', h: 26, pad: [0, 10], gap: 6, radius: 999, fill: m[0], cross: 'center' },
        Ico(m[2], { name: 'Icon', size: 14, color: m[1] }),
        Txt({ online: 'متصل', offline: 'غير متصل', syncing: 'جارٍ المزامنة' }[vp.state], { name: 'Label', style: 'Label/11', color: m[1] }));
    }
  },
  // ---------- Input ----------
  {
    name: 'Input', group: 'أساسيات',
    description: 'حقل إدخال. lg للأرقام الكبيرة في واجهة العامل (قراءات العداد، النقد).',
    props: { size: ['md', 'lg'], state: ['default', 'focus', 'error'] },
    defaults: { size: 'md', state: 'default' },
    textProps: { Label: 'العنوان', Value: 'القيمة', Suffix: 'لتر', Helper: 'نص مساعد' },
    setWidth: 760,
    render: function (vp) {
      const lg = vp.size === 'lg';
      const stroke = vp.state === 'focus' ? 'brand/primary' : (vp.state === 'error' ? 'status/danger' : 'border/strong');
      return Col({ name: 'Input', w: 340, gap: 6 },
        Txt('العنوان', { name: 'Label', style: 'Label/12', color: 'text/secondary' }),
        Row({ name: 'Field', w: 'fill', h: lg ? 64 : 44, pad: [0, 14], gap: 8, radius: lg ? 14 : 10, fill: 'surface/card', stroke: stroke, strokeW: vp.state === 'default' ? 1 : 2 },
          Txt('القيمة', { name: 'Value', style: lg ? 'Number/L 24' : 'Body/Large 16', w: 'fill' }),
          Txt('لتر', { name: 'Suffix', style: 'Body/Small 12', color: 'text/muted' })),
        Txt('نص مساعد', { name: 'Helper', style: 'Body/Small 12', color: vp.state === 'error' ? 'status/danger-700' : 'text/muted' }));
    }
  },
  // ---------- Segmented ----------
  {
    name: 'Segmented Control', group: 'أساسيات',
    description: 'مبدّل بخيارين، مثل: باللتر / بالمبلغ.',
    props: { active: ['1', '2'] },
    defaults: { active: '1' },
    textProps: { 'Option 1': 'باللتر', 'Option 2': 'بالمبلغ' },
    render: function (vp) {
      function seg(i) {
        const on = vp.active === String(i);
        return Row({ name: 'Segment ' + i, w: 'fill', h: 40, radius: 9, fill: on ? 'surface/card' : null, shadow: on ? 'Shadow/Card' : null, main: 'center', cross: 'center' },
          Txt(i === 1 ? 'باللتر' : 'بالمبلغ', { name: 'Option ' + i, style: 'Body/Strong 14', color: on ? 'text/primary' : 'text/secondary' }));
      }
      return Row({ name: 'Segmented', w: 358, pad: 4, gap: 4, radius: 12, fill: 'surface/muted' }, seg(1), seg(2));
    }
  },
  // ---------- Payment option ----------
  {
    name: 'Payment Option', group: 'أساسيات',
    description: 'خيار طريقة الدفع في شاشة التعبئة السريعة (نقدي، بطاقة، آجل، قسيمة).',
    props: { state: ['default', 'selected'] },
    defaults: { state: 'default' },
    textProps: { Label: 'نقدي' },
    render: function (vp) {
      const on = vp.state === 'selected';
      return Row({ name: 'Payment', w: 171, h: 60, pad: [0, 14], gap: 10, radius: 14, fill: on ? 'brand/primary-50' : 'surface/card', stroke: on ? 'brand/primary' : 'border/default', strokeW: on ? 2 : 1, cross: 'center' },
        Ico('cash', { name: 'Icon', size: 22, color: on ? 'brand/primary' : 'text/secondary' }),
        Txt('نقدي', { name: 'Label', style: 'Body/Strong 14', color: on ? 'brand/primary' : 'text/primary', w: 'fill' }),
        on ? Row({ name: 'Check', w: 20, h: 20, radius: 999, fill: 'brand/primary', main: 'center', cross: 'center' }, Ico('check', { size: 14, color: 'text/on-dark' })) : null);
    }
  },
  // ---------- Alert banner ----------
  {
    name: 'Alert Banner', group: 'أساسيات',
    description: 'تنبيه بلون الخطورة. في لوحة القيادة: أخطر معلومة أعلى الشاشة.',
    props: { tone: ['danger', 'warning', 'success', 'info'] },
    defaults: { tone: 'danger' },
    textProps: { Title: 'عنوان التنبيه', Body: 'وصف مختصر للتنبيه والإجراء المقترح', Action: 'مراجعة' },
    setWidth: 820,
    render: function (vp) {
      const t = TONES[vp.tone];
      return Row({ name: 'Alert', w: 360, pad: [12, 14], gap: 12, radius: 12, fill: t.bg, stroke: t.fg, strokeOpacity: 0.35, cross: 'start' },
        Row({ name: 'IconBox', w: 32, h: 32, radius: 8, fill: 'surface/card', main: 'center', cross: 'center' }, Ico(t.icon, { name: 'Icon', size: 18, color: t.fg })),
        Col({ name: 'Text', w: 'fill', gap: 2 },
          Txt('عنوان التنبيه', { name: 'Title', style: 'Body/Strong 14', color: t.text, w: 'fill' }),
          Txt('وصف مختصر للتنبيه والإجراء المقترح', { name: 'Body', style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })),
        Txt('مراجعة', { name: 'Action', style: 'Label/12', color: t.text }));
    }
  },
  // ---------- Fuel KPI Card ----------
  {
    name: 'Fuel KPI Card', group: 'مكوّنات الملف',
    description: 'بطاقة رقمية: عنوان، رقم كبير، مقارنة، وأيقونة حالة. تُستخدم للمبيعات والمخزون والديون والربح.',
    props: { state: ['default', 'alert'] },
    defaults: { state: 'default' },
    textProps: { Title: 'مبيعات اليوم', Value: '2,026,400', Unit: 'ل.س', Meta: '+8.2% عن أمس' },
    render: function (vp) {
      const alert = vp.state === 'alert';
      return Col({ name: 'KPI Card', w: 264, pad: 20, gap: 12, radius: 16, fill: 'surface/card', stroke: alert ? 'status/danger' : 'border/default', strokeOpacity: alert ? 0.5 : 1, shadow: 'Shadow/Card' },
        Row({ name: 'Header', w: 'fill', main: 'between' },
          Row({ gap: 10 }, IconBox('chart', { bg: alert ? 'status/danger-50' : 'brand/primary-50', fg: alert ? 'status/danger' : 'brand/primary' }),
            Txt('مبيعات اليوم', { name: 'Title', style: 'Body/Strong 14', color: 'text/secondary' })),
          Inst('Status Badge', { tone: 'info' }, { Label: 'تقديري' }, { name: 'Badge' })),
        Row({ name: 'Value row', gap: 6, cross: 'end' },
          Txt('2,026,400', { name: 'Value', style: 'Number/XL 32', color: alert ? 'status/danger-700' : 'text/primary' }),
          Txt('ل.س', { name: 'Unit', style: 'Body/Strong 14', color: 'text/muted' })),
        Row({ name: 'Meta row', gap: 6 },
          Ico('trendUp', { name: 'TrendIcon', size: 16, color: alert ? 'status/danger' : 'brand/action' }),
          Txt('+8.2% عن أمس', { name: 'Meta', style: 'Body/Small 12', color: 'text/secondary' })));
    }
  },
  // ---------- Tank Level Bar ----------
  {
    name: 'Tank Level Bar', group: 'مكوّنات الملف',
    description: 'شريط امتلاء أفقي مع السعة والكمية وآخر تحديث. النسبة تُختار من خاصية level.',
    props: { level: ['80', '60', '40', '20', '10'] },
    defaults: { level: '60' },
    textProps: { Fuel: 'بنزين 95', Tank: 'خزان 3 · سعة 20,000 لتر', Percent: '60%', Current: 'دفتري 12,000 لتر', Updated: 'آخر قياس 07:30' },
    setDir: 'V',
    render: function (vp) {
      const p = parseInt(vp.level, 10) / 100;
      const color = p <= 0.1 ? 'status/danger' : (p <= 0.2 ? 'status/warning' : 'brand/primary');
      const TW = 288;
      const fw = Math.round(TW * p);
      return Col({ name: 'Tank', w: 320, pad: 16, gap: 10, radius: 12, fill: 'surface/card', stroke: 'border/default' },
        Row({ name: 'Head', w: 'fill', main: 'between', cross: 'start' },
          Col({ gap: 0 },
            Txt('بنزين 95', { name: 'Fuel', style: 'Body/Strong 14' }),
            Txt('خزان 3 · سعة 20,000 لتر', { name: 'Tank', style: 'Body/Small 12', color: 'text/muted' })),
          Txt(vp.level + '%', { name: 'Percent', style: 'Number/M 18', color: color === 'brand/primary' ? 'text/primary' : color })),
        Box({ name: 'Track', w: 'fill', h: 10, radius: 999, fill: 'surface/muted', clip: true },
          Rect({ name: 'Level', w: fw, h: 10, x: TW - fw, y: 0, fill: color, radius: 999, constraints: { horizontal: 'SCALE', vertical: 'SCALE' } })),
        Row({ name: 'Foot', w: 'fill', main: 'between' },
          Txt('دفتري 12,000 لتر', { name: 'Current', style: 'Body/Small 12', color: 'text/secondary' }),
          Txt('آخر قياس 07:30', { name: 'Updated', style: 'Body/Small 12', color: 'text/muted' })));
    }
  },
  // ---------- Invoice Card ----------
  {
    name: 'Invoice Card', group: 'مكوّنات الملف',
    description: 'بطاقة فاتورة مختصرة قابلة للفتح. الحالات: مؤكدة، بانتظار اعتماد المحطة، مصحّحة.',
    props: { status: ['confirmed', 'pending', 'corrected'] },
    defaults: { status: 'confirmed' },
    textProps: { Station: 'محطة النور', Total: '5,000 ل.س', Details: 'بنزين 95 · 40.0 لتر', Date: 'الخميس 24 سبتمبر · 10:48' },
    setDir: 'V',
    render: function (vp) {
      const b = { confirmed: ['success', 'مؤكدة'], pending: ['warning', 'بانتظار المحطة'], corrected: ['info', 'مصحّحة'] }[vp.status];
      return Row({ name: 'Invoice', w: 358, pad: 14, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default', cross: 'start' },
        IconBox('receipt', { size: 40, radius: 12 }),
        Col({ name: 'Body', w: 'fill', gap: 4 },
          Row({ w: 'fill', main: 'between' },
            Txt('محطة النور', { name: 'Station', style: 'Body/Strong 14' }),
            Txt('5,000 ل.س', { name: 'Total', style: 'Number/M 18' })),
          Row({ w: 'fill', main: 'between' },
            Txt('بنزين 95 · 40.0 لتر', { name: 'Details', style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }),
            Inst('Status Badge', { tone: b[0] }, { Label: b[1] }, { name: 'Badge' })),
          Txt('الخميس 24 سبتمبر · 10:48', { name: 'Date', style: 'Body/Small 12', color: 'text/muted' })));
    }
  },
  // ---------- Wizard Stepper ----------
  {
    name: 'Shift Closing Wizard', group: 'مكوّنات الملف',
    description: 'مسار خطوات إغلاق المناوبة بدل صفحة طويلة: القراءة النهائية، ثم النقد الفعلي، ثم المراجعة والإرسال.',
    props: { step: ['1', '2', '3'] },
    defaults: { step: '1' },
    setDir: 'V',
    render: function (vp) {
      const cur = parseInt(vp.step, 10);
      const labels = ['القراءة النهائية', 'النقد الفعلي', 'المراجعة'];
      function step(i) {
        const done = i < cur, now = i === cur;
        return Col({ name: 'Step ' + i, gap: 6, cross: 'center', w: 96 },
          Row({ name: 'Circle', w: 32, h: 32, radius: 999, fill: done ? 'brand/action' : (now ? 'brand/primary' : 'surface/muted'), main: 'center', cross: 'center' },
            done ? Ico('check', { size: 16, color: 'brand/on-action' }) : Txt(String(i), { style: 'Body/Strong 14', color: now ? 'text/on-dark' : 'text/muted' })),
          Txt(labels[i - 1], { name: 'Label', style: 'Label/12', color: now ? 'text/primary' : 'text/muted', align: 'center' }));
      }
      function line(i) { return Rect({ name: 'Line', w: 'fill', h: 2, fill: i < cur ? 'brand/action' : 'border/default' }); }
      return Row({ name: 'Stepper', w: 358, cross: 'start', gap: 0 },
        step(1), Col({ w: 'fill', pad: [15, 0, 0, 0] }, line(1)), step(2), Col({ w: 'fill', pad: [15, 0, 0, 0] }, line(2)), step(3));
    }
  },
  // ---------- Nav Item ----------
  {
    name: 'Nav Item', group: 'تنقل',
    description: 'عنصر في الشريط الجانبي الداكن (يمين الشاشة).',
    props: { state: ['default', 'active'] },
    defaults: { state: 'default' },
    textProps: { Label: 'لوحة القيادة', Count: '3' },
    boolProps: { 'Show count': { layer: 'Count pill', default: false } },
    render: function (vp) {
      const on = vp.state === 'active';
      return Row({ name: 'Nav', w: 224, h: 40, pad: [0, 12], gap: 12, radius: 10, fill: on ? 'brand/primary' : null },
        Ico('home', { name: 'Icon', size: 20, color: on ? 'text/on-dark' : 'text/on-dark-muted' }),
        Txt('لوحة القيادة', { name: 'Label', style: 'Body/Strong 14', color: on ? 'text/on-dark' : 'text/on-dark-muted', w: 'fill' }),
        Row({ name: 'Count pill', h: 20, pad: [0, 7], radius: 999, fill: 'status/warning', main: 'center', cross: 'center' },
          Txt('3', { name: 'Count', style: 'Label/11', color: 'brand/dark' })));
    }
  },
  // ---------- Tab Bar ----------
  {
    name: 'Tab Bar', group: 'تنقل',
    description: 'شريط التبويب السفلي لتطبيق الزبون.',
    props: { active: ['home', 'stations', 'invoices', 'account'] },
    defaults: { active: 'home' },
    setDir: 'V',
    render: function (vp) {
      const tabs = [['home', 'home', 'الرئيسية'], ['stations', 'pin', 'المحطات'], ['invoices', 'receipt', 'فواتيري'], ['account', 'car', 'سيارتي']];
      return Col({ name: 'Tab Bar', w: 390, h: 84, fill: 'surface/card' }, Rect({ name: 'Top border', w: 'fill', h: 1, fill: 'border/default' }),
        Row({ name: 'Tabs', w: 'fill', h: 'fill', pad: [10, 12, 22, 12], cross: 'start' }, tabs.map(function (t) {
          const on = t[0] === vp.active;
          return Col({ name: 'Tab ' + t[0], w: 'fill', gap: 4, cross: 'center' },
            Ico(t[1], { size: 24, color: on ? 'brand/primary' : 'text/muted' }),
            Txt(t[2], { style: 'Label/11', color: on ? 'brand/primary' : 'text/muted' }));
        })));
    }
  },
  // ---------- Audit Drawer ----------
  {
    name: 'Audit Drawer', group: 'مكوّنات الملف',
    description: 'درج جانبي يعرض تاريخ العملية المالية: من أنشأها، من عدّلها، ولماذا. لا يوجد حذف صامت.',
    textProps: { Title: 'سجل المراجعة', Subtitle: 'القيد JE-2026-1042 · فرق صندوق المناوبة' },
    render: function () {
      function entry(dot, who, when, what, why, last) {
        return Row({ name: 'Entry', w: 'fill', gap: 12, cross: 'start' },
          Col({ name: 'Rail', cross: 'center', gap: 4, pad: [4, 0, 0, 0] }, Dot(10, dot), last ? null : Rect({ name: 'Rail line', w: 2, h: 64, fill: 'border/default' })),
          Col({ w: 'fill', gap: 2, pad: [0, 0, 12, 0] },
            Row({ w: 'fill', main: 'between' }, Txt(who, { style: 'Body/Strong 14' }), Txt(when, { style: 'Body/Small 12', color: 'text/muted' })),
            Txt(what, { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' }),
            why ? Row({ pad: [6, 10], radius: 8, fill: 'surface/muted', w: 'fill' }, Txt(why, { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })) : null));
      }
      return Col({ name: 'Drawer', w: 420, h: 880, pad: 24, gap: 20, fill: 'surface/card', shadow: 'Shadow/Drawer' },
        Row({ w: 'fill', main: 'between', cross: 'start' },
          Col({ gap: 2, w: 'fill' },
            Row({ gap: 8 }, Ico('history', { size: 20, color: 'brand/primary' }), Txt('سجل المراجعة', { name: 'Title', style: 'Heading/H2 20' })),
            Txt('القيد JE-2026-1042 · فرق صندوق المناوبة', { name: 'Subtitle', style: 'Body/Small 12', color: 'text/muted', w: 'fill' })),
          Row({ w: 36, h: 36, radius: 10, fill: 'surface/muted', main: 'center', cross: 'center' }, Ico('x', { size: 18 }))),
        Col({ name: 'Source', w: 'fill', pad: 14, gap: 8, radius: 12, fill: 'brand/primary-50' },
          Txt('مصدر القيد', { style: 'Label/12', color: 'brand/primary' }),
          Row({ w: 'fill', main: 'between' }, Txt('إغلاق مناوبة · المضخة 3', { style: 'Body/Strong 14' }), Txt('فتح المصدر', { style: 'Label/12', color: 'brand/primary' })),
          Txt('أحمد سالم · الخميس 24 سبتمبر · 14:05', { style: 'Body/Small 12', color: 'text/secondary' })),
        Col({ name: 'Lines', w: 'fill', gap: 8 },
          Txt('طرفا القيد', { style: 'Label/12', color: 'text/muted' }),
          Row({ w: 'fill', main: 'between', pad: [10, 12], radius: 10, stroke: 'border/default' }, Txt('مدين · عجز صندوق المناوبات', { style: 'Body/Regular 14' }), Txt('4,500', { style: 'Body/Strong 14' })),
          Row({ w: 'fill', main: 'between', pad: [10, 12], radius: 10, stroke: 'border/default' }, Txt('دائن · الصندوق الرئيسي', { style: 'Body/Regular 14' }), Txt('4,500', { style: 'Body/Strong 14' })),
          Row({ gap: 6 }, Ico('checkCircle', { size: 16, color: 'brand/action' }), Txt('القيد متوازن', { style: 'Label/12', color: 'brand/action-700' }))),
        Col({ name: 'Timeline', w: 'fill', gap: 0 },
          Txt('التاريخ', { style: 'Label/12', color: 'text/muted' }),
          Col({ w: 'fill', gap: 0, pad: [12, 0, 0, 0] },
            entry('brand/primary', 'النظام', '14:05', 'أُنشئ القيد تلقائياً من إغلاق المناوبة', null, false),
            entry('status/warning', 'أحمد سالم · عامل', '14:07', 'أضاف سبب الفرق وصورة للصندوق', '«دفعة بطاقة سُجلت نقداً بالخطأ»', false),
            entry('brand/action', 'خالد العمر · صاحب المحطة', '14:32', 'اعتمد الإغلاق وحوّل الفرق إلى حساب العجز', null, true))),
        VSpacer(),
        Row({ w: 'fill', pad: 12, gap: 10, radius: 10, fill: 'status/warning-50', cross: 'start' },
          Ico('lock', { size: 18, color: 'status/warning-700' }),
          Txt('لا يمكن حذف الحركات المالية. التصحيح يتم بقيد عكسي مع ذكر السبب والصلاحية.', { style: 'Body/Small 12', color: 'status/warning-700', w: 'fill' })));
    }
  }
];
