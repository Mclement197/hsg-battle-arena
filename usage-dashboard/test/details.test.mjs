import test from 'node:test';
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { buildDetails, descriptionHash, DETAIL_LIMITS, readPublicMetadata, sessionDetails, taskId, validatePublicMetadata } from '../src/details.mjs';
import { auditProjection, makeRange, mergeDaily, opaqueId } from '../src/telemetry.mjs';

const now = new Date('2026-10-12T11:00:00Z');
const range = makeRange(now, 1);
const root = { key: 'agent:main:dashboard:fixture', agentId: 'main', sessionId: 'root-instance', snapshotAt: now.getTime() };
const child = { key: 'agent:builder:subagent:fixture', agentId: 'builder', sessionId: 'child-instance', spawnedBy: root.key };
const metadata = () => ({ schemaVersion: 1, agents: { main: { name: 'Coordinator', role: 'Project coordination' } }, skills: {}, tasks: {} });
const row = (agentId, overrides = {}) => ({ agentId, date: range.end, provider: 'openai', model: 'gpt-test', input: 10, output: 5, cacheRead: 2, cacheWrite: 0, totalTokens: 17, requests: 1, costUsd: 0, ...overrides });
const event = (overrides = {}) => ({ eventId: 'finish', kind: 'agent_run', action: 'agent.run.finished', status: 'succeeded',
  occurredAt: now.getTime() - 1000, agentId: root.agentId, sessionKey: root.key, sessionId: root.sessionId, runId: 'raw-run', ...overrides });
const build = (overrides = {}) => buildDetails({ now, range, sessions: [root, child], rows: [row('main'), row('builder')], events: [],
  rootSessionKey: root.key, directory: { agents: [{ id: 'main' }, { id: 'builder' }, { id: 'idle' }] }, catalog: { agentId: 'main', skills: [] }, metadata: metadata(), ...overrides });

test('approved metadata is closed, bounded and rejects private payloads', () => {
  const good = metadata();
  good.skills.research = { descriptionHash: descriptionHash('raw descriptor'), description: 'Investigate public sources.' };
  good.tasks[taskId(child.agentId, child.sessionId)] = { title: 'Backend review', summary: null };
  assert.equal(validatePublicMetadata(good), good);
  for (const invalid of [null, {}, { ...good, schemaVersion: 2 }, { ...good, privatePath: 'secret' },
    { ...good, tasks: { 'raw-session-id': { title: 'Title', summary: null } } },
    { ...good, skills: { research: { descriptionHash: 'invalid', description: 'Text' } } },
    { ...good, agents: { main: { name: 'Name', role: '/home/private' } } },
    { ...good, agents: { main: { name: 'Name', role: 'x'.repeat(401) } } }]) assert.equal(validatePublicMetadata(invalid), null);
});

test('public metadata loader reads only its fixed file, refuses symlinks/oversize/malformed, closes handles', async () => {
  const content = Buffer.from(JSON.stringify(metadata()));
  let closed = 0;
  const io = { open: async (path, flags) => {
    assert.ok(path.endsWith('/usage-dashboard/data/public-metadata.json'));
    assert.ok(flags & constants.O_NOFOLLOW);
    return { stat: async () => ({ isFile: () => true, size: content.length }),
      read: async (bytes, offset, length) => ({ bytesRead: content.copy(bytes, offset, offset, offset + Math.min(length, 7)) }),
      close: async () => { closed += 1; } };
  } };
  assert.deepEqual(await readPublicMetadata(io), metadata());
  assert.equal(closed, 1);
  assert.equal(await readPublicMetadata({ open: async () => { throw new Error('symlink or missing secret path'); } }), null);
  assert.equal(await readPublicMetadata({ open: async () => ({ stat: async () => ({ isFile: () => true, size: 1024 * 1024 + 1 }), close: async () => {} }) }), null);
  assert.equal(await readPublicMetadata({ open: async () => ({ stat: async () => ({ isFile: () => true, size: 10 }), read: async () => ({ bytesRead: 0 }), close: async () => {} }) }), null);
});

