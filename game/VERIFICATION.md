# Arcade modes verification — 2026-10-16

## Scope and result
Live origin: https://afp.mclement.ch/game/ . Work started on main at e5a3ce68a0e8cfbe1267b10d3868b57e327356d0; origin/main matched. Pre-existing unrelated README/dashboard/documentation/evidence edits were not staged or overwritten.

Backup before edits: /home/mathis/hsg-game-backups/arcade-modes-20261016-152100 (game tree, pre-existing patch and status).

Implemented separate Friend, Bot and Groups entry points, actual two-human Friend roles/capacity/direct turns, six distinct four-command combat profiles, complete forest/emerald arcade treatment for all five primary screens, and the subsequently requested user-supplied HSG building photo on the main menu. Original fighter and arena art is still explicitly replaceable placeholder art. No new dependency, gateway edit, proxy edit or service configuration change.

## Automated checks actually run
- Standard npm test: **58 passed, 0 failed, 3 explicitly skipped native-browser opt-ins** (61 total).
- With PLAYWRIGHT_MODULE pointing at the installed playwright-core and CHROMIUM_EXECUTABLE at installed Chromium: **60 passed, 0 failed, 1 skipped** (61 total, 7966.64 ms). The remaining skipped test is optional AUDIO_LIVE_URL read-only sound activation; desktop, phone and tablet native audio graph tests did run.
- Profile tests cover all six distinct profiles and distinct values on each axis, Luca strongest overall, shared display/engine data, every attacker/defender combination for all four commands, HP rounding/caps, single-use guard and cooldown, and repeated attack versus every healing/guarding opponent to completion.
- New mode unit/HTTP tests cover exactly two Friend seats, host only A, guest only B, wrong-team/extra-field rejection, host-only configure/start/reset, reconnect and reset seat preservation, three distinct mode creation contracts, private state auth, authenticated SSE and public QR.
- Extended real-browser five-screen smoke passed locally and on public HTTPS. Final public run used the photo-inclusive build, isolated contexts, real HTTP/SSE and normal wall-clock timers. It completed desktop and phone Bot matches and replay; Friend host + guest through victory/replay/reset with both reloads and a rejected third seat; Groups presenter + two voters with vote replacement, actual 15-second resolution, reconnect and shared reset.
- The public browser asserts all 24 roster stat numbers match the engine-imported profiles, no horizontal overflow on each capture, all three menu buttons inside desktop/phone viewports, photo background present and foreground opacity exactly 1. Final public result: **0 page errors, 0 failed page responses**.
- Public supplied-photo bytes matched the local shipping asset: SHA-256 34d3520045095bab3de65bd4275eea2f955924ddcc24dfd81b0f5619c1da094f. Asset is 1600×1214 WebP, 178314 bytes, with source metadata/provenance sidecar; original source hash in art/hsg-learning-center-source.md.
- git diff --check passed. The design detector ran once; text size/hover findings were corrected in the bounded fix batch. Requested luminous selection lighting is deliberate, not removed. Functional team/game-state labels and inherited move glyphs were not promoted into design-system doctrine.

## Captures and bounded inspection
Final public captures: game/evidence/arcade-public-photo/ (19 PNGs), also copied to /home/mathis/.openclaw/workspace/media/hsg-arcade-final/ for review/attachment. Primary sets:
- Desktop: desktop-menu.png, bot-arena.png, bot-characters.png, desktop-bot-battle.png, desktop-game-over.png.
- Phone: mobile-menu.png, mobile-arena.png, mobile-characters.png, mobile-bot-battle.png, mobile-game-over.png.
- Multiplayer: desktop-friend-battle.png, mobile-friend-battle.png, desktop-online-lobby.png, desktop-online-battle.png, mobile-online-battle.png.
Every final capture was opened and checked for correct content, loaded art and clipping. Initial desktop/phone inspection had one batched typography/portrait/contrast fix; the photo amendment received its required subsequent public capture. No open-ended styling loop.

Design review/documentation was performed inline because the assigned Builder role prohibits descendant delegation. This is not an independent design sign-off; coordinator review remains appropriate. Product context, surface contract, token-bearing DESIGN.md and .impeccable/design.json are included.

