// Original HSG Battle Arena synthesis by OpenClaw game-sound-designer, 2026-10-20; no samples.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ACTION_SOUNDS } from '../../app.js';

const RATE = 24000;
const TAU = 2 * Math.PI;
const sine = (frequency, t) => Math.sin(TAU * frequency * t);
const durations = { attack: .22, defend: .36, heal: .60, special: .70 };
// Finite harmonics keep the chip texture below Nyquist, rather than aliasing a hard square.
const pulse = phase => {
  let value = 0;
  for (let n = 1; n <= 5; n++) value += 2 * Math.sin(Math.PI * n * .25) / (Math.PI * n) * Math.cos(TAU * n * phase - Math.PI * n * .25);
  return value;
};
const triangle = phase => Math.sin(TAU * phase) - Math.sin(TAU * 3 * phase) / 9 + Math.sin(TAU * 5 * phase) / 25;
const envelope = (t, length, attack, release) => t < 0 || t >= length ? 0 : Math.min(1, t / attack, (length - t) / release);

export function buildSound(move) {
  if (!Object.hasOwn(durations, move)) throw new Error('Unknown sound: ' + move);
  let seed = 0x485347, filteredNoise = 0;
  const noise = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    filteredNoise = .5 * filteredNoise + .5 * ((seed >>> 0) / 2147483648 - 1);
    return filteredNoise;
  };
  const duration = durations[move];
  const samples = new Float64Array(Math.round(duration * RATE));
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / RATE;
    let value;
    if (move === 'attack') {
      // Pixel strike: one dry 900 -> 220 Hz pulse sweep, with a tiny contact crack.
      const phase = 900 * t - 680 / (2 * duration) * t * t;
      value = pulse(phase) * Math.exp(-t * 13) + .18 * noise() * Math.exp(-t * 150);
    } else if (move === 'defend') {
      // Shield lock: two metallic ticks 55 ms apart, not another descending impact.
      value = [1200, 1800].reduce((sum, hz, j) => {
        const u = t - j * .055;
        return sum + (sine(hz, u) + .28 * sine(hz * 2.37, u)) *
          envelope(u, .28, .002, .025) * Math.exp(-Math.max(0, u) * 24) * (j ? .85 : 1);
      }, 0);
    } else if (move === 'heal') {
      // Restore sparkle: three soft C5/E5/G5 triangle notes at 120 ms intervals.
      value = [523.25, 659.25, 783.99].reduce((sum, hz, j) => {
        const u = t - j * .12;
        return sum + triangle(hz * u) * envelope(u, .36, .012, .045) * Math.exp(-Math.max(0, u) * 13);
      }, 0);
    } else {
      // Charged overdrive: 150 ms rising pulse, then a controlled burst/stepped tail.
      const charge = pulse(350 * t + 1450 / .30 * t * t) * envelope(t, .15, .006, .012);
      const u = Math.max(0, t - .15);
      const phase = 700 * Math.min(u, .06) + 523.25 * Math.max(0, Math.min(u - .06, .07)) +
        392 * Math.max(0, Math.min(u - .13, .08)) + 250 * Math.max(0, u - .21);
      const burst = (pulse(phase) + .42 * noise() * Math.exp(-u * 22)) *
        envelope(t - .15, .55, .006, .035) * Math.exp(-u * 12);
      value = .48 * charge + burst;
    }
    // Fade both sample boundaries; all rendering/level balancing is offline, not a mixer change.
    value *= Math.min(1, t / .002, (samples.length - 1 - i) / (RATE * .025));
    samples[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i] / peak * .8 * 32767), 44 + i * 2);
  return wav;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [move, url] of Object.entries(ACTION_SOUNDS)) {
    const destination = new URL(url, new URL('../../app.js', import.meta.url));
    const wav = buildSound(move);
    await writeFile(destination, wav);
    console.log(move + ': ' + destination.pathname + ' (' + wav.length + ' bytes)');
  }
}
