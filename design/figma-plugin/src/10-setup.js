// ============================================================
// Setup: fonts, pages, cleanup of previous runs, variables, styles, icons
// ============================================================

async function setupFonts() {
  const fonts = await figma.listAvailableFontsAsync();
  const has = function (fam, st) { return fonts.some(function (f) { return f.fontName.family === fam && f.fontName.style === st; }); };
  if (has('Cairo', 'Bold')) FONT = 'Cairo';
  else if (has('Noto Sans Arabic', 'Bold')) FONT = 'Noto Sans Arabic';
  else { FONT = 'Inter'; log('لم يتم العثور على خط Cairo — سيُستخدم خط بديل', 'warn'); }
  const styles = FONT === 'Inter' ? ['Regular', 'Medium', 'Semi Bold', 'Bold'] : ['Regular', 'Medium', 'SemiBold', 'Bold'];
  for (const st of styles) await figma.loadFontAsync({ family: FONT, style: st });
  log('الخط: ' + FONT);
}
function fontStyle(w) { if (FONT === 'Inter' && w === 'SemiBold') return 'Semi Bold'; return w; }

const PAGE_DS = '01 · التحليل ونظام التصميم';
const PAGE_SCREENS = '02 · الشاشات';

async function preparePages() {
  const pages = figma.root.children;
  let ds = pages.find(function (p) { return p.getPluginData('fuelos') === 'ds'; });
  let sc = pages.find(function (p) { return p.getPluginData('fuelos') === 'screens'; });
  if (!ds) {
    const first = pages[0];
    await first.loadAsync();
    const pristine = first.name === 'Page 1' && first.children.every(function (n) { return n.name === 'اختبار الاتصال'; });
    if (pristine) { for (const n of first.children.slice()) n.remove(); ds = first; }
    else ds = figma.createPage();
    ds.setPluginData('fuelos', 'ds');
  }
  if (!sc) { sc = figma.createPage(); sc.setPluginData('fuelos', 'screens'); }
  ds.name = PAGE_DS; sc.name = PAGE_SCREENS;
  // remove previously generated nodes (screens first, then design-system content)
  for (const p of [sc, ds]) {
    await p.loadAsync();
    for (const n of p.children.slice()) if (n.getPluginData('fuelos') === 'gen') n.remove();
  }
  return { ds: ds, sc: sc };
}

async function setupVariables() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  for (const c of cols) if (c.name === PREFIX + ' Colors' || c.name === PREFIX + ' Spacing') c.remove();
  const colors = figma.variables.createVariableCollection(PREFIX + ' Colors');
  colors.renameMode(colors.modes[0].modeId, 'Light');
  const cm = colors.modes[0].modeId;
  for (const name of Object.keys(COLORS)) {
    const v = figma.variables.createVariable(name, colors, 'COLOR');
    const rgb = hexToRgb(COLORS[name]);
    v.setValueForMode(cm, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
    if (name.indexOf('text/') === 0) v.scopes = ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'];
    else if (name.indexOf('border/') === 0) v.scopes = ['STROKE_COLOR', 'SHAPE_FILL'];
    else v.scopes = ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR'];
    VARS[name] = v;
  }
  const sp = figma.variables.createVariableCollection(PREFIX + ' Spacing');
  sp.renameMode(sp.modes[0].modeId, 'Default');
  const sm = sp.modes[0].modeId;
  for (const s of SPACES) { const v = figma.variables.createVariable('space/' + s, sp, 'FLOAT'); v.setValueForMode(sm, s); v.scopes = ['GAP']; VARS['space/' + s] = v; }
  for (const k of Object.keys(RADII)) { const v = figma.variables.createVariable('radius/' + k, sp, 'FLOAT'); v.setValueForMode(sm, RADII[k]); v.scopes = ['CORNER_RADIUS']; VARS['radius/' + k] = v; }
  log('المتغيرات: ' + Object.keys(VARS).length);
}

async function setupStyles() {
  const ts = await figma.getLocalTextStylesAsync();
  for (const s of ts) if (s.getPluginData('fuelos') === 'gen') s.remove();
  for (const d of TEXT_STYLES) {
    const s = figma.createTextStyle();
    s.name = d[0];
    s.fontName = { family: FONT, style: fontStyle(d[2]) };
    s.fontSize = d[1];
    s.lineHeight = { unit: 'PERCENT', value: d[3] };
    s.setPluginData('fuelos', 'gen');
    TSTYLE[d[0]] = s;
  }
  const es = await figma.getLocalEffectStylesAsync();
  for (const s of es) if (s.getPluginData('fuelos') === 'gen') s.remove();
  const shadows = {
    'Shadow/Card': [[0, 1, 2, 0, 0.05], [0, 4, 12, 0, 0.04]],
    'Shadow/Raised': [[0, 8, 24, -4, 0.12], [0, 2, 6, 0, 0.06]],
    'Shadow/Drawer': [[0, 0, 40, 0, 0.18]]
  };
  for (const name of Object.keys(shadows)) {
    const s = figma.createEffectStyle();
    s.name = name;
    s.effects = shadows[name].map(function (x) {
      return { type: 'DROP_SHADOW', color: { r: 0.06, g: 0.09, b: 0.16, a: x[4] }, offset: { x: x[0], y: x[1] }, radius: x[2], spread: x[3], visible: true, blendMode: 'NORMAL' };
    });
    s.setPluginData('fuelos', 'gen');
    ESTYLE[name] = s;
  }
  log('الأنماط: ' + TEXT_STYLES.length + ' خطوط + 3 ظلال');
}

