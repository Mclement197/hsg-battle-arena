import test from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../plugin/index.mjs';
import { createObserver, extractSkillName, privacyEvent, parseAllowlist, validateConfig, LIMITS } from '../plugin/observer.mjs';

const sessionKey = 'agent:main:dashboard:project-example';
const ctx = { sessionKey };
const config = { allowlistPath: '/private-example/allowlist.json', eventsPath: '/private-example/events.jsonl' };
const skillEvent = (toolCallId = 'call-1') => ({ toolName: 'skills_read', toolCallId, params: { name: 'research' },
  result: { content: [{ type: 'text', text: 'PRIVATE INSTRUCTIONS' }], details: { name: 'research', content: 'PRIVATE INSTRUCTIONS' } } });
const readEvent = (content = '---\nname: real-name\n---\nInstructions') => ({ toolName: 'read', params: { path: '/skills/directory-alias/SKILL.md' },
  result: { details: { kind: 'text', content } } });
function harness(overrides = {}) {
  const writes = [], logs = [];
  const io = { readAllowlist: async () => new Set([sessionKey]), append: async (_p, dto) => writes.push(dto), ...overrides };
  return { ...createObserver(config, { warn: (line) => logs.push(line) }, io), writes, logs };
}

test('named installed skill requires authoritative matching success details', () => {
  assert.equal(extractSkillName(skillEvent()), 'research');
  const event = skillEvent(); event.result.details.name = 'different';
  assert.equal(extractSkillName(event), null);
  event.result = {}; assert.equal(extractSkillName(event), null);
});
test('failed calls, missing files, denied and pending results are not loads', () => {
  for (const patch of [{ error: 'SECRET FAILURE' }, { result: { isError: true } }, { result: undefined },
    { result: { details: { name: 'research', content: 'x', status: 'blocked' } } }]) {
    assert.equal(extractSkillName({ ...skillEvent(), ...patch }), null);
  }
  assert.equal(extractSkillName({ ...readEvent(), result: { details: { kind: 'not_found', optional: true } } }), null);
});
test('actual SKILL.md read uses frontmatter name, not directory alias', () => {
  assert.equal(extractSkillName(readEvent()), 'real-name');
  assert.equal(extractSkillName(readEvent('---\r\nname: "real-name"\r\n---\r\nBody')), 'real-name');
  assert.equal(extractSkillName(readEvent('---\nname: real-name\nname: duplicate\n---\nBody')), null);
  assert.equal(extractSkillName(readEvent('name: real-name\nNo frontmatter')), null);
  assert.equal(extractSkillName({ ...readEvent(), params: { path: '/skills/real-name/README.md' } }), null);
  assert.equal(extractSkillName({ ...readEvent(), params: { path: 'relative/SKILL.md' } }), null);
});
test('no arbitrary JavaScript, shell, tool results, or search-string inference', () => {
  for (const toolName of ['exec', 'skills_search', 'web_fetch']) {
    assert.equal(extractSkillName({ ...skillEvent(), toolName, params: { name: 'research', code: 'await skills.read("research")', command: 'cat /skills/research/SKILL.md' } }), null);
  }
});
test('names are bounded and reject payload-like values', () => {
  for (const name of ['', '../research', 'name\nsecret', 'a'.repeat(LIMITS.name + 1), 'Research', '<script>']) {
    const e = skillEvent(); e.params.name = name; e.result.details.name = name;
    assert.equal(extractSkillName(e), null);
  }
});
test('missing and unauthorized sessions cannot persist', async () => {
  const h = harness();
  h.handler(skillEvent(), {});
  h.handler(skillEvent(), { sessionKey: 'agent:other:dashboard:private' });
  await h.drain();
  assert.deepEqual(h.writes, []);
});
test('dynamic allowlist is read per event and revocation fails closed', async () => {
  let allowed = true, reads = 0;
  const h = harness({ readAllowlist: async () => { reads++; return new Set(allowed ? [sessionKey] : []); } });
  h.handler(skillEvent('1'), ctx); await h.drain();
  allowed = false;
  h.handler(skillEvent('2'), ctx); await h.drain();
  assert.equal(reads, 2); assert.equal(h.writes.length, 1);
});
test('privacy DTO has exactly four fields and never retains tool input/result/auth', async () => {
  const e = skillEvent(); e.params.auth = 'SECRET'; e.params.command = 'PRIVATE COMMAND'; e.prompt = 'PRIVATE PROMPT';
  const dto = privacyEvent(e, { ...ctx, auth: 'SECRET' }, '2026-10-12T11:00:00.000Z');
  assert.deepEqual(Object.keys(dto), ['eventId', 'sessionKey', 'skill', 'at']);
  assert.equal(dto.sessionKey, sessionKey); assert.equal(dto.skill, 'research');
  assert.equal(dto.at, '2026-10-12T11:00:00.000Z');
  assert.match(dto.eventId, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(dto), /PRIVATE|SECRET|call-1/u);
  const h = harness(); h.handler(e, ctx); await h.drain();
  assert.deepEqual(Object.keys(h.writes[0]), Object.keys(dto));
});
test('stable call IDs deduplicate; distinct calls are separate loads', async () => {
  const h = harness();
  h.handler(skillEvent(), ctx); h.handler(skillEvent(), ctx); h.handler(skillEvent('call-2'), ctx);
  await h.drain(); assert.equal(h.writes.length, 2);
  assert.equal(privacyEvent(skillEvent(), ctx).eventId, privacyEvent(skillEvent(), ctx).eventId);
});
test('call IDs absent: do not merge legitimate distinct loads', () => {
  const e = skillEvent(); delete e.toolCallId;
  assert.notEqual(privacyEvent(e, ctx).eventId, privacyEvent(e, ctx).eventId);
});
test('handler returns immediately; errors are caught and logged as fixed codes once', async () => {
  const h = harness({ readAllowlist: async () => { throw new Error('SECRET /local/path'); } });
  assert.equal(h.handler(skillEvent('1'), ctx), undefined);
  h.handler(skillEvent('2'), ctx); await h.drain();
  assert.deepEqual(h.logs, ['afp-skill-observer: ALLOWLIST_READ_FAILED']);
  assert.equal(h.writes.length, 0);
  const broken = harness({ append: async () => { throw new Error('SECRET'); } });
  broken.handler(skillEvent(), ctx); await broken.drain();
  assert.deepEqual(broken.logs, ['afp-skill-observer: EVENT_APPEND_FAILED']);
});
test('queue is bounded without blocking tools', async () => {
  const h = harness();
  for (let i = 0; i < LIMITS.pending + 2; i++) h.handler(skillEvent(String(i)), ctx);
  await h.drain();
  assert.equal(h.writes.length, LIMITS.pending);
  assert.deepEqual(h.logs, ['afp-skill-observer: QUEUE_LIMIT']);
});
test('strict private-path config and bounded allowlist shape', () => {
  assert.deepEqual(validateConfig(config), config);
  for (const invalid of [{}, { ...config, eventsPath: config.allowlistPath }, { ...config, eventsPath: 'relative' },
    { ...config, token: 'SECRET' }, { ...config, eventsPath: new URL('../plugin/events.jsonl', import.meta.url).pathname }]) {
    assert.throws(() => validateConfig(invalid), /INVALID_CONFIG/u);
  }
  assert.deepEqual([...parseAllowlist([sessionKey])], [sessionKey]);
  assert.deepEqual([...parseAllowlist([])], []);
  for (const invalid of [['bad'], { sessionKeys: [sessionKey] }, [sessionKey, 123],
    Array(LIMITS.sessions + 1).fill(sessionKey)]) assert.throws(() => parseAllowlist(invalid), /INVALID_ALLOWLIST/u);
});
test('supported plugin registers only observing hook with canonical tool matcher', () => {
  let registration;
  plugin.register({ pluginConfig: config, logger: { warn() {} }, on: (...args) => { registration = args; } });
  assert.equal(registration[0], 'after_tool_call');
  assert.equal(typeof registration[1], 'function');
  assert.deepEqual(registration[2], { matcher: ['skills_read', 'read'] });
});
