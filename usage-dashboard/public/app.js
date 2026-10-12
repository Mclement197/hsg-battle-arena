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
    stale: false, today: '', controller: null
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
    target.requests += row.requests;
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
    assert(isObject(data.coverage) && isNumber(data.coverage.sessions) && Array.isArray(data.coverage.notes));
    assert(data.coverage.notes.every(isString) && isString(data.coverage.skillMetric) && isString(data.coverage.historyMetric));
    data.daily.forEach((row) => {
      assert(isObject(row) && isDay(row.date) && isString(row.model) && isString(row.provider));
      assert(categories.every(([key]) => row[key] === null || isNumber(row[key])) && isNumber(row.totalTokens) && isNumber(row.requests));
      assert(row.costUsd === null || isNumber(row.costUsd));
    });
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
    for (const id of ['model-chart', 'skills-list', 'history-table-body', 'daily-table-body', 'model-table-body', 'coverage-notes', 'token-breakdown', 'timeline-chart']) $(id).replaceChildren();
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
    $('freshness').title = 'Generated ' + fullDateFormat.format(generated) + ' (Europe/Zurich). This is a snapshot, not a live stream.';
  }

  function renderSnapshot() {
    const data = state.data;
    setText('scope-label', data.scopeLabel || 'Scope not provided');
    setText('coverage-scope', data.scopeLabel || 'Scope not provided');
    setText('coverage-generated', fullDateFormat.format(new Date(data.generatedAt)) + ' (Europe/Zurich)');
    setText('coverage-range', data.range.start + ' to ' + data.range.end + ' (Europe/Zurich)');
    setText('coverage-summary', count(data.coverage.sessions) + ' sessions in snapshot');
    $('coverage-notes').replaceChildren(...data.coverage.notes.map((note) => element('li', '', note)));
    setText('skill-metric', (data.coverage.skillMetric || 'No skill attribution details were supplied.') + ' Counts cover the whole snapshot and do not change with date or model filters.');
    setText('history-metric', data.coverage.historyMetric || 'Metadata-inferred agent activity, not user prompts or individual provider calls.');
    setText('skills-subtitle', 'Whole snapshot: ' + data.range.start + ' to ' + data.range.end);
    renderSkills();
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
    setText('metric-tokens', covered ? compact(totals.totalTokens) : '—');
    $('metric-tokens').title = covered ? count(totals.totalTokens) + ' total tokens' : 'Selected dates are outside snapshot coverage';
    setText('metric-tokens-note', covered ? count(totals.totalTokens) + ' recorded tokens' : 'Outside snapshot coverage');
    setText('metric-calls', covered ? compact(totals.requests) : '—');
    $('metric-calls').title = covered ? count(totals.requests) + ' recorded model entries' : 'Selected dates are outside snapshot coverage';
    setText('metric-calls-note', covered ? 'Not verified provider HTTP calls' : 'Outside snapshot coverage');
    setText('metric-model', leader && leader.totalTokens > 0 ? leader.model || 'Unspecified model' : covered ? 'No usage' : 'Unavailable');
    setText('metric-model-note', leader && totals.totalTokens > 0 ? percentFormat.format(leader.totalTokens / totals.totalTokens) + ' of selected tokens' : covered ? 'No recorded tokens in this view' : 'Outside snapshot coverage');
    const skillCount = data.skills.reduce((sum, skill) => sum + skill.count, 0);
    setText('metric-skills', data.skills.length ? compact(skillCount) : '—');
    $('metric-skills').title = data.skills.length ? count(skillCount) + ' attributed skill uses across the whole snapshot' : 'No named skill attribution in this snapshot';
    setText('metric-skills-note', data.skills.length ? count(data.skills.length) + ' named skills · whole snapshot' : 'No named attribution available');
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
    else $('daily-table-body').replaceChildren(...days.map((day) => tableRow([day.date, ...numericKeys.map((key) => tokenLabel(day[key])), count(day.requests)])));
  }

  function selectDay(index, shouldAnnounce = false) {
    if (!state.days.length) return;
    state.selectedDay = Math.min(state.days.length - 1, Math.max(0, index));
    const day = state.days[state.selectedDay];
    const coordinates = state.chartCoordinates[state.selectedDay];
    const phrase = formatDay(day.date, true) + ': ' + count(day.totalTokens) + ' tokens, ' + count(day.requests) + ' recorded model entries';
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
    setText('chart-calls', count(day.requests) + ' model entries');
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
      const button = element('button', 'model-row');
      button.type = 'button';
      button.setAttribute('aria-label', name + ': ' + count(model[key]) + ' ' + unit + ', ' + percentFormat.format(model[key] / total) + '. Filter to this model.');
      const heading = element('span', 'model-row-top');
      heading.append(element('span', 'model-name', name), element('span', 'model-percent', percentFormat.format(model[key] / total)));
      const bar = svgElement('svg', { class: 'model-bar', viewBox: '0 0 300 6', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      bar.append(svgElement('rect', { x: 0, y: 0, width: 300, height: 6, rx: 3, class: 'bar-track' }));
      bar.append(svgElement('rect', { x: 0, y: 0, width: top ? 300 * model[key] / top : 0, height: 6, rx: 3, class: 'series-' + index }));
      const footer = element('span', 'model-row-bottom');
      footer.append(element('span', 'model-provider', [...model.providers].join(', ') || 'Provider unspecified'), element('span', 'model-amount', compact(model[key]) + ' ' + unit));
      button.append(heading, bar, footer);
      button.addEventListener('click', () => {
        state.model = model.model;
        state.historyLimit = 20;
        $('model-filter').value = state.model;
        renderFiltered();
        $('model-filter').focus({ preventScroll: true });
        announce('Filtered to ' + name + '. Choose All models to reset.');
      });
      list.append(button);
    });
    setText('models-note', models.length > 6 ? 'Top 6 shown; the table includes all ' + count(models.length) + ' models. Select a model to filter.' : state.model ? 'Showing one model. Choose All models above to compare again.' : 'Select a model to filter. Bars scale to the leading model.');
    if (!models.length) tableMessage($('model-table-body'), 5, 'No recorded model usage in this view.');
    else $('model-table-body').replaceChildren(...models.map((model) => tableRow([
      model.model || 'Unspecified model', [...model.providers].join(', ') || 'Unspecified', count(model.totalTokens), count(model.requests),
      model.missingCost ? (model.cost > 0 ? currencyFormat.format(model.cost) + ' known (incomplete)' : 'Unavailable') : currencyFormat.format(model.cost)
    ])));
  }

  function renderSkills() {
    const skills = [...state.data.skills].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const visible = state.skillsExpanded ? skills : skills.slice(0, 6);
    if (!skills.length) $('skills-list').replaceChildren(emptyState('No named skill attribution', 'This snapshot does not contain attributed skill counts. That does not mean no skills were used. See the coverage explanation above.'));
    else $('skills-list').replaceChildren(...visible.map((skill) => {
      const row = element('article', 'skill-row');
      const content = element('div');
      content.append(element('h3', 'skill-name', skill.name || 'Unnamed skill'));
      if (skill.description) content.append(element('p', 'skill-description', skill.description));
      const lastUsed = element('p', 'skill-time', skill.lastUsedAt ? 'Last observed ' + fullDateFormat.format(new Date(skill.lastUsedAt)) + ' Zurich' : 'Last observation unavailable');
      const badge = element('span', 'skill-count', count(skill.count));
      badge.setAttribute('aria-label', count(skill.count) + ' attributed uses');
      content.append(lastUsed);
      row.append(content, badge);
      return row;
    }));
    $('skills-more').hidden = skills.length <= 6;
    $('skills-more').textContent = state.skillsExpanded ? 'Show fewer skills' : 'Show all ' + count(skills.length) + ' skills';
    $('skills-more').setAttribute('aria-expanded', String(state.skillsExpanded));
  }

  function renderHistory() {
    if (!state.data) return;
    const range = currentRange();
    const query = $('history-search').value.trim().toLocaleLowerCase();
    const rows = state.requestRows.filter((row) => within(row.day, range.start, range.end) && within(row.day, state.data.range.start, state.data.range.end) && (!state.model || row.model === state.model) && (!query || (row.description + ' ' + row.model).toLocaleLowerCase().includes(query)));
    const visible = rows.slice(0, state.historyLimit);
    setText('history-count', count(rows.length) + (rows.length === 1 ? ' entry' : ' entries'));
    $('history-table-wrap').hidden = !rows.length;
    $('history-empty').hidden = rows.length > 0;
    $('clear-search').hidden = !query;
    setText('history-empty-title', query ? 'No matching activity' : 'No activity in this view');
    setText('history-empty-message', query ? 'Try a different search, or clear it to see activity in the selected period.' : 'Try another time range or model. Available history depends on the snapshot coverage.');
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
      const description = element('td', 'request-description', request.description || 'Description unavailable');
      const model = element('td');
      model.append(element('span', 'request-model', request.model || 'Unspecified model'));
      const tokens = element('td', 'number-cell');
      tokens.append(element('span', 'request-tokens', tokenLabel(request.totalTokens)));
      const details = element('details', 'token-details');
      const summary = element('summary', '', 'Breakdown');
      summary.setAttribute('aria-label', 'Token breakdown for activity on ' + fullDateFormat.format(new Date(request.at)));
      const breakdown = element('dl');
      categories.forEach(([key, label]) => {
        const item = element('div');
        item.append(element('dt', '', label), element('dd', '', tokenLabel(request[key])));
        breakdown.append(item);
      });
      details.append(summary, breakdown);
      tokens.append(details);
      const status = element('td');
      status.append(element('span', 'status-badge ' + statusClass(request.status), request.status || 'Unspecified'));
      row.append(when, description, model, tokens, status);
      return row;
    }));
    setText('history-showing', rows.length ? 'Showing ' + count(visible.length) + ' of ' + count(rows.length) + ' entries' : 'No entries to show');
    $('history-more').hidden = visible.length >= rows.length;
  }

  $('refresh-button').addEventListener('click', () => loadUsage());
  $('retry-button').addEventListener('click', () => loadUsage());
  document.querySelectorAll('[data-period]').forEach((button) => button.addEventListener('click', () => {
    state.period = Number(button.dataset.period);
    state.historyLimit = 20;
    document.querySelectorAll('[data-period]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    renderFiltered();
    announce('Showing ' + (state.period === 1 ? 'today' : 'the last ' + state.period + ' days') + ' in Europe/Zurich. Skill counts remain snapshot-wide.');
  }));
  $('model-filter').addEventListener('change', (event) => {
    state.model = event.target.value;
    state.historyLimit = 20;
    renderFiltered();
    announce('Showing ' + (state.model || 'all models') + '. Skill counts remain snapshot-wide.');
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
      renderHistory();
      if (state.data) announce($('history-count').textContent + ' match this view.');
    }, 160);
  });
  $('clear-search').addEventListener('click', () => {
    $('history-search').value = '';
    state.historyLimit = 20;
    renderHistory();
    $('history-search').focus();
  });
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

  const navLinks = [...document.querySelectorAll('.nav-link')];
  function markSection(id) {
    navLinks.forEach((link) => {
      const active = link.getAttribute('href') === '#' + id;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  navLinks.forEach((link) => link.addEventListener('click', () => markSection(link.hash.slice(1))));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) markSection(visible[0].target.id);
    }, { rootMargin: '-5% 0px -65% 0px', threshold: 0 });
    document.querySelectorAll('.anchor-section').forEach((section) => observer.observe(section));
  }

  // No usage data is persisted. A restored page fetches a fresh public snapshot.
  window.addEventListener('pageshow', (event) => { if (event.persisted) { clearData(); loadUsage(); } });
  window.setInterval(() => {
    if (!state.data || document.hidden) return;
    updateFreshness();
    const today = dateKey(Date.now());
    if (today !== state.today) { state.today = today; renderFiltered(); }
  }, 60000);
  loadUsage();
})();
