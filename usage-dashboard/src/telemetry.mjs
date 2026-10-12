import { createHash } from 'node:crypto';

export const TIME_ZONE = 'Europe/Zurich';
export const BUCKETS = ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'];
export class CollectionError extends Error {
  constructor(code) { super(code); this.name = 'CollectionError'; this.code = code; }
}
export const fail = (code) => { throw new CollectionError(code); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.length > 0 && value.length <= 500 && !/[\u0000-\u001f]/u.test(value);
export const numeric = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
export const opaqueId = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);

export function dateInZurich(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const get = (type) => parts.find((part) => part.type === type).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}
export function makeRange(now, lookbackDays = 30) {
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 366) fail('INVALID_LOOKBACK');
  const end = dateInZurich(now);
  const start = new Date(Date.parse(end + 'T12:00:00Z') - (lookbackDays - 1) * 86400000).toISOString().slice(0, 10);
  return { start, end, timeZone: TIME_ZONE };
}
export function inRange(date, range) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(date) && date >= range.start && date <= range.end;
}
export function sessionIdentity(row) {
  if (!object(row) || !nonempty(row.key) || !nonempty(row.sessionId)) fail('INVALID_SESSION_IDENTITY');
  const fromKey = /^agent:([^:]+):.+$/u.exec(row.key)?.[1];
  const agentId = row.agentId ?? fromKey;
  if (!nonempty(agentId) || (fromKey && fromKey !== agentId)) fail('INVALID_SESSION_IDENTITY');
  return { key: row.key, agentId, sessionId: row.sessionId };
}
export const sessionKey = (session) => JSON.stringify([session.agentId, session.key]);
export const instanceKey = (session) => JSON.stringify([session.agentId, session.sessionId]);
export function isChild(row, parent) {
  return row?.parentSessionKey === parent.key || row?.spawnedBy === parent.key || row?.controlOwnerSessionKey === parent.key ||
    (Array.isArray(parent.childSessions) && parent.childSessions.includes(row?.key));
}
export function allowedProjectRow(row, projectId) {
  return nonempty(projectId) && row?.projectId === projectId;
}
export function safeIdentifier(value, fallback = 'Unknown') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:/+-]{0,119}$/u.test(value)) return fallback;
  if (/^(agent:|sk-|ghp_|github_pat_|eyJ)|(?:^|\/)home\//u.test(value) || value.includes('://')) return fallback;
  return value;
}

export function usageState(report, expected, range) {
  if (!object(report) || !Array.isArray(report.sessions)) fail('INVALID_USAGE_REPORT');
  if (report.startDate !== range.start || report.endDate !== range.end) fail('USAGE_RANGE_MISMATCH');
  if (report.sessions.length !== 1) fail('USAGE_SCOPE_MISMATCH');
  const row = report.sessions[0];
  const actual = sessionIdentity(row);
  if (sessionKey(actual) !== sessionKey(expected) || actual.sessionId !== expected.sessionId || row.scope === 'family' ||
      (row.usage?.sessionId && row.usage.sessionId !== expected.sessionId)) fail('USAGE_SCOPE_MISMATCH');
  const status = report.cacheStatus?.status;
  if (row.computing || row.usage == null) return 'pending';
  if (!object(row.usage) || !object(report.totals) || !object(report.aggregates) ||
      !Array.isArray(report.aggregates.byModel) || !Array.isArray(report.aggregates.modelDaily)) fail('INVALID_USAGE_REPORT');
  if (status === 'fresh') return 'fresh';
  if (['refreshing', 'partial', 'stale'].includes(status)) {
    // Active sessions can refresh continuously; a dated existing rollup is an observation, not missing data.
    const age = Date.now() - report.cacheStatus.refreshedAt;
    return Number.isFinite(age) && age >= 0 && age <= 15 * 60 * 1000 ? 'cached' : 'pending';
  }
  fail('INVALID_USAGE_REPORT');
}
function cost(totals) {
  return count(totals?.missingCostEntries) === 0 ? numeric(totals.totalCost) : null;
}
function modelKey(value) { return JSON.stringify([value?.provider ?? null, value?.model ?? null]); }
function fields(date, entry, values) {
  return { date, provider: safeIdentifier(entry.provider), model: safeIdentifier(entry.model, 'Not attributed'), ...values };
}
export function modelDays(report, range) {
  const dates = new Set();
  for (const row of report.aggregates.modelDaily) {
    if (!inRange(row.date, range)) fail('USAGE_DATE_MISMATCH');
    dates.add(row.date);
  }
  if (!dates.size && numeric(report.totals.totalTokens) > 0) fail('MISSING_DAILY_ATTRIBUTION');
  return [...dates].sort();
}
export function dailyRows(report, range, exactDate = null) {
  if (exactDate) {
    if (!inRange(exactDate, range)) fail('USAGE_DATE_MISMATCH');
    if (!report.aggregates.byModel.length && numeric(report.totals.totalTokens) > 0) fail('MISSING_MODEL_ATTRIBUTION');
    return report.aggregates.byModel.map((entry) => fields(exactDate, entry, {
      ...Object.fromEntries(BUCKETS.map((name) => [name, count(entry.totals?.[name])])),
      requests: count(entry.count), costUsd: cost(entry.totals)
    }));
  }
  const byModel = new Map(report.aggregates.byModel.map((entry) => [modelKey(entry), entry]));
  return report.aggregates.modelDaily.map((entry) => {
    if (!inRange(entry.date, range)) fail('USAGE_DATE_MISMATCH');
    const priced = byModel.get(modelKey(entry));
    return fields(entry.date, entry, {
      input: null, output: null, cacheRead: null, cacheWrite: null,
      totalTokens: count(entry.tokens), requests: count(entry.count),
      costUsd: cost(priced?.totals) === null ? null : numeric(entry.cost)
    });
  });
}
export function mergeDaily(rows) {
  const merged = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.date, row.provider, row.model]);
    if (!merged.has(key)) { merged.set(key, { ...row }); continue; }
    const target = merged.get(key);
    for (const name of [...BUCKETS, 'requests', 'costUsd']) {
      const sum = target[name] === null || row[name] === null ? null : target[name] + row[name];
      target[name] = numeric(sum) !== null && (name === 'costUsd' || Number.isSafeInteger(sum)) ? sum : null;
    }
  }
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date) || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
}

