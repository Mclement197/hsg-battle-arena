# Mensa B — user-photograph reconstruction

Original editable architectural geometry, **not a survey, photogrammetry scan, source-photo backdrop, or image-generation result**. Three user-supplied photographs establish this is the intended downstairs Mensa B. The earlier research-only gate did not have these references.

## Evidence and limits

1. Central aisle: broad low exposed-concrete hall, deep parallel beams, suspended twin-tube reflectors, square columns, parquet, pale T-pedestal tables, chrome chair frames, central door and coloured mineral-word ribbons.
2. Oblique art wall: long room, yellow bentwood seating, mosaic parquet and the coloured STEINSCHLAG / lower word-band vocabulary. Visible watermark identifies F1online 3936691. Its pixels/watermark are **not included** in any model, texture or shipped preview.
3. Coffee bay: board-formed concrete, dark projecting counter, three coffee dispensers, menus, crockery, sandwich rack, tall red-header drinks fridge, structural pier and foreground dining furniture.

The pictures show different dates/chair finishes. This reconstruction deliberately uses the older yellow/honey bentwood seating rather than claiming the black modern chairs are also yellow. Dimensions, exact furniture count, window arrangement, counter's connection to the main hall, unseen walls and plan are inferred. Tables are moved back/outward around a widened battle lane; it is an openly documented gameplay adaptation, not an exact occupied-room layout. No people are reproduced. Prices/menu wording and fridge lettering are approximate modeled text, not a scanned menu/logo. Word-band artwork is reconstructed from visible venue features, not claimed as a newly invented original artwork or a cleared reproduction license. Photograph rights remain with their owners.

## Assets and runtime

- `mensa-b.blend`: editable named geometry, procedural concrete/wood materials, native lights and five cameras.
- `generate.py`: deterministic native-source generator; same evaluated meshes feed the GLB and instance recipe.
- `mensa-b.glb`: self-contained inspection/interchange artifact, with EXT_mesh_gpu_instancing; **not a new public server route**.
- `scene.json`: evaluated mesh/material/transform recipe. A deterministic gzip/base64 representation is generated into the existing public battle-contract.js module, approximately 130 KiB total module size.
- Production BattleWorld.createMensa uses that recipe in the existing shared scene, with both unchanged fighters, existing skeletal actions and cameras. Instancing bounds draw calls; invisible parquet sides/undersides are omitted but their exact native upper surfaces remain. Procedural browser micrograin is generated locally. No source photograph is sampled.
- Library/Trischli models, all six cast GLBs/portraits, rules, timer, authoritative actions and audio assets remain unchanged. The shared release helper additionally disposes InstancedMesh buffers.
- The chooser and WebGL loading/failure background use the actual production-rendered arena-mensa-b.webp. No fake Mensa tile or text-only unmodeled status remains.

The existing server allows only Library/Trischli GLB filenames, so this compact modeled instance recipe uses an **already-served JavaScript module**, not a disguised media extension, broadened static allowlist or server restart. Native DecompressionStream is required only for Mensa 3D; unsupported WebGL/decompression retains real preview artwork, health and controls. This is a stylized reconstruction with simplified fixtures/equipment, not a claim of photoreal or exact architectural likeness. Native Cycles views and realtime views use different lighting/material implementations; unsupported procedural Blender materials are not silently claimed as baked realtime textures.

## Reproduce

From repository root, with installed Blender 5.0.1 and existing bundled numpy path:

~~~sh
blender -b -t 3 --python-exit-code 1 --python game/art/mensa-b/generate.py -- --render all
PLAYWRIGHT_MODULE=/absolute/path/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/absolute/path/chrome node game/art/mensa-b/render.mjs
cd game && npm test
~~~

Use --render none to regenerate native/model/recipe artifacts without the five CPU renders. render.mjs writes five 1920×1080 PNGs from the **production** modeled environment and its compact 1280×720 chooser WebP. It uses a blank local fixture page rather than removing a running app's asynchronous DOM. Native renders are also 1920×1080. Evidence is under /home/mathis/.openclaw/workspace/media/hsg-mensa-b/renders/; native 01/02/03 correspond to the three reference directions, 04/05 are reverse/overall views. They are real model renders, not the reference photographs.

Dedicated actual-game browser check (isolated loopback rooms only):

~~~sh
ARENA_ID=mensa-b ARENAS_ONLY=1 TEST_PORT=19012 EVIDENCE_DIR=/allowed/evidence PLAYWRIGHT_MODULE=/absolute/path/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/absolute/path/chrome node game/test/battle-world-browser.mjs
~~~

Local browser emulation/software-renderer evidence is not a physical phone/Safari or sustained GPU-frame-rate guarantee. Read-only public verification is verify-live.mjs with the same browser paths and AUDIO_LIVE_URL=https://afp.mclement.ch/game/; it checks exact file bytes/cache and chooser screenshots without creating/joining/resetting any public room. Existing service must remain running; this frontend-only integration needs no restart or state loss. Existing tabs need a normal reload to load the new version token.

## Verified 2026-10-19

Final npm test: 169 tests, 160 passed, zero failed, nine optional native audio/browser tests skipped. Khronos validation of the Mensa GLB: zero errors/warnings. Dedicated actual-game desktop/reduced-phone check passed 5 checks; normal-motion phone host+guest matrix passed 21 (four commands, seven viewport sizes, reconnect, context loss/recovery, reset). Read-only public verification passed 17 checks: 15 exact file hashes/cache plus two chooser sizes, no public room mutations. Existing afp-game service remained PID 328250, active since 2026-10-18 11:10:17 CEST. The five native renders, five production environment renders, real game/phone captures, manifests and logs are in the evidence directory above. No commit/push.
