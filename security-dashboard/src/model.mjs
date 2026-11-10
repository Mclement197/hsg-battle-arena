import { createHash } from 'node:crypto';
import {schedulingSnapshot} from './scheduling.mjs';
export const COMPONENTS = ['game','usage','architecture','security','runtime','monitoring'];
export const SEVERITIES = ['critical','high','medium','low','info'];
export const SCANNER_MANIFEST = {version:'1.0.0',sources:[
 ...['game','usage','architecture','security'].map(component=>({id:'dependencies:'+component,category:'dependencies'})),
 ...['secrets','sast','configuration','tests','coverage','monitoring'].map(id=>({id,category:id})),
]};
export const TITLES = {
 sast:'Potential code security issue', dependency:'Known dependency advisory', secret:'Potential secret detected (value withheld)',
 configuration:'Runtime configuration finding', monitoring:'Security monitoring degraded',
 history:'Connector certificate-trust remediation',
};
export const REMEDIATIONS = {
 sast:'Review the matched maintained rule and private source evidence; verify exploitability before an authorized fix.',
 dependency:'Review the private advisory evidence and update the affected dependency after compatibility tests.',
 secret:'Review privately; revoke and replace confirmed credentials. Never copy candidate values into a report.',
 configuration:'Review the failed local check and apply only an explicitly authorized, verified remediation.',
 monitoring:'Restore the unavailable scanner or execution capability; a failed scan is not a clean scan.',
 history:'Verified installed and running connector upgrade; historical remediation, not current fleet assurance.',
};
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function fingerprint(f) { return digest([f.source,f.kind,f.component,f.key]); }
export function reconcile(previous, run) {
 const state = structuredClone(previous || {incidents:[], runs:[]});
 if(state.runs.some(r=>r.id===run.id))return {state,observations:[],events:[],duplicate:true};
 // One observation per run/fingerprint; highest severity wins conflicts, first payload wins ties.
 const findings=new Map();
 const rank=severity=>SEVERITIES.includes(severity)?SEVERITIES.indexOf(severity):SEVERITIES.length;
 for(const f of run.findings){
  const id=fingerprint(f),prior=findings.get(id);
  if(!prior||rank(f.severity)<rank(prior.severity))findings.set(id,f);
 }
 run={...run,findings:[...findings.values()]};
 const observations = [], events = [];
 const complete = new Set(SCANNER_MANIFEST.sources.filter(e=>run.scans.filter(s=>s.id===e.id).length===1&&run.scans.some(s=>s.id===e.id&&s.category===e.category&&s.status==='ok')).map(s=>s.id));
 const observed = new Set();
 for (const f of run.findings) {
  const id = fingerprint(f); observed.add(id);
  let item = state.incidents.find(i=>i.id===id);
  const signature = digest([f.severity,f.confidence,f.evidence]);
  let event = null;
  if (!item) {
   item = {...f,id,firstSeen:run.finishedAt,status:'open',observationCount:0,history:[]};
   state.incidents.push(item); event='new';
  } else if (item.status==='resolved') { item.status='open'; delete item.resolvedAt; event='reopened'; }
  else if (signature!==item.signature) event='changed';
  Object.assign(item,f,{signature,lastSeen:run.finishedAt,lastRunId:run.id,observationCount:item.observationCount+1});
  if (event) { const e={event,at:run.finishedAt,runId:run.id};item.history.push(e);events.push({id,...e}); }
  observations.push({id,at:run.finishedAt,runId:run.id,severity:f.severity,verification:run.scans.find(s=>s.id===f.source)?.status ?? 'degraded'});
 }
 for (const i of state.incidents) {
  // Absence only verifies resolution when the exact same scoped scanner completed.
  if (i.status==='open' && complete.has(i.source) && !observed.has(i.id)) {
   i.status='resolved'; i.resolvedAt=run.finishedAt; i.lastRunId=run.id;
   const e={event:'resolved',at:run.finishedAt,runId:run.id};i.history.push(e);events.push({id:i.id,...e});
  }
 }
 state.runs.push(run);state.latestRun=run; return {state,observations,events};
}
export const RUBRIC = {version:'1.0.0',weights:{sast:25,dependencies:25,secrets:20,configuration:20,coverage:5,tests:5},penalties:{critical:40,high:20,medium:8,low:2,info:0}};
export function score(state, now=Date.now()) {
 const run=state?.latestRun;const hasTime=run && Number.isFinite(Date.parse(run.finishedAt));const age=hasTime ? Math.max(0,now-Date.parse(run.finishedAt)) : Infinity;
 const freshness=age>7*864e5?0:age>48*36e5?0.5:1;
 let total=0,known=0;const dimensions={};
 for (const [kind,weight] of Object.entries(RUBRIC.weights)) {
  const expected=SCANNER_MANIFEST.sources.filter(s=>s.category===kind);
  const scans=Array.isArray(run?.scans)?run.scans.filter(s=>s?.category===kind):[];
  const available=scans.length===expected.length && expected.every(e=>scans.some(s=>s.id===e.id&&s.status==='ok'));
  let value=null;
  if (available) {
   if (kind==='coverage') value=run.metrics?.coverage?.lines ?? null;
   else if (kind==='tests') value=run.metrics?.tests?.passPercent ?? null;
   else value=Math.max(0,100-state.incidents.filter(i=>i.status!=='resolved' && scans.some(s=>s.id===i.source)).reduce((n,i)=>n+(RUBRIC.penalties[i.severity]??0),0));
  }
  if (Number.isFinite(value) && value>=0 && value<=100) { known+=weight;total+=weight*value/100; } else value=null;
  dimensions[kind]={weight,value,contribution:value===null?0:Math.round(weight*value)/100};
 }
 return {value:Math.round(total*freshness),confidence:known,freshness:!hasTime?'unknown':age>7*864e5?'expired':age>48*36e5?'stale':'fresh',ageHours:Number.isFinite(age)?Math.round(age/36e5):null,dimensions,rubric:RUBRIC};
}
const iso = v => typeof v==='string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const num = v => typeof v==='number' && Number.isFinite(v) && v>=0 ? v : null;
const pct = v => num(v)!==null && v<=100 ? v : null;
const opaque = v => typeof v==='string' && /^[a-f0-9-]{16,64}$/.test(v) ? v : null;
const safeKind = v => Object.hasOwn(TITLES,v) ? v : 'monitoring';
const safeSource = v => /^(dependencies:(game|usage|architecture|security)|secrets|sast|configuration|coverage|tests|monitoring|history)$/.test(v || '') ? v : 'monitoring';
// Public contract: no raw title, evidence, commands, filenames, labels or arbitrary nested objects.
export function publicSnapshot(state, now=Date.now(), schedulerMetadata=null) {
 if(!state||!Array.isArray(state.incidents))throw new Error('Invalid security state');
 const run=state.latestRun;
 if(run){
  if(!Array.isArray(run.scans))throw new Error('Invalid scanner inventory');
  const seen=new Set();
  for(const s of run.scans){
   if(!s||seen.has(s.id)||!SCANNER_MANIFEST.sources.some(e=>e.id===s.id&&e.category===s.category)||!['ok','failed','unavailable'].includes(s.status))throw new Error('Invalid scanner record');
   seen.add(s.id);
  }
  if(!Array.isArray(run.findings)||!opaque(run.id)||!iso(run.finishedAt))throw new Error('Invalid security run');
 }
 const incidents=(state?.incidents||[]).map(i=>{
  const kind=safeKind(i.kind);return {
   id:opaque(i.id),kind,title:TITLES[kind],remediation:REMEDIATIONS[kind],
   severity:SEVERITIES.includes(i.severity)?i.severity:'info',status:['open','resolved','accepted-risk'].includes(i.status)?i.status:'open',
   confidence:['high','medium','low'].includes(i.confidence)?i.confidence:'low',
   component:COMPONENTS.includes(i.component)?i.component:'monitoring',source:safeSource(i.source),
   firstSeen:iso(i.firstSeen),lastSeen:iso(i.lastSeen),resolvedAt:iso(i.resolvedAt),lastRunId:opaque(i.lastRunId),observationCount:num(i.observationCount),
   verification:i.kind==='history'?'historical verified remediation':i.status==='resolved'?'absence verified by completed scoped scan':'observed; private evidence restricted',
   cvss: pct(i.cvss)!==null && i.cvss<=10 ? i.cvss : null,
   cwe:Array.isArray(i.cwe)?i.cwe.filter(x=>/^CWE-[0-9]{1,5}$/.test(x)).slice(0,10):[],
   history:(i.history||[]).map(e=>({event:['new','changed','reopened','resolved','accepted-risk'].includes(e.event)?e.event:'changed',at:iso(e.at),runId:opaque(e.runId)})),
  };
 });
 const inventory=run?SCANNER_MANIFEST.sources.map(e=>run.scans.find(s=>s.id===e.id)||{...e,status:'unavailable'}):[];
 const scans=inventory.map(s=>({source:s.id,category:s.category,status:s.status,findingCount:s.status==='ok'?num(s.findingCount):null,durationMs:num(s.durationMs),completedAt:iso(s.completedAt),severityCounts:s.status==='ok'?Object.fromEntries(SEVERITIES.map(v=>[v,run.findings.filter(f=>f.source===s.id&&f.severity===v).length])):null}));
 const coverage=inventory.some(s=>s.id==='coverage'&&s.status==='ok')?run?.metrics?.coverage:null;
 const tests=inventory.some(s=>s.id==='tests'&&s.status==='ok')?run?.metrics?.tests:null;
 const assessment=score(state,now);
 return {schemaVersion:1,generatedAt:new Date(now).toISOString(),scope:{repository:'HSG Battle Arena',components:['game','usage','architecture','security'],runtime:'Local OpenClaw configuration and connector version only',branch:['main','animation/grounded-move-polish'].includes(run?.branch)?run.branch:'local working branch (name restricted)',commit:typeof run?.commit==='string' && /^[a-f0-9]{40}$/.test(run.commit)?run.commit:null,dirty:typeof run?.dirty==='boolean'?run.dirty:null,sourceCoverage:'Four app working directories; excludes Git history, ignored, vendor, assets, art, evidence, generated graph and >1MiB files',testScope:'Security dashboard unit and HTTP tests only; not repository-wide coverage'},
 scheduling:schedulingSnapshot(schedulerMetadata,now),
 run:run?{id:opaque(run.id),startedAt:iso(run.startedAt),finishedAt:iso(run.finishedAt),status:inventory.every(s=>s.status==='ok')&&assessment.confidence===100?'complete':'degraded',mode:['incremental','full'].includes(run.mode)?run.mode:'full'}:null,
 scannerManifest:{version:SCANNER_MANIFEST.version,expectedCount:SCANNER_MANIFEST.sources.length,reportedCount:run?.scans.length??0,completedCount:inventory.filter(s=>s.status==='ok').length,missingCount:run?SCANNER_MANIFEST.sources.length-run.scans.length:SCANNER_MANIFEST.sources.length,sources:SCANNER_MANIFEST.sources.map(s=>({source:s.id,category:s.category}))},
 score:assessment,metrics:{sast:{ruleCount:10,scannedFiles:num(run?.sastScope?.files),parseOrScanErrors:num(run?.sastScope?.errors),initialParseErrors:Array.isArray(run?.sastScope?.initialErrors)?run.sastScope.initialErrors.length:null,compatibilityRepairedFiles:Array.isArray(run?.sastScope?.compatibility)?run.sastScope.compatibility.filter(c=>c.verified===true).length:null},secrets:{scannedFiles:num(run?.secretScope?.files),scannedBytes:num(run?.secretScope?.bytes)},connector:run?.connector?{installed:/^\d{4}\.\d{1,2}\.\d+$/.test(run.connector.installed)?run.connector.installed:null,running:/^\d{4}\.\d{1,2}\.\d+$/.test(run.connector.running)?run.connector.running:null,vendorMinimum:'2026.10.2',source:'Reviewed vendor minimum for the October 2026 certificate-trust incident; not a live advisory feed'}:null,dependencies:{knownCVEs:null,source:'npm advisory feed; CVE identifiers are not supplied consistently, so CVE-specific total is N/A'},coverage:coverage?{lines:pct(coverage.lines),branches:pct(coverage.branches),functions:pct(coverage.functions),statements:null,source:'Node.js V8 test coverage / LCOV; security-dashboard/src ONLY'}:null,tests:tests?{passed:num(tests.passed),failed:num(tests.failed),skipped:num(tests.skipped),passPercent:pct(tests.passPercent)}:null},scans,incidents,
 counts:Object.fromEntries(SEVERITIES.map(s=>[s,incidents.filter(i=>i.severity===s && i.status!=='resolved').length])),
 limits:['Not a certification or exploitation assessment.','Coverage is code quality evidence, not a security guarantee.','Missing or failed scanners contribute zero; confidence is available rubric weight.','SAST uses ten pinned maintained JavaScript rules, not comprehensive vulnerability detection.','Parser compatibility uses AST-verified scanner-only copies; static import attributes remain visible as comments, not runtime import-policy analysis.','Public reports intentionally omit secret values, source text, private paths and exploit details.'],
 };
}
