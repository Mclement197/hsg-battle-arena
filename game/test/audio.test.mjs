import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {modelFor} from '../public/characters.js';
import { ACTION_SOUNDS, AUDIO_SOUNDS, ActionAudio, createActionCue, createBattleStartCue, createVictoryCue, ArenaClient } from '../public/app.js';
import { buildSound } from '../public/assets/audio/generate.mjs';
import { Arena, MOVES } from '../src/engine.mjs';
import { createGameServer } from '../src/server.mjs';

function fixture() {
  let clock = 1000;
  const arena = new Arena({ now: () => clock, pick: () => 0 });
  const room = arena.create();
  const a = arena.join(room, { nickname: 'Ace' });
  arena.join(room, { nickname: 'Dynamo' });
  const host = { role: 'host' };
  const player = { role: 'player', player: a.player };
  return { arena, room, host, player, now: () => clock, at: value => { clock = value; } };
}

test('all moves map to four distinct, reproducible, non-clipping PCM WAV assets', async () => {
  assert.deepEqual(Object.keys(ACTION_SOUNDS), MOVES);
  const hashes = new Set();
  for (const [move, url] of Object.entries(ACTION_SOUNDS)) {
    assert.match(url, /^\.\/assets\/audio\/[a-z-]+\.wav$/);
    const wav = await readFile(new URL('../public/' + url, import.meta.url));
    assert.deepEqual(wav, buildSound(move));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(4), wav.length - 8);
    assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), 24000);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.toString('ascii', 36, 40), 'data');
    assert.equal(wav.readUInt32LE(40), wav.length - 44);
    assert.equal(wav.readInt16LE(44), 0);
    assert.equal(wav.readInt16LE(wav.length - 2), 0);
    let peak = 0, energy = 0;
    for (let i = 44; i < wav.length; i += 2) {
      const sample = wav.readInt16LE(i);
      peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
    }
    assert.ok(peak > 20000 && peak < 32767);
    assert.ok(energy > 1000000);
    hashes.add(createHash('sha256').update(wav).digest('hex'));
  }
  assert.equal(hashes.size, 4);
  assert.throws(() => buildSound('unknown'), /Unknown sound/);
});

test('each action sounds only after authoritative deadline resolution, never on selection/countdown', () => {
  for (const move of MOVES) {
    const { arena, room, host, player, at } = fixture();
    const played = [];
    const actionCue = createActionCue(value => played.push(value));
    const client = new ArenaClient({ storage: {}, onState: actionCue });
    client.room = room.id;
    const accept = () => client.accept(arena.snapshot(room, player));
    accept();
    arena.start(room, host, {}); accept(); at(room.prebattle.deadline); arena.advance(room); accept();
    arena.vote(room, player, { turnId: room.turn.id, move: move === 'attack' ? 'heal' : 'attack' }); accept();
    arena.vote(room, player, { turnId: room.turn.id, move }); accept();
    at(room.turn.deadline - 1);
    assert.equal(arena.advance(room), false); accept();
    assert.deepEqual(played, []);
    at(room.turn.deadline);
    // A local zero countdown and an unresolved server snapshot are still silent.
    accept(); assert.equal(client.secondsLeft(), 0);
    assert.deepEqual(played, []);
    assert.equal(arena.advance(room), true); accept();
    assert.deepEqual(played, [move]);
    accept(); accept(); // Repeated state fetches and SSE reconnect snapshots.
    assert.deepEqual(played, [move]);
  }
});

test('no-vote fallback and random tie sound the resolved move, not the selected vote', () => {
  const { arena, room, host, at } = fixture();
  const third = arena.join(room, { nickname: 'Second Ace' });
  const played = [];
  const actionCue = createActionCue(move => played.push(move));
  const snapshot = () => actionCue(arena.snapshot(room, host));
  snapshot(); arena.start(room, host, {}); snapshot(); at(room.prebattle.deadline); arena.advance(room); snapshot();
  at(room.turn.deadline); arena.advance(room); snapshot();
  assert.deepEqual(played, ['attack']);
  at(room.turn.deadline); arena.advance(room); snapshot(); // B fallback.
  const ace = [...room.players.values()].find(p => p.team === 'A' && p.id !== third.player.id);
  arena.vote(room, { role: 'player', player: ace }, { turnId: room.turn.id, move: 'attack' });
  arena.vote(room, { role: 'player', player: third.player }, { turnId: room.turn.id, move: 'heal' });
  snapshot();
  at(room.turn.deadline); arena.advance(room); snapshot();
  assert.deepEqual(played, ['attack', 'attack', 'attack']);
});

