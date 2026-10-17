import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import validator from 'gltf-validator';
import { CHARACTER_MODELS } from '../../../public/characters.js';
const root = new URL('../../../', import.meta.url);
const assets = [];
for (const [id, spec] of Object.entries(CHARACTER_MODELS)) {
  const raw = await readFile(new URL('public/' + spec.model.slice(2), root));
  const json = JSON.parse(raw.toString('utf8', 20, 20 + raw.readUInt32LE(12)));
  const result = await validator.validateBytes(raw, { maxIssues: 100 });
  if (result.issues.numErrors || result.issues.numWarnings) throw Error(id + ': ' + JSON.stringify(result.issues));
  assets.push({ id, bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex'),
    triangles: json.meshes.reduce((total, m) => total + m.primitives.reduce((n, p) => n + json.accessors[p.indices].count / 3, 0), 0),
    skins: json.skins.length, bones: json.skins[0].joints.length,
    clips: json.animations.map(a => ({ name: a.name, seconds: Math.max(...a.samplers.map(s => json.accessors[s.input].max[0])) })),
    externalResources: [...json.buffers, ...(json.images || [])].filter(x => x.uri).length,
    validation: result.issues });
}
await writeFile(new URL('export-validation.json', import.meta.url), JSON.stringify({ validator: 'Khronos glTF Validator 2.0.0-dev.3.10', assets }, null, 2));
console.log(assets.map(a => ({ id: a.id, bytes: a.bytes, triangles: a.triangles, bones: a.bones, errors: a.validation.numErrors, warnings: a.validation.numWarnings })));
