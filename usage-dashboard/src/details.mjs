import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auditProjection, count, isChild, mergeDaily, opaqueId, safeIdentifier, skillEventProjection, taskId } from './telemetry.mjs';

export const DETAIL_LIMITS = Object.freeze({ agents: 100, catalog: 1000, tasks: 200, agentDaily: 6000 });
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const identifier = (v) => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/u.test(v) && safeIdentifier(v, '') === v;
const publicText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max &&
  !/[\u0000-\u001f<>]|(?:https?:\/\/|\/home\/|\/Users\/|agent:|ghp_|github_pat_)|(?:^|\s)sk-[a-zA-Z0-9]{12,}/u.test(v);
const keys = (v, allowed) => object(v) && Object.keys(v).every((key) => allowed.includes(key));
export const descriptionHash = (description) => createHash('sha256').update(description, 'utf8').digest('hex');
export { taskId };
const approval = (metadata, section, id) => metadata && Object.hasOwn(metadata[section], id) ? metadata[section][id] : null;

export function validatePublicMetadata(value) {
  if (!keys(value, ['schemaVersion', 'agents', 'skills', 'tasks']) || value.schemaVersion !== 1) return null;
  const maps = [['agents', 100], ['skills', 1000], ['tasks', 200]];
  if (!maps.every(([name, max]) => object(value[name]) && Object.keys(value[name]).length <= max)) return null;
  for (const [id, row] of Object.entries(value.agents)) {
    if (!identifier(id) || !keys(row, ['name', 'role']) || !publicText(row.name, 160) ||
      !(row.role === null || publicText(row.role, 400))) return null;
  }
  for (const [name, row] of Object.entries(value.skills)) {
    if (!identifier(name) || !keys(row, ['descriptionHash', 'description']) ||
      !/^[a-f0-9]{64}$/u.test(row.descriptionHash) || !publicText(row.description, 400)) return null;
  }
  for (const [id, row] of Object.entries(value.tasks)) {
    if (!/^[a-f0-9]{32}$/u.test(id) || !keys(row, ['title', 'summary']) || !publicText(row.title, 160) ||
      !(row.summary === null || publicText(row.summary, 400))) return null;
  }
  return value;
}

// Only the committed public curation file is read; no configurable path or private state fallback.
export async function readPublicMetadata(io = fs) {
  let handle;
  try {
    handle = await io.open(fileURLToPath(new URL('../data/public-metadata.json', import.meta.url)), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024) return null;
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) return null;
      offset += bytesRead;
    }
    return validatePublicMetadata(JSON.parse(bytes.toString('utf8')));
  } catch { return null; } finally { await handle?.close().catch(() => {}); }
}

// Preserve only typed lifecycle facts during discovery, never titles, prompts or paths.
export function sessionDetails(row) {
  const result = {};
  for (const name of ['status', 'subagentRunState', 'model', 'modelProvider']) {
    if (typeof row[name] === 'string') result[name] = row[name];
  }
  for (const name of ['startedAt', 'endedAt', 'runtimeMs', 'snapshotAt']) {
    if (count(row[name]) !== null) result[name] = row[name];
  }
  if (typeof row.hasActiveRun === 'boolean') result.hasActiveRun = row.hasActiveRun;
  return result;
}
const statusMap = new Map([['running', 'running'], ['queued', 'queued'], ['done', 'succeeded'], ['completed', 'succeeded'], ['succeeded', 'succeeded'],
  ['failed', 'failed'], ['cancelled', 'cancelled'], ['timeout', 'timed_out'], ['timed_out', 'timed_out'], ['blocked', 'blocked'], ['interrupted', 'interrupted']]);
