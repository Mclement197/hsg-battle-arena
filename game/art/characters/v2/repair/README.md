# Evidence-led anatomy/contact repairs

Read [self-authored repair prompt](SELF-REPAIR-PROMPT.md) and [verification](VERIFICATION.md). All binaries are staged outside public assets for parent visual review, not silently published to live users.

From repository root (installed Blender/Node dependencies):

~~~sh
export E=/home/mathis/.openclaw/workspace/media/hsg-character-repair
HSG_CHARACTER_OUTPUT=$E/staged HSG_CHARACTER_EXPORT=$E/staged/glb blender -b -t 3 --python-exit-code 1 --python game/art/characters/v2/generate.py -- --render none
blender -b $E/staged/hsg-characters-v2.blend -t 3 --python-exit-code 1 --python game/art/characters/v2/repair/validate-repair.py -- $E/native-validation.json
node game/art/characters/v2/repair/verify-staged.mjs $E/staged/glb
blender -b $E/staged/hsg-characters-v2.blend -t 3 --python-exit-code 1 --python game/art/characters/v2/repair/render-diagnostics.py -- $E/after
python3 game/art/characters/v2/repair/sheets.py $E/after
node game/art/characters/v2/repair/test-staged-assets.mjs $E/isolated-game $E/staged/glb
PLAYWRIGHT_MODULE=/home/mathis/.npm-global/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/home/mathis/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome MODEL_DIR=$E/staged/glb EVIDENCE_DIR=$E/after/runtime node game/art/characters/v2/repair/runtime-check.mjs
~~~

## Final candidate / contour iteration
Final proposed binaries are evidence-root/refined/, not the earlier staged/ candidate. The exact ten-pass localized trouser relaxation now lives in anatomy-repair.py. refine-contour.py applies that identical operation to the already baked native candidate without rebaking motion; export-refined.py fresh-opens and re-exports all six. See VERIFICATION.md for the exact test distinction and remaining art-review limitations.

The browser test uses genuine HTTP/SSE authoritative matches on owned loopback port 18997 with normal motion, both arenas and touch mobile. Only model HTTP bytes are substituted with staged GLBs. No deployed room or server mutation. Test target all six; QUICK=1 restricts to Luca/Free-rider smoke. Native validation checks actual connected manifold trouser topology, normalized weights, rigid prop distances, locked grips, bimanual drift and foot/skin sweep. Export check samples 41 times per clip plus return blending. Neither is a general self-collision proof.
