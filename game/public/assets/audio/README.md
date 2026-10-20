# Game sounds

Original procedural effects authored for this game. The four approved 8-bit action
concepts were rendered by OpenClaw's game-sound-designer on 2026-10-20, using only
local JavaScript synthesis: no third-party samples, recordings, paid services,
new dependencies or imitations of a copyrighted game recording. Four PCM WAVs
(24 kHz, mono, 16-bit; 90,416 bytes / 88.30 KiB combined):

| Move / concept | Destination | Duration / bytes | Reproducible recipe |
| --- | --- | --- | --- |
| Attack / Pixel strike | `attack-impact.wav` | 220 ms / 10,604 | 25%-duty finite-harmonic pulse, linear 900→220 Hz sweep, exponential decay 13/s, filtered-noise contact crack decaying 150/s. |
| Defend / Shield lock | `defend-shield.wav` | 360 ms / 17,324 | 1200 then 1800 Hz sine ticks 55 ms apart, 0.28× inharmonic 2.37× partial, second tick 0.85×, 2 ms attacks and decay 24/s. Each tick releases over 25 ms. |
| Heal / Restore sparkle | `heal-chime.wav` | 600 ms / 28,844 | Three rounded triangle notes (523.25, 659.25, 783.99 Hz), spaced 120 ms; fundamental − third harmonic/9 + fifth/25; 12 ms attacks, decay 13/s and 45 ms releases. |
| Special / Charged overdrive | `special-burst.wav` | 700 ms / 33,644 | 150 ms 350→1800 Hz rising pulse (6 ms attack, 12 ms release), then 6 ms burst attack, filtered noise and phase-continuous 700/523.25/392/250 Hz stepped pulse tail; decay 12/s and 35 ms release. |

For **each** of these four files: author/source is the project-authored generator
`generate.mjs` and the recipe above; external source URL, third-party license
version and attribution obligations are not applicable because no external audio
is used. These are newly synthesized replacements, not edits of downloaded
recordings. No separate distribution license is declared here, and no CC0,
Creative Commons or third-party rights-clearance claim is invented; project
maintainers determine the distribution terms of this original contribution.

The xorshift32 noise seed resets to `0x485347` for each render. Noise uses
`y[n] = 0.5 y[n−1] + 0.5 x[n]`. Pulse synthesis sums harmonics 1–5 of a
25%-duty, DC-free Fourier series (maximum carrier harmonic 9 kHz). All four
receive 2 ms boundary fade-in / 25 ms boundary fade-out, zero first/last frames,
and the unchanged 0.8 PCM peak target. Interior note/charge transitions have their
own envelopes; the special's tail steps preserve phase. Runtime playback gains,
sliders and music are not modified. Distinction comes from descending single
strike / metallic double tick / soft three-note rise / rising charge then burst,
with useful midrange harmonics instead of dependence on sub-bass or stereo.

Objective PCM checks (not listening or perceptual-loudness measurements): all four
peak at −1.94 dBFS with no clipped samples. Maximum **sliding 50 ms RMS** levels
are attack −10.90, defend −10.77, heal −9.53 and special −11.20 dBFS, a 1.67 dB
spread. The existing mixer remains unchanged: action source 0.45 × SFX slider
(default 0.80), lobby 0.45 × Music slider (default 0.35), battle additionally ×0.5,
victory additionally ×2, countdown source 0.9 and Ready/Fight source 0.45.
Physical speaker balance/intelligibility and real Safari/iOS remain separate
listening/device acceptance checks, not established by waveform tests.

### Candidate verification (2026-10-20)

- Deterministic generator comparison, exact lengths/size, PCM format, zero boundary
  frames, DC, peak and 50 ms energy regression checks pass in `test/audio.test.mjs`
  together with the existing authoritative deadline, mute, dedup, preload,
  reconnect, protected gain/source-identity and routing tests (18/18).
- Chromium **153.0.8010.12**, installed Playwright Chromium build **1243**, Linux x64:
  native 48 kHz decoding succeeds for all four action WAVs. Decoded action peaks
  range 0.8000–0.8244; an additional native 96 kHz offline rendering also remains
  below 0.825 (a resampling check, not a standardized true-peak certification).
  Sum-of-individual-peak bounds with the unchanged decoded battle track plus one
  action are below 0.636 at both sliders 100%, or 0.390 at defaults. Victory plus
  one action remains below 0.492 at maximum sliders. These conservative bounds
  are not a listening/masking assessment or a promise about arbitrary extra voices.
