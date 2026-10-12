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
