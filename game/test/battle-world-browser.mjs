// Isolated loopback server + genuine HTTP/SSE game clients. No deployed rooms or service touched.
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createGameServer } from '../src/server.mjs';
import { Arena, CHARACTERS } from '../src/engine.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const dir=process.env.EVIDENCE_DIR||'/home/mathis/.openclaw/workspace/media/hsg-cinematic-arenas';await fs.mkdir(dir,{recursive:true});
const port=Number(process.env.TEST_PORT||18996);let time=Date.now();const arena=new Arena({now:()=>time,pick:()=>0});
const game=createGameServer({arena,publicOrigin:'http://127.0.0.1:'+port,autoTick:false,limits:{mutationsPerMinute:500,createsPerMinute:40}});await new Promise(r=>game.server.listen(port,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const checks=[],errors=[];const base='http://127.0.0.1:'+port;
async function post(path,body={},token){return new Promise((resolve,reject)=>{const req=http.request(base+'/game/api/'+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>{try{const data=JSON.parse(text);assert.ok(res.statusCode<300,text);resolve(data);}catch(e){reject(e);}});});req.on('error',reject);req.end(JSON.stringify(body));});}
async function attach(page,room,role,token){
 await page.addInitScript(({room,role,token})=>{sessionStorage.setItem('hsg-arena:v1:'+role+':'+room,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room,role}));},{room,role,token});
 await page.goto(base+'/game/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
  const {BattleWorld}=await import('./battle-world.js?v=20261018-world');
  const sync=BattleWorld.prototype.sync;BattleWorld.prototype.sync=function(s){window.__world=this;return sync.call(this,s);};
  const animate=BattleWorld.prototype.animate;
  BattleWorld.prototype.animate=function(now){const e=this.active,t=(now-e.startedAt)/e.ability.duration;const out=animate.call(this,now);
   for(const [phase,lo,hi]of [['anticipation',.1,.35],['impact',.59,.86]])if(this.active&&t>lo&&t<hi&&!this.active['captured'+phase]){this.active['captured'+phase]=true;window.__cameraShots||=[];window.__cameraShots.push({phase,camera:this.camera.position.toArray(),action:this.active.id});this.renderer.render(this.scene,this.camera);window.__frames||={};window.__frames[this.active.id+'-'+phase]=this.canvas.toDataURL('image/png');}
   return out;
  };
 });
}
async function shot(page,name){await page.screenshot({path:dir+'/'+name+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
async function ready(page){await page.waitForFunction(()=>document.querySelector('[data-world-status="ready"]'),null,{timeout:60000});}
async function probe(page){return page.evaluate(()=>{const w=window.__world;return {arena:w.state.arenaId,canvases:document.querySelectorAll('.battle-world-canvas').length,separate:document.querySelectorAll('#battle-screen .character-canvas,#player-screen .character-canvas').length,scene:w.scene.uuid,environment:w.environment.parent===w.scene,fighters:Object.fromEntries(Object.entries(w.fighters).map(([t,f])=>[t,{parent:f.holder.parent===w.scene,position:f.holder.position.toArray(),clip:f.clip,scale:f.root.scale.x}])),camera:w.camera.position.toArray(),active:w.active?{id:w.active.id,move:w.active.move,hit:w.active.hit}:null,drawCalls:w.renderer.info.render.calls,triangles:w.renderer.info.render.triangles,memory:w.renderer.info.memory};});}
try{
 for(const [index,arenaId]of (process.env.MATRIX_ONLY?[]:process.env.ARENA_ID?[process.env.ARENA_ID]:['library','trischli']).entries()){
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});const host=await ctx.newPage();host.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message,e.stack);});
  const room=await post('rooms',{mode:'friend'});const a=CHARACTERS[index*2],b=CHARACTERS[index*2+1];
  await post('rooms/'+room.roomId+'/configure',{arenaId,characterA:a,characterB:b},room.hostToken);
  const guest=await post('rooms/'+room.roomId+'/join',{nickname:'Local guest'});
  await attach(host,room.roomId,'host',room.hostToken);console.log('ATTACHED',arenaId);
  const phoneCtx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,reducedMotion:'reduce'});const phone=await phoneCtx.newPage();phone.on('pageerror',e=>{errors.push(e.message);console.error('PHONEERROR',e.stack);});await attach(phone,room.roomId,'player',guest.playerToken);
  const start=await post('rooms/'+room.roomId+'/start',{},room.hostToken);time=start.state.prebattle.deadline;game.tick();await ready(host);console.log('HOST READY',arenaId);await ready(phone);console.log('PHONE READY',arenaId);await host.waitForTimeout(400);
  const initial=await probe(host);assert.equal(initial.canvases,1);assert.equal(initial.separate,0);assert.ok(initial.environment);assert.ok(Object.values(initial.fighters).every(f=>f.parent));assert.equal((await probe(phone)).arena,arenaId);
  await shot(host,arenaId+'-overview');await shot(phone,arenaId+'-mobile-reduced');console.log('SHOTS',arenaId);
  console.log('RECORD',arenaId);await host.evaluate(()=>{const canvas=document.querySelector('.battle-world-canvas');window.__video=new Promise(resolve=>{const stream=canvas.captureStream(20),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:1800000}),chunks=[];rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));};window.__rec=rec;rec.start();});});
  const r=arena.rooms.get(room.roomId);let actionNo=0;
  for(const [actor,move]of [['A','attack'],['B','special'],['A','defend'],['B','heal']]){
   const token=actor==='A'?room.hostToken:guest.playerToken;
   await post('rooms/'+room.roomId+'/'+(actor==='A'?'play':'vote'),{turnId:r.turn.id,move},token);game.tick();
   await host.waitForFunction(n=>window.__world?.active?.id.endsWith('0:'+n),++actionNo,{timeout:15000});
   await host.bringToFront();await host.waitForTimeout(350);const anticipation=await probe(host);console.log('ACTION',arenaId,move,anticipation.camera);
   await host.waitForFunction(()=>window.__world?.active?.hit||!window.__world?.active,null,{timeout:10000});const impact=await probe(host);
   await shot(host,arenaId+'-'+move+'-impact');
   const reduced=await probe(phone);assert.deepEqual(reduced.camera,await phone.evaluate(()=>window.__world.config.overview));
   // Delayed probes may already be back at overview; camera is also asserted in-frame and in deterministic director tests.
   await host.waitForFunction(()=>!window.__world?.active,null,{timeout:10000});
   checks.push({arena:arenaId,move,actor,initial,anticipation,impact});
  }
  const cameras=await host.evaluate(()=>window.__cameraShots||[]);assert.ok(cameras.some(c=>c.camera.some((x,i)=>Math.abs(x-initial.camera[i])>.1)),'in-frame camera direction');checks.push({arenaId,cameras});for(const [key,data]of Object.entries(await host.evaluate(()=>window.__frames||{})))await fs.writeFile(dir+'/'+arenaId+'-frame-'+key.split(':').slice(-1)[0]+'.png',Buffer.from(data.split(',')[1],'base64'));await host.evaluate(()=>window.__rec.stop());await fs.writeFile(dir+'/'+arenaId+'-actual-game.webm',Buffer.from(await host.evaluate(()=>window.__video)));
  console.log('RELOAD',arenaId);await host.reload({waitUntil:'domcontentloaded'});await ready(host);console.log('RELOADED',arenaId);assert.equal(await host.locator('canvas[data-action]').count(),0,'history not replayed after reconnect');
  await post('rooms/'+room.roomId+'/reset',{},room.hostToken);await host.waitForFunction(()=>!document.querySelector('.battle-world-canvas'));await ctx.close();await phoneCtx.close();console.log('ARENA DONE',arenaId);
 }
 // All six identities exercise actual authoritative attack and special packets in a shared world.
 for(const id of (process.env.ARENAS_ONLY?[]:process.env.FIGHTER_ID?[process.env.FIGHTER_ID]:CHARACTERS)){const ctx=await browser.newContext({viewport:{width:1280,height:900}}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));const room=await post('rooms',{mode:'friend'});await post('rooms/'+room.roomId+'/configure',{arenaId:'trischli',characterA:id,characterB:'bad-teacher'},room.hostToken);const guest=await post('rooms/'+room.roomId+'/join',{nickname:'Matrix guest'});await attach(p,room.roomId,'host',room.hostToken);const s=await post('rooms/'+room.roomId+'/start',{},room.hostToken);time=s.state.prebattle.deadline;game.tick();await ready(p);const r=arena.rooms.get(room.roomId);
  for(const move of ['attack','defend','heal','special']){await post('rooms/'+room.roomId+'/play',{turnId:r.turn.id,move},room.hostToken);game.tick();await p.waitForFunction(move=>window.__world?.active?.move===move,move);console.log('MATRIX',id,move);await p.waitForFunction(()=>window.__world?.active?.hit||!window.__world?.active);await shot(p,'matrix-'+id+'-'+move);checks.push({id,move,...await probe(p)});await p.waitForFunction(()=>!window.__world.active);await post('rooms/'+room.roomId+'/vote',{turnId:r.turn.id,move:'defend'},guest.playerToken);game.tick();await p.waitForFunction(()=>window.__world?.active?.actor==='B');await p.waitForFunction(()=>!window.__world.active);}
  if(process.env.CHECK_DEFEAT){let safety=0;while(r.phase==='running'&&safety++<12){const team=r.turn.team;await post('rooms/'+room.roomId+'/'+(team==='A'?'play':'vote'),{turnId:r.turn.id,move:team==='A'?'attack':'defend'},team==='A'?room.hostToken:guest.playerToken);game.tick();await p.waitForFunction(()=>window.__world?.active);await p.waitForFunction(()=>!window.__world?.active);}assert.equal(r.phase,'finished');await p.waitForFunction(()=>document.body.dataset.screen==='victory',null,{timeout:25000});await shot(p,'defeat-victory');checks.push({id,defeat:true,winner:r.winner});}
  await ctx.close();
 }
 await fs.writeFile(dir+'/browser-errors.json',JSON.stringify(errors));assert.deepEqual(errors,[]);await fs.writeFile(dir+(process.env.CHECK_DEFEAT?'/browser-defeat-checks.json':process.env.MATRIX_ONLY?'/browser-matrix-checks.json':process.env.ARENA_ID?'/browser-'+process.env.ARENA_ID+'-checks.json':'/browser-checks.json'),JSON.stringify({checks,errors},null,2));console.log('PASS',checks.length,'shared scene/camera/ability checks');
}finally{await browser.close();await game.close();}
