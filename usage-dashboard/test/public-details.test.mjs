import test from 'node:test';
import assert from 'node:assert/strict';
import {handle, publicSnapshot, validateSnapshot} from '../src/handler.mjs';
const taskId='a'.repeat(32);
const skillId='b'.repeat(32);
function fixture(){
  const date='2026-10-12';const at=date+'T12:00:00.000Z';
  const daily={date,provider:'openai',model:'fixture',input:null,output:null,cacheRead:null,cacheWrite:null,totalTokens:30,requests:2,costUsd:null};
  return {
    schemaVersion:1,generatedAt:at,range:{start:date,end:date,timeZone:'Europe/Zurich'},scopeLabel:'AFP fixture',daily:[daily],skills:[],
    requests:[{id:'run-fixture',at,model:'Not attributed',description:'Implementation (inferred)',input:null,output:null,cacheRead:null,cacheWrite:null,totalTokens:null,status:'succeeded',agentId:'dev-builder',taskId,startedAt:null,endedAt:at,durationMs:null,categories:['Implementation'],observedToolSteps:2}],
    coverage:{sessions:1,notes:[],skillMetric:'Observed reads',historyMetric:'Agent runs',details:{agents:'available',skills:'partial',tasks:'available',taskMetric:'Verified session lifecycle, not product acceptance.',toolStepMetric:'Observed deduplicated tool calls.'}},
    agents:[{id:'dev-builder',name:'Builder',role:'Implements features.',configuredModel:'openai/fixture',runtime:'openclaw',scopedSessions:1,usageState:'observed'}],
    agentDaily:[{agentId:'dev-builder',...daily}],
    skillCatalog:[{id:skillId,agentId:'main',name:'fixture-skill',description:'An approved public description.',descriptionSource:'approved_public',source:'managed',eligible:true,disabled:false,modelVisible:true,userInvocable:true,observedReads:null,lastObservedAt:null}],
    tasks:[{id:taskId,agentId:'dev-builder',kind:'delegated_session',title:'Implement reporting',titleSource:'approved_label',summary:'Improve the public reporting interface.',summarySource:'approved_metadata',status:'succeeded',statusSource:'session_lifecycle',observedAt:at,startedAt:null,endedAt:at,durationMs:null,durationSource:'unavailable',model:'openai/fixture',modelSource:'session_selection',categories:['Implementation'],observedRuns:1,observedToolSteps:2}]
  };
}
test('public detail contract preserves supported facts and unknowns',()=>{
  const value=fixture();assert.equal(validateSnapshot(value),true);assert.deepEqual(publicSnapshot(value),value);
});
test('every added metadata object strips unknown private fields',()=>{
  const value=fixture();const expected=structuredClone(value);
  for(const row of [...value.agents,...value.agentDaily,...value.skillCatalog,...value.tasks,...value.requests,value.coverage.details]){
    row.workspace='/private/path';row.rawPrompt='private input';row.sessionKey='agent:secret:private';row.auth={secret:'never publish'};
  }
  value.rawConfig={secret:'never publish'};
  assert.deepEqual(publicSnapshot(value),expected);
});
test('anonymous HTTP data receives the strict detail projection',async()=>{
  const value=fixture();value.tasks[0].rawTask='do not publish this';value.skillCatalog[0].instructionBody='private instructions';
  const response=await handle(new Request('https://afp.mclement.ch/usage/api/usage'),{USAGE:{get:async()=>JSON.stringify(value)}});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),fixture());
});
test('unavailable directories stay null while absent v1 extensions remain absent',()=>{
  const value=fixture();for(const key of ['agents','agentDaily','skillCatalog','tasks'])value[key]=null;
  assert.equal(validateSnapshot(value),true);assert.deepEqual(publicSnapshot(value),value);
  for(const key of ['agents','agentDaily','skillCatalog','tasks'])delete value[key];
  delete value.coverage.details;
  for(const row of value.requests)for(const key of ['agentId','taskId','startedAt','endedAt','durationMs','categories','observedToolSteps'])delete row[key];
  assert.equal(validateSnapshot(value),true);assert.deepEqual(publicSnapshot(value),value);
});
test('malformed or oversized optional public metadata fails closed',()=>{
  const mutations=[
    v=>v.agents='bad',v=>v.agents[0].scopedSessions=-1,v=>v.agents[0].usageState='active-now',
    v=>v.agents[0].id='agent:main:private',v=>delete v.agents[0].role,
    v=>v.agents=Array(101).fill(v.agents[0]),v=>v.agentDaily[0].totalTokens=undefined,
    v=>v.skillCatalog[0].description='x'.repeat(401),v=>v.skillCatalog[0].eligible='yes',
    v=>v.skillCatalog[0].source='/private/path',v=>v.skillCatalog[0].id='agent:main:private',
    v=>v.tasks[0].status='accepted-by-user',v=>v.tasks[0].durationMs=-1,
    v=>v.tasks[0].observedAt='yesterday',v=>v.tasks[0].categories=['arbitrary-private-tool'],
    v=>v.requests[0].taskId='private-session-id',v=>v.requests[0].observedToolSteps=1.5,
    v=>v.requests[0].startedAt='bad',v=>v.coverage.details.agents='complete-forever',
    v=>v.coverage.details=null
  ];
  for(const mutate of mutations){const value=fixture();mutate(value);assert.equal(validateSnapshot(value),false);assert.throws(()=>publicSnapshot(value));}
});
