# Action sounds

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
and preloads/decodes the four files. Its existing turn/enable cue and the win cue
remain synthesized as before. Muting stops any currently playing action effect.

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
Tests exercise the actual UI hook with DOM/Web Audio doubles and real local HTTP
asset delivery. Real-browser autoplay behavior and audible quality still need a
human listening check; no deployment is performed by this change.
