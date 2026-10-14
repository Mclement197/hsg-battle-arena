# Production verification — 2026-10-14

## Executed

- Inspected private contact sheet and all **seven** architecture references (11, 12, 13, 14, 16, 17, 18) before modeling.
- Two 50%-resolution camera-review passes, followed by full-resolution inspection and refinement.
- Final generation: `blender -b -t 3 --python-exit-code 1 --python generate.py -- --output-dir <deliverables>` — exit 0; all three PNGs saved. **2m03s total**, peak process RSS **946,508 KiB**; no renderer errors in final log. Only Blender 6.0 forward-looking use_nodes deprecation notices.
- Reopened final compressed blend in a fresh Blender process with `blender -b trichli-arena.blend -t 3 --python-exit-code 1 --python validate.py` — exit 0; **19/19 checks passed**. See validation.json.
- Python AST syntax parse of generate.py and validate.py — passed.
- PNG header dimensions and size limits checked — passed: hero 1920×1080, detail 1920×1080, overhead 1920×1440, each below 8 MiB. Blend below 25 MiB.
- `git diff --check` — passed. Nothing staged, committed, pushed or deployed.

## Visual review

Privately opened the actual draft and final PNGs, not only filenames/logs. Refined the initially overbright dance floor, darker lounge glass, clipped chevron framing, obstructed overhead bar, and missing staggered foreground floorboard ends. Final images show the three-chevron booth, two decks/mixer, gold mirror-ball cluster, black ducts and linear ceiling lights, walnut bar/bottles, black wood-base lounges with zigzag rugs/glass screens, and a clean open central floor. The detail camera intentionally crops the nearest gold ball and left speaker while keeping all three chevrons and the decks visible. Lighting uses restrained warm/cool pools; volumetric white beams remain subtle rather than opaque cones. The cutaway deliberately omits the ceiling and camera-facing east wall/backbar shelving so circulation is visible.

## Scene and integration scope

Saved scene: 1,468 objects, 1,444 mesh objects, 47,022 authored mesh vertices / 24,071 polygons before bevel evaluation; 24 used materials, three cameras, seven collision helpers. Architectural bounds including foundation and ceiling: **16.4 × 20.4 × 5.15 m**; room interior 16 × 20 m. Seven top-level/child collections (six primary, one ceiling child). No file-based images, linked libraries, external fonts or missing resources. Blender may expose its internal viewer image; that is not a source photo or texture dependency.

The model is **venue-inspired**, not a survey. Layout, dimensions, stage and raised-lounge positions are inferred and disclosed. Browser optimization, exact real-world measurements, navigation testing and runtime integration are not claimed. No optional interchange export attempted; native editable Blender delivery is complete.

Source photographs and temporary working files are not deliverables. Only original Blender source, scene, renders, and these reproducibility notes are included.
