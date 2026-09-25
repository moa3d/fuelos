// ============================================================
// Screens page: one Section per interface (multi-row) + prototype links
// ============================================================

const SCREEN_NODES = {}; // code (e.g. 'O1') -> frame node

async function buildSection(page, title, sub, rows, x, y, gap) {
  const PAD = 80, TOP = 150, ROWGAP = 160;
  const built = rows.map(function (fns) {
    const specs = [];
    for (const fn of fns) { try { specs.push(fn()); } catch (e) { log('تجهيز ' + fn.name + ': ' + e.message, 'error'); } }
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
  section.x = x; section.y = y;
  section.resizeWithoutConstraints(W, H);
  section.fills = [paint('surface/muted')];
  section.setPluginData('fuelos', 'gen');
  const head = await buildFrame(Col({ name: 'Section title', w: 1400, gap: 6 },
    Txt(title, { style: 'Display/32', w: 'fill' }), Txt(sub, { style: 'Body/Large 16', color: 'text/secondary', w: 'fill' })), null, figma.createFrame());
  section.appendChild(head);
  head.x = W - PAD - 1400; head.y = 40;
  let cy = TOP;
  for (const r of built) {
    // RTL: first screen of a row sits at the right edge
    let cx = W - PAD;
    for (const spec of r.specs) {
      cx -= spec.w;
      try {
        const node = await buildFrame(spec, null, figma.createFrame());
        section.appendChild(node);
        node.x = cx; node.y = cy;
        SCREEN_NODES[spec.name.split(' ')[0]] = node;
        log('شاشة: ' + spec.name);
      } catch (e) { log('فشلت الشاشة ' + spec.name + ': ' + e.message, 'error'); }
      cx -= gap;
      await tick();
    }
    cy += r.h + ROWGAP;
  }
  return { w: W, h: H };
}

async function linkTo(node, code) {
  const dest = SCREEN_NODES[code];
  if (!node || !dest) return false;
  const reaction = { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: dest.id, navigation: 'NAVIGATE', transition: { type: 'DISSOLVE', easing: { type: 'EASE_OUT' }, duration: 0.2 }, resetVideoPosition: false }] };
  try {
    if (typeof node.setReactionsAsync === 'function') await node.setReactionsAsync([reaction]);
    else node.reactions = [reaction];
    return true;
  } catch (e) {
    try {
      reaction.actions[0].transition = null;
      if (typeof node.setReactionsAsync === 'function') await node.setReactionsAsync([reaction]); else node.reactions = [reaction];
      return true;
    } catch (e2) { return false; }
  }
}

function findIn(code, pred) {
  const f = SCREEN_NODES[code];
  if (!f) return null;
  return f.findOne(pred);
}
function byName(name) { return function (n) { return n.name === name; }; }

async function buildPrototype(page) {
  let links = 0, fails = 0;
  async function L(node, code) { if (!node) return; if (await linkTo(node, code)) links++; else fails++; }
  // sidebar navigation on every desktop screen
  for (const code of Object.keys(SCREEN_NODES)) {
    const f = SCREEN_NODES[code];
    const navs = f.findAll(function (n) { return n.type === 'INSTANCE' && n.name.indexOf('Nav · ') === 0; });
    for (const n of navs) { const key = n.name.slice(6); if (NAV_TARGET[key] && NAV_TARGET[key] !== code) await L(n, NAV_TARGET[key]); }
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
    const f = SCREEN_NODES[code]; if (!f) continue;
    for (const t of Object.keys(tabMap)) if (tabMap[t] !== code) await L(f.findOne(byName(t)), tabMap[t]);
  }
  const shortcuts = SCREEN_NODES.C1 ? SCREEN_NODES.C1.findOne(byName('Shortcuts')) : null;
  if (shortcuts) {
    const kids = shortcuts.children; // Figma order is left→right; RTL list was [car, receipt, tag, message]
    const map = { 'سيارتي': 'C5', 'فواتيري': 'C3', 'العروض': 'C6', 'الشكاوى': 'C7' };
    for (const k of kids) {
      const t = k.findOne(function (n) { return n.type === 'TEXT'; });
      if (t && map[t.characters]) await L(k, map[t.characters]);
    }
  }
  // flow starting points
  try {
    const starts = [['L1', 'مسار صاحب المحطة'], ['L2', 'مسار العامل'], ['L3', 'مسار الزبون'], ['A1', 'مسار أدمن المنصة']]
      .filter(function (s) { return SCREEN_NODES[s[0]]; }).map(function (s) { return { nodeId: SCREEN_NODES[s[0]].id, name: s[1] }; });
    page.flowStartingPoints = starts;
  } catch (e) { log('نقاط بداية النموذج: ' + e.message, 'warn'); }
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
