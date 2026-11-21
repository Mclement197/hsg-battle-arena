import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, MOVES, RULES } from '../src/engine.mjs';

function fixture(options = {}) {
  let time = 100000;
  const arena = new Arena({ now: () => time, pick: () => 0, ...options });
  const room = arena.create();
  const host = arena.authenticate(room, room.hostToken);
  const a = arena.join(room, { nickname: 'A' });
  const b = arena.join(room, { nickname: 'B' });
  const viewers = { A: arena.authenticate(room, a.playerToken), B: arena.authenticate(room, b.playerToken) };
  const start = () => { arena.start(room, host, {}); time = room.prebattle.deadline; arena.advance(room); };
  const vote = move => arena.vote(room, viewers[room.turn.team], { turnId: room.turn.id, move });
  const resolve = move => { if (move) vote(move); time = room.turn.deadline; assert.equal(arena.advance(room), true); };
  return { arena, room, host, a, b, viewers, start, vote, resolve, setTime: value => { time = value; } };
}
const error = (code, status) => e => e.code === code && (!status || e.status === status);

test('fixed approved rules, lobby requirements and presenter-only controls', () => {
  assert.deepEqual(RULES, { turnMs: 15000, maxHp: 100, attack: 20, heal: 15, special: 30, specialCooldownOwnTurns: 3 });
  const f = fixture();
  assert.throws(() => f.arena.start(f.room, f.viewers.A, {}), error('role_required', 403));
  assert.throws(() => f.arena.reset(f.room, f.viewers.B, {}), error('role_required', 403));
  f.start(); assert.equal(f.room.turn.team, 'A'); assert.equal(f.room.turn.deadline, 122157);
  assert.throws(f.start, error('invalid_phase', 409));
  const arena = new Arena(); const room = arena.create();
  assert.throws(() => arena.start(room, { role: 'host' }, {}), error('not_enough_players'));
});

test('votes replace, wrong team/move/fields rejected, deadline strictly exclusive', () => {
  const f = fixture(); f.start();
  f.vote('attack'); f.vote('heal');
  assert.deepEqual(f.arena.counts(f.room), { attack: 0, defend: 0, heal: 1, special: 0 });
  assert.equal(f.arena.snapshot(f.room, f.viewers.A).you.vote, 'heal');
  assert.throws(() => f.arena.vote(f.room, f.viewers.B, { turnId: f.room.turn.id, move: 'attack' }), error('wrong_team', 403));
  assert.throws(() => f.vote('x'), error('invalid_vote', 400));
  assert.throws(() => f.arena.vote(f.room, f.viewers.A, { turnId: f.room.turn.id, move: 'attack', team: 'A' }), error('invalid_body'));
  f.setTime(f.room.turn.deadline - 1); f.vote('attack'); assert.equal(f.arena.advance(f.room), false);
  const old = f.room.turn.id; f.setTime(f.room.turn.deadline);
  assert.throws(() => f.vote('heal'), error('stale_turn', 409));
  f.arena.advance(f.room);
  assert.equal(f.room.teams.B.hp, 80); assert.equal(f.room.turn.team, 'B');
  assert.throws(() => f.arena.vote(f.room, f.viewers.A, { turnId: old, move: 'heal' }), error('stale_turn'));
});

test('random ties select every tied move via injected unbiased index, excluding zero votes', () => {
  for (const selected of [0, 1]) {
    const f = fixture(); const extra = f.arena.join(f.room, { nickname: 'Extra' }); f.start();
    f.vote('attack'); f.arena.vote(f.room, f.arena.authenticate(f.room, extra.playerToken), { turnId: f.room.turn.id, move: 'heal' });
    f.arena.pick = size => { assert.equal(size, 2); return selected; };
    f.resolve();
    assert.equal(f.room.lastResult.move, ['attack', 'heal'][selected]);
    assert.deepEqual(f.room.lastResult.tiedMoves, ['attack', 'heal']);
  }
});

test('entire team without votes randomly selects each available action only at the deadline', () => {
  for (const [selected, move] of MOVES.entries()) {
    const f = fixture(); f.start(); f.room.teams.A.hp = 80;
    let picks = 0;
    f.arena.pick = size => { assert.equal(size, MOVES.length); picks++; return selected; };
    const turnId = f.room.turn.id, deadline = f.room.turn.deadline;
    f.setTime(deadline - 1);
    assert.equal(f.arena.advance(f.room), false); assert.equal(picks, 0);
    assert.equal(f.room.lastResult, null);
    f.resolve();
    assert.equal(picks, 1); assert.equal(f.room.lastResult.move, move);
    assert.equal(f.room.lastResult.turnId, turnId); assert.equal(f.room.lastResult.resolvedAt, deadline);
    assert.equal(f.room.lastResult.totalVotes, 0); assert.deepEqual(f.room.lastResult.tiedMoves, []);
    assert.deepEqual(f.room.lastResult.voteCounts, { attack: 0, defend: 0, heal: 0, special: 0 });
    assert.equal(f.room.teams.B.hp, move === 'attack' ? 80 : move === 'special' ? 70 : 100);
    assert.equal(f.room.teams.A.hp, move === 'heal' ? 95 : 80);
    assert.equal(f.room.teams.A.shield, move === 'defend');
    assert.equal(f.room.teams.A.specialReadyOwnTurn, move === 'special' ? 5 : 0);
    assert.equal(f.room.turn.team, 'B'); assert.equal(f.room.turn.deadline, deadline + RULES.turnMs);
  }
});

