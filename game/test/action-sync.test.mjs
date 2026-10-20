import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionCue, ActionAudio} from '../public/app.js';
import * as contract from '../public/battle-contract.js';
const initial=()=>({roomId:'local',match:1,phase:'running',teams:{A:{hp:100,characterId:'luca-di-grazia'},B:{hp:100,characterId:'bad-teacher'}},lastResult:null});
const result=(number,move='attack',characterId='luca-di-grazia')=>({number,turnId:'1:'+number,team:'A',move,actorCharacterId:characterId,targetTeam:['attack','special'].includes(move)?'B':'A',targetHp:80});
const event=r=>({id:'local:1:'+r.turnId,actor:r.team,characterId:r.actorCharacterId,move:r.move,result:r,ability:contract.ABILITIES[r.actorCharacterId]?.[r.move]});
test('resolved actions wait for their own actual queued presentation, not receipt or a universal timeout',()=>{
 const played=[],cue=createActionCue((move,options)=>played.push({move,options}),{presentation:true});const s=initial();cue(s);
 const a=result(1),b=result(2,'special');cue({...s,lastResult:b,recentResults:[a,b]});
 assert.equal(played.length,0,'authoritative receipt authorizes but must not sound before the animation');
 cue.present(event(a),{elapsed:100});assert.equal(played.length,0);
 cue.present(event(a),{elapsed:1298});assert.equal(played.length,1);assert.equal(played[0].move,'attack');
 cue.present(event(a),{elapsed:1350});assert.equal(played.length,1,'same frame/event cannot double-play');
 cue.present(event(b),{elapsed:847});assert.equal(played.length,2);assert.equal(played[1].move,'special');
});

