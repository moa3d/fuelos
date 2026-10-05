// ============================================================
// Entry point — FuelOS Customer Builder
// ============================================================

async function cSafe(label, fn) {
  try { await fn(); }
  catch (e) { log(label + ': ' + (e && e.message ? e.message : String(e)), 'error'); }
  await tick();
}

async function cBuildPrototype(page) {
  let links = 0, fails = 0;
  async function L(node, code) { if (!node) { fails++; return; } if (await linkTo(node, code)) links++; else fails++; }
  const N = byName;
  // bottom bar on every signed-in screen
  for (const code of Object.keys(SCREEN_NODES)) {
    const f = SCREEN_NODES[code];
    if (!f.findOne(N('Tab Bar'))) continue;
    for (const t of C_TABS) if (t[3] !== code) await L(f.findOne(N('Tab ' + t[0])), t[3]);
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
  try { page.flowStartingPoints = [{ nodeId: SCREEN_NODES.CU1.id, name: 'تطبيق الزبون — الإصدار الحالي' }]; }
  catch (e) { log('نقطة بداية النموذج: ' + e.message, 'warn'); }
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
  await buildSection(page, 'تطبيق الزبون — الإصدار الحالي (هاتف 390)',
    'CU1–CU15 · مطابق لما هو مبني في apps/customer: الأسعار للزائر، الدخول بالبريد وكلمة المرور، الشريط السفلي، بطاقتي، الفواتير، المكافآت، الشكاوى، سياراتي، وإعلانات الرعاة.',
    C_SCREENS, 0, y, 80);
  await cSafe('النموذج التفاعلي', function () { return cBuildPrototype(page); });

  const secs = Math.round((Date.now() - t0) / 1000);
  log('انتهى البناء خلال ' + secs + ' ثانية' + (ERRORS.length ? ' — مع ' + ERRORS.length + ' خطأ' : ''), ERRORS.length ? 'warn' : 'ok');
  try { figma.viewport.scrollAndZoomIntoView(page.children.filter(function (n) { return n.getPluginData('fuelos') === 'gen'; })); } catch (e) { /* ignore */ }
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
  if (msg.type === 'close') figma.closePlugin();
};