// ---------- Icons (24×24, 2px stroke, outline style) ----------
const ICON_PATHS = {
  fuel: ['M3 22h12', 'M4 9h10', 'M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18', 'M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.8a2 2 0 0 0-.6-1.4L18 5'],
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M10 21v-6h4v6'],
  droplet: ['M12 2.7s-6 6.3-6 11.3a6 6 0 0 0 12 0c0-5-6-11.3-6-11.3z'],
  chart: ['M3 3v18h18', 'M8 17v-5', 'M13 17V7', 'M18 17v-8'],
  trendUp: ['M22 7l-8.5 8.5-5-5L2 17', 'M16 7h6v6'],
  trendDown: ['M22 17l-8.5-8.5-5 5L2 7', 'M16 17h6v-6'],
  wallet: ['M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'],
  receipt: ['M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z', 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8', 'M12 17.5v-11'],
  fileText: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  pin: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  navigation: ['M3 11l19-9-9 19-2-8-8-2z'],
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'],
  car: ['M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2', 'M9 17h6', 'M9 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 'M19 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'],
  gift: ['M20 12v10H4V12', 'M2 7h20v5H2z', 'M12 22V7', 'M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z', 'M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z'],
  message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  alert: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  checkCircle: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
  chevronDown: ['M6 9l6 6 6-6'],
  arrowRight: ['M5 12h14', 'M12 5l7 7-7 7'],
  plus: ['M12 5v14', 'M5 12h14'],
  scan: ['M3 7V5a2 2 0 0 1 2-2h2', 'M17 3h2a2 2 0 0 1 2 2v2', 'M21 17v2a2 2 0 0 1-2 2h-2', 'M7 21H5a2 2 0 0 1-2-2v-2', 'M7 12h10'],
  camera: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z', 'M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  cash: ['M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', 'M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 'M6 12h.01', 'M18 12h.01'],
  card: ['M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M2 10h20'],
  ticket: ['M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z', 'M13 5v2', 'M13 17v2', 'M13 11v2'],
  building: ['M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z', 'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2', 'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2', 'M10 6h4', 'M10 10h4', 'M10 14h4', 'M10 18h4'],
  wifi: ['M5 12.55a11 11 0 0 1 14.08 0', 'M1.42 9a16 16 0 0 1 21.16 0', 'M8.53 16.11a6 6 0 0 1 6.95 0', 'M12 20h.01'],
  wifiOff: ['M2 2l20 20', 'M8.5 16.5a5 5 0 0 1 7 0', 'M2 8.82a15 15 0 0 1 4.17-2.65', 'M10.66 5c4.01-.36 8.14.9 11.34 3.76', 'M16.85 11.25a10 10 0 0 1 2.22 1.68', 'M5 13a10 10 0 0 1 5.24-2.76', 'M12 20h.01'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  share: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13'],
  printer: ['M6 9V2h12v7', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v8H6z'],
  filter: ['M22 3H2l8 9.46V19l4 2v-8.54L22 3z'],
  calendar: ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  history: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  truck: ['M10 17h4V5H2v12h3', 'M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1', 'M9.5 17.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 'M19.5 17.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'],
  ruler: ['M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z', 'M14.5 12.5l2-2', 'M11.5 9.5l2-2', 'M8.5 6.5l2-2', 'M17.5 15.5l2-2'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  transfer: ['M8 3 4 7l4 4', 'M4 7h16', 'M16 21l4-4-4-4', 'M20 17H4'],
  star: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
  wrench: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'],
  more: ['M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'],
  store: ['M3 9l1.5-5h15L21 9', 'M4 9v11h16V9', 'M3 9h18', 'M9 20v-6h6v6'],
  tag: ['M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l8.59-8.59a1 1 0 0 0 0-1.41L12 2z', 'M7 7h.01'],
  inbox: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  snow: ['M2 12h20', 'M12 2v20', 'M20 16l-4-4 4-4', 'M4 8l4 4-4 4', 'M16 4l-4 4-4-4', 'M8 20l4-4 4 4'],
  gauge: ['M12 14l4-4', 'M3.34 19a10 10 0 1 1 17.32 0'],
  layers: ['M12 2 2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  backspace: ['M10 5a2 2 0 0 0-1.34.52l-6.33 5.74a1 1 0 0 0 0 1.48l6.33 5.74A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z', 'M12 9l6 6', 'M18 9l-6 6']
};

function iconSvg(name, color) {
  const paths = ICON_PATHS[name].map(function (d) { return '<path d="' + d + '"/>'; }).join('');
  return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="' + (color || '#475569') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' + paths + '</svg>';
}

async function setupIcons(board) {
  const names = Object.keys(ICON_PATHS);
  for (const name of names) {
    const frame = figma.createNodeFromSvg(iconSvg(name));
    const comp = figma.createComponentFromNode(frame);
    comp.name = 'icon/' + name;
    comp.fills = [];
    comp.clipsContent = false;
    for (const v of comp.findAll(function (n) { return n.type === 'VECTOR'; })) {
      v.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
      if (v.strokes && v.strokes.length) v.strokes = [paint('text/secondary')];
    }
    board.appendChild(comp);
    ICONS[name] = comp;
  }
  log('الأيقونات: ' + names.length);
}
