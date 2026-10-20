// Real HTTP/SSE race: delay the start HTTP reply behind its already-delivered SSE state.
// Disable WebGL/audio only to isolate clock/render correctness from GPU/codec speed. countdown-browser.mjs
// separately measures the unchanged fully rendered desktop/touch flow.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createGameServer } from '../src/server.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const out=process.env.EVIDENCE_DIR || '/tmp/hsg-countdown-sync';await fs.mkdir(out,{recursive:true});
const base='http://127.0.0.1:18990';
const game=createGameServer({publicOrigin:base});await new Promise(r=>game.server.listen(18990,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],checks=[];
async function post(path,body={},token){return new Promise((resolve,reject)=>{const req=http.request(base+'/game/api/'+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{try{assert.ok(res.statusCode<300,s);resolve(JSON.parse(s));}catch(e){reject(e);}});});req.on('error',reject);req.end(JSON.stringify(body));});}
async function attach(room,role,token,mobile=false){
 const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1000}});
 await context.addInitScript(({room,role,token})=>{
  sessionStorage.setItem('hsg-arena:v1:'+role+':'+room,token);sessionStorage.setItem('hsg-arena:v1:active',JSON.stringify({room,role}));
  const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:get.call(this,type,...args);};
  window.AudioContext=undefined;window.webkitAudioContext=undefined;
  window.digits=[];window.writes=0;
  addEventListener('DOMContentLoaded',()=>{
   const label=document.getElementById('prebattle-label'),overlay=document.getElementById('prebattle');let last='';
   const sample=()=>{if(overlay.hidden)return;const text=label.textContent;if(text!==last){digits.push({text,at:performance.timeOrigin+performance.now()});last=text;}};
   new MutationObserver(()=>{writes++;sample();}).observe(label,{childList:true,subtree:true,characterData:true});
   new MutationObserver(sample).observe(overlay,{attributes:true,attributeFilter:['hidden']});
   const timer=document.getElementById(role==='host'?'countdown':'player-countdown');window.turnDigits=[];let previous='';
   new MutationObserver(()=>{if(!overlay.hidden)return;const text=timer.textContent;if(text!==previous){turnDigits.push({text,at:performance.timeOrigin+performance.now()});previous=text;}}).observe(timer,{childList:true,subtree:true,characterData:true});
  });
 },{room,role,token});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 if(process.env.BASELINE_APP)await page.route('**/game/app.js*',route=>route.fulfill({path:process.env.BASELINE_APP,contentType:'text/javascript'}));
 await page.goto(base+'/game/');await page.waitForFunction(()=>window.ArenaUI?.connected);
 return page;
}
try{
 for(const mode of (process.env.MODES || 'bot,friend,groups').split(',')){
  const room=await post('rooms',{mode});
  const guests=[];for(let i=0;i<(mode==='groups'?2:mode==='friend'?1:0);i++)guests.push(await post('rooms/'+room.roomId+'/join',{nickname:'Timing '+i}));
  const host=await attach(room.roomId,'host',room.hostToken);
  const pages=[host];for(const guest of guests)pages.push(await attach(room.roomId,'player',guest.playerToken,true));
  // Modest CPU throttling after room setup, plus the precise HTTP/SSE race.
  for(const page of pages){const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:2});}
  for(const page of pages)await page.evaluate(()=>{digits.length=0;writes=0;turnDigits.length=0;});
  await host.route('**/start',async route=>{const response=await route.fetch();await new Promise(r=>setTimeout(r,1500));await route.fulfill({response});});
  await host.locator('#start-game').click();
  await Promise.all(pages.map(p=>p.waitForFunction(()=>!document.getElementById('prebattle').hidden)));
  // Mid-intro redundant connection/HTTP state already occurs naturally via SSE.
  await Promise.all(pages.map(p=>p.waitForFunction(()=>document.getElementById('prebattle').hidden && document.getElementById('countdown').textContent==='15')));
  await host.waitForTimeout(3300);
  const rows=await Promise.all(pages.map(p=>p.evaluate(()=>({digits,writes,turnDigits}))));
  checks.push({mode,clients:rows});await fs.writeFile(out+'/checks.json',JSON.stringify({checks,errors},null,2));
  for(const row of rows){
   assert.deepEqual(row.digits.map(x=>x.text),['3','2','1','READY… FIGHT!'],mode+' must not rewind a digit on delayed HTTP/SSE');
   assert.ok(row.writes<=5,mode+' repeated snapshot must not rewrite unchanged digit: '+row.writes);
   const live=row.turnDigits.filter(x=>/^\d+$/.test(x.text));assert.deepEqual(live.slice(0,4).map(x=>x.text),['15','14','13','12']);
   for(let i=2;i<4;i++)assert.ok(Math.abs(live[i].at-live[i-1].at-1000)<150,'ongoing deadline cadence');
  }
  for(const digit of ['2','1','READY… FIGHT!']){const ts=rows.map(r=>r.digits.find(x=>x.text===digit).at);assert.ok(Math.max(...ts)-Math.min(...ts)<250,mode+' synchronized '+digit);}
  await pages.at(-1).screenshot({path:out+'/'+mode+'-phone-or-host.png'});
  // Reset/start re-arms exactly once, and leaving during intro cancels all digit updates.
  await host.unroute('**/start');
  await post('rooms/'+room.roomId+'/reset',{},room.hostToken);await host.waitForFunction(()=>document.body.dataset.screen==='lobby');
  await host.locator('#start-game').click();await host.waitForFunction(()=>!document.getElementById('prebattle').hidden);
  await host.locator('#main-menu').click();const stopped=await host.evaluate(()=>writes);await host.waitForTimeout(1200);assert.equal(await host.evaluate(()=>writes),stopped,'leave/replay timer cleanup');
  for(const page of pages)await page.context().close();console.log('PASS '+mode+': delayed HTTP/SSE, 2x CPU, intro + running cadence, synchronized clients, reset/start/leave cleanup');
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await game.close();}
