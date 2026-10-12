import test from 'node:test';
import assert from 'node:assert/strict';
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
  for(const path of ['', '/', '/models', '/agents/', '/skills?skill=example', '/activity?run=opaque-fixture']){
    const r=await handle(req(path),env,assets);
    assert.equal(r.status,200,path);assert.equal(await r.text(),'<h1>Usage dashboard</h1>');
  }
  for(const path of ['/unknown', '/agents/private-file', '/config.json'])
    assert.equal((await handle(req(path),env,assets)).status,404,path);
});