test('dedup scopes room/match, ignores history and regressive results, consumes muted outcomes', () => {
  const played = [];
  let muted = false;
  const cue = createActionCue(move => { if (!muted) played.push(move); });
  const state = (roomId, match, number, move = 'attack') => ({ roomId, match,
    lastResult: number ? { number, turnId: match + ':' + number, move } : null });
  cue(state('one', 0, 4)); // Initial reconnect to an existing game is silent.
  cue(state('one', 0, 4)); cue(state('one', 0, 5)); cue(state('one', 0, 4)); cue(state('one', 0, 5));
  assert.deepEqual(played, ['attack']);
  muted = true; cue(state('one', 0, 6, 'special'));
  muted = false; cue(state('one', 0, 6, 'special'));
  assert.deepEqual(played, ['attack']);
  cue(state('one', 1, 0)); cue(state('one', 1, 1, 'heal'));
  cue(state('two', 1, 8)); cue(state('two', 1, 9, 'defend'));
  cue(state('one', 1, 1, 'heal')); // Room switch cannot replay its old result.
  assert.deepEqual(played, ['attack', 'heal', 'defend']);
  const reopened = createActionCue(move => played.push(move));
  reopened(state('two', 1, 9, 'defend'));
  assert.equal(played.length, 3);
});

function audioContext() {
  const starts = [], oscillators = [];
  const context = {
    state: 'running', currentTime: 0, destination: {}, starts, oscillators,
    decodeAudioData: async bytes => ({ bytes }),
    resume() { this.state = 'running'; return Promise.resolve(); },
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() { return this; }, disconnect() {} }),
    createBufferSource() {
      return { connect() { return this; }, disconnect() {},
        start() { starts.push(this); }, stop() { this.stopped = true; this.onended?.(); } };
    },
    createOscillator() {
      return { frequency: { setValueAtTime() {} }, connect() { return this; },
        start() { oscillators.push(this); }, stop() {} };
    }
  };
  return context;
}

