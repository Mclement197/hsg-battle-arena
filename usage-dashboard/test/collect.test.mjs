import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRange, dateInZurich, sessionIdentity, usageState, dailyRows, mergeDaily,
  auditProjection, safeSummary, safeIdentifier, buildSnapshot, skillEventProjection, verifiedSessionKeys
} from '../src/telemetry.mjs';
import {
  gatewayRpc, validateConfig, configArgument, discoverSessions, freshUsage,
  collectAudit, collectSnapshot, run, writeSnapshotAtomic, LIMITS, parseSkillEventLines, readSkillEventFile
} from '../src/collect.mjs';

const now = new Date('2026-10-12T11:00:00Z');
const range = makeRange(now, 30);
const root = { key: 'agent:main:dashboard:afp', agentId: 'main', sessionId: 'root-instance' };
const child = { key: 'agent:qa:subagent:child', agentId: 'qa', sessionId: 'child-instance', spawnedBy: root.key };
const outsider = { key: 'agent:main:discord:private', agentId: 'main', sessionId: 'private-instance', projectId: 'unrelated' };
const config = { rootSessionKey: root.key, snapshotPath: '/private/snapshot.json', lookbackDays: 30 };
const totals = (overrides = {}) => ({ input: 100, output: 25, cacheRead: 40, cacheWrite: 5, totalTokens: 170, totalCost: 0.02, missingCostEntries: 0, ...overrides });
function report(session = root, queryRange = range, overrides = {}) {
  const usage = totals();
  return {
    startDate: queryRange.start, endDate: queryRange.end,
    sessions: [{ ...session, scope: 'instance', usage: { ...usage, sessionId: session.sessionId } }],
    totals: usage,
    aggregates: { byModel: [{ provider: 'openai', model: 'gpt-test', count: 2, totals: usage }],
      modelDaily: [{ date: queryRange.end, provider: 'openai', model: 'gpt-test', count: 2, tokens: 170, cost: 0.02 }] },
    cacheStatus: { status: 'fresh' }, ...overrides
  };
}
function event(overrides = {}) {
  return { eventId: 'event-1', kind: 'agent_run', action: 'agent.run.finished', status: 'succeeded',
    occurredAt: now.getTime() - 1000, agentId: root.agentId, sessionKey: root.key,
    sessionId: root.sessionId, runId: 'raw-run-id', redaction: 'metadata_only', ...overrides };
}
function fixture({ sessions = [root], usage, audit = [] } = {}) {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    if (method === 'sessions.describe') return { session: root };
    if (method === 'sessions.list') return { sessions: sessions.filter((row) => params.projectId ? row.projectId === params.projectId : row.spawnedBy === params.spawnedBy || row.parentSessionKey === params.spawnedBy), nextOffset: null, hasMore: false };
    if (method === 'sessions.usage') {
      const session = sessions.find((row) => row.key === params.key);
      assert.ok(session, 'usage must be scoped to fixture allowlist');
      const queryRange = { start: params.startDate, end: params.endDate, timeZone: params.timeZone };
      return usage ? usage(session, queryRange, params) : report(session, queryRange);
    }
    if (method === 'audit.activity.list') return { events: audit.filter((row) => row.sessionKey === params.sessionKey && row.kind === params.kind) };
    throw new Error('unexpected method');
  };
  return { rpc, calls };
}
const rejectsCode = (promise, code) => assert.rejects(promise, (error) => error.code === code);

