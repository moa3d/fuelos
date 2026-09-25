// ============================================================
// FuelOS Figma builder — core: tokens, registry, layout engine
// All layout is RTL: children of Row() are listed right→left.
// ============================================================

const LOG = [];
const ERRORS = [];
function log(msg, level) {
  level = level || 'info';
  LOG.push({ msg: msg, level: level });
  if (level === 'error') ERRORS.push(msg);
  try { figma.ui.postMessage({ type: 'log', msg: msg, level: level }); } catch (e) { /* ui closed */ }
}
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

// ---------- Tokens ----------
const COLORS = {
  'brand/primary': '#0F766E', 'brand/primary-hover': '#115E59', 'brand/primary-50': '#E7F6F2',
  'brand/action': '#10B981', 'brand/action-50': '#ECFDF5', 'brand/action-700': '#047857', 'brand/on-action': '#052E2B',
  'brand/dark': '#071E2D', 'brand/dark-800': '#0C2B3E', 'brand/dark-700': '#15394F',
  'status/warning': '#F59E0B', 'status/warning-50': '#FFF7E6', 'status/warning-700': '#B45309',
  'status/danger': '#DC2626', 'status/danger-50': '#FEF2F2', 'status/danger-700': '#B91C1C',
  'status/info': '#0284C7', 'status/info-50': '#E0F2FE', 'status/info-700': '#0369A1',
  'surface/page': '#F8FAFC', 'surface/card': '#FFFFFF', 'surface/muted': '#F1F5F9',
  'border/default': '#E2E8F0', 'border/strong': '#CBD5E1',
  'text/primary': '#0F172A', 'text/secondary': '#475569', 'text/muted': '#94A3B8',
  'text/on-dark': '#FFFFFF', 'text/on-dark-muted': '#9FB3C1'
};
const COLOR_DOC = {
  'brand/primary': 'اللون الأساسي — الثقة والطاقة والنظام المالي',
  'brand/action': 'لون الإجراء — حفظ، اعتماد، دفع، نجاح',
  'brand/dark': 'خلفية داكنة — لوحات المستثمر والشريط الجانبي',
  'status/warning': 'تحذير — مخزون منخفض، عملية معلقة',
  'status/danger': 'خطر — فرق صندوق كبير، تجاوز حد، خطأ إدخال',
  'surface/page': 'سطح الواجهة — خلفية الجداول والبطاقات'
};
const SPACES = [4, 8, 12, 16, 20, 24, 32, 40, 48];
const RADII = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 };
const TEXT_STYLES = [
  ['Display/32', 32, 'Bold', 130],
  ['Heading/H1 24', 24, 'Bold', 140],
  ['Heading/H2 20', 20, 'Bold', 140],
  ['Heading/H3 16', 16, 'SemiBold', 150],
  ['Body/Large 16', 16, 'Regular', 160],
  ['Body/Regular 14', 14, 'Regular', 160],
  ['Body/Strong 14', 14, 'SemiBold', 160],
  ['Body/Small 12', 12, 'Regular', 150],
  ['Label/12', 12, 'SemiBold', 150],
  ['Label/11', 11, 'SemiBold', 140],
  ['Number/Hero 44', 44, 'Bold', 120],
  ['Number/XL 32', 32, 'Bold', 120],
  ['Number/L 24', 24, 'Bold', 130],
  ['Number/M 18', 18, 'Bold', 140],
  ['Button/Large 18', 18, 'Bold', 140]
];

