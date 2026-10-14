# Trischli Club — venue-inspired arena

An original, editable Blender environment inspired by **Trischli Club, Brühlgasse 15, St. Gallen**. The requested asset slug `trichli` is retained; the venue's correct spelling is **Trischli**.

## Deliverables

- `trichli-arena.blend` — compressed, editable metric scene, procedural materials, three cameras.
- `generate.py` — deterministic original modeling/material/light source; no add-ons, downloads, assets or Python package installation needed.
- `renders/hero.png` — 1920 × 1080 interior, entrance toward DJ/bar.
- `renders/detail.png` — 1920 × 1080 equipment, chevrons, joinery and bar.
- `renders/overhead.png` — 1920 × 1440 ceiling-off layout cutaway.
- `reference-manifest.json` — seven official reference URLs with observed/inferred tags.
- `scene-stats.json` and `validation.json` — actual generation/reopen checks.

**Generated-output exception:** the user explicitly requested the editable Blender file and finished renders as deliverables. These original production assets are intentionally included here despite the repository's normal generated-output exclusion. Temporary drafts, logs, Blender backup files and third-party reference photos are excluded.

## Reproduce

Blender **5.0.1**, Eevee, three threads used in production. From this directory:

```sh
blender -b -t 3 --python generate.py -- --output-dir /tmp/trischli-rebuild
# Quick 960px review only:
blender -b -t 3 --python generate.py -- --output-dir /tmp/trischli-draft --draft
# Geometry/material build only:
blender -b -t 3 --python generate.py -- --output-dir /tmp/trischli-rebuild --render none
# Validate an already saved scene:
blender -b trichli-arena.blend -t 3 --python validate.py
```

Render sequentially, not in parallel. Do not point production reproduction at this folder unless replacing its deliverables is intended. Materials use generated coordinates, noise and modeled detail; no external textures are required. Eevee reflection/transmission is an art-directed approximation, not a path-traced survey.

## Editing and game use

Collections: **Architecture**, **Props**, **Lighting**, **Cameras**, **Gameplay**, **Collision**. The Architecture child **Ceiling • cutaway toggle** holds the ducts, linear grid, moving-head shells and gold ball cluster. It is enabled in the saved interior scene. For an overhead view, hide that child collection and the Lighting object **Atmosphere** from rendering. The supplied cutaway also sections away the camera-facing east wall/dado and rear bar shelving/mirror, and adds a presentation fill to expose the counter and circulation. The generator does this temporarily without deleting or permanently hiding the saved interior architecture.

Z-up, one Blender unit = one metre; back is +Y. Room interior is 16 × 20 m; the central helper envelope is 6.8 × 10 m. **Spawn_A**, **Spawn_B** and **Arena_centre** are nonrendering empties. Seven hidden `COL_*` meshes are coarse integration helpers, **not a tested navigation/collision system**. No runtime game files or existing UI were changed. This is an editable environment source, not a browser-optimized LOD or a claim of completed game integration. Blender is the authoritative delivery format; no GLB/FBX/OBJ export is required or claimed.

## Reference fidelity and limitations

**Observed:** black technical/duct ceiling; staggered white linear lights; dark timber floor; honey/walnut bar joinery; black upholstered sofas on wood bases; small tables, glass partitions, zigzag lounge rug; two decks plus mixer; **three white chevrons**; golden mirror-ball cluster; amber lighting and narrow white beams.

**Inferred/adapted:** every dimension, room outline, DJ-back/bar-east/lounge-west adjacency, precise stairs and raised lounge placement, circulation, bottle inventory and spawn envelope. Official listings establish a multi-level venue, but no surveyed plan was available. This single-room composition is a **recognizable venue-inspired game adaptation, not an exact architectural reconstruction**. The 0.36m lounge terrace is a deliberate gameplay/visibility interpretation, not an assertion about the real lounge level. No exterior facade is invented.

The seven official photographs were inspected privately before modeling. Their URLs and feature evidence are recorded in the manifest. They are copyrighted/reference-only with unknown reuse rights: **no third-party photos are copied into the repository, packed in the blend, mapped to geometry or redistributed**. All delivered geometry, shader work and previews are original for this project. Venue naming and the observed chevron motif identify inspiration, not affiliation or endorsement.
