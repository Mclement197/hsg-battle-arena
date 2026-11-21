import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createActionCue } from '../public/app.js';
import { BattleWorld } from '../public/battle-world.js';
import { ABILITIES, actionSoundTiming } from '../public/battle-contract.js';
import { buildNamedSound } from '../public/assets/audio/generate.mjs';
const key = 'trischli-warrior:attack';
const initial = () => ({ roomId: 'dance', match: 1, phase: 'running', teams: { A: { characterId: 'trischli-warrior' }, B: { characterId: 'tryhard' } }, lastResult: null });
const result = number => ({ number, turnId: '1:' + number, team: 'A', move: 'attack', actorCharacterId: 'trischli-warrior' });
const event = r => ({ id: 'dance:1:' + r.turnId, ability: ABILITIES['trischli-warrior'].attack });
function fixture(options = {}) {
  const played = [], state = initial(); let stops = 0;
  const cue = createActionCue((move, o) => played.push(o), { presentation: true, stop: () => stops++, ...options });
  cue(state);
  return { cue, played, state, stops: () => stops, accept: (...results) => cue({ ...state, lastResult: results.at(-1), recentResults: results }) };
}

test('Approved Festival Techno with Puck voice is reproducible 2.2 second PCM with activity through approach, knees and return', async () => {
  const wav = await readFile(new URL('../public/assets/audio/trischli-warrior-attack.wav', import.meta.url));
  assert.deepEqual(wav, buildNamedSound('trischli-warrior', 'attack'));
  assert.deepEqual(wav, buildNamedSound('trischli-warrior', 'attack'));
  assert.equal(wav.length, 105644); assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readInt16LE(44), 0); assert.equal(wav.readInt16LE(wav.length - 2), 0);
  for (const [start, end] of [[.15,.35],[.4,.65],[.95,1.55],[1.75,2.15]]) {
    let energy = 0;
    for (let i = Math.round(start * 24000); i < end * 24000; i++) energy += (wav.readInt16LE(44 + i * 2) / 32768) ** 2;
    assert.ok(energy / ((end - start) * 24000) > .0005, 'active segment ' + start);
  }
  assert.deepEqual(actionSoundTiming('attack', key), { phase: .58, accent: 1.276 });
  assert.equal(ABILITIES['trischli-warrior'].attack.duration, 2200);
});
for (const frame of [{ elapsed: 0 }, { elapsed: 0, tableau: true }, { elapsed: 0, fallback: true }]) {
  test('full cue starts on the first own presentation, not receipt: ' + JSON.stringify(frame), () => {
    const f = fixture(), r = result(1); f.accept(r); f.accept(r);
    assert.equal(f.played.length, 0);
    f.cue.present(event(r), frame); f.cue.present(event(r), { elapsed: 1276 });
    assert.equal(f.played.length, 2); assert.equal(f.played[0].offset, 0); assert.equal(f.played[0].soundKey, key); assert.equal(f.played[1].soundKey, key + ':accent');
  });
}
test('queued identical dances start independently only on their own rendered onset', () => {
  const f = fixture(), a = result(1), b = result(2); f.accept(a, b);
  f.cue.present(event(a), { elapsed: 0 }); assert.equal(f.played.length, 1);
  f.cue.complete(event(a)); f.cue.present(event(b), { elapsed: 0 });
  assert.deepEqual(f.played.map(p => p.actionId), ['dance:1:1:1', 'dance:1:1:2']);
  assert.ok(f.played.every(p => p.offset === 0));
});
test('stalled first frames seek forward, never replay the whole score; a skipped window stays silent', () => {
  const f = fixture(), a = result(1); f.accept(a);
  f.cue.present(event(a), { elapsed: 900 }); assert.equal(f.played.length, 0);
  f.cue.present(event(a), { elapsed: 1276 }); assert.equal(f.played[0].offset, 1.276); assert.equal(f.played[1].soundKey, key + ':accent');
  const b = result(2); f.accept(b); f.cue.present(event(b), { elapsed: 1500 });
  f.cue.present(event(b), { elapsed: 0 }); assert.equal(f.played.filter(p => p.soundKey === key + ':accent').length, 1);
  const c = result(3); f.accept(c); f.cue.present(event(c), { elapsed: 2300, fallback: true });
  f.cue.present(event(c), { elapsed: 0, fallback: true }); assert.equal(f.played.filter(p => p.soundKey === key + ':accent').length, 1);
});
test('still tableaux seek elapsed time without extending a late score past the presentation', () => {
  const f = fixture(), r = result(1); f.accept(r); f.cue.present(event(r), { elapsed: 100, tableau: true });
  assert.equal(f.played[0].offset, .1);
});
test('missing personalized buffer freezes generic fallback and does not apply full-score handling', () => {
  let available = false;
  const f = fixture({ select: () => available ? key : 'attack' }), r = result(1); f.accept(r); available = true;
  f.cue.present(event(r), { elapsed: 0 }); assert.equal(f.played.length, 0);
  f.cue.present(event(r), { elapsed: 1276 }); assert.equal(f.played[0].soundKey, 'attack');
  assert.equal(f.played[0].offset, 0);
  const g = fixture({ select: () => 'attack' }), next = result(1); g.accept(next);
  g.cue.present(event(next), { fallback: true }); assert.equal(g.played[0].soundKey, 'attack'); assert.equal(g.played[0].offset, 0);
});
test('muted/suspended/hidden/loading history and cancelled queues cannot produce late whole-cue replay', () => {
  for (const reason of ['muted', 'suspended', 'hidden', 'loading']) {
    let ready = false;
    const f = fixture({ ready: () => ready }), a = result(1), b = result(2); f.accept(a); ready = true;
    f.cue.present(event(a), { tableau: true }); assert.equal(f.played.length, 0, reason);
    f.accept(b); f.cue.cancel(); f.cue.present(event(b), { fallback: true }); assert.equal(f.played.length, 0);
    f.cue.reset(); f.accept(b); f.cue.present(event(b), { elapsed: 0 }); assert.equal(f.played.length, 0, 'reconnect history');
  }
});
test('natural final completion preserves only an emitted tail; real cancellation still stops actions', () => {
  const f = fixture(), a = result(1), b = result(2); f.accept(a, b); f.cue.present(event(a), { elapsed: 0 });
  f.cue.complete(event(a)); const before = f.stops(); f.cue.cancel({ preserveTail: true });
  assert.equal(f.stops(), before); f.cue.present(event(b), { fallback: true }); assert.equal(f.played.length, 1);
  f.cue.cancel(); assert.equal(f.stops(), before + 1);
});

