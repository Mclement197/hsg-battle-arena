// Owned loopback Friend rooms only. Real HTTP/SSE results; deterministic 30 Hz visual timeline capture.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {createGameServer} from '../src/server.mjs';
import {Arena,CHARACTERS} from '../src/engine.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const dir=process.env.EVIDENCE_DIR||'/home/mathis/.openclaw/workspace/media/hsg-action-camera';await fs.mkdir(dir,{recursive:true});
const before=process.env.BASELINE_SOURCE?await fs.readFile(process.env.BASELINE_SOURCE,'utf8'):null;
let clock=Date.now();const arena=new Arena({now:()=>clock,pick:()=>0});
const game=createGameServer({arena,publicOrigin:'http://127.0.0.1:18999',autoTick:false,limits:{mutationsPerMinute:2000,createsPerMinute:100}});await new Promise(r=>game.server.listen(18999,'127.0.0.1',r));
const origin='http://127.0.0.1:18999';const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const checks=[],errors=[];
async function post(path,body={},token){return new Promise((resolve,reject)=>{const req=http.request(origin+'/game/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},r=>{let s='';r.on('data',b=>s+=b);r.on('end',()=>{try{assert.ok(r.statusCode<300,s);resolve(JSON.parse(s));}catch(e){reject(e);}});});req.on('error',reject);req.end(JSON.stringify(body));});}
async function attach(page,room,role,token){
 page.on('pageerror',e=>errors.push(e.stack));if(before)await page.route('**/battle-world.js?*',r=>r.fulfill({contentType:'text/javascript',body:before}));
 await page.addInitScript(({room,role,token})=>{const fixed=Date.now();Date.now=()=>fixed;sessionStorage.setItem('hsg-arena:v1:'+role+':'+room,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room,role}));},{room,role,token});
 await page.goto(origin+'/game/');
 await page.evaluate(async()=>{const{BattleWorld}=await import('./battle-world.js?v=20261018-action-camera');const sync=BattleWorld.prototype.sync;BattleWorld.prototype.sync=function(s){window.__world=this;return sync.call(this,s);};});
}
async function ready(page){await page.waitForSelector('[data-world-status=ready]',{timeout:60000});await page.evaluate(()=>{cancelAnimationFrame(window.__world.raf);window.__world.renderer.shadowMap.needsUpdate=true;});}
async function capture(page,number,name){
 await page.waitForFunction(n=>window.__world?.events.pending.some(e=>e.id.endsWith('0:'+n)),number);
 const result=await page.evaluate(()=>{
  const w=window.__world;cancelAnimationFrame(w.raf);const e=w.events.pending.shift();window.__lastCameraEvent=e;w.begin(e,0);const frames=[],samples=[];let previous=0;
  for(const fraction of [0,.25,.61,.88,1]){
   const end=e.ability.duration*fraction;
   for(let now=previous;now<end;now+=1000/30){w.animate(Math.min(now,end));for(const f of Object.values(w.fighters))if(!w.motion.matches)f.mixer.update(1/30);}
   if(w.active)w.animate(end);previous=end;
   w.renderer.shadowMap.needsUpdate=true;w.renderer.render(w.scene,w.camera);
   const bounds={};for(const [team,f]of Object.entries(w.fighters)){
    if(f.framePoints)bounds[team]=f.framePoints.map(p=>p.clone().project(w.camera).toArray());
   }
   samples.push({fraction,camera:w.camera.position.toArray(),look:w.look.toArray(),fov:w.camera.fov,phase:w.canvas.dataset.camera,bounds});
   if(fraction<1)frames.push(w.canvas.toDataURL('image/png'));
  }
  const overview=w.config.overview;return {event:{actor:e.actor,target:e.target,move:e.move,id:e.id},samples,frames,overview,overflow:document.documentElement.scrollWidth>innerWidth+1};
 });
 assert.equal(result.overflow,false,name+' overflow');assert.deepEqual(result.samples.at(-1).camera,result.overview);
 if(!before)for(const sample of result.samples)for(const points of Object.values(sample.bounds))for(const [x,y]of points){assert.ok(Math.abs(x)<.881,name+' horizontal crop '+x);assert.ok(y<.841&&y>-.781,name+' vertical crop '+y);}
 const sheet=await page.evaluate(async({frames,name})=>{
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),width=480,height=Math.round(480*window.__world.canvas.height/window.__world.canvas.width);canvas.width=width*4;canvas.height=height+28;ctx.fillStyle='#101b17';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const [i,data]of frames.entries()){const image=new Image();image.src=data;await image.decode();ctx.drawImage(image,i*width,28,width,height);ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText(name+' / '+['start','wind-up','impact','recover'][i],i*width+6,19);}return canvas.toDataURL('image/png');
 },{frames:result.frames,name});
 await fs.writeFile(dir+'/'+name+'.png',Buffer.from(sheet.split(',')[1],'base64'));
 if(name.includes('luca-di-grazia-special')||name.includes('trischli-warrior-attack')){await page.evaluate(()=>{const w=window.__world,e=window.__lastCameraEvent;w.begin(e,0);for(let t=0;t<e.ability.duration*.61;t+=1000/30){w.animate(t);for(const f of Object.values(w.fighters))f.mixer.update(1/30);}w.animate(e.ability.duration*.61);w.renderer.shadowMap.needsUpdate=true;w.renderer.render(w.scene,w.camera);});await page.screenshot({path:dir+'/'+name+'-hud.png',fullPage:true});await page.evaluate(()=>window.__world.finish());}
 delete result.frames;checks.push({name,...result});
}
try{
 for(const arenaId of ['library','trischli'])for(const index of (process.env.SMOKE?[0]:CHARACTERS.map((_,i)=>i))){
  console.log('ROOM',arenaId,index,before?'before':'after');
  const desktop=await browser.newContext(process.env.HOST_PHONE?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1000}}),mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const host=await desktop.newPage(),guestPage=await mobile.newPage();
  const room=await post('rooms',{mode:'friend'}),a=CHARACTERS[index],b=CHARACTERS[(index+1)%CHARACTERS.length];
  await post('rooms/'+room.roomId+'/configure',{arenaId,characterA:a,characterB:b},room.hostToken);const guest=await post('rooms/'+room.roomId+'/join',{nickname:'Camera QA'});
  await attach(host,room.roomId,'host',room.hostToken);await attach(guestPage,room.roomId,'player',guest.playerToken);
  const start=await post('rooms/'+room.roomId+'/start',{},room.hostToken);clock=start.state.prebattle.deadline;game.tick();await ready(host);await ready(guestPage);
  const r=arena.rooms.get(room.roomId);let n=0;
  for(const move of ['attack','defend','heal','special'])for(const actor of ['A','B']){
   await post('rooms/'+room.roomId+'/'+(actor==='A'?'play':'vote'),{turnId:r.turn.id,move},actor==='A'?room.hostToken:guest.playerToken);game.tick();n++;
   const id=actor==='A'?a:b;for(const [page,view]of [[host,'desktop'],[guestPage,'phone']])await capture(page,n,(before?'before':'after')+'-'+arenaId+'-'+index+'-'+id+'-'+move+'-'+actor+'-'+view);
  }
  if(!before&&index===0){
   for(const [actor,move]of [['A','attack'],['B','defend'],['A','heal'],['B','defend']]){await post('rooms/'+room.roomId+'/'+(actor==='A'?'play':'vote'),{turnId:r.turn.id,move},actor==='A'?room.hostToken:guest.playerToken);game.tick();}
   for(let number=n+1;number<=n+4;number++)for(const [page,view]of [[host,'desktop'],[guestPage,'phone']])await capture(page,number,'rapid-'+arenaId+'-'+number+'-'+view);
   // Motion preference changes, active orientation resize, cancel and interruption must leave no stale camera.
   await guestPage.emulateMedia({reducedMotion:'reduce'});await guestPage.evaluate(()=>window.__world.begin({id:'reduced',actor:'B',target:'A',move:'special',ability:{...window.__world.state.lastResult,duration:2200,launch:.32,impact:.59,label:'TEST',motif:'chalk',color:0xffffff}},0));
   const reduced=await guestPage.evaluate(()=>{const w=window.__world;const before=w.camera.position.toArray();for(const t of [100,800,1400,2000])w.animate(t);return {before,after:w.camera.position.toArray()};});assert.deepEqual(reduced.before,reduced.after);
   await guestPage.emulateMedia({reducedMotion:'no-preference'});
   await guestPage.evaluate(()=>{const w=window.__world;w.cancel();});
   for(const viewport of [{width:320,height:640},{width:844,height:390},{width:390,height:844}]){await guestPage.evaluate(()=>{const w=window.__world;w.begin(window.__lastCameraEvent,performance.now()-500);});await guestPage.setViewportSize(viewport);await guestPage.evaluate(()=>{const w=window.__world;w.layout();w.cancel();});assert.equal(await guestPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
   for(const p of [host,guestPage])await p.evaluate(()=>{const w=window.__world;w.begin(window.__lastCameraEvent,performance.now()-500);w.animate(performance.now());});
   await post('rooms/'+room.roomId+'/reset',{},room.hostToken);for(const p of [host,guestPage])await p.waitForFunction(()=>!document.querySelector('.battle-world-canvas'));
   const restart=await post('rooms/'+room.roomId+'/start',{},room.hostToken);clock=restart.state.prebattle.deadline;game.tick();await ready(host);await ready(guestPage);
   for(const p of [host,guestPage]){await p.reload();await p.waitForSelector('[data-world-status=ready]',{timeout:60000});assert.equal(await p.locator('canvas[data-action]').count(),0);}
   r.teams.B.hp=1;await post('rooms/'+room.roomId+'/play',{turnId:r.turn.id,move:'attack'},room.hostToken);game.tick();
   for(const p of [host,guestPage])await p.waitForFunction(()=>document.body.dataset.screen==='victory',null,{timeout:30000});
   checks.push({arenaId,lifecycle:'rapid ordered queue, reduced, resize, active reset/restart, host/guest reload history, defeat/victory'});
  }
  await desktop.close();await mobile.close();
 }
 // Mensa B intentionally keeps its existing honest, non-WebGL fallback.
 const c=await browser.newContext(),p=await c.newPage();const room=await post('rooms',{mode:'friend'});await post('rooms/'+room.roomId+'/configure',{arenaId:'mensa-b',characterA:CHARACTERS[0],characterB:CHARACTERS[5]},room.hostToken);await post('rooms/'+room.roomId+'/join',{nickname:'Mensa QA'});await attach(p,room.roomId,'host',room.hostToken);const start=await post('rooms/'+room.roomId+'/start',{},room.hostToken);clock=start.state.prebattle.deadline;game.tick();await p.waitForSelector('[data-world-status=unavailable]');assert.equal(await p.locator('.battle-world-canvas').count(),0);await p.screenshot({path:dir+'/mensa-fallback.png'});await c.close();
 assert.deepEqual(errors,[]);await fs.writeFile(dir+'/checks.json',JSON.stringify({checks,errors},null,2));console.log('PASS',checks.length,'camera paths and lifecycle checks');
}finally{await browser.close();await game.close();}