test('agent names and roles never inherit raw identity; directory-only agents have no zero usage claim', () => {
  const result = build({ directory: { agents: [{ id: 'main', name: 'PRIVATE NAME', identity: { theme: 'PRIVATE ROLE' }, workspace: '/home/private',
    model: { primary: 'openai/gpt-test' }, agentRuntime: { id: 'openclaw', source: 'private' } }, { id: 'builder', name: 'PRIVATE NAME' }, { id: 'idle' }] } });
  assert.equal(result.agents[0].name, 'Coordinator');
  assert.equal(result.agents[0].role, 'Project coordination');
  assert.equal(result.agents[0].configuredModel, 'openai/gpt-test');
  assert.equal(result.agents[1].name, 'builder');
  assert.equal(result.agents[1].role, null);
  assert.equal(result.agents[2].usageState, 'no_scoped_sessions');
  assert.equal(result.agents[2].scopedSessions, 0);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.ok(!JSON.stringify(result).includes('/home/private'));
  assert.equal(result.agents[0].capabilities, undefined);
  const inherited = build({ directory: { agents: [{ id: 'constructor' }] } });
  assert.equal(inherited.agents[0].name, 'constructor');
});

test('per-agent partitions recombine exactly and preserve null buckets and known free cost', () => {
  const rows = [row('main'), row('main', { input: null, costUsd: null }), row('builder'), row('builder', { provider: 'other', model: 'gpt-test' })];
  const details = build({ rows });
  assert.deepEqual(mergeDaily(details.agentDaily.map(({ agentId, ...r }) => r)), mergeDaily(rows.map(({ agentId, ...r }) => r)));
  const main = details.agentDaily.find(r => r.agentId === 'main');
  assert.equal(main.input, null);
  assert.equal(main.costUsd, null);
  assert.equal(main.totalTokens, 34);
  assert.equal(details.agentDaily.find(r => r.agentId === 'builder').costUsd, 0);
});

