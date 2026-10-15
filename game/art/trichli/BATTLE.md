# Turn-based battle view — gameplay adaptation

A dedicated editable **BATTLE / gameplay adaptation** scene now accompanies the three untouched photographic studies. This is original invented staging for the requested two-character, alternating-turn view, **not an additional photographic study, surveyed layout, or final character selection**. No game/runtime integration or animation logic is included.

## Deliverables

- `renders/battle-preview.png` — actual Eevee 3D render, 1920 × 1080, two original simple human-ish student placeholders facing each other.
- `renders/battle-background.png` — same camera, materials, lights and floor markers; Fighter collection disabled, ready for later 2D compositing. No baked HUD or commands.
- `trichli-arena.blend` — all four scenes, BATTLE selected by default. Fighter meshes, staging rings, world sign, camera and lights are independently editable.
- `battle.py` — deterministic adaptation of MAIN; `validate-battle.py` and `battle-validation.json` — fresh-open checks and projected landmark bounds.

Existing `generate.py`, three reference-study PNGs, reference manifests/targets and study statistics remain intact. The study validator now permits the separately disclosed fourth scene while retaining its original study-only checks.

## Composition and disclosure

Perspective camera at estimated (-0.9, -2.6, 2.5), 29 mm lens, aimed diagonally into the room. Teal player at (-1.9, 3.8, 0), ochre opponent at (1.7, 7.4, 0). The player is larger and near-left, seen from behind/three-quarter; opponent is far-right midground and faces back toward the player. They have student-like book bags and simple ready stances, not franchise designs or user-approved final characters.

Retained vocabulary: narrow smoked wood floorboards, left glass seating boundary, walnut paneled enclosure, far-end bottle bar, curved amber-edged stairs, exposed black ceiling/service rails and linear lighting. Battle-only foreground high tables are removed for a clear attack lane. Battle-only lighting is softer and clearer than the photographic study; the photographic haze volume is disabled in this scene only. Thin color floor inlays and the large **TRISCHLI** sign are invented gameplay identifiers. Sign is actual extruded world text on a dark brass-framed panel mounted at the far backbar, not a 2D overlay.

Bottom 23% is fighter-free for eventual commands; upper left/right are free of fighters for eventual HUD. No UI is baked into either required PNG. Floor rings remain in the matching background as intentional position guides, not character pixels.

## Reproduce (Blender 5.0.1, Eevee, three threads, sequential)

Run from this directory. Use an alternate output directory to avoid replacing the delivered files unintentionally.

~~~sh
# Existing delivered blend -> both battle PNGs and updated editable blend
blender -b trichli-arena.blend -t 3 --python-exit-code 1 --python battle.py -- --output-dir battle-rebuild
# Full source rebuild, preserving old study generation workflow
blender -b -t 3 --python-exit-code 1 --python generate.py -- --output-dir full-rebuild
blender -b full-rebuild/trichli-arena.blend -t 3 --python-exit-code 1 --python battle.py -- --output-dir full-rebuild
# Fresh-open validators on delivered files
blender -b trichli-arena.blend -t 3 --python-exit-code 1 --python validate.py
blender -b trichli-arena.blend -t 3 --python-exit-code 1 --python validate-battle.py
# Optional half-size draft (not a final validation target)
blender -b trichli-arena.blend -t 3 --python-exit-code 1 --python battle.py -- --output-dir battle-draft --draft --render preview
~~~

No add-on, external textures, reference photos, image generation, fonts or downloaded character models are used. Scene copies have independent objects and lights; existing architecture meshes/materials are deliberately reused read-only. Do not edit shared mesh data in BATTLE if you want reference studies unchanged: make that mesh single-user first. Regeneration is safe from either a three- or four-scene source; previous Battle collections are replaced, not stacked.

## Visual QA

First draft was opened as an actual image: player and opponent were too close in screen space and reserve was small. Second draft moved the camera and fighters to a clearly separated left/right diagonal, increased bottom reserve and toned down cyan fill. Both required final original PNGs are opened after rendering; final executed checks and screen bounds are recorded in `battle-validation.json` and the production addendum.

This source only stages a still battle view. Turn state, attacks, real character choice and runtime compositing remain separate future work.
