import bpy,sys,math,json,os
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);out.mkdir(parents=True,exist_ok=True)
names=['Luca Di Grazia','Free-rider','Tryhard','Assessment','Trischli Warrior','Bad Teacher']
ids=['luca-di-grazia','free-rider','tryhard','assessment-hoodie','trischli-warrior','bad-teacher']
# Native Cycles renders. Identical cameras/lighting both runs. No geometry changes.
for name,cid in zip(names,ids):
 if os.environ.get('CHARACTER_ID') and cid!=os.environ['CHARACTER_ID']:continue
 sc=bpy.data.scenes[name];bpy.context.window.scene=sc;rig=next(o for o in sc.objects if o.type=='ARMATURE')
 sc.render.engine='CYCLES';sc.cycles.samples=8;sc.render.resolution_percentage=100
 for o in sc.objects:
  if o.name.startswith('STUDIO') and o.type in ['MESH','FONT','CURVE']:o.hide_render=True
 camera=sc.camera
 def render(label,target,pos,scale,w=480,h=560):
  camera.location=pos;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
  sc.render.resolution_x=w;sc.render.resolution_y=h;sc.render.filepath=str(out/(cid+'-'+label+'.png'));bpy.ops.render.render(write_still=True)
 def reset(clip=None,frame=1):
  rig.animation_data.action=None
  for t in rig.animation_data.nla_tracks:t.mute=True
  for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
  if clip:
   strip=next(t for t in rig.animation_data.nla_tracks if t.name==clip).strips[0];rig.animation_data.action=strip.action;rig.animation_data.action_slot=strip.action_slot
  sc.frame_set(frame);bpy.context.view_layer.update()
 reset('idle',1)
 for label,pos in [('front',(0,-9,2.0)),('side',(9,0,2.0)),('threequarter',(5,-9,3.1))]:render(label,(0,0,2),pos,4.6)
 for clip,frame in [('idle',13),('attack',13),('special',19),('hit',10),('defend',13),('heal',19),('defeat',37)]:
  reset(clip,frame);render(clip,(0,0,1.95),(4,-9,3.0),4.6,360,440)
  render(clip+'-hips',(0,0,1.6),(1.5,-7,2.1),1.5,520,440)
  render(clip+'-hands',(0,-.25,2.2),(1,-8,2.7),2.1,720,500)
 reset()
print('ACTUAL_DIAGNOSTICS_COMPLETE',str(out))
