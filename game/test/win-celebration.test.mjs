import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleWorld, KO_DURATION, CELEBRATION_DURATION } from '../public/battle-world.js';
import { CHARACTERS } from '../src/engine.mjs';
import { ARENA_WORLDS } from '../public/battle-contract.js';
import { GLTFLoader } from '../public/vendor/GLTFLoader.js';
import * as THREE from '../public/vendor/three.module.js';
import { readFile } from 'node:fs/promises';

function makeWorld(){
 const samples=[];const w=Object.create(BattleWorld.prototype);const winner={pose:[],koMaterials:[],root:{traverse(){}},home:{position:{clone(){return {sub(){return this},setY(){return this},normalize(){return this}}}}}};const loser={koMaterials:[],root:{traverse(){}},home:{position:{clone(){return {}}}}};
 Object.assign(w,{active:{id:'final',defeated:true,actor:'A',target:'B',koStartedAt:1000},fighters:{A:winner,B:loser},motion:{matches:false},container:{dataset:{}},camera:{position:new THREE.Vector3(0,3,8)},badge:{textContent:'',classList:{add(){},remove(){},toggle(){}},style:{setProperty(){}}},overview(){samples.push({op:'overview'});},poseKnockout(_f,ms){samples.push({op:'ko',ms});},poseCelebration(_f,ms){samples.push({op:'win',ms});},prepareCelebration(){samples.push({op:'prepare'});},finish(){samples.push({op:'finish'});this.active=null;},onComplete(){samples.push({op:'complete'});}});return {w,samples};
}
test('winner celebration is a separate full two-second tail after full KO, including delayed frames',()=>{
 assert.equal(KO_DURATION,2000);assert.equal(CELEBRATION_DURATION,2000);
 const {w,samples}=makeWorld(),e=w.active;
 w.animate(1000+2100);assert.equal(e.celebrationStartedAt,undefined,'first late KO frame cannot consume the next phase');
 w.animate(1000+2101);assert.ok(Math.abs(e.celebrationStartedAt-3101)<2);assert.ok(samples.some(x=>x.op==='prepare'));
 w.animate(3101+2100);assert.equal(w.active,e,'first late celebration frame only arms completion');
 w.animate(3101+2101);assert.equal(w.active,null);assert.deepEqual(samples.filter(x=>x.op==='complete').length,1);
});
test('animation phase is ordered and pose callbacks use independent elapsed clocks',()=>{
 const {w,samples}=makeWorld(),e=w.active;w.animate(1300);w.animate(2500);w.animate(3001);w.animate(3500);w.animate(3700);
 const ko=samples.filter(x=>x.op==='ko').map(x=>x.ms),win=samples.filter(x=>x.op==='win').map(x=>x.ms);
 assert.deepEqual(ko,[300,1500,2000,2000]);assert.equal(win[0],0);assert.ok(Math.abs(win[1]-200)<2);assert.ok(e.celebrationStartedAt>=e.koStartedAt+KO_DURATION);
});

test('celebration choreography runs on every real fighter rig, side, and arena layout',async()=>{
 const loader=new GLTFLoader(),{BattleWorld}=await import('../public/battle-world.js'),world=Object.create(BattleWorld.prototype);world.motion={matches:false};world.camera={position:new THREE.Vector3(0,3,8)};
 for(const [arenaId,config] of Object.entries(ARENA_WORLDS))for(let side=0;side<2;side++)for(const id of CHARACTERS){
  const bytes=await readFile(new URL('../public/assets/characters/'+id+'.glb',import.meta.url)),g=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),root=g.scene;root.scale.setScalar(.52);
  const holder=new THREE.Group();holder.add(root);holder.updateMatrixWorld(true);root.position.y-=new THREE.Box3().setFromObject(root).min.y;holder.position.fromArray(config.fighters[side]);const opponent=new THREE.Vector3(...config.fighters[1-side]);
  holder.rotation.y=Math.atan2(opponent.x-holder.position.x,opponent.z-holder.position.z);holder.updateMatrixWorld(true);
  const home={position:holder.position.clone(),rotation:holder.quaternion.clone(),scale:holder.scale.clone()},pose=[];root.traverse(o=>{if(o.isBone)pose.push([o,o.position.clone(),o.quaternion.clone(),o.scale.clone()]);});
  const point=(name,fallback)=>root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3())||holder.localToWorld(new THREE.Vector3(...fallback));
  const motionRig={pose,feet:['left','right'].map((s,i)=>({position:point(s+'foot',[i?.12:-.12,.14,0]),rotation:new THREE.Quaternion()})),hands:['left','right'].map((s,i)=>holder.worldToLocal(point(s+'hand',[i?.28:-.28,1.03,.16])))};
  const f={root,holder,home,motionRig,winDirection:new THREE.Vector3(...config.fighters[1-side]).sub(new THREE.Vector3(...config.fighters[side])).setY(0).normalize()};world.winDust=null;
  assert.doesNotThrow(()=>world.poseCelebration(f,0),arenaId+'/'+id+'/'+side+' takeoff');
  world.poseCelebration(f,1000);assert.ok(holder.position.y>home.position.y+.4,arenaId+'/'+id+'/'+side+' airborne');assert.ok(holder.quaternion.angleTo(home.rotation)>1.5,arenaId+'/'+id+'/'+side+' half spin');
  world.poseCelebration(f,1800);for(const arm of ['leftupperarm','rightupperarm']){const bone=root.getObjectByName(arm),rest=pose.find(row=>row[0]===bone)?.[2];assert.ok(bone&&rest&&bone.quaternion.angleTo(rest)>.08,arenaId+'/'+id+'/'+side+' arms-out '+arm);}
  world.poseCelebration(f,2000);assert.ok(Number.isFinite(holder.quaternion.length()),arenaId+'/'+id+'/'+side+' landing rotation');
 }
});
