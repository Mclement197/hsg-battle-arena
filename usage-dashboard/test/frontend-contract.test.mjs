import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildSnapshot, dailyRows, makeRange } from '../src/telemetry.mjs';

const now = new Date('2026-10-12T11:00:00Z');
const range = makeRange(now, 30);
const session = { agentId: 'main', key: 'agent:main:dashboard:fixture', sessionId: 'fixture-instance' };
const usage = { input: 100, output: 25, cacheRead: 40, cacheWrite: 5, totalTokens: 170, totalCost: 0.02, missingCostEntries: 0 };
function collectorSnapshot() {
  const report = {
    aggregates: {
      byModel: [{ provider: 'openai', model: 'fixture-model', count: 2, totals: usage }],
      modelDaily: [{ date: range.end, provider: 'openai', model: 'fixture-model', count: 2, tokens: 170, cost: 0.02 }]
    }, totals: usage
  };
  const audit = [{ eventId: 'fixture-event', kind: 'agent_run', action: 'agent.run.finished', status: 'succeeded',
    occurredAt: now.getTime() - 1000, agentId: session.agentId, sessionKey: session.key,
    sessionId: session.sessionId, runId: 'fixture-run' }];
  return buildSnapshot({ now, range, sessions: [session], rows: dailyRows(report, range), events: audit });
}

// Run the actual frontend against its HTML IDs; boot tests include all listeners and the initial fetch.
function frontend({ boot = false, status = 200, payload = collectorSnapshot() } = {}) {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  const requests = [];
  const nodes = new Map();
  class Node {
    constructor(tag = 'div') { this.tag = tag; this.children = []; this.textContent = ''; this.attributes = {}; this.value = ''; this.hidden = false;
      this.classList = { values: new Set(), toggle: (name, enabled) => { if (enabled) this.classList.values.add(name); else this.classList.values.delete(name); } }; }
    append(...children) { this.children.push(...children); for (const child of children) if (child.attributes?.id) nodes.set(child.attributes.id, child); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') nodes.set(String(value), this); }
    getAttribute(name) { return this.attributes[name]; }
    getBoundingClientRect() { return { width: 760 }; }
    querySelector(tag) { return this.children.find((child) => child.tag === tag) ?? new Node(tag); }
    addEventListener() {}
  }
  const document = {
    getElementById: (id) => { assert.ok(ids.has(id) || nodes.has(id), 'No HTML element: ' + id); if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); },
    querySelector: (selector) => { assert.equal(selector, '.skip-link'); return new Node('a'); },
    querySelectorAll: () => [],
    createElement: (tag) => new Node(tag), createElementNS: (_, tag) => new Node(tag),
    createTextNode: (content) => ({ textContent: content }),
    createDocumentFragment: () => new Node('fragment')
  };
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const boundary = source.indexOf("  $('refresh-button').addEventListener(");
  assert.ok(boundary > 0, 'frontend test boundary found');
  const exported = '\n  globalThis.contract = { state, validateSnapshot, addTotals, emptyTotals, renderSnapshot, renderFiltered, updateFreshness };\n';
  const script = source.slice(0, boundary) + exported + (boot
    ? source.slice(boundary).replace('\n  loadUsage();\n})();', '\n  globalThis.loaded = loadUsage();\n})();')
    : '})();');
  class Clock extends Date { static now() { return now.getTime(); } }
  const context = { document, window: { setTimeout, clearTimeout, setInterval() {}, addEventListener() {} },
    Date: Clock, Intl, Map, Set, Math, Number, String, Object, Array, RegExp, Option: class {}, console, AbortController,
    fetch: async (path, options) => { requests.push({ path, options }); return { ok: status === 200, status, json: async () => payload }; } };
  vm.runInNewContext(script, context, { filename: 'public/app.js' });
  return { ...context.contract, nodes, get: document.getElementById, loaded: context.loaded, requests, html };
}
const cells = (row) => row.children.map((cell) => cell.textContent);
const descendant = (node, className) => {
  if (node.className === className) return node;
  for (const child of node.children ?? []) { const match = descendant(child, className); if (match) return match; }
  return null;
};

