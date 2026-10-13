import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const allowedPath = value => typeof value === 'string' && /^usage-dashboard\/(?:plugin|public|scripts|src|test|graft-integration)\/[a-zA-Z0-9_.-]+\.(?:js|mjs)$/u.test(value);
const safeName = value => typeof value === 'string' && /^[a-zA-Z_$][a-zA-Z0-9_$.-]{0,199}$/u.test(value) && !/^(?:sk-|ghp_|github_pat_|eyJ)/u.test(value);
const kinds = new Set(['file', 'function', 'method', 'class', 'interface', 'type', 'enum', 'variable']);
const relations = new Set(['contains', 'imports', 'calls', 'references', 'extends', 'implements']);
const require = condition => { if (!condition) throw new Error('Unsafe or invalid structural graph'); };
export function sanitizeGraph(input, { sourceRevision, generatedAt = new Date().toISOString() } = {}) {
  require(/^[a-f0-9]{40}(?: \+ working-tree edits)?$/u.test(sourceRevision ?? '') && Number.isFinite(Date.parse(generatedAt)));
  require(Array.isArray(input?.nodes) && input.nodes.length <= 100000 && Array.isArray(input.edges) && input.edges.length <= 500000);
  require(input.meta?.nodeCount === input.nodes.length && input.meta?.edgeCount === input.edges.length);
  const ids = new Set();
  const nodes = input.nodes.map(row => {
    require(allowedPath(row.path) && safeName(row.name) && kinds.has(row.kind));
    require(typeof row.id === 'string' && (row.id === row.path || row.id.startsWith(row.path + '#') && safeName(row.id.slice(row.path.length + 1).replace(/~[1-9][0-9]{0,5}$/u, ''))));
    require(!ids.has(row.id)); ids.add(row.id);
    const span = /^L([1-9][0-9]{0,7})(?:-L([1-9][0-9]{0,7}))?$/u.exec(row.span);
    require(span && (!span[2] || Number(span[2]) >= Number(span[1])));
    return Object.fromEntries(['id', 'name', 'kind', 'path', 'span'].map(key => [key, row[key]]));
  });
  const files = nodes.filter(row => row.kind === 'file');
  const filePaths = new Set(files.map(row => row.path));
  require(files.length === filePaths.size && nodes.every(row => filePaths.has(row.path)));
  const seen = new Set();
  const edges = [];
  for (const row of input.edges) {
    require(typeof row.source === 'string' && typeof row.target === 'string' && relations.has(row.relation));
    if (!ids.has(row.source) || !ids.has(row.target)) continue;
    require(['extracted', 'inferred'].includes(row.confidence));
    const key = JSON.stringify([row.source, row.target, row.relation]);
    if (seen.has(key)) continue; seen.add(key);
    edges.push(Object.fromEntries(['source', 'target', 'relation', 'confidence'].map(key => [key, row[key]])));
  }
  return { meta: { generator: 'Graft @nanonets/graft 0.21.1 structural build', sourceRevision, generatedAt,
    scope: 'All ' + files.length + ' supported JavaScript source/test files currently in HSG Battle Arena; implemented code is usage-dashboard only. Documentation, HTML/CSS assets and configuration are not structural nodes. No battle-game implementation exists.',
    fileCount: files.length, nodeCount: nodes.length, edgeCount: edges.length, omittedExternalEdges: input.edges.length - edges.length }, nodes, edges };
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const out = sanitizeGraph(input, { sourceRevision: process.argv[3] });
  fs.writeFileSync(new URL('./graph.json', import.meta.url), JSON.stringify(out));
  console.log(JSON.stringify({ files: out.meta.fileCount, nodes: out.meta.nodeCount, edges: out.meta.edgeCount }));
}
