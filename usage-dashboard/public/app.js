(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TZ = 'Europe/Zurich';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DAY_MS = 86400000;
  const categories = [
    ['input', 'New input', 'category-input'],
    ['output', 'Output', 'category-output'],
    ['cacheRead', 'Cache read', 'category-read'],
    ['cacheWrite', 'Cache write', 'category-write']
  ];
  const numericKeys = ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'];
  const numberFormat = new Intl.NumberFormat('en-GB');
  const compactFormat = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
  const percentFormat = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1 });
  const currencyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
  const dateKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fullDateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const longDayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const historyDateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });
  const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const state = {
    data: null, period: 7, model: '', measure: 'tokens', historyLimit: 20,
    skillsExpanded: false, selectedDay: -1, days: [], models: [], pending: false,
    stale: false, today: '', controller: null, page: 'overview'
  };

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  }

  function svgElement(tag, attributes, content) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (content !== undefined) node.textContent = String(content);
    return node;
  }

  function setText(id, value) { $(id).textContent = String(value); }
  function announce(message) { setText('announcer', message); }
  function count(value) { return numberFormat.format(value); }
  function compact(value) { return compactFormat.format(value); }
  function dateKey(value) {
    const parts = dateKeyFormat.formatToParts(new Date(value));
    const get = (type) => parts.find((part) => part.type === type).value;
    return get('year') + '-' + get('month') + '-' + get('day');
  }
  function shiftDay(day, offset) { return new Date(Date.parse(day + 'T00:00:00Z') + offset * DAY_MS).toISOString().slice(0, 10); }
  function formatDay(day, long = false) { return (long ? longDayFormat : dayFormat).format(new Date(day + 'T12:00:00Z')); }
  function formatRange(start, end) { return start === end ? formatDay(start) : formatDay(start) + ' – ' + formatDay(end); }
  function currentRange() {
    const end = dateKey(Date.now());
    return { start: shiftDay(end, 1 - state.period), end };
  }
  function within(day, start, end) { return day >= start && day <= end; }
  function emptyTotals() { return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, requests: 0 }; }
  function addTotals(target, row) {
    for (const key of numericKeys) target[key] = target[key] === null || row[key] === null ? null : target[key] + row[key];
    target.requests = target.requests === null || row.requests === null ? null : target.requests + row.requests;
    return target;
  }
  function tokenLabel(value) { return value === null ? 'Unavailable' : count(value); }
  function compactTokenLabel(value) { return value === null ? '—' : compact(value); }
  function emptyState(title, description) {
    const node = element('div', 'empty-state');
    node.append(element('h3', '', title), element('p', '', description));
    return node;
  }
  function tableRow(values) {
    const row = element('tr');
    values.forEach((value) => row.append(element('td', '', value)));
    return row;
  }
  function tableMessage(body, columns, message) {
    const row = element('tr');
    const cell = element('td', '', message);
    cell.colSpan = columns;
    row.append(cell);
    body.replaceChildren(row);
  }

  // Reject incompatible or malformed snapshots instead of silently replacing missing metrics with zero.
  function validateSnapshot(data) {
    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const isString = (value) => typeof value === 'string';
    const isNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    const isInstant = (value) => isString(value) && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
    const isDay = (value) => isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
    const assert = (condition) => { if (!condition) throw new Error('invalid-snapshot'); };
    assert(isObject(data) && data.schemaVersion === 1 && isInstant(data.generatedAt));
    assert(isString(data.scopeLabel) && isObject(data.range));
    assert(isDay(data.range.start) && isDay(data.range.end) && data.range.start <= data.range.end && data.range.timeZone === TZ);
    assert(Array.isArray(data.daily) && Array.isArray(data.skills) && Array.isArray(data.requests));
    assert(isObject(data.coverage) && (isNumber(data.coverage.sessions) || data.scopeMode === 'installation' && data.coverage.sessions === null) && Array.isArray(data.coverage.notes));
    for (const key of ['agents', 'agentDaily', 'skillCatalog', 'tasks', 'skillDaily', 'agentRunDaily']) assert(data[key] == null || Array.isArray(data[key]));
    for (const row of data.agents ?? []) assert(isObject(row) && isString(row.id) && isString(row.name) && isNumber(row.scopedSessions));
    for (const row of data.skillCatalog ?? []) assert(isObject(row) && isString(row.id) && isString(row.name) && (row.description == null || isString(row.description)));
    for (const row of data.tasks ?? []) assert(isObject(row) && isString(row.id) && isString(row.title) && isInstant(row.observedAt));
    assert(data.coverage.notes.every(isString) && isString(data.coverage.skillMetric) && isString(data.coverage.historyMetric));
    data.daily.forEach((row) => {
      assert(isObject(row) && isDay(row.date) && isString(row.model) && isString(row.provider));
      assert(categories.every(([key]) => row[key] === null || isNumber(row[key])) && isNumber(row.totalTokens) && (isNumber(row.requests) || data.scopeMode === 'installation' && row.requests === null));
      assert(row.costUsd === null || isNumber(row.costUsd));
    });
    for (const key of ['skillDaily', 'agentRunDaily']) for (const row of data[key] ?? []) {
      assert(isObject(row) && isDay(row.date) && Number.isSafeInteger(row.count) && row.count >= 0 && isString(row[key === 'skillDaily' ? 'name' : 'agentId']));
    }
    data.skills.forEach((row) => {
      assert(isObject(row) && isString(row.name) && isString(row.description) && isNumber(row.count));
      assert(row.lastUsedAt == null || isInstant(row.lastUsedAt));
    });
    data.requests.forEach((row) => {
      assert(isObject(row) && isString(row.id) && isInstant(row.at) && isString(row.model));
      assert(isString(row.description) && isString(row.status) && numericKeys.every((key) => row[key] === null || isNumber(row[key])));
    });
    return data;
  }

  async function api() {
    const controller = new AbortController();
    state.controller = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/usage/api/usage', {
        credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      const payload = response.ok ? await response.json() : null;
      return { ok: response.ok, status: response.status, payload };
    } finally {
      window.clearTimeout(timeout);
      if (state.controller === controller) state.controller = null;
    }
  }

  let activePending = false;
  let activeObservedAt = null;
  async function loadActiveAgents() {
    if (document.hidden || activePending) return;
    if (activeObservedAt && Date.now() - activeObservedAt >= 30000) {
      $('active-agents-list').replaceChildren();
      setText('active-agents-status', 'Status stale · checking…');
    }
    activePending = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/usage/api/active-agents', {
        credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      const observed = Date.parse(data?.observedAt);
      if (data?.status !== 'ok' || !Number.isFinite(observed) || observed > Date.now() + 60000 ||
          !Array.isArray(data.agents) || !data.agents.every((agent) => typeof agent?.id === 'string' && typeof agent.name === 'string')) throw new Error('unavailable');
      if (Date.now() - observed >= 30000) {
        activeObservedAt = observed;
        $('active-agents-list').replaceChildren();
        setText('active-agents-status', 'Status stale · checking…');
        return;
      }
      activeObservedAt = observed;
      $('active-agents-list').replaceChildren(...data.agents.map((agent) => element('li', '', agent.name)));
      setText('active-agents-status', data.agents.length ? count(data.agents.length) + ' active' : 'Idle · no agents running');
    } catch {
      $('active-agents-list').replaceChildren();
      setText('active-agents-status', activeObservedAt ? 'Status stale · unavailable' : 'Status unknown · unavailable');
    } finally {
      window.clearTimeout(timeout);
      activePending = false;
    }
  }

  function setBusy(busy, label = 'Refreshing…') {
    state.pending = busy;
    $('refresh-button').disabled = busy;
    $('retry-button').disabled = busy;
    $('app-shell').setAttribute('aria-busy', String(busy));
    $('refresh-button').querySelector('span').textContent = busy ? label : 'Refresh';
  }

  function showNotice(title, message, retry = true) {
    setText('notice-title', title);
    setText('notice-message', message);
    $('retry-button').hidden = !retry;
    $('notice').hidden = false;
  }

  function showShell() {
    $('initial-state').hidden = true;
    $('app-shell').hidden = false;
    document.querySelector('.skip-link').setAttribute('href', '#main');
  }

  function clearData() {
    state.data = null;
    state.requestRows = [];
    state.chartCoordinates = [];
    state.days = [];
    state.models = [];
    state.model = '';
    state.stale = false;
    state.selectedDay = -1;
    state.historyLimit = 20;
    state.skillsExpanded = false;
    $('history-search').value = '';
    for (const id of ['overview-skills-usage-chart', 'overview-agents-usage-chart', 'skills-usage-chart', 'agents-usage-chart', 'overview-skills-usage-table', 'overview-agents-usage-table', 'skills-usage-table', 'agents-usage-table', 'model-chart', 'skills-list', 'history-table-body', 'daily-table-body', 'model-table-body', 'coverage-notes', 'token-breakdown', 'timeline-chart']) $(id).replaceChildren();
    for (const id of ['metric-tokens', 'metric-calls', 'metric-model', 'metric-skills', 'metric-tokens-note', 'metric-calls-note', 'metric-model-note', 'metric-skills-note', 'coverage-summary', 'coverage-generated', 'coverage-range', 'coverage-scope', 'chart-date', 'chart-value', 'chart-calls']) {
      setText(id, '—');
      $(id).removeAttribute('title');
    }
    setText('scope-label', 'Your AI activity, in perspective.');
    setText('timeline-subtitle', 'Daily activity in your selected period');
    $('timeline-chart').setAttribute('aria-valuetext', 'No snapshot loaded');
    setText('skills-subtitle', 'Whole snapshot window');
    setText('history-metric', 'Metadata-inferred agent activity, not prompt history.');
    setText('skill-metric', 'Skill attribution is explained in the snapshot coverage.');
    setText('history-count', '— entries');
    setText('history-showing', '');
    setText('freshness-text', 'No snapshot loaded');
    $('freshness').removeAttribute('title');
    $('model-filter').replaceChildren(new Option('All models', ''));
    $('notice').hidden = true;
    $('history-more').hidden = true;
    $('skills-more').hidden = true;
    document.querySelectorAll('details[open]').forEach((detail) => { detail.open = false; });
  }

  function renderUnavailable() {
    $('timeline-content').hidden = true;
    $('timeline-empty').hidden = false;
    $('timeline-empty').querySelector('h3').textContent = 'Usage is unavailable';
    $('timeline-empty').querySelector('p').textContent = 'Refresh to try loading your snapshot again.';
    $('model-chart').replaceChildren(emptyState('No snapshot loaded', 'Model usage will appear when data is available.'));
    $('skills-list').replaceChildren(emptyState('No snapshot loaded', 'Skill attribution will appear when data is available.'));
    for (const prefix of ['overview-', '']) for (const kind of ['skills', 'agents']) {
      $(prefix + kind + '-usage-chart').replaceChildren(emptyState('No snapshot loaded', 'Usage evidence will appear after a successful refresh.'));
      tableMessage($(prefix + kind + '-usage-table'), 2, 'No snapshot loaded.');
      setText(prefix + kind + '-usage-note', 'Usage evidence unavailable.');
    }
    $('agents-list').replaceChildren(emptyState('No snapshot loaded', 'The agent directory will appear when data is available.'));
    $('tasks-list').replaceChildren(emptyState('No snapshot loaded', 'Recorded work will appear when data is available.'));
    $('history-table-wrap').hidden = true;
    $('history-empty').hidden = false;
    setText('history-empty-title', 'No snapshot loaded');
    setText('history-empty-message', 'Activity will appear after a successful refresh.');
    setText('range-label', formatRange(currentRange().start, currentRange().end));
    tableMessage($('daily-table-body'), 7, 'No snapshot loaded.');
    tableMessage($('model-table-body'), 5, 'No snapshot loaded.');
  }

  async function loadUsage() {
    if (state.pending) return;
    setBusy(true);
    announce(state.data ? 'Refreshing your usage snapshot.' : 'Loading your usage snapshot.');
    try {
      const response = await api();
      if (!response.ok) throw new Error('usage-unavailable');
      const data = validateSnapshot(response.payload);
      state.data = data;
      state.stale = false;
      state.today = dateKey(Date.now());
      state.requestRows = data.requests.map((row) => ({ ...row, day: dateKey(row.at) })).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      $('notice').hidden = true;
      showShell();
      populateModels();
      renderSnapshot();
      renderRoute(false);
      announce('Usage snapshot loaded. ' + count(data.daily.length) + ' daily model records available.');
    } catch (error) {
      showShell();
      if (state.data) {
        state.stale = true;
        showNotice('Could not refresh', 'Showing the last successfully loaded snapshot, generated ' + fullDateFormat.format(new Date(state.data.generatedAt)) + ' Zurich time. Refresh to try again.');
        updateFreshness();
      } else {
        renderUnavailable();
        showNotice('Could not load your usage', error.message === 'invalid-snapshot' ? 'The server returned an unsupported or incomplete snapshot. No usage values have been substituted. Try again or check the dashboard service.' : 'The dashboard service did not respond with usable data. Check your connection and try again.');
      }
      announce(state.data ? 'Refresh failed. The previous snapshot is still displayed and marked stale.' : 'Usage could not be loaded. Try refreshing.');
    } finally {
      setBusy(false);
    }
  }

  function populateModels() {
    const models = [...new Set([...state.data.daily.map((row) => row.model), ...state.data.requests.map((row) => row.model)])].sort((a, b) => a.localeCompare(b));
    if (!models.includes(state.model)) state.model = '';
    const fragment = document.createDocumentFragment();
    fragment.append(new Option('All models', ''));
    models.forEach((model) => fragment.append(new Option(model || 'Unspecified model', model)));
    $('model-filter').replaceChildren(fragment);
    $('model-filter').value = state.model;
  }

  function updateFreshness() {
    if (!state.data) return;
    const generated = new Date(state.data.generatedAt);
    const age = Date.now() - generated.getTime();
    const minutes = Math.floor(Math.max(0, age) / 60000);
    let label;
    if (age < -60000) label = 'Snapshot timestamp is ahead of this device';
    else if (minutes < 1) label = 'Snapshot generated just now';
    else if (minutes < 60) label = 'Snapshot generated ' + minutes + ' min ago';
    else if (minutes < 1440) label = 'Snapshot generated ' + Math.floor(minutes / 60) + ' h ago';
    else label = 'Snapshot generated ' + Math.floor(minutes / 1440) + ' d ago';
    if (state.stale) label += ' · refresh failed';
    else if (minutes >= 15) label += ' · may be stale';
    setText('freshness-text', label);
    $('freshness').classList.toggle('is-stale', state.stale || minutes >= 15 || age < -60000);
    $('freshness').title = 'Generated ' + fullDateFormat.format(generated) + ' (Europe/Zurich). Checks every minute while visible; collection runs every five minutes after the previous collection finishes. Recorded usage may lag completed model responses; this is not a live token stream.';
  }

  function renderSnapshot() {
    const data = state.data;
    const scope = data.scopeMode === 'installation' ? data.scopeLabel : data.scopeMode === 'all-conversations' ? 'All conversations with main · delegated specialists · retained partial history' : 'Project-only · ' + (data.scopeLabel || 'selected conversation and tasks');
    setText('scope-label', scope);
    setText('coverage-scope', scope);
    setText('coverage-generated', fullDateFormat.format(new Date(data.generatedAt)) + ' (Europe/Zurich)');
    setText('coverage-range', data.range.start + ' to ' + data.range.end + ' (Europe/Zurich)');
    setText('coverage-summary', data.coverage.sessions === null ? 'Session count unavailable' : count(data.coverage.sessions) + ' sessions in snapshot');
    $('coverage-notes').replaceChildren(...data.coverage.notes.map((note) => element('li', '', note)));
    setText('skill-metric', (data.coverage.skillMetric || 'No skill attribution details were supplied.') + ' Counts cover the whole snapshot and do not change with date or model filters.');
    setText('history-metric', data.coverage.historyMetric || 'Metadata-inferred agent activity, not user prompts or individual provider calls.');
    setText('skills-subtitle', 'Whole snapshot: ' + data.range.start + ' to ' + data.range.end);
    const detailCoverage = data.coverage.details;
    setText('agents-coverage', detailCoverage ? 'Directory coverage: ' + detailCoverage.agents + '. Accounting uses only admitted conversations; no evidence is not zero use.' : 'Configured agent coverage unavailable in this snapshot.');
    setText('skills-coverage', detailCoverage ? 'Skill directory coverage: ' + detailCoverage.skills + '. Counts are observed instruction reads only.' : 'Skill catalog coverage unavailable in this snapshot.');
    setText('activity-coverage', detailCoverage ? 'Task coverage: ' + detailCoverage.tasks + '. ' + detailCoverage.taskMetric + ' ' + detailCoverage.toolStepMetric : 'Task detail coverage unavailable; run history is inferred from metadata.');
    renderFiltered();
    updateFreshness();
  }

  function renderFiltered() {
    if (!state.data) return;
    const data = state.data;
    const range = currentRange();
    const start = range.start > data.range.start ? range.start : data.range.start;
    const end = range.end < data.range.end ? range.end : data.range.end;
    const covered = start <= end;
    const rows = data.daily.filter((row) => covered && within(row.date, start, end) && (!state.model || row.model === state.model));
    const totals = rows.reduce(addTotals, emptyTotals());
    const modelMap = new Map();
    rows.forEach((row) => {
      if (!modelMap.has(row.model)) modelMap.set(row.model, { ...emptyTotals(), model: row.model, providers: new Set(), cost: 0, missingCost: false });
      const model = modelMap.get(row.model);
      addTotals(model, row);
      model.providers.add(row.provider);
      if (row.costUsd === null) model.missingCost = true;
      else model.cost += row.costUsd;
    });
    state.models = [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens || a.model.localeCompare(b.model));
    const leader = state.models[0];
    const modelHref = pageUrl('models', { ...(state.period !== 7 ? { period: state.period } : {}), ...(state.model ? { filter: state.model } : {}) });
    $('metric-tokens-link').href = modelHref;
    $('metric-calls-link').href = modelHref;
    $('metric-model-link').href = leader && leader.totalTokens > 0 ? pageUrl('models', { model: leader.model, ...(state.period !== 7 ? { period: state.period } : {}), ...(state.model ? { filter: state.model } : {}) }) : modelHref;
    $('metric-model-link').querySelector('.metric-action').textContent = leader && leader.totalTokens > 0 ? 'View model details →' : 'View models →';
    setText('metric-tokens', covered ? compact(totals.totalTokens) : '—');
    $('metric-tokens').title = covered ? count(totals.totalTokens) + ' total tokens' : 'Selected dates are outside snapshot coverage';
    setText('metric-tokens-note', covered ? count(totals.totalTokens) + ' recorded tokens' : 'Outside snapshot coverage');
    setText('metric-calls', covered && totals.requests !== null ? compact(totals.requests) : '—');
    $('metric-calls').title = !covered ? 'Selected dates are outside snapshot coverage' : totals.requests === null ? 'Model entries unavailable from installation aggregates' : count(totals.requests) + ' recorded model entries';
    setText('metric-calls-note', !covered ? 'Outside snapshot coverage' : totals.requests === null ? 'Unavailable from aggregate-only source' : 'Not verified provider HTTP calls');
    setText('metric-model', data.scopeMode === 'installation' ? 'Unavailable' : leader && leader.totalTokens > 0 ? leader.model || 'Unspecified model' : covered ? 'No usage' : 'Unavailable');
    setText('metric-model-note', data.scopeMode === 'installation' ? 'Model attribution unavailable' : leader && totals.totalTokens > 0 ? percentFormat.format(leader.totalTokens / totals.totalTokens) + ' of selected tokens' : covered ? 'No recorded tokens in this view' : 'Outside snapshot coverage');
    const skillView = observationView('skills');
    const skillCount = skillView.entries.reduce((sum, skill) => sum + skill.count, 0);
    $('metric-skills-link').href = pageUrl('skills');
    setText('metric-skills', skillCount ? compact(skillCount) : '—');
    $('metric-skills').title = skillCount ? count(skillCount) + ' observed instruction reads · ' + skillView.label : 'No named reads observed; not proof of zero use';
    setText('metric-skills-note', skillCount ? count(skillView.entries.length) + ' named skills · ' + (skillView.legacy ? 'whole snapshot' : 'selected dates') : 'No named reads available');
    let rangeLabel = formatRange(range.start, range.end) + ', ' + range.end.slice(0, 4);
    if (!covered) rangeLabel += ' · outside snapshot';
    else if (start !== range.start || end !== range.end) rangeLabel += ' · partial coverage';
    setText('range-label', rangeLabel);
    setText('timeline-subtitle', covered ? 'Recorded tokens · ' + formatRange(start, end) + (state.model ? ' · selected model' : ' · all models') : 'Selected dates fall outside this snapshot');
    setText('breakdown-note', 'Total tokens come directly from usage records; categories are not added to that total. A dash means the selected bucket is unavailable, not zero.');
    $('token-breakdown').replaceChildren(...categories.map(([key, label, className]) => {
      const item = element('div', 'breakdown-item');
      const heading = element('span', 'breakdown-label');
      const swatch = element('span', 'breakdown-swatch ' + className);
      swatch.setAttribute('aria-hidden', 'true');
      heading.append(swatch, document.createTextNode(label));
      const value = element('strong', 'breakdown-value', covered ? compactTokenLabel(totals[key]) : '—');
      value.title = covered ? totals[key] === null ? 'Unavailable: at least one selected record has no ' + label.toLowerCase() + ' bucket' : count(totals[key]) + ' tokens' : 'Outside snapshot coverage';
      item.append(heading, value);
      return item;
    }));
    const bins = new Map();
    if (covered) {
      for (let day = start; day <= end; day = shiftDay(day, 1)) bins.set(day, { date: day, ...emptyTotals() });
      rows.forEach((row) => addTotals(bins.get(row.date), row));
    }
    state.days = [...bins.values()];
    state.selectedDay = state.days.length - 1;
    renderTimeline();
    renderModels();
    renderHistory();
    renderUsageCharts();
    renderSkills();
    renderAgents();
    renderDetails();
  }

  function renderTimeline() {
    const days = state.days;
    const hasActivity = days.some((day) => day.totalTokens > 0 || day.requests > 0);
    $('timeline-content').hidden = !hasActivity;
    $('timeline-empty').hidden = hasActivity;
    if (!hasActivity) {
      $('timeline-empty').querySelector('h3').textContent = days.length ? 'No recorded usage in this view' : 'Outside snapshot coverage';
      $('timeline-empty').querySelector('p').textContent = days.length ? 'Choose another time range or model. The daily table includes covered days with zero recorded usage.' : 'Refresh for a newer snapshot, or choose a time range that overlaps the snapshot window.';
    }
    const chart = $('timeline-chart');
    chart.replaceChildren();
    if (days.length) {
      const max = Math.max(1, ...days.map((day) => day.totalTokens));
      const magnitude = 10 ** Math.floor(Math.log10(max));
      const ceiling = Math.ceil(max / magnitude) * magnitude;
      const width = Math.max(220, Math.round(chart.getBoundingClientRect().width));
      const left = 50;
      const right = width - 14;
      state.chartLayout = { width, left, plotWidth: right - left };
      chart.setAttribute('viewBox', '0 0 ' + width + ' 256');
      const x = (index) => days.length === 1 ? (left + right) / 2 : left + index * (right - left) / (days.length - 1);
      const y = (value) => 207 - (value / ceiling) * 182;
      for (let tick = 0; tick <= 4; tick++) {
        const value = ceiling * tick / 4;
        chart.append(svgElement('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: 'grid-line' }));
        chart.append(svgElement('text', { x: left - 10, y: y(value) + 4, 'text-anchor': 'end', class: 'axis-label' }, compact(value)));
      }
      const points = days.map((day, index) => x(index) + ',' + y(day.totalTokens));
      if (days.length > 1) {
        chart.append(svgElement('path', { d: 'M' + x(0) + ',207 L' + points.join(' L') + ' L' + x(days.length - 1) + ',207 Z', class: 'area-fill' }));
        chart.append(svgElement('path', { d: 'M' + points.join(' L'), class: 'trend-line' }));
      }
      const step = Math.max(1, Math.ceil((days.length - 1) / (width < 440 ? 2 : 4)));
      days.forEach((day, index) => {
        if (days.length <= 7) chart.append(svgElement('circle', { cx: x(index), cy: y(day.totalTokens), r: 3.5, class: 'chart-point' }));
        if (index === 0 || index === days.length - 1 || (index % step === 0 && index < days.length - 2)) {
          chart.append(svgElement('text', { x: x(index), y: 241, 'text-anchor': index === 0 ? 'start' : index === days.length - 1 ? 'end' : 'middle', class: 'axis-label' }, formatDay(day.date)));
        }
      });
      chart.append(svgElement('line', { id: 'chart-guide', x1: 0, x2: 0, y1: 20, y2: 207, class: 'selected-guide' }));
      chart.append(svgElement('circle', { id: 'chart-halo', cx: 0, cy: 0, r: 10, class: 'selected-halo' }));
      chart.append(svgElement('circle', { id: 'chart-selection', cx: 0, cy: 0, r: 5.5, class: 'selected-point' }));
      chart.setAttribute('aria-valuemax', String(days.length - 1));
      state.chartCoordinates = days.map((day, index) => ({ x: x(index), y: y(day.totalTokens) }));
      selectDay(state.selectedDay, false);
    }
    if (!days.length) tableMessage($('daily-table-body'), 7, 'Selected dates are outside snapshot coverage.');
    else $('daily-table-body').replaceChildren(...days.map((day) => tableRow([day.date, ...numericKeys.map((key) => tokenLabel(day[key])), day.requests === null ? 'Unavailable' : count(day.requests)])));
  }

  function selectDay(index, shouldAnnounce = false) {
    if (!state.days.length) return;
    state.selectedDay = Math.min(state.days.length - 1, Math.max(0, index));
    const day = state.days[state.selectedDay];
    const coordinates = state.chartCoordinates[state.selectedDay];
    const phrase = formatDay(day.date, true) + ': ' + count(day.totalTokens) + ' tokens, ' + (day.requests === null ? 'model entries unavailable' : count(day.requests) + ' recorded model entries');
    $('timeline-chart').setAttribute('aria-valuenow', String(state.selectedDay));
    $('timeline-chart').setAttribute('aria-valuetext', phrase);
    for (const id of ['chart-halo', 'chart-selection']) {
      $(id).setAttribute('cx', coordinates.x);
      $(id).setAttribute('cy', coordinates.y);
    }
    $('chart-guide').setAttribute('x1', coordinates.x);
    $('chart-guide').setAttribute('x2', coordinates.x);
    setText('chart-date', formatDay(day.date, true));
    setText('chart-value', count(day.totalTokens) + ' tokens');
    setText('chart-calls', day.requests === null ? 'Model entries unavailable' : count(day.requests) + ' model entries');
    $('chart-previous').disabled = state.selectedDay === 0;
    $('chart-next').disabled = state.selectedDay === state.days.length - 1;
    if (shouldAnnounce) announce(phrase);
  }

  function renderModels() {
    const key = state.measure === 'tokens' ? 'totalTokens' : 'requests';
    const unit = state.measure === 'tokens' ? 'tokens' : 'model entries';
    const models = [...state.models].sort((a, b) => b[key] - a[key] || a.model.localeCompare(b.model));
    const total = models.reduce((sum, row) => sum + row[key], 0);
    const top = models.length ? models[0][key] : 0;
    const list = $('model-chart');
    list.replaceChildren();
    setText('models-subtitle', 'Share of selected ' + (state.measure === 'tokens' ? 'tokens' : 'recorded model entries'));
    if (!models.length || !total) list.append(emptyState('No recorded ' + unit, 'Choose another model or time range to compare usage.'));
    else models.slice(0, 6).forEach((model, index) => {
      const name = model.model || 'Unspecified model';
      const button = element('a', 'model-row');
      button.href = pageUrl('models', { model: model.model });
      button.setAttribute('aria-label', name + ': ' + count(model[key]) + ' ' + unit + ', ' + percentFormat.format(model[key] / total) + '. View usage details.');
      const heading = element('span', 'model-row-top');
      heading.append(element('span', 'model-name', name), element('span', 'model-percent', percentFormat.format(model[key] / total)));
      const bar = svgElement('svg', { class: 'model-bar', viewBox: '0 0 300 6', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      bar.append(svgElement('rect', { x: 0, y: 0, width: 300, height: 6, rx: 3, class: 'bar-track' }));
      bar.append(svgElement('rect', { x: 0, y: 0, width: top ? 300 * model[key] / top : 0, height: 6, rx: 3, class: 'series-' + index }));
      const footer = element('span', 'model-row-bottom');
      footer.append(element('span', 'model-provider', [...model.providers].join(', ') || 'Provider unspecified'), element('span', 'model-amount', compact(model[key]) + ' ' + unit));
      button.append(heading, bar, footer);
      list.append(button);
    });
    setText('models-note', models.length > 6 ? 'Top 6 shown; the table includes all ' + count(models.length) + ' models. Select a model for details.' : state.model ? 'Showing one model. Choose All models above to compare again.' : 'Select a model for details. Bars scale to the leading model.');
    if (!models.length) tableMessage($('model-table-body'), 5, 'No recorded model usage in this view.');
    else $('model-table-body').replaceChildren(...models.map((model) => {
      const row = tableRow([model.model || 'Unspecified model', [...model.providers].join(', ') || 'Unspecified', count(model.totalTokens), model.requests === null ? 'Unavailable' : count(model.requests),
        model.missingCost ? (model.cost > 0 ? currencyFormat.format(model.cost) + ' known (incomplete)' : 'Unavailable') : currencyFormat.format(model.cost)]);
      const link = element('a', 'text-link', model.model || 'Unspecified model');
      link.href = pageUrl('models', { model: model.model });
      row.children[0].replaceChildren(link);
      return row;
    }));
  }

  function observationView(kind) {
    const skills = kind === 'skills';
    const daily = skills ? state.data.skillDaily : state.data.agentRunDaily;
    const legacy = skills && !Object.hasOwn(state.data, 'skillDaily') && state.data.skills.length > 0;
    const range = currentRange();
    const rows = daily == null ? (legacy ? state.data.skills : []) : daily.filter((row) =>
      within(row.date, range.start, range.end) && within(row.date, state.data.range.start, state.data.range.end));
    const grouped = new Map();
    rows.forEach((row) => { const id = skills ? row.name : row.agentId; grouped.set(id, (grouped.get(id) ?? 0) + row.count); });
    const entries = [...grouped].map(([id, value]) => ({ id, count: value })).filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
    const coverage = state.data.coverage.usageCharts?.[kind] ?? 'unavailable';
    return { entries, rows, legacy, available: daily != null || legacy, coverage,
      label: legacy ? 'Whole snapshot · date attribution unavailable' : 'Selected dates · ' + formatRange(range.start, range.end) };
  }
  function observationHref(kind, id) {
    return pageUrl(kind, { [kind === 'skills' ? 'skill' : 'agent']: kind === 'skills'
      ? state.data.skillCatalog?.find((row) => row.name === id)?.id || id : id });
  }
  function observationName(kind, id) { return kind === 'agents' ? state.data.agents?.find((row) => row.id === id)?.name || id : id; }
  function renderUsageCharts() {
    for (const kind of ['skills', 'agents']) {
      const view = observationView(kind);
      const unit = kind === 'skills' ? 'instruction reads' : 'observed runs';
      const explanation = kind === 'skills'
        ? 'Successful named instruction-read observations across selected scoped sessions, not completed workflows. Since observer installation only; key-scoped and best-effort, with no historical backfill.'
        : 'Distinct exact-instance runs with agent lifecycle evidence, dated by their latest retained audit observation (Zurich). Tool-only groups are excluded. Retained evidence, not all-time totals; aggregates precede the recent 100-row cap.';
      const note = view.label + '. ' + explanation + ' Model filters do not apply.' +
        (view.coverage === 'partial' ? ' Partial evidence: counts are known lower bounds.' : ' Observation coverage is not a completeness guarantee.');
      for (const prefix of ['overview-', '']) {
        const target = $(prefix + kind + '-usage-chart');
        target.replaceChildren();
        setText(prefix + kind + '-usage-note', note);
        const body = $(prefix + kind + '-usage-table');
        if (!view.entries.length) {
          const title = !view.available ? 'Usage evidence unavailable' : 'No observations in this view';
          target.append(emptyState(title, 'Missing observations do not establish zero use. Choose another date range or refresh.'));
          tableMessage(body, 2, title + '; no zero-use claim.');
          continue;
        }
        const top = view.entries[0].count;
        view.entries.slice(0, 8).forEach((row, index) => {
          const link = element('a', 'model-row'); link.href = observationHref(kind, row.id);
          link.setAttribute('aria-label', observationName(kind, row.id) + ': ' + count(row.count) + ' ' + unit + '. View details.');
          const heading = element('span', 'model-row-top');
          heading.append(element('span', 'model-name', observationName(kind, row.id)), element('span', 'model-amount', count(row.count)));
          const bar = svgElement('svg', { class: 'model-bar', viewBox: '0 0 300 6', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
          bar.append(svgElement('rect', { x: 0, y: 0, width: 300, height: 6, rx: 3, class: 'bar-track' }),
            svgElement('rect', { x: 0, y: 0, width: 300 * row.count / top, height: 6, rx: 3, class: 'series-' + index % 6 }));
          link.append(heading, bar); target.append(link);
        });
        body.replaceChildren(...view.entries.map((row) => {
          const line = tableRow(['', count(row.count)]);
          const link = element('a', 'text-link', observationName(kind, row.id)); link.href = observationHref(kind, row.id);
          line.children[0].append(link); return line;
        }));
      }
    }
  }

  function renderSkills() {
    if (!state.data) return;
    const catalog = state.data.skillCatalog;
    const view = observationView('skills');
    const observed = new Map(view.entries.map((row) => [row.id, row.count]));
    const rows = [...(catalog ?? []), ...state.data.skills.filter((skill) => !catalog?.some((row) => row.name === skill.name))
      .map((skill) => ({ ...skill, id: skill.name, lastObservedAt: skill.lastUsedAt, description: null }))]
      .map((row) => ({ ...row, observedReads: observed.get(row.name) ?? (state.data.skillDaily == null ? row.observedReads ?? null : null) }));
    const query = $('skills-search').value.trim().toLocaleLowerCase();
    $('skills-clear-search').hidden = !query;
    const skills = rows.filter((row) => !query || (row.name + ' ' + (row.description ?? '')).toLocaleLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
    const visible = state.skillsExpanded || query ? skills : skills.slice(0, 12);
    $('skills-list').replaceChildren(...visible.map((skill) => {
      const link = element('a', 'skill-row entity-link');
      link.href = pageUrl('skills', { skill: skill.id });
      const body = element('span');
      body.append(element('strong', 'skill-name', skill.name), element('span', 'skill-description', skill.description || 'Public description unavailable'));
      link.append(body, element('span', 'skill-count', skill.observedReads == null ? 'Reads unavailable' : count(skill.observedReads) + ' reads'));
      return link;
    }));
    if (!skills.length) $('skills-list').replaceChildren(emptyState(query ? 'No matching skills' : 'Skill directory unavailable',
      query ? 'Try another name or description, or clear the search.' : catalog == null ? 'This snapshot has no public skill directory.' : 'No published skills in this snapshot.'));
    $('skills-more').hidden = !!query || skills.length <= 12;
    $('skills-more').textContent = state.skillsExpanded ? 'Show fewer skills' : 'Show all ' + count(skills.length) + ' skills';
    $('skills-more').setAttribute('aria-expanded', String(state.skillsExpanded));
    setText('skills-subtitle', catalog == null ? 'Named instruction reads only · directory unavailable' : 'Main agent skill directory · public descriptions');
    setText('skill-metric', view.label + '. Counts across selected scoped sessions, not completed workflows. Model filters do not apply. Missing observations are unknown, not zero.');
  }

  function renderAgents() {
    if (!state.data) return;
    const agents = state.data.agents;
    if (agents == null) return $('agents-list').replaceChildren(emptyState('Directory unavailable', 'This snapshot has no configured agent directory. Refresh when metadata is available.'));
    if (!agents.length) return $('agents-list').replaceChildren(emptyState('No agents published', 'No configured agents were included in this public directory.'));
    $('agents-list').replaceChildren(...agents.map((agent) => {
      const link = element('a', 'directory-row entity-link'); link.href = pageUrl('agents', { agent: agent.id });
      link.append(element('strong', '', agent.name), element('span', '', agent.role || 'Role unavailable'),
        element('small', '', agent.usageState === 'observed' ? count(agent.scopedSessions) + ' scoped sessions' : 'No scoped usage claim'));
      return link;
    }));
  }

  function taskMoment(task) {
    const ongoing = ['running', 'queued'].includes(task.status) && !task.endedAt;
    const lastRunAt = (state.data?.requests ?? []).filter((row) => row.taskId === task.id)
      .reduce((latest, row) => !latest || Date.parse(row.at) > Date.parse(latest) ? row.at : latest, null);
    return { ongoing, at: ongoing ? task.observedAt : task.endedAt || task.startedAt || lastRunAt,
      label: ongoing ? (task.status === 'queued' ? 'Queued at snapshot · since ' : 'Running at snapshot · since ') + (task.startedAt ? fullDateFormat.format(new Date(task.startedAt)) + ' Zurich' : 'start unavailable') :
        task.endedAt ? 'Ended ' + fullDateFormat.format(new Date(task.endedAt)) + ' Zurich' :
          task.startedAt ? 'Started ' + fullDateFormat.format(new Date(task.startedAt)) + ' Zurich' :
            lastRunAt ? 'Latest recorded run ' + fullDateFormat.format(new Date(lastRunAt)) + ' Zurich' : 'Work date unavailable' };
  }
  function renderTasks(query) {
    const tasks = state.data.tasks;
    $('undated-task-note').hidden = true;
    if (tasks == null) { state.taskCount = 0; $('tasks-list').replaceChildren(emptyState('Task details unavailable', state.data.scopeMode === 'all-conversations' ? 'All-conversations mode publishes token, cost, model and agent aggregates only. Conversation and activity details are withheld.' : 'This snapshot contains inferred run activity only.')); return; }
    const range = currentRange();
    const undated = tasks.filter((task) => !taskMoment(task).at).length;
    if (undated) {
      setText('undated-task-note', count(undated) + ' task ' + (undated === 1 ? 'record has' : 'records have') + ' no known work date and ' + (undated === 1 ? 'is' : 'are') + ' excluded from this date-filtered list.');
      $('undated-task-note').hidden = false;
    }
    const matches = tasks.filter((task) => {
      const moment = taskMoment(task);
      const inTime = moment.ongoing ? dateKey(task.startedAt || task.observedAt) <= range.end && dateKey(task.observedAt) >= range.start :
        !!moment.at && within(dateKey(moment.at), range.start, range.end);
      return inTime && (!query || (task.title + ' ' + (task.summary || '') + ' ' + task.agentId).toLocaleLowerCase().includes(query));
    }).sort((a, b) => Date.parse(taskMoment(b).at) - Date.parse(taskMoment(a).at) || a.id.localeCompare(b.id));
    state.taskCount = matches.length;
    $('tasks-list').replaceChildren(...matches.map((task) => {
      const link = element('a', 'directory-row entity-link'); link.href = pageUrl('activity', { task: task.id });
      const agent = state.data.agents?.find((item) => item.id === task.agentId);
      link.append(element('strong', '', task.title), element('span', '', task.summary || 'Public summary unavailable'),
        element('small', '', (agent?.name || task.agentId) + ' · ' + task.status + ' · ' + taskMoment(task).label));
      return link;
    }));
    if (!matches.length) $('tasks-list').replaceChildren(emptyState(query ? 'No matching work' : 'No recorded tasks in this view', query ? 'Change or clear your search.' : 'Try another date range; coverage may be incomplete.'));
  }

  function renderHistory() {
    if (!state.data) return;
    const range = currentRange();
    const query = $('history-search').value.trim().toLocaleLowerCase();
    $('activity-clear-search').hidden = !query;
    const rows = state.requestRows.filter((row) => within(row.day, range.start, range.end) && within(row.day, state.data.range.start, state.data.range.end) && (!query || (row.description + ' ' + row.model).toLocaleLowerCase().includes(query)));
    const visible = rows.slice(0, state.historyLimit);
    renderTasks(query);
    setText('history-count', count(rows.length) + (rows.length === 1 ? ' run' : ' runs'));
    $('history-table-wrap').hidden = !rows.length;
    $('runs-heading').hidden = !rows.length;
    $('history-empty').hidden = rows.length > 0 || state.taskCount > 0;
    $('clear-search').hidden = !query;
    setText('history-empty-title', query ? 'No matching activity' : 'No activity in this view');
    setText('history-empty-message', query ? 'Try a different search, or clear it to see activity in the selected period.' : 'Try another time range. Available history depends on snapshot coverage.');
    const statusClass = (status) => {
      if (/^(ok|success|completed|complete|done)$/i.test(status)) return 'status-success';
      if (/^(error|failed|failure|aborted)$/i.test(status)) return 'status-error';
      if (/^(pending|running|queued|in_progress)$/i.test(status)) return 'status-pending';
      return '';
    };
    $('history-table-body').replaceChildren(...visible.map((request) => {
      const row = element('tr');
      const when = element('td');
      const date = element('time', 'request-date', historyDateFormat.format(new Date(request.at)));
      date.dateTime = request.at;
      date.title = fullDateFormat.format(new Date(request.at)) + ' (Europe/Zurich)';
      when.append(date, element('span', 'request-time', timeFormat.format(new Date(request.at))));
      const description = element('td', 'request-description');
      const activityLink = element('a', 'text-link', request.description || 'Inferred activity');
      activityLink.href = pageUrl('activity', { run: request.id });
      description.append(activityLink);
      const agentCell = element('td');
      const agent = state.data.agents?.find((item) => item.id === request.agentId);
      if (agent) { const link = element('a', 'text-link', agent.name); link.href = pageUrl('agents', { agent: agent.id }); agentCell.append(link); }
      else agentCell.append(element('span', '', request.agentId || 'Unavailable'));
      const steps = element('td', 'number-cell', request.observedToolSteps == null ? 'Unavailable' : count(request.observedToolSteps));
      const status = element('td');
      status.append(element('span', 'status-badge ' + statusClass(request.status), request.status || 'Unspecified'));
      row.append(when, description, agentCell, steps, status);
      return row;
    }));
    setText('history-showing', rows.length ? 'Showing ' + count(visible.length) + ' of ' + count(rows.length) + ' runs' : 'No runs to show');
    $('history-more').hidden = visible.length >= rows.length;
  }

  const pages = ['overview', 'models', 'agents', 'skills', 'activity', 'graft'];
  const titles = { overview: 'Usage overview', models: 'Models', agents: 'Configured agents', skills: 'Skills', activity: 'Activity', graft: 'HSG code graph' };
  function currentPage() {
    const path = (window.location?.pathname || '/usage').replace(/\/$/, '');
    return pages.find((page) => page !== 'overview' && path === '/usage/' + page) || 'overview';
  }
  function queryValue(name) {
    const pair = (window.location?.search || '').replace(/^\?/, '').split('&').find((item) => item.split('=')[0] === name);
    if (!pair) return '';
    try { return decodeURIComponent(pair.slice(name.length + 1).replace(/\+/g, ' ')); } catch { return ''; }
  }
  function pageUrl(page, params = {}) {
    if (state.data && state.period !== 7 && params.period === undefined) params = { ...params, period: state.period };
    if (state.data && currentPage() === page) {
      if (['overview', 'models'].includes(page) && state.model && params.filter === undefined) params = { ...params, filter: state.model };
      const q = page === 'skills' ? $('skills-search').value.trim() : page === 'activity' ? $('history-search').value.trim() : '';
      if (q && params.q === undefined) params = { ...params, q };
    }
    const query = Object.entries(params).filter(([, value]) => value !== '' && value != null)
      .map(([name, value]) => encodeURIComponent(name) + '=' + encodeURIComponent(value)).join('&');
    return '/usage' + (page === 'overview' ? '' : '/' + page) + (query ? '?' + query : '');
  }
  function syncFilters() {
    if (!window.history?.replaceState) return;
    const page = currentPage();
    const key = { models: 'model', agents: 'agent', skills: 'skill', activity: queryValue('task') ? 'task' : 'run' }[page];
    const params = {};
    if (key && queryValue(key)) params[key] = queryValue(key);
    if (state.period !== 7) params.period = state.period;
    if (state.model && ['overview', 'models'].includes(page)) params.filter = state.model;
    const q = page === 'skills' ? $('skills-search').value.trim() : page === 'activity' ? $('history-search').value.trim() : '';
    if (q) params.q = q;
    window.history.replaceState(null, '', pageUrl(page, params));
  }
  function restoreFilters() {
    const period = Number(queryValue('period'));
    state.period = [1, 7, 30].includes(period) ? period : 7;
    state.model = queryValue('filter');
    $('model-filter').value = state.model;
    document.querySelectorAll('[data-period]').forEach((item) => item.setAttribute('aria-pressed', String(Number(item.dataset.period) === state.period)));
    $('skills-search').value = currentPage() === 'skills' ? queryValue('q') : '';
    $('history-search').value = currentPage() === 'activity' ? queryValue('q') : '';
  }
  function navigate(href, focus = true) {
    if (window.history?.pushState) { window.history.pushState(null, '', href); renderRoute(focus); }
    else if (window.location) window.location.href = href;
  }
  function detailField(label, value) { const pair = element('div'); pair.append(element('dt', '', label), element('dd', '', value == null || value === '' ? 'Unavailable' : value)); return pair; }
  function details(id, title, base, entries) {
    const box = $(id); box.replaceChildren(); box.hidden = false;
    const back = element('a', 'back-link', '← Back to ' + base); back.href = pageUrl(base);
    box.append(back, element('h2', '', title));
    const list = element('dl', 'detail-grid');
    entries.forEach(([label, value]) => { const pair = element('div');
      pair.append(element('dt', '', label), element('dd', '', value == null || value === '' ? 'Unavailable' : value)); list.append(pair); });
    box.append(list); return box;
  }
  function detailLink(box, title, href) { const link = element('a', 'detail-action', title + ' →'); link.href = href; box.append(link); }
  function renderDetails() {
    for (const id of ['model-detail', 'agent-detail', 'skill-detail', 'activity-detail']) $(id).hidden = true;
    if (!state.data) return;
    if (currentPage() === 'models' && queryValue('model')) {
      const name = queryValue('model'), model = state.models.find((row) => row.model === name);
      const box = details('model-detail', model ? name : 'Model unavailable', 'models', model ? [
        ['Recorded tokens', count(model.totalTokens)], ['Model entries', model.requests === null ? 'Unavailable' : count(model.requests)],
        ['Provider', [...model.providers].join(', ')], ['Reported cost', model.missingCost ? 'Incomplete or unavailable' : currencyFormat.format(model.cost)]
      ] : []);
      if (model) {
        box.append(element('p', 'fine-print', 'Selected range: ' + $('range-label').textContent + '. Missing token buckets are unavailable, not zero.'));
        box.append(element('h3', '', 'Token categories'));
        const buckets = element('dl', 'detail-grid');
        categories.forEach(([key, label]) => buckets.append(detailField(label, tokenLabel(model[key]))));
        box.append(buckets, element('h3', '', 'Daily usage in this view'));
        const range = currentRange();
        const list = element('ul', 'detail-records');
        state.data.daily.filter((row) => row.model === name && within(row.date, range.start, range.end) && within(row.date, state.data.range.start, state.data.range.end))
          .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).forEach((row) =>
            list.append(element('li', '', row.date + ' · ' + count(row.totalTokens) + ' tokens · ' + (row.requests === null ? 'entries unavailable' : count(row.requests) + ' entries') + ' · ' +
              categories.map(([key, label]) => label + ': ' + tokenLabel(row[key])).join(' · '))));
        box.append(list);
      } else box.append(element('p', '', 'No matching model in the selected range. Clear filters or return to all models.'));
    }
    if (currentPage() === 'agents' && queryValue('agent')) {
      const selected = queryValue('agent');
      const agent = state.data.agents?.find((row) => row.id === selected) ??
        (state.data.agentRunDaily?.some((row) => row.agentId === selected) ? { id: selected, name: selected, scopedSessions: null, usageState: 'observed' } : null);
      const box = details('agent-detail', agent?.name || 'Agent unavailable', 'agents', agent ? [
        ['Role', agent.role], ['Configured model', agent.configuredModel], ['Runtime', agent.runtime],
        ['AFP-scoped sessions (whole snapshot)', agent.scopedSessions == null ? null : count(agent.scopedSessions)],
        ['Usage evidence', agent.usageState === 'observed' ? 'Observed in scope' : agent.usageState === 'no_scoped_sessions' ? 'No scoped sessions' : 'Unavailable']
      ] : []);
      if (agent) {
        box.append(element('p', 'fine-print', 'Configured does not mean currently running. The directory may be wider than AFP usage scope.'));
        const view = observationView('agents');
        const observed = view.entries.find((row) => row.id === agent.id);
        box.append(element('h3', '', 'Observed runs · selected dates'), detailField('Observed runs', observed ? count(observed.count) : 'No observations available; not zero'));
        box.append(element('p', 'fine-print', view.label + '. Lifecycle-evidenced runs only; latest retained audit date. Model filters do not apply. Counts are retained observations, not complete historical totals.' + (view.coverage === 'partial' ? ' Partial evidence: known lower bound.' : '')));
        if (view.rows.length) {
          const runs = element('ul', 'detail-records');
          view.rows.filter((row) => row.agentId === agent.id).sort((a, b) => b.date.localeCompare(a.date))
            .forEach((row) => runs.append(element('li', '', row.date + ' · ' + count(row.count) + ' observed runs')));
          box.append(runs);
        }
        const daily = (state.data.agentDaily?.filter((row) => row.agentId === agent.id) ?? [])
          .sort((a, b) => b.date.localeCompare(a.date) || a.model.localeCompare(b.model));
        if (daily.length) { box.append(element('h3', '', 'Attributed usage · whole snapshot window'));
          box.append(element('p', 'fine-print', state.data.range.start + ' to ' + state.data.range.end + ' (Europe/Zurich). ' +
            (daily.length > 10 ? 'Latest 10 of ' + count(daily.length) + ' daily model records shown.' : count(daily.length) + ' daily model records shown.') + ' Not the selected date/model filter.'));
          const list = element('ul', 'detail-records'); daily.slice(0, 10).forEach((row) => list.append(element('li', '', row.date + ' · ' + row.model + ' · ' + tokenLabel(row.totalTokens) + ' tokens'))); box.append(list); }
        const tasks = state.data.tasks?.filter((row) => row.agentId === agent.id) ?? [];
        if (tasks.length) { box.append(element('h3', '', 'Recorded work · whole snapshot'));
          tasks.slice(0, 10).forEach((task) => detailLink(box, task.title, pageUrl('activity', { task: task.id }))); }
      } else box.append(element('p', '', 'This agent is not in the public directory.'));
    }
    if (currentPage() === 'skills' && queryValue('skill')) {
      const skill = state.data.skillCatalog?.find((row) => row.id === queryValue('skill')) ??
        state.data.skills.find((row) => row.name === queryValue('skill'));
      const skillView = observationView('skills');
      const selectedReads = skillView.entries.find((row) => row.id === skill?.name)?.count;
      const datedReads = state.data.skillDaily != null;
      const box = details('skill-detail', skill?.name || 'Skill unavailable', 'skills', skill ? [
        ['Source', skill.source], ['Eligible', skill.eligible == null ? null : skill.eligible ? 'Yes' : 'No'],
        ['Disabled', skill.disabled == null ? null : skill.disabled ? 'Yes' : 'No'],
        ['Visible to selected model', skill.modelVisible == null ? null : skill.modelVisible ? 'Yes' : 'No'],
        ['User-invocable', skill.userInvocable == null ? null : skill.userInvocable ? 'Yes' : 'No'],
        ['Observed instruction reads', datedReads ? selectedReads == null ? 'No observations available; not zero' : count(selectedReads) : selectedReads != null ? count(selectedReads) : skill.observedReads == null ? skill.count == null ? null : count(skill.count) : count(skill.observedReads)],
        ['Last observed', skill.lastObservedAt || skill.lastUsedAt ? fullDateFormat.format(new Date(skill.lastObservedAt || skill.lastUsedAt)) + ' Zurich' : null]
      ] : []);
      if (skill) { box.insertBefore(element('p', 'detail-summary', skill.descriptionSource !== 'unavailable' && skill.description ? skill.description : 'Public skill description unavailable.'), box.children[2]);
        box.append(element('p', 'fine-print', skillView.label + '. Observed instruction reads do not prove execution or completed work. Counts across selected scoped sessions; main-agent catalog metadata and last-observed timestamp are snapshot-wide. Model filters do not apply.' + (skillView.coverage === 'partial' ? ' Partial evidence: known lower bound.' : '')));
        if (datedReads) {
          box.append(element('h3', '', 'Instruction reads · selected dates'));
          const days = element('ul', 'detail-records');
          skillView.rows.filter((row) => row.name === skill.name).sort((a, b) => b.date.localeCompare(a.date))
            .forEach((row) => days.append(element('li', '', row.date + ' · ' + count(row.count) + ' instruction reads')));
          box.append(days);
        }
      } else box.append(element('p', '', 'No matching public skill detail is available.'));
    }
    if (currentPage() === 'activity' && (queryValue('task') || queryValue('run'))) {
      const task = state.data.tasks?.find((row) => row.id === queryValue('task'));
      const run = state.data.requests.find((row) => row.id === queryValue('run'));
      const agent = state.data.agents?.find((row) => row.id === (task || run)?.agentId);
      const box = details('activity-detail', task?.title || run?.description || 'Activity unavailable', 'activity', task ? [
        ['Agent', agent?.name || task.agentId], ['Status', task.status + ' · ' + task.statusSource.replaceAll('_', ' ')],
        ['Observed', fullDateFormat.format(new Date(task.observedAt)) + ' Zurich'],
        ['Started', task.startedAt ? fullDateFormat.format(new Date(task.startedAt)) + ' Zurich' : null],
        ['Ended', task.endedAt ? fullDateFormat.format(new Date(task.endedAt)) + ' Zurich' : null],
        ['Duration', task.durationMs == null ? null : Math.round(task.durationMs / 1000) + ' s'],
        ['Model selection', task.model ? task.model + ' (session selection, not verified per-run use)' : null],
        ['Observed runs', task.observedRuns == null ? null : count(task.observedRuns)],
        ['Observed tool steps', task.observedToolSteps == null ? null : count(task.observedToolSteps)],
        ['Work categories', task.categories?.length ? task.categories.join(' · ') : null]
      ] : run ? [
        ['Agent', agent?.name || run.agentId], ['Status', run.status],
        ['Observed', fullDateFormat.format(new Date(run.at)) + ' Zurich'],
        ['Started', run.startedAt ? fullDateFormat.format(new Date(run.startedAt)) + ' Zurich' : null],
        ['Ended', run.endedAt ? fullDateFormat.format(new Date(run.endedAt)) + ' Zurich' : null],
        ['Duration', run.durationMs == null ? null : Math.round(run.durationMs / 1000) + ' s'],
        ['Model', run.model === 'Not attributed' ? null : run.model],
        ['Tokens', run.totalTokens == null ? null : count(run.totalTokens)],
        ['Observed tool steps', run.observedToolSteps == null ? null : count(run.observedToolSteps)],
        ['Categories', run.categories?.length ? run.categories.join(' · ') : null]
      ] : []);
      if (task) {
        box.insertBefore(element('p', 'detail-summary', task.summary || (task.titleSource === 'inferred' ? 'Title inferred from public metadata.' : 'Public summary unavailable.')), box.children[2]);
        if (agent) detailLink(box, 'View ' + agent.name, pageUrl('agents', { agent: agent.id }));
        const related = state.data.requests.filter((row) => row.taskId === task.id);
        if (related.length) { box.append(element('h3', '', 'Linked runs'));
          related.slice(0, 20).forEach((row) => detailLink(box, fullDateFormat.format(new Date(row.at)) + ' · ' + row.description, pageUrl('activity', { run: row.id }))); }
      } else if (run) {
        const known = categories.filter(([key]) => run[key] !== null && run[key] !== undefined);
        if (known.length) { box.append(element('h3', '', 'Known token buckets'));
          const buckets = element('dl', 'detail-grid'); known.forEach(([key, label]) => buckets.append(detailField(label, count(run[key])))); box.append(buckets); }
        box.append(element('p', 'fine-print', 'Metadata-inferred run activity, not a prompt or verified provider request. Unknown model and tokens are not zero.'));
        if (run.taskId && state.data.tasks?.some((row) => row.id === run.taskId)) detailLink(box, 'View related task', pageUrl('activity', { task: run.taskId }));
      } else box.append(element('p', '', 'This item is not in the current snapshot. Return to the list or refresh.'));
    }
  }

  function renderRoute(focus = true) {
    const page = currentPage(); state.page = page;
    restoreFilters();
    if (state.data) renderFiltered();
    pages.forEach((name) => { $(name + '-page').hidden = name !== page; });
    document.querySelectorAll('.nav-link').forEach((link) => {
      const active = link.getAttribute('href') === '/usage' + (page === 'overview' ? '' : '/' + page);
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    $('global-filters').hidden = page === 'graft';
    $('model-control').hidden = !['overview', 'models'].includes(page);
    for (const kind of ['agents', 'skills']) $(kind + '-usage-panel').hidden = page === kind && !!queryValue(kind === 'agents' ? 'agent' : 'skill');
    $('models-overview').hidden = page === 'models' && !!queryValue('model');
    $('agents-list').hidden = page === 'agents' && !!queryValue('agent');
    $('skills').hidden = page === 'skills' && !!queryValue('skill');
    $('skills-search').parentNode && ($('skills-search').parentNode.hidden = page === 'skills' && !!queryValue('skill'));
    $('history').hidden = page === 'activity' && !!(queryValue('task') || queryValue('run'));
    renderDetails();
    const isDetail = (page === 'models' && queryValue('model')) || (page === 'agents' && queryValue('agent')) ||
      (page === 'skills' && queryValue('skill')) || (page === 'activity' && (queryValue('task') || queryValue('run')));
    setText('page-title', titles[page] + (isDetail ? ' detail' : ''));
    document.title = titles[page] + ' — AFP Usage';
    announce(titles[page] + (isDetail ? ' detail' : '') + ' loaded.');
    if (focus) { $('page-title').focus({ preventScroll: true }); window.scrollTo?.(0, 0); }
    if (page === 'models' && !isDetail && state.data) renderTimeline();
  }
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
    const href = link.getAttribute('href');
    if (!href?.startsWith('/usage') || !/^\/usage(?:\/(?:models|agents|skills|activity|graft))?(?:\?|$)/.test(href)) return;
    event.preventDefault(); navigate(href);
  });
  window.addEventListener('popstate', () => renderRoute());
  $('reset-filters').addEventListener('click', () => {
    state.period = 7; state.model = ''; $('model-filter').value = '';
    document.querySelectorAll('[data-period]').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.period === '7')));
    if (currentPage() === 'activity') $('history-search').value = '';
    renderFiltered(); syncFilters(); announce('Filters cleared.');
  });
  $('skills-search').addEventListener('input', () => { state.skillsExpanded = false; renderSkills(); syncFilters(); announce($('skills-list').children.length + ' matching skills.'); });
  $('skills-clear-search').addEventListener('click', () => {
    $('skills-search').value = ''; renderSkills(); syncFilters(); $('skills-search').focus(); announce('Skill search cleared.');
  });

  $('refresh-button').addEventListener('click', () => loadUsage());
  $('retry-button').addEventListener('click', () => loadUsage());
  document.querySelectorAll('[data-period]').forEach((button) => button.addEventListener('click', () => {
    state.period = Number(button.dataset.period);
    state.historyLimit = 20;
    document.querySelectorAll('[data-period]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    renderFiltered(); syncFilters();
    announce('Showing ' + (state.period === 1 ? 'today' : 'the last ' + state.period + ' days') + ' in Europe/Zurich. Skill counts use dated observations where available; older snapshots remain snapshot-wide.');
  }));
  $('model-filter').addEventListener('change', (event) => {
    state.model = event.target.value;
    state.historyLimit = 20;
    renderFiltered(); syncFilters();
    announce('Showing ' + (state.model || 'all models') + '. Skill and agent charts ignore model filters; run models are not attributed.');
  });
  document.querySelectorAll('[data-measure]').forEach((button) => button.addEventListener('click', () => {
    state.measure = button.dataset.measure;
    document.querySelectorAll('[data-measure]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    if (state.data) renderModels();
    announce('Model chart now compares ' + (state.measure === 'tokens' ? 'tokens.' : 'recorded model entries, not verified provider calls.'));
  }));
  let searchTimer;
  $('history-search').addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.historyLimit = 20;
      renderHistory(); syncFilters();
      if (state.data) announce($('history-count').textContent + ' match this view.');
    }, 160);
  });
  function clearActivitySearch() {
    $('history-search').value = ''; state.historyLimit = 20;
    renderHistory(); syncFilters(); $('history-search').focus(); announce('Activity search cleared.');
  }
  $('clear-search').addEventListener('click', clearActivitySearch);
  $('activity-clear-search').addEventListener('click', clearActivitySearch);
  $('history-more').addEventListener('click', () => {
    state.historyLimit += 20;
    renderHistory();
    if ($('history-more').hidden) $('history-search').focus({ preventScroll: true });
    announce($('history-showing').textContent);
  });
  $('skills-more').addEventListener('click', () => {
    state.skillsExpanded = !state.skillsExpanded;
    renderSkills();
    announce(state.skillsExpanded ? 'All attributed skills are shown.' : 'Showing the top six attributed skills.');
  });
  $('chart-previous').addEventListener('click', () => selectDay(state.selectedDay - 1, true));
  $('chart-next').addEventListener('click', () => selectDay(state.selectedDay + 1, true));
  $('timeline-chart').addEventListener('keydown', (event) => {
    let next = state.selectedDay;
    if (['ArrowLeft', 'ArrowDown'].includes(event.key)) next--;
    else if (['ArrowRight', 'ArrowUp'].includes(event.key)) next++;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = state.days.length - 1;
    else return;
    event.preventDefault();
    selectDay(next);
  });
  function pointToDay(event) {
    if (!state.days.length || $('timeline-content').hidden) return;
    const chart = $('timeline-chart');
    const point = chart.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = chart.getScreenCTM();
    if (!matrix) return;
    const coordinate = point.matrixTransform(matrix.inverse());
    const index = Math.round((coordinate.x - state.chartLayout.left) / state.chartLayout.plotWidth * (state.days.length - 1));
    selectDay(index);
  }
  $('timeline-chart').addEventListener('pointermove', (event) => { if (event.pointerType !== 'touch') pointToDay(event); });
  $('timeline-chart').addEventListener('click', (event) => { pointToDay(event); $('timeline-chart').focus({ preventScroll: true }); });

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver((entries) => {
      const width = Math.max(220, Math.round(entries[0].contentRect.width));
      if (state.data && state.days.length && state.chartLayout && width !== state.chartLayout.width) renderTimeline();
    });
    resizeObserver.observe($('timeline-chart'));
  }


  // No usage data is persisted. A restored page fetches a fresh public snapshot.
  window.addEventListener('pageshow', (event) => { if (event.persisted) { clearData(); loadUsage(); } });
  // Poll the existing read-only snapshot, not the Gateway or a new model call.
  // loadUsage guards overlapping requests and retains the last good data on failure.
  function refreshVisibleUsage() {
    if (document.hidden) return;
    updateFreshness();
    const today = dateKey(Date.now());
    if (state.data && today !== state.today) { state.today = today; renderFiltered(); }
    return loadUsage();
  }
  window.setInterval(refreshVisibleUsage, 60000);
  window.setInterval(() => { if (!document.hidden) loadActiveAgents(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshVisibleUsage(); loadActiveAgents(); } });
  renderRoute(false);
  loadUsage();
  loadActiveAgents();
})();
