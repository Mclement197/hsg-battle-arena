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
function frontend({ boot = false, status = 200, payload = collectorSnapshot(), path = '/usage', search = '' } = {}) {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  const requests = [];
  let responseStatus = status;
  const nodes = new Map();
  const listeners = new Map();
  const location = { pathname: path, search };
  const setLocation = (href) => { const [pathname, query = ''] = href.split('?'); location.pathname = pathname; location.search = query ? '?' + query : ''; };
  class Node {
    constructor(tag = 'div') { this.tag = tag; this.children = []; this.textContent = ''; this.attributes = {}; this.value = ''; this.hidden = false;
      this.classList = { values: new Set(), toggle: (name, enabled) => { if (enabled) this.classList.values.add(name); else this.classList.values.delete(name); } }; }
    append(...children) { this.children.push(...children); for (const child of children) { if (child && typeof child === 'object') child.parentNode = this; if (child.attributes?.id) nodes.set(child.attributes.id, child); } }
    insertBefore(child, before) { const index = this.children.indexOf(before); if (index < 0) return this.append(child); this.children.splice(index, 0, child); child.parentNode = this; }
    focus() {}
    hasAttribute(name) { return name in this.attributes; }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') nodes.set(String(value), this); }
    getAttribute(name) { return this.attributes[name]; }
    getBoundingClientRect() { return { width: 760 }; }
    querySelector(tag) { return this.children.find((child) => child.tag === tag) ?? new Node(tag); }
    addEventListener(name, fn) { this.events ??= {}; this.events[name] = fn; }
    dispatch(name, event = {}) { this.events?.[name]?.(event); }
  }
  const document = {
    addEventListener(name, fn) { listeners.set('document:' + name, fn); },
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
  const exported = '\n  globalThis.contract = { state, validateSnapshot, addTotals, emptyTotals, renderSnapshot, renderFiltered, updateFreshness, renderRoute, navigate, renderSkills, renderHistory, loadUsage };\n';
  const script = source.slice(0, boundary) + exported + (boot
    ? source.slice(boundary).replace('\n  loadUsage();\n})();', '\n  globalThis.loaded = loadUsage();\n})();')
    : '})();');
  class Clock extends Date { static now() { return now.getTime(); } }
  const context = { document, window: { location, history: { pushState(_state, _title, href) { setLocation(href); }, replaceState(_state, _title, href) { setLocation(href); } }, scrollTo() {}, setTimeout, clearTimeout, setInterval() {}, addEventListener(name, fn) { listeners.set('window:' + name, fn); } },
    Date: Clock, Intl, Map, Set, Math, Number, String, Object, Array, RegExp, Option: class {}, console, AbortController,
    fetch: async (path, options) => { requests.push({ path, options }); return { ok: responseStatus === 200, status: responseStatus, json: async () => payload }; } };
  vm.runInNewContext(script, context, { filename: 'public/app.js' });
  return { ...context.contract, nodes, get: document.getElementById, loaded: context.loaded, requests, html, location, listeners, setStatus(value) { responseStatus = value; } };
}
const cells = (row) => row.children.map((cell) => cell.textContent);
const descendant = (node, className) => {
  if (node.className === className) return node;
  for (const child of node.children ?? []) { const match = descendant(child, className); if (match) return match; }
  return null;
};

function richSnapshot() {
  const value = collectorSnapshot();
  value.agents = [{ id: 'main', name: 'Main', role: 'Coordination', configuredModel: 'configured-default', runtime: 'OpenClaw', scopedSessions: 1, usageState: 'observed' }];
  value.agentDaily = [{ ...value.daily[0], agentId: 'main' }];
  value.skillCatalog = [{ id: 'research', agentId: 'main', name: 'Research', description: 'Investigate primary sources.', descriptionSource: 'approved_public', source: 'managed', eligible: true, disabled: false, modelVisible: true, userInvocable: false, observedReads: 2, lastObservedAt: now.toISOString() }];
  value.tasks = [{ id: 'task1', agentId: 'main', kind: 'delegated_session', title: 'Review product evidence', titleSource: 'approved_label', summary: 'Reviewed evidence and compared sources.', summarySource: 'approved_metadata', status: 'succeeded', statusSource: 'session_lifecycle', observedAt: now.toISOString(), startedAt: null, endedAt: null, durationMs: 5000, durationSource: 'lifecycle_interval', model: 'configured-default', modelSource: 'session_selection', categories: ['Research'], observedRuns: 1, observedToolSteps: 3 }];
  value.requests[0].agentId = 'main'; value.requests[0].taskId = 'task1'; value.requests[0].observedToolSteps = 3; value.requests[0].categories = ['Research'];
  return value;
}

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
  assert.equal(ui.get('history-table-body').children[0].children[2].children[0].textContent, 'main');
  assert.equal(ui.get('history-table-body').children[0].children[3].textContent, 'Unavailable');
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

const navigateMock = (ui, href) => {
  const link = { getAttribute: (name) => name === 'href' ? href : null, hasAttribute: () => false };
  ui.listeners.get('document:click')({ target: { closest: () => link }, button: 0, preventDefault() {} });
};
const allText = (node) => [node.textContent, ...(node.children ?? []).flatMap(allText)].join(' ');

test('all five direct routes boot with one selected workspace', async () => {
  for (const [path, page] of [['/usage', 'overview'], ['/usage/models', 'models'], ['/usage/agents', 'agents'], ['/usage/skills', 'skills'], ['/usage/activity', 'activity']]) {
    const ui = frontend({ boot: true, path, payload: richSnapshot() }); await ui.loaded;
    assert.equal(ui.state.page, page);
    assert.equal(ui.get(page + '-page').hidden, false);
    for (const other of ['overview', 'models', 'agents', 'skills', 'activity'].filter((value) => value !== page)) assert.equal(ui.get(other + '-page').hidden, true);
    assert.equal(ui.get('app-shell').hidden, false);
  }
});

test('native links navigate, history returns, and agent detail uses real fields', async () => {
  const ui = frontend({ boot: true, payload: richSnapshot() }); await ui.loaded;
  navigateMock(ui, '/usage/agents');
  assert.equal(ui.state.page, 'agents');
  assert.equal(ui.get('agents-list').children[0].href, '/usage/agents?agent=main');
  navigateMock(ui, '/usage/agents?agent=main');
  assert.equal(ui.get('agent-detail').hidden, false);
  assert.match(allText(ui.get('agent-detail')), /Coordination/);
  ui.location.pathname = '/usage'; ui.location.search = '';
  ui.listeners.get('window:popstate')();
  assert.equal(ui.get('overview-page').hidden, false);
});

test('skill, task, run and model detail retain attribution limits', async () => {
  const data = richSnapshot();
  for (const [path, search, id, phrase] of [
    ['/usage/skills', '?skill=research', 'skill-detail', 'Investigate primary sources.'],
    ['/usage/activity', '?task=task1', 'activity-detail', 'Reviewed evidence and compared sources.'],
    ['/usage/activity', '?run=' + data.requests[0].id, 'activity-detail', 'Metadata-inferred run activity'],
    ['/usage/models', '?model=fixture-model', 'model-detail', 'Daily usage']
  ]) {
    const ui = frontend({ boot: true, path, search, payload: data }); await ui.loaded;
    assert.equal(ui.get(id).hidden, false);
    assert.ok(allText(ui.get(id)).includes(phrase), path + search + ': ' + allText(ui.get(id)));
  }
});

test('optional v1 directories are unavailable rather than fake zero', async () => {
  const ui = frontend({ boot: true, path: '/usage/agents' }); await ui.loaded;
  assert.match(allText(ui.get('agents-list')), /Directory unavailable/);
  navigateMock(ui, '/usage/skills');
  assert.match(allText(ui.get('skills-list')), /Skill directory unavailable/);
});


test('skill search narrows names and gives a recoverable empty state', async () => {
  const ui = frontend({ boot: true, path: '/usage/skills', payload: richSnapshot() }); await ui.loaded;
  ui.get('skills-search').value = 'primary sources'; ui.get('skills-search').dispatch('input');
  assert.equal(ui.get('skills-list').children.length, 1);
  assert.match(allText(ui.get('skills-list')), /Research/);
  assert.match(ui.location.search, /q=primary%20sources/);
  ui.get('skills-search').value = 'nothing like this'; ui.get('skills-search').dispatch('input');
  assert.match(allText(ui.get('skills-list')), /No matching skills/);
});

test('date reset, refresh and deep links preserve current workspace', async () => {
  const ui = frontend({ boot: true, path: '/usage/activity', search: '?period=30&task=task1', payload: richSnapshot() }); await ui.loaded;
  assert.equal(ui.state.period, 30);
  assert.equal(ui.get('activity-detail').hidden, false);
  ui.get('reset-filters').dispatch('click');
  assert.equal(ui.state.period, 7);
  assert.match(ui.location.search, /task=task1/);
  await ui.loadUsage();
  assert.equal(ui.state.page, 'activity');
  assert.equal(ui.get('activity-detail').hidden, false);
});


test('failed refresh preserves current detail and marks the previous snapshot stale', async () => {
  const ui = frontend({ boot: true, path: '/usage/agents', search: '?agent=main', payload: richSnapshot() }); await ui.loaded;
  ui.setStatus(503);
  await ui.loadUsage();
  assert.equal(ui.state.stale, true);
  assert.equal(ui.get('agent-detail').hidden, false);
  assert.match(ui.get('notice-title').textContent, /Could not refresh/);
  assert.match(ui.get('freshness-text').textContent, /refresh failed/);
});


test('summary anchors and every model table row reach meaningful destinations', async () => {
  const data = richSnapshot();
  data.daily.push({ ...data.daily[0], model: 'other-model', totalTokens: 12 });
  const ui = frontend({ boot: true, path: '/usage', search: '?period=30', payload: data }); await ui.loaded;
  assert.match(ui.get('metric-tokens-link').href, /period=30/);
  assert.match(ui.get('metric-model-link').href, /model=fixture-model/);
  assert.ok(ui.html.includes('id="metric-skills-link" class="metric metric-link" href="/usage/skills"'));
  navigateMock(ui, '/usage/models?period=30');
  assert.equal(ui.get('model-table-body').children.length, 2);
  assert.equal(ui.get('model-table-body').children[1].children[0].children[0].tag, 'a');
  assert.match(ui.get('model-table-body').children[1].children[0].children[0].href, /model=other-model/);
});

test('model detail daily facts match selected range and preserve unknown buckets', async () => {
  const data = richSnapshot();
  data.daily.push({ ...data.daily[0], date: '2026-09-20', totalTokens: 999 });
  const ui = frontend({ boot: true, path: '/usage/models', search: '?model=fixture-model&period=7', payload: data }); await ui.loaded;
  const detail = allText(ui.get('model-detail'));
  assert.match(detail, /Daily usage in this view/);
  assert.match(detail, /2026-10-12/);
  assert.doesNotMatch(detail, /2026-09-20/);
  assert.match(detail, /New input.*Unavailable/);
});

test('visible search resets clear q with matches and preserve period or detail context', async () => {
  const skill = frontend({ boot: true, path: '/usage/skills', search: '?q=research', payload: richSnapshot() }); await skill.loaded;
  assert.equal(skill.get('skills-clear-search').hidden, false);
  skill.get('skills-clear-search').dispatch('click');
  assert.equal(skill.get('skills-search').value, ''); assert.equal(skill.location.search, '');
  const activity = frontend({ boot: true, path: '/usage/activity', search: '?period=30&q=research', payload: richSnapshot() }); await activity.loaded;
  assert.equal(activity.get('activity-clear-search').hidden, false);
  activity.get('activity-clear-search').dispatch('click');
  assert.equal(activity.get('history-search').value, '');
  assert.equal(activity.location.search, '?period=30');
  activity.get('history-search').value = 'research'; activity.renderHistory();
  activity.get('reset-filters').dispatch('click');
  assert.equal(activity.location.search, ''); assert.equal(activity.get('history-search').value, '');
});

test('run rows show agent and tool steps, known buckets only in detail', async () => {
  const data = richSnapshot();
  const ui = frontend({ boot: true, path: '/usage/activity', payload: data }); await ui.loaded;
  const row = ui.get('history-table-body').children[0];
  assert.equal(row.children[2].children[0].href, '/usage/agents?agent=main');
  assert.equal(row.children[3].textContent, '3');
  assert.equal(row.children[3].children.length, 0);
  navigateMock(ui, '/usage/activity?run=' + data.requests[0].id);
  assert.doesNotMatch(allText(ui.get('activity-detail')), /Known token buckets/);
  data.requests[0].input = 0;
  ui.renderRoute(false);
  assert.match(allText(ui.get('activity-detail')), /Known token buckets/);
  assert.doesNotMatch(allText(ui.get('activity-detail')), /Cache write/);
});

test('tasks use lifecycle dates, include ongoing intervals, and sort by meaningful moment', async () => {
  const data = richSnapshot();
  data.tasks = [
    { ...data.tasks[0], id: 'old', title: 'Old completed work', startedAt: '2026-10-02T08:00:00Z', endedAt: '2026-10-02T09:00:00Z' },
    { ...data.tasks[0], id: 'running', title: 'Earlier running work', status: 'running', statusSource: 'live_session', startedAt: '2026-10-01T08:00:00Z', endedAt: null },
    { ...data.tasks[0], id: 'fresh', title: 'Fresh completed work', startedAt: '2026-10-11T08:00:00Z', endedAt: '2026-10-11T09:00:00Z' }
  ];
  const ui = frontend({ boot: true, path: '/usage/activity', search: '?period=1', payload: data }); await ui.loaded;
  assert.equal(ui.state.taskCount, 1);
  assert.match(allText(ui.get('tasks-list')), /Running at snapshot/);
  assert.doesNotMatch(allText(ui.get('tasks-list')), /Old completed work|Fresh completed work/);
  ui.location.search = '?period=30'; ui.renderRoute(false);
  const names = ui.get('tasks-list').children.map((row) => row.children[0].textContent);
  assert.deepEqual(names, ['Earlier running work', 'Fresh completed work', 'Old completed work']);
  assert.match(allText(ui.get('tasks-list')), /Ended 2 Oct/);
});

test('agent usage is snapshot-wide, latest-first, bounded and null-safe', async () => {
  const data = richSnapshot();
  data.agentDaily = Array.from({ length: 12 }, (_, i) => ({ ...data.agentDaily[0], model: 'model-' + i, date: '2026-10-' + String(i + 1).padStart(2, '0'), totalTokens: i === 11 ? null : i }));
  const ui = frontend({ boot: true, path: '/usage/agents', search: '?agent=main', payload: data }); await ui.loaded;
  const detail = allText(ui.get('agent-detail'));
  assert.match(detail, /whole snapshot window/);
  assert.match(detail, /Latest 10 of 12/);
  assert.match(detail, /2026-10-12 · model-11 · Unavailable tokens/);
  assert.equal(ui.get('agent-detail').children.find((node) => node.tag === 'ul').children.length, 10);
});


test('sampling time never invents a work date for undated task records', async () => {
  const data = richSnapshot();
  data.tasks = [
    { ...data.tasks[0], id: 'undated', title: 'Undated work', status: 'unknown', startedAt: null, endedAt: null },
    { ...data.tasks[0], id: 'run-dated', title: 'Work with a recorded run', status: 'unknown', startedAt: null, endedAt: null }
  ];
  data.requests = [{ ...data.requests[0], taskId: 'run-dated', at: '2026-09-20T09:00:00Z' }];
  const ui = frontend({ boot: true, path: '/usage/activity', search: '?period=1', payload: data }); await ui.loaded;
  assert.equal(ui.state.taskCount, 0);
  assert.equal(ui.get('undated-task-note').hidden, false);
  assert.match(ui.get('undated-task-note').textContent, /1 task record has no known work date/);
  ui.location.search = '?period=30'; ui.renderRoute(false);
  assert.equal(ui.state.taskCount, 1);
  assert.match(allText(ui.get('tasks-list')), /Latest recorded run 20 Sep/);
  assert.doesNotMatch(allText(ui.get('tasks-list')), /Undated work/);
});
