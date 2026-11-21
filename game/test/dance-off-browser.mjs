// Target-only native full-UI acceptance. PCM, playback, SSE and renderer remain native.
// Default matrix: SYNC_MATRIX=1; active-tail boundaries: SYNC_ONLY_LIFECYCLE=1 SYNC_FAST_TAIL=1.
// Strict 100ms is unchanged. Measure the extracted transient in native mixed PCM, not only source.start.
// ROOT=/path/to/repo/game SYNC_COMPARE=1 compares three moving cues per layout, reading that root's timing.
// SYNC_ONLY_FALLBACK=1 tests fresh/stalled/recovered renderer-loss labels. Evidence stays in /tmp.
// SYNC_POSTSTART_STALL=1 injects a 2.3s block after bed start; the independent marker must still pass.
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
const {actionSoundTiming:currentTiming}=await import(pathToFileURL(root+'/public/battle-contract.js'));
const timing={'trischli-warrior':['attack','defend','heal','special'].map(m=>{const t=currentTiming(m,'trischli-warrior:'+m);return[t.phase,t.accent];})};
const moves=['attack','defend','heal','special'];
const danceMoves=['attack'];
let clock=Date.now();const arena=new Arena({now:()=>clock,pick:()=>0});
const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const origin='http://127.0.0.1:'+port,game=createGameServer({arena,autoTick:false,publicOrigin:origin});await new Promise(r=>game.server.listen(port,'127.0.0.1',r));
const room=arena.create(),host={role:'host'},a=arena.join(room,{nickname:'QA-A'}),b=arena.join(room,{nickname:'QA-B'});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--autoplay-policy=document-user-activation-required']});
const broadcast=()=>{for(const s of room.streams)s.res.write(`event: state
data: ${JSON.stringify(arena.snapshot(room,s.viewer))}

`);};
const rows=[],failures=[],errors=[],recovery=[];await fs.mkdir(out,{recursive:true});
const captureCode="class Capture extends AudioWorkletProcessor{constructor(){super();this.data=new Float32Array(4096);this.used=0;this.start=0;this.peak=0;}process(inputs){const channels=inputs[0];if(!channels?.length)return true;const n=channels[0].length;for(let i=0;i<n;i++){if(!this.used)this.start=currentFrame+i;let v=0;for(const c of channels){v+=c[i]/channels.length;this.peak=Math.max(this.peak,Math.abs(c[i]));}this.data[this.used++]=v;if(this.used===4096){this.port.postMessage({frame:this.start,samples:this.data,peak:this.peak});this.peak=0;this.data=new Float32Array(4096);this.used=0;}}return true;}}registerProcessor('capture',Capture);";
// Test-only same-origin worklet endpoint: no production server/asset change.
const referenceAccent=await fs.readFile(new URL('../public/assets/audio/trischli-warrior-attack-accent.wav',import.meta.url));
const requestHandler=game.server.listeners('request')[0];game.server.removeListener('request',requestHandler);
game.server.on('request',(req,res)=>{if(req.url==='/game/dance-capture-worklet.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(captureCode);}else if(req.url==='/game/dance-reference-accent.wav'){res.writeHead(200,{'content-type':'audio/wav'});res.end(referenceAccent);}else requestHandler(req,res);});
function observe({blockAfterStart=false}={}){
 window.syncProbe={blockAfterStart,starts:[],frames:[],events:[],buffers:{},timing:{},pcm:[]};
 const Native=window.AudioContext;window.AudioContext=class extends Native{
  constructor(...args){super(...args);syncProbe.context=this;

   syncProbe.captureReady=this.audioWorklet.addModule('/game/dance-capture-worklet.js').then(()=>{
    const tap=new AudioWorkletNode(this,'capture',{numberOfInputs:1,numberOfOutputs:1});tap.connect(this.destination);
    tap.port.onmessage=e=>syncProbe.pcm.push(e.data);return tap;
   });
   const createGain=this.createGain.bind(this);this.createGain=()=>{const g=createGain(),connect=g.connect.bind(g);g.connect=(target,...args)=>{if(target===this.destination)void syncProbe.captureReady.then(tap=>connect(tap));return connect(target,...args);};return g;};
   const create=this.createBufferSource.bind(this);
   this.createBufferSource=()=>{const s=create(),start=s.start.bind(s),stop=s.stop.bind(s);let record;
    s.start=(...args)=>{const buffer=s.buffer,signature=buffer.duration.toFixed(6)+':'+[.02,.17,.37,.61,.89].map(f=>buffer.getChannelData(0)[Math.floor((buffer.length-1)*f)].toFixed(6)).join(',');
     record={eventStartedAt:syncProbe.world?.active?.startedAt,outputStamp:this.getOutputTimestamp(),actionId:syncProbe.world?.active?.id,perf:performance.now(),at:this.currentTime,when:args[0]??0,offset:args[1]||0,duration:buffer.duration,loop:s.loop,key:syncProbe.buffers[signature],baseLatency:this.baseLatency,outputLatency:this.outputLatency};syncProbe.starts.push(record);const result=start(...args);
     if(syncProbe.blockAfterStart&&record.key==='trischli-warrior:attack'){
      syncProbe.blockAfterStart=false;const began=performance.now(),audioBefore=this.currentTime;
      while(performance.now()-began<2300){}
      record.postStartStall={wallMs:performance.now()-began,audioAdvanceMs:(this.currentTime-audioBefore)*1000};
     }return result;};
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
  const mod=await import(appURL),offline=new OfflineAudioContext(1,1,syncProbe.context.sampleRate);await syncProbe.captureReady;syncProbe.hasStems=!!mod.ACTION_ACCENTS;
  const reference=await offline.decodeAudioData(await(await fetch('/game/dance-reference-accent.wav')).arrayBuffer());syncProbe.accentPCM=Array.from(reference.getChannelData(0).slice(0,Math.round(reference.sampleRate*.08)));
  for(const [key,url]of Object.entries({...mod.ACTION_SOUNDS,...mod.THEMED_ACTION_SOUNDS,...mod.ACTION_ACCENTS})){try{const b=await offline.decodeAudioData(await(await fetch(url)).arrayBuffer());if(key==='trischli-warrior:attack:accent')syncProbe.accentPCM=Array.from(b.getChannelData(0).slice(0,Math.round(b.sampleRate*.08)));if(key==='attack')syncProbe.genericPCM=Array.from(b.getChannelData(0).slice(0,Math.round(b.sampleRate*.08)));syncProbe.buffers[b.duration.toFixed(6)+':'+[.02,.17,.37,.61,.89].map(f=>b.getChannelData(0)[Math.floor((b.length-1)*f)].toFixed(6)).join(',')]=key;}catch{/* Deliberately broken optional buffers have no native source signature. */}}
  const consume=BattlePresentation.prototype.consume;BattlePresentation.prototype.consume=function(s){if(s.lastResult&&!syncProbe.events.some(e=>e.type==='receive'&&e.id===s.roomId+':'+s.match+':'+s.lastResult.turnId))syncProbe.events.push({type:'receive',id:s.roomId+':'+s.match+':'+s.lastResult.turnId,perf:performance.now()});return consume.call(this,s);};
  const begin=BattleWorld.prototype.begin;BattleWorld.prototype.begin=function(e,now){syncProbe.world=this;syncProbe.lastEvent=e;syncProbe.events.push({type:'begin',id:e.id,perf:performance.now(),label:e.ability.label});
   if(!this.renderer.__syncProbe){this.renderer.__syncProbe=true;const render=this.renderer.render.bind(this.renderer);this.renderer.render=(...args)=>{
    const active=this.active,elapsed=syncProbe.elapsed;const before=performance.now();const r=render(...args);
    if(active&&this.active===active){syncProbe.frames.push({id:active.id,eventStartedAt:active.startedAt,audioAt:syncProbe.context.currentTime,outputStamp:syncProbe.context.getOutputTimestamp(),elapsed,before,perf:performance.now(),tableau:this.motion.matches,hoodieFreedomVisible:this.fx?.userData.recipe.prop==='jacket'?this.fx.userData.parts.secondary.visible:undefined});if(syncProbe.stallNext){syncProbe.stallNext=false;const start=performance.now();while(performance.now()-start<2600){}syncProbe.events.push({type:'stall',id:active.id,perf:performance.now(),duration:2600});}}return r;
   };}return begin.call(this,e,now);
  };
  const animate=BattleWorld.prototype.animate;BattleWorld.prototype.animate=function(now){if(this.active)syncProbe.elapsed=now-this.active.startedAt;return animate.call(this,now);};
  const finish=BattleWorld.prototype.finish;BattleWorld.prototype.finish=function(){if(this.active)syncProbe.events.push({type:'finish',id:this.active.id,perf:performance.now()});return finish.call(this);};
 },timing);
}
async function clear(page){await page.evaluate(()=>{syncProbe.starts=[];syncProbe.frames=[];syncProbe.events=[];syncProbe.pcm=[];});}
async function settled(page,eventId=null){await page.waitForFunction(id=>syncProbe.events.some(x=>x.type==='finish'&&(!id||x.id===id)),eventId,{timeout:30000});}
async function resolve(move,{lethal=false}={}){const side=room.turn.team;room.teams.A.hp=room.teams.B.hp=lethal?1:100;room.teams.A.shield=room.teams.B.shield=false;room.teams[side].specialReadyOwnTurn=0;arena.vote(room,{role:'player',player:side==='A'?a.player:b.player},{turnId:room.turn.id,move});broadcast();clock=room.turn.deadline;game.tick();return room.id+':'+room.match+':'+room.lastResult.turnId;}
async function collect(page,device,id,move,eventId,scenario='single'){
 await page.evaluate(({eventId,move})=>{syncProbe.measureId=eventId;syncProbe.measureMove=move;},{eventId,move});
 const raw=await page.evaluate(()=>{
  let transient=null;const sources=syncProbe.starts.filter(s=>s.actionId===syncProbe.measureId);
  const src=sources.find(s=>s.key===syncProbe.measureMove)||sources.find(s=>s.key==='trischli-warrior:attack:accent')||sources.find(s=>s.key==='trischli-warrior:attack');
  const generic=src?.key===syncProbe.measureMove,template=generic?syncProbe.genericPCM:syncProbe.accentPCM;
  if(src&&template){
   const rate=syncProbe.context.sampleRate,nominal=src.when+(generic||src.key.endsWith(':accent')?0:1.276)-src.offset,lo=Math.floor((nominal-.08)*rate),hi=Math.ceil((nominal+.15)*rate);
   const pcm=new Float32Array(hi-lo+template.length);for(const block of syncProbe.pcm)for(let i=Math.max(0,lo-block.frame);i<block.samples.length&&block.frame+i<lo+pcm.length;i++)pcm[block.frame+i-lo]=block.samples[i];
   let best=-Infinity,index=0;const score=k=>{let sum=0;for(let i=0;i<template.length;i+=4)sum+=template[i]*pcm[k+i];return sum;};
   for(let k=0;k<=hi-lo;k+=8){const v=score(k);if(v>best){best=v;index=k;}}
   const center=index;for(let k=Math.max(0,center-8);k<=Math.min(hi-lo,center+8);k++){const v=score(k);if(v>best){best=v;index=k;}}
   let dot=0,a=0,b=0;for(let i=0;i<template.length;i++){dot+=template[i]*pcm[index+i];a+=template[i]**2;b+=pcm[index+i]**2;}
   transient={audioTime:(lo+index)/rate,correlation:dot/Math.sqrt(a*b),peak:Math.max(...pcm.map(Math.abs)),key:src.key,method:'native mixed output PCM / selected-source template correlation'};
  }
  return{mixedOutputPeak:Math.max(0,...syncProbe.pcm.map(b=>b.peak||0)),hasStems:syncProbe.hasStems,transient,starts:syncProbe.starts.filter(s=>!s.loop&&s.key),frames:syncProbe.frames,events:syncProbe.events};
 });
 const [phase,namedAccent]=timing[id][moves.indexOf(move)],accent=process.env.SYNC_GENERIC==='1'?[0,0,.24,.15][moves.indexOf(move)]:raw.hasStems&&move==='attack'?0:namedAccent,key=process.env.SYNC_GENERIC==='1'?move:raw.hasStems&&move==='attack'?id+':'+move+':accent':id+':'+move,anchor=phase*2200,frames=raw.frames.filter(f=>f.id===eventId),marker=frames.find(f=>f.tableau||f.elapsed>=anchor-.001),source=raw.starts.find(s=>s.key===key&&s.actionId===eventId);
 const begin=raw.events.find(e=>e.type==='begin'&&e.id===eventId),receipt=raw.events.find(e=>e.type==='receive'&&e.id===eventId);
 const acoustic=source?source.perf+Math.max(0,(source.when-source.at+(marker?.tableau?source.offset:accent)-source.offset)*1000):null;
 const row={mixedOutputPeak:raw.mixedOutputPeak,maxMix:process.env.SYNC_MAX_MIX==='1',transient:raw.transient,pcmResidualMs:raw.transient&&source&&marker?source.perf+(raw.transient.audioTime-source.at)*1000-marker.perf:null,bedSource:raw.starts.find(s=>s.key===id+':'+move&&s.actionId===eventId),audioResidualMs:source&&marker?1000*(source.when+accent-source.offset-marker.audioAt):null,outputResidualMs:source&&marker?marker.outputStamp.performanceTime+1000*(source.when+accent-source.offset-marker.outputStamp.contextTime)-marker.perf:null,markerLatenessMs:marker?marker.perf-marker.eventStartedAt-anchor:null,sourceEpochErrorMs:source?source.perf-source.offset*1000-source.eventStartedAt:null,device,id,move,eventId,scenario,phase,accent,source,marker,begin,receipt,engineResidualMs:source&&marker?acoustic-marker.perf:null,estimatedOutputResidualMs:source&&marker?acoustic-marker.perf+1000*(source.outputLatency||0):null,frameGaps:frames.slice(1).map((f,i)=>f.perf-frames[i].perf),disposition:source?'played':'skipped',raw};
 rows.push(row);console.log('TIMING',JSON.stringify({...row,raw:undefined,frameGaps:undefined}));
 if(scenario==='severe-stall'&&raw.starts.some(s=>s.key===id+':'+move&&s.actionId===eventId))failures.push(device+' stale full score sounded after end-crossing stall');
 if(!source||!marker)failures.push(device+' '+id+' '+move+': source/visible marker missing');
 else if(Math.abs(row.engineResidualMs)>100)failures.push(device+' '+id+' '+move+': accent residual '+row.engineResidualMs.toFixed(1)+'ms');
 if(raw.mixedOutputPeak>=1)failures.push(device+' native summed output clips');
 if(source&&(!raw.transient||raw.transient.key!==key||raw.transient.correlation<.35||Math.abs(row.pcmResidualMs)>100))failures.push(device+' measured PCM accent absent or outside strict 100ms');
 if(process.env.SYNC_GENERIC==='1'&&raw.starts.some(s=>s.actionId===eventId&&s.key!==move))failures.push(device+' generic fallback emitted an unexpected named stem');
 if(raw.hasStems&&raw.starts.filter(s=>s.key===id+':'+move&&s.actionId===eventId).length>1)failures.push(device+' bed retrigger');
 if(raw.starts.filter(s=>s.key===key&&s.actionId===eventId).length!==1)failures.push(device+' '+id+' '+move+': not exactly one cue');
 return row;
}
try{
 for(const device of deviceNames){
  if(room.phase!=='lobby')arena.reset(room,host,{});
  const options=device==='phone'?devices['iPhone 13']:device==='tablet'?devices['iPad (gen 7)']:{viewport:{width:1100,height:760}};
  // Low raster reduces software WebGL cost without changing CSS viewport, native RAF, animation clock or geometry.
  const context=await browser.newContext({...options,deviceScaleFactor:Number(process.env.SYNC_DPR||.5),reducedMotion:'no-preference'});context.setDefaultTimeout(25000);await context.addInitScript(observe,{blockAfterStart:process.env.SYNC_POSTSTART_STALL==='1'});
  const role=device==='desktop'?'host':'player',token=role==='host'?room.hostToken:a.playerToken;
  await context.addInitScript(({role,token,id})=>{sessionStorage.setItem('hsg-arena:v1:'+role+':'+id,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room:id,role}));},{role,token,id:room.id});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));if(process.env.SYNC_GENERIC==='1')await page.route(/(?:luca-di-grazia|free-rider|tryhard|assessment-hoodie|trischli-warrior|bad-teacher)-(?:attack|defend|heal|special)[.]wav/,route=>route.fulfill({status:200,contentType:'audio/wav',body:'intentionally broken optional named buffer'}));await page.goto(origin+'/game/');await page.locator('#sound-hint').click({force:true});await page.waitForFunction(()=>document.querySelector('#mute').dataset.audioState==='ready'&&document.querySelector('#connection').textContent==='Connected');await probe(page);
  if(process.env.SYNC_MAX_MIX==='1')await page.evaluate(()=>{for(const id of ['volume-music','volume-sfx']){const input=document.getElementById(id);input.value='100';input.dispatchEvent(new Event('input',{bubbles:true}));}});
  for(const id of ['trischli-warrior']){
   if(room.phase!=='lobby')arena.reset(room,host,{});arena.configure(room,host,{arenaId:'library',characterA:id,characterB:id});broadcast();
   await page.waitForFunction(()=>document.body.dataset.screen==='lobby'||document.querySelector('#player-state').textContent.includes('presenter'));
   arena.start(room,host,{});broadcast();await page.waitForFunction(()=>!document.querySelector('#prebattle').hidden);clock=room.prebattle.deadline;game.tick();await page.waitForFunction(()=>document.querySelector('[data-world-status="ready"]'));
   if(process.env.SYNC_CAPTURE==='1'){
    const layout=await page.evaluate(()=>{const c=document.querySelector('.battle-world-canvas'),r=c.getBoundingClientRect();return{screen:document.body.dataset.screen,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,canvas:[r.width,r.height],horizontalOverflow:document.documentElement.scrollWidth-innerWidth,userAgent:navigator.userAgent};});
    recovery.push({device,label:'native CSS/layout capture',layout});await page.screenshot({path:out+'/'+device+'-'+id+'.png'});assert.ok(layout.canvas.every(v=>v>0));assert.ok(layout.horizontalOverflow<=2);
   }
   for(const move of process.env.SYNC_ONLY_LIFECYCLE==='1'||process.env.SYNC_ONLY_FALLBACK==='1'?[]:danceMoves){await clear(page);const eventId=await resolve(move);await settled(page);await collect(page,device,id,move,eventId);}
   if(process.env.SYNC_COMPARE==='1'){
    await clear(page);const queued=[];for(const move of ['attack','attack'])queued.push([move,await resolve(move)]);
    await page.waitForFunction(()=>syncProbe.events.filter(e=>e.type==='finish').length===2,undefined,{timeout:60000});
    for(const [move,eventId]of queued)await collect(page,device,id,move,eventId,'queue');
   }
   if(process.env.SYNC_MATRIX==='1'){
    await clear(page);const queued=[];for(const move of ['attack','attack'])queued.push([move,await resolve(move)]);
    await page.waitForFunction(()=>syncProbe.events.filter(e=>e.type==='finish').length===2,undefined,{timeout:60000});
    for(const [move,eventId]of queued)await collect(page,device,id,move,eventId,'queue');
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const move of danceMoves){await clear(page);const eventId=await resolve(move);await settled(page);await collect(page,device,id,move,eventId,'tableau');}
    await page.emulateMedia({reducedMotion:'no-preference'});
    for(const move of danceMoves){await clear(page);await page.evaluate(()=>{syncProbe.stallNext=true;});const eventId=await resolve(move);await settled(page);await collect(page,device,id,move,eventId,'severe-stall');}
   }
  }
  if(process.env.SYNC_COMPARE==='1'||process.env.SYNC_POSTSTART_STALL==='1'){await context.close();continue;}
  // Accelerated completion/cancellation checks keep native audio sources alive.
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
    await page.evaluate(({boundary,marker})=>{
     syncProbe.fastMarker=marker;
     const w=syncProbe.world,original=w.onPresent;syncProbe.fastDone=false;syncProbe.fastBoundary=boundary;
     w.onPresent=(e,frame)=>{
      original(e,frame);const source=syncProbe.starts.find(s=>s.key===e.characterId+':'+e.move);
      if(syncProbe.fastDone||e.move!=='attack'||!source)return;
      if(syncProbe.fastMarker&&!syncProbe.starts.some(s=>s.key===e.characterId+':'+e.move+':accent'&&s.actionId===e.id))return;
      const anchor=0;
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
    },{boundary,marker:process.env.SYNC_FAST_MARKER==='1'});
    const eventId=await resolve('attack',{lethal:boundary==='natural'});
    await page.waitForFunction(()=>syncProbe.fastDone);
    if(boundary==='reset')await page.waitForFunction(()=>syncProbe.world.state?.phase==='lobby');
    if(boundary==='natural')await page.waitForFunction(()=>document.body.dataset.screen==='victory');
    else await page.waitForFunction(()=>syncProbe.starts.some(s=>s.key==='trischli-warrior:attack'&&s.stoppedAt!==undefined),undefined,{timeout:2000}).catch(async error=>{throw new Error(boundary+' active stop missing: '+JSON.stringify(await page.evaluate(()=>({starts:syncProbe.starts,fast:syncProbe.fastBoundary,done:syncProbe.fastDone,screen:document.body.dataset.screen,muted:document.querySelector('#mute').dataset.audioState}))),{cause:error});});
    if(boundary==='natural')await page.waitForFunction(()=>syncProbe.starts.filter(s=>s.key?.startsWith('trischli-warrior:attack')).every(s=>s.endedAt!==undefined));
    const proof=await page.evaluate(()=>({starts:syncProbe.starts,events:syncProbe.events,frame:syncProbe.fastFrame,fastAt:syncProbe.fastAt,after:syncProbe.fastAfter,at:syncProbe.context.currentTime}));
    const source=proof.starts.find(s=>s.key==='trischli-warrior:attack'),remainingMs=(source.duration-source.offset)*1000;
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
     if(['mute','hidden','leave'].includes(boundary))assert.ok(source.stoppedAt-proof.fastAt<100,boundary+' synchronous cancellation from actual boundary, not earlier bed onset');
    }
    if(process.env.SYNC_FAST_MARKER==='1'){
     const pair=proof.starts.filter(s=>s.actionId===eventId&&s.key?.startsWith('trischli-warrior:attack'));
     assert.equal(pair.length,2,'same event emitted both stems before boundary');
     for(const voice of pair){if(boundary==='natural'){assert.equal(voice.stoppedAt,undefined);assert.ok(voice.endedAt!==undefined);}else assert.ok(voice.stoppedAt!==undefined,boundary+' stops BOTH event voices');}
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
  if(process.env.SYNC_ONLY_FALLBACK==='1'){await resolve('defend');await settled(page);}
  const rendererIdentity=await page.evaluate(()=>{const g=syncProbe.world.renderer.getContext(),x=g.getExtension('WEBGL_debug_renderer_info');return{renderer:x?g.getParameter(x.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio};});
  recovery.push({device,label:'renderer identity',proof:rendererIdentity});
  await page.evaluate(()=>syncProbe.world.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(()=>syncProbe.world.fallback);
  await clear(page);await resolve('attack');
  await page.waitForFunction(()=>syncProbe.starts.some(s=>s.key==='trischli-warrior:attack'));
  const fallback=await page.evaluate(()=>({starts:syncProbe.starts.filter(s=>s.key?.startsWith('trischli-warrior:attack')),label:[...document.querySelectorAll('.world-action-label')].map(n=>n.textContent).find(Boolean)}));
  assert.equal(fallback.starts.length,2);assert.equal(fallback.starts[1].key,'trischli-warrior:attack:accent');assert.equal(fallback.starts[1].offset,0);assert.ok(fallback.starts[0].offset>=0&&fallback.starts[0].offset<.1,'fresh label seeks only its RAF delay');assert.equal(fallback.label,'Dance Off');
  recovery.push({device,label:'genuine renderer-loss label full-score onset',passed:true,proof:fallback});
  await page.waitForFunction(()=>!syncProbe.world.active);
  await clear(page);
  await page.evaluate(()=>{
   const request=window.requestAnimationFrame;
   window.requestAnimationFrame=fn=>request(at=>{
    window.requestAnimationFrame=request;
    const start=performance.now();while(performance.now()-start<2300){}
    syncProbe.events.push({type:'fallback-stall',duration:performance.now()-start});fn(at);
   });
  });
  await resolve('attack');
  await page.waitForFunction(()=>syncProbe.events.some(e=>e.type==='fallback-stall')&&!syncProbe.world.active);
  assert.equal(await page.evaluate(()=>syncProbe.starts.filter(s=>s.key?.startsWith('trischli-warrior:attack')).length),0,'expired first-label RAF cannot start a full score');
  recovery.push({device,label:'2.3s first-label stall consumes expired score',passed:true});
  await clear(page);await resolve('attack');
  await page.waitForFunction(()=>syncProbe.starts.some(s=>s.key==='trischli-warrior:attack'));
  const fresh=await page.evaluate(()=>syncProbe.starts.filter(s=>s.key?.startsWith('trischli-warrior:attack')));
  assert.equal(fresh.length,2);assert.equal(fresh[1].key,'trischli-warrior:attack:accent');assert.ok(fresh[0].offset>=0&&fresh[0].offset<.1);
  recovery.push({device,label:'fresh label after stalled predecessor plays once',passed:true,proof:fresh});

  await context.close();
 }
 await fs.writeFile(out+'/timing.json',JSON.stringify({version:browser.version(),root,dpr:Number(process.env.SYNC_DPR||.5),rows,failures,errors,recovery},null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);console.log('PASS',rows.length,'full-render semantic/acoustic-accent cases;',recovery.filter(r=>r.label.startsWith('FAST emitted tail')&&r.passed).length,'fast-tail cases;',recovery.filter(r=>r.passed&&r.label.includes('label')).length,'fallback cases');
}catch(e){await fs.writeFile(out+'/timing.json',JSON.stringify({version:browser.version(),root,rows,failures,errors,recovery,fatal:e.stack},null,2));console.error(e);process.exitCode=1;}finally{await browser.close();await game.close();}
