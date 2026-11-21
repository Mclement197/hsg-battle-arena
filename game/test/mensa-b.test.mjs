import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import http from 'node:http';
import * as THREE from '../public/vendor/three.module.js';
import {MENSA_SCENE_GZIP,ARENA_WORLDS} from '../public/battle-contract.js';
import {createMensa,selectionCamera} from '../public/battle-world.js';
import {release} from '../public/characters.js';
import {createGameServer} from '../src/server.mjs';
const recipe=JSON.parse(gunzipSync(Buffer.from(MENSA_SCENE_GZIP,'base64')));
test('Mensa runtime is the exact evaluated native reconstruction, compact and instanced',async()=>{
 assert.deepEqual(recipe,JSON.parse(await readFile(new URL('../art/mensa-b/scene.json',import.meta.url))));
 assert.ok(MENSA_SCENE_GZIP.length<800000);assert.equal(ARENA_WORLDS['mensa-b'].model,'mensa-reconstruction');
 assert.ok(recipe.materials.some(m=>m.name.includes('bentwood')));assert.ok(recipe.materials.some(m=>m.name.includes('Parquet')));
 const {scene}=await createMensa();let count=0,triangles=0;scene.traverse(o=>{if(o.isMesh){assert.ok(o.isInstancedMesh);count++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*o.count;}});
 assert.ok(count<85);assert.ok(triangles<200000);assert.ok(scene.children.some(o=>o.isLight));release(scene);
});
test('Mensa selection shots and transition corridor clear real geometry on both sides',async()=>{
 const {scene}=await createMensa();scene.updateMatrixWorld(true);const config=ARENA_WORLDS['mensa-b'],ray=new THREE.Raycaster();
 for(const team of ['A','B']){const shot=selectionCamera(config,team);for(let i=0;i<=10;i++){
  const position=new THREE.Vector3(...config.overview).lerp(shot.position,i/10);
  for(const direction of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){ray.set(position,new THREE.Vector3(...direction));ray.near=0;ray.far=.13;assert.equal(ray.intersectObject(scene,true).length,0,'selection near clearance');}
  for(const p of config.fighters){const target=new THREE.Vector3(...p).add(new THREE.Vector3(0,1,0)),delta=target.sub(position);ray.set(position,delta.clone().normalize());ray.far=delta.length()-.1;assert.equal(ray.intersectObject(scene,true).length,0,'selection body sightline');}
 }}release(scene);
});
test('Mensa preview is a real rendered WebP on existing static no-store route',async t=>{
 const file='assets/arena-mensa-b.webp',disk=await readFile(new URL('../public/'+file,import.meta.url));assert.equal(disk.toString('ascii',8,12),'WEBP');assert.ok(disk.length<220000);
 const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());
 const res=await new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port:game.server.address().port,path:'/game/'+file+'?v=20261019-mensa1'},r=>{const parts=[];r.on('data',b=>parts.push(b));r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,bytes:Buffer.concat(parts)}));}).on('error',reject));
 assert.equal(res.status,200);assert.equal(res.headers['content-type'],'image/webp');assert.equal(res.headers['cache-control'],'no-store');assert.deepEqual(res.bytes,disk);
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.ok(!source.includes('3D arena not modeled'));assert.ok(!source.includes('No 3D environment yet'));
});
