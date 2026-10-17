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
      probe.tones = [];
      const createOscillator = this.createOscillator.bind(this);
      this.createOscillator = () => { const tone = createOscillator(); const start = tone.start.bind(tone); tone.start = (...args) => { probe.tones.push(1); return start(...args); }; return tone; };
      probe.gains ||= [];
      const createGain = this.createGain.bind(this);
      this.createGain = () => {
        const gain = createGain(); probe.gains.push(gain);
        const set = gain.gain.setValueAtTime.bind(gain.gain);
        gain.gain.setValueAtTime = (value, ...rest) => { gain.requestedValue = value; return set(value, ...rest); };
        const connect = gain.connect.bind(gain);
        gain.connect = (target, ...rest) => { gain.probeTarget = target; return connect(target === this.destination ? analyser : target, ...rest); };
        return gain;
      };
      const createSource = this.createBufferSource.bind(this);
      this.createBufferSource = () => {
        const source = createSource();
        const connect = source.connect.bind(source);
        source.connect = gain => { source.probeGain = gain; return connect(gain); };
        const start = source.start.bind(source);
        source.start = (...params) => {
          const activeLoops = probe.starts.filter(s => s.loop && !s.stopped).length;
          probe.starts.push({ activeLoops, duration: source.buffer.duration, loop: source.loop, state: this.state, when: params[0] ?? this.currentTime, at: this.currentTime, offset: params[1] || 0, stopped: false, sourceGain: source.probeGain?.requestedValue, musicBus: source.probeGain?.probeTarget === probe.gains[0], sfxBus: source.probeGain?.probeTarget === probe.gains[1], loopStart: source.loopStart, loopEnd: source.loopEnd });
          const record = probe.starts.at(-1);
          source.addEventListener('ended', () => { record.ended = true; });
          const stop = source.stop.bind(source);
          source.stop = (...args) => { record.stopped = true; return stop(...args); };
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

test('fresh sound preference is ON before any gesture', { skip: !enabled, timeout: 15000 }, async t => {
  const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
    headless: true, args: ['--autoplay-policy=document-user-activation-required'] });
  const game = createGameServer({ autoTick: false });
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await browser.close(); await game.close(); });
  const context = await browser.newContext();
  await context.addInitScript(observeAudio);
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:' + game.server.address().port + '/game/');
  const cdp = await context.newCDPSession(page);
  const untouched = await cdp.send('Runtime.evaluate', {
    expression: "({ activated: navigator.userActivation.hasBeenActive, state: audioProbe.contexts[0].state, starts: audioProbe.starts.length, label: document.querySelector('#mute').textContent, pressed: document.querySelector('#mute').getAttribute('aria-pressed') })",
    returnByValue: true, userGesture: false
  });
  assert.deepEqual(untouched.result.value, { activated: false, state: 'suspended', starts: 0, label: 'sound is on', pressed: 'false' });
  await cdp.detach();
  assert.equal(await page.locator('#mute').textContent(), 'sound is on');
  assert.equal(await page.locator('#mute').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.getByRole('button', { name: 'sound is on', exact: true }).count(), 1);
  assert.equal(await page.locator('#mute').getAttribute('aria-describedby'), 'sound-hint');
  assert.match(await page.locator('#sound-hint').textContent(), /Waiting.*click.*tap/i);

  await page.screenshot({ path: '/tmp/hsg-sound-default-before-gesture.png' });
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const markup = await noScript.newPage();
  await markup.goto(page.url());
  assert.equal(await markup.getByRole('button', { name: 'sound is on', exact: true }).count(), 1);
  assert.equal(await markup.locator('#mute').getAttribute('aria-pressed'), 'false');
  await noScript.close();
  // Each document has no earlier gesture: the first toggle must mute, not unlock.
  for (const input of ['click', 'touch', 'Enter', 'Space']) {
    const fresh = await browser.newContext(input === 'touch' ? devices['iPhone 13'] : {});
    await fresh.addInitScript(observeAudio);
    const tab = await fresh.newPage();
    await tab.goto(page.url());
    const passive = await fresh.newCDPSession(tab);
    const initial = await passive.send('Runtime.evaluate', {
      expression: '({ resumes: audioProbe.resumes.length, activated: navigator.userActivation.hasBeenActive })',
      returnByValue: true, userGesture: false
    });
    assert.equal(initial.result.value.activated, false);
    const resumes = initial.result.value.resumes;
    await passive.detach();
    if (input === 'touch') await tab.locator('#mute').tap();
    else if (input === 'click') await tab.locator('#mute').click();
    else { await tab.locator('#mute').focus(); await tab.keyboard.press(input); }
    assert.equal(await tab.getByRole('button', { name: 'sound is off', exact: true }).count(), 1);
    assert.equal(await tab.locator('#mute').getAttribute('aria-pressed'), 'true');
    assert.equal(await tab.evaluate(() => audioProbe.resumes.length), resumes, input + ': mute never resumes');
    assert.equal(await tab.evaluate(() => audioProbe.contexts[0].state), 'suspended');
    await (input === 'touch' ? tab.locator('#how-to').tap() : tab.locator('#how-to').click());
    await tab.waitForFunction(() => audioProbe.decoded === 9);
    assert.equal(await tab.locator('#mute').textContent(), 'sound is off');
    assert.equal(await tab.evaluate(() => audioProbe.resumes.length), resumes);
    assert.equal(await tab.evaluate(() => audioProbe.starts.length), 0);
    await tab.locator('#mute').click();
    await tab.waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'ready');
    assert.equal(await tab.locator('#mute').getAttribute('aria-pressed'), 'false');
    assert.ok(await tab.evaluate(() => audioProbe.resumes.at(-1)));
    await fresh.close();
  }
  const unsupported = await browser.newContext();
  await unsupported.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
  const unavailable = await unsupported.newPage();
  await unavailable.goto(page.url());
  assert.equal(await unavailable.locator('#mute').textContent(), 'sound is on');
  assert.match(await unavailable.locator('#sound-hint').textContent(), /unavailable/i);
  await unavailable.locator('#mute').click();
  assert.equal(await unavailable.locator('#mute').textContent(), 'sound is off');
  await unsupported.close();
});

