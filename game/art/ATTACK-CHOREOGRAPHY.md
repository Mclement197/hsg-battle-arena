# Grounded choreography: all 24 named moves

Presentation only. Combat values, authoritative 2200 ms resolution, launch .32, impact .59, HP application and server logic are unchanged. Selection camera, arenas, game/selection layout and preexisting working-tree edits are preserved.

## Why the staging changed

The previous 8161e30 evidence sampled four phases and mostly mirrored opponents. That passed geometry checks but did not establish animation quality. The polish audit records **each move before and after**, reviews 24 motion samples per clip, and uses different opponents plus reverse-side/all-arena/device checks.

An approximately 4 m outward sprint plus 4 m backward sprint cannot look grounded in this fixed combat slot. Golden Chalk, Full Marks, Red Pen and Failed now use a **1.15 m measured advance and planted return**; the existing ink mark or stamped report travels the remaining aisle. Dance Off uses the same short approach to a floor that remains fixed in the scene. This is intentional stylization, not an invisible teleport or a longer combat clock. Ink/report release is .46; it still contacts exactly at .59. Physical thrown beer retains release .32.

## Per-move corrections

| Fighter | Move | Choreography correction |
|---|---|---|
| luca-di-grazia | Golden Chalk (attack) | Cap the advance at 1.15 m; distance-driven alternating support; chalk mark leaves its actual hand at 1112 ms and reaches contact at 1398 ms. |
| luca-di-grazia | Open Book (defend) | Neutral-idle base, two solved edge grips, hinge opening; stationary solid orientation; planted reading stance. |
| luca-di-grazia | Good Work (heal) | Small hand-borne approval token, measured wrist raise and one head nod, no generic heal bob or expanding impact burst. |
| luca-di-grazia | Full Marks (special) | Short planted advance; gold stamp presses the held exam before its .46 release, with a constant wrist grip; marked paper contacts the opponent at .59. |
| free-rider | Copy / Paste (attack) | Original left-hand page, right-hand release, frozen release anchor, constant horizontal flight and prompt contact retirement; keep both bodies framed. |
| free-rider | Paper Decoy (defend) | Uniform paper reveal in front of the body, compact crouch solved over stationary feet; prop stays on the ground in its own space. |
| free-rider | Group Credit (heal) | Place helpers in free flank; medal at actual joined hands; controlled acceptance and smaller semantic props. |
| free-rider | AI Slop (special) | Two-hand keyboard staging with alternating small index/middle-finger flexes; right-hand emission; no random spin; small ballistic flight and contact collapse. |
| tryhard | Formula (attack) | Equation beside actual left hand below face; right-hand sigma release; limited 0.45-radian rotation, no ease-out stall, quick contact cleanup. |
| tryhard | Textbook (defend) | Reduce textbook to hand-held scale, two edge anchors, low braced hip and opposing chest settle while feet remain planted. |
| tryhard | Extra Credit (heal) | Lead foot steps 0.20 m onto stack, support foot stays down; small hip transfer instead of whole-body levitation. |
| tryhard | A+ (special) | Hand-sized grade held at wrist, frozen launch point, modest flourish and immediate post-contact scale-out; remove redundant ring. |
| assessment-hoodie | Bad Luck (attack) | Cloud is an anticipation cue above the recipient’s actual crown envelope, including Luca’s halo; lightning connects cloud to contact exactly at the hit timestamp. |
| assessment-hoodie | Hood Up (defend) | An open-front, double-sided hood preserves the visible face; head-relative fit and both hands raise to actual hood sides; restrained chin tuck. |
| assessment-hoodie | Take Hoodie Off (heal) | Garment remains between both wrists during a higher peel that clears the head; compact folded recovery and deliberate torso extension, without body levitation. |
| assessment-hoodie | Skip Maths A Lecture (special) | Upright, floor-pivoted lecture board/chair placed farther ahead of the body; two planted side steps out and back; hand-origin note contacts at .59. |
| trischli-warrior | Dance Off (attack) | Fixed floor at a short-approach destination; soles rise to the actual lit pad surface, with two restrained knee accents and alternate support; no root spin or flying carpet. |
| trischli-warrior | Call the Bouncer (defend) | Adult-sized guard in a readable, grounded flank; actual wrist phone; final placement clears real arena furniture on both sides in all three arenas. |
| trischli-warrior | Glass of Water (heal) | Wrist-driven glass, rim raised toward mouth with slight tilt; planted support and short controlled sip. |
| trischli-warrior | Throw a Beer (special) | Snapshot actual hand release; 9.81 m/s² parabola with nonzero landing speed; bounded mug rotation and prompt splash/prop retirement. |
| bad-teacher | Red Pen (attack) | Measured advance and planted return; pen stays at actual wrist; correction stroke visibly travels from pen and clears shortly after hit. |
| bad-teacher | Curved Exam (defend) | Two edge grips, smaller sheet, bounded bend; red curve stays in sheet local space rather than hovering at a torso offset. |
| bad-teacher | Brian AI (heal) | Robot supported above left wrist; small advice token accepted at right hand; head looks down and settles, feet stay planted. |
| bad-teacher | Failed (special) | Short planted advance; constant right-hand stamp grip and deliberate pre-release press over the held report; left-hand paper flight and contact at .59. |

