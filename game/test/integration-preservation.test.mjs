import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CHARACTER_THEMES } from '../public/app.js';
import { FIGHTER_DISPLAY_NAMES } from '../public/fighter-data.js';
import { createMoveProps } from '../public/battle-world.js';
import { release } from '../public/characters.js';

test('all 35 approved live audio/media assets retain their exact pre-integration bytes', async () => {
  const hashes = JSON.parse(await readFile(new URL('./fixtures/live-audio-sha256.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(hashes).length, 35);
  for (const [file, hash] of Object.entries(hashes)) {
    const bytes = await readFile(new URL('../public/assets/audio/' + file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, file);
  }
});

test('admin display names match the current live game labels for every fighter', () => {
  assert.deepEqual(FIGHTER_DISPLAY_NAMES, Object.fromEntries(Object.entries(CHARACTER_THEMES).map(([id, theme]) => [id, theme.name])));
});

test('win-branch legacy move aliases retain current choreography without changing canonical labels', () => {
  const aliases = {
    'ALL MY WORK': 'AI Slop', 'ONE MORE TRY': 'Take Hoodie Off', 'BROKEN CHARM': 'Skip Maths A Lecture',
    WRISTBAND: 'Call the Bouncer', 'SECOND WIND': 'Glass of Water', 'DANCE FLOOR': 'Throw a Beer',
    'EXAM SHIELD': 'Curved Exam', 'LATE CREDIT': 'Brian AI'
  };
  for (const [old, current] of Object.entries(aliases)) {
    const legacy = createMoveProps(old), canonical = createMoveProps(current);
    try {
      assert.equal(legacy.userData.recipe, canonical.userData.recipe, old);
      assert.equal(canonical.name, current + ' / choreography');
    } finally { release(legacy); release(canonical); }
  }
  assert.throws(() => createMoveProps('__proto__'), /Missing move choreography/);
});
