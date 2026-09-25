// ============================================================
// Entry point
// ============================================================

async function safe(label, fn) {
  try { await fn(); }
  catch (e) { log(label + ': ' + (e && e.message ? e.message : String(e)), 'error'); if (e && e.stack) console.error(e.stack); }
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
  try { figma.viewport.scrollAndZoomIntoView(pages.sc.children.filter(function (n) { return n.getPluginData('fuelos') === 'gen'; })); } catch (e) { /* ignore */ }
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
  if (msg.type === 'close') figma.closePlugin();
};
