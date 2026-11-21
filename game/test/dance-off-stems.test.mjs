import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionCue, ActionAudio } from '../public/app.js';
import { ABILITIES } from '../public/battle-contract.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildDanceOffAccent } from '../public/assets/audio/generate.mjs';
const key='trischli-warrior:attack', accentKey=key+':accent';
function fixture(options={}) {
 const played=[];let stops=0;
 const state={roomId:'stems',match:1,phase:'running',teams:{A:{characterId:'trischli-warrior'}},lastResult:null};
 const cue=createActionCue((move,o)=>played.push(o),{presentation:true,stop:()=>stops++,...options});cue(state);
 const accept=n=>{const r={number:n,turnId:'1:'+n,team:'A',move:'attack',actorCharacterId:'trischli-warrior'};cue({...state,lastResult:r});return{id:'stems:1:1:'+n,ability:ABILITIES['trischli-warrior'].attack};};
 return{cue,played,accept,stops:()=>stops};
}
test('same authoritative dance owns one onset bed and one separately timed marker, never retriggers bed',()=>{
 const f=fixture(),e=f.accept(1);f.cue.present(e,{elapsed:0});f.cue.present(e,{elapsed:900});
 assert.deepEqual(f.played.map(s=>s.soundKey),[key]);
 f.cue.present(e,{elapsed:1276});f.cue.present(e,{elapsed:1276});f.cue.present(e,{elapsed:1500});
 assert.deepEqual(f.played.map(s=>s.soundKey),[key,accentKey]);
 assert.ok(f.played.every(s=>s.actionId===e.id));assert.equal(f.played[1].offset,0);
});
test('late fresh held marker plays only accent after score expiry; stale callback cannot replay either stem',()=>{
 const f=fixture(),e={...f.accept(1),startedAt:performance.now()-3000};
 f.cue.present(e,{elapsed:1276,presentedAt:performance.now()});
 assert.deepEqual(f.played.map(s=>s.soundKey),[accentKey]);
 f.cue.present(e,{elapsed:0});assert.equal(f.played.length,1);
 const g=fixture(),q={...g.accept(1),startedAt:performance.now()-3000};
 g.cue.present(q,{elapsed:1276,presentedAt:performance.now()-81});g.cue.present(q,{elapsed:1276});assert.equal(g.played.length,0);
});
test('cancellation between onset and marker invalidates both; emitted final stems retain natural tails',()=>{
 for(const reason of ['mute','reset','hidden','suspend','reconnect']){
  const f=fixture(),e=f.accept(1);f.cue.present(e,{elapsed:0});const before=f.stops();f.cue.cancel();
  f.cue.present(e,{elapsed:1276});assert.equal(f.played.length,1,reason);assert.equal(f.stops(),before+1);
 }
 const f=fixture(),e=f.accept(1);f.cue.present(e,{elapsed:0});f.cue.present(e,{elapsed:1276});
 f.cue.complete(e);const before=f.stops();f.cue.cancel({preserveTail:true});assert.equal(f.stops(),before);assert.equal(f.played.length,2);
});
test('tableau and fresh fallback emit both once; expired fallback emits neither',()=>{
 for(const frame of [{tableau:true},{fallback:true}]){
  const f=fixture(),e=f.accept(1);f.cue.present(e,frame);f.cue.present(e,frame);
  assert.deepEqual(f.played.map(s=>s.soundKey),[key,accentKey]);
 }
 const f=fixture(),e={...f.accept(1),startedAt:performance.now()-2300};f.cue.present(e,{fallback:true});assert.equal(f.played.length,0);
});

test('extracted festival marker is reproducible and bed matches approved marker-free source',async()=>{
 const bed=await readFile(new URL('../public/assets/audio/trischli-warrior-attack.wav',import.meta.url));
 const stem=await readFile(new URL('../public/assets/audio/trischli-warrior-attack-accent.wav',import.meta.url));
 assert.deepEqual(stem,buildDanceOffAccent());assert.equal(stem.length,15404);
 assert.equal(stem.readInt16LE(44),0);assert.equal(stem.readInt16LE(stem.length-2),0);
 let peak=0;for(let i=0;i<1920;i++)peak=Math.max(peak,Math.abs(stem.readInt16LE(44+i*2)/32768));
 assert.ok(peak>.2);
 // Kick/bass share low harmonics: projection is not a duplicate detector for this arrangement.
 // Exact approved bed identity rejects embedding/doubling ANY marker samples instead.
 assert.equal(createHash('sha256').update(bed).digest('hex'),'5aceed8c434be8f170b99694282ed60c51bbb0acb2786f195a9f7b88137591e6');
});
test('missing either stem freezes generic selection; later decode cannot upgrade that event',()=>{
 const audio=Object.create(ActionAudio.prototype);audio.buffers=new Map([[key,{}],['attack',{}]]);
 const f=fixture({select:(m,id)=>audio.actionSound(m,id)}),e=f.accept(1);
 assert.equal(audio.actionSound('attack','trischli-warrior'),'attack');audio.buffers.set(accentKey,{});
 f.cue.present(e,{elapsed:0});f.cue.present(e,{elapsed:1276});assert.deepEqual(f.played.map(s=>s.soundKey),['attack']);
 assert.equal(audio.actionSound('attack','trischli-warrior'),key);audio.buffers.delete(key);assert.equal(audio.actionSound('attack','trischli-warrior'),'attack');
});
test('both native action sources share cancellation, while natural completion leaves emitted tails alone',()=>{
 const sources=[],context={state:'running',currentTime:2,destination:{},createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(t){return t;},disconnect(){}};},createBufferSource(){const s={connect(g){return g;},start(){sources.push(s);},stop(){s.stopped=true;s.onended?.();},disconnect(){}};return s;}};
 const audio=new ActionAudio(context);audio.buffers.set(key,{duration:2.2});audio.buffers.set(accentKey,{duration:.32});
 audio.play('attack',{actionId:'one',soundKey:key});audio.play('attack',{actionId:'one',soundKey:accentKey});assert.equal(audio.actions.size,2);
 audio.stopActions();assert.ok(sources.every(s=>s.stopped));assert.equal(audio.actions.size,0);
});
