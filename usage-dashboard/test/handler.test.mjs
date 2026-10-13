import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handle,validateSnapshot,publicSnapshot} from '../src/handler.mjs';
const base='https://afp.mclement.ch/usage';
const snapshot={schemaVersion:1,generatedAt:new Date().toISOString(),range:{start:'2026-10-12',end:'2026-10-12',timeZone:'Europe/Zurich'},scopeLabel:'Test project',daily:[{date:'2026-10-12',model:'test',provider:'test',input:10,output:5,cacheRead:20,cacheWrite:0,totalTokens:35,requests:1,costUsd:null}],skills:[],requests:[],coverage:{sessions:1,notes:[],skillMetric:'Observed reads',historyMetric:'Inferred activity'}};
const env={USAGE:{get:async()=>JSON.stringify(snapshot)}};
const req=(path,opts={})=>new Request(base+path,opts);

test('output projection drops unknown private fields at every level',()=>{
  const value=structuredClone(snapshot);
  value.skills=[{name:'fixture-skill',description:'Confirmed instruction read',count:1,lastUsedAt:null}];
  value.requests=[{id:'opaque-fixture',at:value.generatedAt,model:'Not attributed',description:'Inferred activity',input:null,output:null,cacheRead:null,cacheWrite:null,totalTokens:null,status:'succeeded'}];
  const expected=structuredClone(value);
  value.internalSecret='omit';value.range.sessionKey='omit';value.daily[0].rawCommand='omit';
  value.skills[0].privatePath='omit';value.requests[0].rawPrompt='omit';value.coverage.internalPaths=['omit'];
  assert.deepEqual(publicSnapshot(value),expected);
});
test('anonymous visitors receive usage without credentials or a session cookie',async()=>{
  const r=await handle(req('/api/usage'),env);
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('set-cookie'),null);assert.deepEqual(await r.json(),snapshot);
});
test('successive usage requests read the current snapshot rather than caching old totals',async()=>{
  let current=structuredClone(snapshot);
  const changing={USAGE:{get:async()=>JSON.stringify(current)}};
  const first=await handle(req('/api/usage'),changing);
  assert.equal((await first.json()).daily[0].totalTokens,35);
  current.daily[0].totalTokens=70;
  const next=await handle(req('/api/usage'),changing);
  assert.equal(next.headers.get('cache-control'),'no-store');
  assert.equal((await next.json()).daily[0].totalTokens,70);
});

