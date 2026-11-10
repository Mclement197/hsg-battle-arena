import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID,createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join,relative,resolve,dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { reconcile,publicSnapshot,SEVERITIES } from './model.mjs';
import {repairParsing,errorDetails as describeErrors} from './sast.mjs';
import {loadScheduling} from './scheduling.mjs';
import {openArtifacts} from './artifacts.mjs';
const execFile=promisify(execFileCallback);
const leases=new WeakMap();
export async function withScanLock(dataDir,task) {
 const release=await acquireLock(dataDir),lease={};leases.set(lease,{dataDir,store:release.store});
 try{return await task(lease,release.store);}finally{leases.delete(lease);await release();}
}
export const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const DATA=join(homedir(),'.local/share/afp-security');
const apps={game:'game',usage:'usage-dashboard',architecture:'architecture-dashboard',security:'security-dashboard'};
const iso=()=>new Date().toISOString();
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function command(file,args,{cwd=ROOT,timeout=45000}={}) {
 const env={HOME:homedir(),PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C.UTF-8',NO_COLOR:'1',GOMAXPROCS:'2',GOMEMLIMIT:'256MiB',npm_config_ignore_scripts:'true',npm_config_audit:'false'};
 for(const key of ['XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS'])if(process.env[key])env[key]=process.env[key];
 try { const r=await execFile(file,args,{cwd,timeout,maxBuffer:8*1024*1024,env,killSignal:'SIGKILL'});return {code:0,stdout:r.stdout}; }
 catch(e) {return {code:typeof e.code==='number'?e.code:-1,stdout:e.stdout||'',failed:!!e.killed||typeof e.code!=='number'};}
}
export async function atomic(path,value) {
 const store=await openArtifacts(dirname(path));try{await store.preflight();await store.atomic(path.slice(dirname(path).length+1),value);}finally{await store.close();}
}
export async function acquireLock(dir=DATA) {
 const store=await openArtifacts(dir);
 try {
  await store.preflight();await store.chmod('.',0o700);
  const {path}=await store.location('scan.lock');const lock=await fs.open(path,'wx',0o600);
  await lock.writeFile(JSON.stringify({pid:process.pid,at:iso()}));const identity=await lock.stat();await lock.close();let released=false;
  const release=async()=>{if(released)return;try{await store.assertDirectory();const current=await fs.lstat(path);if(current.dev!==identity.dev||current.ino!==identity.ino)throw new Error('Lock identity changed; operator review required');await fs.unlink(path);released=true;}finally{await store.close();}};release.store=store;return release;
 }catch(e){await store.close();if(e.code==='EEXIST')throw new Error('Scan already running or stale lock; operator must verify no running process before removing lock.');throw e;}
}
export function parseCoverage(lcov) {
 const totals={LF:0,LH:0,BRF:0,BRH:0,FNF:0,FNH:0};let selected=false;
 for(const line of lcov.split('\n')) {
  if(line.startsWith('SF:')) selected=/security-dashboard\/src\//.test(line);
  if(!selected)continue;
  const m=/^(LF|LH|BRF|BRH|FNF|FNH):(\d+)$/.exec(line);if(m)totals[m[1]]+=Number(m[2]);
 }
 const p=(n,d)=>d?Math.round(10000*n/d)/100:null;
 return {lines:p(totals.LH,totals.LF),branches:p(totals.BRH,totals.BRF),functions:p(totals.FNH,totals.FNF),statements:null,totals};
}
export function parseTests(tap) {
 const get=name=>Number(tap.split('\n').find(line=>line.startsWith('# '+name+' '))?.slice(('# '+name+' ').length)??NaN);
 const passed=get('pass'),failed=get('fail'),skipped=get('skipped');
 if(!Number.isFinite(passed)||!Number.isFinite(failed)||!Number.isFinite(skipped))return null;
 return {passed,failed,skipped,passPercent:passed+failed?Math.round(10000*passed/(passed+failed))/100:null};
}
export function npmFindings(data,component) {
 if(data.auditReportVersion!==2||!data.vulnerabilities||data.error)throw new Error('Invalid audit response');
 const findings=[];
 for(const [name,v] of Object.entries(data.vulnerabilities)) {
  for(const a of (v.via||[]).filter(x=>typeof x==='object'&&x!==null)) findings.push({source:'dependencies:'+component,kind:'dependency',component,key:String(a.source)+':'+name,severity:SEVERITIES.includes(a.severity)?a.severity:'medium',confidence:'high',evidence:{package:name,advisory:a.source,range:a.range,fixAvailable:!!v.fixAvailable},cvss:typeof a.cvss?.score==='number'?a.cvss.score:null,cwe:Array.isArray(a.cwe)?a.cwe:[]});
 }
 return findings;
}
export async function scan(options={}) {
 const previousMask=process.umask(0o077);
 try { return await runScan(options); } finally { process.umask(previousMask); }
}
async function runScan({dataDir=DATA,mode='full',lease}={}) {
 if(mode!=='full')throw new Error('Only bounded full scans are implemented');
 if(lease && leases.get(lease)?.dataDir!==dataDir)throw new Error('Invalid scan lease');
 const unlock=lease?async()=>{}:await acquireLock(dataDir);
 const store=lease?leases.get(lease).store:unlock.store;
 const run={id:randomUUID(),startedAt:iso(),mode,scans:[],findings:[],metrics:{}};
 const prefix='runs/'+run.id;let runDir;
 const artifact=name=>prefix+'/'+name;
 const observe=async(id,category,fn)=>{
  const start=Date.now();let status='ok',findings=[];
  try {const result=await fn();status=result.status||'ok';findings=result.findings||[];}
  catch {status='failed';}
  run.findings.push(...findings);
  run.scans.push({id,category,status,durationMs:Date.now()-start,findingCount:status==='ok'?findings.length:null,completedAt:iso()});
  if(status!=='ok')run.findings.push({source:'monitoring',kind:'monitoring',component:'monitoring',key:id,severity:'medium',confidence:'high',evidence:{scanner:id,status}});
 };
 try {
  await store.preflight();await store.directory('runs',{create:true});await store.chmod('runs',0o700);runDir=await store.directory(prefix,{create:true});
  const rev=await command('git',['rev-parse','HEAD']);run.commit=rev.stdout.trim();
  const branch=await command('git',['branch','--show-current']);run.branch=branch.code===0?branch.stdout.trim():null;
  const dirty=await command('git',['status','--porcelain']);run.dirty=dirty.code===0?dirty.stdout.length>0:null;
  for(const [component,path] of Object.entries(apps)) await observe('dependencies:'+component,'dependencies',async()=>{
   const r=await command('npm',['audit','--json','--package-lock-only','--ignore-scripts','--no-fund','--no-progress'],{cwd:join(ROOT,path),timeout:45000});
   if(r.failed||![0,1].includes(r.code))throw new Error('Audit unavailable');
   return {findings:npmFindings(JSON.parse(r.stdout),component)};
  });
  await observe('secrets','secrets',async()=>{
   const tool=join(DATA,'tools/gitleaks');try{await fs.access(tool);}catch{return{status:'unavailable'};}
   // Positive traversal control: a bare descriptor symlink can look like an
   // empty directory to walkers. Verify the same anchored directory/report
   // protocol against a synthetic token before accepting a clean real scan.
   const probe=await store.scanDirectory(artifact('scanner-probe'),{create:true});
   const synthetic=['AK','IA','ABCDEFGHIJKLMNOP'].join('');
   try {
    await store.write(artifact('scanner-probe/probe.js'),'const credential="'+synthetic+'";');
    const report=await store.report(artifact('probe-report.json'));
    const checked=await command(tool,['dir',probe,'--redact=100','--no-banner','--no-color','--report-format','json','--report-path',report,'--exit-code','1'],{timeout:10000});
    const found=JSON.parse(await store.read(artifact('probe-report.json')));
    if(checked.code!==1||!Array.isArray(found)||!found.some(f=>f.RuleID==='aws-access-token')||JSON.stringify(found).includes(synthetic))throw new Error('Secret scanner traversal control failed');
   } finally {await store.remove(artifact('scanner-probe'),{recursive:true});await store.remove(artifact('probe-report.json'));}
   const staging=await store.scanDirectory(artifact('source'),{create:true});
   const files=await command('git',['ls-files','-z','--cached','--others','--exclude-standard','--',...Object.values(apps)]);
   if(files.code!==0)throw new Error('File inventory failed');
   const manifest=[];let bytes=0;
   for(const file of files.stdout.split('\0').filter(Boolean)) {
    if(!/\.(?:m?js|cjs|json|md|ya?ml|toml|html|css|ts|tsx|env|txt)$/.test(file) || /(?:^|\/)(?:node_modules|evidence|graft|art|vendor|assets)(?:\/|$)/.test(file))continue;
    const source=resolve(ROOT,file);if(!source.startsWith(ROOT))throw new Error('Escaped file');
    const st=await fs.lstat(source).catch(()=>null);if(!st||!st.isFile()||st.isSymbolicLink()||st.size>1024*1024)continue;
    bytes+=st.size;if(bytes>32*1024*1024||manifest.length>=3000)throw new Error('Source budget exceeded');
    await store.directory(artifact('source/'+dirname(file)),{create:true});await store.write(artifact('source/'+file),await fs.readFile(source));manifest.push(file);
   }
   run.secretScope={files:manifest.length,bytes,traversalControl:'verified synthetic positive control',exclusions:'binary and >1MiB files, dependency/vendor/assets/art/evidence/graft directories, Git history and ignored files'};
   const secretReport=await store.report(artifact('gitleaks-redacted.json'));
   const r=await command(tool,['dir',staging,'--redact=100','--no-banner','--no-color','--max-target-megabytes','1','--report-format','json','--report-path',secretReport,'--exit-code','1'],{timeout:90000});
   // The temporary working copy is local and private; delete it as soon as the scanner settles.
   await store.remove(artifact('source'),{recursive:true});
   if(r.failed||![0,1].includes(r.code))throw new Error('Secret scan failed');
   const raw=JSON.parse(await store.read(artifact('gitleaks-redacted.json')));
   const findings=raw.map(f=>({source:'secrets',kind:'secret',component:Object.entries(apps).find(([,v])=>relative(staging,f.File).startsWith(v+'/'))?.[0]||'security',key:hash(JSON.stringify([relative(staging,f.File),f.RuleID,f.Fingerprint?.split(':').slice(-1)[0]])),severity:'high',confidence:'medium',evidence:{file:relative(staging,f.File),rule:f.RuleID,line:f.StartLine,redacted:true}}));
   // Never retain matches, lines of source or candidate secret values, even in private reports.
   await store.atomic(artifact('gitleaks-redacted.json'),findings);return {findings};
  });
  await observe('sast','sast',async()=>{
   const tool=join(DATA,'tools/opengrep');try{await fs.access(tool);}catch{return{status:'unavailable'};}
   const r=await command('/usr/bin/timeout',['--kill-after=5s','100s',tool,'scan','--config',join(ROOT,'security-dashboard/rules'),'--json','--disable-nosem','--disable-version-check','--jobs','2','--timeout','5','--max-memory','256','--max-target-bytes','1000000','--exclude','**/evidence/**','--exclude','**/assets/**','--exclude','**/vendor/**','--exclude','**/art/**','--exclude','**/graft/**',...Object.values(apps)],{timeout:110000});
   if(r.code!==0||r.failed)throw new Error('Static analysis failed');
   let report=JSON.parse(r.stdout);if(!Array.isArray(report.results)||!Array.isArray(report.errors))throw new Error('Invalid static report');
   report=await repairParsing(report,{root:ROOT,runDir,tool,execute:command,store,prefix});
   const findings=report.results.map(f=>({source:'sast',kind:'sast',component:Object.entries(apps).find(([,path])=>f.path.startsWith(path+'/'))?.[0]||'security',key:hash(JSON.stringify([f.path,f.check_id,f.start?.offset,f.end?.offset,f.start?.line,f.start?.col,f.end?.line,f.end?.col])),severity:f.extra?.severity==='ERROR'?'high':f.extra?.severity==='WARNING'?'medium':'low',confidence:['HIGH','MEDIUM','LOW'].includes(f.extra?.metadata?.confidence)?f.extra.metadata.confidence.toLowerCase():'medium',evidence:{file:f.path,line:f.start?.line,rule:f.check_id},cwe:(Array.isArray(f.extra?.metadata?.cwe)?f.extra.metadata.cwe:[]).map(v=>/^CWE-[0-9]+/.exec(v)?.[0]).filter(Boolean)}));
   const errorDetails=describeErrors(report.errors);
   await store.atomic(artifact('sast.json'),{version:'opengrep 1.33.0',rules:10,findings,errorCount:report.errors.length,errorDetails,initialErrors:report.initialErrors,compatibility:report.compatibility,files:report.paths?.scanned?.length??null});
   run.sastScope={tool:'opengrep 1.33.0',rules:10,files:report.paths?.scanned?.length??null,errors:report.errors.length,errorDetails,initialErrors:report.initialErrors,compatibility:report.compatibility};
   return {status:report.errors.length?'failed':'ok',findings};
  });
  await observe('configuration','configuration',async()=>{
   const findings=[];
   const audit=await command('openclaw',['security','audit','--json'],{timeout:60000});
   let valid=false;
   try {const report=JSON.parse(audit.stdout);if(!Array.isArray(report.findings))throw new Error();valid=!audit.failed;
    for(const f of report.findings)findings.push({source:'configuration',kind:'configuration',component:'runtime',key:'openclaw:'+f.checkId,severity:f.severity==='critical'?'critical':f.severity==='warn'?'medium':f.severity==='info'?'info':'low',confidence:'high',evidence:{checkId:f.checkId,source:'openclaw security audit',detail:'Raw details intentionally not retained'}});
   }catch {valid=false;}
   const installed=await command(join(homedir(),'.local/bin/cloudflared'),['--version']);
   const pid=await command('systemctl',['--user','show','cloudflared-afp.service','--property=MainPID','--value']);
   const running=/^[1-9][0-9]*$/.test(pid.stdout.trim())?await command('/proc/'+pid.stdout.trim()+'/exe',['--version']):{code:-1,stdout:''};
   const versions=[installed,running].map(r=>r.code===0?/version (\d+\.\d+\.\d+)/.exec(r.stdout)?.[1]:null);
   if(versions.some(v=>!v))valid=false;
   else {run.connector={installed:versions[0],running:versions[1],vendorMinimum:'2026.10.2'};
    if(versions[0]!==versions[1]||versions.some(v=>v.split('.').map(Number).reduce((n,x)=>n*1000+x,0)<(2026*1000000+10*1000+2)))findings.push({source:'configuration',kind:'configuration',component:'runtime',key:'connector-patch-state',severity:'high',confidence:'high',evidence:{...run.connector}});
   }
   return {status:valid?'ok':'failed',findings};
  });
  const coveragePath=await store.report(artifact('coverage.lcov'));
  await observe('tests','tests',async()=>{
   const tests=(await fs.readdir(join(ROOT,'security-dashboard/test'))).filter(x=>x.endsWith('.test.mjs')).map(x=>'security-dashboard/test/'+x);
   const r=await command(process.execPath,['--test','--experimental-test-coverage','--test-reporter=tap','--test-reporter-destination=stdout','--test-reporter=lcov','--test-reporter-destination='+coveragePath,...tests],{timeout:60000});
   run.metrics.tests=parseTests(r.stdout);await store.write(artifact('tests.tap'),r.stdout);
   return {status:r.code===0&&run.metrics.tests?'ok':'failed'};
  });
  await observe('coverage','coverage',async()=>{
   run.metrics.coverage=parseCoverage(await store.read(artifact('coverage.lcov')));
   return {status:run.metrics.coverage.lines!==null?'ok':'failed'};
  });
  // Monitoring is complete as an inventory even when individual scanners failed. It resolves only recovered gaps.
  run.scans.push({id:'monitoring',category:'monitoring',status:'ok',findingCount:run.findings.filter(f=>f.source==='monitoring').length,completedAt:iso()});
  run.finishedAt=iso();
  let previous;try{previous=JSON.parse(await store.read('state.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const result=reconcile(previous,run);
  if(!previous){
   const history={source:'history',kind:'history',component:'runtime',key:'connector-emudhra-2026-10',severity:'high',confidence:'high',evidence:{document:'Reviewed private remediation record',installed:'2026.10.4',running:'2026.10.4',verifiedAt:'2026-10-27T10:15:25Z'}};
   const seed=reconcile({incidents:[],runs:[]},{id:randomUUID(),finishedAt:'2026-10-27T10:15:25Z',findings:[history],scans:[]}).state.incidents[0];
   Object.assign(seed,{status:'resolved',resolvedAt:'2026-10-27T10:15:25Z'});seed.history.push({event:'resolved',at:seed.resolvedAt,runId:seed.lastRunId});result.state.incidents.push(seed);
  }
  await store.atomic(artifact('run.json'),{run,observations:result.observations,events:result.events});
  await store.append('observations.ndjson',result.observations.map(x=>JSON.stringify(x)+'\n').join(''));
  await store.append('events.ndjson',result.events.map(x=>JSON.stringify(x)+'\n').join(''));
  await store.atomic('state.json',result.state);
  const summary=publicSnapshot(result.state,Date.now(),await loadScheduling(dataDir));await store.atomic('public.json',summary);
  return summary;
 }finally{
  await store.remove(artifact('source'),{recursive:true}).catch(()=>{});
  try {
   for(const name of ['coverage.lcov','tests.tap','gitleaks-redacted.json','sast.json','run.json'])await store.chmod(artifact(name),0o600).catch(e=>{if(e.code!=='ENOENT')throw e;});
  } finally { await unlock(); }
 }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 if(process.argv.slice(2).length)throw new Error('No scan flags are supported; the runner performs a bounded full scan');
 const mode='full';
 const summary=await scan({mode});
 console.log(JSON.stringify({runId:summary.run.id,status:summary.run.status,score:summary.score.value,confidence:summary.score.confidence,incidents:summary.counts,scans:summary.scans,scheduling:summary.scheduling.status}));
 // Missing scanners are honest degraded results; the unattended agent must report AUTOMATION_FAILED.
 if(summary.run.status!=='complete')process.exitCode=2;
}