- The complete serial `node --test --test-concurrency=1 test/*.test.mjs` run with
  explicit `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` executed 166 tests:
  **158 passed, 6 failed, 1 cancelled, 1 skipped** (live URL intentionally unset).
  This is **not** a full green browser-suite claim. The isolated worktree uses the
  existing installed dependencies through an in-memory Node `registerHooks`
  resolution fallback; no dependency or runtime file was added or changed.
- Existing desktop/touch audio fixtures run out of HP before their suspension
  checks (`room.turn` becomes null). The identical desktop failure was reproduced
  with the original action WAVs routed into the unchanged candidate frontend.
  Other full-suite blockers are missing `createMensa` export, missing GOLDEN CHALK
  choreography, intro digit timing, battle lifecycle timeout and victory wait
  timeout. No unrelated production code, protected audio or browser-test file was
  changed to hide these failures. Independent QA/integration must resolve or
  explicitly disposition these blockers before publication.
- A nonlethal in-memory adaptation of those two older desktop/touch fixtures
  progressed past the HP failure but still timed out waiting for UI move controls
  (0/2 passed); it was not committed or presented as a passing suite.
- A separate inline native smoke **passed** using three seeded, isolated loopback
  sessions (desktop host, Chromium iPhone 13 and iPad gen 7 emulation), the actual
  UI, native audio graph and real SSE parser. Explicit engine votes followed by
  deadline resolution played attack/defend/heal/special once per client at source
  gain 0.45 on SFX. Vote snapshots and unresolved zero-deadline snapshots were
  silent; duplicates, mute/unmute, suspension and trusted-gesture recovery did not
  replay consumed outcomes. The smoke restores fixture HP before each resolution
  to keep the non-victory scenario alive; it does not change game code or assets.
  All nine assets decoded on each client; there were no browser exceptions. This
  is graph/playback evidence, not physical iPhone/iPad/Safari or speaker listening.

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

The four original procedural action effects were redesigned on 2026-10-20; running
`generate.mjs` does not regenerate or overwrite this third-party sample.
`AUDIO_SOUNDS` combines the four move mappings with the battle-start, countdown and lobby assets. The source credit is also visible in the game’s How to play page.

Only an observed authoritative lobby → countdown transition in the same room/match
plays the sample, once. HTTP response + SSE duplication cannot double-play it.
A new match’s lobby re-arms it after reset. A newly opened room or re-established
stream first consumes its snapshot silently, including starts missed offline.
Muted/loading/suspended starts are consumed and never queued for later. All
sound-enabled host and player clients use the same hook; the Start button itself
is not an audio trigger. At this earlier intro integration, the resolved-action effects were unchanged; music and SFX use independent volume buses.

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

## Approved named-action candidate (2026-10-20)

Philippe approved name-related action sounds with a cohesive tactile/foley/electronic
hybrid; 8-bit is optional. These are **procedural material metaphors, not real foley
recordings**. Brian AI means the online learning platform: its cue uses original
learning-interface taps and a correct-answer chime, not a robot voice or copied
brand notification. Reuse between moves is permitted when it fits; event
deduplication is separate and remains mandatory. This candidate uses 24 rendered
files; unique file hashes are not an acceptance requirement.

### Per-sound mapping and provenance

For **every entry** below, author/source is OpenClaw game-sound-designer's original
`buildNamedSound(characterId, move)` branch in `generate.mjs`, created 2026-10-20.
These are newly synthesized originals with no external samples, recordings, source
URL, third-party license/version or attribution obligations. No external clearance
or separate CC0/distribution license is asserted; maintainers determine terms of
this original contribution. Common DSP settings below and the exact branch are
the reproducible recipe. No paid service, installation or new dependency.

Each table row defines four separate destinations, in **attack / defend / heal /
special** order: `<stable-character-id>-attack.wav`, `-defend.wav`, `-heal.wav`,
`-special.wav`, all in this directory. Labels describe the approved current
checkout; they are not routing keys and are not rewritten by this candidate.

