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
folder does not define gameplay. The server permits only flat `*.wav` and `*.webm` filenames
under `/game/assets/audio/`; the generator and this document are not served.

## Playback contract

Sound is enabled by default as a per-page preference. A normal permitted autoplay attempt is made; browser policy may keep the context suspended. The first trusted click, tap or key retries resume synchronously, before create/join/start handlers or asset awaits. The button reads sound is on whenever the selected preference is ON, even before activation or decoding; a separate visible hint explains waiting/loading. Explicit mute persists across later interactions on that page. Suspension stops sources without changing the preference; a subsequent trusted gesture can recover, never SSE. The turn/enable cue remains synthesized; victory uses the requested full recording below. Muting stops music, voice, scheduled battle-start effects and all action/confirmation sounds.

Only a new authoritative `lastResult` received by `ArenaClient.onState` triggers an
action cue, after the server resolves the expired turn. Selecting/changing votes
and a local zero countdown are silent; there is no added timer-expiry sound.
The resolved move wins (including tied votes and random no-vote actions), not the local
selection. Room/match/turn-number high-water tracking suppresses repeated,
regressive, and reconnect snapshots. Initial snapshots after opening/switching a
room are historical and silent. Muted outcomes are consumed, not replayed.

Audio is optional: unavailable/failed assets and suspended contexts are silent.
Actions arriving before preload finishes are skipped rather than queued late;
enable sound before the battle for reliable first-turn playback. The first snapshot after a network gap is a silent cue baseline; missed action/intro/win cues are not replayed. Current-phase music may recover.
Tests exercise the UI hook with DOM/Web Audio doubles, local HTTP asset delivery,
and optional native Chromium audio graphs on desktop/phone/tablet contexts.
Native tests cover gesture activation, actual WAV decode/playback, mute and
suspension; physical speaker output and iOS Safari still need a human check.
Read-only live verification can check entry/frontend/assets without room mutation;
the prebattle engine update described below requires an approved service restart; do not restart or mutate live rooms during verification.


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
`AUDIO_SOUNDS` combines the four move mappings with the battle-start, countdown and lobby assets. The source credit is also visible in the game’s How to play page.

Only an observed authoritative lobby → countdown transition in the same room/match
plays the sample, once. HTTP response + SSE duplication cannot double-play it.
A new match’s lobby re-arms it after reset. A newly opened room or re-established
stream first consumes its snapshot silently, including starts missed offline.
Muted/loading/suspended starts are consumed and never queued for later. All
sound-enabled host and player clients use the same hook; the Start button itself
is not an audio trigger. The existing resolved-action effects remain unchanged; music and SFX now use independent volume buses.

## Requested lobby music and generated countdown (2026-10-17)

- `lobby-loop.wav`: **Wii Music - Gaming Background Music (HD)**, uploaded by **Gaming Sound FX**, published 2017-12-25. Exact source: https://www.youtube.com/watch?v=x2NzoLMWAwQ ; channel https://www.youtube.com/channel/UCi-xN4ZB6e-0JcXzvBEomlw . Metadata duration 87 seconds; full decoded audio 86.796208333 s, output 86.796235828 s (one resampling-frame rounding). Whole recording retained, no arbitrary trim, normalization, pitch or tempo edit. Standard yt-dlp 2026.08.19 bestaudio WebM/Opus, honoring runner CA via `--compat-options no-certifi`; no login, cookies, access bypass, paid service or added dependency. Native Chromium 1243 OfflineAudioContext decodes at 48 kHz then resamples stereo to 22,050 Hz PCM16 so the 7,655,472-byte WAV stays under the existing 8 MiB static limit without backend edits/restarts. Native buffer loop repeats the whole track, including its original beginning/end (not promised seamless). The old `generate-lobby.mjs` creates the superseded original tune, **not** this recording; it now writes `original-lobby-loop.wav` instead, never overwriting this recording.
- **Rights uncertainty:** extractor license metadata is absent. Uploader description explicitly says they do not own these sounds, provides no track-specific download/reuse permission, and says use without a download link is at the user’s own risk. Neither attribution nor this explicit user request establishes redistribution rights. Do not represent this as Creative Commons or royalty-free; permission from the relevant rights holder remains unverified.
- Downloaded WebM SHA-256: `6af05a7d8b358410c8b12a51c13f74facfcf3b397629cb54f3c41ca3ee660941`.
- Included WAV SHA-256: `393273797bd9c6bc198bd5fd1d84f22686986701423d1b2f24772dbb0a864ec4`.
- countdown.wav: actual “three / two / one” speech generated locally with the preinstalled Debian eSpeak NG 1.51 shared library and data, en-us+m3 male variant, rate 145, pitch 18, range 25. One-second word slots, 3 seconds total, 22050 Hz mono PCM16. No speech service, paid generation, package install, cloned voice or human recording. Robotic/formant timbre rather than natural cinematic voice; human speaker listening remains required for subjective quality/intelligibility acceptance.
- Reproduce speech on a system with eSpeak NG shared library/data: python3 public/assets/audio/generate-countdown.py. Uses Python ctypes and wave only. No TTS library is shipped or needed at runtime. eSpeak NG project: https://github.com/espeak-ng/espeak-ng ; program/data GPL-3.0-or-later, generated speech is output rather than bundled program code. This project’s script and the short original utterance are newly authored; no third-party recording is copied.

