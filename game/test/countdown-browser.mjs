// Real rendered countdown timing, mutation and frame feedback loop.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import tls from 'node:tls';
import {createHash, X509Certificate} from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const url = process.env.LIVE_URL || 'http://127.0.0.1:18989/game/';
let game;
if (!process.env.LIVE_URL) { const { createGameServer } = await import('../src/server.mjs'); game=createGameServer({publicOrigin:'http://127.0.0.1:18989'}); await new Promise(r=>game.server.listen(18989,'127.0.0.1',r)); }
const out = process.env.EVIDENCE_DIR || '/tmp/hsg-countdown';
await fs.mkdir(out, {recursive:true});
const proxyUrl = process.env.LIVE_URL && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
    const proxy = proxyUrl ? new URL(proxyUrl) : null;
    const args = ['--autoplay-policy=user-gesture-required','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
    if (proxy && process.env.NODE_EXTRA_CA_CERTS) {
      const bundle = await fs.readFile(process.env.NODE_EXTRA_CA_CERTS, 'utf8');
      // Verify the proxy-issued leaf with Node TLS before pinning it in Chromium.
      const target = new URL(url);
      const leaf = await new Promise((resolve, reject) => {
        const request = http.request({ hostname: proxy.hostname, port: proxy.port, method: 'CONNECT',
          path: target.hostname + ':443', headers: { 'Proxy-Authorization': 'Basic ' +
            Buffer.from(decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password)).toString('base64') } });
        request.on('connect', (response, socket) => {
          if (response.statusCode !== 200) { socket.destroy(); reject(new Error('Proxy CONNECT failed')); return; }
          const secure = tls.connect({ socket, servername: target.hostname, ca: [...tls.rootCertificates, bundle] });
          secure.on('secureConnect', () => { const raw = secure.getPeerCertificate().raw; secure.destroy(); resolve(raw); });
          secure.on('error', reject);
          secure.setTimeout(10000, () => { secure.destroy(); reject(new Error('TLS verification timeout')); });
        });
        request.on('error', reject);
        request.setTimeout(10000, () => request.destroy(new Error('Proxy CONNECT timeout')));
        request.end();
      });
      const pin = createHash('sha256').update(new X509Certificate(leaf).publicKey
        .export({ type: 'spki', format: 'der' })).digest('base64');
      args.push('--ignore-certificate-errors-spki-list=' + pin);
    }
    const browser = await chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
      headless: true, args,
      ...(proxy ? { proxy: { server: proxy.protocol + '//' + proxy.host,
        username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) } } : {}) });

try {
 const page = await browser.newPage(process.env.PHONE ? {viewport:{width:390,height:844},isMobile:true,hasTouch:true} : {viewport:{width:1440,height:1000}});
 if(process.env.BASELINE_APP) await page.route('**/game/app.js*',route=>route.fulfill({path:process.env.BASELINE_APP,contentType:'text/javascript'}));
 if(process.env.NO_WEBGL) await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:get.call(this,type,...args);};});
 if(process.env.CPU_RATE){const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.CPU_RATE)});}
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  window.probe={labels:[],writes:[],gaps:[],long:[],animations:[]};
  let prev=0;
  function frame(t){if(prev && t-prev>80) probe.gaps.push({at:performance.now(),ms:t-prev});prev=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
  new PerformanceObserver(list=>{for(const e of list.getEntries())probe.long.push({at:e.startTime,ms:e.duration});}).observe({type:'longtask'});
  addEventListener('DOMContentLoaded',()=>{
   for(const id of ['prebattle-label','countdown','player-countdown']){
    const el=document.getElementById(id); let previous='';
    const sample=(write=false)=>{const text=el.textContent;const row={id,text,at:performance.now(),wall:Date.now()};if(write)probe.writes.push(row);if(id==='prebattle-label' && document.getElementById('prebattle').hidden)return;if(text!==previous){probe.labels.push(row);previous=text;}};
    new MutationObserver(()=>sample(true)).observe(el,{childList:true,characterData:true,subtree:true});
    if(id==='prebattle-label')new MutationObserver(()=>sample()).observe(document.getElementById('prebattle'),{attributes:true,attributeFilter:['hidden']});
    el.addEventListener('animationstart',e=>probe.animations.push({id,name:e.animationName,at:performance.now()}));
   }
  });
 });
 await page.goto(url);
 await page.locator('#play-bot').click();
 await page.locator('#arena-next').click();
 let profiler; if(process.env.PROFILE){profiler=await page.context().newCDPSession(page);await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
 await page.locator('#selection-next').click();
 await page.waitForFunction(()=>document.querySelector('#prebattle').hidden===false);
 await page.screenshot({path:out+'/intro.png'});
 await page.waitForFunction(()=>document.querySelector('#prebattle').hidden && document.body.dataset.screen==='battle');
 if(profiler){const {profile}=await profiler.send('Profiler.stop');await fs.writeFile(out+'/cpu-profile.json',JSON.stringify(profile));}
 await page.waitForTimeout(4200);
 const result=await page.evaluate(()=>({probe,screen:document.body.dataset.screen,app:document.querySelector('script[type=module]').src}));
 await fs.writeFile(out+'/timing.json',JSON.stringify({...result,errors},null,2));
 console.log(JSON.stringify({...result,probe:{...result.probe,writes:result.probe.writes.length,gaps:result.probe.gaps.slice(-20),long:result.probe.long.slice(-20)}},null,2));
 assert.deepEqual(errors,[]);
 const intro=result.probe.labels.filter(x=>x.id==='prebattle-label' && x.text);
 assert.deepEqual(intro.map(x=>x.text),['3','2','1','READY… FIGHT!']);
 for(let i=1;i<4;i++)assert.ok(Math.abs(intro[i].at-intro[i-1].at-1000)<180,'intro beat is late/stuttering: '+JSON.stringify(intro));
 const digitWrites=result.probe.writes.filter(x=>x.id==='prebattle-label');
 assert.ok(digitWrites.length<=5,'unchanged countdown digits must not be rewritten: '+digitWrites.length);
 await page.locator('#main-menu').click();
 const stopped=await page.evaluate(()=>probe.writes.length);await page.waitForTimeout(1100);
 assert.equal(await page.evaluate(()=>probe.writes.length),stopped,'leaving battle must stop digit updates');
} finally {await browser.close(); await game?.close();}
