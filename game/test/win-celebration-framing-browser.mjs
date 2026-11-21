import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { CHARACTERS } from '../src/engine.mjs';
import { ARENA_WORLDS } from '../public/battle-contract.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(new URL('../public/',import.meta.url).pathname),report='/tmp/win-celebration-framing.json';
const hostHtml='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/game/styles.css"></head><body data-screen="battle"><main class="battle-screen" style="width:100vw;height:100vh;max-width:none;min-height:0;padding:0;display:flex;flex-direction:column"><div class="battle-top" style="height:44px;flex:none"></div><section class="fight-stage" style="flex:1;min-height:0;margin:0;padding:0;position:relative;overflow:hidden"><div class="fighter ace-fighter" style="position:absolute;top:0;left:0;width:48%;height:52px"><div class="health" style="height:48px">TEAM ACE</div></div><div class="fighter dynamo-fighter" style="position:absolute;top:0;right:0;width:48%;height:52px"><div class="health" style="height:48px">TEAM DYNAMO</div></div><div class="battle-bottom" style="position:absolute;bottom:0;left:0;width:100%;height:56px"></div></section></main></body></html>';
const phoneHtml='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/game/styles.css"></head><body data-screen="player"><main class="player-screen" style="width:100vw;height:100vh;max-width:none;min-height:0;padding:0;display:flex;flex-direction:column;gap:0;overflow:hidden"><header class="player-head" style="height:92px;flex:none"><h1>Player</h1></header><div id="player-world" class="player-world" style="height:clamp(145px,23dvh,215px);width:100%;flex:none;position:relative;overflow:hidden"></div><div class="player-preview" style="height:100px;flex:none">HEALTH HUD</div><footer style="flex:1">VOTE CONTROLS</footer></main></body></html>';
const server=http.createServer(async(req,res)=>{try{if(req.url.startsWith('/game/harness')){res.setHeader('Content-Type','text/html');res.end(req.url.includes('phone=1')?phoneHtml:hostHtml);return;}const rel=decodeURIComponent(req.url.split('?')[0]).replace(/^\/game\//,'');const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))throw Error('outside public tree');const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.glb':'model/gltf-binary','.css':'text/css','.webp':'image/webp','.png':'image/png'})[ext]||'application/octet-stream');res.end(await fs.readFile(file));}catch(e){res.statusCode=404;res.end(String(e));}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[],failures=[];
try{
 for(const phone of [false,true]){
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:820},isMobile:phone,hasTouch:phone,reducedMotion:'no-preference'}),page=await context.newPage();
  await page.goto(base+'/game/harness'+(phone?'?phone=1':''));
  await page.evaluate(async()=>{const {BattleWorld}=await import('/game/battle-world.js');const T=await import('/game/vendor/three.module.js');const C=await import('/game/battle-contract.js');window.__T=T;window.__C=C;window.__w=new BattleWorld();});
  for(const arena of Object.keys(ARENA_WORLDS))for(const id of CHARACTERS)for(const side of ['A','B']){
   const fixture={arena,id,side,phone};
   try{
    const sample=await page.evaluate(async({arena,id,side,phone})=>{
     const w=window.__w,T=window.__T,{ABILITIES}=window.__C,other=side==='A'?'B':'A';
     const state={roomId:'frame-'+arena+'-'+id+'-'+side+'-'+phone,match:0,phase:'running',arenaId:arena,teams:{A:{characterId:side==='A'?id:'tryhard',hp:100},B:{characterId:side==='B'?id:'tryhard',hp:100}},turn:{team:side,id:1}};
     w.sync(state);await w.ready;if(!w.renderer||w.container.dataset.worldStatus!=='ready')throw Error('world not ready: '+w.container?.dataset.worldStatus);
     cancelAnimationFrame(w.raf);const start=performance.now(),event={id:'frame:'+id+':'+side,actor:side,target:other,characterId:id,move:'attack',ability:ABILITIES[id].attack,defeated:true};w.begin(event,start);w.animate(start+event.ability.duration);
     const ko=w.active.koStartedAt;w.animate(ko+2000);w.animate(ko+2035);const celebration=w.active.celebrationStartedAt;if(!celebration)throw Error('celebration did not start after the full KO');
     w.animate(celebration+900);w.renderer.render(w.scene,w.camera);
     const f=w.fighters[side],canvas=w.canvas,cr=canvas.getBoundingClientRect(),container=w.container.getBoundingClientRect();let safe;
     if(phone)safe={top:container.top+4,bottom:container.bottom-4,left:container.left+4,right:container.right-4};
     else{const tops=[...w.container.querySelectorAll('.fighter .health,.battle-top')].filter(e=>e.getClientRects().length),bottoms=[...w.container.querySelectorAll('.battle-bottom,.solo-controls')].filter(e=>e.getClientRects().length);safe={top:Math.max(...tops.map(e=>e.getBoundingClientRect().bottom))+8,bottom:Math.min(...bottoms.map(e=>e.getBoundingClientRect().top))-8,left:cr.left+4,right:cr.right-4};}
     const bounds={top:Infinity,bottom:-Infinity,left:Infinity,right:-Infinity,count:0},hidden=[];
     f.root.traverse(mesh=>{if(!mesh.isMesh||!mesh.geometry?.attributes?.position)return;let parent=mesh;while(parent){if(!parent.visible)return;parent=parent.parent;}mesh.skeleton?.update();const p=mesh.geometry.attributes.position,draw=mesh.geometry.drawRange,start=Math.max(0,draw.start||0),end=Math.min(p.count,draw.count===Infinity?p.count:start+draw.count);for(let i=start;i<end;i++){const v=mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld).project(w.camera),x=cr.left+(v.x+1)*cr.width/2,y=cr.top+(1-v.y)*cr.height/2;bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.count++;}});
     return {arena,id,side,phone,phase:w.container.dataset.winPhase,canvas:{x:cr.x,y:cr.y,width:cr.width,height:cr.height},safe,bounds,cameraFov:w.camera.fov,celebrationElapsed:w.active.celebrationTime};
    },fixture);
    results.push(sample);
    const margin=1.5,ok=sample.bounds.count>0&&sample.bounds.top>=sample.safe.top-margin&&sample.bounds.bottom<=sample.safe.bottom+margin&&sample.bounds.left>=sample.safe.left-margin&&sample.bounds.right<=sample.safe.right+margin;
    if(!ok)failures.push({fixture,sample});
   }catch(error){failures.push({fixture,error:String(error)});}
  }
  await page.evaluate(()=>window.__w.dispose());await context.close();
 }
 await fs.writeFile(report,JSON.stringify({results,failures},null,2));assert.deepEqual(failures,[],'actual rendered jump vertices must fit the HUD-safe viewport; diagnostics '+report);console.log(JSON.stringify({tested:results.length,failures:failures.length,report}));
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