for (const mobile of [false, true]) {
  test('native UI audio on host and ' + (mobile ? 'touch phone/tablet' : 'desktop players'),
    { skip: !enabled, timeout: 60000 }, async t => {
      const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE);
      const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
        headless: true, args: ['--autoplay-policy=document-user-activation-required'] });
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
      async function page(options = {}, failDecode = false) {
        // Audio graph isolation: full skeletal playback has its own native-browser suite.
        const context = await browser.newContext({ ...options, reducedMotion: 'reduce' });
        await context.addInitScript(observeAudio);
        const page = await context.newPage();
        context.setDefaultTimeout(10000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        if (failDecode) await page.route('**/countdown.wav', route => route.fulfill({ status: 200, contentType: 'audio/wav', body: 'not a WAV' }));
        await page.goto(origin + '/game/');
        return page;
      }
      // A failed native asset decode must never advertise sound readiness.
      const failedAudio = await page({}, true);
      await failedAudio.locator('#how-to').click();
      await failedAudio.waitForFunction(() => audioProbe.decoded === 8);
      await failedAudio.waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'error');
      assert.equal(await failedAudio.locator('#mute').textContent(), 'sound is on');
      assert.match(await failedAudio.locator('#sound-hint').textContent(), /could not load/);
      await failedAudio.context().close();
      // Hold real requests: normal keyboard activation resumes before loading, and mute wins.
      let releaseAssets;
      const assetsReady = new Promise(resolve => { releaseAssets = resolve; });
      const keyboardContext = await browser.newContext();
      await keyboardContext.addInitScript(observeAudio);
      const keyboard = await keyboardContext.newPage();
      await keyboard.route('**/*.{wav,webm}', async route => { await assetsReady; await route.continue(); });
      await keyboard.goto(origin + '/game/');
      assert.equal(await keyboard.locator('#mute').textContent(), 'sound is on');
      assert.match(await keyboard.locator('#sound-hint').textContent(), /Waiting|Loading/);
      const beforeGesture = await keyboard.evaluate(() => ({state:audioProbe.contexts[0].state, starts:audioProbe.starts.length, resumes:audioProbe.resumes}));
      assert.equal(beforeGesture.state, 'suspended');
      assert.equal(beforeGesture.starts, 0);
      assert.ok(beforeGesture.resumes.includes(false), 'ordinary permitted autoplay attempted without spoofing activation');
      await keyboard.keyboard.press('Tab');
      await keyboard.waitForFunction(() => audioProbe.contexts[0].state === 'running');
      assert.equal(await keyboard.locator('#mute').textContent(), 'sound is on', 'loading preserves ON preference');
      assert.equal(await keyboard.locator('#mute').getAttribute('data-audio-state'), 'loading');
      assert.match(await keyboard.locator('#sound-hint').textContent(), /Loading/);
      await keyboard.locator('#mute').click();
      releaseAssets();
      await keyboard.waitForFunction(() => audioProbe.decoded === 9);
      await keyboard.locator('#how-to').click();
      assert.equal(await keyboard.locator('#mute').textContent(), 'sound is off', 'ordinary clicks preserve explicit mute');
      assert.equal(await keyboard.evaluate(() => audioProbe.starts.length), 0, 'late load cannot reverse mute');
      await keyboardContext.close();
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
        await (mobile ? player.locator('#join-existing').tap() : player.locator('#join-existing').click());
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
      // First ordinary host/player interaction activates audio, without a sound-button detour.
      for (const page of pages) {
        await page.waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'ready');
        assert.equal(await page.evaluate(() => audioProbe.decoded), 9);
        assert.equal(await page.evaluate(() => audioProbe.contexts[0].state), 'running');
        assert.ok(await page.evaluate(() => audioProbe.resumes.some(Boolean)));
        assert.equal(await page.evaluate(() => audioProbe.starts.filter(start => !start.loop).length), 0);
        await page.bringToFront();
        await page.waitForFunction(() => audioProbe.peak > .01 && audioProbe.starts.some(s => s.loop && !s.stopped && s.duration < 100 && s.musicBus));

        const box = await page.locator('#mute').boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= page.viewportSize().width);
      }
      await host.locator('#start-game').click();
      clock = room.prebattle.deadline; game.tick();
      await players[0].waitForFunction(() => !document.querySelector('[data-move="attack"]').disabled);
      for (const page of pages) {
        assert.ok(await page.evaluate(() => audioProbe.starts.filter(start => start.loop && start.duration < 100).every(start => start.stopped)));
        await page.evaluate(() => { audioProbe.starts = []; });
      }
      await players[0].waitForFunction(() => !document.querySelector('[data-move="attack"]').disabled);
      await players[0].locator('[data-move="attack"]').click();
      for (const page of pages) assert.equal(await page.evaluate(() => audioProbe.starts.filter(start => !start.loop).length), 0, 'vote stays silent');
      await Promise.all(pages.map(page => page.evaluate(() => { audioProbe.peak = 0; })));
      await advance();
      for (const page of pages) {
        await page.bringToFront();
        await page.waitForFunction(() => audioProbe.starts.filter(start => !start.loop).length === 1 && audioProbe.peak > .01);
        assert.equal(await page.evaluate(() => audioProbe.starts.find(start => !start.loop).state), 'running');
        console.log((page === host ? 'host' : mobile ? 'touch player' : 'desktop player') +
          ' native graph peak=' + await page.evaluate(() => audioProbe.peak));
      }
      // Repeat the same authoritative snapshot over the actual SSE parser/handler.
      for (const stream of room.streams) stream.res.write('event: state\ndata: ' +
        JSON.stringify(arena.snapshot(room, stream.viewer)) + '\n\n');
      await host.waitForTimeout(150);
      for (const page of pages) assert.equal(await page.evaluate(() => audioProbe.starts.filter(start => !start.loop).length), 1);
      for (const page of pages) await page.locator('#mute').click();
      await host.locator('#mute').focus();
      await host.keyboard.press('Tab'); // Later ordinary gestures must not undo a deliberate mute.
      await advance();
      for (const page of pages) {
        assert.equal(await page.locator('#mute').textContent(), 'sound is off');
        assert.equal(await page.evaluate(() => audioProbe.starts.filter(start => !start.loop).length), 1, 'mute suppresses new actions');
      }
      const resumeCounts = new Map();
      for (const page of pages) {
        await page.locator('#mute').click();
        await page.waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'ready');
        assert.equal(await page.evaluate(() => audioProbe.starts.filter(start => !start.loop).length), 1, 'unmute does not replay');
        // Suspension affects playback status, not preference; SSE cannot resume.
        await page.evaluate(async () => { await audioProbe.contexts[0].suspend(); });
        await page.waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'suspended');
        assert.equal(await page.locator('#mute').textContent(), 'sound is on');
        assert.equal(await page.locator('#mute').getAttribute('aria-pressed'), 'false');
        assert.match(await page.locator('#sound-hint').textContent(), /suspended/);
        resumeCounts.set(page, await page.evaluate(() => audioProbe.resumes.length));
      }
      await advance();
      for (const page of pages) {
        const resumes = resumeCounts.get(page);
        assert.equal(await page.evaluate(() => audioProbe.starts.filter(start => !start.loop).length), 1, 'suspended resolution is consumed, never queued');
        assert.equal(await page.evaluate(() => audioProbe.resumes.length), resumes, 'SSE does not attempt autoplay resume');
        await page.evaluate(() => { audioProbe.blockResume = true; });
        await page.locator('#connection').click();
        await page.waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'error');
        assert.equal(await page.locator('#mute').textContent(), 'sound is on', 'failed resume preserves preference');
        assert.match(await page.locator('#sound-hint').textContent(), /could not start/);
        assert.equal(await page.evaluate(() => audioProbe.contexts[0].state), 'suspended');
        await page.evaluate(() => { audioProbe.blockResume = false; });
        await page.locator('#connection').click();
        await page.waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'ready');
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
          audioProbe.starts.filter(start => !start.loop).length === count && audioProbe.peak > .01, i + 2);
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
    const args = ['--autoplay-policy=document-user-activation-required'];
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
        if (/\.(wav|webm)$/.test(response.url())) assets.push(response.status());
      });
      await page.goto(process.env.AUDIO_LIVE_URL);
      assert.equal(await page.locator('#mute').textContent(), 'sound is on');
      assert.equal(await page.locator('#mute').isVisible(), true);
      await (device ? page.locator('#how-to').tap() : page.locator('#how-to').click());
      await page.waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'ready' && audioProbe.peak > .01);
      assert.equal(await page.evaluate(() => audioProbe.contexts[0].state), 'running');
      assert.equal(await page.evaluate(() => audioProbe.decoded), 9);
      assert.ok(await page.evaluate(() => audioProbe.resumes.some(Boolean)));
      assert.deepEqual(assets, [200, 200, 200, 200, 200, 200, 200, 200, 200]);
      assert.deepEqual(errors, []);
      console.log('LIVE ' + (device || 'desktop') + ': 9 audio assets=200, decoded=9, state=running, graph peak=' +
        await page.evaluate(() => audioProbe.peak));
      await context.close();
    }
  });


