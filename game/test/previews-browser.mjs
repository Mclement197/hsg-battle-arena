// Real production UI, owned loopback rooms, delayed assets and genuine WebGL failure.
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGameServer} from '../src/server.mjs';
import {Arena,CHARACTERS} from '../src/engine.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const dir=process.env.EVIDENCE_DIR||'/tmp/hsg-current-previews';await mkdir(dir,{recursive:true});
let now=Date.now();const arena=new Arena({now:()=>now,pick:()=>0});
const game=createGameServer({arena,publicOrigin:'http://127.0.0.1:18998',autoTick:false,limits:{mutationsPerMinute:500,createsPerMinute:80}});await new Promise(r=>game.server.listen(18998,'127.0.0.1',r));
const base='http://127.0.0.1:'+game.server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],requests=[],checks=[];
async function post(path,body={},token){return new Promise((resolve,reject)=>{const req=http.request(base+'/game/api/'+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},r=>{let text='';r.on('data',b=>text+=b);r.on('end',()=>{try{assert.ok(r.statusCode<300,text);resolve(JSON.parse(text));}catch(e){reject(e);}});});req.on('error',reject);req.end(JSON.stringify(body));});}
async function shot(p,name){await p.screenshot({path:dir+'/'+name+'.png',fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' overflow');}
async function attach(p,room,role,token){await p.addInitScript(({room,role,token})=>{sessionStorage.setItem('hsg-arena:v1:'+role+':'+room,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room,role}));},{room,role,token});await p.goto(base+'/game/');}
async function imageCheck(p){await p.locator('img:visible').evaluateAll(ns=>Promise.all(ns.map(n=>n.decode())));const images=await p.locator('img:visible').evaluateAll(ns=>ns.map(n=>({src:n.getAttribute('src'),complete:n.complete,w:n.naturalWidth})));assert.ok(images.every(n=>n.complete&&n.w>0),JSON.stringify(images));assert.ok(images.every(n=>!n.src.endsWith('.svg')||n.src.includes('arena-mark')||n.src.includes('/qr.svg')));}
try{
 for(const width of [1440,390]){console.log('VIEWPORT',width);
  const ctx=await browser.newContext({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,reducedMotion:width===390?'reduce':'no-preference'});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
  await p.goto(base+'/game/');await imageCheck(p);await shot(p,'after-menu-'+width);await p.locator('#how-to').click();await shot(p,'after-help-'+width);await p.locator('#help-back').click();await p.locator('#play-bot').click();await imageCheck(p);await shot(p,'after-mapchooser-'+width);
  for(const id of ['library','trischli']){await p.locator('[data-arena='+id+']').click();await shot(p,'after-mapchooser-'+id+'-'+width);}
  let release;const blocked=new Promise(r=>release=r);await p.route('**/*.glb',async route=>{await blocked;await route.continue();});
  await p.locator('#arena-next').click();await p.waitForFunction(()=>document.querySelector('#selected-fighter-art').dataset.modelStatus==='loading');await imageCheck(p);await shot(p,'after-loading-selection-'+width);release();await p.unrouteAll({behavior:'wait'});await p.waitForFunction(()=>document.querySelector('#selected-fighter-art').dataset.modelStatus==='ready');
  for(const id of CHARACTERS){await p.locator('[data-character='+id+']').click();await p.waitForFunction(()=>document.querySelector('#selected-fighter-art').dataset.modelStatus==='ready');await shot(p,'after-selection-'+id+'-'+width);}
  // Owned authoritative friend matches exercise host, guest, loading, HUD and victory.
  for(const arenaId of ['library','trischli']){console.log('ARENA',arenaId,width);
   const r=await post('rooms',{mode:'friend'});await post('rooms/'+r.roomId+'/configure',{arenaId,characterA:CHARACTERS[0],characterB:CHARACTERS[5]},r.hostToken);const guest=await post('rooms/'+r.roomId+'/join',{nickname:'Preview QA'});
   const host=await ctx.newPage(),phone=await ctx.newPage();for(const page of [host,phone]){page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));}
   await attach(host,r.roomId,'host',r.hostToken);await shot(host,'after-lobby-'+arenaId+'-'+width);await attach(phone,r.roomId,'player',guest.playerToken);await shot(phone,'after-guest-lobby-'+arenaId+'-'+width);
   let unblock;const hold=new Promise(r=>unblock=r);for(const page of [host,phone])await page.route('**/*.glb',async route=>{await hold;await route.continue();});
   const start=await post('rooms/'+r.roomId+'/start',{},r.hostToken);now=start.state.prebattle.deadline;game.tick();await host.waitForSelector('[data-world-status=loading]');await phone.waitForSelector('[data-world-status=loading]');await shot(host,'after-loading-battle-'+arenaId+'-'+width);await shot(phone,'after-loading-guest-'+arenaId+'-'+width);unblock();
   for(const page of [host,phone]){await page.unrouteAll({behavior:'wait'});await page.waitForSelector('[data-world-status=ready]',{timeout:60000});await imageCheck(page);}
   await shot(host,'after-battle-'+arenaId+'-'+width);await shot(phone,'after-guest-'+arenaId+'-'+width);
   const room=arena.rooms.get(r.roomId);room.teams.B.hp=1;await post('rooms/'+r.roomId+'/play',{turnId:room.turn.id,move:'attack'},r.hostToken);game.tick();await host.waitForFunction(()=>document.body.dataset.screen==='victory',null,{timeout:30000});await host.waitForFunction(()=>document.querySelector('#winner-art').dataset.modelStatus==='ready');await shot(host,'after-victory-'+arenaId+'-'+width);await host.close();await phone.close();
  }
  checks.push({width,identities:CHARACTERS,arenas:['library','trischli'],reduced:width===390});await ctx.close();
 }
 // Simulated missing WebGL: current portraits remain visible, no legacy image flash.
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await ctx.addInitScript(()=>{const orig=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:orig.call(this,type,...args);};});const p=await ctx.newPage();p.on('request',r=>requests.push(r.url()));await p.goto(base+'/game/');await p.locator('#play-bot').click();await p.locator('#arena-next').click();await p.waitForFunction(()=>document.querySelector('#selected-fighter-art').dataset.modelStatus==='fallback');await shot(p,'after-no-webgl-roster');
 for(const id of CHARACTERS){await p.locator('[data-character='+id+']').click();await p.waitForFunction(()=>document.querySelector('#selected-fighter-art').dataset.modelStatus==='fallback');await imageCheck(p);}
 const r=await post('rooms',{mode:'friend'});await post('rooms/'+r.roomId+'/configure',{arenaId:'trischli',characterA:'assessment-hoodie',characterB:'tryhard'},r.hostToken);await post('rooms/'+r.roomId+'/join',{nickname:'Fallback QA'});const fallback=await ctx.newPage();await attach(fallback,r.roomId,'host',r.hostToken);const start=await post('rooms/'+r.roomId+'/start',{},r.hostToken);now=start.state.prebattle.deadline;game.tick();await fallback.waitForSelector('[data-world-status=error]');await imageCheck(fallback);await shot(fallback,'after-no-webgl-battle');await ctx.close();
 assert.deepEqual(errors,[]);assert.ok(!requests.some(u=>/assessment-ace|deadline-dynamo|arena-.*[.]svg|hsg-learning-center/.test(u)&&!u.includes('arena-mark')));await writeFile(dir+'/browser-checks.json',JSON.stringify({checks,errors,requests:[...new Set(requests)]},null,2));console.log('PASS current previews desktop/mobile, both maps, all six, loading, host/guest, victory, reduced motion and WebGL failure');
}finally{await browser.close();await game.close();}
