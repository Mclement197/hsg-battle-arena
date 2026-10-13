import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSnapshot, validateConfig, run, gatewayRpc } from '../src/collect.mjs';
import { installationSnapshot, INSTALLATION_LABEL } from '../src/installation-usage.mjs';
import { publicSnapshot, validateSnapshot, handle } from '../src/handler.mjs';
const now=new Date('2026-10-13T12:00:00Z');
const range={start:'2026-10-12',end:'2026-10-13',timeZone:'Europe/Zurich'};
const config={scopeMode:'installation',rootSessionKey:'agent:main:dashboard:test',snapshotPath:'/private/snapshot.json',lookbackDays:2};
const totals=(n=1)=>({input:100*n,output:20*n,cacheRead:30*n,cacheWrite:0,totalTokens:150*n,totalCost:0.1*n,missingCostEntries:0});
const report=()=>({updatedAt:now.getTime(),daily:[{date:range.start,...totals()},{date:range.end,...totals(2)}],totals:totals(3),cacheStatus:{status:'fresh',refreshedAt:now.getTime()}});

test('installation mode needs no human profile; human mode retains its permission guards',()=>{
  assert.equal(validateConfig(config).scopeMode,'installation');
  assert.equal(validateConfig({...config,rootSessionKey:undefined}).scopeMode,'installation');
  assert.throws(()=>validateConfig({...config,scopeMode:'all-conversations'}),e=>e.code==='AUTHORIZED_CONVERSATION_PROFILE_REQUIRED');
  assert.throws(()=>validateConfig({...config,scopeMode:'all-conversations',conversationProfileId:'gateway-owner'}),e=>e.code==='SHARED_OWNER_NOT_A_PERSON');
});
test('installation collects exactly one aggregate RPC, no transcripts, titles, discovery or observer reads',async()=>{
  const calls=[];const r=report();r.sessions=[{key:'PRIVATE',title:'SECRET',profileId:'OTHER HUMAN'}];r.daily[0].key='PRIVATE';
  const result=await collectSnapshot({...config,allowlistPath:'/private/allowlist.json'}, {now,rpc:async(method,params)=>{calls.push({method,params});return r;},
    readMetadata:()=>assert.fail('no metadata reads'),readSkillEvents:()=>assert.fail('no observer reads'),writeAllowlist:async(path,value)=>assert.deepEqual(value,[])});
  assert.deepEqual(calls,[{method:'usage.cost',params:{startDate:range.start,endDate:range.end,mode:'specific',timeZone:range.timeZone,agentScope:'all'}}]);
  assert.equal(result.scopeLabel,INSTALLATION_LABEL);assert.equal(validateSnapshot(result),true);
  assert.equal(result.daily.reduce((n,row)=>n+row.totalTokens,0),450);assert.equal(result.coverage.sessions,null);
  assert.equal(result.daily[0].requests,null);assert.equal(result.agentDaily,null);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|SECRET|OTHER HUMAN/);
});
test('HTTP installation projection erases human detail and identity fields even if incorrectly supplied',async()=>{
  const s=installationSnapshot(report(),range,now);s.scopeLabel='PRIVATE';s.daily[0].model='SECRET';s.daily[0].provider='PRIVATE';
  s.coverage.notes.push('PRIVATE');s.coverage.profileId='OTHER';s.profileId='OTHER';
  s.requests=[{id:'private-id',at:now.toISOString(),model:'SECRET',description:'PRIVATE',input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,status:'done'}];
  s.skills=[{name:'PRIVATE',description:'SECRET',count:1,lastUsedAt:null}];
  const response=await handle(new Request('https://afp.mclement.ch/usage/api/usage'),{USAGE:{get:async()=>JSON.stringify(s)}});
  assert.equal(response.status,200);const projected=await response.json();assert.deepEqual(projected,publicSnapshot(s));
  assert.doesNotMatch(JSON.stringify(projected),/PRIVATE|SECRET|OTHER|private-id/);assert.deepEqual(projected.requests,[]);
});
test('daily partition matches global totals; duplicate dates, invalid buckets and unreconciled totals fail',()=>{
  for(const modify of [r=>r.daily.push(r.daily[0]),r=>r.daily[0].totalTokens++,r=>r.totals.input++,r=>r.daily[0].input=-1,
    r=>r.daily[0].date='2026-10-11',r=>r.daily=[],r=>r.daily[0].date='2026-02-31',r=>r.totals.totalCost++]) {
    const r=report();modify(r);assert.throws(()=>installationSnapshot(r,range,now));
  }
});
test('unknown prices and partial refreshing rollups remain honest; stale reports fail closed',()=>{
  const r=report();r.daily[0].missingCostEntries=1;r.totals.missingCostEntries=1;r.cacheStatus.status='refreshing';r.cacheStatus.cachedFiles=1;
  const s=installationSnapshot(r,range,now);assert.equal(s.daily[0].costUsd,null);assert.equal(s.daily[1].costUsd,0.2);assert.match(s.coverage.notes.join(' '),/refreshing/);
  r.cacheStatus.cachedFiles=0;assert.throws(()=>installationSnapshot(r,range,now),e=>e.code==='INSTALLATION_USAGE_PENDING');
  r.cacheStatus.cachedFiles=1;
  r.cacheStatus.refreshedAt=now.getTime()-900001;assert.throws(()=>installationSnapshot(r,range,now),e=>e.code==='INSTALLATION_USAGE_PENDING');
  const empty=report();empty.daily=[];empty.totals=totals(0);assert.deepEqual(installationSnapshot(empty,range,now).daily,[]);
});
test('denied aggregate reporting never falls back or overwrites the production snapshot',async()=>{
  let calls=0,writes=0;
  await assert.rejects(run(config,{now,rpc:async(method)=>{calls++;assert.equal(method,'usage.cost');throw new Error('FORBIDDEN');},writeSnapshot:async()=>{writes++;}}),/FORBIDDEN/);
  assert.equal(calls,1);assert.equal(writes,0);
});
test('aggregate RPC uses existing CLI authorization and read-only method guard',async()=>{
  const r=await gatewayRpc('usage.cost',{agentScope:'all'},async(command,args)=>{assert.equal(command,'openclaw');assert.equal(args[2],'usage.cost');
    assert.deepEqual(JSON.parse(args[5]),{agentScope:'all'});assert.ok(!args.includes('--token'));return {stdout:'{}'};});assert.deepEqual(r,{});
});