// ---------- Registries (filled at runtime) ----------
const VARS = {};      // token name -> Variable
const TSTYLE = {};    // text style name -> TextStyle
const ESTYLE = {};    // effect style name -> EffectStyle
const ICONS = {};     // icon name -> ComponentNode
const COMP = {};      // component name -> { node|set, textProps, props, defaults, order }
let FONT = 'Cairo';
const PREFIX = 'FuelOS';

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
function paint(token, opacity) {
  let p;
  if (token.charAt(0) === '#') {
    p = { type: 'SOLID', color: hexToRgb(token) };
  } else {
    const hex = COLORS[token];
    if (!hex) throw new Error('Unknown color token: ' + token);
    p = { type: 'SOLID', color: hexToRgb(hex) };
    const v = VARS[token];
    if (v) p = figma.variables.setBoundVariableForPaint(p, 'color', v);
  }
  if (opacity !== undefined && opacity !== null && opacity < 1) p = Object.assign({}, p, { opacity: opacity });
  return p;
}

// ---------- Spec constructors ----------
function flat(arr) {
  const out = [];
  (function walk(a) { for (const x of a) { if (Array.isArray(x)) walk(x); else if (x) out.push(x); } })(arr);
  return out;
}
function Row(p) { const kids = Array.prototype.slice.call(arguments, 1); return Object.assign({ k: 'frame', dir: 'H' }, p || {}, { kids: flat(kids) }); }
function Col(p) { const kids = Array.prototype.slice.call(arguments, 1); return Object.assign({ k: 'frame', dir: 'V' }, p || {}, { kids: flat(kids) }); }
function Box(p) { const kids = Array.prototype.slice.call(arguments, 1); return Object.assign({ k: 'frame', dir: 'N' }, p || {}, { kids: flat(kids) }); }
function Txt(text, p) { return Object.assign({ k: 'text', text: String(text) }, p || {}); }
function Ico(name, p) { return Object.assign({ k: 'icon', icon: name, size: 20, color: 'text/secondary' }, p || {}); }
function Inst(comp, variant, over, p) { return Object.assign({ k: 'inst', comp: comp, variant: variant || {}, over: over || {} }, p || {}); }
function Rect(p) { return Object.assign({ k: 'rect' }, p || {}); }
function Dot(size, fill, p) { return Object.assign({ k: 'ellipse', w: size, h: size, fill: fill }, p || {}); }
function Svg(svg, w, h, p) { return Object.assign({ k: 'svg', svg: svg, w: w, h: h }, p || {}); }
function Spacer(p) { return Object.assign({ k: 'frame', dir: 'N', name: 'Spacer', w: 'fill', h: 1 }, p || {}); }
function VSpacer(p) { return Object.assign({ k: 'frame', dir: 'N', name: 'Spacer', w: 1, h: 'fill' }, p || {}); }
function Divider(p) { return Rect(Object.assign({ name: 'Divider', w: 'fill', h: 1, fill: 'border/default' }, p || {})); }

// ---------- Layout mapping (RTL) ----------
function mapMain(v, dir) {
  v = v || 'start';
  if (v === 'between') return 'SPACE_BETWEEN';
  if (v === 'center') return 'CENTER';
  if (dir === 'H') return v === 'start' ? 'MAX' : 'MIN';
  return v === 'start' ? 'MIN' : 'MAX';
}
function mapCross(v, dir) {
  if (dir === 'H') { v = v || 'center'; return v === 'center' ? 'CENTER' : (v === 'start' ? 'MIN' : 'MAX'); }
  v = v || 'start';
  return v === 'center' ? 'CENTER' : (v === 'start' ? 'MAX' : 'MIN');
}
function isAL(node) { return node && 'layoutMode' in node && node.layoutMode !== 'NONE'; }

function bindFloat(node, field, value, prefix) {
  const v = VARS[prefix + '/' + value];
  if (!v) return;
  try { node.setBoundVariable(field, v); } catch (e) { /* non-fatal */ }
}

