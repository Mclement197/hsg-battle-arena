import assert from 'node:assert/strict';
import net from 'node:net';
import { createGameServer } from '../src/server.mjs';
import { Arena } from '../src/engine.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
let now=Date.now();const arena=new Arena({now:()=>now,pick:()=>0});
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const base='http://127.0.0.1:'+port;const game=createGameServer({arena,publicOrigin:base,autoTick:false});
await new Promise(r=>game.server.listen(port,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  const ctx=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/game/',{waitUntil:'domcontentloaded'});
  await page.locator('#play-bot').focus();await page.keyboard.press('Enter');
  await page.locator('#arena-next').click();
  const options=page.locator('#bot-difficulty');await assertVisible(options);
  assert.equal(await options.locator('[value=normal]').isChecked(),true,'normal is default');
  await options.locator('[value=hard]').focus();await page.keyboard.press('Space');assert.equal(await options.locator('[value=hard]').isChecked(),true,'difficulty is keyboard selectable');
  await page.locator('#character-back').click();await page.locator('#arena-back').click();await page.locator('#play-bot').click();await page.locator('#arena-next').click();assert.equal(await options.locator('[value=normal]').isChecked(),true,'new bot setup returns to normal default');
  await page.locator('#character-back').click();await page.locator('#arena-back').click();await page.locator('#play-friend').click();await page.locator('#arena-next').click();assert.equal(await options.isHidden(),true,'friend flow has no bot difficulty');assert.match(await page.locator('#selection-next').innerText(),/Invite your friend/i);
  await page.locator('#character-back').click();await page.locator('#arena-back').click();await page.locator('#play-groups').click();await page.locator('#create-room').click();await page.locator('#arena-next').click();assert.equal(await options.isHidden(),true,'groups flow has no bot difficulty');assert.match(await page.locator('#selection-next').innerText(),/Open group room/i);
  assert.deepEqual(errors,[]);
  // Real bot creation, authoritative difficulty snapshot, win, and replay retention.
  await page.goto(base+'/game/',{waitUntil:'domcontentloaded'});await page.locator('#play-bot').click();await page.locator('#arena-next').click();
  await page.locator('[name="bot-difficulty"][value=hard]').check();await page.locator('#selection-next').click();
  try{await page.waitForFunction(()=>document.body.dataset.mode==='bot'&&document.querySelector('#battle-screen')&&!document.querySelector('#battle-screen').hidden,{timeout:8000});}catch(e){throw new Error('bot room setup did not complete: '+JSON.stringify({rooms:arena.rooms.size,screen:await page.evaluate(()=>({screen:document.body.dataset.screen,mode:document.body.dataset.mode,error:document.querySelector('#global-error')?.textContent,selectionHidden:document.querySelector('#character-screen')?.hidden})),message:e.message}));}
  const room=[...arena.rooms.values()].at(-1);assert.equal(room.mode,'bot');assert.equal(room.difficulty,'hard');assert.equal(arena.snapshot(room,{role:'host'}).difficulty,'hard');assert.equal(room.players.size,2);
  now=room.prebattle.deadline;game.tick();assert.equal(room.phase,'running');assert.equal(room.turn.team,'A');
  // Controlled in-memory one-hit KO fixture keeps the browser victory/replay path deterministic.
  room.teams.B.hp=1;
  arena.play(room,{role:'host'},{turnId:room.turn.id,move:'attack'});now=room.turn.deadline;game.tick();assert.equal(room.phase,'finished');
  await page.waitForFunction(()=>!document.querySelector('#skip-ko').hidden,{timeout:15000});await page.locator('#skip-ko').click();
  await page.waitForFunction(()=>document.body.dataset.screen==='victory',{timeout:10000});await page.locator('#replay-game').click();
  const replayDeadline=Date.now()+10000;while((room.match!==1||room.phase!=='countdown')&&Date.now()<replayDeadline)await new Promise(r=>setTimeout(r,20));
  assert.equal(room.mode,'bot');assert.equal(room.difficulty,'hard');assert.equal(room.match,1,'replay increments match while retaining bot difficulty');assert.equal(room.phase,'countdown');
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.dataset.mode==='bot'&&!document.querySelector('#battle-screen').hidden,{timeout:15000});
  const resumed=arena.snapshot(room,arena.authenticate(room,room.hostToken));assert.equal(resumed.mode,'bot');assert.equal(resumed.difficulty,'hard','reconnected browser state retains selected difficulty');
  await ctx.close();
 }
 console.log('Bot selection browser acceptance passed: default, selection, keyboard, phone, Friend and Groups preservation (2 viewports).');
} finally {await browser.close();await game.close();}
async function assertVisible(locator){assert.equal(await locator.isVisible(),true,'bot difficulty shown only during bot selection');}