## Runtime / rollback
Only afp-game.service was restarted after the tests passed. It is active with ExecMainStatus=0; static files are read from this checkout and were subsequently verified publicly. Restart invalidates in-memory rooms; sessions are intentionally not persisted across restarts. No other service was restarted.

Safe rollback: revert the scoped arcade commit on main (never reset unrelated edits), then restart only afp-game.service. Alternatively restore only the corresponding game paths from the pre-edit backup after inspecting current changes. Keep unrelated dirty files intact.

## Known limits
- Friend host chooses both fighters and controls start/reset/replay; guest controls only B moves. A disconnected seat stays reserved; lost capability requires a new room.
- Luca is deliberately advantaged, not competitively balanced. Other archetypes are distinct; rounded bar segments are comparisons, exact adjacent numbers are real game units.
- Both sides intentionally choosing only non-damaging moves can extend a match; stats do not make healing or guarding invulnerable against attacks, and no sudden death was added.
- Tested Chromium desktop/touch contexts, not physical projector/speaker output or actual iOS Safari. Original art is placeholder, not final portraits.

## Expanded arcade audio — isolated QA candidate (2026-10-17)

Developed in /tmp/hsg-arcade-audio (detached from c393ef8), not the live static tree. No deployment, push, infrastructure/config edits or service restart. The pre-existing reduced-motion audio-browser test change is preserved.

Implemented exact lowercase master readiness labels, per-device Music and SFX/voice controls, original reproducible 16-second PCM chiptune loop, locally generated genuine eSpeak NG low-pitch male countdown, and authoritative 7.157-second prebattle (3 seconds voice + original full 4.156375-second Ready/Fight) before the first full 15-second turn. Group/Friend/Bot reset/replay retain capabilities, cooldown and turn semantics; countdown votes reject at the engine boundary. Client tolerates the old server but its timed prebattle requires the new engine and approved restart.

Checks use existing Playwright core at /home/mathis/.npm-global/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs and Chromium at /home/mathis/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome. Native graphs use real buffers, decoding, gain buses and scheduling, not a mocked audio implementation. Native host/desktop players and host/touch phone/tablet test gesture readiness, pending-load mute, suspension/failed resume, actual resolved sounds and dedup. Native prebattle test measures 3-second voice then 4.156375-second effect scheduling, visible countdown, blocked moves, full initial turn, reset, mute, suspension, SSE reconnect, reload and bot replay.

Full existing five-screen smoke passed against isolated port 18993: bot victory/replay, real Friend two-player moves/victory/replay/reset, third-seat rejection, Groups vote replacement plus real 15-second resolution/reconnect/reset, all 24 stats, desktop/phone screens with zero pageErrors/failedResponses. Evidence: /tmp/hsg-arcade-audio-evidence; log /tmp/hsg-arcade-ui.log. Separate audio controls layout check: desktop, iPhone 13 and iPad gen 7 all zero horizontal overflow, master/summary/sliders all 44px high; screenshots audio-desktop.png, audio-touch-390.png, audio-touch-810.png in that directory.

Audio source validation: unchanged Ready/Fight SHA-256 ac1753b0c966a04b728a6d76f6650078654049337eeb152fbfc3b2fecc308925. Countdown generated twice identically with installed eSpeak NG 1.51 en-us+m3 (rate 145, pitch 18, range 25), SHA-256 bf73b879881d7edc70a7071323f0549630769430bb48b39d86fe3a5f050ff493. Original music SHA-256 1c20cd6549a7edbd3631a323e23aac6ace120cae7efd2833772fbab28ade8c02; generator test verifies exact reproduction, bounded peak and silent loop boundaries. No paid TTS, package install, cloud speech or fabricated speech tones. Robot/formant timbre; human listening remains necessary for subjective deep-voice/intelligibility approval and physical speakers/iOS Safari. Original Soundees attribution is unchanged.

Safe integration: parent QA this worktree first; merge/cherry-pick only task files, preserving colleagues' changes. Do not copy directly over the live static tree during active rooms. Obtain fresh approval for afp-game.service restart at a room-free maintenance window (in-memory rooms are destroyed). Refresh clients after the new engine starts. No live-room mutation was used for these checks.

