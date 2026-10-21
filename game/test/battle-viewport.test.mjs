import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);

test('battle HUD is part of the shared 3D arena, without changing player controls', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const stage = html.slice(html.indexOf('<div class="fight-stage">'), html.indexOf('<div class="host-bar host-control">'));
  assert.match(stage, /<div class="fight-stage"><div class="battle-top">/);
  assert.match(stage, /<div class="battle-bottom">/);
  assert.match(stage, /<div id="solo-controls"/);
  assert.ok(stage.indexOf('solo-controls') < stage.lastIndexOf('</div>'), 'controls stay inside arena');
  assert.match(html, /<section id="player-screen"[^]*?<div id="player-moves"/);
});

test('battle screen persists after sound hint is hidden and camera frames measured HUD', async () => {
  const css = await readFile(new URL('styles.css', root), 'utf8');
  const world = await readFile(new URL('battle-world.js', root), 'utf8');
  assert.match(css, /body\[data-screen=battle\]\{grid-template-rows:auto minmax\(0,1fr\)\}/);
  assert.match(css, /body\[data-screen=battle\] #sound-hint\{position:absolute/);
  assert.match(css, /body\[data-screen=battle\] \.battle-screen\{[^}]*height:100%/);
  assert.match(world, /this\.frameBottom=host\?1-2\*bottomEdge\/h:-\.78/);
  assert.match(world, /this\.frameBottom\?\?-\.78/);
});
