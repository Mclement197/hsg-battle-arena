import { createHash } from 'node:crypto';
import {validatePublicDetails, publicRootDetails, publicRequestDetails, publicCoverageDetails} from './public-details.mjs';
import { publicActiveAgents, unavailableAgents } from './active-agents.mjs';
import { INSTALLATION_LABEL } from './installation-usage.mjs';
const HOST = 'afp.mclement.ch';
const PAGES = new Set(['/', '/models', '/agents', '/skills', '/activity', '/graft']);
const security = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000', 'Cache-Control': 'no-store'
};
export const GRAFT_VIEWER_PATH = '/graft/viewer/index.html';
export const MAX_HTTP_WAITERS = 32;
export function createRequestAdmission() {
  let active = 0;
  return () => {
    if (active >= MAX_HTTP_WAITERS) return null;
    active++; let released = false;
    const release = () => {
      if (released) return;
      released = true; active--;
    };
    // Disconnection does not retire the async handler; keep its slot until finally.
    return release;
  };
}
export function graftViewerHeaders(html) {
  const hashes = tag => [...html.matchAll(tag === 'script' ? /<script\b[^>]*>([\s\S]*?)<\/script>/gi : /<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map(match => "'sha256-" + createHash('sha256').update(match[1]).digest('base64') + "'").join(' ');
  return {
    'Content-Security-Policy': "default-src 'none'; script-src " + (hashes('script') || "'none'") +
      "; script-src-attr 'none'; style-src " + (hashes('style') || "'none'") +
      "; style-src-attr 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    'X-Frame-Options': 'SAMEORIGIN'
  };
}
function response(body, status = 200, headers = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {status, headers: {...security, 'Content-Type': 'application/json; charset=utf-8', ...headers}});
}
const text = (x, max) => typeof x === 'string' && x.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x);
const count = n => Number.isFinite(n) && n >= 0;
const date = d => typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d));
function publicUsageMetadata(value) {
  const timestamp = x => typeof x === 'string' && x.length === 24 && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
  const result = {};
  const s = value.source;
  if (s?.method === 'usage.cost' && ['fresh', 'refreshing', 'partial', 'stale'].includes(s.status) &&
      timestamp(s.reportUpdatedAt) && (s.refreshedAt === null || timestamp(s.refreshedAt))) {
    result.source = { method: 'usage.cost', status: s.status, reportUpdatedAt: s.reportUpdatedAt, refreshedAt: s.refreshedAt };
    result.sourceUpdatedAt = s.refreshedAt; // Latest observed rollup refresh, not aggregate assembly time.
  }
  const l = value.live;
  if (l?.transport === 'poll' && l.pollIntervalMs === 5000 && timestamp(l.sampledAt) &&
      (l.lastAttemptAt === null || timestamp(l.lastAttemptAt)) && ['ok', 'degraded', 'loading'].includes(l.status) &&
      Number.isFinite(l.retryAfterMs) && l.retryAfterMs >= 0 && l.retryAfterMs <= 60000 &&
      typeof l.revision === 'string' && /^[a-f0-9]{64}$/.test(l.revision)) {
    result.live = { transport: 'poll', pollIntervalMs: 5000, sampledAt: l.sampledAt, lastAttemptAt: l.lastAttemptAt,
      status: l.status, retryAfterMs: l.retryAfterMs, revision: l.revision };
  }
  return result;
}
export function validateSnapshot(value) {
  if (value?.scopeMode !== undefined && !['scoped', 'all-conversations', 'installation'].includes(value.scopeMode)) return false;
  if (!value || value.schemaVersion!==1 || !Number.isFinite(Date.parse(value.generatedAt)) || !value.range || !date(value.range.start) || !date(value.range.end) || value.range.start>value.range.end || value.range.timeZone!=='Europe/Zurich' || !text(value.scopeLabel,160)) return false;
  if(!Array.isArray(value.daily)||value.daily.length>3000||!Array.isArray(value.skills)||value.skills.length>300||!Array.isArray(value.requests)||value.requests.length>100) return false;
  const metrics = row => ['input','output','cacheRead','cacheWrite','totalTokens'].every(k=>row[k]===null||count(row[k]));
  if(!value.daily.every(r=>date(r.date)&&text(r.model,160)&&text(r.provider,80)&&metrics(r)&&(count(r.requests)||value.scopeMode==='installation'&&r.requests===null)&&(r.costUsd===null||count(r.costUsd))))return false;
  if(!value.skills.every(s=>text(s.name,120)&&text(s.description,400)&&Number.isInteger(s.count)&&s.count>=0&&(s.lastUsedAt===null||Number.isFinite(Date.parse(s.lastUsedAt)))))return false;
  if(!value.requests.every(r=>text(r.id,100)&&Number.isFinite(Date.parse(r.at))&&text(r.model,160)&&text(r.description,400)&&metrics(r)&&text(r.status,50)))return false;
  const c=value.coverage;
  return !!c&&(Number.isInteger(c.sessions)&&c.sessions>=0||value.scopeMode==='installation'&&c.sessions===null)&&Array.isArray(c.notes)&&c.notes.length<=50&&c.notes.every(n=>text(n,1000))&&text(c.skillMetric,1000)&&text(c.historyMetric,1000)&&validatePublicDetails(value);
}
export function publicSnapshot(value) {
  if (!validateSnapshot(value)) throw new Error('Invalid snapshot');
  const pick = (object, keys) => Object.fromEntries(keys.map(key => [key, object[key]]));
  if (value.scopeMode === 'installation') return {
    ...pick(value, ['schemaVersion', 'generatedAt']), ...publicUsageMetadata(value), scopeMode: 'installation', scopeLabel: INSTALLATION_LABEL,
    range: pick(value.range, ['start', 'end', 'timeZone']),
    daily: value.daily.map(row => ({ ...pick(row, ['date', 'input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'costUsd']),
      model: 'All models', provider: 'All providers', requests: null })),
    skills: [], requests: [], agents: null, agentDaily: null, tasks: null, skillCatalog: null, skillDaily: null, agentRunDaily: null,
    coverage: { sessions: null, notes: value.coverage.notes.filter(note => [
      'Supported Gateway-wide usage.cost totals across all configured agents and retained usage history, including chat, delegation and background work; not a complete lifetime archive.',
      'Model, agent, session, request and skill attribution are unavailable from this aggregate-only source.',
      'Usage is refreshing; these verified cached totals may omit very recent activity.',
      'Token breakdown is unavailable where component buckets do not fully explain the authoritative provider total.'
    ].includes(note)), skillMetric: 'Unavailable in installation aggregate-only mode.', historyMetric: 'No chat history or individual activity is collected.' }
  };
  const allConversations = value.scopeMode === 'all-conversations';
  return {
    ...pick(value, ['schemaVersion', 'generatedAt', 'scopeLabel']),
    ...(value.scopeMode !== undefined ? { scopeMode: value.scopeMode } : {}),
    range: pick(value.range, ['start', 'end', 'timeZone']),
    daily: value.daily.map(row => pick(row, ['date', 'model', 'provider', 'input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'requests', 'costUsd'])),
    skills: value.skills.map(row => pick(row, ['name', 'description', 'count', 'lastUsedAt'])),
    requests: value.requests.map(row => ({...pick(row, ['id', 'at', 'model', 'description', 'input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'status']), ...publicRequestDetails(row)})),
    coverage: {...pick(value.coverage, ['sessions', 'notes', 'skillMetric', 'historyMetric']), ...publicCoverageDetails(value.coverage)},
    ...publicRootDetails(value),
    ...(allConversations ? { scopeLabel: 'All conversations with main · delegated specialists · retained partial history', requests: [], tasks: null, skills: [], skillDaily: null, agentRunDaily: null,
      ...(Array.isArray(value.skillCatalog) ? { skillCatalog: publicRootDetails(value).skillCatalog.map(row => ({ ...row, observedReads: null, lastObservedAt: null })) } : {}) } : {})
  };
}

export async function handle(request, env, assets = {}) {
  const url = new URL(request.url);
  if (url.hostname !== HOST && !(env.LOCAL_DEV === true && ['127.0.0.1','localhost'].includes(url.hostname))) return response({error:'Unknown host'},421);
  if (url.pathname !== '/usage' && !url.pathname.startsWith('/usage/')) return response({error:'Not found'},404);
  url.pathname = url.pathname.slice('/usage'.length) || '/';
  try {
    if (url.pathname === '/healthz' && request.method==='GET') return response({ok:true});
    if(url.pathname==='/api/usage'&&request.method==='GET') {
      const snapshot=await env.USAGE.get('snapshot:v1');
      return snapshot?response(publicSnapshot(JSON.parse(snapshot))):response({error:'Usage has not synced yet. Please try again shortly.'},503);
    }
    if(url.pathname==='/api/active-agents'&&request.method==='GET') {
      let state;
      try { state = env.ACTIVE_AGENTS ? await env.ACTIVE_AGENTS() : unavailableAgents(); }
      catch { state = unavailableAgents(); }
      return response(publicActiveAgents(state));
    }
    if(url.pathname.startsWith('/api/'))return response({error:'Not found'},404);
    if(request.method!=='GET'&&request.method!=='HEAD')return response({error:'Method not allowed'},405,{'Allow':'GET, HEAD'});
    const route=url.pathname.replace(/\/$/, '') || '/';
    const publicAssets = new Set(['/index.html', '/styles.css', '/app.js', '/favicon.svg', '/graft/graph.json', '/graft/viewer.js', '/graft/viewer.css', GRAFT_VIEWER_PATH]);
    const asset=PAGES.has(route)?assets['/index.html']:publicAssets.has(url.pathname)?assets[url.pathname]:null;
    const headers = url.pathname === GRAFT_VIEWER_PATH && asset ? graftViewerHeaders(asset.body) :
      PAGES.has(route) ? { 'Content-Security-Policy': security['Content-Security-Policy'] + "; frame-src 'self'" } : {};
    return asset?response(request.method==='HEAD'?'':asset.body,200,{'Content-Type':asset.type, ...headers}):response({error:'Not found'},404);
  } catch { return response({error:'Request could not be processed'},400); }
}