test('no-vote random selection excludes special throughout cooldown and includes it when ready', () => {
  for (const [selected, move] of ['attack', 'defend', 'heal'].entries()) {
    const f = fixture(); f.start(); f.resolve('special');
    for (let own = 2; own <= 4; own++) {
      f.resolve('defend');
      assert.equal(f.room.teams.A.ownTurn, own);
      assert.deepEqual(f.arena.available(f.room), ['attack', 'defend', 'heal']);
      f.arena.pick = size => { assert.equal(size, 3); return selected; };
      f.resolve();
      assert.equal(f.room.lastResult.move, move); assert.equal(f.room.lastResult.totalVotes, 0);
      assert.equal(f.room.teams.A.specialReadyOwnTurn, 5);
      f.arena.pick = () => 0;
    }
    f.resolve('defend'); assert.equal(f.room.teams.A.ownTurn, 5);
    f.arena.pick = size => { assert.equal(size, 4); return 3; };
    f.resolve(); assert.equal(f.room.lastResult.move, 'special');
  }
});

test('one explicit vote is preserved for every action even if the rest of the team abstains', () => {
  for (const move of MOVES) {
    const f = fixture(); f.arena.join(f.room, { nickname: 'Abstaining teammate' }); f.start();
    f.arena.pick = size => { assert.equal(size, 1); return 0; };
    f.resolve(move);
    assert.equal(f.room.lastResult.move, move); assert.equal(f.room.lastResult.totalVotes, 1);
    assert.deepEqual(f.room.lastResult.tiedMoves, [move]);
    assert.equal(f.room.lastResult.voteCounts[move], 1);
  }
});

test('repeated explicit defend does not stack and shield consumed only by incoming damage', () => {
  const f = fixture(); f.start(); f.resolve('defend');
  assert.equal(f.room.lastResult.move, 'defend'); assert.deepEqual(f.room.lastResult.tiedMoves, ['defend']);
  assert.equal(f.room.teams.A.shield, true);
  f.resolve('heal'); f.resolve('defend'); f.resolve('attack');
  assert.equal(f.room.lastResult.damage, 10); assert.equal(f.room.teams.A.hp, 90); assert.equal(f.room.teams.A.shield, false);
  f.resolve('heal'); assert.equal(f.room.lastResult.healed, 10); assert.equal(f.room.teams.A.hp, 100);
  f.resolve('attack'); assert.equal(f.room.teams.A.hp, 80);
});

test('special deals 30, consumes shield at 15, blocks exactly next three own turns', () => {
  const f = fixture(); f.start(); f.resolve('special');
  assert.equal(f.room.teams.B.hp, 70); assert.equal(f.room.teams.A.specialReadyOwnTurn, 5);
  assert.equal(f.arena.snapshot(f.room, f.host).teams.A.specialCooldownRemaining, 4);
  for (let own = 2; own <= 4; own++) {
    f.resolve('defend');
    assert.equal(f.room.teams.A.ownTurn, own);
    assert.equal(f.arena.snapshot(f.room, f.host).teams.A.specialCooldownRemaining, 5 - own);
    assert.equal(f.arena.available(f.room).includes('special'), false);
    assert.throws(() => f.vote('special'), error('special_cooldown', 409));
    f.resolve('heal');
  }
  f.resolve('defend'); assert.equal(f.room.teams.A.ownTurn, 5);
  assert.equal(f.arena.available(f.room).includes('special'), true);
  f.resolve('special'); assert.equal(f.room.lastResult.damage, 15); assert.equal(f.room.teams.B.shield, false);
});

test('HP bounds and victory terminate immediately without another turn', () => {
  const f = fixture(); f.start(); f.resolve('heal'); assert.equal(f.room.lastResult.healed, 0);
  f.resolve('heal');
  for (let n = 0; n < 5; n++) { f.resolve('attack'); if (n < 4) f.resolve('attack'); }
  assert.equal(f.room.teams.B.hp, 0); assert.equal(f.room.teams.A.hp, 20);
  assert.equal(f.room.phase, 'finished'); assert.equal(f.room.winner, 'A'); assert.equal(f.room.turn, null);
  assert.equal(f.arena.advance(f.room), false);
  assert.throws(() => f.arena.vote(f.room, f.viewers.A, { turnId: '0:11', move: 'attack' }), error('invalid_phase'));
});

