import {promises as fs,constants as C} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
const DIR=C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW;
const fdPath=fd=>'/proc/'+process.pid+'/fd/'+fd.fd;
const identity=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const parts=path=>{if(typeof path!=='string'||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('Invalid artifact-relative path');return path.split('/');};
async function rootHandle(path,create=false) {
 const absolute=resolve(path);if(absolute!==path)throw new Error('Artifact root must be canonical absolute path');
 const names=absolute.slice(1).split('/');let parent=await fs.open('/',DIR);
 try {for(let i=0;i<names.length;i++){
  const child=fdPath(parent)+'/'+names[i];let next;
  try{next=await fs.open(child,DIR);}catch(e){if(e.code!=='ENOENT'||!create||i!==names.length-1)throw e;await fs.mkdir(child,{mode:0o700});next=await fs.open(child,DIR);}
  await parent.close();parent=next;
 }return parent;}catch(e){await parent.close();throw e;}
}
export async function openArtifacts(path,{create=true}={}) {
 // Validate the full existing ancestor chain without following any symlink.
 const root=await rootHandle(path,create),rootStat=await root.stat();
 if(rootStat.uid!==process.getuid()){await root.close();throw new Error('Artifact root not owned by current user');}
 const directories=new Map([['',root]]),reports=[];let closed=false;
 async function assertDirectory(relative='') {
  if(closed)throw new Error('Artifact store closed');
  const current=await rootHandle(path);try{if(!identity(await current.stat(),rootStat))throw new Error('Artifact root identity changed');}finally{await current.close();}
  let prefix='';for(const name of relative?parts(relative):[]){const parent=directories.get(prefix);prefix=prefix?prefix+'/'+name:name;const pinned=directories.get(prefix);if(!parent||!pinned)throw new Error('Artifact directory not anchored');const entry=await fs.lstat(fdPath(parent)+'/'+name);if(!entry.isDirectory()||!identity(entry,await pinned.stat()))throw new Error('Artifact ancestor identity changed');}
 }
 async function directory(relative='',{create=false}={}) {
  let prefix='';for(const name of relative?parts(relative):[]){await assertDirectory(prefix);const parent=directories.get(prefix);prefix=prefix?prefix+'/'+name:name;
   if(!directories.has(prefix)){const child=fdPath(parent)+'/'+name;let fd;try{fd=await fs.open(child,DIR);}catch(e){if(e.code!=='ENOENT'||!create)throw e;await fs.mkdir(child,{mode:0o700});fd=await fs.open(child,DIR);}const stat=await fd.stat();if(stat.uid!==process.getuid()){await fd.close();throw new Error('Artifact directory not owned');}directories.set(prefix,fd);}
  }await assertDirectory(relative);return fdPath(directories.get(relative));
 }
 async function location(relative,{createParents=false}={}){parts(relative);const parent=dirname(relative)==='.'?'':dirname(relative);return {parent,path:await directory(parent,{create:createParents})+'/'+basename(relative)};}
 async function openFile(relative,flags,mode=0o600){const loc=await location(relative);let prior;try{prior=await fs.lstat(loc.path);if(!prior.isFile()||prior.nlink!==1||prior.uid!==process.getuid())throw new Error('Unsafe artifact file');}catch(e){if(e.code!=='ENOENT')throw e;}const fd=await fs.open(loc.path,flags|C.O_NOFOLLOW|C.O_NONBLOCK,mode);try{const s=await fd.stat();if(!s.isFile()||s.nlink!==1||s.uid!==process.getuid()||prior&&!identity(prior,s))throw new Error('Unsafe artifact file');return fd;}catch(e){await fd.close();throw e;}}
 const store={path,assertDirectory,directory,location,
  async scanDirectory(relative,options){return (await directory(relative,options))+'/.';},
  async entry(relative){if(relative==='.')return fs.open(await directory(),C.O_RDONLY|C.O_DIRECTORY);const loc=await location(relative);const prior=await fs.lstat(loc.path);if(!prior.isFile()&&!prior.isDirectory())throw new Error('Unsafe artifact entry');const fd=await fs.open(loc.path,C.O_RDONLY|C.O_NOFOLLOW|C.O_NONBLOCK);if(!identity(prior,await fd.stat())){await fd.close();throw new Error('Artifact entry identity changed');}return fd;},
  async preflight(){
   for(const name of ['runs','remediations']){let anchored;try{anchored=await directory(name);}catch(e){if(e.code==='ENOENT')continue;throw e;}
    if(name==='runs'){const entries=(await fs.readdir(anchored)).filter(v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v));if(entries.length>500)throw new Error('Run directory budget exceeded');for(const entry of entries)await directory('runs/'+entry);}
   }
  },
  async atomic(relative,value){const loc=await location(relative,{createParents:true}),temp=loc.path+'.'+randomUUID()+'.tmp';const fd=await fs.open(temp,C.O_WRONLY|C.O_CREAT|C.O_EXCL|C.O_NOFOLLOW,0o600);try{await fd.writeFile(JSON.stringify(value,null,2)+'\n');}finally{await fd.close();}await assertDirectory(loc.parent);await fs.rename(temp,loc.path);},
  async report(relative){const fd=await openFile(relative,C.O_RDWR|C.O_CREAT|C.O_EXCL);reports.push(fd);return fdPath(fd);},
  async write(relative,data){const fd=await openFile(relative,C.O_WRONLY|C.O_CREAT|C.O_EXCL);try{await fd.writeFile(data);}finally{await fd.close();}},
  async append(relative,data){const fd=await openFile(relative,C.O_WRONLY|C.O_CREAT|C.O_APPEND);try{await fd.writeFile(data);}finally{await fd.close();}},
  async read(relative,limit=16*1024*1024){const fd=await openFile(relative,C.O_RDONLY);try{if((await fd.stat()).size>limit)throw new Error('Artifact size budget exceeded');return await fd.readFile('utf8');}finally{await fd.close();}},
  async chmod(relative,mode){if(relative==='.'||directories.has(relative)){const key=relative==='.'?'':relative;await assertDirectory(key);await directories.get(key).chmod(mode);return;}const fd=await openFile(relative,C.O_RDONLY);try{await fd.chmod(mode);}finally{await fd.close();}},
  async remove(relative,{recursive=false}={}){const loc=await location(relative);await assertDirectory(loc.parent);await fs.rm(loc.path,{recursive,force:true});},
  async close(){closed=true;for(const fd of [...reports,...directories.values()].reverse())await fd.close();}
 };return store;
}
