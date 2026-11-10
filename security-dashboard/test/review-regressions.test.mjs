import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {score,publicSnapshot,reconcile,RUBRIC} from '../src/model.mjs';
import * as app from '../public/app.js';
const at='2026-10-28T09:00:00Z',now=Date.parse(at);
const expected=[...['game','usage','architecture','security'].map(app=>({id:'dependencies:'+app,category:'dependencies'})),...['secrets','sast','configuration','tests','coverage','monitoring'].map(id=>({id,category:id}))];
const fixture=()=>({incidents:[],runs:[],latestRun:{id:randomUUID(),startedAt:at,finishedAt:at,mode:'full',findings:[],scans:expected.map(s=>({...s,status:'ok',findingCount:0})),metrics:{coverage:{lines:100,branches:100,functions:100},tests:{passed:1,failed:0,skipped:0,passPercent:100}}}});
const f={source:'secrets',kind:'secret',component:'security',key:'one-location',severity:'high',confidence:'high',evidence:{private:'DO_NOT_PUBLISH'}};
test('review exploit: one of four dependency scopes cannot earn a full dependency score or complete run',()=>{
 const state=fixture();state.latestRun.scans=state.latestRun.scans.filter(s=>s.category!=='dependencies'||s.id==='dependencies:game');
 const assessment=score(state,now);assert.equal(assessment.dimensions.dependencies.value,null);assert.equal(assessment.confidence,75);assert.equal(assessment.value,75);
 assert.equal(publicSnapshot(state,now).run.status,'degraded');
});
test('every one of 1024 source subsets is fail-closed, with absent rows explicitly unavailable',()=>{
 for(let mask=0;mask<2**expected.length;mask++){
  const state=fixture();state.latestRun.scans=state.latestRun.scans.filter((_,i)=>mask&(1<<i));
  const p=publicSnapshot(state,now);let confidence=0;
  for(const [category,weight] of Object.entries(RUBRIC.weights)){
   const available=expected.filter(s=>s.category===category).every(s=>state.latestRun.scans.some(actual=>actual.id===s.id));
   assert.equal(p.score.dimensions[category].value,available?100:null,'mask '+mask+' '+category);if(available)confidence+=weight;
  }
  assert.equal(p.score.confidence,confidence);assert.equal(p.score.value,confidence);
  assert.equal(p.run.status,mask===2**expected.length-1?'complete':'degraded','mask '+mask);
  assert.equal(p.scans.length,expected.length);
  for(const row of p.scans)if(!state.latestRun.scans.some(s=>s.id===row.source)){assert.equal(row.status,'unavailable');assert.equal(row.findingCount,null);assert.equal(row.severityCounts,null);}
  assert.equal(p.scannerManifest.version,'1.0.0');assert.equal(p.scannerManifest.sources.length,expected.length);
 }
});
test('failed, unavailable, error and not-run sources never earn their category weight',()=>{
 for(const source of expected.filter(s=>s.category!=='monitoring'))for(const status of ['failed','unavailable','error','not-run']){
  const state=fixture();state.latestRun.scans.find(s=>s.id===source.id).status=status;
  const assessment=score(state,now);assert.equal(assessment.dimensions[source.category].value,null,source.id+' '+status);assert.equal(assessment.confidence,100-RUBRIC.weights[source.category]);
  if(['error','not-run'].includes(status))assert.throws(()=>publicSnapshot(state,now),/Invalid scanner/);
  else {const p=publicSnapshot(state,now);assert.equal(p.run.status,'degraded');assert.equal(p.scans.find(s=>s.source===source.id).findingCount,null);}
 }
});
test('wrong category, duplicate source and unknown source records are rejected at the public boundary',()=>{
 for(const mutate of [s=>{s.latestRun.scans[0].category='sast';},s=>{s.latestRun.scans.push({...s.latestRun.scans[0]});},s=>{s.latestRun.scans.push({id:'dependencies:unreviewed',category:'dependencies',status:'ok'});},s=>{s.latestRun.scans=null;}]){const state=fixture();mutate(state);assert.throws(()=>publicSnapshot(state,now),/Invalid scanner/);}
});
test('unmeasured quality is unknown, not complete, and missing/failed scanners cannot publish a stored percentage',()=>{
 const state=fixture();state.latestRun.metrics.coverage.lines=null;let p=publicSnapshot(state,now);assert.equal(p.score.confidence,95);assert.equal(p.run.status,'degraded');assert.equal(p.metrics.coverage.lines,null);
 for(const category of ['coverage','tests']){const s=fixture();s.latestRun.scans=s.latestRun.scans.filter(x=>x.category!==category);p=publicSnapshot(s,now);assert.equal(p.metrics[category],null);s.latestRun.scans.push({id:category,category,status:'failed'});p=publicSnapshot(s,now);assert.equal(p.metrics[category],null);}
});
test('duplicate findings and replay count exactly once per run; subsequent run increments once',()=>{
 const r=fixture().latestRun;r.findings=[f,f];let result=reconcile(null,r);
 assert.equal(result.state.incidents.length,1);assert.equal(result.state.incidents[0].observationCount,1);assert.equal(result.observations.length,1);assert.equal(result.events.length,1);assert.equal(result.state.latestRun.findings.length,1);
 assert.equal(publicSnapshot(result.state,now).scans.find(s=>s.source==='secrets').severityCounts.high,1);
 const replay=reconcile(result.state,r);assert.deepEqual(replay.state,result.state);assert.deepEqual(replay.observations,[]);assert.deepEqual(replay.events,[]);
 result=reconcile(result.state,{...r,id:randomUUID()});assert.equal(result.state.incidents[0].observationCount,2);assert.equal(result.observations.length,1);assert.equal(result.events.length,0);
 const olderReplay=reconcile(result.state,r);assert.deepEqual(olderReplay.state,result.state);assert.equal(olderReplay.state.incidents[0].history.length,1);
});
test('conflicting duplicates conservatively retain the highest severity, with first payload winning ties',()=>{
 for(const findings of [[f,{...f,severity:'critical'}],[{...f,severity:'critical'},f]]){
  const r=fixture().latestRun;r.findings=findings;const result=reconcile(null,r);assert.equal(result.state.incidents[0].severity,'critical');assert.equal(result.state.incidents[0].observationCount,1);assert.equal(result.observations.length,1);assert.equal(result.events.length,1);
 }
 const r=fixture().latestRun;r.findings=[f,{...f,evidence:{private:'SECOND'}}];assert.deepEqual(reconcile(null,r).state.incidents[0].evidence,f.evidence);
});
test('missing measurements do not erase active critical findings or misrepresent their category as clean',()=>{
 for(const source of expected.filter(s=>['dependencies','secrets','sast','configuration'].includes(s.category))){
  const r=fixture().latestRun;r.findings=[{...f,source:source.id,kind:source.category==='dependencies'?'dependency':source.category==='secrets'?'secret':source.category,severity:'critical'}];const state=reconcile(null,r).state;
  assert.equal(score(state,now).dimensions[source.category].value,60);state.latestRun.scans=state.latestRun.scans.filter(s=>s.id!==source.id);const p=publicSnapshot(state,now);assert.equal(p.score.dimensions[source.category].value,null);assert.equal(p.run.status,'degraded');assert.equal(p.counts.critical,1);assert.equal(p.incidents[0].status,'open');assert.equal(p.scans.find(s=>s.source===source.id).findingCount,null);
 }
});
test('quality percentages carry adjacent coverage/test scope and unknown values remain N/A',()=>{
 const fields=app.qualityMeasurements({coverage:{lines:81.25,branches:42,functions:50},tests:{passed:3,failed:1,passPercent:75}});
 for(const [label,value] of fields.slice(0,3)){assert.match(label,/security-dashboard\/src ONLY/);assert.match(value,/%$/);}
 assert.match(fields.find(([label])=>label.startsWith('Test pass rate'))[0],/Security dashboard unit and HTTP tests ONLY/);
 assert.equal(fields[0][1],'81.25%');assert.equal(fields.at(-1)[1],'75.00%');
 const missing=app.qualityMeasurements({});assert.ok(missing.every(([,v])=>v.startsWith('N/A')));
});
