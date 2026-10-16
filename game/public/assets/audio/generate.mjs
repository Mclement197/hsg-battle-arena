// Original synthesis, no samples or dependencies. Run from any working directory.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ACTION_SOUNDS } from '../../app.js';

const RATE = 24000;
const TAU = 2 * Math.PI;
const sine = (frequency, t) => Math.sin(TAU * frequency * t);
const durations = { attack: .34, defend: .62, heal: 1.04, special: .86 };

export function buildSound(move) {
  if (!Object.hasOwn(durations, move)) throw new Error('Unknown sound: ' + move);
  let seed = 0x485347;
  const noise = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 2147483648 - 1;
  };
  const duration = durations[move];
  const samples = new Float64Array(Math.round(duration * RATE));
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / RATE;
    let value;
    if (move === 'attack') {
      // Fast descending body plus a short broadband contact crack.
      const phase = 65 * t + 150 * .035 * (1 - Math.exp(-t / .035));
      value = Math.sin(TAU * phase) * Math.exp(-t * 17) + .55 * noise() * Math.exp(-t * 48);
    } else if (move === 'defend') {
      // Inharmonic resonances distinguish a metal shield from the bass impact.
      value = [730, 1171, 1863, 2927].reduce((sum, hz, j) =>
        sum + sine(hz, t) * Math.exp(-t * (7 + j * 3)) / (j + 1), 0);
      value += .25 * noise() * Math.exp(-t * 90);
    } else if (move === 'heal') {
      // Ascending C-E-G chimes, each with a softer octave overtone.
      value = [523.25, 659.25, 783.99].reduce((sum, hz, j) => {
        const u = t - j * .16;
        return u < 0 ? sum : sum + (sine(hz, u) + .25 * sine(hz * 2, u)) *
          Math.min(1, u / .012) * Math.exp(-u * 5);
      }, 0);
    } else {
      // Energy charge rising into a modulated noisy burst and low-frequency tail.
      const charge = Math.sin(TAU * (140 * t + 1700 * t * t)) * Math.exp(-t * 6);
      const u = Math.max(0, t - .18);
      const burst = t < .18 ? 0 : (noise() * (.65 + .35 * sine(42, u)) +
        .75 * Math.sin(TAU * (90 * u + 55 * .06 * (1 - Math.exp(-u / .06))))) *
        Math.min(1, u / .006) * Math.exp(-u * 8);
      value = .5 * charge + burst;
    }
    // Short edge fades prevent sample boundary clicks, including the final frame.
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
