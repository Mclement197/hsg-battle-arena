// Reproducible local MIT Three.js distribution; no CDN or runtime import map.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { transform } from 'esbuild';
const root = new URL('../../../', import.meta.url);
const vendor = new URL('public/vendor/', root);
await mkdir(vendor, { recursive: true });
for (const [source, name] of [
  ['build/three.core.js', 'three.core.js'], ['build/three.module.js', 'three.module.js'],
  ['examples/jsm/loaders/GLTFLoader.js', 'GLTFLoader.js'],
  ['examples/jsm/utils/BufferGeometryUtils.js', 'BufferGeometryUtils.js'],
  ['examples/jsm/utils/SkeletonUtils.js', 'SkeletonUtils.js']
]) {
  let code = await readFile(new URL('node_modules/three/' + source, root), 'utf8');
  code = code.replaceAll("from 'three'", "from './three.module.js'").replaceAll("from '../utils/BufferGeometryUtils.js'", "from './BufferGeometryUtils.js'").replaceAll("from '../utils/SkeletonUtils.js'", "from './SkeletonUtils.js'");
  const result = await transform(code, { minify: true, format: 'esm', target: 'es2022', legalComments: 'inline' });
  await writeFile(new URL(name, vendor), result.code);
}
await writeFile(new URL('THREE-LICENSE.txt', vendor), await readFile(new URL('node_modules/three/LICENSE', root)));