| Stable character ID | Attack | Defend | Heal | Special | Lengths (ms), same order |
| --- | --- | --- | --- | --- | --- |
| `luca-di-grazia` | Golden Chalk: striated chalk noise, 700 Hz contact, 1550→1300 Hz gold glint | Open Book: two page swishes and 600/900 Hz binding resonances | Good Work: approval tap, C5/E5/G5 rise | Full Marks: 500→1600 Hz shimmer, stamp, high glass partials and paper release | 240 / 340 / 520 / 700 |
| `free-rider` | Copy / Paste: 900 Hz repeated digital clicks, stronger second click at 65 ms | Paper Decoy: fluttering thin-paper noise and hollow double lock | Group Credit: E5/G5/C6 contributions converge on a shared reward | AI Slop: accelerating computation, irregular stepped pulses and garbled noise splat | 260 / 340 / 560 / 700 |
| `tryhard` | Formula: tight 700/1050/700 Hz calculator triplet, dry answer | Textbook: heavy cover clap, 480 Hz body, 1000 Hz binding catch | Extra Credit: accelerating D5/F-sharp5/A5 point increments | A+: 800→1800 Hz score preparation, bright emphatic grade ping | 240 / 320 / 520 / 660 |
| `assessment-hoodie` | Bad Luck: unstable 950→380 Hz fall and electrical noise crack | Hood Up: low fabric swish, paired 650/850 Hz protective tucks | Take Hoodie Off: fabric peel opens into 450/675/900 Hz airy recovery | Skip Maths A Lecture: classroom ticks give way to syncopated 800/1050/1400 Hz exit accents | 280 / 340 / 560 / 700 |
| `trischli-warrior` | Dance Off: syncopated 520/750 Hz footwork plus compact clap | Call the Bouncer: two call chirps answered by weighty 500/750 Hz guard lock | Glass of Water: three downward-curving 600/800/1000 Hz droplets and glass glint | Throw a Beer: 500→1500 Hz fizzy flight, broad splash, bouncing bubbles | 300 / 360 / 540 / 720 |
| `bad-teacher` | Red Pen: high-mid scratch and clipped 1400→650 Hz correction stroke | Curved Exam: paper flex, 650→950→650 Hz bowed locking accents | Brian AI: soft 650/850 Hz learning taps, then reassuring rising E5/G-sharp5/C-sharp6 answer | Failed: 500→1200 Hz tension cut by rejection stamp and descending 700→350 Hz buzzer | 240 / 360 / 560 / 680 |

Common generation: 24 kHz mono PCM16, xorshift32 seed `0x485347` reset per cue,
sine/modal resonances and finite-harmonic pulses, band-shaped noise with 350 Hz
bass rejection and per-layer lowpass/texture modulation. Each layer has its own
attack, exponential decay and release. Whole-cue DC removal, `tanh(2.2 x/peak)`
soft shaping, DC-blocking `y[n]=.99(y[n-1]+x[n]-x[n-1])`, 3 ms fade-in and
25 ms fade-out, then scaling to at most 0.8 peak and 0.28 maximum sliding 50 ms
RMS. First/last frames are zero. This is offline level control, not a mixer change.
Reproduce all action WAVs with `node public/assets/audio/generate.mjs`; the four
existing generic recipes produce their original byte-identical outputs.

24 new WAVs total **530,976 bytes (518.53 KiB)**, duration **11.04 s** combined.
Decoded mono float data is about 2.12 MB at 48 kHz, excluding object/decoder overhead.
Measured PCM peaks span **0.4164–0.6364** (worst −3.93 dBFS); maximum sliding
50 ms RMS is approximately **−11.057 dBFS** for each. Matching this window metric
does not establish equal perceived loudness, masking performance or name recognition.

### Audio-only routing and integration

`THEMED_ACTION_SOUNDS` in `public/app.js` maps stable character/mechanic IDs to flat
WAV URLs. `createActionCue()` forwards `lastResult.actorCharacterId` first, falling
back to the acting team's identity only when the result lacks one. An unknown
explicit result identity deliberately uses the generic action, not another fighter.
The existing one cue subscriber, authoritative `lastResult` timing, room/match/turn
high-water tracking and history consumption are unchanged. No animation-contact
delay, action-selection playback or extra hit/turn/UI cues are introduced.

Themed preloads run separately from the base readiness promise. Missing, corrupt
or still-loading themed cues use the decoded generic category immediately. A late
decode never plays/replays that consumed event. Default ON, mute/suspend/gesture,
sliders, seven required WAVs and optional battle/victory handling remain intact.
All old nine media files, including the four generic action WAVs, remain byte-identical.
Action gain 0.45, lobby 0.45, battle 0.225, victory 0.9 and countdown 0.9 remain
unchanged, as do their buses, phase timing and user controls.

This branch starts at `5030ed7`, not the shared dirty renderer/name work. Current
approved labels (AI Slop, Take Hoodie Off, Skip Maths A Lecture, Call the Bouncer,
Glass of Water, Throw a Beer, Curved Exam, Brian AI) require the already-existing
colleagues' label changes. Integrate **only this audio diff** into that intended
base; do not replace `app.js` wholesale or revert current roster/arena/accessibility
edits. No backend, mechanics, animation, HTML, CSS or deployment change is included.
The existing flat WAV route is sufficient.

