import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {handle, publicSnapshot} from './handler.mjs';
const configPath=process.env.AFP_USAGE_CONFIG||join(homedir(),'.config/afp-usage/config.json');
const config=JSON.parse(await readFile(configPath,'utf8'));
const auth=JSON.parse(await readFile(config.authPath,'utf8'));
if(!/^[a-f0-9]{64}$/.test(auth.passwordHash)||typeof auth.sessionKey!=='string'||auth.sessionKey.length<32)throw new Error('Invalid private authentication configuration');
const root=fileURLToPath(new URL('../public/',import.meta.url));
const assets={};
for(const [name,type]of [['index.html','text/html; charset=utf-8'],['styles.css','text/css; charset=utf-8'],['app.js','text/javascript; charset=utf-8']]) assets['/'+name]={body:await readFile(join(root,name),'utf8'),type};
const env={LOCAL_DEV:true,DASHBOARD_PASSWORD_SHA256:auth.passwordHash,SESSION_KEY:auth.sessionKey,USAGE:{async get(){
  try {const body=await readFile(config.snapshotPath,'utf8');if(body.length>1048576)throw new Error('Local snapshot too large');return JSON.stringify(publicSnapshot(JSON.parse(body)));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}}};
const server=createServer(async(req,res)=>{
  try {
    const host=req.headers.host||'';
    if(!/^(afp\.mclement\.ch|127\.0\.0\.1(?::18891)?|localhost(?::18891)?)$/.test(host)||!req.url.startsWith('/')||req.url.startsWith('//')){res.writeHead(421,{'Cache-Control':'no-store'});res.end('Unknown host');return;}
    let length=0;const chunks=[];
    for await(const chunk of req){length+=chunk.length;if(length>16384){res.writeHead(413,{'Cache-Control':'no-store'});res.end('Payload too large');return;}chunks.push(chunk);}
    const method=req.method||'GET';
    const headers=new Headers();for(const [name,value]of Object.entries(req.headers)){if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);}
    const request=new Request((host==='afp.mclement.ch'?'https://':'http://')+host+req.url,{method,headers,...(method!=='GET'&&method!=='HEAD'?{body:Buffer.concat(chunks)}:{})});
    const response=await handle(request,env,assets);
    res.writeHead(response.status,Object.fromEntries(response.headers.entries()));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'Cache-Control':'no-store'});res.end('Service unavailable');}
});
server.requestTimeout=15000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;
server.listen(18891,'127.0.0.1',()=>console.log('AFP Usage listening on http://127.0.0.1:18891/usage (loopback only)'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