test('public HTTP boundary projects snapshots instead of leaking backend fields',async()=>{
  const value=structuredClone(snapshot);value.sessionKey='omit';value.daily[0].rawCommand='omit';value.coverage.rawPrompt='omit';
  const r=await handle(req('/api/usage'),{USAGE:{get:async()=>JSON.stringify(value)}});
  assert.equal(r.status,200);assert.deepEqual(await r.json(),snapshot);
});
test('obsolete or malformed cookies do not gate public access',async()=>{
  const r=await handle(req('/api/usage',{headers:{Cookie:'__Host-afp_session=expired-or-invalid'}}),env);
  assert.equal(r.status,200);assert.deepEqual(await r.json(),snapshot);
});
test('removed login and logout endpoints do not accept credentials or create cookies',async()=>{
  for(const path of ['/api/login','/api/logout']){
    const r=await handle(req(path,{method:'POST',headers:{Origin:'https://afp.mclement.ch','Content-Type':'application/json'},body:'{}'}),env);
    assert.equal(r.status,404);assert.equal(r.headers.get('set-cookie'),null);
  }
});
test('foreign hosts and unrelated AFP routes cannot reach usage',async()=>{
  assert.equal((await handle(new Request('https://other.mclement.ch/usage'),env)).status,421);
  assert.equal((await handle(new Request('https://afp.mclement.ch/openclaw'),env)).status,404);
  assert.equal((await handle(new Request('https://afp.mclement.ch/usager'),env)).status,404);
});
test('static HTML keeps restrictive CSP and supports HEAD',async()=>{
  const assets={'/index.html':{body:'<h1>Usage overview</h1>',type:'text/html'}};
  const r=await handle(req(''),env,assets);
  assert.equal(r.status,200);assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal(await r.text(),'<h1>Usage overview</h1>');
  assert.equal(await (await handle(req('',{method:'HEAD'}),env,assets)).text(),'');
});
test('dashboard favicon uses an absolute nested-route URL and SVG MIME',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const icon=await readFile(new URL('../public/favicon.svg',import.meta.url),'utf8');
  assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/usage/favicon.svg">'));
  const assets={'/favicon.svg':{body:icon,type:'image/svg+xml'}};
  const r=await handle(req('/favicon.svg'),env,assets);
  assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/svg+xml');
  assert.match(await r.text(),/<svg[^>]+viewBox="0 0 64 64"/);
  assert.equal((await handle(req('/favicon.svg',{method:'HEAD'}),env,assets)).status,200);
});
test('private state and files are never served as assets',async()=>{
  for(const path of ['/auth.json','/sign-in.txt','/config.json','/sessions.json','/skills.jsonl','/snapshot.json'])
    assert.equal((await handle(req(path),env)).status,404);
});
test('snapshot validates dates, bounds, and unknown costs',()=>{
  assert.equal(validateSnapshot(snapshot),true);
  assert.equal(validateSnapshot({...snapshot,range:{...snapshot.range,start:'yesterday'}}),false);
  assert.equal(validateSnapshot({...snapshot,daily:[{...snapshot.daily[0],input:-1}]}),false);
  assert.equal(validateSnapshot({...snapshot,requests:Array(101).fill({})}),false);
});
test('missing or malformed snapshots fail without leaking their contents',async()=>{
  assert.equal((await handle(req('/api/usage'),{USAGE:{get:async()=>null}})).status,503);
  for(const payload of ['{secret','{"rawPrompt":"private"}']){
    const r=await handle(req('/api/usage'),{USAGE:{get:async()=>payload}});
    assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'Request could not be processed'});
  }
});
test('usage remains read-only with no ingestion or other API routes',async()=>{
  assert.equal((await handle(req('/api/ingest',{method:'POST',body:'{}'}),env)).status,404);
  for(const method of ['POST','PUT','DELETE']) assert.equal((await handle(req('/api/usage',{method}),env)).status,404);
});


test('dedicated dashboard pages and detail queries serve the app shell, not arbitrary paths',async()=>{
  const assets={'/index.html':{body:'<h1>Usage dashboard</h1>',type:'text/html'}};
  for(const path of ['', '/', '/models', '/agents/', '/skills?skill=example', '/activity?run=opaque-fixture', '/graft']){
    const r=await handle(req(path),env,assets);
    assert.equal(r.status,200,path);assert.equal(await r.text(),'<h1>Usage dashboard</h1>');
  }
  for(const path of ['/unknown', '/agents/private-file', '/config.json'])
    assert.equal((await handle(req(path),env,assets)).status,404,path);
});

test('Graft serves only its three fixed public assets without broadening CSP or exposing build tools', async () => {
  const assets = { '/index.html': { body: '<h1>HSG code graph</h1>', type: 'text/html' },
    '/graft/graph.json': { body: '{"nodes":[],"edges":[]}', type: 'application/json' },
    '/graft/viewer.js': { body: 'export const graph = true;', type: 'text/javascript' },
    '/graft/viewer.css': { body: '.graft-view{}', type: 'text/css' } };
  for (const path of ['/graft', '/graft/graph.json', '/graft/viewer.js', '/graft/viewer.css']) {
    const response = await handle(req(path), env, assets); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'; style-src 'self'/);
    assert.doesNotMatch(response.headers.get('content-security-policy'), /unsafe-inline|unsafe-eval/);
  }
  for (const path of ['/graft/sanitize.mjs', '/graft/README.md', '/graft/UPSTREAM-LICENSE', '/graft/.graph/wiring.json', '/api/code-graph', '/api/context-graph', '/events'])
    assert.equal((await handle(req(path), env, assets)).status, 404);
});


