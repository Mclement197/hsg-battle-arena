# Trischli — reference studies + turn-based battle view

Three **independent editable 3D studies**, bounded to the best-documented photographic views, plus a separate **BATTLE / gameplay adaptation** derived from MAIN. The reference studies replaced the rejected venue-inspired combat arena; the new battle scene is explicitly invented staging, not a revised claim about the real layout. It is **not a surveyed venue model or a connected full floorplan**. The historical asset filename/slug is retained for continuity; the venue is spelled Trischli.

## Battle view

See [BATTLE.md](BATTLE.md) for the new full-HD perspective battle view, two original placeholder fighters, visible world-mounted **TRISCHLI** sign, matching fighter-free background and reproduction/validation commands. This fourth scene is an explicit gameplay adaptation; the photographic studies below are preserved.

## Reference-study deliverables

- `trichli-arena.blend` — scenes **DJ / reference 13**, **MAIN / reference 14**, **LOUNGE / reference 11**, each with its own matched-view camera and separately editable Architecture, Furniture, Props, Ceiling and Lights collections.
- `renders/dj.png`, `renders/main.png`, `renders/lounge.png` — original 1800 × 1200 PNGs (3:2, as in the three reference photos).
- `generate.py` — deterministic procedural construction and sequential Eevee rendering, no add-ons/downloads/textures or package installs.
- `validate.py`, `validation.json`, `scene-stats.json` — fresh-open technical validation, normalized screen landmarks, and actual geometry counts.
- `reference-manifest.json` — public reference URLs, observations and uncertainty. `reference-targets.json` records approximate manually observed screen-position targets, not measured architectural coordinates.

The user-requested blend and final previews are intentional production deliverables despite the repository's normal generated-file exclusion. Old hero/detail/overhead arena previews are removed rather than presented as current work. No runtime/game files are changed.

## Reproduce

Blender **5.0.1**, Eevee; render sequentially with **three threads**. Run from this directory:

~~~sh
blender -b -t 3 --python-exit-code 1 --python generate.py -- --output-dir /tmp/trischli-v3
# Draft: same 3:2 framing, 900 × 600, 24 samples
blender -b -t 3 --python-exit-code 1 --python generate.py -- --output-dir /tmp/trischli-draft --draft
# Build only, or render just one study
blender -b -t 3 --python-exit-code 1 --python generate.py -- --output-dir /tmp/trischli-v3 --render none
blender -b -t 3 --python-exit-code 1 --python generate.py -- --output-dir /tmp/trischli-v3 --render main
# Reopen delivered blend and validate all three scenes/resources/final PNGs
blender -b trichli-arena.blend -t 3 --python-exit-code 1 --python validate.py
~~~

Do not use this directory as an output target unless intentionally replacing deliverables. Select the desired scene in Blender's scene selector; BATTLE is the saved default in the combined delivery; generate.py alone defaults to MAIN. Meshes are individually named; bevels remain editable modifiers. Ceiling and atmospheric Lights collections can be toggled for inspection. Independent scene coordinates deliberately overlap: do not append them as if they were a proven joined floorplan. Native mesh geometry and procedural shaders are authoritative; there are no source-photo cards, mapped photographs, linked libraries, or missing external image resources. Volumetric beams are actual spot lighting in thin atmosphere, not solid cones. Glass uses a disclosed Eevee alpha approximation.

## What was corrected

- **DJ direction:** reference 13 looks FROM the decks across the room toward three luminous chevrons. They are no longer placed behind a frontal invented booth. Decks occupy the foreground lower band; the ceiling uses dense transverse horizontal light bars.
- **Main axis:** reference 14 is a narrower dark floor view with the bar **across the far end**, not along the side. Left glass/side seating, the paneled walnut enclosure mid-right, foreground black pedestal tables and observed curved amber-edged steps near-right establish the view.
- **Lounge:** reference 11 has **one continuous large zigzag carpet**, black wood-base sofas with facing orientations, slender coffee tables and glass edge; bar upper-left and paneled enclosure upper-right.
- Removed the invented open combat envelope, spawns, collision helpers, raised game terrace, arbitrary DJ dais, generic diagonal lights and unverified mirror-ball cluster placement.
- Kept each view as a named independent study rather than inventing a connection among photographs. Main and lounge share observed architectural vocabulary, **not a proven common-coordinate survey**.

## Observed versus unknown

Observed view-relative placement, silhouettes, carpet continuity, sofa direction, black technical ceiling, narrow dark floorboards, glass edge, walnut panel proportions and major lighting types drive the reconstruction. Camera position, focal length, dimensions, exact room extents, hidden surfaces, complete seating count, fixture spacing, equipment make/model, bottle inventory and construction details remain estimated. One Blender unit represents an estimated metre for editing convenience, **not an actual measurement**. The bounded side/back walls complete only what is necessary to render each view; they do not establish unseen room topology.

Original source photographs were personally viewed privately during revision. They remain copyright/reference-only with unknown reuse rights: **none are included, embedded, mapped, published or redistributed**. Final geometry, shaders and renders are original. Venue naming and the observed chevron motif identify the reference, not affiliation. Visual QA and remaining deviations are recorded in PRODUCTION.md; technical checks cannot prove architectural exactness.
