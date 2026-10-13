import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveUsageSource, createSharedGatewayReader, readSnapshotFile, USAGE_TIMEOUT_MS } from '../src/live-usage.mjs';
import { gatewayRpc } from '../src/collect.mjs';
import { installationSnapshot } from '../src/installation-usage.mjs';
import { handle, publicSnapshot } from '../src/handler.mjs';
const at = Date.parse('2026-10-13T12:00:00Z');
const config = { scopeMode: 'installation', snapshotPath: '/private/snapshot.json', lookbackDays: 1 };
const range = { start: '2026-10-13', end: '2026-10-13', timeZone: 'Europe/Zurich' };
const report = (time = at, n = 1) => {
  const totals = { input: null, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: n * 100,
    totalCost: n, missingCostEntries: 1 };
  return { updatedAt: time - 200, cacheStatus: { status: 'refreshing', cachedFiles: 1, refreshedAt: time - 1000 },
    daily: [{ date: range.start, ...totals }], totals, sessions: [{ key: 'SECRET', transcript: 'PRIVATE' }] };
};
const parse = async source => JSON.parse(await source.get());
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('100 simultaneous visitors share exactly one aggregate read; no work without demand', async () => {
  let time = at, calls = 0, release, active = 0, peak = 0;
  const source = createLiveUsageSource(config, { clock: () => time, rpc: async (method, params) => {
    calls++; active++; peak = Math.max(peak, active);
    assert.equal(method, 'usage.cost');
    assert.deepEqual(params, { startDate: range.start, endDate: range.end, mode: 'specific', timeZone: range.timeZone, agentScope: 'all' });
    await new Promise(resolve => { release = resolve; }); active--; return report(time);
  } });
  assert.equal(calls, 0);
  const visitors = Array.from({ length: 100 }, () => parse(source));
  await flush(); assert.equal(calls, 1); release();
  const results = await Promise.all(visitors);
  assert.equal(peak, 1); assert.equal(new Set(results.map(row => row.live.revision)).size, 1);
  assert.equal(results[0].daily[0].totalTokens, 100);
  assert.equal(results[0].daily[0].input, null); assert.equal(results[0].daily[0].costUsd, null);
  assert.equal(results[0].live.sampledAt, new Date(at).toISOString());
  assert.equal(results[0].source.reportUpdatedAt, new Date(at - 200).toISOString());
  assert.equal(results[0].source.refreshedAt, new Date(at - 1000).toISOString());
  assert.equal(results[0].sourceUpdatedAt, results[0].source.refreshedAt);
  assert.doesNotMatch(JSON.stringify(results), /SECRET|PRIVATE/);
  time += 4999; await parse(source); assert.equal(calls, 1);
  time += 600000; await flush(); assert.equal(calls, 1); // No interval running while nobody polls.
  source.close(); await parse(source); assert.equal(calls, 1);
});

test('revision deduplicates unchanged totals while sampling and source receipts advance', async () => {
  let time = at, n = 1, calls = 0;
  const source = createLiveUsageSource(config, { clock: () => time, rpc: async () => { calls++; return report(time, n); } });
  const first = await parse(source); time += 5000;
  const unchanged = await parse(source);
  assert.equal(unchanged.live.revision, first.live.revision);
  assert.notEqual(unchanged.live.sampledAt, first.live.sampledAt);
  assert.notEqual(unchanged.source.refreshedAt, first.source.refreshedAt);
  n = 2; time += 5000; const changed = await parse(source);
  assert.notEqual(changed.live.revision, first.live.revision); assert.equal(changed.daily[0].totalTokens, 200);
  assert.equal(calls, 3);
});