test('native battle-start WAV: live host/player edge, dedup, reset, mute and reconnect',
  { skip: !enabled, timeout: 60000 }, async t => {
    const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE);
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
      headless: true, args: ['--autoplay-policy=document-user-activation-required'] });
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
    async function page(device) {
      const context = await browser.newContext({ ...(device ? devices[device] : {}), reducedMotion: 'reduce' });
      await context.addInitScript(observeAudio);
      context.setDefaultTimeout(10000);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/game/');
      await page.locator('#how-to').click();
      await page.waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'ready');
      await page.locator('#help-back').click();
      return page;
    }
    const host = await page();
    await host.locator('#play-groups').click();
    await host.locator('#create-room').click();
    await host.locator('#arena-next').click();
    await host.locator('#selection-next').click();
    await host.waitForFunction(() => document.body.dataset.screen === 'lobby');
    const roomId = await host.locator('#room-code').textContent();
    const room = arena.rooms.get(roomId);
    const players = [];
    for (const [i, device] of ['iPhone 13', 'iPad (gen 7)'].entries()) {
      const player = await page(device);
      await player.locator('#join-existing').click();
      await player.locator('#join-code').fill(roomId);
      await player.locator('#nickname').fill('Start cue ' + i);
      await player.locator('#join-form button').click();
      await player.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected');
      players.push(player);
    }
    const pages = [host, ...players];
    const counts = async () => Promise.all(pages.map(page => page.evaluate(() =>
      audioProbe.starts.filter(start => Math.abs(start.duration - 4.156375) < .001).length)));
    const waitCounts = async expected => {
      for (const [i, page] of pages.entries()) await page.waitForFunction(count =>
        audioProbe.starts.filter(start => Math.abs(start.duration - 4.156375) < .001).length === count, expected[i]);
      assert.deepEqual(await counts(), expected);
    };
    const start = async expected => {
      await Promise.all(pages.map(page => page.evaluate(() => { audioProbe.peak = 0; })));
      await host.locator('#start-game').click();
      await host.waitForFunction(() => document.body.dataset.screen === 'battle');
      await waitCounts(expected);
    };
    const reset = async () => {
      host.once('dialog', dialog => dialog.accept());
      await host.locator('#reset-game').click();
      await host.waitForFunction(() => document.body.dataset.screen === 'lobby');
      for (const page of players) await page.waitForFunction(() => document.querySelector('#player-state').textContent.includes('Waiting for the presenter'));
    };
    assert.deepEqual(await counts(), [0, 0, 0], 'enabling, arena/fighter selection and lobby stay silent');
    // Music is an actual looping buffer; both sliders alter separate native gain buses.
    for (const page of pages) {
      await page.locator('.audio-settings summary').click();
      await page.locator('#volume-music').fill('0');
      await page.locator('#volume-sfx').fill('63');
      await page.locator('#volume-sfx').dispatchEvent('input');
      await page.locator('#volume-music').dispatchEvent('input');
      assert.equal(await page.evaluate(() => audioProbe.gains[0].requestedValue), 0);
      assert.ok(Math.abs(await page.evaluate(() => audioProbe.gains[1].requestedValue) - .63) < .001);
      await page.locator('#volume-music').fill('35');
      await page.locator('.audio-settings summary').click();
    }
    assert.ok(await host.evaluate(() => audioProbe.starts.some(source => source.loop && Math.abs(source.duration - 86.7962358) < .001)));
    await start([1, 1, 1]);
    for (const page of pages) {
      assert.match(await page.locator('#prebattle-label').textContent(), /^[123]$/);
      const sequence = await page.evaluate(() => audioProbe.starts.filter(source => source.duration === 3 || Math.abs(source.duration - 4.156375) < .001));
      assert.equal(sequence.length, 2);
      assert.equal(sequence[0].duration, 3);
      assert.ok(Math.abs((sequence[1].when - sequence[0].when) - (3 - sequence[0].offset)) < .03);
      assert.ok(await page.locator('[data-move="attack"]').isDisabled());
      assert.equal(await page.evaluate(() => audioProbe.starts.filter(source => source.loop && !source.stopped).length), 0, 'no music during countdown/Ready Fight');
    }
    for (const [elapsed, label] of [[1000,'2'],[2000,'1'],[3000,'READY… FIGHT!']]) {
      clock = room.prebattle.startedAt + elapsed;
      for (const stream of room.streams) stream.res.write('event: state\ndata: ' + JSON.stringify(arena.snapshot(room, stream.viewer)) + '\n\n');
      for (const page of pages) await page.waitForFunction(label => document.querySelector('#prebattle-label').textContent === label, label);
    }
    // Allow the native audio clock to finish the complete 3s + 4.156375s sequence.
    await host.waitForTimeout(7300);
    clock = room.prebattle.deadline; game.tick();
    for (const page of pages) await page.waitForFunction(() => document.querySelector('#prebattle').hidden);
    assert.equal(room.turn.deadline - room.turn.startedAt, 15000);
    for (const page of pages) {
      await page.waitForFunction(() => audioProbe.starts.some(source => source.loop && source.duration > 140));
      const music = await page.evaluate(() => audioProbe.starts.filter(source => source.loop && !source.stopped));
      assert.equal(music.length, 1, 'exactly one active music source after complete intro');
      assert.ok(Math.abs(music[0].duration - 143.081375) < .001);
      assert.equal(music[0].musicBus, true); assert.equal(music[0].sfxBus, false);
      assert.equal(music[0].loopStart, 0); assert.equal(music[0].loopEnd, 0, 'native default loops entire decoded track');
      assert.ok(await page.evaluate(() => audioProbe.starts.filter(source => source.loop && source.duration < 100).every(source => source.stopped)));
    }


    for (const page of pages) {
      await page.bringToFront();
      await page.waitForFunction(() => audioProbe.peak > .01);
      assert.equal(await page.evaluate(() => audioProbe.starts.find(start => !start.loop).state), 'running');
    }
    console.log('BATTLE START first native graph peaks=' + JSON.stringify(await Promise.all(pages.map(page =>
      page.evaluate(() => audioProbe.peak)))));
    for (const stream of room.streams) stream.res.write('event: state\ndata: ' +
      JSON.stringify(arena.snapshot(room, stream.viewer)) + '\n\n');
    await host.waitForTimeout(150);
    assert.deepEqual(await counts(), [1, 1, 1], 'POST response plus repeated SSE cannot double-play');
    await players[1].locator('#mute').click();
    await reset(); await start([2, 2, 1]);
    await players[1].locator('#mute').click();
    await players[1].waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'ready');
    assert.deepEqual(await counts(), [2, 2, 1], 'unmute never replays the missed start');
    await players[1].evaluate(async () => { await audioProbe.contexts[0].suspend(); });
    await players[1].waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'suspended');
    await reset(); await start([3, 3, 1]);
    await players[1].locator('#connection').click();
    await players[1].waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'ready');
    assert.deepEqual(await counts(), [3, 3, 1], 'gesture recovery does not queue suspended start');
    // Disconnect a real player SSE, hold reconnection, and miss a complete start edge.
    await reset();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await players[0].route('**/events', async route => { await held; await route.continue(); });
    const playerId = [...room.players.values()].find(player => player.nickname === 'Start cue 0').id;
    for (const stream of room.streams) if (stream.viewer.player?.id === playerId) stream.res.destroy();
    await players[0].waitForFunction(() => document.querySelector('#connection').textContent === 'Reconnecting…');
    await start([4, 3, 2]);
    release();
    await players[0].waitForFunction(() => document.querySelector('#connection').textContent === 'Connected');
    await players[0].waitForTimeout(150);
    assert.deepEqual(await counts(), [4, 3, 2], 'reconnect running snapshot is stale history, not a start');
    await reset(); await start([5, 4, 3]);
    // Full reload into an already-running battle remains silent after enabling audio.
    await players[0].reload();
    await players[0].waitForFunction(() => document.querySelector('#connection').textContent === 'Connected');
    await players[0].locator('#connection').click();
    await players[0].waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'ready');
    assert.equal(await players[0].evaluate(() => audioProbe.starts.filter(start => !start.loop).length), 0);
    await host.locator('#main-menu').click();
    await host.locator('#play-bot').click();
    await host.locator('#arena-next').click();
    assert.equal((await counts())[0], 5, 'bot arena/fighter selection stays silent');
    await host.locator('#selection-next').click();
    await host.waitForFunction(() => audioProbe.starts.filter(start => Math.abs(start.duration - 4.156375) < .001).length === 6);
    host.once('dialog', dialog => dialog.accept());
    await host.locator('#reset-game').click();
    await host.waitForFunction(() => audioProbe.starts.filter(start => Math.abs(start.duration - 4.156375) < .001).length === 7);
    assert.deepEqual(errors, []);
    console.log('BATTLE START dedup/reset/mute/suspend/reconnect/reload verified on native host + phone + tablet');
  });


