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

Software Chromium/SwiftShader is not physical phone verification. Fixed-time videos play at natural speed but do not measure real-time GPU performance. Models remain stylized garment assemblies, not universal collision-free retopology; no facial blendshapes or dynamic cloth simulation. Inspect temporal evidence as well as numeric tests.

## Clothing and completion follow-up

The native Assessie model now separates the original hoodie shell (torso, sleeves, cuffs, hood, pocket and embroidery) from an independently weighted ivory undershirt/bare-arm underlayer. Take Hoodie Off bakes and deforms that actual shell into the two-hand grip, reverses the overhead path to redress, then restores the authored skinned shell. No material recolor or second floating jacket is used; cancellation, repeated use and reentry restore the original surface. This is deterministic authored fabric folding, not a cloth-physics solver.

Trischli's inner tee is now a subdivided surface projected onto the actual torso, with barycentrically transferred torso skin weights and fabric thickness. The former rigid pelvis-bound insert no longer reveals plum torso during the sampled native healing bend. All six skeleton rest transforms and all seven native clips remain exact; the other four GLBs are byte-identical to the prior repaired assets.

Reproduce from the pre-clothing repaired source (not a fresh generator or an already migrated candidate):

~~~sh
blender -b REPAIRED_BEFORE_CLOTHING.blend -t 2 --python-exit-code 1 --python game/art/characters/v2/clothing-repair.py -- CLOTHING.blend
blender -b CLOTHING.blend -t 2 --python-exit-code 1 --python game/art/characters/v2/repair/export-refined.py -- OUTPUT_GLB_DIRECTORY
MODEL_DIR=OUTPUT_GLB_DIRECTORY node --test game/test/clothing.test.mjs
node --test --test-name-pattern='Hoodie' game/test/physical-contact.test.mjs
MODEL_DIR=OUTPUT_GLB_DIRECTORY EVIDENCE_DIR=TRANSITION_MEDIA TEST_PORT=19035 node game/test/model-transitions-audit.mjs
~~~

Authoritative completion evidence is under `complete/` in the evidence root. Matrix: 18 owned mixed-character rooms, all 24 actions × both actors × desktop/phone × Library/Trischli/Mensa B = 288 action/view cases; nine timeline samples each (five raster captures), plus 45 lifecycle/reduced-motion/reset checks, all errors empty. Actual selection, action cancellation/repetition, hit-to-idle, losing combat, victory and replay/reentry were captured for every identity in desktop-host and phone-participant clients: 12 playable lifecycle recordings, 432 sampled frames. Native proof uses the four unchanged `review-final/models` recordings and the two new `complete/models*` recordings: 42 clips plus six turntables. Procedural final recordings use `review-final/actions-first` for Luca/Free-rider, `review-final/actions` for Tryhard/Teacher and `complete/actions` for Assessie/Trischli; stale earlier clothing recordings are not final proof.

All 42 native clip sheets, six 12-angle rotations, 24 dense action sheets, 288 matrix action/view sheets and desktop lifecycle sheets were visually reviewed. Phone victory/reentry views were also inspected. These are sampled visual checks, not a claim of universal self-collision elimination or a physical-device performance guarantee. `complete/contract-provenance.json`, `complete/public-hashes.json`, `complete/video-validation.json` and final test logs identify exact asset/source versions. All six repaired-model portraits were re-rendered through production CharacterStage and the preview manifest refreshed; the four unchanged GLBs had also retained stale pre-repair portrait digests from the earlier surface pass. Arena artwork was preserved.
