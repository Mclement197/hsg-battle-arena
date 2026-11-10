import test from 'node:test';
import assert from 'node:assert/strict';
import {schedulingSnapshot} from '../src/scheduling.mjs';
import {publicSnapshot} from '../src/model.mjs';
import {schedulingLabel} from '../public/app.js';
const SCHEDULE_JOB='00000000-0000-4000-8000-000000000001';
const now=Date.parse('2026-11-10T12:00:00Z');
const metadata={schemaVersion:1,source:'openclaw-automations',scope:'security-dashboard',jobId:SCHEDULE_JOB,agent:'dev-security',enabled:true,verifiedAt:'2026-11-10T11:55:00Z',schedule:{kind:'cron',expr:'0 9 * * 1,4',tz:'Europe/Zurich'},nextRunAt:'2026-11-12T08:00:00Z'};
test('only recent verified exact scheduler state can show enabled; next run is not projected',()=>{
 const p=schedulingSnapshot(metadata,now);assert.equal(p.status,'enabled');assert.equal(p.enabled,true);assert.equal(p.nextRunAt,metadata.nextRunAt.replace('Z','.000Z'));assert.equal(schedulingSnapshot({...metadata,nextRunAt:null},now).nextRunAt,null);assert.equal(schedulingSnapshot({...metadata,nextRunAt:'2026-11-10T10:00:00Z'},now).nextRunAt,null);assert.equal(schedulingSnapshot({...metadata,enabled:false},now).status,'disabled');
});
test('missing malformed future and stale evidence never claim enabled or disabled',()=>{
 for(const m of [null,{}, {...metadata,source:'projected'}, {...metadata,jobId:'other'}, {...metadata,verifiedAt:'2026-11-11T12:00:00Z'}, {...metadata,schedule:{...metadata.schedule,expr:'* * * * *'}}]){const p=schedulingSnapshot(m,now);assert.equal(p.status,'unknown');assert.equal(p.enabled,null);assert.equal(p.nextRunAt,null);assert.match(schedulingLabel(p),/unknown/);}
 const stale=schedulingSnapshot({...metadata,verifiedAt:'2026-11-09T11:00:00Z'},now);assert.equal(stale.status,'stale');assert.equal(stale.enabled,null);assert.equal(stale.lastKnownEnabled,true);assert.equal(stale.nextRunAt,null);assert.match(schedulingLabel(stale),/stale/);
});
test('public scheduler projection is allowlisted and cannot leak raw metadata',()=>{
 const p=publicSnapshot({incidents:[]},now,{...metadata,payload:'PRIVATE_CANARY',schedule:{...metadata.schedule,private:'PRIVATE_CANARY'}});assert.equal(p.scheduling.status,'enabled');assert.ok(!JSON.stringify(p).includes('PRIVATE_CANARY'));assert.ok(!JSON.stringify(p).includes(SCHEDULE_JOB));assert.equal(publicSnapshot({incidents:[],scheduling:metadata},now).scheduling.status,'unknown');
});