test('Zurich calendar days follow DST and calendar subtraction', () => {
  assert.equal(dateInZurich(new Date('2026-10-11T22:30:00Z')), '2026-10-12');
  assert.deepEqual(makeRange(new Date('2026-03-29T22:30:00Z'), 2), { start: '2026-03-29', end: '2026-03-30', timeZone: 'Europe/Zurich' });
  assert.equal(range.start, '2026-09-13');
  assert.throws(() => makeRange(now, 0));
});
test('config accepts only collection fields and ignores uploader credentials', () => {
  assert.deepEqual(validateConfig({ ...config, endpoint: 'private', ingestToken: 'secret' }), { ...config, projectId: undefined });
  assert.throws(() => validateConfig({ ...config, snapshotPath: 'relative.json' }));
  assert.throws(() => validateConfig({ ...config, rootSessionKey: 'agent:main:bad\nkey' }));
  assert.equal(configArgument([], { AFP_USAGE_CONFIG: '/private/config.json' }), '/private/config.json');
  assert.equal(configArgument(['--config', '/private/other.json'], {}), '/private/other.json');
  assert.throws(() => configArgument(['--unknown'], {}));
});
test('CLI dispatch uses execFile argument boundaries and a closed read-method set', async () => {
  let called = 0;
  const runner = async (command, args, options) => {
    called += 1;
    assert.equal(command, 'openclaw');
    assert.deepEqual(args.slice(0, 5), ['gateway', 'call', 'sessions.describe', '--json', '--params']);
    assert.equal(JSON.parse(args[5]).key, root.key + '; shell-injection');
    assert.equal(options.shell, undefined);
    return { stdout: '{"session":null}', stderr: 'private stderr' };
  };
  await gatewayRpc('sessions.describe', { key: root.key + '; shell-injection' }, runner);
  await rejectsCode(gatewayRpc('sessions.send', {}, runner), 'RPC_METHOD_NOT_ALLOWED');
  await rejectsCode(gatewayRpc('chat.history', {}, runner), 'RPC_METHOD_NOT_ALLOWED');
  assert.equal(called, 1);
  await rejectsCode(gatewayRpc('sessions.list', {}, async () => { throw new Error('secret credentials'); }), 'GATEWAY_READ_FAILED');
});
test('discovery closes verified lineage and exact project membership, rejects unrelated rows', async () => {
  const grandchild = { key: 'agent:review:subagent:grand', sessionId: 'grand-instance', parentSessionKey: child.key };
  const project = { key: 'agent:main:project:work', sessionId: 'project-instance', projectId: 'afp' };
  const queries = [];
  const rpc = async (method, params) => {
    queries.push({ method, params });
    if (method === 'sessions.describe') return { session: { ...root, label: 'secret title' } };
    if (params.projectId) return { sessions: [project, outsider], hasMore: false };
    if (params.spawnedBy === root.key) return { sessions: [child, child, outsider], hasMore: false };
    if (params.spawnedBy === child.key) return { sessions: [grandchild], hasMore: false };
    return { sessions: [], hasMore: false };
  };
  const found = await discoverSessions({ ...config, projectId: 'afp' }, rpc);
  assert.deepEqual(new Set(found.map((row) => row.key)), new Set([root.key, child.key, grandchild.key, project.key]));
  assert.ok(!JSON.stringify(found).includes('secret title'));
  assert.ok(!queries.some((query) => query.params.spawnedBy === outsider.key));
  for (const query of queries.filter((query) => query.method === 'sessions.list')) assert.equal(query.params.includeLastMessage, false);
});
test('discovery deduplicates physical aliases and terminates cyclic lineage', async () => {
  const alias = { ...root, key: 'agent:main:alias', parentSessionKey: root.key };
  const rpc = async (method, params) => method === 'sessions.describe' ? { session: root } : { sessions: params.spawnedBy === root.key ? [alias] : [{ ...root, parentSessionKey: alias.key }], hasMore: false };
  assert.equal((await discoverSessions(config, rpc)).length, 1);
});
test('session discovery follows pagination and fails instead of silently truncating', async () => {
  const f = fixture();
  const rpc = async (method, params) => method !== 'sessions.list' ? f.rpc(method, params) : ({ sessions: [], hasMore: true, nextOffset: params.offset + 100 });
  await rejectsCode(discoverSessions(config, rpc, { ...LIMITS, sessionPages: 2 }), 'SESSION_DISCOVERY_LIMIT');
});
test('conflicting agent and session identities fail closed', () => {
  assert.throws(() => sessionIdentity({ ...root, agentId: 'other' }));
  assert.throws(() => usageState(report(outsider), root, range));
  assert.throws(() => usageState(report(root, range, { sessions: [{ ...root, sessionId: 'replacement', usage: totals() }] }), root, range));
  assert.throws(() => usageState(report(root, range, { startDate: '2020-01-01' }), root, range));
});
test('pending telemetry retries on a bounded schedule and never becomes a zero', async () => {
  let calls = 0;
  const waits = [];
  const rpc = async () => (++calls < 3 ? report(root, range, { cacheStatus: { status: 'refreshing' } }) : report());
  await freshUsage(rpc, root, range, { retryDelays: [5, 10], wait: async (ms) => waits.push(ms) });
  assert.deepEqual(waits, [5, 10]);
  const pending = async () => report(root, range, { sessions: [{ ...root, usage: null, computing: true }] });
  await rejectsCode(freshUsage(pending, root, range, { retryDelays: [], wait: async () => {} }), 'USAGE_PENDING');
});
test('normalized cache buckets are disjoint and provider totals remain authoritative', () => {
  const row = dailyRows(report(), range, range.end)[0];
  assert.equal(row.input, 100);
  assert.equal(row.cacheRead, 40);
  assert.equal(row.cacheWrite, 5);
  assert.equal(row.totalTokens, 170);
  assert.equal(row.requests, 2);
  const r = report(); r.aggregates.byModel[0].totals.totalTokens = 999;
  assert.equal(dailyRows(r, range, range.end)[0].totalTokens, 999);
});
test('unknown split and missing prices stay null; known free usage stays zero', () => {
  const r = report();
  r.aggregates.byModel[0].totals.missingCostEntries = 1;
  assert.equal(dailyRows(r, range, range.end)[0].costUsd, null);
  assert.equal(dailyRows(r, range)[0].costUsd, null);
  r.aggregates.byModel[0].totals = totals({ totalCost: 0, input: undefined });
  const exact = dailyRows(r, range, range.end)[0];
  assert.equal(exact.costUsd, 0); assert.equal(exact.input, null);
  const approximate = dailyRows(r, range)[0];
  assert.equal(approximate.input, null); assert.equal(approximate.totalTokens, 170);
});
test('mixed known/unknown aggregates do not coerce null to zero', () => {
  const row = dailyRows(report(), range, range.end)[0];
  const merged = mergeDaily([row, { ...row, input: null, costUsd: null }])[0];
  assert.equal(merged.totalTokens, 340); assert.equal(merged.input, null); assert.equal(merged.costUsd, null);
  assert.equal(merged.requests, 4);
});
test('metadata summaries never publish prompts, arbitrary tool names, commands or raw IDs', () => {
  const output = auditProjection([
    event({ content: 'TOP SECRET', command: 'rm sensitive', actor: { name: 'private name' } }),
    event({ eventId: 'tool-1', kind: 'tool_action', action: 'tool.action.finished', toolName: 'web_fetch', toolCallId: 'call-1', params: { url: 'private URL' } }),
    event({ eventId: 'tool-2', kind: 'tool_action', action: 'tool.action.finished', toolName: 'PRIVATE TOOL CONTENT', toolCallId: 'call-2' }),
    event({ ...outsider, eventId: 'outsider', sessionKey: outsider.key })
  ], [root], range);
  const text = JSON.stringify(output);
  for (const forbidden of ['TOP SECRET', 'sensitive', 'private name', 'private URL', 'PRIVATE TOOL CONTENT', root.key, root.sessionId, 'raw-run-id']) assert.ok(!text.includes(forbidden), forbidden);
  assert.equal(output.requests.length, 1);
  assert.equal(output.requests[0].model, 'Not attributed');
  assert.equal(output.requests[0].totalTokens, null);
  assert.match(output.requests[0].description, /Research/);
  assert.equal(safeSummary(['untrusted string']), 'Tool activity (inferred)');
  assert.equal(safeIdentifier('agent:main:private'), 'Unknown');
  assert.equal(safeIdentifier('<script>'), 'Unknown');
});
test('audit run grouping does not double-count lifecycle or repeated tool receipts', () => {
  const skill = event({ eventId: 'tool-end', kind: 'tool_action', action: 'tool.action.finished', toolName: 'skills_read', toolCallId: 'call' });
  const output = auditProjection([event(), event({ eventId: 'start', action: 'agent.run.started', status: 'started', occurredAt: now.getTime() - 2000 }), skill, skill,
    { ...skill, eventId: 'duplicate-receipt' }, { ...skill, eventId: 'failed-read', toolCallId: 'failure', status: 'failed' },
    { ...skill, eventId: 'no-instance', sessionId: undefined }, { ...skill, eventId: 'old-instance', sessionId: 'old' }
  ], [root], range);
  assert.equal(output.requests.length, 1);
  assert.equal(output.requests[0].status, 'succeeded');
  assert.equal(output.skillReads, 1);
});
test('recent activity is capped at 100 without truncating read-count calculation', () => {
  const events = Array.from({ length: 120 }, (_, index) => event({ eventId: 'e' + index, runId: 'r' + index, kind: 'tool_action', action: 'tool.action.finished', toolName: 'skills_read', occurredAt: now.getTime() - index }));
  const output = auditProjection(events, [root], range);
  assert.equal(output.requests.length, 100); assert.equal(output.skillReads, 120);
});
test('audit pagination is bounded and unexpected content fields are discarded', async () => {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push(params);
    if (params.kind === 'agent_run') return { events: [event({ content: 'private' })], nextCursor: 'more' };
    return { events: [] };
  };
  const output = await collectAudit(rpc, [root], range, now, { ...LIMITS, auditPages: 1 });
  assert.equal(output.events.length, 1);
  assert.equal(output.events[0].content, undefined);
  assert.ok(output.notes.some((note) => note.includes('partial')));
  assert.ok(calls.every((params) => params.sessionKey === root.key));
});
test('collector queries exact daily buckets once per active session/date and sanitizes result', async () => {
  const f = fixture({ sessions: [root, child], audit: [event({ content: 'private prompt' })] });
  const snapshot = await collectSnapshot(config, { rpc: f.rpc, now, retryDelays: [] });
  assert.equal(snapshot.coverage.sessions, 2);
  assert.equal(snapshot.daily.length, 1);
  assert.equal(snapshot.daily[0].input, 200);
  assert.equal(snapshot.daily[0].totalTokens, 340);
  assert.equal(snapshot.daily[0].requests, 4);
  assert.deepEqual(snapshot.skills, []);
  const reads = f.calls.filter((call) => call.method === 'sessions.usage');
  assert.equal(reads.length, 4);
  assert.ok(reads.every((call) => call.params.groupBy === 'instance' && !call.params.agentScope));
  assert.ok(!JSON.stringify(snapshot).includes('private prompt'));
  assert.ok(!JSON.stringify(snapshot).includes(root.key));
});
test('single-day collection reuses its model totals without a second report', async () => {
  const f = fixture();
  await collectSnapshot({ ...config, lookbackDays: 1 }, { rpc: f.rpc, now, retryDelays: [] });
  assert.equal(f.calls.filter((call) => call.method === 'sessions.usage').length, 1);
});
test('daily detail budget uses exact daily totals with unknown buckets, never ratios', async () => {
  const f = fixture();
  const snapshot = await collectSnapshot(config, { rpc: f.rpc, now, limits: { ...LIMITS, dailyDetails: 0 }, retryDelays: [] });
  assert.equal(snapshot.daily[0].input, null);
  assert.equal(snapshot.daily[0].totalTokens, 170);
  assert.equal(snapshot.daily[0].requests, 2);
  assert.equal(f.calls.filter((call) => call.method === 'sessions.usage').length, 1);
  assert.ok(snapshot.coverage.notes.some((note) => note.includes('query bound')));
});
test('pending or missing usage preserves previous snapshot by never invoking writer', async () => {
  let writes = 0;
  const f = fixture({ usage: (session, queryRange) => report(session, queryRange, { cacheStatus: { status: 'partial' } }) });
  await rejectsCode(run(config, { rpc: f.rpc, now, retryDelays: [], writeSnapshot: async () => { writes += 1; } }), 'USAGE_PENDING');
  assert.equal(writes, 0);
  const unavailable = fixture({ usage: () => ({ sessions: [] }) });
  await assert.rejects(run(config, { rpc: unavailable.rpc, now, retryDelays: [], writeSnapshot: async () => { writes += 1; } }));
  assert.equal(writes, 0);
});
test('membership changes before commit fail closed', async () => {
  const f = fixture(); let descriptions = 0;
  const rpc = async (method, params) => {
    if (method === 'sessions.describe' && ++descriptions > 1) return { session: { ...root, sessionId: 'new' } };
    return f.rpc(method, params);
  };
  await rejectsCode(collectSnapshot(config, { rpc, now, retryDelays: [] }), 'SESSION_CHANGED_DURING_COLLECTION');
});
test('snapshot writer creates mode 600, flushes and closes before atomic rename', async () => {
  const calls = [];
  const io = {
    lstat: async () => { throw Object.assign(new Error(), { code: 'ENOENT' }); },
    open: async (name, flags, mode) => { calls.push(['open', name, flags, mode]); return {
      writeFile: async (data) => calls.push(['write', data]), sync: async () => calls.push(['sync']), close: async () => calls.push(['close'])
    }; },
    rename: async (from, to) => calls.push(['rename', from, to]), unlink: async () => calls.push(['unlink'])
  };
  await writeSnapshotAtomic('/private/snapshot.json', { schemaVersion: 1 }, io);
  assert.equal(calls[0][2], 'wx'); assert.equal(calls[0][3], 0o600);
  assert.deepEqual(calls.map((call) => call[0]), ['open', 'write', 'sync', 'close', 'rename']);
  assert.equal(calls.at(-1)[2], '/private/snapshot.json');
});
test('write failure removes temporary file without replacing existing snapshot', async () => {
  let renamed = false; let removed = false;
  const io = { lstat: async () => ({ isFile: () => true, isSymbolicLink: () => false }),
    open: async () => ({ writeFile: async () => { throw new Error('disk error with private path'); }, close: async () => {} }),
    rename: async () => { renamed = true; }, unlink: async () => { removed = true; }
  };
  await rejectsCode(writeSnapshotAtomic('/private/snapshot.json', {}, io), 'SNAPSHOT_WRITE_FAILED');
  assert.equal(renamed, false); assert.equal(removed, true);
});
test('symlink snapshot targets are refused', async () => {
  const io = { lstat: async () => ({ isFile: () => false, isSymbolicLink: () => true }), unlink: async () => {} };
  await rejectsCode(writeSnapshotAtomic('/private/snapshot.json', {}, io), 'UNSAFE_SNAPSHOT_TARGET');
});
test('different providers and dates never collapse into a model-only aggregate', () => {
  const row = dailyRows(report(), range, range.end)[0];
  const merged = mergeDaily([row, { ...row, provider: 'anthropic' }, { ...row, date: '2026-10-11' }]);
  assert.equal(merged.length, 3);
  assert.ok(merged.every((value) => value.totalTokens === 170));
});
test('audit metadata requires exact session instance even if a server filter is broad', async () => {
  const rpc = async () => ({ events: [event(), event({ eventId: 'private', sessionKey: outsider.key, sessionId: outsider.sessionId }), event({ eventId: 'unidentified', sessionId: undefined })] });
  const output = await collectAudit(rpc, [root], range, now);
  assert.equal(output.events.length, 1);
  assert.equal(output.events[0].eventId, 'event-1');
});
test('an unowned temporary file is never removed after exclusive-create failure', async () => {
  let removed = false;
  const io = { lstat: async () => { throw Object.assign(new Error(), { code: 'ENOENT' }); },
    open: async () => { throw Object.assign(new Error(), { code: 'EEXIST' }); },
    unlink: async () => { removed = true; }
  };
  await rejectsCode(writeSnapshotAtomic('/private/snapshot.json', {}, io), 'SNAPSHOT_WRITE_FAILED');
  assert.equal(removed, false);
});
test('failed audit collection does not replace an otherwise valid snapshot', async () => {
  const f = fixture(); let writes = 0;
  const rpc = async (method, params) => {
    if (method === 'audit.activity.list') throw new Error('unavailable');
    return f.rpc(method, params);
  };
  await assert.rejects(run(config, { rpc, now, retryDelays: [], writeSnapshot: async () => { writes += 1; } }));
  assert.equal(writes, 0);
});
test('named observer events are scoped, range-filtered, deduplicated and categorized without prompt content', () => {
  const read = { eventId: 'read-1', sessionKey: root.key, skill: 'research', at: '2026-10-12T09:00:00.000Z' };
  const output = skillEventProjection([read, read,
    { ...read, eventId: 'read-2', at: '2026-10-12T10:00:00.000Z' },
    { ...read, eventId: 'other', sessionKey: outsider.key },
    { ...read, eventId: 'old', at: '2026-08-01T09:00:00.000Z' },
    { ...read, eventId: 'future', at: '2026-10-13T09:00:00.000Z' },
    { ...read, eventId: 'extra', prompt: 'private content' }
  ], [root], range, now);
  assert.deepEqual(output.skills, [{ name: 'research', description: 'Confirmed skill instruction read', count: 2, lastUsedAt: '2026-10-12T10:00:00.000Z' }]);
  assert.ok(!JSON.stringify(output).includes(root.key));
  assert.ok(!JSON.stringify(output).includes('private content'));
  assert.equal(output.invalid, 2);
});
test('conflicting observer event IDs are excluded rather than counted twice', () => {
  const read = { eventId: 'duplicate', sessionKey: root.key, skill: 'research', at: '2026-10-12T09:00:00.000Z' };
  const output = skillEventProjection([read, { ...read, skill: 'imagegen' }, read], [root], range, now);
  assert.deepEqual(output.skills, []);
});
test('JSONL reader defers partial appends and reports malformed complete lines', () => {
  const read = { eventId: 'read', sessionKey: root.key, skill: 'research', at: now.toISOString() };
  const result = parseSkillEventLines(JSON.stringify(read) + '\n{malformed}\n{"eventId":');
  assert.deepEqual(result.events, [read]);
  assert.equal(result.available, true);
  assert.equal(result.notes.length, 2);
});
test('observer reader refuses public/symlink files and distinguishes a missing observer', async () => {
  const missing = await readSkillEventFile('/private/skills.jsonl', { open: async () => { throw Object.assign(new Error(), { code: 'ENOENT' }); } });
  assert.equal(missing.available, false);
  let closed = false;
  await rejectsCode(readSkillEventFile('/private/skills.jsonl', { open: async () => ({
    stat: async () => ({ isFile: () => true, mode: 0o644, size: 0 }), close: async () => { closed = true; }
  }) }), 'UNSAFE_SKILL_EVENT_FILE');
  assert.equal(closed, true);
  await rejectsCode(readSkillEventFile('/private/skills.jsonl', { open: async () => { throw Object.assign(new Error(), { code: 'ELOOP' }); } }), 'SKILL_EVENT_READ_FAILED');
});
test('observer and snapshot paths cannot alias config auth or each other', () => {
  assert.throws(() => validateConfig({ ...config, allowlistPath: config.snapshotPath }));
  assert.throws(() => validateConfig({ ...config, skillEventsPath: '/private/auth.json', authPath: '/private/auth.json' }));
  assert.throws(() => validateConfig({ ...config, allowlistPath: 'relative.json' }));
});
test('verified allowlist is published before usage and maintained on revalidation', async () => {
  const f = fixture({ sessions: [root, child] });
  const writes = [];
  const cfg = { ...config, scopeLabel: 'AFP only', allowlistPath: '/private/sessions.json', skillEventsPath: '/private/skills.jsonl' };
  const snapshot = await collectSnapshot(cfg, { rpc: f.rpc, now, retryDelays: [],
    writeAllowlist: async (name, keys) => writes.push({ name, keys }),
    readSkillEvents: async (name) => {
      assert.equal(name, cfg.skillEventsPath);
      return { available: true, notes: [], events: [{ eventId: 'read', sessionKey: child.key, skill: 'research', at: now.toISOString() }] };
    }
  });
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].keys, [root.key, child.key].sort());
  assert.deepEqual(writes[1], writes[0]);
  assert.equal(snapshot.scopeLabel, 'AFP only');
  assert.equal(snapshot.skills[0].count, 1);
  assert.match(snapshot.coverage.skillMetric, /Confirmed named instruction reads/);
});
test('pending usage retains the verified allowlist but never writes a fabricated snapshot', async () => {
  const f = fixture({ usage: (session, queryRange) => report(session, queryRange, { cacheStatus: { status: 'refreshing' } }) });
  const allowlists = []; let snapshots = 0;
  await rejectsCode(run({ ...config, allowlistPath: '/private/sessions.json' }, { rpc: f.rpc, now, retryDelays: [],
    writeAllowlist: async (name, keys) => allowlists.push(keys), writeSnapshot: async () => { snapshots += 1; }
  }), 'USAGE_PENDING');
  assert.deepEqual(allowlists, [[root.key]]); assert.equal(snapshots, 0);
});
test('failed discovery clears observer admission, and aliases remain explicitly verified', async () => {
  const writes = [];
  await assert.rejects(collectSnapshot({ ...config, allowlistPath: '/private/sessions.json' }, {
    rpc: async () => { throw new Error('unavailable'); }, now,
    writeAllowlist: async (name, keys) => writes.push(keys)
  }));
  assert.deepEqual(writes, [[]]);
  assert.deepEqual(verifiedSessionKeys([{ ...root, aliases: [root.key, 'agent:main:alias'] }]), ['agent:main:alias', root.key]);
});
test('empty fresh reports are representable but missing telemetry is not invented', () => {
  const empty = report(); empty.totals = totals({ totalTokens: 0 }); empty.aggregates = { byModel: [], modelDaily: [] };
  const snapshot = buildSnapshot({ now, range, sessions: [root], rows: dailyRows(empty, range), events: [] });
  assert.deepEqual(snapshot.daily, []); assert.deepEqual(snapshot.requests, []);
  assert.ok(snapshot.coverage.notes.some((note) => note.includes('recorded model usage entries')));
});

