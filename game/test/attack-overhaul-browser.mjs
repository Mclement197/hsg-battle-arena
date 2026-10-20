// Own isolated HTTP/SSE Friend rooms. Every sample calls the production renderer and resolved-event path.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {createGameServer} from '../src/server.mjs';
import {Arena,CHARACTERS,MOVES} from '../src/engine.mjs';
import {ABILITIES} from '../public/battle-contract.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const dir=process.env.EVIDENCE_DIR||'/home/mathis/.openclaw/workspace/media/hsg-attack-overhaul';await fs.mkdir(dir,{recursive:true});
const port=Number(process.env.TEST_PORT||18997),origin='http://127.0.0.1:'+port;
let clock=Date.now();const arena=new Arena({now:()=>clock,pick:()=>0});
const game=createGameServer({arena,publicOrigin:origin,autoTick:false,limits:{mutationsPerMinute:2000,createsPerMinute:100}});await new Promise(r=>game.server.listen(port,'127.0.0.1',r));
const errors=[],checks=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function post(path,body={},token){return new Promise((resolve,reject)=>{const req=http.request(origin+'/game/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},res=>{let s='';res.on('data',b=>s+=b);res.on('end',()=>{try{assert.ok(res.statusCode<300,s);resolve(JSON.parse(s));}catch(e){reject(e);}});});req.on('error',reject);req.end(JSON.stringify(body));});}
async function attach(page,room,role,token){
 page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(({room,role,token})=>{const fixed=Date.now();Date.now=()=>fixed;sessionStorage.setItem('hsg-arena:v1:'+role+':'+room,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room,role}));},{room,role,token});
 await page.goto(origin+'/game/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{const {BattleWorld}=await import('./battle-world.js?v=20261020-attacks1');const sync=BattleWorld.prototype.sync;BattleWorld.prototype.sync=function(s){window.__world=this;return sync.call(this,s);};});
}
async function ready(page){await page.waitForSelector('[data-world-status=ready]',{timeout:90000});await page.evaluate(()=>{const w=window.__world;cancelAnimationFrame(w.raf);// A camera pan can upload previously culled arena geometry. Warm that legitimate GPU cache first.
 const cull=[];w.scene.traverse(o=>{if(o.isMesh){cull.push([o,o.frustumCulled]);o.frustumCulled=false;}});w.renderer.shadowMap.needsUpdate=true;w.renderer.render(w.scene,w.camera);for(const [o,flag]of cull)o.frustumCulled=flag;w.renderer.render(w.scene,w.camera);});}
async function capture(page,number,name){
 await page.waitForFunction(n=>window.__world?.events.pending.some(e=>e.id.endsWith('0:'+n)),number,{timeout:30000});
 const out=await page.evaluate(async({name})=>{
  const w=window.__world;cancelAnimationFrame(w.raf);const e=w.events.pending.shift();window.__lastEvent=e;
  const initial=w.renderer.info.memory;const before={...initial},home=Object.fromEntries(Object.entries(w.fighters).map(([t,f])=>[t,f.holder.position.toArray()]));
  w.begin(e,0);const samples=[],frames=[];let previous=0;
  for(const fraction of [0,.20,.43,.63,.89,1]){
   const end=e.ability.duration*fraction;
   for(const [team,f]of Object.entries(w.fighters))if(team!==e.actor&&!w.motion.matches)f.mixer.update((end-previous)/1000);
   if(w.active)w.animate(end);previous=end;
   w.renderer.shadowMap.needsUpdate=true;w.renderer.render(w.scene,w.camera);
   const projected=(w.framingPoints||[]).map(p=>p.clone().project(w.camera).toArray());
   samples.push({fraction,camera:w.camera.position.toArray(),look:w.look.toArray(),fov:w.camera.fov,points:projected,top:w.frameTop??.84,positions:Object.fromEntries(Object.entries(w.fighters).map(([t,f])=>[t,f.holder.position.toArray()]))});
   if(fraction>0&&fraction<1)frames.push(w.canvas.toDataURL('image/png'));
  }
  const after={...w.renderer.info.memory};
  const sheet=document.createElement('canvas'),ctx=sheet.getContext('2d'),width=400,height=Math.round(width*w.canvas.height/w.canvas.width);sheet.width=width*4;sheet.height=height+32;ctx.fillStyle='#101b17';ctx.fillRect(0,0,sheet.width,sheet.height);
  for(const [i,data]of frames.entries()){const image=new Image();image.src=data;await image.decode();ctx.drawImage(image,i*width,32,width,height);ctx.fillStyle='#fff';ctx.font='13px sans-serif';ctx.fillText(name+' / '+['windup','action','impact','return'][i],i*width+4,20);}
  return {event:{id:e.id,characterId:e.characterId,actor:e.actor,target:e.target,move:e.move,label:e.ability.label},samples,before,after,home,final:Object.fromEntries(Object.entries(w.fighters).map(([t,f])=>[t,f.holder.position.toArray()])),overview:w.config.overview,fx:w.fx===null,sheet:sheet.toDataURL('image/png'),overflow:document.documentElement.scrollWidth>innerWidth+1};
 },{name});
 assert.equal(out.overflow,false,name+' overflow');assert.deepEqual(out.final,out.home,name+' exact home');assert.ok(out.fx,name+' cleanup');assert.deepEqual(out.samples.at(-1).camera,out.overview,name+' camera recovery');assert.deepEqual(out.after,out.before,name+' GPU resources');
 for(const sample of out.samples)for(const [x,y,z]of sample.points){assert.ok(Math.abs(x)<=.881,name+' horizontal '+x);assert.ok(y<=sample.top+.002&&y>=-.782,name+' vertical '+y+' top '+sample.top);assert.ok(z>-1&&z<1,name+' depth '+z);}
 await fs.writeFile(dir+'/'+name+'.png',Buffer.from(out.sheet.split(',')[1],'base64'));delete out.sheet;
 // Keep the evidence compact; projected extrema still prove every frame's actual fit.
 for(const s of out.samples){s.projected={count:s.points.length,min:s.points.reduce((a,p)=>a.map((x,i)=>Math.min(x,p[i])),[Infinity,Infinity,Infinity]),max:s.points.reduce((a,p)=>a.map((x,i)=>Math.max(x,p[i])),[-Infinity,-Infinity,-Infinity])};delete s.points;}
 checks.push({name,...out});
}
try{
 for(const arenaId of (process.env.ARENA_ID?[process.env.ARENA_ID]:['library','trischli','mensa-b']))for(const id of (process.env.FIGHTER_IDS?process.env.FIGHTER_IDS.split(','):process.env.FIGHTER_ID?[process.env.FIGHTER_ID]:CHARACTERS)){
  const recordStart=checks.length;
  console.log('ROOM',arenaId,id);
  const desktop=await browser.newContext({viewport:{width:1280,height:900}}),mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const host=await desktop.newPage(),phone=await mobile.newPage();
  const room=await post('rooms',{mode:'friend'});await post('rooms/'+room.roomId+'/configure',{arenaId,characterA:id,characterB:id},room.hostToken);const guest=await post('rooms/'+room.roomId+'/join',{nickname:'Owned attack QA'});
  await attach(host,room.roomId,'host',room.hostToken);await attach(phone,room.roomId,'player',guest.playerToken);
  const start=await post('rooms/'+room.roomId+'/start',{},room.hostToken);clock=start.state.prebattle.deadline;game.tick();await ready(host);await ready(phone);const r=arena.rooms.get(room.roomId);let n=0;
  for(const move of MOVES)for(const actor of ['A','B']){
   await post('rooms/'+room.roomId+'/'+(actor==='A'?'play':'vote'),{turnId:r.turn.id,move},actor==='A'?room.hostToken:guest.playerToken);game.tick();n++;
   for(const [p,view]of [[host,'desktop'],[phone,'phone']])await capture(p,n,arenaId+'-'+id+'-'+move+'-'+actor+'-'+view);
   console.log('MOVE',id,actor,ABILITIES[id][move].label);
  }
  if(id===CHARACTERS[0]){
   const video=await host.evaluate(()=>new Promise(resolve=>{const w=window.__world,stream=w.canvas.captureStream(15),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:1800000}),chunks=[];rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));};rec.start();const start=performance.now();w.begin(window.__lastEvent,start);let previous=start;const tick=now=>{for(const [team,f]of Object.entries(w.fighters))if(team!==w.active?.actor)f.mixer.update(Math.min(.25,(now-previous)/1000));previous=now;if(w.active)w.animate(now);w.renderer.shadowMap.needsUpdate=true;w.renderer.render(w.scene,w.camera);if(now-start<2550)requestAnimationFrame(tick);else rec.stop();};requestAnimationFrame(tick);}));await fs.writeFile(dir+'/'+arenaId+'-live-action.webm',Buffer.from(video));await host.screenshot({path:dir+'/'+arenaId+'-desktop-hud.png',fullPage:true});await phone.screenshot({path:dir+'/'+arenaId+'-phone-hud.png',fullPage:true});
  }
  // Actual prior resolved events exercise interruption, repeated poses, preference changes and orientation.
  for(const p of [host,phone]){
   const lifecycle=await p.evaluate(()=>{const w=window.__world,e=window.__lastEvent;const home=Object.fromEntries(Object.entries(w.fighters).map(([t,f])=>[t,{p:f.holder.position.toArray(),q:f.holder.quaternion.toArray()}]));const memory={...w.renderer.info.memory};
    let maxDrift=0;for(let i=0;i<8;i++){w.begin(e,0);w.animate(900);const pose=w.fighters[e.actor].root.getObjectByName('rightupperarm')?.quaternion.toArray();w.animate(900);if(pose){const next=w.fighters[e.actor].root.getObjectByName('rightupperarm').quaternion.toArray();maxDrift=Math.max(maxDrift,...next.map((x,i)=>Math.abs(x-pose[i])));}w.cancel();w.renderer.render(w.scene,w.camera);}
    return {home,final:Object.fromEntries(Object.entries(w.fighters).map(([t,f])=>[t,{p:f.holder.position.toArray(),q:f.holder.quaternion.toArray()}])),memory,after:{...w.renderer.info.memory},maxDrift};
   });assert.deepEqual(lifecycle.final,lifecycle.home);assert.deepEqual(lifecycle.after,lifecycle.memory);assert.ok(lifecycle.maxDrift<1e-8,'no compounded joint pose');checks.push({arenaId,id,lifecycle});
  }
  if(id===CHARACTERS[0]){
   await phone.emulateMedia({reducedMotion:'reduce'});
   const reduced=await phone.evaluate(()=>{const w=window.__world;w.begin(window.__lastEvent,0);const poses=[];for(const t of [400,900,1400,1900]){w.animate(t);w.renderer.render(w.scene,w.camera);poses.push({camera:w.camera.position.toArray(),matrix:w.camera.projectionMatrix.toArray(),position:w.fighters.B.holder.position.toArray()});}w.cancel();return poses;});assert.ok(reduced.every(p=>JSON.stringify(p)===JSON.stringify(reduced[0])),'reduced still tableau');checks.push({arenaId,reduced});await phone.emulateMedia({reducedMotion:'no-preference'});
   for(const viewport of [{width:320,height:640},{width:844,height:390},{width:390,height:844}]){await phone.setViewportSize(viewport);await phone.evaluate(()=>{const w=window.__world;w.begin(window.__lastEvent,0);w.animate(900);w.layout();w.cancel();});assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
   for(const p of [host,phone])await p.evaluate(()=>{const w=window.__world;w.begin(window.__lastEvent,0);w.animate(900);});
   await post('rooms/'+room.roomId+'/reset',{},room.hostToken);for(const p of [host,phone])await p.waitForFunction(()=>!document.querySelector('.battle-world-canvas'));checks.push({arenaId,interruptedReset:true});
   const switched=arenaId==='trischli'?'mensa-b':'trischli';await post('rooms/'+room.roomId+'/configure',{arenaId:switched,characterA:id,characterB:id},room.hostToken);const restart=await post('rooms/'+room.roomId+'/start',{},room.hostToken);clock=restart.state.prebattle.deadline;game.tick();for(const p of [host,phone]){await ready(p);assert.equal(await p.evaluate(()=>window.__world.state.arenaId),switched);assert.equal(await p.locator('.battle-world-canvas').count(),1);}await post('rooms/'+room.roomId+'/reset',{},room.hostToken);checks.push({arenaId,switched,reenter:true});
  }
  await desktop.close();await mobile.close();await fs.writeFile(dir+'/room-'+arenaId+'-'+id+'-checks.json',JSON.stringify({checks:checks.slice(recordStart),errors},null,2));await fs.writeFile(dir+'/checks-partial.json',JSON.stringify({checks,errors},null,2));
 }
 assert.deepEqual(errors,[]);await fs.writeFile(dir+'/checks'+(process.env.ARENA_ID?'-'+process.env.ARENA_ID:'')+(process.env.FIGHTER_ID?'-'+process.env.FIGHTER_ID:process.env.FIGHTER_IDS?'-remaining':'')+'.json',JSON.stringify({checks,errors},null,2));console.log('PASS',checks.length,'exhaustive real-render checks');
}finally{await browser.close();await game.close();}