const STATUSES = new Set(['started', 'succeeded', 'failed', 'cancelled', 'timed_out', 'blocked', 'unknown']);
const TOOLS = new Map([
  ['web_search', 'Research'], ['web_fetch', 'Research'], ['browser', 'Browser activity'],
  ['read', 'File inspection'], ['ls', 'File inspection'], ['dir_list', 'File inspection'],
  ['write', 'Implementation'], ['edit', 'Implementation'], ['apply_patch', 'Implementation'],
  ['skills_read', 'Skill instruction read'], ['sessions_spawn', 'Delegation'],
  ['exec', 'Tool activity'], ['image_generate', 'Media activity']
]);
export function safeSummary(toolNames) {
  const categories = [...new Set(toolNames.map((tool) => TOOLS.get(tool) ?? 'Tool activity'))].sort();
  return categories.length ? categories.slice(0, 3).join(' · ') + ' (inferred)' : 'Agent activity';
}
export function auditProjection(events, sessions, range) {
  const allowed = new Map(sessions.map((session) => [sessionKey(session), session]));
  const seen = new Set();
  const runs = new Map();
  let skillReads = 0;
  const finishedTools = new Set();
  let missingIdentity = 0;
  for (const event of events) {
    if (!object(event) || !['agent_run', 'tool_action'].includes(event.kind) || !nonempty(event.eventId) || seen.has(event.eventId)) continue;
    const session = allowed.get(sessionKey({ agentId: event.agentId, key: event.sessionKey }));
    // Without exact instance evidence, old activity under a reused key cannot be admitted.
    if (!session || event.sessionId !== session.sessionId) { missingIdentity += 1; continue; }
    if (!nonempty(event.runId) || !Number.isSafeInteger(event.occurredAt) || event.occurredAt <= 0 || !STATUSES.has(event.status)) continue;
    const date = dateInZurich(new Date(event.occurredAt));
    if (!inRange(date, range)) continue;
    const action = event.kind === 'agent_run' ? 'agent.run.' : 'tool.action.';
    if (event.action !== action + 'started' && event.action !== action + 'finished') continue;
    seen.add(event.eventId);
    const runKey = JSON.stringify([session.agentId, session.sessionId, event.runId]);
    const run = runs.get(runKey) ?? { id: opaqueId('run', session.agentId, session.sessionId, event.runId), at: event.occurredAt, status: 'unknown', terminalAt: -1, names: [], hasRun: false };
    run.at = Math.max(run.at, event.occurredAt);
    if (event.kind === 'agent_run') {
      run.hasRun = true;
      if (event.action === 'agent.run.finished' && event.occurredAt >= run.terminalAt) {
        run.status = event.status; run.terminalAt = event.occurredAt;
      } else if (run.terminalAt < 0) run.status = 'started';
    } else if (event.action === 'tool.action.finished') {
      const toolKey = JSON.stringify([runKey, event.toolCallId ?? event.eventId]);
      if (!finishedTools.has(toolKey)) {
        finishedTools.add(toolKey);
        run.names.push(event.toolName);
        if (event.toolName === 'skills_read' && event.status === 'succeeded') skillReads += 1;
      }
    }
    runs.set(runKey, run);
  }
  const requests = [...runs.values()].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)).slice(0, 100).map((run) => ({
    id: run.id, at: new Date(run.at).toISOString(), model: 'Not attributed',
    description: safeSummary(run.names), input: null, output: null, cacheRead: null,
    cacheWrite: null, totalTokens: null, status: run.status
  }));
  return { requests, skillReads, missingIdentity, runCount: runs.size };
}

