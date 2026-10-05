"use strict";
// ============================================================
// FuelOS Figma builder — core: tokens, registry, layout engine
// All layout is RTL: children of Row() are listed right→left.
// ============================================================
const LOG = [];
const ERRORS = [];
function log(msg, level) {
    level = level || 'info';
    LOG.push({ msg: msg, level: level });
    if (level === 'error')
        ERRORS.push(msg);
    try {
        figma.ui.postMessage({ type: 'log', msg: msg, level: level });
    }
    catch (e) { /* ui closed */ }
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
const VARS = {}; // token name -> Variable
const TSTYLE = {}; // text style name -> TextStyle
const ESTYLE = {}; // effect style name -> EffectStyle
const ICONS = {}; // icon name -> ComponentNode
const COMP = {}; // component name -> { node|set, textProps, props, defaults, order }
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
    }
    else {
        const hex = COLORS[token];
        if (!hex)
            throw new Error('Unknown color token: ' + token);
        p = { type: 'SOLID', color: hexToRgb(hex) };
        const v = VARS[token];
        if (v)
            p = figma.variables.setBoundVariableForPaint(p, 'color', v);
    }
    if (opacity !== undefined && opacity !== null && opacity < 1)
        p = Object.assign({}, p, { opacity: opacity });
    return p;
}
// ---------- Spec constructors ----------
function flat(arr) {
    const out = [];
    (function walk(a) { for (const x of a) {
        if (Array.isArray(x))
            walk(x);
        else if (x)
            out.push(x);
    } })(arr);
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
    if (v === 'between')
        return 'SPACE_BETWEEN';
    if (v === 'center')
        return 'CENTER';
    if (dir === 'H')
        return v === 'start' ? 'MAX' : 'MIN';
    return v === 'start' ? 'MIN' : 'MAX';
}
function mapCross(v, dir) {
    if (dir === 'H') {
        v = v || 'center';
        return v === 'center' ? 'CENTER' : (v === 'start' ? 'MIN' : 'MAX');
    }
    v = v || 'start';
    return v === 'center' ? 'CENTER' : (v === 'start' ? 'MAX' : 'MIN');
}
function isAL(node) { return node && 'layoutMode' in node && node.layoutMode !== 'NONE'; }
function bindFloat(node, field, value, prefix) {
    const v = VARS[prefix + '/' + value];
    if (!v)
        return;
    try {
        node.setBoundVariable(field, v);
    }
    catch (e) { /* non-fatal */ }
}
function applyBoxProps(node, s) {
    node.name = s.name || node.name;
    node.fills = s.fill ? [paint(s.fill, s.fillOpacity)] : [];
    if (s.stroke) {
        node.strokes = [paint(s.stroke, s.strokeOpacity)];
        node.strokeWeight = s.strokeW || 1;
        node.strokeAlign = 'INSIDE';
        if (s.dash)
            node.dashPattern = [6, 4];
    }
    else if ('strokes' in node) {
        node.strokes = [];
    }
    if (s.radius !== undefined) {
        const r = typeof s.radius === 'string' ? RADII[s.radius] : s.radius;
        node.cornerRadius = r;
        if (typeof s.radius === 'string')
            ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach(function (f) { bindFloat(node, f, s.radius, 'radius'); });
    }
    if (s.opacity !== undefined)
        node.opacity = s.opacity;
}
function applyLayout(node, s) {
    const dir = s.dir;
    node.layoutMode = dir === 'H' ? 'HORIZONTAL' : (dir === 'V' ? 'VERTICAL' : 'NONE');
    if (dir === 'N')
        return;
    node.itemSpacing = s.gap || 0;
    let pad = s.pad || 0;
    if (typeof pad === 'number')
        pad = [pad, pad, pad, pad];
    else if (pad.length === 2)
        pad = [pad[0], pad[1], pad[0], pad[1]];
    node.paddingTop = pad[0];
    node.paddingRight = pad[1];
    node.paddingBottom = pad[2];
    node.paddingLeft = pad[3];
    node.primaryAxisAlignItems = mapMain(s.main, dir);
    node.counterAxisAlignItems = mapCross(s.cross, dir);
    if (s.wrap) {
        node.layoutWrap = 'WRAP';
        node.counterAxisSpacing = s.rowGap !== undefined ? s.rowGap : (s.gap || 0);
    }
    if (SPACES.indexOf(node.itemSpacing) >= 0 && node.itemSpacing > 0)
        bindFloat(node, 'itemSpacing', node.itemSpacing, 'space');
    const pf = [['paddingTop', pad[0]], ['paddingRight', pad[1]], ['paddingBottom', pad[2]], ['paddingLeft', pad[3]]];
    pf.forEach(function (x) { if (x[1] > 0 && SPACES.indexOf(x[1]) >= 0)
        bindFloat(node, x[0], x[1], 'space'); });
}
async function applyEffects(node, s) {
    if (s.shadow && ESTYLE[s.shadow]) {
        try {
            await node.setEffectStyleIdAsync(ESTYLE[s.shadow].id);
        }
        catch (e) {
            log('shadow: ' + e.message, 'warn');
        }
    }
}
// Size + append. Fixed dims before append, FILL/HUG after append.
function place(node, s, parent, defW, defH) {
    const w = s.w !== undefined ? s.w : defW;
    const h = s.h !== undefined ? s.h : defH;
    const fw = typeof w === 'number' ? w : null;
    const fh = typeof h === 'number' ? h : null;
    if (fw !== null || fh !== null)
        node.resize(fw !== null ? fw : node.width, fh !== null ? fh : node.height);
    if (s.index !== undefined)
        parent.insertChild(s.index, node);
    else
        parent.appendChild(node);
    const pAL = isAL(parent);
    if (s.abs && pAL)
        node.layoutPositioning = 'ABSOLUTE';
    if (s.x !== undefined)
        node.x = s.x;
    if (s.y !== undefined)
        node.y = s.y;
    if (s.constraints && !pAL)
        node.constraints = s.constraints;
    if (w === 'fill')
        node.layoutSizingHorizontal = 'FILL';
    else if (w === 'hug')
        node.layoutSizingHorizontal = 'HUG';
    else if (fw !== null && pAL && !s.abs)
        node.layoutSizingHorizontal = 'FIXED';
    if (h === 'fill')
        node.layoutSizingVertical = 'FILL';
    else if (h === 'hug')
        node.layoutSizingVertical = 'HUG';
    else if (fh !== null && pAL && !s.abs)
        node.layoutSizingVertical = 'FIXED';
    if (s.minW)
        node.minWidth = s.minW;
    if (s.maxW)
        node.maxWidth = s.maxW;
}
async function build(s, parent) {
    if (!s)
        return null;
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
            if (s.stroke) {
                e.strokes = [paint(s.stroke)];
                e.strokeWeight = s.strokeW || 1;
            }
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
    if (s.main === 'between' && (s.kids || []).length < 2)
        s = Object.assign({}, s, { main: 'start' });
    applyLayout(node, s);
    node.clipsContent = !!s.clip;
    const al = s.dir !== 'N';
    if (parent)
        place(node, s, parent, al ? 'hug' : 100, al ? 'hug' : 100);
    else {
        const sw = s.w !== undefined ? s.w : (al ? 'hug' : 100);
        const sh = s.h !== undefined ? s.h : (al ? 'hug' : 100);
        node.resize(typeof sw === 'number' ? sw : 100, typeof sh === 'number' ? sh : 100);
        if (sw === 'hug' && al)
            node.layoutSizingHorizontal = 'HUG';
        if (sh === 'hug' && al)
            node.layoutSizingVertical = 'HUG';
        if (s.x !== undefined)
            node.x = s.x;
        if (s.y !== undefined)
            node.y = s.y;
    }
    await applyEffects(node, s);
    const kids0 = s.kids || [];
    const kids = s.dir === 'H' ? kids0.slice().reverse() : kids0;
    for (const k of kids)
        await build(k, node);
    if (s.after)
        await s.after(node);
    return node;
}
async function buildText(s, parent) {
    const t = figma.createText();
    const st = TSTYLE[s.style || 'Body/Regular 14'];
    if (st)
        await t.setTextStyleIdAsync(st.id);
    else
        t.fontName = { family: FONT, style: 'Regular' };
    if (s.weight)
        t.fontName = { family: FONT, style: s.weight };
    t.characters = s.text;
    t.name = s.name || s.text.slice(0, 40);
    t.fills = [paint(s.color || 'text/primary', s.opacity)];
    t.textAlignHorizontal = s.align === 'center' ? 'CENTER' : (s.align === 'left' ? 'LEFT' : 'RIGHT');
    const w = s.w !== undefined ? s.w : 'hug';
    if (w === 'hug') {
        t.textAutoResize = 'WIDTH_AND_HEIGHT';
        parent.appendChild(t);
        if (isAL(parent))
            t.layoutSizingHorizontal = 'HUG';
    }
    else {
        t.textAutoResize = 'HEIGHT';
        if (typeof w === 'number')
            t.resize(w, t.height);
        parent.appendChild(t);
        if (w === 'fill')
            t.layoutSizingHorizontal = 'FILL';
        else if (isAL(parent))
            t.layoutSizingHorizontal = 'FIXED';
    }
    if (s.truncate) {
        t.textTruncation = 'ENDING';
        t.maxLines = s.truncate;
    }
    if (s.abs && isAL(parent)) {
        t.layoutPositioning = 'ABSOLUTE';
    }
    if (s.x !== undefined)
        t.x = s.x;
    if (s.y !== undefined)
        t.y = s.y;
    return t;
}
function recolorIcon(node, color) {
    const vecs = node.findAll(function (n) { return n.type === 'VECTOR'; });
    for (const v of vecs) {
        if (v.strokes && v.strokes.length)
            v.strokes = [paint(color)];
        if (v.fills && v.fills.length)
            v.fills = [paint(color)];
    }
}
async function buildIcon(s, parent) {
    const c = ICONS[s.icon];
    if (!c)
        throw new Error('Unknown icon ' + s.icon);
    const inst = c.createInstance();
    inst.name = s.name || ('icon/' + s.icon);
    const size = s.size || 20;
    inst.resize(size, size);
    if (s.color)
        recolorIcon(inst, s.color);
    parent.appendChild(inst);
    if (isAL(parent) && !s.abs) {
        inst.layoutSizingHorizontal = 'FIXED';
        inst.layoutSizingVertical = 'FIXED';
    }
    if (s.abs && isAL(parent))
        inst.layoutPositioning = 'ABSOLUTE';
    if (s.x !== undefined)
        inst.x = s.x;
    if (s.y !== undefined)
        inst.y = s.y;
    return inst;
}
function variantName(c, variant) {
    const vp = Object.assign({}, c.defaults, variant || {});
    return c.order.map(function (k) { return k + '=' + vp[k]; }).join(', ');
}
function findVariant(c, variant) {
    if (!c.set)
        return c.node;
    const nm = variantName(c, variant);
    const v = c.set.children.find(function (x) { return x.name === nm; });
    if (!v)
        throw new Error('Variant not found: ' + c.name + ' [' + nm + ']');
    return v;
}
async function applyTextOverride(inst, c, key, val) {
    if (c && c.textProps[key]) {
        const o = {};
        o[c.textProps[key]] = String(val);
        inst.setProperties(o);
        return;
    }
    const tn = inst.findOne(function (n) { return n.type === 'TEXT' && n.name === key; });
    if (tn)
        tn.characters = String(val);
    else
        log('override target not found: ' + key + ' in ' + inst.name, 'warn');
}
async function applyOverrides(inst, c, over) {
    for (const key of Object.keys(over)) {
        const val = over[key];
        if (key.charAt(0) === '@') {
            // nested instance: { comp, variant, text: {...}, visible }
            const nm = key.slice(1);
            const nested = inst.findOne(function (n) { return n.type === 'INSTANCE' && n.name === nm; });
            if (!nested) {
                log('nested not found: ' + nm + ' in ' + inst.name, 'warn');
                continue;
            }
            if (val.visible === false) {
                nested.visible = false;
                continue;
            }
            const nc = COMP[val.comp];
            if (val.variant)
                nested.setProperties(val.variant);
            if (val.text)
                for (const tk of Object.keys(val.text))
                    await applyTextOverride(nested, nc, tk, val.text[tk]);
        }
        else if (key.charAt(0) === '^') {
            // icon swap: '^Icon': 'wallet' | { icon, color }
            const nm = key.slice(1);
            const nested = inst.findOne(function (n) { return n.type === 'INSTANCE' && n.name === nm; });
            if (!nested) {
                log('icon slot not found: ' + nm, 'warn');
                continue;
            }
            const iconName = typeof val === 'string' ? val : val.icon;
            if (iconName && ICONS[iconName])
                nested.swapComponent(ICONS[iconName]);
            if (typeof val === 'object' && val.color)
                recolorIcon(nested, val.color);
        }
        else if (key.charAt(0) === '?') {
            // boolean component property: '?Icon': true
            const nm = key.slice(1);
            if (c && c.boolProps && c.boolProps[nm]) {
                const o = {};
                o[c.boolProps[nm]] = !!val;
                inst.setProperties(o);
            }
            else
                log('bool prop not found: ' + nm, 'warn');
        }
        else if (key.charAt(0) === '!') {
            // hide a named layer: '!Meta': true
            const nm = key.slice(1);
            const target = inst.findOne(function (n) { return n.name === nm; });
            if (target)
                target.visible = !val;
        }
        else {
            await applyTextOverride(inst, c, key, val);
        }
    }
}
async function buildInst(s, parent) {
    const c = COMP[s.comp];
    if (!c)
        throw new Error('Unknown component ' + s.comp);
    const main = findVariant(c, s.variant);
    const inst = main.createInstance();
    if (s.name)
        inst.name = s.name;
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
        for (const o of out)
            for (const v of props[k]) {
                const n = Object.assign({}, o);
                n[k] = v;
                next.push(n);
            }
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
        if (set.layoutMode === 'HORIZONTAL') {
            set.layoutWrap = 'WRAP';
            set.counterAxisSpacing = 16;
        }
        set.itemSpacing = 16;
        set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 24;
        set.primaryAxisAlignItems = 'MIN';
        set.counterAxisAlignItems = 'MIN';
        set.fills = [paint('surface/card')];
        set.strokes = [paint('brand/primary', 0.35)];
        set.dashPattern = [6, 4];
        set.strokeWeight = 1;
        set.cornerRadius = 16;
        if (def.setWidth) {
            set.resize(def.setWidth, set.height);
            set.layoutSizingHorizontal = 'FIXED';
            set.layoutSizingVertical = 'HUG';
        }
        else {
            set.layoutSizingHorizontal = 'HUG';
            set.layoutSizingVertical = 'HUG';
        }
        owner = set;
    }
    else {
        owner = comps[0];
    }
    if (def.description)
        owner.description = def.description;
    const textProps = {};
    for (const pn of Object.keys(def.textProps || {})) {
        const key = owner.addComponentProperty(pn, 'TEXT', def.textProps[pn]);
        textProps[pn] = key;
        for (const cnode of comps) {
            const tns = cnode.findAll(function (n) { return n.type === 'TEXT' && n.name === pn; });
            for (const tn of tns)
                tn.componentPropertyReferences = { characters: key };
        }
    }
    const boolProps = {};
    for (const bn of Object.keys(def.boolProps || {})) {
        const bd = def.boolProps[bn];
        const key = owner.addComponentProperty(bn, 'BOOLEAN', bd.default);
        boolProps[bn] = key;
        for (const cnode of comps) {
            const ls = cnode.findAll(function (n) { return n.name === bd.layer; });
            for (const l of ls) {
                l.visible = !!bd.default;
                l.componentPropertyReferences = { visible: key };
            }
        }
    }
    COMP[def.name] = { name: def.name, set: set, node: set ? null : comps[0], textProps: textProps, boolProps: boolProps, order: order, defaults: def.defaults || {} };
    return owner;
}
// ============================================================
// Setup: fonts, pages, cleanup of previous runs, variables, styles, icons
// ============================================================
async function setupFonts() {
    const fonts = await figma.listAvailableFontsAsync();
    const has = function (fam, st) { return fonts.some(function (f) { return f.fontName.family === fam && f.fontName.style === st; }); };
    if (has('Cairo', 'Bold'))
        FONT = 'Cairo';
    else if (has('Noto Sans Arabic', 'Bold'))
        FONT = 'Noto Sans Arabic';
    else {
        FONT = 'Inter';
        log('لم يتم العثور على خط Cairo — سيُستخدم خط بديل', 'warn');
    }
    const styles = FONT === 'Inter' ? ['Regular', 'Medium', 'Semi Bold', 'Bold'] : ['Regular', 'Medium', 'SemiBold', 'Bold'];
    for (const st of styles)
        await figma.loadFontAsync({ family: FONT, style: st });
    log('الخط: ' + FONT);
}
function fontStyle(w) { if (FONT === 'Inter' && w === 'SemiBold')
    return 'Semi Bold'; return w; }
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
        if (pristine) {
            for (const n of first.children.slice())
                n.remove();
            ds = first;
        }
        else
            ds = figma.createPage();
        ds.setPluginData('fuelos', 'ds');
    }
    if (!sc) {
        sc = figma.createPage();
        sc.setPluginData('fuelos', 'screens');
    }
    ds.name = PAGE_DS;
    sc.name = PAGE_SCREENS;
    // remove previously generated nodes (screens first, then design-system content)
    for (const p of [sc, ds]) {
        await p.loadAsync();
        for (const n of p.children.slice())
            if (n.getPluginData('fuelos') === 'gen')
                n.remove();
    }
    return { ds: ds, sc: sc };
}
async function setupVariables() {
    const cols = await figma.variables.getLocalVariableCollectionsAsync();
    for (const c of cols)
        if (c.name === PREFIX + ' Colors' || c.name === PREFIX + ' Spacing')
            c.remove();
    const colors = figma.variables.createVariableCollection(PREFIX + ' Colors');
    colors.renameMode(colors.modes[0].modeId, 'Light');
    const cm = colors.modes[0].modeId;
    for (const name of Object.keys(COLORS)) {
        const v = figma.variables.createVariable(name, colors, 'COLOR');
        const rgb = hexToRgb(COLORS[name]);
        v.setValueForMode(cm, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
        if (name.indexOf('text/') === 0)
            v.scopes = ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'];
        else if (name.indexOf('border/') === 0)
            v.scopes = ['STROKE_COLOR', 'SHAPE_FILL'];
        else
            v.scopes = ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR'];
        VARS[name] = v;
    }
    const sp = figma.variables.createVariableCollection(PREFIX + ' Spacing');
    sp.renameMode(sp.modes[0].modeId, 'Default');
    const sm = sp.modes[0].modeId;
    for (const s of SPACES) {
        const v = figma.variables.createVariable('space/' + s, sp, 'FLOAT');
        v.setValueForMode(sm, s);
        v.scopes = ['GAP'];
        VARS['space/' + s] = v;
    }
    for (const k of Object.keys(RADII)) {
        const v = figma.variables.createVariable('radius/' + k, sp, 'FLOAT');
        v.setValueForMode(sm, RADII[k]);
        v.scopes = ['CORNER_RADIUS'];
        VARS['radius/' + k] = v;
    }
    log('المتغيرات: ' + Object.keys(VARS).length);
}
async function setupStyles() {
    const ts = await figma.getLocalTextStylesAsync();
    for (const s of ts)
        if (s.getPluginData('fuelos') === 'gen')
            s.remove();
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
    for (const s of es)
        if (s.getPluginData('fuelos') === 'gen')
            s.remove();
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
            if (v.strokes && v.strokes.length)
                v.strokes = [paint('text/secondary')];
        }
        board.appendChild(comp);
        ICONS[name] = comp;
    }
    log('الأيقونات: ' + names.length);
}
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
    if (!page) {
        page = figma.createPage();
        page.setPluginData('fuelos', C_PAGE_KEY);
    }
    page.name = C_PAGE_NAME;
    await page.loadAsync();
    for (const n of page.children.slice())
        if (n.getPluginData('fuelos') === 'gen')
            n.remove();
    return page;
}
// Reuse "FuelOS Colors" / "FuelOS Spacing" when they exist; create only missing variables.
async function cEnsureVariables() {
    const cols = await figma.variables.getLocalVariableCollectionsAsync();
    const all = await figma.variables.getLocalVariablesAsync();
    function collection(name, modeName) {
        let c = cols.find(function (x) { return x.name === name; });
        if (!c) {
            c = figma.variables.createVariableCollection(name);
            c.renameMode(c.modes[0].modeId, modeName);
        }
        for (const v of all)
            if (v.variableCollectionId === c.id)
                VARS[v.name] = v;
        return c;
    }
    const colors = collection(PREFIX + ' Colors', 'Light');
    const cm = colors.modes[0].modeId;
    let created = 0;
    for (const name of Object.keys(COLORS)) {
        if (VARS[name])
            continue;
        const v = figma.variables.createVariable(name, colors, 'COLOR');
        const rgb = hexToRgb(COLORS[name]);
        v.setValueForMode(cm, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
        VARS[name] = v;
        created++;
    }
    const sp = collection(PREFIX + ' Spacing', 'Default');
    const sm = sp.modes[0].modeId;
    for (const s of SPACES) {
        const n = 'space/' + s;
        if (!VARS[n]) {
            const v = figma.variables.createVariable(n, sp, 'FLOAT');
            v.setValueForMode(sm, s);
            VARS[n] = v;
            created++;
        }
    }
    for (const k of Object.keys(RADII)) {
        const n = 'radius/' + k;
        if (!VARS[n]) {
            const v = figma.variables.createVariable(n, sp, 'FLOAT');
            v.setValueForMode(sm, RADII[k]);
            VARS[n] = v;
            created++;
        }
    }
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
        }
        else {
            try {
                await figma.loadFontAsync(s.fontName);
            }
            catch (e) { /* font of an existing style not available */ }
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
            if (v.strokes && v.strokes.length)
                v.strokes = [paint('text/secondary')];
        }
        holder.appendChild(comp);
        ICONS[name] = comp;
    }
    log('الأيقونات: ' + names.length);
}
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
    return Row({ name: opt.name || 'IconBox', w: size, h: size, radius: opt.radius || 10, fill: opt.bg || 'brand/primary-50', main: 'center', cross: 'center' }, Ico(icon, { name: opt.iconName || 'Icon', size: opt.iconSize || Math.round(size * 0.5), color: opt.fg || 'brand/primary' }));
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
            return Row({ name: 'Button', h: lg ? 56 : 40, pad: lg ? [0, 24] : [0, 16], gap: 8, radius: lg ? 14 : 10, fill: map.fill, stroke: map.stroke, main: 'center', cross: 'center' }, Ico('plus', { name: 'Icon', size: lg ? 22 : 18, color: map.text }), Txt('زر', { name: 'Label', style: lg ? 'Button/Large 18' : 'Body/Strong 14', color: map.text }));
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
            return Row({ name: 'Badge', h: 24, pad: [0, 10], gap: 6, radius: 999, fill: t.bg, cross: 'center' }, Dot(6, t.fg, { name: 'Dot' }), Txt('حالة', { name: 'Label', style: 'Label/12', color: t.text }));
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
            return Row({ name: 'Sync', h: 26, pad: [0, 10], gap: 6, radius: 999, fill: m[0], cross: 'center' }, Ico(m[2], { name: 'Icon', size: 14, color: m[1] }), Txt({ online: 'متصل', offline: 'غير متصل', syncing: 'جارٍ المزامنة' }[vp.state], { name: 'Label', style: 'Label/11', color: m[1] }));
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
            return Col({ name: 'Input', w: 340, gap: 6 }, Txt('العنوان', { name: 'Label', style: 'Label/12', color: 'text/secondary' }), Row({ name: 'Field', w: 'fill', h: lg ? 64 : 44, pad: [0, 14], gap: 8, radius: lg ? 14 : 10, fill: 'surface/card', stroke: stroke, strokeW: vp.state === 'default' ? 1 : 2 }, Txt('القيمة', { name: 'Value', style: lg ? 'Number/L 24' : 'Body/Large 16', w: 'fill' }), Txt('لتر', { name: 'Suffix', style: 'Body/Small 12', color: 'text/muted' })), Txt('نص مساعد', { name: 'Helper', style: 'Body/Small 12', color: vp.state === 'error' ? 'status/danger-700' : 'text/muted' }));
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
                return Row({ name: 'Segment ' + i, w: 'fill', h: 40, radius: 9, fill: on ? 'surface/card' : null, shadow: on ? 'Shadow/Card' : null, main: 'center', cross: 'center' }, Txt(i === 1 ? 'باللتر' : 'بالمبلغ', { name: 'Option ' + i, style: 'Body/Strong 14', color: on ? 'text/primary' : 'text/secondary' }));
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
            return Row({ name: 'Payment', w: 171, h: 60, pad: [0, 14], gap: 10, radius: 14, fill: on ? 'brand/primary-50' : 'surface/card', stroke: on ? 'brand/primary' : 'border/default', strokeW: on ? 2 : 1, cross: 'center' }, Ico('cash', { name: 'Icon', size: 22, color: on ? 'brand/primary' : 'text/secondary' }), Txt('نقدي', { name: 'Label', style: 'Body/Strong 14', color: on ? 'brand/primary' : 'text/primary', w: 'fill' }), on ? Row({ name: 'Check', w: 20, h: 20, radius: 999, fill: 'brand/primary', main: 'center', cross: 'center' }, Ico('check', { size: 14, color: 'text/on-dark' })) : null);
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
            return Row({ name: 'Alert', w: 360, pad: [12, 14], gap: 12, radius: 12, fill: t.bg, stroke: t.fg, strokeOpacity: 0.35, cross: 'start' }, Row({ name: 'IconBox', w: 32, h: 32, radius: 8, fill: 'surface/card', main: 'center', cross: 'center' }, Ico(t.icon, { name: 'Icon', size: 18, color: t.fg })), Col({ name: 'Text', w: 'fill', gap: 2 }, Txt('عنوان التنبيه', { name: 'Title', style: 'Body/Strong 14', color: t.text, w: 'fill' }), Txt('وصف مختصر للتنبيه والإجراء المقترح', { name: 'Body', style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })), Txt('مراجعة', { name: 'Action', style: 'Label/12', color: t.text }));
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
            return Col({ name: 'KPI Card', w: 264, pad: 20, gap: 12, radius: 16, fill: 'surface/card', stroke: alert ? 'status/danger' : 'border/default', strokeOpacity: alert ? 0.5 : 1, shadow: 'Shadow/Card' }, Row({ name: 'Header', w: 'fill', main: 'between' }, Row({ gap: 10 }, IconBox('chart', { bg: alert ? 'status/danger-50' : 'brand/primary-50', fg: alert ? 'status/danger' : 'brand/primary' }), Txt('مبيعات اليوم', { name: 'Title', style: 'Body/Strong 14', color: 'text/secondary' })), Inst('Status Badge', { tone: 'info' }, { Label: 'تقديري' }, { name: 'Badge' })), Row({ name: 'Value row', gap: 6, cross: 'end' }, Txt('2,026,400', { name: 'Value', style: 'Number/XL 32', color: alert ? 'status/danger-700' : 'text/primary' }), Txt('ل.س', { name: 'Unit', style: 'Body/Strong 14', color: 'text/muted' })), Row({ name: 'Meta row', gap: 6 }, Ico('trendUp', { name: 'TrendIcon', size: 16, color: alert ? 'status/danger' : 'brand/action' }), Txt('+8.2% عن أمس', { name: 'Meta', style: 'Body/Small 12', color: 'text/secondary' })));
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
            return Col({ name: 'Tank', w: 320, pad: 16, gap: 10, radius: 12, fill: 'surface/card', stroke: 'border/default' }, Row({ name: 'Head', w: 'fill', main: 'between', cross: 'start' }, Col({ gap: 0 }, Txt('بنزين 95', { name: 'Fuel', style: 'Body/Strong 14' }), Txt('خزان 3 · سعة 20,000 لتر', { name: 'Tank', style: 'Body/Small 12', color: 'text/muted' })), Txt(vp.level + '%', { name: 'Percent', style: 'Number/M 18', color: color === 'brand/primary' ? 'text/primary' : color })), Box({ name: 'Track', w: 'fill', h: 10, radius: 999, fill: 'surface/muted', clip: true }, Rect({ name: 'Level', w: fw, h: 10, x: TW - fw, y: 0, fill: color, radius: 999, constraints: { horizontal: 'SCALE', vertical: 'SCALE' } })), Row({ name: 'Foot', w: 'fill', main: 'between' }, Txt('دفتري 12,000 لتر', { name: 'Current', style: 'Body/Small 12', color: 'text/secondary' }), Txt('آخر قياس 07:30', { name: 'Updated', style: 'Body/Small 12', color: 'text/muted' })));
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
            return Row({ name: 'Invoice', w: 358, pad: 14, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default', cross: 'start' }, IconBox('receipt', { size: 40, radius: 12 }), Col({ name: 'Body', w: 'fill', gap: 4 }, Row({ w: 'fill', main: 'between' }, Txt('محطة النور', { name: 'Station', style: 'Body/Strong 14' }), Txt('5,000 ل.س', { name: 'Total', style: 'Number/M 18' })), Row({ w: 'fill', main: 'between' }, Txt('بنزين 95 · 40.0 لتر', { name: 'Details', style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }), Inst('Status Badge', { tone: b[0] }, { Label: b[1] }, { name: 'Badge' })), Txt('الخميس 24 سبتمبر · 10:48', { name: 'Date', style: 'Body/Small 12', color: 'text/muted' })));
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
                return Col({ name: 'Step ' + i, gap: 6, cross: 'center', w: 96 }, Row({ name: 'Circle', w: 32, h: 32, radius: 999, fill: done ? 'brand/action' : (now ? 'brand/primary' : 'surface/muted'), main: 'center', cross: 'center' }, done ? Ico('check', { size: 16, color: 'brand/on-action' }) : Txt(String(i), { style: 'Body/Strong 14', color: now ? 'text/on-dark' : 'text/muted' })), Txt(labels[i - 1], { name: 'Label', style: 'Label/12', color: now ? 'text/primary' : 'text/muted', align: 'center' }));
            }
            function line(i) { return Rect({ name: 'Line', w: 'fill', h: 2, fill: i < cur ? 'brand/action' : 'border/default' }); }
            return Row({ name: 'Stepper', w: 358, cross: 'start', gap: 0 }, step(1), Col({ w: 'fill', pad: [15, 0, 0, 0] }, line(1)), step(2), Col({ w: 'fill', pad: [15, 0, 0, 0] }, line(2)), step(3));
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
            return Row({ name: 'Nav', w: 224, h: 40, pad: [0, 12], gap: 12, radius: 10, fill: on ? 'brand/primary' : null }, Ico('home', { name: 'Icon', size: 20, color: on ? 'text/on-dark' : 'text/on-dark-muted' }), Txt('لوحة القيادة', { name: 'Label', style: 'Body/Strong 14', color: on ? 'text/on-dark' : 'text/on-dark-muted', w: 'fill' }), Row({ name: 'Count pill', h: 20, pad: [0, 7], radius: 999, fill: 'status/warning', main: 'center', cross: 'center' }, Txt('3', { name: 'Count', style: 'Label/11', color: 'brand/dark' })));
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
            return Col({ name: 'Tab Bar', w: 390, h: 84, fill: 'surface/card' }, Rect({ name: 'Top border', w: 'fill', h: 1, fill: 'border/default' }), Row({ name: 'Tabs', w: 'fill', h: 'fill', pad: [10, 12, 22, 12], cross: 'start' }, tabs.map(function (t) {
                const on = t[0] === vp.active;
                return Col({ name: 'Tab ' + t[0], w: 'fill', gap: 4, cross: 'center' }, Ico(t[1], { size: 24, color: on ? 'brand/primary' : 'text/muted' }), Txt(t[2], { style: 'Label/11', color: on ? 'brand/primary' : 'text/muted' }));
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
                return Row({ name: 'Entry', w: 'fill', gap: 12, cross: 'start' }, Col({ name: 'Rail', cross: 'center', gap: 4, pad: [4, 0, 0, 0] }, Dot(10, dot), last ? null : Rect({ name: 'Rail line', w: 2, h: 64, fill: 'border/default' })), Col({ w: 'fill', gap: 2, pad: [0, 0, 12, 0] }, Row({ w: 'fill', main: 'between' }, Txt(who, { style: 'Body/Strong 14' }), Txt(when, { style: 'Body/Small 12', color: 'text/muted' })), Txt(what, { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' }), why ? Row({ pad: [6, 10], radius: 8, fill: 'surface/muted', w: 'fill' }, Txt(why, { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })) : null));
            }
            return Col({ name: 'Drawer', w: 420, h: 880, pad: 24, gap: 20, fill: 'surface/card', shadow: 'Shadow/Drawer' }, Row({ w: 'fill', main: 'between', cross: 'start' }, Col({ gap: 2, w: 'fill' }, Row({ gap: 8 }, Ico('history', { size: 20, color: 'brand/primary' }), Txt('سجل المراجعة', { name: 'Title', style: 'Heading/H2 20' })), Txt('القيد JE-2026-1042 · فرق صندوق المناوبة', { name: 'Subtitle', style: 'Body/Small 12', color: 'text/muted', w: 'fill' })), Row({ w: 36, h: 36, radius: 10, fill: 'surface/muted', main: 'center', cross: 'center' }, Ico('x', { size: 18 }))), Col({ name: 'Source', w: 'fill', pad: 14, gap: 8, radius: 12, fill: 'brand/primary-50' }, Txt('مصدر القيد', { style: 'Label/12', color: 'brand/primary' }), Row({ w: 'fill', main: 'between' }, Txt('إغلاق مناوبة · المضخة 3', { style: 'Body/Strong 14' }), Txt('فتح المصدر', { style: 'Label/12', color: 'brand/primary' })), Txt('أحمد سالم · الخميس 24 سبتمبر · 14:05', { style: 'Body/Small 12', color: 'text/secondary' })), Col({ name: 'Lines', w: 'fill', gap: 8 }, Txt('طرفا القيد', { style: 'Label/12', color: 'text/muted' }), Row({ w: 'fill', main: 'between', pad: [10, 12], radius: 10, stroke: 'border/default' }, Txt('مدين · عجز صندوق المناوبات', { style: 'Body/Regular 14' }), Txt('4,500', { style: 'Body/Strong 14' })), Row({ w: 'fill', main: 'between', pad: [10, 12], radius: 10, stroke: 'border/default' }, Txt('دائن · الصندوق الرئيسي', { style: 'Body/Regular 14' }), Txt('4,500', { style: 'Body/Strong 14' })), Row({ gap: 6 }, Ico('checkCircle', { size: 16, color: 'brand/action' }), Txt('القيد متوازن', { style: 'Label/12', color: 'brand/action-700' }))), Col({ name: 'Timeline', w: 'fill', gap: 0 }, Txt('التاريخ', { style: 'Label/12', color: 'text/muted' }), Col({ w: 'fill', gap: 0, pad: [12, 0, 0, 0] }, entry('brand/primary', 'النظام', '14:05', 'أُنشئ القيد تلقائياً من إغلاق المناوبة', null, false), entry('status/warning', 'أحمد سالم · عامل', '14:07', 'أضاف سبب الفرق وصورة للصندوق', '«دفعة بطاقة سُجلت نقداً بالخطأ»', false), entry('brand/action', 'خالد العمر · صاحب المحطة', '14:32', 'اعتمد الإغلاق وحوّل الفرق إلى حساب العجز', null, true))), VSpacer(), Row({ w: 'fill', pad: 12, gap: 10, radius: 10, fill: 'status/warning-50', cross: 'start' }, Ico('lock', { size: 18, color: 'status/warning-700' }), Txt('لا يمكن حذف الحركات المالية. التصحيح يتم بقيد عكسي مع ذكر السبب والصلاحية.', { style: 'Body/Small 12', color: 'status/warning-700', w: 'fill' })));
        }
    }
];
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
    W = W || 358;
    H = H || 201;
    const art = {
        oil: { a: '#0C2B3E', b: '#0F766E', shapes: '<circle cx="70" cy="150" r="110" fill="#10B981" opacity=".18"/><circle cx="70" cy="150" r="70" fill="#10B981" opacity=".22"/>' +
                '<path d="M70 70c0 0-34 38-34 62a34 34 0 0 0 68 0c0-24-34-62-34-62z" fill="#ECFDF5" opacity=".95"/>' +
                '<path d="M58 132a12 12 0 0 0 12 12" stroke="#0F766E" stroke-width="5" fill="none" stroke-linecap="round"/>' },
        tyres: { a: '#B45309', b: '#F59E0B', shapes: '<circle cx="78" cy="118" r="70" fill="none" stroke="#071E2D" stroke-width="22" opacity=".85"/>' +
                '<circle cx="78" cy="118" r="34" fill="none" stroke="#FFF7E6" stroke-width="8"/>' +
                '<circle cx="78" cy="118" r="8" fill="#FFF7E6"/>' +
                '<path d="M8 196 L120 30" stroke="#FFF7E6" stroke-width="2" opacity=".35"/><path d="M40 200 L150 40" stroke="#FFF7E6" stroke-width="2" opacity=".25"/>' },
        insurance: { a: '#0369A1', b: '#0284C7', shapes: '<rect x="-20" y="120" width="220" height="120" rx="60" fill="#E0F2FE" opacity=".18"/>' +
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
            return Col({ name: 'Tab Bar', w: 390, h: 84, fill: 'surface/card' }, Rect({ name: 'Top border', w: 'fill', h: 1, fill: 'border/default' }), Row({ name: 'Tabs', w: 'fill', h: 'fill', pad: [8, 6, 22, 6], cross: 'start' }, C_TABS.map(function (t) {
                const on = t[0] === vp.active;
                return Col({ name: 'Tab ' + t[0], w: 'fill', gap: 3, cross: 'center' }, Row({ name: 'Pill', w: 44, h: 28, radius: 999, fill: on ? 'brand/primary-50' : null, main: 'center', cross: 'center' }, Ico(t[1], { size: 20, color: on ? 'brand/primary' : 'text/muted' })), Txt(t[2], { style: 'Label/11', color: on ? 'brand/primary' : 'text/muted' }));
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
            return Box({ name: 'Ad', w: 358, h: 201, radius: 18, clip: true, fill: 'brand/dark' }, Svg(adArt(vp.art, 358, 201), 358, 201, { name: 'Ad image', x: 0, y: 0 }), Col({ name: 'Copy', x: 150, y: 52, w: 190, gap: 4 }, Txt(c[0], { name: 'Title', style: 'Heading/H2 20', color: 'text/on-dark', w: 'fill' }), Txt(c[1], { name: 'Sub', style: 'Body/Small 12', color: 'text/on-dark', opacity: 0.85, w: 'fill' })), Row({ name: 'Sponsor tag', x: 214, y: 158, h: 26, pad: [0, 10], gap: 6, radius: 999, fill: 'brand/dark', fillOpacity: 0.55 }, Txt('إعلان', { style: 'Label/11', color: 'text/on-dark-muted' }), Txt(c[2], { name: 'Sponsor', style: 'Label/11', color: 'text/on-dark' })));
        }
    }
];
const C_REUSED = ['Button', 'Status Badge', 'Input', 'Segmented Control', 'Alert Banner'];
async function cBuildComponents(board) {
    const defs = COMPONENT_DEFS.filter(function (d) { return C_REUSED.indexOf(d.name) >= 0; }).concat(C_COMPONENT_DEFS);
    for (const d of defs) {
        try {
            const wrap = await build(Col({ name: d.name, w: 'fill', gap: 10 }, Txt(d.name, { style: 'Heading/H3 16' }), Txt(d.description || '', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' })), board);
            const owner = await defineComponent(d, wrap);
            owner.name = 'زبون/' + d.name; // instances still resolve through COMP[d.name]
            log('مكوّن: ' + d.name);
        }
        catch (e) {
            log('فشل المكوّن ' + d.name + ': ' + e.message, 'error');
        }
        await tick();
    }
}
// ============================================================
// Layout helpers shared by boards and screens
// ============================================================
function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n)
    out.push(arr.slice(i, i + n)); return out; }
function Card(p) {
    const kids = Array.prototype.slice.call(arguments, 1);
    return Col(Object.assign({ name: 'Card', w: 'fill', pad: 20, gap: 14, radius: 16, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Card' }, p || {}), kids);
}
function CardHeader(title, opt) {
    opt = opt || {};
    return Row({ name: 'Card header', w: 'fill', main: 'between' }, Row({ gap: 8 }, opt.icon ? Ico(opt.icon, { size: 20, color: 'brand/primary' }) : null, Txt(title, { style: 'Heading/H3 16' }), opt.sub ? Txt(opt.sub, { style: 'Body/Small 12', color: 'text/muted' }) : null), opt.right || null);
}
function LinkText(t, p) { return Txt(t, Object.assign({ style: 'Label/12', color: 'brand/primary' }, p || {})); }
function Badge(tone, label, p) { return Inst('Status Badge', { tone: tone }, { Label: label }, p); }
function Chip(label, on, p) {
    p = p || {};
    return Row(Object.assign({ name: 'Chip', h: p.h || 36, pad: [0, 14], gap: 6, radius: 999, fill: on ? 'brand/primary' : 'surface/card', stroke: on ? null : 'border/default', main: 'center' }, p), p.icon ? Ico(p.icon, { size: 16, color: on ? 'text/on-dark' : 'text/secondary' }) : null, Txt(label, { style: 'Body/Strong 14', color: on ? 'text/on-dark' : 'text/secondary' }));
}
function SectionTitle(num, title, sub) {
    return Col({ name: 'Section title', w: 'fill', gap: 4 }, Row({ gap: 12 }, Row({ w: 36, h: 36, radius: 10, fill: 'brand/primary', main: 'center', cross: 'center' }, Txt(String(num), { style: 'Heading/H3 16', color: 'text/on-dark' })), Txt(title, { style: 'Heading/H1 24' })), sub ? Txt(sub, { style: 'Body/Large 16', color: 'text/secondary', w: 'fill' }) : null);
}
function Bullets(items, p) {
    p = p || {};
    return Col({ name: 'Bullets', w: 'fill', gap: p.gap || 6 }, items.map(function (t) {
        return Row({ w: 'fill', gap: 8, cross: 'start' }, Col({ pad: [8, 0, 0, 0] }, Dot(6, p.dot || 'brand/primary')), Txt(t, { style: p.style || 'Body/Regular 14', color: p.color || 'text/secondary', w: 'fill' }));
    }));
}
// Table: cols = [{ t: 'العنوان', w: 120 | 'fill', align }], rows = [[cell,...]] where cell = string | spec
function Table(cols, rows, p) {
    p = p || {};
    function cell(c, col, head) {
        const w = col.w || 'fill';
        if (c && typeof c === 'object' && c.k)
            return Row({ name: 'Cell', w: w, main: col.align === 'left' ? 'end' : (col.align === 'center' ? 'center' : 'start') }, c);
        return Txt(String(c), { name: 'Cell', w: w, style: head ? 'Label/12' : (col.strong ? 'Body/Strong 14' : 'Body/Regular 14'), color: head ? 'text/muted' : (col.color || 'text/primary'), align: col.align || 'right' });
    }
    const head = Row({ name: 'Head', w: 'fill', pad: [10, 16], gap: 16, fill: 'surface/muted', radius: p.flatHead ? 0 : 10 }, cols.map(function (col) { return cell(col.t, col, true); }));
    const body = [];
    rows.forEach(function (r, i) {
        body.push(Row({ name: 'Row ' + (i + 1), w: 'fill', pad: [p.rowPad || 12, 16], gap: 16, fill: r.highlight ? r.highlight : null }, r.map(function (c, j) { return cell(c, cols[j], false); })));
        if (i < rows.length - 1)
            body.push(Divider());
    });
    return Col({ name: p.name || 'Table', w: p.w || 'fill', gap: 0 }, head, body);
}
// Key/value row
function KV(k, v, p) {
    p = p || {};
    return Row({ name: 'KV', w: 'fill', main: 'between', pad: p.pad || [0, 0] }, Txt(k, { style: 'Body/Regular 14', color: 'text/secondary' }), typeof v === 'string' ? Txt(v, { style: p.vStyle || 'Body/Strong 14', color: p.vColor || 'text/primary' }) : v);
}
function Money(value, p) {
    p = p || {};
    return Row({ name: 'Money', gap: 4, cross: 'end' }, Txt(value, { style: p.style || 'Number/L 24', color: p.color || 'text/primary' }), Txt(p.unit || 'ل.س', { style: p.unitStyle || 'Body/Small 12', color: 'text/muted' }));
}
function Avatar(initials, size, p) {
    p = p || {};
    size = size || 36;
    return Row({ name: 'Avatar', w: size, h: size, radius: 999, fill: p.fill || 'brand/primary-50', main: 'center', cross: 'center' }, Txt(initials, { style: size >= 40 ? 'Body/Strong 14' : 'Label/12', color: p.color || 'brand/primary' }));
}
// ============================================================
// Design-system page: boards for foundations, components, icons
// ============================================================
async function makeBoard(page, title, sub, x, w) {
    const spec = Col({ name: title, w: w, pad: 56, gap: 40, radius: 32, fill: 'surface/page', x: x, y: 0 }, Col({ name: 'Board header', w: 'fill', gap: 8 }, Txt('FuelOS · نظام تشغيل محطة الوقود', { style: 'Label/12', color: 'brand/primary' }), Txt(title, { style: 'Display/32' }), sub ? Txt(sub, { style: 'Body/Large 16', color: 'text/secondary', w: 'fill' }) : null));
    const node = await buildFrame(spec, null, figma.createFrame());
    page.appendChild(node);
    node.x = x;
    node.y = 0;
    node.setPluginData('fuelos', 'gen');
    return node;
}
async function addTo(parent, spec) { return build(spec, parent); }
async function buildComponentsBoard(board) {
    const groups = {};
    for (const d of COMPONENT_DEFS)
        (groups[d.group] = groups[d.group] || []).push(d);
    const order = ['أساسيات', 'تنقل', 'مكوّنات الملف'];
    for (const g of order) {
        if (!groups[g])
            continue;
        const sec = await build(Col({ name: 'Group · ' + g, w: 'fill', gap: 20 }, Txt(g === 'مكوّنات الملف' ? 'المكوّنات الستة من ملف المواصفات' : (g === 'أساسيات' ? 'مكوّنات أساسية مستنتجة من الشاشات' : 'التنقل'), { style: 'Heading/H1 24' })), board);
        for (const d of groups[g]) {
            try {
                const wrap = await build(Col({ name: d.name, w: 'fill', gap: 10 }, Txt(d.name, { style: 'Heading/H3 16' }), Txt(d.description || '', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' })), sec);
                await defineComponent(d, wrap);
                log('مكوّن: ' + d.name);
            }
            catch (e) {
                log('فشل المكوّن ' + d.name + ': ' + e.message, 'error');
            }
            await tick();
        }
    }
}
async function buildIconsBoard(board) {
    const holder = await build(Col({ name: 'Icons', w: 'fill', gap: 16 }, Txt('الأيقونات', { style: 'Heading/H1 24' }), Txt('أيقونات خطية 24px بسماكة 2px. غيّر اللون عبر overrides، والحجم بتغيير أبعاد النسخة.', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' })), board);
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
    const colorSec = Col({ name: 'Colors', w: 'fill', gap: 24 }, Txt('الألوان', { style: 'Heading/H1 24' }), Txt('الألوان الستة من الملف (مميّزة بإطار) مع درجات مساعدة للنصوص والحدود والخلفيات. كلها متغيرات Variables مربوطة بالمكوّنات.', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' }), groups.map(function (g) {
        return Col({ name: g[0], w: 'fill', gap: 12 }, Txt(g[0], { style: 'Heading/H3 16', color: 'text/secondary' }), chunk(g[1], 5).map(function (row) {
            return Row({ w: 'fill', gap: 16, cross: 'start' }, row.map(function (tok) {
                const fromSpec = !!COLOR_DOC[tok];
                return Col({ name: tok, w: 'fill', gap: 6 }, Box({ name: 'Swatch', w: 'fill', h: 72, radius: 12, fill: tok, stroke: fromSpec ? 'brand/action' : 'border/default', strokeW: fromSpec ? 3 : 1 }), Txt(tok, { style: 'Label/12' }), Txt(COLORS[tok], { style: 'Body/Small 12', color: 'text/muted' }), fromSpec ? Txt(COLOR_DOC[tok], { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }) : null);
            }), row.length < 5 ? [0, 0, 0, 0, 0].slice(row.length).map(function () { return Spacer({ w: 'fill' }); }) : null);
        }));
    }));
    await build(colorSec, board);
    // Typography
    const sample = { Display: 'نظام تشغيل المحطة', Heading: 'لوحة القيادة', Body: 'كل عملية تشغيلية تتحول إلى أثر محاسبي قابل للتتبع.', Label: 'آخر تحديث 07:30', Number: '2,026,400', Button: 'حفظ العملية' };
    const typeSec = Col({ name: 'Typography', w: 'fill', gap: 12 }, Txt('الخطوط', { style: 'Heading/H1 24' }), Txt('الخط: ' + FONT + ' — واضح بالعربية ويعرض الأرقام بشكل ممتاز. الأرقام لاتينية (0-9) لسهولة قراءة المبالغ.', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' }), Col({ w: 'fill', gap: 0, pad: [8, 24], radius: 16, fill: 'surface/card', stroke: 'border/default' }, TEXT_STYLES.map(function (d, i) {
        const fam = d[0].split('/')[0];
        return Col({ w: 'fill', gap: 0 }, Row({ w: 'fill', main: 'between', pad: [14, 0] }, Txt(sample[fam] || 'نص', { style: d[0] }), Txt(d[0] + ' · ' + d[1] + 'px · ' + d[2] + ' · ' + d[3] + '%', { style: 'Body/Small 12', color: 'text/muted' })), i < TEXT_STYLES.length - 1 ? Divider() : null);
    })));
    await build(typeSec, board);
    // Spacing & radius
    const spSec = Col({ name: 'Spacing & radius', w: 'fill', gap: 16 }, Txt('المسافات والزوايا', { style: 'Heading/H1 24' }), Row({ w: 'fill', gap: 20, cross: 'end', pad: 24, radius: 16, fill: 'surface/card', stroke: 'border/default' }, SPACES.map(function (s) {
        return Col({ gap: 8, cross: 'center' }, Rect({ w: s, h: 48, fill: 'brand/primary-50', stroke: 'brand/primary' }), Txt('space/' + s, { style: 'Label/11', color: 'text/secondary' }));
    })), Row({ w: 'fill', gap: 20, pad: 24, radius: 16, fill: 'surface/card', stroke: 'border/default' }, Object.keys(RADII).map(function (k) {
        return Col({ gap: 8, cross: 'center' }, Box({ w: 72, h: 72, radius: Math.min(RADII[k], 36), fill: 'brand/primary-50', stroke: 'brand/primary' }), Txt('radius/' + k + ' · ' + RADII[k], { style: 'Label/11', color: 'text/secondary' }));
    })));
    await build(spSec, board);
    // Grid & frames
    const gridSec = Col({ name: 'Frames', w: 'fill', gap: 16 }, Txt('مقاسات الإطارات والشبكة', { style: 'Heading/H1 24' }), Row({ w: 'fill', gap: 16, cross: 'start' }, [['صاحب المحطة والأدمن', '1440 x 1024', 'شريط جانبي 256 يمين · هوامش 32 · مسافة 20'], ['موظف المحطة', '390 x 844', 'هوامش 16 · أزرار 56 · لمسات 3-4 لكل عملية'], ['الزبون', '390 x 844', 'هوامش 16 · شريط تبويب سفلي 84']].map(function (f) {
        return Col({ w: 'fill', pad: 20, gap: 6, radius: 16, fill: 'surface/card', stroke: 'border/default' }, Txt(f[0], { style: 'Heading/H3 16' }), Txt(f[1], { style: 'Number/L 24', color: 'brand/primary' }), Txt(f[2], { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }));
    })));
    await build(gridSec, board);
}
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
    return Col({ name: 'Sidebar', w: 256, h: 'fill', pad: [24, 16], gap: 20, fill: 'brand/dark' }, Row({ name: 'Logo', w: 'fill', gap: 10, pad: [0, 6] }, Row({ w: 38, h: 38, radius: 11, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 20, color: 'brand/dark' })), Col({ gap: 0 }, Txt(opt.admin ? 'FuelOS Admin' : 'FuelOS', { style: 'Heading/H3 16', color: 'text/on-dark' }), Txt(opt.admin ? 'إدارة شبكة المحطات' : 'نظام تشغيل المحطة', { style: 'Body/Small 12', color: 'text/on-dark-muted' }))), opt.admin ? null : Row({ name: 'Station switcher', w: 'fill', pad: 12, gap: 10, radius: 12, fill: 'brand/dark-800', stroke: 'brand/dark-700' }, Row({ w: 32, h: 32, radius: 9, fill: 'brand/dark-700', main: 'center', cross: 'center' }, Ico('pin', { size: 16, color: 'brand/action' })), Col({ w: 'fill', gap: 0 }, Txt(opt.station || 'محطة النور', { style: 'Body/Strong 14', color: 'text/on-dark' }), Txt(opt.stationSub || 'الفرع الرئيسي · 6 مضخات', { style: 'Body/Small 12', color: 'text/on-dark-muted' })), Ico('chevronDown', { size: 16, color: 'text/on-dark-muted' })), nav.map(function (g) {
        return Col({ name: 'Nav · ' + g[0], w: 'fill', gap: 2 }, Txt(g[0], { style: 'Label/11', color: 'text/on-dark-muted', w: 'fill' }), g[1].map(function (it) {
            const on = it[0] === active;
            const over = { Label: it[2], '^Icon': { icon: it[1], color: on ? 'text/on-dark' : 'text/on-dark-muted' } };
            if (it[3]) {
                over['?Show count'] = true;
                over.Count = it[3];
            }
            return Inst('Nav Item', { state: on ? 'active' : 'default' }, over, { w: 'fill', name: 'Nav · ' + it[0] });
        }));
    }), VSpacer(), Row({ name: 'User', w: 'fill', pad: 12, gap: 10, radius: 12, fill: 'brand/dark-800' }, Avatar(user[0], 36, { fill: 'brand/primary', color: 'text/on-dark' }), Col({ w: 'fill', gap: 0 }, Txt(user[1], { style: 'Body/Strong 14', color: 'text/on-dark' }), Txt(user[2], { style: 'Body/Small 12', color: 'text/on-dark-muted' })), Ico('logout', { size: 18, color: 'text/on-dark-muted' })));
}
function PageHeader(title, sub, actions) {
    return Row({ name: 'Page header', w: 'fill', main: 'between', cross: 'center' }, Col({ gap: 2 }, Txt(title, { style: 'Heading/H1 24' }), sub ? Txt(sub, { style: 'Body/Regular 14', color: 'text/secondary' }) : null), Row({ gap: 10 }, actions || []));
}
function Btn(type, label, icon, p) {
    const over = { Label: label };
    if (icon) {
        over['?Show icon'] = true;
        over['^Icon'] = { icon: icon, color: ({ primary: 'text/on-dark', action: 'brand/on-action', secondary: 'text/primary', ghost: 'brand/primary', danger: 'status/danger-700' })[type] };
    }
    return Inst('Button', { type: type, size: (p && p.size) || 'md' }, over, Object.assign({ name: 'Button · ' + label }, p || {}));
}
function IconBtn(icon, p) {
    p = p || {};
    return Row({ name: 'Icon button', w: p.size || 40, h: p.size || 40, radius: p.radius || 10, fill: p.fill || 'surface/card', stroke: p.stroke === undefined ? 'border/default' : p.stroke, main: 'center', cross: 'center' }, Ico(icon, { size: p.iconSize || 18, color: p.color || 'text/secondary' }), p.dot ? Dot(8, 'status/danger', { abs: true, x: (p.size || 40) - 12, y: 6 }) : null);
}
function PeriodChips(activeIdx, labels) {
    labels = labels || ['اليوم', 'أمس', 'هذا الأسبوع', 'هذا الشهر'];
    return Row({ name: 'Period', pad: 4, gap: 2, radius: 12, fill: 'surface/card', stroke: 'border/default' }, labels.map(function (l, i) {
        const on = i === activeIdx;
        return Row({ h: 32, pad: [0, 14], radius: 9, fill: on ? 'brand/primary' : null, main: 'center' }, Txt(l, { style: 'Body/Strong 14', color: on ? 'text/on-dark' : 'text/secondary' }));
    }));
}
function Desktop(name, active, main, opt) {
    opt = opt || {};
    return Row({ name: name, w: 1440, h: opt.h || 1024, fill: 'surface/page', clip: true, cross: 'start' }, Sidebar(active, opt.sidebar), Col(Object.assign({ name: 'Main', w: 'fill', h: 'fill', pad: [28, 32], gap: 20, clip: true }, opt.mainProps || {}), main), opt.left || null);
}
// ---------- mobile ----------
function StatusBar(dark) {
    const c = dark ? 'text/on-dark' : 'text/primary';
    return Row({ name: 'Status bar', w: 'fill', h: 44, pad: [0, 24], main: 'between' }, Txt('9:41', { style: 'Body/Strong 14', color: c }), Row({ gap: 6 }, Row({ gap: 2, cross: 'end' }, [4, 6, 8, 10].map(function (h) { return Rect({ w: 3, h: h, radius: 1, fill: c }); })), Ico('wifi', { size: 16, color: c }), Row({ w: 26, h: 12, radius: 3, stroke: c, strokeOpacity: 0.5, pad: 2 }, Rect({ w: 18, h: 8, radius: 1, fill: c }))));
}
function Mobile(name, kids, opt) {
    opt = opt || {};
    return Col({ name: name, w: 390, h: 844, fill: opt.fill || 'surface/page', clip: true, radius: 0 }, kids);
}
function WorkerHeader(opt) {
    opt = opt || {};
    return Col({ name: 'Worker header', w: 'fill', pad: [0, 16, 16, 16], gap: 10, fill: 'brand/dark' }, StatusBar(true), Row({ w: 'fill', main: 'between' }, opt.back
        ? Row({ gap: 10 }, IconBtn('arrowRight', { fill: 'brand/dark-800', stroke: null, color: 'text/on-dark' }), Col({ gap: 0 }, Txt(opt.title, { style: 'Heading/H3 16', color: 'text/on-dark' }), Txt(opt.sub || 'أحمد سالم · المضخة 3', { style: 'Body/Small 12', color: 'text/on-dark-muted' })))
        : Row({ gap: 10 }, Avatar('أس', 40, { fill: 'brand/primary', color: 'text/on-dark' }), Col({ gap: 0 }, Txt('أحمد سالم', { style: 'Heading/H3 16', color: 'text/on-dark' }), Txt(opt.sub || 'محطة النور · عامل تعبئة', { style: 'Body/Small 12', color: 'text/on-dark-muted' }))), Inst('Sync Indicator', { state: opt.sync || 'online' }, { Label: opt.syncLabel || ({ online: 'متصل', offline: 'غير متصل', syncing: 'جارٍ المزامنة' })[opt.sync || 'online'] })), opt.chips ? Row({ w: 'fill', gap: 8 }, opt.chips.map(function (c) {
        return Row({ h: 28, pad: [0, 10], gap: 6, radius: 999, fill: 'brand/dark-800' }, Ico(c[0], { size: 14, color: 'brand/action' }), Txt(c[1], { style: 'Label/12', color: 'text/on-dark' }));
    })) : null);
}
function BottomBar(kids) {
    return Col({ name: 'Bottom bar', w: 'fill', gap: 0, fill: 'surface/card' }, Rect({ name: 'Top border', w: 'fill', h: 1, fill: 'border/default' }), Col({ w: 'fill', pad: [12, 16, 28, 16], gap: 10 }, kids));
}
// ---------- charts ----------
function lineChartSvg(W, H, series, maxV) {
    let s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" fill="none" xmlns="http://www.w3.org/2000/svg">';
    for (let i = 0; i <= 4; i++) {
        const y = Math.round(6 + (H - 12) * i / 4);
        s += '<path d="M0 ' + y + 'H' + W + '" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="4 4"/>';
    }
    series.forEach(function (se) {
        const n = se.values.length;
        const pts = se.values.map(function (v, i) { return [W - 6 - ((W - 12) * i / (n - 1)), 6 + (H - 12) * (1 - v / maxV)]; });
        const d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
        if (se.area)
            s += '<path d="' + d + ' L' + pts[n - 1][0].toFixed(1) + ' ' + H + ' L' + pts[0][0].toFixed(1) + ' ' + H + ' Z" fill="' + se.color + '" fill-opacity="0.08"/>';
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
// ============================================================
// Screens page: one Section per interface (multi-row) + prototype links
// ============================================================
const SCREEN_NODES = {}; // code (e.g. 'O1') -> frame node
async function buildSection(page, title, sub, rows, x, y, gap) {
    const PAD = 80, TOP = 150, ROWGAP = 160;
    const built = rows.map(function (fns) {
        const specs = [];
        for (const fn of fns) {
            try {
                specs.push(fn());
            }
            catch (e) {
                log('تجهيز ' + fn.name + ': ' + e.message, 'error');
            }
        }
        let w = 0, h = 0;
        specs.forEach(function (s, i) { w += s.w + (i ? gap : 0); h = Math.max(h, s.h); });
        return { specs: specs, w: w, h: h };
    });
    const innerW = Math.max.apply(null, built.map(function (r) { return r.w; }));
    const totalH = built.reduce(function (a, r, i) { return a + r.h + (i ? ROWGAP : 0); }, 0);
    const W = innerW + PAD * 2, H = TOP + totalH + PAD;
    const section = figma.createSection();
    section.name = title;
    page.appendChild(section);
    section.x = x;
    section.y = y;
    section.resizeWithoutConstraints(W, H);
    section.fills = [paint('surface/muted')];
    section.setPluginData('fuelos', 'gen');
    const head = await buildFrame(Col({ name: 'Section title', w: 1400, gap: 6 }, Txt(title, { style: 'Display/32', w: 'fill' }), Txt(sub, { style: 'Body/Large 16', color: 'text/secondary', w: 'fill' })), null, figma.createFrame());
    section.appendChild(head);
    head.x = W - PAD - 1400;
    head.y = 40;
    let cy = TOP;
    for (const r of built) {
        // RTL: first screen of a row sits at the right edge
        let cx = W - PAD;
        for (const spec of r.specs) {
            cx -= spec.w;
            try {
                const node = await buildFrame(spec, null, figma.createFrame());
                section.appendChild(node);
                node.x = cx;
                node.y = cy;
                SCREEN_NODES[spec.name.split(' ')[0]] = node;
                log('شاشة: ' + spec.name);
            }
            catch (e) {
                log('فشلت الشاشة ' + spec.name + ': ' + e.message, 'error');
            }
            cx -= gap;
            await tick();
        }
        cy += r.h + ROWGAP;
    }
    return { w: W, h: H };
}
async function linkTo(node, code) {
    const dest = SCREEN_NODES[code];
    if (!node || !dest)
        return false;
    const reaction = { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: dest.id, navigation: 'NAVIGATE', transition: { type: 'DISSOLVE', easing: { type: 'EASE_OUT' }, duration: 0.2 }, resetVideoPosition: false }] };
    try {
        if (typeof node.setReactionsAsync === 'function')
            await node.setReactionsAsync([reaction]);
        else
            node.reactions = [reaction];
        return true;
    }
    catch (e) {
        try {
            reaction.actions[0].transition = null;
            if (typeof node.setReactionsAsync === 'function')
                await node.setReactionsAsync([reaction]);
            else
                node.reactions = [reaction];
            return true;
        }
        catch (e2) {
            return false;
        }
    }
}
function findIn(code, pred) {
    const f = SCREEN_NODES[code];
    if (!f)
        return null;
    return f.findOne(pred);
}
function byName(name) { return function (n) { return n.name === name; }; }
async function buildPrototype(page) {
    let links = 0, fails = 0;
    async function L(node, code) { if (!node)
        return; if (await linkTo(node, code))
        links++;
    else
        fails++; }
    // sidebar navigation on every desktop screen
    for (const code of Object.keys(SCREEN_NODES)) {
        const f = SCREEN_NODES[code];
        const navs = f.findAll(function (n) { return n.type === 'INSTANCE' && n.name.indexOf('Nav · ') === 0; });
        for (const n of navs) {
            const key = n.name.slice(6);
            if (NAV_TARGET[key] && NAV_TARGET[key] !== code)
                await L(n, NAV_TARGET[key]);
        }
    }
    // owner shortcuts
    await L(findIn('L1', byName('Button · دخول')), 'O1');
    await L(findIn('O1', function (n) { return n.name === 'Risks'; }), 'O7');
    await L(findIn('O2', byName('Button · إضافة توريد')), 'O8');
    await L(findIn('O3', byName('Button · اعتماد الإغلاق')), 'O7');
    // worker flow
    await L(findIn('L2', byName('Keypad')), 'S1');
    await L(findIn('S1', byName('Button · ابدأ المناوبة')), 'S2');
    await L(findIn('S2', byName('Button · حفظ العملية')), 'S3');
    await L(findIn('S2', byName('Customer link')), 'S8');
    await L(findIn('S3', byName('Button · عملية جديدة')), 'S2');
    await L(findIn('S8', byName('Button · اعتماد العملية')), 'S3');
    await L(findIn('S9', byName('Button · طلب موافقة المدير')), 'S2');
    await L(findIn('S4', byName('Button · التالي: النقد الفعلي')), 'S5');
    await L(findIn('S5', byName('Button · التالي: المراجعة')), 'S6');
    await L(findIn('S6', byName('Button · إرسال للاعتماد')), 'S7');
    await L(findIn('S7', byName('Button · تم')), 'L2');
    // customer flow
    await L(findIn('L3', byName('Button · تأكيد')), 'C1');
    await L(findIn('C1', byName('Station · محطة النور')), 'C2');
    await L(findIn('C3', function (n) { return n.type === 'INSTANCE' && n.name.indexOf('Invoice') >= 0; }), 'C4');
    const tabMap = { 'Tab home': 'C1', 'Tab invoices': 'C3', 'Tab account': 'C5' };
    for (const code of ['C1', 'C3', 'C4', 'C5', 'C6', 'C7']) {
        const f = SCREEN_NODES[code];
        if (!f)
            continue;
        for (const t of Object.keys(tabMap))
            if (tabMap[t] !== code)
                await L(f.findOne(byName(t)), tabMap[t]);
    }
    const shortcuts = SCREEN_NODES.C1 ? SCREEN_NODES.C1.findOne(byName('Shortcuts')) : null;
    if (shortcuts) {
        const kids = shortcuts.children; // Figma order is left→right; RTL list was [car, receipt, tag, message]
        const map = { 'سيارتي': 'C5', 'فواتيري': 'C3', 'العروض': 'C6', 'الشكاوى': 'C7' };
        for (const k of kids) {
            const t = k.findOne(function (n) { return n.type === 'TEXT'; });
            if (t && map[t.characters])
                await L(k, map[t.characters]);
        }
    }
    // flow starting points
    try {
        const starts = [['L1', 'مسار صاحب المحطة'], ['L2', 'مسار العامل'], ['L3', 'مسار الزبون'], ['A1', 'مسار أدمن المنصة']]
            .filter(function (s) { return SCREEN_NODES[s[0]]; }).map(function (s) { return { nodeId: SCREEN_NODES[s[0]].id, name: s[1] }; });
        page.flowStartingPoints = starts;
    }
    catch (e) {
        log('نقاط بداية النموذج: ' + e.message, 'warn');
    }
    log('روابط النموذج التفاعلي: ' + links + (fails ? ' (تعذّر ' + fails + ')' : ''), fails ? 'warn' : 'info');
}
async function buildScreens(page) {
    let y = 0;
    const sec = [
        ['صاحب المحطة والمحاسبة — كمبيوتر 1440', 'O1–O11 · التشغيل والمالية والعملاء والإعدادات. الشريط الجانبي يمين، وأخطر معلومة أعلى الشاشة، وكل رقم يُفتح على مصدره.', [OWNER_SCREENS.concat([O6_Reports]), OWNER_MORE.slice(1)], 120],
        ['موظف المحطة — هاتف 390', 'L2 + S1–S9 · الدخول برمز PIN، بداية المناوبة، التعبئة السريعة، الحفظ دون اتصال، البيع الآجل وتجاوز الحد، وإغلاق المناوبة بثلاث خطوات.', [[L2_WorkerPin].concat(STAFF_SCREENS).concat(STAFF_MORE)], 80],
        ['الزبون — هاتف 390', 'L3 + C1–C7 · الدخول برمز التحقق، الرئيسية، صفحة المحطة، الفواتير، مصروف السيارة، المكافآت والشكاوى. كل سعر يظهر مع وقت تحديثه ومصدره.', [[L3_CustomerOtp].concat(CUSTOMER_SCREENS).concat(CUSTOMER_MORE)], 80],
        ['أدمن المنصة — كمبيوتر 1440', 'A1–A4 · لوحة المنصة، انضمام محطة جديدة، الاشتراكات والباقات، الصلاحيات والسجلات والدعم. الصحة التقنية مفصولة عن مال المحطات.', [ADMIN_SCREENS], 120],
        ['الدخول والحالات العامة — كمبيوتر 1440', 'L1 + ST1–ST4 · تسجيل الدخول، التحميل (skeleton)، الحالة الفارغة، الخطأ مع سبب وإجراء، وعدم امتلاك الصلاحية.', [STATE_SCREENS], 120]
    ];
    for (const s of sec) {
        const r = await buildSection(page, s[0], s[1], s[2], 0, y, s[3]);
        y += r.h + 200;
    }
    await buildPrototype(page);
}
// ============================================================
// Customer app — current version (mirrors apps/customer as built):
// guest price board, sign-in / sign-up (email + password), 6-tab bottom bar,
// card QR, invoices, rewards & offers, complaints (list / new / thread),
// vehicles & spend, sponsor ads (home banner + /ads page). Mobile 390×844.
// ============================================================
// ---------- shared pieces ----------
function CTabBar(active) { return Inst('Customer Tab Bar', { active: active }, {}, { w: 'fill', name: 'Tab Bar' }); }
function CTop(title, opt) {
    opt = opt || {};
    return Row({ name: 'Top bar', w: 'fill', pad: [4, 16, 8, 16], gap: 10 }, opt.back ? Row({ name: 'Back' }, IconBtn('arrowRight', { radius: 999 })) : null, Col({ w: 'fill', gap: 0 }, Txt(title, { style: opt.back ? 'Heading/H2 20' : 'Heading/H1 24' }), opt.sub ? Txt(opt.sub, { style: 'Body/Small 12', color: 'text/muted', w: 'fill' }) : null), opt.right || null);
}
function CScroll(kids, p) {
    return Col(Object.assign({ name: 'Scroll', w: 'fill', h: 'fill', pad: [4, 16, 20, 16], gap: 16, clip: true }, p || {}), kids);
}
function Progress(width, pct, color) {
    const fw = Math.max(6, Math.round(width * pct));
    return Row({ name: 'Progress', w: 'fill', h: 8, radius: 999, fill: 'surface/muted', clip: true }, Rect({ name: 'Value', w: fw, h: 8, radius: 999, fill: color || 'brand/primary' }));
}
function FuelChips(active) {
    const list = ['الكل', 'بنزين 95', 'بنزين 90', 'ديزل'];
    return Row({ name: 'Fuel filter', w: 'fill', gap: 8 }, list.map(function (l) { return Chip(l, l === active, { h: 34 }); }));
}
function CStation(o) {
    const tone = { 'متوفر': 'success', 'كمية محدودة': 'warning', 'غير متوفر': 'danger' };
    return Col({ name: 'Station · ' + o.name, w: 'fill', pad: [14, 16], gap: 6, radius: 18, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Card' }, Row({ w: 'fill', main: 'between', cross: 'start' }, Col({ gap: 0 }, Txt(o.name, { style: 'Heading/H3 16' }), Txt(o.city, { style: 'Body/Small 12', color: 'text/muted' })), o.map ? Row({ name: 'Map link', gap: 4, pad: [6, 0, 0, 0] }, Ico('pin', { size: 14, color: 'brand/primary' }), LinkText('الموقع على الخريطة')) : null), Col({ name: 'Prices', w: 'fill', gap: 0 }, o.prices.map(function (p, i) {
        return [i ? Divider() : null,
            Row({ name: 'Price · ' + p[0], w: 'fill', pad: [10, 0], gap: 10 }, Txt(p[0], { style: 'Body/Strong 14', w: 'fill' }), Badge(tone[p[2]], p[2]), Row({ gap: 3, cross: 'end', w: 92, main: 'end' }, Txt(p[1], { style: 'Number/M 18', color: p[2] === 'غير متوفر' ? 'text/muted' : 'text/primary' }), Txt('ل.س', { style: 'Label/11', color: 'text/muted' })))];
    })), Row({ gap: 6, pad: [4, 0, 0, 0] }, Ico('clock', { size: 14, color: o.stale ? 'status/warning-700' : 'text/muted' }), Txt(o.updated, { style: 'Body/Small 12', color: o.stale ? 'status/warning-700' : 'text/muted' })));
}
const ST_NOOR = { name: 'محطة النور', city: 'دمشق · المزة', map: true, prices: [['بنزين 95', '125', 'متوفر'], ['بنزين 90', '110', 'متوفر'], ['ديزل', '95', 'كمية محدودة']], updated: 'آخر تحديث قبل 20 دقيقة · من إدارة المحطة' };
const ST_HAIF = { name: 'محطة أبو الهيف', city: 'دمشق · أوتوستراد درعا', map: false, prices: [['بنزين 95', '124', 'متوفر'], ['بنزين 90', '110', 'غير متوفر'], ['ديزل', '96', 'متوفر']], updated: 'آخر تحديث قبل 3 ساعات — قد لا يكون دقيقاً', stale: true };
function AdBanner() {
    return Col({ name: 'Ads banner', w: 'fill', gap: 8 }, Row({ w: 'fill', main: 'between' }, Row({ gap: 6 }, Ico('megaphone', { size: 16, color: 'text/muted' }), Txt('من رعاة FuelOS', { style: 'Label/12', color: 'text/muted' })), LinkText('عرض الكل', { name: 'See all ads' })), Inst('Ad Slide', { art: 'oil' }, {}, { name: 'Banner slide' }), Row({ name: 'Dots', w: 'fill', gap: 6, main: 'center' }, Rect({ name: 'Dot active', w: 18, h: 6, radius: 999, fill: 'brand/primary' }), Dot(6, 'border/strong'), Dot(6, 'border/strong')));
}
function StepDots(labels, current) {
    return Row({ name: 'Timeline', w: 'fill', cross: 'start', gap: 0 }, labels.map(function (l, i) {
        const done = i < current, now = i === current;
        const step = Col({ name: 'Step ' + (i + 1), w: 84, gap: 6, cross: 'center' }, Row({ w: 28, h: 28, radius: 999, fill: done ? 'brand/action' : (now ? 'brand/primary' : 'surface/muted'), main: 'center', cross: 'center' }, done ? Ico('check', { size: 14, color: 'brand/on-action' }) : Txt(String(i + 1), { style: 'Label/12', color: now ? 'text/on-dark' : 'text/muted' })), Txt(l, { style: 'Label/12', color: now || done ? 'text/primary' : 'text/muted', align: 'center' }));
        return i === labels.length - 1 ? [step] : [step, Col({ w: 'fill', pad: [13, 0, 0, 0] }, Rect({ w: 'fill', h: 2, fill: done ? 'brand/action' : 'border/default' }))];
    }));
}
function qrSvg(px) {
    const N = 25, m = px / N;
    let seed = 7;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    function finder(x, y) { return '<rect x="' + x * m + '" y="' + y * m + '" width="' + 7 * m + '" height="' + 7 * m + '" fill="#071E2D"/><rect x="' + (x + 1) * m + '" y="' + (y + 1) * m + '" width="' + 5 * m + '" height="' + 5 * m + '" fill="#fff"/><rect x="' + (x + 2) * m + '" y="' + (y + 2) * m + '" width="' + 3 * m + '" height="' + 3 * m + '" fill="#071E2D"/>'; }
    function inFinder(x, y) { return (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9); }
    let cells = '';
    for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++)
            if (!inFinder(x, y) && rnd() > 0.52)
                cells += '<rect x="' + (x * m).toFixed(2) + '" y="' + (y * m).toFixed(2) + '" width="' + m.toFixed(2) + '" height="' + m.toFixed(2) + '" fill="#071E2D"/>';
    return '<svg width="' + px + '" height="' + px + '" viewBox="0 0 ' + px + ' ' + px + '" xmlns="http://www.w3.org/2000/svg"><rect width="' + px + '" height="' + px + '" fill="#fff"/>' + cells + finder(0, 0) + finder(N - 7, 0) + finder(0, N - 7) + '</svg>';
}
// ---------- screens ----------
function CU1_HomeGuest() {
    return Mobile('CU1 · الرئيسية — زائر', [
        StatusBar(false),
        CScroll([
            Row({ w: 'fill', main: 'between' }, Col({ gap: 0 }, Txt('أسعار المحطات', { style: 'Heading/H1 24' }), Txt('تصفّح دون حساب، أو سجّل الدخول لمزيد', { style: 'Body/Small 12', color: 'text/muted' })), Btn('action', 'تسجيل الدخول')),
            AdBanner(),
            FuelChips('الكل'),
            CStation(ST_NOOR),
            CStation(ST_HAIF)
        ])
    ]);
}
function CU2_Home() {
    return Mobile('CU2 · الرئيسية', [
        StatusBar(false),
        CScroll([
            Row({ w: 'fill', main: 'between' }, Col({ gap: 0 }, Txt('مرحباً، سامر', { style: 'Heading/H1 24' }), Txt('تصفّح المحطات القريبة وأسعارها', { style: 'Body/Small 12', color: 'text/muted' })), Row({ name: 'Sign out', gap: 6, h: 40, pad: [0, 4] }, Ico('logout', { size: 18, color: 'brand/primary' }), Txt('خروج', { style: 'Body/Strong 14', color: 'brand/primary' }))),
            AdBanner(),
            FuelChips('بنزين 95'),
            CStation({ name: ST_NOOR.name, city: ST_NOOR.city, map: true, prices: [ST_NOOR.prices[0]], updated: ST_NOOR.updated }),
            CStation({ name: ST_HAIF.name, city: ST_HAIF.city, map: false, prices: [ST_HAIF.prices[0]], updated: ST_HAIF.updated, stale: true })
        ]),
        CTabBar('home')
    ]);
}
function CU3_Station() {
    function price(fuel, p, tone, av, last) {
        return [Row({ name: 'Price · ' + fuel, w: 'fill', pad: [12, 0], gap: 12 }, Row({ w: 40, h: 40, radius: 12, fill: 'brand/primary-50', main: 'center', cross: 'center' }, Ico('droplet', { size: 20, color: 'brand/primary' })), Col({ w: 'fill', gap: 4 }, Txt(fuel, { style: 'Body/Strong 14' }), Badge(tone, av)), Row({ gap: 4, cross: 'end' }, Txt(p, { style: 'Number/L 24', color: tone === 'danger' ? 'text/muted' : 'text/primary' }), Txt('ل.س/لتر', { style: 'Body/Small 12', color: 'text/muted' }))),
            last ? null : Divider()];
    }
    return Mobile('CU3 · صفحة المحطة', [
        Col({ name: 'Hero', w: 'fill', pad: [0, 16, 20, 16], gap: 14, fill: 'brand/dark' }, StatusBar(true), Row({ name: 'Back', gap: 8 }, IconBtn('arrowRight', { fill: 'brand/dark-800', stroke: null, color: 'text/on-dark', radius: 999 }), Txt('رجوع', { style: 'Body/Strong 14', color: 'text/on-dark' })), Row({ w: 'fill', gap: 12 }, Row({ w: 56, h: 56, radius: 16, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 28, color: 'brand/dark' })), Col({ w: 'fill', gap: 2 }, Txt('محطة النور', { style: 'Heading/H1 24', color: 'text/on-dark' }), Txt('دمشق · المزة', { style: 'Body/Small 12', color: 'text/on-dark-muted' }))), Btn('action', 'الاتجاهات', 'navigation', { w: 'fill', size: 'lg' })),
        CScroll([
            Card({ name: 'Prices', gap: 0, pad: [14, 16] }, Row({ w: 'fill', main: 'between', pad: [0, 0, 4, 0] }, Txt('الأسعار المنشورة', { style: 'Heading/H3 16' }), Badge('primary', 'من إدارة المحطة')), price('بنزين 95', '125', 'success', 'متوفر'), price('بنزين 90', '110', 'success', 'متوفر'), price('ديزل', '95', 'warning', 'كمية محدودة', true), Row({ gap: 6, pad: [8, 0, 0, 0] }, Ico('clock', { size: 14, color: 'text/muted' }), Txt('آخر تحديث اليوم 08:40 · من إدارة المحطة', { style: 'Body/Small 12', color: 'text/muted' }))),
            Row({ name: 'Wrong price', w: 'fill', pad: [14, 16], gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default' }, IconBox('alert', { bg: 'status/warning-50', fg: 'status/warning-700' }), Col({ w: 'fill', gap: 0 }, Txt('السعر غير صحيح؟', { style: 'Body/Strong 14' }), Txt('أرسل بلاغ سعر للمحطة وسنتابعه', { style: 'Body/Small 12', color: 'text/muted' })), Ico('chevronLeft', { size: 18, color: 'text/muted' }))
        ]),
        CTabBar('home')
    ]);
}
function AuthShell(name, active, fields, cta) {
    return Mobile(name, [
        StatusBar(false),
        Col({ name: 'Auth', w: 'fill', h: 'fill', pad: [24, 20, 28, 20], gap: 20 }, Row({ w: 56, h: 56, radius: 16, fill: 'brand/dark', main: 'center', cross: 'center' }, Ico('fuel', { size: 28, color: 'brand/action' })), Col({ w: 'fill', gap: 4 }, Txt('أهلاً بك في FuelOS', { style: 'Heading/H1 24' }), Txt('فواتيرك ونقاطك وأسعار المحطات في مكان واحد', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' })), Inst('Segmented Control', { active: active }, { 'Option 1': 'دخول', 'Option 2': 'حساب جديد' }, { w: 'fill', name: 'Auth tabs' }), fields, cta, VSpacer(), Row({ name: 'Browse as guest', w: 'fill', main: 'center', gap: 6 }, Txt('تصفّح المحطات دون حساب', { style: 'Body/Strong 14', color: 'brand/primary' }), Ico('chevronLeft', { size: 16, color: 'brand/primary' })))
    ]);
}
function CField(label, value, opt) {
    opt = opt || {};
    const over = { Label: label, Value: value };
    if (opt.suffix)
        over.Suffix = opt.suffix;
    else
        over['!Suffix'] = true;
    if (opt.helper)
        over.Helper = opt.helper;
    else
        over['!Helper'] = true;
    return Inst('Input', { size: 'md', state: opt.state || 'default' }, over, { w: 'fill', name: 'Field · ' + label });
}
function CU4_SignIn() {
    return AuthShell('CU4 · تسجيل الدخول', '1', [
        CField('البريد الإلكتروني', 'samer@example.com'),
        CField('كلمة المرور', '••••••••••', { suffix: 'إظهار' })
    ], Btn('primary', 'دخول', null, { w: 'fill', size: 'lg' }));
}
function CU5_SignUp() {
    return AuthShell('CU5 · حساب جديد', '2', [
        CField('البريد الإلكتروني', 'samer@example.com'),
        CField('كلمة المرور', '••••••••••', { suffix: 'إظهار', helper: '8 أحرف على الأقل' }),
        CField('تأكيد كلمة المرور', '•••••••', { state: 'error', helper: 'كلمتا المرور غير متطابقتين' })
    ], Btn('primary', 'إنشاء الحساب', null, { w: 'fill', size: 'lg' }));
}
function MonthSwitch(label) {
    return Row({ name: 'Month', w: 'fill', main: 'between', pad: [6, 6], radius: 14, fill: 'surface/card', stroke: 'border/default' }, IconBtn('chevronRight', { stroke: null, fill: 'surface/muted', radius: 10, size: 36 }), Txt(label, { style: 'Heading/H3 16' }), IconBtn('chevronLeft', { stroke: null, fill: 'surface/muted', radius: 10, size: 36, color: 'text/muted' }));
}
function CInvoice(i, o) {
    const b = { 'مؤكدة': 'success', 'بانتظار المحطة': 'warning', 'مصحّحة': 'info', 'ملغاة': 'neutral' }[o.status];
    return Row({ name: 'Invoice · ' + i, w: 'fill', pad: 14, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default', cross: 'start' }, IconBox('receipt', { size: 40, radius: 12, bg: o.status === 'ملغاة' ? 'surface/muted' : 'brand/primary-50', fg: o.status === 'ملغاة' ? 'text/muted' : 'brand/primary' }), Col({ w: 'fill', gap: 4 }, Row({ w: 'fill', main: 'between' }, Txt(o.station, { style: 'Body/Strong 14' }), Money(o.total, { style: 'Number/M 18', color: o.status === 'ملغاة' ? 'text/muted' : 'text/primary' })), Row({ w: 'fill', main: 'between' }, Txt(o.details, { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }), Badge(b, o.status)), Txt(o.date, { style: 'Body/Small 12', color: 'text/muted' })));
}
function CU6_Invoices() {
    function stat(v, l) { return Col({ w: 'fill', gap: 0, cross: 'center' }, Txt(v, { style: 'Number/M 18' }), Txt(l, { style: 'Body/Small 12', color: 'text/muted' })); }
    return Mobile('CU6 · فواتيري', [
        StatusBar(false),
        CTop('فواتيري', { sub: 'كل تعبئة رُبطت ببطاقتك واعتمدتها المحطة' }),
        CScroll([
            MonthSwitch('أكتوبر 2026'),
            Row({ name: 'Totals', w: 'fill', pad: [14, 8], radius: 16, fill: 'brand/primary-50' }, stat('+120', 'نقطة'), Rect({ w: 1, h: 32, fill: 'border/strong' }), stat('186.4', 'لتر'), Rect({ w: 1, h: 32, fill: 'border/strong' }), stat('6', 'تعبئات')),
            Row({ name: 'Car filter', w: 'fill', gap: 8 }, Chip('كل السيارات', true, { h: 32 }), Chip('كيا ريو', false, { h: 32, icon: 'car' }), Chip('هيونداي', false, { h: 32, icon: 'car' })),
            CInvoice(1, { station: 'محطة النور', total: '5,000', details: 'بنزين 95 · 40.0 لتر · كيا ريو', status: 'مؤكدة', date: 'الخميس 1 أكتوبر · 10:48' }),
            CInvoice(2, { station: 'محطة أبو الهيف', total: '3,720', details: 'بنزين 95 · 30.0 لتر · كيا ريو', status: 'بانتظار المحطة', date: 'الثلاثاء 29 سبتمبر · 18:05' }),
            CInvoice(3, { station: 'محطة النور', total: '4,750', details: 'ديزل · 50.0 لتر · هيونداي', status: 'مصحّحة', date: 'الأحد 27 سبتمبر · 07:30' }),
            CInvoice(4, { station: 'محطة النور', total: '2,500', details: 'بنزين 90 · 22.7 لتر · كيا ريو', status: 'ملغاة', date: 'السبت 26 سبتمبر · 13:12' })
        ]),
        CTabBar('invoices')
    ]);
}
function CU7_InvoiceDetail() {
    return Mobile('CU7 · تفاصيل الفاتورة', [
        StatusBar(false),
        CTop('تفاصيل الفاتورة', { back: true, right: Badge('info', 'مصحّحة') }),
        CScroll([
            Card({ name: 'Summary', gap: 6, cross: 'center' }, Txt('محطة النور', { style: 'Body/Strong 14', color: 'text/secondary', align: 'center' }), Money('4,750', { style: 'Number/XL 32' }), Txt('الأحد 27 سبتمبر 2026 · 07:30', { style: 'Body/Small 12', color: 'text/muted' })),
            Card({ name: 'Details', gap: 12 }, KV('الوقود', 'ديزل'), KV('الكمية', '50.0 لتر'), KV('سعر اللتر', '95 ل.س'), KV('طريقة الدفع', 'نقدي'), KV('السيارة', 'هيونداي · 774120'), KV('قراءة العداد', '88,900 كم')),
            Row({ name: 'Points', w: 'fill', pad: [12, 14], gap: 10, radius: 14, fill: 'brand/action-50' }, Ico('gift', { size: 20, color: 'brand/action-700' }), Txt('+19 نقطة أُضيفت إلى رصيدك في محطة النور', { style: 'Body/Strong 14', color: 'brand/action-700', w: 'fill' })),
            Col({ name: 'Correction', w: 'fill', pad: [12, 14], gap: 4, radius: 14, fill: 'status/info-50' }, Txt('صُحّحت الفاتورة: −250 ل.س', { style: 'Body/Strong 14', color: 'status/info-700' }), Txt('السبب: خطأ في إدخال الكمية — صحّحتها إدارة المحطة في 28 سبتمبر', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })),
            Row({ w: 'fill', gap: 10 }, Row({ name: 'PDF disabled', w: 'fill', opacity: 0.5 }, Btn('secondary', 'تنزيل PDF', 'download', { w: 'fill' })), Txt('قريباً', { style: 'Label/12', color: 'text/muted' })),
            Row({ name: 'Report link', w: 'fill', main: 'between', pad: [12, 4] }, Txt('طلب تصحيح أو شكوى', { style: 'Body/Strong 14', color: 'brand/primary' }), Ico('chevronLeft', { size: 18, color: 'brand/primary' }))
        ]),
        CTabBar('invoices')
    ]);
}
function CU8_Card() {
    return Mobile('CU8 · بطاقتي', [
        StatusBar(false),
        CTop('بطاقتي', { sub: 'أرِ هذا الرمز للعامل عند التعبئة' }),
        CScroll([
            Col({ name: 'Fuel card', w: 'fill', pad: 20, gap: 18, radius: 24, fill: 'brand/dark', shadow: 'Shadow/Raised', cross: 'center' }, Row({ w: 'fill', main: 'between' }, Row({ gap: 8 }, Row({ w: 32, h: 32, radius: 9, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 18, color: 'brand/dark' })), Txt('FuelOS', { style: 'Heading/H3 16', color: 'text/on-dark' })), Txt('بطاقة الزبون', { style: 'Label/12', color: 'text/on-dark-muted' })), Row({ name: 'QR', pad: 14, radius: 18, fill: 'surface/card' }, Svg(qrSvg(184), 184, 184, { name: 'QR code' })), Col({ gap: 2, cross: 'center' }, Txt('7K2M  94QD  X81F', { style: 'Number/L 24', color: 'text/on-dark', align: 'center' }), Txt('سامر الحلبي', { style: 'Body/Small 12', color: 'text/on-dark-muted', align: 'center' }))),
            Btn('secondary', 'نسخ الرمز', 'copy', { w: 'fill' }),
            Row({ name: 'How it works', w: 'fill', pad: 14, gap: 10, radius: 14, fill: 'surface/card', stroke: 'border/default', cross: 'start' }, Ico('info', { size: 18, color: 'brand/primary' }), Txt('يمسح العامل الرمز أو يكتبه، فتصلك فاتورة التعبئة وتُضاف نقاطك بعد اعتماد المناوبة. إن لم يكن الرمز معك يستطيع البحث برقم هاتفك.', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }))
        ]),
        CTabBar('card')
    ]);
}
function CU9_Rewards() {
    function offer(title, station, code, active) {
        return Row({ name: 'Offer · ' + code, w: 'fill', pad: 14, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default', opacity: active ? 1 : 0.6 }, IconBox('tag', { bg: active ? 'status/warning-50' : 'surface/muted', fg: active ? 'status/warning-700' : 'text/muted' }), Col({ w: 'fill', gap: 2 }, Txt(title, { style: 'Body/Strong 14', w: 'fill' }), Row({ gap: 6 }, Txt(station, { style: 'Body/Small 12', color: 'text/muted' }), Badge(active ? 'success' : 'neutral', active ? 'فعّال' : 'منتهٍ'))), Row({ name: 'Code', h: 32, pad: [0, 10], gap: 6, radius: 10, fill: 'surface/muted', stroke: 'border/default', dash: true }, Txt(code, { style: 'Body/Strong 14' }), Ico('copy', { size: 14, color: 'text/secondary' })));
    }
    return Mobile('CU9 · المكافآت والعروض', [
        StatusBar(false),
        CTop('المكافآت والعروض'),
        CScroll([
            Card({ name: 'Points · النور', gap: 10 }, Row({ w: 'fill', main: 'between' }, Txt('محطة النور', { style: 'Body/Strong 14', color: 'text/secondary' }), Txt('≈ 3,400 ل.س', { style: 'Label/12', color: 'brand/action-700' })), Row({ gap: 6, cross: 'end' }, Txt('340', { style: 'Number/Hero 44', color: 'brand/primary' }), Txt('نقطة', { style: 'Body/Strong 14', color: 'text/muted' })), Progress(318, 0.68, 'brand/action'), Txt('باقي 160 نقطة لـ «غسيل مجاني»', { style: 'Body/Small 12', color: 'text/secondary' })),
            Row({ name: 'Points · أبو الهيف', w: 'fill', pad: [12, 16], gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default' }, Txt('محطة أبو الهيف', { style: 'Body/Strong 14', w: 'fill' }), Txt('85 نقطة', { style: 'Number/M 18' })),
            Row({ w: 'fill', main: 'between' }, Txt('عروض المحطات', { style: 'Heading/H3 16' }), Txt('انسخ الكود وأعطه للعامل', { style: 'Body/Small 12', color: 'text/muted' })),
            offer('خصم 10% على غسيل السيارة', 'محطة النور · حتى 31 أكتوبر', 'WASH10', true),
            offer('ضعف النقاط يوم الجمعة', 'محطة أبو الهيف', 'FRI2X', true),
            offer('فحص إطارات مجاني', 'محطة النور · انتهى 30 سبتمبر', 'TYRE0', false)
        ]),
        CTabBar('rewards')
    ]);
}
function ComplaintItem(i, o) {
    return Col({ name: 'Complaint · ' + i, w: 'fill', pad: 14, gap: 8, radius: 16, fill: 'surface/card', stroke: 'border/default' }, Row({ w: 'fill', main: 'between' }, Row({ gap: 8 }, Txt(o.station, { style: 'Body/Strong 14' }), Badge(o.type === 'بلاغ سعر' ? 'warning' : 'primary', o.type)), Badge(o.tone, o.status)), Txt(o.last, { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill', truncate: 2 }), Txt(o.time, { style: 'Body/Small 12', color: 'text/muted' }));
}
function CU10_Complaints() {
    return Mobile('CU10 · الشكاوى', [
        StatusBar(false),
        CTop('الشكاوى', { right: Btn('primary', 'شكوى جديدة', 'plus') }),
        CScroll([
            ComplaintItem(1, { station: 'محطة النور', type: 'بلاغ سعر', status: 'قيد الرد', tone: 'warning', last: 'المحطة: شكراً لتنبيهك، نراجع لوحة الأسعار الآن وسنحدّث التطبيق.', time: 'قبل ساعة' }),
            ComplaintItem(2, { station: 'محطة أبو الهيف', type: 'شكوى', status: 'أُرسلت', tone: 'info', last: 'أنت: انتظرت 20 دقيقة عند المضخة 3 ولم يحضر أي عامل.', time: 'أمس 19:40' }),
            ComplaintItem(3, { station: 'محطة النور', type: 'شكوى', status: 'تم الحل', tone: 'success', last: 'المحطة: صحّحنا الفاتورة وأُضيف الفرق إلى رصيدك.', time: '28 سبتمبر' })
        ]),
        CTabBar('complaints')
    ]);
}
function CU11_NewComplaint() {
    return Mobile('CU11 · شكوى جديدة', [
        StatusBar(false),
        CTop('شكوى جديدة', { back: true }),
        CScroll([
            Col({ name: 'Station select', w: 'fill', gap: 6 }, Txt('المحطة', { style: 'Label/12', color: 'text/secondary' }), Row({ w: 'fill', h: 44, pad: [0, 14], gap: 8, radius: 10, fill: 'surface/card', stroke: 'border/strong' }, Txt('محطة النور', { style: 'Body/Large 16', w: 'fill' }), Ico('chevronDown', { size: 18, color: 'text/muted' }))),
            Col({ w: 'fill', gap: 6 }, Txt('النوع', { style: 'Label/12', color: 'text/secondary' }), Inst('Segmented Control', { active: '2' }, { 'Option 1': 'شكوى', 'Option 2': 'بلاغ سعر' }, { w: 'fill' })),
            Col({ name: 'Description', w: 'fill', gap: 6 }, Txt('صف المشكلة', { style: 'Label/12', color: 'text/secondary' }), Col({ w: 'fill', h: 148, pad: 14, radius: 12, fill: 'surface/card', stroke: 'brand/primary', strokeW: 2 }, Txt('سعر بنزين 95 على لوحة المحطة 125، لكنه يظهر في التطبيق 130.', { style: 'Body/Large 16', w: 'fill' })), Txt('يصل البلاغ لإدارة المحطة، وإن لم يُرد عليه خلال 48 ساعة يُحوَّل لفريق FuelOS.', { style: 'Body/Small 12', color: 'text/muted', w: 'fill' })),
            Btn('primary', 'إرسال', 'send', { w: 'fill', size: 'lg' })
        ]),
        CTabBar('complaints')
    ]);
}
function CU12_Thread() {
    function bubble(mine, who, text, time) {
        return Row({ name: mine ? 'Mine' : 'Station', w: 'fill', main: mine ? 'end' : 'start' }, // RTL chat: own messages on the left
        Col({ w: 280, pad: [10, 14], gap: 4, radius: 16, fill: mine ? 'brand/primary-50' : 'surface/card', stroke: mine ? null : 'border/default' }, Txt(who, { style: 'Label/12', color: mine ? 'brand/primary' : 'text/secondary' }), Txt(text, { style: 'Body/Regular 14', w: 'fill' }), Txt(time, { style: 'Label/11', color: 'text/muted' })));
    }
    return Mobile('CU12 · محادثة الشكوى', [
        StatusBar(false),
        CTop('محطة النور', { back: true, sub: 'بلاغ سعر · فُتح اليوم 09:12', right: Badge('warning', 'قيد الرد') }),
        CScroll([
            Card({ name: 'Progress', pad: [14, 12], gap: 0 }, StepDots(['أُرسلت', 'قيد الرد', 'تم الحل'], 1)),
            bubble(true, 'أنت', 'سعر بنزين 95 على لوحة المحطة 125، لكنه يظهر في التطبيق 130.', '09:12'),
            bubble(false, 'إدارة المحطة', 'شكراً لتنبيهك. نراجع لوحة الأسعار الآن وسنحدّث التطبيق خلال ساعة.', '09:40'),
            VSpacer()
        ], { gap: 12 }),
        Row({ name: 'Reply', w: 'fill', pad: [10, 16], gap: 10, fill: 'surface/card' }, Row({ w: 'fill', h: 44, pad: [0, 14], radius: 999, fill: 'surface/muted' }, Txt('ردّك', { style: 'Body/Regular 14', color: 'text/muted', w: 'fill' })), Row({ w: 44, h: 44, radius: 999, fill: 'brand/primary', main: 'center', cross: 'center' }, Ico('send', { size: 18, color: 'text/on-dark' }))),
        CTabBar('complaints')
    ]);
}
function CU13_Vehicles() {
    function tile(icon, label, value, unit) {
        return Col({ w: 'fill', pad: 14, gap: 6, radius: 16, fill: 'surface/card', stroke: 'border/default' }, Row({ gap: 6 }, Ico(icon, { size: 16, color: 'brand/primary' }), Txt(label, { style: 'Label/12', color: 'text/secondary' })), Row({ gap: 4, cross: 'end' }, Txt(value, { style: 'Number/L 24' }), Txt(unit, { style: 'Body/Small 12', color: 'text/muted' })));
    }
    return Mobile('CU13 · سياراتي ومصروفي', [
        StatusBar(false),
        CTop('سياراتي ومصروفي'),
        CScroll([
            Row({ name: 'Vehicles', w: 'fill', gap: 8 }, Chip('كيا ريو · 512346', true, { h: 34, icon: 'car' }), Chip('هيونداي · 774120', false, { h: 34, icon: 'car' })),
            Card({ name: 'Spend', gap: 8 }, Row({ w: 'fill', main: 'between' }, Txt('مصروف أكتوبر', { style: 'Body/Strong 14', color: 'text/secondary' }), Badge('warning', '+12% عن سبتمبر')), Money('186,500', { style: 'Number/XL 32' })),
            Row({ w: 'fill', gap: 10 }, tile('gauge', 'تكلفة الكيلومتر', '312', 'ل.س'), tile('droplet', 'متوسط الاستهلاك', '8.4', 'لتر/100 كم')),
            Card({ name: 'Budget', gap: 10 }, Row({ w: 'fill', main: 'between' }, Txt('الميزانية الشهرية', { style: 'Heading/H3 16' }), LinkText('تعديل')), Progress(318, 0.75, 'brand/primary'), Row({ w: 'fill', main: 'between' }, Txt('صرفت 186,500', { style: 'Body/Small 12', color: 'text/secondary' }), Txt('من 250,000 ل.س', { style: 'Body/Small 12', color: 'text/muted' }))),
            Row({ name: 'Oil change', w: 'fill', pad: 14, gap: 12, radius: 16, fill: 'status/warning-50', cross: 'start' }, IconBox('wrench', { bg: 'surface/card', fg: 'status/warning-700' }), Col({ w: 'fill', gap: 2 }, Txt('تغيير الزيت بعد 600 كم', { style: 'Body/Strong 14', color: 'status/warning-700' }), Txt('آخر تغيير عند 84,500 كم · كل 5,000 كم · العداد الآن 88,900', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })))
        ]),
        CTabBar('vehicles')
    ]);
}
function CU14_Ads() {
    function item(art, sponsor, title) {
        return Col({ name: 'Ad · ' + art, w: 'fill', gap: 8 }, Inst('Ad Slide', { art: art }, {}, { name: 'Ad image' }), Row({ w: 'fill', main: 'between' }, Col({ gap: 0 }, Txt(title, { style: 'Body/Strong 14' }), Txt('إعلان · ' + sponsor, { style: 'Body/Small 12', color: 'text/muted' })), Row({ gap: 4 }, Txt('زيارة', { style: 'Label/12', color: 'brand/primary' }), Ico('external', { size: 14, color: 'brand/primary' }))));
    }
    return Mobile('CU14 · الإعلانات', [
        StatusBar(false),
        CTop('الإعلانات', { back: true, sub: 'عروض من رعاة FuelOS' }),
        CScroll([
            item('oil', 'الأفق للزيوت', 'زيت محركات بخصم 15%'),
            item('tyres', 'إطارات الشام', 'إطارات صيفية بسعر الجملة'),
            item('insurance', 'درع للتأمين', 'أمّن سيارتك بالتقسيط')
        ], { gap: 20 }),
        CTabBar('home')
    ]);
}
function CU15_Empty() {
    return Mobile('CU15 · فواتيري — فارغة', [
        StatusBar(false),
        CTop('فواتيري', { sub: 'كل تعبئة رُبطت ببطاقتك واعتمدتها المحطة' }),
        CScroll([
            MonthSwitch('نوفمبر 2026'),
            Col({ name: 'Empty', w: 'fill', pad: [56, 24], gap: 12, cross: 'center', radius: 20, fill: 'surface/card', stroke: 'border/default', dash: true }, Row({ w: 72, h: 72, radius: 999, fill: 'brand/primary-50', main: 'center', cross: 'center' }, Ico('receipt', { size: 32, color: 'brand/primary' })), Txt('لا فواتير في نوفمبر', { style: 'Heading/H3 16', align: 'center' }), Txt('تظهر الفاتورة هنا بعد أن تعتمد المحطة تعبئة رُبطت ببطاقتك.', { style: 'Body/Regular 14', color: 'text/secondary', align: 'center', w: 280 }), Btn('primary', 'اعرض بطاقتي', 'qr'))
        ]),
        CTabBar('invoices')
    ]);
}
const C_SCREENS = [
    [CU1_HomeGuest, CU2_Home, CU3_Station, CU4_SignIn, CU5_SignUp],
    [CU6_Invoices, CU7_InvoiceDetail, CU8_Card, CU9_Rewards, CU15_Empty],
    [CU10_Complaints, CU11_NewComplaint, CU12_Thread, CU13_Vehicles, CU14_Ads]
];
// ============================================================
// Entry point — FuelOS Customer Builder
// ============================================================
async function cSafe(label, fn) {
    try {
        await fn();
    }
    catch (e) {
        log(label + ': ' + (e && e.message ? e.message : String(e)), 'error');
    }
    await tick();
}
async function cBuildPrototype(page) {
    let links = 0, fails = 0;
    async function L(node, code) { if (!node) {
        fails++;
        return;
    } if (await linkTo(node, code))
        links++;
    else
        fails++; }
    const N = byName;
    // bottom bar on every signed-in screen
    for (const code of Object.keys(SCREEN_NODES)) {
        const f = SCREEN_NODES[code];
        if (!f.findOne(N('Tab Bar')))
            continue;
        for (const t of C_TABS)
            if (t[3] !== code)
                await L(f.findOne(N('Tab ' + t[0])), t[3]);
    }
    // guest → sign in → home
    await L(findIn('CU1', N('Button · تسجيل الدخول')), 'CU4');
    await L(findIn('CU4', N('Button · دخول')), 'CU2');
    await L(findIn('CU4', N('Segment 2')), 'CU5');
    await L(findIn('CU5', N('Segment 1')), 'CU4');
    await L(findIn('CU5', N('Button · إنشاء الحساب')), 'CU2');
    await L(findIn('CU4', N('Browse as guest')), 'CU1');
    await L(findIn('CU5', N('Browse as guest')), 'CU1');
    // home → station, ads
    for (const code of ['CU1', 'CU2']) {
        await L(findIn(code, N('Station · محطة النور')), 'CU3');
        await L(findIn(code, N('See all ads')), 'CU14');
        await L(findIn(code, N('Banner slide')), 'CU14');
    }
    await L(findIn('CU2', N('Sign out')), 'CU1');
    await L(findIn('CU3', N('Back')), 'CU2');
    await L(findIn('CU3', N('Wrong price')), 'CU11');
    await L(findIn('CU14', N('Back')), 'CU2');
    // invoices
    await L(findIn('CU6', N('Invoice · 3')), 'CU7');
    await L(findIn('CU7', N('Back')), 'CU6');
    await L(findIn('CU7', N('Report link')), 'CU11');
    await L(findIn('CU15', N('Button · اعرض بطاقتي')), 'CU8');
    // complaints
    await L(findIn('CU10', N('Button · شكوى جديدة')), 'CU11');
    await L(findIn('CU10', N('Complaint · 1')), 'CU12');
    await L(findIn('CU11', N('Back')), 'CU10');
    await L(findIn('CU11', N('Button · إرسال')), 'CU12');
    await L(findIn('CU12', N('Back')), 'CU10');
    try {
        page.flowStartingPoints = [{ nodeId: SCREEN_NODES.CU1.id, name: 'تطبيق الزبون — الإصدار الحالي' }];
    }
    catch (e) {
        log('نقطة بداية النموذج: ' + e.message, 'warn');
    }
    log('روابط النموذج التفاعلي: ' + links + (fails ? ' (تعذّر ' + fails + ')' : ''), fails ? 'warn' : 'info');
}
async function cRun() {
    const t0 = Date.now();
    log('بدء البناء…');
    await setupFonts();
    const page = await cPreparePage();
    await figma.setCurrentPageAsync(page);
    await cEnsureVariables();
    await cEnsureStyles();
    const board = await makeBoard(page, 'تطبيق الزبون — الأيقونات والمكوّنات', 'الشريط السفلي بستة أقسام، وشريحة الإعلان، والمكوّنات الأساسية المستخدمة في الشاشات. الألوان والخطوط من نظام FuelOS نفسه.', 0, 1600);
    await cSafe('الأيقونات', async function () {
        const holder = await build(Col({ name: 'Icons', w: 'fill', gap: 16 }, Txt('الأيقونات', { style: 'Heading/H1 24' })), board);
        const grid = await build(Row({ name: 'Icon grid', w: 'fill', gap: 20, wrap: true, rowGap: 20, pad: 24, radius: 16, fill: 'surface/card', stroke: 'border/default' }), holder);
        await cBuildIcons(grid);
    });
    await cSafe('المكوّنات', async function () {
        const holder = await build(Col({ name: 'Components', w: 'fill', gap: 28 }, Txt('المكوّنات', { style: 'Heading/H1 24' })), board);
        await cBuildComponents(holder);
    });
    const y = Math.round(board.height) + 240;
    await buildSection(page, 'تطبيق الزبون — الإصدار الحالي (هاتف 390)', 'CU1–CU15 · مطابق لما هو مبني في apps/customer: الأسعار للزائر، الدخول بالبريد وكلمة المرور، الشريط السفلي، بطاقتي، الفواتير، المكافآت، الشكاوى، سياراتي، وإعلانات الرعاة.', C_SCREENS, 0, y, 80);
    await cSafe('النموذج التفاعلي', function () { return cBuildPrototype(page); });
    const secs = Math.round((Date.now() - t0) / 1000);
    log('انتهى البناء خلال ' + secs + ' ثانية' + (ERRORS.length ? ' — مع ' + ERRORS.length + ' خطأ' : ''), ERRORS.length ? 'warn' : 'ok');
    try {
        figma.viewport.scrollAndZoomIntoView(page.children.filter(function (n) { return n.getPluginData('fuelos') === 'gen'; }));
    }
    catch (e) { /* ignore */ }
    figma.ui.postMessage({ type: 'done', errors: ERRORS.slice(), secs: secs });
    figma.notify(ERRORS.length ? 'اكتمل البناء مع ' + ERRORS.length + ' خطأ — راجع السجل' : 'اكتمل بناء تطبيق الزبون');
}
figma.showUI(__html__, { width: 400, height: 560, title: 'FuelOS — تطبيق الزبون' });
figma.ui.postMessage({ type: 'init', fileName: figma.root.name });
figma.ui.onmessage = function (msg) {
    if (msg.type === 'build') {
        return cRun().catch(function (e) {
            log('توقف البناء: ' + (e && e.message ? e.message : e), 'error');
            figma.ui.postMessage({ type: 'done', errors: ERRORS.slice(), secs: 0 });
        });
    }
    if (msg.type === 'close')
        figma.closePlugin();
};
