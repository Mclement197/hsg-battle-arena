import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import { Arena } from '../src/engine.mjs';
import { createGameServer, requestClientIp } from '../src/server.mjs';

const ORIGIN = 'https://arena.example';
async function fixture(t, options = {}) {
  let time = 100000;
  const arena = new Arena({ now: () => time, pick: () => 0, ...options.arenaOptions });
  const game = createGameServer({ arena, publicOrigin: ORIGIN, autoTick: false, ...options });
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  t.after(() => game.close());
  const base = 'http://127.0.0.1:' + game.server.address().port;
  const raw = (url, init = {}) => new Promise((resolve, reject) => {
    // Direct loopback only: native fetch can inherit the runner's outbound proxy.
    const req = http.request(base + url, { method: init.method ?? 'GET', headers: { ...(options.trustedCloudflare ? { 'CF-Connecting-IP': '198.51.100.2' } : {}), ...init.headers } }, res => {
      let txt = ''; res.setEncoding('utf8'); res.on('data', chunk => { txt += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: new Headers(res.headers), text: txt,
        data: txt && res.headers['content-type']?.startsWith('application/json') ? JSON.parse(txt) : null }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('HTTP timed out'))); req.on('error', reject); req.end(init.body);
  });
  const post = async (url, data = {}, credential, headers = {}) => {
    const result = await raw(url, { method: 'POST', headers: {
      Origin: ORIGIN, 'Content-Type': 'application/json', ...(credential ? { Authorization: 'Bearer ' + credential } : {}), ...headers
    }, body: JSON.stringify(data) });
    // Existing turn-focused regressions explicitly finish the new server intro.
    if (url.endsWith('/start') && result.status === 200) {
      assert.equal(result.data.state.phase, 'countdown');
      time = result.data.state.prebattle.deadline; game.tick();
      result.data.state = arena.snapshot(arena.rooms.get(result.data.state.roomId), { role: 'host' });
    }
    return result;
  };
  const create = async () => { const r = await post('/game/api/rooms'); assert.equal(r.status, 201, r.text); return r.data; };
  const join = async (room, nickname) => { const r = await post('/game/api/rooms/' + room.roomId + '/join', { nickname }); assert.equal(r.status, 201, r.text); return r.data; };
  const state = (room, credential) => raw('/game/api/rooms/' + room.roomId + '/state', { headers: { Authorization: 'Bearer ' + credential } });
  return { ...game, base, raw, post, create, join, state, setTime: value => { time = value; } };
}
function sse(base, roomId, credential, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(base + '/game/api/rooms/' + roomId + '/events', { headers: { Authorization: 'Bearer ' + credential, Origin: ORIGIN, ...headers } }, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('SSE status ' + res.statusCode)); }
      let buffer = '', ended = false;
      const queue = [], waiting = [];
      res.setEncoding('utf8');
      res.on('data', chunk => {
        buffer += chunk;
        while (buffer.includes('\n\n')) {
          const idx = buffer.indexOf('\n\n'); const frame = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
          if (!frame.startsWith('event: state')) continue;
          const data = JSON.parse(frame.split('\n').find(line => line.startsWith('data: ')).slice(6));
          if (waiting.length) waiting.shift().resolve(data); else queue.push(data);
        }
      });
      const end = () => { ended = true; for (const waiter of waiting.splice(0)) waiter.reject(new Error('SSE closed')); };
      res.on('end', end); res.on('close', end); res.on('error', end);
      resolve({ headers: res.headers, close: () => { req.destroy(); res.destroy(); }, next: () => {
        if (queue.length) return Promise.resolve(queue.shift());
        if (ended) return Promise.reject(new Error('SSE closed'));
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => { const i = waiting.indexOf(waiter); if (i >= 0) waiting.splice(i, 1); reject(new Error('SSE timed out')); }, 3000);
          const waiter = { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } };
          waiting.push(waiter);
        });
      }, until: async function (predicate) { for (let i = 0; i < 100; i++) { const data = await this.next(); if (predicate(data)) return data; } throw new Error('Too many SSE frames'); } });
    });
    req.on('error', reject);
  });
}
function rawRequest(base, url, { chunks = [], headers = {}, onWrite } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text) }));
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    if (onWrite) onWrite(req); else req.end();
  });
}