const terminal = new Set(['succeeded', 'failed', 'cancelled', 'timed_out']);
function taskStatus(row) {
  const stored = statusMap.get(row.status);
  if (stored === 'queued' && row.subagentRunState === 'active') return { status: 'queued', statusSource: 'session_lifecycle' };
  if (row.hasActiveRun === true) return { status: stored === 'queued' ? 'queued' : 'running', statusSource: 'live_session' };
  if (row.subagentRunState === 'interrupted') return { status: 'interrupted', statusSource: 'session_lifecycle' };
  if (stored && stored !== 'running' && stored !== 'queued') return { status: stored, statusSource: 'session_lifecycle' };
  if (row.subagentRunState === 'active' && stored && row.hasActiveRun !== false) return { status: stored, statusSource: 'session_lifecycle' };
  return { status: 'unknown', statusSource: 'unknown' };
}
function taskProjection(session, rootSessionKey, metadata, observations, now) {
  const id = taskId(session.agentId, session.sessionId);
  const approved = approval(metadata, 'tasks', id);
  const activity = observations.filter((row) => row.taskId === id);
  const categories = [...new Set(activity.flatMap((row) => row.categories))].sort().slice(0, 12);
  if (!categories.length) categories.push('Agent activity');
  const timestamp = (v, max) => Number.isSafeInteger(v) && v > 0 && v <= max ? v : null;
  // Gateway sampling follows collection start; admit only a bounded collection-time interval.
  const sampledAt = timestamp(session.snapshotAt, now.getTime() + 15 * 60 * 1000) ?? now.getTime();
  const start = timestamp(session.startedAt, sampledAt);
  const end = timestamp(session.endedAt, sampledAt);
  const state = taskStatus(session);
  const live = state.status === 'running' || state.status === 'queued';
  const validEnd = start !== null && end !== null && end >= start;
  const validRuntime = count(session.runtimeMs) !== null && session.runtimeMs <= sampledAt &&
    (start === null || (sampledAt >= start && session.runtimeMs <= sampledAt - start)) &&
    (end === null || start === null || validEnd);
  let durationMs = null;
  let durationSource = 'unavailable';
  // A stale running label alone does not establish live work or elapsed duration.
  if ((live || terminal.has(state.status)) && validRuntime) {
    durationMs = session.runtimeMs; durationSource = 'session_runtime';
  } else if (validEnd && terminal.has(state.status)) {
    durationMs = end - start; durationSource = 'lifecycle_interval';
  }
  const provider = safeIdentifier(session.modelProvider, '');
  const model = safeIdentifier(session.model, '');
  return {
    id, agentId: safeIdentifier(session.agentId), kind: [session.key, ...(session.aliases ?? [])].includes(rootSessionKey) ? 'root_session' : 'delegated_session',
    title: approved?.title ?? categories.slice(0, 3).join(' · ') + ' (inferred)', titleSource: approved ? 'approved_label' : 'inferred',
    summary: approved?.summary ?? null, summarySource: approved?.summary ? 'approved_metadata' : 'unavailable',
    ...state, observedAt: new Date(sampledAt).toISOString(), startedAt: start === null ? null : new Date(start).toISOString(),
    endedAt: live || end === null || (start !== null && !validEnd) ? null : new Date(end).toISOString(), durationMs, durationSource,
    model: model && ((provider ? provider + '/' : '') + model).length <= 160 ? (provider ? provider + '/' : '') + model : null,
    modelSource: model && ((provider ? provider + '/' : '') + model).length <= 160 ? 'session_selection' : 'unavailable',
    categories, observedRuns: activity.length && activity.every((r) => r.observedRuns !== null) ? activity.reduce((n, r) => n + r.observedRuns, 0) : null,
    observedToolSteps: activity.length && activity.every((r) => r.observedToolSteps !== null) ? activity.reduce((n, r) => n + r.observedToolSteps, 0) : null
  };
}

function taskLineage(sessions, rootSessionKey) {
  const allowed = new Set(sessions.filter((session) => [session.key, ...(session.aliases ?? [])].includes(rootSessionKey)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const session of sessions) {
      if (allowed.has(session)) continue;
      if ([...allowed].some((parent) => [parent.key, ...(parent.aliases ?? [])].some((key) => isChild(session, { ...parent, key })))) {
        allowed.add(session); changed = true;
      }
    }
  }
  return sessions.filter((session) => allowed.has(session));
}

const sources = new Map([['openclaw-bundled', 'bundled'], ['openclaw-managed', 'managed'], ['openclaw-extra', 'extra'],
  ['openclaw-custodian', 'custodian'], ['openclaw-workspace', 'workspace']]);
