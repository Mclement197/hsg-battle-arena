import {join} from 'node:path';
import {homedir} from 'node:os';
import {openArtifacts} from './artifacts.mjs';
const jobId=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const validTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
export async function loadScheduling(dataDir=join(homedir(),'.local/share/afp-security')) {
 let store;try{store=await openArtifacts(dataDir,{create:false});return JSON.parse(await store.read('scheduler.json',8192));}catch{return null;}finally{if(store)await store.close();}
}
export function schedulingSnapshot(metadata,now=Date.now()) {
 const base={schemaVersion:1,status:'unknown',enabled:null,lastKnownEnabled:null,agent:'dev-security',verifiedAt:null,nextRunAt:null,cadence:null,evidenceSource:null,message:'Recurring scan scheduler state unknown; no verified scheduler evidence is available.'};
 if(!metadata||metadata.schemaVersion!==1||metadata.source!=='openclaw-automations'||!jobId(metadata.jobId)||metadata.scope!=='security-dashboard'||metadata.agent!=='dev-security'||typeof metadata.enabled!=='boolean'||!validTime(metadata.verifiedAt)||metadata.schedule?.kind!=='cron'||metadata.schedule?.expr!=='0 9 * * 1,4'||metadata.schedule?.tz!=='Europe/Zurich')return base;
 const age=now-Date.parse(metadata.verifiedAt);
 if(age<0)return base;
 const known={...base,verifiedAt:new Date(metadata.verifiedAt).toISOString(),lastKnownEnabled:metadata.enabled,cadence:'Monday and Thursday 09:00 Europe/Zurich',evidenceSource:'Verified OpenClaw automation state'};
 if(age>86400000)return {...known,status:'stale',message:'Recurring scan scheduler evidence is stale (>24h); current enabled state and next run are unknown.'};
 return {...known,status:metadata.enabled?'enabled':'disabled',enabled:metadata.enabled,nextRunAt:metadata.enabled&&validTime(metadata.nextRunAt)&&Date.parse(metadata.nextRunAt)>now?new Date(metadata.nextRunAt).toISOString():null,message:metadata.enabled?'Recurring scans enabled in recently verified scheduler state. Next-run time is published only when supplied by that scheduler.':'Recurring scans disabled in recently verified scheduler state.'};
}
