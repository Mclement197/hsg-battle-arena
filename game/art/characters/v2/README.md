# Articulated cast v2

Six original stylized adult fighters, refined and **used by the actual game**. Not photoreal likenesses or PNGs pretending to be 3D.

## Deliverables

- **Editable source:** [hsg-characters-v2.blend](hsg-characters-v2.blend), six named character scenes and a linked lineup. Native armatures, vertex groups and seven NLA clips per fighter. First-pass files and other existing art iterations are preserved.
- **Runtime:** game/public/assets/characters/CHARACTER_ID.glb and same-model WebP portraits. Exact IDs: luca-di-grazia, free-rider, tryhard, assessment-hoodie, trischli-warrior, bad-teacher. No Luca/assessment filename aliases.
- **Actual Cycles proof:** [lineup](renders/lineup.png), [all-six bent joints](renders/bent-joints-contact-sheet.png), [rest/attack/hit/defeat clip frames](renders/pose-contact-sheet.png), individual full-body/bent PNGs under renders/.
- [Fresh-open validation](validation.json), [strict GLB validation](export-validation.json), [export budgets](build-report.json), [anatomy/licensing/preflight](sources.json), [verification and handoff](VERIFICATION.md).

## Geometry and rig

Round ribcage/waist profiles, sloped shoulders, contoured oval waistbands and continuous multi-ring sleeves/trousers replace isolated rigid limb segments. Sculpted jaw/cheek contours retain the six identities. Hands have tapered wrist/metacarpal fans, four staggered separate fingers (three phalange bones each), mirrored radial/opposing thumbs (two bones), thenar volume and sampled hemispherical fingertip caps. Shoes have narrow heels, raised insteps/medial arches, broad forefeet and tapered toes, with foot/toe bones; no hidden bare anatomical toes are claimed.

48 bones per fighter; Luca has 52 including independent left/right wing and wingtip bones. All surface vertices have normalized weights, at most four influences. Shoulders/elbows/knees are actually blended skin, not root-only animation or object-only puppet transforms. Held phone/notes/books/cup/red pen follow relevant hand bones; the assessment paper bridges both hands. Trischli stars/orbit are a **separate skinned VFX mesh** on an independent VFX bone. Lettering is colored mesh geometry, not external images.

Seven clips at 24 fps: idle (2 s loop), attack (1 s), hit (.75 s), defeat (1.5 s held), defend (1 s), heal/special (1.5 s). Saved NLA tracks are muted for a clean rest pose: unmute one track or assign its action to preview. Compact shared animation vocabulary is deliberately reused across distinct silhouettes, not bespoke motion capture.

Retained cues: portrait-informed Luca face/hair/stubble and ivory/gold wings/halo; disengaged phone user; Tryhard glasses, tucked patterned shirt and 6/6 notes; green HSG university lettering; tipsy Trischli stars/cup; stern fictional teacher/red marking pen. See inherited ../source-manifest.json for original identity references.

## Real game integration

public/characters.js uses locally vendored MIT Three.js 0.186.1 GLTFLoader, WebGL2 skinning and AnimationMixer. Selected preview, presenter/bot fighters, both participant-phone battle previews and winner view render GLBs. Menu/lobby/roster tiles deliberately use same-model portraits, saving unnecessary GPU contexts. WebGL2/model failure leaves an accessible static portrait explicitly titled as fallback.

Server-validated teams.A/B.characterId remains authoritative. The existing deduplicated resolved-result cue triggers actor move/target hit clips alongside unchanged themed CSS effects and audio. Selection, votes, local timer expiry, repeated snapshots and historical reconnect results do not attack. A final result holds the battle view for 1.6 s to show defeat before the winner screen; no gameplay/timer/HP rules change. Reduced motion uses stationary skinned cues. Mixers, RAFs, observers, GPU resources and contexts clean up on screen changes/hidden pages. 30 fps cap, DPR cap 1.5, on-demand model loading. No CDN, external asset requests or CSP relaxation.

## Reproduce

From repository root, installed Blender 5.0.1 and existing DejaVu fonts:

~~~sh
# Only if distro Blender lacks NumPy; tested Linux x86_64/Python 3.14, scoped ignored install:
python3 game/art/characters/v2/bootstrap-exporter.py
blender -b -t 3 --python-exit-code 1 --python game/art/characters/v2/generate.py -- --render none
blender -b game/art/characters/v2/hsg-characters-v2.blend -t 3 --python-exit-code 1 --python game/art/characters/v2/validate.py -- --render
PLAYWRIGHT_MODULE=/absolute/path/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/absolute/path/chrome node game/art/characters/v2/prepare-media.mjs
cd game
npm ci
node art/characters/v2/vendor.mjs  # only to rebuild supplied minimized MIT vendor files
npm test
node art/characters/v2/verify-exports.mjs
PLAYWRIGHT_MODULE=/absolute/path/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/absolute/path/chrome EVIDENCE_DIR=/allowed/evidence/path node test/characters-browser.mjs
PLAYWRIGHT_MODULE=/absolute/path/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/absolute/path/chrome PLAYBACK_FILE=/allowed/evidence/runtime-attack.webm node art/characters/v2/capture-playback.mjs
~~~

The builder reuses original identity-detail functions from ../generate.py, replacing anatomy/deformation surfaces without writing original source/blend. normalize.py makes skin mesh nodes scene roots, preserving joints and inverse bind matrices. Three.js world-space skinned coordinates before/after normalization differed by less than 1e-14. Unused UVs are omitted: materials use no image textures. Native fonts are packed; runtime lettering is converted mesh geometry. No missing external resources.

## Limits

Stylized moderately low-poly interpretation, not a scan or exact likeness. Limb joints are continuous surfaces; clothing/body/face parts are not one watertight production retopology. The blend contains optimized joined surfaces plus editable skeletons; regenerate from both Python sources to edit individual authored details. No corrective morphs, finger IK, facial blendshapes, cloth simulation, baked texture atlas or LODs. Procedural Cycles fabric micro-bump is not exported; runtime preserves color/roughness/metallic and actual lettering geometry. Chromium emulated mobile is not physical iOS/Android testing or a guaranteed device frame rate.

## Anatomy/contact repair follow-up

The October 2026 follow-up repairs pelvis/thigh continuity, shoulder transitions, prop grips, bimanual support, and planted feet while preserving identity and gameplay contracts. See [repair workflow and reproduction](repair/README.md), [pre-edit repair prompt](repair/SELF-REPAIR-PROMPT.md), and the dated results in [verification](VERIFICATION.md). Final reviewed binaries are integrated into this directory and [`../../../public/assets/characters/`](../../../public/assets/characters/). Residual stylized garment overlaps and test limits are recorded in verification.
