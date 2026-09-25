// ============================================================
// Screen shells and shared screen pieces
// ============================================================

const NAV = [
  ['التشغيل', [['dash', 'home', 'لوحة القيادة'], ['tanks', 'droplet', 'الخزانات والمخزون'], ['sales', 'fuel', 'المبيعات والمناوبات'], ['prices', 'tag', 'أسعار الوقود']]],
  ['العملاء', [['customers', 'users', 'العملاء والديون'], ['complaints', 'message', 'الشكاوى والبلاغات', '4']]],
  ['المالية', [['journal', 'book', 'القيود المحاسبية'], ['expenses', 'wallet', 'المصاريف والموردون'], ['reports', 'chart', 'التقارير'], ['approvals', 'inbox', 'الموافقات', '3']]],
  ['الإدارة', [['settings', 'sliders', 'الإعدادات والمستخدمون']]]
];
const NAV_ADMIN = [
  ['المنصة', [['a-dash', 'gauge', 'لوحة المنصة'], ['a-stations', 'pin', 'المحطات', '38'], ['a-onboard', 'plus', 'انضمام محطة']]],
  ['الإيراد', [['a-plans', 'card', 'الاشتراكات', '5']]],
  ['التشغيل', [['a-support', 'message', 'تذاكر الدعم', '12'], ['a-audit', 'shield', 'الصلاحيات والسجلات']]]
];
// nav key -> screen frame name prefix (used for prototype links)
const NAV_TARGET = { dash: 'O1', tanks: 'O2', sales: 'O3', journal: 'O4', customers: 'O5', reports: 'O6', approvals: 'O7', expenses: 'O8', prices: 'O9', complaints: 'O10', settings: 'O11', 'a-dash': 'A1', 'a-onboard': 'A2', 'a-plans': 'A3', 'a-audit': 'A4', 'a-support': 'A4' };

function Sidebar(active, opt) {
  opt = opt || {};
  const nav = opt.nav || NAV;
  const user = opt.user || ['خع', 'خالد العمر', 'صاحب المحطة'];
  return Col({ name: 'Sidebar', w: 256, h: 'fill', pad: [24, 16], gap: 20, fill: 'brand/dark' },
    Row({ name: 'Logo', w: 'fill', gap: 10, pad: [0, 6] },
      Row({ w: 38, h: 38, radius: 11, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 20, color: 'brand/dark' })),
      Col({ gap: 0 }, Txt(opt.admin ? 'FuelOS Admin' : 'FuelOS', { style: 'Heading/H3 16', color: 'text/on-dark' }), Txt(opt.admin ? 'إدارة شبكة المحطات' : 'نظام تشغيل المحطة', { style: 'Body/Small 12', color: 'text/on-dark-muted' }))),
    opt.admin ? null : Row({ name: 'Station switcher', w: 'fill', pad: 12, gap: 10, radius: 12, fill: 'brand/dark-800', stroke: 'brand/dark-700' },
      Row({ w: 32, h: 32, radius: 9, fill: 'brand/dark-700', main: 'center', cross: 'center' }, Ico('pin', { size: 16, color: 'brand/action' })),
      Col({ w: 'fill', gap: 0 }, Txt(opt.station || 'محطة النور', { style: 'Body/Strong 14', color: 'text/on-dark' }), Txt(opt.stationSub || 'الفرع الرئيسي · 6 مضخات', { style: 'Body/Small 12', color: 'text/on-dark-muted' })),
      Ico('chevronDown', { size: 16, color: 'text/on-dark-muted' })),
    nav.map(function (g) {
      return Col({ name: 'Nav · ' + g[0], w: 'fill', gap: 2 },
        Txt(g[0], { style: 'Label/11', color: 'text/on-dark-muted', w: 'fill' }),
        g[1].map(function (it) {
          const on = it[0] === active;
          const over = { Label: it[2], '^Icon': { icon: it[1], color: on ? 'text/on-dark' : 'text/on-dark-muted' } };
          if (it[3]) { over['?Show count'] = true; over.Count = it[3]; }
          return Inst('Nav Item', { state: on ? 'active' : 'default' }, over, { w: 'fill', name: 'Nav · ' + it[0] });
        }));
    }),
    VSpacer(),
    Row({ name: 'User', w: 'fill', pad: 12, gap: 10, radius: 12, fill: 'brand/dark-800' },
      Avatar(user[0], 36, { fill: 'brand/primary', color: 'text/on-dark' }),
      Col({ w: 'fill', gap: 0 }, Txt(user[1], { style: 'Body/Strong 14', color: 'text/on-dark' }), Txt(user[2], { style: 'Body/Small 12', color: 'text/on-dark-muted' })),
      Ico('logout', { size: 18, color: 'text/on-dark-muted' })));
}

