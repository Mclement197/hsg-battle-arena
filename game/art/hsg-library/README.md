# HSG main library — editable battle arena

Original Blender geometry and procedural materials, based on the **2013** main-library interior photograph listed in [reference-manifest.json](reference-manifest.json). This is a bounded visual reconstruction, **not a survey or a claim about 2026 furniture**. The 1989 pre-move library was excluded entirely.

## Deliverables

- `hsg-library.blend` — editable shared architectural shell, two scenes/cameras.
- `generate.py` — deterministic, bundled-bpy-only generation; no installs, add-ons, downloaded meshes or textures.
- `validate.py` / `validation.json` — fresh-open technical checks and measured screen-space bounds.
- `renders/reference-interior.png` — 1800×1200 upper-gallery diagonal architectural interpretation.
- `renders/battle-preview.png` — 1920×1080 original placeholder students, near-left and far-right.
- `renders/battle-background.png` — same 1920×1080 battle camera, no students, no baked UI.

Generated blend and final PNGs are **explicit user-requested deliverables**, an authorized exception to the repository's usual generated-output exclusion. No commit/push or engine integration is included. All other repository work and Trischli assets are preserved.

## Reproduce

From repository root, with installed Blender 5.0.1:

```sh
/usr/bin/time -v blender -b -t 3 --python-exit-code 1 \
  --python game/art/hsg-library/generate.py
/usr/bin/time -v blender -b game/art/hsg-library/hsg-library.blend -t 3 \
  --python-exit-code 1 --python game/art/hsg-library/validate.py
```

Optional draft: add `-- --draft --output-dir /absolute/review/draft`. To generate without rendering use `-- --render none`. Renders run sequentially, with three fixed Blender render threads; no other render processes should run concurrently. No runtime configuration changes or dependencies.

## Editing

Use scene `BATTLE / HSG library` for gameplay; the saved fighters are visible and editable. Hide the `Fighters` collection for clean background output. Scene `REFERENCE / 2013 architectural interpretation` excludes fighters and the invented label via its view layer. Architecture meshes and materials are shared intentionally between scenes. Shelves and books are editable; book geometry is efficiently batched by bay/material, not individually named book objects. Cameras, lights, white columns, duct, skylight ring/ribs, glass/metal gallery rails and central landmark sculpture are separate named objects/collections.

## Observed versus invented

The verified source was personally viewed before modeling. Preserved vocabulary: **ground + one upper gallery**, white/light-gray dense steel stacks, raw concrete fascia and coffer rhythm, wide pale glass/metal gallery rails, left-of-center paired slender white columns, large near-right white duct, maroon oval/circular skylight ring with white radial glazing structure, dark gray carpet, central dark sculpture on a short round pale pedestal.

The auditorium chairs, black speaker platform, audience and banners belong to the photograph's **temporary 2013 symposium event** and are deliberately omitted. No extra story, grand staircase, wood fantasy shelves, crowd, or event branding.

All metric dimensions are **inferred**: roughly 16×19 m open atrium, gallery deck at about 3.3 m, concrete roof-edge height about 6.7 m. The original wide-angle photo has perspective distortion; exact dimensions, skylight profile, unseen plan and shelf arrangement are not established. Peripheral desks/chairs, spine colors/titles and their positions are assumed. The central sculpture is a restrained original abstract silhouette approximation, **not an exact artwork reproduction**; no artist/title is invented.

**HSG BIBLIOTHEK is an invented game label**, not observed real signage. It appears only in gameplay. Two original student figures are replacement-ready stand-ins, not final characters. Lower 20% is reserved for commands and upper corners are fighter-free for HUD; no HUD is baked into renders. The floor is cleared only of temporary event staging; the central landmark remains.

## Verification and visual review

Fresh-open `validate.py`: **22/22 checks passed** in Blender 5.0.1. Three renders were sequential with three fixed render threads; maximum measured process RSS **1,024,672 KiB (~0.98 GiB)**. Blend **2,494,702 bytes**; PNGs **2.02–2.22 MB** each. All below requested limits. Player footline is at **75.761%**, leaving the bottom 20% command zone clear; game label projects about **248×24 px**. See `validation.json`, `resource-evidence.json` (hashes, sizes and timings), and [actual visual comparison notes](visual-review.md).

Draft, refined draft and all three final images were actually opened and visually compared to the source. A blocked initial battle camera and reference-scene save-persistence issue were fixed before final validation. Technical checks do not certify photographic/as-built accuracy. The interpretation prioritizes the gallery/column/skylight silhouette rather than recreating temporary event seating.