test('battle music native lifecycle on desktop host/player and touch: gain, mute, reconnect, reset, finish, leaving',
  { skip: !enabled, timeout: 60000 }, async t => {
    const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE);
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
      headless: true, args: ['--autoplay-policy=document-user-activation-required'] });
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
    async function page(device) {
      const context = await browser.newContext({ ...(device ? devices[device] : {}), reducedMotion: 'reduce' });
      await context.addInitScript(observeAudio); context.setDefaultTimeout(10000);
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin + '/game/'); return page;
    }
    const host = await page();
    await host.locator('#play-groups').click(); await host.locator('#create-room').click();
    await host.locator('#arena-next').click(); await host.locator('#selection-next').click();
    await host.waitForFunction(() => document.body.dataset.screen === 'lobby');
    const roomId = await host.locator('#room-code').textContent(), room = arena.rooms.get(roomId);
    const players = [];
    for (const [i, device] of [null, 'iPhone 13'].entries()) {
      const player = await page(device);
      await (device ? player.locator('#join-existing').tap() : player.locator('#join-existing').click());
      await player.locator('#join-code').fill(roomId); await player.locator('#nickname').fill('Music ' + i);
      await player.locator('#join-form button').click();
      await player.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected'); players.push(player);
    }
    const pages = [host, ...players];
    const waitLoops = async (targets, track) => {
      for (const page of targets) await page.waitForFunction(track => {
        const loops = audioProbe.starts.filter(s => s.loop && !s.stopped);
        return track === null ? loops.length === 0 : loops.length === 1 && (track === 'battle' ? loops[0].duration > 140 : loops[0].duration < 100);
      }, track);
    };
    const checkMusicGain = async (page, track, volume) => {
      const graph = await page.evaluate(() => {
        const loop = audioProbe.starts.findLast(s => s.loop && !s.stopped);
        return { source: loop.sourceGain, bus: audioProbe.gains[0].gain.value, music: loop.musicBus, sfx: loop.sfxBus };
      });
      const source = track === 'battle' ? .45 * .5 : .45;
      assert.ok(Math.abs(graph.source - source) < 1e-7, track + ': track-only gain');
      assert.ok(Math.abs(graph.bus - volume) < 1e-7, track + ': Music slider stays independent');
      assert.ok(Math.abs(graph.source * graph.bus - source * volume) < 1e-7, track + ': composed gain');
      assert.equal(graph.music, true); assert.equal(graph.sfx, false);
    };
    const emit = () => { for (const stream of room.streams) stream.res.write('event: state\ndata: ' + JSON.stringify(arena.snapshot(room, stream.viewer)) + '\n\n'); };
    const reset = async () => {
      host.once('dialog', d => d.accept()); await host.locator('#reset-game').click();
      await host.waitForFunction(() => document.body.dataset.screen === 'lobby'); await waitLoops(pages, 'lobby');
    };
    const running = async () => { await host.locator('#start-game').click(); clock = room.prebattle.deadline; game.tick(); await waitLoops(pages, 'battle'); };
    for (const page of pages) await page.waitForFunction(() => document.querySelector('#mute').dataset.audioState === 'ready');
    await waitLoops(pages, 'lobby');
    for (const page of pages) await checkMusicGain(page, 'lobby', .35);
    await running();
    for (const page of pages) {
      await checkMusicGain(page, 'battle', .35);
    }
    assert.equal(room.turn.deadline - room.turn.startedAt, 15000);
    const counts = await Promise.all(pages.map(p => p.evaluate(() => audioProbe.starts.length)));
    emit(); emit(); await host.waitForTimeout(200);
    for (const [i, page] of pages.entries()) {
      assert.equal(await page.evaluate(() => audioProbe.starts.length), counts[i], 'SSE duplicates do not restart music');
      await page.locator('.audio-settings summary').click();
      await page.locator('#volume-sfx').fill('0'); await page.locator('#volume-sfx').dispatchEvent('input');
      await page.locator('#volume-music').fill('0'); await page.locator('#volume-music').dispatchEvent('input');
      await page.evaluate(() => { audioProbe.peak = 0; }); await page.bringToFront(); await page.waitForTimeout(250);
      await page.evaluate(() => { audioProbe.peak = 0; }); await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => audioProbe.peak), 0, 'music zero silences native graph');
      await checkMusicGain(page, 'battle', 0);
      await page.locator('#volume-music').fill('42'); await page.locator('#volume-music').dispatchEvent('input');
      await page.waitForFunction(() => audioProbe.peak > .01);
      assert.equal(await page.evaluate(() => audioProbe.gains[1].requestedValue), 0, 'SFX zero does not silence music');
      assert.ok(Math.abs(await page.evaluate(() => audioProbe.gains[0].requestedValue) - .42) < .001);
      await checkMusicGain(page, 'battle', .42);
      const loop = await page.evaluate(() => audioProbe.starts.findLast(s => s.loop && !s.stopped));
      assert.equal(loop.musicBus, true); assert.equal(loop.sfxBus, false);
      await page.locator('.audio-settings summary').click();
      await page.locator('#mute').click(); await waitLoops([page], null);
      await page.locator('#connection').click(); assert.equal(await page.locator('#mute').textContent(), 'sound is off');
      await page.locator('#mute').click(); await waitLoops([page], 'battle');
      await checkMusicGain(page, 'battle', .42);
    }
    // Hold a real SSE reconnect while an authoritative action is missed.
    const returning = players[0]; let release;
    const held = new Promise(resolve => { release = resolve; });
    await returning.route('**/events', async route => { await held; await route.continue(); });
    const id = [...room.players.values()].find(p => p.nickname === 'Music 0').id;
    const historical = await returning.evaluate(() => ({ cues: audioProbe.starts.filter(s => !s.loop).length, tones: audioProbe.tones.length }));
    for (const stream of room.streams) if (stream.viewer.player?.id === id) stream.res.destroy();
    await returning.waitForFunction(() => document.querySelector('#connection').textContent === 'Reconnecting…'); await waitLoops([returning], null);
    clock = room.turn.deadline; game.tick();
    release(); await returning.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected'); await waitLoops([returning], 'battle');
    assert.deepEqual(await returning.evaluate(() => ({ cues: audioProbe.starts.filter(s => !s.loop).length, tones: audioProbe.tones.length })), historical, 'reconnect restores only music, no missed action/intro/tones');
    await returning.unroute('**/events');
    // Full reload into running state may recover music after activation, not intro or old action.
    await returning.reload(); await returning.locator('#connection').click();
    await returning.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected'); await waitLoops([returning], 'battle');
    assert.equal(await returning.evaluate(() => audioProbe.starts.filter(s => !s.loop).length), 0);
    assert.equal(await returning.evaluate(() => audioProbe.tones.length), 0);
    for (const page of pages) {
      await page.evaluate(async () => { await audioProbe.contexts[0].suspend(); }); await waitLoops([page], null);
      emit(); assert.equal(await page.evaluate(() => audioProbe.contexts[0].state), 'suspended');
      await page.locator('#connection').click(); await waitLoops([page], 'battle');
    }
    await reset();
    for (const page of pages) {
      const volume = Number(await page.locator('#volume-music').inputValue()) / 100;
      await checkMusicGain(page, 'lobby', volume);
    }
    await running();
    // Muted starts consume intro but a later unmute restores the current music only.
    await reset(); await players[1].locator('#mute').click();
    await host.locator('#start-game').click(); clock = room.prebattle.deadline; game.tick();
    await waitLoops([host, players[0]], 'battle'); await waitLoops([players[1]], null);
    const cues = await players[1].evaluate(() => audioProbe.starts.filter(s => !s.loop).length);
    await players[1].locator('#mute').click(); await waitLoops([players[1]], 'battle');
    assert.equal(await players[1].evaluate(() => audioProbe.starts.filter(s => !s.loop).length), cues);
    // Finish is authoritative; an offline client must not replay its missed win/action.
    let releaseFinish;
    const heldFinish = new Promise(resolve => { releaseFinish = resolve; });
    await returning.route('**/events', async route => { await heldFinish; await route.continue(); });
    const beforeFinish = await returning.evaluate(() => ({ cues: audioProbe.starts.filter(s => !s.loop).length, tones: audioProbe.tones.length }));
    for (const stream of room.streams) if (stream.viewer.player?.id === id) stream.res.destroy();
    await returning.waitForFunction(() => document.querySelector('#connection').textContent === 'Reconnecting…');
    room.teams.B.hp = 1; clock = room.turn.deadline; game.tick();
    assert.equal(room.phase, 'finished'); await waitLoops(pages, null);
    releaseFinish(); await returning.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected');
    assert.deepEqual(await returning.evaluate(() => ({ cues: audioProbe.starts.filter(s => !s.loop).length, tones: audioProbe.tones.length })), beforeFinish);
    await host.waitForFunction(() => document.body.dataset.screen === 'victory');
    await host.locator('#main-menu').click(); await waitLoops([host], 'lobby');
    assert.deepEqual(errors, []);
    console.log('BATTLE MUSIC native full-track/bus/zero-gain/mute/SSE/reconnect/reload/suspend/reset/finish/menu verified');
  });


