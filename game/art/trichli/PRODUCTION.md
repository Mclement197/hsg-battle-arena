# Revision 3 production verification — 2026-10-15

## Reference inspection and scope

Personally opened the actual official photos **13, 14 and 11** before rebuilding, then opened them again during crop review. Read repository instructions/proposal and inspected unrelated dirty work before editing. Relevant Blender skill search returned no Blender-specific workflow; graft instructions were read, but the graft executable was unavailable. No third-party model/add-on is required: the installed Blender 5.0.1/Eevee procedural modeling toolchain is used.

The earlier connected combat arena and old hero/detail/overhead renders are superseded, not evidence for this delivery. Three named **independent** bounded studies avoid fabricating a surveyed connection. All scale is estimated. No game/runtime files, services, credentials, Git commits or publishing are part of this revision.

## Visual iteration

Three draft passes were personally inspected as images and compared with the actual photographs, not just logs. First pass exposed cropped oversized decks, off-screen foreground tables/steps, and a lounge crop too far from the photo. Second pass corrected deck scale, visible black high tables, right curved steps and facing-sofa arrangement. Third pass refined chevron height, foreground equipment band, lounge camera tilt, larger paneled enclosure, ceiling density and photographic beams. Full-resolution outputs are inspected again before handoff.

The reconstruction prioritizes camera silhouette and observed view-relative layout:

- **DJ / 13:** two foreground players plus central mixer, dark transverse parapet, three far-wall chevrons, dense horizontal light strips/black low ceiling. This is a view FROM the decks, not a frontal booth with arrows behind it.
- **MAIN / 14:** far-end bar, narrow dark floorboard axis, left glass/side seating, paneled walnut enclosure mid-right, two foreground black high tables and near-right amber curved steps.
- **LOUNGE / 11:** a single continuous geometric zigzag carpet, walnut-base black sofas, coffee tables, glass edge, bar upper-left and paneled enclosure upper-right. No split carpet islands.

Remaining differences are disclosed rather than called exact: photographs contain reflections, exposure/haze and hidden layout that cannot be uniquely recovered; lens and metric dimensions are guessed; sofa count/spacing and equipment details are approximated; floor/material grain and fixture spacing are procedural, not copied. No combat area or unverified disco-ball location is included. Private source-versus-render sheets are QA-only, outside the repository; public previews are original renders only.

## Reproducibility and technical evidence

Final generation, fresh reopen validation and file-size results are recorded in validation.json and scene-stats.json. The validator checks three scenes/cameras, scene independence, editable meshes, estimated metric-scale disclosure, actual resolution, arrows/decks/carpet, absent gameplay/disco inventions, enabled ceilings, finite transforms, material coverage, external resource absence and delivery-size bounds. Normalized landmark output is measured from the actual scene cameras after evaluating each scene, not an architectural accuracy score. Draft validation intentionally rejects 900px/50% files; only final output may pass.

No source photographs are packed, linked, mapped to geometry or copied into Git. No export dependency, NumPy installation or external asset fetch is needed. Native editable Blender is the delivered format.

## Executed final checks

- Full sequential three-thread Eevee render completed successfully in **2m24s**; a later lounge-only camera refinement was rendered sequentially from the same generator. All final images were personally opened.
- Fresh-process reopen with `blender -b trichli-arena.blend -t 3 --python-exit-code 1 --python validate.py`: **exit 0, 21/21 technical checks passed**.
- AST parsing of both Python scripts, JSON parsing, documentation private-path exclusion and `git diff --check -- game/art/trichli`: passed.
- Three 1800 × 1200 PNGs, each under 2 MiB; compressed blend approximately 1.26 MiB (below 25 MiB).
- 3,078 editable objects across independent scenes (DJ 630; MAIN 946; LOUNGE 1,502), 47,746 mesh vertices, 29 used materials (generation statistics), no source-photo/file image resources.
- Actual DJ chevrons occupy normalized x 0.324–0.692, y 0.352–0.503; deck centers y 0.714. Main bar center is (0.500, 0.573), foreground table centers (0.266, 0.651) and (0.745, 0.651). These are approximate photographic composition matches, not exact fits: main enclosure remains larger and tables wider/more outward than the reference; atmosphere is softer and less brilliant; equipment detail is simplified.
- Independent parent review accepted these studies as the revised delivery but explicitly noted the visible simplification: this is not a highly accurate surveyed reconstruction of the whole venue. This publication changes assets/docs only; it does not integrate them into game runtime, deploy, or modify services.

Final lounge inspection confirms one continuous carpet, visible facing sofas and glass, with bar upper-left. It is still a looser view match than the DJ study: the paneled enclosure projects nearer upper-center/right and smaller than in photo 11, foreground sofa crop/rotation and carpet zigzag frequency differ, and ceiling bars are thicker/brighter. These are remaining visual deviations, not solved by the passing technical validator. This bounded delivery must not be described as a highly accurate surveyed reconstruction; technical validation does not establish photographic fidelity. Final preview copies were SHA-256 matched to deliverable PNGs; private QA sheets refreshed from the final files.
