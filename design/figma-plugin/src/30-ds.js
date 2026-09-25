// ============================================================
// Design-system page: boards for foundations, components, icons
// ============================================================

async function makeBoard(page, title, sub, x, w) {
  const spec = Col({ name: title, w: w, pad: 56, gap: 40, radius: 32, fill: 'surface/page', x: x, y: 0 },
    Col({ name: 'Board header', w: 'fill', gap: 8 },
      Txt('FuelOS · نظام تشغيل محطة الوقود', { style: 'Label/12', color: 'brand/primary' }),
      Txt(title, { style: 'Display/32' }),
      sub ? Txt(sub, { style: 'Body/Large 16', color: 'text/secondary', w: 'fill' }) : null));
  const node = await buildFrame(spec, null, figma.createFrame());
  page.appendChild(node);
  node.x = x; node.y = 0;
  node.setPluginData('fuelos', 'gen');
  return node;
}

async function addTo(parent, spec) { return build(spec, parent); }

async function buildComponentsBoard(board) {
  const groups = {};
  for (const d of COMPONENT_DEFS) (groups[d.group] = groups[d.group] || []).push(d);
  const order = ['أساسيات', 'تنقل', 'مكوّنات الملف'];
  for (const g of order) {
    if (!groups[g]) continue;
    const sec = await build(Col({ name: 'Group · ' + g, w: 'fill', gap: 20 },
      Txt(g === 'مكوّنات الملف' ? 'المكوّنات الستة من ملف المواصفات' : (g === 'أساسيات' ? 'مكوّنات أساسية مستنتجة من الشاشات' : 'التنقل'), { style: 'Heading/H1 24' })), board);
    for (const d of groups[g]) {
      try {
        const wrap = await build(Col({ name: d.name, w: 'fill', gap: 10 },
          Txt(d.name, { style: 'Heading/H3 16' }),
          Txt(d.description || '', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' })), sec);
        await defineComponent(d, wrap);
        log('مكوّن: ' + d.name);
      } catch (e) { log('فشل المكوّن ' + d.name + ': ' + e.message, 'error'); }
      await tick();
    }
  }
}

async function buildIconsBoard(board) {
  const holder = await build(Col({ name: 'Icons', w: 'fill', gap: 16 },
    Txt('الأيقونات', { style: 'Heading/H1 24' }),
    Txt('أيقونات خطية 24px بسماكة 2px. غيّر اللون عبر overrides، والحجم بتغيير أبعاد النسخة.', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' })), board);
  const grid = await build(Row({ name: 'Icon grid', w: 'fill', gap: 20, wrap: true, rowGap: 20, pad: 24, radius: 16, fill: 'surface/card', stroke: 'border/default' }), holder);
  await setupIcons(grid);
}

async function buildFoundations(board) {
  // Colors
  const groups = [
    ['الهوية', ['brand/primary', 'brand/primary-hover', 'brand/primary-50', 'brand/action', 'brand/action-50', 'brand/action-700', 'brand/on-action', 'brand/dark', 'brand/dark-800', 'brand/dark-700']],
    ['الحالات', ['status/warning', 'status/warning-50', 'status/warning-700', 'status/danger', 'status/danger-50', 'status/danger-700', 'status/info', 'status/info-50', 'status/info-700']],
    ['الأسطح والحدود والنصوص', ['surface/page', 'surface/card', 'surface/muted', 'border/default', 'border/strong', 'text/primary', 'text/secondary', 'text/muted', 'text/on-dark', 'text/on-dark-muted']]
  ];
  const colorSec = Col({ name: 'Colors', w: 'fill', gap: 24 },
    Txt('الألوان', { style: 'Heading/H1 24' }),
    Txt('الألوان الستة من الملف (مميّزة بإطار) مع درجات مساعدة للنصوص والحدود والخلفيات. كلها متغيرات Variables مربوطة بالمكوّنات.', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' }),
    groups.map(function (g) {
      return Col({ name: g[0], w: 'fill', gap: 12 },
        Txt(g[0], { style: 'Heading/H3 16', color: 'text/secondary' }),
        chunk(g[1], 5).map(function (row) {
          return Row({ w: 'fill', gap: 16, cross: 'start' }, row.map(function (tok) {
            const fromSpec = !!COLOR_DOC[tok];
            return Col({ name: tok, w: 'fill', gap: 6 },
              Box({ name: 'Swatch', w: 'fill', h: 72, radius: 12, fill: tok, stroke: fromSpec ? 'brand/action' : 'border/default', strokeW: fromSpec ? 3 : 1 }),
              Txt(tok, { style: 'Label/12' }),
              Txt(COLORS[tok], { style: 'Body/Small 12', color: 'text/muted' }),
              fromSpec ? Txt(COLOR_DOC[tok], { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }) : null);
          }), row.length < 5 ? [0, 0, 0, 0, 0].slice(row.length).map(function () { return Spacer({ w: 'fill' }); }) : null);
        }));
    }));
  await build(colorSec, board);

  // Typography
  const sample = { Display: 'نظام تشغيل المحطة', Heading: 'لوحة القيادة', Body: 'كل عملية تشغيلية تتحول إلى أثر محاسبي قابل للتتبع.', Label: 'آخر تحديث 07:30', Number: '2,026,400', Button: 'حفظ العملية' };
  const typeSec = Col({ name: 'Typography', w: 'fill', gap: 12 },
    Txt('الخطوط', { style: 'Heading/H1 24' }),
    Txt('الخط: ' + FONT + ' — واضح بالعربية ويعرض الأرقام بشكل ممتاز. الأرقام لاتينية (0-9) لسهولة قراءة المبالغ.', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' }),
    Col({ w: 'fill', gap: 0, pad: [8, 24], radius: 16, fill: 'surface/card', stroke: 'border/default' },
      TEXT_STYLES.map(function (d, i) {
        const fam = d[0].split('/')[0];
        return Col({ w: 'fill', gap: 0 },
          Row({ w: 'fill', main: 'between', pad: [14, 0] },
            Txt(sample[fam] || 'نص', { style: d[0] }),
            Txt(d[0] + ' · ' + d[1] + 'px · ' + d[2] + ' · ' + d[3] + '%', { style: 'Body/Small 12', color: 'text/muted' })),
          i < TEXT_STYLES.length - 1 ? Divider() : null);
      })));
  await build(typeSec, board);

  // Spacing & radius
  const spSec = Col({ name: 'Spacing & radius', w: 'fill', gap: 16 },
    Txt('المسافات والزوايا', { style: 'Heading/H1 24' }),
    Row({ w: 'fill', gap: 20, cross: 'end', pad: 24, radius: 16, fill: 'surface/card', stroke: 'border/default' },
      SPACES.map(function (s) {
        return Col({ gap: 8, cross: 'center' }, Rect({ w: s, h: 48, fill: 'brand/primary-50', stroke: 'brand/primary' }), Txt('space/' + s, { style: 'Label/11', color: 'text/secondary' }));
      })),
    Row({ w: 'fill', gap: 20, pad: 24, radius: 16, fill: 'surface/card', stroke: 'border/default' },
      Object.keys(RADII).map(function (k) {
        return Col({ gap: 8, cross: 'center' }, Box({ w: 72, h: 72, radius: Math.min(RADII[k], 36), fill: 'brand/primary-50', stroke: 'brand/primary' }), Txt('radius/' + k + ' · ' + RADII[k], { style: 'Label/11', color: 'text/secondary' }));
      })));
  await build(spSec, board);

  // Grid & frames
  const gridSec = Col({ name: 'Frames', w: 'fill', gap: 16 },
    Txt('مقاسات الإطارات والشبكة', { style: 'Heading/H1 24' }),
    Row({ w: 'fill', gap: 16, cross: 'start' },
      [['صاحب المحطة والأدمن', '1440 x 1024', 'شريط جانبي 256 يمين · هوامش 32 · مسافة 20'], ['موظف المحطة', '390 x 844', 'هوامش 16 · أزرار 56 · لمسات 3-4 لكل عملية'], ['الزبون', '390 x 844', 'هوامش 16 · شريط تبويب سفلي 84']].map(function (f) {
        return Col({ w: 'fill', pad: 20, gap: 6, radius: 16, fill: 'surface/card', stroke: 'border/default' },
          Txt(f[0], { style: 'Heading/H3 16' }), Txt(f[1], { style: 'Number/L 24', color: 'brand/primary' }), Txt(f[2], { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }));
      })));
  await build(gridSec, board);
}
