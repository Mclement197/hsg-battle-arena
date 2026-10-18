import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import validator from 'gltf-validator';
import { ABILITIES, ARENA_WORLDS, BattleEvents } from '../public/battle-contract.js';
import { CHARACTER_THEMES } from '../public/app.js';
import { CHARACTERS, MOVES } from '../src/engine.mjs';
import { GLTFLoader } from '../public/vendor/GLTFLoader.js';
import * as THREE from '../public/vendor/three.module.js';
const state=(number=0,team='A',move='attack',id=CHARACTERS[0])=>({roomId:'room',match:0,phase:'running',teams:{A:{characterId:id,hp:100},B:{characterId:CHARACTERS[5],hp:100}},lastResult:number?{number,turnId:'0:'+number,team,move,resolvedAt:1000}:null});
for(const id of CHARACTERS)for(const move of MOVES)test(id+' / '+move+' matches real ability and actor/target',()=>{
 const ability=ABILITIES[id][move];assert.equal(ability.label,CHARACTER_THEMES[id].labels[move]);assert.equal(ability.clip,move);
 const q=new BattleEvents();q.consume(state());q.consume(state(1,'A',move,id));q.consume(state(1,'A',move,id));
 assert.equal(q.pending.length,1);assert.equal(q.pending[0].actor,'A');assert.equal(q.pending[0].target,['attack','special'].includes(move)?'B':'A');
 assert.ok(ability.launch<ability.impact);assert.ok(ability.impact<1);
});
test('queue historical reconnect, reordered duplicates, both actor directions and reset cancellation',()=>{
 const q=new BattleEvents();q.consume(state(4));assert.equal(q.pending.length,0);q.consume(state(5,'B'));assert.equal(q.pending[0].target,'A');q.consume(state(3));assert.equal(q.pending.length,1);
 q.reset();q.consume(state(9));assert.equal(q.pending.length,0);q.consume({...state(10),match:1});assert.equal(q.pending.length,0);
 q.consume({...state(11),match:1});q.consume({...state(),match:1,phase:'lobby'});assert.equal(q.pending.length,0);
});
for(const id of Object.keys(ARENA_WORLDS))test(id+' original environment is valid geometry and safe floor placement',async()=>{
 const bytes=await readFile(new URL('../public/'+ARENA_WORLDS[id].model.slice(2),import.meta.url));
 const result=await validator.validateBytes(bytes,{maxIssues:20});assert.equal(result.issues.numErrors,0,JSON.stringify(result.issues));assert.equal(result.issues.numWarnings,0,JSON.stringify(result.issues));
 assert.ok(bytes.length<6*1024*1024);const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 assert.ok(json.meshes.length>=15);assert.ok(!json.nodes.some(n=>n.extras?.placeholder||/placeholder/i.test(n.name||'')));assert.ok(json.extensionsUsed.includes('KHR_lights_punctual'));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');gltf.scene.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();for(const p of ARENA_WORLDS[id].fighters){ray.set(new THREE.Vector3(p[0],.15,p[2]),new THREE.Vector3(0,-1,0));const hits=ray.intersectObject(gltf.scene,true);assert.ok(hits.length,'real modeled floor under fighter');assert.ok(Math.abs(hits[0].point.y-p[1])<.04,JSON.stringify(hits[0].point));}
});
test('authored attack bone trajectories differ across all six exports',async()=>{
 const signatures=[];
 for(const id of CHARACTERS){const b=await readFile(new URL('../public/assets/characters/'+id+'.glb',import.meta.url));const g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');const m=new THREE.AnimationMixer(g.scene);m.clipAction(g.animations.find(a=>a.name==='attack')).play();m.update(.5);signatures.push(['chest','right.upperarm','right.forearm','left.upperarm'].map(n=>{let bone;g.scene.traverse(o=>{if(o.name===THREE.PropertyBinding.sanitizeNodeName(n))bone=o;});return bone.quaternion.toArray().map(x=>x.toFixed(3));}).flat().join(','));}
 assert.equal(new Set(signatures).size,6);
});

test('coalesced authoritative snapshots queue both results exactly once, not just latest',()=>{
 const q=new BattleEvents();q.consume(state());const s=state(2,'B','attack');s.recentResults=[{...state(1).lastResult,targetHp:72},{...s.lastResult,targetHp:0}];q.consume(s);q.consume(s);assert.equal(q.pending.length,2);assert.deepEqual(q.pending.map(e=>e.actor),['A','B']);assert.equal(q.pending[0].defeated,false);assert.equal(q.pending[1].defeated,true);
});

test('director is bounded, reduced motion stationary and scene cleanup cancels queue',async()=>{
 const {BattleWorld}=await import('../public/battle-world.js');
 const world=Object.create(BattleWorld.prototype);
 world.motion={matches:false};world.config=ARENA_WORLDS.library;world.state=state();world.state.arenaId='library';
 world.camera=new THREE.PerspectiveCamera();world.look=new THREE.Vector3(...world.config.look);world.scene=new THREE.Scene();world.events=new BattleEvents();world.badge={textContent:''};world.canvas={dataset:{}};world.renderer={shadowMap:{},dispose(){},forceContextLoss(){}};
 world.fighters={};for(const [i,t]of ['A','B'].entries()){const root=new THREE.Group(),holder=new THREE.Group(),mixer=new THREE.AnimationMixer(root);holder.position.fromArray(world.config.fighters[i]);holder.add(root);world.scene.add(holder);world.fighters[t]={root,holder,mixer,actions:new Map(['attack','idle','hit','defeat'].map(n=>[n,mixer.clipAction(new THREE.AnimationClip(n,1,[]))]))};}
 world.overview(true);const initial=world.camera.position.clone();const event={id:'x',actor:'A',target:'B',move:'attack',ability:ABILITIES[CHARACTERS[0]].attack};world.begin(event,100);world.animate(600);assert.ok(initial.distanceTo(world.camera.position)>.1);world.animate(1500);assert.equal(world.fighters.B.clip,'hit');world.animate(2400);assert.equal(world.active,null);assert.ok(initial.distanceTo(world.camera.position)<.001);
 world.motion.matches=true;world.begin(event,3000);world.animate(4000);assert.ok(initial.distanceTo(world.camera.position)<.001);world.animate(4500);assert.equal(world.fighters.B.clip,'hit');world.cancel();assert.equal(world.fx,null);assert.equal(world.events.pending.length,0);
});

test('server history carries actual actor/target HP and clears on match reset',async()=>{
 const {Arena}=await import('../src/engine.mjs');let now=100;const arena=new Arena({now:()=>now,pick:()=>0});const room=arena.create();arena.enableBot(room);const host=arena.authenticate(room,room.hostToken);arena.configure(room,host,{arenaId:'trischli',characterA:CHARACTERS[0],characterB:CHARACTERS[1]});arena.start(room,host,{});now=room.prebattle.deadline;arena.advance(room);
 for(let i=0;i<12;i++){const team=room.turn.team;room.turn.votes.set('test','defend');now=room.turn.deadline;arena.advance(room);assert.equal(room.lastResult.targetTeam,team);}
 assert.equal(room.recentResults.length,8);assert.equal(arena.snapshot(room,host).recentResults.length,8);arena.reset(room,host,{});assert.deepEqual(room.recentResults,[]);
});

for(const id of CHARACTERS)test(id+' shared-world scale and floor bounds through idle/attack/hit/defeat',async()=>{
 const bytes=await readFile(new URL('../public/assets/characters/'+id+'.glb',import.meta.url));const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const root=gltf.scene;root.scale.setScalar(.52);root.updateMatrixWorld(true);const rest=new THREE.Box3().setFromObject(root);root.position.y-=rest.min.y;root.updateMatrixWorld(true);const mixer=new THREE.AnimationMixer(root);
 for(const clip of ['idle','attack','defend','heal','special','hit','defeat']){mixer.stopAllAction();const a=mixer.clipAction(gltf.animations.find(c=>c.name===clip));a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();mixer.update(clip==='defeat'?1.49:.5);root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root);assert.ok(box.min.y>-.08,clip+' floor '+box.min.y);assert.ok(box.max.y<2.3,clip+' adult-scale '+box.max.y);}
});

