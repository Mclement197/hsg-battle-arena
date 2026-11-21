// Explicit native-browser check: isolated loopback rooms, never deployed state.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createGameServer } from '../src/server.mjs';
import { Arena } from '../src/engine.mjs';
import { ABILITIES, moveLabel } from '../public/battle-contract.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const dir = process.env.EVIDENCE_DIR || '/tmp/hsg-move-label-smoke';
await fs.mkdir(dir, { recursive: true });
let time = Date.now();
const arena = new Arena({ now: () => time, pick: () => 0 });
const game = createGameServer({ arena, autoTick: false, publicOrigin: 'http://127.0.0.1:18997' });
await new Promise(resolve => game.server.listen(18997, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:18997';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true,
 args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const checks = [], errors = [], failed = [];
async function post(path, body = {}, token) {
 return new Promise((resolve, reject) => {
  const req = http.request(base + '/game/api/' + path, { method: 'POST', headers: {
   Origin: base, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {})
  } }, res => { let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => {
   try { assert.ok(res.statusCode < 300, text); resolve(JSON.parse(text)); } catch (error) { reject(error); }
  }); });
  req.on('error', reject); req.end(JSON.stringify(body));
 });
}
async function attach(context, room, role, token) {
 const page = await context.newPage();
 page.on('pageerror', error => errors.push(error.message));
 page.on('response', response => { if (response.status() >= 400) failed.push([response.status(), response.url()]); });
 await page.addInitScript(({ room, role, token }) => {
  const fixed = Date.now(); Date.now = () => window.__testNow ?? fixed;
  sessionStorage.setItem('hsg-arena:v1:' + role + ':' + room, token);
  sessionStorage.setItem('hsg-arena:v1:active', JSON.stringify({ room, role }));
 }, { room, role, token });
 await page.goto(base + '/game/');
 return page;
}
async function labels(page, id, selector, width, height) {
 await page.setViewportSize({ width, height });
 await page.evaluate(() => document.fonts.ready);
 const expected = Object.keys(ABILITIES[id]).map(move => moveLabel(id, move));
 await page.waitForFunction(({selector, expected}) => JSON.stringify([...document.querySelectorAll(selector + ' strong')].map(e => e.textContent)) === JSON.stringify(expected), {selector, expected});
 const metrics = await page.locator(selector).evaluateAll(buttons => buttons.map(button => {
  const strong = button.querySelector('strong'), box = button.getBoundingClientRect();
  const range = document.createRange(); range.selectNodeContents(strong);
  const content = strong.getBoundingClientRect();
  return { label: strong.textContent, width: box.width, height: box.height,
   lines: [...range.getClientRects()].length, textBounds: [content.left, content.top, content.right, content.bottom],
   clipped: [...range.getClientRects()].some(r => r.left < box.left + 1 || r.right > box.right - 1 || r.top < box.top + 1 || r.bottom > box.bottom - 1),
   overflow: strong.scrollWidth > strong.clientWidth + 1 || strong.scrollHeight > strong.clientHeight + 1 || button.scrollHeight > button.clientHeight + 1 };
 }));
 assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, id + ' page overflow ' + width);
 assert.ok(metrics.every(m => m.width >= 44 && m.height >= 44 && !m.clipped && !m.overflow), JSON.stringify({ id, width, metrics }));
 if (selector === '[data-solo-move]') {
  const zones = await page.evaluate(() => { const rect = s => { const r = document.querySelector(s).getBoundingClientRect(); return { top:r.top, bottom:r.bottom, height:r.height }; }; return { stage:rect('.fight-stage'), top:rect('.battle-top'), health:rect('.fight-stage .health'), controls:rect('.solo-controls'), bottom:rect('.battle-bottom'), host:rect('.host-bar'), scroll:document.documentElement.scrollHeight, viewport:innerHeight }; });
  assert.ok(zones.health.top >= zones.top.bottom - 1 && zones.controls.top >= zones.health.bottom && zones.controls.bottom <= zones.bottom.top + 1 && zones.host.bottom <= zones.viewport + 1 && zones.scroll <= zones.viewport + 1, JSON.stringify({ id, width, height, zones }));
  checks.push({ id, viewport:[width,height], zones });
 }
 await page.screenshot({ path: dir + '/' + id + '-' + selector.replace(/[^a-z]/g, '') + '-' + width + 'x' + height + '.png', fullPage: true });
 checks.push({ id, viewport: [width, height], metrics });
 console.log('PASS labels', id, width + 'x' + height);
}
try {
 const ids = Object.keys(ABILITIES);
 for (let index = 0; index < ids.length; index++) {
  const a = ids[index], b = ids[(index + 1) % ids.length];
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const room = await post('rooms', { mode: 'friend' });
  await post('rooms/' + room.roomId + '/configure', { arenaId: 'library', characterA: a, characterB: b }, room.hostToken);
  const guest = await post('rooms/' + room.roomId + '/join', { nickname: 'Label check' });
  const host = await attach(hostContext, room.roomId, 'host', room.hostToken);
  const phone = await attach(guestContext, room.roomId, 'player', guest.playerToken);
  const start = await post('rooms/' + room.roomId + '/start', {}, room.hostToken);
  time = start.state.prebattle.deadline; game.tick();
  await Promise.all([host, phone].map(page => page.evaluate(now => { window.__testNow = now; }, time)));
  await host.waitForFunction(() => document.body.dataset.screen === 'battle');
  await phone.waitForFunction(() => document.body.dataset.screen === 'player');
  for (const [width, height] of [[1440,1000],[1280,900],[360,560],[360,640],[390,844],[740,390]]) {
   await labels(host, a, '[data-solo-move]', width, height);
   if (width === 360 || width === 390 || width === 740) await labels(phone, b, '[data-move]', width, height);
  }
  await hostContext.close(); await guestContext.close();
 }
 assert.deepEqual(errors, []); assert.deepEqual(failed, []);
 await fs.writeFile(dir + '/checks.json', JSON.stringify({ checks, errors, failed }, null, 2));
 console.log('PASS: 24 moves, six characters, six desktop/mobile viewports, geometry only; evidence ' + dir);
} finally { await browser.close(); await game.close(); }
