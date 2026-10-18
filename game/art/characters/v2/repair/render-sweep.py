"""Actual swept pose evidence: 9 frames special/defeat, same 3/4 contact camera."""
import bpy,sys,os
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[-1]);out.mkdir(parents=True,exist_ok=True)
for sc in bpy.data.scenes:
 rigs=[o for o in sc.objects if o.type=='ARMATURE']
 if not rigs:continue
 if os.environ.get('CHARACTER_NAME') and sc.name!=os.environ['CHARACTER_NAME']:continue
 bpy.context.window.scene=sc;r=rigs[0];sc.cycles.samples=4;sc.render.resolution_x=400;sc.render.resolution_y=480
 sc.camera.location=(4,-9,3);sc.camera.rotation_euler=(Vector((0,0,1.95))-sc.camera.location).to_track_quat('-Z','Y').to_euler();sc.camera.data.ortho_scale=4.6
 for o in sc.objects:
  if o.name.startswith('STUDIO') and o.type in ['MESH','FONT','CURVE']:o.hide_render=True
 for clip in ['attack','special','defeat']:
  for t in r.animation_data.nla_tracks:t.mute=True
  strip=next(t for t in r.animation_data.nla_tracks if t.name==clip).strips[0];r.animation_data.action=strip.action;r.animation_data.action_slot=strip.action_slot
  for j in range(9):
   frame=1+int((strip.action.frame_range[1]-1)*j/8);sc.frame_set(frame);sc.render.filepath=str(out/(sc.name+'-'+clip+'-'+str(frame)+'.png'));bpy.ops.render.render(write_still=True)
