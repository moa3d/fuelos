// ============================================================
// Layout helpers shared by boards and screens
// ============================================================

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

function Card(p) {
  const kids = Array.prototype.slice.call(arguments, 1);
  return Col(Object.assign({ name: 'Card', w: 'fill', pad: 20, gap: 14, radius: 16, fill: 'surface/card', stroke: 'border/default', shadow: 'Shadow/Card' }, p || {}), kids);
}

function CardHeader(title, opt) {
  opt = opt || {};
  return Row({ name: 'Card header', w: 'fill', main: 'between' },
    Row({ gap: 8 }, opt.icon ? Ico(opt.icon, { size: 20, color: 'brand/primary' }) : null, Txt(title, { style: 'Heading/H3 16' }),
      opt.sub ? Txt(opt.sub, { style: 'Body/Small 12', color: 'text/muted' }) : null),
    opt.right || null);
}

function LinkText(t, p) { return Txt(t, Object.assign({ style: 'Label/12', color: 'brand/primary' }, p || {})); }

function Badge(tone, label, p) { return Inst('Status Badge', { tone: tone }, { Label: label }, p); }

function Chip(label, on, p) {
  p = p || {};
  return Row(Object.assign({ name: 'Chip', h: p.h || 36, pad: [0, 14], gap: 6, radius: 999, fill: on ? 'brand/primary' : 'surface/card', stroke: on ? null : 'border/default', main: 'center' }, p),
    p.icon ? Ico(p.icon, { size: 16, color: on ? 'text/on-dark' : 'text/secondary' }) : null,
    Txt(label, { style: 'Body/Strong 14', color: on ? 'text/on-dark' : 'text/secondary' }));
}

function SectionTitle(num, title, sub) {
  return Col({ name: 'Section title', w: 'fill', gap: 4 },
    Row({ gap: 12 },
      Row({ w: 36, h: 36, radius: 10, fill: 'brand/primary', main: 'center', cross: 'center' }, Txt(String(num), { style: 'Heading/H3 16', color: 'text/on-dark' })),
      Txt(title, { style: 'Heading/H1 24' })),
    sub ? Txt(sub, { style: 'Body/Large 16', color: 'text/secondary', w: 'fill' }) : null);
}

function Bullets(items, p) {
  p = p || {};
  return Col({ name: 'Bullets', w: 'fill', gap: p.gap || 6 },
    items.map(function (t) {
      return Row({ w: 'fill', gap: 8, cross: 'start' },
        Col({ pad: [8, 0, 0, 0] }, Dot(6, p.dot || 'brand/primary')),
        Txt(t, { style: p.style || 'Body/Regular 14', color: p.color || 'text/secondary', w: 'fill' }));
    }));
}

// Table: cols = [{ t: 'العنوان', w: 120 | 'fill', align }], rows = [[cell,...]] where cell = string | spec
function Table(cols, rows, p) {
  p = p || {};
  function cell(c, col, head) {
    const w = col.w || 'fill';
    if (c && typeof c === 'object' && c.k) return Row({ name: 'Cell', w: w, main: col.align === 'left' ? 'end' : (col.align === 'center' ? 'center' : 'start') }, c);
    return Txt(String(c), { name: 'Cell', w: w, style: head ? 'Label/12' : (col.strong ? 'Body/Strong 14' : 'Body/Regular 14'), color: head ? 'text/muted' : (col.color || 'text/primary'), align: col.align || 'right' });
  }
  const head = Row({ name: 'Head', w: 'fill', pad: [10, 16], gap: 16, fill: 'surface/muted', radius: p.flatHead ? 0 : 10 }, cols.map(function (col) { return cell(col.t, col, true); }));
  const body = [];
  rows.forEach(function (r, i) {
    body.push(Row({ name: 'Row ' + (i + 1), w: 'fill', pad: [p.rowPad || 12, 16], gap: 16, fill: r.highlight ? r.highlight : null }, r.map(function (c, j) { return cell(c, cols[j], false); })));
    if (i < rows.length - 1) body.push(Divider());
  });
  return Col({ name: p.name || 'Table', w: p.w || 'fill', gap: 0 }, head, body);
}

// Key/value row
function KV(k, v, p) {
  p = p || {};
  return Row({ name: 'KV', w: 'fill', main: 'between', pad: p.pad || [0, 0] },
    Txt(k, { style: 'Body/Regular 14', color: 'text/secondary' }),
    typeof v === 'string' ? Txt(v, { style: p.vStyle || 'Body/Strong 14', color: p.vColor || 'text/primary' }) : v);
}

function Money(value, p) {
  p = p || {};
  return Row({ name: 'Money', gap: 4, cross: 'end' },
    Txt(value, { style: p.style || 'Number/L 24', color: p.color || 'text/primary' }),
    Txt(p.unit || 'ل.س', { style: p.unitStyle || 'Body/Small 12', color: 'text/muted' }));
}

function Avatar(initials, size, p) {
  p = p || {};
  size = size || 36;
  return Row({ name: 'Avatar', w: size, h: size, radius: 999, fill: p.fill || 'brand/primary-50', main: 'center', cross: 'center' },
    Txt(initials, { style: size >= 40 ? 'Body/Strong 14' : 'Label/12', color: p.color || 'brand/primary' }));
}