test('recent dated populated rollups remain usable while active sessions refresh',()=>{
  const cached=report(root,range,{cacheStatus:{status:'refreshing',refreshedAt:Date.now()-60000}});
  assert.equal(usageState(cached,root,range),'cached');
  cached.cacheStatus.refreshedAt=Date.now()-16*60*1000;
  assert.equal(usageState(cached,root,range),'pending');
  cached.cacheStatus.refreshedAt=Date.now();cached.sessions[0].usage=null;
  assert.equal(usageState(cached,root,range),'pending');
});
test('cached source freshness is disclosed without leaking session identifiers',async()=>{
  const f=fixture({usage:(session,queryRange)=>report(session,queryRange,{cacheStatus:{status:'refreshing',refreshedAt:Date.now()-60000}})});
  const snapshot=await collectSnapshot(config,{rpc:f.rpc,now,retryDelays:[]});
  assert.ok(snapshot.coverage.notes.some(note=>note.includes('oldest source refresh')));
  assert.ok(!JSON.stringify(snapshot).includes(root.key));
});


test('optional details use only a single root-agent catalog and preserve exact accounting', async () => {
  const { taskId, descriptionHash } = await import('../src/details.mjs');
  const { validateSnapshot, publicSnapshot } = await import('../src/handler.mjs');
  const base = fixture({ sessions: [root, child], audit: [event(), event({ eventId: 'start-proof', action: 'agent.run.started', status: 'started', occurredAt: now.getTime() - 2000 })] });
  const detailCalls = [];
  const publicMetadata = { schemaVersion: 1, agents: { main: { name: 'Coordinator', role: 'Project coordination' } },
    skills: { research: { descriptionHash: descriptionHash('PRIVATE descriptor'), description: 'Review public primary sources.' } },
    tasks: { [taskId(root.agentId, root.sessionId)]: { title: 'Project reporting', summary: 'Report verified project work.' } } };
  const rpc = async (method, params) => {
    if (method === 'agents.list') { detailCalls.push({ method, params }); return { agents: [
      { id: 'main', name: 'PRIVATE name', workspace: '/home/private', model: { primary: 'openai/gpt-test' }, agentRuntime: { id: 'openclaw' } },
      { id: 'qa' }, { id: 'idle' } ] }; }
    if (method === 'skills.status') { detailCalls.push({ method, params }); return { agentId: 'main', skills: [{ name: 'research', description: 'PRIVATE descriptor', source: 'openclaw-managed', eligible: true, disabled: false }] }; }
    const result = await base.rpc(method, params);
    const life = s => ({ ...s, label: 'PRIVATE label', task: 'PRIVATE prompt', model: 'gpt-test', modelProvider: 'openai',
      status: 'done', hasActiveRun: false, startedAt: now.getTime() - 3000, endedAt: now.getTime() - 1000, snapshotAt: now.getTime() });
    if (method === 'sessions.describe') result.session = life(result.session);
    if (method === 'sessions.list') result.sessions = result.sessions.map(life);
    return result;
  };
  const snapshot = await collectSnapshot(config, { rpc, now, retryDelays: [], readMetadata: async () => publicMetadata });
  assert.deepEqual(detailCalls, [{ method: 'agents.list', params: {} }, { method: 'skills.status', params: { agentId: 'main' } }]);
  assert.equal(snapshot.daily[0].agentId, undefined);
  assert.deepEqual(mergeDaily(snapshot.agentDaily.map(({ agentId, ...r }) => r)), snapshot.daily);
  assert.equal(snapshot.agents.find(a => a.id === 'idle').usageState, 'no_scoped_sessions');
  assert.equal(snapshot.skillCatalog[0].description, 'Review public primary sources.');
  assert.equal(snapshot.skillCatalog[0].observedReads, null);
  assert.equal(snapshot.tasks[0].title, 'Project reporting');
  assert.equal(snapshot.tasks[0].durationMs, 2000);
  assert.equal(snapshot.requests[0].durationMs, 1000);
  assert.equal(snapshot.requests[0].model, 'Not attributed');
  assert.equal(snapshot.requests[0].taskId, snapshot.tasks[0].id);
  assert.equal(validateSnapshot(snapshot), true);
  assert.deepEqual(publicSnapshot(snapshot), snapshot);
  assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
  assert.ok(!JSON.stringify(snapshot).includes(root.key));
  assert.ok(!base.calls.some(c => c.method === 'sessions.usage' && c.params.agentId === 'idle'));
});

