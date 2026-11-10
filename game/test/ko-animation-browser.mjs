import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createGameServer } from '../src/server.mjs';
import { Arena, CHARACTERS } from '../src/engine.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const dir=new URL('../evidence/ko-animation/',import.meta.url);await fs.mkdir(dir,{recursive:true});
const port=Number(process.env.TEST_PORT||19007);let now=Date.now();const arena=new Arena({now:()=>now,pick:()=>0});
const game=createGameServer({arena,publicOrigin:'http://127.0.0.1:'+port,autoTick:false,limits:{mutationsPerMinute:1000,createsPerMinute:100}});await new Promise(r=>game.server.listen(port,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const base='http://127.0.0.1:'+port, results=[], errors=[];
const post=(path,data={},token)=>new Promise((resolve,reject)=>{const q=http.request(base+'/game/api/'+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},r=>{let s='';r.on('data',b=>s+=b);r.on('end',()=>{try{const x=JSON.parse(s);assert.ok(r.statusCode<300,s);resolve(x);}catch(e){reject(e);}});});q.on('error',reject);q.end(JSON.stringify(data));});
async function attach(page,id,role,token){await page.addInitScript(({id,role,token})=>{sessionStorage.setItem('hsg-arena:v1:'+role+':'+id,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room:id,role}));},{id,role,token});await page.goto(base+'/game/',{waitUntil:'domcontentloaded'});await page.evaluate(async()=>{const {BattleWorld}=await import('./battle-world.js?v=20261020-action-sync-current1');const sync=BattleWorld.prototype.sync,animate=BattleWorld.prototype.animate,finish=BattleWorld.prototype.finish;BattleWorld.prototype.sync=function(s){window.__koWorld=this;return sync.call(this,s);};BattleWorld.prototype.animate=function(now){const out=animate.call(this,now),e=this.active;if(e?.koStartedAt){window.__koSamples??=[];window.__koSamples.push({elapsed:performance.now()-e.koStartedAt,phase:this.container?.dataset?.koPhase||null});}return out;};BattleWorld.prototype.finish=function(...args){const e=this.active;if(e?.koStartedAt){window.__koSamples??=[];window.__koSamples.push({elapsed:performance.now()-e.koStartedAt,phase:'complete'});}return finish.apply(this,args);};});}
async function ready(p){await p.waitForFunction(()=>{const x=document.querySelector('.fight-stage[data-world-status]')||document.querySelector('#player-world[data-world-status]');return x?.dataset.worldStatus==='ready'||x?.dataset.worldStatus==='error';},{timeout:60000});}
try{
 const modes=process.env.KO_MODE?[process.env.KO_MODE]:['bot','friend','groups'];
 for(const mode of modes){
  const room=await post('rooms',{mode}),id=room.roomId;await post('rooms/'+id+'/configure',{arenaId:'library',characterA:CHARACTERS[0],characterB:CHARACTERS[1]},room.hostToken);
  let guest=null;if(mode!=='bot')guest=await post('rooms/'+id+'/join',{nickname:'QA player'});if(mode==='groups')await post('rooms/'+id+'/join',{nickname:'QA teammate'});
  const hostCtx=await browser.newContext({viewport:{width:1280,height:900}}),host=await hostCtx.newPage();host.on('pageerror',e=>errors.push('host:'+e.message));await attach(host,id,'host',room.hostToken);
  let phoneCtx,phone;if(guest){phoneCtx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:process.env.PHONE_REDUCED==='1'?'reduce':'no-preference'});phone=await phoneCtx.newPage();phone.on('pageerror',e=>errors.push('player:'+e.message));await attach(phone,id,'player',guest.playerToken);}
  // Exercise actual controls before the decisive result.
  await host.locator('#mute').click();await host.locator('.audio-settings summary').click();await host.locator('#volume-sfx').fill('23');assert.equal(await host.locator('#volume-sfx-value').innerText(),'23%');
  const started=await post('rooms/'+id+'/start',{},room.hostToken);now=started.state.prebattle.deadline;game.tick();await ready(host);if(phone)await ready(phone);
  const r=arena.rooms.get(id);r.teams.B.hp=1;
  if(mode==='groups'){const p=[...r.players.values()].find(x=>x.team==='A');arena.vote(r,{role:'player',player:p},{turnId:r.turn.id,move:'attack'});now=r.turn.deadline;game.tick();}
  else {await post('rooms/'+id+'/play',{turnId:r.turn.id,move:'attack'},room.hostToken);game.tick();}
  if(process.env.DELAYED_FRAME){await host.waitForFunction(()=>window.__koWorld?.active?.defeated);const sample=await host.evaluate(()=>{const w=window.__koWorld,e=w.active,now=performance.now();e.startedAt=now-e.ability.duration-1800;w.animate(now);return {phase:document.querySelector('.fight-stage')?.dataset.koPhase,startedAt:e.koStartedAt,now};});assert.equal(sample.phase,'stagger','late animation frame starts a fresh KO window: '+JSON.stringify(sample));}
  else await host.waitForFunction(()=>document.querySelector('.fight-stage')?.dataset.koPhase==='stagger',{timeout:20000});
  const began=Date.now();let phoneState=null;
  if(mode==='friend'&&phone){await phone.waitForFunction(()=>window.__koWorld?.active?.koStartedAt>0,undefined,{timeout:10000}).catch(async error=>{throw new Error('player KO did not start: '+JSON.stringify(await phone.evaluate(()=>({screen:document.body.dataset.screen,world:window.__koWorld?{active:window.__koWorld.active,phase:window.__koWorld.container?.dataset?.koPhase}:null,samples:window.__koSamples})))+'; '+error.message);});const visible=await host.evaluate(()=>{const b=document.querySelector('#skip-ko'),shown=!b.hidden;b.click();return shown;});assert.equal(visible,true,'Skip K.O. is visible during host KO');await phone.waitForFunction(()=>window.__koSamples?.some(s=>s.phase==='complete'),undefined,{timeout:6000});phoneState=await phone.evaluate(()=>({screen:document.body.dataset.screen,world:{...document.querySelector('#player-world')?.dataset},canvases:document.querySelectorAll('.battle-world-canvas').length,samples:window.__koSamples}));if(process.env.PHONE_REDUCED==='1')assert.ok(phoneState.samples.some(s=>s.phase==='flat'),'reduced-motion player observed settled KO pose');else{assert.ok(phoneState.samples.some(s=>s.phase==='stagger'),'player observed own stagger phase');for(const phase of ['knees','fall','flat'])assert.ok(phoneState.samples.some(s=>s.phase===phase),'player observed own '+phase+' phase');}assert.ok(phoneState.samples.some(s=>s.phase==='complete'&&s.elapsed>=1800),'player KO completed after its own two-second timeline '+JSON.stringify(phoneState.samples));}
  else if(mode==='friend'){assert.equal(await host.evaluate(()=>{const b=document.querySelector('#skip-ko'),shown=!b.hidden;b.click();return shown;}),true);}
  else if(mode==='groups'){await host.evaluate(()=>{window.confirm=()=>true;document.querySelector('#reset-game').click();});}
  else await host.waitForFunction(()=>document.body.dataset.screen==='victory',{timeout:10000});
  if(mode==='groups'){await host.waitForFunction(()=>document.body.dataset.screen==='lobby',null,{timeout:5000});assert.equal(r.phase,'lobby','accepted Reset Match reaches lobby');}
  else assert.equal(r.phase,'finished','Skip is local-only; match remains finished');
  if(phoneState&&process.env.NO_PHONE_ASSERT)console.log('PLAYER_KO_DIAGNOSTIC',JSON.stringify(phoneState));
  const elapsed=Date.now()-began;
  if(mode==='bot'){assert.ok(elapsed>=1700,'KO tail should hold near 2s, actual '+elapsed);assert.ok(elapsed<=4200);}
  if(mode==='friend'){assert.equal(r.phase,'finished','host Skip is local-only; server remains finished');await host.waitForFunction(()=>document.body.dataset.screen==='victory');}
  results.push({mode,koTailMs:elapsed,serverPhase:r.phase,skip:mode==='friend',phone:!!phone,phoneMotion:phone?(process.env.PHONE_REDUCED==='1'?'reduce':'no-preference'):null,phoneState});
  if(mode!=='groups'){await host.reload({waitUntil:'domcontentloaded'});await host.waitForFunction(()=>document.body.dataset.screen==='victory',{timeout:20000});assert.equal(await host.locator('.battle-world-canvas').count(),0,'reconnect history does not replay a KO');}
  await hostCtx.close();await phoneCtx?.close();
 }
 await fs.writeFile(new URL('browser-results.json',dir),JSON.stringify({results,errors},null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}));
}finally{await browser.close();await game.close();}