function applyBoxProps(node, s) {
  node.name = s.name || node.name;
  node.fills = s.fill ? [paint(s.fill, s.fillOpacity)] : [];
  if (s.stroke) {
    node.strokes = [paint(s.stroke, s.strokeOpacity)];
    node.strokeWeight = s.strokeW || 1;
    node.strokeAlign = 'INSIDE';
    if (s.dash) node.dashPattern = [6, 4];
  } else if ('strokes' in node) {
    node.strokes = [];
  }
  if (s.radius !== undefined) {
    const r = typeof s.radius === 'string' ? RADII[s.radius] : s.radius;
    node.cornerRadius = r;
    if (typeof s.radius === 'string') ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach(function (f) { bindFloat(node, f, s.radius, 'radius'); });
  }
  if (s.opacity !== undefined) node.opacity = s.opacity;
}

function applyLayout(node, s) {
  const dir = s.dir;
  node.layoutMode = dir === 'H' ? 'HORIZONTAL' : (dir === 'V' ? 'VERTICAL' : 'NONE');
  if (dir === 'N') return;
  node.itemSpacing = s.gap || 0;
  let pad = s.pad || 0;
  if (typeof pad === 'number') pad = [pad, pad, pad, pad];
  else if (pad.length === 2) pad = [pad[0], pad[1], pad[0], pad[1]];
  node.paddingTop = pad[0]; node.paddingRight = pad[1]; node.paddingBottom = pad[2]; node.paddingLeft = pad[3];
  node.primaryAxisAlignItems = mapMain(s.main, dir);
  node.counterAxisAlignItems = mapCross(s.cross, dir);
  if (s.wrap) { node.layoutWrap = 'WRAP'; node.counterAxisSpacing = s.rowGap !== undefined ? s.rowGap : (s.gap || 0); }
  if (SPACES.indexOf(node.itemSpacing) >= 0 && node.itemSpacing > 0) bindFloat(node, 'itemSpacing', node.itemSpacing, 'space');
  const pf = [['paddingTop', pad[0]], ['paddingRight', pad[1]], ['paddingBottom', pad[2]], ['paddingLeft', pad[3]]];
  pf.forEach(function (x) { if (x[1] > 0 && SPACES.indexOf(x[1]) >= 0) bindFloat(node, x[0], x[1], 'space'); });
}

async function applyEffects(node, s) {
  if (s.shadow && ESTYLE[s.shadow]) {
    try { await node.setEffectStyleIdAsync(ESTYLE[s.shadow].id); } catch (e) { log('shadow: ' + e.message, 'warn'); }
  }
}

// Size + append. Fixed dims before append, FILL/HUG after append.
function place(node, s, parent, defW, defH) {
  const w = s.w !== undefined ? s.w : defW;
  const h = s.h !== undefined ? s.h : defH;
  const fw = typeof w === 'number' ? w : null;
  const fh = typeof h === 'number' ? h : null;
  if (fw !== null || fh !== null) node.resize(fw !== null ? fw : node.width, fh !== null ? fh : node.height);
  if (s.index !== undefined) parent.insertChild(s.index, node); else parent.appendChild(node);
  const pAL = isAL(parent);
  if (s.abs && pAL) node.layoutPositioning = 'ABSOLUTE';
  if (s.x !== undefined) node.x = s.x;
  if (s.y !== undefined) node.y = s.y;
  if (s.constraints && !pAL) node.constraints = s.constraints;
  if (w === 'fill') node.layoutSizingHorizontal = 'FILL';
  else if (w === 'hug') node.layoutSizingHorizontal = 'HUG';
  else if (fw !== null && pAL && !s.abs) node.layoutSizingHorizontal = 'FIXED';
  if (h === 'fill') node.layoutSizingVertical = 'FILL';
  else if (h === 'hug') node.layoutSizingVertical = 'HUG';
  else if (fh !== null && pAL && !s.abs) node.layoutSizingVertical = 'FIXED';
  if (s.minW) node.minWidth = s.minW;
  if (s.maxW) node.maxWidth = s.maxW;
}