test('new read-source failures and malformed results do not discard usable core usage', async () => {
  const f = fixture();
  const rpc = async (method, params) => {
    if (method === 'agents.list' || method === 'skills.status') throw new Error('PRIVATE error credentials');
    return f.rpc(method, params);
  };
  let writes = 0;
  const snapshot = await run(config, { rpc, now, retryDelays: [], readMetadata: async () => { throw new Error('PRIVATE metadata'); },
    writeSnapshot: async (path, value) => { writes++; assert.equal(value.daily[0].totalTokens, 170); } });
  assert.equal(writes, 1);
  assert.equal(snapshot.agents, null);
  assert.equal(snapshot.skillCatalog, null);
  assert.equal(snapshot.coverage.details.agents, 'unavailable');
  assert.equal(snapshot.coverage.details.skills, 'unavailable');
  assert.equal(snapshot.tasks.length, 1);
  assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
  const malformed = await collectSnapshot(config, { now, rpc: async (method, params) =>
    method === 'agents.list' ? { agents: 'not-array' } : method === 'skills.status' ? { skills: null } : f.rpc(method, params),
    retryDelays: [], readMetadata: async () => ({ schemaVersion: 42 }) });
  assert.equal(malformed.agents, null);
  assert.equal(malformed.skillCatalog, null);
  assert.equal(malformed.daily[0].totalTokens, 170);
});

