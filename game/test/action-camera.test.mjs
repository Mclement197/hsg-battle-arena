import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three.module.js';
import {GLTFLoader} from '../public/vendor/GLTFLoader.js';
import {BattleWorld,actionCamera,fighterEnvelope,selectionCamera} from '../public/battle-world.js';
import {ARENA_WORLDS,ABILITIES} from '../public/battle-contract.js';

const moves=['attack','defend','heal','special'];
const event=(actor,move)=>({actor,target:['attack','special'].includes(move)?actor==='A'?'B':'A':actor,move,ability:ABILITIES['luca-di-grazia'][move]});
for(const [arena,config] of Object.entries(ARENA_WORLDS))for(const actor of ['A','B'])test(arena+' '+actor+' distinct, continuous, bounded action paths with exact overview recovery',()=>{
 const signatures=[];
 for(const move of moves){
  const e=event(actor,move),sample=t=>actionCamera(config,e,t,1.8);
  for(const t of [0,1]){assert.deepEqual(sample(t).position.toArray(),config.overview);assert.deepEqual(sample(t).look.toArray(),config.look);}
  for(const t of [e.ability.launch,e.ability.impact,.72,1])assert.ok(sample(t-1e-5).position.distanceTo(sample(t+1e-5).position)<.001);
  let previous=sample(0).position;
  for(let i=0;i<=220;i++){const p=sample(i/220).position;assert.ok(Math.abs(p.x)<=1.3);assert.ok(p.y>=2&&p.y<=3.13);assert.ok(p.z>=(arena==='trischli'?-1.2:6.6));assert.ok(p.z<=(arena==='trischli'?.21:8.01));assert.ok(p.distanceTo(previous)<.065,'no cuts');previous=p;}
  signatures.push([.22,.46,.64].flatMap(t=>sample(t).position.toArray()).join(','));
  // Sampling at different frame rates or after an interruption never changes the timeline's answer.
  for(const hz of [15,30,60]){for(let t=0;t<.5;t+=1/hz)sample(t);assert.deepEqual(sample(.5).position.toArray(),actionCamera(config,e,.5,1.8).position.toArray());}
 }
 assert.equal(new Set(signatures).size,4);
});

test('opponent-side camera mirrors its actor and reduced motion stays at overview',()=>{
 const config=ARENA_WORLDS.trischli;
 for(const move of moves){const a=actionCamera(config,event('A',move),.25),b=actionCamera(config,event('B',move),.25);assert.equal(a.position.x,-b.position.x);assert.ok(a.position.x>0&&b.position.x<0,'wind-up sees the inside/front of each fighter, not the back of their wings');}
 const w=Object.create(BattleWorld.prototype);Object.assign(w,{config,motion:{matches:true},camera:new THREE.PerspectiveCamera(49,1),look:new THREE.Vector3(),fighters:{},canvas:{dataset:{}}});w.active=event('B','special');w.overview(true);const matrix=w.camera.projectionMatrix.toArray(),position=w.camera.position.toArray();for(const t of [0,.2,.59,.9,1]){w.direct(t);assert.deepEqual(w.camera.position.toArray(),position);assert.deepEqual(w.camera.projectionMatrix.toArray(),matrix);}
});

for(const id of Object.keys(ABILITIES))test(id+' true animated bounds keep wings, hands and feet below HUD on desktop/phone, both arenas and both sides',async()=>{
 const bytes=await readFile(new URL('../public/assets/characters/'+id+'.glb',import.meta.url));const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const root=gltf.scene,holder=new THREE.Group();root.scale.setScalar(.52);root.updateMatrixWorld(true);root.position.y-=new THREE.Box3().setFromObject(root).min.y;holder.add(root);const mixer=new THREE.AnimationMixer(root),f={root,holder,mixer,actions:new Map(gltf.animations.map(c=>[c.name,mixer.clipAction(c)]))};
 for(const config of Object.values(ARENA_WORLDS))for(const actor of ['A','B']){
  const index=actor==='A'?0:1;holder.position.fromArray(config.fighters[index]);const other=new THREE.Vector3(...config.fighters[1-index]);holder.rotation.y=Math.atan2(other.x-holder.position.x,other.z-holder.position.z);f.envelope=fighterEnvelope(f);
  for(const action of f.actions.values()){mixer.stopAllAction();action.reset().play();for(const fraction of [.12,.37,.62,.87,.96]){mixer.setTime(action.getClip().duration*fraction);holder.updateMatrixWorld(true);assert.ok(f.envelope.containsBox(new THREE.Box3().setFromObject(holder,true)),id+' unsampled pose stays inside envelope');}}
  const w=Object.create(BattleWorld.prototype);Object.assign(w,{config,motion:{matches:false},camera:new THREE.PerspectiveCamera(),look:new THREE.Vector3(),fighters:{[actor]:f},canvas:{dataset:{}}});
  for(const host of [true,false])for(const aspect of [2.7,1,.85]){
   w.container={classList:{contains:()=>host}};w.camera.aspect=aspect;
   for(const team of ['A','B']){const shot=selectionCamera(config,team);w.frame(shot.position,shot.look);for(const point of f.framePoints){const p=point.clone().project(w.camera);assert.ok(Math.abs(p.x)<=.881,id+' selection horizontal');assert.ok(p.y<=(host?.431:.841)&&p.y>=-.781,id+' selection vertical');}}
   for(const move of moves){w.active=event(actor,move);for(const t of [0,.16,.32,.46,.59,.72,.88,1]){
    w.direct(t);assert.ok(w.camera.fov<100,JSON.stringify({id,actor,move,t,aspect,fov:w.camera.fov,arena:config.model}));
    for(const point of f.framePoints){
     const p=point.clone().project(w.camera);assert.ok(Math.abs(p.x)<=.881,id+' horizontal '+p.x);assert.ok(p.y<=(host?.431:.841)&&p.y>=-.781,id+' vertical '+p.y);
    }
   }}
  }
 }
});

for(const [arena,config] of Object.entries(ARENA_WORLDS))test(arena+' paths clear actual walls/ceiling and retain unobstructed fighter sight lines',async()=>{
 const bytes=await readFile(new URL('../public/'+config.model.slice(2),import.meta.url));const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');gltf.scene.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();
 for(const actor of ['A','B'])for(const move of moves)for(const aspect of [1,2.7])for(const t of [0,.16,.32,.46,.59,.72,.88,1]){
  const {position}=actionCamera(config,event(actor,move),t,aspect);
  for(const direction of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){ray.set(position,new THREE.Vector3(...direction));ray.near=0;ray.far=.12;assert.equal(ray.intersectObject(gltf.scene,true).length,0,'near-plane clearance');}
  for(const p of config.fighters){const center=new THREE.Vector3(...p).add(new THREE.Vector3(0,1,0)),direction=center.clone().sub(position);ray.set(position,direction.clone().normalize());ray.far=direction.length()-.1;assert.equal(ray.intersectObject(gltf.scene,true).length,0,arena+' camera-to-body occlusion '+JSON.stringify({actor,move,t}));}
 }
});
