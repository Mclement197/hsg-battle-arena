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
- **Playback:** only a live authoritative running → finished edge in the same room/match plays the complete source once on host and players. Battle music stops before victory starts. The synthesized win cue is removed; the final authoritative attack effect is retained. Victory uses Music (0.9 source gain × current Music slider), not SFX; battle-only 0.5 multiplier remains unchanged, as do lobby/countdown/SFX levels, default ON preference and exact labels/hint. Initial/reload/reconnect/duplicate/regressive/historical finished snapshots never replay it. Reset creates a new match and re-arms. Mute, suspension, disconnect, reset and leaving stop the active source. No load/unmute/gesture callback starts a skipped victory later. Optional victory fetch/decode failure leaves base audio ready, showing a separate unavailable hint without silently disabling lobby, battle or action audio. Native browser verification covers actual buffers/graph on desktop and touch-emulated Chromium; physical speakers and Safari remain unverified. No server restart, config change, deployment or live room mutation was performed.

## Approved named-action candidate (2026-10-20)

Philippe approved name-related action sounds with a cohesive tactile/foley/electronic
hybrid; 8-bit is optional. These are **procedural material metaphors, not real foley
recordings**. Brian AI means the online learning platform: its cue uses original
learning-interface taps and a correct-answer chime, not a robot voice or copied
brand notification. Reuse between moves is permitted when it fits; event
deduplication is separate and remains mandatory. This candidate uses 24 rendered
files; unique file hashes are not an acceptance requirement.

### Per-sound mapping and provenance

For **the23 unchanged named cues** below, author/source is OpenClaw game-sound-designer's original
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
| `assessment-hoodie` | Bad Luck: one original lightning crack at 55 ms and a short noisy thunder body | Hood Up: low fabric swish, paired 650/850 Hz protective tucks | Take Hoodie Off: fabric peel opens into 450/675/900 Hz airy recovery | Skip Maths A Lecture: classroom ticks give way to syncopated 800/1050/1400 Hz exit accents | 500 / 340 / 560 / 700 |
| `trischli-warrior` | Dance Off: approved Puck voice then original150BPM festival-techno drop; separate1276ms marker | Call the Bouncer: two call chirps answered by weighty 500/750 Hz guard lock | Glass of Water: three downward-curving 600/800/1000 Hz droplets and glass glint | Throw a Beer: 500→1500 Hz fizzy flight, broad splash, bouncing bubbles | 2200 / 360 / 540 / 720 |
| `bad-teacher` | Red Pen: high-mid scratch and clipped 1400→650 Hz correction stroke | Curved Exam: paper flex, 650→950→650 Hz bowed locking accents | Brian AI: soft 650/850 Hz learning taps, then reassuring rising E5/G-sharp5/C-sharp6 answer | Failed: 500→1200 Hz tension cut by rejection stamp and descending 700→350 Hz buzzer | 240 / 360 / 560 / 680 |

Common generation for those23 unchanged cues: 24 kHz mono PCM16, xorshift32 seed `0x485347` reset per cue,
sine/modal resonances and finite-harmonic pulses, band-shaped noise with 350 Hz
bass rejection and per-layer lowpass/texture modulation. Each layer has its own
attack, exponential decay and release. Whole-cue DC removal, `tanh(2.2 x/peak)`
soft shaping, DC-blocking `y[n]=.99(y[n-1]+x[n]-x[n-1])`, 3 ms fade-in and
25 ms fade-out, then scaling to at most 0.8 peak and 0.28 maximum sliding 50 ms
RMS. First/last frames are zero. This is offline level control, not a mixer change.
Reproduce all action WAVs with `node public/assets/audio/generate.mjs`; the four
existing generic recipes produce their original byte-identical outputs.

24 named WAVs total **632,736 bytes**, duration **13.16 s** combined, plus the **15,404-byte** Dance Off accent. The original common recipe above applies to the other23 named cues; Dance Off is superseded by the approved festival-techno recipe below.
Named cues plus the marker decode to about 2.59 MB of mono floats at 48 kHz, excluding object/decoder overhead.
Measured PCM peaks span **0.4164–0.6364** (worst −3.93 dBFS); maximum sliding
50 ms RMS is approximately **−11.057 dBFS** for those23 cues. The revised Dance Off uses the separately documented approved recipe below. Matching this window metric
does not establish equal perceived loudness, masking performance or name recognition.


