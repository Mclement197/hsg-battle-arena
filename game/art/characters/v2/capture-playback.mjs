import fs from 'node:fs/promises';
import { createGameServer } from '../../../src/server.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const game = createGameServer({ publicOrigin: 'http://127.0.0.1:18995' });
await new Promise(r => game.server.listen(18995, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true,
 args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
 await page.goto('http://127.0.0.1:18995/game/');
 await page.evaluate(async () => {
  const { CharacterStage } = await import('./characters.js?v=20261017-rigged');
  const sync = CharacterStage.prototype.sync;
  CharacterStage.prototype.sync = function () { window.__captureStage = this; return sync.call(this); };
 });
 await page.locator('#play-bot').click(); await page.locator('#arena-next').click(); await page.locator('#selection-next').click();
 await page.waitForFunction(() => document.querySelector('.ace-fighter .fighter-art')?.dataset.modelStatus === 'ready');
 await page.evaluate(() => {
  // Opaque preview-only background avoids alpha/chroma fringes in the WebM encoder.
  const view = [...window.__captureStage.views.values()].find(v => v.image.dataset.modelTeam === 'A');
  view.renderer.setClearColor(0x123e2b, 1); view.render();
  const canvas = document.querySelector('.ace-fighter canvas'), stream = canvas.captureStream(20);
  window.__recording = new Promise(resolve => {
   const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 700000 }), chunks = [];
   recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
   recorder.onstop = async () => { for (const t of stream.getTracks()) t.stop(); resolve(Array.from(new Uint8Array(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer()))); };
   recorder.start(); setTimeout(() => recorder.stop(), 3500);
  });
 });
 await page.waitForTimeout(200); await page.locator('[data-solo-move="attack"]').click();
 const bytes = await page.evaluate(() => window.__recording);
 await fs.writeFile(process.env.PLAYBACK_FILE || '/tmp/hsg-runtime-attack.webm', Buffer.from(bytes));
 console.log('Actual in-game Luca skeleton idle/authoritative attack/idle playback captured:', bytes.length, 'bytes');
} finally { await browser.close(); await game.close(); }
