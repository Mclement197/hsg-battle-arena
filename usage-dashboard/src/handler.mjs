const HOST = 'afp.mclement.ch';
const COOKIE = '__Host-afp_session';
const encoder = new TextEncoder();
const attempts = new Map();
const security = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000', 'Cache-Control': 'no-store'
};
function response(body, status = 200, headers = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {status, headers: {...security, 'Content-Type': 'application/json; charset=utf-8', ...headers}});
}
export async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), n => n.toString(16).padStart(2, '0')).join('');
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function sign(payload, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))), n => n.toString(16).padStart(2,'0')).join('');
}
export async function authenticated(request, env, now = Date.now()) {
  if (!env.SESSION_KEY) return false;
  const value = (request.headers.get('cookie') || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if (!value) return false;
  const [expiry, nonce, signature, extra] = value.split('.');
  if (extra || !/^[a-f0-9]{32}$/.test(nonce || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
  const timestamp = Number(expiry);
  if (!Number.isFinite(timestamp) || timestamp <= now || timestamp > now + 12*60*60*1000) return false;
  return equal(signature, await sign(expiry+'.'+nonce, env.SESSION_KEY));
}
async function boundedJSON(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Expected JSON');
  const reader = request.body?.getReader(); if (!reader) throw new Error('Missing body');
  const chunks=[]; let length=0;
  while (true) { const {done,value}=await reader.read(); if(done)break; length+=value.byteLength; if(length>1048576){await reader.cancel();throw new Error('Payload too large');} chunks.push(value); }
  const bytes=new Uint8Array(length); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
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
  return !!c&&Number.isInteger(c.sessions)&&c.sessions>=0&&Array.isArray(c.notes)&&c.notes.length<=50&&c.notes.every(n=>text(n,1000))&&text(c.skillMetric,1000)&&text(c.historyMetric,1000);
}
export function publicSnapshot(value) {
  if (!validateSnapshot(value)) throw new Error('Invalid snapshot');
  const pick = (object, keys) => Object.fromEntries(keys.map(key => [key, object[key]]));
  return {
    ...pick(value, ['schemaVersion', 'generatedAt', 'scopeLabel']),
    range: pick(value.range, ['start', 'end', 'timeZone']),
    daily: value.daily.map(row => pick(row, ['date', 'model', 'provider', 'input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'requests', 'costUsd'])),
    skills: value.skills.map(row => pick(row, ['name', 'description', 'count', 'lastUsedAt'])),
    requests: value.requests.map(row => pick(row, ['id', 'at', 'model', 'description', 'input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'status'])),
    coverage: pick(value.coverage, ['sessions', 'notes', 'skillMetric', 'historyMetric'])
  };
}

export async function handle(request, env, assets = {}) {
  const url = new URL(request.url);
  if (url.hostname !== HOST && !(env.LOCAL_DEV === true && ['127.0.0.1','localhost'].includes(url.hostname))) return response({error:'Unknown host'},421);
  if (url.pathname !== '/usage' && !url.pathname.startsWith('/usage/')) return response({error:'Not found'},404);
  url.pathname = url.pathname.slice('/usage'.length) || '/';
  try {
    if (url.pathname === '/healthz' && request.method==='GET') return response({ok:true});
    if(url.pathname==='/api/login'&&request.method==='POST') {
      if(request.headers.get('origin')!==url.origin)return response({error:'Origin not allowed'},403);
      if(!env.DASHBOARD_PASSWORD_SHA256||!env.SESSION_KEY)return response({error:'Sign-in unavailable'},503);
      const ip=request.headers.get('cf-connecting-ip')||'local';
      // shortcut: isolate-local throttle plus a high-entropy passphrase; use Access for multi-user identity.
      const now=Date.now(); for(const [key,bucket]of attempts){if(bucket.until<now)attempts.delete(key);}
      if(attempts.size>2000)return response({error:'Try again shortly'},429,{'Retry-After':'60'});
      const bucket=attempts.get(ip)||{count:0,until:now+60000};
      if(++bucket.count>10)return response({error:'Too many attempts. Try again in one minute.'},429,{'Retry-After':'60'});
      attempts.set(ip,bucket);
      const body=await boundedJSON(request);
      if(typeof body.password!=='string'||body.password.length>256||!equal(await hash(body.password),env.DASHBOARD_PASSWORD_SHA256))return response({error:'Incorrect passphrase'},401);
      attempts.delete(ip);
      const payload=(now+12*60*60*1000)+'.'+crypto.randomUUID().replaceAll('-','');
      const cookie=COOKIE+'='+payload+'.'+await sign(payload,env.SESSION_KEY)+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=43200';
      return response({ok:true},200,{'Set-Cookie':cookie});
    }
    if(url.pathname==='/api/logout'&&request.method==='POST') {
      if(request.headers.get('origin')!==url.origin)return response({error:'Origin not allowed'},403);
      return response({ok:true},200,{'Set-Cookie':COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'});
    }
    if(url.pathname==='/api/usage'&&request.method==='GET') {
      if(!await authenticated(request,env))return response({error:'Sign in to view usage'},401);
      const snapshot=await env.USAGE.get('snapshot:v1');
      return snapshot?response(snapshot):response({error:'Usage has not synced yet. Please try again shortly.'},503);
    }
    if(url.pathname.startsWith('/api/'))return response({error:'Not found'},404);
    if(request.method!=='GET'&&request.method!=='HEAD')return response({error:'Method not allowed'},405,{'Allow':'GET, HEAD'});
    const asset=assets[url.pathname==='/'?'/index.html':url.pathname];
    return asset?response(request.method==='HEAD'?'':asset.body,200,{'Content-Type':asset.type}):response({error:'Not found'},404);
  } catch { return response({error:'Request could not be processed'},400); }
}
