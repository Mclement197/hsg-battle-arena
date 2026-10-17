# Game sounds

Original procedural effects authored for this game, with no third-party samples,
services, dependencies, or attribution requirements. Four PCM WAV assets
(24 kHz, mono, 16-bit; combined size about 134 KiB):

- `attack-impact.wav` — 0.34 s; descending bass impact and sharp contact crack.
- `defend-shield.wav` — 0.62 s; ringing, inharmonic metallic shield clang.
- `heal-chime.wav` — 1.04 s; rising C–E–G chime with octave shimmer.
- `special-burst.wav` — 0.86 s; rising energy charge, noisy burst, bass tail.

## Reproduce and extend

From `game/`, run `node public/assets/audio/generate.mjs`. The seeded synthesis
recreates the WAV files; no build step is needed to play the included assets.
Run `node --test test/audio.test.mjs` or the full `npm test`.

The central browser mapping is `ACTION_SOUNDS` at the top of `public/app.js`.
To replace a sound, update its WAV here and that mapping if its name changes.
To author a new procedural effect, add its duration/recipe to `generate.mjs` and
its mapping entry. New gameplay moves also need explicit engine/rules work; this
folder does not define gameplay. The server permits only flat `*.wav` filenames
under `/game/assets/audio/`; the generator and this document are not served.

## Playback contract

Sound starts muted. The existing Sound button unlocks Web Audio via a user gesture
and preloads/decodes all five files. Its existing turn/enable cue and the win cue
remain synthesized as before. Muting stops any currently playing action or battle-start effect.

Only a new authoritative `lastResult` received by `ArenaClient.onState` triggers an
action cue, after the server resolves the expired turn. Selecting/changing votes
and a local zero countdown are silent; there is no added timer-expiry sound.
The resolved move wins (including tied votes and random no-vote actions), not the local
selection. Room/match/turn-number high-water tracking suppresses repeated,
regressive, and reconnect snapshots. Initial snapshots after opening/switching a
room are historical and silent. Muted outcomes are consumed, not replayed.

Audio is optional: unavailable/failed assets and suspended contexts are silent.
Actions arriving before preload finishes are skipped rather than queued late;
enable sound before the battle for reliable first-turn playback. Only the newest
result is available after a network gap; missed turns are not replayed as a batch.
Tests exercise the UI hook with DOM/Web Audio doubles, local HTTP asset delivery,
and optional native Chromium audio graphs on desktop/phone/tablet contexts.
Native tests cover gesture activation, actual WAV decode/playback, mute and
suspension; physical speaker output and iOS Safari still need a human check.
Read-only live verification can check entry/frontend/assets without room mutation;
no server restart or live-room reset is required for these static-file changes.


## Requested battle-start sample (third-party)

- **Title:** “READY...FIGHT!” | SOUND EFFECT | SOUNDEES
- **Creator/uploader:** [Soundees](https://www.youtube.com/@soundees)
- **Source:** https://www.youtube.com/watch?v=s_SVCBtJzMA (ID: s_SVCBtJzMA)
- **Published:** 2022-12-29 per extractor metadata; checked 2026-10-17.
- **Published license metadata:** “Creative Commons Attribution license (reuse allowed)”,
  linked by YouTube to https://www.youtube.com/t/creative_commons . This records
  the uploader’s claim, not independent proof of ownership or legal clearance.
- **Included file:** `battle-start.wav` — entire downloaded effect, 4.156375 s,
  48 kHz stereo 16-bit PCM, 798,068 bytes. No trimming, synthesis, time stretch,
  pitch shift, or normalization; only Opus decode and PCM quantization.
  YouTube rounds duration to 4 s (Opus container metadata ~4.181 s).
- **Extraction:** standard yt-dlp 2026.08.19 bestaudio (format 251, WebM/Opus),
  then native Chromium 1243 OfflineAudioContext at 48 kHz. No login, cookies,
  access-control workarounds, paid service or installed project dependency.
  The runner’s CA bundle was honored via `--compat-options no-certifi`.
- **Downloaded WebM SHA-256:**
  `e6e3af5c2eedf8ba2a8cca7aba534d53f23950bd12b6ed63e783ef0182434d8b`
- **WAV SHA-256:**
  `ac1753b0c966a04b728a6d76f6650078654049337eeb152fbfc3b2fecc308925`

The four original procedural action effects above remain unchanged; running
`generate.mjs` does not regenerate or overwrite this third-party sample.
`AUDIO_SOUNDS` combines the four move mappings with the dedicated battle-start
asset. The source credit is also visible in the game’s How to play page.

Only an observed authoritative lobby → running transition in the same room/match
plays the sample, once. HTTP response + SSE duplication cannot double-play it.
A new match’s lobby re-arms it after reset. A newly opened room or re-established
stream first consumes its snapshot silently, including starts missed offline.
Muted/loading/suspended starts are consumed and never queued for later. All
sound-enabled host and player clients use the same hook; the Start button itself
is not an audio trigger. The shared gain/mute/unlock/control-state behavior and
existing resolved-action effects remain unchanged.
