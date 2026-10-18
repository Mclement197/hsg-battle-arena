# Action camera — 18 October 2026

Presentation-only change in `public/battle-world.js`; no engine, move values, durations, rig, geometry, assets or dependencies changed. The preceding fighter repairs and current portraits/arena previews are retained.

## Choreography

- **Attack:** lower three-quarter push, then a gentle lateral follow from the acting hand toward the opponent at impact.
- **Defend:** actor-side dolly and low, steady guard reveal; no impact punch or shake.
- **Heal:** slower, smaller rising push emphasizing the raised hands/prop.
- **Special:** broader, bounded three-quarter sweep during launch, following the target at impact.
- **Hit/defeat:** stay in the same two-fighter shot; do not add a disorienting cut. The existing hit/defeat clips and victory timing remain unchanged.

All paths use the existing ability launch/impact phases and 2200 ms duration. An analytic smoothstep envelope starts and ends exactly at overview (including lens framing), independent of frame rate. Rapid results retain the existing ordered, deduplicated queue. Reduced motion uses a stable fitted overview, without shake or orbit. Portrait host framing smoothly reduces travel rather than switching shots at an aspect-ratio breakpoint.

The existing Three.js mixer samples all seven clips once at model load to fit an oriented full-body envelope. This includes wings, feet, hands and props, with a small cross-fade allowance; it avoids per-frame skinned-mesh bounds and breathing as limbs move. The lens fits both fighters and reserves the actual presenter health-card area on resize; it does not move through walls to achieve a close-up. Mensa B retains its explicitly unmodeled fallback.

## Repeatable checks

From `game/`:

```sh
npm test
node --test test/action-camera.test.mjs test/battle-world.test.mjs
PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
CHROMIUM_EXECUTABLE=/path/to/chrome \
EVIDENCE_DIR=/tmp/hsg-action-camera \
node test/action-camera-browser.mjs
```

The browser matrix creates only isolated loopback Friend rooms. It uses genuine HTTP/SSE action results, then advances the existing presentation at deterministic 30 Hz for captures at start, wind-up (25%), impact (61%) and recovery (88%). Each fighter acts on both sides, in both modeled arenas, on desktop presenter and portrait phone guest. A separate `SMOKE=1 HOST_PHONE=1` run covers the portrait presenter HUD. Lifecycle checks cover queued rapid results, reduced-motion changes, active orientation resize, active reset/restart, host/guest reload history and defeat/victory. `BASELINE_SOURCE=/path/to/previous-battle-world.js SMOKE=1` renders the previous director with otherwise identical models/UI for comparison. These deterministic contact sheets are not real-time performance recordings.

CPU tests check distinct action paths, phase/finish continuity, actor mirroring, reduced motion, all six animated envelopes and screen bounds, intermediate unsampled poses, and raycast clearance/sight lines against the actual Library/Trischli GLBs.


## Verified outcomes

- npm test: 143 passed, 9 optional native-browser tests skipped; zero failures.
- Camera math suite: all 13 tests passed, including actual GLB pose envelopes and arena raycasts.
- Full native camera matrix: 210 action/lifecycle checks passed, zero page errors. Additional portrait-presenter run: 50 passed. Before comparison: 32 samples with the original director, identical models and UI.
- Public HTTPS browser import check: four distinct move paths, zero page errors; all four fetched entry/module hashes match local source and retain no-store.
- Opt-in native audio suite is **not green**: desktop timeout, mobile disabled-button timeout, and countdown assertion failure; interrupted after these failures. A separate unchanged-director comparison also times out in the mobile audio flow (at a later mute click) and reproduces the identical countdown assertion (READY… FIGHT! versus a single digit). These are not camera acceptance failures, but the complete optional audio suite was not verified. Raw logs: native-audio.log and native-audio-baseline.log in the evidence directory.

## Safe static release

Only frontend version tokens change: HTML → `app.js?v=20261018-action-camera` → `battle-world.js?v=20261018-action-camera`. No backend/service/configuration changes or restarts. Existing loaded clients keep their current modules; the next refresh receives the new camera. Refresh is not a match reset.

Evidence is outside Git at `/home/mathis/.openclaw/workspace/media/hsg-action-camera/`. See `before/`, `after/`, `phone-host/`, their `checks.json` files and `public-hashes.json`. Public HTTPS responses must match source SHA-256 and retain `Cache-Control: no-store`.

Limits: Chromium software WebGL and touch emulation are not actual iOS Safari/device verification. Full-body two-fighter framing is intentionally less close on narrow presenter screens; no spins, shake, hard cuts or opponent-hiding hero close-ups were added.