test('optional WebM decode failure preserves actual lobby graph after first ordinary gesture',
  { skip: !enabled, timeout: 20000 }, async t => {
    const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE);
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
      headless: true, args: ['--autoplay-policy=document-user-activation-required'] });
    const game = createGameServer({ autoTick: false });
    await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { await browser.close(); await game.close(); });
    for (const device of [null, 'iPhone 13', 'iPad (gen 7)']) {
      const context = await browser.newContext(device ? devices[device] : {});
      await context.addInitScript(observeAudio);
      const page = await context.newPage();
      await page.route('**/battle-loop.webm', route => route.fulfill({ status: 200, contentType: 'audio/webm', body: 'unsupported codec' }));
      await page.goto('http://127.0.0.1:' + game.server.address().port + '/game/');
      assert.equal(await page.locator('#mute').textContent(), 'sound is on');
      await (device ? page.locator('#how-to').tap() : page.locator('#how-to').click());
      await page.waitForFunction(() => audioProbe.decoded === 8 && audioProbe.peak > .01 && document.querySelector('#mute').dataset.audioState === 'ready');
      assert.match(await page.locator('#sound-hint').textContent(), /Battle music unavailable.*other game sounds remain enabled/);
      assert.ok(await page.evaluate(() => audioProbe.starts.some(s => s.loop && !s.stopped && s.musicBus && s.duration < 100)));
      await page.locator('#mute').click();
      assert.equal(await page.locator('#mute').textContent(), 'sound is off');
      assert.ok(await page.evaluate(() => audioProbe.starts.every(s => s.stopped)));
      await page.locator('#help-back').click();
      assert.equal(await page.locator('#mute').textContent(), 'sound is off');
      await context.close();
    }
  });

