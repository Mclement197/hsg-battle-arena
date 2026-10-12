import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const origin = process.argv[2] || 'http://127.0.0.1:18891';
assert.ok(['http://127.0.0.1:18891', 'https://afp.mclement.ch'].includes(origin), 'Unrecognized test origin');
const configPath = process.env.AFP_USAGE_CONFIG || join(homedir(), '.config/afp-usage/config.json');
const text = await readFile(join(dirname(configPath), 'sign-in.txt'), 'utf8');
const credential = text.split('Passphrase: ')[1]?.split(String.fromCharCode(10))[0];
assert.ok(credential && credential.length >= 32, 'Private sign-in file is missing or invalid');
const base = origin + '/usage';
const health = await fetch(base + '/healthz');
assert.equal(health.status, 200);
const anonymous = await fetch(base + '/api/usage');
assert.equal(anonymous.status, 401);
const login = await fetch(base + '/api/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ password: credential })
});
assert.equal(login.status, 200);
const header = login.headers.get('set-cookie');
assert.ok(header?.includes('Secure') && header.includes('HttpOnly') && header.includes('SameSite=Strict'));
const cookie = header.split(';')[0];
const response = await fetch(base + '/api/usage', { headers: { Cookie: cookie } });
assert.equal(response.status, 200);
const data = await response.json();
assert.equal(data.schemaVersion, 1);
assert.ok(data.daily.length > 0, 'No measured usage available');
assert.ok(!JSON.stringify(data).includes('agent:main:'), 'Private session identifier escaped projection');
const logout = await fetch(base + '/api/logout', { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
assert.equal(logout.status, 200);
assert.ok(logout.headers.get('set-cookie')?.includes('Max-Age=0'));
console.log(JSON.stringify({ origin, health: health.status, anonymous: anonymous.status, login: login.status, authenticated: response.status, logout: logout.status, generatedAt: data.generatedAt, sessions: data.coverage.sessions, models: data.daily.map(row => row.model), activities: data.requests.length, skills: data.skills.map(row => ({ name: row.name, count: row.count })) }));