test('provider totals remain authoritative when their breakdown is zero or incomplete', () => {
  for (const [totalTokens, input, output, cacheRead] of [[150,0,0,0],[160,100,20,30]]) {
    const r=report();r.daily=[{date:range.end,...totals(),totalTokens,input,output,cacheRead}];
    r.totals={...r.daily[0]};delete r.totals.date;
    const s=installationSnapshot(r,range,now);
    assert.equal(s.daily[0].totalTokens,totalTokens);
    for(const key of ['input','output','cacheRead','cacheWrite']) assert.equal(s.daily[0][key],null);
    assert.equal(validateSnapshot(s),true);assert.equal(publicSnapshot(s).daily[0].totalTokens,totalTokens);
    assert.match(publicSnapshot(s).coverage.notes.join(' '),/breakdown is unavailable/);
    r.totals.totalTokens++;assert.throws(()=>installationSnapshot(r,range,now),e=>e.code==='INSTALLATION_TOTALS_MISMATCH');
  }
});
test('missing component buckets remain unknown without discarding authoritative totals', () => {
  const r=report();r.daily[0].input=null;delete r.daily[1].cacheWrite;r.totals.input=null;delete r.totals.cacheWrite;
  const s=installationSnapshot(r,range,now);assert.equal(s.daily.reduce((n,row)=>n+row.totalTokens,0),450);
  for(const row of s.daily) for(const key of ['input','output','cacheRead','cacheWrite']) assert.equal(row[key],null);
  assert.equal(validateSnapshot(s),true);
});
