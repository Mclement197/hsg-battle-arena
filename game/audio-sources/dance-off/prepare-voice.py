"""Reproduce the approved Puck phrase from its retained Kokoro raw render, offline.
No synthesis/network. Writes only --output, otherwise WAV stdout. See provenance.json.
"""
import argparse, hashlib, io, json, pathlib, struct, sys, wave
ROOT = pathlib.Path(__file__).resolve().parent
provenance = json.loads((ROOT / 'provenance.json').read_text())['voice']
raw = (ROOT / 'puck-raw.wav').read_bytes()
assert hashlib.sha256(raw).hexdigest() == provenance['raw_sha256']
with wave.open(io.BytesIO(raw)) as wav:
    assert wav.getparams()[:3] == (1, 2, 24000)
    pcm = [v / 32768 for v in struct.unpack('<' + 'h' * wav.getnframes(), wav.readframes(wav.getnframes()))]
active = [i for i, value in enumerate(pcm) if abs(value) > .001]
start, end = max(0, active[0] - 240), min(len(pcm), active[-1] + 241)
assert (start, end) == (5062, 20859)
pcm = pcm[start:end]
peak = max(abs(v) for v in pcm)
normalized = [v / peak for v in pcm]
prepared = [round(v * max(0, min(1, j / (24000 * .003), (len(pcm) - 1 - j) / (24000 * .015))) * .75 * 32767) for j, v in enumerate(normalized)]
out = io.BytesIO()
with wave.open(out, 'wb') as wav:
    wav.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
    wav.writeframes(struct.pack('<' + 'h' * len(prepared), *prepared))
data = out.getvalue()
assert hashlib.sha256(data).hexdigest() == '3fe1c9b530c4da9738e03effc466745841579f1f8c550312fe0a499265f33013'
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path)
    args = parser.parse_args()
    if args.output:
        args.output.write_bytes(data)
    else:
        sys.stdout.buffer.write(data)
