import test from 'node:test';import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openArtifacts} from '../src/artifacts.mjs';
import {repairParsing} from '../src/sast.mjs';import {command,DATA,ROOT,scan} from '../src/scan.mjs';import {remediate} from '../src/remediate.mjs';
async function fixture(t){const root=await fs.mkdtemp(join(tmpdir(),'security-hold-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('real scanner: metadata cannot synthesize suppression; distinct same-line matches survive the merge',async t=>{
 const root=await fixture(t),tool=join(DATA,'tools/opengrep');await fs.mkdir(join(root,'game'));await fs.mkdir(join(root,'security-dashboard'));await fs.cp(join(ROOT,'security-dashboard/rules'),join(root,'security-dashboard/rules'),{recursive:true});
 const source='eval(before);const label="é😀";import x from "x" with {type:"json", note:"nosemgrep"};const z=flag?.1:.2;eval(input);eval(other);';await fs.writeFile(join(root,'game/probe.mjs'),source);await fs.writeFile(join(root,'game/plain.mjs'),'eval(a);eval(b);\n'+Array.from({length:55},(_,i)=>'eval(v'+i+');').join('\n'));
 const first=await command(tool,['scan','--config',join(root,'security-dashboard/rules'),'--json','--disable-version-check','game'],{cwd:root});assert.equal(first.code,0);const original=JSON.parse(first.stdout);assert.ok(original.errors.length);
 const result=await repairParsing(original,{root,runDir:root,tool,execute:command});
 assert.ok(result.errors.length||result.results.some(f=>f.path==='game/probe.mjs'&&f.check_id.endsWith('eval-detected')),'metadata must detect eval or remain degraded');
 const probe=result.results.filter(f=>f.path==='game/probe.mjs'&&f.check_id.endsWith('eval-detected'));assert.equal(probe.length,3);for(const text of ['eval(before)','eval(input)','eval(other)']){const offset=Buffer.from(source).indexOf(text);assert.ok(probe.some(f=>f.start.offset===offset&&f.start.col===offset+1&&f.end.offset===offset+Buffer.byteLength(text)),'original UTF-8 span '+text);}
 const spans=report=>report.results.filter(f=>f.path==='game/plain.mjs'&&f.check_id.endsWith('eval-detected')).map(f=>[f.start.offset,f.end.offset]);assert.equal(spans(original).length,57);assert.equal(spans(result).length,57,'all unaffected occurrences including same-line matches retained');assert.deepEqual(spans(result),spans(original));
});
test('preflight rejects journal and run symlinks before any journal, chmod or scan',async t=>{
 for(const name of ['remediations','runs']){
  const root=await fixture(t),dataDir=join(root,'data'),outside=join(root,'outside');await fs.mkdir(dataDir);await fs.mkdir(outside);await fs.symlink(outside,join(dataDir,name));let scans=0;
  let rejected=false;try{await remediate({dataDir,scanFn:async()=>{scans++;return {run:{status:'degraded'}};}});}catch{rejected=true;}
  assert.equal(scans,0,name+' rejected before scanner');assert.equal(rejected,true);assert.deepEqual(await fs.readdir(outside),[],'no journal outside artifact root');assert.deepEqual((await fs.readdir(dataDir)).sort(),[name]);
 }
});

test('journal/run directory swaps and root ancestor swaps fail closed without following replacement links',async t=>{
 for(const name of ['remediations','runs']){
  const root=await fixture(t),data=join(root,'data'),outside=join(root,'outside');await fs.mkdir(data);await fs.mkdir(outside);const store=await openArtifacts(data);t.after(()=>store.close());await store.directory(name,{create:true});
  await fs.rename(join(data,name),join(data,name+'-owned'));await fs.symlink(outside,join(data,name));
  await assert.rejects(store.atomic(name+'/probe.json',{private:'no escape'}));await assert.rejects(store.directory(name+'/new',{create:true}));assert.deepEqual(await fs.readdir(outside),[]);
 }
 const root=await fixture(t),parent=join(root,'parent'),outside=join(root,'outside');await fs.mkdir(parent);await fs.mkdir(outside);const data=join(parent,'data');await fs.mkdir(data);const store=await openArtifacts(data);t.after(()=>store.close());
 await fs.rename(parent,join(root,'parent-owned'));await fs.symlink(outside,parent);await assert.rejects(store.atomic('state.json',{}));assert.deepEqual(await fs.readdir(outside),[]);
});
test('a swap immediately before temp open cannot redirect the anchored journal write outside',async t=>{
 const root=await fixture(t),data=join(root,'data'),outside=join(root,'outside');await fs.mkdir(data);await fs.mkdir(outside);const store=await openArtifacts(data);t.after(()=>store.close());await store.directory('remediations',{create:true});
 const open=fs.open;let swapped=false;
 fs.open=async function(path,...args){if(!swapped&&String(path).endsWith('.tmp')){swapped=true;await fs.rename(join(data,'remediations'),join(data,'remediations-owned'));await fs.symlink(outside,join(data,'remediations'));}return open.call(this,path,...args);};
 try{await assert.rejects(store.atomic('remediations/probe.json',{private:'anchored'}));}finally{fs.open=open;}
 assert.equal(swapped,true);assert.deepEqual(await fs.readdir(outside),[]);
});

test('scan-only rejects a symlinked historical run before even changing root permissions',async t=>{
 const root=await fixture(t),data=join(root,'data'),outside=join(root,'outside');await fs.mkdir(data);await fs.mkdir(outside);await fs.mkdir(join(data,'runs'));await fs.symlink(outside,join(data,'runs','00000000-0000-4000-8000-000000000001'));await fs.chmod(data,0o777);
 await assert.rejects(scan({dataDir:data}));assert.equal((await fs.stat(data)).mode&0o777,0o777);assert.deepEqual(await fs.readdir(outside),[]);assert.deepEqual(await fs.readdir(data),['runs']);
});
test('child report destinations stay on the held file descriptor when a directory is swapped',async t=>{
 const root=await fixture(t),data=join(root,'data'),outside=join(root,'outside');await fs.mkdir(data);await fs.mkdir(outside);const store=await openArtifacts(data);t.after(()=>store.close());await store.directory('runs/probe',{create:true});
 const report=await store.report('runs/probe/report.json');await fs.rename(join(data,'runs','probe'),join(data,'runs','probe-owned'));await fs.symlink(outside,join(data,'runs','probe'));
 const child=await command(process.execPath,['-e','require("node:fs").writeFileSync(process.argv[1],"fixture report")',report]);assert.equal(child.code,0);assert.equal(await fs.readFile(join(data,'runs','probe-owned','report.json'),'utf8'),'fixture report');assert.deepEqual(await fs.readdir(outside),[]);await assert.rejects(store.read('runs/probe/report.json'));
});

test('real Gitleaks traverses the anchored directory and detects a synthetic positive control',async t=>{
 const root=await fixture(t),store=await openArtifacts(root);t.after(()=>store.close());const source=await store.scanDirectory('source',{create:true});
 const synthetic=['AK','IA','ABCDEFGHIJKLMNOP'].join('');await store.write('source/probe.js','const credential="'+synthetic+'";');const report=await store.report('report.json');
 const run=await command(join(DATA,'tools/gitleaks'),['dir',source,'--redact=100','--no-banner','--no-color','--report-format','json','--report-path',report,'--exit-code','1']);
 const findings=JSON.parse(await store.read('report.json'));assert.equal(run.code,1);assert.ok(findings.some(f=>f.RuleID==='aws-access-token'),'must actually traverse staged source, not silently accept a bare /proc fd symlink root');assert.ok(!JSON.stringify(findings).includes(synthetic),'candidate values remain redacted');
});