test('a renderer-blocked onset uses actual event age, never its stale zero sample', () => {
  for (const frame of [{ elapsed: 0 }, { elapsed: 0, tableau: true }]) {
    const f = fixture(), r = result(1); f.accept(r);
    const e = { ...event(r), startedAt: performance.now() - 2600 };
    f.cue.present(e, { ...frame, presentedAt: performance.now() - 2600 }); f.cue.present(event(r), { elapsed: 0 });
    assert.equal(f.played.length, 0, 'end-crossing stall is consumed, not replayed');
  }
  const f = fixture(), r = result(1); f.accept(r);
  const e = { ...event(r), startedAt: performance.now() - 120 };
  f.cue.present(e, { elapsed: 0 }); f.cue.present(e, { elapsed: 0 });
  assert.equal(f.played.length, 1); assert.ok(f.played[0].offset >= .12);
  assert.ok(f.played[0].offset < .3, 'seek only missed approach, without lengthening the cue');
});

test('a stalled renderer-failure label must not replay an expired full score', () => {
  const names = ['document', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'];
  const descriptors = Object.fromEntries(names.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  let w;
  try {
    let frame, now = 0;
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
    globalThis.document = { hidden: false, createElement: () => ({ remove() {} }) };
    globalThis.requestAnimationFrame = fn => { frame = fn; return 1; };
    globalThis.cancelAnimationFrame = () => {};
    const f = fixture(), r = result(1); f.accept(r);
    const e = { ...event(r), characterId: 'trischli-warrior', move: 'attack' };
    w = Object.create(BattleWorld.prototype);
    Object.assign(w, { generation: 1, events: { pending: [e] }, fighters: {}, container: { append() {} }, overview() {},
      onPresent: (e, frame) => f.cue.present(e, frame) });
    w.pumpFallback(); now = 2300; frame();
    assert.equal(f.played.length, 0, 'expired first-label callback cannot start a new 2.2-second score');
  } finally {
    w?.finish();
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

test('fallback onset is owned by each queued target, not receipt or first RAF; other moves keep no new epoch', () => {
  const names = ['document', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'];
  const descriptors = Object.fromEntries(names.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  let w;
  try {
    let now = 100, frame;
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
    globalThis.document = { hidden: false, createElement: () => ({ remove() {} }) };
    globalThis.requestAnimationFrame = fn => { frame = fn; return 1; }; globalThis.cancelAnimationFrame = () => {};
    const f = fixture(), a = result(1), b = result(2); f.accept(a, b);
    const events = [a, b].map(r => ({ ...event(r), characterId: 'trischli-warrior', move: 'attack' }));
    w = Object.create(BattleWorld.prototype);
    Object.assign(w, { generation: 1, events: { pending: [...events] }, fighters: {}, container: { append() { now += 5; } }, overview() {}, onPresent: (e, p) => f.cue.present(e, p) });
    w.pumpFallback(); assert.equal(events[0].startedAt, 105); now = 150; frame(); assert.equal(f.played[0].offset, .045); assert.equal(f.played[1].soundKey, key + ':accent');
    w.finish(); now = 5100; w.pumpFallback(); assert.equal(events[1].startedAt, 5105);
    now = 5150; frame(); assert.equal(f.played.length, 4); assert.equal(f.played[2].offset, .045); w.finish();
    for (const [characterId, abilities] of Object.entries(ABILITIES)) for (const move of Object.keys(abilities)) {
      if (characterId === 'trischli-warrior' && move === 'attack') continue;
      const e = { id: characterId + move, characterId, move, ability: abilities[move] };
      w.events.pending = [e]; w.pumpFallback(); assert.equal(Object.hasOwn(e, 'startedAt'), false, 'unchanged ' + characterId + move); w.finish();
    }
  } finally {
    w?.finish(); for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