async function build(s, parent) {
  if (!s) return null;
  switch (s.k) {
    case 'frame': return buildFrame(s, parent, figma.createFrame());
    case 'text': return buildText(s, parent);
    case 'icon': return buildIcon(s, parent);
    case 'inst': return buildInst(s, parent);
    case 'rect': {
      const r = figma.createRectangle();
      applyBoxProps(r, Object.assign({ name: 'Rect' }, s));
      place(r, s, parent, 'fill', 1);
      return r;
    }
    case 'ellipse': {
      const e = figma.createEllipse();
      e.name = s.name || 'Dot';
      e.fills = s.fill ? [paint(s.fill, s.fillOpacity)] : [];
      if (s.stroke) { e.strokes = [paint(s.stroke)]; e.strokeWeight = s.strokeW || 1; }
      place(e, s, parent, s.w, s.h);
      return e;
    }
    case 'svg': {
      const n = figma.createNodeFromSvg(s.svg);
      n.name = s.name || 'Graphic';
      n.fills = [];
      n.clipsContent = false;
      place(n, s, parent, s.w, s.h);
      return n;
    }
  }
  throw new Error('Unknown spec kind ' + s.k);
}

async function buildFrame(s, parent, node) {
  applyBoxProps(node, Object.assign({ name: s.dir === 'N' ? 'Box' : (s.dir === 'H' ? 'Row' : 'Col') }, s));
  // A single child in SPACE_BETWEEN sits at the LEFT in Figma; in RTL it should hug the start (right).
  if (s.main === 'between' && (s.kids || []).length < 2) s = Object.assign({}, s, { main: 'start' });
  applyLayout(node, s);
  node.clipsContent = !!s.clip;
  const al = s.dir !== 'N';
  if (parent) place(node, s, parent, al ? 'hug' : 100, al ? 'hug' : 100);
  else {
    const sw = s.w !== undefined ? s.w : (al ? 'hug' : 100);
    const sh = s.h !== undefined ? s.h : (al ? 'hug' : 100);
    node.resize(typeof sw === 'number' ? sw : 100, typeof sh === 'number' ? sh : 100);
    if (sw === 'hug' && al) node.layoutSizingHorizontal = 'HUG';
    if (sh === 'hug' && al) node.layoutSizingVertical = 'HUG';
    if (s.x !== undefined) node.x = s.x;
    if (s.y !== undefined) node.y = s.y;
  }
  await applyEffects(node, s);
  const kids0 = s.kids || [];
  const kids = s.dir === 'H' ? kids0.slice().reverse() : kids0;
  for (const k of kids) await build(k, node);
  if (s.after) await s.after(node);
  return node;
}

async function buildText(s, parent) {
  const t = figma.createText();
  const st = TSTYLE[s.style || 'Body/Regular 14'];
  if (st) await t.setTextStyleIdAsync(st.id);
  else t.fontName = { family: FONT, style: 'Regular' };
  if (s.weight) t.fontName = { family: FONT, style: s.weight };
  t.characters = s.text;
  t.name = s.name || s.text.slice(0, 40);
  t.fills = [paint(s.color || 'text/primary', s.opacity)];
  t.textAlignHorizontal = s.align === 'center' ? 'CENTER' : (s.align === 'left' ? 'LEFT' : 'RIGHT');
  const w = s.w !== undefined ? s.w : 'hug';
  if (w === 'hug') {
    t.textAutoResize = 'WIDTH_AND_HEIGHT';
    parent.appendChild(t);
    if (isAL(parent)) t.layoutSizingHorizontal = 'HUG';
  } else {
    t.textAutoResize = 'HEIGHT';
    if (typeof w === 'number') t.resize(w, t.height);
    parent.appendChild(t);
    if (w === 'fill') t.layoutSizingHorizontal = 'FILL';
    else if (isAL(parent)) t.layoutSizingHorizontal = 'FIXED';
  }
  if (s.truncate) { t.textTruncation = 'ENDING'; t.maxLines = s.truncate; }
  if (s.abs && isAL(parent)) { t.layoutPositioning = 'ABSOLUTE'; }
  if (s.x !== undefined) t.x = s.x;
  if (s.y !== undefined) t.y = s.y;
  return t;
}