test('collector fallback and unattributed audit pass validation without fabricating buckets', () => {
  const ui = frontend();
  const snapshot = collectorSnapshot();
  assert.equal(snapshot.daily[0].input, null);
  assert.equal(snapshot.daily[0].totalTokens, 170);
  assert.equal(snapshot.requests[0].model, 'Not attributed');
  assert.equal(snapshot.requests[0].totalTokens, null);
  assert.equal(ui.validateSnapshot(snapshot), snapshot);
  assert.throws(() => ui.validateSnapshot({ ...snapshot, daily: [{ ...snapshot.daily[0], totalTokens: null }] }), /invalid-snapshot/);
  assert.throws(() => ui.validateSnapshot({ ...snapshot, daily: [{ ...snapshot.daily[0], input: undefined }] }), /invalid-snapshot/);
  assert.throws(() => ui.validateSnapshot({ ...snapshot, requests: [{ ...snapshot.requests[0], input: '0' }] }), /invalid-snapshot/);
});

test('mixed known and unknown buckets stay unknown across model and daily aggregation', () => {
  const ui = frontend();
  const snapshot = collectorSnapshot();
  const known = { ...snapshot.daily[0], input: 100, output: 25, cacheRead: 40, cacheWrite: 5 };
  snapshot.daily.push(known);
  ui.validateSnapshot(snapshot);
  ui.state.data = snapshot;
  ui.state.requestRows = snapshot.requests.map((row) => ({ ...row, day: range.end }));
  ui.renderSnapshot();
  assert.equal(ui.state.days.at(-1).totalTokens, 340);
  assert.equal(ui.state.days.at(-1).requests, 4);
  assert.equal(ui.state.days.at(-1).input, null);
  assert.equal(ui.state.models[0].input, null);
  assert.equal(ui.get('metric-tokens').textContent, '340');
  assert.deepEqual(cells(ui.get('daily-table-body').children.at(-1)), [range.end, 'Unavailable', 'Unavailable', 'Unavailable', 'Unavailable', '340', '4']);
  assert.equal(descendant(ui.get('token-breakdown').children[0], 'breakdown-value').textContent, '—');
  assert.match(ui.get('breakdown-note').textContent, /unavailable, not zero/);
  assert.equal(descendant(ui.get('history-table-body').children[0], 'request-tokens').textContent, 'Unavailable');
  assert.equal(ui.get('history-table-body').children[0].children[2].children[0].textContent, 'Not attributed');
  assert.equal(ui.get('history-table-body').children[0].children[3].children[1].children[1].children[0].children[1].textContent, 'Unavailable');
  assert.ok(ui.get('coverage-notes').children.some((note) => /null values are not zeros/.test(note.textContent)));
  assert.match(ui.get('timeline-chart').getAttribute('aria-valuetext'), /340 tokens, 4 recorded model entries/);
});

test('zero is visible and stale threshold begins at fifteen minutes', () => {
  const ui = frontend();
  const snapshot = collectorSnapshot();
  snapshot.daily[0].input = 0;
  ui.state.data = snapshot;
  ui.state.requestRows = snapshot.requests.map((row) => ({ ...row, day: range.end }));
  ui.renderSnapshot();
  assert.equal(ui.get('daily-table-body').children.at(-1).children[1].textContent, '0');
  assert.equal(descendant(ui.get('token-breakdown').children[0], 'breakdown-value').textContent, '0');
  ui.state.data = { ...snapshot, generatedAt: new Date(now.getTime() - 14 * 60_000).toISOString() };
  ui.updateFreshness();
  assert.equal(ui.get('freshness').classList.values.has('is-stale'), false);
  ui.state.data.generatedAt = new Date(now.getTime() - 15 * 60_000).toISOString();
  ui.updateFreshness();
  assert.equal(ui.get('freshness').classList.values.has('is-stale'), true);
  assert.match(ui.get('freshness-text').textContent, /may be stale/);
});


test('the full public frontend boots without login controls or cookies', async () => {
  const ui = frontend({ boot: true });
  await ui.loaded;
  assert.ok(ui.state.data);
  assert.equal(ui.get('app-shell').hidden, false);
  assert.equal(ui.get('initial-state').hidden, true);
  assert.equal(ui.get('notice').hidden, true);
  assert.equal(ui.get('metric-tokens').textContent, '170');
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].path, '/usage/api/usage');
  assert.equal(ui.requests[0].options.credentials, 'omit');
  assert.doesNotMatch(ui.html, /login-form|logout-button|type="password"|Private workspace/);
});

test('a missing public snapshot shows a retry notice instead of a login prompt', async () => {
  const ui = frontend({ boot: true, status: 503 });
  await ui.loaded;
  assert.equal(ui.state.data, null);
  assert.equal(ui.get('app-shell').hidden, false);
  assert.equal(ui.get('notice').hidden, false);
  assert.equal(ui.get('notice-title').textContent, 'Could not load your usage');
  assert.equal(ui.get('retry-button').disabled, false);
});