### Current-base integration (2026-10-20, private candidate)

The current `3c84c6b` choreography is retained unchanged: `createMoveProps` creates the `jacket` secondary star/`FREEDOM` label; `choreograph`'s undress peel ends at `.36`, but its jacket secondary becomes visible only at `t >= .40 && t < .65`. Consequently Take Hoodie Off's semantic audio marker is now **.40 = 880 ms**, not the inherited .37 = 814 ms. The original clip accent remains **75 ms**. This aligns sound with the actual existing reveal rather than changing garment motion or treating shell clearance as the semantic reveal. `action-sync-current.test.mjs` renders the actual authored model at .36/.37/.399999 (hidden) and the exact .40 sampled marker (visible), and checks garment restoration plus fallback-RAF invalidation together. The native harness records actual FREEDOM visibility on the marker frame across single, queue, reduced and stalled presentations.

The private candidate coordinates the index app query, app world query and both app/world contract queries at `20261020-action-sync-current1`; no markup/layout redesign is included. Independent merged QA remains a publication gate; this integration is not a deployment.

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

### Action/animation synchronization (timing only)

Authoritative results authorize a single-use cue; selection/voting never plays it.
Playback follows that event's actual queued presentation, not a receipt timeout.
The named phase and existing clip's internal accent are listed in

game/public/battle-contract.js: NAMED_ACTION_TIMING / GENERIC_ACTION_TIMING.

On smooth frames the available clip buildup leads into its semantic marker. When
frames stall, playback waits for the marker and seeks past missed buildup through
a 3 ms anti-click ramp to the unchanged SFX gain. A generic decoded-buffer fallback
retains the named gesture phase but uses the generic clip's accent. Reduced-motion
tableaux and renderer-failure labels cue at their first render opportunity.

When RAF crosses a semantic marker, the renderer samples the EXISTING choreography
pose exactly once, then resumes the unchanged absolute timeline on its next frame.
A jump beyond the nominal 2200 ms end therefore shows the impact for one rendered
frame before the existing completion/HP/victory transition. No new pose, camera
path, server timing, music gain, source asset or victory playback is introduced.
Hidden/suspended/muted/disconnected, reset and leave boundaries invalidate pending
cues and stop action-only sources; stale callbacks cannot revive those events.
Only natural final-hit completion allows an already-emitted action tail to finish
under the unchanged victory source; it never preserves a queued/future cue. The
first screen-change clear in app.js and the subsequent world sync both require
finished victory with no active/pending world event for this exception. Any actual
cancellation remains strict, including cancellation after victory has appeared.

Focused regression: node --test test/action-sync.test.mjs test/audio.test.mjs.
Native full-render timing: set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE, then run
SYNC_ALL=1 SYNC_MATRIX=1 node test/action-sync-browser.mjs. Recovery/final-hit checks:
SYNC_ONLY_LIFECYCLE=1 SYNC_LIFECYCLE=1 node test/action-sync-browser.mjs. The harness
uses local in-memory rooms only. SYNC_GENERIC=1 deliberately corrupts optional
named fetches to check the existing generic fallback. ROOT selects a baseline.
Fast-completion/active-tail regression (no slow-next-frame masking):
SYNC_ONLY_LIFECYCLE=1 SYNC_FAST_TAIL=1 node test/action-sync-browser.mjs. This
test advances only the test presentation clock into natural completion immediately
after a real rendered cue; native sources, UI transition, victory and cancellation
handlers remain real. It also stops already-playing tails on mute/suspend/hidden/
disconnect/reset/leave, rather than accepting a source that ended before the check.

Recorded timing compares native buffer accent scheduling to renderer submission,
not microphone output or physical display scanout. Hardware output latency,
render/compositor latency and the short seek ramp remain; Chromium phone/tablet
emulation does not verify real Safari/iOS or device speakers. A frame stall after
an already-started buildup can still leave that accent early by the stall duration.

## SIUUU win-branch clip (2026-11-21)

- **Included:** `ronaldo_siuu.mp3`, copied byte-for-byte from the user-supplied `ronaldo_siuu.mp3` (23,449 bytes; 1.410 seconds effective duration from MP3 Info frame count and encoder delay/padding). No trimming, stretching, transcoding, normalization, or substitute sound.
- **SHA-256 (supplied and included file):** `7321144635840f2b57545e7fb082397134912ff03097f2560a60f920490af01b`.
- **Current playback:** full buffer at rate 1, offset 0, non-looping; SIUUU source gain 0.9 (twice its original 0.45) × SFX slider. The separate two-second KO and five-second celebration remain unchanged; victory waits for natural SIUUU completion.
- **Provenance and rights:** supplied by the user on 2026-11-21; original source unknown. Reuse and redistribution rights have not been verified. No license or rights clearance is claimed; resolve permissions before publication.