for(const arenaId of Object.keys(ARENA_WORLDS))test(arenaId+' camera corridor is inside room for both actors',()=>{
 const world=ARENA_WORLDS[arenaId];for(const actor of [0,1])for(const p of world.fighters){const camera=new THREE.Vector3(...world.overview).lerp(new THREE.Vector3(...p).add(new THREE.Vector3(actor===0?-1.7:1.7,2.05,4.2)),.68);assert.ok(Math.abs(camera.x)<4);assert.ok(camera.y>1&&camera.y<3.4);if(arenaId==='trischli')assert.ok(camera.z<1&&camera.z>-9);}
});

test('battle presentation uses only shared scene, selection retains separate previews',async()=>{
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8'),characters=await readFile(new URL('../public/characters.js',import.meta.url),'utf8'),css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');assert.ok(app.includes('battleWorld.sync(client.state)'));assert.ok(characters.includes("image.closest('#battle-screen, #player-screen')"));assert.ok(css.includes('.battle-world-canvas{position:absolute'));assert.ok(css.includes('.fight-stage .fighter-visual'));
});

test('world diagnostic attributes cannot impersonate command buttons',async()=>{const source=await readFile(new URL('../public/battle-world.js',import.meta.url),'utf8');assert.ok(!source.includes('canvas.dataset.move='));const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.ok(app.includes("querySelectorAll('button[data-move]')"));});

test('only exact new world modules and arena GLBs are publicly served',async t=>{
 const http=await import('node:http');const {createGameServer}=await import('../src/server.mjs');const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const get=path=>new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port:game.server.address().port,path:'/game/'+path},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,type:res.headers['content-type']}));}).on('error',reject));
 for(const name of ['battle-world.js','battle-contract.js','assets/arenas/library.glb','assets/arenas/trischli.glb'])assert.equal((await get(name)).status,200,name);for(const name of ['assets/arenas/unknown.glb','assets/arenas/export-report.json','art/export-arenas.py'])assert.equal((await get(name)).status,404,name);
});

test('duplicated history entries cannot trigger two cinematics',()=>{const q=new BattleEvents();q.consume(state());const s=state(1);s.recentResults=[s.lastResult,s.lastResult];q.consume(s);assert.equal(q.pending.length,1);});
