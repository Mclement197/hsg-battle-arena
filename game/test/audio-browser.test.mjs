// Optional native-browser integration: no browser dependency added to the game.
// Run with PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/path/to/chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import tls from 'node:tls';
import { readFile } from 'node:fs/promises';
import { X509Certificate, createHash } from 'node:crypto';
import { Arena } from '../src/engine.mjs';
import { createGameServer } from '../src/server.mjs';

const enabled = !!(process.env.PLAYWRIGHT_MODULE && process.env.CHROMIUM_EXECUTABLE);

// Observe the real native graph without replacing buffers, playback, fetch or SSE.
function observeAudio() {
  const NativeAudio = window.AudioContext;
  window.audioProbe = { contexts: [], starts: [], decoded: 0, peak: 0, resumes: [] };
  window.AudioContext = class extends NativeAudio {
    constructor(...args) {
      super(...args);
      const probe = window.audioProbe;
      probe.contexts.push(this);
      const analyser = this.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(this.destination);
      const samples = new Float32Array(analyser.fftSize);
      const sample = () => {
        analyser.getFloatTimeDomainData(samples);
        for (const value of samples) probe.peak = Math.max(probe.peak, Math.abs(value));
        requestAnimationFrame(sample);
      };
      sample();
      const createGain = this.createGain.bind(this);
      this.createGain = () => {
        const gain = createGain();
        const connect = gain.connect.bind(gain);
        gain.connect = (target, ...rest) => connect(target === this.destination ? analyser : target, ...rest);
        return gain;
      };
      const createSource = this.createBufferSource.bind(this);
      this.createBufferSource = () => {
        const source = createSource();
        const start = source.start.bind(source);
        source.start = (...params) => {
          probe.starts.push({ duration: source.buffer.duration, state: this.state });
          return start(...params);
        };
        return source;
      };
      const decode = this.decodeAudioData.bind(this);
      this.decodeAudioData = async bytes => { const buffer = await decode(bytes); probe.decoded++; return buffer; };
      const resume = this.resume.bind(this);
      this.resume = () => {
        probe.resumes.push(navigator.userActivation.isActive);
        if (probe.blockResume) return Promise.reject(new Error('autoplay blocked'));
        return resume();
      };
    }
  };
}

