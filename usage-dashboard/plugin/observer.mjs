import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

export const LIMITS = Object.freeze({ name: 128, session: 500, path: 4096, allowlistBytes: 65536,
  sessions: 1000, pending: 128, dedup: 4096, eventsBytes: 32 * 1024 * 1024 });
const repository = fileURLToPath(new URL('../../', import.meta.url));
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const outside = (root, target) => { const p = path.relative(root, target); return p === '..' || p.startsWith('..' + path.sep) || path.isAbsolute(p); };
export const validSkillName = (v) => typeof v === 'string' && v.length <= LIMITS.name && /^[a-z0-9][a-z0-9._-]*$/u.test(v);
export const validSessionKey = (v) => typeof v === 'string' && v.length <= LIMITS.session && /^agent:[^:\s]+:[^\s]+$/u.test(v) && !/[\u0000-\u001f\u007f]/u.test(v);

export function validateConfig(raw) {
  if (!record(raw) || Object.keys(raw).some((key) => !['allowlistPath', 'eventsPath'].includes(key))) throw new Error('INVALID_CONFIG');
  for (const key of ['allowlistPath', 'eventsPath']) {
    const p = raw[key];
    if (typeof p !== 'string' || p.length > LIMITS.path || !path.isAbsolute(p) || /[\u0000-\u001f\u007f]/u.test(p) || !outside(repository, path.resolve(p))) throw new Error('INVALID_CONFIG');
  }
  if (path.resolve(raw.allowlistPath) === path.resolve(raw.eventsPath)) throw new Error('INVALID_CONFIG');
  return { allowlistPath: path.resolve(raw.allowlistPath), eventsPath: path.resolve(raw.eventsPath) };
}
export function parseAllowlist(raw) {
  if (!Array.isArray(raw) || raw.length > LIMITS.sessions || !raw.every(validSessionKey)) throw new Error('INVALID_ALLOWLIST');
  return new Set(raw);
}

function succeeded(event) {
  const r = event?.result;
  if (event?.error != null || !record(r)) return false;
  const d = record(r.details) ? r.details : r;
  return [r, d].every((value) => value.isError !== true && value.error == null && value.success !== false &&
    !['error', 'failed', 'blocked', 'denied', 'not_found', 'waiting', 'running'].includes(value.status) && value.kind !== 'not_found');
}
// Only a successful real tool envelope, never code/command strings or search hits.
export function extractSkillName(event) {
  if (!record(event) || !record(event.params) || !succeeded(event)) return null;
  if (event.toolName === 'skills_read') {
    const name = event.params.name;
    const d = event.result.details;
    return validSkillName(name) && record(d) && d.name === name && typeof d.content === 'string' ? name : null;
  }
  if (event.toolName !== 'read') return null;
  const p = event.params.path;
  if (typeof p !== 'string' || p.length > LIMITS.path || /[\u0000-\u001f\u007f]/u.test(p) || !(path.isAbsolute(p) || p.startsWith('~/')) || path.posix.basename(p) !== 'SKILL.md') return null;
  const d = record(event.result.details) ? event.result.details : event.result;
  if (!['text', 'truncated'].includes(d.kind) || typeof d.content !== 'string') return null;
  // Read the actual file's frontmatter, not its directory name. Restrict to simple scalars.
  const header = /^---\r?\n([\s\S]{0,8192}?)\r?\n---(?:\r?\n|$)/u.exec(d.content.slice(0, 8208));
  if (!header) return null;
  const names = header[1].split(/\r?\n/u).filter((line) => line.startsWith('name:'));
  if (names.length !== 1) return null;
  let name = names[0].slice(5).trim();
  if ((name.startsWith('"') && name.endsWith('"')) || (name.startsWith("'") && name.endsWith("'"))) name = name.slice(1, -1);
  return validSkillName(name) ? name : null;
}
export function privacyEvent(event, ctx, at = new Date().toISOString()) {
  if (!validSessionKey(ctx?.sessionKey)) return null;
  const skill = extractSkillName(event);
  if (!skill) return null;
  const callId = event.toolCallId ?? ctx.toolCallId;
  const runId = event.runId ?? ctx.runId ?? '';
  const stable = typeof callId === 'string' && callId.length > 0 && callId.length <= 1024 && typeof runId === 'string' && runId.length <= 1024;
  const eventId = stable ? createHash('sha256').update(JSON.stringify([ctx.sessionKey, runId, callId])).digest('hex') : randomUUID();
  return { eventId, sessionKey: ctx.sessionKey, skill, at };
}

async function privateParent(p) {
  const parent = path.dirname(p);
  const canonical = await realpath(parent);
  const info = await stat(canonical);
  if (!outside(await realpath(repository), canonical) || canonical !== parent || !info.isDirectory() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid()) throw new Error('PRIVATE_PARENT_REQUIRED');
}
function privateFile(info, max) {
  if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.uid !== process.getuid() || info.size > max) throw new Error('PRIVATE_FILE_REQUIRED');
}
export const privateIO = {
  async readAllowlist(p) {
    await privateParent(p);
    const handle = await open(p, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      privateFile(await handle.stat(), LIMITS.allowlistBytes);
      const buffer = Buffer.alloc(LIMITS.allowlistBytes + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > LIMITS.allowlistBytes) throw new Error('ALLOWLIST_LIMIT');
      return parseAllowlist(JSON.parse(buffer.subarray(0, length).toString('utf8')));
    } finally { await handle.close(); }
  },
  async append(p, dto) {
    await privateParent(p);
    const line = JSON.stringify(dto) + '\n';
    const handle = await open(p, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
    try {
      privateFile(await handle.stat(), LIMITS.eventsBytes - Buffer.byteLength(line));
      await handle.writeFile(line, 'utf8');
    } finally { await handle.close(); }
  }
};

export function createObserver(config, logger, io = privateIO) {
  const settings = validateConfig(config);
  const seen = new Set();
  const warned = new Set();
  let pending = 0;
  let tail = Promise.resolve();
  const warn = (code) => {
    if (warned.has(code)) return;
    warned.add(code);
    try { logger?.warn?.('afp-skill-observer: ' + code); } catch { /* telemetry cannot break tools */ }
  };
  const handler = (event, ctx) => {
    let dto;
    try { dto = privacyEvent(event, ctx); } catch { warn('EXTRACTION_FAILED'); return; }
    if (!dto) return;
    if (pending >= LIMITS.pending) { warn('QUEUE_LIMIT'); return; }
    pending += 1;
    // The asynchronous queue retains only the four-field DTO, not host envelopes.
    tail = tail.then(async () => {
      let allowed;
      try { allowed = await io.readAllowlist(settings.allowlistPath); } catch { warn('ALLOWLIST_READ_FAILED'); return; }
      if (!allowed.has(dto.sessionKey) || seen.has(dto.eventId)) return;
      try { await io.append(settings.eventsPath, dto); } catch { warn('EVENT_APPEND_FAILED'); return; }
      seen.add(dto.eventId);
      if (seen.size > LIMITS.dedup) seen.delete(seen.values().next().value);
    }).catch(() => warn('OBSERVER_FAILED')).finally(() => { pending -= 1; });
  };
  return { handler, drain: () => tail };
}
