// Owned loopback rooms only. Record production resolved events at the unchanged 2200 ms clock.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createGameServer} from '../src/server.mjs';
import {Arena,CHARACTERS,MOVES} from '../src/engine.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/home/mathis/.npm-global/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs');
const port=Number(process.env.TEST_PORT||18998),source=process.env.WORLD_SOURCE?await fs.readFile(process.env.WORLD_SOURCE,'utf8'):null;
const sourceSha256=createHash('sha256').update(source||await fs.readFile(new URL('../public/battle-world.js',import.meta.url))).digest('hex');
const phase=process.env.PHASE||'before',dir=process.env.EVIDENCE_DIR||'/home/mathis/.openclaw/workspace/media/hsg-attack-polish/'+phase;
await fs.mkdir(dir,{recursive:true});
let clock=Date.now();const arena=new Arena({now:()=>clock,pick:()=>0});
const game=createGameServer({arena,publicOrigin:'http://127.0.0.1:'+port,autoTick:false,limits:{mutationsPerMinute:2000,createsPerMinute:100}});
await new Promise(r=>game.server.listen(port,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/home/mathis/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const restored=process.env.RESUME_MANIFEST?JSON.parse(await fs.readFile(process.env.RESUME_MANIFEST,'utf8')):null;if(restored)assert.equal(restored.sourceSha256,sourceSha256,'resumed clips use the exact renderer source');
const errors=[],records=restored?.records||[];
async function post(path,body={},token){const r=await fetch('http://127.0.0.1:'+port+'/game/api/'+path,{method:'POST',headers:{Origin:'http://127.0.0.1:'+port,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json();}
try{for(const id of (process.env.FIGHTER_IDS?process.env.FIGHTER_IDS.split(','):CHARACTERS)){
 const index=CHARACTERS.indexOf(id);assert.ok(index>=0,'known fighter');
 if(process.env.FIGHTER_ID&&process.env.FIGHTER_ID!==id)continue;
 const other=CHARACTERS[(index+3)%CHARACTERS.length],room=await post('rooms',{mode:'friend'});
 await post('rooms/'+room.roomId+'/configure',{arenaId:'library',characterA:id,characterB:other},room.hostToken);
 const guest=await post('rooms/'+room.roomId+'/join',{nickname:'Owned polish QA'});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(({room,token})=>{const fixed=Date.now();Date.now=()=>fixed;sessionStorage.setItem('hsg-arena:v1:host:'+room,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room,role:'host'}));},{room:room.roomId,token:room.hostToken});
 if(process.env.MODEL_DIR)await page.route('**/assets/characters/*.glb',r=>r.fulfill({path:process.env.MODEL_DIR+'/'+new URL(r.request().url()).pathname.split('/').pop(),contentType:'model/gltf-binary'}));
 if(source)await page.route('**/battle-world.js?*',route=>route.fulfill({contentType:'text/javascript',body:source}));
 await page.goto('http://127.0.0.1:'+port+'/game/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{const {BattleWorld}=await import('./battle-world.js?v=20261020-attacks1');const sync=BattleWorld.prototype.sync;BattleWorld.prototype.sync=function(s){window.__world=this;return sync.call(this,s);};});
 const start=await post('rooms/'+room.roomId+'/start',{},room.hostToken);clock=start.state.prebattle.deadline;game.tick();
 await page.waitForSelector('[data-world-status=ready]',{timeout:90000});
 await page.evaluate(()=>{const w=window.__world;cancelAnimationFrame(w.raf);w.renderer.render(w.scene,w.camera);});
 const r=arena.rooms.get(room.roomId);let n=0;
 for(const move of MOVES){
  if(process.env.MOVE_ID&&process.env.MOVE_ID!==move)continue;
  await post('rooms/'+room.roomId+'/play',{turnId:r.turn.id,move},room.hostToken);game.tick();n++;
  await page.waitForFunction(n=>window.__world.events.pending.some(e=>e.id.endsWith('0:'+n)),n);
  const name=id+'-'+move;
  const result=await page.evaluate(dpr=>{const w=window.__world,e=w.events.pending.shift();w.finish();w.selection=null;w.renderer.setPixelRatio(dpr);w.layout();w.begin(e,0);window.__recordEvent=e;window.__sheet=document.createElement('canvas');window.__sheet.width=1600;window.__sheet.height=1160;const ctx=window.__sheet.getContext('2d');ctx.fillStyle='#101b17';ctx.fillRect(0,0,1600,1160);return {event:{label:e.ability.label,move:e.move,actor:e.actor,characterId:e.characterId,launch:e.ability.launch,impact:e.ability.impact,duration:e.ability.duration},samples:[],canvas:{width:w.canvas.width,height:w.canvas.height}};},Number(process.env.CAPTURE_DPR||.65));
  const encoder=spawn(process.env.FFMPEG_EXECUTABLE||'/home/mathis/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux',['-hide_banner','-loglevel','error','-f','image2pipe','-vcodec','mjpeg','-framerate','30','-i','pipe:0','-c:v','libvpx','-deadline','realtime','-cpu-used','8','-b:v','2200k','-threads','2','-y',dir+'/'+name+'.webm'],{stdio:['pipe','ignore','inherit']});
  const encoded=once(encoder,'exit');
  for(let frame=0;frame<76;frame++){
   const out=await page.evaluate(frame=>{const w=window.__world,e=window.__recordEvent,ms=frame*1000/30,elapsed=Math.max(0,ms-100);for(const [team,f]of Object.entries(w.fighters))if(team!==e.actor)f.mixer.update(1/30);if(w.active)w.animate(elapsed);w.renderer.shadowMap.needsUpdate=true;w.renderer.render(w.scene,w.camera);
    if(frame%3===0&&frame>=3&&frame<=72){const i=frame/3-1,x=i%4*400,y=Math.floor(i/4)*193,ctx=window.__sheet.getContext('2d');ctx.drawImage(w.canvas,x,y+20,400,171);ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.fillText(Math.round(ms)+'ms',x+8,y+16);}
    return {image:w.canvas.toDataURL('image/jpeg',.95),sample:{ms,positions:Object.fromEntries(Object.entries(w.fighters).map(([t,f])=>[t,f.holder.position.toArray()])),camera:w.camera.position.toArray(),fov:w.camera.fov,prop:w.fx?.userData.parts.prop.position.toArray(),secondary:w.fx?.userData.parts.secondary.position.toArray()}};},frame);
   if([12,30,40,56].includes(frame)){const close=await page.evaluate(()=>{const w=window.__world,f=w.fighters[window.__recordEvent.actor],camera=w.camera.clone(),dpr=w.renderer.getPixelRatio();w.renderer.setPixelRatio(1);camera.clearViewOffset();const p=f.holder.position.clone();camera.position.copy(p).add(new (camera.position.constructor)(1.9,1.5,3.2));camera.lookAt(p.clone().add(new (camera.position.constructor)(0,1.1,0)));camera.fov=38;camera.updateProjectionMatrix();w.renderer.render(w.scene,camera);const data=w.canvas.toDataURL();w.renderer.setPixelRatio(dpr);w.renderer.render(w.scene,w.camera);return data;});await fs.writeFile(dir+'/'+name+'-close-'+frame+'.png',Buffer.from(close.split(',')[1],'base64'));}
   result.samples.push(out.sample);if(!encoder.stdin.write(Buffer.from(out.image.split(',')[1],'base64')))await once(encoder.stdin,'drain');
  }
  encoder.stdin.end();assert.equal((await encoded)[0],0,'video encoded');
  const sheet=await page.evaluate(()=>window.__sheet.toDataURL());await fs.writeFile(dir+'/'+name+'-dense.png',Buffer.from(sheet.split(',')[1],'base64'));
  records.push({name,matchup:[id,other],arena:'library',viewport:[1280,900],...result});await fs.writeFile(dir+'/recordings.json',JSON.stringify({sourceSha256,method:'Production WebGL frames, fixed-time 30 Hz, natural-speed playback; not measured real-time GPU performance',records,errors},null,2));console.log(phase,name,result.samples.length,'rendered 30 Hz frames (natural-speed playback)');
  await post('rooms/'+room.roomId+'/vote',{turnId:r.turn.id,move:'defend'},guest.playerToken);game.tick();n++;
  await page.waitForFunction(n=>window.__world.events.pending.some(e=>e.id.endsWith('0:'+n)),n);await page.evaluate(()=>{const w=window.__world;w.events.pending=[];w.finish();});
 }
 await context.close();
}assert.deepEqual(errors,[]);console.log('PASS',phase,records.length,'clips');}finally{await browser.close();await game.close();}
