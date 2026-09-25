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
// Analysis board (page 01)
// ============================================================
const SCREEN_INVENTORY = [
    { key: 'owner', title: 'صاحب المحطة والمحاسبة', device: 'كمبيوتر · 1440x1024', icon: 'chart', screens: [
            ['لوحة القيادة المالية والتشغيلية', 1, 'صورة فورية عن المال والوقود والمناوبات والديون والمخاطر اليومية.', '4 بطاقات KPI · تنبيهات ملونة · رسم خطي · آخر العمليات الحرجة', 'skeleton · لا بيانات · اتصال ضعيف', 'O1'],
            ['إدارة الخزانات والمخزون', 1, 'متابعة الكمية الدفترية والفعلية لكل وقود وربطها بالمشتريات والمبيعات والتسويات.', 'شريط امتلاء · توريد · قياس فعلي · نقل · سجل حركات', 'فرق كبير · أقل من الحد · سعر شراء ناقص', 'O2'],
            ['المبيعات والمضخات والمناوبات', 1, 'ربط قراءة المضخات بالمبيعات والتحصيل وإغلاق المناوبة.', 'بطاقة مضخة · جدول طرق الدفع · اعتماد الإغلاق', 'مفتوحة طويلاً · قراءة أقل · فرق صندوق · تحتاج موافقة', 'O3'],
            ['المحاسبة والقيود اليومية', 1, 'تحويل العمليات التشغيلية إلى قيود محاسبية قابلة للمراجعة.', 'دليل حسابات · قيود آلية ويدوية · درج المصدر · تصدير', 'غير متوازن · فترة مغلقة · حساب غير نشط', 'O4'],
            ['العملاء والديون وحسابات الشركات', 1, 'إدارة البيع الآجل وسقوف الائتمان وكشوف الحساب.', 'بطاقة عميل · سائقون ومركبات · كشف شهري · تجميد', 'تجاوز الحد · فاتورة متنازع عليها · عميل موقوف', 'O5'],
            ['التقارير والتحليلات', 2, 'قرارات مبنية على البيانات: الربحية والأداء والمخزون والموظفين.', '5 تقارير جاهزة · مقارنة فترة · تثبيت في اللوحة', 'بيانات غير كافية · تكلفة ناقصة · تصدير قيد التحضير', 'O6 · ST3']
        ] },
    { key: 'staff', title: 'موظف المحطة', device: 'هاتف أو تابلت · 390x844', icon: 'fuel', screens: [
            ['بداية المناوبة', 1, 'بدء العمل بسرعة وبصلاحيات واضحة.', 'اختيار المضخة · قراءة افتتاحية + صورة · استلام صندوق · مؤشر اتصال', 'قراءة ناقصة · مضخة مشغولة · حساب غير مفعّل · offline', 'S1'],
            ['تسجيل تعبئة سريعة', 1, 'تسجيل عملية فردية عند الحاجة إلى فاتورة رقمية أو ربط زبون.', 'مبدّل لتر/مبلغ · سعر مقفل · طرق الدفع · QR اختياري', 'زبون غير موجود · حد غير كافٍ · سعر غير محدّث · بانتظار المزامنة', 'S2 · S3'],
            ['البيع الآجل لشركة أو سائق', 2, 'تعبئة السائقين المعتمدين على حساب شركة دون ورق.', 'بحث أو QR · الحد المتبقي · عداد السيارة · اعتماد', 'سائق غير مصرح · سيارة موقوفة · تجاوز الحد', 'S8 · S9'],
            ['إغلاق المناوبة', 1, 'إنهاء اليوم بمقارنة القراءة والمال والعمليات.', 'Wizard من 3 خطوات · ملخص فرق الصندوق · شاشة نجاح', 'فرق أكبر من الحد · بلا قراءة نهائية · عملية معلقة', 'S4 – S7']
        ] },
    { key: 'customer', title: 'الزبون', device: 'هاتف · 390x844', icon: 'user', screens: [
            ['الصفحة الرئيسية', 1, 'أقرب محطة، الأسعار، الفواتير، ومصروف الوقود.', 'بحث · محطات قريبة · اختصارات · حالة آخر تحديث', 'لا محطات قريبة · الموقع غير مفعّل · أسعار قديمة', 'C1'],
            ['صفحة المحطة العامة', 1, 'مساعدة الزبون على اختيار محطة قبل الوصول.', 'أسعار منشورة · التوفر · الخدمات · الاتجاهات', 'سعر قديم · محطة مغلقة · بلاغ قيد المراجعة', 'C2'],
            ['الفاتورة الرقمية وسجل التعبئة', 1, 'تحويل التعبئة إلى سجل مالي مفيد للزبون.', 'Wallet شهري · تفاصيل · PDF · طلب تصحيح', 'بانتظار الاعتماد · ملغاة/مصححة · غير مرتبطة بسيارة', 'C3 · C4'],
            ['مصروف الوقود والسيارات', 1, 'فهم تكلفة السيارة والاستهلاك الشهري.', 'عداد المسافة · رسم شهري · تذكير صيانة · ميزانية', 'بيانات غير كافية · تجاوز الميزانية · صيانة قريبة', 'C5'],
            ['الولاء والعروض والشكاوى', 2, 'زيادة تكرار الزيارة وتنظيم الشكاوى.', 'رصيد النقاط · عروض · كوبون · متابعة الشكوى', 'عرض منتهٍ · نقاط غير كافية · قيد الرد', 'C6 · C7']
        ] },
    { key: 'admin', title: 'أدمن المنصة', device: 'كمبيوتر · 1440x1024', icon: 'shield', screens: [
            ['لوحة إدارة المنصة', 2, 'إدارة شبكة محطات ومراقبة النمو والدعم والاشتراكات.', 'مؤشرات عامة · خريطة محطات · تنبيهات تشغيلية', 'متأخرة في الدفع · لم تزامن · دعم عالي الأولوية', 'A1'],
            ['انضمام محطة جديدة', 1, 'تفعيل محطة بسرعة دون فريق تقني.', 'Wizard من 5 خطوات · قوالب وقود · دعوات · checklist', 'بيانات ناقصة · خزان بلا وقود · مضخة بلا خزان', 'A2'],
            ['الاشتراكات والباقات', 2, 'نموذج دخل واضح وقابل للتوسع.', 'خطط · حدود · حالة الدفع · فواتير المنصة', 'تجربة منتهية · دفعة متأخرة · خطة قديمة', 'A3'],
            ['الصلاحيات والسجلات والدعم', 2, 'حماية المنصة وتسهيل خدمة العملاء.', 'قوالب أدوار · سجل غير قابل للحذف · تذاكر · Feature flags', 'دخول فاشل · تعديل مالي حساس · تذكرة متأخرة', 'A4']
        ] }
];
async function safeBuild(spec, parent) {
    try {
        return await build(spec, parent);
    }
    catch (e) {
        log('قسم في التحليل: ' + (e && e.message ? e.message : e), 'error');
        return null;
    }
}
async function buildAnalysis(board) {
    const inner = 1608;
    // 1. Core idea + numbers
    await safeBuild(Col({ name: '1 · الفكرة', w: 'fill', gap: 20 }, SectionTitle(1, 'الفكرة وكيف تنعكس على التصميم'), Row({ w: 'fill', gap: 20, cross: 'start' }, Col({ w: 'fill', pad: 32, gap: 16, radius: 24, fill: 'brand/dark' }, Txt('الفكرة المحورية', { style: 'Label/12', color: 'brand/action' }), Txt('النظام لا يبيع للمحطة جهازاً جديداً؛ يبيعها ضبطاً مالياً وتشغيلياً، ويعطي الزبون سبباً لاستخدام التطبيق: فاتورة، أسعار، ولاء، مصاريف وقود، وخدمات.', { style: 'Heading/H2 20', color: 'text/on-dark', w: 'fill' }), Txt('القيد الأهم: لا حساسات للخزانات، لا ربط بالمضخات، ولا أجهزة دفع. كل رقم يُدخله إنسان، لذلك التصميم يبني الثقة بإظهار المصدر ووقت التحديث في كل مكان.', { style: 'Body/Large 16', color: 'text/on-dark-muted', w: 'fill' })), Col({ w: 520, gap: 12 }, chunk([['4', 'واجهات'], ['19', 'شاشة رئيسية'], ['~75', 'حالة خاصة بالشاشات'], ['6', 'حالات عامة'], ['6', 'مكوّنات أساسية'], ['7', 'ميزات في الـ MVP']], 2).map(function (r) {
        return Row({ w: 'fill', gap: 12 }, r.map(function (x) {
            return Col({ w: 'fill', pad: 18, gap: 2, radius: 16, fill: 'surface/card', stroke: 'border/default' }, Txt(x[0], { style: 'Number/XL 32', color: 'brand/primary' }), Txt(x[1], { style: 'Body/Regular 14', color: 'text/secondary' }));
        }));
    })))), board);
    // 2. Principles
    const principles = [
        ['المحاسبة من التشغيل', 'كل بيع أو توريد أو مصروف أو تسوية أو دين يتحول إلى أثر محاسبي قابل للتتبع.', 'كل رقم يُفتح على مصدره (فاتورة، توريد، تسوية) عبر درج جانبي.', 'fileText'],
        ['لا أجهزة جديدة', 'النسخة الأولى تعتمد على الهاتف والتابلت والكمبيوتر الموجود.', 'عبارة «آخر تحديث» بجانب كل سعر ومستوى خزان وحالة توفر.', 'clock'],
        ['سرعة العامل أولاً', 'واجهة الموظف لا تتحمل كثافة؛ ثلاث أو أربع لمسات لأغلب العمليات.', 'أزرار 56px، حقول قليلة، زر رئيسي واحد في كل شاشة.', 'fuel'],
        ['ثقة الزبون', 'التطبيق يعرض السعر والتوفر والفاتورة مع مصدر المعلومة ووقتها.', 'لا وعود غير مؤكدة: السعر يظهر مع وقته وزر «أبلغ عن خطأ».', 'shield'],
        ['سجل مراجعة', 'لا حذف صامت للحركات المالية؛ التصحيح بقيد عكسي مع سبب وصلاحية.', 'لا زر حذف للعمليات المالية. «عكس/تصحيح» + سبب إلزامي + سجل.', 'history'],
        ['قابلية التوسع', 'محطة واحدة، ثم عدة محطات، ثم شبكة محطات وشركات وأساطيل.', 'مبدّل محطات في الشريط الجانبي من اليوم الأول.', 'layers']
    ];
    await safeBuild(Col({ name: '2 · المبادئ', w: 'fill', gap: 20 }, SectionTitle(2, 'المبادئ الستة وأثرها على الشاشات'), chunk(principles, 3).map(function (row) {
        return Row({ w: 'fill', gap: 20, cross: 'start' }, row.map(function (p) {
            return Card({ gap: 10 }, Row({ gap: 10 }, IconBox(p[3]), Txt(p[0], { style: 'Heading/H3 16' })), Txt(p[1], { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' }), Row({ w: 'fill', pad: [10, 12], gap: 8, radius: 10, fill: 'brand/primary-50', cross: 'start' }, Ico('arrowRight', { size: 16, color: 'brand/primary' }), Txt(p[2], { style: 'Body/Strong 14', color: 'brand/primary', w: 'fill' })));
        }));
    })), board);
    // 3. Users & devices
    const users = [
        ['صاحب المحطة والمحاسب', 'كمبيوتر', '1440 x 1024', 'شريط جانبي داكن يمين، فلاتر أعلى، بطاقات مؤشرات، ثم جداول. لا تكثر الرسوم.', 'هل المال يطابق الوقود المباع؟ ما أخطر شيء اليوم؟', 'chart'],
        ['موظف المحطة', 'هاتف / تابلت', '390 x 844', 'Mobile-first، أزرار كبيرة، أرقام ضخمة، ألوان حالة قوية، يعمل دون اتصال.', 'أسجّل بسرعة تحت الضغط ولا أخطئ في الأرقام.', 'fuel'],
        ['الزبون', 'هاتف', '390 x 844', 'تجربة قريبة من تطبيقات الخرائط والمحافظ؛ مفهومة خلال أقل من دقيقة.', 'أين أقرب محطة؟ كم السعر الآن؟ كم صرفت هذا الشهر؟', 'user'],
        ['أدمن المنصة', 'كمبيوتر', '1440 x 1024', 'لوحة SaaS مركزية تفصل الصحة التقنية عن التفاصيل المالية للمحطات.', 'أي محطة تحتاج تدخلاً؟ من متأخر في الدفع؟', 'shield']
    ];
    await safeBuild(Col({ name: '3 · المستخدمون', w: 'fill', gap: 20 }, SectionTitle(3, 'المستخدمون والأجهزة'), Row({ w: 'fill', gap: 20, cross: 'start' }, users.map(function (u) {
        return Card({ gap: 10 }, Row({ w: 'fill', main: 'between' }, Row({ gap: 10 }, IconBox(u[5]), Txt(u[0], { style: 'Heading/H3 16' })), Badge('primary', u[1])), Txt(u[2], { style: 'Number/L 24', color: 'brand/primary' }), Txt(u[3], { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' }), Row({ w: 'fill', pad: [10, 12], radius: 10, fill: 'surface/muted' }, Txt('«' + u[4] + '»', { style: 'Body/Strong 14', w: 'fill' })));
    }))), board);
    // 4. Screen inventory
    await safeBuild(Col({ name: '4 · جرد الشاشات', w: 'fill', gap: 20 }, SectionTitle(4, 'جرد الشاشات — 19 شاشة من الملف', 'كل الشاشات الـ 19 مصمَّمة في صفحة 02 (الرمز تحت كل بطاقة)، إضافة إلى 19 إطاراً لسد الفجوات والحالات العامة — 38 إطاراً إجمالاً. أولوية 1 = نواة الـ MVP حسب جدول الملف.'), Row({ w: 'fill', gap: 16, cross: 'start' }, SCREEN_INVENTORY.map(function (g) {
        return Col({ name: g.title, w: 'fill', gap: 12 }, Col({ w: 'fill', pad: 16, gap: 2, radius: 14, fill: 'brand/dark' }, Row({ gap: 8 }, Ico(g.icon, { size: 18, color: 'brand/action' }), Txt(g.title, { style: 'Heading/H3 16', color: 'text/on-dark' })), Txt(g.screens.length + ' شاشات · ' + g.device, { style: 'Body/Small 12', color: 'text/on-dark-muted' })), g.screens.map(function (s, i) {
            return Col({ name: s[0], w: 'fill', pad: 16, gap: 8, radius: 14, fill: 'surface/card', stroke: s[5] ? 'brand/action' : 'border/default', strokeW: s[5] ? 2 : 1 }, Row({ w: 'fill', main: 'between' }, Txt((i + 1) + '. ' + s[0], { style: 'Body/Strong 14', w: 'fill' }), Badge(s[1] === 1 ? 'primary' : 'neutral', 'أولوية ' + s[1])), Txt(s[2], { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }), Row({ w: 'fill', gap: 6, cross: 'start' }, Ico('layers', { size: 14, color: 'text/muted' }), Txt(s[3], { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })), Row({ w: 'fill', gap: 6, cross: 'start' }, Ico('alert', { size: 14, color: 'text/muted' }), Txt(s[4], { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })), s[5] ? Badge('success', 'مصمَّمة: ' + s[5]) : Badge('neutral', 'المرحلة التالية'));
        }));
    }))), board);
    // 5. Flows
    const flows = [
        ['تدفق عملية تعبئة مرتبطة بزبون', [['الموظف', 'يدخل التعبئة ويربط الزبون'], ['النظام', 'ينشئ فاتورة ويحدث المخزون والحسابات'], ['الزبون', 'يرى الفاتورة والنقاط والمصروف'], ['المدير', 'يرى الأثر المالي والتشغيلي']]],
        ['تدفق إغلاق المناوبة', [['قراءة افتتاحية', 'عند بداية المناوبة'], ['قراءة نهائية', 'حساب اللترات'], ['النقد الفعلي', 'مقارنة بالصندوق المتوقع'], ['اعتماد المدير', 'قيد مالي وسجل مراجعة']]],
        ['تدفق عميل شركة', [['شركة', 'تضيف السائقين والسيارات'], ['سائق', 'يبرز الرمز أو رقم السيارة'], ['المحطة', 'تتحقق من الحد والحالة'], ['كشف شهري', 'فواتير وديون وسداد']]]
    ];
    await safeBuild(Col({ name: '5 · التدفقات', w: 'fill', gap: 20 }, SectionTitle(5, 'التدفقات الأساسية بين الواجهات'), flows.map(function (f) {
        const steps = [];
        f[1].forEach(function (st, i) {
            steps.push(Col({ w: 'fill', pad: 16, gap: 4, radius: 14, fill: 'surface/card', stroke: 'border/default' }, Txt(st[0], { style: 'Body/Strong 14', color: 'brand/primary' }), Txt(st[1], { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })));
            if (i < f[1].length - 1)
                steps.push(Ico('chevronLeft', { size: 24, color: 'text/muted' }));
        });
        return Col({ w: 'fill', gap: 10 }, Txt(f[0], { style: 'Heading/H3 16' }), Row({ w: 'fill', gap: 12 }, steps));
    })), board);
    // 6. Components matrix
    await safeBuild(Col({ name: '6 · المكوّنات', w: 'fill', gap: 20 }, SectionTitle(6, 'المكوّنات وأين تُستخدم'), Card({ pad: 8 }, Table([{ t: 'المكوّن', w: 240, strong: true }, { t: 'الوصف', w: 'fill' }, { t: 'يُستخدم في', w: 420 }, { t: 'الحالة', w: 140 }], [
        ['Fuel KPI Card', 'بطاقة رقمية: عنوان، رقم كبير، مقارنة، أيقونة حالة', 'لوحة القيادة، الديون، المخزون', Badge('success', 'منفّذ')],
        ['Tank Level Bar', 'شريط امتلاء مع السعة والكمية وآخر تحديث', 'لوحة القيادة، الخزانات', Badge('success', 'منفّذ')],
        ['Shift Closing Wizard', 'مسار خطوات لإغلاق المناوبة بدل صفحة طويلة', 'الموظف، المدير', Badge('success', 'منفّذ')],
        ['Invoice Card', 'فاتورة مختصرة قابلة للفتح', 'تطبيق الزبون، حسابات العملاء', Badge('success', 'منفّذ')],
        ['Audit Drawer', 'درج جانبي: تاريخ العملية، من عدّلها، ولماذا', 'القيود، الحركات المالية الحساسة', Badge('success', 'منفّذ')],
        ['Status Badge', 'وسم حالة ملوّن', 'كل الواجهات', Badge('success', 'منفّذ')],
        ['Button · Input · Segmented · Payment Option', 'مكوّنات إدخال بحجمين (md للمكتب، lg للعامل)', 'كل الواجهات', Badge('success', 'منفّذ')],
        ['Alert Banner · Sync Indicator', 'التنبيهات وحالة الاتصال والمزامنة', 'اللوحة، واجهة العامل', Badge('success', 'منفّذ')],
        ['Nav Item · Tab Bar', 'الشريط الجانبي الداكن وشريط التبويب السفلي', 'المالك والأدمن، الزبون', Badge('success', 'منفّذ')]
    ]))), board);
    // 7. States + permissions
    const states = [
        ['Loading', 'skeleton بدل شاشة بيضاء، خاصة في التقارير والجداول.'],
        ['Empty State', 'اشرح الخطوة التالية: أضف خزاناً، افتح مناوبة، اربط أول فاتورة.'],
        ['Error State', 'رسالة مختصرة + سبب + إجراء واضح. لا كود خطأ تقني للمستخدم.'],
        ['Offline', 'واجهة العامل تحفظ مؤقتاً وتعرض عدد العمليات غير المتزامنة.'],
        ['Permission Denied', 'قل من يملك الصلاحية، ولا تخفِ الزر دون تفسير.'],
        ['Audit State', 'كل تعديل حساس يظهر في سجل: من، متى، ماذا تغيّر، ولماذا.']
    ];
    await safeBuild(Col({ name: '7 · الحالات والصلاحيات', w: 'fill', gap: 20 }, SectionTitle(7, 'الحالات العامة والصلاحيات'), chunk(states, 6).map(function (r) {
        return Row({ w: 'fill', gap: 12, cross: 'start' }, r.map(function (s) {
            return Col({ w: 'fill', pad: 16, gap: 6, radius: 14, fill: 'surface/card', stroke: 'border/default' }, Txt(s[0], { style: 'Body/Strong 14', color: 'brand/primary' }), Txt(s[1], { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }));
        }));
    }), Card({ pad: 8 }, Table([{ t: 'الدور', w: 200, strong: true }, { t: 'ما يراه', w: 'fill' }, { t: 'ما لا يراه', w: 'fill' }, { t: 'صلاحيات حساسة', w: 'fill' }], [
        ['صاحب المحطة', 'كل بيانات محطته وفروعه', 'بيانات محطات أخرى', 'اعتماد الإغلاقات، تعديل الصلاحيات، إغلاق فترة مالية'],
        ['محاسب', 'القيود، التقارير، العملاء، الموردون', 'إعدادات المنصة العامة', 'قيود يدوية، تصدير تقارير، تسويات'],
        ['موظف محطة', 'مناوبته، عملياته، مضخته', 'أرباح المحطة وتكاليف الشراء', 'لا يعتمد تسويات كبيرة'],
        ['زبون', 'فواتيره، سياراته، نقاطه', 'تكلفة شراء الوقود وأرباح المحطة', 'تعديل بياناته وطلب تصحيح فاتورة'],
        ['أدمن المنصة', 'حالة المحطات والاشتراكات والدعم', 'تفاصيل مالية لمحطة إلا بصلاحية محددة', 'تفعيل/إيقاف محطات، إدارة خطط، دعم تقني']
    ]))), board);
    // 8. Gaps & assumptions
    const gaps = [
        ['شاشات دخول وتسجيل', 'لا توجد شاشات تسجيل دخول أو OTP لأي واجهة.', 'L1 · L2 · L3'],
        ['صندوق الموافقات', 'الموافقة مذكورة في 4 أماكن دون شاشة لها.', 'O7 · ST4'],
        ['إدخال المصاريف', 'الربح «المؤكد» يعتمد على المصاريف ولا شاشة لإدخالها.', 'O8'],
        ['تحديث الأسعار', 'الزبون يرى الأسعار، ولا شاشة للمحطة لتحديثها.', 'O9'],
        ['شكاوى من جهة المحطة', 'المحطة «ترد من لوحة الإدارة» دون شاشة محددة.', 'O10'],
        ['الموردون والإعدادات', 'لا شاشة للموردين ولا للإعدادات والمستخدمين.', 'O8 · O11'],
        ['التوفر دون حساسات', 'التوفر يجب أن يُحسب من المخزون الدفتري أو يُحدَّث يدوياً مع الوقت والمصدر.', 'O9 · C2'],
        ['الانضمام خارج الـ MVP', 'لا يمكن تفعيل أول محطة دون شاشة الانضمام.', 'A2 · ST2']
    ];
    const assumptions = [
        ['الخط', FONT + '، والأرقام لاتينية 0-9'], ['الاتجاه', 'عربي RTL فقط في هذه النسخة'], ['العملة', '«ل.س» كقيمة مؤقتة قابلة للتغيير'],
        ['أنواع الوقود', 'بنزين 90، بنزين 95، ديزل'], ['الوضع', 'فاتح، مع شريط جانبي داكن للمالك والأدمن'], ['البيانات', 'كل الأسماء والأرقام أمثلة توضيحية']
    ];
    await safeBuild(Col({ name: '8 · الفجوات', w: 'fill', gap: 20 }, SectionTitle(8, 'الفجوات في الملف وكيف غطّيناها'), Row({ w: 'fill', gap: 20, cross: 'start' }, Col({ w: 'fill', gap: 12 }, Txt('ما كان ينقص الملف — وأين غطّيناه', { style: 'Heading/H3 16', color: 'status/warning-700' }), chunk(gaps, 2).map(function (r) {
        return Row({ w: 'fill', gap: 12, cross: 'start' }, r.map(function (g) {
            return Col({ w: 'fill', pad: 16, gap: 6, radius: 14, fill: 'surface/card', stroke: 'brand/action', strokeOpacity: 0.6 }, Row({ w: 'fill', main: 'between' }, Row({ gap: 8 }, Ico('alert', { size: 16, color: 'status/warning-700' }), Txt(g[0], { style: 'Body/Strong 14', color: 'status/warning-700' })), Badge('success', 'مغطّاة: ' + g[2])), Txt(g[1], { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }));
        }));
    })), Col({ w: 480, gap: 12 }, Txt('الافتراضات (قابلة للتغيير)', { style: 'Heading/H3 16', color: 'status/info-700' }), Col({ w: 'fill', pad: 8, radius: 14, fill: 'surface/card', stroke: 'border/default', gap: 0 }, assumptions.map(function (a, i) {
        return Col({ w: 'fill', gap: 0 }, Row({ w: 'fill', pad: [12, 12], main: 'between' }, Txt(a[0], { style: 'Body/Strong 14' }), Txt(a[1], { style: 'Body/Regular 14', color: 'text/secondary' })), i < assumptions.length - 1 ? Divider() : null);
    }))))), board);
    // 9. Plan
    const plan = [
        ['المرحلة 1', 'نظام التصميم', 'متغيرات، خطوط، 63 أيقونة، 14 مكوّناً', 'success', 'منجزة'],
        ['المرحلة 2', 'شاشات أولوية 1', 'المالك 5، الموظف 7، الزبون 5', 'success', 'منجزة'],
        ['المرحلة 3', 'أولوية 2 والأدمن', 'التقارير، البيع الآجل وتجاوز الحد، الولاء والشكاوى، 4 شاشات أدمن', 'success', 'منجزة'],
        ['المرحلة 4', 'الفجوات والنموذج التفاعلي', 'الدخول ×3، الموافقات، المصاريف، الأسعار، الشكاوى، الإعدادات، 4 حالات عامة + روابط Prototype', 'success', 'منجزة']
    ];
    await safeBuild(Col({ name: '9 · الخطة', w: 'fill', gap: 20 }, SectionTitle(9, 'خطة التنفيذ'), Row({ w: 'fill', gap: 16, cross: 'start' }, plan.map(function (p) {
        return Col({ w: 'fill', pad: 20, gap: 8, radius: 16, fill: 'surface/card', stroke: p[3] === 'success' ? 'brand/action' : 'border/default', strokeW: p[3] === 'success' ? 2 : 1 }, Row({ w: 'fill', main: 'between' }, Txt(p[0], { style: 'Label/12', color: 'text/muted' }), Badge(p[3], p[4])), Txt(p[1], { style: 'Heading/H2 20' }), Txt(p[2], { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' }));
    }))), board);
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
// Owner / accountant screens (desktop 1440)
// ============================================================
function O1_Dashboard() {
    const chartW = 640, chartH = 210;
    const series = [
        { color: '#0F766E', area: true, values: [6.8, 7.1, 6.9, 7.4, 7.2, 7.8, 8.1, 7.6, 7.7, 8.0, 8.4, 8.1, 8.3, 8.6, 8.9] },
        { color: '#10B981', values: [5.2, 5.0, 5.4, 5.3, 5.6, 5.5, 5.9, 5.7, 5.8, 6.0, 5.9, 6.2, 6.1, 6.3, 6.2] },
        { color: '#F59E0B', values: [3.9, 4.1, 3.8, 4.2, 4.0, 4.3, 4.1, 3.9, 4.2, 4.4, 4.1, 3.8, 3.6, 3.5, 3.3] }
    ];
    const days = ['10 سبت', '12', '14', '16', '18', '20', '22', '24 سبت'];
    function legend(c, t) { return Row({ gap: 6 }, Dot(8, c), Txt(t, { style: 'Body/Small 12', color: 'text/secondary' })); }
    function ops(t, what, who, amt, tone, st) {
        return [Txt(t, { style: 'Body/Small 12', color: 'text/muted', w: 48 }), Txt(what, { style: 'Body/Strong 14', w: 'fill' }), Txt(who, { style: 'Body/Small 12', color: 'text/secondary', w: 130 }), Txt(amt, { style: 'Body/Strong 14', w: 84, color: tone === 'danger' ? 'status/danger-700' : 'text/primary' }), Row({ w: 132 }, Badge(tone, st))];
    }
    function shift(p, who, st, tone, t) {
        return Row({ w: 'fill', gap: 10, pad: [10, 0] }, Row({ w: 36, h: 36, radius: 10, fill: 'surface/muted', main: 'center', cross: 'center' }, Txt(p, { style: 'Body/Strong 14', color: 'text/secondary' })), Col({ w: 'fill', gap: 0 }, Txt(who, { style: 'Body/Strong 14' }), Txt(t, { style: 'Body/Small 12', color: 'text/muted' })), Badge(tone, st));
    }
    return Desktop('O1 · لوحة القيادة', 'dash', [
        PageHeader('لوحة القيادة', 'الخميس، 24 سبتمبر 2026 · آخر مزامنة قبل دقيقتين', [
            PeriodChips(0), Btn('secondary', 'تصفية', 'filter'), IconBtn('bell', { dot: true })
        ]),
        Row({ name: 'Risks', w: 'fill', gap: 16, cross: 'start' }, Inst('Alert Banner', { tone: 'danger' }, { Title: 'فرق صندوق 4,500 ل.س', Body: 'مناوبة المضخة 3 · أحمد سالم · السبب مرفق وبانتظار اعتمادك', Action: 'مراجعة' }, { w: 'fill' }), Inst('Alert Banner', { tone: 'warning' }, { Title: 'ديزل: يكفي يوماً ونصف تقريباً', Body: '18% من سعة خزان 2 · حسب المخزون الدفتري · آخر قياس 07:30', Action: 'طلب توريد' }, { w: 'fill' }), Inst('Alert Banner', { tone: 'warning' }, { Title: 'دين متأخر 45 يوماً', Body: 'شركة الأمل للنقل · 212,000 ل.س · 85% من الحد الائتماني', Action: 'كشف الحساب' }, { w: 'fill' })),
        Row({ name: 'KPIs', w: 'fill', gap: 16 }, Inst('Fuel KPI Card', { state: 'default' }, { Title: 'مبيعات اليوم', Value: '2,026,400', Unit: 'ل.س', Meta: '+8.2% عن أمس · 18,420 لتر', '@Badge': { visible: false }, '^Icon': { icon: 'chart', color: 'brand/primary' } }, { w: 'fill' }), Inst('Fuel KPI Card', { state: 'default' }, { Title: 'الربح التقديري', Value: '162,100', Unit: 'ل.س', Meta: 'يكتمل بعد إدخال مصاريف اليوم', '@Badge': { comp: 'Status Badge', variant: { tone: 'info' }, text: { Label: 'تقديري' } }, '^Icon': { icon: 'trendUp', color: 'brand/primary' }, '^TrendIcon': { icon: 'info', color: 'status/info' } }, { w: 'fill' }), Inst('Fuel KPI Card', { state: 'default' }, { Title: 'النقد المتوقع', Value: '1,318,000', Unit: 'ل.س', Meta: '3 من 4 مناوبات مغلقة', '@Badge': { visible: false }, '^Icon': { icon: 'cash', color: 'brand/primary' }, '^TrendIcon': { icon: 'checkCircle', color: 'brand/action' } }, { w: 'fill' }), Inst('Fuel KPI Card', { state: 'alert' }, { Title: 'الديون المستحقة', Value: '684,000', Unit: 'ل.س', Meta: '14 عميلاً · 2 متأخران', '@Badge': { comp: 'Status Badge', variant: { tone: 'danger' }, text: { Label: 'متأخر' } }, '^Icon': { icon: 'users', color: 'status/danger' }, '^TrendIcon': { icon: 'alert', color: 'status/danger' } }, { w: 'fill' })),
        Row({ name: 'Charts row', w: 'fill', gap: 16, cross: 'start' }, Card({ name: 'Sales chart', h: 456, clip: true }, CardHeader('المبيعات اليومية', { sub: 'بالألف لتر · آخر 15 يوماً', right: Row({ gap: 16 }, legend('#0F766E', 'بنزين 95'), legend('#10B981', 'بنزين 90'), legend('#F59E0B', 'ديزل')) }), Row({ w: 'fill', gap: 12, cross: 'start' }, Col({ h: chartH, main: 'between', w: 28 }, ['10', '7.5', '5', '2.5', '0'].map(function (v) { return Txt(v, { style: 'Body/Small 12', color: 'text/muted' }); })), Col({ w: 'fill', gap: 8 }, Svg(lineChartSvg(chartW, chartH, series, 10), chartW, chartH, { name: 'Line chart' }), Row({ w: chartW, main: 'between' }, days.map(function (d) { return Txt(d, { style: 'Body/Small 12', color: 'text/muted' }); })))), Row({ w: 'fill', pad: [10, 12], gap: 8, radius: 10, fill: 'status/warning-50' }, Ico('trendDown', { size: 16, color: 'status/warning-700' }), Txt('مبيعات الديزل تنخفض منذ 4 أيام بسبب انخفاض المخزون — التوريد القادم غير مسجل بعد.', { style: 'Body/Small 12', color: 'status/warning-700', w: 'fill' }))), Card({ name: 'Tanks', w: 360, h: 456, gap: 10, clip: true }, CardHeader('الخزانات', { icon: 'droplet', right: LinkText('إدارة المخزون') }), Inst('Tank Level Bar', { level: '60' }, { Fuel: 'بنزين 90', Tank: 'خزان 1 · سعة 30,000 لتر', Percent: '62%', Current: 'دفتري 18,600 لتر', Updated: 'قياس 07:30' }, { w: 'fill' }), Inst('Tank Level Bar', { level: '40' }, { Fuel: 'بنزين 95', Tank: 'خزان 3 · سعة 20,000 لتر', Percent: '41%', Current: 'دفتري 8,200 لتر', Updated: 'قياس 07:30' }, { w: 'fill' }), Inst('Tank Level Bar', { level: '20' }, { Fuel: 'ديزل', Tank: 'خزان 2 · سعة 30,000 لتر', Percent: '18%', Current: 'دفتري 5,400 لتر', Updated: 'يكفي ~1.5 يوم' }, { w: 'fill' }))),
        Row({ name: 'Bottom row', w: 'fill', gap: 16, cross: 'start' }, Card({ name: 'Critical ops', pad: [20, 12, 12, 12], gap: 10, h: 300, clip: true }, Row({ w: 'fill', pad: [0, 8] }, CardHeader('آخر العمليات الحرجة', { right: LinkText('عرض الكل (10)') })), Table([{ t: 'الوقت', w: 48 }, { t: 'العملية', w: 'fill' }, { t: 'المسؤول', w: 130 }, { t: 'القيمة', w: 84 }, { t: 'الحالة', w: 132 }], [
            ops('10:42', 'فرق صندوق · المضخة 3', 'أحمد سالم', '-4,500', 'danger', 'بانتظار اعتمادك'),
            ops('10:15', 'بيع آجل فوق الحد', 'شركة الأمل للنقل', '38,000', 'warning', 'بانتظار موافقة'),
            ops('09:58', 'تسوية مخزون ديزل', 'سامي · مدير وردية', '-40 لتر', 'success', 'معتمدة'),
            ops('09:30', 'تعديل سعر بنزين 95', 'خالد العمر', '125 / لتر', 'success', 'منشور للزبائن')
        ], { rowPad: 10 })), Card({ name: 'Shifts', w: 360, h: 300, gap: 4, clip: true }, CardHeader('مناوبات اليوم', { right: Badge('success', '3 مغلقة') }), shift('1', 'محمد خليل', 'مغلقة', 'success', 'بنزين 90 · 06:00 – 14:00'), Divider(), shift('3', 'أحمد سالم', 'بانتظار الاعتماد', 'warning', 'بنزين 95 · فرق -4,500'), Divider(), shift('4', 'علي حسن', 'مفتوحة 11 ساعة', 'danger', 'ديزل · منذ 23:40 أمس')))
    ], { h: 1226 });
}
function O2_Tanks() {
    function tankRow(o) {
        const TW = 330;
        const bookW = Math.round(TW * o.book / o.cap), measW = Math.round(TW * o.meas / o.cap);
        const col = o.tone === 'danger' ? 'status/danger' : (o.tone === 'warning' ? 'status/warning' : 'brand/primary');
        return Row({ name: 'Tank · ' + o.name, w: 'fill', pad: 20, gap: 24, radius: 16, fill: 'surface/card', stroke: o.alert ? 'status/danger' : 'border/default', strokeOpacity: o.alert ? 0.5 : 1, shadow: 'Shadow/Card' }, Col({ w: 230, gap: 8 }, Row({ gap: 10 }, IconBox('droplet', { bg: o.tone === 'warning' ? 'status/warning-50' : 'brand/primary-50', fg: col }), Col({ gap: 0 }, Txt(o.name, { style: 'Heading/H3 16' }), Txt(o.tank + ' · سعة ' + o.capT + ' لتر', { style: 'Body/Small 12', color: 'text/muted' }))), o.badge ? Badge(o.badge[0], o.badge[1]) : null), Col({ w: TW, gap: 8 }, Row({ w: 'fill', main: 'between' }, Txt(o.pct + '%', { style: 'Number/L 24', color: o.tone === 'danger' || o.tone === 'warning' ? col : 'text/primary' }), Txt('الحد الأدنى 20%', { style: 'Body/Small 12', color: 'text/muted' })), Box({ name: 'Track', w: TW, h: 16, radius: 999, fill: 'surface/muted' }, Rect({ name: 'Book level', w: bookW, h: 16, x: TW - bookW, y: 0, radius: 999, fill: col }), Rect({ name: 'Measured marker', w: 3, h: 24, x: TW - measW - 1, y: -4, radius: 2, fill: 'brand/dark' }), Rect({ name: 'Min line', w: 1, h: 16, x: TW - Math.round(TW * 0.2), y: 0, fill: 'text/muted' })), Row({ gap: 14 }, Row({ gap: 6 }, Rect({ w: 12, h: 8, radius: 4, fill: col }), Txt('دفتري (من الحركات)', { style: 'Body/Small 12', color: 'text/secondary' })), Row({ gap: 6 }, Rect({ w: 3, h: 12, radius: 2, fill: 'brand/dark' }), Txt('آخر قياس فعلي ' + o.time, { style: 'Body/Small 12', color: 'text/secondary' })))), Row({ w: 'fill', gap: 12 }, [['الدفتري', o.bookT, 'text/primary', 'book'], ['المقاس', o.measT, 'text/primary', 'ruler'], ['الفرق', o.diff, o.diffTone, 'transfer'], ['يكفي', o.days, 'text/primary', 'clock']].map(function (k) {
            return Col({ w: 'fill', pad: [10, 12], gap: 2, radius: 12, fill: k[0] === 'الفرق' && o.diffTone === 'status/danger-700' ? 'status/danger-50' : 'surface/page' }, Row({ gap: 6 }, Ico(k[3], { size: 14, color: 'text/muted' }), Txt(k[0], { style: 'Body/Small 12', color: 'text/muted' })), Txt(k[1], { style: 'Number/M 18', color: k[2] }));
        })));
    }
    function mv(date, type, tone, tank, qty, ref, by) {
        return [Txt(date, { style: 'Body/Small 12', color: 'text/secondary', w: 130 }), Row({ w: 110 }, Badge(tone, type)), Txt(tank, { style: 'Body/Regular 14', w: 150 }),
            Txt(qty, { style: 'Body/Strong 14', w: 120, color: qty.charAt(0) === '+' ? 'brand/action-700' : 'text/primary' }), Txt(ref, { style: 'Body/Regular 14', color: 'brand/primary', w: 'fill' }), Txt(by, { style: 'Body/Small 12', color: 'text/secondary', w: 160 }),
            Row({ w: 40, main: 'center' }, Ico('history', { size: 16, color: 'text/muted' }))];
    }
    return Desktop('O2 · الخزانات والمخزون', 'tanks', [
        PageHeader('الخزانات والمخزون', 'المخزون يُحسب من الحركات المسجلة ويُطابق بالقياس الفعلي — لا حساسات مطلوبة', [
            Btn('secondary', 'نقل بين الخزانات', 'transfer'), Btn('secondary', 'تسجيل قياس فعلي', 'ruler'), Btn('primary', 'إضافة توريد', 'plus')
        ]),
        Inst('Alert Banner', { tone: 'danger' }, { Title: 'فرق كبير في خزان 1: المقاس أقل من الدفتري بـ 310 لتر', Body: 'تجاوز حد التسامح (100 لتر). التسوية تحتاج سبباً واعتماد المدير، وتُسجَّل كقيد عكسي في سجل المراجعة.', Action: 'بدء التسوية' }, { w: 'fill' }),
        tankRow({ name: 'بنزين 90', tank: 'خزان 1', capT: '30,000', cap: 30000, book: 18600, meas: 18290, pct: 62, time: '07:30', bookT: '18,600', measT: '18,290', diff: '-310', diffTone: 'status/danger-700', days: '3.1 يوم', alert: true, badge: ['danger', 'فرق يتطلب سبباً'] }),
        tankRow({ name: 'ديزل', tank: 'خزان 2', capT: '30,000', cap: 30000, book: 5400, meas: 5360, pct: 18, tone: 'warning', time: '07:30', bookT: '5,400', measT: '5,360', diff: '-40', diffTone: 'text/primary', days: '1.5 يوم', badge: ['warning', 'أقل من الحد الأدنى'] }),
        tankRow({ name: 'بنزين 95', tank: 'خزان 3', capT: '20,000', cap: 20000, book: 8200, meas: 8180, pct: 41, time: '07:30', bookT: '8,200', measT: '8,180', diff: '-20', diffTone: 'text/primary', days: '2.4 يوم', badge: ['info', 'سعر شراء الشحنة الأخيرة غير مدخل'] }),
        Card({ name: 'Movements', pad: [20, 12, 12, 12], gap: 12 }, Row({ w: 'fill', main: 'between', pad: [0, 8] }, CardHeader('سجل حركات المخزون', { icon: 'history' }), Row({ gap: 8 }, ['الكل', 'وارد', 'بيع', 'تسوية', 'هدر', 'إرجاع'].map(function (c, i) { return Chip(c, i === 0, { h: 32 }); }))), Table([{ t: 'التاريخ', w: 130 }, { t: 'النوع', w: 110 }, { t: 'الخزان', w: 150 }, { t: 'الكمية', w: 120 }, { t: 'المرجع', w: 'fill' }, { t: 'بواسطة', w: 160 }, { t: '', w: 40 }], [
            mv('اليوم 07:30', 'تسوية', 'warning', 'خزان 2 · ديزل', '-40 لتر', 'قياس فعلي QM-0921', 'سامي · مدير الوردية'),
            mv('اليوم 06:00', 'بيع', 'neutral', 'خزان 1 · بنزين 90', '-6,180 لتر', 'مناوبات 23 سبتمبر', 'النظام'),
            mv('أمس 16:20', 'وارد', 'success', 'خزان 3 · بنزين 95', '+12,000 لتر', 'فاتورة مورد INV-2231', 'خالد العمر'),
            mv('أمس 09:10', 'هدر', 'danger', 'خزان 1 · بنزين 90', '-15 لتر', 'تسرب أثناء التعبئة — صورة مرفقة', 'محمد خليل'),
            mv('22 سبتمبر', 'إرجاع', 'info', 'خزان 2 · ديزل', '+200 لتر', 'إرجاع من شركة الأمل للنقل', 'سامي · مدير الوردية')
        ], { rowPad: 10 }))
    ]);
}
function O3_Sales() {
    function pump(n, fuel, who, tone, st, sel) {
        return Row({ name: 'Pump ' + n, w: 'fill', pad: 12, gap: 12, radius: 12, fill: sel ? 'brand/primary-50' : 'surface/card', stroke: sel ? 'brand/primary' : 'border/default', strokeW: sel ? 2 : 1 }, Row({ w: 40, h: 40, radius: 10, fill: sel ? 'brand/primary' : 'surface/muted', main: 'center', cross: 'center' }, Txt(String(n), { style: 'Heading/H3 16', color: sel ? 'text/on-dark' : 'text/secondary' })), Col({ w: 'fill', gap: 0 }, Txt('المضخة ' + n + ' · ' + fuel, { style: 'Body/Strong 14' }), Txt(who, { style: 'Body/Small 12', color: 'text/muted' })), Badge(tone, st));
    }
    function stat(label, value, sub, icon, tone) {
        return Col({ w: 'fill', pad: 14, gap: 4, radius: 12, fill: tone === 'danger' ? 'status/danger-50' : 'surface/page', stroke: tone === 'danger' ? 'status/danger' : null, strokeOpacity: 0.4 }, Row({ gap: 6 }, Ico(icon, { size: 14, color: tone === 'danger' ? 'status/danger' : 'text/muted' }), Txt(label, { style: 'Body/Small 12', color: 'text/secondary' })), Txt(value, { style: 'Number/L 24', color: tone === 'danger' ? 'status/danger-700' : 'text/primary' }), sub ? Txt(sub, { style: 'Body/Small 12', color: tone === 'danger' ? 'status/danger-700' : 'text/muted' }) : null);
    }
    function pay(icon, m, n, amt) { return [Row({ w: 'fill', gap: 8 }, Ico(icon, { size: 16, color: 'text/secondary' }), Txt(m, { style: 'Body/Strong 14' })), Txt(n, { style: 'Body/Regular 14', w: 120 }), Txt(amt, { style: 'Body/Strong 14', w: 160 })]; }
    return Desktop('O3 · المبيعات والمناوبات', 'sales', [
        PageHeader('المبيعات والمضخات والمناوبات', 'الخميس 24 سبتمبر · 6 مضخات · 4 مناوبات', [PeriodChips(0), Btn('secondary', 'تصدير', 'download')]),
        Row({ name: 'Split', w: 'fill', h: 'fill', gap: 20, cross: 'start' }, Card({ name: 'Pumps', w: 380, gap: 10 }, CardHeader('المضخات والمناوبات', { right: LinkText('الكل') }), pump(1, 'بنزين 90', 'محمد خليل · 06:00 – 14:00', 'success', 'مغلقة', false), pump(2, 'بنزين 90', 'يوسف ديب · منذ 14:00', 'info', 'مفتوحة', false), pump(3, 'بنزين 95', 'أحمد سالم · 06:00 – 14:05', 'warning', 'بانتظار الاعتماد', true), pump(4, 'ديزل', 'علي حسن · منذ 23:40 أمس', 'danger', 'مفتوحة طويلاً', false), pump(5, 'بنزين 95', 'رامي نصر · 06:00 – 14:00', 'success', 'مغلقة', false), pump(6, 'ديزل', 'لا توجد مناوبة', 'neutral', 'متوقفة', false)), Card({ name: 'Shift detail', gap: 18 }, Row({ w: 'fill', main: 'between', cross: 'start' }, Col({ gap: 4 }, Row({ gap: 10 }, Txt('مناوبة المضخة 3', { style: 'Heading/H2 20' }), Badge('warning', 'بانتظار اعتمادك')), Txt('أحمد سالم · 06:00 – 14:05 · بنزين 95 · سعر اللتر 125 ل.س', { style: 'Body/Regular 14', color: 'text/secondary' })), Row({ gap: 10 }, Btn('secondary', 'طلب تصحيح', 'message'), Btn('action', 'اعتماد الإغلاق', 'check'))), Row({ w: 'fill', gap: 12 }, stat('القراءة الافتتاحية', '184,220.5', '06:00 · صورة مرفقة', 'camera'), stat('القراءة النهائية', '191,640.0', '14:05 · صورة مرفقة', 'camera'), stat('اللترات المباعة', '7,419.5', 'محسوبة تلقائياً', 'droplet'), stat('قيمة المبيعات', '927,438', 'ل.س', 'chart')), Col({ w: 'fill', gap: 8 }, Txt('طرق الدفع', { style: 'Heading/H3 16' }), Table([{ t: 'الطريقة', w: 'fill' }, { t: 'عدد العمليات', w: 120 }, { t: 'المبلغ (ل.س)', w: 160 }], [
            pay('cash', 'نقدي', '94', '639,438'), pay('card', 'بطاقة مسجلة', '14', '180,000'), pay('building', 'آجل (شركات)', '3', '96,000'), pay('ticket', 'قسيمة / خصم', '2', '12,000')
        ], { rowPad: 9 }), Row({ w: 'fill', pad: [10, 16], radius: 10, fill: 'brand/primary-50', main: 'between' }, Txt('الإجمالي · 113 عملية', { style: 'Body/Strong 14', color: 'brand/primary' }), Txt('927,438 ل.س', { style: 'Number/M 18', color: 'brand/primary' }))), Row({ w: 'fill', gap: 12 }, stat('النقد المتوقع في الصندوق', '639,438', 'المبيعات - البطاقة - الآجل - القسائم', 'cash'), stat('النقد الفعلي (أدخله العامل)', '634,938', '14:05', 'wallet'), stat('فرق الصندوق', '-4,500', 'أكبر من الحد المسموح (1,000 ل.س)', 'alert', 'danger')), Row({ w: 'fill', pad: 14, gap: 12, radius: 12, fill: 'surface/muted', cross: 'start' }, Avatar('أس', 32), Col({ w: 'fill', gap: 2 }, Txt('سبب العامل', { style: 'Label/12', color: 'text/muted' }), Txt('«دفعة بطاقة بقيمة 4,500 سُجلت نقداً بالخطأ في الساعة 11:20.»', { style: 'Body/Strong 14', w: 'fill' })), Badge('info', 'صورة الصندوق مرفقة')), Row({ w: 'fill', pad: 14, gap: 12, radius: 12, fill: 'status/warning-50', stroke: 'status/warning', strokeOpacity: 0.4 }, Ico('alert', { size: 20, color: 'status/warning-700' }), Col({ w: 'fill', gap: 0 }, Txt('عملية معلّقة ضمن المناوبة', { style: 'Body/Strong 14', color: 'status/warning-700' }), Txt('بيع آجل لشركة الأمل للنقل · 38,000 ل.س · يتجاوز الحد المتبقي (26,000 ل.س)', { style: 'Body/Small 12', color: 'text/secondary' })), Btn('secondary', 'رفض'), Btn('primary', 'موافقة'))))
    ]);
}
function O4_Journal() {
    function je(no, date, desc, amt, src, tone, st, sel) {
        const r = [Col({ w: 96, gap: 0 }, Txt(no, { style: 'Body/Strong 14', color: sel ? 'brand/primary' : 'text/primary' }), Txt(date, { style: 'Body/Small 12', color: 'text/muted' })),
            Txt(desc, { style: 'Body/Regular 14', w: 'fill' }), Txt(amt, { style: 'Body/Strong 14', w: 92 }), Txt(src, { style: 'Body/Small 12', color: 'brand/primary', w: 100 }), Row({ w: 104 }, Badge(tone, st))];
        if (sel)
            r.highlight = 'brand/primary-50';
        return r;
    }
    return Desktop('O4 · القيود المحاسبية', 'journal', [
        PageHeader('القيود المحاسبية', 'سبتمبر 2026 · الفترة مفتوحة', [Btn('secondary', 'تصدير', 'download'), Btn('primary', 'قيد يدوي', 'plus')]),
        Row({ w: 'fill', main: 'between' }, Row({ gap: 8 }, ['كل الحسابات', 'الصندوق', 'المبيعات', 'المخزون', 'الذمم'].map(function (c, i) { return Chip(c, i === 0, { h: 32 }); })), Row({ name: 'View mode', pad: 4, gap: 2, radius: 10, fill: 'surface/muted' }, Row({ h: 28, pad: [0, 10], radius: 7, main: 'center' }, Txt('عرض مبسّط', { style: 'Label/12', color: 'text/secondary' })), Row({ h: 28, pad: [0, 10], radius: 7, fill: 'surface/card', main: 'center', shadow: 'Shadow/Card' }, Txt('عرض المحاسب', { style: 'Label/12' })))),
        Card({ name: 'Entries', pad: [8, 8, 8, 8], gap: 0 }, Table([{ t: 'القيد', w: 96 }, { t: 'البيان', w: 'fill' }, { t: 'المبلغ', w: 92 }, { t: 'المصدر', w: 100 }, { t: 'الحالة', w: 104 }], [
            je('JE-1043', 'اليوم 15:10', 'مسودة: مصاريف كهرباء سبتمبر', '86,000', 'قيد يدوي', 'danger', 'غير متوازن'),
            je('JE-1042', 'اليوم 14:05', 'فرق صندوق · مناوبة المضخة 3', '4,500', 'إغلاق مناوبة', 'success', 'معتمد', true),
            je('JE-1041', 'اليوم 14:00', 'مبيعات نقدية · المضخة 1', '712,300', 'إغلاق مناوبة', 'neutral', 'آلي'),
            je('JE-1040', 'اليوم 14:00', 'مبيعات بطاقة · تسوية يومية', '210,000', 'تسوية بطاقات', 'neutral', 'آلي'),
            je('JE-1039', 'أمس 16:20', 'توريد بنزين 95 · 12,000 لتر', '1,320,000', 'INV-2231', 'neutral', 'آلي'),
            je('JE-1038', 'اليوم 07:30', 'تسوية مخزون ديزل -40 لتر', '3,800', 'قياس فعلي', 'success', 'معتمد'),
            je('JE-1037', 'اليوم 10:15', 'بيع آجل · شركة الأمل للنقل', '38,000', 'فاتورة آجل', 'warning', 'معلّق'),
            je('JE-1036', '22 سبتمبر', 'عكس القيد JE-1029 (خطأ إدخال)', '12,000', 'تصحيح', 'info', 'قيد عكسي')
        ], { rowPad: 10 }), Divider(), Row({ w: 'fill', pad: [14, 16], main: 'between' }, Row({ gap: 8 }, Ico('checkCircle', { size: 18, color: 'brand/action' }), Txt('إجمالي المدين = إجمالي الدائن = 2,300,600 ل.س', { style: 'Body/Strong 14', color: 'brand/action-700' })), Txt('قيد واحد غير متوازن يمنع إغلاق الفترة', { style: 'Body/Small 12', color: 'status/danger-700' }))),
        Row({ w: 'fill', pad: 14, gap: 10, radius: 12, fill: 'status/info-50' }, Ico('info', { size: 18, color: 'status/info-700' }), Txt('اضغط أي قيد لفتح مصدره وسجله في الدرج الجانبي. إغلاق الفترة يمنع التعديل إلا بتسوية.', { style: 'Body/Small 12', color: 'status/info-700', w: 'fill' }))
    ], { left: Inst('Audit Drawer', {}, {}, { h: 'fill', name: 'Audit Drawer' }) });
}
function O5_Customers() {
    function cust(name, type, bal, tone, st, sel) {
        return Row({ w: 'fill', pad: 12, gap: 10, radius: 12, fill: sel ? 'brand/primary-50' : null, stroke: sel ? 'brand/primary' : null }, Avatar(name.split(' ').map(function (w) { return w.charAt(0); }).slice(0, 2).join(''), 36, { fill: sel ? 'brand/primary' : 'surface/muted', color: sel ? 'text/on-dark' : 'text/secondary' }), Col({ w: 'fill', gap: 0 }, Txt(name, { style: 'Body/Strong 14' }), Txt(type + ' · ' + bal, { style: 'Body/Small 12', color: 'text/muted' })), Badge(tone, st));
    }
    function op(d, who, l, a, tone, st) { return [Col({ w: 'fill', gap: 0 }, Txt(who, { style: 'Body/Strong 14' }), Txt(d + (l !== '—' ? ' · ' + l + ' لتر' : ''), { style: 'Body/Small 12', color: 'text/muted' })), Txt(a, { style: 'Body/Strong 14', w: 84 }), Row({ w: 116 }, Badge(tone, st))]; }
    function aging(label, amt, pctW, tone) {
        return Col({ w: 'fill', gap: 6 }, Row({ w: 'fill', main: 'between' }, Txt(label, { style: 'Body/Regular 14', color: 'text/secondary' }), Txt(amt, { style: 'Body/Strong 14', color: tone === 'danger' ? 'status/danger-700' : 'text/primary' })), Box({ w: 240, h: 8, radius: 999, fill: 'surface/muted' }, Rect({ w: pctW, h: 8, x: 240 - pctW, y: 0, radius: 999, fill: tone === 'danger' ? 'status/danger' : (tone === 'warning' ? 'status/warning' : 'brand/primary') })));
    }
    return Desktop('O5 · العملاء والديون', 'customers', [
        PageHeader('العملاء والديون وحسابات الشركات', 'البيع الآجل وسقوف الائتمان وكشوف الحساب', [Btn('secondary', 'كشوف الشهر (4)', 'fileText'), Btn('primary', 'عميل جديد', 'plus')]),
        Row({ name: 'Three columns', w: 'fill', gap: 16, cross: 'start' }, Card({ name: 'List', w: 300, gap: 10, pad: 14 }, Row({ w: 'fill', h: 40, pad: [0, 12], gap: 8, radius: 10, fill: 'surface/page', stroke: 'border/default' }, Ico('search', { size: 16, color: 'text/muted' }), Txt('ابحث بالاسم أو رقم السيارة', { style: 'Body/Regular 14', color: 'text/muted', w: 'fill' })), Row({ gap: 6 }, Chip('الكل', true, { h: 30 }), Chip('شركات', false, { h: 30 }), Chip('أفراد', false, { h: 30 }), Chip('متأخر', false, { h: 30 })), cust('شركة الأمل للنقل', 'شركة', '212,000', 'danger', 'متأخر', true), cust('مؤسسة البناء', 'شركة', '164,000', 'warning', 'قرب الحد'), cust('تكسي المدينة', 'شركة', '98,500', 'success', 'منتظم'), cust('سامر يوسف', 'فرد', '12,000', 'success', 'منتظم'), cust('نقليات الساحل', 'شركة', '0', 'neutral', 'موقوف'), cust('ليلى حداد', 'فرد', '4,500', 'info', 'نزاع فاتورة')), Card({ name: 'Details', gap: 16 }, Row({ w: 'fill', main: 'between', cross: 'start' }, Row({ gap: 12 }, IconBox('building', { size: 48, radius: 14 }), Col({ gap: 2 }, Txt('شركة الأمل للنقل', { style: 'Heading/H2 20' }), Txt('حساب شركة · 12 سائقاً · 18 مركبة', { style: 'Body/Small 12', color: 'text/muted' }))), Badge('danger', 'متأخر 45 يوماً')), Row({ w: 'fill', gap: 12 }, Col({ w: 'fill', pad: 14, gap: 2, radius: 12, fill: 'surface/page' }, Txt('الرصيد المستحق', { style: 'Body/Small 12', color: 'text/muted' }), Money('212,000')), Col({ w: 'fill', pad: 14, gap: 2, radius: 12, fill: 'surface/page' }, Txt('الحد الائتماني', { style: 'Body/Small 12', color: 'text/muted' }), Money('250,000'))), Col({ w: 'fill', gap: 6 }, Row({ w: 'fill', main: 'between' }, Txt('المستخدم من الحد', { style: 'Body/Small 12', color: 'text/secondary' }), Txt('85%', { style: 'Body/Strong 14', color: 'status/warning-700' })), Box({ w: 'fill', h: 10, radius: 999, fill: 'surface/muted' }, Rect({ w: 398, h: 10, x: 70, y: 0, radius: 999, fill: 'status/warning', constraints: { horizontal: 'SCALE', vertical: 'SCALE' } }))), Row({ gap: 0 }, ['العمليات', 'السائقون', 'المركبات', 'كشف الحساب'].map(function (t, i) {
            return Col({ w: 92, gap: 6, cross: 'center' }, Txt(t, { style: 'Body/Strong 14', color: i === 0 ? 'brand/primary' : 'text/muted' }), Rect({ w: 'fill', h: 2, fill: i === 0 ? 'brand/primary' : 'border/default' }));
        })), Table([{ t: 'العملية', w: 'fill' }, { t: 'المبلغ', w: 84 }, { t: 'الحالة', w: 116 }], [
            op('اليوم 10:15', 'ماهر · شاحنة 45821', '304', '38,000', 'warning', 'بانتظار موافقة'),
            op('22 سبتمبر', 'فادي · شاحنة 45817', '280', '35,000', 'success', 'مسجلة'),
            op('20 سبتمبر', 'ماهر · شاحنة 45821', '296', '37,000', 'success', 'مسجلة'),
            op('15 سبتمبر', 'سداد جزئي', '—', '-60,000', 'info', 'دفعة')
        ], { rowPad: 9 }), Row({ w: 'fill', gap: 10 }, Btn('secondary', 'تسجيل دفعة', 'wallet', { w: 'fill' }), Btn('secondary', 'إرسال الكشف', 'share', { w: 'fill' }), Btn('danger', 'تجميد الحساب', 'snow', { w: 'fill' }))), Card({ name: 'Risk', w: 280, gap: 14 }, CardHeader('مخاطر الديون', { icon: 'alert' }), aging('0 – 30 يوماً', '412,000', 150, 'ok'), aging('31 – 60 يوماً', '212,000', 78, 'warning'), aging('أكثر من 60 يوماً', '60,000', 22, 'danger'), Divider(), KV('عملاء تجاوزوا الحد', '1'), KV('فواتير متنازع عليها', '1'), KV('كشوف جاهزة للإرسال', '4'), Col({ w: 'fill', pad: 14, gap: 8, radius: 12, fill: 'brand/primary-50' }, Row({ gap: 6 }, Ico('info', { size: 16, color: 'brand/primary' }), Txt('إجراء مقترح', { style: 'Label/12', color: 'brand/primary' })), Txt('شركة الأمل استخدمت 85% من حدها ومتأخرة 45 يوماً. أرسل الكشف وحدّد موعد سداد قبل التجميد.', { style: 'Body/Small 12', color: 'text/primary', w: 'fill' }), Btn('primary', 'إرسال الكشف الآن', null, { w: 'fill' }))))
    ]);
}
const OWNER_SCREENS = [O1_Dashboard, O2_Tanks, O3_Sales, O4_Journal, O5_Customers];
// ============================================================
// Station worker screens (mobile 390x844)
// ============================================================
function Body(kids, p) { return Col(Object.assign({ name: 'Body', w: 'fill', h: 'fill', pad: 16, gap: 16, clip: true }, p || {}), kids); }
function Label(t, p) { return Txt(t, Object.assign({ style: 'Label/12', color: 'text/secondary' }, p || {})); }
function S1_ShiftStart() {
    function pumpTile(n, fuel, st, sel, busy) {
        return Col({ name: 'Pump ' + n, w: 'fill', h: 78, pad: 10, gap: 2, radius: 14, fill: sel ? 'brand/primary-50' : (busy ? 'surface/muted' : 'surface/card'), stroke: sel ? 'brand/primary' : 'border/default', strokeW: sel ? 2 : 1 }, Row({ w: 'fill', main: 'between' }, Txt('مضخة ' + n, { style: 'Body/Strong 14', color: busy ? 'text/muted' : 'text/primary' }), sel ? Row({ w: 18, h: 18, radius: 999, fill: 'brand/primary', main: 'center', cross: 'center' }, Ico('check', { size: 12, color: 'text/on-dark' })) : Dot(8, busy ? 'status/warning' : 'brand/action')), Txt(fuel, { style: 'Body/Small 12', color: 'text/secondary' }), Txt(st, { style: 'Label/11', color: busy ? 'status/warning-700' : 'brand/action-700' }));
    }
    return Mobile('S1 · بداية المناوبة', [
        WorkerHeader({ sub: 'محطة النور · الخميس 24 سبتمبر · 06:00' }),
        Body([
            Col({ gap: 2 }, Txt('بداية المناوبة', { style: 'Heading/H1 24' }), Txt('ثلاث خطوات: المضخة، القراءة، الصندوق', { style: 'Body/Regular 14', color: 'text/secondary' })),
            Col({ w: 'fill', gap: 8 }, Label('1. اختر المضخة'), Row({ w: 'fill', gap: 8 }, pumpTile(1, 'بنزين 90', 'متاحة'), pumpTile(2, 'بنزين 90', 'مع يوسف', false, true), pumpTile(3, 'بنزين 95', 'متاحة', true)), Row({ w: 'fill', gap: 8 }, pumpTile(4, 'ديزل', 'مع علي', false, true), pumpTile(5, 'بنزين 95', 'متاحة'), pumpTile(6, 'ديزل', 'متاحة'))),
            Inst('Input', { size: 'lg', state: 'focus' }, { Label: '2. القراءة الافتتاحية لعداد المضخة 3', Value: '184,220.5', Suffix: 'لتر', Helper: 'آخر قراءة إغلاق مسجلة: 184,220.5 — مطابقة' }, { w: 'fill' }),
            Row({ name: 'Photo', w: 'fill', pad: 12, gap: 12, radius: 14, fill: 'surface/card', stroke: 'border/default' }, Row({ w: 52, h: 52, radius: 10, fill: 'brand/dark', main: 'center', cross: 'center' }, Ico('camera', { size: 22, color: 'text/on-dark' })), Col({ w: 'fill', gap: 0 }, Txt('صورة العداد', { style: 'Body/Strong 14' }), Txt('تثبت القراءة عند المراجعة', { style: 'Body/Small 12', color: 'text/muted' })), Badge('success', 'تم الالتقاط')),
            Row({ name: 'Cash box', w: 'fill', pad: 12, gap: 12, radius: 14, fill: 'surface/card', stroke: 'border/default' }, Row({ w: 24, h: 24, radius: 6, fill: 'brand/primary', main: 'center', cross: 'center' }, Ico('check', { size: 16, color: 'text/on-dark' })), Col({ w: 'fill', gap: 0 }, Txt('3. استلمت صندوق البداية', { style: 'Body/Strong 14' }), Txt('50,000 ل.س من مناوبة محمد خليل', { style: 'Body/Small 12', color: 'text/muted' })), Ico('cash', { size: 22, color: 'text/secondary' }))
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
            Col({ name: 'Amount', w: 'fill', pad: 16, gap: 6, radius: 18, fill: 'surface/card', stroke: 'brand/primary', strokeW: 2 }, Row({ w: 'fill', main: 'between' }, Label('المبلغ المدفوع'), Txt('مسح', { style: 'Label/12', color: 'status/danger-700' })), Row({ gap: 8, cross: 'end' }, Txt('5,000', { style: 'Number/Hero 44' }), Col({ pad: [0, 0, 8, 0] }, Txt('ل.س', { style: 'Heading/H3 16', color: 'text/muted' }))), Divider(), Row({ w: 'fill', main: 'between' }, Txt('= 40.00 لتر', { style: 'Number/M 18', color: 'brand/primary' }), Row({ gap: 6 }, Ico('lock', { size: 14, color: 'text/muted' }), Txt('125 ل.س/لتر · سعر مقفل', { style: 'Body/Small 12', color: 'text/muted' })))),
            Row({ name: 'Quick amounts', w: 'fill', gap: 8 }, quick('2,000'), quick('5,000', true), quick('10,000'), quick('ملء كامل')),
            Col({ w: 'fill', gap: 8 }, Label('طريقة الدفع'), Row({ w: 'fill', gap: 10 }, payOpt('نقدي', 'cash', true), payOpt('بطاقة', 'card')), Row({ w: 'fill', gap: 10 }, payOpt('آجل لشركة', 'building'), payOpt('قسيمة', 'ticket'))),
            Row({ name: 'Customer link', w: 'fill', pad: [12, 14], gap: 12, radius: 14, fill: 'surface/card', stroke: 'border/strong', dash: true }, Ico('scan', { size: 22, color: 'brand/primary' }), Col({ w: 'fill', gap: 0 }, Txt('ربط زبون (اختياري)', { style: 'Body/Strong 14' }), Txt('فقط إن أراد فاتورة رقمية أو نقاطاً', { style: 'Body/Small 12', color: 'text/muted' })), Txt('مسح QR', { style: 'Label/12', color: 'brand/primary' }))
        ]),
        BottomBar([Btn('action', 'حفظ العملية', 'check', { size: 'lg', w: 'fill' })])
    ]);
}
function S3_Saved() {
    return Mobile('S3 · تم الحفظ (دون اتصال)', [
        WorkerHeader({ sync: 'offline', syncLabel: 'غير متصل', chips: [['clock', 'المناوبة مفتوحة · 04:13'], ['fuel', 'المضخة 3 · بنزين 95']] }),
        Body([
            Col({ w: 'fill', gap: 8, cross: 'center', pad: [8, 0, 0, 0] }, Row({ w: 72, h: 72, radius: 999, fill: 'brand/action-50', main: 'center', cross: 'center' }, Ico('check', { size: 36, color: 'brand/action' })), Txt('تم حفظ العملية', { style: 'Heading/H1 24', align: 'center' }), Txt('رقم العملية A-10482 · 10:48', { style: 'Body/Regular 14', color: 'text/secondary', align: 'center' })),
            Inst('Alert Banner', { tone: 'warning' }, { Title: 'محفوظة على الجهاز', Body: 'ستُرسل تلقائياً عند عودة الاتصال · 3 عمليات بانتظار المزامنة', '!Action': true }, { w: 'fill' }),
            Col({ name: 'Receipt', w: 'fill', pad: 16, gap: 10, radius: 16, fill: 'surface/card', stroke: 'border/default' }, KV('الوقود', 'بنزين 95'), KV('الكمية', '40.00 لتر'), KV('سعر اللتر', '125 ل.س'), KV('طريقة الدفع', 'نقدي'), KV('الزبون', 'غير مرتبط', { vColor: 'text/muted' }), Divider(), Row({ w: 'fill', main: 'between' }, Txt('الإجمالي', { style: 'Heading/H3 16' }), Money('5,000'))),
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
            Row({ w: 'fill', pad: [12, 14], radius: 14, fill: 'surface/card', stroke: 'border/default', main: 'between' }, Col({ gap: 0 }, Label('القراءة الافتتاحية'), Txt('184,220.5 لتر', { style: 'Number/M 18' })), Txt('06:00 · صورة', { style: 'Body/Small 12', color: 'text/muted' })),
            Inst('Input', { size: 'lg', state: 'focus' }, { Label: 'القراءة النهائية للعداد', Value: '191,640.0', Suffix: 'لتر', Helper: 'يجب أن تكون أكبر من القراءة الافتتاحية' }, { w: 'fill' }),
            Col({ name: 'Computed', w: 'fill', pad: 16, gap: 10, radius: 16, fill: 'brand/primary-50' }, Row({ gap: 6 }, Ico('refresh', { size: 14, color: 'brand/primary' }), Txt('يُحسب تلقائياً', { style: 'Label/12', color: 'brand/primary' })), Row({ w: 'fill', main: 'between' }, Txt('اللترات المباعة', { style: 'Body/Regular 14', color: 'text/secondary' }), Txt('7,419.5 لتر', { style: 'Number/M 18' })), Row({ w: 'fill', main: 'between' }, Txt('قيمة المبيعات', { style: 'Body/Regular 14', color: 'text/secondary' }), Money('927,438', { style: 'Number/M 18' }))),
            Row({ name: 'Photo', w: 'fill', pad: 12, gap: 12, radius: 14, fill: 'surface/card', stroke: 'border/strong', dash: true }, Ico('camera', { size: 22, color: 'brand/primary' }), Col({ w: 'fill', gap: 0 }, Txt('صورة العداد النهائية', { style: 'Body/Strong 14' }), Txt('اختيارية — تسرّع الاعتماد', { style: 'Body/Small 12', color: 'text/muted' })), Txt('التقاط', { style: 'Label/12', color: 'brand/primary' }))
        ]),
        BottomBar([Btn('primary', 'التالي: النقد الفعلي', null, { size: 'lg', w: 'fill' })])
    ]);
}
function S5_CloseCash() {
    function line(label, v, sub) { return Row({ w: 'fill', main: 'between' }, Col({ gap: 0 }, Txt(label, { style: 'Body/Regular 14', color: 'text/secondary' }), sub ? Txt(sub, { style: 'Body/Small 12', color: 'text/muted' }) : null), Txt(v, { style: 'Body/Strong 14' })); }
    return Mobile('S5 · إغلاق 2/3 النقد الفعلي', [
        CloseHeader(2),
        Body([
            Col({ name: 'Expected', w: 'fill', pad: 16, gap: 10, radius: 16, fill: 'surface/card', stroke: 'border/default' }, line('إجمالي المبيعات', '927,438'), line('بطاقة', '- 180,000', '14 عملية'), line('آجل لشركات', '- 96,000', '3 عمليات'), line('قسائم', '- 12,000', 'عمليتان'), Divider(), Row({ w: 'fill', main: 'between' }, Txt('النقد المتوقع', { style: 'Heading/H3 16' }), Money('639,438', { style: 'Number/M 18' }))),
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
            Col({ name: 'Summary', w: 'fill', pad: [12, 16], gap: 8, radius: 16, fill: 'surface/card', stroke: 'border/default' }, KV('اللترات المباعة', '7,419.5 لتر'), KV('المبيعات', '927,438 ل.س'), KV('النقد المتوقع', '639,438 ل.س'), KV('النقد الفعلي', '634,938 ل.س'), Row({ w: 'fill', pad: [8, 10], radius: 10, fill: 'status/danger-50', main: 'between' }, Txt('فرق الصندوق', { style: 'Body/Strong 14', color: 'status/danger-700' }), Txt('-4,500 ل.س', { style: 'Number/M 18', color: 'status/danger-700' }))),
            Col({ name: 'Reason', w: 'fill', gap: 6 }, Row({ gap: 6 }, Label('سبب الفرق'), Badge('danger', 'إلزامي')), Col({ w: 'fill', h: 76, pad: 12, radius: 14, fill: 'surface/card', stroke: 'brand/primary', strokeW: 2 }, Txt('دفعة بطاقة بقيمة 4,500 سُجلت نقداً بالخطأ الساعة 11:20.', { style: 'Body/Regular 14', w: 'fill' })), Row({ gap: 8 }, Ico('camera', { size: 16, color: 'brand/action' }), Txt('صورة الصندوق مرفقة', { style: 'Body/Small 12', color: 'brand/action-700' }))),
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
            Col({ w: 'fill', gap: 10, cross: 'center', pad: [24, 0, 8, 0] }, Row({ w: 88, h: 88, radius: 999, fill: 'brand/action-50', main: 'center', cross: 'center' }, Row({ w: 60, h: 60, radius: 999, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('check', { size: 32, color: 'brand/on-action' }))), Txt('تم إرسال الإغلاق', { style: 'Heading/H1 24', align: 'center' }), Badge('warning', 'بانتظار اعتماد خالد العمر')),
            Col({ name: 'Summary', w: 'fill', pad: 16, gap: 10, radius: 16, fill: 'surface/card', stroke: 'border/default' }, KV('المضخة', '3 · بنزين 95'), KV('الوقت', '06:00 – 14:05'), KV('اللترات', '7,419.5 لتر'), KV('المبيعات', '927,438 ل.س'), KV('فرق الصندوق', '-4,500 ل.س', { vColor: 'status/danger-700' }), Row({ w: 'fill', gap: 6 }, Ico('checkCircle', { size: 14, color: 'brand/action' }), Txt('السبب والصورة مرفقان', { style: 'Body/Small 12', color: 'text/secondary' }))),
            Row({ w: 'fill', pad: 12, gap: 8, radius: 12, fill: 'surface/muted' }, Ico('lock', { size: 16, color: 'text/secondary' }), Txt('المناوبة مقفلة. أي تعديل يحتاج طلب فتح من المدير.', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }))
        ]),
        BottomBar([Btn('secondary', 'طباعة الملخص', 'printer', { w: 'fill' }), Btn('action', 'تم', null, { size: 'lg', w: 'fill' })])
    ]);
}
const STAFF_SCREENS = [S1_ShiftStart, S2_QuickFill, S3_Saved, S4_CloseReading, S5_CloseCash, S6_CloseReview, S7_CloseDone];
// ============================================================
// Customer app screens (mobile 390x844)
// ============================================================
function StationCard(o) {
    function price(fuel, p, av, tone) {
        return Col({ w: 'fill', pad: [8, 10], gap: 0, radius: 12, fill: 'surface/page' }, Txt(fuel, { style: 'Body/Small 12', color: 'text/secondary' }), Row({ gap: 3, cross: 'end' }, Txt(p, { style: 'Number/M 18' }), Txt('ل.س', { style: 'Label/11', color: 'text/muted' })), Row({ gap: 4 }, Dot(6, tone === 'warning' ? 'status/warning' : (tone === 'danger' ? 'status/danger' : 'brand/action')), Txt(av, { style: 'Label/11', color: tone === 'warning' ? 'status/warning-700' : (tone === 'danger' ? 'status/danger-700' : 'brand/action-700') })));
    }
    return Col({ name: 'Station · ' + o.name, w: 'fill', pad: 14, gap: 12, radius: 18, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Card' }, Row({ w: 'fill', gap: 12 }, IconBox('fuel', { size: 46, radius: 14, bg: o.bg || 'brand/primary-50' }), Col({ w: 'fill', gap: 2 }, Row({ w: 'fill', main: 'between' }, Txt(o.name, { style: 'Heading/H3 16' }), Txt(o.dist, { style: 'Body/Strong 14', color: 'text/secondary' })), Row({ gap: 6 }, Badge(o.open ? 'success' : 'neutral', o.open ? 'مفتوحة' : 'مغلقة'), Txt(o.meta, { style: 'Body/Small 12', color: 'text/muted' })))), Row({ w: 'fill', gap: 8 }, o.prices.map(function (p) { return price(p[0], p[1], p[2], p[3]); })), Row({ gap: 6 }, Ico('clock', { size: 14, color: o.stale ? 'status/warning-700' : 'text/muted' }), Txt(o.updated, { style: 'Body/Small 12', color: o.stale ? 'status/warning-700' : 'text/muted' })));
}
function C1_Home() {
    function shortcut(icon, t, bg, fg) {
        return Col({ w: 'fill', gap: 6, cross: 'center' }, IconBox(icon, { size: 56, radius: 18, bg: bg, fg: fg, iconSize: 24 }), Txt(t, { style: 'Label/12', color: 'text/primary', align: 'center' }));
    }
    function pinMarker(x, y, label, main) {
        return Row({ abs: true, x: x, y: y, h: 30, pad: [0, 10], gap: 4, radius: 999, fill: main ? 'brand/primary' : 'surface/card', shadow: 'Shadow/Raised' }, Ico('fuel', { size: 14, color: main ? 'text/on-dark' : 'brand/primary' }), Txt(label, { style: 'Label/12', color: main ? 'text/on-dark' : 'text/primary' }));
    }
    return Mobile('C1 · الرئيسية', [
        StatusBar(false),
        Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: [4, 16, 16, 16], gap: 16, clip: true }, Row({ w: 'fill', main: 'between' }, Col({ gap: 0 }, Txt('مساء الخير', { style: 'Body/Small 12', color: 'text/muted' }), Txt('سامر', { style: 'Heading/H1 24' })), Row({ gap: 8 }, IconBtn('bell', { dot: true, radius: 999, size: 44 }), Avatar('س', 44))), Row({ name: 'Search', w: 'fill', h: 48, pad: [0, 14], gap: 10, radius: 14, fill: 'surface/card', stroke: 'border/default' }, Ico('search', { size: 20, color: 'text/muted' }), Txt('ابحث عن محطة أو خدمة', { style: 'Body/Regular 14', color: 'text/muted', w: 'fill' }), Ico('sliders', { size: 18, color: 'text/secondary' })), Box({ name: 'Map', w: 'fill', h: 170, radius: 20, clip: true, fill: 'surface/muted' }, Svg(mapSvg(358, 170), 358, 170, { name: 'Map art', x: 0, y: 0 }), pinMarker(214, 96, '125', true), pinMarker(262, 62, '124'), pinMarker(24, 110, '126'), Dot(14, 'status/info', { name: 'Me', x: 183, y: 138, stroke: 'surface/card', strokeW: 3 }), Row({ name: 'Map chip', x: 186, y: 12, h: 28, pad: [0, 10], gap: 6, radius: 999, fill: 'surface/card', shadow: 'Shadow/Card' }, Ico('pin', { size: 14, color: 'brand/primary' }), Txt('3 محطات ضمن 5 كم', { style: 'Label/12' }))), Row({ name: 'Shortcuts', w: 'fill', gap: 8 }, shortcut('car', 'سيارتي', 'brand/primary-50', 'brand/primary'), shortcut('receipt', 'فواتيري', 'status/info-50', 'status/info'), shortcut('tag', 'العروض', 'status/warning-50', 'status/warning-700'), shortcut('message', 'الشكاوى', 'surface/muted', 'text/secondary')), Row({ w: 'fill', main: 'between' }, Txt('محطات قريبة', { style: 'Heading/H3 16' }), LinkText('عرض الكل')), Row({ gap: 8 }, Chip('الكل', true, { h: 32 }), Chip('بنزين 95', false, { h: 32 }), Chip('ديزل', false, { h: 32 }), Chip('غسيل', false, { h: 32 })), StationCard({ name: 'محطة النور', dist: '1.2 كم', open: true, meta: 'حتى 11:00 م · تقييم 4.6', prices: [['بنزين 95', '125', 'متوفر'], ['بنزين 90', '110', 'متوفر'], ['ديزل', '95', 'محدود', 'warning']], updated: 'الأسعار محدّثة قبل 20 دقيقة · من إدارة المحطة' }), StationCard({ name: 'محطة الربيع', dist: '2.8 كم', open: true, meta: '24 ساعة · تقييم 4.2', prices: [['بنزين 95', '124', 'متوفر'], ['بنزين 90', '110', 'غير متوفر', 'danger'], ['ديزل', '96', 'متوفر']], updated: 'آخر تحديث قبل 3 ساعات — قد لا يكون دقيقاً', stale: true })),
        Inst('Tab Bar', { active: 'home' }, {}, { w: 'fill' })
    ]);
}
function C2_Station() {
    function priceRow(fuel, p, tone, av) {
        return Row({ w: 'fill', pad: [12, 0], gap: 12 }, Row({ w: 36, h: 36, radius: 10, fill: 'brand/primary-50', main: 'center', cross: 'center' }, Ico('droplet', { size: 18, color: 'brand/primary' })), Col({ w: 'fill', gap: 2 }, Txt(fuel, { style: 'Body/Strong 14' }), Badge(tone, av)), Row({ gap: 4, cross: 'end' }, Txt(p, { style: 'Number/L 24' }), Txt('ل.س/لتر', { style: 'Body/Small 12', color: 'text/muted' })));
    }
    function svc(t, ok) { return Row({ h: 32, pad: [0, 12], gap: 6, radius: 999, fill: ok ? 'surface/card' : null, stroke: 'border/strong', dash: !ok }, Ico(ok ? 'check' : 'info', { size: 14, color: ok ? 'brand/action' : 'text/muted' }), Txt(t, { style: 'Label/12', color: ok ? 'text/primary' : 'text/muted' })); }
    return Mobile('C2 · صفحة المحطة', [
        Col({ name: 'Hero', w: 'fill', pad: [0, 16, 20, 16], gap: 14, fill: 'brand/dark' }, StatusBar(true), Row({ w: 'fill', main: 'between' }, IconBtn('arrowRight', { fill: 'brand/dark-800', stroke: null, color: 'text/on-dark', radius: 999 }), Row({ gap: 8 }, IconBtn('share', { fill: 'brand/dark-800', stroke: null, color: 'text/on-dark', radius: 999 }), IconBtn('star', { fill: 'brand/dark-800', stroke: null, color: 'status/warning', radius: 999 }))), Row({ w: 'fill', gap: 12 }, Row({ w: 56, h: 56, radius: 16, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 28, color: 'brand/dark' })), Col({ w: 'fill', gap: 4 }, Txt('محطة النور', { style: 'Heading/H1 24', color: 'text/on-dark' }), Row({ gap: 8 }, Badge('success', 'مفتوحة الآن'), Txt('حتى 11:00 م · 1.2 كم', { style: 'Body/Small 12', color: 'text/on-dark-muted' })))), Row({ gap: 6 }, Ico('star', { size: 14, color: 'status/warning' }), Txt('4.6 · 128 تقييماً · الطريق الدولي، المخرج 4', { style: 'Body/Small 12', color: 'text/on-dark-muted' }))),
        Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: 16, gap: 14, clip: true }, Card({ name: 'Prices', gap: 0, pad: [14, 16] }, Row({ w: 'fill', main: 'between', pad: [0, 0, 4, 0] }, Txt('الأسعار المنشورة', { style: 'Heading/H3 16' }), Badge('primary', 'من إدارة المحطة')), priceRow('بنزين 95', '125', 'success', 'متوفر'), Divider(), priceRow('بنزين 90', '110', 'success', 'متوفر'), Divider(), priceRow('ديزل', '95', 'warning', 'كمية محدودة'), Row({ w: 'fill', pad: [10, 12], gap: 8, radius: 10, fill: 'surface/page', main: 'between' }, Row({ gap: 6 }, Ico('clock', { size: 14, color: 'text/muted' }), Txt('آخر تحديث اليوم 07:30', { style: 'Body/Small 12', color: 'text/secondary' })), Txt('السعر غير صحيح؟', { style: 'Label/12', color: 'status/danger-700' }))), Card({ name: 'Services', gap: 10, pad: [14, 16] }, Txt('الخدمات', { style: 'Heading/H3 16' }), Row({ gap: 8 }, svc('غسيل', true), svc('تغيير زيت', true), svc('متجر', true)), Row({ gap: 8 }, svc('دورات مياه', true), svc('دفع بالبطاقة', true), svc('هواء', false)), Txt('الخدمة المنقطة غير مؤكدة من المحطة.', { style: 'Body/Small 12', color: 'text/muted' }))),
        BottomBar([Row({ w: 'fill', gap: 10 }, Btn('secondary', 'اتصال', 'phone', { size: 'lg', w: 130 }), Btn('primary', 'الاتجاهات', 'navigation', { size: 'lg', w: 'fill' }))])
    ]);
}
function C3_Invoices() {
    return Mobile('C3 · فواتيري', [
        StatusBar(false),
        Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: [4, 16, 16, 16], gap: 14, clip: true }, Row({ w: 'fill', main: 'between' }, Txt('فواتيري', { style: 'Heading/H1 24' }), Row({ gap: 8 }, IconBtn('filter', { radius: 999 }), IconBtn('download', { radius: 999 }))), Col({ name: 'Month', w: 'fill', pad: 18, gap: 10, radius: 20, fill: 'brand/dark' }, Row({ w: 'fill', main: 'between' }, Txt('سبتمبر 2026', { style: 'Label/12', color: 'text/on-dark-muted' }), Row({ gap: 4 }, Ico('chevronRight', { size: 16, color: 'text/on-dark-muted' }), Ico('chevronLeft', { size: 16, color: 'text/on-dark-muted' }))), Row({ gap: 6, cross: 'end' }, Txt('186,500', { style: 'Number/XL 32', color: 'text/on-dark' }), Txt('ل.س', { style: 'Body/Strong 14', color: 'text/on-dark-muted' })), Row({ w: 'fill', gap: 8 }, [['fuel', '9 تعبئات'], ['droplet', '1,492 لتر'], ['gift', '+120 نقطة']].map(function (s) {
            return Row({ w: 'fill', h: 32, gap: 6, radius: 10, fill: 'brand/dark-800', main: 'center' }, Ico(s[0], { size: 14, color: 'brand/action' }), Txt(s[1], { style: 'Label/12', color: 'text/on-dark' }));
        }))), Row({ gap: 8 }, Chip('كل السيارات', true, { h: 32 }), Chip('كيا ريو', false, { h: 32, icon: 'car' }), Chip('توسان', false, { h: 32, icon: 'car' })), Txt('هذا الأسبوع', { style: 'Label/12', color: 'text/muted' }), Inst('Invoice Card', { status: 'confirmed' }, { Station: 'محطة النور', Total: '5,000 ل.س', Details: 'بنزين 95 · 40.0 لتر · كيا ريو', Date: 'الخميس 24 سبتمبر · 10:48' }, { w: 'fill' }), Inst('Invoice Card', { status: 'pending' }, { Station: 'محطة الربيع', Total: '31,000 ل.س', Details: 'بنزين 95 · 250 لتر · توسان', Date: 'الثلاثاء 22 سبتمبر · 18:05' }, { w: 'fill' }), Inst('Invoice Card', { status: 'corrected' }, { Station: 'محطة النور', Total: '12,375 ل.س', Details: 'بنزين 90 · 112.5 لتر · كيا ريو', Date: 'الإثنين 21 سبتمبر · 08:12' }, { w: 'fill' }), Txt('الأسبوع الماضي', { style: 'Label/12', color: 'text/muted' }), Inst('Invoice Card', { status: 'confirmed' }, { Station: 'محطة النور', Total: '25,000 ل.س', Details: 'بنزين 95 · 200 لتر · توسان', Date: 'السبت 19 سبتمبر · 13:40' }, { w: 'fill' })),
        Inst('Tab Bar', { active: 'invoices' }, {}, { w: 'fill' })
    ]);
}
function C4_InvoiceDetail() {
    return Mobile('C4 · تفاصيل الفاتورة', [
        StatusBar(false),
        Row({ w: 'fill', pad: [4, 16, 8, 16], main: 'between' }, Row({ gap: 10 }, IconBtn('arrowRight', { radius: 999 }), Txt('تفاصيل الفاتورة', { style: 'Heading/H2 20' })), IconBtn('share', { radius: 999 })),
        Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: [8, 16, 16, 16], gap: 14, clip: true }, Col({ name: 'Receipt', w: 'fill', pad: 16, gap: 10, radius: 20, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Card' }, Row({ w: 'fill', gap: 12 }, IconBox('fuel', { size: 44, radius: 12 }), Col({ w: 'fill', gap: 0 }, Txt('محطة النور', { style: 'Heading/H3 16' }), Txt('فاتورة INV-2026-10482', { style: 'Body/Small 12', color: 'text/muted' })), Badge('success', 'مؤكدة')), Col({ w: 'fill', gap: 2, cross: 'center', pad: [8, 0] }, Txt('الإجمالي', { style: 'Body/Small 12', color: 'text/muted', align: 'center' }), Row({ gap: 6, cross: 'end' }, Txt('5,000', { style: 'Number/Hero 44' }), Txt('ل.س', { style: 'Heading/H3 16', color: 'text/muted' }))), Rect({ w: 'fill', h: 1, fill: 'border/strong' }), KV('التاريخ', '24 سبتمبر 2026 · 10:48'), KV('الوقود', 'بنزين 95'), KV('الكمية', '40.00 لتر'), KV('سعر اللتر', '125 ل.س'), KV('طريقة الدفع', 'نقدي'), KV('السيارة', 'كيا ريو · 123456'), KV('قراءة العداد', '84,210 كم')), Row({ w: 'fill', pad: 14, gap: 10, radius: 14, fill: 'brand/primary-50' }, Ico('gift', { size: 20, color: 'brand/primary' }), Txt('أضيفت 18 نقطة إلى رصيدك', { style: 'Body/Strong 14', color: 'brand/primary', w: 'fill' }), Txt('الرصيد 1,240', { style: 'Label/12', color: 'brand/primary' })), Row({ w: 'fill', gap: 10 }, Btn('secondary', 'تنزيل PDF', 'download', { w: 'fill' }), Btn('secondary', 'مشاركة', 'share', { w: 'fill' })), Row({ w: 'fill', main: 'between', pad: [4, 4] }, Row({ gap: 8 }, Ico('message', { size: 18, color: 'text/secondary' }), Txt('طلب تصحيح أو شكوى', { style: 'Body/Strong 14' })), Ico('chevronLeft', { size: 18, color: 'text/muted' })), Txt('أي تعديل على الفاتورة يظهر كتصحيح مع السبب، ولا يُحذف.', { style: 'Body/Small 12', color: 'text/muted', w: 'fill' })),
        Inst('Tab Bar', { active: 'invoices' }, {}, { w: 'fill' })
    ]);
}
function C5_Expense() {
    const months = ['أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر'];
    const vals = [142, 155, 171, 160, 166, 186.5];
    return Mobile('C5 · سيارتي ومصروفي', [
        StatusBar(false),
        Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: [4, 16, 16, 16], gap: 14, clip: true }, Txt('سيارتي ومصروفي', { style: 'Heading/H1 24' }), Row({ name: 'Car', w: 'fill', pad: 12, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default' }, IconBox('car', { size: 44, radius: 12 }), Col({ w: 'fill', gap: 0 }, Txt('كيا ريو 2019', { style: 'Heading/H3 16' }), Txt('لوحة 123456 · بنزين 95 · 84,210 كم', { style: 'Body/Small 12', color: 'text/muted' })), Ico('chevronDown', { size: 18, color: 'text/secondary' })), Card({ name: 'Spend', gap: 12, pad: 16 }, Row({ w: 'fill', main: 'between', cross: 'start' }, Col({ gap: 0 }, Txt('مصروف سبتمبر', { style: 'Body/Small 12', color: 'text/muted' }), Money('186,500', { style: 'Number/XL 32', unitStyle: 'Body/Strong 14' })), Badge('warning', '+12%')), Row({ w: 'fill', pad: [8, 10], gap: 8, radius: 10, fill: 'status/warning-50' }, Ico('trendUp', { size: 16, color: 'status/warning-700' }), Txt('صرفت أكثر من الشهر الماضي بـ 20,500 ل.س', { style: 'Body/Small 12', color: 'status/warning-700', w: 'fill' })), Svg(barChartSvg(326, 96, vals, 200, ['#CBD5E1', '#CBD5E1', '#CBD5E1', '#CBD5E1', '#CBD5E1', '#0F766E']), 326, 96, { name: 'Bar chart' }), Row({ w: 326, main: 'between' }, months.map(function (m, i) { return Txt(m, { style: 'Label/11', color: i === 5 ? 'brand/primary' : 'text/muted', w: 52, align: 'center' }); }))), Row({ w: 'fill', gap: 10 }, Col({ w: 'fill', pad: 14, gap: 2, radius: 14, fill: 'surface/card', stroke: 'border/default' }, Txt('متوسط الاستهلاك', { style: 'Body/Small 12', color: 'text/muted' }), Row({ gap: 4, cross: 'end' }, Txt('7.8', { style: 'Number/L 24' }), Txt('لتر/100 كم', { style: 'Label/11', color: 'text/muted' }))), Col({ w: 'fill', pad: 14, gap: 2, radius: 14, fill: 'surface/card', stroke: 'border/default' }, Txt('تكلفة الكيلومتر', { style: 'Body/Small 12', color: 'text/muted' }), Row({ gap: 4, cross: 'end' }, Txt('9.8', { style: 'Number/L 24' }), Txt('ل.س', { style: 'Label/11', color: 'text/muted' })))), Col({ name: 'Budget', w: 'fill', pad: 14, gap: 8, radius: 14, fill: 'surface/card', stroke: 'border/default' }, Row({ w: 'fill', main: 'between' }, Txt('الميزانية الشهرية', { style: 'Body/Strong 14' }), Txt('186,500 / 200,000', { style: 'Body/Small 12', color: 'text/secondary' })), Box({ w: 330, h: 10, radius: 999, fill: 'surface/muted' }, Rect({ w: 307, h: 10, x: 23, y: 0, radius: 999, fill: 'status/warning' })), Txt('متبقٍ 13,500 ل.س لنهاية الشهر', { style: 'Body/Small 12', color: 'status/warning-700' })), Row({ name: 'Maintenance', w: 'fill', pad: 14, gap: 12, radius: 14, fill: 'surface/card', stroke: 'border/default' }, IconBox('wrench', { size: 40, radius: 12, bg: 'status/info-50', fg: 'status/info' }), Col({ w: 'fill', gap: 0 }, Txt('تغيير الزيت بعد 420 كم', { style: 'Body/Strong 14' }), Txt('محسوب من قراءات العداد في فواتيرك', { style: 'Body/Small 12', color: 'text/muted' })), Txt('تذكير', { style: 'Label/12', color: 'brand/primary' }))),
        Inst('Tab Bar', { active: 'account' }, {}, { w: 'fill' })
    ]);
}
const CUSTOMER_SCREENS = [C1_Home, C2_Station, C3_Invoices, C4_InvoiceDetail, C5_Expense];
// ============================================================
// Owner screens — priority 2 + gap screens (O6–O11)
// ============================================================
function Toggle(on) {
    return Row({ name: 'Toggle', w: 40, h: 24, pad: 3, radius: 999, fill: on ? 'brand/action' : 'border/strong', main: on ? 'end' : 'start', cross: 'center' }, Dot(18, 'surface/card', { name: 'Knob' }));
}
function Radio(on, label, sub) {
    return Row({ name: 'Radio', w: 'fill', pad: 12, gap: 10, radius: 12, fill: on ? 'brand/primary-50' : 'surface/card', stroke: on ? 'brand/primary' : 'border/default', strokeW: on ? 2 : 1, cross: 'start' }, Row({ w: 20, h: 20, radius: 999, stroke: on ? 'brand/primary' : 'border/strong', strokeW: 2, main: 'center', cross: 'center' }, on ? Dot(10, 'brand/primary') : null), Col({ w: 'fill', gap: 0 }, Txt(label, { style: 'Body/Strong 14', w: 'fill' }), sub ? Txt(sub, { style: 'Body/Small 12', color: 'text/muted', w: 'fill' }) : null));
}
function Tabs(labels, activeIdx, tabW) {
    return Col({ name: 'Tabs', w: 'fill', gap: 0 }, Row({ gap: 4 }, labels.map(function (t, i) {
        const on = i === activeIdx;
        return Col({ w: tabW || 120, gap: 8, cross: 'center' }, Txt(t, { style: 'Body/Strong 14', color: on ? 'brand/primary' : 'text/muted' }), Rect({ w: 'fill', h: 2, fill: on ? 'brand/primary' : 'border/default' }));
    })), Rect({ w: 'fill', h: 1, fill: 'border/default' }));
}
function Field(label, value, p) {
    p = p || {};
    return Col({ name: 'Field · ' + label, w: p.w || 'fill', gap: 6 }, Txt(label, { style: 'Label/12', color: 'text/secondary' }), Row({ w: 'fill', h: p.h || 44, pad: [0, 12], gap: 8, radius: 10, fill: 'surface/card', stroke: p.focus ? 'brand/primary' : (p.error ? 'status/danger' : 'border/strong'), strokeW: p.focus || p.error ? 2 : 1, cross: p.h ? 'start' : 'center' }, p.icon ? Ico(p.icon, { size: 18, color: 'text/muted' }) : null, Col({ w: 'fill', pad: p.h ? [10, 0] : 0 }, Txt(value, { style: p.valueStyle || 'Body/Large 16', color: p.placeholder ? 'text/muted' : 'text/primary', w: 'fill' })), p.suffix ? Txt(p.suffix, { style: 'Body/Small 12', color: 'text/muted' }) : null, p.chevron ? Ico('chevronDown', { size: 16, color: 'text/muted' }) : null), p.helper ? Txt(p.helper, { style: 'Body/Small 12', color: p.error ? 'status/danger-700' : 'text/muted', w: 'fill' }) : null);
}
function MiniBars(values, colors, w, h) { return Svg(barChartSvg(w, h, values, Math.max.apply(null, values) * 1.1, colors), w, h, { name: 'Mini bars' }); }
function O6_Reports() {
    function report(icon, title, q, stat, statSub, tone, badge, pinned, extra) {
        return Col({ name: 'Report · ' + title, w: 'fill', pad: 18, gap: 10, radius: 16, fill: 'surface/card', stroke: pinned ? 'brand/primary' : 'border/default', strokeW: pinned ? 2 : 1, shadow: 'Shadow/Card' }, Row({ w: 'fill', main: 'between' }, IconBox(icon), pinned ? Badge('primary', 'مثبّت في اللوحة') : (badge ? Badge(badge[0], badge[1]) : null)), Txt(title, { style: 'Heading/H3 16', w: 'fill' }), Txt('«' + q + '»', { style: 'Body/Regular 14', color: 'text/secondary', w: 'fill' }), Row({ w: 'fill', main: 'between', cross: 'end' }, Col({ gap: 0 }, Txt(stat, { style: 'Number/M 18', color: tone || 'text/primary' }), Txt(statSub, { style: 'Body/Small 12', color: 'text/muted' })), extra || null), Divider(), Row({ w: 'fill', main: 'between' }, LinkText('فتح التقرير'), Row({ gap: 12 }, Ico('download', { size: 16, color: 'text/muted' }), Ico('share', { size: 16, color: 'text/muted' }))));
    }
    function pl(label, cur, prev, strong, tone) {
        return [Txt(label, { style: strong ? 'Body/Strong 14' : 'Body/Regular 14', w: 'fill' }), Txt(cur, { style: strong ? 'Number/M 18' : 'Body/Strong 14', w: 180, color: tone || 'text/primary' }), Txt(prev, { style: 'Body/Regular 14', color: 'text/muted', w: 160 })];
    }
    return Desktop('O6 · التقارير والتحليلات', 'reports', [
        PageHeader('التقارير والتحليلات', 'مكتبة تقارير بفئات واضحة — كل تقرير يجيب على سؤال إداري', [PeriodChips(3), Btn('secondary', 'مقارنة بأغسطس', 'calendar')]),
        Row({ gap: 8 }, ['الكل', 'الربحية', 'المبيعات', 'المخزون', 'الديون', 'الموظفون'].map(function (c, i) { return Chip(c, i === 0, { h: 32 }); })),
        Row({ name: 'Library', w: 'fill', gap: 14, cross: 'start' }, report('trendUp', 'الربح والخسارة', 'هل ربحت هذا الشهر بعد المصاريف؟', '3,230,000 ل.س', 'صافٍ تقديري · هامش 6.6%', 'brand/action-700', ['warning', 'تكلفة ناقصة'], true), report('fuel', 'المبيعات حسب الوقود والمضخة', 'أي وقود وأي مضخة تبيع أكثر؟', '389,600 لتر', 'بنزين 95 = 46% من الكمية'), report('cash', 'فروقات الصندوق', 'من لديه فروقات متكررة؟', '9,800 ل.س', '3 فروقات · موظفان', 'status/danger-700', ['danger', 'يحتاج انتباهاً']), report('users', 'أعمار الديون', 'من تأخر في السداد؟', '684,000 ل.س', '272,000 متأخرة أكثر من 30 يوماً', 'status/warning-700'), report('droplet', 'المخزون والتسويات', 'أين يضيع الوقود؟', '0.3%', 'هدر وتسويات من المبيعات', null, ['success', 'ضمن الحد'])),
        Card({ name: 'P&L preview', gap: 14 }, Row({ w: 'fill', main: 'between' }, Col({ gap: 2 }, Row({ gap: 10 }, Txt('الربح والخسارة — سبتمبر 2026', { style: 'Heading/H2 20' }), Badge('info', 'حتى 24 سبتمبر')), Txt('مقارنة بالفترة نفسها من أغسطس', { style: 'Body/Small 12', color: 'text/muted' })), Row({ gap: 10 }, Btn('secondary', 'تصدير Excel', 'download'), Btn('secondary', 'مشاركة مع المحاسب', 'share'))), Row({ w: 'fill', gap: 20, cross: 'start' }, Col({ w: 'fill', gap: 0 }, Table([{ t: 'البند', w: 'fill' }, { t: 'سبتمبر (ل.س)', w: 180 }, { t: 'أغسطس (ل.س)', w: 160 }], [
            pl('مبيعات الوقود', '48,630,000', '47,210,000'),
            pl('تكلفة الوقود المباع', '43,480,000', '42,380,000'),
            pl('إجمالي الربح', '5,150,000', '4,830,000', true),
            pl('المصاريف التشغيلية', '1,920,000', '1,960,000'),
            pl('صافي الربح التقديري', '3,230,000', '2,870,000', true, 'brand/action-700')
        ], { rowPad: 10 })), Col({ w: 340, gap: 12 }, Col({ w: 'fill', pad: 16, gap: 6, radius: 14, fill: 'brand/primary-50' }, Txt('الخلاصة', { style: 'Label/12', color: 'brand/primary' }), Txt('صافي الربح أعلى بـ 12.5% من أغسطس، والسبب الأساسي زيادة مبيعات بنزين 95 مع ثبات المصاريف.', { style: 'Body/Strong 14', w: 'fill' })), Inst('Alert Banner', { tone: 'warning' }, { Title: 'تكلفة شراء ناقصة', Body: 'شحنة INV-2231 بلا سعر شراء، لذلك الصافي تقديري.', Action: 'إدخال' }, { w: 'fill' }), Row({ w: 'fill', pad: 12, gap: 8, radius: 12, fill: 'status/info-50' }, Ico('refresh', { size: 16, color: 'status/info-700' }), Txt('ملف Excel قيد التحضير — سيصلك إشعار عند الجاهزية', { style: 'Body/Small 12', color: 'status/info-700', w: 'fill' })))))
    ]);
}
function O7_Approvals() {
    function req(icon, title, sub, when, tone, st, sel) {
        return Row({ name: 'Request · ' + title, w: 'fill', pad: 14, gap: 12, radius: 14, fill: sel ? 'brand/primary-50' : 'surface/card', stroke: sel ? 'brand/primary' : 'border/default', strokeW: sel ? 2 : 1, cross: 'start' }, IconBox(icon, { bg: tone === 'danger' ? 'status/danger-50' : (tone === 'warning' ? 'status/warning-50' : 'brand/action-50'), fg: tone === 'danger' ? 'status/danger' : (tone === 'warning' ? 'status/warning-700' : 'brand/action-700') }), Col({ w: 'fill', gap: 4 }, Row({ w: 'fill', main: 'between' }, Txt(title, { style: 'Body/Strong 14' }), Txt(when, { style: 'Body/Small 12', color: 'text/muted' })), Txt(sub, { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }), Badge(tone, st)));
    }
    function evidence(icon, label) {
        return Col({ w: 'fill', gap: 6 }, Row({ w: 'fill', h: 92, radius: 12, fill: 'brand/dark', main: 'center', cross: 'center' }, Ico(icon, { size: 28, color: 'text/on-dark-muted' })), Txt(label, { style: 'Body/Small 12', color: 'text/secondary' }));
    }
    return Desktop('O7 · الموافقات', 'approvals', [
        PageHeader('الموافقات', '3 طلبات بانتظارك · كل قرار يُسجَّل باسمك ووقته في سجل المراجعة', [Btn('secondary', 'سجل القرارات', 'history')]),
        Row({ gap: 8 }, [['الكل (3)', true], ['إغلاق مناوبة', false], ['تجاوز حد', false], ['تسوية مخزون', false], ['فتح مناوبة', false]].map(function (c) { return Chip(c[0], c[1], { h: 32 }); })),
        Row({ name: 'Split', w: 'fill', h: 'fill', gap: 20, cross: 'start' }, Col({ name: 'Queue', w: 400, gap: 10 }, Txt('بانتظار قرارك', { style: 'Label/12', color: 'text/muted' }), req('cash', 'إغلاق مناوبة · المضخة 3', 'فرق صندوق -4,500 ل.س · أحمد سالم · السبب والصورة مرفقان', 'منذ 25 د', 'danger', 'فرق أكبر من الحد', true), req('building', 'بيع آجل فوق الحد', 'شركة الأمل للنقل · 38,000 ل.س · يتجاوز المتبقي بـ 12,000', 'منذ ساعة', 'warning', 'العامل ينتظر'), req('ruler', 'تسوية مخزون · خزان 1', 'المقاس أقل من الدفتري بـ 310 لتر · سامي', 'منذ ساعتين', 'warning', 'يحتاج سبباً'), Txt('تمت معالجتها اليوم', { style: 'Label/12', color: 'text/muted' }), req('checkCircle', 'فتح مناوبة المضخة 1 للتصحيح', 'طلب محمد خليل لتعديل قراءة · وافقت 09:12', '09:12', 'success', 'تمت الموافقة')), Card({ name: 'Decision', gap: 16 }, Row({ w: 'fill', main: 'between', cross: 'start' }, Col({ gap: 2 }, Txt('إغلاق مناوبة المضخة 3', { style: 'Heading/H2 20' }), Txt('أحمد سالم · 06:00 – 14:05 · بنزين 95', { style: 'Body/Regular 14', color: 'text/secondary' })), Badge('danger', 'فرق -4,500 ل.س')), Row({ w: 'fill', gap: 12 }, [['اللترات', '7,419.5'], ['المبيعات', '927,438'], ['النقد المتوقع', '639,438'], ['النقد الفعلي', '634,938']].map(function (k) {
            return Col({ w: 'fill', pad: 12, gap: 2, radius: 12, fill: 'surface/page' }, Txt(k[0], { style: 'Body/Small 12', color: 'text/muted' }), Txt(k[1], { style: 'Number/M 18' }));
        })), Col({ w: 'fill', gap: 8 }, Txt('الأدلة المرفقة', { style: 'Heading/H3 16' }), Row({ w: 'fill', gap: 12 }, evidence('camera', 'صورة العداد 06:00'), evidence('camera', 'صورة العداد 14:05'), evidence('cash', 'صورة الصندوق')), Row({ w: 'fill', pad: 12, gap: 10, radius: 12, fill: 'surface/muted', cross: 'start' }, Avatar('أس', 28), Txt('«دفعة بطاقة بقيمة 4,500 سُجلت نقداً بالخطأ في الساعة 11:20.»', { style: 'Body/Strong 14', w: 'fill' }))), Col({ w: 'fill', gap: 8 }, Txt('قرارك', { style: 'Heading/H3 16' }), Row({ w: 'fill', gap: 10, cross: 'start' }, Radio(true, 'اعتماد وتحويل الفرق لحساب العجز', 'يُنشأ قيد تلقائي JE-1042'), Radio(false, 'اعتماد وتحميل الفرق على الموظف', 'يظهر في كشف الموظف'), Radio(false, 'إعادة للعامل للتصحيح', 'تُفتح المناوبة مؤقتاً'))), Field('ملاحظة القرار (تظهر في السجل)', 'تم التحقق من إيصال البطاقة رقم 88213', { focus: true }), Row({ w: 'fill', main: 'between' }, Row({ gap: 8 }, Ico('lock', { size: 16, color: 'text/muted' }), Txt('القرار نهائي ويُسجَّل ولا يُحذف؛ أي تصحيح لاحق يكون بقيد عكسي.', { style: 'Body/Small 12', color: 'text/muted' })), Row({ gap: 10 }, Btn('danger', 'رفض'), Btn('action', 'اعتماد الإغلاق', 'check')))))
    ]);
}
function O8_Expenses() {
    function exp(d, cat, tone, desc, amt, att, by) {
        return [Txt(d, { style: 'Body/Small 12', color: 'text/secondary', w: 90 }), Row({ w: 96 }, Badge(tone, cat)), Txt(desc, { style: 'Body/Regular 14', w: 'fill' }), Txt(amt, { style: 'Body/Strong 14', w: 100 }),
            Row({ w: 36, main: 'center' }, Ico(att ? 'fileText' : 'x', { size: 16, color: att ? 'brand/primary' : 'text/muted' })), Txt(by, { style: 'Body/Small 12', color: 'text/secondary', w: 90 })];
    }
    function catBar(label, amt, w, color) {
        return Col({ w: 'fill', gap: 6 }, Row({ w: 'fill', main: 'between' }, Txt(label, { style: 'Body/Regular 14', color: 'text/secondary' }), Txt(amt, { style: 'Body/Strong 14' })), Box({ w: 324, h: 8, radius: 999, fill: 'surface/muted' }, Rect({ w: w, h: 8, x: 324 - w, y: 0, radius: 999, fill: color })));
    }
    function supplier(name, due, date, tone, st) {
        return Row({ w: 'fill', pad: [10, 0], gap: 10 }, IconBox('truck', { size: 32, radius: 9 }), Col({ w: 'fill', gap: 0 }, Txt(name, { style: 'Body/Strong 14' }), Txt('مستحق ' + due + ' · ' + date, { style: 'Body/Small 12', color: 'text/muted' })), Badge(tone, st));
    }
    return Desktop('O8 · المصاريف والموردون', 'expenses', [
        PageHeader('المصاريف والموردون', 'الربح يصبح مؤكداً بعد إدخال مصاريف الفترة وتكاليف الشراء', [Btn('secondary', 'مورد جديد', 'truck'), Btn('primary', 'مصروف جديد', 'plus')]),
        Inst('Alert Banner', { tone: 'info' }, { Title: 'مصاريف اليوم غير مدخلة بعد', Body: 'الربح في لوحة القيادة سيبقى «تقديرياً» حتى تُدخل مصاريف 24 سبتمبر.', Action: 'إدخال الآن' }, { w: 'fill' }),
        Row({ name: 'Split', w: 'fill', gap: 20, cross: 'start' }, Col({ name: 'Right column', w: 'fill', gap: 20 }, Row({ w: 'fill', gap: 16, cross: 'start' }, Card({ name: 'By category', gap: 12 }, CardHeader('مصاريف سبتمبر', { right: Txt('1,920,000 ل.س', { style: 'Number/M 18' }) }), catBar('رواتب', '1,260,000', 212, 'brand/primary'), catBar('كهرباء ومياه', '312,000', 53, 'brand/action'), catBar('صيانة المضخات', '186,000', 31, 'status/warning'), catBar('نقل ومحروقات', '98,000', 17, 'status/info'), catBar('أخرى', '64,000', 11, 'text/muted')), Card({ name: 'Suppliers', w: 340, gap: 4 }, CardHeader('الموردون', { icon: 'truck', right: LinkText('الكل (4)') }), supplier('الشام للمحروقات', '1,320,000', '30 سبتمبر', 'warning', '6 أيام'), Divider(), supplier('شركة البادية للنقل', '98,000', '5 أكتوبر', 'success', 'منتظم'), Divider(), supplier('ورشة الأمانة للصيانة', '0', '—', 'neutral', 'مسدد'))), Card({ name: 'Expenses table', pad: [16, 8, 8, 8], gap: 10 }, Row({ w: 'fill', pad: [0, 8] }, CardHeader('آخر المصاريف', { right: Row({ gap: 8 }, Chip('الكل', true, { h: 30 }), Chip('بلا مرفق', false, { h: 30 })) })), Table([{ t: 'التاريخ', w: 90 }, { t: 'الفئة', w: 96 }, { t: 'البيان', w: 'fill' }, { t: 'المبلغ', w: 100 }, { t: 'مرفق', w: 36 }, { t: 'بواسطة', w: 90 }], [
            exp('23 سبتمبر', 'صيانة', 'warning', 'تغيير فلتر المضخة 4', '42,000', true, 'سامي'),
            exp('22 سبتمبر', 'كهرباء', 'success', 'فاتورة كهرباء أغسطس', '312,000', true, 'رنا (محاسبة)'),
            exp('20 سبتمبر', 'نقل', 'info', 'نقل شحنة ديزل', '98,000', false, 'خالد العمر'),
            exp('15 سبتمبر', 'رواتب', 'primary', 'رواتب النصف الأول', '630,000', true, 'رنا (محاسبة)')
        ], { rowPad: 10 }))), Card({ name: 'New expense', w: 380, gap: 14 }, CardHeader('مصروف جديد', { icon: 'plus' }), Col({ w: 'fill', gap: 6 }, Txt('الفئة', { style: 'Label/12', color: 'text/secondary' }), Row({ w: 'fill', gap: 6 }, Chip('كهرباء', true, { h: 32 }), Chip('رواتب', false, { h: 32 }), Chip('صيانة', false, { h: 32 }), Chip('أخرى', false, { h: 32 }))), Field('المبلغ', '86,000', { suffix: 'ل.س', focus: true, valueStyle: 'Number/M 18' }), Row({ w: 'fill', gap: 10 }, Field('التاريخ', '24 سبتمبر', { icon: 'calendar' }), Field('الدفع', 'من الصندوق', { chevron: true })), Field('الجهة / المورد', 'شركة الكهرباء', { chevron: true }), Field('البيان', 'فاتورة كهرباء سبتمبر — العداد الرئيسي', {}), Row({ w: 'fill', pad: 14, gap: 10, radius: 12, stroke: 'border/strong', dash: true, main: 'center' }, Ico('camera', { size: 18, color: 'brand/primary' }), Txt('إرفاق صورة الفاتورة', { style: 'Body/Strong 14', color: 'brand/primary' })), Row({ w: 'fill', pad: 12, gap: 8, radius: 10, fill: 'surface/muted', cross: 'start' }, Ico('book', { size: 16, color: 'text/secondary' }), Txt('سيُنشأ قيد: مدين مصروف كهرباء / دائن الصندوق', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })), Row({ w: 'fill', gap: 10 }, Btn('secondary', 'حفظ كمسودة', null, { w: 'fill' }), Btn('action', 'حفظ المصروف', 'check', { w: 'fill' }))))
    ]);
}
function O9_Prices() {
    function avail(sel) {
        return Row({ w: 'fill', pad: 4, gap: 4, radius: 10, fill: 'surface/muted' }, [['متوفر', 'success'], ['محدود', 'warning'], ['غير متوفر', 'danger']].map(function (a, i) {
            const on = i === sel;
            return Row({ w: 'fill', h: 32, radius: 8, fill: on ? 'surface/card' : null, shadow: on ? 'Shadow/Card' : null, gap: 6, main: 'center' }, Dot(8, TONES[a[1]].fg), Txt(a[0], { style: 'Label/12', color: on ? 'text/primary' : 'text/muted' }));
        }));
    }
    function fuelCard(name, cur, next, cost, margin, availIdx, hint, changed) {
        return Card({ name: 'Price · ' + name, gap: 14, stroke: changed ? 'brand/primary' : 'border/default', strokeW: changed ? 2 : 1 }, Row({ w: 'fill', main: 'between' }, Row({ gap: 10 }, IconBox('droplet'), Txt(name, { style: 'Heading/H3 16' })), changed ? Badge('primary', 'تغيير غير منشور') : Badge('neutral', 'دون تغيير')), Row({ w: 'fill', gap: 12, cross: 'end' }, Col({ w: 'fill', gap: 2 }, Txt('السعر المنشور', { style: 'Body/Small 12', color: 'text/muted' }), Money(cur, { unit: 'ل.س/لتر' })), Ico('chevronLeft', { size: 20, color: 'text/muted' }), Col({ w: 'fill', gap: 6 }, Txt('السعر الجديد', { style: 'Label/12', color: 'text/secondary' }), Row({ w: 'fill', h: 48, pad: [0, 12], radius: 10, fill: 'surface/card', stroke: changed ? 'brand/primary' : 'border/strong', strokeW: changed ? 2 : 1 }, Txt(next, { style: 'Number/L 24', w: 'fill' })))), Row({ w: 'fill', pad: [10, 12], radius: 10, fill: 'surface/page', main: 'between' }, Txt('تكلفة الشراء ' + cost + ' · الهامش', { style: 'Body/Small 12', color: 'text/secondary' }), Txt(margin, { style: 'Body/Strong 14', color: 'brand/action-700' })), Col({ w: 'fill', gap: 6 }, Txt('التوفر المعروض للزبائن', { style: 'Label/12', color: 'text/secondary' }), avail(availIdx), Row({ gap: 6 }, Ico('info', { size: 14, color: 'text/muted' }), Txt(hint, { style: 'Body/Small 12', color: 'text/muted' }))));
    }
    return Desktop('O9 · أسعار الوقود', 'prices', [
        PageHeader('أسعار الوقود', 'السعر المنشور يظهر للزبائن مع وقت التحديث ومصدره · آخر نشر اليوم 07:30', [Btn('secondary', 'سجل الأسعار', 'history')]),
        Inst('Alert Banner', { tone: 'warning' }, { Title: 'بلاغان من الزبائن: سعر الديزل غير مطابق', Body: 'أبلغ زبونان أن السعر في المحطة 96 وليس 95 (منذ ساعة). راجع السعر قبل النشر.', Action: 'عرض البلاغات' }, { w: 'fill' }),
        Row({ name: 'Fuel cards', w: 'fill', gap: 16, cross: 'start' }, fuelCard('بنزين 95', '125', '125', '112', '13 ل.س (10.4%)', 0, 'المخزون الدفتري 41% — متوفر'), fuelCard('بنزين 90', '110', '110', '99', '11 ل.س (10%)', 0, 'المخزون الدفتري 62% — متوفر'), fuelCard('ديزل', '95', '96', '86', '10 ل.س (10.4%)', 1, 'مقترح «محدود» لأن المخزون 18%', true)),
        Row({ name: 'Publish row', w: 'fill', gap: 16, cross: 'start' }, Card({ name: 'Customer preview', w: 420, gap: 10 }, CardHeader('ما سيراه الزبون', { icon: 'user' }), Col({ w: 'fill', pad: 14, gap: 10, radius: 14, fill: 'surface/page' }, [['بنزين 95', '125', 'success', 'متوفر'], ['بنزين 90', '110', 'success', 'متوفر'], ['ديزل', '96', 'warning', 'كمية محدودة']].map(function (r) {
            return Row({ w: 'fill', main: 'between' }, Row({ gap: 8 }, Txt(r[0], { style: 'Body/Strong 14' }), Badge(r[2], r[3])), Row({ gap: 4, cross: 'end' }, Txt(r[1], { style: 'Number/M 18' }), Txt('ل.س/لتر', { style: 'Label/11', color: 'text/muted' })));
        }), Row({ gap: 6 }, Ico('clock', { size: 14, color: 'text/muted' }), Txt('آخر تحديث: الآن · من إدارة المحطة', { style: 'Body/Small 12', color: 'text/muted' })))), Card({ name: 'Publish', gap: 14 }, CardHeader('نشر التغييرات', { icon: 'share' }), KV('عدد التغييرات', '2 (سعر الديزل + التوفر)'), KV('يُطبَّق على', 'المناوبات المفتوحة من لحظة النشر'), KV('المناوبات المفتوحة الآن', 'المضخة 2 والمضخة 4'), Row({ w: 'fill', pad: 12, gap: 8, radius: 10, fill: 'surface/muted', cross: 'start' }, Ico('history', { size: 16, color: 'text/secondary' }), Txt('يُسجَّل تغيير السعر في سجل المراجعة، وتُحسب عمليات ما قبل النشر بالسعر القديم.', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })), Row({ w: 'fill', gap: 10 }, Btn('secondary', 'جدولة النشر', 'clock', { w: 'fill' }), Btn('action', 'نشر الأسعار الآن', 'check', { w: 'fill' }))))
    ]);
}
function O10_Complaints() {
    function item(title, who, when, tone, st, sel, kind) {
        return Row({ name: 'Complaint · ' + title, w: 'fill', pad: 14, gap: 12, radius: 14, fill: sel ? 'brand/primary-50' : 'surface/card', stroke: sel ? 'brand/primary' : 'border/default', strokeW: sel ? 2 : 1, cross: 'start' }, IconBox(kind === 'price' ? 'tag' : 'message', { size: 36, bg: kind === 'price' ? 'status/info-50' : 'brand/primary-50', fg: kind === 'price' ? 'status/info' : 'brand/primary' }), Col({ w: 'fill', gap: 4 }, Row({ w: 'fill', main: 'between' }, Txt(title, { style: 'Body/Strong 14' }), Txt(when, { style: 'Body/Small 12', color: 'text/muted' })), Txt(who, { style: 'Body/Small 12', color: 'text/secondary' }), Badge(tone, st)));
    }
    function bubble(me, text, meta) {
        return Row({ w: 'fill', main: me ? 'end' : 'start' }, Col({ w: 420, pad: 14, gap: 4, radius: 16, fill: me ? 'brand/primary' : 'surface/muted' }, Txt(text, { style: 'Body/Regular 14', color: me ? 'text/on-dark' : 'text/primary', w: 'fill' }), Txt(meta, { style: 'Label/11', color: me ? 'text/on-dark-muted' : 'text/muted' })));
    }
    return Desktop('O10 · الشكاوى والبلاغات', 'complaints', [
        PageHeader('شكاوى الزبائن والبلاغات', 'ردّ المحطة يظهر للزبون في التطبيق · ما لا يُحل خلال 48 ساعة يُصعَّد للمنصة', [Btn('secondary', 'قوالب الردود', 'fileText')]),
        Row({ gap: 8 }, Chip('مفتوحة (4)', true, { h: 32 }), Chip('قيد الرد (2)', false, { h: 32 }), Chip('محلولة', false, { h: 32 }), Chip('مصعّدة (1)', false, { h: 32 })),
        Row({ name: 'Split', w: 'fill', h: 'fill', gap: 20, cross: 'start' }, Col({ name: 'Inbox', w: 400, gap: 10 }, item('خصم لم يُطبَّق على الفاتورة', 'سامر يوسف · INV-10477', 'منذ 3 س', 'warning', 'بانتظار ردك', true), item('بلاغ سعر: الديزل 96 وليس 95', 'زبونان · صفحة المحطة', 'منذ ساعة', 'info', 'بلاغ سعر', false, 'price'), item('تأخير في الخدمة مساءً', 'ليلى حداد', 'أمس', 'danger', 'مصعّدة للمنصة'), item('العامل لم يرسل الفاتورة', 'مازن ديب · INV-10420', 'أمس', 'warning', 'بانتظار ردك')), Card({ name: 'Thread', gap: 14 }, Row({ w: 'fill', main: 'between', cross: 'start' }, Row({ gap: 12 }, Avatar('سي', 44), Col({ gap: 2 }, Txt('سامر يوسف', { style: 'Heading/H3 16' }), Txt('زبون منذ مارس 2026 · 38 فاتورة · 1,240 نقطة', { style: 'Body/Small 12', color: 'text/muted' }))), Row({ gap: 8 }, Badge('warning', 'بانتظار ردك'), Badge('neutral', 'متبقٍ 45 ساعة قبل التصعيد'))), Row({ w: 'fill', gap: 12, cross: 'start' }, Col({ w: 'fill', gap: 6 }, Txt('الفاتورة المرتبطة', { style: 'Label/12', color: 'text/muted' }), Inst('Invoice Card', { status: 'confirmed' }, { Station: 'محطة النور', Total: '25,000 ل.س', Details: 'بنزين 95 · 200 لتر · توسان', Date: 'السبت 19 سبتمبر · 13:40' }, { w: 'fill' })), Col({ w: 300, gap: 6 }, Txt('ما يقوله النظام', { style: 'Label/12', color: 'text/muted' }), Col({ w: 'fill', pad: 14, gap: 4, radius: 14, fill: 'status/info-50' }, Txt('العرض «خصم 5% فوق 150 لتر» كان فعالاً وقت التعبئة لكنه لم يُطبَّق.', { style: 'Body/Small 12', color: 'status/info-700', w: 'fill' }), Txt('الفرق المستحق: 1,250 ل.س', { style: 'Body/Strong 14', color: 'status/info-700' })))), Col({ w: 'fill', gap: 10, pad: [8, 0] }, bubble(false, 'عبّيت 200 لتر يوم السبت وكان في عرض خصم 5% لكن الفاتورة طلعت بدون خصم.', 'سامر · 21 سبتمبر 18:40'), bubble(true, 'شكراً لتنبيهك. تحققنا من العرض وسنصدر فاتورة مصحّحة بالخصم اليوم.', 'محطة النور · مسودة')), Row({ gap: 8 }, Chip('تم تصحيح الفاتورة', false, { h: 30 }), Chip('سنتواصل معك هاتفياً', false, { h: 30 }), Chip('نعتذر عن التأخير', false, { h: 30 })), Field('الرد', 'شكراً لتنبيهك. تحققنا من العرض وسنصدر فاتورة مصحّحة بالخصم اليوم.', { focus: true, h: 72 }), Row({ w: 'fill', main: 'between' }, Btn('secondary', 'إصدار فاتورة مصحّحة', 'receipt'), Row({ gap: 10 }, Btn('secondary', 'إغلاق كمحلولة', 'checkCircle'), Btn('primary', 'إرسال الرد', 'share')))))
    ]);
}
function O11_Settings() {
    function user(init, name, role, tone, perms, last, st, stTone) {
        return [Row({ w: 'fill', gap: 10 }, Avatar(init, 32), Col({ w: 'fill', gap: 0 }, Txt(name, { style: 'Body/Strong 14' }), Txt(perms, { style: 'Body/Small 12', color: 'text/muted' }))), Row({ w: 130 }, Badge(tone, role)), Txt(last, { style: 'Body/Small 12', color: 'text/muted', w: 110 }), Row({ w: 110 }, Badge(stTone, st)), Row({ w: 32, main: 'center' }, Ico('more', { size: 18, color: 'text/muted' }))];
    }
    function perm(label, on, note) {
        return Row({ w: 'fill', pad: [10, 0], gap: 10 }, Col({ w: 'fill', gap: 0 }, Txt(label, { style: 'Body/Strong 14' }), note ? Txt(note, { style: 'Body/Small 12', color: 'text/muted' }) : null), Toggle(on));
    }
    function limit(label, value, sub) {
        return Col({ w: 'fill', pad: 14, gap: 4, radius: 12, fill: 'surface/page' }, Txt(label, { style: 'Body/Small 12', color: 'text/muted' }), Txt(value, { style: 'Number/M 18' }), Txt(sub, { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }));
    }
    return Desktop('O11 · الإعدادات والمستخدمون', 'settings', [
        PageHeader('الإعدادات', 'محطة النور · الفرع الرئيسي', [Btn('primary', 'دعوة مستخدم', 'plus')]),
        Tabs(['المحطة', 'الخزانات والمضخات', 'المستخدمون والصلاحيات', 'حدود التسامح', 'الإشعارات'], 2, 170),
        Row({ name: 'Split', w: 'fill', gap: 20, cross: 'start' }, Col({ w: 'fill', gap: 20 }, Card({ name: 'Users', pad: [16, 8, 8, 8], gap: 10 }, Row({ w: 'fill', pad: [0, 8] }, CardHeader('المستخدمون (7)', { right: Row({ w: 220, h: 36, pad: [0, 10], gap: 8, radius: 10, fill: 'surface/page', stroke: 'border/default' }, Ico('search', { size: 16, color: 'text/muted' }), Txt('بحث', { style: 'Body/Regular 14', color: 'text/muted' })) })), Table([{ t: 'المستخدم', w: 'fill' }, { t: 'الدور', w: 130 }, { t: 'آخر دخول', w: 110 }, { t: 'الحالة', w: 110 }, { t: '', w: 32 }], [
            user('خع', 'خالد العمر', 'صاحب المحطة', 'primary', 'كل الصلاحيات', 'الآن', 'نشط', 'success'),
            user('رع', 'رنا عيسى', 'محاسبة', 'info', 'قيود، تقارير، تسويات', 'اليوم 09:40', 'نشط', 'success'),
            user('سم', 'سامي مراد', 'مدير وردية', 'warning', 'تسويات صغيرة، فتح مناوبة', 'اليوم 07:30', 'نشط', 'success'),
            user('أس', 'أحمد سالم', 'عامل تعبئة', 'neutral', 'مناوبته وعملياته فقط', 'اليوم 06:00', 'نشط', 'success'),
            user('يد', 'يوسف ديب', 'عامل تعبئة', 'neutral', 'مناوبته وعملياته فقط', 'اليوم 14:00', 'نشط', 'success'),
            user('نح', 'نادر حمود', 'عامل تعبئة', 'neutral', 'مناوبته وعملياته فقط', '—', 'دعوة معلّقة', 'warning'),
            user('عم', 'عمر ملص', 'عامل تعبئة', 'neutral', '—', '3 سبتمبر', 'موقوف', 'danger')
        ], { rowPad: 9 })), Card({ name: 'Tolerances', gap: 12 }, CardHeader('حدود التسامح', { icon: 'sliders', right: LinkText('تعديل') }), Row({ w: 'fill', gap: 12 }, limit('فرق الصندوق المسموح', '1,000 ل.س', 'فوقه يطلب النظام سبباً واعتمادك'), limit('فرق المخزون المسموح', '100 لتر', 'لكل خزان في القياس الفعلي'), limit('أقصى مدة مناوبة', '12 ساعة', 'بعدها تنبيه «مفتوحة طويلاً»'), limit('حد البيع الآجل الافتراضي', '250,000 ل.س', 'لكل شركة جديدة')))), Card({ name: 'Role editor', w: 360, gap: 4 }, CardHeader('صلاحيات: عامل تعبئة', { icon: 'shield' }), Txt('قالب جاهز — يمكنك تعديله لهذه المحطة', { style: 'Body/Small 12', color: 'text/muted' }), perm('بدء وإغلاق مناوبة', true), Divider(), perm('تسجيل تعبئة وإصدار فاتورة', true), Divider(), perm('بيع آجل للشركات', true, 'حتى الحد المتبقي فقط'), Divider(), perm('العمل دون اتصال', true, 'حتى 50 عملية غير متزامنة'), Divider(), perm('تعديل سعر اللتر', false, 'صاحب المحطة فقط'), Divider(), perm('اعتماد التسويات', false, 'مدير الوردية فأعلى'), Divider(), perm('رؤية الأرباح وتكاليف الشراء', false, 'مخفية عن العمال حسب الملف'), Row({ w: 'fill', pad: [12, 0, 0, 0] }, Btn('primary', 'حفظ الصلاحيات', null, { w: 'fill' }))))
    ]);
}
const OWNER_MORE = [O6_Reports, O7_Approvals, O8_Expenses, O9_Prices, O10_Complaints, O11_Settings];
// ============================================================
// Worker + customer — priority 2 and login screens
// ============================================================
function L2_WorkerPin() {
    function worker(init, name, sel) {
        return Col({ gap: 6, cross: 'center', w: 72 }, Row({ w: 56, h: 56, radius: 999, fill: sel ? 'brand/primary' : 'brand/dark-800', stroke: sel ? 'brand/action' : null, strokeW: 3, main: 'center', cross: 'center' }, Txt(init, { style: 'Body/Strong 14', color: 'text/on-dark' })), Txt(name, { style: 'Label/12', color: sel ? 'text/on-dark' : 'text/on-dark-muted', align: 'center' }));
    }
    function key(label, icon, ghost) {
        return Row({ name: 'Key ' + (label || icon || 'blank'), w: 88, h: 60, radius: 18, fill: ghost ? null : 'brand/dark-800', main: 'center', cross: 'center' }, icon ? Ico(icon, { size: 24, color: 'text/on-dark' }) : (label ? Txt(label, { style: 'Number/L 24', color: 'text/on-dark' }) : null));
    }
    // keypad rows are LTR (1 2 3): Row() lists children right→left, so reverse
    function krow(ks) { return Row({ gap: 14 }, ks.slice().reverse()); }
    return Mobile('L2 · دخول العامل (PIN)', [
        StatusBar(true),
        Col({ name: 'Content', w: 'fill', h: 'fill', pad: [16, 24, 28, 24], gap: 22, cross: 'center' }, Col({ gap: 8, cross: 'center' }, Row({ w: 56, h: 56, radius: 16, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 28, color: 'brand/dark' })), Txt('محطة النور', { style: 'Heading/H2 20', color: 'text/on-dark', align: 'center' }), Txt('هذا الجهاز مسجّل لمحطة النور', { style: 'Body/Small 12', color: 'text/on-dark-muted', align: 'center' })), Col({ gap: 10, cross: 'center' }, Txt('من أنت؟', { style: 'Label/12', color: 'text/on-dark-muted' }), Row({ gap: 8 }, worker('أس', 'أحمد', true), worker('يد', 'يوسف'), worker('عح', 'علي'), worker('رن', 'رامي'))), Col({ gap: 12, cross: 'center' }, Txt('أدخل رمزك السري', { style: 'Body/Strong 14', color: 'text/on-dark' }), Row({ gap: 14 }, [1, 1, 0, 0].reverse().map(function (f) { return Dot(16, f ? 'brand/action' : 'brand/dark-700'); }))), Col({ name: 'Keypad', gap: 12, cross: 'center' }, krow([key('1'), key('2'), key('3')]), krow([key('4'), key('5'), key('6')]), krow([key('7'), key('8'), key('9')]), krow([key(null, null, true), key('0'), key(null, 'backspace', true)])), VSpacer(), Row({ gap: 8 }, Ico('wifiOff', { size: 16, color: 'text/on-dark-muted' }), Txt('يعمل الدخول دون إنترنت على هذا الجهاز', { style: 'Body/Small 12', color: 'text/on-dark-muted' })))
    ], { fill: 'brand/dark' });
}
function CompanyCard(remaining, usedW) {
    return Col({ name: 'Company', w: 'fill', pad: 14, gap: 10, radius: 16, fill: 'surface/card', stroke: 'brand/primary', strokeW: 2 }, Row({ w: 'fill', gap: 12 }, IconBox('building', { size: 42, radius: 12 }), Col({ w: 'fill', gap: 0 }, Txt('شركة الأمل للنقل', { style: 'Heading/H3 16' }), Txt('فان توصيل 45817 · السائق فادي', { style: 'Body/Small 12', color: 'text/muted' })), Badge('success', 'سائق مصرّح')), Row({ w: 'fill', main: 'between' }, Txt('الحد المتبقي هذا الشهر', { style: 'Body/Small 12', color: 'text/secondary' }), Money(remaining, { style: 'Number/M 18' })), Box({ w: 330, h: 8, radius: 999, fill: 'surface/muted' }, Rect({ w: usedW, h: 8, x: 330 - usedW, y: 0, radius: 999, fill: 'status/warning' })));
}
function S8_CreditSale() {
    return Mobile('S8 · بيع آجل لشركة', [
        WorkerHeader({ chips: [['clock', 'المناوبة مفتوحة · 05:02'], ['fuel', 'المضخة 3 · بنزين 95']] }),
        Body([
            Row({ w: 'fill', main: 'between' }, Txt('بيع آجل لشركة', { style: 'Heading/H1 24' }), Badge('primary', 'دون دفع الآن')),
            Row({ name: 'Search', w: 'fill', h: 48, pad: [0, 6, 0, 12], gap: 8, radius: 14, fill: 'surface/card', stroke: 'border/strong' }, Ico('search', { size: 20, color: 'text/muted' }), Txt('45817', { style: 'Body/Large 16', w: 'fill' }), Row({ h: 36, pad: [0, 12], gap: 6, radius: 10, fill: 'brand/primary', main: 'center' }, Ico('scan', { size: 16, color: 'text/on-dark' }), Txt('مسح QR', { style: 'Label/12', color: 'text/on-dark' }))),
            CompanyCard('26,000', 277),
            Row({ w: 'fill', gap: 10 }, Inst('Input', { size: 'lg', state: 'default' }, { Label: 'عداد السيارة', Value: '84,960', Suffix: 'كم', Helper: 'السابق 84,512' }, { w: 'fill' }), Inst('Input', { size: 'lg', state: 'focus' }, { Label: 'الكمية', Value: '160', Suffix: 'لتر', Helper: '= 20,000 ل.س' }, { w: 'fill' })),
            Row({ w: 'fill', pad: 12, gap: 10, radius: 12, fill: 'brand/primary-50' }, Ico('fileText', { size: 18, color: 'brand/primary' }), Txt('تُضاف العملية فوراً إلى كشف الشركة الشهري، ويبقى 6,000 ل.س من الحد.', { style: 'Body/Small 12', color: 'brand/primary', w: 'fill' }))
        ]),
        BottomBar([Btn('action', 'اعتماد العملية', 'check', { size: 'lg', w: 'fill' })])
    ]);
}
function S9_OverLimit() {
    return Mobile('S9 · تجاوز الحد وطلب موافقة', [
        WorkerHeader({ chips: [['clock', 'المناوبة مفتوحة · 05:06'], ['fuel', 'المضخة 3 · بنزين 95']] }),
        Body([
            CompanyCard('26,000', 277),
            Inst('Input', { size: 'lg', state: 'error' }, { Label: 'الكمية المطلوبة', Value: '300', Suffix: 'لتر', Helper: '= 37,500 ل.س · أكثر من المتبقي بـ 11,500' }, { w: 'fill' }),
            Inst('Alert Banner', { tone: 'danger' }, { Title: 'العملية تتجاوز الحد المتبقي', Body: 'لن تُرفض بصمت: اختر تعبئة الممكن الآن أو اطلب موافقة المدير.', '!Action': true }, { w: 'fill' }),
            Col({ name: 'Say to driver', w: 'fill', pad: 14, gap: 6, radius: 14, fill: 'surface/muted' }, Row({ gap: 6 }, Ico('message', { size: 16, color: 'text/secondary' }), Txt('قل للسائق', { style: 'Label/12', color: 'text/secondary' })), Txt('«رصيد الشركة يكفي 208 لترات الآن. أعبّيها لك، أو أطلب موافقة المدير على الكمية كاملة.»', { style: 'Body/Strong 14', w: 'fill' }))
        ]),
        BottomBar([Btn('secondary', 'تعبئة 208 لترات فقط', null, { w: 'fill' }), Btn('primary', 'طلب موافقة المدير', 'share', { size: 'lg', w: 'fill' })])
    ]);
}
function L3_CustomerOtp() {
    const boxes = ['4', '8', '2', '7', '', ''].map(function (d, i) {
        const active = i === 4;
        return Row({ name: 'OTP ' + (i + 1), w: 46, h: 56, radius: 12, fill: 'surface/card', stroke: active ? 'brand/primary' : 'border/strong', strokeW: active ? 2 : 1, main: 'center', cross: 'center' }, d ? Txt(d, { style: 'Number/L 24' }) : (active ? Rect({ w: 2, h: 24, fill: 'brand/primary' }) : null));
    });
    return Mobile('L3 · دخول الزبون (OTP)', [
        StatusBar(false),
        Col({ name: 'Content', w: 'fill', h: 'fill', pad: [8, 24, 28, 24], gap: 20 }, Row({ w: 'fill', main: 'between' }, IconBtn('arrowRight', { radius: 999 }), LinkText('تصفّح المحطات دون حساب')), Row({ gap: 10 }, Row({ w: 44, h: 44, radius: 12, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 22, color: 'brand/dark' })), Txt('FuelOS', { style: 'Heading/H2 20' })), Col({ w: 'fill', gap: 6 }, Txt('أدخل رمز التحقق', { style: 'Display/32' }), Txt('أرسلنا رمزاً من 6 أرقام إلى رقمك المنتهي بـ 678', { style: 'Body/Large 16', color: 'text/secondary', w: 'fill' })), Row({ name: 'OTP', w: 'fill', gap: 8, main: 'center' }, boxes.slice().reverse()), Row({ w: 'fill', main: 'between' }, Txt('إعادة الإرسال بعد 00:42', { style: 'Body/Small 12', color: 'text/muted' }), LinkText('تغيير الرقم')), Col({ name: 'Why account', w: 'fill', pad: 16, gap: 8, radius: 16, fill: 'brand/primary-50' }, Txt('لماذا حساب؟', { style: 'Body/Strong 14', color: 'brand/primary' }), Bullets(['كل فواتير التعبئة في مكان واحد', 'نقاط ولاء من الفواتير المؤكدة فقط', 'مصروف سيارتك الشهري بلغة بسيطة'], { style: 'Body/Small 12' })), VSpacer(), Btn('primary', 'تأكيد', null, { size: 'lg', w: 'fill' }), Txt('بالمتابعة توافق على الشروط وسياسة الخصوصية', { style: 'Body/Small 12', color: 'text/muted', w: 'fill', align: 'center' }))
    ]);
}
function RewardsHeader(active) {
    return [
        StatusBar(false),
        Row({ w: 'fill', pad: [4, 16, 8, 16], gap: 10 }, IconBtn('arrowRight', { radius: 999 }), Txt('المكافآت والشكاوى', { style: 'Heading/H2 20' })),
        Col({ w: 'fill', pad: [0, 16, 8, 16] }, Inst('Segmented Control', { active: active }, { 'Option 1': 'مكافآتي', 'Option 2': 'شكاواي' }, { w: 'fill' }))
    ];
}
function C6_Rewards() {
    function offer(title, sub, tone, st, muted) {
        return Row({ name: 'Offer · ' + title, w: 'fill', pad: 14, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default', opacity: muted ? 0.55 : 1 }, IconBox('tag', { size: 40, radius: 12, bg: muted ? 'surface/muted' : 'status/warning-50', fg: muted ? 'text/muted' : 'status/warning-700' }), Col({ w: 'fill', gap: 2 }, Txt(title, { style: 'Body/Strong 14', w: 'fill' }), Txt(sub, { style: 'Body/Small 12', color: 'text/muted' })), Badge(tone, st));
    }
    return Mobile('C6 · مكافآتي والعروض', [
        RewardsHeader('1'),
        Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: [8, 16, 16, 16], gap: 14, clip: true }, Col({ name: 'Points', w: 'fill', pad: 18, gap: 10, radius: 20, fill: 'brand/dark' }, Row({ w: 'fill', main: 'between' }, Txt('رصيد نقاطك', { style: 'Label/12', color: 'text/on-dark-muted' }), Ico('gift', { size: 20, color: 'brand/action' })), Row({ gap: 6, cross: 'end' }, Txt('1,240', { style: 'Number/XL 32', color: 'text/on-dark' }), Txt('نقطة', { style: 'Body/Strong 14', color: 'text/on-dark-muted' })), Txt('تساوي تقريباً 6,200 ل.س خصماً على الوقود أو الخدمات', { style: 'Body/Small 12', color: 'text/on-dark-muted', w: 'fill' }), Box({ w: 322, h: 8, radius: 999, fill: 'brand/dark-700' }, Rect({ w: 267, h: 8, x: 55, y: 0, radius: 999, fill: 'brand/action' })), Txt('باقي 260 نقطة لغسيل سيارة مجاني', { style: 'Label/12', color: 'brand/action' })), Row({ w: 'fill', pad: 12, gap: 8, radius: 12, fill: 'status/info-50', cross: 'start' }, Ico('info', { size: 16, color: 'status/info-700' }), Txt('تُضاف النقاط فقط من الفواتير المؤكدة من المحطة — 1 نقطة لكل 250 ل.س.', { style: 'Body/Small 12', color: 'status/info-700', w: 'fill' })), Row({ w: 'fill', main: 'between' }, Txt('عروض المحطات القريبة', { style: 'Heading/H3 16' }), LinkText('الكل')), offer('غسيل مجاني عند تعبئة 50 لتراً', 'محطة النور · ينتهي 30 سبتمبر', 'primary', 'فعّال'), Col({ name: 'Coupon', w: 'fill', pad: 14, gap: 10, radius: 16, fill: 'surface/card', stroke: 'brand/action', dash: true }, Row({ w: 'fill', main: 'between' }, Txt('خصم 10% على تغيير الزيت', { style: 'Body/Strong 14' }), Badge('success', 'متاح لك')), Row({ w: 'fill', gap: 10 }, Row({ w: 'fill', h: 40, radius: 10, fill: 'surface/page', main: 'center' }, Txt('NOOR-10', { style: 'Number/M 18', color: 'brand/primary' })), Btn('secondary', 'نسخ', 'fileText'))), offer('خصم 3 ل.س لكل لتر يوم الجمعة', 'محطة الربيع · انتهى 20 سبتمبر', 'neutral', 'منتهٍ', true), Btn('primary', 'استبدال 1,000 نقطة بخصم 5,000 ل.س', null, { w: 'fill' })),
        Inst('Tab Bar', { active: 'home' }, {}, { w: 'fill' })
    ]);
}
function C7_Complaints() {
    function steps(cur) {
        const labels = ['أُرسلت', 'قيد الرد', 'تم الحل'];
        return Row({ w: 'fill', gap: 6 }, labels.map(function (l, i) {
            const done = i < cur, now = i === cur;
            return Row({ w: 'fill', gap: 6 }, Dot(10, done ? 'brand/action' : (now ? 'status/warning' : 'border/strong')), Txt(l, { style: 'Label/11', color: now ? 'text/primary' : 'text/muted' }));
        }));
    }
    function complaint(title, meta, tone, st, cur, extra) {
        return Col({ name: 'Complaint · ' + title, w: 'fill', pad: 14, gap: 10, radius: 16, fill: 'surface/card', stroke: 'border/default' }, Row({ w: 'fill', main: 'between' }, Txt(title, { style: 'Heading/H3 16' }), Badge(tone, st)), Txt(meta, { style: 'Body/Small 12', color: 'text/muted', w: 'fill' }), cur !== null ? steps(cur) : null, extra);
    }
    return Mobile('C7 · شكاواي', [
        RewardsHeader('2'),
        Col({ name: 'Scroll', w: 'fill', h: 'fill', pad: [8, 16, 16, 16], gap: 12, clip: true }, Row({ w: 'fill', main: 'between' }, Txt('3 شكاوى', { style: 'Heading/H3 16' }), Btn('primary', 'شكوى جديدة', 'plus')), complaint('خصم لم يُطبَّق', 'محطة النور · فاتورة INV-10477 · 21 سبتمبر', 'warning', 'قيد الرد', 1, Col({ w: 'fill', pad: 12, gap: 4, radius: 12, fill: 'surface/muted' }, Txt('محطة النور', { style: 'Label/12', color: 'brand/primary' }), Txt('سنصدر فاتورة مصحّحة بالخصم اليوم. شكراً لتنبيهك.', { style: 'Body/Regular 14', w: 'fill' }), Txt('منذ ساعة', { style: 'Label/11', color: 'text/muted' }))), complaint('سعر الديزل غير مطابق', 'محطة الربيع · بلاغ سعر · 18 سبتمبر', 'success', 'تم الحل', 3, Col({ w: 'fill', gap: 8 }, Row({ w: 'fill', pad: 10, gap: 8, radius: 10, fill: 'brand/action-50' }, Ico('checkCircle', { size: 16, color: 'brand/action-700' }), Txt('حدّثت المحطة السعر إلى 96 ل.س', { style: 'Body/Small 12', color: 'brand/action-700', w: 'fill' })), Row({ w: 'fill', main: 'between' }, Txt('قيّم الحل', { style: 'Label/12', color: 'text/secondary' }), Row({ gap: 4 }, [1, 2, 3, 4, 5].map(function (i) { return Ico('star', { size: 18, color: i <= 4 ? 'status/warning' : 'border/strong' }); }))))), complaint('تأخير في الخدمة', 'محطة النور · 23 سبتمبر', 'info', 'مصعّدة للمنصة', null, Txt('لم تردّ المحطة خلال 48 ساعة، فانتقلت الشكوى لفريق المنصة وسيتواصلون معك.', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }))),
        Inst('Tab Bar', { active: 'home' }, {}, { w: 'fill' })
    ]);
}
const STAFF_MORE = [S8_CreditSale, S9_OverLimit];
const CUSTOMER_MORE = [C6_Rewards, C7_Complaints];
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
        return Row({ abs: true, x: x, y: y, h: 30, pad: [0, 10], gap: 6, radius: 999, fill: 'surface/card', shadow: 'Shadow/Raised' }, Dot(10, TONES[tone].fg), Txt(label, { style: 'Label/12' }), Txt(n, { style: 'Label/12', color: 'text/muted' }));
    }
    function action(tone, station, issue, btn) {
        return Row({ w: 'fill', pad: [10, 0], gap: 12 }, Dot(10, TONES[tone].fg), Col({ w: 'fill', gap: 0 }, Txt(station, { style: 'Body/Strong 14' }), Txt(issue, { style: 'Body/Small 12', color: 'text/secondary' })), Btn('secondary', btn));
    }
    return AdminDesktop('A1 · لوحة المنصة', 'a-dash', [
        PageHeader('لوحة المنصة', 'الخميس 24 سبتمبر · 38 محطة نشطة في 5 مناطق', [PeriodChips(3), Btn('secondary', 'تصدير', 'download')]),
        Row({ name: 'KPIs', w: 'fill', gap: 16 }, Inst('Fuel KPI Card', { state: 'default' }, { Title: 'المحطات النشطة', Value: '38', Unit: 'محطة', Meta: '+4 هذا الشهر · 4 تجارب', '@Badge': { visible: false }, '^Icon': { icon: 'pin', color: 'brand/primary' } }, { w: 'fill' }), Inst('Fuel KPI Card', { state: 'default' }, { Title: 'المستخدمون', Value: '412', Unit: 'مستخدم', Meta: '286 عاملاً · 126 إدارياً', '@Badge': { visible: false }, '^Icon': { icon: 'users', color: 'brand/primary' } }, { w: 'fill' }), Inst('Fuel KPI Card', { state: 'default' }, { Title: 'الإيراد الشهري المتكرر', Value: '17.1M', Unit: 'ل.س', Meta: '+11% عن أغسطس', '@Badge': { visible: false }, '^Icon': { icon: 'trendUp', color: 'brand/primary' } }, { w: 'fill' }), Inst('Fuel KPI Card', { state: 'alert' }, { Title: 'تذاكر دعم مفتوحة', Value: '12', Unit: 'تذكرة', Meta: '2 عالية الأولوية', '@Badge': { comp: 'Status Badge', variant: { tone: 'danger' }, text: { Label: 'عاجل' } }, '^Icon': { icon: 'message', color: 'status/danger' }, '^TrendIcon': { icon: 'alert', color: 'status/danger' } }, { w: 'fill' })),
        Row({ name: 'Middle', w: 'fill', gap: 16, cross: 'start' }, Card({ name: 'Map', gap: 12, h: 420 }, CardHeader('خريطة المحطات', { icon: 'pin', right: Row({ gap: 12 }, Row({ gap: 6 }, Dot(8, 'brand/action'), Txt('سليمة', { style: 'Body/Small 12', color: 'text/secondary' })), Row({ gap: 6 }, Dot(8, 'status/warning'), Txt('تحتاج متابعة', { style: 'Body/Small 12', color: 'text/secondary' })), Row({ gap: 6 }, Dot(8, 'status/danger'), Txt('مشكلة', { style: 'Body/Small 12', color: 'text/secondary' }))) }), Box({ name: 'Map canvas', w: 'fill', h: 330, radius: 16, clip: true }, Svg(regionSvg(604, 330), 604, 330, { x: 0, y: 0 }), pin(400, 70, 'الشمال', '9', 'success'), pin(120, 100, 'الساحل', '7', 'warning'), pin(280, 150, 'الوسط', '12', 'success'), pin(430, 210, 'الشرق', '4', 'danger'), pin(160, 230, 'الجنوب', '6', 'success'))), Card({ name: 'Needs action', w: 460, gap: 2, h: 420 }, CardHeader('محطات تحتاج إجراء', { right: Badge('danger', '5') }), action('danger', 'محطة الربيع', 'لم تزامن منذ 3 أيام · 42 عملية معلّقة على أجهزتها', 'تواصل'), Divider(), action('warning', 'محطة الساحل', 'دفعة الاشتراك متأخرة 12 يوماً', 'تذكير'), Divider(), action('info', 'محطة الشمال', 'حساب صاحب المحطة لم يُفعَّل بعد', 'تفعيل'), Divider(), action('danger', 'محطة النور', 'تذكرة دعم عالية الأولوية #482', 'فتح'), Divider(), action('warning', 'محطة الوادي', 'الفترة التجريبية تنتهي خلال 3 أيام', 'عرض خطة'))),
        Row({ name: 'Bottom', w: 'fill', gap: 16, cross: 'start' }, Card({ name: 'Growth', gap: 12 }, CardHeader('نمو الإيراد المتكرر', { sub: 'بالمليون ل.س · آخر 6 أشهر' }), Row({ w: 'fill', gap: 24, cross: 'end' }, Col({ gap: 6 }, Svg(barChartSvg(360, 90, [11.2, 12.4, 13.1, 14.6, 15.4, 17.1], 18, ['#CBD5E1', '#CBD5E1', '#CBD5E1', '#CBD5E1', '#CBD5E1', '#0F766E']), 360, 90, { name: 'MRR bars' }), Row({ w: 360, main: 'between' }, ['أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر'].map(function (m, i) { return Txt(m, { style: 'Label/11', color: i === 5 ? 'brand/primary' : 'text/muted', w: 56, align: 'center' }); }))), Col({ w: 'fill', gap: 10 }, KV('تجارب نشطة', '4'), KV('تحويل التجارب لمدفوعة', '68%'), KV('إلغاءات هذا الشهر', '1')))), Col({ name: 'Privacy', w: 460, pad: 20, gap: 10, radius: 16, fill: 'brand/primary-50' }, Row({ gap: 8 }, Ico('shield', { size: 20, color: 'brand/primary' }), Txt('فصل الصحة التقنية عن المال', { style: 'Heading/H3 16', color: 'brand/primary' })), Txt('لا تظهر هنا تفاصيل مالية داخلية لأي محطة. الوصول لبيانات محطة يحتاج صلاحية محددة وسبباً مكتوباً، ويُسجَّل في سجل النشاط.', { style: 'Body/Regular 14', w: 'fill' }), Btn('secondary', 'طلب وصول مؤقت', 'lock')))
    ]);
}
function WizardSteps(labels, current) {
    const kids = [];
    labels.forEach(function (l, i) {
        const n = i + 1, done = n < current, now = n === current;
        kids.push(Row({ name: 'Step ' + n, gap: 8 }, Row({ w: 32, h: 32, radius: 999, fill: done ? 'brand/action' : (now ? 'brand/primary' : 'surface/muted'), main: 'center', cross: 'center' }, done ? Ico('check', { size: 16, color: 'brand/on-action' }) : Txt(String(n), { style: 'Body/Strong 14', color: now ? 'text/on-dark' : 'text/muted' })), Txt(l, { style: 'Body/Strong 14', color: now ? 'text/primary' : (done ? 'text/secondary' : 'text/muted') })));
        if (i < labels.length - 1)
            kids.push(Rect({ w: 'fill', h: 2, fill: done ? 'brand/action' : 'border/default' }));
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
        return Row({ w: 'fill', pad: [8, 0], gap: 10 }, Row({ w: 22, h: 22, radius: 999, fill: state === 'todo' ? null : m[0], stroke: state === 'todo' ? m[0] : null, strokeW: 2, main: 'center', cross: 'center' }, m[1] ? Ico(m[1], { size: 12, color: 'text/on-dark' }) : null), Txt(t, { style: 'Body/Regular 14', color: state === 'done' ? 'text/secondary' : 'text/primary', w: 'fill' }));
    }
    return AdminDesktop('A2 · انضمام محطة جديدة', 'a-onboard', [
        PageHeader('انضمام محطة جديدة', 'محطة الوادي · حُفظت كمسودة تلقائياً 14:20', [Btn('ghost', 'إلغاء'), Btn('secondary', 'حفظ كمسودة', 'download')]),
        WizardSteps(['بيانات المحطة', 'الخزانات', 'المضخات', 'المستخدمون', 'الخطة والمراجعة'], 3),
        Row({ name: 'Split', w: 'fill', gap: 20, cross: 'start' }, Card({ name: 'Pumps', gap: 16 }, Col({ gap: 2 }, Txt('المضخات وربطها بالخزانات', { style: 'Heading/H2 20' }), Txt('كل مضخة يجب أن ترتبط بخزان واحد ليُحسب المخزون من المبيعات تلقائياً.', { style: 'Body/Regular 14', color: 'text/secondary' })), Row({ gap: 8 }, Txt('قوالب جاهزة:', { style: 'Label/12', color: 'text/muted' }), Chip('محطة صغيرة · 4 مضخات', true, { h: 32 }), Chip('متوسطة · 6', false, { h: 32 }), Chip('كبيرة · 10', false, { h: 32 })), Table([{ t: 'المضخة', w: 110 }, { t: 'الخزان ونوع الوقود', w: 'fill' }, { t: 'عدد المسدسات', w: 110 }, { t: 'الحالة', w: 150 }], [
            pump(1, 'خزان 1 · بنزين 90', '2', 'success', 'جاهزة'),
            pump(2, 'خزان 1 · بنزين 90', '2', 'success', 'جاهزة'),
            pump(3, 'خزان 3 · بنزين 95', '2', 'success', 'جاهزة'),
            pump(4, '— اختر خزاناً —', '2', 'danger', 'مضخة بلا خزان', true)
        ], { rowPad: 10 }), Btn('ghost', 'إضافة مضخة', 'plus'), Divider(), Row({ w: 'fill', main: 'between' }, Btn('secondary', 'السابق: الخزانات', 'arrowRight'), Row({ gap: 10 }, Txt('اربط المضخة 4 بخزان للمتابعة', { style: 'Body/Small 12', color: 'status/danger-700' }), Btn('primary', 'التالي: المستخدمون', 'chevronLeft')))), Card({ name: 'Readiness', w: 380, gap: 6 }, CardHeader('جاهزية أول يوم تشغيل', { icon: 'checkCircle' }), Row({ w: 'fill', main: 'between' }, Txt('اكتمل 2 من 7', { style: 'Body/Small 12', color: 'text/secondary' }), Txt('29%', { style: 'Body/Strong 14', color: 'brand/primary' })), Box({ w: 340, h: 8, radius: 999, fill: 'surface/muted' }, Rect({ w: 98, h: 8, x: 242, y: 0, radius: 999, fill: 'brand/action' })), check('done', 'بيانات المحطة والعنوان وساعات العمل'), check('done', '3 خزانات بأنواع الوقود والسعات'), check('warn', '4 مضخات — واحدة بلا خزان'), check('todo', 'دعوة صاحب المحطة (مطلوب)'), check('todo', 'دعوة العمال وتعيين أرقام PIN'), check('todo', 'اختيار الخطة أو بدء تجربة 14 يوماً'), check('todo', 'اختبار إدخال أول مناوبة'), Row({ w: 'fill', pad: 12, gap: 8, radius: 10, fill: 'brand/primary-50', cross: 'start' }, Ico('clock', { size: 16, color: 'brand/primary' }), Txt('الهدف: محطة تعمل خلال جلسة واحدة (أقل من 30 دقيقة) دون فريق تقني.', { style: 'Body/Small 12', color: 'brand/primary', w: 'fill' }))))
    ]);
}
function A3_Plans() {
    function stat(label, v, sub, tone) {
        return Col({ w: 'fill', pad: 16, gap: 2, radius: 14, fill: tone === 'danger' ? 'status/danger-50' : 'surface/card', stroke: tone === 'danger' ? 'status/danger' : 'border/default', strokeOpacity: tone === 'danger' ? 0.4 : 1 }, Txt(label, { style: 'Body/Small 12', color: 'text/muted' }), Txt(v, { style: 'Number/L 24', color: tone === 'danger' ? 'status/danger-700' : 'text/primary' }), Txt(sub, { style: 'Body/Small 12', color: 'text/secondary' }));
    }
    function feat(t, on) { return Row({ w: 'fill', gap: 8 }, Ico(on ? 'check' : 'x', { size: 16, color: on ? 'brand/action' : 'text/muted' }), Txt(t, { style: 'Body/Regular 14', color: on ? 'text/primary' : 'text/muted', w: 'fill' })); }
    function plan(name, price, unit, pitch, feats, limits, count, hot) {
        return Col({ name: 'Plan · ' + name, w: 'fill', pad: 20, gap: 10, radius: 18, fill: hot ? 'brand/dark' : 'surface/card', stroke: hot ? null : 'border/default', shadow: 'Shadow/Card' }, Row({ w: 'fill', main: 'between' }, Txt(name, { style: 'Heading/H2 20', color: hot ? 'text/on-dark' : 'text/primary' }), hot ? Badge('success', 'الأكثر طلباً') : null), Txt(pitch, { style: 'Body/Small 12', color: hot ? 'text/on-dark-muted' : 'text/secondary', w: 'fill' }), Row({ gap: 6, cross: 'end' }, Txt(price, { style: 'Number/XL 32', color: hot ? 'text/on-dark' : 'text/primary' }), Txt(unit, { style: 'Body/Small 12', color: hot ? 'text/on-dark-muted' : 'text/muted' })), Col({ w: 'fill', gap: 6, pad: 12, radius: 12, fill: 'surface/card' }, feats.map(function (f) { return feat(f[0], f[1]); })), Row({ w: 'fill', main: 'between' }, Txt(limits, { style: 'Body/Small 12', color: hot ? 'text/on-dark-muted' : 'text/secondary' }), Txt(count, { style: 'Label/12', color: hot ? 'brand/action' : 'brand/primary' })));
    }
    function sub(st, planName, tone, status, renew, act) {
        return [Txt(st, { style: 'Body/Strong 14', w: 'fill' }), Txt(planName, { style: 'Body/Regular 14', w: 160 }), Row({ w: 180 }, Badge(tone, status)), Txt(renew, { style: 'Body/Small 12', color: 'text/secondary', w: 110 }), Row({ w: 170 }, act ? Btn('secondary', act) : Txt('—', { style: 'Body/Small 12', color: 'text/muted' }))];
    }
    const F = ['المخزون والمناوبات والصندوق', 'فواتير رقمية وتطبيق الزبون', 'حسابات الشركات والسائقين', 'التقارير المتقدمة ولوحة الفروع'];
    return AdminDesktop('A3 · الاشتراكات والباقات', 'a-plans', [
        PageHeader('الاشتراكات والباقات', 'كل باقة مرتبطة بقيمة تجارية واضحة، لا بميزات تقنية فقط', [Btn('secondary', 'فواتير المنصة', 'receipt'), Btn('primary', 'منح فترة تجريبية', 'gift')]),
        Row({ w: 'fill', gap: 16 }, stat('الإيراد الشهري المتكرر', '17,100,000 ل.س', '+11% عن أغسطس'), stat('محطات مدفوعة', '34', 'من 38 محطة نشطة'), stat('تجارب نشطة', '4', 'تنتهي إحداها خلال 3 أيام'), stat('متأخرة في الدفع', '2', 'إيقاف تدريجي للميزات غير المدفوعة', 'danger')),
        Row({ name: 'Plans', w: 'fill', gap: 16, cross: 'start' }, plan('أساسية', '350,000', 'ل.س / شهرياً', 'لمحطة واحدة تبدأ الضبط المالي', [[F[0], true], [F[1], true], [F[2], false], [F[3], false]], 'محطة واحدة · 5 مستخدمين', '14 محطة'), plan('احترافية', '650,000', 'ل.س / شهرياً', 'للمحطات التي تبيع بالآجل للشركات', [[F[0], true], [F[1], true], [F[2], true], [F[3], false]], 'محطة واحدة · 15 مستخدماً', '17 محطة', true), plan('شبكة محطات', '550,000', 'ل.س / لكل محطة', 'لأصحاب عدة فروع وشركات أساطيل', [[F[0], true], [F[1], true], [F[2], true], [F[3], true]], 'حتى 10 محطات · مستخدمون بلا حد', '7 محطات')),
        Card({ name: 'Subscriptions', pad: [16, 8, 8, 8], gap: 8 }, Row({ w: 'fill', pad: [0, 8] }, CardHeader('اشتراكات المحطات', { right: Row({ gap: 8 }, Chip('الكل', true, { h: 30 }), Chip('تحتاج إجراء (3)', false, { h: 30 })) })), Table([{ t: 'المحطة', w: 'fill' }, { t: 'الخطة', w: 160 }, { t: 'الحالة', w: 180 }, { t: 'التجديد', w: 110 }, { t: 'إجراء', w: 170 }], [
            sub('محطة النور', 'احترافية', 'success', 'نشطة', '1 أكتوبر'),
            sub('محطة الساحل', 'أساسية', 'danger', 'متأخرة 12 يوماً', '12 سبتمبر', 'تسجيل دفعة يدوية'),
            sub('محطة الوادي', 'تجربة', 'warning', 'تنتهي خلال 3 أيام', '27 سبتمبر', 'تحويل لخطة'),
            sub('محطة الربيع', 'أساسية (قديمة)', 'info', 'خطة قديمة', '5 أكتوبر', 'ترقية')
        ], { rowPad: 8 }))
    ]);
}
function A4_Audit() {
    function role(name, n, note, sel) {
        return Row({ w: 'fill', pad: 12, gap: 10, radius: 12, fill: sel ? 'brand/primary-50' : null, stroke: sel ? 'brand/primary' : null }, IconBox('shield', { size: 32, radius: 9 }), Col({ w: 'fill', gap: 0 }, Txt(name, { style: 'Body/Strong 14' }), Txt(note, { style: 'Body/Small 12', color: 'text/muted' })), Txt(n, { style: 'Label/12', color: 'text/secondary' }));
    }
    function logRow(t, who, what, where, tone, sev) {
        return [Txt(t, { style: 'Body/Small 12', color: 'text/muted', w: 44 }), Col({ w: 'fill', gap: 0 }, Txt(what, { style: 'Body/Strong 14', w: 'fill' }), Txt(who + ' · ' + where, { style: 'Body/Small 12', color: 'text/muted' })), Row({ w: 104 }, Badge(tone, sev))];
    }
    function ticket(no, title, st, pr, tone, assignee) {
        return Col({ w: 'fill', pad: 12, gap: 6, radius: 12, fill: 'surface/card', stroke: tone === 'danger' ? 'status/danger' : 'border/default', strokeOpacity: tone === 'danger' ? 0.5 : 1 }, Row({ w: 'fill', gap: 8, cross: 'start' }, Txt(no + ' · ' + title, { style: 'Body/Strong 14', w: 'fill' }), Badge(tone, pr)), Row({ w: 'fill', main: 'between' }, Txt(st, { style: 'Body/Small 12', color: 'text/muted' }), assignee ? Avatar(assignee, 24) : Btn('secondary', 'إسناد لي')));
    }
    return AdminDesktop('A4 · الصلاحيات والسجلات والدعم', 'a-audit', [
        PageHeader('الصلاحيات والسجلات والدعم', 'ثلاثة مراكز مترابطة: الأدوار، سجل نشاط لا يُحذف، وتذاكر الدعم', [Btn('secondary', 'تصدير السجل', 'download')]),
        Row({ name: 'Three', w: 'fill', gap: 16, cross: 'start' }, Col({ w: 300, gap: 16 }, Card({ name: 'Roles', gap: 4, pad: 14 }, CardHeader('قوالب الأدوار', { right: LinkText('قالب جديد') }), role('صاحب محطة', '12', 'كل بيانات محطته وفروعه', true), role('محاسب', '9', 'قيود، تقارير، تسويات'), role('مدير وردية', '6', 'تسويات صغيرة، فتح مناوبة'), role('عامل تعبئة', '4', 'مناوبته وعملياته فقط'), role('أدمن دعم', '5', 'دون تفاصيل مالية')), Card({ name: 'Flags', gap: 10, pad: 14 }, CardHeader('ميزات تجريبية', { icon: 'layers' }), Row({ w: 'fill', gap: 10 }, Col({ w: 'fill', gap: 2 }, Txt('التقارير المتقدمة', { style: 'Body/Strong 14' }), Row({ gap: 6 }, Badge('warning', 'غير مستقرة'), Txt('3 محطات', { style: 'Body/Small 12', color: 'text/muted' }))), Toggle(true)), Divider(), Row({ w: 'fill', gap: 10 }, Col({ w: 'fill', gap: 2 }, Txt('الدفع عبر المحفظة', { style: 'Body/Strong 14' }), Txt('متوقفة', { style: 'Body/Small 12', color: 'text/muted' })), Toggle(false)))), Card({ name: 'Audit log', gap: 10 }, CardHeader('سجل النشاط', { icon: 'history', right: Row({ gap: 8 }, Chip('الكل', true, { h: 30 }), Chip('مالي حساس', false, { h: 30 }), Chip('أمني', false, { h: 30 })) }), Table([{ t: 'الوقت', w: 44 }, { t: 'الحدث', w: 'fill' }, { t: 'النوع', w: 104 }], [
            logRow('14:32', 'خالد العمر', 'اعتماد فرق صندوق 4,500 ل.س', 'محطة النور', 'warning', 'مالي حساس'),
            logRow('13:05', 'رهف (أدمن)', 'وصول مؤقت لبيانات محطة الساحل — السبب: تذكرة #482', 'محطة الساحل', 'info', 'وصول'),
            logRow('11:48', 'جهاز غير معروف', '5 محاولات دخول فاشلة لحساب المدير', 'محطة الربيع', 'danger', 'أمني'),
            logRow('10:20', 'رنا عيسى', 'قيد يدوي: رواتب النصف الأول 630,000', 'محطة النور', 'warning', 'مالي حساس'),
            logRow('09:00', 'النظام', 'تفعيل «التقارير المتقدمة» لـ 3 محطات', 'المنصة', 'neutral', 'إعداد'),
            logRow('08:41', 'سامي مراد', 'تجميد مستخدم: عمر ملص', 'محطة النور', 'info', 'صلاحيات')
        ], { rowPad: 9 }), Row({ w: 'fill', pad: 12, gap: 8, radius: 10, fill: 'surface/muted' }, Ico('lock', { size: 16, color: 'text/secondary' }), Txt('السجل للقراءة فقط ولا يمكن حذفه أو تعديله من أي دور.', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' }))), Col({ name: 'Support', w: 320, gap: 10 }, Row({ w: 'fill', main: 'between' }, Txt('تذاكر الدعم', { style: 'Heading/H3 16' }), Badge('danger', '2 عاجلة')), ticket('#482', 'فواتير لا تظهر للزبائن', 'محطة الساحل · متأخرة 6 ساعات', 'عالية', 'danger', 'رح'), ticket('#475', 'مزامنة فاشلة', 'محطة الربيع · منذ 3 أيام', 'عالية', 'danger', null), ticket('#479', 'طلب تغيير الخطة', 'محطة النور · منذ يومين', 'متوسطة', 'warning', 'رح'), ticket('#471', 'سؤال عن الكشف', 'محطة الشمال · تم الرد', 'منخفضة', 'neutral', 'مع'), Row({ w: 'fill', pad: 12, gap: 8, radius: 10, fill: 'brand/primary-50', cross: 'start' }, Ico('info', { size: 16, color: 'brand/primary' }), Txt('كل تذكرة مرتبطة بمحطة وشاشة، ويمكن فتح وصول مؤقت منها بسبب مسجّل.', { style: 'Body/Small 12', color: 'brand/primary', w: 'fill' }))))
    ]);
}
const ADMIN_SCREENS = [A1_Platform, A2_Onboarding, A3_Plans, A4_Audit];
// ============================================================
// Desktop login + general states (loading / empty / error / permission)
// ============================================================
function L1_Login() {
    function mini(label, v, tone) {
        return Col({ w: 'fill', pad: 14, gap: 2, radius: 14, fill: 'brand/dark-800', stroke: 'brand/dark-700' }, Txt(label, { style: 'Body/Small 12', color: 'text/on-dark-muted' }), Txt(v, { style: 'Number/M 18', color: tone || 'text/on-dark' }));
    }
    return Row({ name: 'L1 · تسجيل الدخول (المكتب)', w: 1440, h: 1024, fill: 'surface/page', clip: true }, Col({ name: 'Form side', w: 'fill', h: 'fill', main: 'center', cross: 'center' }, Col({ name: 'Login card', w: 440, pad: 36, gap: 18, radius: 24, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Raised' }, Row({ gap: 10 }, Row({ w: 40, h: 40, radius: 12, fill: 'brand/action', main: 'center', cross: 'center' }, Ico('fuel', { size: 22, color: 'brand/dark' })), Txt('FuelOS', { style: 'Heading/H2 20' })), Col({ w: 'fill', gap: 4 }, Txt('تسجيل الدخول', { style: 'Display/32' }), Txt('لصاحب المحطة والمحاسب وأدمن المنصة', { style: 'Body/Regular 14', color: 'text/secondary' })), Field('البريد الإلكتروني أو رقم الهاتف', 'khaled@example.com', { icon: 'user' }), Field('كلمة المرور', '••••••••••', { icon: 'lock', focus: true }), Row({ w: 'fill', main: 'between' }, Row({ gap: 8 }, Row({ w: 20, h: 20, radius: 6, fill: 'brand/primary', main: 'center', cross: 'center' }, Ico('check', { size: 14, color: 'text/on-dark' })), Txt('تذكّر هذا الجهاز', { style: 'Body/Regular 14' })), LinkText('نسيت كلمة المرور؟')), Btn('primary', 'دخول', null, { size: 'lg', w: 'fill' }), Row({ w: 'fill', gap: 10 }, Rect({ w: 'fill', h: 1, fill: 'border/default' }), Txt('أو', { style: 'Body/Small 12', color: 'text/muted' }), Rect({ w: 'fill', h: 1, fill: 'border/default' })), Btn('secondary', 'الدخول برمز لمرة واحدة (OTP)', 'phone', { w: 'fill' }), Row({ w: 'fill', pad: 12, gap: 8, radius: 12, fill: 'surface/muted', cross: 'start' }, Ico('info', { size: 16, color: 'text/secondary' }), Txt('عمال المحطة يدخلون من تطبيق الهاتف برمز PIN، حتى دون إنترنت.', { style: 'Body/Small 12', color: 'text/secondary', w: 'fill' })))), Col({ name: 'Brand side', w: 620, h: 'fill', pad: 64, gap: 28, fill: 'brand/dark', main: 'center' }, Txt('FuelOS · نظام تشغيل محطة الوقود', { style: 'Label/12', color: 'brand/action' }), Txt('ضبط مالي وتشغيلي لمحطتك — دون أجهزة جديدة.', { style: 'Display/32', color: 'text/on-dark', w: 'fill' }), Bullets(['كل عملية بيع أو توريد أو مصروف تتحول إلى قيد قابل للتتبع', 'إغلاق مناوبة بثلاث خطوات ومقارنة فورية للصندوق', 'تطبيق زبائن يعرض الأسعار والفواتير والنقاط'], { style: 'Body/Large 16', color: 'text/on-dark-muted', dot: 'brand/action', gap: 10 }), Row({ w: 'fill', gap: 12 }, mini('مبيعات اليوم', '2,026,400'), mini('فرق الصندوق', '-4,500', 'status/warning'), mini('المناوبات المغلقة', '3 / 4', 'brand/action'))));
}
function Sk(w, h, p) { return Rect(Object.assign({ name: 'Skeleton', w: w, h: h, radius: 8, fill: 'surface/muted' }, p || {})); }
function SkCard(p) {
    const kids = Array.prototype.slice.call(arguments, 1);
    return Col(Object.assign({ name: 'Skeleton card', w: 'fill', pad: 20, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default' }, p || {}), kids);
}
function ST1_Loading() {
    return Desktop('ST1 · حالة التحميل (Skeleton)', 'dash', [
        Row({ w: 'fill', main: 'between' }, Col({ gap: 8 }, Sk(220, 28), Sk(320, 14)), Row({ gap: 10 }, Sk(320, 40, { radius: 12 }), Sk(40, 40, { radius: 10 }))),
        Row({ w: 'fill', pad: 12, gap: 8, radius: 12, fill: 'status/info-50' }, Ico('refresh', { size: 16, color: 'status/info-700' }), Txt('جارٍ تحميل بيانات اليوم… تُعرض آخر نسخة محفوظة (14:02) فور جاهزيتها.', { style: 'Body/Small 12', color: 'status/info-700', w: 'fill' })),
        Row({ w: 'fill', gap: 16 }, [1, 2, 3].map(function () { return SkCard({ h: 84, gap: 10 }, Sk(200, 14), Sk(280, 12)); })),
        Row({ w: 'fill', gap: 16 }, [1, 2, 3, 4].map(function () { return SkCard({ h: 150 }, Row({ w: 'fill', main: 'between' }, Sk(110, 14), Sk(36, 36, { radius: 10 })), Sk(170, 30), Sk(130, 12)); })),
        Row({ w: 'fill', gap: 16, cross: 'start' }, SkCard({ h: 420 }, Sk(180, 18), Sk('fill', 300, { radius: 12 }), Sk(360, 12)), SkCard({ w: 360, h: 420 }, Sk(120, 18), Sk('fill', 100, { radius: 12 }), Sk('fill', 100, { radius: 12 }), Sk('fill', 100, { radius: 12 })))
    ]);
}
function ST2_Empty() {
    function step(n, t, sub, state, cta) {
        const done = state === 'done', now = state === 'now';
        return Row({ w: 'fill', pad: 14, gap: 12, radius: 14, fill: now ? 'brand/primary-50' : 'surface/card', stroke: now ? 'brand/primary' : 'border/default', strokeW: now ? 2 : 1 }, Row({ w: 32, h: 32, radius: 999, fill: done ? 'brand/action' : (now ? 'brand/primary' : 'surface/muted'), main: 'center', cross: 'center' }, done ? Ico('check', { size: 16, color: 'brand/on-action' }) : Txt(String(n), { style: 'Body/Strong 14', color: now ? 'text/on-dark' : 'text/muted' })), Col({ w: 'fill', gap: 0 }, Txt(t, { style: 'Body/Strong 14' }), Txt(sub, { style: 'Body/Small 12', color: 'text/muted' })), cta ? Btn(now ? 'primary' : 'secondary', cta) : (done ? Badge('success', 'تم') : null));
    }
    return Desktop('ST2 · محطة جديدة بلا بيانات (Empty)', 'dash', [
        PageHeader('لوحة القيادة', 'محطة الوادي · أول يوم تشغيل'),
        Col({ name: 'Center', w: 'fill', h: 'fill', main: 'center', cross: 'center' }, Col({ name: 'Empty card', w: 640, pad: 36, gap: 18, radius: 24, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Card', cross: 'center' }, IconBox('layers', { size: 72, radius: 22, iconSize: 34 }), Txt('لا توجد بيانات بعد', { style: 'Heading/H1 24', align: 'center' }), Txt('اللوحة تمتلئ تلقائياً بعد أول مناوبة. ابدأ بالخطوات التالية — تستغرق أقل من 30 دقيقة.', { style: 'Body/Large 16', color: 'text/secondary', w: 520, align: 'center' }), Col({ w: 'fill', gap: 10 }, step(1, 'بيانات المحطة', 'الاسم والعنوان وساعات العمل', 'done'), step(2, 'أضف الخزانات', 'نوع الوقود والسعة وأول قياس', 'now', 'إضافة خزان'), step(3, 'أضف المضخات واربطها', 'كل مضخة بخزان واحد', 'todo'), step(4, 'افتح أول مناوبة', 'من تطبيق العامل على الهاتف', 'todo')))),
    ], { sidebar: { station: 'محطة الوادي', stationSub: 'محطة جديدة · قيد الإعداد' } });
}
function ST3_Error() {
    return Desktop('ST3 · خطأ مع سبب وإجراء (Error)', 'reports', [
        PageHeader('التقارير والتحليلات', 'الربح والخسارة · سبتمبر 2026'),
        Col({ name: 'Center', w: 'fill', h: 'fill', main: 'center', cross: 'center', gap: 16 }, Col({ name: 'Error card', w: 620, pad: 32, gap: 16, radius: 24, fill: 'surface/card', stroke: 'status/danger', strokeOpacity: 0.35, shadow: 'Shadow/Card' }, IconBox('alert', { size: 56, radius: 16, bg: 'status/danger-50', fg: 'status/danger', iconSize: 28 }), Txt('تعذّر حساب تقرير الربح والخسارة', { style: 'Heading/H1 24' }), Col({ w: 'fill', gap: 4 }, Txt('السبب', { style: 'Label/12', color: 'text/muted' }), Txt('شحنة بنزين 95 (فاتورة المورد INV-2231) مسجّلة دون سعر شراء، لذلك لا يمكن حساب تكلفة الوقود المباع بدقة.', { style: 'Body/Large 16', w: 'fill' })), Row({ w: 'fill', gap: 10 }, Btn('primary', 'إدخال تكلفة الشراء', 'plus'), Btn('secondary', 'عرض تقرير تقديري بدونها'))), Row({ name: 'Network error', w: 620, pad: 16, gap: 12, radius: 16, fill: 'surface/card', stroke: 'border/default' }, IconBox('wifiOff', { size: 40, radius: 12, bg: 'status/warning-50', fg: 'status/warning-700' }), Col({ w: 'fill', gap: 0 }, Txt('مثال آخر: انقطع الاتصال أثناء التحميل', { style: 'Body/Strong 14' }), Txt('بياناتك محفوظة. سنعيد المحاولة تلقائياً خلال 10 ثوانٍ.', { style: 'Body/Small 12', color: 'text/muted' })), Btn('secondary', 'إعادة المحاولة الآن', 'refresh')), Txt('قاعدة: رسالة مختصرة + سبب + إجراء واضح. لا رموز أخطاء تقنية للمستخدم العادي.', { style: 'Body/Small 12', color: 'text/muted' }))
    ]);
}
function ST4_Permission() {
    return Desktop('ST4 · لا تملك الصلاحية (Permission)', 'approvals', [
        PageHeader('الموافقات', '3 طلبات بانتظار صاحب المحطة'),
        Col({ name: 'Center', w: 'fill', h: 'fill', main: 'center', cross: 'center' }, Col({ name: 'Permission card', w: 620, pad: 32, gap: 16, radius: 24, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Card' }, IconBox('lock', { size: 56, radius: 16, bg: 'status/warning-50', fg: 'status/warning-700', iconSize: 28 }), Txt('اعتماد إغلاق المناوبات من صلاحية صاحب المحطة', { style: 'Heading/H1 24', w: 'fill' }), Txt('دورك: محاسبة. يمكنك رؤية الطلبات وتفاصيلها وأدلتها، لكن لا يمكنك اعتمادها أو رفضها.', { style: 'Body/Large 16', color: 'text/secondary', w: 'fill' }), Col({ w: 'fill', gap: 8 }, Txt('من يملك الصلاحية؟', { style: 'Label/12', color: 'text/muted' }), Row({ w: 'fill', pad: 12, gap: 10, radius: 12, fill: 'surface/page' }, Avatar('خع', 36), Col({ w: 'fill', gap: 0 }, Txt('خالد العمر', { style: 'Body/Strong 14' }), Txt('صاحب المحطة · آخر ظهور الآن', { style: 'Body/Small 12', color: 'text/muted' })))), Row({ w: 'fill', gap: 10 }, Btn('primary', 'طلب الصلاحية من خالد', 'share'), Btn('secondary', 'عرض الطلبات للقراءة فقط')), Txt('الزر لا يُخفى دون تفسير — نوضّح لماذا ومن يملك الصلاحية.', { style: 'Body/Small 12', color: 'text/muted' })))
    ], { sidebar: { user: ['رع', 'رنا عيسى', 'محاسبة'] } });
}
const STATE_SCREENS = [L1_Login, ST1_Loading, ST2_Empty, ST3_Error, ST4_Permission];
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
// Entry point
// ============================================================
async function safe(label, fn) {
    try {
        await fn();
    }
    catch (e) {
        log(label + ': ' + (e && e.message ? e.message : String(e)), 'error');
        if (e && e.stack)
            console.error(e.stack);
    }
    await tick();
}
async function runBuild() {
    const t0 = Date.now();
    log('بدء البناء…');
    await setupFonts();
    const pages = await preparePages();
    await figma.setCurrentPageAsync(pages.ds);
    await setupVariables();
    await setupStyles();
    const analysis = await makeBoard(pages.ds, 'تحليل المواصفات', 'قراءة تفصيلية لملف FuelStation_UIUX_Design_Spec_AR (25 صفحة): الفكرة، المستخدمون، 19 شاشة، المكوّنات، الحالات، الصلاحيات، الفجوات، وخطة التنفيذ.', 0, 1720);
    const foundations = await makeBoard(pages.ds, 'الأساسيات البصرية', 'الألوان والخطوط والمسافات — مبنية كمتغيرات وأنماط قابلة لإعادة الاستخدام.', 1840, 1280);
    const components = await makeBoard(pages.ds, 'المكوّنات', 'مكوّنات حقيقية بخصائص Variants ونصوص قابلة للتعديل من لوحة الخصائص.', 3240, 1680);
    await safe('الأيقونات', function () { return buildIconsBoard(components); });
    await safe('المكوّنات', function () { return buildComponentsBoard(components); });
    await safe('الأساسيات', function () { return buildFoundations(foundations); });
    await safe('التحليل', function () { return buildAnalysis(analysis); });
    await figma.setCurrentPageAsync(pages.sc);
    await buildScreens(pages.sc);
    const secs = Math.round((Date.now() - t0) / 1000);
    log('انتهى البناء خلال ' + secs + ' ثانية' + (ERRORS.length ? ' — مع ' + ERRORS.length + ' خطأ' : ''), ERRORS.length ? 'warn' : 'ok');
    try {
        figma.viewport.scrollAndZoomIntoView(pages.sc.children.filter(function (n) { return n.getPluginData('fuelos') === 'gen'; }));
    }
    catch (e) { /* ignore */ }
    figma.ui.postMessage({ type: 'done', errors: ERRORS.slice(), secs: secs });
    figma.notify(ERRORS.length ? 'اكتمل البناء مع ' + ERRORS.length + ' خطأ — راجع السجل' : 'اكتمل بناء التصميم');
}
figma.showUI(__html__, { width: 400, height: 560, title: 'FuelOS — بناء التصميم' });
figma.ui.postMessage({ type: 'init', fileName: figma.root.name, pages: figma.root.children.map(function (p) { return p.name; }) });
figma.ui.onmessage = function (msg) {
    if (msg.type === 'build') {
        return runBuild().catch(function (e) {
            log('توقف البناء: ' + (e && e.message ? e.message : e), 'error');
            figma.ui.postMessage({ type: 'done', errors: ERRORS.slice(), secs: 0 });
        });
    }
    if (msg.type === 'close')
        figma.closePlugin();
};
