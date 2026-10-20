# Independent-review residual repair

Input: rejected `3c84c6b` (see full independent report in evidence root). Evidence: /home/mathis/.openclaw/workspace/media/hsg-model-animation-audit/residual/.

- Assessment lower covered shell/ribbing is fitted against actual trousers and receives those triangle weights below the buried seam; no blanket body hiding.
- Tryhard coral diamonds and Tryhard/Luca/Bad Teacher pointed collars are thin projected surfaces with barycentric torso skin weights. Outer motif column is moved inside the actual torso silhouette; collar roots meet the upper shirt rim.
- Assessment authored hood is a semantic separate skinned region, still included in removable_garment. Hood Up modifies a private geometry copy and restores the exact original reference on completion/cancel. No second sphere-shell is created. Take Hoodie Off carries both shell and hood and keeps the weighted underlayer.

Reproduce from clothing-migrated pre-residual blend (saved at residual/before/source.blend):

~~~sh
blender -b BASELINE.blend -t 2 --python-exit-code 1 --python game/art/characters/v2/residual-repair.py -- REPAIRED.blend
blender -b REPAIRED.blend -t 2 --python-exit-code 1 --python game/art/characters/v2/repair/export-refined.py -- OUTPUT
node game/art/characters/v2/repair/verify-staged.mjs OUTPUT
node --test game/test/hood-articulation.test.mjs game/test/clothing.test.mjs game/test/physical-contact.test.mjs game/test/model-state.test.mjs
~~~

The earlier complete/transitions-* videos were screenshot montages (36 screenshots encoded at 12fps), **not uninterrupted recordings**. New model-continuous-audit.mjs uses Playwright compositor video across selection, battle, victory, reentry and loss. Production RAF/mixer/animation clocks are not advanced; only local prebattle authoritative deadlines and low-HP fixtures are used. No production rooms are touched. hood-closeup-audit.mjs separately captures uninterrupted action-camera and profile runs; STILLS_ONLY explicitly samples fixed timeline points for four actor-local views and must not be called continuous.

Native model videos remain deterministic 24Hz timeline playback, not real-time performance recordings. Chromium software rendering and phone emulation do not establish physical-phone/GPU performance. Source/model hashes and decoded native-resolution frames are in residual manifests. Independent coordinator re-review remains mandatory; no universal collision-free claim.

Compositor recordings are uncut browser recordings, not screenshot encodes; software rendering can omit startup gaps, so wall-clock markers are approximate video offsets. `actions-live-final` pins final renderer SHA256. A separate `live-debug` run confirms production RAF has an active hood at 1016ms; full-resolution fixed diagnostic snapshots remain authoritative for subtle geometry inspection. Earlier action experiments are explicitly superseded in provenance.
