// Actual isolated game worlds + staged model HTTP route substitution. Never touches live assets/rooms.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createGameServer} from '../../../../src/server.mjs';
import {Arena,CHARACTERS} from '../../../../src/engine.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const dir=process.env.EVIDENCE_DIR,models=process.env.MODEL_DIR;await fs.mkdir(dir,{recursive:true});
let now=Date.now();const arena=new Arena({now:()=>now,pick:()=>0});const port=Number(process.env.TEST_PORT||18997);const base='http://127.0.0.1:'+port;const game=createGameServer({arena,publicOrigin:base,autoTick:false,limits:{mutationsPerMinute:1000,createsPerMinute:100}});await new Promise(r=>game.server.listen(port,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[],checks=[];
async function post(p,body={},token){return new Promise((resolve,reject)=>{const req=http.request(base+'/game/api/'+p,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>{try{assert.ok(res.statusCode<300,text);resolve(JSON.parse(text));}catch(e){reject(e);}});});req.on('error',reject);req.end(JSON.stringify(body));});}
try{
 for(const arenaId of (process.env.ARENA_ID?[process.env.ARENA_ID]:['library','trischli']))for(const mobile of [false,true]){
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,reducedMotion:'no-preference'});
  await ctx.route('**/assets/characters/*.glb',async route=>{const id=path.basename(new URL(route.request().url()).pathname);await route.fulfill({path:path.join(models,id),contentType:'model/gltf-binary'});});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/game/');
  await page.evaluate(async()=>{const {BattleWorld}=await import('./battle-world.js?v=20261018-world');const sync=BattleWorld.prototype.sync;BattleWorld.prototype.sync=function(s){window.__w=this;return sync.call(this,s);};});
  for(let index=0;index<(process.env.QUICK?'1':'6');index++){
   const room=await post('rooms',{mode:'friend'});const id=CHARACTERS[index];await post('rooms/'+room.roomId+'/configure',{arenaId,characterA:id,characterB:CHARACTERS[(index+1)%6]},room.hostToken);const guest=await post('rooms/'+room.roomId+'/join',{nickname:'Isolated review'});
   await page.evaluate(({room,token})=>{sessionStorage.setItem('hsg-arena:v1:host:'+room,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room,role:'host'}));},{room:room.roomId,token:room.hostToken});await page.reload();
   await page.evaluate(async()=>{const {BattleWorld}=await import('./battle-world.js?v=20261018-world');const sync=BattleWorld.prototype.sync;BattleWorld.prototype.sync=function(s){window.__w=this;return sync.call(this,s);};const animate=BattleWorld.prototype.animate;BattleWorld.prototype.animate=function(now){const e=this.active,t=(now-e.startedAt)/e.ability.duration;const out=animate.call(this,now);if(this.active&&t>.5&&t<.95&&!e.repairCaptured){e.repairCaptured=true;this.renderer.render(this.scene,this.camera);window.__frames||={};window.__frames[e.id]=this.canvas.toDataURL('image/png');}return out;};});
   const s=await post('rooms/'+room.roomId+'/start',{},room.hostToken);now=s.state.prebattle.deadline;game.tick();await page.waitForFunction(()=>window.__w?.container?.dataset.worldStatus==='ready',null,{timeout:60000});
   await page.evaluate(()=>{window.__record=new Promise(resolve=>{const stream=window.__w.canvas.captureStream(15),r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:1600000}),chunks=[];r.ondataavailable=e=>chunks.push(e.data);r.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));};window.__rec=r;r.start();});});
   for(const move of ['attack','special','defend','heal']){
    const r=arena.rooms.get(room.roomId);await post('rooms/'+room.roomId+'/play',{turnId:r.turn.id,move},room.hostToken);game.tick();await page.waitForFunction(move=>window.__w?.active?.move===move,move);
    await page.waitForTimeout(150);
    const probe=await page.evaluate(()=>{const w=window.__w;return {canvases:document.querySelectorAll('.battle-world-canvas').length,clip:w.fighters.A.clip,active:w.active?.move,camera:w.camera.position.toArray(),arena:w.state.arenaId,triangles:w.renderer.info.render.triangles,overflow:document.documentElement.scrollWidth>innerWidth+1};});assert.equal(probe.canvases,1);assert.equal(probe.overflow,false);checks.push({id,arenaId,mobile,move,...probe});
    await page.screenshot({path:dir+'/'+arenaId+'-'+(mobile?'mobile':'desktop')+'-'+id+'-'+move+'.png'});
    console.log('CAPTURED',arenaId,mobile,id,move);
    await page.waitForFunction(()=>!window.__w?.active,null,{timeout:20000});
    await post('rooms/'+room.roomId+'/vote',{turnId:r.turn.id,move:'defend'},guest.playerToken);game.tick();await page.waitForFunction(()=>window.__w?.active?.actor==='B');await page.waitForFunction(()=>!window.__w?.active,null,{timeout:20000});
   }
   for(const [key,data] of Object.entries(await page.evaluate(()=>window.__frames||{})))await fs.writeFile(dir+'/'+arenaId+'-'+(mobile?'mobile':'desktop')+'-'+id+'-frame-'+key.split(':').pop()+'.png',Buffer.from(data.split(',')[1],'base64'));
   await page.evaluate(()=>window.__rec.stop());await fs.writeFile(dir+'/'+arenaId+'-'+(mobile?'mobile':'desktop')+'-'+id+'.webm',Buffer.from(await page.evaluate(()=>window.__record)));
  }
  await ctx.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(dir+'/runtime-checks.json',JSON.stringify({checks,errors},null,2));console.log('RUNTIME_PASS',checks.length);
}finally{await browser.close();await game.close();}
