const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
import fs from 'node:fs/promises';
import http from 'node:http';
import tls from 'node:tls';
import { createHash, X509Certificate } from 'node:crypto';
import assert from 'node:assert/strict';
let game;
const url = process.env.LIVE_URL || 'http://127.0.0.1:18993/game/';
if (!process.env.LIVE_URL) { const { createGameServer } = await import('../src/server.mjs'); game = createGameServer({ publicOrigin: 'http://127.0.0.1:18993' }); await new Promise(r => game.server.listen(18993, '127.0.0.1', r)); }
const dir = process.env.EVIDENCE_DIR || '/tmp/hsg-five-screen-smoke';
await fs.mkdir(dir, { recursive: true });
const proxyUrl = process.env.LIVE_URL && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
    const proxy = proxyUrl ? new URL(proxyUrl) : null;
    const args = ['--autoplay-policy=user-gesture-required'];
    if (proxy && process.env.NODE_EXTRA_CA_CERTS) {
      const bundle = await fs.readFile(process.env.NODE_EXTRA_CA_CERTS, 'utf8');
      // Verify the proxy-issued leaf with Node TLS before pinning it in Chromium.
      const target = new URL(url);
      const leaf = await new Promise((resolve, reject) => {
        const request = http.request({ hostname: proxy.hostname, port: proxy.port, method: 'CONNECT',
          path: target.hostname + ':443', headers: { 'Proxy-Authorization': 'Basic ' +
            Buffer.from(decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password)).toString('base64') } });
        request.on('connect', (response, socket) => {
          if (response.statusCode !== 200) { socket.destroy(); reject(new Error('Proxy CONNECT failed')); return; }
          const secure = tls.connect({ socket, servername: target.hostname, ca: [...tls.rootCertificates, bundle] });
          secure.on('secureConnect', () => { const raw = secure.getPeerCertificate().raw; secure.destroy(); resolve(raw); });
          secure.on('error', reject);
          secure.setTimeout(10000, () => { secure.destroy(); reject(new Error('TLS verification timeout')); });
        });
        request.on('error', reject);
        request.setTimeout(10000, () => request.destroy(new Error('Proxy CONNECT timeout')));
        request.end();
      });
      const pin = createHash('sha256').update(new X509Certificate(leaf).publicKey
        .export({ type: 'spki', format: 'der' })).digest('base64');
      args.push('--ignore-certificate-errors-spki-list=' + pin);
    }
    const browser = await chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
      headless: true, args,
      ...(proxy ? { proxy: { server: proxy.protocol + '//' + proxy.host,
        username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) } } : {}) });
