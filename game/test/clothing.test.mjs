import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three.module.js';
import {GLTFLoader} from '../public/vendor/GLTFLoader.js';
import {prepareGarment,moveGarment,restoreGarment} from '../public/battle-world.js';
async function model(id){const b=await readFile(process.env.MODEL_DIR?process.env.MODEL_DIR+'/'+id+'.glb':new URL('../public/assets/characters/'+id+'.glb',import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
test('actual hoodie shell moves, underlying torso stays, no duplicate prop or recolor; reentry restores exactly',async()=>{
 const g=await model('assessment-hoodie'),holder=new T.Group(),root=g.scene;root.scale.setScalar(.52);holder.add(root);const f={root,holder};const left=new T.Vector3(-.23,1.5,.5),right=new T.Vector3(.23,1.5,.5);
 const colors=[];root.traverse(o=>{if(o.material)colors.push([o.material,o.material.color.getHex()]);});
 for(let repetition=0;repetition<3;repetition++){
  prepareGarment(f);assert.ok(f.garment.length>0);assert.equal(new Set(f.garment.map(p=>p.source)).size,f.garment.length);
  moveGarment(f,0,left,right);const before=f.garment.map(({cloth})=>cloth.geometry.attributes.position.array.slice());
  moveGarment(f,1,left,right);assert.ok(f.garment.every(({source})=>!source.visible));assert.ok(f.garment.some(({cloth},j)=>cloth.geometry.attributes.position.array.some((v,i)=>Math.abs(v-before[j][i])>.1)));
  moveGarment(f,0,left,right);for(const [j,{cloth}]of f.garment.entries())assert.deepEqual(cloth.geometry.attributes.position.array,before[j],'redress exact original surface');
  const sources=f.garment.map(x=>x.source),cloth=f.garment.map(x=>x.cloth);restoreGarment(f);assert.equal(f.garment,null);assert.ok(sources.every(s=>s.visible));assert.ok(cloth.every(s=>s.parent===null));
 }
 for(const [m,color]of colors)assert.equal(m.color.getHex(),color);let underlayer=false;root.traverse(o=>{if(o.userData.underlayer)underlayer=true;});assert.ok(underlayer);
});
test('Trischli inner tee is a subdivided torso-weighted fabric surface, not a pelvis-bound rigid box',async()=>{
 const g=await model('trischli-warrior');let tee;g.scene.traverse(o=>{if(o.isSkinnedMesh&&o.name.includes('conforming_inner_tee'))tee=o;});assert.ok(tee);assert.ok(tee.geometry.attributes.position.count>=325);const mixer=new T.AnimationMixer(g.scene);mixer.clipAction(g.animations.find(c=>c.name==='heal')).play();
 let plum;g.scene.traverse(o=>{if(o.isSkinnedMesh&&o.material?.name==='club plum satin')plum=o;});assert.ok(plum);
 for(let i=0;i<=36;i++){
  mixer.setTime(i/24);g.scene.updateMatrixWorld(true);tee.skeleton.update();plum.skeleton.update();plum.computeBoundingSphere();
  for(let v=0;v<tee.geometry.attributes.position.count;v++)assert.ok(tee.getVertexPosition(v,new T.Vector3()).toArray().every(Number.isFinite));
  for(const vertex of [30,80,150,220,280]){const point=tee.getVertexPosition(vertex,new T.Vector3()).applyMatrix4(tee.matrixWorld),ray=new T.Raycaster(point.clone().add(new T.Vector3(0,0,3)),new T.Vector3(0,0,-1)),hit=ray.intersectObject(plum,false)[0];assert.ok(hit,'underlying torso intersection');assert.ok(point.z-hit.point.z>.004,'inner tee stays in front of plum torso at heal frame '+i);}
 }
});
