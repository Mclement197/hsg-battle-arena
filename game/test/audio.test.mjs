import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { ACTION_SOUNDS, ActionAudio, createActionCue, ArenaClient } from '../public/app.js';
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
    arena.start(room, host, {}); accept();
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
  snapshot(); arena.start(room, host, {}); snapshot();
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
  assert.deepEqual(urls, Object.values(ACTION_SOUNDS));
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

test('all four mapped audio URLs serve as WAV over HTTP, including HEAD; source/docs stay private', async t => {
  const get = await serve(t);
  for (const url of Object.values(ACTION_SOUNDS)) {
    const route = '/game/' + url.slice(2);
    const response = await get(route);
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'audio/wav');
    assert.deepEqual(response.body, await readFile(new URL('../public/' + url, import.meta.url)));
    const head = await get(route, 'HEAD');
    assert.equal(head.status, 200); assert.equal(head.body.length, 0);
  }
  for (const route of ['/game/assets/audio/generate.mjs', '/game/assets/audio/README.md',
    '/game/assets/audio/nested/attack-impact.wav', '/game/assets/audio/attack-impact.wav.bak',
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
      id, dataset: {}, handlers: {}, disabled: false, classList: { toggle() {}, remove() {} },
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute() {}, focus() {}, append() {}, replaceChildren() {},
      querySelector: selector => selector === 'img' ? null : element(id + selector)
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
    querySelectorAll: selector => selector === '[data-move]' ? buttons : [],
    createElement: id => element('new-' + id), createTextNode: text => ({ textContent: text }),
    addEventListener: (type, handler) => { handlers[type] = handler; },
    dispatchEvent: event => handlers[event.type]?.(event)
  };
  let tick;
  const sandbox = {
    document, window: { AudioContext: function () { return context; } },
    sessionStorage: { getItem: key => key.endsWith('active') ? JSON.stringify({ room: room.id, role: 'player' }) : 'token' },
    location: { origin: 'http://127.0.0.1', search: '' },
    URLSearchParams, AbortController, TextDecoder, TextEncoder,
    Date: { now }, setTimeout, clearTimeout, setInterval: callback => { tick = callback; },
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail; } },
    fetch: async (url, init) => {
      if (url.endsWith('/events')) return { ok: true, headers: { get: () => 'text/event-stream' }, body: { getReader: () => reader } };
      if (url.endsWith('.wav')) return { ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
      if (url.endsWith('/vote')) arena.vote(room, player, JSON.parse(init.body));
      return { ok: true, json: async () => ({ state: arena.snapshot(room, player) }) };
    }
  };
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  vm.runInNewContext(source.replace(/^export /gm, ''), sandbox);
  await flush();
  const send = async () => {
    readNext({ done: false, value: new TextEncoder().encode('event: state\ndata: ' + JSON.stringify(arena.snapshot(room, player)) + '\n\n') });
    await flush();
  };
  arena.start(room, host, {}); await send();
  assert.equal(context.starts.length, 0, 'sound starts muted');
  element('mute').handlers.click(); await flush();
  assert.equal(context.state, 'running', 'user gesture resumes context');
  assert.equal(context.oscillators.length, 2, 'existing enable/turn cue remains');
  buttons[0].handlers.click(); await flush();
  assert.equal(context.starts.length, 0, 'voting has no action audio');
  at(room.turn.deadline); tick();
  assert.equal(context.starts.length, 0, 'local expiry has no audio');
  arena.advance(room); await send();
  assert.equal(context.starts.length, 1);
  assert.equal(new TextDecoder().decode(context.starts[0].buffer.bytes), ACTION_SOUNDS.attack);
  await send(); assert.equal(context.starts.length, 1, 'repeated SSE snapshot cannot replay');
  element('mute').handlers.click();
  assert.ok(context.starts[0].stopped, 'mute stops an in-flight action');
  at(room.turn.deadline); arena.advance(room); await send();
  assert.equal(context.starts.length, 1, 'muted resolution remains silent');
  element('mute').handlers.click(); await flush(); await send();
  assert.equal(context.starts.length, 1, 'unmute does not replay history');
  room.teams.B.hp = 10; // Set up a winning attack.
  arena.vote(room, player, { turnId: room.turn.id, move: 'attack' });
  at(room.turn.deadline); arena.advance(room); await send();
  assert.equal(room.phase, 'finished');
  assert.equal(context.starts.length, 2, 'winning action still sounds');
  assert.equal(context.oscillators.length, 8, 'two enable cues plus the existing four-note win cue');
  await send(); assert.equal(context.starts.length, 2); assert.equal(context.oscillators.length, 8);
});