function PageHeader(title, sub, actions) {
  return Row({ name: 'Page header', w: 'fill', main: 'between', cross: 'center' },
    Col({ gap: 2 }, Txt(title, { style: 'Heading/H1 24' }), sub ? Txt(sub, { style: 'Body/Regular 14', color: 'text/secondary' }) : null),
    Row({ gap: 10 }, actions || []));
}

function Btn(type, label, icon, p) {
  const over = { Label: label };
  if (icon) { over['?Show icon'] = true; over['^Icon'] = { icon: icon, color: ({ primary: 'text/on-dark', action: 'brand/on-action', secondary: 'text/primary', ghost: 'brand/primary', danger: 'status/danger-700' })[type] }; }
  return Inst('Button', { type: type, size: (p && p.size) || 'md' }, over, Object.assign({ name: 'Button · ' + label }, p || {}));
}

function IconBtn(icon, p) {
  p = p || {};
  return Row({ name: 'Icon button', w: p.size || 40, h: p.size || 40, radius: p.radius || 10, fill: p.fill || 'surface/card', stroke: p.stroke === undefined ? 'border/default' : p.stroke, main: 'center', cross: 'center' },
    Ico(icon, { size: p.iconSize || 18, color: p.color || 'text/secondary' }), p.dot ? Dot(8, 'status/danger', { abs: true, x: (p.size || 40) - 12, y: 6 }) : null);
}

function PeriodChips(activeIdx, labels) {
  labels = labels || ['اليوم', 'أمس', 'هذا الأسبوع', 'هذا الشهر'];
  return Row({ name: 'Period', pad: 4, gap: 2, radius: 12, fill: 'surface/card', stroke: 'border/default' },
    labels.map(function (l, i) {
      const on = i === activeIdx;
      return Row({ h: 32, pad: [0, 14], radius: 9, fill: on ? 'brand/primary' : null, main: 'center' }, Txt(l, { style: 'Body/Strong 14', color: on ? 'text/on-dark' : 'text/secondary' }));
    }));
}

function Desktop(name, active, main, opt) {
  opt = opt || {};
  return Row({ name: name, w: 1440, h: opt.h || 1024, fill: 'surface/page', clip: true, cross: 'start' },
    Sidebar(active, opt.sidebar),
    Col(Object.assign({ name: 'Main', w: 'fill', h: 'fill', pad: [28, 32], gap: 20, clip: true }, opt.mainProps || {}), main),
    opt.left || null);
}

// ---------- mobile ----------
function StatusBar(dark) {
  const c = dark ? 'text/on-dark' : 'text/primary';
  return Row({ name: 'Status bar', w: 'fill', h: 44, pad: [0, 24], main: 'between' },
    Txt('9:41', { style: 'Body/Strong 14', color: c }),
    Row({ gap: 6 },
      Row({ gap: 2, cross: 'end' }, [4, 6, 8, 10].map(function (h) { return Rect({ w: 3, h: h, radius: 1, fill: c }); })),
      Ico('wifi', { size: 16, color: c }),
      Row({ w: 26, h: 12, radius: 3, stroke: c, strokeOpacity: 0.5, pad: 2 }, Rect({ w: 18, h: 8, radius: 1, fill: c }))));
}

function Mobile(name, kids, opt) {
  opt = opt || {};
  return Col({ name: name, w: 390, h: 844, fill: opt.fill || 'surface/page', clip: true, radius: 0 }, kids);
}

