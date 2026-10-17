import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fighterStats } from '../public/fighter-data.js';
import { Arena, CHARACTERS, ARENAS } from '../src/engine.mjs';
import { createGameServer } from '../src/server.mjs';
const host = { role: 'host' };
const setup = { arenaId: 'trischli', characterA: 'luca-di-grazia', characterB: 'bad-teacher' };
test('host setup validates IDs and roles, synchronizes identities, and survives reset', () => {
  const arena = new Arena({ pick: () => 0 }); const room = arena.create();
  const a = arena.join(room, { nickname: 'A' }); arena.join(room, { nickname: 'B' });
  assert.throws(() => arena.configure(room, { role: 'player', player: a.player }, setup), e => e.status === 403);
  for (const invalid of [{ ...setup, arenaId: '__proto__' }, { ...setup, characterA: 'unknown' }, { ...setup, extra: true }])
    assert.throws(() => arena.configure(room, host, invalid), e => e.status === 400);
  for (const arenaId of ARENAS) for (const characterA of CHARACTERS) arena.configure(room, host, { ...setup, arenaId, characterA });
  arena.configure(room, host, setup);
  const state = arena.snapshot(room, { role: 'player', player: a.player });
  assert.equal(state.arenaId, 'trischli'); assert.equal(state.teams.B.characterId, 'bad-teacher');
  arena.start(room, host, {});
  assert.throws(() => arena.configure(room, host, setup), e => e.status === 409);
  assert.throws(() => arena.play(room, host, { turnId: room.turn?.id || "0:1", move: 'attack' }), e => e.status === 409);
  arena.reset(room, host, {});
  assert.equal(room.teams.A.characterId, setup.characterA); assert.equal(room.teams.B.characterId, setup.characterB);
  assert.equal(room.players.size, 2); assert.equal(room.arenaId, 'trischli');
});
test('bot uses authoritative HP, cooldown, alternating turns, victory and replay', () => {
  let now = 0; const arena = new Arena({ now: () => now, pick: () => 0 }); const room = arena.create();
  arena.enableBot(room); arena.configure(room, host, setup); arena.start(room, host, {}); now = room.prebattle.deadline; arena.advance(room);
  assert.equal(room.mode, 'bot'); assert.equal(room.players.size, 2);
  assert.throws(() => arena.join(room, { nickname: 'Late' }), e => e.status === 409);
  assert.throws(() => arena.play(room, { role: 'player' }, {}), e => e.status === 403);
  arena.play(room, host, { turnId: room.turn.id, move: 'special' }); arena.advance(room);
  assert.equal(room.teams.B.hp, 100 - fighterStats(setup.characterA).special); assert.equal(room.turn.team, 'B');
  assert.throws(() => arena.play(room, host, { turnId: room.turn.id, move: 'attack' }), e => e.status === 403);
  now = room.turn.deadline; arena.advance(room);
  assert.equal(room.turn.team, 'A'); assert.equal(room.teams.A.hp, 100 - fighterStats(setup.characterB).attack);
  assert.throws(() => arena.play(room, host, { turnId: room.turn.id, move: 'special' }), e => e.status === 409);
  while (room.phase === 'running') {
    if (room.turn.team === 'A') arena.play(room, host, { turnId: room.turn.id, move: 'attack' });
    else now = room.turn.deadline;
    arena.advance(room);
  }
  assert.equal(room.winner, 'A'); assert.equal(room.teams.B.hp, 0);
  arena.reset(room, host, {}); arena.start(room, host, {}); now = room.prebattle.deadline; arena.advance(room);
  assert.equal(room.phase, 'running'); assert.equal(room.teams.B.hp, 100); assert.equal(room.mode, 'bot');
});
test('HTTP bot and configure endpoints keep authentication, origin and online contracts', async t => {
  const game = createGameServer({ publicOrigin: 'http://127.0.0.1' });
  await new Promise(r => game.server.listen(0, '127.0.0.1', r)); t.after(() => game.close());
  const request = (route, data, token, origin = 'http://127.0.0.1') => new Promise((resolve, reject) => {
    const body = JSON.stringify(data); const req = http.request({ host: '127.0.0.1', port: game.server.address().port, path: '/game/api/rooms' + route, method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } }, res => {
      let raw = ''; res.on('data', c => raw += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    }); req.on('error', reject); req.end(body);
  });
  assert.equal((await request('', { mode: 'online' })).status, 400);
  const bot = await request('', { mode: 'bot' }); assert.equal(bot.status, 201);
  const base = '/' + bot.body.roomId;
  assert.equal((await request(base + '/configure', setup)).status, 401);
  assert.equal((await request(base + '/configure', setup, bot.body.hostToken, 'https://evil.example')).status, 403);
  assert.equal((await request(base + '/configure', setup, bot.body.hostToken)).status, 200);
  assert.equal((await request(base + '/start', {}, bot.body.hostToken)).status, 200);
  const current = game.arena.rooms.get(bot.body.roomId);
  const introDeadline = current.prebattle.deadline; game.arena.now = () => introDeadline; game.tick();
  assert.equal((await request(base + '/play', { turnId: current.turn.id, move: 'attack' }, bot.body.hostToken)).status, 200);
  const online = await request('', {}); assert.equal(online.body.state.mode, 'online');
  const a = await request('/' + online.body.roomId + '/join', { nickname: 'A' });
  assert.equal((await request('/' + online.body.roomId + '/configure', setup, a.body.playerToken)).status, 403);
  assert.equal((await request('/' + online.body.roomId + '/play', {}, online.body.hostToken)).status, 409);
});
