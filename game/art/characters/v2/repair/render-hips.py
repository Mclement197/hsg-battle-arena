import bpy,sys
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[-1]);out.mkdir(parents=True,exist_ok=True)
for sc in bpy.data.scenes:
 rigs=[o for o in sc.objects if o.type=='ARMATURE']
 if not rigs:continue
 bpy.context.window.scene=sc;r=rigs[0];sc.cycles.samples=8;sc.render.resolution_x=520;sc.render.resolution_y=440
 for t in r.animation_data.nla_tracks:t.mute=True
 strip=next(t for t in r.animation_data.nla_tracks if t.name=='idle').strips[0];r.animation_data.action=strip.action;r.animation_data.action_slot=strip.action_slot;sc.frame_set(1)
 sc.camera.location=(0,-8,1.55);sc.camera.rotation_euler=(Vector((0,0,1.55))-sc.camera.location).to_track_quat('-Z','Y').to_euler();sc.camera.data.ortho_scale=1.27
 for o in sc.objects:
  if o.name.startswith('STUDIO') and o.type in ['MESH','FONT','CURVE']:o.hide_render=True
 sc.render.filepath=str(out/(sc.name+'-hips.png'));bpy.ops.render.render(write_still=True)
