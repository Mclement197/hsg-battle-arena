import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {handle, GRAFT_VIEWER_PATH,createRequestAdmission} from './handler.mjs';
import {createActiveAgentsSource} from './active-agents.mjs';
import {createLiveUsageSource,createSharedGatewayReader,readSnapshotFile} from './live-usage.mjs';
const configPath=process.env.AFP_USAGE_CONFIG||join(homedir(),'.config/afp-usage/config.json');
const config=JSON.parse(await readFile(configPath,'utf8'));
const root=fileURLToPath(new URL('../public/',import.meta.url));
const assets={};
for(const [name,type]of [['index.html','text/html; charset=utf-8'],['styles.css','text/css; charset=utf-8'],['app.js','text/javascript; charset=utf-8'],['favicon.svg','image/svg+xml']]) assets['/'+name]={body:await readFile(join(root,name),'utf8'),type};
const graftRoot=fileURLToPath(new URL('../graft-integration/',import.meta.url));
for(const [name,type]of [['graph.json','application/json; charset=utf-8'],['viewer.js','text/javascript; charset=utf-8'],['viewer.css','text/css; charset=utf-8']]) assets['/graft/'+name]={body:await readFile(join(graftRoot,name),'utf8'),type};
assets[GRAFT_VIEWER_PATH]={body:await readFile(join(graftRoot,'viewer','index.html'),'utf8'),type:'text/html; charset=utf-8'};
const fileSource={get:()=>readSnapshotFile(config.snapshotPath)};
const reportingRpc=createSharedGatewayReader();
const usageSource=config.scopeMode==='installation'?createLiveUsageSource(config,{readSeed:()=>fileSource.get(),rpc:reportingRpc}):fileSource;
const env={LOCAL_DEV:true,ACTIVE_AGENTS:createActiveAgentsSource({rpc:reportingRpc}),USAGE:usageSource};
const admitRequest=createRequestAdmission();
const server=createServer(async(req,res)=>{
  let release;
  try {
    const host=req.headers.host||'';
    if(!/^(afp\.mclement\.ch|127\.0\.0\.1(?::18891)?|localhost(?::18891)?)$/.test(host)||!req.url.startsWith('/')||req.url.startsWith('//')){res.writeHead(421,{'Cache-Control':'no-store'});res.end('Unknown host');return;}
    release=admitRequest();
    if(!release){res.writeHead(503,{'Cache-Control':'no-store','Retry-After':'5','Connection':'close'});res.end('Service busy');return;}
    let length=0;const chunks=[];
    for await(const chunk of req){length+=chunk.length;if(length>16384){res.writeHead(413,{'Cache-Control':'no-store'});res.end('Payload too large');return;}chunks.push(chunk);}
    const method=req.method||'GET';
    const headers=new Headers();for(const [name,value]of Object.entries(req.headers)){if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);}
    const request=new Request((host==='afp.mclement.ch'?'https://':'http://')+host+req.url,{method,headers,...(method!=='GET'&&method!=='HEAD'?{body:Buffer.concat(chunks)}:{})});
    const response=await handle(request,env,assets);
    res.writeHead(response.status,Object.fromEntries(response.headers.entries()));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.destroyed&&!res.headersSent){res.writeHead(500,{'Cache-Control':'no-store'});res.end('Service unavailable');}}
  finally{release?.();}
});
server.maxConnections=128;
server.requestTimeout=15000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;
server.listen(18891,'127.0.0.1',()=>console.log('AFP Usage listening on http://127.0.0.1:18891/usage (loopback only)'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{usageSource.close?.();void Promise.all([reportingRpc.close(),new Promise(resolve=>server.close(resolve))]).then(()=>process.exit(0));});
