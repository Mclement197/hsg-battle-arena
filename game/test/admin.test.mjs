import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Arena } from '../src/engine.mjs';
import { createGameServer } from '../src/server.mjs';

const ORIGIN = 'https://arena.example';
const OVERVIEW = '/game/api/admin/overview';
async function fixture(t, options = {}) {
  let time = 100000;
  const arena = new Arena({ now: () => time, pick: () => 0, ...options.arenaOptions });
  const game = createGameServer({ arena, publicOrigin: ORIGIN, autoTick: false, ...options });
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  t.after(() => game.close());
  const request = (url, headers = {}, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:' + game.server.address().port + url, { method, headers }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', x => text += x);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text,
        data: text && res.headers['content-type']?.startsWith('application/json') ? JSON.parse(text) : null }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('HTTP timed out')));
    req.on('error', reject); req.end(body);
  });
  const post = (url, body = {}, token, headers = {}) => request(url, {
    Origin: ORIGIN, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers
  }, 'POST', JSON.stringify(body));
  return { arena, game, request, post, setTime: n => time = n };
}
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), expected.sort());
function publicDto(data) {
  keys(data, ['rooms', 'serverNow', 'summary']);
  keys(data.summary, ['activeRooms', 'runningBattles', 'playersOnline', 'roomsUsed', 'roomCapacity']);
  for (const room of data.rooms) {
    keys(room, ['fighters', 'mode', 'phase', 'playerCount', 'roomNumber', 'turnNumber']);
    keys(room.fighters, ['A', 'B']);
    for (const fighter of Object.values(room.fighters)) keys(fighter, ['characterId', 'hp', 'maxHp']);
    assert.ok(Number.isInteger(room.roomNumber) && room.roomNumber > 0);
  }
}
function privateFree(value, secrets) {
  const serialized = JSON.stringify(value);
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, 'public response contains private sentinel');
}

test('public overview has an exact anonymous allowlist and never exposes room codes or participant data', async t => {
  const f = await fixture(t, { arenaOptions: { newRoomCode: () => 'Z9Q8' } });
  const created = (await f.post('/game/api/rooms')).data;
  const player = (await f.post('/game/api/rooms/' + created.roomId + '/join', { nickname: 'SENTINEL_NICK' })).data;
  const room = f.arena.rooms.get(created.roomId);
  f.arena.configure(room, { role: 'host' }, { arenaId: 'library', characterA: 'luca-di-grazia', characterB: 'free-rider' });
  const before = JSON.stringify(f.arena.snapshot(room, { role: 'host' }));
  const res = await f.request(OVERVIEW);
  assert.equal(res.status, 200); assert.equal(res.headers['cache-control'], 'no-store');
  publicDto(res.data);
  assert.equal(res.data.rooms[0].playerCount, 1);
  assert.equal(res.data.rooms[0].fighters.A.characterId, 'luca-di-grazia');
  privateFree(res.data, [created.roomId, created.roomId.slice(0, 2), created.hostToken, player.playerToken, 'SENTINEL_NICK', player.playerId]);
  assert.equal(JSON.stringify(f.arena.snapshot(room, { role: 'host' })), before, 'overview must not mutate gameplay state');
});

test('public overview and page need no admin key and ignore obsolete authorization', async t => {
  const f = await fixture(t);
  for (const headers of [{}, { Authorization: 'Bearer wrong' }, { Authorization: 'Basic x' }, { Authorization: 'Bearer ' + 'x'.repeat(43) }]) {
    const res = await f.request(OVERVIEW, headers);
    assert.equal(res.status, 200); publicDto(res.data); assert.deepEqual(res.data.rooms, []);
  }
  const page = await f.request('/game/admin/');
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.text, /type="password"|id="(?:login|logout|admin-key|show-codes)"/);
});

test('room numbers follow creation even before polling and remain stable across order changes and reset', async t => {
  const f = await fixture(t);
  const lobby = f.arena.create(), finished = f.arena.create(), countdown = f.arena.create(), running = f.arena.create();
  finished.phase = 'finished'; finished.lastResult = { number: 8 };
  countdown.phase = 'countdown';
  running.phase = 'running'; running.turn = { number: 2 };
  const first = (await f.request(OVERVIEW)).data;
  publicDto(first);
  assert.deepEqual(first.rooms.map(r => [r.roomNumber, r.phase, r.turnNumber]), [[3, 'countdown', null], [4, 'running', 2], [1, 'lobby', null], [2, 'finished', 8]]);
  assert.deepEqual(first.summary, { activeRooms: 3, runningBattles: 2, playersOnline: 0, roomsUsed: 4, roomCapacity: 50 });
  f.arena.reset(running, { role: 'host' }, {});
  const second = (await f.request(OVERVIEW)).data;
  assert.deepEqual(second.rooms.map(r => r.roomNumber), [3, 1, 4, 2]);
  assert.equal(lobby.phase, 'lobby');
});

