import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/admin.js', import.meta.url), 'utf8');
// Run the real polling code without requiring experimental VM module support.
const script = source.replace("import { FIGHTER_DISPLAY_NAMES } from './fighter-data.js';", '');
assert.notEqual(script, source, 'admin module import must be handled explicitly');
const dto = activeRooms => ({
  serverNow: 100000,
  summary: { activeRooms, runningBattles: 0, playersOnline: 0, roomsUsed: activeRooms, roomCapacity: 50 },
  rooms: []
});
const response = data => ({ status: 200, ok: true, json: () => Promise.resolve(data) });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
// Drain fetch, race, JSON and finally microtasks between fake timer callbacks.
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function fixture() {
  let now = 100000, nextTimer = 0;
  const timers = new Map(), nodes = new Map(), listeners = new Map();
  const requests = [];
  const node = () => ({
    textContent: '', dataset: {}, hidden: false, value: '', children: [],
    listeners: new Map(),
    addEventListener(type, callback) { this.listeners.set(type, callback); },
    setAttribute() {}, focus() {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; }
  });
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, node());
    return nodes.get(id);
  };
  const document = {
    hidden: false, getElementById: get,
    createElement: node, createDocumentFragment: node,
    addEventListener(type, callback) { listeners.set(type, callback); }
  };
  vm.runInNewContext(script, {
    document, AbortController, FIGHTER_DISPLAY_NAMES: {},
    Date: class extends Date { static now() { return now; } },
    sessionStorage: new Proxy({}, { get() { throw new Error('Public overview must not access credentials'); } }),
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    // Deliberately ignore abort: late network/body completion must be harmless.
    fetch(url, options) {
      const pending = deferred();
      requests.push({ ...pending, url, ...options, startedAt: now });
      return pending.promise;
    }
  }, { filename: 'admin.js' });
  return {
    get, requests,
    timerDelays: () => [...timers.values()].map(timer => timer.at - now).sort((a, b) => a - b),
    async advance(ms) {
      const target = now + ms;
      await flush();
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.at;
        timers.delete(id);
        timer.callback();
        await flush();
      }
      now = target;
      await flush();
    },
    async visible(visible) {
      document.hidden = !visible;
      listeners.get('visibilitychange')();
      await flush();
    }
  };
}

async function seedSnapshot(f) {
  await f.advance(0);
  f.requests[0].resolve(response(dto(3)));
  await flush();
  assert.equal(f.get('active-rooms').textContent, 3);
  assert.equal(f.get('connection').dataset.state, 'connected');
  assert.deepEqual(f.timerDelays(), [2000]);
  await f.advance(2000);
  assert.equal(f.requests.length, 2);
}

test('stalled fetch aborts at 10 seconds, retains stale data and retries with exponential backoff', async () => {
  const f = fixture();
  await seedSnapshot(f);
  const stalled = f.requests[1];
  await f.advance(9999);
  assert.equal(stalled.signal.aborted, false);
  assert.equal(f.requests.length, 2, 'no overlapping request before timeout');
  await f.advance(1);
  assert.equal(stalled.signal.aborted, true);
  assert.equal(f.get('active-rooms').textContent, 3);
  assert.equal(f.get('connection').textContent, 'Reconnecting · data stale');
  assert.equal(f.get('updated').textContent, 'Last update is stale');
  assert.deepEqual(f.timerDelays(), [2000]);
  await f.advance(1999);
  assert.equal(f.requests.length, 2);
  await f.advance(1);
  assert.equal(f.requests.length, 3);
  await f.advance(10000);
  assert.equal(f.requests[2].signal.aborted, true);
  assert.deepEqual(f.timerDelays(), [4000]);
  await f.advance(3999);
  assert.equal(f.requests.length, 3);
  await f.advance(1);
  assert.equal(f.requests.length, 4);
  f.requests[3].resolve(response(dto(4)));
  await flush();
  assert.equal(f.get('connection').dataset.state, 'connected');
  assert.equal(f.get('active-rooms').textContent, 4);
  assert.deepEqual(f.timerDelays(), [2000], 'success resets failure backoff');
  await f.visible(false);
});

test('stalled response.json shares the original 10-second deadline with fetch', async () => {
  const f = fixture();
  await seedSnapshot(f);
  const request = f.requests[1], body = deferred();
  let jsonCalls = 0;
  await f.advance(6000);
  request.resolve({ status: 200, ok: true, json() { jsonCalls++; return body.promise; } });
  await flush();
  assert.equal(jsonCalls, 1);
  assert.deepEqual(f.timerDelays(), [4000], 'headers do not restart the deadline');
  await f.advance(3999);
  assert.equal(request.signal.aborted, false);
  await f.advance(1);
  assert.equal(request.signal.aborted, true);
  assert.equal(f.get('connection').dataset.state, 'reconnecting');
  assert.equal(f.get('active-rooms').textContent, 3);
  assert.deepEqual(f.timerDelays(), [2000]);
  body.resolve(dto(99));
  await flush();
  assert.equal(f.get('active-rooms').textContent, 3, 'late JSON cannot overwrite stale snapshot');
  assert.equal(f.get('connection').dataset.state, 'reconnecting');
  await f.advance(2000);
  assert.equal(f.requests.length, 3, 'stalled body does not block retry');
  await f.visible(false);
});

