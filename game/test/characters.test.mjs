import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import validator from 'gltf-validator';
import * as THREE from '../public/vendor/three.module.js';
import { GLTFLoader } from '../public/vendor/GLTFLoader.js';
import { CHARACTER_MODELS, modelFor, REQUIRED_CLIPS } from '../public/characters.js';
import { CHARACTERS, Arena } from '../src/engine.mjs';
import { CHARACTER_THEMES, createVisualCue } from '../public/app.js';
import { createGameServer } from '../src/server.mjs';
const asset = url => new URL('../public/' + url.slice(2), import.meta.url);

for (const id of CHARACTERS) test(id + ': self-contained validated GLB with actual multiweight skin and seven animated clips', async () => {
  assert.deepEqual(Object.keys(CHARACTER_MODELS), CHARACTERS);
  const bytes = await readFile(asset(modelFor(id).model));
  assert.ok(bytes.length < 3 * 1024 * 1024, 'mobile per-fighter budget');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.equal(json.skins.length, 1); assert.ok(json.skins[0].joints.length >= 48);
  assert.ok(!json.buffers.some(b => b.uri)); assert.ok(!json.images?.some(i => i.uri));
  assert.deepEqual(json.animations.map(a => a.name).sort(), [...REQUIRED_CLIPS].sort());
  const boneNames = json.skins[0].joints.map(n => json.nodes[n].name);
  for (const side of ['left', 'right']) for (const digit of ['index.1', 'index.2', 'index.3', 'thumb.1', 'thumb.2', 'forearm', 'shin', 'foot', 'toe']) assert.ok(boneNames.includes(side + '.' + digit));
  if (id === 'luca-di-grazia') for (const side of ['left', 'right']) for (const wing of ['wing', 'wingtip']) assert.ok(boneNames.includes(side + '.' + wing));
  if (id === 'trischli-warrior') assert.ok(json.nodes.some(n => n.extras?.vfx_separate));
  const validation = await validator.validateBytes(bytes, { maxIssues: 30 });
  assert.equal(validation.issues.numErrors, 0, JSON.stringify(validation.issues));
  assert.equal(validation.issues.numWarnings, 0, JSON.stringify(validation.issues));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const meshes = []; gltf.scene.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); }); assert.ok(meshes.length);
  let mixed = 0;
  for (const mesh of meshes) {
    const weights = mesh.geometry.getAttribute('skinWeight');
    for (let i = 0; i < weights.count; i++) {
      const values = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
      assert.ok(Math.abs(values.reduce((a, b) => a + b, 0) - 1) < .001);
      if (values.filter(v => v > .05).length > 1) mixed++;
    }
  }
  assert.ok(mixed > 500, 'not rigid object transforms');
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const positions = () => { gltf.scene.updateMatrixWorld(true); return meshes.map(m => { m.skeleton.update(); return Array.from({ length: m.geometry.getAttribute('position').count }, (_, i) => m.getVertexPosition(i, new THREE.Vector3()).clone()); }); };
  const rest = positions();
  mixer.clipAction(gltf.animations.find(a => a.name === 'attack')).play(); mixer.update(.5);
  const posed = positions();
  const changed = posed.reduce((sum, pts, m) => sum + pts.filter((p, i) => p.distanceTo(rest[m][i]) > .01).length, 0);
  assert.ok(changed > 500, 'exported clip really bends weighted vertices, not just a root');
  assert.equal((await readFile(asset(modelFor(id).portrait))).toString('ascii', 8, 12), 'WEBP');
  mixer.stopAllAction();
});

test('authoritative six-identity mapping and result dedup remain aligned', () => {
  assert.equal(modelFor('__proto__'), null); assert.equal(modelFor('luca'), null);
  for (const id of CHARACTERS) {
    const arena = new Arena({ now: () => 1000, pick: () => 0 }); const room = arena.create();
    const host = arena.authenticate(room, room.hostToken); arena.enableBot(room);
    arena.configure(room, host, { arenaId: 'library', characterA: id, characterB: 'bad-teacher' });
    const snapshot = arena.snapshot(room, host); assert.equal(snapshot.teams.A.characterId, id); assert.ok(CHARACTER_THEMES[id]);
    const cues = [], cue = createVisualCue(e => cues.push(e)); cue(snapshot); cue(snapshot);
    assert.equal(cues.length, 0, 'selection does not attack');
    snapshot.phase = 'running'; snapshot.lastResult = { number: 1, team: 'A', move: 'attack' }; cue(snapshot); cue(snapshot);
    assert.equal(cues.length, 1); assert.equal(cues[0].themeId, id);
  }
});

test('only exact same-origin model and vendor routes are served with safe MIME types', async t => {
  const game = createGameServer({ publicOrigin: 'http://127.0.0.1' }); await new Promise(r => game.server.listen(0, '127.0.0.1', r)); t.after(() => game.close());
  const get = path => new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port: game.server.address().port, path }, res => { let size = 0; res.on('data', b => size += b.length); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], size })); }).on('error', reject); });
  for (const [path, type] of [['characters.js', 'text/javascript'], ['vendor/three.module.js', 'text/javascript'], ['vendor/three.core.js', 'text/javascript'], ['vendor/GLTFLoader.js', 'text/javascript'], ['vendor/SkeletonUtils.js', 'text/javascript'], ['vendor/BufferGeometryUtils.js', 'text/javascript'], ...CHARACTERS.map(id => ['assets/characters/' + id + '.glb', 'model/gltf-binary'])]) {
    const r = await get('/game/' + path); assert.equal(r.status, 200, path); assert.ok(r.type.startsWith(type)); assert.ok(r.size > 0);
  }
  for (const path of ['assets/characters/unknown.glb', 'assets/characters/generate.py', 'vendor/other.js', 'art/characters/v2/hsg-characters-v2.blend', 'assets/characters/%2e%2e/luca-di-grazia.glb']) assert.equal((await get('/game/' + path)).status, 404);
});