test('expiry and reused room codes never recycle ordinals; unpolled short-lived rooms consume numbers', async t => {
  const codes = ['Z9Q8', 'W7V6', 'Z9Q8', 'T5S4'];
  const f = await fixture(t, { arenaOptions: { idleMs: 100, newRoomCode: () => codes.shift() } });
  f.arena.create();
  f.setTime(100050); const survivor = f.arena.create();
  f.setTime(100100); f.game.tick();
  assert.equal(f.arena.rooms.size, 1);
  const reused = f.arena.create();
  assert.equal(reused.id, 'Z9Q8');
  assert.deepEqual((await f.request(OVERVIEW)).data.rooms.map(r => r.roomNumber), [2, 3]);
  f.setTime(100201); f.game.tick();
  assert.equal(f.arena.rooms.size, 0);
  assert.deepEqual((await f.request(OVERVIEW)).data.rooms, []);
  const last = f.arena.create();
  assert.equal((await f.request(OVERVIEW)).data.rooms[0].roomNumber, 4);
  assert.notEqual(last, survivor);
});

test('overview errors use a minimal allowlist without echoing private input', async t => {
  const f = await fixture(t, { arenaOptions: { newRoomCode: () => 'Z9Q8' } });
  const created = (await f.post('/game/api/rooms')).data;
  const player = (await f.post('/game/api/rooms/' + created.roomId + '/join', { nickname: 'SENTINEL_NICK' })).data;
  const secrets = [created.roomId, created.roomId.slice(0, 2), created.hostToken, player.playerToken, player.playerId, 'SENTINEL_NICK'];
  for (const [url, headers, method, expected, code] of [
    [OVERVIEW + '?token=' + created.hostToken + '&room=' + created.roomId + '&nickname=SENTINEL_NICK', {}, 'GET', 400, 'query_forbidden'],
    [OVERVIEW, { Origin: 'https://evil.example/' + created.roomId }, 'GET', 403, 'origin_forbidden'],
    [OVERVIEW, { 'Sec-Fetch-Site': 'cross-site' }, 'GET', 403, 'origin_forbidden'],
    [OVERVIEW, { Authorization: 'Bearer ' + player.playerToken }, 'POST', 404, 'not_found']
  ]) {
    const res = await f.request(url, headers, method);
    assert.equal(res.status, expected); keys(res.data, ['error']); keys(res.data.error, ['code', 'message']);
    assert.equal(res.data.error.code, code); privateFree(res.data, secrets);
  }
});

test('public overview spends the general request quota, returns an exact retry countdown and recovers', async t => {
  const f = await fixture(t, { limits: { requestsPerMinute: 2 } });
  for (let i = 0; i < 2; i++) assert.equal((await f.request(OVERVIEW)).status, 200);
  let res = await f.request(OVERVIEW);
  assert.equal(res.status, 429); assert.equal(res.headers['retry-after'], '60');
  assert.deepEqual(res.data, { error: { code: 'rate_limit', message: 'Too many requests; retry in a minute' } });
  f.setTime(101001); res = await f.request(OVERVIEW);
  assert.equal(res.status, 429); assert.equal(res.headers['retry-after'], '59');
  f.setTime(160000); assert.equal((await f.request(OVERVIEW)).status, 200);
});

test('anonymous overview does not weaken origin checks or private game capability authorization', async t => {
  const f = await fixture(t);
  const room = (await f.post('/game/api/rooms')).data;
  const url = '/game/api/rooms/' + room.roomId;
  assert.equal((await f.request(OVERVIEW, { Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' })).status, 200);
  for (const action of ['state', 'events']) {
    for (const headers of [{}, { Authorization: 'Bearer wrong' }]) assert.equal((await f.request(url + '/' + action, headers)).status, 401);
  }
  for (const action of ['start', 'reset', 'configure', 'vote']) assert.equal((await f.post(url + '/' + action)).status, 401);
  assert.equal((await f.request(url + '/state', { Authorization: 'Bearer ' + room.hostToken })).status, 200);
  assert.equal((await f.request(url + '/state', { Authorization: 'Bearer ' + room.hostToken, Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.post(url + '/reset', {}, room.hostToken, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
});
