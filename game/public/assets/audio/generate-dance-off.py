"""Original Festival Techno Dance Off, OpenClaw game-sound-designer, 2026-10-21.
Exact approved stock Puck WAV plus original synthesis; see README.md and private audio-sources/dance-off/provenance.json.
Offline Python stdlib; no TTS/engine/model dependency. Only explicit --output writes, otherwise WAV stdout.
Combined mode sums quantized stems to match the approved audition exactly."""
import argparse, io, pathlib, math, struct, wave, hashlib, sys
VOICE = pathlib.Path(__file__).resolve().parents[3] / 'audio-sources/dance-off/puck-approved.wav'
VOICE_SHA = '3fe1c9b530c4da9738e03effc466745841579f1f8c550312fe0a499265f33013'
assert hashlib.sha256(VOICE.read_bytes()).hexdigest() == VOICE_SHA
R = 24000
N = 52800
TAU = 2 * math.pi
MARK = 1.276
MLEN = 0.32
with wave.open(str(VOICE), 'rb') as w:
    assert w.getparams()[:3] == (1, 2, R)
    voice = struct.unpack('<' + 'h' * w.getnframes(), w.readframes(w.getnframes()))
voice = [v / 32768 for v in voice]

def hz(m):
    return 440 * 2 ** ((m - 69) / 12)

def put(dst, start, duration, level, fn, attack=0.002, release=0.025):
    for i in range(max(0, round(start * R)), min(N, round((start + duration) * R))):
        t = i / R - start
        env = max(0, min(1, t / attack, (duration - t) / release))
        dst[i] += level * env * fn(t)

def noise(seed):
    state = [seed]

    def next_value():
        x = state[0]
        x ^= x << 13 & 4294967295
        x ^= x >> 17
        x ^= x << 5 & 4294967295
        state[0] = x & 4294967295
        return state[0] / 2147483648 - 1
    return next_value

def peak(a):
    return max((abs(v) for v in a))

def highpass(a):
    out = []
    previous = high = 0.0
    for x in a:
        high = 0.995 * (high + x - previous)
        previous = x
        out.append(high)
    return out

def encode_wav(pcm):
    assert all((-32768 <= v <= 32767 for v in pcm))
    out = io.BytesIO()
    with wave.open(out, 'wb') as w:
        w.setparams((1, 2, R, 0, 'NONE', 'not compressed'))
        w.writeframes(struct.pack('<' + 'h' * len(pcm), *pcm))
    return out.getvalue()

