# Attack choreography (presentation only)

Audit: authoritative roster exports **6 characters × 4 moves = 24 named moves**. Every label has a deliberate prop and distinct joint gesture, not a motif recolor.

## Complete coverage

| Fighter ID | Mechanic | Actual move | Spatial action | Windup → action / impact → recovery |
|---|---|---|---|---|
| luca-di-grazia | attack | Golden Chalk | melee | Draw back chalk; run in; carve a golden tick; jog home. |
| luca-di-grazia | defend | Open Book | self | Lift closed book; open both covers as a shield; read; fold away. |
| luca-di-grazia | heal | Good Work | self | Lean forward; approving thumbs-up and gold star; proud nod; settle. |
| luca-di-grazia | special | Full Marks | melee | Raise marked exam; stride in; stamp 100% with a gold shower; return. |
| free-rider | attack | Copy / Paste | projectile | Pinch a source page; duplicate it; send the PASTE copy; pocket the original. |
| free-rider | defend | Paper Decoy | self | Fold paper; unfold a life-size paper stand-in; duck behind it; stand back up. |
| free-rider | heal | Group Credit | self | Beckon three contributors; take their CREDIT medal; celebrate; wave them off. |
| free-rider | special | AI Slop | projectile | Hunch over laptop; type; launch a tangled robot-generated noodle ball; close laptop. |
| tryhard | attack | Formula | projectile | Count on fingers; write an equation; propel a spinning sigma; erase and reset. |
| tryhard | defend | Textbook | self | Heave a heavy textbook; brace behind its spine; absorb a pulse; lower it. |
| tryhard | heal | Extra Credit | self | Stack extra books; step up with raised hand; collect +1 star; step down. |
| tryhard | special | A+ | projectile | Wind up a gold grade; flourish; send an enormous A+ seal; scholarly bow. |
| assessment-hoodie | attack | Bad Luck | summon | Recoil superstitiously; point; summon rain and lightning above opponent; shake it off. |
| assessment-hoodie | defend | Hood Up | self | Grab both sides; pull a real hood overhead; hunker down; release the fabric. |
| assessment-hoodie | heal | Take Hoodie Off | self | Cross arms; peel off a modeled hoodie; stretch in sunshine; fold it away. |
| assessment-hoodie | special | Skip Maths A Lecture | evade | Eye the MATHS A board; sneak away leaving an empty chair; send absent note; sneak back. |
| trischli-warrior | attack | Dance Off | melee | Run to dance floor; windmill arms and alternate high knees; disco stomp; moonwalk home. |
| trischli-warrior | defend | Call the Bouncer | self | Phone the door; summon a suited bouncer; fold arms together; dismiss the guard. |
| trischli-warrior | heal | Glass of Water | self | Reach for transparent water glass; lift to mouth; sip and sparkle; lower glass. |
| trischli-warrior | special | Throw a Beer | lob | Cock mug behind shoulder; overarm throw; amber beer arcs and splashes; wipe brow. |
| bad-teacher | attack | Red Pen | melee | Brandish red pen; run in; draw a broad correction slash; step back home. |
| bad-teacher | defend | Curved Exam | self | Grip exam ends; physically bend a curved exam shield; trace grade curve; flatten and lower. |
| bad-teacher | heal | Brian AI | self | Tap a tablet; summon BRIAN robot tutor; receive a green advice heart; thank and close. |
| bad-teacher | special | Failed | melee | Hoist a red stamp; charge; slam FAILED onto a report beside opponent; recoil and retreat. |

## Implementation decisions

- Reuse shipped Three.js, authored glTF clips and actual named limb/finger rig. Deterministic additive joint offsets and original procedural props; no dependency, downloaded asset or backend/balance change.
- Preserve 2200 ms duration, .32 launch, .59 impact and existing authoritative result queue/completion/HP contract. No new combat timers.
- Melee runs along the central aisle, maintains 1.2 m body separation, then returns exactly home. Ranged actions transport actual pages, grades, formulae, noodles or beer. Summons appear at the destination.
- Camera stays in the previously ray-tested aisle corridor, follows performer toward impact and fits live skinned bounds/props below HUD. Self-care shots prioritize the performer. Ranged shots follow performer → traveling prop → receiving actor; inactive bodies may leave the cinematic shot. Melee contact retains both actors. Selection camera and all arena geometry preserved.
- Hoodie removal uses a theatrical garment prop and temporary ivory undershirt color on existing green-clothing material, not clothing simulation or a replacement character mesh.
- Reduced motion holds a semantic tableau with baseline camera; no running, flight, spin, pulsing pose or camera movement. Completion remains on the original event clock.
- Finish/cancel/reset/scope changes restore holder transforms, idle joints, camera and costume colors. Geometry/materials/text textures disposed through existing release helper.

## Reproduction

- Run npm test in game/ (includes test/attack-overhaul.test.mjs).
- Browser: set PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs and CHROMIUM_EXECUTABLE=/path/to/chrome, then run node game/test/attack-overhaul-browser.mjs from repository root.
- Optional ARENA_ID / FIGHTER_ID selects a focused reproduction. EVIDENCE_DIR controls output.
- Harness creates only owned loopback Friend rooms, submits actual HTTP/SSE moves and renders production begin/animate/finish paths. Four-frame contact sheets cover windup/action/impact/recovery for every move, both sides, three arenas, desktop host/phone guest. Projected bounds, home restoration and GPU resources are asserted.
- Also exercises interrupted/repeated poses, reduced motion, orientation and reset/arena reentry. First-character cases additionally record real-time WebM using captureStream/MediaRecorder. These are actual WebGL frames, not canned/mocked attack images.

Evidence: /home/mathis/.openclaw/workspace/media/hsg-attack-overhaul/. See final handoff for actual outcomes; a harness is not a claim that an unrun check passed.

Limits: software Chromium does not prove physical phone GPU performance. Procedural comedy over existing low-poly assets, not new motion-capture animation.

## Verified 2026-10-20

- Full game suite on the final implementation: 182 tests, 173 passed, 9 optional tests skipped, 0 failed. Final TAP: game-tests-final.tap in the evidence directory below.
- Aggregated browser verification: 288 real-render cases (24 moves × both sides × all three arenas × desktop/phone), 1,152 captured phase frames, 333 check records, 288 repeated cancellations and no console/page errors. Every move returns actors exactly home, disposes its GPU geometry/textures, and restores the baseline camera. Reduced-motion, orientation, reset and arena reentry checks passed.
- The leak check warms arena geometry once before measuring: a first camera pan legitimately uploads previously culled Mensa geometry, which is a renderer cache, not a move leak.
- Evidence: /home/mathis/.openclaw/workspace/media/hsg-attack-overhaul/final/coverage.json and checks-final.json; all-24-moves-impact-overview.png; six proof-*-all-moves.png sheets; all 288 individual four-phase sheets; three *-live-action.webm recordings.
- Public HTML, app.js and battle-world.js returned 200/no-store and byte-identical SHA-256 hashes to the tested source, with cache key 20261020-attacks1. No production service restart or production-room mutation was used.
- Limit: standalone Chromium public navigation returned ERR_INVALID_AUTH_CREDENTIALS in this runtime. The live public browser flow is not claimed verified; public source integrity and isolated real HTTP/SSE browser rendering were verified separately. Physical phone GPU performance is not measured.