Final full native regression command (no AUDIO_LIVE_URL; no live mutations):

    PLAYWRIGHT_MODULE=/home/mathis/.npm-global/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/home/mathis/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npm test

Full suite log /tmp/hsg-verified-final.log: 80 tests, 79 pass, 0 fail, 1 intentional live-only skip (26.85 seconds). Additional focused audio/prebattle/HTTP run /tmp/hsg-target-final.log: 39/39 pass. git diff --check passed. Fresh full suite after adding corrupt-WAV readiness coverage is recorded separately in /tmp/hsg-verified-complete.log. UI smoke log /tmp/hsg-arcade-ui.log passed as above. During development, parallel full skeletal GPU rendering caused graph-sampling timeouts; final native acceptance runs were serialized after the successful UI smoke. Reset testing now waits for the actual lobby snapshot instead of merely a disabled move button (also disabled during countdown).

Voiced vowel-window autocorrelation estimates are approximately 66–71 Hz (not a human listening/transcription result); all three words fit well inside their one-second slots. Physical listening and native iOS Safari remain unverified.

Fresh complete run including corrupt-WAV readiness check: /tmp/hsg-verified-complete.log — 80 tests, 79 passed, zero failed, one intentional live-only skip, 27.29 seconds. Native countdown peaks 0.370 on all three host/phone/tablet graphs in the prior full run; the complete run also passed native countdown and mixer assertions. No external/live checks were enabled.

## Approved arcade-audio deployment — 2026-10-17 19:10 CEST

Philippe explicitly approved the room-clearing restart. Candidate 155171adf6ae591a15aa3817f415dd6733b32e8f was cherry-picked as a90f2dc3f339d30815884764ffe16044f1cbeb29 onto main and pushed to origin/main without force. Its game tree exactly matches the independently QA-passed candidate. The pre-existing reduced-motion test edit was already present in that candidate and is retained. All other pre-existing tracked diffs were compared byte-for-byte, and all pre-existing untracked file hashes checked unchanged. Preservation snapshot: /tmp/hsg-audio-deploy-preserve-ieUT0G. No stash, bulk overwrite, dashboard change, credential, Gateway or service configuration change.

Only systemctl --user restart afp-game.service ran, at 19:10:10 CEST; active/running, PID 226355, ExecMainStatus=0, NRestarts=0. This intentionally cleared prior memory-only rooms. Refresh existing browsers for the new frontend.

Actual integrated regression commands used the installed Playwright/Chromium paths documented above:

- npm --prefix game test with native browser environment: 80 tests, 79 passed, zero failures, one live-only skip; /tmp/hsg-audio-deploy-full-native.log.
- Same full suite with AUDIO_LIVE_URL=https://afp.mclement.ch/game/: 80/80 passed, zero skips/failures, 30.40 seconds; /tmp/hsg-audio-deploy-full-live.log. The formerly skipped read-only live check ran on desktop, iPhone 13 and iPad Chromium contexts: seven HTTP 200 WAVs decoded per device, audio running, nonzero real graph peaks (0.0746/0.0608/0.0746), exact sound is off/on readiness labels.
- Scoped commit and working-tree git diff --check passed.

Additional live acceptance used only one newly created disposable Groups room and two participants created in that room, never inspecting or joining unrelated rooms. Real browser HTTP/SSE and wall-clock timers verified visible 3/2/1/READY… FIGHT!, authoritative 7157 ms prebattle with null turn, then the full first 15000 ms turn (opened 36 ms after the intro deadline; first result 55 ms after the turn deadline). Native sources scheduled the actual 3-second spoken buffer immediately and the unchanged 4.156375-second Ready/Fight exactly three seconds later. Actual 16-second looping lobby source produced graph peak 0.0659 and was stopped at battle/countdown. No browser errors or failed responses. Only this fixture was reset to lobby afterward; contexts closed and normal TTL handles expiry.

