// Real Chromium and owned loopback rooms only; never mutates the deployed game.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createGameServer } from '../src/server.mjs';
import { CHARACTERS } from '../src/engine.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const dir = process.env.EVIDENCE_DIR || '/tmp/hsg-characters-browser';
await fs.mkdir(dir, { recursive: true });
const game = createGameServer({ publicOrigin: 'http://127.0.0.1:18994' });
await new Promise(r => game.server.listen(18994, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
  headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], failed = [], checks = [];
function monitor(page) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) failed.push([r.status(), new URL(r.url()).pathname]); });
}
async function ready(page, selector, count = 1) {
  await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector + '[data-model-status="ready"]').length === count,
    { selector, count }, { timeout: 30000 });
}
async function shot(page, name) {
  await page.screenshot({ path: dir + '/' + name + '.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name + ' overflow');
}
async function setup(page, a, b, { all = true } = {}) {
  await page.goto('http://127.0.0.1:18994/game/');
  // Test-only probe of the actual production stage. No production debug globals or synthetic animation events.
  await page.evaluate(async () => {
    const { CharacterStage } = await import('./characters.js?v=20261018-previews');
    const sync = CharacterStage.prototype.sync, play = CharacterStage.prototype.play;
    window.__modelCues = [];
    CharacterStage.prototype.sync = function () { window.__testStage = this; return sync.call(this); };
    CharacterStage.prototype.play = function (e) { window.__modelCues.push(e); return play.call(this, e); };
  });
  await page.locator('#play-bot').click();
  await page.locator('#arena-next').click();
  await ready(page, '#selected-fighter-art');
  if (all) for (const id of CHARACTERS) {
    await page.locator('button[data-character="' + id + '"]').click();
    await ready(page, '#selected-fighter-art');
    assert.equal(await page.locator('.preview-art canvas').getAttribute('data-model-id'), id);
    assert.equal(await page.locator('.preview-art canvas').getAttribute('data-clip'), 'idle');
    assert.equal(await page.evaluate(() => window.__modelCues.length), 0, 'selection never attacks');
    await shot(page, 'selection-' + page.viewportSize().width + '-' + id);
  }
  await page.locator('button[data-character="' + a + '"]').click();
  await page.locator('#pick-b').click();
  await page.locator('button[data-character="' + b + '"]').click();
  await page.locator('#selection-next').click();
  await page.waitForFunction(() => document.body.dataset.screen === 'battle');
  await ready(page, '.fighter-art', 2);
  assert.deepEqual(await page.locator('.fighter-visual canvas').evaluateAll(ns => ns.map(n => n.dataset.modelId)), [a, b]);
  const skin = await page.evaluate(() => [...window.__testStage.views.values()].map(view => {
    let skinned = 0, bones = 0;
    view.root.traverse(o => { if (o.isSkinnedMesh) { skinned++; bones = Math.max(bones, o.skeleton.bones.length); } });
    return { id: view.id, skinned, bones, clips: [...view.actions.keys()] };
  }));
  assert.equal(skin.length, 2);
  for (const model of skin) { assert.ok(model.skinned > 0); assert.ok(model.bones >= 48); assert.equal(model.clips.length, 7); }
  return skin;
}
async function finish(page, width) {
  let defeat = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForFunction(() => document.body.dataset.screen === 'victory' ||
      document.querySelector('.fighter-visual canvas[data-clip="defeat"]') ||
      !document.querySelector('[data-solo-move="attack"]').disabled, null, { timeout: 15000 });
    if (await page.locator('.fighter-visual canvas[data-clip="defeat"]').count()) {
      defeat = true;
      await page.waitForTimeout(350);
      await shot(page, 'defeat-' + width);
      break;
    }
    if (await page.locator('body').getAttribute('data-screen') === 'victory') break;
    const special = page.locator('[data-solo-move="special"]');
    await (await special.isEnabled() ? special : page.locator('[data-solo-move="attack"]')).click();
    // Wait until the accepted move has actually resolved, not another local input frame.
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => document.body.dataset.screen === 'victory');
  await ready(page, '#winner-art');
  assert.equal(await page.locator('canvas.character-canvas').count(), 1);
  await shot(page, 'victory-' + width);
  return defeat;
}
try {
  for (const [width, height, mobile, a, b] of [
    [1440, 1000, false, 'luca-di-grazia', 'trischli-warrior'],
    [390, 844, true, 'assessment-hoodie', 'bad-teacher']
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(); monitor(page);
    const skin = await setup(page, a, b);
    await shot(page, 'battle-' + width);
    await page.locator('[data-solo-move="attack"]').click();
    await page.waitForFunction(() => document.querySelector('.ace-fighter canvas')?.dataset.clip === 'attack');
    assert.equal(await page.locator('.dynamo-fighter canvas').getAttribute('data-clip'), 'hit');
    await shot(page, 'attack-' + width);
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('.ace-fighter canvas').getAttribute('data-clip'), 'idle');
    assert.equal(await page.evaluate(() => window.__modelCues.filter(e => e.actorTeam === 'A').length), 1, 'mutation response + SSE do not replay actor animation');
    const rafPerSecond = await page.evaluate(() => new Promise(resolve => {
      let frames = 0; const start = performance.now();
      function f(t) { frames++; if (t - start < 1000) requestAnimationFrame(f); else resolve(frames); }
      requestAnimationFrame(f);
    }));
    const defeat = await finish(page, width);
    assert.equal(defeat, true, 'real final authoritative result visibly played defeat');
    await page.evaluate(() => { window.__oldViews = [...window.__testStage.views.values()]; });
    await page.locator('#main-menu').click();
    await page.waitForFunction(() => document.querySelectorAll('canvas.character-canvas').length === 0);
    assert.equal(await page.evaluate(() => window.__testStage.views.size), 0);
    assert.ok(await page.evaluate(() => window.__oldViews.every(v => v.dead && v.renderer.info.memory.geometries === 0)), 'GPU geometry disposed');
    checks.push({ width, all6Selection: true, skin, authoritativeAttack: true, deduplicatedSSE: true, defeat, rafPerSecond, cleanTeardown: true });
    await context.close();
  }
  const reduced = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await reduced.newPage(); monitor(page);
  await setup(page, 'tryhard', 'free-rider', { all: false });
  await page.locator('[data-solo-move="defend"]').click();
  await page.waitForFunction(() => document.querySelector('.ace-fighter canvas')?.dataset.clip === 'defend');
  const time = await page.evaluate(() => [...window.__testStage.views.values()].find(v => v.image.dataset.modelTeam === 'A').mixer.time);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => [...window.__testStage.views.values()].find(v => v.image.dataset.modelTeam === 'A').mixer.time), time);
  await shot(page, 'reduced-motion-defend');
  checks.push({ reducedMotion: true, stationaryDefend: true });
  await reduced.close();
  // Explicit WebGL fallback: same model portrait remains usable, no blank fighter or fake 3D claim.
  const fallback = await browser.newContext(); const fp = await fallback.newPage(); monitor(fp);
  await fp.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return kind === 'webgl2' ? null : get.call(this, kind, ...args); };
  });
  await fp.goto('http://127.0.0.1:18994/game/'); await fp.locator('#play-bot').click(); await fp.locator('#arena-next').click();
  await fp.waitForFunction(() => document.querySelector('#selected-fighter-art')?.dataset.modelStatus === 'fallback');
  assert.equal(await fp.locator('.preview-art canvas').count(), 0);
  assert.ok(await fp.locator('#selected-fighter-art').evaluate(im => im.naturalWidth > 0 && im.title.includes('3D unavailable')));
  await shot(fp, 'explicit-static-fallback'); checks.push({ explicitStaticFallback: true }); await fallback.close();
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  const report = { renderer: 'Chromium SwiftShader software WebGL2; not physical mobile GPU', checks, errors, failed };
  await fs.writeFile(dir + '/browser-checks.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await game.close(); }
