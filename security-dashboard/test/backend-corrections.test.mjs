import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {reconcile,publicSnapshot,SCANNER_MANIFEST} from '../src/model.mjs';
import {acquireLock,scan,command} from '../src/scan.mjs';
const f={source:'secrets',kind:'secret',component:'security',key:'retained',severity:'high',confidence:'high',evidence:{}};
const run=(findings=[f],scans=[{id:'secrets',category:'secrets',status:'ok'}])=>({id:randomUUID(),finishedAt:new Date().toISOString(),findings,scans,metrics:{}});
test('only one exact manifest source/category success can verify resolution',()=>{
 const prior=reconcile(null,run()).state;
 for(const scans of [[],[{id:'secrets',category:'configuration',status:'ok'}],[{id:'secrets',category:'secrets',status:'ok'},{id:'secrets',category:'secrets',status:'failed'}],...['failed','unavailable','degraded','error'].map(status=>[{id:'secrets',category:'secrets',status}])])assert.equal(reconcile(prior,run([],scans)).state.incidents[0].status,'open');
 assert.equal(reconcile(prior,run([])).state.incidents[0].status,'resolved');
});
test('manifest counts describe reported versus expected inventory without paths',()=>{
 const p=publicSnapshot(reconcile(null,run()).state);
 assert.equal(p.scannerManifest.expectedCount,10);assert.equal(p.scannerManifest.reportedCount,1);assert.equal(p.scannerManifest.completedCount,1);assert.equal(p.scannerManifest.missingCount,9);
 const full=run([],SCANNER_MANIFEST.sources.map(s=>({...s,status:'ok'})));full.metrics={coverage:{lines:100},tests:{passPercent:100}};
 assert.equal(publicSnapshot(reconcile(null,full).state).run.status,'complete');
});
test('scan scopes restrictive umask through child creation and restores it after a lock collision',async t=>{
 const d=await mkdtemp(join(tmpdir(),'security-mask-'));t.after(()=>rm(d,{recursive:true,force:true}));
 const release=await acquireLock(d);const original=process.umask(0o002);t.after(()=>{process.umask(original);});
 const pending=scan({dataDir:d});const rejected=assert.rejects(pending,/already running/);assert.equal(process.umask(),0o077);
 const file=join(d,'coverage.lcov');const child=await command(process.execPath,['-e','require("node:fs").writeFileSync(process.argv[1],"private")',file]);assert.equal(child.code,0);assert.equal((await stat(file)).mode&0o777,0o600);
 await rejected;assert.equal(process.umask(),0o002);assert.equal((await stat(d)).mode&0o777,0o700);await release();
});
