# Model / animation surface follow-up — 20 October 2026

Evidence root: /home/mathis/.openclaw/workspace/media/hsg-model-animation-audit (gallery index.html, observed LEDGER.md, baseline dirty.patch, before/after media and machine-readable manifests).

## Repairs

All six retain identity, rig hierarchy, animation clips, combat values and arena design. Native joined source and GLBs are repaired, not just a forced camera pose:
- Fit hair cap above actual scalp and close its open crown (rear bald stripe / pinhole).
- Parallel-transport sleeve cross-section frames: prior reference-axis switches folded elbow triangles back through each other. Generator uses the same stable frame.
- Fit mouth/lip curves to actual face instead of detached profile bars.
- Fit garment surface graphics to torso: Tryhard diamonds/buttons, teacher shirt insert/lapels/tie, Assessment embroidery/pouch. Preserve collar and Trischli inner-shirt volumes after reviewing projection regressions.
- Taper buried torso hem and shrink intersecting ribbing; attach upper shoe bottom into rubber sole.
- Move Free-rider strap's lower section with the previously translated bag.
- Battle hit reactions crossfade back to idle on clip completion. Reused actions explicitly restore weight and authored time scale; defeat still holds.

No body-part hiding is used for these surface repairs. Existing temporary held-prop isolation is preserved.

## Reproduce / validate

Use the original baseline blend captured in the evidence directory when rerunning the one-time migration; the script marks repaired bodies and skips repeat application. Earlier unmarked candidates must not be used as migration input.

~~~sh
blender -b BASELINE.blend -t 2 --python-exit-code 1 --python game/art/characters/v2/surface-repair.py -- CANDIDATE.blend
blender -b CANDIDATE.blend -t 2 --python-exit-code 1 --python game/art/characters/v2/validate-surfaces.py -- surface-validation.json
blender -b CANDIDATE.blend -t 2 --python-exit-code 1 --python game/art/characters/v2/repair/export-refined.py -- OUTPUT_GLB_DIRECTORY
node game/art/characters/v2/repair/verify-staged.mjs OUTPUT_GLB_DIRECTORY
node --test game/test/model-state.test.mjs
TEST_PORT=19012 MODEL_DIR=OUTPUT_GLB_DIRECTORY EVIDENCE_DIR=OUTPUT_MEDIA node game/test/model-animation-audit.mjs
~~~

All state enumeration: six identities × seven native clips (idle, attack, hit, defeat, defend, heal, special), plus 24 procedural battle moves. Selection and victory use idle, not separate clips. There is no dodge clip/path. Actual world recipes override actor native move clips; target hit/defeat remain native. Matrix harness additionally covers desktop/phone, both actors, three arenas, reduced motion and interruption.

## Limits

Software Chromium/SwiftShader is not physical phone verification. Fixed-time videos play at natural speed but do not measure real-time GPU performance. Models remain stylized intersecting garment assemblies, not universal collision-free retopology; no facial blendshapes or cloth simulation. Assessment's existing Take Hoodie Off uses a garment handoff/color transition, not simulated cloth removal. Do not call the whole visual pass complete solely from numeric tests; inspect the before/after gallery and exact manifests.
