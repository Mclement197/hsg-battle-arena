"""Apply final measured camera reserve and rerender sequentially, after initial build.
Kept as a tiny reproducible refinement utility; generate.py already includes this setting.
"""
import bpy,os
base=os.path.dirname(bpy.data.filepath);s=bpy.data.scenes['BATTLE / HSG library'];bpy.context.window.scene=s;s.camera.data.shift_y=-.035
bpy.data.objects['HSG BIBLIOTHEK / invented game label'].data.size=.49
bpy.data.objects['Invented game-label fascia panel'].dimensions=(6.25,.075,.61)
for kind in ['battle-preview','battle-background']:
 bpy.data.collections['Fighters'].hide_render=kind=='battle-background';s.render.filepath=os.path.join(base,'renders',kind+'.png');bpy.ops.render.render(write_still=True)
bpy.data.collections['Fighters'].hide_render=False;bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