test('presenter plus multiple HTTP/SSE players: replacement, cutoff, reconnect, late join and reset', { timeout: 10000 }, async t => {
  const f = await fixture(t); const host = await f.create(); const url = '/game/api/rooms/' + host.roomId;
  const a = await f.join(host, 'Alex'); const b = await f.join(host, 'Bo');
  assert.equal(a.team, 'A'); assert.equal(b.team, 'B');
  const projector = await sse(f.base, host.roomId, host.hostToken); t.after(projector.close);
  const phone = await sse(f.base, host.roomId, a.playerToken); t.after(phone.close);
  assert.equal(projector.headers['x-accel-buffering'], 'no');
  await projector.until(s => s.players.some(p => p.id === a.playerId && p.connected));
  assert.equal((await phone.next()).you.playerId, a.playerId);
  const start = await f.post(url + '/start', {}, host.hostToken); assert.equal(start.status, 200);
  await projector.until(s => s.phase === 'running'); await phone.until(s => s.phase === 'running');
  const turnId = start.data.state.turn.id;
  assert.equal((await f.post(url + '/vote', { turnId, move: 'attack' }, a.playerToken)).status, 200);
  const replaced = await f.post(url + '/vote', { turnId, move: 'special' }, a.playerToken);
  assert.equal(replaced.data.state.turn.totalVotes, 1); assert.equal(replaced.data.state.turn.voteCounts.attack, 0);
  await projector.until(s => s.turn?.voteCounts.special === 1);
  phone.close();
  await projector.until(s => !s.players.find(p => p.id === a.playerId).connected);
  const reconnect = await f.post(url + '/reconnect', {}, a.playerToken);
  assert.equal(reconnect.status, 200); assert.equal(reconnect.data.playerId, a.playerId); assert.equal(reconnect.data.team, a.team);
  assert.equal(reconnect.data.state.you.vote, 'special'); assert.equal(reconnect.data.state.players.length, 2);
  const phone2 = await sse(f.base, host.roomId, a.playerToken, { 'Last-Event-ID': '-999' }); t.after(phone2.close);
  assert.equal((await phone2.next()).you.vote, 'special');
  const late = await f.join(host, 'Late'); assert.equal(late.team, 'A');
  f.setTime(start.data.state.turn.deadline);
  const cutoff = await f.post(url + '/vote', { turnId, move: 'heal' }, a.playerToken);
  assert.equal(cutoff.status, 409); assert.equal(cutoff.data.error.code, 'stale_turn');
  const result = await projector.until(s => s.lastResult?.turnId === turnId);
  assert.equal(result.teams.B.hp, 70); assert.equal(result.turn.team, 'B');
  assert.equal((await f.state(host, a.playerToken)).data.state.you.vote, null);
  const reset = await f.post(url + '/reset', {}, host.hostToken);
  assert.equal(reset.status, 200); assert.equal(reset.data.state.phase, 'lobby'); assert.equal(reset.data.state.players.length, 3);
  await phone2.until(s => s.phase === 'lobby');
  const restarted = await f.post(url + '/start', {}, host.hostToken);
  assert.notEqual(restarted.data.state.turn.id, turnId);
  assert.equal((await f.post(url + '/vote', { turnId, move: 'attack' }, a.playerToken)).status, 409);
  for (const state of [result, reconnect.data.state, reset.data.state]) {
    const serialized = JSON.stringify(state);
    for (const secret of [host.hostToken, a.playerToken, b.playerToken, late.playerToken]) assert.equal(serialized.includes(secret), false);
  }
});

test('student cannot start/reset/impersonate, host cannot vote, capabilities are room scoped', async t => {
  const f = await fixture(t); const room = await f.create(); const other = await f.create(); const a = await f.join(room, 'A'); const b = await f.join(room, 'B');
  const url = '/game/api/rooms/' + room.roomId;
  for (const action of ['start', 'reset']) assert.equal((await f.post(url + '/' + action, {}, a.playerToken)).status, 403);
  assert.equal((await f.post(url + '/start', {}, room.hostToken)).status, 200);
  const turnId = (await f.state(room, room.hostToken)).data.state.turn.id;
  assert.equal((await f.post(url + '/vote', { turnId, move: 'attack' }, b.playerToken)).status, 403);
  assert.equal((await f.post(url + '/vote', { turnId, move: 'attack' }, room.hostToken)).status, 403);
  assert.equal((await f.post(url + '/vote', { turnId, move: 'attack', team: 'A' }, b.playerToken)).status, 400);
  assert.equal((await f.post(url + '/reset', {}, other.hostToken)).status, 401);
  assert.equal((await f.state(room, 'x'.repeat(43))).status, 401);
  assert.equal((await f.raw(url + '/state')).status, 401);
  assert.equal((await f.raw(url + '/events?token=' + a.playerToken)).status, 400);
  assert.equal((await f.post(url + '/reconnect', {}, room.hostToken)).status, 403);
  assert.equal((await f.post(url + '/join', { nickname: 'C', hostToken: room.hostToken })).status, 400);
});

