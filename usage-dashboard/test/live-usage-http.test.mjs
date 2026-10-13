import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { connect } from 'node:net';
import { once } from 'node:events';
import { createLiveUsageSource } from '../src/live-usage.mjs';
import { handle, createRequestAdmission, MAX_HTTP_WAITERS } from '../src/handler.mjs';

test('disconnected HTTP visitor does not start another collector or cancel a shared read', async () => {
  const now = Date.now(), day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(now);
  let calls = 0, release, admitted;
  const started = new Promise(resolve => { admitted = resolve; });
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 99, totalCost: 0, missingCostEntries: 0 };
  const source = createLiveUsageSource({ scopeMode: 'installation', snapshotPath: '/private/snapshot.json', lookbackDays: 1 }, {
    rpc: async () => { calls++; admitted(); await new Promise(resolve => { release = resolve; });
      return { updatedAt: now, cacheStatus: { status: 'fresh', refreshedAt: now }, totals, daily: [{ date: day, ...totals }] }; }
  });
  const server = createServer(async (_, res) => {
    const response = await handle(new Request('https://afp.mclement.ch/usage/api/usage'), { USAGE: source });
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
  });
  let socket;
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const port = server.address().port;
    socket = connect(port, '127.0.0.1'); await once(socket, 'connect');
    socket.write('GET /usage/api/usage HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await started; socket.destroy();
    const visitor = new Promise((resolve, reject) => get('http://127.0.0.1:' + port + '/usage/api/usage', response => {
      let body = ''; response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    }).on('error', reject));
    await new Promise(resolve => setImmediate(resolve)); release();
    const response = await visitor;
    assert.equal(response.status, 200); assert.equal(calls, 1);
    const data = JSON.parse(response.body); assert.equal(data.daily[0].totalTokens, 99);
    assert.equal(data.live.status, 'ok'); assert.equal(response.headers['cache-control'], 'no-store');
  } finally { socket?.destroy(); source.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});


test('HTTP admission caps retained waiters and releases exactly once after work settles', () => {
  const admit = createRequestAdmission();
  const releases = Array.from({ length: MAX_HTTP_WAITERS }, () => admit());
  assert.ok(releases.every(release => typeof release === 'function'));
  for (let i = 0; i < 1000; i++) assert.equal(admit(), null);
  releases[0](); releases[0](); const replacement = admit(); assert.equal(typeof replacement, 'function');
  assert.equal(admit(), null); replacement(); releases.slice(1).forEach(release => release());
  const final = Array.from({ length: MAX_HTTP_WAITERS }, () => admit()); assert.ok(final.every(Boolean));
  assert.equal(admit(), null); final.forEach(release => release());
});


test('real HTTP burst rejects excess visitors without adding collector waiters', async () => {
  const admit = createRequestAdmission(); let releaseRead, calls = 0, blocked = 0, excessReady;
  const excess = new Promise(resolve => { excessReady = resolve; });
  const shared = new Promise(resolve => { releaseRead = resolve; });
  const source = { get: () => { calls++; return shared; } };
  const server = createServer(async (_, res) => {
    const release = admit();
    if (!release) { blocked++; res.writeHead(503, { 'Retry-After': '5', 'Connection': 'close' }); res.end('busy');
      if (blocked === 10) excessReady(); return; }
    try { await source.get(); res.end('ok'); } finally { release(); }
  });
  const read = port => new Promise((resolve, reject) => get('http://127.0.0.1:' + port + '/', response => {
    response.resume(); response.on('end', () => resolve({ status: response.statusCode, retry: response.headers['retry-after'] }));
  }).on('error', reject));
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const visitors = Array.from({ length: MAX_HTTP_WAITERS + 10 }, () => read(server.address().port));
    await excess; assert.equal(calls, MAX_HTTP_WAITERS); releaseRead();
    const responses = await Promise.all(visitors);
    assert.equal(responses.filter(row => row.status === 503 && row.retry === '5').length, 10);
    assert.equal(responses.filter(row => row.status === 200).length, MAX_HTTP_WAITERS);
  } finally { releaseRead(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
