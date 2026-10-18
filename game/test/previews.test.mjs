import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGameServer} from '../src/server.mjs';
import {CHARACTERS} from '../src/engine.mjs';
import {modelFor} from '../public/characters.js';
const root=new URL('../',import.meta.url), hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(new URL('art/preview-manifest.json',root)));
test('all six portrait and both actual arena images match current source digests',async()=>{
 assert.equal(manifest.sourceCommit,'96f7431');assert.equal(Object.keys(manifest.sources).length,11);assert.equal(Object.keys(manifest.images).length,8);
 for(const [file,digest] of Object.entries(manifest.sources))assert.equal(hash(await readFile(new URL(file,root))),digest,file+' source changed: regenerate previews');
 for(const [file,meta] of Object.entries(manifest.images)){const b=await readFile(new URL('public/'+file,root));assert.equal(hash(b),meta.sha256,file);assert.equal(b.toString('ascii',8,12),'WEBP');assert.ok(b.length<130000,file+' budget');}
 for(const id of CHARACTERS){const portrait=modelFor(id).portrait;assert.ok(portrait.endsWith('?v='+manifest.generation));assert.ok(manifest.images[portrait.slice(2).split('?')[0]]);}
});
test('all active UI image consumers exclude legacy fighters, fake arenas and campus photo',async()=>{
 const files=await Promise.all(['app.js','index.html','styles.css','characters.js','battle-world.js'].map(f=>readFile(new URL('public/'+f,root),'utf8')));
 for(const source of files){for(const legacy of ['assessment-ace.svg','deadline-dynamo.svg','arena-library.svg','arena-trischli.svg','arena-mensa-b.svg','hsg-learning-center.webp','data:image'])assert.ok(!source.includes(legacy),legacy);assert.ok(!source.includes('serviceWorker.register'));}
 assert.ok(files[0].includes("'.webp?v=96f7431-previews1'"));assert.ok(files[2].includes('.fight-stage:not([data-world-status=ready]) .fighter-visual'));
});
test('all current previews and models served with correct MIME, no-store and exact bytes',async t=>{
 const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const base='http://127.0.0.1:'+game.server.address().port+'/game/';
 const files=[...Object.keys(manifest.images),...Object.keys(manifest.sources).filter(f=>f.startsWith('public/')).map(f=>f.slice(7))];
 for(const file of files){const res=await new Promise((resolve,reject)=>http.get(base+file+'?v='+manifest.generation,r=>{const parts=[];r.on('data',b=>parts.push(b));r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,body:Buffer.concat(parts)}));}).on('error',reject));assert.equal(res.status,200,file);assert.equal(res.headers['cache-control'],'no-store');assert.equal(res.headers['content-type'],file.endsWith('.webp')?'image/webp':'model/gltf-binary');assert.equal(hash(res.body),hash(await readFile(new URL('public/'+file,root))),file);}
});