function WorkerHeader(opt) {
  opt = opt || {};
  return Col({ name: 'Worker header', w: 'fill', pad: [0, 16, 16, 16], gap: 10, fill: 'brand/dark' },
    StatusBar(true),
    Row({ w: 'fill', main: 'between' },
      opt.back
        ? Row({ gap: 10 }, IconBtn('arrowRight', { fill: 'brand/dark-800', stroke: null, color: 'text/on-dark' }), Col({ gap: 0 }, Txt(opt.title, { style: 'Heading/H3 16', color: 'text/on-dark' }), Txt(opt.sub || 'أحمد سالم · المضخة 3', { style: 'Body/Small 12', color: 'text/on-dark-muted' })))
        : Row({ gap: 10 }, Avatar('أس', 40, { fill: 'brand/primary', color: 'text/on-dark' }), Col({ gap: 0 }, Txt('أحمد سالم', { style: 'Heading/H3 16', color: 'text/on-dark' }), Txt(opt.sub || 'محطة النور · عامل تعبئة', { style: 'Body/Small 12', color: 'text/on-dark-muted' }))),
      Inst('Sync Indicator', { state: opt.sync || 'online' }, { Label: opt.syncLabel || ({ online: 'متصل', offline: 'غير متصل', syncing: 'جارٍ المزامنة' })[opt.sync || 'online'] })),
    opt.chips ? Row({ w: 'fill', gap: 8 }, opt.chips.map(function (c) {
      return Row({ h: 28, pad: [0, 10], gap: 6, radius: 999, fill: 'brand/dark-800' }, Ico(c[0], { size: 14, color: 'brand/action' }), Txt(c[1], { style: 'Label/12', color: 'text/on-dark' }));
    })) : null);
}

function BottomBar(kids) {
  return Col({ name: 'Bottom bar', w: 'fill', gap: 0, fill: 'surface/card' },
    Rect({ name: 'Top border', w: 'fill', h: 1, fill: 'border/default' }),
    Col({ w: 'fill', pad: [12, 16, 28, 16], gap: 10 }, kids));
}

// ---------- charts ----------
function lineChartSvg(W, H, series, maxV) {
  let s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" fill="none" xmlns="http://www.w3.org/2000/svg">';
  for (let i = 0; i <= 4; i++) { const y = Math.round(6 + (H - 12) * i / 4); s += '<path d="M0 ' + y + 'H' + W + '" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="4 4"/>'; }
  series.forEach(function (se) {
    const n = se.values.length;
    const pts = se.values.map(function (v, i) { return [W - 6 - ((W - 12) * i / (n - 1)), 6 + (H - 12) * (1 - v / maxV)]; });
    const d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    if (se.area) s += '<path d="' + d + ' L' + pts[n - 1][0].toFixed(1) + ' ' + H + ' L' + pts[0][0].toFixed(1) + ' ' + H + ' Z" fill="' + se.color + '" fill-opacity="0.08"/>';
    s += '<path d="' + d + '" stroke="' + se.color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    const last = pts[n - 1];
    s += '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="4.5" fill="#FFFFFF" stroke="' + se.color + '" stroke-width="2.5"/>';
  });
  return s + '</svg>';
}

function barChartSvg(W, H, values, maxV, colors) {
  let s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" fill="none" xmlns="http://www.w3.org/2000/svg">';
  s += '<path d="M0 ' + (H - 0.5) + 'H' + W + '" stroke="#E2E8F0" stroke-width="1"/>';
  const n = values.length, slot = W / n, bw = Math.min(28, slot * 0.5);
  values.forEach(function (v, i) {
    const h = Math.max(4, (H - 8) * v / maxV);
    const x = W - slot * (i + 0.5) - bw / 2;
    s += '<rect x="' + x.toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="6" fill="' + colors[i] + '"/>';
  });
  return s + '</svg>';
}

function mapSvg(W, H) {
  let s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" fill="none" xmlns="http://www.w3.org/2000/svg">';
  s += '<rect width="' + W + '" height="' + H + '" fill="#E7F0EC"/>';
  s += '<path d="M-10 40 C 80 30, 140 70, 220 60 S 330 20, 380 36" stroke="#FFFFFF" stroke-width="14"/>';
  s += '<path d="M40 -10 C 60 60, 30 120, 70 200" stroke="#FFFFFF" stroke-width="10"/>';
  s += '<path d="M-10 130 C 90 120, 180 150, 260 118 S 340 100, 380 120" stroke="#FFFFFF" stroke-width="18"/>';
  s += '<path d="M250 -10 C 240 60, 280 110, 270 200" stroke="#FFFFFF" stroke-width="9"/>';
  s += '<rect x="120" y="78" width="90" height="34" rx="10" fill="#D3E7DD"/>';
  s += '<rect x="292" y="140" width="60" height="40" rx="10" fill="#D3E7DD"/>';
  s += '<path d="M195 150 C 200 120, 240 110, 262 118 S 285 80, 300 56" stroke="#0F766E" stroke-width="3" stroke-dasharray="6 5" stroke-linecap="round"/>';
  return s + '</svg>';
}
