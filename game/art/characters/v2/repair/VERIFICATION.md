# Anatomy repair verification log — reviewed staging, not deployed

## Baseline
- Repository instructions read; git-before.txt records extensive unrelated dirty dashboard work. No staged/dirty v2 source or character GLBs before this task.
- Actual six baseline blend and GLBs preserved under /home/mathis/.openclaw/workspace/media/hsg-character-repair/before/.
- Actual native Cycles all-six front/side/three-quarter and all seven clips plus hips/hands closeups rendered and inspected (sheets plus individual detailed views). No new user image or AI image used.
- Red pelvis repro: probe.py fails all six (zero pelvis-weight overlap at old independent thigh caps); visible Tryhard waist air gap, phone/books/cup/pen unsupported hands and Assessment two-hand page distortion confirmed in actual images.
- npm test: 136 total, 127 pass, 0 fail, 9 opt-in browser tests skipped. This initial run uses untouched live-served baseline GLBs, not staged repairs.
- Baseline browser capture generated both arena desktop/mobile frames, library WebM; old harness failed Trischli in-frame sampling under concurrent rendering. Not claimed as a pass.

## Release safety
Server serves static assets per-request with Cache-Control:no-store; runtime loadModel caches bytes for page lifetime. Therefore staged repairs use HSG_CHARACTER_OUTPUT/HSG_CHARACTER_EXPORT under evidence root and browser HTTP request substitution or isolated public-tree copy. Live public GLBs and blend remain untouched until reviewed integration. No restart or online room action.

## Implementation
See SELF-REPAIR-PROMPT.md (written before source repair), anatomy-repair.py and generate.py. Native connected trouser mesh, prop contact frames and rigid grasp skinning, per-frame planted legs and bimanual support solves. Semantic point-domain source_region attributes in .blend support meaningful mesh regressions without extra bone influences. They are not additional runtime skins.

## Actual candidate results
- Staged Luca + Free-rider loaded in real loopback shared Library world. Desktop 1280x900 and touch mobile 390x844 normal-motion attack/special/defend/heal: 8 assertions passed, zero page errors. Actual WebM and screenshots: after/smoke/. This does not certify remaining four models or Trischli.
- All six rebuild completed into staged/; no public asset replaced. Native fresh-open regression PASS: 229 frames/model, 997-vertex connected watertight pants each; ankle vertical error <=0.000874; Assessment support drift <=0.000109; prop distance error <=2.88e-7; maximum trouser edge stretch 1.495x. Locked occupied finger transforms and prop interior exclusion pass.
- Khronos/export sweep PASS: 0 errors/0 warnings for six GLBs, 287 times/model plus 100ms return-blend finite checks; ankle range <0.0011. Existing unchanged consumers with staged assets: 51/51 pass. Sizes 1.08–2.23 MiB.
- Actual tight Assessment and Teacher grips inspected: definite edge/cylinder wrap replaces unsupported flat palms, page remains rigid during special. Luca hip closeup reveals a remaining lateral ridge at pelvis-to-thigh transition: connected/no hole, but contour still blocky. This ridge was resolved in refined/ by ten localized Laplacian passes, exact same algorithm added to generator. Actual refined Luca idle/attack/defeat hips viewed: lateral ledge removed without waist movement or topology/weight changes. Native refined sweep PASS (1374 frames total), edge stretch reduced to <=1.409x. Refined GLBs independently re-exported/fresh-loaded and unchanged 51-consumer tests PASS; zero Khronos errors/warnings. Full rebuilt candidate remains in staged/ for traceability; final proposed artifact is refined/. Full rebuilt candidate browser PASS 96 (6 actors × 4 moves × 2 arenas × desktop/mobile), zero page errors, 24 actual WebM videos. Refined candidate browser PASS 16 (Luca/Free-rider, both arenas/normal-motion desktop/mobile), zero page errors and four WebM videos. All-six before/after front/side/threequarter and seven-clip full/hips/hands sheets completed; full/view sheets and selected closeups viewed; 48 before and 48 after tight hands completed. Refined hips all six completed and viewed.

## Residual limitations / integration gate
- Final reviewed binaries: evidence-root/refined/hsg-characters-v2.blend and refined/glb/*.glb; source includes identical contour algorithm. Public blend/GLBs intentionally unchanged. Parent must review and explicitly integrate. No commits/push/restart.
- Grips are stylized four-finger wraps with opposed thumbs, not photorealistic anatomy; shoulder/wing cuff intersections and layered garment overlaps remain intentional. No arbitrary self-collision proof.
- Tight contacts and complete full runtime matrix use initial staged contour; refined changes only pants vertices (same topology, weights, bones/clips), separately native/export tested, all-six hip images and two-identity runtime smoke tested. A second full 96-action matrix on refined bytes was not run.
- Tiny colored shirt/jacket hem patches can still be visible at Free-rider/Teacher/Trischli waistband in magnified front hip views; no open trouser seam, but final art reviewer may want garment/waist tailoring polish.
- Automated export return-blend check establishes finite transforms, not zero bimanual contact drift throughout mixed clips; exact native frame support drift is measured above.
- Existing full npm baseline suite: 127 pass, 9 opt-in skips; isolated staged/refined asset consumers 51 pass each. Gameplay/server/UI code unchanged.
