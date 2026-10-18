# Current-model UI previews

All active artwork is rendered from the exact repaired six character GLBs and two arena GLBs shipped at commit 96f7431. The native character and two arena .blend sources remain unchanged. No stock photographs, image generation, new models, rigs, or game rules.

## Reproduce

Use the existing installed Chromium/Playwright workflow (no added dependency):

~~~sh
PLAYWRIGHT_MODULE=/absolute/path/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/absolute/path/chrome EVIDENCE_DIR=/allowed/evidence node game/art/render-previews.mjs
node --test game/test/previews.test.mjs
PLAYWRIGHT_MODULE=/absolute/path/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/absolute/path/chrome EVIDENCE_DIR=/allowed/evidence node game/test/previews-browser.mjs
cd game && npm test
~~~

The renderer reuses production CharacterStage at idle frame zero, transparent 600×700, and production BattleWorld geometry/materials/lighting at 1600×900. Environment cards hide fighter holders, retain the actual battle camera position, and lift its look target to frame the architecture instead of empty floor. Library and Trischli are separate exports, not random pictures or fight posters. Full-body crops include all feet, props, halo, wings and stars. WebP portraits are 16–28 KB; maps stay below 130 KB. These resolutions serve both phone cards and projector loading/fallbacks.

preview-manifest.json records SHA-256 of all eight GLBs, the three native sources, and every generated image, with dimensions and encoded sizes. Tests fail on changed sources, missing/current-generation mappings, substituted/swapped bytes, legacy active references, bad MIME/cache headers or route failures. Re-render after source changes and change the generation URL version when publishing a different asset generation.

## Active consumer audit

- Menu: current Luca/Trischli WebPs; actual Library backdrop and matching image preload.
- Arena chooser: actual Library/Trischli environment WebPs, same map IDs as battle. Mensa B has no modeled environment: its old fake illustration is replaced by an honest text tile; its existing selection/gameplay behavior is unchanged.
- Selected preview and roster: one shared current modelFor mapping; static same-model image stays underneath asynchronous WebGL; all six IDs covered.
- Entry/help: help contains no fighter artwork; entry figures now current Assessment/Tryhard images, never original SVG placeholders.
- Host lobby/roster: authoritative character IDs select current portraits. Guest lobby and HUD: current portraits next to health labels.
- Battle loading and WebGL failure: actual selected arena background plus current host portraits, guest portrait HUD remains visible. Successful shared 3D world covers that background. Lost-context canvas is hidden until recovery instead of obscuring fallback artwork.
- Result/victory and missing-identity defaults: current WebPs; no old SVG fallback branch remains. Victory's articulated preview still loads the current GLB.
- CSS backgrounds, HTML initial sources, preload paths and dynamic JavaScript references: legacy character SVGs, placeholder arena SVGs and unrelated campus photograph have no active consumers. Old source files remain as historical assets, not broadly deleted. There is no web app manifest, inline raster image or service worker in this UI.

## Cache/deployment

Static files are read per request by the existing running server and served with Cache-Control: no-store. New map files use the already-allowed top-level assets/*.webp namespace: no route/server/config change or restart. CSS, app and character module versions are advanced together; all portrait/background/chooser URLs carry 96f7431-previews1. Model bytes are unchanged; their fetch promise cache lives only for the current page. No room/session storage was cleared. Existing already-open pages need ordinary navigation/reload to load updated code; no destructive cache-reset advice.

## Verification evidence

Evidence directory: /home/mathis/.openclaw/workspace/media/hsg-current-previews/ (not committed). before-*.png are local production UI captures before replacement. live-*.png are the deployed HTTPS UI on fresh desktop/phone contexts; live-http-checks.json compares all deployed documents/modules, all eight images and all eight GLBs byte-for-byte with disk and records MIME/cache. The live script honors the authenticated runner proxy and verifies its TLS leaf before using a Chromium SPKI pin; it never prints credentials. No live room is created by that check.

previews-browser.mjs uses owned loopback friend rooms for desktop/phone selection, each of the six articulated previews, both map host/guest lobbies, delayed GLB loading, battle HUD, victory, reduced motion, and simulated unavailable WebGL. Delays are held asset requests, not a mocked visual screenshot; forced WebGL failure leaves real current portraits. A test-only one-HP target shortens victory verification without altering production balance. Screenshots are visually reviewed separately from DOM assertions. Browser emulation is not a physical iPhone/Android GPU guarantee.

### Verified 2026-10-18

- Final npm test: **130 passed, 0 failed, 9 optional native-browser tests skipped** (139 total).
- Dedicated previews-browser.mjs: **PASS**, 1440×1000 and touch 390×844, all six IDs, both maps, delayed loading, host/guest, victory, reduced motion and unavailable WebGL; no unexpected page errors or legacy image requests. Final screenshots were inspected with view_image.
- Public HTTPS: **21 files** byte-identical to disk, correct image/model MIME and no-store; fresh desktop/phone captures also exercised 180 ms latency / 250 KB/s 3G emulation. No live rooms were created for verification.
- All **11 source digests** independently match git 96f7431 (six fighter GLBs, two arena GLBs, three .blend files). Existing game service remained PID 328250, active since 11:10:17 CEST; no restart or room storage reset.
- Optional broader native audio browser run is **not green**: existing test times out around the mute click at audio-browser.test.mjs:274. An isolated exact-96f7431-public fixture reproduces that same line-274 timeout (baseline-audio.log), so no unrelated audio behavior/test timeout was changed to hide it. A serialized broader attempt was stopped after the same native audio failure. The task-specific real-browser asset acceptance and normal full npm suite pass above are separate results.
