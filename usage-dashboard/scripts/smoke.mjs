import assert from 'node:assert/strict';
import { publicSnapshot } from '../src/handler.mjs';

const origin = process.argv[2] || 'http://127.0.0.1:18891';
assert.ok(['http://127.0.0.1:18891', 'https://afp.mclement.ch'].includes(origin), 'Unrecognized test origin');
const base = origin + '/usage';
const health = await fetch(base + '/healthz');
assert.equal(health.status, 200);
const page = await fetch(base);
assert.equal(page.status, 200);
assert.doesNotMatch(await page.text(), /login-form|logout-button|type="password"/);
const pages = ['/models', '/agents', '/skills', '/activity', '/graft'];
for (const path of pages) {
  const result = await fetch(base + path);
  assert.equal(result.status, 200, 'Page route ' + path);
  assert.match(await result.text(), /id="app-shell"/, 'Dashboard shell for ' + path);
}
const script = await fetch(base + '/app.js');
assert.equal(script.status, 200);
assert.doesNotMatch(await script.text(), /api\/login|api\/logout|showLogin/);
const response = await fetch(base + '/api/usage', { credentials: 'omit' });
assert.equal(response.status, 200);
assert.equal(response.headers.get('set-cookie'), null);
assert.equal(response.headers.get('cache-control'), 'no-store');
const data = await response.json();
assert.deepEqual(data, publicSnapshot(data));
assert.ok(data.daily.length > 0, 'No measured usage available');
assert.doesNotMatch(JSON.stringify(data), new RegExp('agent:[a-z0-9_-]+:|/home/'), 'Private identifier or path escaped projection');
for (const path of ['/auth.json', '/sign-in.txt', '/config.json']) {
  assert.equal((await fetch(base + path)).status, 404);
}
for (const path of ['/api/login', '/api/logout']) {
  assert.equal((await fetch(base + path, { method: 'POST' })).status, 404);
}
console.log(JSON.stringify({ origin, health: health.status, page: page.status, pages: pages.length + 1, anonymous: response.status, authEndpoints: 'removed', privateFiles: 'not served', generatedAt: data.generatedAt, sessions: data.coverage.sessions, models: data.daily.map(row => row.model), activities: data.requests.length, skills: data.skills.map(row => ({ name: row.name, count: row.count })) }));
