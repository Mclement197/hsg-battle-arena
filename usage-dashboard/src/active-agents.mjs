import { gatewayRpc, CONVERSATION_AGENTS } from './collect.mjs';

export const ACTIVE_MAX_AGE_MS = 15000;
const CACHE_MS = 10000;
const TIMEOUT_MS = 4000;
// Public names are fixed approvals, never Gateway identity names or session labels.
export const PUBLIC_AGENTS = Object.freeze(Object.fromEntries(CONVERSATION_AGENTS.map(id => [id, id])));
export const unavailableAgents = (now = Date.now()) => ({ observedAt: new Date(now).toISOString(), status: 'unavailable', agents: [] });

export function publicActiveAgents(value, now = Date.now()) {
  const age = now - Date.parse(value?.observedAt);
  if (!Number.isFinite(age) || age < 0 || age > ACTIVE_MAX_AGE_MS ||
      value?.status !== 'ok' || !Array.isArray(value.agents) || value.agents.length > 100) return unavailableAgents(now);
  const ids = [...new Set(value.agents.filter(row => Object.hasOwn(PUBLIC_AGENTS, row?.id)).map(row => row.id))];
  return { observedAt: new Date(Date.parse(value.observedAt)).toISOString(), status: 'ok',
    agents: ids.sort().map(id => ({ id, name: PUBLIC_AGENTS[id] })) };
}

export function projectActiveSessions(report, now = Date.now()) {
  if (!Number.isFinite(report?.ts) || now - report.ts < 0 || now - report.ts > ACTIVE_MAX_AGE_MS ||
      !Array.isArray(report.sessions) || report.sessions.length > 100 || report.hasMore !== false ||
      report.nextOffset != null || report.sessions.some(row => typeof row?.hasActiveRun !== 'boolean' ||
        row.hasActiveRun && !['running', 'queued'].includes(row.status))) throw new Error('Active state unavailable');
  return publicActiveAgents({ observedAt: new Date(report.ts).toISOString(), status: 'ok',
    agents: report.sessions.filter(row => row.hasActiveRun === true && row.status === 'running').map(row => ({ id: row.agentId })) }, now);
}

export function createActiveAgentsSource({
  rpc = (method, params) => gatewayRpc(method, params, undefined, { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 }),
  clock = Date.now, ttlMs = CACHE_MS, timeoutMs = TIMEOUT_MS
} = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs < 0 || ttlMs > CACHE_MS ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > TIMEOUT_MS) throw new Error('Invalid active source bounds');
  let cached, expires = 0, pending;
  return async () => {
    if (cached && clock() < expires) return publicActiveAgents(cached, clock());
    if (!pending) pending = (async () => {
      let timer;
      try {
        // activeOnly is live registry state before pagination, not activeMinutes or durable status.
        const report = await Promise.race([
          rpc('sessions.list', { rowMode: 'compact', activeOnly: true, archived: 'all',
            includeGlobal: true, includeUnknown: true, limit: 100,
            includeDerivedTitles: false, includeLastMessage: false, includeActivitySummary: false }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Source timeout')), timeoutMs); })
        ]);
        cached = projectActiveSessions(report, clock());
      } catch { cached = unavailableAgents(clock()); }
      finally { clearTimeout(timer); }
      expires = clock() + ttlMs;
      return publicActiveAgents(cached, clock());
    })().finally(() => { pending = null; });
    return pending;
  };
}
