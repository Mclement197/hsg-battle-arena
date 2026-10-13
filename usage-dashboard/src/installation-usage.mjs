import { BUCKETS, fail, count, numeric, inRange } from './telemetry.mjs';

export const INSTALLATION_LABEL = 'Entire OpenClaw installation · all configured agents · retained partial history';
const MAX_CACHE_AGE = 15 * 60 * 1000;

// usage.cost is the supported aggregate-only authority; never discover human sessions here.
export function installationSnapshot(report, range, now) {
  if (!report || !Array.isArray(report.daily) || report.daily.length > 366 || !report.totals ||
      !Number.isFinite(report.updatedAt) || report.updatedAt > now.getTime() ||
      now.getTime() - report.updatedAt > MAX_CACHE_AGE) fail('INVALID_INSTALLATION_USAGE');
  const cache = report.cacheStatus;
  if (!cache || !['fresh', 'refreshing', 'partial', 'stale'].includes(cache.status)) fail('INVALID_INSTALLATION_USAGE');
  if (cache.status !== 'fresh' && (!(count(cache.cachedFiles) > 0) || !Number.isFinite(cache.refreshedAt) || cache.refreshedAt > now.getTime() ||
      now.getTime() - cache.refreshedAt > MAX_CACHE_AGE)) fail('INSTALLATION_USAGE_PENDING');
  const components = BUCKETS.filter(key => key !== 'totalTokens');
  const validTotals = totals => totals && count(totals.totalTokens) !== null &&
    components.every(key => totals[key] == null || count(totals[key]) !== null) &&
    count(totals.missingCostEntries) !== null && numeric(totals.totalCost) !== null;
  if (!validTotals(report.totals)) fail('INVALID_INSTALLATION_TOTALS');
  const dates = new Set();
  const sums = Object.fromEntries([...BUCKETS, 'totalCost', 'missingCostEntries'].map(key => [key, 0]));
  let unknownBreakdown = false;
  const daily = report.daily.map(row => {
    if (!inRange(row?.date, range) || !Number.isFinite(Date.parse(row.date)) ||
        new Date(row.date + 'T00:00:00Z').toISOString().slice(0, 10) !== row.date || dates.has(row.date) || !validTotals(row)) fail('INVALID_INSTALLATION_DAILY');
    dates.add(row.date);
    for (const key of Object.keys(sums)) sums[key] = sums[key] === null || row[key] == null ? null : sums[key] + row[key];
    // Provider totals are authoritative; incomplete splits must not be fabricated or rejected.
    const splitKnown = components.every(key => count(row[key]) !== null) &&
      components.reduce((sum, key) => sum + row[key], 0) === row.totalTokens;
    unknownBreakdown ||= !splitKnown;
    return { date: row.date, provider: 'All providers', model: 'All models',
      ...Object.fromEntries(BUCKETS.map(key => [key, key === 'totalTokens' || splitKnown ? row[key] : null])), requests: null,
      costUsd: row.missingCostEntries === 0 ? row.totalCost : null };
  }).sort((a, b) => a.date.localeCompare(b.date));
  for (const key of Object.keys(sums)) {
    const expected = report.totals[key];
    if (sums[key] === null || expected == null) continue;
    if (key === 'totalCost' ? Math.abs(sums[key] - expected) > 1e-8 * Math.max(1, expected) : sums[key] !== expected) fail('INSTALLATION_TOTALS_MISMATCH');
  }
  return {
    schemaVersion: 1, generatedAt: now.toISOString(), scopeMode: 'installation', scopeLabel: INSTALLATION_LABEL,
    source: { method: 'usage.cost', status: cache.status, reportUpdatedAt: new Date(report.updatedAt).toISOString(),
      // Gateway merges refreshedAt with MAX across agents; this is not a complete-history watermark.
      refreshedAt: Number.isFinite(cache.refreshedAt) && cache.refreshedAt >= 0 && cache.refreshedAt <= now.getTime() ? new Date(cache.refreshedAt).toISOString() : null },
    range: { ...range }, daily, skills: [], requests: [],
    agents: null, agentDaily: null, tasks: null, skillCatalog: null, skillDaily: null, agentRunDaily: null,
    coverage: { sessions: null,
      notes: ['Supported Gateway-wide usage.cost totals across all configured agents and retained usage history, including chat, delegation and background work; not a complete lifetime archive.',
        'Model, agent, session, request and skill attribution are unavailable from this aggregate-only source.',
        ...(unknownBreakdown ? ['Token breakdown is unavailable where component buckets do not fully explain the authoritative provider total.'] : []),
        ...(cache.status === 'fresh' ? [] : ['Usage is refreshing; these verified cached totals may omit very recent activity.'])],
      skillMetric: 'Unavailable in installation aggregate-only mode.', historyMetric: 'No chat history or individual activity is collected.' }
  };
}

export async function collectInstallation(config, { rpc, clock, range, writeAllowlist }) {
  // Do not fall back to scoped/session reports or a different credential on authorization failure.
  const report = await rpc('usage.cost', { startDate: range.start, endDate: range.end,
    mode: 'specific', timeZone: range.timeZone, agentScope: 'all' });
  const snapshot = installationSnapshot(report, range, clock());
  if (config.allowlistPath) await writeAllowlist(config.allowlistPath, []);
  return snapshot;
}
