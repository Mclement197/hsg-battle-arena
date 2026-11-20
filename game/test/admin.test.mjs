import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Arena } from '../src/engine.mjs';
import { createGameServer } from '../src/server.mjs';

const ORIGIN = 'https://arena.example';
async function fixture(t, options = {}) {
  let time = 100000;
  const arena = new Arena({ now: () => time, pick: () => 0 });
  const game = createGameServer({ arena, publicOrigin: ORIGIN, autoTick: false, ...options });
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  t.after(() => game.close());
  const request = (url, headers = {}) => new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:' + game.server.address().port + url, { headers }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', x => text += x);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text, data: text && JSON.parse(text) }));
    }); req.on('error', reject);
  });
  const post = (url, body = {}, token) => new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:' + game.server.address().port + url, { method: 'POST', headers: {
      Origin: ORIGIN, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {})
    } }, res => { let text = ''; res.setEncoding('utf8'); res.on('data', x => text += x); res.on('end', () => resolve({ status: res.statusCode, data: text && JSON.parse(text) })); });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
  return { arena, game, request, post, setTime: n => time = n };
}
const walk = value => value && typeof value === 'object' ? Object.entries(value).flatMap(([k,v]) => [k, ...walk(v)]) : [];

test('admin overview exposes only the documented room DTO and does not mutate arena', async t => {
  const f = await fixture(t, { adminKey: 'admin-sentinel-secret-value' });
  const room = await f.post('/game/api/rooms');
  const created = room.data;
  const player = await f.post('/game/api/rooms/' + created.roomId + '/join', { nickname: 'SENTINEL_NICK' });
  const before = JSON.stringify([...f.arena.rooms.values()].map(r => ({ revision:r.revision, players:r.players.size, phase:r.phase })));
  const res = await f.request('/game/api/admin/overview', { Authorization: 'Bearer admin-sentinel-secret-value' });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.data).sort(), ['rooms','serverNow','summary']);
  assert.deepEqual(Object.keys(res.data.rooms[0]).sort(), ['fighters','mode','phase','playerCount','roomCode','turnNumber']);
  assert.deepEqual(Object.keys(res.data.rooms[0].fighters.A).sort(), ['characterId','hp','maxHp']);
  assert.equal(res.data.rooms[0].playerCount, 1);
  const serialized = JSON.stringify(res.data);
  for (const secret of [created.hostToken, player.data.playerToken, 'SENTINEL_NICK', player.data.playerId]) assert.equal(serialized.includes(secret), false);
  assert.equal(JSON.stringify([...f.arena.rooms.values()].map(r => ({ revision:r.revision, players:r.players.size, phase:r.phase }))), before);
});

test('admin authentication errors, query rejection, disabled route and game-key separation', async t => {
  const f = await fixture(t, { adminKey: 'separate-admin-key' });
  for (const headers of [{}, { Authorization: 'Bearer wrong' }, { Authorization: 'Basic x' }]) {
    const r = await f.request('/game/api/admin/overview', headers);
    assert.equal(r.status, 401); assert.equal(JSON.stringify(r.data).includes('separate-admin-key'), false);
  }
  assert.equal((await f.request('/game/api/admin/overview?x=1', { Authorization: 'Bearer separate-admin-key' })).status, 400);
  const r = await f.post('/game/api/rooms');
  assert.equal((await f.request('/game/api/rooms/' + r.data.roomId + '/state', { Authorization: 'Bearer separate-admin-key' })).status, 401);
  const disabled = await fixture(t, { adminKey: '' }); // explicitly disabled
  assert.equal((await disabled.request('/game/api/admin/overview')).status, 404);
  assert.equal((await disabled.request('/game/admin/')).status, 404);
});

test('authentication locks after ten failures, including valid attempts until block expiry', async t => {
  const f = await fixture(t, { adminKey: 'recovery-key' });
  for (let i=0;i<10;i++) assert.equal((await f.request('/game/api/admin/overview', { Authorization:'Bearer bad' })).status, 401);
  const blocked = await f.request('/game/api/admin/overview', { Authorization:'Bearer recovery-key' });
  assert.equal(blocked.status, 429); assert.equal(blocked.headers['retry-after'], '300');
  f.setTime(400001);
  assert.equal((await f.request('/game/api/admin/overview', { Authorization:'Bearer recovery-key' })).status, 200);
});


test('admin failure window, exact block countdown, and successful auth clears failures', async t => {
  const f = await fixture(t, { adminKey: 'window-key' });
  for (let i=0;i<9;i++) assert.equal((await f.request('/game/api/admin/overview', { Authorization:'Bearer bad' })).status, 401);
  // A valid auth succeeds without waiting; it clears this client's failure history.
  assert.equal((await f.request('/game/api/admin/overview', { Authorization:'Bearer window-key' })).status, 200);
  for (let i=0;i<9;i++) assert.equal((await f.request('/game/api/admin/overview', { Authorization:'Bearer bad' })).status, 401);
  // Failures older than the one-minute window no longer count.
  f.setTime(160001);
  assert.equal((await f.request('/game/api/admin/overview', { Authorization:'Bearer bad' })).status, 401);
  for (let i=0;i<9;i++) assert.equal((await f.request('/game/api/admin/overview', { Authorization:'Bearer bad' })).status, 401);
  assert.equal((await f.request('/game/api/admin/overview', { Authorization:'Bearer bad' })).status, 429);
  f.setTime(160123);
  const countdown = await f.request('/game/api/admin/overview', { Authorization:'Bearer window-key' });
  assert.equal(countdown.status, 429);
  assert.equal(countdown.headers['retry-after'], '300');
  f.setTime(460001);
  assert.equal((await f.request('/game/api/admin/overview', { Authorization:'Bearer window-key' })).status, 200);
});

test('admin auth bucket capacity fails closed instead of evicting blocked clients', async t => {
  const f = await fixture(t, { adminKey: 'capacity-key', limits: { ipBuckets: 1 } });
  for (let i=0;i<10;i++) await f.request('/game/api/admin/overview', { Authorization:'Bearer invalid' });
  const blocked = await f.request('/game/api/admin/overview', { Authorization:'Bearer capacity-key' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['retry-after'], '300');
});

test('disabled admin fixture is explicitly configured with an empty key', async t => {
  const disabled = await fixture(t, { adminKey: '' });
  assert.equal((await disabled.request('/game/api/admin/overview')).status, 404);
  assert.equal((await disabled.request('/game/admin/')).status, 404);
});


test('overlapping anonymous quota preserves the longer admin block', async t => {
 const f = await fixture(t, { adminKey: 'overlap-fake-key', limits: { requestsPerMinute: 12 } });
 for (let i=0;i<10;i++) assert.equal((await f.request('/game/api/admin/overview', {Authorization:'Bearer wrong'})).status,401);
 for (let i=0;i<3;i++) {
  const r=await f.request('/game/api/admin/overview', {Authorization:'Bearer overlap-fake-key'});
  assert.equal(r.status,429); assert.equal(r.headers['retry-after'],'300');
 }
 f.setTime(400000);
 assert.equal((await f.request('/game/api/admin/overview', {Authorization:'Bearer overlap-fake-key'})).status,200);
});