export function verifiedSessionKeys(sessions) {
  return [...new Set(sessions.flatMap((session) => [session.key, ...(session.aliases ?? [])]))].sort();
}
export function skillEventProjection(events, sessions, range, now) {
  const allowed = new Set(verifiedSessionKeys(sessions));
  const dedup = new Map();
  let invalid = 0;
  for (const event of events) {
    if (!object(event) || Object.keys(event).sort().join(',') !== 'at,eventId,sessionKey,skill' ||
        typeof event.eventId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,200}$/u.test(event.eventId) ||
        typeof event.skill !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/u.test(event.skill) || safeIdentifier(event.skill, '') !== event.skill ||
        typeof event.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(event.at)) {
      invalid += 1; continue;
    }
    const timestamp = Date.parse(event.at);
    if (!Number.isFinite(timestamp) || timestamp > now.getTime() || new Date(timestamp).toISOString().slice(0, 19) !== event.at.slice(0, 19)) { invalid += 1; continue; }
    if (!allowed.has(event.sessionKey) || !inRange(dateInZurich(new Date(timestamp)), range)) continue;
    const value = { sessionKey: event.sessionKey, skill: event.skill, at: new Date(timestamp).toISOString() };
    if (!dedup.has(event.eventId)) dedup.set(event.eventId, value);
    else if (JSON.stringify(dedup.get(event.eventId)) !== JSON.stringify(value)) {
      dedup.set(event.eventId, null); invalid += 1;
    }
  }
  const bySkill = new Map();
  for (const event of dedup.values()) {
    if (!event) continue;
    const entry = bySkill.get(event.skill) ?? { name: event.skill, description: 'Confirmed skill instruction read', count: 0, lastUsedAt: event.at };
    entry.count += 1;
    if (event.at > entry.lastUsedAt) entry.lastUsedAt = event.at;
    bySkill.set(event.skill, entry);
  }
  return { skills: [...bySkill.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), invalid };
}

export function buildSnapshot({ now, range, sessions, rows, events, notes = [], skillEvents = [], skillEventsAvailable = false, scopeLabel = 'AFP project · selected conversation and tasks' }) {
  const audit = auditProjection(events, sessions, range);
  const daily = mergeDaily(rows);
  const namedSkills = skillEventProjection(skillEvents, sessions, range, now);
  const coverageNotes = [
    'Only the configured AFP root, verified descendants, and exact project-linked sessions are included.',
    'Daily requests count recorded model usage entries, not provider HTTP calls or user tasks.',
    'Recent activity groups audit observations by agent run; model and per-run tokens are not attributed.',
    'Audit is metadata-only, best-effort, bounded to 30 days and the Gateway retention cap.',
    'Current session instances only; retained rotated history is not included.',
    'Local recorded token usage and estimated cost are not a provider invoice; absent provider counters cannot be reconstructed.',
    'Successful skill instruction reads observed in the retained scoped audit window: ' + audit.skillReads + '. This separate audit count is not added to observer counts.',
    skillEventsAvailable ? 'Named skills count confirmed instruction-read events since observer installation only; no historical backfill or completed-workflow claim. Events have session keys, not instance IDs.' : 'Named skill observations are unavailable; an empty list does not establish zero skill use.',
    ...notes
  ];
  if (audit.missingIdentity) coverageNotes.push('Audit rows without an exact allowed session instance were excluded.');
  if (namedSkills.invalid) coverageNotes.push('Malformed or conflicting skill observations were excluded; named counts may be incomplete.');
  if (daily.some((row) => row.costUsd === null)) coverageNotes.push('Some model costs are unknown or incompletely priced; null is not free usage.');
  if (daily.some((row) => BUCKETS.some((name) => row[name] === null))) coverageNotes.push('Some token buckets are unavailable; null values are not zeros.');
  return {
    schemaVersion: 1, generatedAt: now.toISOString(), range,
    scopeLabel, daily, skills: namedSkills.skills, requests: audit.requests,
    coverage: { sessions: sessions.length, notes: [...new Set(coverageNotes)],
      skillMetric: skillEventsAvailable ? 'Confirmed named instruction reads since observer installation; not skill executions' : 'Successful instruction-read observations; named skill attribution unavailable',
      historyMetric: 'Metadata-only agent-run activity; not user tasks or provider requests' }
  };
}
