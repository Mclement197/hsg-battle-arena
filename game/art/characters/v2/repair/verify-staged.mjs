import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import validator from 'gltf-validator';
import * as THREE from '../../../../public/vendor/three.module.js';
import {GLTFLoader} from '../../../../public/vendor/GLTFLoader.js';
const dir=process.argv[2],report=[];
for(const id of ['luca-di-grazia','free-rider','tryhard','assessment-hoodie','trischli-warrior','bad-teacher']){
 const raw=await fs.readFile(path.join(dir,id+'.glb'));const validation=await validator.validateBytes(raw,{maxIssues:50});assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));assert.equal(validation.issues.numWarnings,0,JSON.stringify(validation.issues));assert.ok(raw.length<3*1024*1024);
 const g=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');assert.deepEqual(g.animations.map(a=>a.name).sort(),['attack','defeat','defend','heal','hit','idle','special']);const m=new THREE.AnimationMixer(g.scene);let frames=0,minFloor=Infinity,maxFloor=-Infinity;const feet=[];g.scene.traverse(o=>{if(o.isBone&&['leftfoot','rightfoot'].includes(o.name))feet.push(o);if(o.isSkinnedMesh){const a=o.geometry.attributes.skinWeight;for(let i=0;i<a.count;i++)assert.ok(Math.abs(a.getX(i)+a.getY(i)+a.getZ(i)+a.getW(i)-1)<.0001);}});assert.equal(feet.length,2);
 for(const clip of g.animations){m.stopAllAction();const a=m.clipAction(clip);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();
  for(let i=0;i<=40;i++){m.setTime(i/40*clip.duration);g.scene.updateMatrixWorld(true);for(const b of feet){const h=b.getWorldPosition(new THREE.Vector3());minFloor=Math.min(minFloor,h.y);maxFloor=Math.max(maxFloor,h.y);}frames++;}
  // Actual runtime return crossfade, same 100ms duration; finite/sole drift inspected here.
  const idle=m.clipAction(g.animations.find(c=>c.name==='idle'));idle.reset().play().crossFadeFrom(a,.1,false);for(let i=0;i<6;i++){m.update(.02);g.scene.updateMatrixWorld(true);for(const b of feet)assert.ok(b.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite));}
 }
 assert.ok(maxFloor-minFloor<.035,id+' exported ankle drift '+(maxFloor-minFloor));
 console.log('EXPORT_CHARACTER_PASS',id,raw.length,frames,minFloor,maxFloor);
 report.push({id,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),validation:validation.issues,frames,ankleHeightRange:[minFloor,maxFloor],clips:g.animations.map(a=>({name:a.name,duration:a.duration}))});
}
await fs.writeFile(path.join(dir,'export-repair-validation.json'),JSON.stringify(report,null,2));console.log('STAGED_EXPORT_PASS',report.map(({id,bytes,frames,ankleHeightRange})=>({id,bytes,frames,ankleHeightRange})));