test('failures preserve last good totals and timestamps; backoff caps at 60 seconds and recovers', async () => {
  let time = at, calls = 0, failing = false;
  const source = createLiveUsageSource(config, { clock: () => time, rpc: () => {
    calls++; if (failing) throw new Error('SECRET FORBIDDEN'); return report(time);
  } });
  const good = await parse(source); failing = true; time += 5000;
  for (const delay of [10000, 20000, 40000, 60000, 60000]) {
    const bad = await parse(source), before = calls;
    assert.equal(bad.live.status, 'degraded'); assert.equal(bad.live.retryAfterMs, delay);
    assert.equal(bad.live.sampledAt, good.live.sampledAt); assert.deepEqual(bad.source, good.source);
    assert.deepEqual(bad.daily, good.daily); assert.doesNotMatch(JSON.stringify(bad), /SECRET|FORBIDDEN/);
    time += delay - 1; await Promise.all(Array.from({ length: 20 }, () => source.get())); assert.equal(calls, before);
    time++;
  }
  failing = false; const recovered = await parse(source); assert.equal(recovered.live.status, 'ok');
  assert.equal(recovered.live.retryAfterMs, 5000);
});

test('timed-out reader aborts, returns prior good data and cannot spawn competing reads', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let time = at, calls = 0, signal, release;
  const baseline = installationSnapshot(report(), range, new Date(at));
  const source = createLiveUsageSource(config, { clock: () => time, readSeed: async () => JSON.stringify(baseline),
    rpc: async (_, __, options) => { calls++; signal = options.signal; return await new Promise(resolve => { release = resolve; }); } });
  const work = parse(source); await flush(); assert.equal(calls, 1);
  t.mock.timers.tick(USAGE_TIMEOUT_MS); await flush();
  const timedOut = await work; assert.equal(timedOut.live.status, 'degraded'); assert.equal(signal.aborted, true);
  time += 120000; await parse(source); await parse(source); assert.equal(calls, 1);
  release(report(time, 999)); await flush();
  const next = parse(source); await flush();
  assert.equal(calls, 2); source.close(); t.mock.timers.tick(USAGE_TIMEOUT_MS); await flush();
  assert.equal((await next).daily[0].totalTokens, baseline.daily[0].totalTokens); // Late result discarded.
});

test('private baseline is read once, non-installation or invalid data never substitutes for aggregate authorization', async () => {
  for (const seed of ['{', JSON.stringify({ scopeMode: 'scoped' }), 'x'.repeat(1048577)]) {
    let reads = 0, calls = 0;
    const source = createLiveUsageSource(config, { clock: () => at, readSeed: async () => { reads++; return seed; },
      rpc: async method => { calls++; assert.equal(method, 'usage.cost'); throw new Error('denied'); } });
    assert.equal(await source.get(), null); assert.equal(await source.get(), null);
    assert.equal(reads, 1); assert.equal(calls, 1);
  }
  assert.throws(() => createLiveUsageSource({ ...config, scopeMode: 'scoped', rootSessionKey: 'agent:main:test' }));
});

test('public endpoint keeps host/path/method isolation and projects metadata without private extensions', async () => {
  const source = createLiveUsageSource(config, { clock: () => at, rpc: async () => report() });
  const data = await parse(source); data.live.secret = 'PRIVATE'; data.source.secret = 'SECRET';
  const env = { USAGE: { get: async () => JSON.stringify(data) } };
  const response = await handle(new Request('https://afp.mclement.ch/usage/api/usage?agentId=foreign&force=true'), env);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const projected = await response.json(); assert.doesNotMatch(JSON.stringify(projected), /PRIVATE|SECRET/);
  assert.equal(projected.live.pollIntervalMs, 5000); assert.equal(projected.source.method, 'usage.cost');
  data.live.revision = 'PRIVATE'; data.source.status = 'PRIVATE';
  assert.equal(publicSnapshot(data).live, undefined); assert.equal(publicSnapshot(data).source, undefined);
  data.source.status = 'fresh'; data.source.reportUpdatedAt = '2026-10-13 (SECRET)';
  assert.equal(publicSnapshot(data).source, undefined);
  for (const [url, method, code] of [['https://foreign/usage/api/usage', 'GET', 421],
    ['https://afp.mclement.ch/usage/api/usage', 'POST', 404], ['https://afp.mclement.ch/api/usage', 'GET', 404]]) {
    const result = await handle(new Request(url, { method }), { USAGE: { get: () => assert.fail('Forbidden request must not trigger a read') } });
    assert.equal(result.status, code);
  }
});

