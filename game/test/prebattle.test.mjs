import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Arena, PREBATTLE_MS } from '../src/engine.mjs';
import { createBattleStartCue, prebattleLabel, present, ActionAudio } from '../public/app.js';
import { createHash } from 'node:crypto';

for (const mode of ['online', 'bot', 'friend']) test(mode + ': authoritative full intro, no early votes, delayed tick, replay', () => {
  let now = 1000;
  const arena = new Arena({ now: () => now, pick: () => 0 }), room = arena.create();
  if (mode === 'bot') arena.enableBot(room);
  else if (mode === 'friend') { arena.enableFriend(room); arena.join(room, { nickname: 'Guest' }); }
  else { arena.join(room, { nickname: 'A' }); arena.join(room, { nickname: 'B' }); }
  const host = { role: 'host' }, player = { role: 'player', player: [...room.players.values()][0] };
  for (let match = 0; match < 2; match++) {
    arena.start(room, host, {});
    assert.equal(room.phase, 'countdown'); assert.equal(room.turn, null);
    const state = arena.snapshot(room, player), deadline = room.prebattle.deadline;
    assert.equal(deadline - now, PREBATTLE_MS);
    assert.equal(present(state, true, 0).canVote, false);
    for (const [elapsed, label] of [[0,'3'],[999,'3'],[1000,'2'],[2000,'1'],[3000,'READY… FIGHT!'],[7156,'READY… FIGHT!']]) {
      now = state.prebattle.startedAt + elapsed;
      assert.equal(prebattleLabel(state, now), label);
      assert.equal(arena.advance(room), false);
      assert.throws(() => arena.vote(room, player, { turnId: match + ':1', move: 'attack' }), e => e.code === 'invalid_phase');
    }
    now = deadline + 200; assert.equal(arena.advance(room), true);
    assert.equal(room.phase, 'running'); assert.equal(room.turn.deadline, now + 15000);
    assert.equal(room.turn.number, 1); assert.equal(room.teams.A.ownTurn, 1); assert.equal(room.lastResult, null);
    assert.equal(arena.advance(room), false);
    arena.reset(room, host, {}); assert.equal(room.prebattle, null);
  }
});

test('start cues schedule voice then full Ready/Fight once; reconnect/late join cannot queue history', () => {
  const played = [], stops = [];
  const cue = createBattleStartCue((...args) => played.push(args), () => stops.push(1));
  const lobby = { roomId: 'x', match: 0, phase: 'lobby', serverNow: 1000 };
  const countdown = { ...lobby, phase: 'countdown', prebattle: { startedAt: 1000, readyAt: 4000, deadline: 8157 } };
  cue(lobby); cue(countdown); cue(countdown);
  assert.deepEqual(played, [['countdown', { offset: 0 }], ['battle-start', { delay: 3 }]]);
  cue.reset(); cue(countdown); assert.equal(played.length, 2);
  cue({ ...lobby, match: 1 }); cue({ ...countdown, match: 1, serverNow: 4500 });
  assert.equal(played.length, 2, 'delayed snapshot never starts Ready/Fight over turn one');
  cue({ ...lobby, match: 2 }); cue({ ...countdown, match: 2 });
  cue({ ...countdown, match: 2, phase: 'running', prebattle: null }); assert.ok(stops.length > 2);
});

test('requested full lobby source is intact PCM; voice has three real beats', async () => {
  const music = await readFile(new URL('../public/assets/audio/lobby-loop.wav', import.meta.url));
  assert.equal(createHash('sha256').update(music).digest('hex'), '393273797bd9c6bc198bd5fd1d84f22686986701423d1b2f24772dbb0a864ec4');
  assert.equal(music.readUInt32LE(24), 22050);
  assert.equal(music.readUInt16LE(22), 2);
  assert.ok(Math.abs((music.length - 44) / 88200 - 86.79621) < .001);
  assert.ok(music.length < 8 * 1024 * 1024, 'existing static server needs no restart');
  const voice = await readFile(new URL('../public/assets/audio/countdown.wav', import.meta.url));
  assert.equal(voice.readUInt32LE(24), 22050); assert.equal(voice.length, 44 + 22050 * 3 * 2);
  for (let beat = 0; beat < 3; beat++) {
    let energy = 0;
    for (let i = 0; i < 22050; i++) energy += voice.readInt16LE(44 + (beat * 22050 + i) * 2) ** 2;
    assert.ok(energy > 1000000);
  }
});

test('music and SFX use independent live gains, loop starts once and mute cancels queued sources', async () => {
  const sources = [], gains = [];
  const context = { state: 'running', currentTime: 10, destination: {},
    decodeAudioData: async () => ({}), createGain() { const gain = { gain: { setValueAtTime(v) { gain.value = v; } }, connect(target) { gain.target = target; return target; }, disconnect() {} }; gains.push(gain); return gain; },
    createBufferSource() { const source = { connect(gain) { source.gain = gain; return gain; }, start(...args) { source.args = args; }, stop() { source.stopped = true; source.onended?.(); }, disconnect() {} }; sources.push(source); return source; } };
  const audio = new ActionAudio(context, async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
  await audio.load(); audio.setLobby(true); audio.setLobby(true); assert.equal(sources.length, 1); assert.equal(sources[0].loop, true);
  audio.setVolume('music', 0); audio.setVolume('sfx', .7);
  assert.equal(audio.musicGain.value, 0); assert.equal(audio.sfxGain.value, .7);
  audio.play('battle-start', { delay: 3 }); assert.deepEqual(sources[1].args, [13, 0]);
  assert.equal(sources[1].gain.target, audio.sfxGain);
  audio.stop(); assert.ok(sources.every(source => source.stopped)); assert.equal(audio.music, null);
});

test('old server start stays audible across duplicate snapshots; missed new-server intro stays silent', () => {
  const played = [], stopped = [];
  const cue = createBattleStartCue(name => played.push(name), () => stopped.push(1));
  const state = { roomId: 'old', match: 0, phase: 'lobby' };
  cue(state); cue({ ...state, phase: 'running' });
  const stops = stopped.length;
  cue({ ...state, phase: 'running' });
  assert.deepEqual(played, ['battle-start']); assert.equal(stopped.length, stops);
  cue({ ...state, match: 1 }); cue({ ...state, match: 1, phase: 'running', prebattle: null });
  assert.deepEqual(played, ['battle-start']);
});
