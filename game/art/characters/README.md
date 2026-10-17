# HSG Battle Arena — six original editable 3D characters

Native Blender 5.0.1 geometry, procedural materials and actual Cycles studio renders. No image-generation output, stock character meshes, downloaded textures, paid services or installations. Existing repository Blender workflows were inspected and native bundled bpy reused rather than introducing infrastructure.

## Deliverables

- `hsg-characters.blend`: six independent named studio scenes plus `LINEUP / Six original HSG characters`. The complete cast is intentionally in one modest compressed file; append any `CHARACTER / ...` collection independently.
- `renders/{luca,free-rider,tryhard,assessment,trischli-warrior,bad-teacher}.png`: full-body 3/4 1440×1600 studio portraits.
- `renders/lineup.png`: 3600×1200 wide line-up with editable character labels.
- `generate.py`: deterministic original builders; `validate.py`: fresh-open identities, geometry, materials, resources, framing and PNG checks.
- `source-manifest.json`: reference observations, URLs, access limitations and invention boundaries. Research photographs stay private under `/tmp/hsg-character-references` and are not packed or copied into delivery.
- `validation.json` and `visual-review.md`: actual technical and visual evidence.

Generated blend and previews are explicit requested art deliverables, not runtime assets. Only this new art directory and the authorized media delivery directory were written. No arenas, runtime, deployment, animation, balance, credentials, commit or push.

## Character design

- **Luca Di Grazia**: portrait-grounded narrow oval head, swept-up short dark hair, brows, projecting straight nose, short stubble and restrained smile; original ivory/gold divine academic costume, 48 separate layered feathers, editable gold halo. Single front upper-body portrait is insufficient for exact full-body likeness; fantasy body/costume and unseen angles are invented, not scanned.
- **Free-rider**: loose teal sweatshirt, slouched tilted posture, phone notifications, collapsed almost-empty satchel, abandoned crumpled TODO notes. The joke is group-project disengagement, not a body/ethnicity/intelligence association.
- **Tryhard**: oversize round glasses, copper side-parted hair, mustard/coral diamond-patterned collared shirt visibly TUCKED into high-waisted trousers; neat 6/6 notes and separate color-coded revision booklet.
- **Assessment**: nervous adult with forest-green HSG pullover, hood, white strings/gold tips, pouch, hem/cuffs and arched UNIVERSITÄT / ST. GALLEN / EST. 1898 typography, exam-13 timetable and cartoon sweat. Typography is editable original serif geometry approximating the actual official product; exact embroidery outlines are not claimed.
- **Trischli Warrior**: fictional adult clubgoer with open plum overshirt, black inner top, necklace, party cup, tilted pose and sleepy grin. Five stars/particles/orbit have their own editable VFX collection, not a baked image or simulated effect.
- **Bad Teacher**: fictional severe lecturer, broader rigid silhouette, brown checked tweed jacket, red tie/marking pen, failed exams; not a depiction of an actual teacher.

## Editing and limitations

Every character has a `<id> / TRANSFORM ROOT` Empty. Move/rotate/scale that root, not the individual child meshes. Names distinguish tailoring, face parts, hair, hands, shoes and props; Luca wings/halo, Tryhard glasses and Trischli VFX are separate logical child collections. Studios are outside character collections. Line-up uses collection instances linked to the originals.

**Static editable art, NOT rigged or engine-ready.** No armatures, skin weights, animation, unified deformation topology, retopology, UV atlases, LODs, collision meshes or runtime integration. Part intersections at tailored joints intentionally provide a seamless cartoon assembly; these are separable sculptural parts, not production skin topology. Curves/text/modifiers remain editable. Do not advertise game-ready export without further optimization, rigging and engine tests.

## Reproduce

From repository root, installed Blender 5.0.1 and system DejaVu fonts (packed into saved blend):

~~~sh
/usr/bin/time -v blender -b -t 3 --python-exit-code 1 \
  --python game/art/characters/generate.py
blender -b game/art/characters/hsg-characters.blend -t 3 --python-exit-code 1 \
  --python game/art/characters/validate.py
~~~

Draft: append `-- --draft --output-dir /absolute/allowed/review-directory`. Geometry-only reproduction: `-- --render none --output-dir /absolute/allowed/rebuild-directory`. Rendering is strictly sequential, three fixed threads per process. No background service, installation or runtime changes. Draft/refined review subdirectories preserve actual iteration evidence and are not required when opening the final blend.