test('exact victory native graph: full source once on host/players, history/load/mute/reset/leave',
  { skip: !enabled, timeout: 60000 }, async t => {
    const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE);
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
      headless: true, args: ['--autoplay-policy=document-user-activation-required'] });
    let clock = Date.now();
    const arena = new Arena({ now: () => clock, pick: () => 0 });
    const reservation = http.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
    const origin = 'http://127.0.0.1:' + port;
    const game = createGameServer({ arena, autoTick: false, publicOrigin: origin });
    await new Promise(resolve => game.server.listen(port, '127.0.0.1', resolve));
    t.after(async () => { await browser.close(); await game.close(); });
    const errors = [];
    async function open(device) {
      const context = await browser.newContext({ ...(device ? devices[device] : {}), reducedMotion: 'reduce' });
      await context.addInitScript(observeAudio); context.setDefaultTimeout(10000);
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin + '/game/'); return page;
    }
    const host = await open();
    await host.locator('#play-groups').click(); await host.locator('#create-room').click();
    await host.locator('#arena-next').click(); await host.locator('#selection-next').click();
    await host.waitForFunction(() => document.body.dataset.screen === 'lobby');
    const roomId = await host.locator('#room-code').textContent(), room = arena.rooms.get(roomId);
    const players = [];
    for (const [i, device] of [null, 'iPhone 13'].entries()) {
      const player = await open(device); await player.locator('#join-existing').click();
      await player.locator('#join-code').fill(roomId); await player.locator('#nickname').fill('Victory ' + i);
      await player.locator('#join-form button').click(); players.push(player);
    }
    const pages = [host, ...players];
    for (const page of pages) {
      await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected' && audioProbe.decoded === 9);
      await page.locator('.audio-settings summary').click();
      await page.locator('#volume-sfx').fill('0'); await page.locator('#volume-sfx').dispatchEvent('input');
      await page.locator('#volume-music').fill('42'); await page.locator('#volume-music').dispatchEvent('input');
      await page.locator('.audio-settings summary').click();
    }
    const wins = page => page.evaluate(() => audioProbe.starts.filter(s => Math.abs(s.duration - 5.4683125) < .001));
    const start = async () => {
      await host.locator('#start-game').click(); clock = room.prebattle.deadline; game.tick();
      for (const page of pages) await page.waitForFunction(() => audioProbe.starts.some(s => s.loop && s.duration > 140 && !s.stopped));
    };
    const finish = () => { room.teams.B.hp = 1; clock = room.turn.deadline; game.tick(); assert.equal(room.phase, 'finished'); };
    const reset = async () => {
      await host.waitForFunction(() => document.body.dataset.screen === 'victory');
      await host.locator('#replay-game').click();
      await host.waitForFunction(() => document.body.dataset.screen === 'lobby');
      for (const page of pages) await page.waitForFunction(() => audioProbe.starts.filter(s => Math.abs(s.duration - 5.4683125) < .001).every(s => s.ended || s.stopped));
    };
    await start();
    const tones = await Promise.all(pages.map(p => p.evaluate(() => audioProbe.tones.length)));
    finish();
    for (const [i, page] of pages.entries()) {
      await page.waitForFunction(() => audioProbe.starts.some(s => Math.abs(s.duration - 5.4683125) < .001));
      const win = (await wins(page))[0];
      assert.equal(win.loop, false); assert.equal(win.offset, 0); assert.equal(win.activeLoops, 0, 'battle stopped BEFORE victory starts');
      assert.equal(win.musicBus, true); assert.equal(win.sfxBus, false); assert.equal(win.sourceGain, .45);
      assert.equal(win.state, 'running'); assert.equal(await page.evaluate(() => audioProbe.gains[1].requestedValue), 0);
      assert.equal(await page.evaluate(() => audioProbe.gains[0].requestedValue), .42);
      assert.equal(await page.evaluate(() => audioProbe.tones.length), tones[i], 'no synthetic win');
      await page.bringToFront();
      await page.evaluate(() => { audioProbe.peak = 0; });
      await page.waitForFunction(() => audioProbe.peak > .001);
    }
    for (const stream of room.streams) for (let i = 0; i < 2; i++) stream.res.write('event: state\ndata: ' + JSON.stringify(arena.snapshot(room, stream.viewer)) + '\n\n');
    for (const page of pages) {
      await page.waitForFunction(() => audioProbe.starts.some(s => Math.abs(s.duration - 5.4683125) < .001 && s.ended));
      const all = await wins(page); assert.equal(all.length, 1); assert.equal(all[0].stopped, false, 'entire source naturally ended');
    }
    // Full reload into finished state is historical, even after audio activation.
    await players[0].reload(); await players[0].locator('#connection').click();
    await players[0].waitForFunction(() => document.querySelector('#connection').textContent === 'Connected' && audioProbe.decoded === 9);
    assert.equal((await wins(players[0])).length, 0);
    await reset(); await start();
    // Explicit mute consumes this finish, and unmute never plays it later.
    await players[0].locator('#mute').click();
    // A reload with all audio requests held consumes the live edge while loading.
    let release; const held = new Promise(resolve => { release = resolve; });
    await players[1].route('**/*.{wav,webm}', async route => { await held; await route.continue(); });
    await players[1].reload(); await players[1].locator('#connection').click();
    await players[1].waitForFunction(() => document.querySelector('#connection').textContent === 'Connected');
    finish();
    await host.waitForFunction(() => audioProbe.starts.filter(s => Math.abs(s.duration - 5.4683125) < .001).length === 2);
    await players[0].waitForFunction(() => document.body.dataset.screen === 'victory');
    await players[0].locator('#mute').click(); release();
    await players[1].waitForFunction(() => audioProbe.decoded === 9);
    assert.equal((await wins(players[0])).length, 0); assert.equal((await wins(players[1])).length, 0, 'late preload never plays skipped win');
    await players[1].unroute('**/*.{wav,webm}');
    // Reset while the host source is active stops it and re-arms the next match.
    assert.equal((await wins(host)).at(-1).stopped, false);
    await reset(); assert.equal((await wins(host)).at(-1).stopped, true);
    await start(); finish();
    for (const page of pages) await page.waitForFunction(() => audioProbe.starts.some(s => Math.abs(s.duration - 5.4683125) < .001 && !s.ended && !s.stopped));
    await players[0].locator('#mute').click(); assert.equal((await wins(players[0])).at(-1).stopped, true);
    await players[0].locator('#mute').click(); assert.equal((await wins(players[0])).length, 1, 'unmute cannot replay');
    await host.waitForFunction(() => document.body.dataset.screen === 'victory');
    await host.locator('#victory-menu').click(); assert.equal((await wins(host)).at(-1).stopped, true);
    await players[1].locator('#victory-menu').click(); assert.equal((await wins(players[1])).at(-1).stopped, true);
    assert.deepEqual(errors, []);
    console.log('VICTORY exact source 5.4683125s, natural full end, Music bus .45*.42, host/desktop/touch, no synthetic overlap/history/late load; mute/reset/leave verified');
  });

