import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BattlePresentation,ABILITIES,ARENA_WORLDS,moveLabel} from '../public/battle-contract.js';
import {BattleWorld,selectionCamera,actionCamera} from '../public/battle-world.js';
import * as THREE from '../public/vendor/three.module.js';
import {GLTFLoader} from '../public/vendor/GLTFLoader.js';
const initial=()=>({roomId:'qa',match:0,phase:'running',teams:{A:{hp:100,characterId:'luca-di-grazia'},B:{hp:100,characterId:'bad-teacher'}},lastResult:null});
const result=(n,team,move,hp)=>({number:n,turnId:'0:'+n,team,move,targetTeam:['attack','special'].includes(move)?team==='A'?'B':'A':team,targetHp:hp,actorCharacterId:team==='A'?'luca-di-grazia':'bad-teacher'});
test('all 24 named moves derive from the sole ability mapping',()=>{for(const [id,abilities]of Object.entries(ABILITIES))for(const [move,ability]of Object.entries(abilities))assert.equal(moveLabel(id,move),move[0].toUpperCase()+move.slice(1)+' · '+ability.label);});
test('rapid coalesced damage, opponent attack, heal and lethal commit individually only on matching completion',()=>{
 const p=new BattlePresentation(),s=initial();p.consume(s);
 const results=[result(1,'A','attack',72),result(2,'B','attack',78),result(3,'A','heal',92),result(4,'B','special',0)];
 const latest={...s,phase:'finished',winner:'B',teams:{A:{...s.teams.A,hp:0},B:{...s.teams.B,hp:72}},lastResult:results.at(-1),recentResults:results};
 p.consume(latest);p.consume(latest);assert.equal(p.pending.length,4);assert.equal(p.view(latest).phase,'running');assert.deepEqual(p.hp,{A:100,B:100});assert.equal(p.result,null);
 assert.equal(p.complete(p.pending[1].id),false);
 for(const hp of [{A:100,B:72},{A:78,B:72},{A:92,B:72},{A:0,B:72}]){assert.equal(p.complete(p.pending[0].id),true);assert.deepEqual(p.hp,hp);}
 assert.equal(p.view(latest).phase,'finished');assert.equal(p.view(latest).winner,'B');assert.equal(latest.teams.A.hp,0);
 p.consume(latest);assert.equal(p.pending.length,0);assert.deepEqual(p.hp,{A:0,B:72});
});
test('reconnect initial history, reset and changed match never replay stale results',()=>{
 const s=initial(),p=new BattlePresentation();p.consume(s);const r=result(1,'A','attack',72),next={...s,lastResult:r,teams:{...s.teams,B:{...s.teams.B,hp:72}}};p.consume(next);assert.equal(p.busy,true);p.reset();p.consume(next);assert.equal(p.busy,false);assert.equal(p.hp.B,72);
 p.consume({...next,match:1,phase:'lobby',lastResult:null,teams:s.teams});assert.equal(p.busy,false);assert.equal(p.hp.B,100);
});
test('more than eight connected results are retained and no completed HP snaps to a future snapshot',()=>{
 const p=new BattlePresentation(),s=initial();p.consume(s);for(let n=1;n<=12;n++)p.consume({...s,lastResult:result(n,'A','attack',100-n),teams:{...s.teams,B:{...s.teams.B,hp:100-n}}});assert.equal(p.pending.length,12);p.complete(p.pending[0].id);assert.equal(p.hp.B,99);
});
for(const [arena,config]of Object.entries(ARENA_WORLDS))test(arena+' held opposing selection shots and transitions clear geometry and sight lines',async()=>{
 const bytes=await readFile(new URL('../public/'+config.model.slice(2),import.meta.url));const g=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');g.scene.updateMatrixWorld(true);const ray=new THREE.Raycaster();
 // The integrated HUD uses shallow mirrored shots so both bodies remain comparable in size.
 // World-space travel (>2.4 in the old wide orbit) is not a visibility requirement.
 for(const aspect of [.65,.85,1.6,2.7])for(const team of ['A','B']){
 const shot=selectionCamera(config,team,aspect),opposing=selectionCamera(config,team==='A'?'B':'A',aspect);
 assert.equal(shot.phase,'selection-'+team);assert.equal(shot.position.x,-opposing.position.x);
 assert.ok(team==='A'?shot.position.x<0:shot.position.x>0,'opposing held shots');
 assert.deepEqual(shot.look.toArray(),config.look);
 assert.deepEqual(selectionCamera(config,team,aspect).position.toArray(),shot.position.toArray(),'held, not orbiting');
 for(let i=0;i<=20;i++){const t=i/20,action=actionCamera(config,{actor:team,target:team==='A'?'B':'A',move:'special',ability:ABILITIES['luca-di-grazia'].special},t*.32,aspect);const p=action.position.lerp(shot.position,1-t*t*(3-2*t));
 for(const d of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){ray.set(p,new THREE.Vector3(...d));ray.near=0;ray.far=.12;assert.equal(ray.intersectObject(g.scene,true).length,0,team+' near-plane '+i);}
 for(const f of config.fighters){const delta=new THREE.Vector3(...f).add(new THREE.Vector3(0,1,0)).sub(p);ray.set(p,delta.clone().normalize());ray.far=delta.length()-.1;assert.equal(ray.intersectObject(g.scene,true).length,0,team+' body occlusion '+i);}
 }
 }
});
test('non-WebGL completion uses the ability duration and cancellation clears it',async()=>{
 const w=Object.create(BattleWorld.prototype);Object.assign(w,{events:{pending:[{id:'fallback',ability:{duration:15}}]},fighters:{},overview(){},onComplete(e){this.completed=e.id;}});w.pumpFallback();assert.equal(w.completed,undefined);await new Promise(r=>setTimeout(r,25));assert.equal(w.completed,'fallback');assert.equal(w.active,null);
});

test('selection returns smoothly by ability launch before any world effect, reduced view remains still',()=>{
 const config=ARENA_WORLDS.library,from=selectionCamera(config,'A').position;
 const w=Object.create(BattleWorld.prototype);Object.assign(w,{config,motion:{matches:false},camera:new THREE.PerspectiveCamera(),look:new THREE.Vector3(),fighters:{},canvas:{dataset:{}},active:{actor:'A',target:'B',move:'attack',ability:ABILITIES['luca-di-grazia'].attack,returnFrom:from}});
 w.direct(0);assert.ok(w.camera.position.distanceTo(from)<1e-8);let previous=w.camera.position.clone();for(let i=1;i<=32;i++){w.direct(i/100);assert.ok(previous.distanceTo(w.camera.position)<.25);previous=w.camera.position.clone();}assert.ok(w.camera.position.distanceTo(actionCamera(config,w.active,.32).position)<1e-8);
 w.motion.matches=true;w.direct(.2);assert.deepEqual(w.camera.position.toArray(),config.overview);
});
