// Owned loopback rooms only; server combat stays real while renderer time is sampled deterministically.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {createGameServer} from '../src/server.mjs';
import {Arena,CHARACTERS} from '../src/engine.mjs';
import {ABILITIES,moveLabel} from '../public/battle-contract.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const dir=process.env.EVIDENCE_DIR||'/home/mathis/.openclaw/workspace/media/hsg-move-presentation';await fs.mkdir(dir,{recursive:true});
const port=Number(process.env.QA_PORT||18997);
let clock=Date.now();const arena=new Arena({now:()=>clock,pick:()=>0});
const game=createGameServer({arena,publicOrigin:'http://127.0.0.1:'+port,autoTick:false,limits:{mutationsPerMinute:5000,createsPerMinute:100}});await new Promise(r=>game.server.listen(port,'127.0.0.1',r));
const origin='http://127.0.0.1:'+port,errors=[],checks=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function post(path,body={},token){return new Promise((resolve,reject)=>{const req=http.request(origin+'/game/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},r=>{let s='';r.on('data',b=>s+=b);r.on('end',()=>{try{assert.ok(r.statusCode<300,s);resolve(JSON.parse(s));}catch(e){reject(e);}});});req.on('error',reject);req.end(JSON.stringify(body));});}
async function attach(page,room,role,token){
 page.on('pageerror',e=>errors.push(e.stack));
 await page.addInitScript(async({room,role,token})=>{const fixed=Date.now();Date.now=()=>fixed;sessionStorage.setItem('hsg-arena:v1:'+role+':'+room,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room,role}));
 const {BattleWorld}=await import('/game/battle-world.js?v=20261018-move-presentation');const sync=BattleWorld.prototype.sync;BattleWorld.prototype.sync=function(s){window.__world=this;return sync.call(this,s);};
 },{room,role,token});await page.goto(origin+'/game/');
}
async function ready(page){await page.waitForSelector('[data-world-status=ready]',{timeout:60000});await page.evaluate(()=>cancelAnimationFrame(window.__world.raf));}
async function hud(page){return page.evaluate(()=>({at:performance.now(),screen:document.body.dataset.screen,hp:document.body.dataset.role==='host'?['ace','dynamo'].map(t=>document.querySelector('#'+t+'-hp').value):[...document.querySelectorAll('#player-preview progress')].map(p=>p.value),message:document.querySelector('#battle-message').textContent,disabled:[...document.querySelectorAll(document.body.dataset.role==='host'?'[data-solo-move]':'button[data-move]')].every(b=>b.disabled),overflow:document.documentElement.scrollWidth>innerWidth+1}));}
async function sample(page,number,name){
 await page.waitForFunction(n=>window.__world?.events.pending.some(e=>e.result?.number===n),number);
 const before=await hud(page);await page.evaluate(()=>{const w=window.__world;w.begin(w.events.pending.shift(),0);});const frames=[];
 for(const fraction of [0,.35,.61,.99,1]){
  await page.evaluate(fraction=>{const w=window.__world;w.animate(2200*fraction);if(w.renderer){w.renderer.shadowMap.needsUpdate=true;w.renderer.render(w.scene,w.camera);}},fraction);
  const state=await hud(page);frames.push({fraction,animationMs:2200*fraction,...state});
  if(fraction<1){assert.deepEqual(state.hp,before.hp,name+' early HP at '+fraction);assert.equal(state.screen,before.screen,name+' early victory');assert.equal(state.disabled,true,name+' unlocked resolving');}
  assert.equal(state.overflow,false,name+' overflow');
  if(name.includes('luca-di-grazia')||name.includes('lethal'))await page.screenshot({path:dir+'/'+name+'-'+fraction+'.png',fullPage:true});
 }
 const r=await page.evaluate(()=>window.__world.state.lastResult);assert.equal(frames.at(-1).hp[r.targetTeam==='A'?0:1],r.targetHp,name+' final HP');checks.push({name,result:r,frames});
}
try{
 for(const arenaId of ['library','trischli'])for(const index of (process.env.FALLBACK_ONLY?[]:process.env.SMOKE?[0]:CHARACTERS.map((_,i)=>i))){
  console.log('ROOM',arenaId,index);
  const desktop=await browser.newContext({viewport:process.env.HOST_PHONE?{width:390,height:844}:{width:1440,height:1000}}),mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const host=await desktop.newPage(),guest=await mobile.newPage();
  const room=await post('rooms',{mode:'friend'}),a=CHARACTERS[index],b=CHARACTERS[(index+1)%6];await post('rooms/'+room.roomId+'/configure',{arenaId,characterA:a,characterB:b},room.hostToken);const player=await post('rooms/'+room.roomId+'/join',{nickname:'Presentation QA'});
  await attach(host,room.roomId,'host',room.hostToken);await attach(guest,room.roomId,'player',player.playerToken);const start=await post('rooms/'+room.roomId+'/start',{},room.hostToken);clock=start.state.prebattle.deadline;game.tick();await ready(host);await ready(guest);
  for(const [page,id,selector,view]of [[host,a,'[data-solo-move]','desktop'],[guest,b,'button[data-move]','phone']]){
   const buttons=await page.locator(selector+' strong').allTextContents();assert.deepEqual(buttons,['attack','defend','heal','special'].map(m=>moveLabel(id,m)));checks.push({arenaId,id,view,buttons});
   await page.evaluate(()=>{const w=window.__world;w.selection=null;w.idleCamera(0);w.idleCamera(1000);w.renderer.render(w.scene,w.camera);});await page.screenshot({path:dir+'/selection-'+arenaId+'-'+id+'-'+view+'.png',fullPage:true});
  }
  if(index===0)for(const viewport of [{width:320,height:640},{width:844,height:390},{width:390,height:844}]){await guest.setViewportSize(viewport);await guest.evaluate(()=>{const w=window.__world;w.layout();w.selection=null;w.idleCamera(0);w.idleCamera(1000);w.renderer.render(w.scene,w.camera);});assert.equal((await hud(guest)).overflow,false);checks.push({orientation:arenaId,viewport});}
  if(process.env.SELECTION_ONLY){await desktop.close();await mobile.close();continue;}
  const r=arena.rooms.get(room.roomId);let n=0;
  for(const move of ['attack','defend','heal','special'])for(const team of ['A','B']){
   await post('rooms/'+room.roomId+'/'+(team==='A'?'play':'vote'),{turnId:r.turn.id,move},team==='A'?room.hostToken:player.playerToken);game.tick();n++;
   for(const [page,view]of [[host,'desktop'],[guest,'phone']])await sample(page,n,arenaId+'-'+(team==='A'?a:b)+'-'+move+'-'+team+'-'+view);
  }
  if(index===0){
   // Opposing authoritative mutations arrive before either client completes its first animation.
   for(const [team,move]of [['A','attack'],['B','attack'],['A','heal'],['B','defend']]){await post('rooms/'+room.roomId+'/'+(team==='A'?'play':'vote'),{turnId:r.turn.id,move},team==='A'?room.hostToken:player.playerToken);game.tick();}
   for(let i=1;i<=4;i++)for(const [page,view]of [[host,'desktop'],[guest,'phone']]){
    // sample checks each event's target HP, not the most recent server result.
    await page.waitForFunction(number=>window.__world.events.pending.some(e=>e.result.number===number),n+i);
    const event=await page.evaluate(()=>window.__world.events.pending[0].result),prior=await hud(page);await page.evaluate(()=>{const w=window.__world;w.begin(w.events.pending.shift(),0);w.animate(2199);});assert.deepEqual((await hud(page)).hp,prior.hp);await page.evaluate(()=>window.__world.animate(2200));assert.equal((await hud(page)).hp[event.targetTeam==='A'?0:1],event.targetHp);checks.push({rapid:arenaId,view,event});
   }
   // Reload is a history boundary, not a replay; then interrupt an active result with reset.
   for(const p of [host,guest]){await p.reload();await ready(p);assert.equal(await p.locator('canvas[data-action]').count(),0);}
   await post('rooms/'+room.roomId+'/play',{turnId:r.turn.id,move:'attack'},room.hostToken);game.tick();for(const p of [host,guest])await p.waitForFunction(()=>window.__world.events.pending.length>0);
   await post('rooms/'+room.roomId+'/reset',{},room.hostToken);for(const p of [host,guest])await p.waitForFunction(()=>!document.querySelector('.battle-world-canvas'));
   const restart=await post('rooms/'+room.roomId+'/start',{},room.hostToken);clock=restart.state.prebattle.deadline;game.tick();await ready(host);await ready(guest);
   // Interrupt a genuine queued result with context loss; current HP must settle, then fallback completes future results.
   await post('rooms/'+room.roomId+'/play',{turnId:r.turn.id,move:'attack'},room.hostToken);game.tick();
   await host.waitForFunction(()=>window.__world.events.pending.length>0);await host.evaluate(()=>{const w=window.__world;w.begin(w.events.pending.shift(),0);w.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));});
   await host.waitForFunction(()=>document.querySelector('.fight-stage').dataset.worldStatus==='error');assert.equal((await hud(host)).hp[1],72);checks.push({contextLoss:arenaId,after:await hud(host)});
   // Reload reconnects with the current authority and no replay.
   for(const p of [host,guest]){await p.reload();await ready(p);}
   await post('rooms/'+room.roomId+'/reset',{},room.hostToken);const finalStart=await post('rooms/'+room.roomId+'/start',{},room.hostToken);clock=finalStart.state.prebattle.deadline;game.tick();await ready(host);await ready(guest);
   await guest.emulateMedia({reducedMotion:'reduce'});r.teams.B.hp=1;
   // Publish owned test-room HP baseline before lethal: reconnect reflects it without stale history.
   for(const p of [host,guest]){await p.reload();await ready(p);}
   await post('rooms/'+room.roomId+'/play',{turnId:r.turn.id,move:'attack'},room.hostToken);game.tick();
   for(const [p,view]of [[host,'desktop'],[guest,'phone']]){
    await p.waitForFunction(()=>window.__world.events.pending.length>0);const prior=await hud(p);await p.evaluate(()=>{const w=window.__world;w.begin(w.events.pending.shift(),0);w.animate(2199);});assert.deepEqual((await hud(p)).hp,prior.hp);assert.notEqual((await hud(p)).screen,'victory');await p.screenshot({path:dir+'/lethal-'+arenaId+'-'+view+'-before-complete.png',fullPage:true});await p.evaluate(()=>window.__world.animate(2200));await p.waitForFunction(()=>document.body.dataset.screen==='victory');await p.screenshot({path:dir+'/lethal-'+arenaId+'-'+view+'-after-complete.png',fullPage:true});checks.push({lethal:arenaId,view,prior,after:await hud(p)});
   }
  }
  await desktop.close();await mobile.close();
  await fs.writeFile(dir+'/browser-partial.json',JSON.stringify({checks,errors},null,2));
 }
 // Explicit honest Mensa and WebGL-failure fallback: bounded completion, no frozen input.
 for(const arenaId of (process.env.SELECTION_ONLY?[]:['mensa-b','library'])){
  const context=await browser.newContext(),page=await context.newPage();
  if(arenaId==='library')await page.route('**/assets/arenas/library.glb',r=>r.abort());
  const room=await post('rooms',{mode:'friend'});await post('rooms/'+room.roomId+'/configure',{arenaId,characterA:CHARACTERS[0],characterB:CHARACTERS[5]},room.hostToken);await post('rooms/'+room.roomId+'/join',{nickname:'Fallback QA'});await attach(page,room.roomId,'host',room.hostToken);
  const start=await post('rooms/'+room.roomId+'/start',{},room.hostToken);clock=start.state.prebattle.deadline;game.tick();await page.waitForSelector('[data-world-status='+ (arenaId==='mensa-b'?'unavailable':'error') +']',{timeout:60000});
  await page.waitForFunction(()=>window.__world?.state.phase==='running');
  const r=arena.rooms.get(room.roomId),before=await hud(page);await post('rooms/'+room.roomId+'/play',{turnId:r.turn.id,move:'attack'},room.hostToken);game.tick();await page.waitForFunction(()=>document.querySelector('#solo-status').textContent.includes('Resolving'));
  assert.deepEqual((await hud(page)).hp,before.hp);await page.waitForFunction(()=>document.querySelector('#dynamo-hp').value===72,null,{timeout:6000});await page.screenshot({path:dir+'/fallback-'+arenaId+'.png',fullPage:true});checks.push({fallback:arenaId,before,after:await hud(page)});await context.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(dir+'/browser-checks.json',JSON.stringify({checks,errors},null,2));console.log('PASS',checks.length,'presentation checks');
}finally{await browser.close();await game.close();}