test('collector revalidates scope after optional source reads and uses current lifecycle facts', async () => {
  const f = fixture();
  let reads = 0;
  const rpc = async (method, params) => {
    if (method === 'agents.list' || method === 'skills.status') return null;
    const result = await f.rpc(method, params);
    if (method === 'sessions.describe') result.session = { ...root, status: ++reads === 1 ? 'running' : 'done',
      hasActiveRun: reads === 1, startedAt: now.getTime() - 2000, endedAt: reads === 1 ? null : now.getTime() - 1000 };
    return result;
  };
  const snapshot = await collectSnapshot(config, { rpc, now, retryDelays: [], readMetadata: async () => null });
  assert.equal(snapshot.tasks[0].status, 'succeeded');
  assert.equal(snapshot.tasks[0].durationMs, 1000);
  let changed = false;
  const unsafeRpc = async (method, params) => {
    if (method === 'agents.list') { changed = true; return null; }
    if (method === 'skills.status') return null;
    if (method === 'sessions.describe' && changed) return { session: { ...root, sessionId: 'new-instance' } };
    return f.rpc(method, params);
  };
  await rejectsCode(collectSnapshot(config, { rpc: unsafeRpc, now, retryDelays: [], readMetadata: async () => null }), 'SESSION_CHANGED_DURING_COLLECTION');
});

