import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three.module.js';
import {GLTFLoader} from '../public/vendor/GLTFLoader.js';
import {BattleWorld} from '../public/battle-world.js';
import {ABILITIES,ARENA_WORLDS,BattleEvents,actionSoundTiming} from '../public/battle-contract.js';

test('entrypoint, app/world and both contract imports share the new cache generation',async()=>{
 const [html,app,world]=await Promise.all(['index.html','app.js','battle-world.js'].map(f=>readFile(new URL('../public/'+f,import.meta.url),'utf8')));
 const version='20261020-action-sync-current1';
 assert.ok(html.includes('./app.js?v='+version));
 assert.ok(app.includes('./battle-world.js?v='+version));
 for(const source of [app,world]){assert.ok(source.includes('./battle-contract.js?v='+version));assert.ok(!source.includes('battle-contract.js?v=20261019-mensa1'));}
});

async function fighter(id,index){
 const b=await readFile(new URL('../public/assets/characters/'+id+'.glb',import.meta.url)),g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const root=g.scene,holder=new T.Group();root.scale.setScalar(.52);root.updateMatrixWorld(true);root.position.y-=new T.Box3().setFromObject(root).min.y;holder.add(root);holder.position.fromArray(ARENA_WORLDS.library.fighters[index]);
 const other=new T.Vector3(...ARENA_WORLDS.library.fighters[1-index]);holder.rotation.y=Math.atan2(other.x-holder.position.x,other.z-holder.position.z);const mixer=new T.AnimationMixer(root);
 return {root,holder,mixer,actions:new Map(g.animations.map(c=>[c.name,mixer.clipAction(c)])),home:{position:holder.position.clone(),rotation:holder.quaternion.clone(),scale:holder.scale.clone()}};
}
test('hoodie heal semantic frame is actual current FREEDOM reveal at .40, not old .37 or shell peel .36',async()=>{
 const w=Object.create(BattleWorld.prototype);Object.assign(w,{config:ARENA_WORLDS.library,fighters:{A:await fighter('assessment-hoodie',0),B:await fighter('tryhard',1)},events:new BattleEvents(),motion:{matches:false},camera:new T.PerspectiveCamera(49,1.8),look:new T.Vector3(),scene:new T.Scene(),canvas:{dataset:{}},badge:{textContent:''},renderer:{shadowMap:{}},state:{teams:{A:{hp:100},B:{hp:100}}}});
 for(const f of Object.values(w.fighters))w.scene.add(f.holder);w.overview(true);
 const ability=ABILITIES['assessment-hoodie'].heal;w.begin({id:'hoodie-heal',characterId:'assessment-hoodie',actor:'A',target:'A',move:'heal',ability},0);
 const secondary=w.fx.userData.parts.secondary;
 assert.deepEqual(actionSoundTiming('heal','assessment-hoodie:heal'),{phase:.40,accent:.075});
 for(const phase of [.36,.37,.399999]){w.animate(phase*ability.duration);assert.equal(secondary.visible,false,'FREEDOM still hidden at '+phase);}
 const marker=w.presentationTime(5000);assert.equal(marker,880);w.animate(marker);assert.equal(secondary.visible,true);assert.equal(w.active.markerPhase,.40);
 const sources=w.fighters.A.garment.map(p=>p.source);assert.ok(sources.length>0);
 let cancelled;const previous=globalThis.cancelAnimationFrame;globalThis.cancelAnimationFrame=id=>{cancelled=id;};
 try{w.fallbackRaf=42;w.finish();assert.equal(cancelled,42);assert.equal(w.fallbackRaf,null);assert.equal(w.fighters.A.garment,null);assert.ok(sources.every(s=>s.visible));}
 finally{if(previous===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=previous;}
});