### Candidate verification scope

`test/audio.test.mjs` covers all 24 routes on both acting sides, identity precedence,
legacy/unknown fallback, optional fetch/decode/slow-loading failure, deadline-only
playback, duplicate/reconnect/mute/suspension consumption, deterministic rendering,
PCM size/DC/boundaries/headroom and protected media/code hashes. Native coverage in
`test/audio-browser.test.mjs` includes a renderer-independent native SSE/audio-hook matrix and
48/96 kHz decode/one-action-plus-music bounds plus optional themed decode fallback.

Chromium 153.0.8010.12 (installed build 1243), Linux x64, decoded all 24 named WAVs
at 48 and 96 kHz on desktop and Chromium iPhone 13/iPad gen 7 emulation. Maximum
named decoded peak was 0.64656. Conservative sum-of-individual-peak bounds at both
sliders 100% were at most 0.55691 for battle + one named action and 0.41139 for
victory + one named action; battle + any generic fallback remained below 0.63694.
At defaults, battle + one named action stayed below 0.32585. These are native
resampling/peak bounds, not standardized true-peak certification, listening tests
or a guarantee for arbitrary concurrent voices. Optional named decode failure kept
base readiness and ON labels and immediately played the generic heal at the
unchanged SFX gain on all three browser profiles.

Physical speaker listening, actual iPhone/iPad hardware and real Safari/iOS remain
unverified. Independent QA must review the candidate and baseline dispositions
before any publication. No deployment, push, service restart or live-room mutation
is part of sound production.

Final targeted results for this candidate:

- `node --test test/audio.test.mjs`: **24/24 pass**, including nine protected asset
  hashes and unchanged intro/control code. Also **24/24 pass** in a disposable
  integration snapshot containing colleagues' current label/renderer/arena edits.
- Native focused command below: **5/5 pass**. The renderer-independent matrix
  checks **144 named playbacks** (24 moves × both acting sides × three browser
  profiles), correct decoded-buffer fingerprints, unchanged 0.45/SFX routing,
  immediate source scheduling, silent selections/unresolved zero, duplicate SSE,
  mute, suspension/trusted-gesture recovery and reconnect history. It passed again
  in the disposable combined-checkout snapshot. It exercises production
  ArenaClient/createActionCue/ArenaUI.cue/ActionAudio and native graph, **not** the
  full battle rendering/onState presentation path. The normal page client is not
  joined in this harness; only the test client subscribes to its local room.
- Matched full nonbrowser suite at base `5030ed7`: **155 passed, 2 failed, 9 skipped
  (166 total)**. Candidate: **161 passed, the same 2 failed, 11 skipped (174 total)**.
  Both exit 1: missing `createMensa` export in `attack-overhaul.test.mjs`, and
  `Missing move choreography: GOLDEN CHALK` in `battle-world.test.mjs`. These
  defects reproduce without the audio change; they were not patched here.
- The untouched base's full native run was also not green: 158 passed, 6 failed,
  1 cancelled, 1 skipped. Existing desktop/touch fixtures run out of HP; intro,
  battle lifecycle and victory fixtures also fail/time out. A full native run
  against the larger current-checkout snapshot hit the **600 s overall bound**
  after dense choreography tests and existing audio-fixture failures; no complete
  score or full-current-suite green claim is made.
- An attempted full battle-UI named matrix also timed out at the initial action.
  Its cause is unresolved; the passing renderer-independent test is deliberately
  narrower, not proof of that full integration. Independent QA must finish real
  battle UI validation before publication. No renderer fixes or protective timing
  changes were made to force a passing result.

Normal commands, from `game/` with dependencies available:

```sh
node public/assets/audio/generate.mjs
node --test test/audio.test.mjs
node --test --test-concurrency=1 test/*.test.mjs
PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
CHROMIUM_EXECUTABLE=/path/to/chrome \
node --test --test-concurrency=1 \
  --test-name-pattern='fresh sound preference|optional WebM decode|optional victory codec|named' \
  test/audio-browser.test.mjs
```

The isolated-worktree runs used Node 24.21.0 with
`--import /tmp/hsg-named-sfx-resolver.mjs`, a read-only `registerHooks` fallback to
the existing shared `game/node_modules`; no package or dependency symlink was
installed. Existing browser module:
`/home/mathis/.npm-global/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs`;
executable: `/home/mathis/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`.
Raw logs and the captured integration overlay are under
`/tmp/hsg-named-sfx-evidence/`; these are local QA artifacts, not shipped assets.