test('native playback caches all mapped buffers, stops on mute and never queues delayed actions', async () => {
  const context = audioContext(), urls = [];
  const player = new ActionAudio(context, async url => {
    urls.push(url); return { ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
  });
  assert.equal(player.play('attack'), false);
  await player.load(); await player.load();
  assert.deepEqual(urls, Object.values(AUDIO_SOUNDS));
  assert.equal(context.starts.length, 0, 'loading must not replay a skipped action');
  for (const move of MOVES) {
    assert.equal(player.play(move), true);
    assert.equal(context.starts.at(-1).buffer, player.buffers.get(move));
  }
  assert.equal(player.play('unknown'), false);
  player.stop();
  assert.ok(context.starts.every(source => source.stopped));
  assert.equal(player.active.size, 0);
  context.state = 'suspended'; assert.equal(player.play('heal'), false);
  context.state = 'running'; assert.equal(context.starts.length, 4);
  const broken = new ActionAudio(context, async () => { throw new Error('offline'); });
  await assert.doesNotReject(broken.load());
  assert.equal(broken.play('attack'), false);
  const missing = new ActionAudio(context, async () => ({ ok: false }));
  await assert.doesNotReject(missing.load());
  const badDecode = new ActionAudio({ ...context, decodeAudioData: async () => { throw new Error('bad WAV'); } },
    async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
  await assert.doesNotReject(badDecode.load());
});

async function serve(t, options = {}) {
  const game = createGameServer({ publicOrigin: 'http://127.0.0.1', autoTick: false, ...options });
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  t.after(() => game.close());
  return (url, method = 'GET') => new Promise((resolve, reject) => {
    http.request({ hostname: '127.0.0.1', port: game.server.address().port, path: url, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject).end();
  });
}

test('all mapped audio URLs serve with their audio MIME over HTTP, including HEAD; source/docs stay private', async t => {
  const get = await serve(t);
  for (const url of Object.values(AUDIO_SOUNDS)) {
    const route = '/game/' + url.slice(2);
    const response = await get(route);
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], url.endsWith('.webm') ? 'audio/webm' : 'audio/wav');
    assert.deepEqual(response.body, await readFile(new URL('../public/' + url, import.meta.url)));
    const head = await get(route, 'HEAD');
    assert.equal(head.status, 200); assert.equal(head.body.length, 0);
  }
  for (const route of ['/game/assets/audio/generate.mjs', '/game/assets/audio/README.md', '/game/assets/audio/generate-lobby.mjs', '/game/assets/audio/generate-countdown.py',
    '/game/assets/audio/nested/attack-impact.wav', '/game/assets/audio/nested/battle-loop.webm',
    '/game/assets/audio/battle-loop.webm.bak', '/game/assets/audio/battle-loop.mp3', '/game/assets/battle-loop.webm', '/game/assets/audio/attack-impact.wav.bak',
    '/game/assets/audio/%2e%2e/app.js', '/game/assets/nested/attack-impact.wav']) {
    assert.equal((await get(route)).status, 404, route);
  }
});

test('nested audio routing preserves file and directory symlink rejection', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'arena-audio-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, 'public');
  await mkdir(path.join(publicDir, 'assets', 'audio'), { recursive: true });
  await writeFile(path.join(root, 'secret.wav'), 'private');
  await symlink(path.join(root, 'secret.wav'), path.join(publicDir, 'assets', 'audio', 'leak.wav'));
  const get = await serve(t, { publicDir });
  assert.equal((await get('/game/assets/audio/leak.wav')).status, 404);
  await rm(path.join(publicDir, 'assets', 'audio'), { recursive: true });
  await symlink(root, path.join(publicDir, 'assets', 'audio'));
  assert.equal((await get('/game/assets/audio/secret.wav')).status, 404);
});

const flush = () => new Promise(resolve => setImmediate(resolve));