## Approved Dance Off — Festival Techno / Puck (2026-10-21)

This section supersedes the original short Dance Off recipe and any earlier
continuous-score discussion **for trischli-warrior:attack only**. Philippe approved
this exact festival-techno audition (approval message1562422528964690053). There
is no new audition gate; independent merged QA/publication remains main's scope.

### Exact assets, source masters and reproducibility

| Component | Destination | Format / length / SHA256 |
| --- | --- | --- |
| Voice-led festival-techno bed | trischli-warrior-attack.wav | mono PCM16,24kHz,2.2s,105644bytes;5aceed8c434be8f170b99694282ed60c51bbb0acb2786f195a9f7b88137591e6 |
| Independent main marker | trischli-warrior-attack-accent.wav | same format,320ms,15404bytes;4d81c6ef373ee164caba24fadf74923acf79c0de7762adfafe98bc3a75f365ea |

Normal-timing integer sum of the shipping bed and marker at sample30624 (1276ms)
has SHA256 **60e83602d7972900f8e38d4180c44caff64a521087ed989e4c6b9527c2d85045**:
byte-identical to the chosen audition, **zero PCM16 LSB difference**. Quantize each
stem separately, then sum; do not independently normalize the stems.

Music/drums/impact are newly composed original synthesis by OpenClaw
game-sound-designer,2026-10-21:150BPM,D-minor octave/fifth brass stabs, harmonically
saturated kick, FM/harmonic offbeat bass, seeded noise hats/clap/splash and short
downshift. No famous track/recording, external musical sample, quoted melody or
game recording was used. Original-contribution distribution terms are for project
maintainers; no external CC0 or third-party clearance is invented.

The voice is **the exact approved Kokoro stock am_puck recording**, not eSpeak.
No named person, uploaded speaker sample or custom clone was requested. Text:
Dance off!; provider speed1.1,CPU. Full phrase starts100ms and ends758.208ms;
drop starts876ms. Voice receives uniform gain only: no re-render, pitch shift,
time stretch, vocoder, saturation, compressor, reverb or EQ. Original file remains
SHA2563fe1c9b530c4da9738e03effc466745841579f1f8c550312fe0a499265f33013.

Durable inputs under game/audio-sources/dance-off/, **outside public serving**:
- puck-raw.wav: original official-demo response (SHA2563744281930af238f93c8b0255d9ba30d960e11bd7e4037f08498cd7517674bf8).
- puck-approved.wav: the exact selected phrase.
- prepare-voice.py: deterministic offline raw-to-approved transform; trims only
  outer silence (>0.001),10ms boundary air,3ms/15ms fades,peak0.75 before PCM16.
  Frames5062..20858 of the raw render; no online service needed.
- provenance.json: source/author/revisions,settings,hashes,approval and rights evidence.

Generator generate-dance-off.py uses only Python standard library and the retained
approved WAV. It writes **only** an explicit --output destination (otherwise WAV
stdout). No live TTS engine/model/credential/network dependency. Reproduce just the
authorized target from game/ without overwriting unrelated audio:

    python3 public/assets/audio/generate-dance-off.py --stem bed --output /tmp/dance-bed.wav
    python3 public/assets/audio/generate-dance-off.py --stem accent --output /tmp/dance-accent.wav
    python3 public/assets/audio/generate-dance-off.py --stem combined --output /tmp/dance-combined.wav
    python3 audio-sources/dance-off/prepare-voice.py --output /tmp/puck-approved.wav

The JavaScript buildNamedSound target and buildDanceOffAccent delegate to this
offline generator. The other23 named and all generic recipes remain unchanged.
The global generate.mjs command still writes all assets; do not use it for a
scoped production replacement.

### Voice source and output-rights disposition

Original generation: free public official https://huggingface.co/spaces/hexgrad/Kokoro-TTS
CPU demo, serving https://huggingface.co/hexgrad/Kokoro-82M v1.0; trained by @rzvzn,
architecture credited to StyleTTS2 authors, serving code by hexgrad. Recorded space
revision555d90e5a1eaaabd017f0b458069ad112867a6d4; model repository revision observed
f3ff3571791e39611d31c381e3a41a3af07b4987. Hosted weight bytes were not downloaded or
independently fingerprinted; this does not claim a completely pinned remote runtime.

