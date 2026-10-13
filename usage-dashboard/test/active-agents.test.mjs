import test from 'node:test';
import assert from 'node:assert/strict';
import { createActiveAgentsSource, projectActiveSessions, publicActiveAgents } from '../src/active-agents.mjs';
import { createSharedGatewayReader } from '../src/live-usage.mjs';
import { handle } from '../src/handler.mjs';
const at = Date.parse('2026-10-13T12:00:00Z');
const report = (sessions = [], ts = at) => ({ ts, sessions, hasMore: false, nextOffset: null });
const active = (id, overrides = {}) => ({ agentId: id, hasActiveRun: true, status: 'running', ...overrides });
const url = 'https://afp.mclement.ch/usage/api/active-agents';

test('live projection deduplicates aliases and publishes only approved names, no session content', () => {
  const value = projectActiveSessions(report([active('main', { name: 'SECRET', key: 'private-key', sessionId: 'private-id', displayName: 'PRIVATE CHAT' }),
    active('main'), active('dev-builder'), active('foreign'), active('dev-ui', {status:'queued'}),
    active('dev-review', {hasActiveRun:false,updatedAt:at})]), at);
  assert.deepEqual(value, { observedAt: new Date(at).toISOString(), status: 'ok', agents: [{id:'dev-builder',name:'dev-builder'},{id:'main',name:'main'}] });
  assert.doesNotMatch(JSON.stringify(value), /SECRET|private|PRIVATE|foreign|dev-ui|dev-review/);
});
test('cache coalesces polls, uses live activeOnly, transitions active to idle on refresh', async () => {
  let time=at, calls=0, rows=[active('main')];
  const get=createActiveAgentsSource({clock:()=>time,rpc:async(method,params)=>{
    calls++; assert.equal(method,'sessions.list'); assert.equal(params.activeOnly,true);
    for(const flag of ['includeDerivedTitles','includeLastMessage','includeActivitySummary']) assert.equal(params[flag],false);
    assert.equal(params.activeMinutes,undefined);return report(rows,time);
  }});
  const results=await Promise.all([get(),get(),get()]);assert.equal(calls,1);assert.equal(results[0].agents.length,1);
  rows=[];time+=9999;assert.equal((await get()).agents.length,1);assert.equal(calls,1);
  time++;assert.deepEqual((await get()).agents,[]);assert.equal(calls,2);
});
test('stale, truncated, missing authoritative flags and failed sources are unknown, not idle', async () => {
  for(const invalid of [report([],at-15001),report([],at+1),{...report(),hasMore:true,nextOffset:100},
    report([{agentId:'main',status:'running',updatedAt:at}]),report([active('main',{status:'unknown'})])]) {
    const get=createActiveAgentsSource({clock:()=>at,rpc:async()=>invalid});
    assert.deepEqual(await get(),{observedAt:new Date(at).toISOString(),status:'unavailable',agents:[]});
  }
  let time=at, fail=false;
  const get=createActiveAgentsSource({clock:()=>time,rpc:async()=>{if(fail)throw new Error('PRIVATE ERROR');return report([active('main')],time);}});
  assert.equal((await get()).status,'ok');time+=10000;fail=true;assert.equal((await get()).status,'unavailable');
  assert.equal(publicActiveAgents({observedAt:new Date(at-15001).toISOString(),status:'ok',agents:[]},at).status,'unavailable');
});
test('timeout and TTL are bounded; a hanging source fails closed', async () => {
  assert.throws(()=>createActiveAgentsSource({ttlMs:15001}));assert.throws(()=>createActiveAgentsSource({timeoutMs:4001}));
  const get=createActiveAgentsSource({rpc:()=>new Promise(()=>{}),timeoutMs:10});
  assert.equal((await get()).status,'unavailable');
});
test('public endpoint is independent of usage collection, privacy projected and read-only', async () => {
  const now=Date.now();const env={USAGE:{get:()=>{throw new Error('must not collect usage');}},ACTIVE_AGENTS:async()=>({
    observedAt:new Date(now).toISOString(),status:'ok',private:'SECRET',agents:[{id:'main',name:'PRIVATE',key:'SECRET'},{id:'unapproved',name:'Secret'}]})};
  const response=await handle(new Request(url),env);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{observedAt:new Date(now).toISOString(),status:'ok',agents:[{id:'main',name:'main'}]});
  for(const method of ['POST','PUT','DELETE']) assert.equal((await handle(new Request(url,{method}),env)).status,404);
  for(const missing of [{},{ACTIVE_AGENTS:async()=>{throw new Error('PRIVATE');}},{ACTIVE_AGENTS:async()=>({observedAt:new Date(now-16000).toISOString(),status:'ok',agents:[]})}]) {
    const result=await handle(new Request(url),missing);assert.equal(result.status,200);assert.equal((await result.json()).status,'unavailable');
  }
});


test('expired queued active read aborts before shared child admission', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let release, calls = 0;
  const reader = createSharedGatewayReader(async () => { calls++; return await new Promise(resolve => { release = resolve; }); });
  const first = reader('usage.cost', {}); for (let i = 0; i < 5; i++) await Promise.resolve();
  const get = createActiveAgentsSource({ rpc: reader, timeoutMs: 100 });
  const queued = get(); t.mock.timers.tick(100);
  assert.equal((await queued).status, 'unavailable'); release({}); await first;
  for (let i = 0; i < 10; i++) await Promise.resolve(); assert.equal(calls, 1);
});
