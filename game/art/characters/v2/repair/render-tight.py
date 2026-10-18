"""Actual Cycles individual hands in front/side, all identities, mid special and idle."""
import bpy,sys,os
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[-1]);out.mkdir(parents=True,exist_ok=True)
for sc in bpy.data.scenes:
 rigs=[o for o in sc.objects if o.type=='ARMATURE']
 if not rigs:continue
 if os.environ.get('CHARACTER_NAME') and sc.name!=os.environ['CHARACTER_NAME']:continue
 bpy.context.window.scene=sc;r=rigs[0];sc.cycles.samples=8;sc.render.resolution_x=700;sc.render.resolution_y=650
 for o in sc.objects:
  if o.name.startswith('STUDIO') and o.type in ['MESH','FONT','CURVE']:o.hide_render=True
 for clip,frame in [('idle',1),('special',19)]:
  for t in r.animation_data.nla_tracks:t.mute=True
  strip=next(t for t in r.animation_data.nla_tracks if t.name==clip).strips[0];r.animation_data.action=strip.action;r.animation_data.action_slot=strip.action_slot;sc.frame_set(frame);bpy.context.view_layer.update()
  for side in ['left','right']:
   p=r.matrix_world@r.pose.bones[side+'.hand'].tail
   for label,offset in [('front',(1,-5,1)),('side',(5,-1,1))]:
    sc.camera.location=p+Vector(offset);sc.camera.rotation_euler=(p-sc.camera.location).to_track_quat('-Z','Y').to_euler();sc.camera.data.ortho_scale=.66;sc.render.filepath=str(out/(sc.name+'-'+clip+'-'+side+'-'+label+'.png'));bpy.ops.render.render(write_still=True)