Primary sources inspected2026-10-21:
- https://huggingface.co/hexgrad/Kokoro-82M — Apache-2.0 model metadata; explicitly
  welcomes production environments and commercial API deployment. Training-data
  statements/CC BY acknowledgments are the model author's, not independently audited.
- https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md — stock voice IDs.
- https://huggingface.co/spaces/hexgrad/Kokoro-TTS/blob/main/README.md — Apache-2.0 space.
- https://github.com/hexgrad/kokoro/blob/main/LICENSE — Apache License2.0 code license.
- https://huggingface.co/terms-of-service — Your Content: creators retain created
  content ownership; downloads remain subject to accompanying terms/licenses.

These sources support commercial/game use of the generated WAV; no separate
noncommercial-only output restriction was located for this official demo/model.
No voice-model/code is embedded or distributed. No invented CC0 output dedication,
exclusive copyright or blanket third-party identity/training-rights warranty.
Retain this source/model provenance. Distributing model/code separately would
require applicable Apache notices/license; model-training CC BY data does not by
itself assign that license to every generated phrase. Initial generation cost$0;
implementation made no online re-render,signup,payment or model/package installation.
The old eSpeak voice/provenance is **not** this asset's source. Existing unrelated
music rights/credits are unchanged and are not newly cleared by this replacement.

### One authoritative event, two cancellable sources

Reviewed split-stem playback is retained: one pending action owns bedDone and
markerDone guards consumed before playback. Both sources keep the same actionId,
SFX bus and actions cancellation set. No selection/submission playback or bed
retrigger. If either decoded target is missing at receipt, generic selection is
frozen for that event; a late optional decode cannot upgrade/replay it.

Bed begins on its own first presentation, seeks actual elapsed age and suppresses
expired2.2s scores. Marker follows the unchanged rendered .58 semantic sample,
first reduced-motion tableau or fallback label. Target-only pre-render/label
timestamp permits at most80ms stale callback age; consumed stale callbacks cannot
retry. Its natural running-audio-clock duration is320ms. A fresh held marker may
sound after an already-expired bed, never a restarted whole score. Natural final
completion retains already emitted tails; mute,reset,suspend,hidden,reconnect,
renderer-loss and leave still stop/invalidate both. Other action epochs/labels,
poses,garment restoration,hit recovery,camera and presentation sampling unchanged.
Continuous musical beats are not promised to lock to every delayed visual frame.

### Verified on the current isolated merged game

Targeted commands (game/):

    node --test test/dance-off-assets.test.mjs test/dance-off.test.mjs test/dance-off-stems.test.mjs test/audio.test.mjs test/action-sync.test.mjs test/action-sync-current.test.mjs

112passed,0failed,0skipped. Includes exact audition recomposition, raw/approved
source identity and preprocessing, portable deterministic stems, cache chain,
protected sources/gains, optional readiness/frozen fallback, authoritative identity,
exactly-once guards,cancellation,garment reveal/fallback epochs and public MIME/HEAD
with no-store. Private sources/generators/docs return404.

Native harness uses existing Playwright/Chromium153.0.8010.12/Linuxx64,ANGLE Vulkan
SwiftShader Device(Subzero),CSS1100x760/390x664/810x1080,DPR0.5. Phone/tablet are
Chromium emulation, **not physical Safari/iOS testing**. It captures summed native
PCM and matches the actual new marker waveform, without replacing source clocks,
SSE,renderer or playback. Strict100ms /0.35 correlation thresholds unchanged.
-15/15 normal,queued,reduced-motion and2.6s pre-onset-stall cases;9/9 renderer-loss
  fresh/expired/recovery cases. Source-local captured PCM residual0.079..0.300ms;
  estimated output-timestamp residual39.68..57.01ms is NOT acoustic measurement.
-21/21 paired-source natural-tail/mute/suspend/hidden/reconnect/reset/leave cases,
  both sources already emitted at each boundary.
-3/3 after a2.3s block after native bed start: bed is not retriggered; short fresh
  marker remains independently playable.
-9/9 named-buffer-failure generic normal/queue cases, exactly one generic source
  and no named stems; software PCM residual0.1..0.4ms.
