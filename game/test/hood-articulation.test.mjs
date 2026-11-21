import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three.module.js';
import {GLTFLoader} from '../public/vendor/GLTFLoader.js';
import {prepareHood,moveHood,restoreHood,prepareGarment,moveGarment,restoreGarment,createMoveProps} from '../public/battle-world.js';
test('Hood Up deforms only original hood; exact restoration, shared geometry isolation and removal coexist',async()=>{
 const b=await readFile((process.env.MODEL_DIR||new URL('../public/assets/characters/',import.meta.url).pathname)+'/assessment-hoodie.glb');const g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const root=g.scene,holder=new T.Group();holder.add(root);const f={root,holder};let hood;root.traverse(o=>{if(o.userData.articulated_hood)hood=o;});assert.ok(hood);
 const original=[];hood.traverse(o=>{if(o.isSkinnedMesh)original.push([o,o.geometry,o.geometry.attributes.position.array.slice()]);});assert.ok(original.length);
 const prop=createMoveProps('Hood Up');assert.equal(prop.userData.parts.prop.children.length,0,'no duplicate raised prop');
 for(let repetition=0;repetition<3;repetition++){
  prepareHood(f);assert.equal(f.hood.length,original.length);moveHood(f,1);assert.ok(f.hood.some(({source})=>source.geometry.boundingBox.max.y>3.55),'raised authored hood reaches over the native crown, not only the nape');
  for(const [o,geometry,positions]of original){assert.notEqual(o.geometry,geometry);assert.deepEqual(geometry.attributes.position.array,positions);assert.ok(o.geometry.attributes.position.array.some((x,i)=>Math.abs(x-positions[i])>.2));}
  moveHood(f,0);for(const [o,,positions]of original)assert.deepEqual(o.geometry.attributes.position.array,positions);
  restoreHood(f);for(const [o,geometry]of original)assert.equal(o.geometry,geometry);
  prepareGarment(f);assert.ok(original.every(([o])=>f.garment.some(p=>p.source===o)),'hood travels with removed hoodie');moveGarment(f,1,new T.Vector3(-.2,2,.5),new T.Vector3(.2,2,.5));restoreGarment(f);assert.ok(original.every(([o])=>o.visible));
 }
});