test('actual UI hook: selection/local expiry silent, server result once, mute/unlock and win preserved', async () => {
  const { arena, room, host, player, at, now } = fixture();
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, dataset: {}, handlers: {}, disabled: false, classList: { toggle() {}, remove() {}, contains() { return false; } },
      addEventListener(type, handler) { this.handlers[type] = handler; },
      attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name] ?? null; }, focus() {}, append() {}, replaceChildren() {},
      querySelector: selector => selector === 'img' && id === 'qr-container' ? null : element(id + selector)
    });
    return elements.get(id);
  };
  const buttons = MOVES.map(move => Object.assign(element(move), { dataset: { move } }));
  let readNext;
  const reader = { read: () => new Promise(resolve => { readNext = resolve; }), cancel: async () => {} };
  const context = audioContext();
  context.state = 'suspended';
  const handlers = {};
  const document = {
    body: { dataset: { screen: 'entry' } },
    getElementById: element,
    querySelector: selector => buttons.find(button => selector.includes('"' + button.dataset.move + '"')) || element(selector),
    querySelectorAll: selector => selector === 'button[data-move]' ? buttons : [],
    createElement: id => element('new-' + id), createTextNode: text => ({ textContent: text }),
    addEventListener: (type, handler) => { handlers[type] = handler; },
    dispatchEvent: event => handlers[event.type]?.(event)
  };
  let tick;
  const sandbox = {
    document, window: { AudioContext: function () { return context; }, addEventListener() {} },
    performance: { now },
    BattleWorld: class { events = { pending: [] }; sync(state) { this.events.consume?.(state); for (const event of this.events.pending.splice(0)) queueMicrotask(() => this.onComplete?.(event)); } clear() {} disconnect() {} constructor() { this.events = new sandbox.BattleEvents(); } },
    CharacterStage: class { sync() {} play() {} }, modelFor,
    sessionStorage: { getItem: key => key.endsWith('active') ? JSON.stringify({ room: room.id, role: 'player' }) : 'token' },
    location: { origin: 'http://127.0.0.1', search: '' },
    URLSearchParams, AbortController, TextDecoder, TextEncoder,
    Date: { now }, setTimeout, clearTimeout, setInterval: callback => { tick = callback; },
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail; } },
    fetch: async (url, init) => {
      if (url.endsWith('/events')) return { ok: true, headers: { get: () => 'text/event-stream' }, body: { getReader: () => reader } };
      if (/\.(wav|webm)$/.test(url)) return { ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
      if (url.endsWith('/vote')) arena.vote(room, player, JSON.parse(init.body));
      return { ok: true, json: async () => ({ state: arena.snapshot(room, player) }) };
    }
  };
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  Object.assign(sandbox, await import('../public/fighter-data.js'), await import('../public/battle-contract.js'));
  vm.runInNewContext(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), sandbox);
  assert.equal(element('mute').textContent, 'sound is on', 'ON preference renders before asset loading completes');
  assert.equal(element('mute').getAttribute('aria-pressed'), 'false');
  assert.equal(element('mute').getAttribute('aria-label'), 'sound is on');
  await flush();
  const send = async () => {
    readNext({ done: false, value: new TextEncoder().encode('event: state\ndata: ' + JSON.stringify(arena.snapshot(room, player)) + '\n\n') });
    await flush();
  };
  arena.start(room, host, {}); await send(); at(room.prebattle.deadline); arena.advance(room); await send();
  context.starts.length = 0; // This scenario begins after the already-tested live intro/music.
  assert.equal(context.starts.filter(source => !source.loop).length, 0, 'history stays silent despite default preference');
  await flush();
  assert.equal(context.state, 'running', 'user gesture resumes context');
  assert.equal(context.oscillators.length, 0, 'automatic activation has no confirmation cue');
  buttons[0].handlers.click(); await flush();
  assert.equal(context.starts.filter(source => !source.loop).length, 0, 'voting has no action audio');
  at(room.turn.deadline); tick();
  assert.equal(context.starts.filter(source => !source.loop).length, 0, 'local expiry has no audio');
  arena.advance(room); await send();
  assert.equal(context.starts.filter(source => !source.loop).length, 1);
  assert.equal(new TextDecoder().decode(context.starts[0].buffer.bytes), ACTION_SOUNDS.attack);
  await send(); assert.equal(context.starts.filter(source => !source.loop).length, 1, 'repeated SSE snapshot cannot replay');
  element('mute').handlers.click();
  assert.ok(context.starts[0].stopped, 'mute stops an in-flight action');
  at(room.turn.deadline); arena.advance(room); await send();
  assert.equal(context.starts.filter(source => !source.loop).length, 1, 'muted resolution remains silent');
  element('mute').handlers.click(); await flush(); await send();
  assert.equal(context.starts.filter(source => !source.loop).length, 1, 'unmute does not replay history');
  room.teams.B.hp = 10; // Set up a winning attack.
  arena.vote(room, player, { turnId: room.turn.id, move: 'attack' });
  at(room.turn.deadline); arena.advance(room); await send();
  assert.equal(room.phase, 'finished');
  assert.equal(context.starts.filter(source => !source.loop).length, 3, 'winning action and full victory source sound');
  assert.ok(context.starts.some(source => new TextDecoder().decode(source.buffer.bytes) === AUDIO_SOUNDS.win), 'victory is emitted after the presentation completes');
  assert.equal(context.oscillators.length, 2, 'only explicit enable cue; no synthesized win overlap');
  await send(); assert.equal(context.starts.filter(source => !source.loop).length, 3); assert.equal(context.oscillators.length, 2);
});


