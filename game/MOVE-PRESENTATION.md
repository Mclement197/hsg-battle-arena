# Named moves, completion-gated HP and selection views

Presentation-only release, 18 October 2026. No backend, combat balance, turn deadlines, assets, rig geometry, service or infrastructure changes.

## Behavior

- All 24 buttons use action type plus the existing character-specific ability name. ABILITIES in battle-contract.js is now the sole name/motif mapping; character themes derive their labels from it. Result announcements use the same name. Normal button text remains its accessible name and wraps on phones.
- BattlePresentation keeps a separate display HP/result snapshot. The authoritative ArenaClient state is unchanged. Result IDs queue once in order; each BattleWorld completion commits exactly that result’s targetHp (damage or healing), not the newest server HP. Repeated snapshots do not snap displayed HP forward or backward.
- Completion is emitted at the end of the existing 2200 ms ability timeline, after effects and recovery. Lethal defeat fits its remaining impact-to-end interval and reaches its final pose before completion. Result text, all presenter/phone HP, victory screen, victory sound and music phase use the staged view. The next authoritative turn clock continues visibly; controls stay disabled while resolving. This intentionally spends part of that live next-turn window on presentation rather than modifying server rules.
- First snapshot/reconnect is current state, not a history replay. New room/match, reset, hidden-page interruption and WebGL loss clear stale presentation. Mensa B and failed WebGL use the same ability-duration completion contract with a bounded timer. Reduced motion holds a stable overview but retains ordered completion.
- A single renderer controller holds opposing three-quarter selection shots for A/B, with a restrained 650 ms transition and no spin. Selection returns smoothly during the existing launch anticipation, reaching the established action-specific camera path before the effect becomes visible. Existing ab8560c attack/defend/heal/special choreography, framing and animated envelopes are retained. Selection framing includes props/wings and host HUD clearance.

## Verification

Run from game/:

	npm test
	node --test test/move-presentation.test.mjs test/action-camera.test.mjs test/battle-world.test.mjs
	PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/path/to/chrome node test/move-presentation-browser.mjs

The browser harness creates isolated loopback Friend rooms. It checks 6 fighters × 4 actions × 2 sides/views × 2 arenas, actual named buttons, timeline HP at 0/35/61/99/100%, queued opposing results, healing, lethal, reload/reset, reduced motion and explicit Mensa/load-error fallback. Frames are deterministic samples, not real-time performance measurements. HOST_PHONE=1 SMOKE=1 adds portrait presenter coverage.

Evidence: /home/mathis/.openclaw/workspace/media/hsg-move-presentation/. Before screenshots are retained from the preceding verified camera release (not recaptured against a changed server). The source snapshots in before/ are the exact pre-change source. Public hash checks compare served HTML, versioned module chain, CSS and preserved assets. A normal refresh receives the new static release; no restart or room reset is needed.

Limits: software Chromium WebGL/touch emulation is not actual iOS Safari/device testing. Optional native audio suite had known baseline failures in the preceding release and is not claimed green by this work. Repository graft executable is unavailable; source and call sites were inspected directly. Extensive unrelated dirty dashboard/docs/artwork work is preserved and excluded from staging.

## Recorded checks

- Full npm regression: 151 passed, 9 optional browser tests skipped, zero failures (npm-test-release.log). Later source-specific presentation/front-end reruns are kept alongside it.
- Dedicated staging/geometry/return tests: 8 passed. Shared-world regression: 50 passed. Frontend plus audio unit fixture: 23 passed.
- Initial two-arena native timeline smoke: 56 presentation checks passed, including opponent attacks, healing, rapid queued results, reset/reload and lethal/reduced-motion victory gating.
- Explicit Mensa and arena-load failure run: 2 passed, zero page errors.
- Public HTTPS: HTML, app, world, contract, CSS and two preserved assets match local SHA-256; all returned 200 with no-store. Native browser imports the versioned public chain and all 24 names with zero page errors. This browser check used the environment proxy and a test-context certificate allowance; it does not independently audit the site's certificate chain.

The final-selection/ captures supersede earlier selection framing captures: Trischli's narrower over-shoulder offset retains more opponent separation on a phone. Full timeline captures remain valid for HP behavior; exact selection framing is separately verified by geometry tests and final captures.
- Final stable full npm run: 151 passed, 9 skipped, zero failures (npm-test-stable.log).
- Portrait presenter native run: 58 passed, zero page errors. Active WebGL context-loss/reload smoke: 60 passed, zero page errors.
- Final selection capture and 320px/landscape resize smoke: 10 passed, zero page errors.
