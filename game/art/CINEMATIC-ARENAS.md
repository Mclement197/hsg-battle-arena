# Shared modeled battle worlds

Local implementation and verification. The phone follow-up has **not restarted or redeployed** the running service.

## Architecture

- One renderer / PerspectiveCamera / Scene per battle screen, containing the original environment GLB and both authoritative team fighter GLBs. No independent character viewports or backdrop photograph in battle. Selection/winner previews stay separate outside battle.
- Original sources: `hsg-library/hsg-library.blend`, scene `BATTLE / HSG library`; `trichli/trichli-arena.blend`, scene `BATTLE / gameplay adaptation`. Sources remain untouched.
- `export-arenas.py` evaluates text/curves/bevels, removes stand-in fighters/inlays/volumes, batches by material, simplifies bookshelf bevel meshes, preserves modeled floors/walls/gallery/stacks/roof/sculpture and Trischli joinery/furniture/sign/lights. glTF punctual lights replace unsupported area lights. Procedural noise bumps are omitted, not baked into an image.
- Existing authoritative `arenaId` selector/configure endpoint remains the only venue selection. Library and Trischli have real worlds. Mensa B was not modeled: its selector remains compatible, with an explicit unmodeled status rather than a fabricated substitute.
- Four mechanics, stats, timings, auth and audio unchanged. Six identity profiles × four existing moves map to label-aligned skeletal gestures and geometric world-space motifs (chalk/marks, paper, formula/book, cloud/charm, disco, red pen/exam).
- Native Blender armature clips are regenerated using `characters/v2/ability-poses.py` through the existing generator, not binary-only edits. Distinct writing/snatching/calculating/flinching/dancing/marking poses are keyframed; finger/wing bones retained.
- Bounded 2.2-second director: anticipation, directed projectile/local guard/heal, defender hit/defeat at impact, return overview. Hand-bone launch, true actor→target direction. Existing controls stay outside WebGL and are never locked by animations.
- Server adds bounded eight-result presentation history to snapshots, with target HP at each resolution. Queue consumes unseen turn numbers; initial/reconnected snapshot is history. Scope/reset/navigation/hidden/disconnect cancels pending effects. No persistent state or new dependency.
- Reduced motion fixes camera/projectile position and uses stationary skeletal poses. Mixers, RAF, resize observers, geometry/material/skeleton/texture/shadow resources and context are disposed.

## Budgets / fidelity

Environment exports: Library 4,952,776 bytes / 86,163 triangles / 25 material meshes; Trischli 2,277,304 bytes / 60,452 triangles / 22 material meshes. Cast GLBs 1.2–2.3 MB each. DPR ≤1.25, 30fps target, one 1024² shadow map, three visible punctual environment lights + shared key/hemisphere. Software-renderer browser checks are not a promise of real mobile GPU throughput.

This is stylized original campus art with bounded cinematic direction, **not Pokémon-production-quality animation**. Existing environment geometry/material vocabulary is retained; unsupported Blender procedural textures and volumetrics are not reproduced in glTF. No motion capture, IK foot planting, photoreal materials, full-venue free camera, or custom shader particles claimed.

## Reproduction

From repository root:

~~~sh
blender -b -t 3 --python-exit-code 1 --python game/art/export-arenas.py
blender -b -t 3 --python-exit-code 1 --python game/art/characters/v2/generate.py -- --render none
cd game
npm test
PLAYWRIGHT_MODULE=/home/mathis/.npm-global/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/home/mathis/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node test/battle-world-browser.mjs
~~~

Evidence lives at /home/mathis/.openclaw/workspace/media/hsg-cinematic-arenas/. Browser harness creates only its own loopback server/rooms. No afp-game service restart, deployment, production-room mutation, commit or push.

## Ability matrix (existing labels, no added mechanics)

| Fighter | Attack | Defend | Heal | Special | Physical vocabulary |
|---|---|---|---|---|---|
| Luca | Golden Chalk | Open Book | Good Work | Full Marks | Right-hand writing flourish; open hand/book guard; head lift; expanded wing/arm marks |
| Free rider | Copy / Paste | Paper Decoy | Group Credit | All My Work | Left-hand snatch; paper fan guard; phone/credit glance; broad paper claim |
| Tryhard | Formula | Textbook | Extra Credit | A+ | Right-hand calculation over held book; raised textbook; studying nod; overhead formula |
| Assessment hoodie | Bad Luck | Hood Up | One More Try | Broken Charm | Nervous recoil; hands to hood; recovery head lift; thrown broken cloud/charm |
| Trischli warrior | Dance Off | Wristband | Second Wind | Dance Floor | Chest/arm dance; wrist raise; drink/head lift; amplified alternating dance rays |
| Bad teacher | Red Pen | Exam Shield | Late Credit | Failed | Marking slash; exam-book guard; credit nod; broad crossed red-pen fail mark |

