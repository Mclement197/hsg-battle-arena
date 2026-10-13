import { execFile } from 'node:child_process';

export const CHILD_KILL_GRACE_MS = 500;

// An abort/error receipt is not physical exit: release the shared child slot only on CLOSE.
export function executeUntilClosed(command, args, {
  timeout = 4000, maxBuffer = 1048576, signal, ...options
} = {}) {
  if (signal?.aborted) return Promise.reject(new Error('Reporting read canceled'));
  let child;
  const completion = new Promise((resolve, reject) => {
    let failure, output, timer, escalation, stopping = false;
    child = execFile(command, args, { ...options, timeout: 0, maxBuffer, killSignal: 'SIGKILL' },
      (error, stdout, stderr) => { failure ??= error; output = { stdout, stderr }; });
    function stop() {
      if (stopping) return;
      stopping = true; failure ??= new Error('Reporting read canceled or timed out');
      child.kill('SIGTERM');
      escalation = setTimeout(() => child.kill('SIGKILL'), CHILD_KILL_GRACE_MS);
    }
    child.once('error', error => { failure ??= error; stop(); });
    child.once('close', () => {
      clearTimeout(timer); clearTimeout(escalation); signal?.removeEventListener('abort', stop);
      if (failure) reject(failure); else resolve(output);
    });
    signal?.addEventListener('abort', stop, { once: true });
    // Abort can race listener admission, but never releases the physical-child owner.
    if (signal?.aborted) stop();
    if (timeout > 0) timer = setTimeout(stop, timeout);
  });
  return Object.assign(completion, { child });
}