Seven WAVs and the requested battle and victory WebM/Opus recordings now preload. Independent music and SFX/voice buses route victory to Music and enable tones to SFX. Lobby music runs before battle; battle music runs only in the authoritative running battle. Master mute, suspension, reset, reconnect and leaving battle cancel scheduled voice/start sources. At a live lobby → countdown edge the audio clock schedules the countdown immediately (offset to server elapsed time), then the intact Ready/Fight after the remaining three-second countdown. Sources are stopped when the authoritative running phase arrives, ensuring no stale intro overlaps turn one. Initial/reconnect snapshots never schedule them. A start snapshot arriving after the three spoken beats is consumed silently rather than starting Ready/Fight late. Muting/unmuting never replays missed cues. The earlier Soundees source, conversion details, attribution and SHA-256 above remain exact and unchanged.


## Requested battle music (2026-10-17)

- **Exact source:** https://www.youtube.com/watch?v=g7yNyhLOIa4 (only this video, not the linked playlist).
- **Title/uploader:** “Xenoblade Chronicles OST - You Will Know Our Names”, uploaded by **Xenoblade Chronicles OST**, published 2015-08-28 per extractor metadata.
- **Description:** “Music: You Will Know Our Names / Game: Xenoblade Chronicles / Composer & Arranger: ACE+”. These are uploader-supplied credits, not independent ownership verification.
- **License/rights:** extractor license metadata is absent; description contains no reuse license or redistribution permission. No royalty-free or Creative Commons claim is made. Permission from the relevant rights holder remains unverified; this credit and the user request do not grant rights.
- **Included file:** `battle-loop.webm` — standard yt-dlp 2026.08.19 bestaudio format 251 WebM/Opus, **2,191,564 bytes**, original download included unchanged. No trim, normalization, resample, transcode, pitch/tempo edit or substitute. Metadata rounds duration to 143 seconds. Chromium 1243 native OfflineAudioContext decode at 48 kHz yields **143.081375 seconds**, 2 channels, 6,867,906 frames.
- **SHA-256 (download and included file):** `0a1b4014e7d01ebf9a7de30e267e58def9a1f950c5ccd9e9759282f5ec9e7e4b`.
- **Acquisition:** existing yt-dlp runner, `--compat-options no-certifi --no-playlist -f 251`, honoring the runner CA bundle. No login/cookies, bypass, payments, added project dependencies or rights assertion. Extraction warned about no supported default JS runtime but the requested file downloaded successfully and decoded natively.
- **Size choice:** full stereo PCM16 at the lobby asset's 22,050 Hz would be 12,619,824 bytes, beyond the existing 8 MiB static limit. Preserve original compressed source instead of trimming/degrading it. The approved minimal server change allows flat WAV/WebM filenames under the existing audio directory and adds `audio/webm` MIME; size/path/symlink protections remain unchanged. No service restart or live publication was performed during implementation.
- **Playback:** native AudioBufferSource full-buffer loop at Music gain, one scoped music source per room/match. Countdown/Ready Fight remain music-free; first full turn and action cues remain authoritative. Disconnect, reset, finish, mute, suspension and leaving battle stop the loop. Reconnect/unmute/gesture recovery may resume current-phase music from its beginning, but do not replay stale cues. Duplicate state snapshots never restart a running loop. Original beginning/end repeat without any seamless-loop guarantee.
- **Compatibility:** native desktop and touch-emulated Chromium graphs are the tested engine, not Safari. No Safari/WebKit binary is available here; actual iOS/macOS Safari decode/activation/speaker output remains unverified, particularly on older versions lacking WebM/Opus support. Battle decode failure is nonblocking: the seven base WAVs, unchanged lobby loop and SFX remain playable, while the separate hint says “Battle music unavailable — other game sounds remain enabled”. The selected sound preference remains preserved; no alternate battle format is included.