test('supported CLI reader receives cancellation, finite timeout and output bound without new auth', async () => {
  const controller = new AbortController();
  await gatewayRpc('usage.cost', { agentScope: 'all' }, async (command, args, options) => {
    assert.equal(command, 'openclaw'); assert.equal(options.signal, controller.signal);
    assert.equal(options.timeout, 4000); assert.equal(options.maxBuffer, 1048576);
    assert.ok(!args.includes('--token')); return { stdout: '{}' };
  }, { signal: controller.signal, timeout: 4000, maxBuffer: 1048576 });
});


test('usage and active endpoints share one child slot, a bounded queue and cancellation', async () => {
  let calls = 0, active = 0, peak = 0, release;
  const reader = createSharedGatewayReader(async method => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => { release = resolve; }); active--; return { method };
  });
  const first = reader('sessions.list', {}); await flush();
  const controller = new AbortController();
  const queued = reader('usage.cost', {}, { signal: controller.signal });
  await assert.rejects(reader('usage.cost', {}), /busy/);
  await assert.rejects(reader('chat.history', {}), /busy/);
  assert.equal(calls, 1); controller.abort(); release();
  assert.deepEqual(await first, { method: 'sessions.list' });
  await assert.rejects(queued, /canceled/); assert.equal(calls, 1); assert.equal(peak, 1);
  const later = reader('usage.cost', {}); await flush(); release();
  assert.deepEqual(await later, { method: 'usage.cost' }); assert.equal(peak, 1);
});


test('degraded source adopts newer five-minute backup with original clocks, never an older backup', async () => {
  let time = at, body = JSON.stringify(installationSnapshot(report(), range, new Date(at))), reads = 0;
  const source = createLiveUsageSource(config, { clock: () => time, readSeed: async () => { reads++; return body; },
    rpc: async () => { throw new Error('denied'); } });
  const first = await parse(source); time += 300000;
  const backup = installationSnapshot(report(time, 2), range, new Date(time)); body = JSON.stringify(backup);
  const recovered = await parse(source);
  assert.equal(recovered.daily[0].totalTokens, 200); assert.equal(recovered.live.status, 'degraded');
  assert.equal(recovered.generatedAt, backup.generatedAt); assert.equal(recovered.live.sampledAt, backup.generatedAt);
  assert.equal(recovered.source.reportUpdatedAt, backup.source.reportUpdatedAt);
  time += 300000; body = JSON.stringify(first);
  assert.equal((await parse(source)).daily[0].totalTokens, 200);
  assert.equal(reads, 3);
});

test('missing startup backup recovers on a bounded later read while aggregate RPC remains denied', async () => {
  let time = at, body = null, reads = 0;
  const source = createLiveUsageSource(config, { clock: () => time, readSeed: async () => { reads++; return body; },
    rpc: async () => { throw new Error('denied'); } });
  assert.equal(await source.get(), null);
  body = JSON.stringify(installationSnapshot(report(at + 300000, 3), range, new Date(at + 300000)));
  for (let i = 0; i < 100; i++) await source.get(); assert.equal(reads, 1);
  time += 300000; const recovered = await parse(source);
  assert.equal(recovered.daily[0].totalTokens, 300); assert.equal(recovered.generatedAt, new Date(time).toISOString());
  assert.equal(reads, 2);
});


test('backup file reads refuse symlinks, directories and oversized files before loading data', async () => {
  const { mkdtemp, writeFile, symlink, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(tmpdir() + '/usage-backup-test-');
  try {
    const file = dir + '/snapshot'; await writeFile(file, '{}');
    assert.equal(await readSnapshotFile(file), '{}'); assert.equal(await readSnapshotFile(dir + '/missing'), null);
    await symlink(file, dir + '/link'); await assert.rejects(readSnapshotFile(dir + '/link'));
    await assert.rejects(readSnapshotFile(dir)); await writeFile(file, 'x'.repeat(1048577));
    await assert.rejects(readSnapshotFile(file));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
