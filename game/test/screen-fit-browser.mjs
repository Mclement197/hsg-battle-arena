// Run with PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/path/to/chrome node test/screen-fit-browser.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
import { createGameServer } from '../src/server.mjs';

const origin = 'http://127.0.0.1:18995';
const game = createGameServer({ publicOrigin: origin });
await new Promise(resolve => game.server.listen(18995, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const cases = [[360,640], [390,844], [740,360], [1440,900]];
const checked = [];
async function check(page, label, fit = false) {
  const m = await page.evaluate(() => {
    const d = document.documentElement;
    const buttons = [...document.querySelectorAll('.screen:not([hidden]) button:not([hidden])')]
      .filter(b => b.getClientRects().length > 0 && !b.disabled)
      .map(b => ({ label: b.id || b.textContent.trim().slice(0, 25), bottom: b.getBoundingClientRect().bottom, width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height }));
    return { width: d.scrollWidth, clientWidth: d.clientWidth, height: d.scrollHeight, clientHeight: d.clientHeight, buttons };
  });
  assert.ok(m.width <= m.clientWidth + 1, label + ': horizontal overflow ' + JSON.stringify(m));
  if (fit) {
    assert.ok(m.height <= m.clientHeight + 1, label + ': unnecessary document scrolling ' + JSON.stringify(m));
    assert.ok(m.buttons.every(b => b.bottom <= m.clientHeight + 1), label + ': control below viewport ' + JSON.stringify(m));
  }
  assert.ok(m.buttons.every(b => b.height >= 44), label + ': touch control under 44px ' + JSON.stringify(m));
  checked.push([label, m.height, m.clientHeight]);
}
try {
  for (const [width, height] of cases) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800 });
    const host = await context.newPage();
    await host.goto(origin + '/game/');
    await host.evaluate(() => document.fonts.ready);
    const portrait = width < 800 && height >= 640;
    await check(host, width + 'x' + height + ' menu', portrait);
    await host.locator('#play-friend').click();
    await check(host, width + 'x' + height + ' arena', width === 390);
    await host.locator('#arena-next').click();
    await check(host, width + 'x' + height + ' character'); // full roster intentionally scrolls
    await host.locator('#selection-next').click();
    await host.waitForFunction(() => document.body.dataset.screen === 'lobby');
    await check(host, width + 'x' + height + ' lobby', portrait);
    const code = (await host.locator('#room-code').textContent()).trim();
    const guest = await context.newPage();
    await guest.goto(origin + '/game/?room=' + code);
    await check(guest, width + 'x' + height + ' entry', width === 390);
    await guest.locator('#nickname').fill('Layout Guest');
    await guest.locator('#join-form button[type="submit"]').click();
    await guest.waitForFunction(() => document.body.dataset.screen === 'player');
    await check(guest, width + 'x' + height + ' waiting', portrait);
    await host.locator('#start-game').click();
    await host.waitForFunction(() => document.body.dataset.screen === 'battle');
    await check(host, width + 'x' + height + ' battle', width === 390);
    await check(guest, width + 'x' + height + ' player', portrait);
    if (width === 390) {
      await guest.setViewportSize({ width: 360, height: 640 });
      await check(guest, 'rotated/resized active player', true);
      await guest.locator('#main-menu').click();
      await guest.locator('#join-existing').click();
      await guest.locator('#nickname').focus();
      await guest.setViewportSize({ width: 360, height: 420 }); // keyboard-shrunken visual area: form must remain scrollable
      await check(guest, 'keyboard-shrunken entry');
      assert.ok(await guest.locator('#join-form button[type="submit"]').isVisible());
    }
    await context.close();
  }
  console.log(JSON.stringify({ checked }));
} finally { await browser.close(); await game.close(); }
