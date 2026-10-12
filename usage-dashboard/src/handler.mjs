import {validatePublicDetails, publicRootDetails, publicRequestDetails, publicCoverageDetails} from './public-details.mjs';
const HOST = 'afp.mclement.ch';
const PAGES = new Set(['/', '/models', '/agents', '/skills', '/activity']);
const security = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000', 'Cache-Control': 'no-store'
};
function response(body, status = 200, headers = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {status, headers: {...security, 'Content-Type': 'application/json; charset=utf-8', ...headers}});
}
const text = (x, max) => typeof x === 'string' && x.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x);
const count = n => Number.isFinite(n) && n >= 0;
const date = d => typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d));
export function validateSnapshot(value) {
  if (!value || value.schemaVersion!==1 || !Number.isFinite(Date.parse(value.generatedAt)) || !value.range || !date(value.range.start) || !date(value.range.end) || value.range.start>value.range.end || value.range.timeZone!=='Europe/Zurich' || !text(value.scopeLabel,160)) return false;
  if(!Array.isArray(value.daily)||value.daily.length>3000||!Array.isArray(value.skills)||value.skills.length>300||!Array.isArray(value.requests)||value.requests.length>100) return false;
  const metrics = row => ['input','output','cacheRead','cacheWrite','totalTokens'].every(k=>row[k]===null||count(row[k]));
  if(!value.daily.every(r=>date(r.date)&&text(r.model,160)&&text(r.provider,80)&&metrics(r)&&count(r.requests)&&(r.costUsd===null||count(r.costUsd))))return false;
  if(!value.skills.every(s=>text(s.name,120)&&text(s.description,400)&&Number.isInteger(s.count)&&s.count>=0&&(s.lastUsedAt===null||Number.isFinite(Date.parse(s.lastUsedAt)))))return false;
  if(!value.requests.every(r=>text(r.id,100)&&Number.isFinite(Date.parse(r.at))&&text(r.model,160)&&text(r.description,400)&&metrics(r)&&text(r.status,50)))return false;
  const c=value.coverage;
  return !!c&&Number.isInteger(c.sessions)&&c.sessions>=0&&Array.isArray(c.notes)&&c.notes.length<=50&&c.notes.every(n=>text(n,1000))&&text(c.skillMetric,1000)&&text(c.historyMetric,1000)&&validatePublicDetails(value);
}
export function publicSnapshot(value) {
  if (!validateSnapshot(value)) throw new Error('Invalid snapshot');
  const pick = (object, keys) => Object.fromEntries(keys.map(key => [key, object[key]]));
  return {
    ...pick(value, ['schemaVersion', 'generatedAt', 'scopeLabel']),
    range: pick(value.range, ['start', 'end', 'timeZone']),
    daily: value.daily.map(row => pick(row, ['date', 'model', 'provider', 'input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'requests', 'costUsd'])),
    skills: value.skills.map(row => pick(row, ['name', 'description', 'count', 'lastUsedAt'])),
    requests: value.requests.map(row => ({...pick(row, ['id', 'at', 'model', 'description', 'input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'status']), ...publicRequestDetails(row)})),
    coverage: {...pick(value.coverage, ['sessions', 'notes', 'skillMetric', 'historyMetric']), ...publicCoverageDetails(value.coverage)},
    ...publicRootDetails(value)
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
    if(url.pathname.startsWith('/api/'))return response({error:'Not found'},404);
    if(request.method!=='GET'&&request.method!=='HEAD')return response({error:'Method not allowed'},405,{'Allow':'GET, HEAD'});
    const route=url.pathname.replace(/\/$/, '') || '/';
    const asset=assets[PAGES.has(route)?'/index.html':url.pathname];
    return asset?response(request.method==='HEAD'?'':asset.body,200,{'Content-Type':asset.type}):response({error:'Not found'},404);
  } catch { return response({error:'Request could not be processed'},400); }
}
