import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {remediate,permissionPlan,applyPermissions,rollbackPermissions} from '../src/remediate.mjs';
import {acquireLock} from '../src/scan.mjs';
const snapshot={run:{id:'12345678-1234-1234-1234-123456789012',status:'complete'},score:{value:80,confidence:100},counts:{critical:1},incidents:[{id:'untrusted',source:'configuration',kind:'configuration',status:'open',evidence:{command:'DO NOT EXECUTE'}}]};
async function fixture(t){const d=await fs.mkdtemp(join(tmpdir(),'security-remediate-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));await fs.writeFile(join(d,'public.json'),'original dirty artifact');await fs.chmod(join(d,'public.json'),0o666);await fs.writeFile(join(d,'not-allowlisted.json'),'unrelated dirty work');await fs.chmod(join(d,'not-allowlisted.json'),0o666);return d;}
const mode=async p=>(await fs.stat(p)).mode&0o777;
test('single allowlisted permission fix preserves contents/unrelated dirty work and requires tests plus rescan under continuous lock',async t=>{
 const dataDir=await fixture(t);let scans=0,tests=0;
 const report=await remediate({dataDir,scanFn:async()=>{scans++;await assert.rejects(acquireLock(dataDir),/already running/);return snapshot;},testFn:async()=>{tests++;return {code:0,counts:{passed:2,failed:0}};}});
 assert.equal(report.status,'verified');assert.equal(report.attempts,1);assert.equal(report.maxAttempts,1);assert.equal(report.edits.length,1);assert.equal(scans,2);assert.equal(tests,1);assert.equal(await mode(join(dataDir,'public.json')),0o600);assert.equal(await fs.readFile(join(dataDir,'public.json'),'utf8'),'original dirty artifact');assert.equal(await mode(join(dataDir,'not-allowlisted.json')),0o666);assert.equal(report.approvalRequired[0].disposition,'approval-required');assert.ok(!JSON.stringify(report).includes('DO NOT EXECUTE'));
 const path=join(dataDir,'remediations',report.id+'.json');assert.equal(await mode(path),0o600);assert.equal(JSON.parse(await fs.readFile(path)).status,'verified');const release=await acquireLock(dataDir);await release();
});
test('failed tests still rescan, rollback only own mode edit, and scan rollback once without retries',async t=>{
 const dataDir=await fixture(t);let scans=0;const report=await remediate({dataDir,scanFn:async()=>{scans++;return snapshot;},testFn:async()=>({code:1,counts:{passed:1,failed:1}})});
 assert.equal(report.status,'failed');assert.equal(scans,3);assert.equal(report.rollback[0].status,'rolled-back');assert.equal(await mode(join(dataDir,'public.json')),0o666);assert.equal(await fs.readFile(join(dataDir,'not-allowlisted.json'),'utf8'),'unrelated dirty work');
});
test('degraded baseline cannot authorize edits and cannot clear unsupported findings',async t=>{
 const dataDir=await fixture(t);let tests=0;const report=await remediate({dataDir,scanFn:async()=>({...snapshot,run:{...snapshot.run,status:'degraded'}}),testFn:async()=>{tests++;}});assert.equal(report.status,'failed');assert.equal(report.attempts,0);assert.equal(tests,0);assert.equal(report.approvalRequired.length,1);assert.equal(await mode(join(dataDir,'public.json')),0o666);
});
test('concurrent contents or inode replacement is never overwritten on rollback; symlinks fail closed',async t=>{
 const dataDir=await fixture(t),plan=await permissionPlan(dataDir),applied=await applyPermissions(dataDir,plan);await fs.writeFile(join(dataDir,'public.json'),'someone else changed this');const rollback=await rollbackPermissions(dataDir,applied);assert.match(rollback[0].status,/approval-required/);assert.equal(await fs.readFile(join(dataDir,'public.json'),'utf8'),'someone else changed this');await fs.unlink(join(dataDir,'public.json'));await fs.symlink(join(dataDir,'not-allowlisted.json'),join(dataDir,'public.json'));await assert.rejects(permissionPlan(dataDir));
});
test('second scan degradation fails verification and rolls back; no arbitrary scan-supplied actions',async t=>{
 const dataDir=await fixture(t);let scans=0;const report=await remediate({dataDir,scanFn:async()=>{scans++;return scans===2?{...snapshot,run:{...snapshot.run,status:'degraded'}}:snapshot;},testFn:async()=>({code:0,counts:{passed:1,failed:0}})});assert.equal(report.status,'failed');assert.equal(report.rollback[0].status,'rolled-back');assert.equal(scans,3);
});

test('fixed allowlist rejects arbitrary paths, mode expansion and aliased run directories',async t=>{
 const dataDir=await fixture(t),plan=await permissionPlan(dataDir);
 await assert.rejects(applyPermissions(dataDir,[{...plan[0],path:'not-allowlisted.json'}]),/outside allowlist/);
 await assert.rejects(applyPermissions(dataDir,[{...plan[0],target:0o777}]),/Mode outside fixed allowlist/);
 await fs.mkdir(join(dataDir,'outside'));await fs.symlink(join(dataDir,'outside'),join(dataDir,'runs'));
 await assert.rejects(permissionPlan(dataDir));assert.equal(await mode(join(dataDir,'public.json')),0o666);
});
test('release never deletes a replacement lock owned by another run',async t=>{
 const dataDir=await fixture(t),release=await acquireLock(dataDir);
 await fs.rename(join(dataDir,'scan.lock'),join(dataDir,'old-lock'));await fs.writeFile(join(dataDir,'scan.lock'),'replacement');
 await assert.rejects(release(),/identity changed/);assert.equal(await fs.readFile(join(dataDir,'scan.lock'),'utf8'),'replacement');
});
