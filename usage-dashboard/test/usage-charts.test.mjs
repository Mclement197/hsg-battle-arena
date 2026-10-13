import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, makeRange, auditProjection, skillEventProjection } from '../src/telemetry.mjs';
import { publicSnapshot, validateSnapshot } from '../src/handler.mjs';

const now = new Date('2026-10-13T09:00:00Z');
const range = makeRange(now);
const root = { key: 'agent:main:fixture', agentId: 'main', sessionId: 'root-private' };
const child = { key: 'agent:dev-builder:fixture', agentId: 'dev-builder', sessionId: 'child-private' };
const event = (id, overrides = {}) => ({ eventId: id, kind: 'agent_run', action: 'agent.run.finished', status: 'succeeded',
  occurredAt: now.getTime() - 1000, ...root, sessionKey: root.key, runId: 'run-private', ...overrides });
const skill = (id, overrides = {}) => ({ eventId: id, skill: 'research', at: '2026-10-12T22:30:00Z', sessionKey: root.key, ...overrides });
const snapshot = (overrides = {}) => buildSnapshot({ now, range, sessions: [root, child], rows: [], events: [], ...overrides });

test('agent chart counts lifecycle-evidenced exact-instance runs, not tools, sessions or receipts', () => {
  const events = [event('start', { action: 'agent.run.started', status: 'started', occurredAt: Date.parse('2026-10-11T08:00:00Z') }),
    event('finish'), event('finish'), event('same-run-second-receipt'),
    event('child', { agentId: child.agentId, sessionKey: child.key, sessionId: child.sessionId }),
    event('tool-only', { kind: 'tool_action', action: 'tool.action.finished', toolName: 'read', toolCallId: 'tool', runId: 'tool-only' }),
    event('rotated', { sessionId: 'old-instance', runId: 'rotated' }),
    event('outsider', { sessionKey: 'agent:main:unrelated', runId: 'outsider' }),
    event('out-of-range', { occurredAt: Date.parse('2026-08-01T12:00:00Z'), runId: 'old' })];
  const result = snapshot({ events });
  assert.deepEqual(result.agentRunDaily, [{ agentId: 'dev-builder', date: range.end, count: 1 }, { agentId: 'main', date: range.end, count: 1 }]);
  assert.equal(result.coverage.usageCharts.agents, 'partial');
  assert.equal(result.requests.length, 3); // Tool-only group remains honest activity detail, not a run count.
  assert.doesNotMatch(JSON.stringify(publicSnapshot(result)), /run-private|root-private|child-private|agent:main:fixture/);
});

test('run chart uses all retained groups before recent 100-row cap and exact aliases deduplicate', () => {
  const sessions = [{ ...root, aliases: ['agent:main:alias'] }];
  const events = Array.from({ length: 125 }, (_, i) => event('e-' + i, { runId: 'r-' + i }));
  events.push(event('alias', { sessionKey: 'agent:main:alias', runId: 'r-0' }));
  const result = auditProjection(events, sessions, range);
  assert.equal(result.requests.length, 100);
  assert.deepEqual(result.agentRunDaily, [{ agentId: 'main', date: range.end, count: 125 }]);
});

test('skill daily counts reconcile with named totals, Zurich dates, duplicates and scope', () => {
  const events = [skill('a'), skill('a'), skill('b', { sessionKey: child.key }),
    skill('c', { skill: 'ponytail', at: '2026-10-12T09:00:00Z' }),
    skill('old', { at: '2026-08-01T09:00:00Z' }), skill('future', { at: '2026-10-14T09:00:00Z' }),
    skill('unrelated', { sessionKey: 'agent:main:unrelated' }),
    skill('conflict'), skill('conflict', { skill: 'different' })];
  const observed = skillEventProjection(events, [root, child], range, now);
  assert.deepEqual(observed.skillDaily, [{ name: 'ponytail', date: '2026-10-12', count: 1 }, { name: 'research', date: '2026-10-13', count: 2 }]);
  assert.equal(observed.skills.reduce((n, row) => n + row.count, 0), observed.skillDaily.reduce((n, row) => n + row.count, 0));
  const value = snapshot({ skillEvents: events, skillEventsAvailable: true });
  assert.equal(value.coverage.usageCharts.skills, 'partial');
  assert.doesNotMatch(JSON.stringify(publicSnapshot(value)), /agent:main:fixture|eventId|sessionKey/);
});

test('unavailable observations stay null and partial sources never imply complete totals', () => {
  const absent = snapshot({ skillEvents: [skill('a')] });
  assert.equal(absent.skillDaily, null);
  assert.equal(absent.coverage.usageCharts.skills, 'unavailable');
  const partial = snapshot({ skillEventsAvailable: true, skillPartial: true, auditPartial: true });
  assert.deepEqual(partial.skillDaily, []);
  assert.deepEqual(partial.agentRunDaily, []);
  assert.deepEqual(partial.coverage.usageCharts, { skills: 'partial', agents: 'partial' });
});

test('chart projection drops private nested extras and rejects malformed counts, dates and identities', () => {
  const value = snapshot({ events: [event('a')], skillEvents: [skill('a')], skillEventsAvailable: true });
  const expected = structuredClone(value);
  for (const row of [...value.skillDaily, ...value.agentRunDaily, value.coverage.usageCharts]) {
    row.sessionKey = root.key; row.path = '/home/private'; row.taskText = 'private work';
  }
  assert.deepEqual(publicSnapshot(value), expected);
  for (const mutate of [v => v.skillDaily[0].count = null, v => v.agentRunDaily[0].count = 1.5,
    v => v.agentRunDaily[0].agentId = 'agent:main:private', v => v.skillDaily[0].name = '/home/private',
    v => v.agentRunDaily[0].date = 'today', v => v.coverage.usageCharts.agents = 'complete-forever',
    v => v.skillDaily = Array(6001).fill(v.skillDaily[0])]) {
    const bad = structuredClone(expected); mutate(bad); assert.equal(validateSnapshot(bad), false);
  }
  delete expected.skillDaily; delete expected.agentRunDaily; delete expected.coverage.usageCharts;
  assert.deepEqual(publicSnapshot(expected), expected); // Original v1 API stays compatible.
});

test('chart boundary rejects impossible calendar days and credential-shaped identifiers', () => {
  for (const change of [v => v.skillDaily[0].date = '2026-02-31', v => v.agentRunDaily[0].agentId = 'sk-privatecredential']) {
    const value = snapshot({ events: [event('a')], skillEvents: [skill('a')], skillEventsAvailable: true });
    change(value); assert.equal(validateSnapshot(value), false);
  }
});
