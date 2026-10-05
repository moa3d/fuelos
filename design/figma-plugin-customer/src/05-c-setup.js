// ============================================================
// FuelOS Customer Builder — setup that REUSES the file's existing FuelOS
// variables / styles (built by FuelOS Design Builder) and never touches
// pages 01 / 02. Creates only what is missing.
// ============================================================

const C_PAGE_KEY = 'customer-v2';
const C_PAGE_NAME = '03 · تطبيق الزبون — الإصدار الحالي';

// extra outline icons the customer app needs (24×24, 2px stroke)
Object.assign(ICON_PATHS, {
  qr: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h3v3h-3z', 'M21 14v.01', 'M14 21h.01', 'M17 21h4v-4'],
  copy: ['M9 9h11v11H9z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  megaphone: ['M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z', 'M17 8.5a5 5 0 0 1 0 7', 'M20 5.5a9 9 0 0 1 0 13'],
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M22 6l-10 7L2 6'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  external: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14 21 3'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M10 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z', 'M21 15l-5-5L5 21']
});

async function cPreparePage() {
  let page = figma.root.children.find(function (p) { return p.getPluginData('fuelos') === C_PAGE_KEY; });
  if (!page) { page = figma.createPage(); page.setPluginData('fuelos', C_PAGE_KEY); }
  page.name = C_PAGE_NAME;
  await page.loadAsync();
  for (const n of page.children.slice()) if (n.getPluginData('fuelos') === 'gen') n.remove();
  return page;
}

// Reuse "FuelOS Colors" / "FuelOS Spacing" when they exist; create only missing variables.
async function cEnsureVariables() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const all = await figma.variables.getLocalVariablesAsync();
  function collection(name, modeName) {
    let c = cols.find(function (x) { return x.name === name; });
    if (!c) { c = figma.variables.createVariableCollection(name); c.renameMode(c.modes[0].modeId, modeName); }
    for (const v of all) if (v.variableCollectionId === c.id) VARS[v.name] = v;
    return c;
  }
  const colors = collection(PREFIX + ' Colors', 'Light');
  const cm = colors.modes[0].modeId;
  let created = 0;
  for (const name of Object.keys(COLORS)) {
    if (VARS[name]) continue;
    const v = figma.variables.createVariable(name, colors, 'COLOR');
    const rgb = hexToRgb(COLORS[name]);
    v.setValueForMode(cm, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
    VARS[name] = v; created++;
  }
  const sp = collection(PREFIX + ' Spacing', 'Default');
  const sm = sp.modes[0].modeId;
  for (const s of SPACES) { const n = 'space/' + s; if (!VARS[n]) { const v = figma.variables.createVariable(n, sp, 'FLOAT'); v.setValueForMode(sm, s); VARS[n] = v; created++; } }
  for (const k of Object.keys(RADII)) { const n = 'radius/' + k; if (!VARS[n]) { const v = figma.variables.createVariable(n, sp, 'FLOAT'); v.setValueForMode(sm, RADII[k]); VARS[n] = v; created++; } }
  log('المتغيرات: ' + Object.keys(VARS).length + (created ? ' (أُنشئ ' + created + ')' : ' (موجودة مسبقاً)'));
}

async function cEnsureStyles() {
  const ts = await figma.getLocalTextStylesAsync();
  let made = 0;
  for (const d of TEXT_STYLES) {
    let s = ts.find(function (x) { return x.name === d[0]; });
    if (!s) {
      s = figma.createTextStyle();
      s.name = d[0];
      s.fontName = { family: FONT, style: fontStyle(d[2]) };
      s.fontSize = d[1];
      s.lineHeight = { unit: 'PERCENT', value: d[3] };
      s.setPluginData('fuelos', 'gen-c');
      made++;
    } else {
      try { await figma.loadFontAsync(s.fontName); } catch (e) { /* font of an existing style not available */ }
    }
    TSTYLE[d[0]] = s;
  }
  const es = await figma.getLocalEffectStylesAsync();
  const shadows = {
    'Shadow/Card': [[0, 1, 2, 0, 0.05], [0, 4, 12, 0, 0.04]],
    'Shadow/Raised': [[0, 8, 24, -4, 0.12], [0, 2, 6, 0, 0.06]],
    'Shadow/Drawer': [[0, 0, 40, 0, 0.18]]
  };
  for (const name of Object.keys(shadows)) {
    let s = es.find(function (x) { return x.name === name; });
    if (!s) {
      s = figma.createEffectStyle();
      s.name = name;
      s.effects = shadows[name].map(function (x) {
        return { type: 'DROP_SHADOW', color: { r: 0.06, g: 0.09, b: 0.16, a: x[4] }, offset: { x: x[0], y: x[1] }, radius: x[2], spread: x[3], visible: true, blendMode: 'NORMAL' };
      });
      s.setPluginData('fuelos', 'gen-c');
      made++;
    }
    ESTYLE[name] = s;
  }
  log('الأنماط: ' + (made ? 'أُنشئ ' + made : 'موجودة مسبقاً'));
}

// Icons live on this page (prefixed) so the builder never depends on page 01.
async function cBuildIcons(holder) {
  const names = Object.keys(ICON_PATHS);
  for (const name of names) {
    const frame = figma.createNodeFromSvg(iconSvg(name));
    const comp = figma.createComponentFromNode(frame);
    comp.name = 'زبون/icon/' + name;
    comp.fills = [];
    comp.clipsContent = false;
    for (const v of comp.findAll(function (n) { return n.type === 'VECTOR'; })) {
      v.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
      if (v.strokes && v.strokes.length) v.strokes = [paint('text/secondary')];
    }
    holder.appendChild(comp);
    ICONS[name] = comp;
  }
  log('الأيقونات: ' + names.length);
}
