import test from 'node:test';
import assert from 'node:assert/strict';
import { executeUntilClosed, CHILD_KILL_GRACE_MS } from '../src/process-reader.mjs';
import { createSharedGatewayReader } from '../src/live-usage.mjs';
const alive = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };

test('canceling SIGTERM-resistant real child keeps serialized slot until physical close', async () => {
  const controller = new AbortController(); let firstPid, overlapping = false, child, ready, closed = false;
  const started = new Promise(resolve => { ready = resolve; });
  const reader = createSharedGatewayReader(async method => {
    if (method === 'sessions.list') {
      overlapping = alive(firstPid);
      assert.equal(closed, true, 'actual close event must precede next process creation');
      return await executeUntilClosed(process.execPath, ['-e', 'console.log(process.pid)'], { timeout: 2000 });
    }
    const work = executeUntilClosed(process.execPath,
      ['-e', "process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)"],
      { timeout: 2000, maxBuffer: 1024, signal: controller.signal });
    child = work.child;
    child.once('close', () => { closed = true; });
    child.stdout.once('data', chunk => { firstPid = Number(String(chunk).trim()); ready(); });
    return await work;
  });
  try {
    const first = reader('usage.cost', {}, { signal: controller.signal }); const rejected = assert.rejects(first);
    await started; const second = reader('sessions.list', {}); const start = Date.now(); controller.abort();
    const result = await second; await rejected;
    assert.equal(overlapping, false); assert.equal(alive(firstPid), false);
    assert.ok(Number(result.stdout.trim()) > 0, 'second harmless real child ran');
    assert.ok(Date.now() - start >= CHILD_KILL_GRACE_MS - 20, 'SIGTERM resistance required escalation');
  } finally { child?.kill('SIGKILL'); }
});

test('pre-aborted commands do not spawn; timeout escalates and output is bounded', async () => {
  const controller = new AbortController(); controller.abort();
  const denied = executeUntilClosed(process.execPath, ['-e', 'process.exit(0)'], { signal: controller.signal });
  assert.equal(denied.child, undefined); await assert.rejects(denied);
  const timed = executeUntilClosed(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { timeout: 100 });
  await assert.rejects(timed); assert.equal(alive(timed.child.pid), false);
  const large = executeUntilClosed(process.execPath, ['-e', "process.on('SIGTERM',()=>{});console.log('x'.repeat(4096));setInterval(()=>{},1000)"], { timeout: 2000, maxBuffer: 1024 });
  await assert.rejects(large); assert.equal(alive(large.child.pid), false);
  await assert.rejects(executeUntilClosed('/definitely-not-an-executable', [], { timeout: 100 }));
});


test('shared reader shutdown joins resistant physical child close and rejects queued work', async () => {
  let child, ready, starts = 0; const started = new Promise(resolve => { ready = resolve; });
  const reader = createSharedGatewayReader(async (_, __, signal) => {
    starts++; const work = executeUntilClosed(process.execPath,
      ['-e', "process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"], { signal, timeout: 2000 });
    child = work.child; child.stdout.once('data', ready); return await work;
  });
  try {
    const first = reader('usage.cost', {}); const firstError = assert.rejects(first); await started;
    const queued = reader('sessions.list', {}); const queueError = assert.rejects(queued);
    await reader.close(); await firstError; await queueError;
    assert.equal(starts, 1); assert.equal(alive(child.pid), false);
    await assert.rejects(reader('usage.cost', {}), /busy/);
  } finally { child?.kill('SIGKILL'); }
});
