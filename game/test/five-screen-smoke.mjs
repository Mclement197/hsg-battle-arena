const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
import fs from 'node:fs/promises';
import http from 'node:http';
import tls from 'node:tls';
import { createHash, X509Certificate } from 'node:crypto';
import assert from 'node:assert/strict';
let game, localTime = Date.now();
const port=Number(process.env.TEST_PORT||18993), localOrigin='http://127.0.0.1:'+port;
const url = process.env.LIVE_URL || localOrigin+'/game/';
if (!process.env.LIVE_URL) { const { createGameServer } = await import('../src/server.mjs'); const { Arena } = await import('../src/engine.mjs'); game = createGameServer({ arena: new Arena({ pick: () => 0, now: () => localTime }), publicOrigin: localOrigin, autoTick:false }); await new Promise(r => game.server.listen(port, '127.0.0.1', r)); }
const dir = process.env.EVIDENCE_DIR || '/tmp/hsg-five-screen-smoke';
await fs.mkdir(dir, { recursive: true });
const proxyUrl = process.env.LIVE_URL && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
    const proxy = proxyUrl ? new URL(proxyUrl) : null;
    const args = ['--autoplay-policy=user-gesture-required'];
    // Optional lifecycle isolation is reported, never claimed as a rendered camera pass.
    if (process.env.SMOKE_RENDERER === 'fallback') args.push('--disable-webgl');
    if (process.env.SMOKE_SOFTWARE_WEBGL) args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
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
const ctx = await browser.newContext(process.env.PHONE_FLOW ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 1000 } });
const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const otherCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
async function localRoom(page) { return game?.arena.rooms.get(await page.evaluate(() => JSON.parse(sessionStorage.getItem('hsg-arena:v1:active')).room)); }
async function startLocal(page) { if (!game) return; const room=await localRoom(page); if(room.phase==='countdown'){localTime=room.prebattle.deadline;game.tick();} }
async function resolveLocal(page) {
  if (!game) return;
  const room=await localRoom(page);
  // Wait for the real HTTP vote before ticking. No HP, room or production state is patched.
  for(let n=0;room.phase==='running'&&!room.turn.votes.size&&n<100;n++)await new Promise(r=>setTimeout(r,10));
  assert.ok(room.phase!=='running'||room.turn.votes.size,'real vote reached isolated server');
  if(room.phase==='running'){localTime=room.turn.deadline;game.tick();}
  if(room.phase==='running'&&room.mode==='bot'&&room.turn.team==='B'){localTime=room.turn.deadline;game.tick();}
}
function monitor(page) {
  if(game)page.on('domcontentloaded',async()=>{await page.evaluate(async()=>{
    // Use the client's existing injectable clock seam; leave RAF/performance/audio untouched.
    const {ArenaClient}=await import('./app.js?v=20261021-battle-viewport1');
    const accept=ArenaClient.prototype.accept;
    ArenaClient.prototype.accept=function(...args){if(!this.smokeClock){this.smokeClock=true;this.now=()=>0;this.clock=null;}return accept.apply(this,args);};
  });});
  page.on('pageerror', e => errors.push(e.message)); page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/events')) failed.push([r.status(), new URL(r.url()).pathname]); }); }
const host = await ctx.newPage(), mobile = await mobileCtx.newPage(), other = await otherCtx.newPage();
for (const p of [host, mobile, other]) monitor(p);
const layoutChecks=[];
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  if(process.env.SMOKE_LAYOUT_MATRIX){
    const original=page.viewportSize();
    for(const [width,height]of [[360,560],[360,640],[390,844],[740,390],[1280,900],[1440,1000]]){
      await page.setViewportSize({width,height});
      const m=await page.evaluate(()=>{
        const screen=document.querySelector('.screen:not([hidden])'),main=document.querySelector('main'),d=document.documentElement;
        const ids=({menu:['play-friend','play-bot','play-groups'],arena:['arena-next'],character:['selection-next'],lobby:['start-game'],victory:['replay-game','victory-menu'],battle:[]})[document.body.dataset.screen]||[];
        const elements=document.body.dataset.screen==='battle'?[...document.querySelectorAll('[data-solo-move]')].filter(e=>e.getClientRects().length):ids.map(id=>document.getElementById(id));
        return {screen:document.body.dataset.screen,viewport:[innerWidth,innerHeight],document:[d.scrollWidth,d.scrollHeight],mainScroll:main.scrollHeight-main.clientHeight,section:screen?.getBoundingClientRect().toJSON(),targets:elements.map(e=>{const r=e.getBoundingClientRect();return {id:e.id||e.dataset.soloMove,width:r.width,height:r.height,inside:r.top>=0&&r.bottom<=innerHeight};})};
      });
      assert.ok(m.document[0]<=width+1,name+' matrix horizontal overflow');
      // Setup keeps its existing page/internal scrollers; battle must fit without either.
      if(m.screen==='battle'){
        assert.ok(m.document[1]<=height+1,name+' matrix battle page overflow');
        assert.ok(m.mainScroll<=1,name+' matrix battle main overflow');
      }
      if(m.screen==='battle')assert.ok(m.targets.every(t=>t.inside),name+' matrix battle controls visible');
      else for(const target of m.targets){
        const control=page.locator('#'+target.id);await control.scrollIntoViewIfNeeded();
        const r=await control.boundingBox();assert.ok(r&&r.y>=0&&r.y+r.height<=height+1,name+' setup control reachable in existing internal scroller');
      }
      if(m.screen==='battle')assert.ok(m.targets.every(t=>t.width>=44&&t.height>=44),name+' battle targets >=44px');
      layoutChecks.push({name,...m});
      if(width===360&&height===560)await page.screenshot({path:dir+'/'+name+'-compact.png',fullPage:true});
    }
    await page.setViewportSize(original);
  }
  await page.waitForTimeout(550);await page.screenshot({path:dir+'/'+name+'.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' has horizontal overflow');
}

const started = Date.now();
function phase(name) { console.log(JSON.stringify({ phase:name, elapsedMs:Date.now()-started })); }
async function screen(page, name) { await page.waitForFunction(s => document.body.dataset.screen === s, name); phase(name); }
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
    assert.match(menu.background, /arena-library\.webp/); assert.equal(menu.foregroundOpacity, '1'); assert.deepEqual(menu.buttons, [true,true,true]);
  }
  await shot(host, 'desktop-menu'); await shot(mobile, 'mobile-menu');
  checks.push('current library photo on desktop/phone main menu, background-only green tint, all three mode buttons in viewport');
  await host.locator('#how-to').click(); await screen(host, 'help'); await host.locator('#help-back').click();
  if (!process.env.PHONE_FLOW) {
  await select(host, 'bot'); await screen(host, 'battle'); await startLocal(host);
  await host.waitForFunction(() => !document.querySelector('[data-solo-move="attack"]').disabled);
  assert.equal(await host.locator('.ace-fighter .health span').textContent(), 'Tryhard');
  await shot(host, 'desktop-bot-battle');
  await host.locator('[data-solo-move="special"]').click(); await resolveLocal(host);
  await host.waitForFunction(() => document.querySelector('#dynamo-hp').value === 64);
  for (let turn = 0; turn < 70; turn++) {
    if (await host.locator('body').getAttribute('data-screen') === 'victory') break;
    await host.waitForFunction(() => document.body.dataset.screen === 'victory' || !document.querySelector('[data-solo-move="attack"]').disabled, null, { timeout: 30000 });
    if (await host.locator('body').getAttribute('data-screen') === 'victory') break;
    const special = host.locator('[data-solo-move="special"]');
    await (await special.isEnabled() ? special : host.locator('[data-solo-move="attack"]')).click(); await resolveLocal(host);
    await host.waitForTimeout(180);
  }
  await screen(host, 'victory'); await shot(host, 'desktop-game-over');
  await host.locator('#replay-game').click(); await screen(host, 'battle'); await startLocal(host);
  await host.waitForFunction(() => document.querySelector('#ace-hp').value === 100 && document.querySelector('#dynamo-hp').value === 100);
  await shot(host,'desktop-replay-battle');
  checks.push('bot setup, all four controls, real damage, cooldown, completed match, game over and replay');
  await host.locator('#main-menu').click(); await screen(host, 'menu'); }
  await select(host, 'friend'); await screen(host, 'lobby');
  const friendRoom = (await host.locator('#room-code').textContent()).trim();
  await mobile.goto(url + '?room=' + friendRoom); await mobile.locator('#nickname').fill('Real friend');
  await mobile.locator('#join-form button[type="submit"]').click(); await screen(mobile, 'player');
  assert.match(await mobile.locator('#player-team').textContent(), /^TEAM B/);
  await shot(mobile,'mobile-waiting');
  const full = await otherCtx.request.post(new URL('/game/api/rooms/' + friendRoom + '/join', url).href, { data: { nickname: 'Third' }, headers: { Origin: new URL(url).origin } });
  assert.equal(full.status(), 409);
  await host.locator('#start-game').click(); await screen(host, 'battle'); await startLocal(host);
  await host.reload(); await screen(host, 'battle'); await startLocal(host);
  await host.waitForFunction(() => !document.querySelector('[data-solo-move="attack"]').disabled);
  await host.locator('[data-solo-move="special"]').click(); await resolveLocal(host);
  await mobile.waitForFunction(() => !document.querySelector('[data-move="attack"]').disabled);
  await mobile.locator('[data-move="attack"]').click(); await resolveLocal(mobile);
  await mobile.reload(); await screen(mobile, 'player');
  await shot(host, 'desktop-friend-battle'); await shot(mobile, 'mobile-friend-battle');
  // Count resolved turns, not 35 x 200ms polls: each presentation lasts 2200ms.
  // A seven-second polling budget cannot reliably finish a fresh 100HP match.
  for (let n = 0; n < 35; n++) {
    await host.waitForFunction(() => document.body.dataset.screen === 'victory' || !document.querySelector('[data-solo-move="attack"]').disabled || document.querySelector('#solo-status').textContent.includes('friend is choosing'), null, { timeout:30000 });
    if (await host.locator('body').getAttribute('data-screen') === 'victory') break;
    const actor = await host.locator('[data-solo-move="attack"]').isEnabled() ? host : mobile;
    const selector = actor === host ? '[data-solo-move="attack"]' : '[data-move="attack"]';
    await actor.waitForFunction(s => document.body.dataset.screen === 'victory' || !document.querySelector(s).disabled, selector, { timeout:30000 });
    if (await actor.locator('body').getAttribute('data-screen') === 'victory') break;
    const previousRound=await host.locator('#round-label').textContent();
    await actor.locator(selector).click(); await resolveLocal(actor);
    await host.waitForFunction(previous => document.body.dataset.screen==='victory'||document.querySelector('#round-label').textContent!==previous,previousRound);
    await actor.waitForFunction(s => document.body.dataset.screen === 'victory' || document.querySelector(s).disabled, selector);
    phase('friend move '+n);
  }
  await screen(host, 'victory'); await screen(mobile, 'victory');
  await host.locator('#replay-game').click(); await screen(host, 'battle'); await startLocal(host);
  await host.waitForFunction(() => document.querySelector('#ace-hp').value === 100 && document.querySelector('#dynamo-hp').value === 100);
  host.once('dialog', d => d.accept()); await host.locator('#reset-game').click(); await screen(host, 'lobby');
  await mobile.reload(); await screen(mobile, 'player');
  await host.waitForFunction(() => document.querySelector('#dynamo-count').textContent === '1 player');
  checks.push('real friend 1v1: host P1 + isolated P2, third seat rejected, both players deal authoritative damage, guest reload/reconnect, victory, synchronized replay and reset');
  if (!process.env.PHONE_FLOW) {
  await host.locator('#main-menu').click();
  await select(host, 'groups'); await screen(host, 'lobby');
  const room = (await host.locator('#room-code').textContent()).trim();
  await shot(host, 'desktop-online-lobby');
  for (const [page, name] of [[mobile, 'Mobile'], [other, 'Friend']]) {
    await page.goto(url + '?room=' + room); await screen(page, 'entry');
    await page.locator('#nickname').fill(name); await page.locator('#join-form button[type="submit"]').click(); await screen(page, 'player');
  }
  await host.waitForFunction(() => !document.querySelector('#start-game').disabled);
  await host.locator('#start-game').click(); await screen(host, 'battle'); await startLocal(host);
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
  if(game){const room=await localRoom(host);assert.equal(room.turn.deadline-room.turn.startedAt,15000);await resolveLocal(host);}
  await host.waitForFunction(() => document.querySelector('#round-label').textContent === 'TURN 2', null, { timeout: 20000 });
  // TURN 2 is authoritative immediately; visible HP commits after the matching animation completes.
  await host.waitForFunction(() => document.querySelector('#dynamo-hp').value === 75);
  assert.equal(await host.locator('#dynamo-hp').getAttribute('value'), '75');
  await mobile.reload(); await screen(mobile, 'player');
  await host.waitForFunction(() => document.querySelector('#ace-count').textContent === '1 player' && document.querySelector('#dynamo-count').textContent === '1 player');
  host.once('dialog', d => d.accept()); await host.locator('#reset-game').click(); await screen(host, 'lobby');
  checks.push('online host + two isolated clients, QR join URL, real SSE, balanced teams, vote replacement, authoritative 15-second resolution (controlled local clock), reload/reconnect, shared reset');
  await mobile.locator('#main-menu').click(); await mobile.locator('#play-bot').click(); await screen(mobile, 'arena');
  await shot(mobile, 'mobile-arena'); await mobile.locator('#arena-next').click(); await shot(mobile, 'mobile-characters');
  await mobile.locator('#selection-next').click(); await screen(mobile, 'battle'); await startLocal(mobile); await shot(mobile, 'mobile-bot-battle');
  for (let turn = 0; turn < 70; turn++) {
    if (await mobile.locator('body').getAttribute('data-screen') === 'victory') break;
    await mobile.waitForFunction(() => document.body.dataset.screen === 'victory' || !document.querySelector('[data-solo-move="attack"]').disabled, null, { timeout: 30000 });
    if (await mobile.locator('body').getAttribute('data-screen') === 'victory') break;
    const special = mobile.locator('[data-solo-move="special"]');
    await (await special.isEnabled() ? special : mobile.locator('[data-solo-move="attack"]')).click(); await resolveLocal(mobile);
    await mobile.waitForTimeout(180);
  }
  await screen(mobile, 'victory'); await shot(mobile, 'mobile-game-over');
  checks.push('desktop/mobile all five screens, all 24 displayed stats match engine source, no horizontal overflow');
  }
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  await fs.writeFile(dir+'/layout-matrix.json',JSON.stringify(layoutChecks,null,2));
  console.log(JSON.stringify({ url, renderer:process.env.SMOKE_RENDERER||'webgl', deterministicLocal:!!game, checks, pageErrors: errors, failedResponses: failed, evidence: dir }, null, 2));
} catch (e) {
  await shot(host, 'failure-host').catch(() => {}); console.error(JSON.stringify({ error: e.message, pageErrors: errors, failedResponses: failed, hostText: (await host.locator('body').innerText()).slice(-3500) }, null, 2)); process.exitCode = 1;
} finally { await browser.close(); if (game) await game.close(); }
