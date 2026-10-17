"""Generate real speech using the installed eSpeak NG shared library (no CLI required).
Python standard library only; generated WAV playback has no TTS runtime dependency.
"""
import ctypes as c
import ctypes.util
import pathlib
import wave

lib = c.CDLL(ctypes.util.find_library('espeak-ng') or 'libespeak-ng.so.1')
lib.espeak_Initialize.argtypes = [c.c_int, c.c_int, c.c_char_p, c.c_int]
rate = lib.espeak_Initialize(2, 0, None, 0)  # synchronous retrieval, no audio device
if rate <= 0:
    raise RuntimeError('eSpeak NG data unavailable')
parts = []
callback = c.CFUNCTYPE(c.c_int, c.POINTER(c.c_short), c.c_int, c.c_void_p)
@callback
def collect(samples, count, events):
    if samples and count:
        parts.append(c.string_at(samples, count * 2))
    return 0
lib.espeak_SetSynthCallback(collect)
lib.espeak_SetVoiceByName.argtypes = [c.c_char_p]
if lib.espeak_SetVoiceByName(b'en-us+m3') != 0:
    raise RuntimeError('English male voice unavailable')
for parameter, value in [(1, 145), (2, 100), (3, 18), (4, 25)]:
    lib.espeak_SetParameter(parameter, value, 0)  # rate, volume, low pitch, range
lib.espeak_Synth.argtypes = [c.c_char_p, c.c_size_t, c.c_uint, c.c_int,
                            c.c_uint, c.c_uint, c.c_void_p, c.c_void_p]
output = bytearray(rate * 3 * 2)
for beat, word in enumerate(['three', 'two', 'one']):
    parts.clear()
    data = word.encode()
    if lib.espeak_Synth(data, len(data) + 1, 0, 1, 0, 1, None, None) != 0:
        raise RuntimeError('Speech synthesis failed')
    lib.espeak_Synchronize()
    pcm = b''.join(parts)
    if not pcm or len(pcm) >= rate * 2:
        raise RuntimeError('Spoken beat must fit one second')
    output[beat * rate * 2:beat * rate * 2 + len(pcm)] = pcm
lib.espeak_Terminate()
with wave.open(str(pathlib.Path(__file__).with_name('countdown.wav')), 'wb') as wav:
    wav.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
    wav.writeframes(output)
print('countdown.wav: three / two / one, 3 seconds,', rate, 'Hz')
