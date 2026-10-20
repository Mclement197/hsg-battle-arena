import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { Arena, CHARACTERS, MOVES } from '../src/engine.mjs';
import { FIGHTER_PROFILES, STAT_META, fighterStats, strengthScore, moveDescription } from '../public/fighter-data.js';
import { createGameServer } from '../src/server.mjs';
const err = (code, status) => e => e.code === code && e.status === status;
function fixture(a = 'luca-di-grazia', b = 'free-rider', mode = 'friend') {
  let now = 1000; const arena = new Arena({ now: () => now, pick: () => 0 }); const room = arena.create();
  if (mode === 'friend') arena.enableFriend(room);
  else { room.mode = mode; arena.join(room, { nickname: 'P1' }); }
  const guest = arena.join(room, { nickname: 'P2' });
  const host = arena.authenticate(room, room.hostToken), viewer = arena.authenticate(room, guest.playerToken);
  arena.configure(room, host, { arenaId: 'library', characterA: a, characterB: b });
  const start = () => { arena.start(room, host, {}); now = room.prebattle.deadline; arena.advance(room); };
  const resolve = move => {
    const active = [...room.players.values()].find(p => p.team === room.turn.team);
    arena.vote(room, { role: 'player', player: active }, { turnId: room.turn.id, move });
    now = room.turn.deadline; assert.equal(arena.advance(room), true);
  };
  return { arena, room, host, viewer, guest, start, resolve, at: t => { now = t; } };
}
test('six distinct four-command profiles; every axis varies, Luca strongest overall, units explicit', () => {
  assert.deepEqual(Object.keys(FIGHTER_PROFILES), CHARACTERS);
  assert.equal(new Set(CHARACTERS.map(id => JSON.stringify(fighterStats(id)))).size, 6);
  for (const move of MOVES) {
    assert.equal(new Set(CHARACTERS.map(id => fighterStats(id)[move])).size, 6);
    assert.ok(STAT_META[move].unit); assert.ok(STAT_META[move].max > 0);
  }
  for (const id of CHARACTERS) {
    const stats = fighterStats(id);
    for (const move of MOVES) { assert.ok(stats[move] > 0); assert.match(moveDescription(stats, move), new RegExp(String(stats[move]))); }
    for (const move of MOVES) assert.ok(stats[move] <= STAT_META[move].max);
    if (id !== 'luca-di-grazia') assert.ok(strengthScore('luca-di-grazia') > strengthScore(id));
  }
});
test('Luca has all four scale maxima in roster and authoritative moves, with existing guard and HP limits', () => {
  const maxima = { attack: 50, defend: 100, heal: 20, special: 50 };
  assert.deepEqual(Object.fromEntries(Object.entries(STAT_META).map(([move, meta]) => [move, meta.max])), maxima);
  assert.deepEqual(fighterStats('luca-di-grazia'), maxima);
  assert.equal(strengthScore('luca-di-grazia'), 4);
  const f = fixture(); f.start();
  assert.deepEqual(f.arena.snapshot(f.room, f.host).teams.A.stats, maxima);
  f.resolve('attack'); assert.equal(f.room.lastResult.damage, 50);
  f.resolve('special'); assert.equal(f.room.teams.A.hp, 70);
  f.resolve('heal'); assert.equal(f.room.lastResult.healed, 20); assert.equal(f.room.teams.A.hp, 90);
  f.resolve('heal');
  f.resolve('defend'); assert.equal(f.room.teams.A.shield, true);
  f.resolve('attack'); assert.equal(f.room.lastResult.damage, 1); assert.equal(f.room.teams.A.shield, false);
  f.resolve('heal'); assert.equal(f.room.lastResult.healed, 11); assert.equal(f.room.teams.A.hp, 100);
  f.resolve('heal');
  f.resolve('special'); assert.equal(f.room.lastResult.damage, 50);
  assert.equal(f.room.teams.A.specialReadyOwnTurn, f.room.teams.A.ownTurn + 4);
});
test('every displayed profile drives engine attack, special, heal and defend against every opponent', () => {
  for (const id of CHARACTERS) for (const opponent of CHARACTERS) {
    const f = fixture(id, opponent); f.start();
    assert.deepEqual(f.arena.snapshot(f.room, f.host).teams.A.stats, fighterStats(id));
    f.resolve('attack'); assert.equal(f.room.lastResult.damage, fighterStats(id).attack);
    f.resolve('heal'); assert.equal(f.room.lastResult.healed, Math.min(fighterStats(opponent).heal, fighterStats(id).attack));
    f.resolve('defend'); assert.equal(f.room.teams.A.shield, true);
    f.resolve('special'); assert.equal(f.room.lastResult.damage, Math.max(1, Math.round(fighterStats(opponent).special * (100 - fighterStats(id).defend) / 100)));
    assert.equal(f.room.teams.A.shield, false);
    f.resolve('special'); assert.equal(f.room.lastResult.damage, Math.min(fighterStats(id).special, f.room.teams.B.hp + f.room.lastResult.damage));
    assert.ok(f.room.lastResult.damage > 0);
  }
});
test('all pairs have nonzero defense counters; repeated attacks beat healing below attack power', () => {
  for (const a of CHARACTERS) for (const b of CHARACTERS) {
    for (const counter of ['heal', 'defend']) {
      const f = fixture(a, b); f.start(); let turns = 0;
      if (counter === 'heal' && fighterStats(b).heal >= fighterStats(a).attack) {
        for (let i = 0; i < 10; i++) { f.resolve('attack'); f.resolve('heal'); }
        assert.equal(f.room.phase, 'running'); assert.equal(f.room.teams.B.hp, 100);
        continue;
      }
      while (f.room.phase === 'running' && turns++ < 200) f.resolve(f.room.turn.team === 'A' ? 'attack' : counter);
      assert.equal(f.room.winner, 'A', a + ' vs ' + b + '/' + counter); assert.ok(turns < 200);
    }
  }
});
test('friend has exactly two online roles; host participates only as A; guest only as B; reset/reconnect preserve seats', () => {
  const f = fixture();
  assert.equal(f.room.players.size, 2); assert.equal(f.host.player.team, 'A'); assert.equal(f.viewer.player.team, 'B');
  assert.equal(f.arena.snapshot(f.room, f.host).you.team, 'A');
  assert.throws(() => f.arena.join(f.room, { nickname: 'Third' }), err('friend_full', 409));
  for (const action of ['start', 'reset']) assert.throws(() => f.arena[action](f.room, f.viewer, {}), err('role_required', 403));
  assert.throws(() => f.arena.configure(f.room, f.viewer, { arenaId: 'library', characterA: 'tryhard', characterB: 'tryhard' }), err('role_required', 403));
  f.start(); const old = f.room.turn.id;
  assert.throws(() => f.arena.vote(f.room, f.viewer, { turnId: old, move: 'attack' }), err('wrong_team', 403));
  assert.throws(() => f.arena.play(f.room, f.host, { turnId: old, move: 'attack', team: 'B' }), err('invalid_body', 400));
  f.arena.play(f.room, f.host, { turnId: old, move: 'attack' });
  assert.equal(f.arena.advance(f.room), true); assert.equal(f.room.turn.team, 'B');
  assert.throws(() => f.arena.play(f.room, f.host, { turnId: f.room.turn.id, move: 'attack' }), err('wrong_team', 403));
  assert.throws(() => f.arena.play(f.room, f.viewer, { turnId: f.room.turn.id, move: 'attack' }), err('role_required', 403));
  assert.equal(f.arena.authenticate(f.room, f.guest.playerToken).player.id, f.guest.player.id);
  f.arena.reset(f.room, f.host, {}); f.start(); assert.notEqual(f.room.turn.id, old); assert.equal(f.room.players.size, 2);
  assert.equal(f.arena.authenticate(f.room, f.room.hostToken).player.team, 'A');
});
test('HTTP distinct modes, friend capacity, capability authority, QR and authenticated SSE', async t => {
  const game = createGameServer({ publicOrigin: 'http://127.0.0.1', autoTick: false });
  await new Promise(r => game.server.listen(0, '127.0.0.1', r)); t.after(() => game.close());
  const base = 'http://127.0.0.1:' + game.server.address().port + '/game/';
  const raw = (pathname, data, token, event = false) => new Promise((resolve, reject) => {
    const req = http.request(base + pathname, { method: data === undefined ? 'GET' : 'POST', headers: { Origin: 'http://127.0.0.1', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) } }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; if (event && text.includes('event: state')) { resolve({ status: res.statusCode, text }); res.destroy(); } });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    }); req.on('error', reject); req.end(data === undefined ? undefined : JSON.stringify(data));
  });
  const request = async (route, data, token) => { const r = await raw('api/rooms' + route, data, token); return { status: r.status, body: JSON.parse(r.text) }; };
  for (const mode of ['friend', 'groups', 'bot']) { const r = await request('', { mode }); assert.equal(r.status, 201); assert.equal(r.body.state.mode, mode); }
  const { body: room } = await request('', { mode: 'friend' }); const route = '/' + room.roomId;
  assert.equal((await request(route + '/start', {}, room.hostToken)).status, 409);
  const guest = await request(route + '/join', { nickname: 'Guest' }); assert.equal(guest.body.team, 'B');
  assert.equal((await request(route + '/join', { nickname: 'Third' })).status, 409);
  assert.equal((await request(route + '/start', {}, guest.body.playerToken)).status, 403);
  assert.equal((await request(route + '/state')).status, 401);
  assert.equal((await request(route + '/reconnect', {}, guest.body.playerToken)).body.state.you.playerId, guest.body.playerId);
  const qr = await raw('api/rooms' + route + '/qr.svg'); assert.equal(qr.status, 200); assert.match(qr.text, /<svg/);
  const stream = await raw('api/rooms' + route + '/events', undefined, guest.body.playerToken, true);
  assert.equal(stream.status, 200); assert.match(stream.text, /event: state/); assert.equal(stream.text.includes(room.hostToken), false);
  assert.equal((await raw('fighter-data.js?v=proof')).status, 200);
});