## Shared motion implementation

- Reuse shipped Three.js and original glTF rigs. No new dependency, downloaded asset, backend or balance change. Existing idle and hit/defeat clips remain the animation source.
- Neutral idle sample rather than a generic punch, bounce or overhead heal underneath unrelated gestures. Absolute bone position/quaternion/scale restoration makes each seek and repeated action deterministic.
- World-space two-segment IK respects the rigs’ differing bind axes and segment lengths. Feet alternate actual planted support and low swing; stride phase follows traveled distance, not an unrelated sine clock. Standing actions solve over fixed feet. Small skinned-sole correction prevents bent-knee skin weights penetrating the floor.
- Decoy, helpers, bouncer and lecture chair stay upright and scale around an actual floor pivot rather than hovering as they appear. The lead foot rises 0.20 m to match the stack top.
- Wrist-driven props; books and laptops use two grip points. Copied pages, grades, formulae, noodles and beer snapshot their release point, so recovery cannot tow a flying projectile. Physical beer uses a 9.81 m/s² parabola with constant horizontal velocity and nonzero landing speed.
- Props retire promptly after contact instead of freezing on the receiver. Generic impact stars are short and small; self-care actions do not receive a damage burst. Storm lightning starts at contact, not during anticipation.
- Fixed prop orientation, rather than attaching solid objects to a moving camera quaternion. Only graphic labels face the audience. Original baked notebook/pen meshes are temporarily hidden while a move supplies its own prop, then restored.
- Offensive camera retains source, flight and receiver; no projectile chase or shake. Lateral motion and push are reduced; camera ease is slower than hand/pose ease. Existing live bounds/HUD fitting and aisle clearance remain.
- Finish, cancel, reset, repeated and interrupted actions restore actors, original prop visibility, costume colors and baseline camera; procedural geometry/materials/textures are disposed. Reduced motion holds a semantic tableau, does not run/fly/spin/pan, and still completes on the original event clock.

## Evidence and reproduction

Evidence root: `/home/mathis/.openclaw/workspace/media/hsg-attack-polish/`.

- `index.html`: paired normal-speed video review for all 24 moves.
- `LEDGER.md`: observed timing defects, corrections, direct AFTER review and honest limits.
- `before/<fighter>-<mechanic>.webm` and `after/<fighter>-<mechanic>.webm`: individual playable performances.
- Matching `*-dense.png`: 24 samples at 100 ms spacing. `comparisons/`: concise before/after sheets.
- `before/recordings.json`, `after/recordings.json`: exact camera/aspect/matchup/timing measurements and source provenance.
- `coverage-final.json`, `matrix-final/`, `matrix-final-cloud/`: numeric real-render checks, not a large repetitive screenshot corpus.

`npm test` in `game/` includes dense mixed-character continuity, planted stance, trajectory, end restoration and interruption tests. Browser harnesses create only owned loopback HTTP/SSE Friend rooms, never public rooms. Run from repository root with `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` pointing to installed Playwright/Chromium:

