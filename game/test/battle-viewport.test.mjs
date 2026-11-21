import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);

test('battle HUD is part of the shared 3D arena, without changing player controls', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const stage = html.slice(html.indexOf('<div class="fight-stage">'), html.indexOf('<div class="host-bar host-control">'));
  assert.match(stage, /<div class="fight-stage"><div class="battle-top">/);
  assert.match(stage, /<div class="battle-bottom">/);
  assert.match(stage, /<div id="solo-controls"/);
  assert.ok(stage.indexOf('solo-controls') < stage.lastIndexOf('</div>'), 'controls stay inside arena');
  assert.match(html, /<section id="player-screen"[^]*?<div id="player-moves"/);
});

test('battle screen persists after sound hint is hidden and camera frames measured HUD', async () => {
  const css = await readFile(new URL('styles.css', root), 'utf8');
  const world = await readFile(new URL('battle-world.js', root), 'utf8');
  assert.match(css, /body\[data-screen=battle\]\{grid-template-rows:auto minmax\(0,1fr\)\}/);
  assert.match(css, /body\[data-screen=battle\] #sound-hint\{position:absolute/);
  assert.match(css, /body\[data-screen=battle\] \.battle-screen\{[^}]*height:100%/);
  assert.match(world, /this\.frameBottom=host\?1-2\*bottomEdge\/h:-\.78/);
  assert.match(world, /this\.frameBottom\?\?-\.78/);
});


// Exercise the actual layout/frame seam, not a source-string or camera-travel proxy.
test('both fighters stay inside measured HUD bounds in held, action and return shots', async () => {
  const { BattleWorld, selectionCamera, actionCamera } = await import('../public/battle-world.js');
  const { ARENA_WORLDS, ABILITIES } = await import('../public/battle-contract.js');
  const THREE = await import('../public/vendor/three.module.js');
  for (const [width, height, top, bottom] of [
    [350,557,110,394], [380,761,110,598], [350,477,110,314],
    [730,307,76,202], [1260,810,125,655], [1420,910,125,755]
  ]) for (const config of Object.values(ARENA_WORLDS)) {
    const element = (y, h) => ({ hidden:false, offsetHeight:h, getClientRects:()=>[1], getBoundingClientRect:()=>({top:y,bottom:y+h}) });
    const health=element(55,top-55), status=element(height-27,27), controls=element(bottom,height-27-bottom);
    const container={clientWidth:width,clientHeight:height,classList:{contains:()=>true},style:{setProperty(){}},
      getBoundingClientRect:()=>({top:0}),
      querySelectorAll:selector=>selector.startsWith('.fighter')?[health]:[status,controls],
      querySelector:selector=>selector==='.battle-bottom'?status:controls};
    const fighters=Object.fromEntries(config.fighters.map((position,index)=>{
      const box=new THREE.Box3(new THREE.Vector3(-.65,0,-.45),new THREE.Vector3(.65,2.1,.45)).translate(new THREE.Vector3(...position));
      const framePoints=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])framePoints.push(new THREE.Vector3(x,y,z));
      return [index?'B':'A',{envelope:box,framePoints}];
    }));
    const world=Object.assign(Object.create(BattleWorld.prototype),{config,container,fighters,camera:new THREE.PerspectiveCamera(),look:new THREE.Vector3(),motion:{matches:false},canvas:{dataset:{}},renderer:{setSize(){}},state:{phase:'lobby'}});
    world.layout();
    assert.equal(world.frameTop,1-2*(top+8)/height);
    assert.equal(world.frameBottom,1-2*(bottom-8)/height);
    const visible=()=>{for(const f of Object.values(fighters))for(const point of f.framePoints){const p=point.clone().project(world.camera);assert.ok(Math.abs(p.x)<=.880001,'both fighters horizontal');assert.ok(p.y<=world.frameTop+1e-6&&p.y>=world.frameBottom-1e-6,'both fighters between actual HUD edges');}};
    visible();
    for(const actor of ['A','B']){
      const shot=selectionCamera(config,actor,width/height);world.frame(shot.position,shot.look);visible();
      for(const move of ['attack','defend','heal','special']){
        world.active={actor,target:['attack','special'].includes(move)?actor==='A'?'B':'A':actor,move,ability:ABILITIES['luca-di-grazia'][move],returnFrom:shot.position};
        for(const t of [0,.16,.32,.46,.59,.72,.88,1]){world.direct(t);visible();}
        assert.ok(world.camera.position.distanceTo(actionCamera(config,world.active,1,width/height).position)<1e-8);
      }
    }
  }
});
