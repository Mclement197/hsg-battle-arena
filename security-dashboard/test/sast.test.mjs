import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {compatibleSource} from '../src/sast-compat.mjs';
import {repairParsing,errorDetails} from '../src/sast.mjs';
import {command,DATA,ROOT} from '../src/scan.mjs';
test('compatibility changes tokens, not strings/comments/templates/optional chaining; executable AST and lines match',()=>{
 const source='import x from "x" with {type:"json"};\nconst v=a?.10:.2; const s="a?.10"; const t=`a?.10`; const n=a?.b; // a?.10\neval(input);';
 const r=compatibleSource(source);assert.equal(r.proof.importAttributes,1);assert.equal(r.proof.decimalTernaries,1);assert.equal(r.proof.executableAstEquivalent,true);assert.equal(r.source.split('\n').length,source.split('\n').length);assert.match(r.source,/a\? \.10/);assert.ok(r.source.includes('"a?.10"'));assert.ok(r.source.includes('a?.b'));assert.ok(r.source.includes('with {type:"json"}'));assert.throws(()=>compatibleSource('const broken = ;'));
});
test('unknown syntax and global errors are not converted into clean scans',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'security-parser-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(join(root,'game'));
 const path='game/probe.mjs';await fs.writeFile(join(root,path),'const x=a?.10:.2;');
 const report={results:[],errors:[{type:['PartialParsing',[]],path}],paths:{scanned:[path]}};
 for(const execute of [async()=>({code:2}),async()=>({code:0,stdout:JSON.stringify({results:[],errors:[{type:'Timeout'}],paths:{scanned:[join(root,'sast-compat',path)]}})}),async()=>({code:0,stdout:JSON.stringify({results:[],errors:[],paths:{scanned:[]}})})]){
  const r=await repairParsing(report,{root,runDir:root,tool:'unused',execute});assert.equal(r.errors.length,1);assert.equal(r.compatibility[0].verified,false);
 }
 await fs.writeFile(join(root,path),'const x=;');let called=false;const r=await repairParsing(report,{root,runDir:root,tool:'unused',execute:async()=>{called=true;}});assert.equal(called,false);assert.equal(r.errors.length,1);
 assert.deepEqual(errorDetails([{type:['PartialParsing',[]],path,spans:[{start:{line:4}}]}]),[{type:'PartialParsing',file:path,line:4}]);
});
test('real Opengrep retains findings before and after unsupported ESM syntax with all ten unchanged rules',async t=>{
 const tool=join(DATA,'tools/opengrep');try{await fs.access(tool);}catch{t.skip('Opengrep not installed');return;}
 const root=await fs.mkdtemp(join(tmpdir(),'security-parser-real-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(join(root,'game'));await fs.mkdir(join(root,'security-dashboard'));await fs.cp(join(ROOT,'security-dashboard/rules'),join(root,'security-dashboard/rules'),{recursive:true});
 const path='game/probe.mjs',source='eval(before);\nimport data from "data.json" with {type:"json"};\nconst result=flag?.10:.20;\neval(after);\nnode.innerHTML = untrusted;\n';await fs.writeFile(join(root,path),source);
 const result=await command(tool,['scan','--config',join(root,'security-dashboard/rules'),'--json','--disable-version-check',path],{cwd:root,timeout:30000});assert.equal(result.code,0);const original=JSON.parse(result.stdout);assert.ok(original.errors.length>0,'red-capable real parser reproduction');
 const repaired=await repairParsing(original,{root,runDir:root,tool,execute:command});assert.equal(repaired.errors.length,0);assert.equal(repaired.compatibility[0].verified,true);
 for(const line of [1,4])assert.ok(repaired.results.some(f=>f.check_id.endsWith('eval-detected')&&f.start.line===line),'eval retained at line '+line);
 assert.ok(repaired.results.some(f=>f.check_id.endsWith('insecure-innerhtml')&&f.start.line===5));assert.equal(await fs.readFile(join(root,path),'utf8'),source);assert.equal((await fs.readdir(join(root,'security-dashboard/rules'))).filter(f=>f.endsWith('.yaml')).length,10);
});