## Replacement victory sound (2026-10-17)

- **Exact source:** https://www.youtube.com/watch?v=N2uyNC-Xz98 . This is the requested replacement, not the previously discussed K1Y4wq_FPP4 clip.
- **Title:** VICTORY 🏆 SOUND EFFECT - FREE SOUND EFFECT HD (NO COPYRIGHT)
- **Uploader:** SOUND EFFECTS HD, https://www.youtube.com/channel/UCupb1LOqg6lmyz-p3iMfZkQ . Published 2021-01-15; public availability, duration rounded to 6 seconds in extractor metadata.
- **Full description inspected:**
  > ➡️ For more sound effects/music for your videos check out Artlist (Get 2 free extra months when you subscribe)
  >
  > ✅ This Sound effect is totally free for public, use it in your own video without copyright claim.
  >
  > ❌ I do not own these sounds. I have sourced them from the internet and uploaded them for ease of access to the Youtube community.
  >
  > Background image : Creative_hat / Freepik
  >
  > #soundeffect #nocopyright #freesoundeffect
- **Rights:** extractor license field is absent (`null`). The title and free-use statement are uploader claims, not proof of ownership or a Creative Commons license. The same uploader explicitly disclaims ownership. Their claim refers to video use; game redistribution rights remain unverified. Attribution and this user request do not establish clearance. The Artlist subscription line is a recommendation/advertisement, not an explicit paid condition for this clip; no purchase, account, or paid license was obtained. The prior source’s paid terms were not applied to this different video. No background image is used.
- **Included:** `victory.webm`, full original format 251 WebM/Opus download, **82,632 bytes**, byte-for-byte unchanged: no trimming, normalization, looping, transcoding, pitch/tempo edit or substitute. Native Chromium 1243 decode at 48 kHz: **5.4683125 seconds**, 2 channels, 262,479 frames.
- **SHA-256 (download and included file):** `f0cf0be0c1cb3e061e12957d34300a49f24e5918feea6eb10e963997968046b7`.
- **Acquisition:** existing yt-dlp runner, metadata dump followed by `--compat-options no-certifi --no-playlist -f 251`, honoring the runner CA. No login/cookies, access-control bypass, payments, new dependency or service.
- **Playback:** only a live authoritative running → finished edge in the same room/match plays the complete source once on host and players. Battle music stops before victory starts. The synthesized win cue is removed; the final authoritative attack effect is retained. Victory uses Music (0.45 source gain × current Music slider), not SFX; battle-only 0.5 multiplier remains unchanged, as do lobby/countdown/SFX levels, default ON preference and exact labels/hint. Initial/reload/reconnect/duplicate/regressive/historical finished snapshots never replay it. Reset creates a new match and re-arms. Mute, suspension, disconnect, reset and leaving stop the active source. No load/unmute/gesture callback starts a skipped victory later. Optional victory fetch/decode failure leaves base audio ready, showing a separate unavailable hint without silently disabling lobby, battle or action audio. Native browser verification covers actual buffers/graph on desktop and touch-emulated Chromium; physical speakers and Safari remain unverified. No server restart, config change, deployment or live room mutation was performed.