Guard and healing effects remain on the actor; only damaging moves travel to the opponent. Effects are small geometric constructions in the same depth-tested world, not CSS cards replacing character action. Labels merely name the existing combat commands.

## Verified local outcomes

- Unit/HTTP/asset suite: `npm test`: 136 tests, 127 passed, 9 existing optional browser-audio tests skipped, zero failed (final full log in evidence).
- Khronos glTF validator: both environments + all six regenerated cast GLBs: zero errors, zero warnings. Native exporter logs and exact byte counts retained.
- Actual Chromium loopback friend host + participant: both arenas, all four commands, one canvas/scene with both fighters + original environment; server-selected venue agrees across clients; reduced-motion 390×844 participant has fixed camera; reconnect does not replay historical results; reset removes canvas. `browser-checks.json`, zero page errors after correcting effect attribute collision with move buttons.
- Actual all-six ability matrix: 24 authoritative actions, four moves for each identity; `browser-all-six-checks.json`, zero page errors. Targeted screenshots under `matrix-*`.
- Measured overview renderer counts: Library 71 draw calls / 277,091 submitted triangles; Trischli 53 / 140,232; five texture allocations per world. Includes cast and renderer passes, not environment-only counts. These are software-renderer diagnostic counts, not hardware frame-time certification.
- Personally inspected full-page desktop/mobile captures for both environments and in-frame anticipation/impact views; identified and fixed reversed facing, a library column in the foreground lane, initial wing cropping and a phone move-selector collision. Decoded recorded actual-game WebM frames for transition review. The cinematics remain intentionally modest and bounded.

Parent should independently review owned paths from evidence `owned-paths.txt`, not stage the dirty tree wholesale. Initial HEAD was df86f3e070e21d7ebdbdb47d3af09f6244bc34cb (newer than the task's earlier deployed-character reference). Existing README/dashboard/architecture/untracked art iterations were already dirty and preserved.

Targeted actual-game defeat continuation also passed: 5 checks (four Luca commands plus legal attack/defend turns through authoritative zero-HP and delayed victory), zero page errors; `browser-defeat-checks.json` / `browser-defeat.log`. Node tests additionally sample all six GLBs through idle/attack/defend/heal/special/hit/defeat, verify floor bounds and adult scale, and assert the camera corridor stays inside both venues.

Evidence caveat: software Chromium screenshot calls can finish after the 2.2-second action returns to overview. In-frame captures and recorded canvas playback are the evidence for cinematic poses/camera angles; ordinary full-page `*-impact.png` screenshots alone are not claimed to capture the exact impact beat. The full four-move recordings include idle gaps between real HTTP actions.

## Phone follow-up (local checkout only)

Use an isolated loopback test room, never the running public service:

~~~sh
cd game
PHONE_MATRIX=1 ARENAS_ONLY=1 TEST_PORT=19002 EVIDENCE_DIR=/path/to/evidence \
  PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
  CHROMIUM_EXECUTABLE=/path/to/chrome node test/battle-world-browser.mjs
~~~

The optional matrix emulates touch/mobile DPR 2 with normal motion on both host and guest; checks 320, 360, 390, 430 portrait and 640, 740, 844 landscape widths, touch moves by both actors, responsive controls, horizontal overflow, bounded canvas pixels, reconnect, reset, and simulated WebGL context loss/recovery. It records viewport screenshots and software-renderer render-cost samples. The original default mode remains the reduced-motion phone check. Chromium emulation is not an iPhone/Safari or hardware GPU certification; verify a physical phone before claiming sustained frame rate or notch behavior on a particular device. Controls/health remain outside WebGL if context recovery fails.

For the real UI journey on a phone-size host (menu → arena → character → room → battle → victory → replay/reset), run PHONE_FLOW=1 with the same Playwright/Chromium paths and node test/five-screen-smoke.mjs. The guest also joins on a separate touch-emulated 390×844 context. This test uses the real turn timer rather than the matrix's frozen browser clock.