test('official self-contained Graft iframe receives exact script hashes and same-origin frame headers', async () => {
  const {createHash}=await import('node:crypto');
  const html=await readFile(new URL('../graft-integration/viewer/index.html',import.meta.url),'utf8');
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const styles=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
  assert.equal(scripts.length,2);assert.equal(styles.length,1);
  assert.ok(scripts.every(match=>!(/\bsrc\s*=/i.test(match[1]))));
  assert.doesNotMatch(html,/<(?:link|img|iframe)\b[^>]*(?:src|href)=/i);
  assert.match(html,/window\.__GRAFT_DATA__/);assert.match(html,/style=/);
  const path='/graft/viewer/index.html';const assets={[path]:{body:html,type:'text/html; charset=utf-8'}};
  const result=await handle(req(path),env,assets);assert.equal(result.status,200);assert.equal(await result.text(),html);
  const csp=result.headers.get('content-security-policy');
  const scriptPolicy=csp.split(';').find(part=>part.trim().startsWith('script-src ')).trim();
  const expected=scripts.map(match=>"'sha256-"+createHash('sha256').update(match[2]).digest('base64')+"'");
  assert.equal(scriptPolicy,'script-src '+expected.join(' '));
  const styleHash="'sha256-"+createHash('sha256').update(styles[0][1]).digest('base64')+"'";
  assert.ok(csp.includes('style-src '+styleHash));assert.match(csp,/style-src-attr 'unsafe-inline'/);
  assert.doesNotMatch(scriptPolicy,/unsafe-inline|unsafe-eval|'self'|https?:/);
  assert.match(csp,/script-src-attr 'none'/);assert.match(csp,/connect-src 'none'/);assert.match(csp,/frame-ancestors 'self'/);
  assert.equal(result.headers.get('x-frame-options'),'SAMEORIGIN');assert.equal(result.headers.get('content-type'),'text/html; charset=utf-8');
  const head=await handle(req(path,{method:'HEAD'}),env,assets);assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.equal(head.headers.get('content-security-policy'),csp);
});
test('dashboard shells can embed only same-origin frames; iframe privileges never broaden APIs or assets', async () => {
  const assets={'/index.html':{body:'<main>Dashboard</main>',type:'text/html'},'/styles.css':{body:'body{}',type:'text/css'}};
  for(const path of ['', '/models', '/agents', '/skills', '/activity', '/graft']) {
    const r=await handle(req(path),env,assets);const csp=r.headers.get('content-security-policy');
    assert.equal(r.status,200);assert.match(csp,/frame-src 'self'/);assert.match(csp,/frame-ancestors 'none'/);
    assert.match(csp,/script-src 'self'; style-src 'self'; connect-src 'self'/);assert.doesNotMatch(csp,/unsafe-inline|unsafe-eval/);
    assert.equal(r.headers.get('x-frame-options'),'DENY');
  }
  for(const path of ['/api/usage','/api/active-agents','/styles.css','/healthz','/graft/viewer/unknown']) {
    const r=await handle(req(path),env,assets);assert.equal(r.headers.get('x-frame-options'),'DENY');
    assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.doesNotMatch(r.headers.get('content-security-policy'),/frame-src|unsafe-inline|unsafe-eval|sha256-/);
  }
});
test('viewer preloading is an exact asset allowlist, never a directory or private-file server', async () => {
  const path='/graft/viewer/index.html';const assets={[path]:{body:'<script>const safe=true;</script>',type:'text/html'}};
  for(const privatePath of ['/graft/viewer/config.json','/graft/viewer/README.md','/graft/viewer/app.js','/graft/viewer/.env',
    '/graft/README.md','/graft/graph.test.mjs','/graft/sanitize.mjs','/config.json','/graft/viewer/index.html/']) {
    assets[privatePath]={body:'PRIVATE',type:'text/plain'};
    const result=await handle(req(privatePath),env,assets);assert.equal(result.status,404,privatePath);
    assert.doesNotMatch(await result.text(),/PRIVATE/);assert.equal(result.headers.get('x-frame-options'),'DENY');
  }
  assert.equal((await handle(req(path,{method:'POST',body:'{}'}),env,assets)).status,405);
  assert.equal((await handle(new Request('https://unapproved.mclement.ch/usage'+path),env,assets)).status,421);
});