for(const id of Object.keys(contract.ABILITIES))for(const move of ['attack','defend','heal','special'])test(id+' '+move+' acoustic accent follows its semantic marker and remains single use',()=>{
 const played=[],cue=createActionCue((move,options)=>played.push(options),{presentation:true}),s=initial(),r=result(1,move,id),e=event(r);cue(s);cue({...s,lastResult:r});
 const {phase,accent}=contract.actionSoundTiming(move,id+':'+move),anchor=phase*2200;
 for(let t=0;t<=anchor+10;t+=10){cue.present(e,{elapsed:t});if(played.length){assert.ok(Math.abs(t+(accent-played[0].offset)*1000-anchor)<=10);break;}}
 assert.equal(played.length,1,'smooth frames retain available prelude');cue.present(e,{elapsed:anchor});assert.equal(played.length,1);
});
test('fallback buffer changes acoustic accent, not the authoritative named gesture phase',()=>{
 const played=[],cue=createActionCue((m,o)=>played.push(o),{presentation:true,select:move=>move}),s=initial(),r=result(1,'special');cue(s);cue({...s,lastResult:r});
 for(let t=0;t<=847;t+=10)cue.present(event(r),{elapsed:t});assert.equal(played.length,1);
 const o=played[0];assert.equal(o.soundKey,'special');assert.ok(o.offset<.15);assert.ok(o.offset>=0);
});
test('slow frames seek to accent on the presented marker; a skipped complete window is silent',()=>{
 const played=[],cue=createActionCue((m,o)=>played.push(o),{presentation:true}),s=initial(),r=result(1,'special');cue(s);cue({...s,lastResult:r});
 cue.present(event(r),{elapsed:700});assert.equal(played.length,0,'do not predict impact through a long stalled frame');
 cue.present(event(r),{elapsed:900});assert.equal(played.length,1);assert.equal(played[0].offset,.16);
 const next=result(2);cue({...s,lastResult:next});cue.present(event(next),{elapsed:1800});cue.present(event(next),{elapsed:1298});assert.equal(played.length,1,'no historical prelude after skipped contact');
});
test('muted/loading/suspended/hidden receipts cannot be revived; mid-queue invalidation consumes future events',()=>{
 for(const reason of ['muted','loading','suspended','hidden']){
  let enabled=false,stops=0;const played=[],cue=createActionCue((m,o)=>played.push(o),{presentation:true,ready:()=>enabled,stop:()=>stops++}),s=initial(),r=result(1);cue(s);cue({...s,lastResult:r});enabled=true;cue.present(event(r),{elapsed:1298});assert.equal(played.length,0,reason+' at receipt');
  const a=result(2),b=result(3,'special');cue({...s,lastResult:b,recentResults:[a,b]});cue.cancel();cue({...s,lastResult:b,recentResults:[a,b]});cue.present(event(a),{elapsed:1298});cue.present(event(b),{elapsed:847});assert.equal(played.length,0,reason+' invalidated queue');assert.ok(stops>=2);
  const next=result(4);cue({...s,lastResult:next});cue.present(event(next),{elapsed:1298});assert.equal(played.length,1,'fresh live cue re-arms');
 }
});
test('presentation rechecks eligibility and consumes failure even if an enable arrives before a duplicate frame',()=>{
 let enabled=true;const played=[],cue=createActionCue(m=>played.push(m),{presentation:true,ready:()=>enabled}),s=initial(),r=result(1);cue(s);cue({...s,lastResult:r});enabled=false;cue.present(event(r),{elapsed:100});enabled=true;cue.present(event(r),{elapsed:1298});assert.equal(played.length,0);
});
test('reset leave reconnect and completed callbacks cannot play stale or future events',()=>{
 for(const boundary of ['reset','leave','reconnect','complete']){
  const played=[],cue=createActionCue(m=>played.push(m),{presentation:true}),s=initial(),r=result(1);cue(s);cue({...s,lastResult:r});
  if(boundary==='complete')cue.complete(event(r));else if(boundary==='reset')cue({...s,match:2,phase:'lobby'});else cue.reset();
  cue.present(event(r),{elapsed:1298});assert.equal(played.length,0,boundary);
  if(boundary==='reconnect'){cue({...s,lastResult:r});cue.present(event(r),{tableau:true});assert.equal(played.length,0);}
 }
});
test('reduced motion and renderer fallback cue on visible tableau/label, not elapsed .59',()=>{
 for(const frame of [{tableau:true},{fallback:true}]){
  const played=[],cue=createActionCue((m,o)=>played.push(o),{presentation:true}),s=initial(),r=result(1,'special');cue(s);cue({...s,lastResult:r});cue.present(event(r),frame);cue.present(event(r),frame);assert.equal(played.length,1);assert.equal(played[0].offset,.16);
 }
});
test('selected buffer is frozen at receipt and callback identity cannot substitute a future sound',()=>{
 let named=false;const played=[],cue=createActionCue((m,o)=>played.push(o),{presentation:true,select:(m,id)=>named?id+':'+m:m}),s=initial(),r=result(1,'special');cue(s);cue({...s,lastResult:r});named=true;cue.present({...event(r),characterId:'bad-teacher',move:'attack'},{elapsed:847});assert.equal(played[0].soundKey,'special');assert.equal(played[0].characterId,'luca-di-grazia');
});
test('action-only cancellation and click-free interior seek leave protected sources, buses and gain targets intact',async()=>{
 const starts=[],gains=[];const ctx={state:'running',currentTime:3,destination:{},decodeAudioData:async()=>({duration:1}),createGain(){const gain={calls:[],setValueAtTime(v,t){this.calls.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.calls.push(['ramp',v,t]);}};const n={gain,connect(t){this.target=t;return t;},disconnect(){}};gains.push(n);return n;},createBufferSource(){return{connect(g){this.gain=g;return g;},disconnect(){},start(when,offset){this.when=when;this.offset=offset;starts.push(this);},stop(){this.stopped=true;this.onended?.();}};}};
 const audio=new ActionAudio(ctx,async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)}));await audio.load();await audio.themedLoading;audio.setMusic('battle');audio.play('win');audio.play('countdown');
 audio.play('special',{actionId:'a',soundKey:'luca-di-grazia:special',offset:.16});const action=starts.at(-1);assert.deepEqual(action.gain.gain.calls,[['set',.45,3],['set',0,3],['ramp',.45,3.003]]);assert.equal(action.gain.target,audio.sfxGain);assert.equal(action.offset,.16);audio.stopActions();assert.equal(action.stopped,true);assert.equal(starts.find(x=>x===audio.victory)?.stopped,undefined);assert.equal(starts.at(-2).stopped,undefined);assert.equal(audio.actions.size,0);audio.stop();assert.ok(starts.every(x=>x.stopped));
});

