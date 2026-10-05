// ============================================================
// Customer-app components: 6-tab bar, ad slide; plus reused base components
// ============================================================

const C_TABS = [
  ['home', 'home', 'الرئيسية', 'CU2'],
  ['invoices', 'receipt', 'فواتيري', 'CU6'],
  ['card', 'qr', 'بطاقتي', 'CU8'],
  ['rewards', 'gift', 'المكافآت', 'CU9'],
  ['complaints', 'message', 'الشكاوى', 'CU10'],
  ['vehicles', 'car', 'سياراتي', 'CU13']
];

// Original placeholder artwork for sponsor ads (no real brands). 16:9.
function adArt(kind, W, H) {
  W = W || 358; H = H || 201;
  const art = {
    oil: { a: '#0C2B3E', b: '#0F766E', shapes:
      '<circle cx="70" cy="150" r="110" fill="#10B981" opacity=".18"/><circle cx="70" cy="150" r="70" fill="#10B981" opacity=".22"/>' +
      '<path d="M70 70c0 0-34 38-34 62a34 34 0 0 0 68 0c0-24-34-62-34-62z" fill="#ECFDF5" opacity=".95"/>' +
      '<path d="M58 132a12 12 0 0 0 12 12" stroke="#0F766E" stroke-width="5" fill="none" stroke-linecap="round"/>' },
    tyres: { a: '#B45309', b: '#F59E0B', shapes:
      '<circle cx="78" cy="118" r="70" fill="none" stroke="#071E2D" stroke-width="22" opacity=".85"/>' +
      '<circle cx="78" cy="118" r="34" fill="none" stroke="#FFF7E6" stroke-width="8"/>' +
      '<circle cx="78" cy="118" r="8" fill="#FFF7E6"/>' +
      '<path d="M8 196 L120 30" stroke="#FFF7E6" stroke-width="2" opacity=".35"/><path d="M40 200 L150 40" stroke="#FFF7E6" stroke-width="2" opacity=".25"/>' },
    insurance: { a: '#0369A1', b: '#0284C7', shapes:
      '<rect x="-20" y="120" width="220" height="120" rx="60" fill="#E0F2FE" opacity=".18"/>' +
      '<path d="M84 46l46 18v34c0 30-22 50-46 60-24-10-46-30-46-60V64z" fill="#E0F2FE"/>' +
      '<path d="M66 104l13 13 25-27" stroke="#0369A1" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' }
  }[kind];
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="g" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + art.b + '"/><stop offset="1" stop-color="' + art.a + '"/></linearGradient></defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#g)"/>' + art.shapes + '</svg>';
}

const AD_COPY = {
  oil: ['زيت محركات بخصم 15%', 'عند تغيير الزيت في المحطات المشاركة', 'الأفق للزيوت'],
  tyres: ['إطارات صيفية بسعر الجملة', 'تركيب وموازنة مجاناً هذا الشهر', 'إطارات الشام'],
  insurance: ['أمّن سيارتك بالتقسيط', 'عرض سعر خلال دقيقتين عبر واتساب', 'درع للتأمين']
};

const C_COMPONENT_DEFS = [
  {
    name: 'Customer Tab Bar', group: 'تنقل',
    description: 'الشريط السفلي لتطبيق الزبون — ستة أقسام كما في التطبيق الحالي. يظهر بعد تسجيل الدخول فقط.',
    props: { active: C_TABS.map(function (t) { return t[0]; }) },
    defaults: { active: 'home' },
    setDir: 'V',
    render: function (vp) {
      return Col({ name: 'Tab Bar', w: 390, h: 84, fill: 'surface/card' },
        Rect({ name: 'Top border', w: 'fill', h: 1, fill: 'border/default' }),
        Row({ name: 'Tabs', w: 'fill', h: 'fill', pad: [8, 6, 22, 6], cross: 'start' }, C_TABS.map(function (t) {
          const on = t[0] === vp.active;
          return Col({ name: 'Tab ' + t[0], w: 'fill', gap: 3, cross: 'center' },
            Row({ name: 'Pill', w: 44, h: 28, radius: 999, fill: on ? 'brand/primary-50' : null, main: 'center', cross: 'center' },
              Ico(t[1], { size: 20, color: on ? 'brand/primary' : 'text/muted' })),
            Txt(t[2], { style: 'Label/11', color: on ? 'brand/primary' : 'text/muted' }));
        })));
    }
  },
  {
    name: 'Ad Slide', group: 'الإعلانات',
    description: 'شريحة إعلان راعٍ بنسبة 16:9. الصورة من مخزن ad-images (JPG أو PNG أو WEBP أو GIF). العنوان نص بديل للصورة، و«إعلان · الراعي» يظهر دائماً تحتها.',
    props: { art: ['oil', 'tyres', 'insurance'] },
    defaults: { art: 'oil' },
    textProps: { Title: 'عنوان الإعلان', Sub: 'سطر توضيحي', Sponsor: 'الراعي' },
    render: function (vp) {
      const c = AD_COPY[vp.art];
      return Box({ name: 'Ad', w: 358, h: 201, radius: 18, clip: true, fill: 'brand/dark' },
        Svg(adArt(vp.art, 358, 201), 358, 201, { name: 'Ad image', x: 0, y: 0 }),
        Col({ name: 'Copy', x: 150, y: 52, w: 190, gap: 4 },
          Txt(c[0], { name: 'Title', style: 'Heading/H2 20', color: 'text/on-dark', w: 'fill' }),
          Txt(c[1], { name: 'Sub', style: 'Body/Small 12', color: 'text/on-dark', opacity: 0.85, w: 'fill' })),
        Row({ name: 'Sponsor tag', x: 214, y: 158, h: 26, pad: [0, 10], gap: 6, radius: 999, fill: 'brand/dark', fillOpacity: 0.55 },
          Txt('إعلان', { style: 'Label/11', color: 'text/on-dark-muted' }),
          Txt(c[2], { name: 'Sponsor', style: 'Label/11', color: 'text/on-dark' })));
    }
  }
];

const C_REUSED = ['Button', 'Status Badge', 'Input', 'Segmented Control', 'Alert Banner'];

async function cBuildComponents(board) {
  const defs = COMPONENT_DEFS.filter(function (d) { return C_REUSED.indexOf(d.name) >= 0; }).concat(C_COMPONENT_DEFS);
  for (const d of defs) {
    try {
      const wrap = await build(Col({ name: d.name, w: 'fill', gap: 10 },
        Txt(d.name, { style: 'Heading/H3 16' }),
        Txt(d.description || '', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' })), board);
      const owner = await defineComponent(d, wrap);
      owner.name = 'زبون/' + d.name; // instances still resolve through COMP[d.name]
      log('مكوّن: ' + d.name);
    } catch (e) { log('فشل المكوّن ' + d.name + ': ' + e.message, 'error'); }
    await tick();
  }
}
