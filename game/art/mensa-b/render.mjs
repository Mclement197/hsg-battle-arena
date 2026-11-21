// Render the actual production instanced scene, never a photograph or image-generation proxy.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGameServer} from '../../src/server.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const dir=process.env.EVIDENCE_DIR||'/home/mathis/.openclaw/workspace/media/hsg-mensa-b/renders';await mkdir(dir,{recursive:true});
const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.route('**/game/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await p.goto('http://127.0.0.1:'+game.server.address().port+'/game/');
 const shots=[['runtime-central-aisle',[0,1.62,6.8],[0,1.65,-10.7],44],['runtime-art-wall',[7.5,1.65,7.2],[10,1.6,-6],47],['runtime-coffee-counter',[4.2,1.6,2.8],[4.2,1.6,9.3],47],['runtime-reverse',[-6,1.75,-8.8],[0,1.55,7],49],['runtime-overall',[10,2.6,8],[-2,1.5,-6],54]];
 const metrics=await p.evaluate(async shots=>{
  const {BattleWorld}=await import('./battle-world.js?v=20261019-mensa1');document.body.replaceChildren();document.body.dataset.screen='battle';const stage=document.createElement('div');stage.className='fight-stage';stage.style.cssText='width:1920px;height:1080px;margin:0';document.body.append(stage);
  const w=new BattleWorld();w.sync({roomId:'model-render',match:0,phase:'running',arenaId:'mensa-b',teams:{A:{characterId:'luca-di-grazia',hp:100},B:{characterId:'bad-teacher',hp:100}}});await w.ready;if(!w.renderer)throw Error('Mensa model failed to load');cancelAnimationFrame(w.raf);for(const f of Object.values(w.fighters))f.holder.visible=false;
  w.renderer.setPixelRatio(1);w.renderer.setSize(1920,1080);const out=[];
  for(const [name,position,target,fov]of shots){w.camera.position.fromArray(position);w.camera.lookAt(...target);w.camera.aspect=1920/1080;w.camera.fov=fov;w.camera.clearViewOffset();w.camera.updateProjectionMatrix();w.renderer.shadowMap.needsUpdate=true;w.renderer.render(w.scene,w.camera);out.push({name,png:w.canvas.toDataURL('image/png').split(',')[1],calls:w.renderer.info.render.calls,triangles:w.renderer.info.render.triangles});}
  w.renderer.setSize(1280,720);w.camera.position.set(0,2.4,7);w.camera.lookAt(0,1.8,-6);w.camera.fov=60;w.camera.updateProjectionMatrix();w.renderer.render(w.scene,w.camera);const preview=w.canvas.toDataURL('image/webp',.78).split(',')[1];w.dispose();return {out,preview};
 },shots);
 for(const {name,png}of metrics.out)await writeFile(dir+'/'+name+'.png',Buffer.from(png,'base64'));
 const preview=Buffer.from(metrics.preview,'base64');await writeFile(new URL('../../public/assets/arena-mensa-b.webp',import.meta.url),preview);
 const meta={renderer:'production BattleWorld / createMensa',width:1920,height:1080,views:metrics.out.map(({png,...m})=>m),preview:{bytes:preview.length,sha256:createHash('sha256').update(preview).digest('hex')},errors};
 await writeFile(dir+'/runtime-render-report.json',JSON.stringify(meta,null,2));console.log(meta);if(errors.length)throw Error(errors.join('; '));
}finally{await browser.close();await game.close();}