test('optional victory codec failure preserves native lobby/action graph and ON labels',
  { skip: !enabled, timeout: 30000 }, async t => {
    const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE);
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true });
    const game = createGameServer({ autoTick: false });
    await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { await browser.close(); await game.close(); });
    for (const device of [null, 'iPhone 13', 'iPad (gen 7)']) {
      const context = await browser.newContext(device ? devices[device] : {}); await context.addInitScript(observeAudio);
      const page = await context.newPage();
      await page.route('**/victory.webm', route => route.fulfill({ status: 200, contentType: 'audio/webm', body: 'bad codec' }));
      await page.goto('http://127.0.0.1:' + game.server.address().port + '/game/'); await page.locator('#how-to').click();
      await page.waitForFunction(() => audioProbe.decoded === 8 && audioProbe.peak > .01 && document.querySelector('#mute').dataset.audioState === 'ready');
      assert.equal(await page.locator('#mute').textContent(), 'sound is on');
      assert.match(await page.locator('#sound-hint').textContent(), /Victory sound unavailable.*other game sounds remain enabled/);
      await page.evaluate(() => ArenaUI.cue('attack'));
      assert.ok(await page.evaluate(() => audioProbe.starts.some(s => !s.loop && s.sfxBus && s.duration < 1)));
      await context.close();
    }
  });