def build(stem='bed'):
    quarter = 0.4
    drop = MARK - quarter
    bed = [0.0] * N
    marker = [0.0] * N
    music = [0.0] * N
    put(music, 0.025, 0.54, 0.026, lambda t: math.sin(TAU * hz(38) * t) * math.exp(-5 * t), attack=0.025, release=0.12)
    n = noise(1145130563 + 1)
    low = [0.0]

    def hush(t):
        x = n()
        low[0] += 0.18 * (x - low[0])
        return (x - low[0]) * (t / 0.16) ** 2
    put(music, drop - 0.16, 0.155, 0.011, hush, attack=0.03, release=0.012)

    def kick(dst, start, index):
        length = 0.31

        def signal(t):
            phase = 49 * t + 110 * 0.018 * (1 - math.exp(-t / 0.018))
            core = math.sin(TAU * phase)
            body = math.tanh(1.65 * (core + 0.21 * math.sin(TAU * phase * 2))) / 1.3
            click = math.sin(TAU * 2100 * t) * math.exp(-210 * t) * 0.16
            return body * math.exp(-t * 7.5) + click
        put(dst, start, length, 0.65, signal, attack=0.0009, release=0.025)

    def clap(dst, start, index, level=0.1):
        n = noise(12691712 + index + 100)
        low = [0.0]

        def signal(t):
            x = n()
            low[0] += 0.31 * (x - low[0])
            bursts = sum((math.exp(-85 * (t - d)) for d in [0, 0.01, 0.023] if t >= d))
            return (x - low[0]) * bursts
        put(dst, start, 0.115, level, signal, attack=0.0015, release=0.025)

    def hat(start, index, open_hat=False):
        n = noise(12232448 + index)
        low = [0.0]

        def signal(t):
            x = n()
            low[0] += 0.55 * (x - low[0])
            return (x - low[0]) * math.exp(-t * (24 if open_hat else 100))
        put(music, start, 0.13 if open_hat else 0.04, 0.065 if open_hat else 0.028, signal, attack=0.001, release=0.018)
    # The main1276ms attacks go ONLY to the independently triggered marker stem.
    kick_times = [drop + j * quarter for j in range(4)]
    for j, t in enumerate(kick_times):
        dst = marker if abs(t - MARK) < 1e-06 else music
        kick(dst, t, j)
        if j in [1, 3]:
            clap(dst, t, j, 0.105)
    for j in range(7):
        t = drop + j * quarter / 2
        if abs(t - MARK) > 1e-06:
            hat(t, j)
        if j % 2 == 1:
            hat(t, j + 20, True)
    clap(music, drop - 0.072, 60, 0.028)
    clap(music, drop - 0.036, 61, 0.038)
    bass_midis = [38, 38, 38, 41, 38, 45]
    for j, midi in enumerate(bass_midis):
        start = drop + quarter * (0.38 + j * 0.5)
        duration = 0.225
        frequency = hz(midi)

        def bass(t, f=frequency, start=start):
            phase = f * t + 0.19 * math.sin(TAU * f * 0.5 * t) * math.exp(-t * 11)
            value = sum((math.sin(TAU * (phase * k + (0.0012 * k * f * t if k % 2 else 0))) / k ** 1.5 for k in range(1, 8)))
            value = math.tanh(1.7 * value) / 1.45
            age = min((start + t - k for k in kick_times if start + t >= k))
            pump = 0.22 + 0.78 * min(1, age / 0.105)
            return value * pump * math.exp(-t * 4.5)
        put(music, start, duration, 0.3, bass, attack=0.004, release=0.027)
    stabs = [(drop, [62, 69, 74], 0.19), (MARK, [62, 65, 74], 0.24), (MARK + 0.2, [60, 67, 72], 0.16), (MARK + 0.4, [62, 69, 74], 0.19), (MARK + 0.6, [57, 64, 69], 0.16), (MARK + 0.8, [62, 69, 74], 0.12)]
    for j, (start, notes, duration) in enumerate(stabs):
        dst = marker if abs(start - MARK) < 1e-06 else music

        def stab(t, notes=notes):
            total = 0.0
            for midi in notes:
                f = hz(midi)
                for detune in [-0.0024, 0.0024]:
                    phase = TAU * f * (1 + detune) * t
                    total += sum((math.sin(k * phase) / k ** 1.25 for k in range(1, 7)))
            return total / (len(notes) * 2) * math.exp(-t * 9)
        put(dst, start, duration, 0.32, stab, attack=0.003, release=0.035)
    n = noise(13149440 + 1)
    low = [0.0]

    def splash(t):
        x = n()
        low[0] += 0.36 * (x - low[0])
        return (x - low[0]) * math.exp(-t * 17)
    put(marker, MARK, 0.3, 0.078, splash, attack=0.0015, release=0.045)
    put(marker, MARK, 0.24, 0.08, lambda t: math.sin(TAU * (320 * 0.045 * (1 - math.exp(-t / 0.045)) + 48 * t)) * math.exp(-t * 16), attack=0.002, release=0.03)
    # Preserve the approved voice waveform; uniform gain/onset only, no vocal FX.
    voice_onset = round(0.1 * R)
    for j, v in enumerate(voice):
        bed[voice_onset + j] += 0.76 * v
    filtered_music = highpass(music)
    filtered_marker = highpass(marker)
    for i in range(N):
        fade = max(0, min(1, i / (R * 0.003), (N - 1 - i) / (R * 0.065)))
        bed[i] += filtered_music[i] * fade
        marker[i] = filtered_marker[i] * fade
        if i >= round((MARK + MLEN) * R):
            marker[i] = 0.0
        elif i >= round(MARK * R):
            marker[i] *= max(0, min(1, (round((MARK + MLEN) * R) - 1 - i) / (R * 0.01)))
    combined = [a + b for a, b in zip(bed, marker)]
    # Fixed audition gain; do not normalize the separately emitted stems independently.
    gain = min(1.0, 0.72 / peak(combined), 1.12 / (peak(bed) + peak(marker)))
    bpcm = [round(v * gain * 32767) for v in bed]
    mpcm = [round(v * gain * 32767) for v in marker[round(MARK * R):round((MARK + MLEN) * R)]]
    full = bpcm.copy()
    for j, v in enumerate(mpcm):
        full[round(MARK * R) + j] += v
    assert all((full[round(MARK * R) + j] - bpcm[round(MARK * R) + j] == v for j, v in enumerate(mpcm)))
    assert all((v == 0 for v in marker[:round(MARK * R)]))
    recovered = [(bed[voice_onset + j] - filtered_music[voice_onset + j]) / 0.76 for j in range(len(voice))]
    voice_error = max((abs(a - b) for a, b in zip(recovered, voice)))
    assert voice_error < 1e-14
    return encode_wav({'bed': bpcm, 'accent': mpcm, 'combined': full}[stem])

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stem', choices=['bed', 'accent', 'combined'], default='bed')
    parser.add_argument('--output', type=pathlib.Path)
    args = parser.parse_args()
    data = build(args.stem)
    if args.output:
        args.output.write_bytes(data)
    else:
        sys.stdout.buffer.write(data)
