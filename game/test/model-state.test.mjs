import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three.module.js';
import {GLTFLoader} from '../public/vendor/GLTFLoader.js';
import {BattleWorld} from '../public/battle-world.js';
import {CHARACTERS} from '../src/engine.mjs';
for(const id of CHARACTERS)test(id+': hit returns to idle without snapping bones at finish',async()=>{
 const b=await readFile(new URL('../public/assets/characters/'+id+'.glb',import.meta.url)),g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const w=Object.create(BattleWorld.prototype),root=g.scene,holder=new T.Group();holder.add(root);const mixer=new T.AnimationMixer(root),f={root,holder,mixer,actions:new Map(g.animations.map(c=>[c.name,mixer.clipAction(c)])),home:{position:holder.position.clone(),rotation:holder.quaternion.clone(),scale:holder.scale.clone()}};w.fighters={A:f};w.play('A','hit');mixer.update(.8);assert.equal(f.clip,'idle','one-shot hit must not freeze victim until the next global action finish');
});
test('playing an already active clip never resets its transition weights',()=>{const w=Object.create(BattleWorld.prototype),root=new T.Group(),mixer=new T.AnimationMixer(root),a=mixer.clipAction(new T.AnimationClip('idle',2,[]));w.fighters={A:{mixer,actions:new Map([['idle',a]])}};w.play('A','idle');mixer.update(.4);w.play('A','idle');assert.equal(a.time,.4);});
test('reused reaction restores weight and authored speed; defeat remains held',()=>{const w=Object.create(BattleWorld.prototype),root=new T.Group(),mixer=new T.AnimationMixer(root),idle=mixer.clipAction(new T.AnimationClip('idle',2,[])),hit=mixer.clipAction(new T.AnimationClip('hit',.75,[])),defeat=mixer.clipAction(new T.AnimationClip('defeat',1.5,[]));w.fighters={A:{mixer,actions:new Map([['idle',idle],['hit',hit],['defeat',defeat]])}};w.play('A','hit');hit.setEffectiveWeight(0);hit.setDuration(.2);w.play('A','idle');mixer.update(.2);w.play('A','hit');assert.equal(hit.getEffectiveWeight(),1);assert.equal(hit.getEffectiveTimeScale(),1);w.play('A','defeat');mixer.update(2);assert.equal(w.fighters.A.clip,'defeat');assert.equal(defeat.paused,true);});