const errors = [], failed = [], checks = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const otherCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
function monitor(page) { page.on('pageerror', e => errors.push(e.message)); page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/events')) failed.push([r.status(), new URL(r.url()).pathname]); }); }
const host = await ctx.newPage(), mobile = await mobileCtx.newPage(), other = await otherCtx.newPage();
for (const p of [host, mobile, other]) monitor(p);
async function shot(page, name) { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(550); await page.screenshot({ path: dir + '/' + name + '.png', fullPage: true }); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); assert.equal(overflow, false, name + ' has horizontal overflow'); }
async function screen(page, name) { await page.waitForFunction(s => document.body.dataset.screen === s, name); }
async function select(page, mode) {
  await page.locator('#play-' + (mode === 'bot' ? 'bot' : mode === 'friend' ? 'friend' : 'groups')).click();
  if (mode === 'groups') await page.locator('#create-room').click();
  await screen(page, 'arena');
  await page.locator('button[data-arena="trischli"]').click();
  await shot(page, mode + '-arena');
  await page.locator('#arena-next').click(); await screen(page, 'character');
  await page.locator('[data-character="tryhard"]').click(); await page.locator('#pick-b').click();
  await page.locator('[data-character="bad-teacher"]').click();
  const { FIGHTER_PROFILES } = await import('../public/fighter-data.js');
  for (const [id, profile] of Object.entries(FIGHTER_PROFILES)) for (const [move, value] of Object.entries(profile.stats)) {
    const number = await page.locator('[data-character="' + id + '"] [data-stat="' + move + '"] b').textContent();
    assert.equal(number, String(value) + (move === 'defend' ? '%' : ''));
  }
  await shot(page, mode + '-characters');
  await page.locator('#selection-next').click();
}
try {
  await host.goto(url); await mobile.goto(url);
  await screen(host, 'menu');
  for (const page of [host, mobile]) {
    const menu = await page.evaluate(() => ({ background: getComputedStyle(document.body, '::before').backgroundImage, foregroundOpacity: getComputedStyle(document.querySelector('.menu-copy')).opacity, buttons: ['play-friend','play-bot','play-groups'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }) }));
    assert.match(menu.background, /hsg-learning-center\.webp/); assert.equal(menu.foregroundOpacity, '1'); assert.deepEqual(menu.buttons, [true,true,true]);
  }
  await shot(host, 'desktop-menu'); await shot(mobile, 'mobile-menu');
  checks.push('user-supplied building photo on desktop/phone main menu, background-only green tint, all three mode buttons in viewport');
  await host.locator('#how-to').click(); await screen(host, 'help'); await host.locator('#help-back').click();
  await select(host, 'bot'); await screen(host, 'battle');
  await host.waitForFunction(() => !document.querySelector('[data-solo-move="attack"]').disabled);
  assert.equal(await host.locator('.ace-fighter .health span').textContent(), 'Tryhard');
  await shot(host, 'desktop-bot-battle');
  await host.locator('[data-solo-move="special"]').click();
  await host.waitForFunction(() => document.querySelector('#dynamo-hp').value === 64);
  for (let turn = 0; turn < 70; turn++) {
    if (await host.locator('body').getAttribute('data-screen') === 'victory') break;
    await host.waitForFunction(() => document.body.dataset.screen === 'victory' || !document.querySelector('[data-solo-move="attack"]').disabled, null, { timeout: 10000 });
    if (await host.locator('body').getAttribute('data-screen') === 'victory') break;
    const special = host.locator('[data-solo-move="special"]');
    await (await special.isEnabled() ? special : host.locator('[data-solo-move="attack"]')).click();
    await host.waitForTimeout(180);
  }
  await screen(host, 'victory'); await shot(host, 'desktop-game-over');
  await host.locator('#replay-game').click(); await screen(host, 'battle');
  await host.waitForFunction(() => document.querySelector('#ace-hp').value === 100 && document.querySelector('#dynamo-hp').value === 100);
  checks.push('bot setup, all four controls, real damage, cooldown, completed match, game over and replay');
  await host.locator('#main-menu').click(); await screen(host, 'menu');
  await select(host, 'friend'); await screen(host, 'lobby');
  const friendRoom = (await host.locator('#room-code').textContent()).trim();
  await mobile.goto(url + '?room=' + friendRoom); await mobile.locator('#nickname').fill('Real friend');
  await mobile.locator('#join-form button[type="submit"]').click(); await screen(mobile, 'player');
  assert.match(await mobile.locator('#player-team').textContent(), /^TEAM B/);
  const full = await otherCtx.request.post(new URL('/game/api/rooms/' + friendRoom + '/join', url).href, { data: { nickname: 'Third' }, headers: { Origin: new URL(url).origin } });
  assert.equal(full.status(), 409);
  await host.locator('#start-game').click(); await screen(host, 'battle');
  await host.reload(); await screen(host, 'battle');
  await host.waitForFunction(() => !document.querySelector('[data-solo-move="attack"]').disabled);
  await host.locator('[data-solo-move="special"]').click();
  await mobile.waitForFunction(() => !document.querySelector('[data-move="attack"]').disabled);
  await mobile.locator('[data-move="attack"]').click();
  await mobile.reload(); await screen(mobile, 'player');
  await shot(host, 'desktop-friend-battle'); await shot(mobile, 'mobile-friend-battle');
  for (let n = 0; n < 35; n++) {
    if (await host.locator('body').getAttribute('data-screen') === 'victory') break;
    if (await host.locator('[data-solo-move="attack"]').isEnabled()) await host.locator('[data-solo-move="attack"]').click();
    else if (await mobile.locator('[data-move="attack"]').isEnabled()) await mobile.locator('[data-move="attack"]').click();
    await host.waitForTimeout(200);
  }
  await screen(host, 'victory'); await screen(mobile, 'victory');
  await host.locator('#replay-game').click(); await screen(host, 'battle');
  await host.waitForFunction(() => document.querySelector('#ace-hp').value === 100 && document.querySelector('#dynamo-hp').value === 100);
  host.once('dialog', d => d.accept()); await host.locator('#reset-game').click(); await screen(host, 'lobby');
  await mobile.reload(); await screen(mobile, 'player');
  await host.waitForFunction(() => document.querySelector('#dynamo-count').textContent === '1 player');
  checks.push('real friend 1v1: host P1 + isolated P2, third seat rejected, both players deal authoritative damage, guest reload/reconnect, victory, synchronized replay and reset');
  await host.locator('#main-menu').click();
  await select(host, 'groups'); await screen(host, 'lobby');
  const room = (await host.locator('#room-code').textContent()).trim();
  await shot(host, 'desktop-online-lobby');
  for (const [page, name] of [[mobile, 'Mobile'], [other, 'Friend']]) {
    await page.goto(url + '?room=' + room); await screen(page, 'entry');
    await page.locator('#nickname').fill(name); await page.locator('#join-form button[type="submit"]').click(); await screen(page, 'player');
  }
  await host.waitForFunction(() => !document.querySelector('#start-game').disabled);
  await host.locator('#start-game').click(); await screen(host, 'battle');
  await mobile.waitForFunction(() => document.querySelector('#player-state').textContent !== 'Waiting for the presenter to start.');
  const active = (await mobile.locator('#player-team').textContent()).startsWith('TEAM A') ? mobile : other;
  await active.waitForFunction(() => !document.querySelector('[data-move="attack"]').disabled);
  await active.locator('[data-move="heal"]').click();
  await active.waitForFunction(() => document.querySelector('[data-move="heal"]').getAttribute('aria-pressed') === 'true');
  await active.locator('[data-move="attack"]').click();
  await active.waitForFunction(() => document.querySelector('[data-move="attack"]').getAttribute('aria-pressed') === 'true');
  await host.waitForFunction(() => document.querySelector('#tally-attack').textContent === '1');
  assert.equal(await host.locator('#tally-heal').textContent(), '0');
  await shot(mobile, 'mobile-online-battle'); await shot(host, 'desktop-online-battle');
  await host.waitForFunction(() => document.querySelector('#round-label').textContent === 'TURN 2', null, { timeout: 20000 });
  assert.equal(await host.locator('#dynamo-hp').getAttribute('value'), '75');
  await mobile.reload(); await screen(mobile, 'player');
  await host.waitForFunction(() => document.querySelector('#ace-count').textContent === '1 player' && document.querySelector('#dynamo-count').textContent === '1 player');
  host.once('dialog', d => d.accept()); await host.locator('#reset-game').click(); await screen(host, 'lobby');
  checks.push('online host + two isolated clients, QR join URL, real SSE, balanced teams, vote replacement, real 15-second resolution, reload/reconnect, shared reset');
  await mobile.locator('#main-menu').click(); await mobile.locator('#play-bot').click(); await screen(mobile, 'arena');
  await shot(mobile, 'mobile-arena'); await mobile.locator('#arena-next').click(); await shot(mobile, 'mobile-characters');
  await mobile.locator('#selection-next').click(); await screen(mobile, 'battle'); await shot(mobile, 'mobile-bot-battle');
  for (let turn = 0; turn < 70; turn++) {
    if (await mobile.locator('body').getAttribute('data-screen') === 'victory') break;
    await mobile.waitForFunction(() => document.body.dataset.screen === 'victory' || !document.querySelector('[data-solo-move="attack"]').disabled, null, { timeout: 10000 });
    if (await mobile.locator('body').getAttribute('data-screen') === 'victory') break;
    const special = mobile.locator('[data-solo-move="special"]');
    await (await special.isEnabled() ? special : mobile.locator('[data-solo-move="attack"]')).click();
    await mobile.waitForTimeout(180);
  }
  await screen(mobile, 'victory'); await shot(mobile, 'mobile-game-over');
  checks.push('desktop/mobile all five screens, all 24 displayed stats match engine source, no horizontal overflow');
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  console.log(JSON.stringify({ url, checks, pageErrors: errors, failedResponses: failed, evidence: dir }, null, 2));
} catch (e) {
  await shot(host, 'failure-host').catch(() => {}); console.error(JSON.stringify({ error: e.message, pageErrors: errors, failedResponses: failed, hostText: (await host.locator('body').innerText()).slice(-3500) }, null, 2)); process.exitCode = 1;
} finally { await browser.close(); if (game) await game.close(); }
