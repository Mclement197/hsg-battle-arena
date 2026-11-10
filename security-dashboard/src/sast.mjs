import {promises as fs} from 'node:fs';
import {join,resolve,relative,dirname} from 'node:path';
import {compatibleSource} from './sast-compat.mjs';
import {openArtifacts} from './artifacts.mjs';
const errorType=e=>typeof e.type==='string'?e.type:Array.isArray(e.type)?e.type[0]:'unknown';
export const errorDetails=errors=>errors.map(e=>({type:errorType(e),file:typeof e.path==='string'?e.path:null,line:e.start?.line??e.spans?.[0]?.start?.line??null}));
export async function repairParsing(report,{root,runDir,tool,execute,store,prefix=''}) {
 const owned=!store;if(owned)store=await openArtifacts(runDir);
 const initialErrors=errorDetails(report.errors),compatibility=[],maps=new Map();
 const stageRelative=(prefix?prefix+'/':'')+'sast-compat';
 const candidates=[...new Set(report.errors.filter(e=>errorType(e)==='PartialParsing').map(e=>e.path))];
 try {
  if(candidates.length>20)throw new Error('Parser repair budget exceeded');
  for(const path of candidates) {
   if(typeof path!=='string'||!report.paths?.scanned?.includes(path)||! /^(game|usage-dashboard|architecture-dashboard|security-dashboard)\//.test(path))continue;
   const original=resolve(root,path);if(relative(root,original)!==path||! /\.(mjs|cjs|js)$/.test(path)||await fs.realpath(original)!==original)continue;
   const stat=await fs.lstat(original);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1000000)continue;
   let adapted;try{adapted=compatibleSource(await fs.readFile(original,'utf8'));}catch{continue;}
   if(!adapted.proof.importAttributes&&!adapted.proof.decimalTernaries)continue;
   const destination=stageRelative+'/'+path;await store.directory(dirname(destination),{create:true});await store.write(destination,adapted.source);
   const target=(await store.location(destination)).path,item={file:path,mapLocation:adapted.mapLocation,target};maps.set(target,item);maps.set(await fs.realpath(target),item);
   compatibility.push({file:path,...adapted.proof});
  }
  if(!compatibility.length)return {...report,initialErrors,compatibility};
  const targets=[...new Set([...maps.values()].map(v=>v.target))];
  // Project policy: inline suppressions are never honored, in either pass.
  const result=await execute('/usr/bin/timeout',['--kill-after=5s','100s',tool,'scan','--config',join(root,'security-dashboard/rules'),'--json','--disable-nosem','--disable-version-check','--jobs','2','--timeout','5','--max-memory','256','--max-target-bytes','1000000',...targets],{cwd:root,timeout:110000});
  if(result.code!==0||result.failed)return {...report,initialErrors,compatibility:compatibility.map(p=>({...p,verified:false}))};
  const second=JSON.parse(result.stdout);if(!Array.isArray(second.errors)||!Array.isArray(second.results))throw new Error('Invalid compatibility report');
  const mapped=p=>maps.get(p)?.file??null;
  const scanned=new Set((second.paths?.scanned||[]).map(mapped).filter(Boolean));
  const globalError=second.errors.some(e=>!mapped(e.path||''));
  const stable=new Set();for(const c of compatibility)if(compatibleSource(await fs.readFile(join(root,c.file),'utf8')).proof.originalSha256===c.originalSha256)stable.add(c.file);
  const repaired=new Set(compatibility.filter(c=>stable.has(c.file)&&scanned.has(c.file)&&!globalError&&!second.errors.some(e=>mapped(e.path||'')===c.file)).map(c=>c.file));
  const normalizedResults=second.results.map(f=>{const mapping=maps.get(f.path);if(!mapping)throw new Error('Unknown normalized finding path');return {...f,path:mapping.file,start:mapping.mapLocation(f.start),end:mapping.mapLocation(f.end)};});
  const seen=new Set(),results=[...report.results,...normalizedResults].filter(f=>{
   // No line-level collapsing: distinct occurrences remain distinct, including
   // unaffected files. Only exact original-byte spans and rule IDs deduplicate.
   const key=JSON.stringify([f.path,f.check_id,f.start?.offset,f.end?.offset,f.start?.line,f.start?.col,f.end?.line,f.end?.col]);if(seen.has(key))return false;seen.add(key);return true;
  });
  return {...report,results,errors:report.errors.filter(e=>!(errorType(e)==='PartialParsing'&&repaired.has(e.path))),initialErrors,compatibility:compatibility.map(c=>({...c,verified:repaired.has(c.file)}))};
 }finally {await store.remove(stageRelative,{recursive:true}).catch(e=>{if(e.code!=='ENOENT')throw e;});if(owned)await store.close();}
}
