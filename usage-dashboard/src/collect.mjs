import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  CollectionError, fail, makeRange, sessionIdentity, sessionKey, instanceKey,
  isChild, allowedProjectRow, usageState, modelDays, dailyRows, buildSnapshot, verifiedSessionKeys
} from './telemetry.mjs';

const execute = promisify(execFile);
const READ_METHODS = new Set(['sessions.describe', 'sessions.list', 'sessions.usage', 'audit.activity.list']);
export const LIMITS = Object.freeze({ sessions: 200, sessionPages: 20, auditPages: 10, auditEvents: 20000, dailyDetails: 80 });
const META = { includeDerivedTitles: false, includeLastMessage: false, includeActivitySummary: false };

export async function gatewayRpc(method, params, runner = execute) {
  if (!READ_METHODS.has(method)) fail('RPC_METHOD_NOT_ALLOWED');
  try {
    const { stdout } = await runner('openclaw', ['gateway', 'call', method, '--json', '--params', JSON.stringify(params)], {
      encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, windowsHide: true
    });
    return JSON.parse(stdout);
  } catch {
    // CLI stderr can contain configuration paths or provider details; never republish it.
    fail('GATEWAY_READ_FAILED');
  }
}
export function validateConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.rootSessionKey !== 'string' ||
      !/^agent:[^:\s]+:[^\s]+$/u.test(raw.rootSessionKey) || raw.rootSessionKey.length > 500) fail('INVALID_CONFIG');
  if (raw.projectId !== undefined && (typeof raw.projectId !== 'string' || !raw.projectId.trim() || raw.projectId.length > 500 || /[\u0000-\u001f]/u.test(raw.projectId))) fail('INVALID_PROJECT_ID');
  if (typeof raw.snapshotPath !== 'string' || !path.isAbsolute(raw.snapshotPath) || raw.snapshotPath.includes('\0')) fail('INVALID_SNAPSHOT_PATH');
  const lookbackDays = raw.lookbackDays ?? 30;
  makeRange(new Date(), lookbackDays);
  const optional = {};
  for (const name of ['allowlistPath', 'skillEventsPath']) {
    if (raw[name] === undefined) continue;
    if (typeof raw[name] !== 'string' || !path.isAbsolute(raw[name]) || /[\u0000-\u001f]/u.test(raw[name])) fail('INVALID_OBSERVER_PATH');
    optional[name] = path.resolve(raw[name]);
  }
  if (raw.scopeLabel !== undefined) {
    if (typeof raw.scopeLabel !== 'string' || !raw.scopeLabel.trim() || raw.scopeLabel.length > 100 || /[\u0000-\u001f<>]/u.test(raw.scopeLabel)) fail('INVALID_SCOPE_LABEL');
    optional.scopeLabel = raw.scopeLabel;
  }
  const paths = [path.resolve(raw.snapshotPath), optional.allowlistPath, optional.skillEventsPath].filter(Boolean);
  if (new Set(paths).size !== paths.length || (typeof raw.authPath === 'string' && paths.includes(path.resolve(raw.authPath)))) fail('PRIVATE_PATH_CONFLICT');
  // Sign-in/auth contents are never read. Extra service settings are not collector settings.
  return { rootSessionKey: raw.rootSessionKey, projectId: raw.projectId, snapshotPath: raw.snapshotPath, lookbackDays, ...optional };
}
export function configArgument(argv, env = process.env) {
  if (argv.length === 0 && env.AFP_USAGE_CONFIG) return path.resolve(env.AFP_USAGE_CONFIG);
  if (argv.length === 2 && argv[0] === '--config' && argv[1]) return path.resolve(argv[1]);
  fail('CONFIG_PATH_REQUIRED');
}
export async function readConfig(configPath) {
  try {
    const repository = fileURLToPath(new URL('../../', import.meta.url));
    const real = await fs.realpath(configPath);
    const relative = path.relative(repository, real);
    if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) fail('CONFIG_MUST_BE_OUTSIDE_REPOSITORY');
    const stat = await fs.stat(real);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 65536) fail('CONFIG_MUST_BE_PRIVATE');
    const config = validateConfig(JSON.parse(await fs.readFile(real, 'utf8')));
    if ([config.snapshotPath, config.allowlistPath, config.skillEventsPath].filter(Boolean).some((name) => path.resolve(name) === real)) fail('SNAPSHOT_CANNOT_REPLACE_CONFIG');
    return config;
  } catch (error) {
    if (error instanceof CollectionError) throw error;
    fail('CONFIG_READ_FAILED');
  }
}
function metadata(row) {
  const identity = sessionIdentity(row);
  return { ...identity, projectId: row.projectId, parentSessionKey: row.parentSessionKey,
    spawnedBy: row.spawnedBy, controlOwnerSessionKey: row.controlOwnerSessionKey,
    childSessions: Array.isArray(row.childSessions) ? row.childSessions.filter((key) => typeof key === 'string') : [] };
}
async function listPages(rpc, filter, limits) {
  const rows = [];
  let offset = 0;
  for (let page = 0; page < limits.sessionPages; page += 1) {
    const result = await rpc('sessions.list', { ...META, archived: 'all', limit: 100, offset, ...filter });
    if (!Array.isArray(result?.sessions)) fail('INVALID_SESSION_LIST');
    rows.push(...result.sessions);
    if (!result.hasMore && result.nextOffset == null) return rows;
    if (!Number.isSafeInteger(result.nextOffset) || result.nextOffset <= offset) fail('INVALID_SESSION_CURSOR');
    offset = result.nextOffset;
  }
  fail('SESSION_DISCOVERY_LIMIT');
}
export async function discoverSessions(config, rpc, limits = LIMITS) {
  const result = await rpc('sessions.describe', { key: config.rootSessionKey, includeDerivedTitles: false, includeLastMessage: false });
  const root = metadata(result?.session);
  if (root.key !== config.rootSessionKey) fail('ROOT_IDENTITY_MISMATCH');
  const known = new Map();
  const queue = [];
  const add = (raw) => {
    const row = metadata(raw);
    const key = sessionKey(row);
    const existing = known.get(key);
    if (existing && existing.sessionId !== row.sessionId) fail('SESSION_CHANGED_DURING_COLLECTION');
    if (existing) return;
    if (known.size >= limits.sessions) fail('SESSION_DISCOVERY_LIMIT');
    known.set(key, row); queue.push(row);
  };
  add(root);
  if (config.projectId) {
    for (const row of await listPages(rpc, { projectId: config.projectId }, limits)) {
      if (allowedProjectRow(row, config.projectId)) add(row);
    }
  }
  for (let index = 0; index < queue.length; index += 1) {
    const parent = queue[index];
    for (const row of await listPages(rpc, { spawnedBy: parent.key }, limits)) {
      if (isChild(row, parent)) add(row);
    }
  }
  // A physical instance can appear through multiple aliases; charge it only once.
  const unique = new Map();
  for (const row of known.values()) {
    const identity = instanceKey(row);
    if (!unique.has(identity)) unique.set(identity, { ...row, aliases: [] });
    unique.get(identity).aliases.push(row.key);
  }
  return [...unique.values()];
}
export async function freshUsage(rpc, session, range, { retryDelays = [5000, 10000, 20000], wait = sleep } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const result = await rpc('sessions.usage', {
      key: session.key, agentId: session.agentId, groupBy: 'instance',
      startDate: range.start, endDate: range.end, mode: 'specific', timeZone: range.timeZone,
      includeContextWeight: false, limit: 1
    });
    if (usageState(result, session, range) !== 'pending') return result;
    if (attempt >= retryDelays.length) fail('USAGE_PENDING');
    await wait(retryDelays[attempt]);
  }
}
async function mapBounded(values, fn, concurrency = 3) {
  const results = new Array(values.length);
  let next = 0;
  let failure;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (!failure && next < values.length) {
      const index = next++;
      try { results[index] = await fn(values[index], index); } catch (error) { failure = error; }
    }
  }));
  if (failure) throw failure;
  return results;
}
export async function collectAudit(rpc, sessions, range, now, limits = LIMITS) {
  const events = [];
  const seen = new Set();
  const notes = [];
  // Query a UTC superset, then apply precise Zurich calendar filtering in the mapper.
  const after = Math.max(Date.parse(range.start + 'T00:00:00Z') - 86400000, now.getTime() - 30 * 86400000);
  for (const session of sessions) {
    for (const kind of ['agent_run', 'tool_action']) {
      let cursor;
      const cursors = new Set();
      for (let page = 0; page < limits.auditPages; page += 1) {
        if (events.length >= limits.auditEvents) {
          notes.push('Audit collection reached its event bound; activity and skill-read observations are partial.');
          return { events, notes };
        }
        const result = await rpc('audit.activity.list', {
          agentId: session.agentId, sessionKey: session.key, kind, after, before: now.getTime(), limit: 500,
          ...(cursor ? { cursor } : {})
        });
        if (!Array.isArray(result?.events)) fail('INVALID_AUDIT_REPORT');
        for (const event of result.events) {
          if (event?.agentId !== session.agentId || event?.sessionKey !== session.key || event?.sessionId !== session.sessionId || event.kind !== kind) continue;
          if (event.redaction !== 'metadata_only') fail('INVALID_AUDIT_REDACTION');
          if (seen.has(event.eventId)) continue;
          seen.add(event.eventId);
          // Never retain unexpected content fields even in an otherwise valid response.
          events.push(Object.fromEntries(['eventId', 'kind', 'action', 'occurredAt', 'status', 'agentId', 'sessionKey', 'sessionId', 'runId', 'toolName', 'toolCallId'].map((key) => [key, event[key]])));
          if (events.length >= limits.auditEvents) break;
        }
        if (!result.nextCursor) break;
        if (typeof result.nextCursor !== 'string' || cursors.has(result.nextCursor)) fail('INVALID_AUDIT_CURSOR');
        cursors.add(result.nextCursor); cursor = result.nextCursor;
        if (page + 1 === limits.auditPages) notes.push('Audit pagination reached its bound; activity and skill-read observations are partial.');
      }
    }
  }
  return { events, notes };
}
export function parseSkillEventLines(text) {
  const events = [];
  const notes = [];
  const lines = text.split('\n');
  const unfinished = lines.pop();
  if (unfinished) notes.push('An unfinished observer event was deferred until its append completes.');
  let malformed = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.length > 4096) { malformed += 1; continue; }
    try { events.push(JSON.parse(line)); } catch { malformed += 1; }
  }
  if (malformed) notes.push('Malformed observer event lines were excluded; named skill counts may be incomplete.');
  return { events, notes, available: true };
}
export async function readSkillEventFile(filename, io = fs) {
  if (!filename) return { events: [], notes: [], available: false };
  let handle;
  try {
    handle = await io.open(filename, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 8 * 1024 * 1024) fail('UNSAFE_SKILL_EVENT_FILE');
    // Read only the initial bounded size: the observer may append concurrently.
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) fail('SKILL_EVENT_FILE_CHANGED');
      offset += bytesRead;
    }
    return parseSkillEventLines(bytes.toString('utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { events: [], notes: ['The named-skill observer has not created its event file yet.'], available: false };
    if (error instanceof CollectionError) throw error;
    fail('SKILL_EVENT_READ_FAILED');
  } finally { await handle?.close(); }
}
export async function collectSnapshot(rawConfig, {
  rpc = gatewayRpc, now = new Date(), limits = LIMITS, retryDelays, wait,
  writeAllowlist = writeSnapshotAtomic, readSkillEvents = readSkillEventFile
} = {}) {
  const config = validateConfig(rawConfig);
  const range = makeRange(now, config.lookbackDays);
  const discover = async () => {
    let discovered;
    try { discovered = await discoverSessions(config, rpc, limits); }
    catch (error) {
      // Scope can no longer be verified; stop admitting new named-skill observations.
      if (config.allowlistPath) await writeAllowlist(config.allowlistPath, []);
      throw error;
    }
    if (config.allowlistPath) await writeAllowlist(config.allowlistPath, verifiedSessionKeys(discovered));
    return discovered;
  };
  const sessions = await discover();
  const memo = new Map();
  const cachedRefreshes = [];
  const usage = (session, queryRange) => {
    const key = JSON.stringify([instanceKey(session), queryRange.start, queryRange.end]);
    if (!memo.has(key)) memo.set(key, freshUsage(rpc, session, queryRange, { retryDelays, wait }).then(report => {
      if (report.cacheStatus.status !== 'fresh') cachedRefreshes.push(report.cacheStatus.refreshedAt);
      return report;
    }));
    return memo.get(key);
  };
  const reports = await mapBounded(sessions, (session) => usage(session, range));
  const rows = [];
  const notes = [];
  const details = [];
  for (let index = 0; index < sessions.length; index += 1) {
    const report = reports[index];
    const dates = modelDays(report, range);
    if (range.start === range.end) { rows.push(...dailyRows(report, range, range.start)); continue; }
    if (details.length + dates.length > limits.dailyDetails) {
      rows.push(...dailyRows(report, range));
      notes.push('Daily detail query bound reached; affected model token buckets are unknown, not proportionally estimated.');
    } else for (const date of dates) details.push({ session: sessions[index], date });
  }
  for (const detailRows of await mapBounded(details, async ({ session, date }) => {
    const dayRange = { ...range, start: date, end: date };
    return dailyRows(await usage(session, dayRange), dayRange, date);
  })) rows.push(...detailRows);
  const audit = await collectAudit(rpc, sessions, range, now, limits);
  // Revalidate membership and instance IDs before committing a potentially long collection.
  const current = await discover();
  const identities = (items) => items.map((item) => JSON.stringify([sessionKey(item), item.sessionId, [...item.aliases].sort()])).sort().join('\n');
  if (identities(current) !== identities(sessions)) fail('SESSION_CHANGED_DURING_COLLECTION');
  if (cachedRefreshes.length) notes.push('Active usage is refreshing. Counts include the latest available verified rollups; oldest source refresh: ' + new Date(Math.min(...cachedRefreshes)).toISOString() + '. Very recent model entries may not be included yet.');
  const observedSkills = await readSkillEvents(config.skillEventsPath);
  return buildSnapshot({ now, range, sessions, rows, events: audit.events,
    skillEvents: observedSkills.events, skillEventsAvailable: observedSkills.available, scopeLabel: config.scopeLabel,
    notes: [...notes, ...audit.notes, ...observedSkills.notes] });
}
export async function writeSnapshotAtomic(snapshotPath, snapshot, io = fs) {
  const temporary = snapshotPath + '.tmp-' + randomUUID();
  let handle;
  let created = false;
  try {
    try {
      const previous = await io.lstat(snapshotPath);
      if (!previous.isFile() || previous.isSymbolicLink()) fail('UNSAFE_SNAPSHOT_TARGET');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    handle = await io.open(temporary, 'wx', 0o600);
    created = true;
    await handle.writeFile(JSON.stringify(snapshot) + '\n', 'utf8');
    await handle.sync();
    await handle.close(); handle = null;
    await io.rename(temporary, snapshotPath);
  } catch (error) {
    await handle?.close().catch(() => {});
    if (created) await io.unlink(temporary).catch(() => {});
    if (error instanceof CollectionError) throw error;
    fail('SNAPSHOT_WRITE_FAILED');
  }
}
export async function run(config, dependencies = {}) {
  const snapshot = await collectSnapshot(config, dependencies);
  await (dependencies.writeSnapshot ?? writeSnapshotAtomic)(config.snapshotPath, snapshot);
  return snapshot;
}
async function main() {
  try {
    const config = await readConfig(configArgument(process.argv.slice(2)));
    const snapshot = await run(config);
    process.stdout.write(JSON.stringify({ ok: true, generatedAt: snapshot.generatedAt, sessions: snapshot.coverage.sessions }) + '\n');
  } catch (error) {
    process.stderr.write('AFP usage collection failed: ' + (error instanceof CollectionError ? error.code : 'COLLECTION_FAILED') + '; previous snapshot retained.\n');
    process.exitCode = 1;
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
