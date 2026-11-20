// From game/: PLAYWRIGHT_MODULE=/absolute/path/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/absolute/path/chrome node test/admin-browser.mjs
// Uses the existing optional browser toolchain; no package install or real admin key required.
import assert from 'node:assert/strict';
import { createGameServer } from '../src/server.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const game = createGameServer({ adminKey: 'browser-fixture-key', publicOrigin: 'http://127.0.0.1', autoTick: false });
let releasePending = () => {};
const dto = { serverNow: Date.now(), summary: { activeRooms: 1, runningBattles: 1, playersOnline: 6, roomsUsed: 1, roomCapacity: 50 }, rooms: [
  { roomCode: 'K7MP', mode: 'groups', phase: 'running', turnNumber: 4, playerCount: 6, fighters: { A: { characterId: 'luca-di-grazia', hp: 63, maxHp: 100 }, B: { characterId: 'free-rider', hp: 89, maxHp: 100 } } }
] };
const json = data => ({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
try {
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + game.server.address().port;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let requests = 0;
  await page.route('**/game/api/admin/overview', route => { requests++; return route.fulfill(json(dto)); });
  await page.goto(origin + '/game/admin/');
  assert.equal(await page.locator('#login').isVisible(), true);
  await page.locator('#admin-key').fill('browser-fixture-key');
  await page.locator('#login-form button').click();
  await page.locator('#connection[data-state="connected"]').waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('hsg-admin-key')), 'browser-fixture-key');
  assert.equal(await page.locator('#admin-key').inputValue(), '');
  assert.deepEqual(await page.locator('.fighter-name').allTextContents(), ['Luca Di Grazia', 'Free rider in group project']);
  assert.equal(await page.locator('.room-code').textContent(), 'K7••');
  await page.locator('#show-codes').click();
  assert.equal(await page.locator('.room-code').textContent(), 'K7MP');
  assert.equal(await page.locator('#show-codes').getAttribute('aria-pressed'), 'true');
  await page.locator('#show-codes').click();
  assert.equal(await page.locator('.room-code').textContent(), 'K7••');
  for (const [width, height] of [[390, 844], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    const actual = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(actual.scroll <= actual.client + 1, width + 'px horizontal overflow: ' + JSON.stringify(actual));
  }
  await page.reload();
  await page.locator('#connection[data-state="connected"]').waitFor();
  assert.equal(await page.locator('#login').isVisible(), false, 'same-tab reload restores session key');
  await page.locator('#logout').click();
  assert.equal(await page.locator('#login').isVisible(), true);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('hsg-admin-key')), null);
  await page.reload();
  assert.equal(await page.locator('#login').isVisible(), true, 'reload after logout remains logged out');

  await page.unroute('**/game/api/admin/overview');
  await page.route('**/game/api/admin/overview', route => { requests++; return route.fulfill(json({ ...dto, rooms: [], summary: { ...dto.summary, activeRooms: 0, runningBattles: 0 } })); });
  await page.locator('#admin-key').fill('browser-fixture-key');
  await page.locator('#login-form button').click();
  await page.locator('#connection[data-state="connected"]').waitFor();
  assert.equal(await page.locator('#room-message').textContent(), 'No battles right now');
  assert.equal(await page.locator('.room').count(), 0);

  // A stalled response must not create a second concurrent poll; next poll starts ~2s after completion.
  await page.unroute('**/game/api/admin/overview');
  let started = 0, pending = 0, maxPending = 0, firstFinishedAt = 0, nextStartedAt = 0;
  let unblock, signalStart;
  const firstStarted = new Promise(resolve => { signalStart = resolve; });
  await page.route('**/game/api/admin/overview', async route => {
    requests++; started++; pending++; maxPending = Math.max(maxPending, pending);
    if (started === 1) {
      signalStart();
      await new Promise(resolve => { unblock = resolve; releasePending = resolve; });
    } else if (started === 2) nextStartedAt = Date.now();
    await route.fulfill(json(dto));
    pending--;
    if (started === 1) firstFinishedAt = Date.now();
  });
  await firstStarted;
  await page.waitForTimeout(2200);
  assert.equal(started, 1, 'polls overlap while previous response is pending');
  unblock(); releasePending = () => {};
  await page.locator('#connection[data-state="connected"]').waitFor();
  await page.waitForFunction(() => document.querySelector('#active-rooms')?.textContent === '1');
  assert.equal(started, 1, 'poll started immediately after response');
  await page.waitForTimeout(2200);
  assert.ok(started >= 2, 'next poll missing after ~2 seconds');
  assert.equal(maxPending, 1, 'overlapping requests');
  assert.ok(nextStartedAt - firstFinishedAt >= 1900, 'poll interval shorter than ~2 seconds');

  await page.unroute('**/game/api/admin/overview');
  let throttledAt, retriedAt, count = 0;
  await page.route('**/game/api/admin/overview', route => {
    requests++; count++;
    if (count === 1) { throttledAt = Date.now(); return route.fulfill({ status: 429, headers: { 'Retry-After': '1' }, body: '' }); }
    retriedAt = Date.now(); return route.fulfill(json(dto));
  });
  await page.locator('#logout').click();
  await page.locator('#admin-key').fill('browser-fixture-key');
  await page.locator('#login-form button').click();
  await page.locator('#connection[data-state="throttled"]').waitFor();
  await page.waitForTimeout(1200);
  assert.equal(count, 1, '429 retried before backoff');
  await page.locator('#connection[data-state="connected"]').waitFor({ timeout: 5000 });
  assert.ok(retriedAt - throttledAt >= 1900, '429 Retry-After/backoff not respected');

  await page.unroute('**/game/api/admin/overview');
  await page.route('**/game/api/admin/overview', route => { requests++; return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }); });
  await page.locator('#logout').click();
  await page.locator('#admin-key').fill('invalid-fixture-key');
  await page.locator('#login-form button').click();
  await page.locator('#login-message:visible').waitFor();
  assert.equal(await page.locator('#login').isVisible(), true);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('hsg-admin-key')), null, '401 retains key');
  assert.deepEqual(errors, [], 'browser page errors');
  console.log('PASS admin browser: login/session/logout, names/masking/reveal, empty copy, phone/projector fit, 2s non-overlap polling, 429 backoff, 401 cleanup; requests=' + requests);
  await context.close();
} finally {
  releasePending();
  await browser.close();
  await game.close();
}