-Native48/96kHz conservative one-pair-plus-unchanged-music bounds, all3 layouts at
  Music/SFX100%: battle<0.776401; victory with unchanged doubled gain<0.630889.
-Actual max-slider desktop normal/queued summed peaks0.39794..0.44903 (3/3).
  No limiter or protected gain changes; not a general arbitrary-polyphony promise.

Combined PCM peak-4.835dBFS,zero clipped samples,zero boundary samples. All32 other
pre-existing media are byte-identical. No subjective speaker/intelligibility or
physical-device measurement is claimed; Philippe's preview choice is the taste
approval. Unrelated full suite was intentionally not repeated. Detailed commands,
logs and clocks are in the private final handoff/evidence, not shipped URLs.

### Coherent cache graph / publication boundary

Only changed dependencies are versioned20261021-festival-puck1: index app URL,
app world URL,both app/world contract imports,bed URL and accent URL. Both imports
resolve the same contract module instance. Other media/imports/styles unchanged.
Existing server sets Cache-Control:no-store before routing, strips static query
parameters and uses the existing flat WAV MIME/HEAD route; no server edit required.
Publish the complete scoped asset/module graph atomically only after independent
final QA. Do not publish an old eSpeak patch or replace colleagues' files wholesale.


## Approved Bad Luck — lightning crack / short thunder (2026-11-09)

Philippe approved this replacement (message 1569434922366799885). This section
supersedes the earlier electronic falling-pulse recipe **only for
assessment-hoodie:attack**. No further concept approval is required; independent
merged QA remains the publication gate.

- Destination: `assessment-hoodie-attack.wav`; original local JavaScript synthesis
  by OpenClaw game-sound-designer, 2026-11-09, in the exact
  `buildNamedSound('assessment-hoodie','attack')` branch of `generate.mjs`.
  No recording, external sample, source URL, external license/version,
  attribution obligation, new dependency or spend. Not a derivative of an
  external recording; no invented CC0/rights-clearance claim. Maintainers decide
  distribution terms for this original contribution.
- 500 ms, 12,000 mono frames, 24 kHz PCM16, **24,044 bytes**; SHA-256
  **0be036fd99b4bf6fbb283b64af660b849e260ff7d11194d9c5cb4b27b92535a7**.
- Restrained 55 ms electrical air (seeded 4.8 kHz-shaped noise, amplitude .04,
  decay 8/s). ONE crack begins at the existing **55 ms** internal accent:
  two 3.5 kHz lowpass stages with 1.4 kHz bass subtraction, amplitude 2.3,
  0.7 ms onset, 85 ms layer, decay 55/s. The second pole was added after native
  resampling exposed excessive intersample overshoot in the first draft.
- Continuous thunder starts with that same strike: 900 Hz lowpass noise minus
  a 95 Hz lowpass, .85 amplitude, 5 ms attack, 445 ms layer, decay 9/s;
  quiet 180→85 Hz modal weight, 400 ms, .18 amplitude, decay 12/s.
  No later extra strike or detached impact stem. The body carries useful
  300–1200 Hz energy for phone speakers rather than depending on sub-bass.
  Existing seeded xorshift32 `0x485347` and common DC removal, soft shaping,
  DC blocker, 3/25 ms boundary fades, .8 peak/.28 sliding 50 ms RMS caps remain
  unchanged for every cue.
- PCM peak **.605164 / −4.36 dBFS** at **58.792 ms** (crack onset remains 55 ms);
  sliding 50 ms RMS **−11.057 dBFS**, DC **−1.45e−6**, zero clipped samples,
  zero endpoint frames. Lead/body/late-tail RMS are .01829/.08054/.00713;
  measured 300–1200 Hz body RMS over 120–300 ms is .04890. These are objective
  waveform checks, not listening, recognition or perceived-loudness ratings.
- Chromium 153.0.8010.12, Linux x64, native 48/96 kHz decoded peaks are
  **.732950/.736072**, below .8. Conservative sums of individual peaks with
  ONE action and the unchanged battle track are **≤.597183** at maximum sliders,
  **≤.358069** at defaults; with unchanged doubled victory, **≤.451671**.
  This is not standardized true-peak certification or an arbitrary-overlap bound.

### Current marker and protected scope