test('late joins balanced including disconnected slots, reconnect keeps identity, reset invalidates old turn', () => {
  const f = fixture(); f.start(); f.vote('attack');
  const ids = [...f.room.players.keys()]; const old = f.room.turn.id;
  const late = f.arena.join(f.room, { nickname: 'Late' });
  assert.equal(late.player.team, 'A'); assert.equal(f.arena.authenticate(f.room, f.a.playerToken).player, f.a.player);
  const second = f.arena.join(f.room, { nickname: 'Late 2' }); assert.equal(second.player.team, 'B');
  f.arena.reset(f.room, f.host, {});
  assert.equal(f.room.phase, 'lobby'); assert.equal(f.room.match, 1); assert.equal(f.room.lastResult, null);
  assert.equal(f.room.players.size, 4); assert.deepEqual([...f.room.players.keys()].slice(0, 2), ids);
  f.start(); assert.notEqual(f.room.turn.id, old); assert.equal(f.room.turn.votes.size, 0);
  assert.equal(f.room.teams.A.hp, 100); assert.equal(f.room.teams.A.specialReadyOwnTurn, 0);
  assert.throws(() => f.arena.vote(f.room, f.viewers.A, { turnId: old, move: 'attack' }), error('stale_turn'));
});

test('delayed tick opens full next turn, TTL and limits are bounded', () => {
  const f = fixture(); f.start(); f.setTime(500000); f.arena.advance(f.room);
  assert.equal(f.room.turn.number, 2); assert.equal(f.room.turn.deadline, 515000);
  const small = fixture({ maxRooms: 1, maxPlayers: 2, idleMs: 1000, lifetimeMs: 2000 });
  assert.throws(() => small.arena.create(), error('room_capacity', 503));
  assert.throws(() => small.arena.join(small.room, { nickname: 'Third' }), error('player_capacity', 503));
  small.setTime(100999); assert.equal(small.arena.expired(small.room), false);
  small.setTime(101000); assert.equal(small.arena.expired(small.room), true);
  small.arena.touch(small.room); assert.equal(small.arena.expired(small.room), false);
  small.setTime(102000); assert.equal(small.arena.expired(small.room), true);
});

test('nickname boundary validation and public state never contain credentials', () => {
  const f = fixture();
  for (const nickname of ['', ' ', 9, 'x'.repeat(25), 'A\u0000B', 'A\u202eB', '\ud800'])
    assert.throws(() => f.arena.join(f.room, { nickname }), error('invalid_nickname', 400));
  const user = f.arena.join(f.room, { nickname: '  😀'.repeat(1).trim() + ' '.repeat(2) });
  assert.equal(user.player.nickname, '😀');
  f.arena.join(f.room, { nickname: '<img src=x>' });
  for (const viewer of [f.host, f.viewers.A, f.viewers.B]) {
    const data = JSON.stringify(f.arena.snapshot(f.room, viewer));
    for (const secret of [f.room.hostToken, f.a.playerToken, f.b.playerToken]) assert.equal(data.includes(secret), false);
  }
  assert.throws(() => f.arena.authenticate(f.room, 'x'.repeat(43)), error('unauthorized', 401));
});

test('four-character crypto room codes keep long capabilities and player IDs', () => {
  const arena = new Arena();
  for (let i = 0; i < 50; i++) {
    const room = arena.create();
    assert.match(room.id, /^[A-HJ-NP-Z2-9]{4}$/);
    assert.match(room.hostToken, /^[A-Za-z0-9_-]{43}$/);
    const joined = arena.join(room, { nickname: 'Student' });
    assert.match(joined.player.id, /^[a-f0-9]{12}$/);
    assert.match(joined.playerToken, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(joined.playerToken, room.hostToken);
    assert.throws(() => arena.authenticate(room, room.id), error('unauthorized', 401));
  }
  assert.equal(arena.rooms.size, 50);
});

test('room code collisions retry, exhaustion is bounded and never overwrites a room', () => {
  const codes = ['K7MP', 'K7MP', 'R8TW'];
  const arena = new Arena({ newRoomCode: () => codes.shift() });
  const first = arena.create(), second = arena.create();
  assert.equal(first.id, 'K7MP'); assert.equal(second.id, 'R8TW');
  let attempts = 0;
  arena.newRoomCode = () => { attempts++; return first.id; };
  assert.throws(() => arena.create(), error('room_code_exhausted', 503));
  assert.equal(attempts, 32); assert.equal(arena.rooms.size, 2);
  assert.equal(arena.rooms.get(first.id), first);
  assert.equal(arena.rooms.get(second.id), second);
});
