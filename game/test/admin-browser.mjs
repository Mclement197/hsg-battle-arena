// From game/: PLAYWRIGHT_MODULE=/absolute/path/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/absolute/path/chrome node test/admin-browser.mjs
// Real local HTTP server first; intercepted responses only exercise network failure timing.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { Arena } from '../src/engine.mjs';
import { createGameServer } from '../src/server.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
let now = 100000;
const roomCodes = ['Z9Q8', 'W7V6', 'T5S4', 'R3P2', 'N9M8'];
const arena = new Arena({ now: () => now, pick: () => 0, newRoomCode: () => roomCodes.shift() });
const game = createGameServer({ arena, publicOrigin: 'http://127.0.0.1', autoTick: false });
const host = { role: 'host' };
const makeRoom = () => {
  const room = arena.create();
  arena.configure(room, host, { arenaId: 'library', characterA: 'luca-di-grazia', characterB: 'free-rider' });
  return room;
};
const prepare = room => {
  arena.join(room, { nickname: 'SENTINEL_NICK_A' });
  arena.join(room, { nickname: 'SENTINEL_NICK_B' });
  arena.start(room, host, {});
};
const lobby = makeRoom(), finished = makeRoom(), countdown = makeRoom(), running = makeRoom();
prepare(finished); now = finished.prebattle.deadline; arena.advance(finished);
finished.teams.B.hp = 1; now = finished.turn.deadline; arena.advance(finished);
assert.equal(finished.phase, 'finished');
prepare(running); now = running.prebattle.deadline; arena.advance(running);
prepare(countdown);
let releasePending = () => {};
const json = data => ({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
const endpoint = '**/game/api/admin/overview';
const evidence = process.env.EVIDENCE_DIR || '/tmp/hsg-admin-public';
try {
  await mkdir(evidence, { recursive: true });
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + game.server.address().port;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().endsWith('/game/api/admin/overview')) requests.push({ at: Date.now(), headers: request.headers() }); });
  const connected = () => page.locator('#connection[data-state="connected"]').waitFor();
  const labels = () => page.locator('.room-number').allTextContents();
  const response = page.waitForResponse(origin + '/game/api/admin/overview');
  await page.goto(origin + '/game/admin/');
  assert.equal((await response).status(), 200);
  await connected();
  assert.deepEqual(await labels(), ['Room 3', 'Room 4', 'Room 1', 'Room 2']);
  assert.deepEqual(await page.locator('.phase').allTextContents(), ['Countdown', 'Running · Turn 1', 'Lobby', 'Finished · Turn 1']);
  assert.deepEqual(await page.locator('.fighter-name').allTextContents(), Array(4).fill(['Luca Di Grazia', 'Free rider']).flat());
  assert.equal(await page.locator('#login, #logout, #admin-key, #show-codes, .room-code, input[type="password"], button').count(), 0);
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  const text = await page.locator('body').textContent();
  for (const room of arena.rooms.values()) {
    for (const secret of [room.id, room.id.slice(0, 2), room.hostToken, ...room.credentials.keys(), ...[...room.players.values()].flatMap(p => [p.id, p.nickname])])
      assert.equal(text.includes(secret), false, 'rendered overview leaks a private value');
  }
  for (const [width, height] of [[390, 844], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    const actual = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(actual.scroll <= actual.client + 1, width + 'px horizontal overflow: ' + JSON.stringify(actual));
    await page.screenshot({ path: evidence + '/overview-' + width + '.png', fullPage: true });
  }

  // Real engine damage must reach the DOM at the next ~2-second anonymous poll.
  const beforeRequests = requests.length;
  now = running.turn.deadline; arena.advance(running);
  const damagedHp = running.teams.B.hp;
  assert.ok(damagedHp < 100);
  const changedAt = Date.now();
  await page.waitForFunction(hp => [...document.querySelectorAll('.room')].find(card => card.querySelector('.room-number').textContent === 'Room 4')?.querySelectorAll('progress')[1].value === hp, damagedHp, { timeout: 3500 });
  const liveDelay = Date.now() - changedAt;
  assert.ok(liveDelay <= 3000, 'live HP update exceeded ~2 seconds: ' + liveDelay);
  assert.ok(requests.length > beforeRequests);
  assert.ok(requests[1].at - requests[0].at >= 1900, 'healthy polling interval is shorter than 2 seconds');
  arena.reset(running, host, {});
  await page.waitForFunction(() => [...document.querySelectorAll('.room-number')].map(n => n.textContent).join(',') === 'Room 3,Room 1,Room 4,Room 2');
  await page.reload(); await connected();
  assert.deepEqual(await labels(), ['Room 3', 'Room 1', 'Room 4', 'Room 2'], 'reload retains creation numbers without credentials');
  for (const request of requests) assert.equal(request.headers.authorization, undefined);

  // Real expiry produces the empty view; the next creation must not reuse a number.
  now += arena.lifetimeMs; game.tick();
  await page.waitForFunction(() => document.querySelector('#room-message').textContent === 'No battles right now');
  assert.equal(await page.locator('.room').count(), 0);
  const newRoom = makeRoom();
  await page.waitForFunction(() => document.querySelector('.room-number')?.textContent === 'Room 5');
  assert.equal(newRoom.phase, 'lobby');
  const dto = await (await page.request.get(origin + '/game/api/admin/overview')).json();

  // A stalled response cannot overlap another poll; next request starts 2s after completion.
  let started = 0, pending = 0, maxPending = 0, firstFinishedAt = 0, nextStartedAt = 0;
  let unblock, signalStart;
  const firstStarted = new Promise(resolve => { signalStart = resolve; });
  await page.route(endpoint, async route => {
    const ordinal = ++started; pending++; maxPending = Math.max(maxPending, pending);
    if (ordinal === 1) {
      signalStart();
      await new Promise(resolve => { unblock = resolve; releasePending = resolve; });
    } else if (ordinal === 2) nextStartedAt = Date.now();
    await route.fulfill(json(dto)); pending--;
    if (ordinal === 1) firstFinishedAt = Date.now();
  });
  await page.reload(); await firstStarted;
  await page.waitForTimeout(2200);
  assert.equal(started, 1, 'polls overlap while previous response is pending');
  unblock(); releasePending = () => {};
  await connected();
  assert.equal(started, 1, 'poll started immediately after response');
  await page.waitForTimeout(2200);
  assert.ok(started >= 2, 'next poll missing after ~2 seconds');
  assert.equal(maxPending, 1, 'overlapping requests');
  assert.ok(nextStartedAt - firstFinishedAt >= 1900, 'poll interval shorter than ~2 seconds');

  await page.unroute(endpoint);
  let throttledAt, retriedAt, count = 0;
  await page.route(endpoint, route => {
    count++;
    if (count === 1) { throttledAt = Date.now(); return route.fulfill({ status: 429, headers: { 'Retry-After': '3' }, body: '' }); }
    retriedAt = Date.now(); return route.fulfill(json(dto));
  });
  await page.reload();
  await page.locator('#connection[data-state="throttled"]').waitFor();
  await page.waitForTimeout(2200);
  assert.equal(count, 1, '429 retried before Retry-After');
  await connected();
  assert.ok(retriedAt - throttledAt >= 2900, '429 Retry-After not respected');
  assert.deepEqual(errors, [], 'browser page errors');
  console.log('PASS admin browser: real anonymous HTTP, stable Room 1–5, all-phase server ordering, names/privacy, 390/1920 fit, live engine HP in ' + liveDelay + 'ms, reload/expiry, 2s non-overlap, 429 Retry-After; screenshots=' + evidence);
  await context.close();
} finally {
  releasePending();
  await browser.close();
  await game.close();
}