test('the additive CLI method allowlist never admits content or capability endpoints', async () => {
  const methods = [];
  const runner = async (command, args) => { methods.push(args[2]); return { stdout: '{}' }; };
  await gatewayRpc('agents.list', {}, runner);
  await gatewayRpc('skills.status', { agentId: 'main' }, runner);
  assert.deepEqual(methods, ['agents.list', 'skills.status']);
  for (const method of ['tools.effective', 'config.get', 'agents.files.get', 'skills.skillCard', 'tasks.list', 'chat.history'])
    await rejectsCode(gatewayRpc(method, {}, runner), 'RPC_METHOD_NOT_ALLOWED');
});

// Explicit all-conversations accounting regressions.
{
const { collectSnapshot, discoverSessions, validateConfig, LIMITS, CONVERSATION_AGENTS } = await import('../src/collect.mjs'); const { makeRange, mergeDaily, buildSnapshot } = await import('../src/telemetry.mjs'); const { publicSnapshot, validateSnapshot } = await import('../src/handler.mjs');
const now = new Date('2026-10-13T11:00:00Z');
const profileId = 'profile-owner-A';
const actor = (id, type = 'human') => ({ type, id, identity: { type: type === 'human' ? 'profile' : 'agent', id } });
const main = { agentId: 'main', key: 'agent:main:discord:first', sessionId: 'main-private-instance', createdVia: 'operator', createdActor: actor(profileId), owner: { actor: actor(profileId) }, visibility: 'shared', sharingRole: 'owner', kind: 'direct' };
const second = { ...main, key: 'agent:main:chat:second', sessionId: 'second-private-instance' };
const alias = { ...second, key: 'agent:main:chat:alias' };
const children = CONVERSATION_AGENTS.slice(1).map(agentId => ({ agentId, key: 'agent:' + agentId + ':subagent:private', sessionId: 'shared-id-across-agents', spawnedBy: second.key, parentSessionKey: second.key, parentSessionId: second.sessionId, createdVia: 'spawn', createdActor: actor('main', 'agent'), owner: { actor: actor('main', 'agent') }, visibility: 'shared', sharingRole: 'member', kind: 'direct' }));
const nested = { ...children[0], key: 'agent:dev-builder:subagent:nested', sessionId: 'nested-instance', spawnedBy: children[1].key, parentSessionKey: children[1].key, parentSessionId: children[1].sessionId, createdActor: actor(children[1].agentId, 'agent'), owner: { actor: actor(children[1].agentId, 'agent') } };
const independent = { ...children[0], key: 'agent:dev-builder:chat:unrelated', sessionId: 'independent-private-instance', spawnedBy: undefined };
const denied = { agentId: 'system', key: 'agent:system:chat:private', sessionId: 'system-private', spawnedBy: main.key };
const config = { rootSessionKey: main.key, snapshotPath: '/private/snapshot.json', scopeMode: 'all-conversations', conversationProfileId: profileId, lookbackDays: 1 };
const all = [main, second, alias, ...children, nested, independent, denied];
function fixture({ rows = all, pageSize = 2, change = false } = {}) {
  const calls = [];
  let rootReads = 0;
  const rpc = async (method, params) => {
    calls.push({ method, params });
    if (method === 'users.self') return { profile: { id: profileId } };
    if (method === 'sessions.describe') return { session: main };
    if (method === 'sessions.list') {
      let matches;
      if (params.spawnedBy) matches = rows.filter(r => r.spawnedBy === params.spawnedBy || r.parentSessionKey === params.spawnedBy);
      else if (params.excludeSubagents) {
        if (params.offset === 0) rootReads++;
        matches = rows.filter(r => r.agentId === 'main' && !r.spawnedBy && !r.parentSessionKey);
        if (change && rootReads > 1) matches = matches.map(r => ({ ...r, sessionId: 'replaced' }));
      } else matches = rows.filter(r => r.agentId === params.agentId);
      const offset = params.offset;
      return { sessions: matches.slice(offset, offset + pageSize).map(r => ({ ...r, label: 'SECRET TITLE', task: 'SECRET TASK', lastMessage: 'SECRET TEXT', command: 'SECRET COMMAND' })),
        hasMore: offset + pageSize < matches.length, nextOffset: offset + pageSize < matches.length ? offset + pageSize : null };
    }
    if (method === 'sessions.usage') {
      assert.equal(params.groupBy, 'instance');
      const row = rows.find(r => r.key === params.key);
      assert.ok(row && row !== independent && row !== denied);
      const unknown = row.agentId === 'dev-qa';
      const totals = { input: unknown ? undefined : 10, output: 5, cacheRead: 20, cacheWrite: 2, totalTokens: 37, totalCost: 0.01, missingCostEntries: unknown ? 1 : 0 };
      return { startDate: params.startDate, endDate: params.endDate, sessions: [{ ...row, scope: 'instance', usage: { ...totals, sessionId: row.sessionId } }],
        totals, aggregates: { byModel: [{ provider: 'openai', model: 'gpt-test', count: 1, totals }], modelDaily: [{ date: params.endDate, provider: 'openai', model: 'gpt-test', count: 1, tokens: 37, cost: 0.01 }] }, cacheStatus: { status: 'fresh' } };
    }
    if (method === 'agents.list') return { agents: CONVERSATION_AGENTS.map(id => ({ id })).concat({ id: 'system' }) };
    if (method === 'skills.status') return { agentId: 'main', skills: [] };
    if (method === 'audit.activity.list') return { events: [] };
    throw new Error('Unexpected read');
  };
  return { rpc, calls };
}

test('all mode is explicit and scoped mode remains the default', async () => {
  assert.throws(() => validateConfig({ ...config, scopeMode: 'all' }), { code: 'INVALID_SCOPE_MODE' });
  assert.throws(() => validateConfig({ ...config, rootSessionKey: children[0].key }), { code: 'ALL_CONVERSATIONS_REQUIRES_MAIN' });
  assert.throws(() => validateConfig({ ...config, conversationProfileId: 'bad\u0000id' }));
  const f = fixture({ rows: [main, second] });
  const scoped = await discoverSessions({ ...config, scopeMode: 'scoped' }, f.rpc);
  assert.deepEqual(scoped.map(r => r.key), [main.key]);
  const legacy = { ...config }; delete legacy.scopeMode;
  assert.deepEqual(await discoverSessions(legacy, f.rpc), scoped);
});

test('all mode pages owner-attributed roots and closes lineage across eight agents, deduplicating exact instances only', async () => {
  const f = fixture();
  const rows = await discoverSessions(config, f.rpc);
  assert.equal(rows.length, 10); // two main instances, seven specialists, one nested instance
  assert.equal(rows.find(r => r.key === second.key).aliases.length, 2);
  assert.equal(rows.filter(r => r.sessionId === children[0].sessionId).length, 7);
  assert.ok(!rows.some(r => r.key === independent.key || r.key === denied.key));
  assert.ok(!JSON.stringify(rows).includes('SECRET'));
  const lists = f.calls.filter(c => c.method === 'sessions.list');
  assert.ok(lists.some(c => c.params.offset > 0));
  assert.deepEqual(new Set(rows.map(r => r.agentId)), new Set(CONVERSATION_AGENTS));
  assert.ok(lists.every(c => c.params.spawnedBy || c.params.agentId === 'main' && c.params.ownerId === profileId && c.params.creatorId === profileId));
  assert.ok(lists.every(c => c.params.archived === 'all' && c.params.includeDerivedTitles === false && c.params.includeLastMessage === false && c.params.includeActivitySummary === false && c.params.excludeSystem && c.params.excludeCron));
});

test('required human identity restricts roots using typed ownership, never appearing in snapshots', async () => {
  const f = fixture({ rows: [main] });
  const snapshot = await collectSnapshot(config, { rpc: f.rpc, now, retryDelays: [] });
  assert.equal(snapshot.coverage.sessions, 1);
  assert.ok(!JSON.stringify(snapshot).includes(profileId));
  const lists = f.calls.filter(c => c.method === 'sessions.list');
  assert.ok(lists.filter(c => c.params.excludeSubagents).every(c => c.params.ownerId === profileId && c.params.creatorId === profileId && c.params.profileRelation.profileId === profileId && c.params.profileRelation.relationship === 'owned'));
  assert.ok(lists.filter(c => c.params.spawnedBy).every(c => c.params.ownerId === undefined));
});

test('bounded paging, invalid cursors and conflicting reused keys fail closed', async () => {
  const f = fixture();
  await assert.rejects(discoverSessions(config, f.rpc, { ...LIMITS, sessionPages: 1 }), { code: 'SESSION_DISCOVERY_LIMIT' });
  await assert.rejects(discoverSessions(config, async (method) => method === 'users.self' ? { profile: { id: profileId } } : { sessions: [], hasMore: true, nextOffset: 0 }), { code: 'INVALID_SESSION_CURSOR' });
  const conflict = fixture({ rows: [main, { ...main, sessionId: 'old-private-instance' }] });
  await assert.rejects(discoverSessions(config, conflict.rpc), { code: 'SESSION_CHANGED_DURING_COLLECTION' });
});

test('all mode totals recombine by agent, preserve nulls and publish no conversation detail', async () => {
  const f = fixture(); const allowlists = [];
  const snapshot = await collectSnapshot({ ...config, allowlistPath: '/private/sessions.json', skillEventsPath: '/private/events.jsonl', scopeLabel: 'PRIVATE LABEL' }, {
    rpc: f.rpc, now, retryDelays: [], writeAllowlist: async (_p, keys) => allowlists.push(keys),
    readSkillEvents: async () => { throw new Error('Observer must not be read'); },
    readMetadata: async () => ({ schemaVersion: 1, agents: {}, skills: {}, tasks: {} })
  });
  assert.equal(snapshot.scopeMode, 'all-conversations');
  assert.equal(snapshot.coverage.sessions, 10);
  assert.equal(snapshot.daily[0].totalTokens, 370);
  assert.equal(snapshot.daily[0].requests, 10);
  assert.equal(snapshot.daily[0].input, null);
  assert.equal(snapshot.daily[0].costUsd, null);
  assert.deepEqual(mergeDaily(snapshot.agentDaily.map(({ agentId, ...r }) => r)), snapshot.daily);
  assert.deepEqual(snapshot.requests, []); assert.equal(snapshot.tasks, null);
  assert.equal(snapshot.agentRunDaily, null); assert.equal(snapshot.skillDaily, null);
  assert.equal(snapshot.coverage.details.tasks, 'unavailable');
  assert.ok(snapshot.coverage.notes.some(n => /partial retained history/.test(n)));
  assert.deepEqual(allowlists, [[], []]);
  assert.ok(!f.calls.some(c => c.method.startsWith('audit.') || c.method === 'sessions.describe'));
  assert.equal(f.calls.filter(c => c.method === 'sessions.usage').length, 10);
  assert.equal(snapshot.agents.length, 8);
  assert.equal(validateSnapshot(snapshot), true);
  const published = JSON.stringify(publicSnapshot({ ...snapshot, secret: 'SECRET', agentDaily: snapshot.agentDaily.map(r => ({ ...r, sessionKey: main.key, title: 'SECRET' })) }));
  for (const forbidden of ['SECRET', 'PRIVATE', ...all.map(r => r.key), ...all.map(r => r.sessionId)]) assert.ok(!published.includes(forbidden), forbidden);
});

test('two users sharing main and specialist IDs cannot expand human accounting scope', async () => {
  const other = { ...main, key: 'agent:main:chat:other-human', sessionId: 'other-human-instance', createdActor: actor('profile-owner-B'), owner: { actor: actor('profile-owner-B') } };
  const otherChild = { ...children[0], key: 'agent:dev-builder:subagent:other-human', sessionId: 'other-child-instance', spawnedBy: other.key, parentSessionKey: other.key, parentSessionId: other.sessionId };
  const f = fixture({ rows: [main, other, otherChild] });
  const snapshot = await collectSnapshot(config, { rpc: f.rpc, now, retryDelays: [] });
  assert.equal(snapshot.coverage.sessions, 1);
  assert.ok(f.calls.filter(c => c.method === 'sessions.usage').every(c => c.params.key === main.key));
  assert.ok(f.calls.filter(c => c.method === 'sessions.list' && c.params.spawnedBy).every(c => c.params.spawnedBy === main.key));
});

test('ambiguous channel identities, reassigned roots and private/system/denied metadata are excluded', async () => {
  const unsafe = [
    { createdActor: actor('profile-owner-B'), owner: { actor: actor(profileId) } },
    { owner: { actor: actor('profile-owner-B'), assignedAt: 10 } },
    { createdActor: { type: 'human', id: profileId, identity: { type: 'observation', id: profileId, pluginId: 'discord', accountId: 'default', senderKind: 'human' } } },
    { createdActor: { type: 'human', id: profileId } },
    { owner: { actor: actor(profileId, 'agent') } },
    { incognito: true }, { visibility: 'draft' }, { visibility: 'private' }, { visibility: undefined },
    { sharingRole: 'denied' }, { sharingRole: undefined }, { isBackground: true }, { createdVia: 'cron' },
    { createdVia: 'internal' }, { classification: 'heartbeat' }, { createdActor: { type: 'system', id: profileId } }
  ].map((extra, index) => ({ ...main, key: 'agent:main:chat:unsafe-' + index, sessionId: 'unsafe-instance-' + index, ...extra }));
  const f = fixture({ rows: [main, ...unsafe] });
  assert.deepEqual((await discoverSessions(config, f.rpc)).map(r => r.key), [main.key]);
});

test('reassigned, private or old-parent child instances cannot inherit admitted roots', async () => {
  const extras = [
    { owner: { actor: actor('profile-owner-B'), assignedAt: 20 } },
    { owner: { actor: actor('main', 'agent'), assignedAt: 20 } },
    { createdActor: actor('profile-owner-B') }, { parentSessionId: 'old-root-instance' },
    { parentSessionId: undefined }, { visibility: 'draft' }, { incognito: true }, { sharingRole: 'denied' }
  ].map((extra, index) => ({ ...children[0], key: 'agent:dev-builder:subagent:unsafe-' + index, sessionId: 'unsafe-child-' + index, ...extra }));
  const f = fixture({ rows: [second, ...extras] });
  assert.deepEqual((await discoverSessions(config, f.rpc)).map(r => r.key), [second.key]);
});

test('reporting context must identify the explicitly authorized person before any session read', async () => {
  const missing = { ...config }; delete missing.conversationProfileId;
  assert.throws(() => validateConfig(missing), { code: 'AUTHORIZED_CONVERSATION_PROFILE_REQUIRED' });
  assert.throws(() => validateConfig({ ...config, conversationProfileId: 'gateway-owner' }), { code: 'SHARED_OWNER_NOT_A_PERSON' });
  for (const result of [{}, { profile: { id: 'profile-owner-B' } }, { profile: { id: profileId, mergedInto: 'profile-owner-B' } }]) {
    const calls = [];
    await assert.rejects(collectSnapshot(config, { rpc: async method => { calls.push(method); return result; }, now }), error => ['REPORTING_IDENTITY_UNAVAILABLE', 'REPORTING_IDENTITY_MISMATCH'].includes(error.code));
    assert.deepEqual(calls, ['users.self']);
  }
});

test('final revalidation catches child ownership changes, visibility changes and reporting identity drift', async () => {
  for (const mutation of [row => ({ ...row, owner: { actor: actor('profile-owner-B'), assignedAt: 20 } }), row => ({ ...row, visibility: 'draft' }), row => ({ ...row, sharingRole: 'viewer' })]) {
    const f = fixture({ rows: [second, children[0]] }); let afterUsage = false; let writes = 0;
    const rpc = async (method, params) => {
      if (method === 'sessions.usage') afterUsage = true;
      const result = await f.rpc(method, params);
      if (afterUsage && method === 'sessions.list') result.sessions = result.sessions.map(row => row.key === children[0].key ? mutation(row) : row);
      return result;
    };
    await assert.rejects(run(config, { rpc, now, retryDelays: [], writeSnapshot: async () => { writes++; } }), { code: 'SESSION_CHANGED_DURING_COLLECTION' });
    assert.equal(writes, 0);
  }
  const assignedChild = { ...children[0], owner: { actor: actor(profileId), assignedAt: 10 } };
  const epochFixture = fixture({ rows: [second, assignedChild] }); let afterUsage = false;
  await assert.rejects(collectSnapshot(config, { now, retryDelays: [], rpc: async (method, params) => {
    if (method === 'sessions.usage') afterUsage = true;
    const result = await epochFixture.rpc(method, params);
    if (afterUsage && method === 'sessions.list') result.sessions = result.sessions.map(row => row.key === assignedChild.key ? { ...row, owner: { ...row.owner, assignedAt: 20 } } : row);
    return result;
  } }), { code: 'SESSION_CHANGED_DURING_COLLECTION' });
  const f = fixture({ rows: [main] }); let read = 0;
  await assert.rejects(collectSnapshot(config, { now, retryDelays: [], rpc: async (method, params) => method === 'users.self' && ++read >= 3 ? { profile: { id: 'profile-owner-B' } } : f.rpc(method, params) }), { code: 'REPORTING_IDENTITY_MISMATCH' });
});

test('all mode ignores project admission and keeps long-range totals when daily splits hit their bound', async () => {
  const f = fixture();
  const snapshot = await collectSnapshot({ ...config, lookbackDays: 30, projectId: 'different-private-project' }, {
    rpc: f.rpc, now, limits: { dailyDetails: 0 }, retryDelays: []
  });
  assert.equal(snapshot.coverage.sessions, 10);
  assert.equal(snapshot.daily[0].totalTokens, 370);
  assert.equal(snapshot.daily[0].input, null);
  assert.equal(snapshot.daily[0].costUsd, null);
  assert.deepEqual(mergeDaily(snapshot.agentDaily.map(({ agentId, ...r }) => r)), snapshot.daily);
  assert.ok(snapshot.coverage.notes.some(n => /Daily detail query bound/.test(n)));
  assert.ok(f.calls.filter(c => c.method === 'sessions.list').every(c => c.params.projectId === undefined));
  assert.ok(!JSON.stringify(snapshot).includes('different-private-project'));
});

test('membership changes or API visibility failure preserve the previous accounting snapshot', async () => {
  const f = fixture({ change: true });
  await assert.rejects(collectSnapshot(config, { rpc: f.rpc, now, retryDelays: [] }), { code: 'SESSION_CHANGED_DURING_COLLECTION' });
  await assert.rejects(collectSnapshot(config, { rpc: async method => method === 'users.self' ? { profile: { id: profileId } } : { sessions: [], hasMore: false }, now, retryDelays: [] }), { code: 'NO_OWNER_ATTRIBUTED_CONVERSATIONS' });
  const deniedRpc = async () => { throw new Error('FORBIDDEN'); };
  await assert.rejects(collectSnapshot(config, { rpc: deniedRpc, now, retryDelays: [] }));
});

test('public all-mode projection also suppresses details from an otherwise valid older scoped snapshot', () => {
  const snapshot = buildSnapshot({ now, range: makeRange(now, 1), sessions: [main], rows: [], events: [{ eventId: 'evt', kind: 'agent_run', action: 'agent.run.finished', status: 'succeeded', occurredAt: now.getTime() - 1, agentId: 'main', sessionKey: main.key, sessionId: main.sessionId, runId: 'private-run' }] });
  assert.equal(snapshot.requests.length, 1);
  const legacy = { ...snapshot }; delete legacy.scopeMode;
  assert.equal(publicSnapshot(legacy).requests.length, 1);
  const published = publicSnapshot({ ...snapshot, scopeMode: 'all-conversations', scopeLabel: 'SECRET SUMMARY', requests: snapshot.requests.map(r => ({ ...r, description: 'SECRET SUMMARY' })) });
  assert.deepEqual(published.requests, []);
  assert.ok(!JSON.stringify(published).includes('SECRET SUMMARY'));
  assert.equal(validateSnapshot({ ...snapshot, scopeMode: 'unknown' }), false);
});

}
