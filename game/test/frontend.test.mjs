import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { ArenaClient, parseFrames, present, validRoom } from '../public/app.js';
import { createGameServer } from '../src/server.mjs';

const ORIGIN = 'http://127.0.0.1';
const storage = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key), map };
};
async function fixture(t) {
  const game = createGameServer({ publicOrigin: ORIGIN });
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  t.after(() => game.close());
  const base = 'http://127.0.0.1:' + game.server.address().port;
  const fetcher = (url, init = {}) => new Promise((resolve, reject) => {
    const req = http.request(base + url, { method: init.method || 'GET', headers: { Origin: ORIGIN, ...init.headers } }, res => {
      resolve(new Response(Readable.toWeb(res), { status: res.statusCode, headers: res.headers }));
    });
    const abort = () => req.destroy(new Error('aborted'));
    init.signal?.addEventListener('abort', abort, { once: true });
    req.on('error', reject);
    req.end(init.body);
  });
  return { fetcher };
}
async function until(check, ms = 2500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Timed out waiting for frontend state');
}

test('SSE parser accepts chunked CRLF and ignores heartbeat', () => {
  const frame = { buffer: '' }, received = [];
  parseFrames(': heartbeat\r', frame, value => received.push(value));
  parseFrames('\n\r\nevent: state\r\nid: 2\r\ndata: {"revision":2}\r\n\r\n', frame, value => received.push(value));
  assert.deepEqual(received, [{ revision: 2 }]);
});

test('real create/join/vote replacement/reconnect/reset with room-scoped browser sessions', { timeout: 10000 }, async t => {
  const { fetcher } = await fixture(t);
  const store = storage();
  const host = new ArenaClient({ fetcher, storage: store });
  const a = new ArenaClient({ fetcher, storage: store });
  const b = new ArenaClient({ fetcher, storage: storage() });
  t.after(() => { host.stop(); a.stop(); b.stop(); });
  const room = await host.create();
  assert.ok(validRoom(room.roomId));
  assert.equal(store.getItem(host.key(room.roomId, 'host')), room.hostToken);
  assert.equal(room.joinUrl.includes(room.hostToken), false);
  assert.equal(present(room.state, false, 0, ORIGIN).joinUrl, ORIGIN + '/game/?room=' + room.roomId);
  const joined = await a.join(room.roomId, 'Alex');
  await b.join(room.roomId, 'Bo');
  assert.equal(store.getItem(a.key(room.roomId, 'player')), joined.playerToken);
  assert.notEqual(room.hostToken, joined.playerToken);
  await until(() => host.state?.teams.A.playerCount && host.state?.teams.B.playerCount);
  const running = await host.mutate('start');
  assert.equal(running.phase, 'running');
  const teamA = joined.team === 'A' ? a : b;
  await teamA.mutate('vote', { turnId: running.turn.id, move: 'attack' });
  const replacement = await teamA.mutate('vote', { turnId: running.turn.id, move: 'heal' });
  assert.equal(replacement.turn.totalVotes, 1);
  assert.equal(replacement.you.vote, 'heal');
  const display = present(replacement, true, teamA.secondsLeft(), ORIGIN);
  assert.equal(display.votedMove, 'heal');
  assert.equal(display.canVote, true);
  teamA.stop();
  const reopened = new ArenaClient({ fetcher, storage: teamA === a ? store : b.storage });
  t.after(() => reopened.stop());
  assert.equal(await reopened.resume(reopened.remembered(room.roomId)), true);
  assert.equal(reopened.state.you.vote, 'heal');
  assert.equal(reopened.state.you.playerId, replacement.you.playerId);
  const reset = await host.mutate('reset');
  assert.equal(reset.phase, 'lobby');
  assert.equal(reset.teams.A.hp, 100);
  assert.equal(reset.players.length, 2);
  const other = await host.create();
  assert.notEqual(room.roomId, other.roomId);
  assert.equal(host.remembered(room.roomId)?.role, 'player'); // join links prefer room-specific player capability, not host
  assert.equal(host.remembered(other.roomId)?.role, 'host');
});

test('default browser fetch keeps Window receiver for create, join and SSE', { timeout: 10000 }, async t => {
  const { fetcher } = await fixture(t);
  const originalFetch = globalThis.fetch;
  let streams = 0;
  globalThis.fetch = function (url, init) {
    if (this !== globalThis) throw new TypeError('Can only call Window.fetch on instances of Window');
    if (url.endsWith('/events')) streams++;
    return fetcher(url, init);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const host = new ArenaClient({ storage: storage() });
  const player = new ArenaClient({ storage: storage() });
  t.after(() => { host.stop(); player.stop(); });
  const room = await host.create();
  await player.join(room.roomId, 'Student');
  await until(() => host.state?.players.length === 1 && player.state?.players.length === 1);
  assert.ok(streams >= 2, 'both clients opened their SSE streams');
});

test('host and player roles reject invalid frontend mutations', { timeout: 10000 }, async t => {
  const { fetcher } = await fixture(t);
  const host = new ArenaClient({ fetcher, storage: storage() });
  const phone = new ArenaClient({ fetcher, storage: storage() });
  t.after(() => { host.stop(); phone.stop(); });
  const room = await host.create();
  await phone.join(room.roomId, 'Student');
  await assert.rejects(phone.mutate('start'), /Not allowed/);
  await assert.rejects(host.mutate('vote', { turnId: 'x', move: 'attack' }), /Not allowed/);
  await assert.rejects(phone.mutate('vote', { turnId: 'x', move: 'attack' }), error => error.status === 409);
  assert.equal(phone.secondsLeft(), 0);
});

test('transport retries with bounded delay and never regresses to older snapshots', async () => {
  const delays = [];
  let client;
  client = new ArenaClient({
    fetcher: async () => { throw new Error('offline'); },
    storage: storage(),
    sleep: async ms => { delays.push(ms); client.stop(); }
  });
  const room = 'abcdef123456';
  client.activate(room, 'host', 'opaque-test-token');
  await until(() => delays.length === 1);
  assert.equal(delays[0], 500);
  client.room = room;
  client.accept({ roomId: room, revision: 3, serverNow: Date.now() });
  client.accept({ roomId: room, revision: 2, serverNow: Date.now() - 1 });
  assert.equal(client.state.revision, 3);
});
