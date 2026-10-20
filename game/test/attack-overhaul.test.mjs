import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three.module.js';
import {GLTFLoader} from '../public/vendor/GLTFLoader.js';
import {release} from '../public/characters.js';
import {BattleWorld,MOVE_CHOREOGRAPHY,createMoveProps,fighterEnvelope,createMensa} from '../public/battle-world.js';
import {ABILITIES,ARENA_WORLDS,BattleEvents} from '../public/battle-contract.js';
import {CHARACTERS,MOVES} from '../src/engine.mjs';

test('every actual roster move has a deliberate unique prop and gesture, no motif fallback',()=>{
 const labels=CHARACTERS.flatMap(id=>MOVES.map(move=>ABILITIES[id][move].label));
 assert.deepEqual(new Set(Object.keys(MOVE_CHOREOGRAPHY)),new Set(labels));assert.equal(labels.length,24);
 assert.equal(new Set(Object.values(MOVE_CHOREOGRAPHY).map(r=>r.prop)).size,24);
 assert.equal(new Set(Object.values(MOVE_CHOREOGRAPHY).map(r=>r.gesture)).size,24);
 for(const label of labels){const props=createMoveProps(label);assert.ok(props.children.length===3);// Take Hoodie Off deforms the actual authored shell; a second prop would duplicate it.
  if(props.userData.recipe.prop==='jacket')assert.equal(props.userData.parts.prop.children.length,0,label);else assert.ok(props.userData.parts.prop.children.length>0,label);let geometries=0,materials=0;props.traverse(o=>{if(o.geometry){geometries++;o.geometry.addEventListener('dispose',()=>geometries--);}if(o.material){materials++;o.material.addEventListener('dispose',()=>materials--);}});release(props);assert.equal(geometries,0);assert.ok(materials<=0);}
 assert.throws(()=>createMoveProps('unknown'),/Missing move/);
});
async function fighter(id,config,i){
 const bytes=await readFile(new URL('../public/assets/characters/'+id+'.glb',import.meta.url));const g=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const root=g.scene,holder=new THREE.Group();root.scale.setScalar(.52);root.updateMatrixWorld(true);root.position.y-=new THREE.Box3().setFromObject(root).min.y;holder.add(root);holder.position.fromArray(config.fighters[i]);const other=new THREE.Vector3(...config.fighters[1-i]);holder.rotation.y=Math.atan2(other.x-holder.position.x,other.z-holder.position.z);const mixer=new THREE.AnimationMixer(root),f={root,holder,mixer,actions:new Map(g.animations.map(c=>[c.name,mixer.clipAction(c)])),home:{position:holder.position.clone(),rotation:holder.quaternion.clone(),scale:holder.scale.clone()}};f.envelope=fighterEnvelope(f);return f;
}
for(const id of CHARACTERS)test(id+' all moves, both sides, all arenas: seekable motion, live HUD fit, floor, exact cancellation and held reduced-motion',async()=>{
 for(const config of Object.values(ARENA_WORLDS)){
  let environment;if(config.model==='mensa-reconstruction')environment=(await createMensa()).scene;else{const b=await readFile(new URL('../public/'+config.model.slice(2),import.meta.url));environment=(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;}environment.updateMatrixWorld(true);const ray=new THREE.Raycaster();
  const w=Object.create(BattleWorld.prototype);Object.assign(w,{config,events:new BattleEvents(),fighters:{A:await fighter(id,config,0),B:await fighter(id,config,1)},motion:{matches:false},camera:new THREE.PerspectiveCamera(49,1),scene:new THREE.Scene(),look:new THREE.Vector3(),canvas:{dataset:{}},badge:{textContent:''},renderer:{shadowMap:{}},state:{teams:{A:{hp:100},B:{hp:100}}}});for(const f of Object.values(w.fighters))w.scene.add(f.holder);w.overview(true);
  for(const actor of ['A','B'])for(const move of MOVES){const ability=ABILITIES[id][move],e={id:id+actor+move,actor,target:ability.target==='actor'?actor:actor==='A'?'B':'A',move,ability};w.begin(e,0);
   for(const t of [.20,.43,.63,.89]){w.animate(ability.duration*t);const f=w.fighters[actor],pos=f.holder.position.clone(),bone=f.root.getObjectByName('rightupperarm'),q=bone.quaternion.clone();w.animate(ability.duration*t);assert.ok(bone.quaternion.toArray().every((x,i)=>Math.abs(x-q.toArray()[i])<1e-8),JSON.stringify({id,actor,move,t,before:q.toArray(),after:bone.quaternion.toArray(),angle:bone.quaternion.angleTo(q)}));assert.ok(f.holder.position.distanceTo(pos)<1e-6,'seekable position');
    for(const aspect of [2.7,.85]){w.camera.aspect=aspect;w.direct(t);for(const p of w.framingPoints){const point=p.clone().project(w.camera);assert.ok(Math.abs(point.x)<=.881);assert.ok(point.y<=.841&&point.y>=-.781,'HUD bounds');}
     const center=f.holder.position.clone().add(new THREE.Vector3(0,1,0)),direction=center.sub(w.camera.position);ray.set(w.camera.position,direction.clone().normalize());ray.near=.12;ray.far=direction.length()-.1;assert.equal(ray.intersectObject(environment,true).length,0,'moving performer stays visible through real arena geometry');
    }
    assert.ok(new THREE.Box3().setFromObject(f.holder,true).min.y>=config.floor-1e-5,'floor '+JSON.stringify({id,actor,move,t,min:new THREE.Box3().setFromObject(f.holder,true).min.y,floor:config.floor}));
   }
   w.cancel();for(const f of Object.values(w.fighters)){assert.deepEqual(f.holder.position.toArray(),f.home.position.toArray());assert.ok(f.holder.quaternion.angleTo(f.home.rotation)<1e-6);}assert.equal(w.fx,null);assert.deepEqual(w.camera.position.toArray(),config.overview);
   w.motion.matches=true;w.begin(e,0);const matrices=[];for(const t of [.2,.4,.7,.86]){w.animate(t*ability.duration);matrices.push(w.camera.projectionMatrix.toArray());assert.deepEqual(w.fighters[actor].holder.position.toArray(),w.fighters[actor].home.position.toArray());}assert.ok(matrices.every(m=>JSON.stringify(m)===JSON.stringify(matrices[0])));w.cancel();w.motion.matches=false;
  }
  for(const f of Object.values(w.fighters))release(f.holder);release(environment);
 }
});