Public HTTPS index.html, app.js, styles.css and all seven WAVs returned 200 and byte-matched the integrated checkout; SHA-256 results and timing evidence are in /tmp/hsg-audio-public-acceptance.json and /tmp/hsg-audio-public-acceptance.log. Ready/Fight retains ac1753b0c966a04b728a6d76f6650078654049337eeb152fbfc3b2fecc308925; countdown bf73b879881d7edc70a7071323f0549630769430bb48b39d86fe3a5f050ff493; music 1c20cd6549a7edbd3631a323e23aac6ace120cae7efd2833772fbab28ade8c02. Acceptance harness /tmp/hsg-audio-public-acceptance.mjs uses the existing verified proxy TLS handling and never logs bearer capabilities.

Physical speaker audibility, subjective low-voice/intelligibility approval and actual iOS Safari remain unverified; touch Chromium emulation is not iOS testing. No new paid services, packages or unrelated features were introduced.


## Requested lobby replacement / default ON — 2026-10-17

Isolated worktree `/tmp/hsg-lobby-replacement` based on 5809480; unrelated main-tree dashboard/art edits untouched. No backend/API/engine change, service restart, live room mutation, push or deployment during implementation. Parent independent QA/integration is required before publication.

- Exact requested source: https://www.youtube.com/watch?v=x2NzoLMWAwQ — **Wii Music - Gaming Background Music (HD)**, Gaming Sound FX, metadata duration 87 s. Full converted WAV 86.796235828 s, 22,050 Hz stereo PCM16, 7,655,472 bytes, SHA-256 `393273797bd9c6bc198bd5fd1d84f22686986701423d1b2f24772dbb0a864ec4`. No section trim or substituted tune. Provenance/rights uncertainty recorded in audio README and visible Help credit; uploader disclaims ownership and no reuse license was established.
- Default desired preference is ON, with an ordinary permitted autoplay attempt and synchronous retry on trusted click/tap/key. Actual labels remain exactly “sound is on/off”, reflecting context+decode readiness; a separate hint explains loading/permission. Explicit mute survives subsequent ordinary interactions within the page. Browser permission, OS mute and hardware remain outside the app’s control.
- Existing independent Music and SFX/voice gain buses retained. Full track loops before battle and is stopped on authoritative prebattle. Countdown, Ready/Fight and four action WAV bytes unchanged.
- `npm test`: 80 tests, 76 pass, 4 optional browser/live skips, 0 fail. Native suite opt-in uses installed Playwright core + Chromium 1243 and strict document-user-activation-required policy (not an autoplay bypass). Native graphs verify first normal host/player click and phone/tablet tap, keyboard activation, failed decode, delayed-load manual mute, independent gains, loop stop, suspension/recovery, authoritative actions, prebattle ordering, dedup/reset/reconnect/reload and no stale cue replay. Physical speaker output and real iOS Safari remain manual checks.
- Native results: complete suite 3 pass / 1 intentional live skip / 0 fail; final extra strict activation assertions 2 pass / 0 fail. Broad five-screen smoke did not complete within its 120-second runner budget (13 screenshots captured, browser closed and the harness error reporter then failed); do not claim full visual-smoke acceptance.
- Evidence logs: /tmp/lobby-full-release.log, /tmp/lobby-native-final.log, /tmp/lobby-activation-final.log; layout smoke screenshots /tmp/hsg-lobby-smoke. Live hashes intentionally not claimed before independent QA/deployment.

## Independent QA and static publication — 2026-10-17

Commits `ffa47d0` and `758e8c3` were independently reviewed in `/tmp/hsg-lobby-replacement`, then cherry-picked onto `main` as `100489f` and `5c5fbf0` and pushed to `origin/main` (no force). The full integrated native suite using installed Playwright core and Chromium 1243 passed: **80 tests, 79 passed, 0 failed, 1 intentional read-only-live skip**. Host/desktop, host/touch phone+tablet and authoritative battle-start graph checks passed; measured nonzero graph activity.

After publication, the opt-in read-only public frontend test passed on desktop, iPhone 13 and iPad (gen 7) Chromium contexts: each fetched all seven WAVs with HTTP 200, decoded all seven, reached running Web Audio after ordinary interaction and produced nonzero graph peak (0.0840). It did not create, join, or mutate any room. No service restart or live-room mutation was performed. A separate combined stress run passed the public read-only test on all three contexts but the preceding native touch test timed out at its 10-second `waitForFunction`; the full native suite had already passed when run serially. Physical speaker output and actual iOS Safari remain unverified.