for (const mobile of [false, true]) {
  test('native UI audio on host and ' + (mobile ? 'touch phone/tablet' : 'desktop players'),
    { skip: !enabled, timeout: 30000 }, async t => {
      const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE);
      const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
        headless: true, args: ['--autoplay-policy=user-gesture-required'] });
      let clock = Date.now();
      const arena = new Arena({ now: () => clock, pick: () => 0 });
      const reservation = http.createServer();
      await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
      const port = reservation.address().port;
      await new Promise(resolve => reservation.close(resolve));
      const origin = 'http://127.0.0.1:' + port;
      const game = createGameServer({ arena, autoTick: false, publicOrigin: origin });
      await new Promise(resolve => game.server.listen(port, '127.0.0.1', resolve));
      t.after(async () => { await browser.close(); await game.close(); });
      const errors = [];
      async function page(options = {}) {
        const context = await browser.newContext(options);
        await context.addInitScript(observeAudio);
        const page = await context.newPage();
        context.setDefaultTimeout(5000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto(origin + '/game/');
        return page;
      }
      const host = await page();
      await host.locator('#play-groups').click();
      await host.locator('#create-room').click();
      await host.locator('#arena-next').click();
      await host.locator('#selection-next').click();
      await host.waitForFunction(() => document.body.dataset.screen === 'lobby');
      const roomId = await host.locator('#room-code').textContent();
      const players = [];
      for (const [i, device] of (mobile ? ['iPhone 13', 'iPad (gen 7)'] : [null, null]).entries()) {
        const player = await page(device ? devices[device] : {});
        await player.locator('#join-existing').click();
        await player.locator('#join-code').fill(roomId);
        await player.locator('#nickname').fill('Audio test ' + i);
        await player.locator('#join-form button').click();
        await player.waitForFunction(() => document.body.dataset.screen === 'player');
        players.push(player);
      }
      const pages = [host, ...players];
      const room = arena.rooms.get(roomId);
      const advance = async () => {
        clock = room.turn.deadline;
        game.tick();
        await Promise.all(pages.map(page => page.waitForFunction(n =>
          document.querySelector('#round-label').textContent === 'TURN ' + n, room.turn.number)));
      };
      // Ordinary create/join/start/vote flow is silent until THIS device enables sound.
      await host.locator('#start-game').click();
      await players[0].waitForFunction(() => !document.querySelector('[data-move="attack"]').disabled);
      await players[0].locator('[data-move="attack"]').click();
      await advance();
      for (const page of pages) {
        assert.equal(await page.evaluate(() => audioProbe.contexts.length), 0);
        assert.equal(await page.evaluate(() => audioProbe.peak), 0);
      }
      // Delay actual WAV requests, never replace their bytes or native decoder.
      let releaseAssets;
      const assetsReady = new Promise(resolve => { releaseAssets = resolve; });
      await host.route('**/*.wav', async route => { await assetsReady; await route.continue(); });
      for (const page of pages) {
        assert.equal(await page.locator('#mute').textContent(), 'Enable sound',
          'fresh host/player must offer an explicit gesture to fix default silence');
        assert.equal(await page.locator('#mute').isVisible(), true);
        const box = await page.locator('#mute').boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= page.viewportSize().width,
          'sound control must fit on phone/tablet as well as desktop');
        assert.equal(await page.evaluate(() => audioProbe.starts.length), 0);
        await (mobile && page !== host ? page.locator('#mute').tap() : page.locator('#mute').click());
        if (page === host) {
          await page.waitForFunction(() => document.querySelector('#mute').textContent === 'Loading sound…');
          assert.equal(await page.locator('#mute').getAttribute('aria-pressed'), 'true', 'not enabled before decoding');
          assert.equal(await page.evaluate(() => audioProbe.contexts[0].state), 'running', 'resume precedes asset loading');
          await page.locator('#mute').click(); // Mute while requests/decode are pending.
          releaseAssets();
          await page.waitForFunction(() => audioProbe.decoded === 4);
          assert.equal(await page.locator('#mute').textContent(), 'Enable sound', 'late load completion respects mute');
          await page.locator('#mute').click();
        }
        await page.waitForFunction(() => document.querySelector('#mute').textContent === 'Mute sound');
        assert.equal(await page.evaluate(() => audioProbe.decoded), 4, 'all native WAV decodes finished');
        assert.equal(await page.evaluate(() => audioProbe.contexts[0].state), 'running');
        assert.ok(await page.evaluate(() => audioProbe.resumes.every(Boolean)), 'resume invoked inside the user gesture');
      }
      await players[1].waitForFunction(() => !document.querySelector('[data-move="attack"]').disabled);
      await players[1].locator('[data-move="attack"]').click();
      for (const page of pages) assert.equal(await page.evaluate(() => audioProbe.starts.length), 0, 'vote stays silent');
      await Promise.all(pages.map(page => page.evaluate(() => { audioProbe.peak = 0; })));
      await advance();
      for (const page of pages) {
        await page.waitForFunction(() => audioProbe.starts.length === 1 && audioProbe.peak > .01);
        assert.equal(await page.evaluate(() => audioProbe.starts[0].state), 'running');
        console.log((page === host ? 'host' : mobile ? 'touch player' : 'desktop player') +
          ' native graph peak=' + await page.evaluate(() => audioProbe.peak));
      }
      // Repeat the same authoritative snapshot over the actual SSE parser/handler.
      for (const stream of room.streams) stream.res.write('event: state\ndata: ' +
        JSON.stringify(arena.snapshot(room, stream.viewer)) + '\n\n');
      await host.waitForTimeout(150);
      for (const page of pages) assert.equal(await page.evaluate(() => audioProbe.starts.length), 1);
      for (const page of pages) await page.locator('#mute').click();
      await advance();
      for (const page of pages) assert.equal(await page.evaluate(() => audioProbe.starts.length), 1, 'mute suppresses new actions');
      const resumeCounts = new Map();
      for (const page of pages) {
        await page.locator('#mute').click();
        await page.waitForFunction(() => document.querySelector('#mute').textContent === 'Mute sound');
        assert.equal(await page.evaluate(() => audioProbe.starts.length), 1, 'unmute does not replay');
        // Reproduce OS/background suspension: never claim enabled and never resume from SSE.
        await page.evaluate(async () => { await audioProbe.contexts[0].suspend(); });
        await page.waitForFunction(() => document.querySelector('#mute').textContent === 'Enable sound');
        assert.equal(await page.locator('#mute').getAttribute('aria-pressed'), 'true');
        resumeCounts.set(page, await page.evaluate(() => audioProbe.resumes.length));
      }
      await advance();
      for (const page of pages) {
        const resumes = resumeCounts.get(page);
        assert.equal(await page.evaluate(() => audioProbe.starts.length), 1, 'suspended resolution is consumed, never queued');
        assert.equal(await page.evaluate(() => audioProbe.resumes.length), resumes, 'SSE does not attempt autoplay resume');
        await page.evaluate(() => { audioProbe.blockResume = true; });
        await page.locator('#mute').click();
        assert.equal(await page.locator('#mute').textContent(), 'Enable sound', 'failed resume is not sound enabled');
        assert.equal(await page.evaluate(() => audioProbe.contexts[0].state), 'suspended');
        await page.evaluate(() => { audioProbe.blockResume = false; });
        await page.locator('#mute').click();
        await page.waitForFunction(() => document.querySelector('#mute').textContent === 'Mute sound');
        assert.equal(await page.evaluate(() => audioProbe.resumes.length), resumes + 2);
      }
      // Verify recovery with new authoritative actions, not a mocked call to cue().
      for (const [i, move] of ['heal', 'special', 'defend'].entries()) {
        const voter = players[room.turn.team === 'A' ? 0 : 1];
        await voter.waitForFunction(move => !document.querySelector('[data-move="' + move + '"]').disabled, move);
        await voter.locator('[data-move="' + move + '"]').click();
        await Promise.all(pages.map(page => page.evaluate(() => { audioProbe.peak = 0; })));
        await advance();
        for (const page of pages) await page.waitForFunction(count =>
          audioProbe.starts.length === count && audioProbe.peak > .01, i + 2);
      }
      assert.deepEqual(errors, [], 'no browser console exceptions');
    });
}


