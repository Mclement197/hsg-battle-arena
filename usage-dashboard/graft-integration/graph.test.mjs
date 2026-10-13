import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sanitizeGraph } from './sanitize.mjs';
import { mountGraftGraph } from './viewer.js';
const graph = JSON.parse(readFileSync(new URL('./graph.json', import.meta.url), 'utf8'));
const revision = 'a'.repeat(40) + ' + working-tree edits';
const fixture = () => {
  const a = 'usage-dashboard/src/a.mjs', b = 'usage-dashboard/src/b.mjs';
  const nodes = [{ id: a + '#fileA', name: 'a.mjs', path: a, kind: 'file', span: 'L1-L10' },
    { id: a + '#functionA', name: 'functionA', path: a, kind: 'function', span: 'L2-L4' },
    { id: b + '#fileB', name: 'b.mjs', path: b, kind: 'file', span: 'L1-L10' },
    { id: b + '#functionB', name: 'functionB', path: b, kind: 'function', span: 'L2-L4' }];
  const edges = [{ source: nodes[1].id, target: nodes[3].id, relation: 'calls', confidence: 'extracted' }];
  return { meta: { nodeCount: nodes.length, edgeCount: edges.length }, nodes, edges };
};
test('public graph contains only validated relative structural metadata', () => {
  const projected = sanitizeGraph(graph, graph.meta);
  assert.deepEqual(projected.nodes, graph.nodes); assert.deepEqual(projected.edges, graph.edges);
  assert.equal(graph.nodes.length, graph.meta.nodeCount); assert.equal(graph.edges.length, graph.meta.edgeCount);
  for (const forbidden of ['/home/', 'AGENTS.md', 'MEMORY.md', 'BEGIN PRIVATE KEY']) assert.ok(!JSON.stringify(graph).includes(forbidden));
  const root = new URL('../', import.meta.url);
  const code = ['plugin', 'public', 'scripts', 'src', 'test', 'graft-integration'].flatMap(dir =>
    readdirSync(new URL(dir + '/', root)).filter(file => /\.(mjs|js)$/.test(file)).map(file => 'usage-dashboard/' + dir + '/' + file)).sort();
  assert.deepEqual(graph.nodes.filter(row => row.kind === 'file').map(row => row.path).sort(), code);
  assert.equal(graph.meta.fileCount, code.length);
  assert.match(graph.meta.scope, /implemented code is usage-dashboard only/);
});
test('official Graft export inlines only the sanitized graph and exposes native Code/Outline tabs', () => {
  const html = readFileSync(new URL('./viewer/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('codeGraph: ');
  const end = html.indexOf('\n};</script>', start);
  assert.ok(start > 0 && end > start, 'official self-contained export includes graph payload');
  const embedded = JSON.parse(html.slice(start + 'codeGraph: '.length, end));
  assert.deepEqual(embedded.nodes, graph.nodes);
  assert.deepEqual(embedded.edges, graph.edges);
  assert.equal(embedded.meta.version, 1);
  assert.match(html, /window\.__GRAFT_DATA__/);
  assert.match(html, /data-tab="code"/);
  assert.match(html, /data-tab="outline"/);
  assert.doesNotMatch(html, /\/home\/|AGENTS\.md|MEMORY\.md|BEGIN PRIVATE KEY/);
});

test('sanitizer strips nested extras, drops unresolved edges and rejects unsafe graph fields', () => {
  const source = fixture();
  source.nodes[0].body = 'private source'; source.nodes[1].signature = 'private command'; source.edges[0].secret = 'private'; source.meta.privatePath = '/home/private';
  source.edges.push({ source: source.nodes[0].id, target: '/home/private', relation: 'imports', confidence: 'inferred' }); source.meta.edgeCount++;
  const safe = sanitizeGraph(source, { sourceRevision: revision, generatedAt: '2026-10-13T09:00:00Z' });
  assert.equal(safe.edges.length, 1); assert.equal(safe.meta.omittedExternalEdges, 1);
  assert.doesNotMatch(JSON.stringify(safe), new RegExp('private source|private command|privatePath|secret|/home/'));
  for (const change of [v => v.nodes[0].path = '../private.js', v => v.nodes[0].path = 'usage-dashboard/src/AGENTS.md',
    v => v.nodes[0].name = '/home/private', v => v.nodes[0].name = 'sk-privatecredential',
    v => v.nodes[0].id = 'agent:main:secret', v => v.nodes[0].id += '#/home/private', v => v.nodes[0].id += '~secret',
    v => v.nodes[0].span = 'L10-L1', v => v.nodes[0].span = 'prompt text', v => v.nodes[0].kind = 'private task',
    v => v.nodes[1].id = v.nodes[0].id, v => v.edges[0].relation = 'private text', v => v.edges[0].confidence = 'secret',
    v => v.meta.nodeCount = 99]) {
    const value = fixture(); change(value); assert.throws(() => sanitizeGraph(value, { sourceRevision: revision }), /Unsafe or invalid/);
  }
});
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.value = ''; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { this[name] = callback; }
}
const find = (node, tag) => [node, ...node.children.flatMap(child => find(child, tag))].filter(item => item.tag === tag);
async function rendered(payload) {
  const original = { document: globalThis.document, fetch: globalThis.fetch };
  globalThis.document = { createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag) };
  globalThis.fetch = async () => ({ ok: true, json: async () => payload });
  const host = new Node('host');
  try { await mountGraftGraph(host); return host; } finally { globalThis.document = original.document; globalThis.fetch = original.fetch; }
}
test('viewer renders dependency lines when file IDs differ from paths', async () => {
  const safe = sanitizeGraph(fixture(), { sourceRevision: revision });
  const host = await rendered(safe);
  assert.equal(find(host, 'line').length, 1);
  assert.equal(find(host, 'circle').length, 2);
  assert.equal(find(host, 'button').length, 2);
  assert.equal(find(host, 'button')[0].attributes['aria-pressed'], 'false');
});
test('actual refreshed Graft snapshot produces nonzero rendered dependency lines', async () => {
  const host = await rendered(graph);
  assert.ok(find(host, 'line').length > 0);
  assert.equal(find(host, 'circle').length, graph.meta.fileCount);
});
