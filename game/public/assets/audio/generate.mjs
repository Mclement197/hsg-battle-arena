// Original HSG Battle Arena synthesis by OpenClaw game-sound-designer, 2026-10-20; no samples.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ACTION_SOUNDS, THEMED_ACTION_SOUNDS } from '../../app.js';

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

// Original synthesized material metaphors, not recordings, brand sounds or pitch-shifted fallbacks.
export const NAMED_DURATIONS = Object.freeze({
  'luca-di-grazia': [.24, .34, .52, .70],
  'free-rider': [.26, .34, .56, .70],
  tryhard: [.24, .32, .52, .66],
  'assessment-hoodie': [.28, .34, .56, .70],
  'trischli-warrior': [.30, .36, .54, .72],
  'bad-teacher': [.24, .36, .56, .68]
});

export function buildNamedSound(characterId, move) {
  const key = characterId + ':' + move, index = Object.keys(ACTION_SOUNDS).indexOf(move);
  if (!Object.hasOwn(THEMED_ACTION_SOUNDS, key)) throw new Error('Unknown named sound: ' + key);
  const samples = new Float64Array(Math.round(NAMED_DURATIONS[characterId][index] * RATE));
  let seed = 0x485347;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2147483648 - 1; };
  const layer = (start, length, amplitude, attack, decay, signal) => {
    for (let i = Math.round(start * RATE), end = Math.min(samples.length, Math.round((start + length) * RATE)); i < end; i++) {
      const t = i / RATE - start;
      samples[i] += amplitude * signal(t) * envelope(t, length, attack, Math.min(.035, length / 3)) * Math.exp(-t * decay);
    }
  };
  const tone = (start, length, from, to, amplitude = 1, decay = 12, texture = 'round') =>
    layer(start, length, amplitude, .003, decay, t => {
      const phase = from * t + (to - from) * t * t / (2 * length);
      return texture === 'pulse' ? pulse(phase) : texture === 'glass' ?
        Math.sin(TAU * phase) + .24 * Math.sin(TAU * phase * 2.71) + .09 * Math.sin(TAU * phase * 4.13) :
        Math.sin(TAU * phase) + .12 * Math.sin(TAU * phase * 2);
    });
  // Band-shaped seeded noise: paper/chalk/fabric texture lives in phone-readable midrange.
  const friction = (start, length, amplitude = 1, cutoff = 2200, decay = 12, flutter = 0) => {
    let low = 0, bass = 0;
    const a = 1 - Math.exp(-TAU * cutoff / RATE), b = 1 - Math.exp(-TAU * 350 / RATE);
    layer(start, length, amplitude, .004, decay, t => {
      low += a * (random() - low); bass += b * (low - bass);
      return (low - bass) * (flutter ? .65 + .35 * Math.sin(TAU * flutter * t) : 1);
    });
  };
  const notes = (frequencies, gap = .1, start = 0, texture = 'round') =>
    frequencies.forEach((hz, i) => tone(start + i * gap, .26, hz, hz, .7, 10, texture));
  const stamp = (start, hz = 520) => { friction(start, .075, .65, 2600, 35); tone(start, .20, hz, hz * .68, 1, 24); };
  const charge = (from = 450, to = 1500, length = .15) => tone(0, length, from, to, .45, 0, 'pulse');

  switch (key) {
    case 'luca-di-grazia:attack': // Golden Chalk: striated chalk grain, contact, gold glint.
      friction(0, .15, 1, 3600, 8, 85); stamp(.055, 700); tone(.07, .17, 1550, 1300, .30, 17, 'glass'); break;
    case 'luca-di-grazia:defend': // Open Book: opening leaves, then two binding resonances.
      friction(0, .16, .85, 1900, 8, 24); tone(.04, .25, 600, 600, .8, 16);
      friction(.075, .15, .5, 2500, 16); tone(.10, .22, 900, 900, .55, 17); break;
    case 'luca-di-grazia:heal': // Good Work: soft approval tap and warm affirmative rise.
      tone(0, .065, 480, 550, .3, 20); notes([523.25, 659.25, 783.99], .105, .035, 'glass'); break;
    case 'luca-di-grazia:special': // Full Marks: gold shimmer, substantial stamp, marked-paper release.
      charge(500, 1600); friction(.06, .12, .3, 3400, 9, 40); stamp(.16, 700);
      notes([1046.5, 1318.5, 1568], .055, .20, 'glass'); friction(.32, .25, .25, 1800, 12); break;
    case 'free-rider:attack': // Copy / Paste: recognizable repeated digital gesture, stronger second click.
      tone(0, .07, 900, 900, .65, 20, 'pulse'); tone(.065, .12, 900, 900, 1, 20, 'pulse');
      friction(.065, .07, .3, 3200, 35); tone(.11, .14, 1350, 700, .3, 18); break;
    case 'free-rider:defend': // Paper Decoy: fluttering thin paper with a hollow double lock.
      friction(0, .19, 1.1, 3100, 8, 32); tone(.035, .20, 800, 500, .6, 20);
      friction(.075, .13, .55, 2200, 15, 45); tone(.10, .21, 1100, 800, .45, 18); break;
    case 'free-rider:heal': // Group Credit: separate small contributions converge to one reward.
      notes([659.25, 783.99, 1046.5], .11, .015); tone(.25, .28, 523.25, 523.25, .35, 9, 'glass'); break;
    case 'free-rider:special': // AI Slop: orderly computation becomes a synthetic garbled splat.
      charge(600, 1400); [0, .06, .10, .13].forEach((s, i) => tone(s, .055, 700 + i * 170, 700 + i * 170, .4, 15, 'pulse'));
      friction(.17, .32, .9, 2700, 9, 73);
      [850, 630, 960, 450].forEach((hz, i) => tone(.17 + i * .055, .16, hz, hz * .65, .6, 17, 'pulse')); break;
    case 'tryhard:attack': // Formula: calculator-like calculation, then a dry precise answer.
      [700, 1050, 700].forEach((hz, i) => tone(i * .045, .11, hz, hz, .8, 22, 'pulse')); friction(.09, .06, .5, 2600, 30); break;
    case 'tryhard:defend': // Textbook: heavier cover clap, crisp binding catch.
      stamp(0, 480); friction(0, .10, .8, 1700, 25); tone(.065, .22, 1000, 850, .7, 19); break;
    case 'tryhard:heal': // Extra Credit: accelerating earned-point increments.
      [587.33, 739.99, 880].forEach((hz, i) => tone([0, .12, .21][i], .28, hz, hz, .8, 10));
      tone(.29, .20, 1174.66, 1174.66, .20, 14, 'glass'); break;
    case 'tryhard:special': // A+: precise score buildup, bright grade payoff, not a win fanfare.
      charge(800, 1800, .13); [0, .04, .075].forEach(s => tone(s, .06, 950, 950, .3, 15));
      stamp(.14, 850); tone(.15, .42, 1760, 1760, .65, 10, 'glass'); tone(.23, .32, 1320, 1320, .4, 11); break;
    case 'assessment-hoodie:attack': // Bad Luck: unstable fall and a short midrange lightning crack.
      tone(0, .19, 950, 380, .8, 9, 'pulse'); friction(.055, .12, 1, 4200, 23, 97);
      tone(.085, .18, 460, 300, .5, 20); break;
    case 'assessment-hoodie:defend': // Hood Up: low cloth swish, paired protective tucks.
      friction(0, .20, 1, 1250, 6, 19); tone(.055, .20, 650, 580, .65, 20);
      friction(.11, .18, .7, 1700, 15); tone(.12, .20, 850, 780, .45, 19); break;
    case 'assessment-hoodie:heal': // Take Hoodie Off: cloth peel opens into an airy recovery rise.
      friction(0, .23, 1, 1900, 7, 15); notes([450, 675, 900], .105, .075);
      friction(.23, .27, .25, 3200, 10); break;
    case 'assessment-hoodie:special': // Skip Maths A Lecture: classroom ticks, skipping exit accents.
      charge(600, 1400, .14); tone(0, .07, 620, 620, .4, 20); tone(.08, .07, 620, 620, .4, 20);
      friction(.15, .15, .7, 2000, 10);
      [800, 1050, 1400].forEach((hz, i) => tone([.16, .28, .34][i], .25, hz, hz * 1.15, .75, 12)); break;
    case 'trischli-warrior:attack': // Dance Off: syncopated footwork and a compact clap.
      tone(0, .14, 520, 340, 1, 21); tone(.085, .15, 750, 490, .8, 21);
      friction(.15, .12, .85, 2600, 20, 80); break;
    case 'trischli-warrior:defend': // Call the Bouncer: call chirp answered by weighty two-step guard.
      tone(0, .065, 1100, 1300, .45, 15); tone(.065, .065, 1300, 1100, .4, 15);
      stamp(.13, 500); tone(.195, .15, 750, 650, .7, 20); break;
    case 'trischli-warrior:heal': // Glass of Water: three rounded liquid drops and a restrained glass glint.
      [600, 800, 1000].forEach((hz, i) => tone(i * .095, .23, hz * 1.35, hz, .8, 14));
      friction(.03, .15, .15, 1400, 15); tone(.24, .25, 1600, 1600, .25, 13, 'glass'); break;
    case 'trischli-warrior:special': // Throw a Beer: fizzy flight, broad splash, small bouncing bubbles.
      charge(500, 1500, .16); friction(0, .16, .35, 3600, 2, 52);
      friction(.17, .33, 1, 2300, 8, 23); tone(.17, .30, 650, 420, .7, 15);
      [800, 1150, 700].forEach((hz, i) => tone(.25 + i * .075, .16, hz * 1.3, hz, .35, 19)); break;
    case 'bad-teacher:attack': // Red Pen: sharp scratch and a clipped correction mark.
      friction(0, .11, 1, 4300, 12, 130); tone(.035, .18, 1400, 650, .65, 20);
      friction(.065, .05, .45, 2800, 30); break;
    case 'bad-teacher:defend': // Curved Exam: paper flex and two springy bowed locking accents.
      friction(0, .20, .9, 2200, 8, 22); tone(.02, .12, 650, 950, .65, 12);
      tone(.095, .23, 950, 650, .7, 14); friction(.10, .12, .4, 1700, 18); break;
    case 'bad-teacher:heal': // Brian AI: learning-interface taps -> correct-answer chime; no robot/brand imitation.
      tone(0, .065, 650, 650, .35, 22); tone(.07, .065, 850, 850, .35, 22);
      notes([659.25, 830.61, 1108.73], .095, .15, 'glass'); break;
    case 'bad-teacher:special': // Failed: tense preparation cut by a decisive rejection stamp.
      charge(500, 1200, .15); stamp(.16, 700);
      tone(.18, .24, 700, 500, .7, 12, 'pulse'); tone(.29, .30, 500, 350, .7, 13, 'pulse');
      friction(.16, .09, .7, 2300, 25); break;
  }
  // Remove DC before the click-free boundary fades; constrain short-window energy offline.
  const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) { samples[i] -= mean; peak = Math.max(peak, Math.abs(samples[i])); }
  let energy = 0, maxWindow = 0, limitedPeak = 0, previous = 0, high = 0;
  for (let i = 0; i < samples.length; i++) {
    const fade = Math.min(1, i / (RATE * .003), (samples.length - 1 - i) / (RATE * .025));
    const shaped = Math.tanh(samples[i] / peak * 2.2);
    high = .99 * (high + shaped - previous); previous = shaped;
    samples[i] = high * fade;
    limitedPeak = Math.max(limitedPeak, Math.abs(samples[i]));
    energy += samples[i] ** 2; if (i >= 1200) energy -= samples[i - 1200] ** 2;
    if (i >= 1199) maxWindow = Math.max(maxWindow, energy / 1200);
  }
  const scale = Math.min(.8 / limitedPeak, .28 / Math.sqrt(maxWindow));
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i] * scale * 32767), 44 + i * 2);
  return wav;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [key, url] of Object.entries(THEMED_ACTION_SOUNDS)) {
    const destination = new URL(url, new URL('../../app.js', import.meta.url));
    const wav = buildNamedSound(...key.split(':'));
    await writeFile(destination, wav);
    console.log(key + ': ' + destination.pathname + ' (' + wav.length + ' bytes)');
  }
}