```sh
NO_PROXY=127.0.0.1,localhost PHASE=review-reproduction node game/test/attack-polish-browser.mjs
node game/test/attack-polish-matrix.mjs
```

The recording harness also accepts `WORLD_SOURCE`, `FIGHTER_ID`, `TEST_PORT`, `EVIDENCE_DIR` and `FFMPEG_EXECUTABLE`. The canonical pair is Library, 1280×900 host, actor A versus the character three roster positions away. BEFORE and AFTER use the same baseline camera, aspect and matchup; action-camera refinement is intentional.

**Recording method:** actual production WebGL frames sampled at a fixed 30 Hz animation clock and encoded for natural-speed playback. Software Chromium is too slow to claim this as a real-time performance benchmark. No PNG-frame corpus is written; images are piped directly to the installed encoder. The smaller raster in the all-arena/device matrix changes neither CSS viewport nor camera geometry.

## Limits and integration caution

Stylized low-poly gesture animation, not motion capture or cloth simulation. Hood removal is a hand-supported garment prop plus temporary undershirt color; the full removal of a skinned sleeve is not simulated. Stamp-to-paper detail remains subtle at the compact host-stage scale. Original large wings still limit close-up scale without cropping. Physical phone GPU performance is unmeasured.

The live game serves this working tree. The feature commit and this narrow polish commit both depend on preexisting dirty move-label/Mensa prerequisites. **Do not deploy a clean checkout or push main blindly.** No service restart, infrastructure edit or production-room mutation is part of this work. Actual test counts, source SHA-256 and matrix outcomes belong to the final ledger; the existence of these harnesses alone is not a verification claim.

## Final verified outcome

193 game tests: 184 passed, 9 optional skipped, 0 failed on the final source. Full 288-case mixed-character matrix plus two 96-case targeted regressions passed with no console/page errors; all 24 before/after dense sequences were directly inspected. A real Trischli helper/bar contact was caught by additional body/sight-line probes and fixed, with a dedicated red→green regression. All 48 encoded WebMs decode, seek and retain their natural duration/aspect. Evidence and honest per-clip source provenance are in the final LEDGER.md and MANIFEST.json described above. Public renderer and six dependency assets match the working tree byte-for-byte; no restart or production-room mutation.


## Independent-review contact corrections (20 October, follow-up)

The prior 24-move pass received REQUEST CHANGES; its old visual acceptance claims above are historical, not evidence that these four defects were already correct.

- Bad Teacher: split the original exam's 620 charcoal triangles using their exclusive left-hand skin binding. Keep every other charcoal body triangle; hide only this accessory during action, restore on finish/cancel. Isolation occurs before first GPU upload, not as a per-action allocation.
- Full Marks / Failed: paper is a real upward-tilted actor-relative surface. Stamp underside is normal-aligned; approach .22–.385, contact .385–.415, recoil .415–.46. Only then does a surface-fixed print appear. Report release remains .46, opponent impact .59 and total 2200 ms. Hands solve toward actual paper-edge and stamp-handle points.
- Take Hoodie Off: no full garment prop until the overhead peel/undershirt handoff. Lower to chest, then reverse through an overhead pull-on before smooth restoration. Theatrical material/rigid-garment transition remains intentional; not cloth simulation.
- Glass of Water: authored lip socket is the model's Blender mouth relative to head bind, (0,.272,.247) in exported head coordinates. Position the actual near rim at it, tilt .85 radians toward actor along local X, solve hand from glass grip, hold briefly and lower. Neither contact nor tilt depends on camera facing.

Additional regression command: `node --test test/physical-contact.test.mjs` (from game/). Tests evaluate real GLB skin-index triangles, transformed stamp-base vertices, physical glass rim/handle and head socket, print visibility, and dense costume continuity on both sides. Evidence/provenance lives under the existing evidence root's contact-fixes/ directory. Canonical AFTER clips and the gallery manifest are updated after final-source capture; independent rereview remains required.
