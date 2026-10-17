// Original 8-bar A-minor chiptune: pulse melody, triangle bass, arpeggios and seeded drums.
// No samples, dependencies or third-party composition. 120 BPM; exact 16-second loop.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export function buildLobby() {
  const rate = 24000, seconds = 16, data = new Float64Array(rate * seconds);
  const hz = midi => 440 * 2 ** ((midi - 69) / 12);
  const melody = [76,0,81,79,76,74,72,74, 76,79,81,0,83,81,79,76,
    77,0,81,84,83,81,79,77, 76,0,79,83,81,79,76,74,
    72,76,79,0,84,83,81,79, 74,77,81,0,83,81,77,74,
    76,79,83,0,84,83,79,76, 74,76,79,83,81,79,76,0];
  const chords = [[45,52,57],[45,52,57],[41,48,53],[40,47,52],
    [48,55,60],[43,50,55],[40,47,56],[40,47,56]];
  let seed = 0x485347;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, bar = Math.floor(t / 2), step = Math.floor(t / .25), u = t % .25;
    const chord = chords[bar], note = melody[step];
    const envelope = Math.min(1, u / .004) * Math.max(0, 1 - u / .22);
    const pulse = note ? ((t * hz(note)) % 1 < .25 ? 1 : -1) : 0;
    const b = t % .5, bass = 2 * Math.abs(2 * ((t * hz(chord[0])) % 1) - 1) - 1;
    const arpNote = chord[(Math.floor(t / .125) % 3)] + 24;
    const a = t % .125, arp = ((t * hz(arpNote)) % 1 < .5 ? 1 : -1);
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const noise = (seed >>> 0) / 2147483648 - 1;
    const kick = Math.sin(2 * Math.PI * (50 * b + 4 * (1 - Math.exp(-b * 35)))) * Math.exp(-b * 25);
    const snare = Math.floor(t / .5) % 2 ? noise * Math.exp(-b * 35) : 0;
    data[i] = .15 * pulse * envelope + .13 * bass * Math.min(1, b / .004) * Math.exp(-b * 4) +
      .045 * arp * Math.min(1, a / .003) * Math.max(0, 1 - a / .12) + .19 * kick +
      .09 * snare + .035 * noise * Math.exp(-u * 90);
    // Both loop edges are silent; envelope repeats on the exact beat grid.
    data[i] *= Math.min(1, t / .004, (data.length - 1 - i) / (rate * .006));
  }
  const wav = Buffer.alloc(44 + data.length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) wav.writeInt16LE(Math.round(data[i] * 32767), 44 + i * 2);
  return wav;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(new URL('./original-lobby-loop.wav', import.meta.url), buildLobby()); // Never overwrite the requested recording.