test('battle start consumes only successful live transitions, including reset/start and reconnect history', () => {
  const { arena, room, host } = fixture();
  const played = [];
  const cue = createBattleStartCue(value => played.push(value));
  const client = new ArenaClient({ storage: {}, onState: cue });
  client.room = room.id;
  const accept = () => client.accept(arena.snapshot(room, host));
  accept(); accept(); // Lobby/configuration/selection snapshots are silent.
  assert.deepEqual(played, []);
  arena.start(room, host, {}); accept(); accept();
  assert.deepEqual(played, ['countdown', 'battle-start']);
  assert.throws(() => arena.start(room, host, {}), /Reset before/);
  accept(); assert.equal(played.length, 2, 'failed/repeated start is silent');
  cue({ ...arena.snapshot(room, host), phase: 'lobby' });
  accept(); assert.equal(played.length, 2, 'regressive lobby cannot re-arm the same match');
  arena.reset(room, host, {}); accept();
  cue.reset(); // First snapshot of a re-established stream is historical.
  arena.start(room, host, {}); accept(); accept();
  assert.equal(played.length, 2, 'start missed while disconnected is not replayed');
  arena.reset(room, host, {}); accept();
  arena.start(room, host, {}); accept(); accept();
  assert.deepEqual(played, ['countdown', 'battle-start', 'countdown', 'battle-start']);
  const fresh = createBattleStartCue(value => played.push(value));
  fresh(arena.snapshot(room, host));
  assert.equal(played.length, 4, 'initial running/reopened room stays silent');
  const empty = arena.create();
  const failedCue = createBattleStartCue(value => played.push(value));
  failedCue(arena.snapshot(empty, host));
  assert.throws(() => arena.start(empty, host, {}), /At least one player/);
  failedCue(arena.snapshot(empty, host));
  assert.equal(played.length, 4, 'rejected insufficient-player start stays silent');
});

test('battle-start WAV is the attributed full source effect, not a procedural replacement', async () => {
  const wav = await readFile(new URL('../public/' + AUDIO_SOUNDS['battle-start'], import.meta.url));
  assert.equal(createHash('sha256').update(wav).digest('hex'),
    'ac1753b0c966a04b728a6d76f6650078654049337eeb152fbfc3b2fecc308925');
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt32LE(40) / (48000 * 2 * 2), 4.156375);
});


test('full battle source identity and music source lifecycle preserve gains and single looping source', async () => {
  const source = await readFile(new URL('../public/assets/audio/battle-loop.webm', import.meta.url));
  assert.equal(source.length, 2191564);
  assert.equal(createHash('sha256').update(source).digest('hex'), '0a1b4014e7d01ebf9a7de30e267e58def9a1f950c5ccd9e9759282f5ec9e7e4b');
  const context = audioContext();
  const audio = new ActionAudio(context, async url => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
  await audio.load();
  audio.setMusic('lobby'); audio.setMusic('lobby');
  assert.equal(context.starts.length, 1);
  audio.setMusic(null); assert.ok(context.starts[0].stopped);
  audio.setMusic('battle', 'room:0'); audio.setMusic('battle', 'room:0');
  assert.equal(context.starts.length, 2);
  assert.equal(context.starts[1].buffer, audio.buffers.get('battle'));
  assert.equal(context.starts[1].loop, true);
  audio.setMusic('battle', 'room:1');
  assert.ok(context.starts[1].stopped);
  assert.equal(context.starts.length, 3, 'a different match cannot inherit the prior loop');
  audio.stop(); assert.ok(context.starts.every(source => source.stopped));
  context.state = 'suspended'; audio.setMusic('battle', 'room:1');
  assert.equal(context.starts.length, 3, 'suspension never queues music');
  context.state = 'running'; audio.setMusic('battle', 'room:1');
  assert.equal(context.starts.length, 4, 'ongoing music can recover without replaying cues');
});

test('WebM routing keeps the 8 MiB limit and rejects symlinks and deeper directories', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'arena-webm-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, 'public');
  await mkdir(path.join(publicDir, 'assets', 'audio'), { recursive: true });
  await writeFile(path.join(root, 'secret.webm'), 'private');
  await symlink(path.join(root, 'secret.webm'), path.join(publicDir, 'assets', 'audio', 'leak.webm'));
  await writeFile(path.join(publicDir, 'assets', 'audio', 'large.webm'), Buffer.alloc(8 * 1024 * 1024 + 1));
  const get = await serve(t, { publicDir });
  for (const file of ['leak.webm', 'large.webm']) assert.equal((await get('/game/assets/audio/' + file)).status, 404);
  await rm(path.join(publicDir, 'assets', 'audio'), { recursive: true });
  await symlink(root, path.join(publicDir, 'assets', 'audio'));
  assert.equal((await get('/game/assets/audio/secret.webm')).status, 404);
});


