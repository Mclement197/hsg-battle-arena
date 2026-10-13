import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildSnapshot, dailyRows, makeRange } from '../src/telemetry.mjs';
import { installationSnapshot } from '../src/installation-usage.mjs';

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
  const value = buildSnapshot({ now, range, sessions: [session], rows: dailyRows(report, range), events: audit });
  // Exercise genuine older v1 snapshots without any chart extension.
  delete value.skillDaily; delete value.agentRunDaily; delete value.coverage.usageCharts;
  return value;
}

// Run the actual frontend against its HTML IDs; boot tests include all listeners and the initial fetch.
function frontend({ boot = false, status = 200, payload = collectorSnapshot(), path = '/usage', search = '' } = {}) {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  const requests = [];
  const intervals = [];
  let responsePayload = payload;
  let fetchWait;
  let responseStatus = status;
  let activePayload = { observedAt: now.toISOString(), status: 'ok', agents: [] };
  let activeStatus = 200;
  let activeWait;
  const activeRequests = [];
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
    hidden: false,
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
  const exported = '\n  globalThis.contract = { state, validateSnapshot, addTotals, emptyTotals, renderSnapshot, renderFiltered, updateFreshness, renderRoute, navigate, renderSkills, renderHistory, loadUsage, loadActiveAgents };\n';
  let script = source.slice(0, boundary) + exported + (boot
    ? source.slice(boundary).replace('\n  loadUsage();\n  loadActiveAgents();\n})();', '\n  globalThis.loaded = loadUsage();\n  globalThis.activeLoaded = loadActiveAgents();\n})();')
    : '})();');
  class Clock extends Date { static now() { return now.getTime(); } }
  let graphMounts = 0;
  const context = { mountGraphMock: (host) => { graphMounts++; host.textContent = 'Mounted graph fixture'; }, document, window: { location, history: { pushState(_state, _title, href) { setLocation(href); }, replaceState(_state, _title, href) { setLocation(href); } }, scrollTo() {}, setTimeout, clearTimeout, setInterval(fn, delay) { intervals.push({ fn, delay }); }, addEventListener(name, fn) { listeners.set('window:' + name, fn); } },
    Date: Clock, Intl, Map, Set, Math, Number, String, Object, Array, RegExp, Option: class {}, console, AbortController,
    fetch: async (path, options) => { if (path === '/usage/api/active-agents') { activeRequests.push({ path, options }); await activeWait; return { ok: activeStatus === 200, status: activeStatus, json: async () => activePayload }; } requests.push({ path, options }); await fetchWait; return { ok: responseStatus === 200, status: responseStatus, json: async () => responsePayload }; } };
  vm.runInNewContext(script, context, { filename: 'public/app.js' });
  return { ...context.contract, graphMounts: () => graphMounts, nodes, get: document.getElementById, loaded: context.loaded, activeLoaded: context.activeLoaded, requests, activeRequests, intervals, document, html, location, listeners, setActive(value) { activePayload = value; }, setActiveStatus(value) { activeStatus = value; }, setActiveWait(value) { activeWait = value; }, setPayload(value) { responsePayload = value; }, setFetchWait(value) { fetchWait = value; }, setStatus(value) { responseStatus = value; } };
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


test('visible dashboard polls and displays newer token snapshots without manual refresh', async () => {
  const ui = frontend({ boot: true }); await ui.loaded;
  const newer = collectorSnapshot();
  newer.generatedAt = new Date(now.getTime() + 60000).toISOString();
  newer.daily[0].totalTokens = 340;
  ui.setPayload(newer);
  const poll = ui.intervals.find(({ delay }) => delay === 60000);
  assert.ok(poll, 'one-minute polling timer is installed');
  await poll.fn();
  assert.equal(ui.requests.length, 2, 'timer requests the latest snapshot');
  assert.equal(ui.get('metric-tokens').textContent, '340');
  assert.equal(ui.state.data.generatedAt, newer.generatedAt);
});

test('polling pauses while hidden and refreshes immediately on becoming visible', async () => {
  const ui = frontend({ boot: true, path: '/usage/agents', search: '?agent=main&period=7', payload: richSnapshot() }); await ui.loaded;
  const poll = ui.intervals.find(({ delay }) => delay === 60000);
  ui.document.hidden = true;
  await poll.fn();
  await ui.listeners.get('document:visibilitychange')();
  assert.equal(ui.requests.length, 1);
  ui.document.hidden = false;
  await ui.listeners.get('document:visibilitychange')();
  assert.equal(ui.requests.length, 2);
  assert.equal(ui.location.pathname, '/usage/agents');
  assert.equal(ui.location.search, '?agent=main&period=7');
  assert.equal(ui.state.page, 'agents');
  assert.equal(ui.state.period, 7);
});

test('timer, resume and manual refresh cannot overlap pending snapshot requests', async () => {
  const ui = frontend({ boot: true }); await ui.loaded;
  let release; ui.setFetchWait(new Promise(resolve => { release = resolve; }));
  const poll = ui.intervals.find(({ delay }) => delay === 60000);
  const active = poll.fn();
  assert.equal(ui.state.pending, true);
  await poll.fn();
  await ui.listeners.get('document:visibilitychange')();
  await ui.loadUsage();
  assert.equal(ui.requests.length, 2, 'only one refresh in flight');
  release(); await active;
  assert.equal(ui.state.pending, false);
});

test('failed automatic refresh retains good usage and a later poll recovers', async () => {
  const ui = frontend({ boot: true }); await ui.loaded;
  const before = ui.state.data;
  const poll = ui.intervals.find(({ delay }) => delay === 60000);
  ui.setStatus(503); await poll.fn();
  assert.equal(ui.state.data, before);
  assert.equal(ui.state.stale, true);
  assert.match(ui.get('freshness-text').textContent, /refresh failed/);
  ui.setStatus(200); await poll.fn();
  assert.equal(ui.state.stale, false);
  assert.equal(ui.get('notice').hidden, true);
});

test('automatic polling retries when initial snapshot is unavailable', async () => {
  const ui = frontend({ boot: true, status: 503 }); await ui.loaded;
  assert.equal(ui.state.data, null);
  ui.setStatus(200);
  await ui.intervals.find(({ delay }) => delay === 60000).fn();
  assert.ok(ui.state.data);
  assert.equal(ui.requests.length, 2);
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
  for (const [path, page] of [['/usage', 'overview'], ['/usage/models', 'models'], ['/usage/agents', 'agents'], ['/usage/skills', 'skills'], ['/usage/activity', 'activity'], ['/usage/graft', 'graft']]) {
    const ui = frontend({ boot: true, path, payload: richSnapshot() }); await ui.loaded;
    assert.equal(ui.state.page, page);
    assert.equal(ui.get(page + '-page').hidden, false);
    for (const other of ['overview', 'models', 'agents', 'skills', 'activity', 'graft'].filter((value) => value !== page)) assert.equal(ui.get(other + '-page').hidden, true);
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
  assert.equal(ui.get('agent-detail').children.filter((node) => node.tag === 'ul').at(-1).children.length, 10);
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

function chartSnapshot() {
  const value = richSnapshot();
  value.skills = [{ name: 'Research', description: 'Confirmed skill instruction read', count: 9, lastUsedAt: now.toISOString() }];
  value.skillDaily = [{ name: 'Research', date: '2026-10-12', count: 2 }, { name: 'Research', date: '2026-09-20', count: 7 }];
  value.agentRunDaily = [{ agentId: 'main', date: '2026-10-12', count: 3 }, { agentId: 'main', date: '2026-09-20', count: 8 }];
  value.coverage.usageCharts = { skills: 'partial', agents: 'partial' };
  return value;
}

test('dated charts and drill-down counts share range, ignore model filters and preserve context', async () => {
  const ui = frontend({ boot: true, path: '/usage', search: '?period=1&filter=fixture-model', payload: chartSnapshot() }); await ui.loaded;
  assert.equal(ui.get('metric-skills').textContent, '2');
  assert.equal(ui.get('overview-skills-usage-table').children[0].children[1].textContent, '2');
  assert.equal(ui.get('overview-agents-usage-table').children[0].children[1].textContent, '3');
  assert.match(ui.get('overview-agents-usage-note').textContent, /known lower bounds/);
  assert.match(ui.get('overview-skills-usage-note').textContent, /Model filters do not apply/);
  const skillLink = ui.get('overview-skills-usage-chart').children[0];
  assert.equal(skillLink.href, '/usage/skills?skill=research&period=1');
  navigateMock(ui, skillLink.href);
  assert.equal(ui.get('global-filters').hidden, false);
  assert.equal(ui.get('model-control').hidden, true);
  assert.match(allText(ui.get('skill-detail')), /2026-10-12 · 2 instruction reads/);
  assert.doesNotMatch(allText(ui.get('skill-detail')), /2026-09-20/);
  navigateMock(ui, '/usage/agents?agent=main&period=1');
  assert.match(allText(ui.get('agent-detail')), /2026-10-12 · 3 observed runs/);
  assert.doesNotMatch(allText(ui.get('agent-detail')), /2026-09-20 · 8 observed runs/);
  ui.get('reset-filters').dispatch('click');
  assert.match(ui.location.search, /agent=main/);
  ui.location.search = '?agent=main&period=30'; ui.listeners.get('window:popstate')();
  assert.equal(ui.state.period, 30);
  assert.match(allText(ui.get('agent-detail')), /2026-09-20 · 8 observed runs/);
  assert.match(allText(ui.get('agent-detail')), /Observed runs 11/);
  await ui.loadUsage();
  assert.equal(ui.state.period, 30);
  ui.setStatus(503); await ui.loadUsage();
  assert.equal(ui.state.stale, true);
  assert.match(allText(ui.get('agent-detail')), /Observed runs 11/);
});

test('older snapshots label skill counts snapshot-wide and agent counts unavailable, never date guesses', async () => {
  const value = richSnapshot();
  value.skills = [{ name: 'Research', description: 'Confirmed skill instruction read', count: 9, lastUsedAt: now.toISOString() }];
  const ui = frontend({ boot: true, path: '/usage/skills', search: '?period=1', payload: value }); await ui.loaded;
  assert.match(ui.get('skills-usage-note').textContent, /Whole snapshot · date attribution unavailable/);
  assert.equal(ui.get('skills-usage-table').children[0].children[1].textContent, '9');
  assert.match(allText(ui.get('agents-usage-chart')), /Usage evidence unavailable/);
  navigateMock(ui, '/usage/skills?skill=research&period=1');
  assert.match(allText(ui.get('skill-detail')), /Observed instruction reads 9/);
  assert.match(allText(ui.get('skill-detail')), /Whole snapshot/);
});

test('empty and unavailable chart evidence never creates zero-use agents or skills', async () => {
  const value = chartSnapshot(); value.skillDaily = null; value.skills = []; value.agentRunDaily = [];
  const ui = frontend({ boot: true, payload: value }); await ui.loaded;
  assert.equal(ui.get('metric-skills').textContent, '—');
  assert.match(allText(ui.get('overview-skills-usage-chart')), /Usage evidence unavailable/);
  assert.match(allText(ui.get('overview-agents-usage-chart')), /No observations in this view/);
  assert.match(allText(ui.get('overview-agents-usage-table')), /no zero-use claim/);
});

test('chart tables include all positive entities, bars cap at eight and absent-directory links remain useful', async () => {
  const value = chartSnapshot(); value.agents = null;
  value.agentRunDaily = Array.from({ length: 10 }, (_, i) => ({ agentId: 'agent-' + i, date: range.end, count: i + 1 }));
  const ui = frontend({ boot: true, payload: value }); await ui.loaded;
  assert.equal(ui.get('overview-agents-usage-chart').children.length, 8);
  assert.equal(ui.get('overview-agents-usage-table').children.length, 10);
  navigateMock(ui, ui.get('overview-agents-usage-chart').children[0].href);
  assert.match(allText(ui.get('agent-detail')), /agent-9/);
  assert.match(allText(ui.get('agent-detail')), /10 observed runs/);
});

test('explicit unavailable daily evidence never falls back to legacy skill totals', async () => {
  const value = chartSnapshot(); value.skillDaily = null; value.coverage.usageCharts.skills = 'unavailable';
  const ui = frontend({ boot: true, payload: value }); await ui.loaded;
  assert.equal(ui.get('metric-skills').textContent, '—');
  assert.match(allText(ui.get('overview-skills-usage-chart')), /Usage evidence unavailable/);
});

test('directory links are regenerated with changed date filters and skill rows match charts', async () => {
  const ui = frontend({ boot: true, path: '/usage/skills', search: '?period=30', payload: chartSnapshot() }); await ui.loaded;
  assert.match(allText(ui.get('skills-list')), /9 reads/);
  assert.match(ui.get('skills-list').children[0].href, /period=30/);
  ui.get('reset-filters').dispatch('click');
  assert.match(allText(ui.get('skills-list')), /2 reads/);
  assert.equal(ui.get('agents-list').children[0].href, '/usage/agents?agent=main');
});

test('Graft sidebar embeds the official exported viewer without mounting custom JS', async () => {
  const ui = frontend({ boot: true }); await ui.loaded;
  assert.match(ui.html, /class="nav-link" href="\/usage\/graft"/);
  navigateMock(ui, '/usage/graft');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ui.get('graft-page').hidden, false);
  assert.equal(ui.get('global-filters').hidden, true);
  assert.match(ui.html, /<iframe[^>]+src="\/usage\/graft\/viewer\/index.html"/);
  assert.equal(ui.graphMounts(), 0);
  navigateMock(ui, '/usage'); navigateMock(ui, '/usage/graft');
  await Promise.resolve();
  assert.equal(ui.graphMounts(), 0);
});



test('installation aggregates show tokens without inventing model entries or sessions', async () => {
  const totals = { input: 100, output: 25, cacheRead: 40, cacheWrite: 5, totalTokens: 170, totalCost: 0.02, missingCostEntries: 0 };
  const data = installationSnapshot({ daily: [{ date: range.end, ...totals }], totals, updatedAt: now.getTime(), cacheStatus: { status: 'fresh' } }, range, now);
  const ui = frontend({ boot: true, payload: data }); await ui.loaded;
  assert.equal(ui.get('metric-tokens').textContent, '170');
  assert.equal(ui.get('metric-calls').textContent, '—');
  assert.equal(ui.get('metric-model').textContent, 'Unavailable');
  assert.equal(ui.get('coverage-summary').textContent, 'Session count unavailable');
  assert.match(ui.get('scope-label').textContent, /Entire OpenClaw installation/);
  assert.equal(cells(ui.get('daily-table-body').children.at(-1)).at(-1), 'Unavailable');
  assert.match(ui.get('chart-calls').textContent, /unavailable/);
  const scoped = collectorSnapshot(); scoped.coverage.sessions = null;
  assert.throws(() => ui.validateSnapshot(scoped), /invalid-snapshot/);
});

test('active agents distinguish idle, stale and unavailable, polling visible tabs without overlap', async () => {
  const ui = frontend({ boot: true }); await ui.loaded; await ui.activeLoaded;
  assert.equal(ui.get('active-agents-status').textContent, 'Idle · no agents running');
  const tick = ui.intervals.find(row => row.delay === 15000).fn;
  ui.setActive({ observedAt: now.toISOString(), status: 'ok', agents: [{ id: 'dev-ui', name: 'UI Engineer' }] });
  await ui.loadActiveAgents();
  assert.equal(ui.get('active-agents-list').children[0].textContent, 'UI Engineer');
  ui.document.hidden = true; tick();
  assert.equal(ui.activeRequests.length, 2);
  ui.document.hidden = false;
  let release;
  ui.setActiveWait(new Promise(resolve => { release = resolve; }));
  const pending = ui.loadActiveAgents(); tick();
  assert.equal(ui.activeRequests.length, 3);
  release(); await pending;
  ui.setActiveWait(null);
  ui.setActive({ observedAt: new Date(now.getTime() - 31000).toISOString(), status: 'ok', agents: [{ id: 'main', name: 'Main' }] });
  await ui.loadActiveAgents();
  assert.match(ui.get('active-agents-status').textContent, /stale/);
  assert.equal(ui.get('active-agents-list').children.length, 0);
  ui.setActiveStatus(404); await ui.loadActiveAgents();
  assert.match(ui.get('active-agents-status').textContent, /stale.*unavailable/);
  const old = frontend({ boot: true }); old.setActiveStatus(404); await old.loaded; await old.activeLoaded;
  old.intervals.find(row => row.delay === 15000).fn(); await Promise.resolve(); await Promise.resolve();
  assert.match(old.get('active-agents-status').textContent, /unknown.*unavailable/);
});
test('all-conversations mode labels partial retention and withholds activity while preserving token totals', async () => {
  const data = collectorSnapshot();
  data.scopeMode = 'all-conversations'; data.scopeLabel = 'Legacy selected root';
  data.requests = []; data.tasks = null; data.skills = []; data.skillDaily = null; data.agentRunDaily = null;
  data.coverage.usageCharts = { skills: 'unavailable', agents: 'unavailable' };
  const ui = frontend({ boot: true, path: '/usage/activity', payload: data }); await ui.loaded;
  assert.match(ui.get('scope-label').textContent, /All conversations with main.*retained partial history/);
  assert.doesNotMatch(ui.get('scope-label').textContent, /Legacy selected root|Project-only/);
  assert.match(allText(ui.get('tasks-list')), /aggregates only.*withheld/);
  assert.equal(ui.get('metric-tokens').textContent, '170');
  assert.equal(ui.get('metric-skills').textContent, '—');
  const legacy = collectorSnapshot(); delete legacy.scopeMode;
  const scoped = frontend({ boot: true, payload: legacy }); await scoped.loaded;
  assert.match(scoped.get('scope-label').textContent, /Project-only/);
});