const {BattleWorld}=await import('../public/battle-world.js');
for(const id of Object.keys(contract.ABILITIES))for(const move of ['attack','defend','heal','special'])test(id+' '+move+' skipped semantic sample is held exactly once without retiming the action',()=>{
 const w=Object.create(BattleWorld.prototype),startedAt=100,e={characterId:id,move,startedAt,ability:contract.ABILITIES[id][move]};w.active=e;w.motion={matches:false};
 const marker=startedAt+contract.actionSoundTiming(move,id+':'+move).phase*2200;
 assert.equal(w.presentationTime(marker-1),marker-1);assert.equal(e.markerSampled,undefined);
 assert.equal(w.presentationTime(startedAt+5000),marker,'even an end-crossing stall retains the existing impact pose first');
 assert.equal(w.presentationTime(startedAt+5001),startedAt+5001,'next frame resumes the unchanged absolute end/completion');assert.equal(e.startedAt,startedAt);
 w.active=null;assert.equal(w.presentationTime(startedAt+6000),startedAt+6000,'cancelled sampling cannot resurrect an event');
});
test('generic marker and reduced motion retain their existing timeline',()=>{
 const w=Object.create(BattleWorld.prototype);w.motion={matches:false};w.active={characterId:'unknown',move:'special',startedAt:10,ability:{duration:2200}};assert.equal(w.presentationTime(4000),1308);
 w.active.markerSampled=false;w.motion.matches=true;assert.equal(w.presentationTime(4000),4000);assert.equal(w.active.markerSampled,false);
});