The selected music WAV local SHA-256 is `393273797bd9c6bc198bd5fd1d84f22686986701423d1b2f24772dbb0a864ec4`. Public browser tests establish successful fetch/decode, not a byte-for-byte public WAV hash. The source uploader disclaims ownership; no reuse license is established, and attribution does not clear rights.

Public HTTPS byte verification after push: `index.html` SHA-256 `2128eea0d9c077ac244560002970e12c94b0cc6b0f9435cb4c12b44aa8539f9e`, `app.js` `39d6d3f85022d262a503db9a439c78d5e8abaa6e922044842adb371a1ddf6e3c`, `styles.css` `93997d21af43cebf19d45876606d87f3d1c304791071a3ee21dab494cd4f1a1f`, and `lobby-loop.wav` `393273797bd9c6bc198bd5fd1d84f22686986701423d1b2f24772dbb0a864ec4`; all returned HTTP 200 and exactly matched the local checkout bytes.


## Default sound preference display correction — 2026-10-17 (candidate)

Philippe's fresh-page report was reproduced on the unchanged source and on the public HTTPS page in native Chromium: before any click/tap/key the button displayed “sound is off”. The regression expected “sound is on” and failed before the fix. Root cause: both the HTML and UI updater represented browser/decode readiness as the preference, and the first toggle could activate instead of mute while locked.

The button now reports only the selected preference: exactly “sound is on” initially, “sound is off” only after explicit mute. Its pressed state reflects mute; the accessible name matches its visible text. A separate aria-describedby live hint reports waiting for first interaction, loading, suspension, unavailable audio or a resume/decode error. Native readiness still gates all playback; this label is not an audibility claim. First-toggle mute cannot resume audio and later gestures/loading cannot reverse it. Existing synchronous trusted-gesture activation, gain buses, music, countdown, Ready/Fight, action/win and deduplication behavior are retained. No asset/source-rights changes.

Candidate is isolated in /tmp/hsg-sound-default, based on cb51ff9. No static deployment, service restart, room reset, live-room mutation or push was performed. Independent QA and integration/publication remain with the coordinator. The only public probe was a read-only fresh-page assertion; it correctly still failed against the not-yet-updated live page.

Checks actually run:
- Red: installed Chromium + native browser test named “fresh sound preference is ON before any gesture” failed with actual “sound is off” before the fix; the same symptom was confirmed read-only on public HTTPS.
- Green: npm test — 81 tests, 76 pass, 5 optional browser/live skips, 0 fail.
- Green: PLAYWRIGHT_MODULE=/home/mathis/.npm-global/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/home/mathis/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node --test game/test/audio-browser.test.mjs (from repository root) — 4 pass, 1 intentional live skip, 0 fail. Strict document-user-activation-required policy, not autoplay bypass.
- Native regressions include passive CDP observation with userGesture:false proving hasBeenActive:false, suspended context, zero sources, ON label and correct pressed state; initial HTML without JavaScript; first-toggle mute via mouse/touch/Enter/Space; subsequent clicks preserving mute; delayed loading, decode failure, resume rejection/recovery, suspension, unavailable API; normal create/join activation, independent sliders, music stopping at battle, countdown/Ready-Fight ordering and action dedup/reset/reconnect/reload. Native output graph peaks were nonzero.
- git diff --check passed. Screenshot: /tmp/hsg-sound-default-before-gesture.png. Logs: /tmp/hsg-sound-default-native-final.log, /tmp/hsg-sound-default-unit-final.log, /tmp/hsg-sound-default-live-red.log. An earlier native run used Tab while the toggle was still focused (correctly excluded from global unlock), causing test-only timeouts; recovery probes now use an ordinary non-toggle click and the complete suite passes.

Physical speaker output and actual iOS Safari remain unverified; phone/tablet coverage is native Chromium touch emulation. Broad unrelated visual smoke was not rerun for this audio-only correction.
