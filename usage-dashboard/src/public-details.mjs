const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = max => value => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f]/u.test(value);
const number = value => Number.isFinite(value) && value >= 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const bool = value => typeof value === 'boolean';
const nullable = check => value => value === null || check(value);
const choice = (...values) => value => values.includes(value);
const agentId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/u.test(value);
const opaqueId = value => typeof value === 'string' && /^[a-f0-9]{32}$/u.test(value);
const instant = value => text(80)(value) && /T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value));
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value));
const category = choice('Research', 'Browser activity', 'File inspection', 'Implementation', 'Skill instruction read', 'Delegation', 'Tool activity', 'Media activity', 'Agent activity');
const categories = value => Array.isArray(value) && value.length <= 12 && value.every(category);
const availability = choice('available', 'partial', 'unavailable');
function require(condition) { if (!condition) throw new Error('Invalid public details'); }
function project(value, fields) {
  require(object(value));
  return Object.fromEntries(Object.entries(fields).map(([key, valid]) => {
    require(own(value, key) && valid(value[key]));
    return [key, value[key]];
  }));
}
const metricFields = { input: nullable(number), output: nullable(number), cacheRead: nullable(number), cacheWrite: nullable(number), totalTokens: nullable(number) };
const agentFields = {
  id: agentId, name: text(160), role: nullable(text(400)), configuredModel: nullable(text(160)), runtime: nullable(text(80)),
  scopedSessions: count, usageState: choice('observed', 'no_scoped_sessions', 'unavailable')
};
const agentDailyFields = { agentId, date: day, provider: text(80), model: text(160), ...metricFields, requests: count, costUsd: nullable(number) };
const skillFields = {
  id: opaqueId, agentId, name: text(120), description: nullable(text(400)),
  descriptionSource: choice('frontmatter', 'approved_public', 'unavailable'),
  source: choice('bundled', 'managed', 'extra', 'custodian', 'workspace', 'other'),
  eligible: nullable(bool), disabled: nullable(bool), modelVisible: nullable(bool), userInvocable: nullable(bool),
  observedReads: nullable(count), lastObservedAt: nullable(instant)
};
const taskFields = {
  id: opaqueId, agentId, kind: choice('root_session', 'delegated_session'), title: text(160), titleSource: choice('approved_label', 'inferred'),
  summary: nullable(text(400)), summarySource: choice('approved_metadata', 'unavailable'),
  status: choice('running', 'queued', 'succeeded', 'failed', 'cancelled', 'timed_out', 'blocked', 'interrupted', 'unknown'),
  statusSource: choice('session_lifecycle', 'live_session', 'unknown'), observedAt: instant,
  startedAt: nullable(instant), endedAt: nullable(instant), durationMs: nullable(number),
  durationSource: choice('session_runtime', 'lifecycle_interval', 'unavailable'), model: nullable(text(160)), modelSource: choice('session_selection', 'unavailable'),
  categories, observedRuns: nullable(count), observedToolSteps: nullable(count)
};
const requestFields = { agentId, taskId: opaqueId, startedAt: nullable(instant), endedAt: nullable(instant), durationMs: nullable(number), categories, observedToolSteps: nullable(count) };
const coverageFields = { agents: availability, skills: availability, tasks: availability, taskMetric: text(1000), toolStepMetric: text(1000) };

export function publicRootDetails(value) {
  const output = {};
  for (const [key, max, fields] of [['agents', 100, agentFields], ['agentDaily', 6000, agentDailyFields], ['skillCatalog', 1000, skillFields], ['tasks', 200, taskFields]]) {
    if (!own(value, key)) continue;
    if (value[key] === null) { output[key] = null; continue; }
    require(Array.isArray(value[key]) && value[key].length <= max);
    output[key] = value[key].map(row => project(row, fields));
  }
  return output;
}
export function publicRequestDetails(value) {
  const output = {};
  for (const [key, valid] of Object.entries(requestFields)) {
    if (!own(value, key)) continue;
    require(valid(value[key]));
    output[key] = value[key];
  }
  return output;
}
export function publicCoverageDetails(value) {
  return own(value, 'details') ? { details: project(value.details, coverageFields) } : {};
}
export function validatePublicDetails(value) {
  try {
    publicRootDetails(value);
    publicCoverageDetails(value.coverage);
    for (const row of value.requests) publicRequestDetails(row);
    return true;
  } catch { return false; }
}