export function buildDetails({ now, range, sessions, rows, events, rootSessionKey, directory, catalog, metadata: rawMetadata,
  skillEvents = [], skillEventsAvailable = false, auditPartial = false, limits = DETAIL_LIMITS }) {
  limits = { ...DETAIL_LIMITS, ...limits };
  const metadata = validatePublicMetadata(rawMetadata);
  const notes = [];
  const coverage = { agents: 'unavailable', skills: 'unavailable', tasks: 'available',
    taskMetric: 'Current verified session/delegation lifecycle, not completed user requests; models are session selections, not per-run attribution.',
    toolStepMetric: 'Deduplicated observed scoped audit tool calls; best-effort retained window, not reasoning steps or complete execution counts.' };
  let agents = null;
  if (Array.isArray(directory?.agents)) {
    const valid = directory.agents.filter((row) => object(row) && identifier(row.id));
    const unique = new Map(valid.map((row) => [row.id, row]));
    coverage.agents = valid.length !== directory.agents.length || unique.size !== valid.length || unique.size > limits.agents ? 'partial' : 'available';
    agents = [...unique.values()].slice(0, limits.agents).map((row) => {
      const approved = approval(metadata, 'agents', row.id);
      const scopedSessions = sessions.filter((session) => session.agentId === row.id).length;
      return { id: row.id, name: approved?.name ?? row.id, role: approved?.role ?? null,
        configuredModel: safeIdentifier(row.model?.primary, '') || null, runtime: typeof row.agentRuntime?.id === 'string' && row.agentRuntime.id.length <= 80 ? safeIdentifier(row.agentRuntime.id, '') || null : null,
        scopedSessions, usageState: scopedSessions ? 'observed' : 'no_scoped_sessions' };
    });
  }
  const grouped = new Map();
  for (const row of rows) {
    if (!identifier(row.agentId)) { notes.push('Per-agent usage attribution is unavailable for an invalid agent identifier.'); continue; }
    if (!grouped.has(row.agentId)) grouped.set(row.agentId, []);
    const daily = Object.fromEntries(['date', 'provider', 'model', 'input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'requests', 'costUsd'].map((name) => [name, row[name]]));
    grouped.get(row.agentId).push(daily);
  }
  let agentDaily = [...grouped].flatMap(([agentId, entries]) => mergeDaily(entries).map((row) => ({ agentId, ...row })));
  if (notes.length || agentDaily.length > limits.agentDaily) {
    agentDaily = null; notes.push('Per-agent daily detail is unavailable; core project usage is unchanged.');
  }
  const audit = auditProjection(events, sessions, range);
  const taskSessions = taskLineage(sessions, rootSessionKey);
  const tasks = taskSessions.slice(0, limits.tasks).map((session) => taskProjection(session, rootSessionKey, metadata, audit.taskActivity, now));
  if (taskSessions.length > limits.tasks || auditPartial || audit.missingIdentity) coverage.tasks = 'partial';
  let skillCatalog = null;
  const root = sessions.find((session) => [session.key, ...(session.aliases ?? [])].includes(rootSessionKey));
  if (root && Array.isArray(catalog?.skills) && (!catalog.agentId || catalog.agentId === root.agentId)) {
    const rootSessions = sessions.filter((session) => session.agentId === root.agentId);
    const reads = skillEventProjection(skillEvents, rootSessions, range, now);
    const observed = new Map(reads.skills.map((row) => [row.name, row]));
    const valid = catalog.skills.filter((row) => object(row) && identifier(row.name));
    const byName = new Map();
    for (const row of valid) {
      // Ambiguous same-name descriptors cannot safely inherit an approval or read count.
      if (byName.has(row.name)) byName.set(row.name, null); else byName.set(row.name, row);
    }
    coverage.skills = valid.length !== catalog.skills.length || byName.size !== valid.length || byName.size > limits.catalog || reads.invalid ? 'partial' : 'available';
    skillCatalog = [...byName].filter(([, row]) => row).slice(0, limits.catalog).map(([name, row]) => {
      const candidate = approval(metadata, 'skills', name);
      const approved = typeof row.description === 'string' && row.description.length <= 65536 && candidate?.descriptionHash === descriptionHash(row.description) ? candidate : null;
      const read = observed.get(name);
      return { id: opaqueId('skill', root.agentId, name), agentId: safeIdentifier(root.agentId), name,
        description: approved?.description ?? null, descriptionSource: approved ? 'approved_public' : 'unavailable',
        source: sources.get(row.source) ?? 'other', eligible: typeof row.eligible === 'boolean' ? row.eligible : null,
        disabled: typeof row.disabled === 'boolean' ? row.disabled : null, modelVisible: typeof row.modelVisible === 'boolean' ? row.modelVisible : null,
        userInvocable: typeof row.userInvocable === 'boolean' ? row.userInvocable : null,
        observedReads: skillEventsAvailable && read ? read.count : null, lastObservedAt: skillEventsAvailable && read ? read.lastUsedAt : null };
    });
  }
  if (!metadata) notes.push('Public metadata approval is unavailable; raw agent names, task labels and skill descriptions are not published.');
  if (coverage.agents !== 'available') notes.push('The configured-agent directory is ' + coverage.agents + '; this does not change project accounting.');
  if (coverage.skills !== 'available') notes.push('The root-agent skill catalog is ' + coverage.skills + '; missing read observations are unknown, not zero.');
  if (coverage.tasks === 'partial') notes.push('Task detail or audit observations are partial; observed tool steps are not complete totals.');
  notes.push('Skill catalog describes only the root agent; named reads retain key-scoped observer limitations.');
  if (taskSessions.length !== sessions.length) notes.push('Task metadata excludes independently project-linked sessions; existing project usage scope is unchanged.');
  return { agents, agentDaily, skillCatalog, tasks, coverage, notes };
}