test('late fetch completion after timeout cannot render or interfere with a newer poll', async () => {
  const f = fixture();
  await seedSnapshot(f);
  const old = f.requests[1];
  await f.advance(12000);
  assert.equal(f.requests.length, 3);
  let jsonCalls = 0;
  old.resolve({ status: 200, ok: true, json() { jsonCalls++; return Promise.resolve(dto(99)); } });
  await flush();
  assert.equal(jsonCalls, 0, 'timed-out response body is never consumed');
  assert.equal(f.get('active-rooms').textContent, 3);
  assert.equal(f.get('connection').dataset.state, 'reconnecting');
  assert.deepEqual(f.timerDelays(), [10000], 'old completion cannot replace the new deadline');
  f.requests[2].resolve(response(dto(5)));
  await flush();
  assert.equal(f.get('active-rooms').textContent, 5);
  assert.equal(f.get('connection').dataset.state, 'connected');
  await f.visible(false);
});

for (const stage of ['fetch', 'json']) {
  test('hiding the tab clears a pending ' + stage + ' deadline and resumes with one fresh poll', async () => {
    const f = fixture();
    await f.advance(0);
    const request = f.requests[0], body = deferred();
    if (stage === 'json') {
      request.resolve({ status: 200, ok: true, json: () => body.promise });
      await flush();
    }
    await f.advance(1000);
    await f.visible(false);
    assert.equal(request.signal.aborted, true);
    assert.equal(f.get('connection').dataset.state, 'paused');
    assert.deepEqual(f.timerDelays(), [], 'visibility abort clears the request deadline');
    if (stage === 'fetch') request.resolve(response(dto(99)));
    else body.resolve(dto(99));
    await f.advance(60000);
    assert.equal(f.requests.length, 1);
    assert.equal(f.get('connection').dataset.state, 'paused');
    assert.notEqual(f.get('active-rooms').textContent, 99);
    await f.visible(true);
    await f.advance(0);
    assert.equal(f.requests.length, 2);
    assert.deepEqual(f.timerDelays(), [10000]);
    f.requests[1].resolve(response(dto(2)));
    await flush();
    assert.equal(f.get('active-rooms').textContent, 2);
    await f.visible(false);
  });

}

test('overview starts anonymously without login, credential storage or authorization headers', async () => {
  const f = fixture();
  assert.equal(f.requests.length, 0);
  assert.deepEqual(f.timerDelays(), [0]);
  await f.advance(0);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, '/game/api/admin/overview');
  assert.equal(f.requests[0].cache, 'no-store');
  assert.equal(f.requests[0].headers, undefined);
  assert.deepEqual([...f.get('overview').listeners.keys()], []);
  f.requests[0].resolve(response(dto(0)));
  await flush();
  assert.equal(f.get('room-message').textContent, 'No battles right now');
  await f.visible(false);
});

test('rendering preserves authoritative countdown/running, lobby and finished ordering, not client sorting', async () => {
  const f = fixture();
  await f.advance(0);
  const rooms = [[3, 'countdown'], [4, 'running'], [1, 'lobby'], [2, 'finished']]
    .map(([roomNumber, phase]) => ({ roomNumber, phase, mode: 'groups', playerCount: 0, fighters: {} }));
  f.requests[0].resolve(response({ ...dto(3), rooms }));
  await flush();
  const labels = () => Array.from(f.get('rooms').children[0].children, card => card.children[0].children[0].textContent);
  assert.deepEqual(labels(), ['Room 3', 'Room 4', 'Room 1', 'Room 2']);
  await f.advance(2000);
  f.requests[1].resolve(response({ ...dto(3), rooms: [rooms[0], rooms[2], { ...rooms[1], phase: 'lobby' }, rooms[3]] }));
  await flush();
  assert.deepEqual(labels(), ['Room 3', 'Room 1', 'Room 4', 'Room 2'], 'phase changes never relabel rooms');
  await f.visible(false);
});

test('429 respects Retry-After across visibility changes and resets backoff after recovery', async () => {
  const f = fixture();
  await seedSnapshot(f);
  f.requests[1].resolve({ status: 429, ok: false, headers: { get: key => key === 'Retry-After' ? '7' : null } });
  await flush();
  assert.equal(f.get('connection').dataset.state, 'throttled');
  assert.equal(f.get('active-rooms').textContent, 3);
  assert.equal(f.get('updated').textContent, 'Last update is stale');
  assert.deepEqual(f.timerDelays(), [7000]);
  await f.advance(1000); await f.visible(false); await f.visible(true);
  assert.deepEqual(f.timerDelays(), [6000]);
  await f.advance(5999); assert.equal(f.requests.length, 2);
  await f.advance(1); assert.equal(f.requests.length, 3);
  f.requests[2].resolve({ status: 429, ok: false, headers: { get: () => 'invalid' } });
  await flush();
  assert.deepEqual(f.timerDelays(), [4000], 'invalid Retry-After falls back to exponential backoff');
  await f.advance(4000);
  f.requests[3].resolve(response(dto(4))); await flush();
  assert.deepEqual(f.timerDelays(), [2000]);
  assert.equal(f.get('connection').dataset.state, 'connected');
  await f.visible(false);
});

test('non-200 responses reconnect without an obsolete login flow; backoff caps at 60 seconds', async () => {
  const f = fixture();
  await f.advance(0);
  for (const delay of [2000, 4000, 8000, 16000, 32000, 60000, 60000]) {
    f.requests.at(-1).resolve({ status: 401, ok: false });
    await flush();
    assert.equal(f.get('connection').dataset.state, 'reconnecting');
    assert.equal(f.get('updated').textContent, 'Awaiting first update');
    assert.deepEqual(f.timerDelays(), [delay]);
    await f.advance(delay);
  }
  await f.visible(false);
});