test('configured origin and local QR ignore forged host/forwarded headers; strict cross-site rejection', async t => {
  const f = await fixture(t);
  const r = await f.post('/game/api/rooms', {}, undefined, { 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'http' });
  assert.equal(r.status, 201); const room = r.data;
  assert.equal(room.joinUrl, ORIGIN + '/game/?room=' + room.roomId); assert.equal(room.joinUrl.includes(room.hostToken), false);
  const qr = await f.raw(room.qrUrl, { headers: { 'X-Forwarded-Host': 'evil.example' } }); assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('content-type'), 'image/svg+xml'); assert.equal(qr.text.includes(room.hostToken), false);
  assert.equal(qr.text, await QRCode.toString(room.joinUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 256 }));
  assert.equal((await f.post('/game/api/rooms', {}, undefined, { Origin: 'https://evil.example', 'X-Forwarded-Host': 'arena.example' })).status, 403);
  assert.equal((await f.post('/game/api/rooms', {}, undefined, { Origin: 'null' })).status, 403);
  assert.equal((await f.post('/game/api/rooms', {}, undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal(qr.headers.get('access-control-allow-origin'), null);
  for (const origin of ['https://example.com/path', 'https://user:pass@example.com', 'file:///tmp/a', 'https://example.com/#hash'])
    assert.throws(() => createGameServer({ publicOrigin: origin }));
});

test('public GET/HEAD entry, assets and QR accept browser navigation from any site without CORS', async t => {
  const f = await fixture(t, { trustedCloudflare: true }); const room = await f.create();
  const pages = ['/game/', '/game/index.html', '/game/?room=' + room.roomId,
    '/game/app.js', '/game/styles.css', '/game/assets/arena-mark.svg', room.qrUrl];
  for (const site of ['cross-site', 'none', 'same-site', 'same-origin']) {
    for (const origin of [undefined, 'null', 'https://discord.com', ORIGIN]) {
      const headers = { 'Sec-Fetch-Site': site, 'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document', Referer: 'https://discord.com/channels/example',
        ...(origin === undefined ? {} : { Origin: origin }) };
      for (const method of ['GET', 'HEAD']) {
        const redirect = await f.raw('/game?room=' + room.roomId, { method, headers });
        assert.equal(redirect.status, 308); assert.equal(redirect.headers.get('location'), '/game/?room=' + room.roomId);
        for (const url of pages) {
          const r = await f.raw(url, { method, headers });
          assert.equal(r.status, 200, method + ' ' + url + ' ' + site + ' ' + origin);
          assert.equal(r.headers.get('access-control-allow-origin'), null);
          assert.equal(r.headers.get('cache-control'), 'no-store');
          if (method === 'HEAD') assert.equal(r.text, '');
          else if (url.startsWith('/game/?') || url === '/game/') assert.match(r.headers.get('content-type'), /text\/html/);
        }
      }
    }
  }
  // Same-origin document subresources use fetch modes other than navigate.
  for (const [url, mode, dest] of [['/game/app.js', 'cors', 'script'], ['/game/styles.css', 'no-cors', 'style'], [room.qrUrl, 'no-cors', 'image']])
    assert.equal((await f.raw(url, { headers: { 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': mode, 'Sec-Fetch-Dest': dest } })).status, 200);
});

test('public navigation exception never bypasses mutation, private API, SSE or static-file boundaries', async t => {
  const f = await fixture(t); const room = await f.create(); const a = await f.join(room, 'A'); await f.join(room, 'B');
  const url = '/game/api/rooms/' + room.roomId;
  const started = await f.post(url + '/start', {}, room.hostToken);
  const badHeaders = [
    { 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'null' }, { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-site' }
  ];
  for (const bad of badHeaders) {
    const headers = { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', Referer: 'https://discord.com/', ...bad };
    for (const [path, body, token] of [
      ['/game/api/rooms', {}, undefined], [url + '/join', { nickname: 'Blocked' }, undefined],
      [url + '/start', {}, room.hostToken], [url + '/reset', {}, room.hostToken],
      [url + '/reconnect', {}, a.playerToken], [url + '/vote', { turnId: started.data.state.turn.id, move: 'attack' }, a.playerToken],
      ['/game/', {}, undefined], [room.qrUrl, {}, undefined]
    ]) {
      const r = await f.raw(path, { method: 'POST', headers: { 'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: JSON.stringify(body) });
      assert.equal(r.status, 403, path); assert.equal(r.data.error.code, 'origin_forbidden');
    }
    for (const action of ['state', 'events']) {
      const r = await f.raw(url + '/' + action, { headers: { Authorization: 'Bearer ' + room.hostToken, ...headers } });
      assert.equal(r.status, 403); assert.equal(r.data.error.code, 'origin_forbidden');
    }
  }
  for (const action of ['state', 'events']) {
    assert.equal((await f.raw(url + '/' + action)).status, 401);
    assert.equal((await f.raw(url + '/' + action, { method: 'HEAD', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  }
  for (const path of ['/game/.env', '/game/src/server.mjs', '/game/assets/nested/file.svg', '/game/%2e%2e/secret', room.qrUrl + '?token=bad'])
    assert.notEqual((await f.raw(path, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 200);
  const state = (await f.state(room, room.hostToken)).data.state;
  assert.equal(state.phase, 'running'); assert.equal(state.players.length, 2); assert.equal(state.turn.totalVotes, 0);
  assert.equal(f.arena.rooms.size, 1);
  const stream = await sse(f.base, room.roomId, room.hostToken, { 'Sec-Fetch-Site': 'same-origin' }); t.after(stream.close);
  assert.equal((await stream.next()).phase, 'running');
});

test('JSON parser bounds bytes/chunked/UTF8, validates schema and MIME, no reflected errors', async t => {
  const f = await fixture(t); const url = '/game/api/rooms';
  for (const input of [null, [], { unknown: 'secret-not-reflected' }]) {
    const r = await f.post(url, input); assert.equal(r.status, 400); assert.equal(r.text.includes('secret-not-reflected'), false);
  }
  assert.equal((await f.raw(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await f.raw(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await f.raw(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body: '{}' })).status, 415);
  const oversized = await f.post(url, { nickname: 'x'.repeat(2200) }); assert.equal(oversized.status, 413);
  assert.equal((await rawRequest(f.base, url, { chunks: ['x'.repeat(1024), 'x'.repeat(1025)] })).status, 413);
  assert.equal((await rawRequest(f.base, url, { chunks: [Buffer.from([0xff])] })).status, 400);
  assert.equal(f.arena.rooms.size, 0);
});

test('deadline sweep resolves an untouched team with a random action and broadcasts it over SSE', async t => {
  const f = await fixture(t); const host = await f.create();
  await f.join(host, 'A'); await f.join(host, 'B');
  const url = '/game/api/rooms/' + host.roomId;
  const projector = await sse(f.base, host.roomId, host.hostToken); t.after(projector.close);
  await projector.next();
  const start = await f.post(url + '/start', {}, host.hostToken);
  await projector.until(s => s.phase === 'running');
  const { id: turnId, deadline } = start.data.state.turn;
  f.arena.pick = size => { assert.equal(size, 4); return 3; };
  f.setTime(deadline - 1); f.tick();
  const before = (await f.state(host, host.hostToken)).data.state;
  assert.equal(before.turn.id, turnId); assert.equal(before.lastResult, null);
  f.setTime(deadline); f.tick();
  const state = await projector.until(s => s.lastResult?.turnId === turnId);
  assert.equal(state.lastResult.move, 'special'); assert.equal(state.lastResult.totalVotes, 0);
  assert.deepEqual(state.lastResult.tiedMoves, []); assert.equal(state.lastResult.resolvedAt, deadline);
  assert.equal(state.teams.B.hp, 70); assert.equal(state.teams.A.specialReadyOwnTurn, 5);
  assert.equal(state.turn.team, 'B'); assert.equal(state.turn.deadline, deadline + 15000);
});

test('slow request began before cutoff but completed at deadline cannot vote', async t => {
  const f = await fixture(t); const host = await f.create(); const a = await f.join(host, 'A'); await f.join(host, 'B');
  const url = '/game/api/rooms/' + host.roomId;
  const start = await f.post(url + '/start', {}, host.hostToken);
  const r = await rawRequest(f.base, url + '/vote', { headers: { Authorization: 'Bearer ' + a.playerToken },
    chunks: ['{"turnId":"' + start.data.state.turn.id + '",'], onWrite: req => {
      f.setTime(start.data.state.turn.deadline); req.end('"move":"attack"}');
    } });
  assert.equal(r.status, 409);
  const state = (await f.state(host, host.hostToken)).data.state;
  assert.equal(state.lastResult.move, 'attack'); assert.equal(state.lastResult.totalVotes, 0); assert.equal(state.teams.B.hp, 80);
  assert.equal(state.turn.team, 'B'); assert.equal(state.lastResult.resolvedAt, start.data.state.turn.deadline);
});

test('24 concurrent HTTP players balanced; simultaneous repeated votes remain one per player; complete match', async t => {
  const f = await fixture(t); const host = await f.create(); const url = '/game/api/rooms/' + host.roomId;
  const players = await Promise.all(Array.from({ length: 24 }, (_, n) => f.join(host, 'Player ' + n)));
  assert.equal(players.filter(p => p.team === 'A').length, 12);
  assert.equal(players.filter(p => p.team === 'B').length, 12);
  let state = (await f.post(url + '/start', {}, host.hostToken)).data.state;
  while (state.phase === 'running') {
    const active = players.filter(p => p.team === state.turn.team);
    const responses = await Promise.all(active.flatMap(player => Array.from({ length: 2 }, () =>
      f.post(url + '/vote', { turnId: state.turn.id, move: 'attack' }, player.playerToken))));
    assert.equal(responses.every(r => r.status === 200), true);
    state = (await f.state(host, host.hostToken)).data.state;
    assert.equal(state.turn.totalVotes, 12); assert.equal(state.turn.voteCounts.attack, 12);
    f.setTime(state.turn.deadline); f.tick(); state = (await f.state(host, host.hostToken)).data.state;
  }
  assert.equal(state.winner, 'A'); assert.equal(state.teams.B.hp, 0); assert.equal(state.teams.A.hp, 20);
});

test('static allowlist, path traversal, symlinks and security headers; base redirect preserves student room', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-static-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'public', 'assets'), { recursive: true });
  await writeFile(path.join(dir, 'public', 'index.html'), '<h1>Fixture</h1>');
  await writeFile(path.join(dir, 'secret.txt'), 'PRIVATE');
  await writeFile(path.join(dir, 'public', '.env'), 'PRIVATE');
  await symlink(path.join(dir, 'secret.txt'), path.join(dir, 'public', 'app.js'));
  await symlink(path.join(dir, 'secret.txt'), path.join(dir, 'public', 'assets', 'leak.svg'));
  await writeFile(path.join(dir, 'public', 'assets', 'fighter.svg'), '<svg/>');
  const f = await fixture(t, { publicDir: path.join(dir, 'public') });
  const index = await f.raw('/game/'); assert.equal(index.status, 200); assert.equal(index.text, '<h1>Fixture</h1>');
  assert.equal(index.headers.get('cache-control'), 'no-store'); assert.equal(index.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(index.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal((await f.raw('/game/assets/fighter.svg')).status, 200);
  for (const url of ['/game/.env', '/game/package.json', '/game/app.js', '/game/assets/leak.svg', '/game/%2e%2e/secret.txt', '/game/assets/%2eleak.svg', '/game/assets/nested/file.svg', '/game/assets/file.html', '/game/src/server.mjs'])
    assert.equal((await f.raw(url)).status, 404, url);
  const redirect = await f.raw('/game?room=abc');
  assert.equal(redirect.status, 308); assert.equal(redirect.headers.get('location'), '/game/?room=abc');
});

test('stream per-credential/room/global limits and identity survives parallel tabs', async t => {
  const f = await fixture(t, { limits: { streamsPerRoom: 3, streamsTotal: 3 } });
  const host = await f.create(); const a = await f.join(host, 'A'); const url = '/game/api/rooms/' + host.roomId;
  const one = await sse(f.base, host.roomId, a.playerToken); t.after(one.close); await one.next();
  const two = await sse(f.base, host.roomId, a.playerToken); t.after(two.close); await two.next();
  assert.equal((await f.raw(url + '/events', { headers: { Authorization: 'Bearer ' + a.playerToken } })).status, 429);
  const presenter = await sse(f.base, host.roomId, host.hostToken); t.after(presenter.close); await presenter.next();
  assert.equal((await f.raw(url + '/events', { headers: { Authorization: 'Bearer ' + host.hostToken } })).status, 429);
  one.close(); await presenter.until(s => s.players[0].connected);
  assert.equal((await f.state(host, a.playerToken)).data.state.players[0].connected, true);
  two.close(); await presenter.until(s => !s.players[0].connected);
  assert.equal((await f.post(url + '/reconnect', {}, a.playerToken)).data.playerId, a.playerId);
});

test('rate limits, room/player capacities, idle expiration closes SSE and readonly polling cannot extend TTL', async t => {
  const f = await fixture(t, { arenaOptions: { maxRooms: 1, maxPlayers: 2, idleMs: 1000, lifetimeMs: 3000 }, limits: { mutationsPerMinute: 2 } });
  const host = await f.create(); const a = await f.join(host, 'A'); await f.join(host, 'B'); const url = '/game/api/rooms/' + host.roomId;
  assert.equal((await f.post('/game/api/rooms')).status, 503);
  assert.equal((await f.post(url + '/join', { nickname: 'Third' })).status, 503);
  assert.equal((await f.post(url + '/reconnect', {}, a.playerToken)).status, 200);
  assert.equal((await f.post(url + '/reconnect', {}, a.playerToken)).status, 200);
  const throttled = await f.post(url + '/reconnect', {}, a.playerToken);
  assert.equal(throttled.status, 429); assert.equal(throttled.headers.get('retry-after'), '60');
  const stream = await sse(f.base, host.roomId, host.hostToken); t.after(stream.close); await stream.next();
  f.setTime(100999); assert.equal((await f.state(host, host.hostToken)).status, 200);
  f.setTime(101000); f.tick(); assert.equal(f.arena.rooms.size, 0);
  await assert.rejects(stream.next(), /SSE closed/);
  assert.equal((await f.state(host, host.hostToken)).status, 404);
  assert.equal((await f.post(url + '/reconnect', {}, a.playerToken)).status, 404);
  assert.equal((await f.post('/game/api/rooms')).status, 201);
});

test('socket-IP rate limit ignores X-Forwarded-For and creation window expires', async t => {
  const f = await fixture(t, { limits: { requestsPerMinute: 3, createsPerMinute: 1 } });
  assert.equal((await f.post('/game/api/rooms')).status, 201);
  assert.equal((await f.post('/game/api/rooms', {}, undefined, { 'X-Forwarded-For': '1.2.3.4' })).status, 429);
  assert.equal((await f.raw('/unknown')).status, 404);
  assert.equal((await f.raw('/unknown', { headers: { 'X-Forwarded-For': '9.9.9.9' } })).status, 429);
  f.setTime(160000); assert.equal((await f.post('/game/api/rooms')).status, 201);
});


test('interrupted JSON body cannot crash server or create an incomplete room', { timeout: 3000 }, async t => {
  const f = await fixture(t);
  const socket = net.createConnection({ host: '127.0.0.1', port: f.server.address().port });
  t.after(() => socket.destroy()); socket.on('error', () => {});
  const arrived = new Promise(resolve => f.server.once('request', req => req.once('data', resolve)));
  await new Promise(resolve => socket.once('connect', resolve));
  socket.write('POST /game/api/rooms HTTP/1.1\r\nHost: arena.example\r\nOrigin: ' + ORIGIN + '\r\nContent-Type: application/json\r\nContent-Length: 10\r\n\r\n{');
  await arrived; socket.destroy();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(f.arena.rooms.size, 0); assert.equal((await f.post('/game/api/rooms')).status, 201);
});

test('absolute TTL overrides recent presenter activity', async t => {
  const f = await fixture(t, { arenaOptions: { idleMs: 1000, lifetimeMs: 3000 } });
  const room = await f.create(); const url = '/game/api/rooms/' + room.roomId;
  for (const time of [100900, 101800, 102700]) {
    f.setTime(time); assert.equal((await f.post(url + '/reset', {}, room.hostToken)).status, 200);
  }
  f.setTime(103000); assert.equal((await f.state(room, room.hostToken)).status, 404); assert.equal(f.arena.rooms.size, 0);
});

test('global SSE capacity applies across rooms and IP-bucket overflow is rejected', async t => {
  const f = await fixture(t, { limits: { streamsTotal: 1 } });
  const one = await f.create(), two = await f.create();
  const stream = await sse(f.base, one.roomId, one.hostToken); t.after(stream.close); await stream.next();
  const r = await f.raw('/game/api/rooms/' + two.roomId + '/events', { headers: { Authorization: 'Bearer ' + two.hostToken } });
  assert.equal(r.status, 429); assert.equal(r.data.error.code, 'stream_capacity');
  const blocked = await fixture(t, { limits: { ipBuckets: 0 } });
  assert.equal((await blocked.post('/game/api/rooms')).status, 429); assert.equal(blocked.arena.rooms.size, 0);
});


test('trusted connector validates one IP and loopback boundary; normal mode ignores all proxy headers', () => {
  const req = (remoteAddress, value, rawHeaders = ['CF-Connecting-IP', value]) => ({ socket: { remoteAddress },
    headers: { 'cf-connecting-ip': value, 'x-forwarded-for': '203.0.113.200' }, rawHeaders });
  for (const remote of ['127.0.0.1', '127.0.0.2', '::1', '::ffff:127.0.0.1']) {
    assert.equal(requestClientIp(req(remote, '198.51.100.3'), true), '198.51.100.3');
    assert.equal(requestClientIp(req(remote, '2001:0DB8:0:0:0:0:0:1'), true), '2001:db8::1');
    assert.equal(requestClientIp(req(remote, '::ffff:198.51.100.3'), true), '198.51.100.3');
  }
  for (const remote of ['192.0.2.1', '::ffff:192.0.2.1', '2001:db8::1', 'fe80::1%eth0', '127.evil', 'unknown'])
    assert.throws(() => requestClientIp(req(remote, '198.51.100.3'), true), e => e.status === 403 && e.code === 'trusted_proxy_required');
  for (const value of [undefined, '', 'hostname.example', '198.51.100.3, 198.51.100.4', '198.51.100.3:443', '[2001:db8::1]', 'fe80::1%eth0'])
    assert.throws(() => requestClientIp(req('127.0.0.1', value), true), e => e.status === 400 && e.code === 'invalid_proxy_ip');
  assert.throws(() => requestClientIp(req('127.0.0.1', '198.51.100.3', ['CF-Connecting-IP', '198.51.100.3', 'cf-connecting-ip', '198.51.100.3']), true), e => e.code === 'invalid_proxy_ip');
  assert.equal(requestClientIp(req('192.0.2.1', '198.51.100.3')), '192.0.2.1');
  assert.equal(requestClientIp(req('127.0.0.1', 'not an IP')), '127.0.0.1');
  assert.throws(() => createGameServer({ trustedCloudflare: 'true' }), /explicitly boolean/);
});

test('trusted connector fails closed for missing/malformed/duplicate headers over real HTTP', async t => {
  const f = await fixture(t, { trustedCloudflare: true });
  for (const value of [undefined, '', 'invalid', '203.0.113.4,203.0.113.5', ['203.0.113.4', '203.0.113.4']]) {
    const r = await rawRequest(f.base, '/game/api/rooms', { chunks: ['{}'], headers: value === undefined ? {} : { 'CF-Connecting-IP': value } });
    assert.equal(r.status, 400); assert.equal(r.data.error.code, 'invalid_proxy_ip');
  }
  assert.equal(f.arena.rooms.size, 0);
  assert.equal((await f.post('/game/api/rooms', {}, undefined, { 'CF-Connecting-IP': '2001:db8::42' })).status, 201);
});

test('anonymous 404 attacker behind connector cannot exhaust another client or presenter quota', async t => {
  const f = await fixture(t, { trustedCloudflare: true, limits: { requestsPerMinute: 3 } });
  const host = await f.create(); const url = '/game/api/rooms/' + host.roomId;
  const attacker = { 'CF-Connecting-IP': '203.0.113.99' };
  for (let i = 0; i < 3; i++) assert.equal((await f.raw('/unknown', { headers: attacker })).status, 404);
  assert.equal((await f.raw('/unknown', { headers: attacker })).status, 429);
  assert.equal((await f.raw('/unknown', { headers: { 'CF-Connecting-IP': '203.0.113.100' } })).status, 404);
  // Even a presenter sharing the exhausted client IP uses its validated capability budget.
  const authorization = 'Bearer' + ' ' + host.hostToken;
  assert.equal((await f.raw(url + '/state', { headers: { ...attacker, Authorization: authorization } })).status, 200);
  assert.equal((await f.post(url + '/reset', {}, host.hostToken, attacker)).status, 200);
  assert.equal((await f.post('/game/api/rooms', {}, undefined, { 'CF-Connecting-IP': '203.0.113.100' })).status, 201);
});

test('normal mode proxy-header spoofing cannot rotate anonymous quotas or block valid host/player capabilities', async t => {
  const f = await fixture(t, { limits: { requestsPerMinute: 3 } });
  const host = await f.create(); const a = await f.join(host, 'A'), b = await f.join(host, 'B');
  const url = '/game/api/rooms/' + host.roomId;
  for (const value of ['203.0.113.1', '203.0.113.2', 'bad-header']) {
    const r = await f.raw('/unknown', { headers: { 'CF-Connecting-IP': value, 'X-Forwarded-For': value, Forwarded: 'for=' + value } });
    assert.equal(r.status, 429);
  }
  // An invalid or other-room token is never granted an isolated authenticated budget.
  assert.equal((await f.raw(url + '/state', { headers: { Authorization: 'Bearer' + ' ' + 'x'.repeat(43) } })).status, 429);
  assert.equal((await f.state(host, host.hostToken)).status, 200);
  assert.equal((await f.post(url + '/start', {}, host.hostToken)).status, 200);
  const state = await f.state(host, a.playerToken);
  assert.equal(state.status, 200);
  assert.equal((await f.post(url + '/vote', { turnId: state.data.state.turn.id, move: 'attack' }, a.playerToken)).status, 200);
  // Exhaust one capability's all-request budget; the other participant and presenter stay independent.
  assert.equal((await f.state(host, a.playerToken)).status, 200);
  assert.equal((await f.state(host, a.playerToken)).status, 429);
  assert.equal((await f.state(host, b.playerToken)).status, 200);
  assert.equal((await f.post(url + '/reset', {}, host.hostToken)).status, 200);
});


test('full anonymous IP-bucket map cannot block an existing authenticated presenter from a new client IP', async t => {
  const f = await fixture(t, { trustedCloudflare: true, limits: { ipBuckets: 1 } });
  const host = await f.create();
  const headers = { 'CF-Connecting-IP': '203.0.113.75' };
  assert.equal((await f.raw('/unknown', { headers })).status, 429);
  const r = await f.raw('/game/api/rooms/' + host.roomId + '/state', { headers: {
    ...headers, Authorization: 'Bearer' + ' ' + host.hostToken
  } });
  assert.equal(r.status, 200);
  assert.equal((await f.post('/game/api/rooms/' + host.roomId + '/reset', {}, host.hostToken, headers)).status, 200);
});

test('HTTP start exposes prebattle, rejects votes until full intro completes and starts full turn via SSE', async t => {
  const f = await fixture(t), host = await f.create();
  const a = await f.join(host, 'A'); await f.join(host, 'B');
  const url = '/game/api/rooms/' + host.roomId;
  const stream = await sse(f.base, host.roomId, a.playerToken); t.after(stream.close);
  await stream.next();
  const started = await f.raw(url + '/start', { method: 'POST', headers: { Origin: ORIGIN,
    'Content-Type': 'application/json', Authorization: 'Bearer ' + host.hostToken }, body: '{}' });
  assert.equal(started.status, 200); assert.equal(started.data.state.phase, 'countdown');
  assert.equal(started.data.state.turn, null);
  const intro = await stream.until(s => s.phase === 'countdown');
  assert.equal(intro.prebattle.deadline - intro.prebattle.startedAt, 7157);
  assert.equal((await f.post(url + '/vote', { turnId: '0:1', move: 'attack' }, a.playerToken)).data.error.code, 'invalid_phase');
  f.setTime(intro.prebattle.deadline - 1); f.tick();
  assert.equal((await f.state(host, a.playerToken)).data.state.phase, 'countdown');
  f.setTime(intro.prebattle.deadline); f.tick();
  const running = await stream.until(s => s.phase === 'running');
  assert.equal(running.turn.deadline - running.turn.startedAt, 15000);
  assert.equal(running.turn.number, 1); assert.equal(running.turn.totalVotes, 0);
  assert.equal((await f.post(url + '/vote', { turnId: running.turn.id, move: 'attack' }, a.playerToken)).status, 200);
});

test('short codes normalize across all routes without weakening bearer authorization or quotas', async t => {
  const f = await fixture(t, { arenaOptions: { newRoomCode: () => 'K7MP' } });
  const room = await f.create(); assert.equal(room.roomId, 'K7MP');
  const lower = '/game/api/rooms/k7mp', upper = '/game/api/rooms/K7MP';
  const a = await f.post(lower + '/join', { nickname: 'A' });
  const b = await f.post(upper + '/join', { nickname: 'B' });
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  assert.equal(a.data.state.roomId, room.roomId);
  const qr = await f.raw(lower + '/qr.svg');
  assert.equal(qr.status, 200);
  assert.equal(qr.text, await QRCode.toString(room.joinUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 256 }));
  assert.equal((await f.raw(lower + '/state')).status, 401);
  assert.equal((await f.post(lower + '/start', {}, room.roomId)).status, 401);
  assert.equal((await f.post(lower + '/reset', {}, a.data.playerToken)).status, 403);
  const started = await f.post(lower + '/start', {}, room.hostToken); assert.equal(started.status, 200);
  const stream = await sse(f.base, 'k7mp', room.hostToken); t.after(stream.close);
  assert.equal((await stream.next()).roomId, room.roomId);
  assert.equal((await f.post(lower + '/vote', { turnId: started.data.state.turn.id, move: 'attack' }, a.data.playerToken)).status, 200);
  assert.equal((await f.post(lower + '/reconnect', {}, a.data.playerToken)).data.playerId, a.data.playerId);
  assert.equal((await f.raw(lower + '/state', { headers: { Authorization: 'Bearer ' + room.hostToken } })).status, 200);
  const collision = await f.post('/game/api/rooms');
  assert.equal(collision.status, 503); assert.equal(collision.data.error.code, 'room_code_exhausted');
  assert.equal(f.arena.rooms.size, 1);
  assert.equal((await f.post(lower + '/reset', {}, room.hostToken)).status, 200);
  for (const invalid of ['I0O1', 'K7M', 'K7MPP', 'abcdabcdabcdx'])
    assert.equal((await f.raw('/game/api/rooms/' + invalid + '/qr.svg')).status, 404);
});

test('legacy long room links, QR, bearer sessions and reconnect still work', async t => {
  const f = await fixture(t); const room = f.arena.create();
  f.arena.rooms.delete(room.id); room.id = 'abcdef123456'; f.arena.rooms.set(room.id, room);
  const url = '/game/api/rooms/ABCDEF123456';
  const joined = await f.post(url + '/join', { nickname: 'Legacy' }); assert.equal(joined.status, 201);
  const reconnect = await f.post(url + '/reconnect', {}, joined.data.playerToken);
  assert.equal(reconnect.status, 200); assert.equal(reconnect.data.playerId, joined.data.playerId);
  assert.equal((await f.raw(url + '/state', { headers: { Authorization: 'Bearer ' + room.hostToken } })).data.state.roomId, room.id);
  const qr = await f.raw(url + '/qr.svg'); assert.equal(qr.status, 200);
  assert.equal(qr.text, await QRCode.toString(ORIGIN + '/game/?room=' + room.id, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 256 }));
});
