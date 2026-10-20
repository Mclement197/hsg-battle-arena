const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
import { createGameServer } from '../src/server.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const app=createGameServer({publicOrigin:'http://127.0.0.1:18994'});
await new Promise(r=>app.server.listen(18994,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const dir=process.env.EVIDENCE_DIR||'/tmp/hsg-selection-fit'; await fs.mkdir(dir,{recursive:true});
const sizes=[[360,640],[390,844],[360,560],[740,390],[1440,900]];
const selectors={arena:['#arena-back','#arena-title','.arena-option','#arena-next'],character:['#character-back','#character-title','#pick-a','#pick-b','.character-option','#selected-fighter-name','#selection-next']};
async function inspect(page,screen,label){
 await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(650);
 const sample=async()=>page.evaluate(({screen,selectors})=>{
 const region=document.querySelector('#'+screen+'-screen');const controls=selectors[screen].flatMap(s=>[...region.querySelectorAll(s)]);
 const ancestors=new Set([document.documentElement,document.body,document.querySelector('main'),region]);for(const control of controls)for(let node=control;node;node=node.parentElement)ancestors.add(node);
 const nodes=[...ancestors].filter(e=>{const s=getComputedStyle(e);return e===document.documentElement||e===document.body||e===region||e.id==='main'||(['auto','scroll'].includes(s.overflowY)&&e.scrollHeight>e.clientHeight+1)});
 return {viewport:[innerWidth,innerHeight],scroll:nodes.map(e=>({name:e.id||String(e.className)||e.tagName,top:e.scrollTop,max:e.scrollHeight-e.clientHeight,overflow:getComputedStyle(e).overflowY})),controls:controls.map(e=>{const r=e.getBoundingClientRect();return{name:e.id||e.getAttribute('data-arena')||e.getAttribute('data-character')||e.tagName,top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height),visible:r.top>=0&&r.bottom<=innerHeight&&r.width>0}})};
 },{screen,selectors});
 const before=await sample();
 for(const sel of [selectors[screen][2],selectors[screen].at(-1),'#'+screen+'-screen']){const box=await page.locator(sel).first().boundingBox();if(box){await page.mouse.move(Math.min(page.viewportSize().width-10,Math.max(10,box.x+box.width/2)),Math.min(page.viewportSize().height-8,Math.max(20,box.y+Math.min(box.height-3,65))));await page.mouse.wheel(0,360);}}
 const afterWheel=await sample();
 if(page.viewportSize().width<800){const cdp=await page.context().newCDPSession(page);for(const sel of [selectors[screen][2],selectors[screen].at(-1),'#'+screen+'-screen']){const box=await page.locator(sel).first().boundingBox();if(!box)continue;const x=Math.round(Math.max(12,Math.min(page.viewportSize().width-12,box.x+box.width/2)));const y=Math.round(Math.max(100,Math.min(page.viewportSize().height-12,box.y+box.height/2)));await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:Math.max(65,y-90)}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}await cdp.detach();await page.waitForTimeout(150);}
 const after=await sample();await page.screenshot({path:dir+'/'+label+'-'+screen+'.png'});
 const result={label,screen,before,afterWheel,after};console.log(JSON.stringify(result));
 if(process.env.BASELINE)return;
 assert(before.controls.every(x=>x.visible),label+' '+screen+' inaccessible control');
 assert(before.scroll.every(x=>x.max<=1),label+' '+screen+' nested overflow');
 assert(afterWheel.scroll.every(x=>x.top===0),label+' '+screen+' wheel shifted scroller');
 assert(after.scroll.every(x=>x.top===0),label+' '+screen+' touch swipe shifted scroller');
}
try{for(const [width,height] of sizes.filter(([w,h])=>!process.env.CASE||process.env.CASE===w+'x'+h))for(const mode of ['bot','friend','groups']){
 const page=await browser.newPage({viewport:{width,height},isMobile:width<800,hasTouch:width<800});await page.goto('http://127.0.0.1:18994/game/');await page.locator('#play-'+mode).click();if(mode==='groups')await page.locator('#create-room').click();await page.waitForFunction(()=>document.body.dataset.screen==='arena');await inspect(page,'arena',mode+'-'+width+'x'+height);
 for(const id of ['library','trischli','mensa-b']){const card=page.locator('.arena-option[data-arena="'+id+'"]');if(await card.count()){await card.click();assert.equal(await card.getAttribute('aria-pressed'),'true',id+' arena not selectable');}}
 await page.locator('#arena-next').click();await page.waitForFunction(()=>document.body.dataset.screen==='character');for(const side of ['a','b']){await page.locator('#pick-'+side).click();for(const card of (mode==='bot'?await page.locator('.character-option').all():[page.locator('.character-option').last()])){await card.click({force:true,noWaitAfter:true});assert.equal(await card.getAttribute('aria-pressed'),'true','fighter card not selectable');}}await inspect(page,'character',mode+'-'+width+'x'+height);await page.close();
}}finally{await browser.close();await app.close();}
