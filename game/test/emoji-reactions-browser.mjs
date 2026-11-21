// Browser acceptance against a live running player/host screen.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const url=process.env.LIVE_URL||'http://127.0.0.1:18989/game/';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 const bar=page.locator('.reaction-bar:visible').first(); await bar.waitFor({state:'visible',timeout:5000});
 const buttons=bar.locator('button[data-reaction]');
 assert.deepEqual(await buttons.evaluateAll(es=>es.map(e=>e.dataset.reaction)),['😂','🔥','💀','😱','👏','🤡']);
 const box=await bar.boundingBox();assert.ok(box);
 for(const target of [page.locator('#player-countdown'),page.locator('#player-moves')]) if(await target.isVisible()){const b=await target.boundingBox();assert.ok(b);const overlap=box.x<b.x+b.width&&box.x+box.width>b.x&&box.y<b.y+b.height&&box.y+box.height>b.y;assert.equal(overlap,false,'reaction bar overlaps timer or vote controls');}
 await buttons.first().click();
 await page.waitForFunction(()=>document.querySelectorAll('.reaction-float').length>0,{timeout:3000});
 assert.ok(await page.locator('.reaction-float').count()>0,'reaction aggregation was not rendered');
 assert.deepEqual(errors,[]);
} finally {await browser.close();}