// Never creates/joins/mutates a live room. Opt in explicitly for deployment verification.
test('live read-only frontend decodes WAVs and enables native audio on desktop/phone/tablet',
  { skip: !enabled || !process.env.AUDIO_LIVE_URL, timeout: 45000 }, async t => {
    const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE);
    // Honor the runner's authenticated outbound proxy; never print its credentials.
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    const proxy = proxyUrl ? new URL(proxyUrl) : null;
    const args = ['--autoplay-policy=user-gesture-required'];
    if (proxy && process.env.NODE_EXTRA_CA_CERTS) {
      const bundle = await readFile(process.env.NODE_EXTRA_CA_CERTS, 'utf8');
      // Verify the proxy-issued leaf with Node TLS before pinning it in Chromium.
      const target = new URL(process.env.AUDIO_LIVE_URL);
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
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
      headless: true, args,
      ...(proxy ? { proxy: { server: proxy.protocol + '//' + proxy.host,
        username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) } } : {}) });
    t.after(() => browser.close());
    for (const device of [null, 'iPhone 13', 'iPad (gen 7)']) {
      const context = await browser.newContext(device ? devices[device] : {});
      await context.addInitScript(observeAudio);
      context.setDefaultTimeout(10000);
      const page = await context.newPage();
      const assets = [], errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('response', response => {
        if (response.url().endsWith('.wav')) assets.push(response.status());
      });
      await page.goto(process.env.AUDIO_LIVE_URL);
      assert.equal(await page.locator('#mute').textContent(), 'Enable sound');
      assert.equal(await page.locator('#mute').isVisible(), true);
      await (device ? page.locator('#mute').tap() : page.locator('#mute').click());
      await page.waitForFunction(() => document.querySelector('#mute').textContent === 'Mute sound' && audioProbe.peak > .01);
      assert.equal(await page.evaluate(() => audioProbe.contexts[0].state), 'running');
      assert.equal(await page.evaluate(() => audioProbe.decoded), 4);
      assert.ok(await page.evaluate(() => audioProbe.resumes.every(Boolean)));
      assert.deepEqual(assets, [200, 200, 200, 200]);
      assert.deepEqual(errors, []);
      console.log('LIVE ' + (device || 'desktop') + ': 4 WAVs=200, decoded=4, state=running, graph peak=' +
        await page.evaluate(() => audioProbe.peak));
      await context.close();
    }
  });
