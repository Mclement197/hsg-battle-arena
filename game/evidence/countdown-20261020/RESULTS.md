# Countdown timing fix — 2026-10-20

## Revalidated deployment

- Worktree/remote were main fec6b8c initially; another scoped selection-fit commit advanced both to dd8f516 during verification. Existing dirty Mensa/art/labels/dashboard changes were backed up and preserved, not included in this fix.
- Active service is the **user** afp-game.service, /usr/bin/node /home/mathis/hsg-battle-arena/game/src/server.mjs, PID 328250, active since 2026-10-18 11:10:17 CEST. Static files are served directly. No restart/config/backend change.
- Repository guidance, README/proposal and diagnosing-bugs workflow read. Graft executable/tool/index unavailable; used targeted source reads instead.

## Reproduction and cause

Real Chromium measurement preceded the hypotheses/fix. Initial live bot intro wrote the three countdown elements 127 times (31 writes to prebattle-label); first digit lasted 1129 ms. Isolated old local code also produced 2 → 3 → 1 under startup contention. There are no digit CSS animations to restart (animationstart probe recorded none).

The minimized deterministic real-browser regression delays the start HTTP response 1500 ms behind its SSE snapshot, with 2x CPU throttling. Old app gives **3 → 2 → 3 → 2 → 1 → READY… FIGHT!**, 33 intro writes on host / 32 on phone, and **1333 ms host/phone skew** on 1 and Ready/Fight.

ArenaClient.accept recomputed serverNow - Date.now() on every HTTP/SSE receipt, treating delayed state generation time as current time. A delayed equal-revision response therefore rewound the display. The independent 250 ms poll added boundary jitter and rewrote unchanged text repeatedly. Full state rendering briefly wrote numeric 0 over intro labels. Browser 3D startup can add separate main-thread/GPU stalls; profiling found renderer resize and fighter-envelope work, not an intro animation loop. No speculative 3D rewrite was made.

## Fix

- Anchor server time to monotonic performance.now elapsed time; newer/equal snapshots can improve the estimate forward but never rewind it. Reset the clock when activating a room.
- Use the same clock for intro, live-turn digits and already-existing audio cue offsets.
- Wake at deadline/intro digit boundaries rather than polling for digits; no accumulated decrement drift.
- Skip unchanged text writes, avoid transient intro 0, and cancel the digit timeout on leaving/hiding/pagehide. Ready/Fight and zero wait for authoritative state without a busy timeout.
- Appearance, 7.157 s intro, server-owned 15 s deadlines, gameplay, all three modes and 3D assets/choreography unchanged. Entry version: app.js?v=20261020-countdown1.

## Results

All measurements below are actual samples, not hard real-time guarantees:

- Same 1500 ms HTTP/SSE race, 2x CPU: old exit 1; fixed exit 0 in Bot, Friend and Groups. Fixed 3 → 2 → 1 → READY… FIGHT! throughout; 5 intro writes per client including clearing at transition. Friend transition skew 0–1 ms; Groups 1–2 ms. Settled intro and live-turn beat intervals 999–1001 ms. Reset/start/leave cleanup passed.
- Public fully rendered desktop 1440×1000: intro beats 891 / 999 / 1001 ms; 4 intro writes, 22 total sampled countdown-element writes; no page errors; leave cleanup passed.
- Public fully rendered touch phone 390×844, measured serially: 937 / 1001 / 999 ms; 4 intro writes, 22 total; no page errors; leave cleanup passed. First beat is legitimately shorter because display begins after the authoritative start.
- Public HTTPS entry references countdown1. Downloaded app SHA-256 equals the actual deployed worktree app: e907e084cfde151b19f355d10232e22ea27e13327c6c99f929b776a6350b68e0. This served working copy also retains pre-existing unrelated dirty edits; the publication commit deliberately includes only countdown hunks.

## Commands and actual outcomes

Use existing Playwright/Chrome via PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE (no new dependency).

- node --test game/test/countdown.test.mjs on old code: 2 failures (late receipt 15 instead of 14; wall-clock change 75 instead of 14). Fixed targeted countdown/frontend/prebattle/audio unit suite: **34 passed**.
- cd game && npm test: **174 tests, 165 passed, 9 optional native-browser checks skipped, 0 failures**.
- BASELINE_APP=game/evidence/countdown-20261020/app.before.js MODES=friend node game/test/countdown-sync-browser.mjs: **fails exact backward digit assertion**.
- node game/test/countdown-sync-browser.mjs: **Bot/Friend/Groups pass**, real HTTP/SSE, desktop plus isolated touch clients, 2x CPU, deadline cadence and reset/start/leave cleanup. WebGL/audio are disabled in this specific timing-isolation regression only; separate public checks retain both.
- LIVE_URL=https://afp.mclement.ch/game/ node game/test/countdown-browser.mjs: **desktop pass**.
- LIVE_URL=https://afp.mclement.ch/game/ PHONE=1 PROFILE=1 node game/test/countdown-browser.mjs: **serial touch-phone pass**.
- Exact staged publication tree (excluding pre-existing dirty frontend edits): countdown/frontend/prebattle/audio unit suite **34 passed**. Audio assets were copied as real files because the server correctly rejects symlinked static assets.
- git diff --check: pass.

## Limitations / deliberately retained evidence

- Concurrent software-rendered browser jobs caused additional 0.9–1.1 s startup long tasks and failed timing samples. Serial public desktop/phone checks passed; arbitrary GPU/main-thread stalls remain possible. This patch fixes deadline/snapshot/UI scheduling, not overall 3D performance or network latency.
- An extra optional native audio-browser suite attempt was **not green**: desktop timed out, touch could outlast its fixed fake-server deadline, and the legacy intro assertion expected 1/2/3 after more than three real seconds while its injected server clock remained frozen. Run was stopped by its 120 s overall timeout. These fixtures assume receipt-time clock resetting/frozen authoritative time; they were not weakened or rewritten. Required unit audio suite passes, and actual public sound-on countdown flows pass. Do not report all optional native audio tests passed.
- Chromium touch emulation is not actual iOS/Safari or physical speaker verification.
- Raw baseline/fixed JSON, logs, CPU profiles, screenshots and complete affected-file/index/dirty backups are retained locally in this evidence directory; only this concise report is intended for Git.
