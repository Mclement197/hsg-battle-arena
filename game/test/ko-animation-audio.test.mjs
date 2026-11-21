import test from 'node:test';
import http from 'node:http';
import {createGameServer} from '../src/server.mjs';
import {Arena,CHARACTERS} from '../src/engine.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {ActionAudio,AUDIO_SOUNDS,createActionCue,createVictoryCue} from '../public/app.js';
import {BattleWorld} from '../public/battle-world.js';
import {BattleEvents,BattlePresentation,actionEventId} from '../public/battle-contract.js';
import {createCelebrationCue} from '../public/app.js';
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const wiring=app.slice(app.indexOf("  const skipKOButton = $('skip-ko');"),app.indexOf('  const battleStartCue =',app.indexOf("  const skipKOButton = $('skip-ko');")));
const real={setTimeout,clearTimeout,performance,document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
const rows=[];
function probe(kind){
 let now=1000,id=0,muted=false;const jobs=new Map(),starts=[],button={hidden:true,disabled:false,addEventListener(t,fn){this[t]=fn;}},listeners={};
 const timer=(fn,ms=0)=>{jobs.set(++id,{at:now+ms,fn});return id;};
 const advance=to=>{while(true){const row=[...jobs].filter(([,x])=>x.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];if(!row)break;const [i,x]=row;jobs.delete(i);now=x.at;x.fn();}now=to;};
 const document={hidden:false,createElement:()=>({classList:{add(){},remove(){}},style:{setProperty(){}},remove(){}}),addEventListener:(t,f)=>{listeners[t]=f;}};
 globalThis.document=document;globalThis.performance={now:()=>now};globalThis.setTimeout=timer;globalThis.clearTimeout=i=>jobs.delete(i);globalThis.requestAnimationFrame=fn=>timer(()=>fn(now),16);globalThis.cancelAnimationFrame=i=>jobs.delete(i);
 const ctx={state:'running',get currentTime(){return now/1000;},destination:{},createGain:()=>({gain:{setValueAtTime(v){this.value=v;}},connect(t){this.target=t;return t;},disconnect(){}}),createBufferSource:()=>({connect(g){this.gain=g;return g;},disconnect(){},start(){this.at=now;starts.push(this);this.end=timer(()=>{this.ended=true;this.onended?.();},this.buffer.duration*1000);},stop(){this.stopped=true;jobs.delete(this.end);this.onended?.();}})};
 const audio=new ActionAudio(ctx);for(const k of Object.keys(AUDIO_SOUNDS))audio.buffers.set(k,{key:k,duration:k==='attack'?.22:k==='siuu'?1.41:k==='win'?3:.7});
 const state={roomId:'review',match:0,phase:'running',teams:{A:{hp:100,characterId:'tryhard'},B:{hp:100,characterId:'free-rider'}},lastResult:null};
 const final={...state,phase:'finished',teams:{...state.teams,B:{...state.teams.B,hp:0}},lastResult:{number:1,turnId:'0:1',team:'A',move:'attack',targetHp:0}};
 const presentation=new BattlePresentation();presentation.consume(state);presentation.consume(final);
 const events=new BattleEvents();events.consume(state);events.consume(final);
 const window={ArenaUI:{connected:true}};
 const soundReady=()=>!muted&&ctx.state==='running'&&audio.ready;
 const celebrationCue=createCelebrationCue(onended=>audio.play('siuu',{onended}),()=>audio.stopCelebration(),()=>soundReady()&&window.ArenaUI.connected&&!document.hidden);celebrationCue(state);celebrationCue(final);
 const actionCue=createActionCue((m,o)=>audio.play(m,o),{presentation:true,ready:soundReady,select:m=>m,stop:()=>audio.stopActions()});actionCue(state);actionCue(final);
 const w=Object.create(BattleWorld.prototype);Object.assign(w,{events,container:{dataset:{},append(){}},fighters:{},generation:0,state:final,overview(){}});
 vm.runInNewContext(wiring,{document,window,battleWorld:w,actionCue,actionAudio:audio,celebrationCue,presentation,soundReady,performance:globalThis.performance,setTimeout:timer,$:()=>button});
 const victory=createVictoryCue(m=>{if(soundReady())audio.play(m);});victory(state);
 w.onPresent=(e,f)=>actionCue.present(e,f);
 w.onComplete=e=>{actionCue.complete(e);presentation.complete(e.id);victory(presentation.view(final));};
 w.pumpFallback();advance(1016);assert.equal(starts.length,1,'winning action at fallback presentation');
 if(kind==='muted')muted=true;
 if(kind==='suspended')ctx.state='suspended';
 if(kind==='missing')audio.buffers.delete('attack');
 if(kind==='disconnected')window.ArenaUI.connected=false;
 if(kind==='sfx0')audio.setVolume('sfx',0);
 advance(3216);const event=w.active;
 const ko=()=>starts.filter(x=>x.buffer.key==='attack').slice(1);
 if(['muted','suspended','missing','disconnected'].includes(kind)){assert.equal(ko().length,0,kind+' KO suppressed');muted=false;ctx.state='running';window.ArenaUI.connected=true;audio.buffers.set('attack',{key:'attack',duration:.22});advance(3400);assert.equal(ko().length,0,kind+' no recovery replay');}
 else {assert.equal(ko().length,1,'KO once');assert.equal(ko()[0].gain.target,audio.sfxGain,'SFX bus');assert.equal(ko()[0].gain.gain.value,.45);}
 if(kind==='skip'){button.click();advance(3435);assert.equal(starts.filter(x=>x.buffer.key==='win').length,0);advance(3436);assert.equal(starts.filter(x=>x.buffer.key==='win').length,1);assert.ok(ko()[0].ended&&!ko()[0].stopped,'full 220ms KO before victory');}
 else if(kind==='reset'||kind==='hide'||kind==='reconnect'||kind==='skipReset'||kind==='skipHide'){if(kind.startsWith('skip'))button.click();if(kind==='hide'||kind==='skipHide')document.hidden=true;w.disconnect();advance(7000);assert.equal(starts.filter(x=>x.buffer.key==='win').length,0);assert.ok(ko()[0].stopped);assert.equal(button.hidden,true);assert.equal(w.active,null);w.events.consume(final);assert.equal(w.events.pending.length,0,'same snapshot not replayed');}
 else {advance(14000);assert.equal(starts.filter(x=>x.buffer.key==='win').length,1,'victory after full KO and celebration');if(ko().length)assert.ok(ko()[0].ended&&!ko()[0].stopped);}
 rows.push({kind,starts:starts.map(x=>({key:x.buffer.key,at:x.at,ended:!!x.ended,stopped:!!x.stopped,bus:x.gain.target===audio.sfxGain?'sfx':'music'})),koDone:event.koSoundDone});
}
test('ActionAudio/BattleEvents preserve KO sound gates, buses, and lifecycle',()=>{try{for(const kind of ['normal','skip','muted','suspended','missing','disconnected','sfx0','reset','hide','reconnect','skipReset','skipHide'])probe(kind);assert.equal(rows.length,12);}finally{Object.assign(globalThis,real);}});

test('celebration cue waits for the landing edge, plays once to natural end, and gates late readiness',()=>{
 const state={roomId:'room',match:2,phase:'running',lastResult:null};let ready=true,starts=0,stops=0,ended;
 const cue=createCelebrationCue(done=>{starts++;ended=done;return true;},()=>stops++,()=>ready);
 cue(state);const result={number:3,turnId:'2:3',team:'A',move:'attack'};const finished={...state,phase:'finished',lastResult:result};cue(finished);
 const event={id:actionEventId(finished,result)};assert.equal(starts,0,'sound is deferred until the world lands');cue.land(event);assert.equal(starts,1);cue.land(event);assert.equal(starts,1,'duplicate landing cannot replay');
 let after=false;cue.afterEnded(()=>{after=true;});assert.equal(after,false);ended();assert.equal(after,true,'victory waits for natural audio completion');
 cue.reset();assert.equal(stops,2,'scope initialization and explicit reset both clear any prior tail');
 let noStart=0;ready=false;const late=createCelebrationCue(()=>{noStart++;return true;},()=>{},()=>ready);late(state);late({...finished,roomId:'room2'});late.land({id:actionEventId({...finished,roomId:'room2'},result)});ready=true;assert.equal(noStart,0,'late readiness after the finish edge does not cue');
});

// Optional loopback check uses real browser AudioContext; enable with KO_AUDIO_NATIVE=1.
test('native browser KO audio gates and reconnect do not replay', {skip:process.env.KO_AUDIO_NATIVE!=='1'}, async()=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
 const port=Number(process.env.KO_AUDIO_PORT||19037);let now=Date.now();const arena=new Arena({now:()=>now,pick:()=>0});
 const game=createGameServer({arena,publicOrigin:'http://127.0.0.1:'+port,autoTick:false,limits:{mutationsPerMinute:1000,createsPerMinute:100}});await new Promise(r=>game.server.listen(port,'127.0.0.1',r));
const base='http://127.0.0.1:'+game.server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/home/mathis/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const output=[];
function post(path,data={},token){return new Promise((resolve,reject)=>{const q=http.request(base+'/game/api/'+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},r=>{let body='';r.on('data',b=>body+=b);r.on('end',()=>{try{assert.ok(r.statusCode<300,body);resolve(JSON.parse(body));}catch(e){reject(e);}});});q.on('error',reject);q.end(JSON.stringify(data));});}
function observe(){
 window.probe=[];const Native=window.AudioContext;
 window.AudioContext=class extends Native{constructor(...a){super(...a);const original=this.createBufferSource.bind(this);this.createBufferSource=()=>{const s=original(),start=s.start.bind(s),stop=s.stop.bind(s);s.start=(...x)=>{const r={duration:s.buffer.duration,at:performance.now(),when:x[0],offset:x[1]||0,loop:s.loop,rate:s.playbackRate.value};window.probe.push(r);s.addEventListener('ended',()=>{r.endedAt=performance.now();});s.stop=(...y)=>{r.stoppedAt=performance.now();return stop(...y);};return start(...x);};return s;};}}
}
try{
 for(const [kind,mode] of [['normal','bot'],['skip','friend'],['sfx0','groups'],['muted','bot']]){
  const room=await post('rooms',{mode}),id=room.roomId,players=[];let phoneContext,phonePage;
  if(mode==='friend')players.push(await post('rooms/'+id+'/join',{nickname:'Friend'}));else if(mode==='groups'){players.push(await post('rooms/'+id+'/join',{nickname:'QA A'}));players.push(await post('rooms/'+id+'/join',{nickname:'QA B'}));}
  await post('rooms/'+id+'/configure',{arenaId:'library',characterA:'tryhard',characterB:'free-rider'},room.hostToken);
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});await context.addInitScript(observe);await context.addInitScript(({id,token})=>{sessionStorage.setItem('hsg-arena:v1:host:'+id,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room:id,role:'host'}));},{id,token:room.hostToken});
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/game/');
  if(mode==='groups'){phoneContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await phoneContext.addInitScript(observe);await phoneContext.addInitScript(({id,token})=>{sessionStorage.setItem('hsg-arena:v1:player:'+id,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room:id,role:'player'}));},{id,token:players[0].playerToken});phonePage=await phoneContext.newPage();phonePage.setDefaultTimeout(15000);await phonePage.goto(base+'/game/');await phonePage.mouse.click(10,10);await phonePage.waitForFunction(()=>document.querySelector('#mute')?.dataset.audioState==='ready');}
  await page.evaluate(async()=>{const {BattleWorld}=await import('./battle-world.js?v=20261121-siuu1');const sync=BattleWorld.prototype.sync;BattleWorld.prototype.sync=function(s){window.world=this;return sync.call(this,s);};});
  await page.mouse.click(10,10);await page.waitForFunction(()=>document.querySelector('#mute').dataset.audioState==='ready');
  await page.evaluate(()=>window.ArenaUI.render({screen:'lobby'}));
  const s=await post('rooms/'+id+'/start',{},room.hostToken);now=s.state.prebattle.deadline;game.tick();
  await page.waitForFunction(()=>window.world?.container?.dataset.worldStatus==='ready');
  const r=arena.rooms.get(id);r.teams.B.hp=1;
  if(kind==='muted')await page.locator('#mute').click();
  if(kind==='sfx0')await page.evaluate(()=>{const e=document.querySelector('#volume-sfx');e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.evaluate(()=>{window.probe=[];});
  if(mode==='groups'){await post('rooms/'+id+'/vote',{turnId:r.turn.id,move:'attack'},players[0].playerToken);now=r.turn.deadline;}else await post('rooms/'+id+'/play',{turnId:r.turn.id,move:'attack'},room.hostToken);game.tick();
  await page.waitForFunction(()=>!!window.world?.active?.koStartedAt);
  if(kind==='skip')await page.evaluate(()=>document.querySelector('#skip-ko').click());
  await page.waitForFunction(()=>document.body.dataset.screen==='victory');
  if(!['muted','skip'].includes(kind))await page.waitForFunction(()=>window.probe.some(x=>x.duration>1.35&&x.duration<1.5),{timeout:12000});
  const sources=await page.evaluate(()=>window.probe),ko=sources.filter(x=>Math.abs(x.duration-.22)<.001),siuu=sources.filter(x=>x.duration>1.35&&x.duration<1.5),wins=sources.filter(x=>x.duration>1.5&&!x.loop);
  if(kind==='muted'){assert.equal(ko.length,0);await page.locator('#mute').click();await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.probe.filter(x=>Math.abs(x.duration-.22)<.001).length),0);}
  else {assert.equal(ko.length,2,kind+' action hit and KO cue each play once');const koSound=ko[ko.length-1];assert.ok(koSound.endedAt&&!koSound.stoppedAt,kind+' KO not truncated');if(kind==='skip'){const win=sources.find(x=>x.at>koSound.at+100&&x.duration>1.5&&!x.loop);assert.ok(win,kind+' victory follows');assert.ok(win.at-koSound.at>=215,'existing victory cue guard lets KO SFX finish');assert.ok(win.at-koSound.at<3900,'host skip bypasses both remaining tails');}else {assert.equal(siuu.length,1,kind+' Siuuu cue starts once');assert.ok(siuu[0].endedAt&&!siuu[0].stoppedAt,'Siuuu plays to natural end');assert.ok(Math.abs(siuu[0].duration-1.410)<.02,'decoded buffer retains full 1.410-second asset');assert.equal(siuu[0].offset,0);assert.equal(siuu[0].rate,1);await page.waitForFunction(()=>window.probe.some(x=>x.duration>1.5&&!x.loop),{timeout:12000});const all=await page.evaluate(()=>window.probe),win=all.find(x=>x.duration>1.5&&!x.loop);assert.ok(win.at-koSound.at>=6900,kind+' victory waits through full KO and five-second celebration');}}
  assert.deepEqual(errors,[]);output.push({kind,sources,errors});
  if(kind==='normal'){await page.reload();await page.waitForFunction(()=>document.body.dataset.screen==='victory');await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.probe.filter(x=>!x.loop).length),0,'finished reconnect no KO/victory replay');output.push({kind:'reconnect',nonLoopStarts:0});}
  if(phonePage){const phoneCues=await phonePage.evaluate(()=>window.probe.filter(x=>x.duration>1.35&&x.duration<1.5));assert.equal(phoneCues.length,1,'phone has its own single cue, independent of the presenter slider');assert.equal(phoneCues[0].rate,1);assert.equal(phoneCues[0].offset,0);assert.ok(phoneCues[0].endedAt&&!phoneCues[0].stoppedAt,'phone cue reaches natural end');await phoneContext.close();}
  await context.close();
 }
 console.log(JSON.stringify({browser:browser.version(),platform:process.platform,output},null,2));
}finally{await browser.close();await game.close();}
});
