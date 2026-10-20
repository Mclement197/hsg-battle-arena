// Standalone native full-UI timing regression. No production routes, buffers or renderer are replaced.
// ROOT=/path/to/repo/game SYNC_DEVICES=desktop,phone,tablet SYNC_ALL=1 SYNC_EVIDENCE=/tmp/qa node test/action-sync-browser.mjs
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=process.env.ROOT || new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const out=process.env.SYNC_EVIDENCE || '/tmp/hsg-action-sync-native';
const {Arena}=await import(pathToFileURL(root+'/src/engine.mjs'));
const {createGameServer}=await import(pathToFileURL(root+'/src/server.mjs'));
const {chromium,devices}=await import(process.env.PLAYWRIGHT_MODULE);
const deviceNames=(process.env.SYNC_DEVICES||'desktop,phone,tablet').split(',');
const timing={
 'luca-di-grazia':[[.59,.055],[.40,.04],[.59,.245],[.385,.16]],
 'free-rider':[[.59,.065],[.40,.035],[.59,.25],[.59,.17]],
 'tryhard':[[.59,.09],[.40,0],[.59,.21],[.59,.14]],
 'assessment-hoodie':[[.59,.055],[.43,.12],[.40,.075],[.59,.16]],
 'trischli-warrior':[[.58,.15],[.43,.13],[.53,.095],[.59,.17]],
 'bad-teacher':[[.59,.035],[.59,.095],[.59,.15],[.385,.16]]
};
const moves=['attack','defend','heal','special'];
let clock=Date.now();const arena=new Arena({now:()=>clock,pick:()=>0});
const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const origin='http://127.0.0.1:'+port,game=createGameServer({arena,autoTick:false,publicOrigin:origin});await new Promise(r=>game.server.listen(port,'127.0.0.1',r));
const room=arena.create(),host={role:'host'},a=arena.join(room,{nickname:'QA-A'}),b=arena.join(room,{nickname:'QA-B'});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--autoplay-policy=document-user-activation-required']});
const broadcast=()=>{for(const s of room.streams)s.res.write(`event: state
data: ${JSON.stringify(arena.snapshot(room,s.viewer))}

`);};
const rows=[],failures=[],errors=[],recovery=[];await fs.mkdir(out,{recursive:true});
function observe(){
 window.syncProbe={starts:[],frames:[],events:[],buffers:{},timing:{}};
 const Native=window.AudioContext;window.AudioContext=class extends Native{
  constructor(...args){super(...args);syncProbe.context=this;const create=this.createBufferSource.bind(this);
   this.createBufferSource=()=>{const s=create(),start=s.start.bind(s),stop=s.stop.bind(s);let record;
    s.start=(...args)=>{const buffer=s.buffer,signature=buffer.duration.toFixed(6)+':'+[.02,.17,.37,.61,.89].map(f=>buffer.getChannelData(0)[Math.floor((buffer.length-1)*f)].toFixed(6)).join(',');
     record={perf:performance.now(),at:this.currentTime,when:args[0]??0,offset:args[1]||0,duration:buffer.duration,loop:s.loop,key:syncProbe.buffers[signature],baseLatency:this.baseLatency,outputLatency:this.outputLatency};syncProbe.starts.push(record);return start(...args);};
    s.addEventListener('ended',()=>{if(record){record.endedAt=performance.now();record.endedAudioAt=this.currentTime;}});
    s.stop=(...args)=>{if(record){record.stoppedAt=performance.now();record.stoppedAudioAt=this.currentTime;}return stop(...args);};return s;
   };
  }
 };
}
async function probe(page){
 await page.evaluate(async timing=>{
  syncProbe.timing=timing;const appURL=[...document.scripts].find(s=>s.src.includes('/app.js')).src;
  const source=await(await fetch(appURL)).text();const imported=name=>new URL(source.match(new RegExp("from '(./"+name+"[^']*)'"))[1],location.href).href;
  const {BattleWorld}=await import(imported('battle-world.js'));const {BattlePresentation}=await import(imported('battle-contract.js'));
  const mod=await import(appURL),offline=new OfflineAudioContext(1,1,syncProbe.context.sampleRate);
  for(const [key,url]of Object.entries({...mod.ACTION_SOUNDS,...mod.THEMED_ACTION_SOUNDS})){try{const b=await offline.decodeAudioData(await(await fetch(url)).arrayBuffer());syncProbe.buffers[b.duration.toFixed(6)+':'+[.02,.17,.37,.61,.89].map(f=>b.getChannelData(0)[Math.floor((b.length-1)*f)].toFixed(6)).join(',')]=key;}catch{/* Deliberately broken optional buffers have no native source signature. */}}
  const consume=BattlePresentation.prototype.consume;BattlePresentation.prototype.consume=function(s){if(s.lastResult&&!syncProbe.events.some(e=>e.type==='receive'&&e.id===s.roomId+':'+s.match+':'+s.lastResult.turnId))syncProbe.events.push({type:'receive',id:s.roomId+':'+s.match+':'+s.lastResult.turnId,perf:performance.now()});return consume.call(this,s);};
  const begin=BattleWorld.prototype.begin;BattleWorld.prototype.begin=function(e,now){syncProbe.world=this;syncProbe.lastEvent=e;syncProbe.events.push({type:'begin',id:e.id,perf:performance.now(),label:e.ability.label});
   if(!this.renderer.__syncProbe){this.renderer.__syncProbe=true;const render=this.renderer.render.bind(this.renderer);this.renderer.render=(...args)=>{
    const active=this.active,elapsed=syncProbe.elapsed;const before=performance.now();const r=render(...args);
    if(active&&this.active===active){syncProbe.frames.push({id:active.id,elapsed,before,perf:performance.now(),tableau:this.motion.matches,hoodieFreedomVisible:this.fx?.userData.recipe.prop==='jacket'?this.fx.userData.parts.secondary.visible:undefined});if(syncProbe.stallNext){syncProbe.stallNext=false;const start=performance.now();while(performance.now()-start<2600){}syncProbe.events.push({type:'stall',id:active.id,perf:performance.now(),duration:2600});}}return r;
   };}return begin.call(this,e,now);
  };
  const animate=BattleWorld.prototype.animate;BattleWorld.prototype.animate=function(now){if(this.active)syncProbe.elapsed=now-this.active.startedAt;return animate.call(this,now);};
  const finish=BattleWorld.prototype.finish;BattleWorld.prototype.finish=function(){if(this.active)syncProbe.events.push({type:'finish',id:this.active.id,perf:performance.now()});return finish.call(this);};
 },timing);
}
async function clear(page){await page.evaluate(()=>{syncProbe.starts=[];syncProbe.frames=[];syncProbe.events=[];});}
async function settled(page,eventId=null){await page.waitForFunction(id=>syncProbe.events.some(x=>x.type==='finish'&&(!id||x.id===id)),eventId,{timeout:30000});}
async function resolve(move,{lethal=false}={}){const side=room.turn.team;room.teams.A.hp=room.teams.B.hp=lethal?1:100;room.teams.A.shield=room.teams.B.shield=false;room.teams[side].specialReadyOwnTurn=0;arena.vote(room,{role:'player',player:side==='A'?a.player:b.player},{turnId:room.turn.id,move});broadcast();clock=room.turn.deadline;game.tick();return room.id+':'+room.match+':'+room.lastResult.turnId;}
async function collect(page,device,id,move,eventId,scenario='single'){
 const raw=await page.evaluate(()=>({starts:syncProbe.starts.filter(s=>!s.loop&&s.duration<1),frames:syncProbe.frames,events:syncProbe.events}));
 const [phase,namedAccent]=timing[id][moves.indexOf(move)],accent=process.env.SYNC_GENERIC==='1'?[0,0,.24,.15][moves.indexOf(move)]:namedAccent,key=process.env.SYNC_GENERIC==='1'?move:id+':'+move,anchor=phase*2200,frames=raw.frames.filter(f=>f.id===eventId),marker=frames.find(f=>f.tableau||f.elapsed>=anchor-.001),source=raw.starts.find(s=>s.key===key);
 const begin=raw.events.find(e=>e.type==='begin'&&e.id===eventId),receipt=raw.events.find(e=>e.type==='receive'&&e.id===eventId);
 const acoustic=source?source.perf+Math.max(0,(source.when-source.at+accent-source.offset)*1000):null;
 const row={device,id,move,eventId,scenario,phase,accent,source,marker,begin,receipt,engineResidualMs:source&&marker?acoustic-marker.perf:null,estimatedOutputResidualMs:source&&marker?acoustic-marker.perf+1000*(source.outputLatency||0):null,frameGaps:frames.slice(1).map((f,i)=>f.perf-frames[i].perf),disposition:source?'played':'skipped',raw};
 rows.push(row);console.log('TIMING',JSON.stringify({...row,raw:undefined,frameGaps:undefined}));
 if(id==='assessment-hoodie'&&move==='heal'&&marker&&!marker.hoodieFreedomVisible)failures.push(device+' hoodie heal: FREEDOM hidden on marker frame');
 if(!source||!marker)failures.push(device+' '+id+' '+move+': source/visible marker missing');
 else if(Math.abs(row.engineResidualMs)>100)failures.push(device+' '+id+' '+move+': accent residual '+row.engineResidualMs.toFixed(1)+'ms');
 if(raw.starts.filter(s=>s.key===key).length!==1)failures.push(device+' '+id+' '+move+': not exactly one cue');
 return row;
}
try{
 for(const device of deviceNames){
  if(room.phase!=='lobby')arena.reset(room,host,{});
  const options=device==='phone'?devices['iPhone 13']:device==='tablet'?devices['iPad (gen 7)']:{viewport:{width:1100,height:760}};
  // Low raster reduces software WebGL cost without changing CSS viewport, native RAF, animation clock or geometry.
  const context=await browser.newContext({...options,deviceScaleFactor:Number(process.env.SYNC_DPR||.5),reducedMotion:'no-preference'});context.setDefaultTimeout(25000);await context.addInitScript(observe);
  const role=device==='desktop'?'host':'player',token=role==='host'?room.hostToken:a.playerToken;
  await context.addInitScript(({role,token,id})=>{sessionStorage.setItem('hsg-arena:v1:'+role+':'+id,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room:id,role}));},{role,token,id:room.id});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));if(process.env.SYNC_GENERIC==='1')await page.route(/(?:luca-di-grazia|free-rider|tryhard|assessment-hoodie|trischli-warrior|bad-teacher)-(?:attack|defend|heal|special)[.]wav/,route=>route.fulfill({status:200,contentType:'audio/wav',body:'intentionally broken optional named buffer'}));await page.goto(origin+'/game/');await page.locator('#sound-hint').click({force:true});await page.waitForFunction(()=>document.querySelector('#mute').dataset.audioState==='ready'&&document.querySelector('#connection').textContent==='Connected');await probe(page);
  for(const id of process.env.SYNC_ALL==='1'?Object.keys(timing):['luca-di-grazia']){
   if(room.phase!=='lobby')arena.reset(room,host,{});arena.configure(room,host,{arenaId:'library',characterA:id,characterB:id});broadcast();
   await page.waitForFunction(()=>document.body.dataset.screen==='lobby'||document.querySelector('#player-state').textContent.includes('presenter'));
   arena.start(room,host,{});broadcast();await page.waitForFunction(()=>!document.querySelector('#prebattle').hidden);clock=room.prebattle.deadline;game.tick();await page.waitForFunction(()=>document.querySelector('[data-world-status="ready"]'));
   if(process.env.SYNC_CAPTURE==='1'){
    const layout=await page.evaluate(()=>{const c=document.querySelector('.battle-world-canvas'),r=c.getBoundingClientRect();return{screen:document.body.dataset.screen,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,canvas:[r.width,r.height],horizontalOverflow:document.documentElement.scrollWidth-innerWidth,userAgent:navigator.userAgent};});
    recovery.push({device,label:'native CSS/layout capture',layout});await page.screenshot({path:out+'/'+device+'-'+id+'.png'});assert.ok(layout.canvas.every(v=>v>0));assert.ok(layout.horizontalOverflow<=2);
   }
   for(const move of process.env.SYNC_ONLY_LIFECYCLE==='1'?[]:moves){await clear(page);const eventId=await resolve(move);await settled(page);await collect(page,device,id,move,eventId);}
   if(process.env.SYNC_MATRIX==='1'){
    await clear(page);const queued=[];for(const move of moves)queued.push([move,await resolve(move)]);
    await page.waitForFunction(()=>syncProbe.events.filter(e=>e.type==='finish').length===4,undefined,{timeout:60000});
    for(const [move,eventId]of queued)await collect(page,device,id,move,eventId,'queue');
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const move of moves){await clear(page);const eventId=await resolve(move);await settled(page);await collect(page,device,id,move,eventId,'tableau');}
    await page.emulateMedia({reducedMotion:'no-preference'});
    for(const move of moves){await clear(page);await page.evaluate(()=>{syncProbe.stallNext=true;});const eventId=await resolve(move);await settled(page);await collect(page,device,id,move,eventId,'severe-stall');}
   }
  }
  // Different moves arriving before the first completes must have independent presentation-owned sources.
  if(process.env.SYNC_MATRIX!=='1'&&process.env.SYNC_ONLY_LIFECYCLE!=='1'){await clear(page);const id=room.teams.A.characterId,one=await resolve('attack'),two=await resolve('defend');
  await page.waitForFunction(()=>syncProbe.events.filter(x=>x.type==='finish').length===2,undefined,{timeout:30000});await collect(page,device,id,'attack',one,'queue');await collect(page,device,id,'defend',two,'queue');
  await page.emulateMedia({reducedMotion:'reduce'});await clear(page);const reduced=await resolve('heal');await settled(page);await collect(page,device,id,'heal',reduced,'tableau');await page.emulateMedia({reducedMotion:'no-preference'});}
  if(process.env.SYNC_FAST_TAIL==='1'){
   // Reach the real rendered marker and source, then advance ONLY the test clock
   // into completion in the same JS turn. A slow next RAF cannot mask a cut.
   await resolve('defend');await settled(page);
   await page.exposeFunction('syncFastBoundary',boundary=>{
    if(boundary==='reset'){arena.reset(room,host,{});broadcast();}
    if(boundary==='reconnect')for(const stream of [...room.streams])stream.res.end();
   });
   const restart=async()=>{
    arena.reset(room,host,{});broadcast();await page.waitForFunction(()=>document.body.dataset.screen==='lobby'||document.body.dataset.screen==='player');
    arena.start(room,host,{});broadcast();await page.waitForFunction(()=>!document.querySelector('#prebattle').hidden);clock=room.prebattle.deadline;game.tick();
    await page.waitForFunction(()=>document.querySelector('[data-world-status="ready"]'));
   };
   for(const boundary of ['natural',...(process.env.SYNC_FAST_BOUNDARIES===undefined?['mute','suspend','hidden','reconnect','reset','leave']:process.env.SYNC_FAST_BOUNDARIES.split(',').filter(Boolean))]){
    if(boundary!=='natural')await restart();
    await clear(page);
    await page.evaluate(boundary=>{
     const w=syncProbe.world,original=w.onPresent;syncProbe.fastDone=false;syncProbe.fastBoundary=boundary;
     w.onPresent=(e,frame)=>{
      original(e,frame);const source=syncProbe.starts.find(s=>s.key===e.characterId+':'+e.move);
      if(syncProbe.fastDone||e.move!=='special'||!source)return;
      const anchor=syncProbe.timing[e.characterId][3][0]*e.ability.duration;
      if(boundary==='natural'&&!frame.tableau&&frame.elapsed<anchor-.001)return;
      syncProbe.fastDone=true;syncProbe.fastId=e.id;syncProbe.fastFrame=frame;syncProbe.fastAt=performance.now();
      // Cancel only the harness's next world RAF, not browser RAF/audio/SSE.
      // This prevents expensive raster from concealing an early explicit stop.
      cancelAnimationFrame(w.raf);w.onPresent=original;
      if(boundary==='natural')w.animate(e.startedAt+e.ability.duration+1);
      if(boundary==='mute')document.querySelector('#mute').click();
      if(boundary==='suspend')syncProbe.context.suspend();
      if(boundary==='hidden'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}
      if(boundary==='leave')document.querySelector('#main-menu').click();
      if(['reset','reconnect'].includes(boundary))void window.syncFastBoundary(boundary);
      syncProbe.fastAfter=performance.now();
     };
    },boundary);
    const eventId=await resolve('special',{lethal:boundary==='natural'});
    await page.waitForFunction(()=>syncProbe.fastDone);
    if(boundary==='reset')await page.waitForFunction(()=>syncProbe.world.state?.phase==='lobby');
    if(boundary==='natural')await page.waitForFunction(()=>document.body.dataset.screen==='victory');
    else await page.waitForFunction(()=>syncProbe.starts.some(s=>s.key==='luca-di-grazia:special'&&s.stoppedAt!==undefined),undefined,{timeout:2000}).catch(async error=>{throw new Error(boundary+' active stop missing: '+JSON.stringify(await page.evaluate(()=>({starts:syncProbe.starts,fast:syncProbe.fastBoundary,done:syncProbe.fastDone,screen:document.body.dataset.screen,muted:document.querySelector('#mute').dataset.audioState}))),{cause:error});});
    if(boundary==='natural')await page.waitForFunction(()=>syncProbe.starts.some(s=>s.key==='luca-di-grazia:special'&&s.endedAt!==undefined));
    const proof=await page.evaluate(()=>({starts:syncProbe.starts,events:syncProbe.events,frame:syncProbe.fastFrame,fastAt:syncProbe.fastAt,after:syncProbe.fastAfter,at:syncProbe.context.currentTime}));
    const source=proof.starts.find(s=>s.key==='luca-di-grazia:special'),remainingMs=(source.duration-source.offset)*1000;
    const evidence={device,label:'FAST emitted tail '+boundary,remainingMs,proof,passed:false};recovery.push(evidence);
    if(boundary==='natural'){
     const done=proof.events.find(e=>e.type==='finish'&&e.id===eventId);
     assert.ok(done.perf>=proof.fastAt,'completion follows the real rendered semantic cue');
     assert.ok(done.perf-source.perf<remainingMs-200,'FAST completion must leave at least 200ms of emitted tail alive');
     assert.equal(source.stoppedAt,undefined,'FIRST victory clear must not truncate the active native tail');
     assert.ok((source.endedAudioAt-source.at)*1000>=remainingMs-15,'native source must reach its complete audio-clock tail');
     const wins=proof.starts.filter(s=>s.duration>5&&s.duration<6&&!s.loop);assert.equal(wins.length,1);assert.ok(wins[0].perf>=done.perf);
    }else{
     assert.ok((source.stoppedAudioAt-source.at)*1000<remainingMs-10,boundary+' must stop on the audio clock while the source is still active, not pass after natural end');
     if(['mute','hidden','leave'].includes(boundary))assert.ok(source.stoppedAt-source.perf<100,boundary+' synchronous cancellation');
    }
    evidence.passed=true;console.log('FAST-TAIL',device,boundary,JSON.stringify({remainingMs,source,after:proof.after}));
    if(boundary==='mute')await page.locator('#mute').click();
    if(boundary==='suspend'){await page.locator('#sound-hint').click({force:true});await page.waitForFunction(()=>syncProbe.context.state==='running');}
    if(boundary==='hidden')await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    if(boundary==='reconnect')await page.waitForFunction(()=>ArenaUI.connected);
    if(boundary==='leave'){await page.locator('#resume-game').click();await page.waitForFunction(()=>ArenaUI.connected);}
   }
   await context.close();continue;
  }
  if(process.env.SYNC_LIFECYCLE==='1'){
   const actions=()=>page.evaluate(()=>syncProbe.starts.filter(s=>!s.loop&&s.duration<1&&s.key&&(s.key.includes(':')||['attack','defend','heal','special'].includes(s.key))));
   const check=async(label,n)=>{const starts=await actions();assert.equal(starts.length,n,label);recovery.push({device,label,starts});console.log('LIFECYCLE',device,label,starts.length);};
   await resolve('defend');await settled(page);
   for(const boundary of process.env.SYNC_BOUNDARIES===undefined?['mute','suspend','hidden','reconnect','reset','leave']:process.env.SYNC_BOUNDARIES.split(',').filter(Boolean)){
    await clear(page);
    await page.evaluate(boundary=>{
     const w=syncProbe.world;syncProbe.originalPresent=w.onPresent;syncProbe.boundaryReached=false;
     w.onPresent=(e,frame)=>{
      if(!syncProbe.boundaryReached){
       syncProbe.boundaryReached=true;
       if(boundary==='mute')document.querySelector('#mute').click();
       if(boundary==='suspend')syncProbe.context.suspend();
       if(boundary==='hidden'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}
       if(boundary==='leave')document.querySelector('#main-menu').click();
      }
      syncProbe.originalPresent(e,frame);
     };
    },boundary);
    if(boundary==='reconnect'){
     await context.setOffline(true);for(const stream of [...room.streams])stream.res.end();await page.waitForFunction(()=>!ArenaUI.connected);
    }
    await resolve('attack');await resolve('special');
    if(boundary==='reset'){arena.reset(room,host,{});broadcast();await page.waitForFunction(()=>document.querySelector('#lobby-screen').hidden===false||document.body.dataset.screen==='player');recovery.push({device,label:'sources before reset reached UI (not retroactively silenceable)',starts:await actions()});await clear(page);}
    if(!['reconnect','reset'].includes(boundary))await page.waitForFunction(()=>syncProbe.boundaryReached);
    await page.waitForTimeout(2800);await check(boundary+' consumes authorized/missed queue',0);
    await page.evaluate(()=>{
     const w=syncProbe.world;w.onPresent=syncProbe.originalPresent;
     if(syncProbe.lastEvent)w.onPresent(syncProbe.lastEvent,{elapsed:1298,tableau:true});
     if(Object.hasOwn(document,'hidden')){delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));}
    });await check(boundary+' stale callback remains silent',0);
    if(boundary==='mute')await page.locator('#mute').click();
    if(boundary==='suspend'){await page.locator('#sound-hint').click({force:true});await page.waitForFunction(()=>syncProbe.context.state==='running');}
    if(boundary==='reconnect'){await context.setOffline(false);await page.waitForFunction(()=>ArenaUI.connected);}
    if(boundary==='leave'){await page.locator('#resume-game').click();await page.waitForFunction(()=>ArenaUI.connected);}
    if(boundary==='reset'){arena.start(room,host,{});broadcast();await page.waitForFunction(()=>!document.querySelector('#prebattle').hidden);clock=room.prebattle.deadline;game.tick();await page.waitForFunction(()=>document.querySelector('[data-world-status="ready"]'));}
    await clear(page);const freshId=await resolve('attack');await settled(page,freshId);await check('fresh event after '+boundary,1);
   }
   // Final authoritative hit must render its existing marker before completion/victory.
   await clear(page);await page.evaluate(()=>{syncProbe.stallNext=true;});const lethal=await resolve('special',{lethal:true});await settled(page);
   const final=await collect(page,device,room.teams.A.characterId,'special',lethal,'final-hit-stall');
   const done=final.raw.events.find(e=>e.type==='finish'&&e.id===lethal);assert.ok(done.perf>final.marker.perf,'marker frame precedes final completion');assert.equal(final.source.stoppedAt,undefined,'natural victory transition must not cut an emitted action tail');
   await page.waitForFunction(()=>document.body.dataset.screen==='victory');
   const wins=await page.evaluate(()=>syncProbe.starts.filter(s=>s.duration>5&&s.duration<6&&!s.loop));assert.equal(wins.length,1);assert.ok(wins[0].perf>=done.perf);recovery.push({device,label:'final marker -> completion -> one unchanged victory source',marker:final.marker.perf,complete:done.perf,victory:wins[0]});
   // Reset before forcing genuine renderer loss; new events use a visible label on RAF.
   arena.reset(room,host,{});broadcast();await page.waitForFunction(()=>document.body.dataset.screen==='lobby'||document.body.dataset.screen==='player');arena.start(room,host,{});broadcast();await page.waitForFunction(()=>!document.querySelector('#prebattle').hidden);clock=room.prebattle.deadline;game.tick();await page.waitForFunction(()=>document.querySelector('[data-world-status="ready"]'));
   await clear(page);const warmup=await resolve('defend');await settled(page,warmup);await page.evaluate(()=>syncProbe.world.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());await page.waitForFunction(()=>syncProbe.world.fallback);
   await clear(page);await resolve('heal');await page.waitForFunction(()=>syncProbe.starts.some(s=>s.key?.endsWith(':heal')));await check('renderer failure new event visible-label fallback',1);assert.ok((await page.locator('.world-action-label').last().textContent()).length>0);
  }
  await context.close();
 }
 await fs.writeFile(out+'/timing.json',JSON.stringify({version:browser.version(),root,dpr:Number(process.env.SYNC_DPR||.5),rows,failures,errors,recovery},null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);console.log('PASS',rows.length,'full-render semantic/acoustic-accent cases;',recovery.filter(r=>r.label.startsWith('FAST emitted tail')&&r.passed).length,'fast-tail cases');
}catch(e){await fs.writeFile(out+'/timing.json',JSON.stringify({version:browser.version(),root,rows,failures,errors,recovery,fatal:e.stack},null,2));console.error(e);process.exitCode=1;}finally{await browser.close();await game.close();}