test('sub-microsecond timestamp subtraction cannot suppress the exact semantic marker',()=>{
 const played=[],cue=createActionCue((m,o)=>played.push(o),{presentation:true}),s=initial(),r=result(1);cue(s);cue({...s,lastResult:r});cue.present(event(r),{elapsed:1297.9999999999995});assert.equal(played.length,1);assert.equal(played[0].offset,.055);
});
test('visible fallback waits for its render opportunity and guards cancelled generations and hidden pages',()=>{
 const previous=Object.fromEntries(['document','requestAnimationFrame','cancelAnimationFrame'].map(k=>[k,globalThis[k]]));
 try{
  let frame;globalThis.document={hidden:false,createElement:()=>({remove(){}})};globalThis.requestAnimationFrame=fn=>{frame=fn;return 1;};globalThis.cancelAnimationFrame=()=>{};
  for(const invalidation of ['none','cancel','generation','hidden']){
   const played=[],e={id:'fallback',ability:{duration:2200,label:'visible label'}},w=Object.create(BattleWorld.prototype);Object.assign(w,{generation:1,events:{pending:[e],reset(){this.pending=[];}},fighters:{},container:{append(){}},overview(){},onPresent:e=>played.push(e.id)});document.hidden=false;
   w.pumpFallback();assert.equal(played.length,0,'not at label insertion');const stale=frame;
   if(invalidation==='cancel')w.cancel();if(invalidation==='generation')w.generation++;if(invalidation==='hidden')document.hidden=true;
   stale();assert.equal(played.length,invalidation==='none'?1:0,invalidation);w.finish();
  }
 }finally{for(const [k,value]of Object.entries(previous)){if(value===undefined)delete globalThis[k];else globalThis[k]=value;}}
});
test('two queued identical moves retain separate authoritative IDs, not a sound-key deduplication',()=>{
 const played=[],cue=createActionCue((m,o)=>played.push(o),{presentation:true}),s=initial(),a=result(1),b=result(2);cue(s);cue({...s,lastResult:b,recentResults:[a,b]});cue.present(event(a),{elapsed:1298});cue.present(event(b),{elapsed:1298});cue.present(event(a),{elapsed:1298});assert.deepEqual(played.map(o=>o.actionId),['local:1:1:1','local:1:1:2']);assert.equal(played[0].soundKey,played[1].soundKey);
});
test('natural final completion invalidates future callbacks without cutting the emitted action tail; actual cancellation still stops it',()=>{
 let stops=0;const played=[],cue=createActionCue((m,o)=>played.push(o),{presentation:true,stop:()=>stops++}),s=initial(),r=result(1,'special');cue(s);cue({...s,phase:'finished',lastResult:r});cue.present(event(r),{elapsed:847});assert.equal(played.length,1);cue.complete(event(r));const before=stops;cue.cancel({preserveTail:true});assert.equal(stops,before);cue.present(event(r),{tableau:true});assert.equal(played.length,1);cue.cancel();assert.equal(stops,before+1,'mute/reset/leave/hidden/reconnect remain strict');
});
test('only a completed victory screen gets the natural-tail exception; menus and pending events cancel strictly',()=>{
 const previous=globalThis.document;try{
  for(const [screen,phase,active,pending,expected]of [['victory','finished',null,[],true],['menu','finished',null,[],false],['victory','lobby',null,[],false],['victory','finished',{},[],false],['victory','finished',null,[{}],false]]){
   globalThis.document={body:{dataset:{screen}}};const w=Object.create(BattleWorld.prototype);w.active=active;w.events={pending};w.clear=preserve=>{w.preserve=preserve;};w.sync({phase});assert.equal(w.preserve,expected);
  }
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

// Exercise the actual first show()->clear()->cancel()->stopActions() chain, not
// only the later world.sync() clear. A fast completion leaves 540ms of tail.
test('FIRST victory show clear preserves the live natural-final tail and consumes pending cues; actual exits cut immediately',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const showSource=source.slice(source.indexOf('  function show(screen) {'),source.indexOf('  function intent(',source.indexOf('  function show(screen) {')));
 const previous=Object.fromEntries(['document','cancelAnimationFrame'].map(k=>[k,globalThis[k]]));
 try{
  globalThis.cancelAnimationFrame=()=>{};
  for(const scenario of ['natural','menu','active','queued','lobby']){
   const starts=[],ctx={state:'running',currentTime:10,destination:{},createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(t){return t;},disconnect(){}}),createBufferSource:()=>({connect(g){return g;},disconnect(){},start(when,offset){this.when=when;this.offset=offset;starts.push(this);},stop(){this.stoppedAt=ctx.currentTime;this.onended?.();}})};
   const audio=new ActionAudio(ctx);audio.buffers.set('luca-di-grazia:special',{duration:.7});audio.buffers.set('win',{duration:5.4683125});
   const played=[],cue=createActionCue((m,o)=>{played.push(o.actionId);return audio.play(m,o);},{presentation:true,stop:()=>audio.stopActions()});
   const s=initial(),r=result(1,'special'),future=result(2,'special');cue(s);cue({...s,phase:'finished',lastResult:future,recentResults:[r,future]});cue.present(event(r),{elapsed:847});cue.complete(event(r));
   const action=starts[0];assert.equal(action.offset,.16);ctx.currentTime+=.016;
   const w=Object.create(BattleWorld.prototype);Object.assign(w,{state:{phase:scenario==='lobby'?'lobby':'finished'},active:scenario==='active'?{}:null,events:{pending:scenario==='queued'?[{}]:[],reset(){this.pending=[];}},fighters:{},generation:1,overview(){},onCancel:options=>cue.cancel(options)});
   globalThis.document={body:{dataset:{screen:'player'}}};const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,querySelector:()=>({focus(){}})});return nodes.get(id);};
   const show=Function('$','screens','document','battleWorld','countdownTimer','actionAudio','syncMusic','characters',showSource+';return show;')($,['player','victory','menu'],document,w,undefined,audio,()=>{},{sync(){}});
   show(scenario==='menu'?'menu':'victory');
   if(scenario==='natural'){
    assert.equal(action.stoppedAt,undefined,'FIRST clear must not cut 524ms of natural-final tail');
    audio.play('win');assert.equal(action.stoppedAt,undefined,'unchanged victory source coexists with emitted tail');assert.equal(starts.length,2);
    cue.present(event(future),{tableau:true});assert.equal(played.length,1,'all pending cues invalidated even while preserving an emitted tail');
    ctx.currentTime+=.016;show('menu');assert.equal(action.stoppedAt,ctx.currentTime,'actual menu clear immediately cuts the preserved tail after victory');
   }else assert.equal(action.stoppedAt,ctx.currentTime,scenario+' is not natural completed victory');
  }
 }finally{for(const [k,v]of Object.entries(previous)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
