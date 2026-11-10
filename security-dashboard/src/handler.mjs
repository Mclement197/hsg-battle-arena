import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { publicSnapshot } from './model.mjs';
import {loadScheduling} from './scheduling.mjs';
const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
const statePath=join(homedir(),'.local/share/afp-security/state.json');
const assets=new Map([['/security/',['index.html','text/html; charset=utf-8']],['/security/app.js',['app.js','text/javascript; charset=utf-8']],['/security/app-20261028.js',['app.js','text/javascript; charset=utf-8']],['/security/styles.css',['styles.css','text/css; charset=utf-8']]]);
const headers={'Content-Security-Policy':"default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'",'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cache-Control':'no-store'};
export function securityHandler({loadState=async()=>{const stat=await fs.stat(statePath);if(stat.size>16*1024*1024)throw new Error('State too large');return JSON.parse(await fs.readFile(statePath,'utf8'));},now=()=>Date.now(),loadScheduler=loadScheduling}={}) {
 return async function handle(req,res) {
  const path=req.url?.split('?')[0];
  if(path!=='/security' && !path?.startsWith('/security/'))return false;
  const send=(status,body,type='text/plain; charset=utf-8',extra={})=>{res.writeHead(status,{...headers,'Content-Type':type,...extra});res.end(req.method==='HEAD'?undefined:body);};
  if(!['GET','HEAD'].includes(req.method)){send(405,'Read-only dashboard',undefined,{Allow:'GET, HEAD'});return true;}
  if(req.url.length>1024||req.url.includes('?')||/%|\\|\.\./.test(req.url)){send(404,'Not found');return true;}
  // Origin checks constrain browsers, never substitute for owner authentication; no mutations exist.
  if(req.headers.origin && !['https://afp.mclement.ch','http://'+req.headers.host].includes(req.headers.origin)){send(403,'Cross-origin access denied');return true;}
  try {
   if(path==='/security'){send(308,'',undefined,{Location:'/security/'});return true;}
   if(path==='/security/api/summary'){send(200,JSON.stringify(publicSnapshot(await loadState(),now(),await loadScheduler())),'application/json; charset=utf-8');return true;}
   const asset=assets.get(path);if(!asset){send(404,'Not found');return true;}
   send(200,await fs.readFile(join(publicRoot,asset[0])),asset[1]);
  }catch{send(503,'Security evidence unavailable. Last scan cannot be verified.');}
  return true;
 };
}
