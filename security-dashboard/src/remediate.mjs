import {promises as fs,constants} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {openArtifacts} from './artifacts.mjs';
import {DATA,ROOT,scan,withScanLock,command,parseTests} from './scan.mjs';
export const ALLOWLIST=['restrict-scan-artifact-permissions'];
const runName=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const reportNames=['run.json','sast.json','tests.tap','coverage.lcov','gitleaks-redacted.json'];
const hash=data=>createHash('sha256').update(data).digest('hex');
const allowedPath=path=>['.','runs','state.json','public.json','observations.ndjson','events.ndjson'].includes(path)||(/^runs\//.test(path)&&runName.test(path.split('/')[1])&&(path.split('/').length===2||path.split('/').length===3&&reportNames.includes(path.split('/')[2])));
async function inspect(dataDir,path,store) {
 if(!allowedPath(path))throw new Error('Artifact path outside allowlist');
 const fd=await store.entry(path);
 try {const s=await fd.stat();if(s.uid!==process.getuid()||(!s.isFile()&&!s.isDirectory())||s.isFile()&&s.nlink!==1||s.mode&0o7000)throw new Error('Unsafe artifact identity');
 if(s.isFile()&&s.size>16*1024*1024)throw new Error('Artifact size budget exceeded');
 const mode=s.mode&0o777;return {path,dev:s.dev,ino:s.ino,mode,target:mode&(s.isDirectory()?0o700:0o600),digest:s.isFile()?hash(await fd.readFile()):null,directory:s.isDirectory()};
 }finally{await fd.close();}
}
export async function permissionPlan(dataDir,store) {
 if(!store){const owned=await openArtifacts(dataDir);try{await owned.preflight();return await permissionPlan(dataDir,owned);}finally{await owned.close();}}
 await store.preflight();
 const paths=['.','runs','state.json','public.json','observations.ndjson','events.ndjson'];
 let runs=[];try{const root=await inspect(dataDir,'runs',store);if(!root.directory)throw new Error('Invalid runs directory');runs=await fs.readdir(await store.directory('runs'));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const name of runs.filter(x=>runName.test(x)))paths.push('runs/'+name,...reportNames.map(f=>'runs/'+name+'/'+f));
 if(paths.length>3000)throw new Error('Artifact inventory budget exceeded');
 const plan=[];for(const path of paths)try{const item=await inspect(dataDir,path,store);if(item.target!==item.mode)plan.push(item);}catch(e){if(e.code!=='ENOENT')throw e;}
 return plan;
}
async function changeMode(dataDir,item,rollback=false,store) {
 const current=await inspect(dataDir,item.path,store),expected=rollback?item.target:item.mode;
 if(!Number.isInteger(item.mode)||item.mode<0||item.mode>0o777||item.target!==(item.mode&(current.directory?0o700:0o600)))throw new Error('Mode outside fixed allowlist');
 if(current.dev!==item.dev||current.ino!==item.ino||current.mode!==expected||current.digest!==item.digest)throw new Error('Artifact changed; refusing overwrite');
 const fd=await store.entry(item.path);
 try{const s=await fd.stat();if(s.dev!==item.dev||s.ino!==item.ino||(s.mode&0o777)!==expected)throw new Error('Artifact changed during open');if(s.isFile()&&hash(await fd.readFile())!==item.digest)throw new Error('Artifact contents changed during open');await fd.chmod(rollback?item.mode:item.target);}finally{await fd.close();}
}
export async function applyPermissions(dataDir,plan,applied=[],store) {
 if(!store){const owned=await openArtifacts(dataDir);try{await owned.preflight();return await applyPermissions(dataDir,plan,applied,owned);}finally{await owned.close();}}
 if(plan.length>100)throw new Error('Remediation edit budget exceeded');
 for(const item of plan){await changeMode(dataDir,item,false,store);applied.push(item);}return applied;
}
export async function rollbackPermissions(dataDir,applied,store) {
 if(!store){const owned=await openArtifacts(dataDir);try{await owned.preflight();return await rollbackPermissions(dataDir,applied,owned);}finally{await owned.close();}}
 const results=[];for(const item of [...applied].reverse())try{await changeMode(dataDir,item,true,store);results.push({path:item.path,status:'rolled-back'});}catch{results.push({path:item.path,status:'approval-required-concurrent-change'});}return results;
}
async function tests() {
 const files=(await fs.readdir(join(ROOT,'security-dashboard/test'))).filter(x=>x.endsWith('.test.mjs')).map(x=>'security-dashboard/test/'+x);
 const result=await command(process.execPath,['--test','--test-reporter=tap',...files],{timeout:90000});return {code:result.code,counts:parseTests(result.stdout)};
}
const compact=s=>({runId:s.run?.id,status:s.run?.status,score:s.score?.value,confidence:s.score?.confidence,counts:s.counts});
export async function remediate({dataDir=DATA,scanFn=scan,testFn=tests}={}) {
 const oldMask=process.umask(0o077);
 try{return await withScanLock(dataDir,async (lease,store)=>{
  const id=randomUUID(),path='remediations/'+id+'.json';
  const report={schemaVersion:1,id,startedAt:new Date().toISOString(),allowlist:ALLOWLIST,maxAttempts:1,attempts:0,status:'running',edits:[],rollback:[],approvalRequired:[]};
  const persist=()=>store.atomic(path,report);await persist();
  const applied=[];
  try {
   const before=await scanFn({dataDir,lease});report.before=compact(before);
   report.approvalRequired=(before.incidents||[]).filter(i=>i.status!=='resolved').map(i=>({id:i.id,source:i.source,kind:i.kind,disposition:'approval-required'}));
   if(before.run?.status!=='complete')throw new Error('Baseline scan degraded; remediation blocked');
   const plan=await permissionPlan(dataDir,store);report.attempts=plan.length?1:0;
   report.edits=plan;await persist();
   await applyPermissions(dataDir,plan,applied,store);
   // Always run both verification steps, even when tests fail. A scan never
   // consumes instructions or commands from findings.
   try{report.tests=await testFn();}catch{report.tests={code:-1,counts:null};}
   try{report.after=compact(await scanFn({dataDir,lease}));}catch{report.after={status:'failed'};}
   const remaining=await permissionPlan(dataDir);
   if(report.tests.code!==0||!report.tests.counts||report.tests.counts.failed!==0||report.after.status!=='complete'||remaining.length)throw new Error('Mandatory verification failed');
   report.status=applied.length?'verified':'no-supported-fix';
  }catch(e){
   report.status='failed';report.failure=['Baseline scan degraded; remediation blocked','Mandatory verification failed','Remediation edit budget exceeded','Artifact inventory budget exceeded'].includes(e.message)?e.message:'Bounded remediation stopped; private operator review required';
   report.rollback=await rollbackPermissions(dataDir,applied,store);
   if(applied.length)try{report.rollbackScan=compact(await scanFn({dataDir,lease}));}catch{report.rollbackScan={status:'failed'};}
  }
  report.applied=applied.map(i=>({path:i.path,beforeMode:i.mode,afterMode:i.target}));
  report.finishedAt=new Date().toISOString();await persist();return report;
 });}finally{process.umask(oldMask);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 if(process.argv.length!==2)throw new Error('No flags supported; allowlist and attempt cap are fixed');
 const r=await remediate();console.log(JSON.stringify({id:r.id,status:r.status,before:r.before,after:r.after,edits:r.edits.length,approvalRequired:r.approvalRequired.length,rollback:r.rollback}));if(r.status==='failed')process.exitCode=2;
}