test('skill catalog only releases hash-matched curation, maps sources, and never invents absent reads', () => {
  const approved = metadata();
  approved.skills.research = { descriptionHash: descriptionHash('PRIVATE RAW DESCRIPTION'), description: 'Review public primary sources.' };
  const catalog = { agentId: 'main', workspaceDir: '/home/private', skills: [{ name: 'research', description: 'PRIVATE RAW DESCRIPTION', source: 'openclaw-managed',
    eligible: true, disabled: false, modelVisible: true, userInvocable: false, filePath: '/home/private/SKILL.md', instructions: 'PRIVATE BODY' },
    { name: 'graft', description: 'PRIVATE UNAPPROVED', source: 'untrusted' }] };
  const skillEvents = [{ eventId: 'read-1', sessionKey: root.key, skill: 'research', at: new Date(now.getTime() - 1000).toISOString() },
    { eventId: 'child-read', sessionKey: child.key, skill: 'research', at: new Date(now.getTime() - 1000).toISOString() }];
  const result = build({ metadata: approved, catalog, skillEvents, skillEventsAvailable: true });
  assert.equal(result.skillCatalog[0].description, 'Review public primary sources.');
  assert.equal(result.skillCatalog[0].descriptionSource, 'approved_public');
  assert.equal(result.skillCatalog[0].source, 'managed');
  assert.equal(result.skillCatalog[0].observedReads, 1);
  assert.equal(result.skillCatalog[0].disabled, false);
  assert.equal(result.skillCatalog[1].description, null);
  assert.equal(result.skillCatalog[1].observedReads, null);
  assert.equal(result.skillCatalog[1].source, 'other');
  assert.ok(result.skillCatalog.every(r => r.agentId === 'main'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  catalog.skills[0].description += ' changed';
  assert.equal(build({ metadata: approved, catalog }).skillCatalog[0].description, null);
  catalog.agentId = 'builder';
  assert.equal(build({ metadata: approved, catalog }).skillCatalog, null);
});

test('missing observer remains null even when events were accidentally supplied', () => {
  const result = build({ catalog: { skills: [{ name: 'research' }] }, skillEvents: [{ eventId: 'read', sessionKey: root.key, skill: 'research', at: now.toISOString() }] });
  assert.equal(result.skillCatalog[0].observedReads, null);
  assert.equal(result.skillCatalog[0].lastObservedAt, null);
});

test('ambiguous skill names are excluded, malformed rows and caps disclose partial coverage', () => {
  const result = build({ catalog: { skills: [{ name: 'research', description: 'a' }, { name: 'research', description: 'b' }, null, { name: 'graft' }] }, limits: { ...DETAIL_LIMITS, agents: 1, tasks: 1, agentDaily: 1 } });
  assert.equal(result.skillCatalog.length, 1);
  assert.equal(result.skillCatalog[0].name, 'graft');
  assert.equal(result.coverage.skills, 'partial');
  assert.equal(result.coverage.agents, 'partial');
  assert.equal(result.coverage.tasks, 'partial');
  assert.equal(result.tasks.length, 1);
  assert.equal(result.agentDaily, null);
  assert.ok(result.notes.some(n => n.includes('core project usage is unchanged')));
});

test('task approval joins exact instances only, labels and prompts never fall back into titles', () => {
  const approved = metadata();
  approved.tasks[taskId(child.agentId, child.sessionId)] = { title: 'Backend review', summary: 'Verify scoped API metadata.' };
  const privateChild = { ...child, label: 'PRIVATE LABEL', task: 'PRIVATE PROMPT', goal: { objective: 'PRIVATE GOAL' }, status: 'done', startedAt: now.getTime() - 3000, endedAt: now.getTime() - 1000, modelProvider: 'openai', model: 'gpt-test' };
  const result = build({ sessions: [root, privateChild], metadata: approved });
  assert.equal(result.tasks[1].id, opaqueId('task', child.agentId, child.sessionId));
  assert.equal(result.tasks[1].title, 'Backend review');
  assert.equal(result.tasks[1].titleSource, 'approved_label');
  assert.equal(result.tasks[1].summarySource, 'approved_metadata');
  assert.equal(result.tasks[1].status, 'succeeded');
  assert.equal(result.tasks[1].durationMs, 2000);
  assert.equal(result.tasks[1].modelSource, 'session_selection');
  assert.equal(result.tasks[1].model, 'openai/gpt-test');
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  const reused = build({ sessions: [root, { ...privateChild, sessionId: 'new-instance' }], metadata: approved });
  assert.equal(reused.tasks[1].titleSource, 'inferred');
  assert.equal(reused.tasks[1].summary, null);
  assert.notEqual(reused.tasks[1].id, result.tasks[1].id);
});

test('lifecycle evidence beats stale running labels; missing/invalid duration remains null', () => {
  const stale = build({ sessions: [{ ...root, status: 'running', hasActiveRun: false, runtimeMs: 123 }] }).tasks[0];
  assert.equal(stale.status, 'unknown');
  assert.equal(stale.durationMs, null);
  const active = build({ sessions: [{ ...root, status: 'done', hasActiveRun: true, runtimeMs: 123 }] }).tasks[0];
  assert.equal(active.status, 'running');
  assert.equal(active.statusSource, 'live_session');
  assert.equal(active.durationMs, 123);
  assert.equal(active.durationSource, 'session_runtime');
  const queued = build({ sessions: [{ ...root, status: 'queued', subagentRunState: 'active', hasActiveRun: false }] }).tasks[0];
  assert.equal(queued.status, 'queued');
  const invalid = build({ sessions: [{ ...root, status: 'done', startedAt: now.getTime() - 1000, endedAt: now.getTime() - 2000 }] }).tasks[0];
  assert.equal(invalid.durationMs, null);
  assert.equal(invalid.endedAt, null);
  const missing = build({ sessions: [{ ...root, status: 'failed' }] }).tasks[0];
  assert.equal(missing.durationMs, null);
  assert.equal(missing.observedRuns, null);
  assert.equal(missing.observedToolSteps, null);
});

test('audit enrichments deduplicate exact instances, require endpoints and do not attribute models', () => {
  const start = event({ eventId: 'start', action: 'agent.run.started', status: 'started', occurredAt: now.getTime() - 3000 });
  const finish = event();
  const toolStart = event({ eventId: 'tool-start', kind: 'tool_action', action: 'tool.action.started', status: 'started', toolName: 'read', toolCallId: 'call' });
  const toolEnd = { ...toolStart, eventId: 'tool-finish', action: 'tool.action.finished', status: 'succeeded' };
  const events = [finish, toolEnd, start, toolStart, toolEnd, { ...toolEnd, eventId: 'duplicate-finish' }, event({ eventId: 'old', sessionId: 'old-instance' })];
  const result = auditProjection(events, [root], range);
  const r = result.requests[0];
  assert.equal(r.durationMs, 2000);
  assert.equal(r.observedToolSteps, 1);
  assert.equal(r.agentId, 'main');
  assert.equal(r.taskId, taskId(root.agentId, root.sessionId));
  assert.deepEqual(r.categories, ['File inspection']);
  assert.equal(r.model, 'Not attributed');
  assert.equal(r.totalTokens, null);
  assert.ok(!JSON.stringify(result).includes('raw-run'));
  assert.equal(auditProjection([finish], [root], range).requests[0].durationMs, null);
  assert.equal(auditProjection([{ ...toolEnd, toolCallId: undefined }], [root], range).requests[0].observedToolSteps, null);
  const details = build({ events });
  assert.equal(details.tasks[0].observedToolSteps, 1);
  assert.equal(details.tasks[0].observedRuns, 1);
  assert.equal(details.coverage.tasks, 'partial');
});

test('task observations use all retained audit runs, not the recent-request display cap', () => {
  const events = Array.from({ length: 120 }, (_, i) => event({ eventId: 'event-' + i, runId: 'run-' + i }));
  assert.equal(auditProjection(events, [root], range).requests.length, 100);
  assert.equal(build({ events }).tasks[0].observedRuns, 120);
});

test('optional source failures are explicit null details, not directory/skill zeros', () => {
  const result = build({ directory: null, catalog: null, metadata: null });
  assert.equal(result.agents, null);
  assert.equal(result.skillCatalog, null);
  assert.equal(result.coverage.agents, 'unavailable');
  assert.equal(result.coverage.skills, 'unavailable');
  assert.equal(result.tasks.length, 2);
  assert.equal(result.agentDaily.length, 2);
});

test('discovery retains typed safe lifecycle metadata only', () => {
  const fields = sessionDetails({ label: 'PRIVATE', prompt: 'PRIVATE', path: '/home/private', model: 'gpt-test', modelProvider: 'openai',
    hasActiveRun: false, status: 'done', startedAt: 3, endedAt: -1, runtimeMs: null, snapshotAt: now.getTime() });
  assert.deepEqual(fields, { status: 'done', model: 'gpt-test', modelProvider: 'openai', startedAt: 3, snapshotAt: now.getTime(), hasActiveRun: false });
});


test('UTC times are bounded by the Gateway observation, runtime is nonnegative and live tasks have no stale end', () => {
  const sample = now.getTime() + 1000;
  const live = build({ sessions: [{ ...root, snapshotAt: sample, status: 'running', hasActiveRun: true,
    startedAt: now.getTime() - 2000, endedAt: now.getTime() - 1000, runtimeMs: 3000 }] }).tasks[0];
  assert.equal(live.observedAt, new Date(sample).toISOString());
  assert.equal(live.durationMs, 3000);
  assert.equal(live.endedAt, null);
  for (const value of [-1, Infinity, NaN, Number.MAX_SAFE_INTEGER]) {
    const task = build({ sessions: [{ ...root, status: 'done', startedAt: value, endedAt: value, runtimeMs: value }] }).tasks[0];
    assert.equal(task.startedAt, null);
    assert.equal(task.endedAt, null);
    assert.equal(task.durationMs, null);
  }
  const future = build({ sessions: [{ ...root, status: 'done', snapshotAt: sample + 86400000, startedAt: sample + 86400000, endedAt: sample + 86400000 }] }).tasks[0];
  assert.equal(future.observedAt, now.toISOString());
  assert.equal(future.startedAt, null);
  assert.equal(future.endedAt, null);
  const excessive = build({ sessions: [{ ...root, status: 'running', hasActiveRun: true, startedAt: now.getTime() - 1000, runtimeMs: 1001 }] }).tasks[0];
  assert.equal(excessive.durationMs, null);
});

test('runtime/model lengths stay compatible with the public boundary', () => {
  const result = build({ directory: { agents: [{ id: 'main', agentRuntime: { id: 'x'.repeat(81) } }] },
    sessions: [{ ...root, modelProvider: 'x'.repeat(80), model: 'x'.repeat(100) }] });
  assert.equal(result.agents[0].runtime, null);
  assert.equal(result.tasks[0].model, null);
  assert.equal(result.tasks[0].modelSource, 'unavailable');
});

test('verified aliases share exact run/task IDs and mismatched agent or instance cannot join', () => {
  const alias = 'agent:main:alias';
  const sessions = [{ ...root, aliases: [root.key, alias] }];
  const events = [event({ sessionKey: alias }), event({ eventId: 'duplicate-alias', sessionKey: root.key }),
    event({ eventId: 'outsider', sessionKey: 'agent:main:outside' }), event({ eventId: 'wrong-agent', agentId: 'builder', sessionKey: alias }),
    event({ eventId: 'wrong-instance', sessionKey: alias, sessionId: 'old' })];
  const projected = auditProjection(events, sessions, range);
  assert.equal(projected.requests.length, 1);
  assert.equal(projected.requests[0].taskId, taskId(root.agentId, root.sessionId));
  assert.equal(projected.taskActivity[0].observedRuns, 1);
  assert.equal(projected.missingIdentity, 3);
  const details = build({ sessions: [{ ...root, key: alias, aliases: [root.key, alias] }], events });
  assert.equal(details.tasks[0].kind, 'root_session');
});


test('independently project-linked accounting stays unchanged but cannot release approved task metadata', () => {
  const independent = { key: 'agent:other:project:fixture', agentId: 'other', sessionId: 'independent-instance', projectId: 'fixture' };
  const approved = metadata();
  approved.tasks[taskId(independent.agentId, independent.sessionId)] = { title: 'Independent approved title', summary: 'Independent approved summary' };
  const result = build({ sessions: [root, child, independent], rows: [row('main'), row('builder'), row('other')], metadata: approved });
  assert.equal(result.agentDaily.length, 3);
  assert.equal(result.tasks.length, 2);
  assert.ok(!JSON.stringify(result).includes('Independent approved'));
  assert.ok(result.notes.some(n => n.includes('existing project usage scope is unchanged')));
});


test('task totals preserve uncertainty from any contributing run', () => {
  const complete = event({ eventId: 'known-run', runId: 'known' });
  const incomplete = event({ eventId: 'unknown-run', runId: 'unknown' });
  const tool = event({ eventId: 'known-tool', kind: 'tool_action', action: 'tool.action.finished', status: 'succeeded', runId: 'known', toolName: 'read', toolCallId: 'known-call' });
  const unidentified = { ...tool, eventId: 'unknown-tool', runId: 'unknown', toolCallId: undefined };
  const result = build({ events: [complete, incomplete, tool, unidentified] });
  assert.equal(result.tasks[0].observedRuns, 2);
  assert.equal(result.tasks[0].observedToolSteps, null);
  const missingLifecycle = build({ events: [complete, tool, unidentified] });
  assert.equal(missingLifecycle.tasks[0].observedRuns, null);
  assert.equal(missingLifecycle.tasks[0].observedToolSteps, null);
  const knownOnly = build({ events: [complete, tool] });
  assert.equal(knownOnly.tasks[0].observedRuns, 1);
  assert.equal(knownOnly.tasks[0].observedToolSteps, 1);
});
