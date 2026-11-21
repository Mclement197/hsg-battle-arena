import assert from 'node:assert/strict';
import http from 'node:http';import tls from 'node:tls';
import {readFile,writeFile} from 'node:fs/promises';
import {X509Certificate,createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    const proxy = proxyUrl ? new URL(proxyUrl) : null;
    const args = ['--use-angle=swiftshader','--enable-unsafe-swiftshader'];
    if (proxy && process.env.NODE_EXTRA_CA_CERTS) {
      const bundle = await readFile(process.env.NODE_EXTRA_CA_CERTS, 'utf8');
      // Verify the proxy-issued leaf with Node TLS before pinning it in Chromium.
      const target = new URL(process.env.AUDIO_LIVE_URL);
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
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
      headless: true, args,
      ...(proxy ? { proxy: { server: proxy.protocol + '//' + proxy.host,
        username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) } } : {}) });

const dir='/home/mathis/.openclaw/workspace/media/hsg-mensa-b/renders';
const root='/home/mathis/hsg-battle-arena/game/';
const hash=b=>createHash('sha256').update(b).digest('hex'),checks=[];
try{
 const files=['index.html','app.js','styles.css','characters.js','battle-world.js','battle-contract.js','assets/arena-mensa-b.webp','assets/arenas/library.glb','assets/arenas/trischli.glb',...['luca-di-grazia','free-rider','tryhard','assessment-hoodie','trischli-warrior','bad-teacher'].map(id=>'assets/characters/'+id+'.glb')];
 for(const file of files){
  const url='https://afp.mclement.ch/game/'+(file==='index.html'?'':file)+'?v=20261019-mensa1';
  const res=await fetch(url);const bytes=Buffer.from(await res.arrayBuffer());assert.equal(res.status,200,file);assert.equal(hash(bytes),hash(await readFile(root+'public/'+file)),file);assert.equal(res.headers.get('cache-control'),'no-store');
  checks.push({file,status:res.status,sha256:hash(bytes),bytes:bytes.length,cache:res.headers.get('cache-control'),type:res.headers.get('content-type')});
 }
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.AUDIO_LIVE_URL);await page.locator('#play-bot').click();await page.locator('.arena-option img').evaluateAll(ns=>Promise.all(ns.map(n=>n.decode())));await page.locator('.arena-option[data-arena="mensa-b"]').click();
  await page.screenshot({path:dir+'/live-mensa-chooser-'+width+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);checks.push({width,errors});await context.close();
 }
 await writeFile(dir+'/live-http-checks.json',JSON.stringify(checks,null,2));console.log('PASS',checks.length,'public hashes/cache and desktop/phone selector checks; no rooms created');
}finally{await browser.close();}
