import { gatewayRpc, validateConfig } from './collect.mjs';
import { installationSnapshot } from './installation-usage.mjs';
import { makeRange } from './telemetry.mjs';
import { publicSnapshot } from './handler.mjs';
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';

export const USAGE_POLL_MS = 5000;
export const USAGE_TIMEOUT_MS = 4000;
const MAX_BACKOFF_MS = 60000;
const BACKUP_READ_MS = 60000;

export async function readSnapshotFile(filename) {
  let file;
  try {
    file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 1048576) throw new Error('Unsafe snapshot');
    const bytes = Buffer.alloc(stat.size + 1); let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > stat.size) throw new Error('Snapshot changed during read');
    return bytes.subarray(0, offset).toString('utf8');
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  finally { await file?.close(); }
}

// CLI startup measured ~184 MiB RSS; share one child slot with the active-agent reader.
export function createSharedGatewayReader(read = (method, params, signal) => gatewayRpc(method, params, undefined,
  { timeout: USAGE_TIMEOUT_MS, maxBuffer: 1024 * 1024, signal })) {
  let tail = Promise.resolve(), admitted = 0, closed = false;
  const shutdown = new AbortController();
  const reader = async (method, params, { signal } = {}) => {
    if (closed || !['usage.cost', 'sessions.list'].includes(method) || admitted >= 2) throw new Error('Reporting reader busy');
    signal = signal ? AbortSignal.any([signal, shutdown.signal]) : shutdown.signal;
    admitted++;
    const work = tail.then(() => {
      if (signal?.aborted) throw new Error('Reporting read canceled');
      return read(method, params, signal);
    });
    tail = work.catch(() => {});
    try { return await work; } finally { admitted--; }
  };
  reader.close = async () => { closed = true; shutdown.abort(); await tail; };
  return reader;
}

// One process-wide source, no per-visitor subprocesses, background interval or snapshot writer.
// Polling reuses the existing authorized CLI; broad session events contain unnecessary private data.
export function createLiveUsageSource(rawConfig, {
  rpc = (method, params, { signal }) => gatewayRpc(method, params, undefined, { timeout: USAGE_TIMEOUT_MS, maxBuffer: 1024 * 1024, signal }),
  readSeed = async () => null, clock = Date.now
} = {}) {
  const config = validateConfig(rawConfig);
  if (config.scopeMode !== 'installation') throw new Error('Live usage requires installation scope');
  let snapshot, backupPending, pending, nextAttempt = 0, failures = 0, lastAttemptAt = null, nextBackupRead = 0;
  let sampledAt = null, status = 'loading', revision = null, closed = false, inFlight = false, controller;
  function adopt(value, backup = false) {
    const clean = publicSnapshot(value);
    if (clean.scopeMode !== 'installation') throw new Error('Unexpected usage scope');
    if (backup && (Date.parse(clean.generatedAt) > clock() || snapshot && Date.parse(clean.generatedAt) <= Date.parse(snapshot.generatedAt))) return;
    snapshot = clean;
    sampledAt = clean.generatedAt;
    // Sampling clocks are receipts, not new usage; unchanged counters retain their revision.
    const { generatedAt, sourceUpdatedAt, source, live, ...accounting } = clean;
    revision = createHash('sha256').update(JSON.stringify(accounting)).digest('hex');
  }
  function project() {
    if (!snapshot) return null;
    return JSON.stringify({ ...snapshot, live: { transport: 'poll', pollIntervalMs: USAGE_POLL_MS,
      sampledAt, lastAttemptAt, status, retryAfterMs: Math.max(0, nextAttempt - clock()), revision } });
  }
  function readBackup() {
    if (backupPending) return backupPending;
    if (clock() < nextBackupRead) return;
    nextBackupRead = clock() + BACKUP_READ_MS;
    backupPending = Promise.resolve().then(async () => {
      try {
        const body = await readSeed();
        if (!closed && body && body.length <= 1048576) adopt(JSON.parse(body), true);
      } catch { /* Malformed/foreign backups never replace installation totals. */ }
    }).finally(() => { backupPending = null; });
    return backupPending;
  }
  function refresh() {
    if (closed || pending || inFlight || clock() < nextAttempt) return pending;
    lastAttemptAt = new Date(clock()).toISOString();
    controller = new AbortController();
    pending = Promise.resolve().then(async () => {
      let timer;
      try {
        const range = makeRange(new Date(clock()), config.lookbackDays);
        inFlight = true;
        const read = Promise.resolve().then(() => rpc('usage.cost', { startDate: range.start, endDate: range.end,
          mode: 'specific', timeZone: range.timeZone, agentScope: 'all' }, { signal: controller.signal }))
          .finally(() => { inFlight = false; });
        const report = await Promise.race([read, new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Source timeout')); }, USAGE_TIMEOUT_MS);
        })]);
        if (closed) return;
        adopt(installationSnapshot(report, range, new Date(clock())));
        failures = 0; status = 'ok';
      } catch {
        if (closed) return;
        failures = Math.min(failures + 1, 5); status = 'degraded';
        // Do not expose RPC errors or try alternate methods, credentials or human-session discovery.
      } finally {
        clearTimeout(timer);
        // An uncooperative timed-out reader retains the gate until it actually settles.
        nextAttempt = clock() + Math.min(MAX_BACKOFF_MS, USAGE_POLL_MS * 2 ** failures);
        pending = null;
      }
    });
    return pending;
  }
  return {
    async get() {
      if (closed) return project();
      if (!snapshot || status !== 'ok') await readBackup();
      const work = refresh();
      // A due read waits at most four seconds, so the browser sees it in this poll, not the next.
      // Concurrent visitors join one request; reads between samples are immediate.
      if (work) await work;
      return project();
    },
    close() { closed = true; controller?.abort(); }
  };
}