test('missing optional battle asset cannot disable unchanged lobby or action sounds', async () => {
  const context = audioContext();
  const audio = new ActionAudio(context, async url => ({ ok: !url.endsWith('.webm'), arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
  await audio.load(); assert.equal(audio.ready, true); assert.equal(audio.buffers.has('battle'), false);
  audio.setMusic('lobby'); assert.equal(context.starts.length, 1);
  assert.equal(context.starts[0].buffer, audio.buffers.get('lobby'));
  audio.setMusic('battle', 'room:0'); assert.equal(audio.music, null); assert.ok(context.starts[0].stopped);
  assert.equal(audio.play('attack'), true);
  audio.setMusic('lobby'); assert.equal(context.starts.length, 3);
});

test('reconnect baseline consumes action missed offline without replay and allows next live action', () => {
  const played = [], cue = createActionCue(move => played.push(move));
  const state = number => ({ roomId: 'one', match: 0, lastResult: { number, move: 'attack' } });
  cue(state(0)); cue(state(1)); cue.reset(); cue(state(4)); cue(state(4));
  assert.deepEqual(played, ['attack']); cue(state(5)); assert.deepEqual(played, ['attack', 'attack']);
});

test('victory-only doubled gain and battle half gain compose with Music slider and mute without changing other levels', async () => {
  const context = audioContext();
  context.createGain = () => ({ gain: { value: 1, setValueAtTime(value) { this.value = value; } },
    connect(target) { this.target = target; return target; }, disconnect() {} });
  context.createBufferSource = () => ({ connect(gain) { this.gain = gain; return gain; }, disconnect() {},
    start() { context.starts.push(this); }, stop() { this.stopped = true; this.onended?.(); } });
  const audio = new ActionAudio(context, async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
  await audio.load();
  const effective = source => source.stopped ? 0 : source.gain.gain.value * source.gain.target.gain.value;
  for (const volume of [.35, 0, .42, 1]) {
    audio.setVolume('music', volume);
    audio.setMusic('lobby');
    const lobby = audio.music;
    assert.equal(lobby.gain.gain.value, .45);
    assert.equal(effective(lobby), .45 * volume);
    audio.setMusic('battle', 'room:0');
    const battle = audio.music;
    assert.equal(lobby.stopped, true);
    assert.equal(battle.gain.gain.value, .45 * .5);
    assert.equal(battle.gain.target, audio.musicGain);
    assert.equal(effective(battle), .45 * .5 * volume);
    assert.equal(audio.musicGain.gain.value, volume);
    for (const [cue, gain] of [['attack', .45], ['defend', .45], ['heal', .45], ['special', .45], ['countdown', .9], ['battle-start', .45]]) {
      audio.play(cue);
      assert.equal(audio.lastSource.gain.target, audio.sfxGain);
      assert.equal(audio.lastSource.gain.gain.value, gain);
      assert.equal(effective(audio.lastSource), gain * .8);
    }
    assert.equal(audio.play('win'), true);
    const win = audio.victory;
    assert.equal(battle.stopped, true);
    assert.equal(win.gain.target, audio.musicGain);
    assert.equal(win.gain.gain.value, .45 * 2, 'exactly twice the previous victory amplitude gain');
    assert.equal(effective(win), .45 * 2 * volume);
    assert.equal(audio.musicGain.gain.value, volume);
    audio.stop(); // The UI's explicit mute path stops every source, not the slider.
    assert.ok(context.starts.every(source => effective(source) === 0));
    assert.equal(audio.musicGain.gain.value, volume);
    audio.setMusic('battle', 'room:0'); // Unmute restores music at the same composed level.
    assert.equal(effective(audio.music), .45 * .5 * volume);
    audio.stop();
  }
});

test('victory consumes only live running-to-finished edges, resets and unavailable outcomes', () => {
  const played = []; let available = true;
  const cue = createVictoryCue(kind => { if (available) played.push(kind); });
  const state = (phase, match = 0, roomId = 'one') => ({ roomId, match, phase });
  cue(state('finished')); cue(state('running')); cue(state('finished'));
  assert.deepEqual(played, [], 'initial/history and regressive state cannot replay a win');
  cue(state('lobby', 1)); cue(state('running', 1)); cue(state('finished', 1)); cue(state('finished', 1));
  assert.deepEqual(played, ['win']);
  cue.reset(); cue(state('finished', 1)); assert.deepEqual(played, ['win'], 'reconnect baseline');
  cue(state('running', 2)); available = false; cue(state('finished', 2));
  available = true; cue(state('finished', 2)); assert.deepEqual(played, ['win'], 'no delayed unmute/load');
  cue(state('running', 3)); cue.reset(); cue(state('finished', 3));
  assert.deepEqual(played, ['win'], 'finish missed offline');
  cue(state('running', 4)); cue(state('finished', 4));
  cue(state('finished', 4, 'two')); assert.deepEqual(played, ['win', 'win']);
});

test('full victory source identity, Music routing and cancellation leave other sounds working', async () => {
  const bytes = await readFile(new URL('../public/' + AUDIO_SOUNDS.win, import.meta.url));
  assert.equal(bytes.length, 82632);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'f0cf0be0c1cb3e061e12957d34300a49f24e5918feea6eb10e963997968046b7');
  const context = audioContext();
  context.createGain = () => ({ gain: { setValueAtTime(value) { this.value = value; } },
    connect(target) { this.target = target; return target; }, disconnect() {} });
  context.createBufferSource = () => ({ connect(gain) { this.gain = gain; return gain; }, disconnect() {},
    start(when, offset) { this.offset = offset; this.when = when; context.starts.push(this); },
    stop() { this.stopped = true; this.onended?.(); } });
  const audio = new ActionAudio(context, async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
  await audio.load(); audio.setMusic('battle'); const battle = audio.music;
  audio.setVolume('music', .42); audio.setVolume('sfx', 0); assert.equal(audio.play('win'), true);
  const win = audio.victory;
  assert.equal(battle.stopped, true); assert.equal(audio.music, null);
  assert.equal(win.buffer, audio.buffers.get('win')); assert.equal(win.loop, false);
  assert.equal(win.offset, 0); assert.equal(win.gain.target, audio.musicGain);
  assert.equal(win.gain.gain.value, .45 * 2); assert.equal(audio.musicGain.gain.value, .42);
  audio.stopVictory(); assert.equal(win.stopped, true); assert.equal(audio.victory, null);
  audio.play('win'); audio.stop(); assert.ok(context.starts.every(s => s.stopped));
  for (const failure of ['fetch', 'decode']) {
    const broken = new ActionAudio({ ...context, decodeAudioData: async bytes => {
      if (failure === 'decode' && new TextDecoder().decode(bytes) === AUDIO_SOUNDS.win) throw Error('bad codec');
      return { bytes };
    } }, async url => ({ ok: failure !== 'fetch' || url !== AUDIO_SOUNDS.win,
      arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
    await broken.load(); assert.equal(broken.ready, true); assert.equal(broken.buffers.has('win'), false);
    assert.equal(broken.play('win'), false); assert.equal(broken.play('attack'), true);
    broken.setMusic('lobby'); assert.ok(broken.music);
  }
});

test('help credits the exact replacement source without inventing rights clearance', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const help = html.match(/<section id="help-screen"[\s\S]*?<\/section>/)[0];
  assert.match(help, /https:\/\/www.youtube.com\/watch\?v=N2uyNC-Xz98/);
  assert.match(help, /SOUND EFFECTS HD/); assert.match(help, /disclaims ownership; redistribution rights are unverified/);
});