function recolorIcon(node, color) {
  const vecs = node.findAll(function (n) { return n.type === 'VECTOR'; });
  for (const v of vecs) {
    if (v.strokes && v.strokes.length) v.strokes = [paint(color)];
    if (v.fills && v.fills.length) v.fills = [paint(color)];
  }
}

async function buildIcon(s, parent) {
  const c = ICONS[s.icon];
  if (!c) throw new Error('Unknown icon ' + s.icon);
  const inst = c.createInstance();
  inst.name = s.name || ('icon/' + s.icon);
  const size = s.size || 20;
  inst.resize(size, size);
  if (s.color) recolorIcon(inst, s.color);
  parent.appendChild(inst);
  if (isAL(parent) && !s.abs) { inst.layoutSizingHorizontal = 'FIXED'; inst.layoutSizingVertical = 'FIXED'; }
  if (s.abs && isAL(parent)) inst.layoutPositioning = 'ABSOLUTE';
  if (s.x !== undefined) inst.x = s.x;
  if (s.y !== undefined) inst.y = s.y;
  return inst;
}

function variantName(c, variant) {
  const vp = Object.assign({}, c.defaults, variant || {});
  return c.order.map(function (k) { return k + '=' + vp[k]; }).join(', ');
}
function findVariant(c, variant) {
  if (!c.set) return c.node;
  const nm = variantName(c, variant);
  const v = c.set.children.find(function (x) { return x.name === nm; });
  if (!v) throw new Error('Variant not found: ' + c.name + ' [' + nm + ']');
  return v;
}

async function applyTextOverride(inst, c, key, val) {
  if (c && c.textProps[key]) {
    const o = {}; o[c.textProps[key]] = String(val);
    inst.setProperties(o);
    return;
  }
  const tn = inst.findOne(function (n) { return n.type === 'TEXT' && n.name === key; });
  if (tn) tn.characters = String(val);
  else log('override target not found: ' + key + ' in ' + inst.name, 'warn');
}

async function applyOverrides(inst, c, over) {
  for (const key of Object.keys(over)) {
    const val = over[key];
    if (key.charAt(0) === '@') {
      // nested instance: { comp, variant, text: {...}, visible }
      const nm = key.slice(1);
      const nested = inst.findOne(function (n) { return n.type === 'INSTANCE' && n.name === nm; });
      if (!nested) { log('nested not found: ' + nm + ' in ' + inst.name, 'warn'); continue; }
      if (val.visible === false) { nested.visible = false; continue; }
      const nc = COMP[val.comp];
      if (val.variant) nested.setProperties(val.variant);
      if (val.text) for (const tk of Object.keys(val.text)) await applyTextOverride(nested, nc, tk, val.text[tk]);
    } else if (key.charAt(0) === '^') {
      // icon swap: '^Icon': 'wallet' | { icon, color }
      const nm = key.slice(1);
      const nested = inst.findOne(function (n) { return n.type === 'INSTANCE' && n.name === nm; });
      if (!nested) { log('icon slot not found: ' + nm, 'warn'); continue; }
      const iconName = typeof val === 'string' ? val : val.icon;
      if (iconName && ICONS[iconName]) nested.swapComponent(ICONS[iconName]);
      if (typeof val === 'object' && val.color) recolorIcon(nested, val.color);
    } else if (key.charAt(0) === '?') {
      // boolean component property: '?Icon': true
      const nm = key.slice(1);
      if (c && c.boolProps && c.boolProps[nm]) { const o = {}; o[c.boolProps[nm]] = !!val; inst.setProperties(o); }
      else log('bool prop not found: ' + nm, 'warn');
    } else if (key.charAt(0) === '!') {
      // hide a named layer: '!Meta': true
      const nm = key.slice(1);
      const target = inst.findOne(function (n) { return n.name === nm; });
      if (target) target.visible = !val;
    } else {
      await applyTextOverride(inst, c, key, val);
    }
  }
}

