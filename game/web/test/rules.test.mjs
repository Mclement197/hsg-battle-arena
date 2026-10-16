import test from 'node:test';
import assert from 'node:assert/strict';
import { newMatch, performMove, ARENAS, FIGHTERS } from '../rules.mjs';

test('requested selection catalog is present', () => {
  assert.deepEqual(ARENAS.map(a => a.name), ['Library', 'Trischli', 'Mensa B']);
  assert.equal(FIGHTERS.length, 6);
  assert.equal(FIGHTERS[1].name, 'The free rider in the group project');
});
test('turn alternates and damage is bounded', () => {
  const match = newMatch('luca', 'teacher');
  const after = performMove(match, 'attack');
  assert.deepEqual(after.hp, [100, 80]);
  assert.equal(after.turn, 1);
  assert.deepEqual(match.hp, [100, 100]);
  assert.deepEqual(performMove(after, 'attack').hp, [80, 80]);
});
test('guard halves next hit once', () => {
  let match = performMove(newMatch('luca', 'teacher'), 'guard');
  match = performMove(match, 'heavy');
  assert.equal(match.hp[0], 84);
  assert.equal(match.guarding[0], false);
  assert.equal(match.hp[1], 92);
});
test('heal caps at maximum and heavy attack costs HP', () => {
  let match = performMove(newMatch('luca', 'teacher'), 'heavy');
  assert.deepEqual(match.hp, [92, 68]);
  match = performMove(match, 'attack');
  match = performMove(match, 'heal');
  assert.deepEqual(match.hp, [90, 68]);
});
test('zero HP announces winner and freezes completed match', () => {
  let match = newMatch('luca', 'teacher');
  match = { ...match, hp: [10, 20] };
  const result = performMove(match, 'attack');
  assert.equal(result.winner, 0);
  assert.equal(result.hp[1], 0);
  assert.equal(performMove(result, 'attack'), result);
  assert.equal(performMove({ ...match, turn: 1 }, 'attack').winner, 1);
});
test('fighters must differ and unknown moves are rejected', () => {
  assert.throws(() => newMatch('luca', 'luca'));
  assert.throws(() => performMove(newMatch('luca', 'teacher'), 'teleport'));
});