Rechecked the Nov 9 current checkout, not the stale Oct 31 audit:
`battle-contract.js:NAMED_ACTION_TIMING` still gives Bad Luck phase **.59**,
internal accent **.055 s**, action **2200 ms**; semantic marker **1298 ms**.
`battle-world.js:choreograph`'s existing storm secondary bolt is visible for
`t >= hit && t < hit + .13`. The bolt targets the opponent on both teams.
No timing/offset or choreography change was needed. Smooth-frame available audio
can lead by up to 55 ms; stalled/reduced/fallback presentations retain the
existing seek-to-accent and 3 ms anti-click ramp. Hardware audio/display latency
is not removed by this change.

All **33 other WAV/WebM assets** are byte-identical, including Festival/Puck bed
and accent, generic actions, music, countdown, Ready/Fight and victory. No
scheduler, gameplay, backend, actor routing, deduplication/history suppression,
loading/mute/suspend/hidden/reconnect/cancel/final-tail handling or gain changed.
The only runtime source edit is the target asset cache query; the app script's
entrypoint query advances with it. Battle world/contract and CSS URLs stay put.

### Reproduce just this target (do not run the global generator)

From `game/`:

```sh
node --input-type=module -e "import {writeFile} from 'node:fs/promises'; import {buildNamedSound} from './public/assets/audio/generate.mjs'; await writeFile('./public/assets/audio/assessment-hoodie-attack.wav',buildNamedSound('assessment-hoodie','attack'));"
node --test test/bad-luck.test.mjs test/audio.test.mjs test/action-sync.test.mjs test/action-sync-current.test.mjs
```

Native scripts `test/bad-luck-browser.mjs` and `test/bad-luck-decode.mjs` use
existing Playwright/Chromium installations via `PLAYWRIGHT_MODULE` and
`CHROMIUM_EXECUTABLE`, and local in-memory loopback fixtures only. Bound each
run using `timeout`. The native timing harness supports `SYNC_MATRIX=1`,
`SYNC_GENERIC=1` (optional target decode fails), `SYNC_LIFECYCLE=1`,
`SYNC_ONLY_LIFECYCLE=1 SYNC_FAST_TAIL=1`, `SYNC_DEVICES=desktop,phone,tablet`
and `SYNC_EVIDENCE=/path`. Decoder metrics use `DECODE_EVIDENCE=/file.json`.

### Safe integration/cache plan

This private candidate is a snapshot of the current dirty colleagues' base at
Git HEAD b6c5f3021282231b4320bb2c037d7851968ea6f7, NOT a proposal to replace those
files wholesale. Apply only its scoped binary patch after independent QA;
merge conflicts against newer work by hand. Keep all unrelated prerequisites.
Do not regenerate the entire audio directory.

Publish target WAV and the app's target query `?v=20261109-bad-luck1` together,
then advance only the HTML app URL to `app.js?v=20261109-bad-luck1`. Existing
static routes already permit the flat WAV and send no-store; no backend/config
change, restart or live-room mutation is needed. Preserve the Festival/Puck
queries and both existing world/contract imports to avoid duplicate module
identities. Existing pages keep their already-decoded buffer until refreshed;
there is no active-room hot swap. No shared checkout write, commit, push,
publication, service change or live-room mutation was performed during production.

Physical speaker listening, real iPhone/iPad hardware and Safari/iOS are NOT
verified. Chromium phone/tablet emulation is not real-device acceptance. No full
unrelated suite was rerun; the focused commands and their actual results are
recorded in the private handoff/evidence.

Final candidate checks (same WAV hash above): **93/93 focused unit tests passed**.
Native Chromium 153.0.8010.12/Linux x64: **27 named full-render cases** passed
(normal/queued/reduced/2600 ms stall on both teams for desktop + iPhone 13/iPad
(gen 7) Chromium emulation, plus three final-hit stalls), all six invalidation
boundaries with stale-queue consumption/fresh-event recovery on all three
profiles, and three real WebGL-loss visible-label fallbacks. A separate desktop
optional-target-decode-failure matrix passed **8/8**; active-tail/final completion
checks passed **7/7** (natural, mute, suspend, hidden, reconnect, reset, leave).
Scheduler-accent/render-submission residuals were **0–0.5 ms**; these are not
microphone or display-scanout measurements. Native software-rendered cases sought
to the 55 ms accent; smooth-frame prelude behavior is covered by the unit tests,
not claimed as demonstrated by these slower native frames. The waveform peak is
3.792 ms after onset; the existing seek ramp and hardware latency remain.