async function buildInst(s, parent) {
  const c = COMP[s.comp];
  if (!c) throw new Error('Unknown component ' + s.comp);
  const main = findVariant(c, s.variant);
  const inst = main.createInstance();
  if (s.name) inst.name = s.name;
  await applyOverrides(inst, c, s.over || {});
  place(inst, s, parent, s.w !== undefined ? s.w : null, s.h !== undefined ? s.h : null);
  return inst;
}

// ---------- Component factory ----------
// def: { name, props: {k:[values]}, defaults, combos?: [ {..} ], textProps: {Label:'default'}, render(vp) -> frame spec, description }
function combos(props) {
  let out = [{}];
  for (const k of Object.keys(props)) {
    const next = [];
    for (const o of out) for (const v of props[k]) { const n = Object.assign({}, o); n[k] = v; next.push(n); }
    out = next;
  }
  return out;
}

async function defineComponent(def, board) {
  const order = Object.keys(def.props || {});
  const list = def.combos || (order.length ? combos(def.props) : [{}]);
  const comps = [];
  for (const vp of list) {
    const spec = def.render(vp);
    const node = figma.createComponent();
    await buildFrame(spec, null, node);
    node.name = order.length ? order.map(function (k) { return k + '=' + vp[k]; }).join(', ') : def.name;
    board.appendChild(node);
    comps.push(node);
  }
  let owner;
  let set = null;
  if (order.length) {
    set = figma.combineAsVariants(comps, board);
    set.name = def.name;
    set.layoutMode = def.setDir === 'V' ? 'VERTICAL' : 'HORIZONTAL';
    if (set.layoutMode === 'HORIZONTAL') { set.layoutWrap = 'WRAP'; set.counterAxisSpacing = 16; }
    set.itemSpacing = 16;
    set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 24;
    set.primaryAxisAlignItems = 'MIN';
    set.counterAxisAlignItems = 'MIN';
    set.fills = [paint('surface/card')];
    set.strokes = [paint('brand/primary', 0.35)];
    set.dashPattern = [6, 4];
    set.strokeWeight = 1;
    set.cornerRadius = 16;
    if (def.setWidth) { set.resize(def.setWidth, set.height); set.layoutSizingHorizontal = 'FIXED'; set.layoutSizingVertical = 'HUG'; }
    else { set.layoutSizingHorizontal = 'HUG'; set.layoutSizingVertical = 'HUG'; }
    owner = set;
  } else {
    owner = comps[0];
  }
  if (def.description) owner.description = def.description;
  const textProps = {};
  for (const pn of Object.keys(def.textProps || {})) {
    const key = owner.addComponentProperty(pn, 'TEXT', def.textProps[pn]);
    textProps[pn] = key;
    for (const cnode of comps) {
      const tns = cnode.findAll(function (n) { return n.type === 'TEXT' && n.name === pn; });
      for (const tn of tns) tn.componentPropertyReferences = { characters: key };
    }
  }
  const boolProps = {};
  for (const bn of Object.keys(def.boolProps || {})) {
    const bd = def.boolProps[bn];
    const key = owner.addComponentProperty(bn, 'BOOLEAN', bd.default);
    boolProps[bn] = key;
    for (const cnode of comps) {
      const ls = cnode.findAll(function (n) { return n.name === bd.layer; });
      for (const l of ls) { l.visible = !!bd.default; l.componentPropertyReferences = { visible: key }; }
    }
  }
  COMP[def.name] = { name: def.name, set: set, node: set ? null : comps[0], textProps: textProps, boolProps: boolProps, order: order, defaults: def.defaults || {} };
  return owner;
}
