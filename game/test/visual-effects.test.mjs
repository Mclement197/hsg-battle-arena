import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena } from '../src/engine.mjs';
import { ACTION_EFFECTS, CHARACTER_THEMES, characterTheme, createVisualCue } from '../public/app.js';

test('distinct move effects target the actor or opponent after authoritative deadline', () => {
  assert.deepEqual(Object.keys(ACTION_EFFECTS), ['attack', 'defend', 'heal', 'special']);
  for (const move of Object.keys(ACTION_EFFECTS)) {
    let now = 1000;
    const arena = new Arena({ now: () => now, pick: () => 0 });
    const room = arena.create();
    const a = arena.join(room, { nickname: 'Ace' });
    arena.join(room, { nickname: 'Dynamo' });
    const seen = [], cue = createVisualCue(effect => seen.push(effect));
    const read = () => cue(arena.snapshot(room, { role: 'player', player: a.player }));
    read(); arena.start(room, { role: 'host' }, {}); read(); now = room.prebattle.deadline; arena.advance(room); read();
    arena.vote(room, { role: 'player', player: a.player }, { turnId: room.turn.id, move }); read();
    now = room.turn.deadline; read();
    assert.deepEqual(seen, [], 'selection/local expiry cannot show ' + move);
    arena.advance(room); read(); read();
    assert.deepEqual(seen, [{ ...ACTION_EFFECTS[move], move, actorTeam: 'A', themeId: null, team: ['attack', 'special'].includes(move) ? 'B' : 'A' }]);
  }
});

test('dedupes reconnects, repeated/regressive results and match changes', () => {
  const seen = [], cue = createVisualCue(effect => seen.push(effect));
  const state = (roomId, match, number, move = 'attack', team = 'B') => ({
    roomId, match, phase: 'running', lastResult: number ? { number, move, team } : null
  });
  cue(state('one', 0, 3)); // Existing history after joining.
  cue(state('one', 0, 3)); cue(state('one', 0, 4));
  cue(state('one', 0, 3)); cue(state('one', 0, 4));
  assert.equal(seen.length, 1); assert.equal(seen[0].team, 'A');
  cue(state('one', 1, 0)); cue(state('one', 1, 1, 'heal', 'B'));
  assert.equal(seen[1].team, 'B');
  cue(state('two', 1, 7)); cue(state('two', 1, 8, 'defend', 'A'));
  assert.equal(seen.length, 3);
  const reopened = createVisualCue(effect => seen.push(effect));
  reopened(state('two', 1, 8, 'defend', 'A'));
  assert.equal(seen.length, 3);
});


test('all six themes cover four moves, resolve from actor identity rather than receiving fighter', () => {
  assert.equal(Object.keys(CHARACTER_THEMES).length, 6);
  for (const [characterId, theme] of Object.entries(CHARACTER_THEMES)) {
    assert.equal(characterTheme(characterId), theme);
    assert.deepEqual(Object.keys(theme.labels), Object.keys(ACTION_EFFECTS));
    for (const move of Object.keys(ACTION_EFFECTS)) {
      const seen = [], cue = createVisualCue(effect => seen.push(effect));
      const state = number => ({ roomId: characterId, match: 1, phase: 'running',
        teams: { A: { characterId: 'bad-teacher' }, B: { characterId } },
        lastResult: number ? { number, move, team: 'B' } : null });
      cue(state(0)); cue(state(0)); cue(state(1)); cue(state(1));
      assert.equal(seen.length, 1);
      assert.equal(seen[0].actorTeam, 'B');
      assert.equal(seen[0].team, ['attack', 'special'].includes(move) ? 'A' : 'B');
      assert.equal(seen[0].themeId, characterId);
    }
  }
});

test('unknown or absent identity keeps generic cue; history and local selection remain silent', () => {
  assert.equal(characterTheme('__proto__'), null);
  for (const teams of [undefined, { A: { characterId: 'unknown' } }]) {
    const seen = [], cue = createVisualCue(effect => seen.push(effect));
    const state = number => ({ roomId: 'room', match: 0, phase: 'running', teams,
      lastResult: number ? { number, team: 'A', move: 'attack' } : null });
    cue(state(4)); cue(state(4)); cue(state(5)); cue(state(5));
    assert.equal(seen.length, 1);
    assert.equal(seen[0].themeId, null);
  }
});
