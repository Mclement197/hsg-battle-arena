"""Fresh-open native skin checks and actual Cycles pose evidence (no generated mockups)."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
BASE=Path(__file__).resolve().parent
RENDER='--render' in sys.argv
names=['Luca Di Grazia','Free-rider','Tryhard','Assessment','Trischli Warrior','Bad Teacher']
ids=['luca-di-grazia','free-rider','tryhard','assessment-hoodie','trischli-warrior','bad-teacher']
required={'idle','attack','hit','defeat','defend','heal','special'}
report={'fresh_open':bpy.data.filepath,'characters':[],'external_assets':[]}
items=[]
for name,cid in zip(names,ids):
 sc=bpy.data.scenes[name];bpy.context.window.scene=sc
 rig=next(o for o in sc.objects if o.type=='ARMATURE');body=next(o for o in sc.objects if 'Weighted surfaces' in o.name)
 assert required=={t.name for t in rig.animation_data.nla_tracks}
 assert len(rig.data.bones)>=48
 for side in ['left','right']:
  for digit in ['index','middle','ring','little']:
   for k in [1,2,3]:assert side+'.'+digit+'.'+str(k) in rig.data.bones
  for k in [1,2]:assert side+'.thumb.'+str(k) in rig.data.bones
  for part in ['upperarm','forearm','thigh','shin','hand','foot','toe']:assert side+'.'+part in rig.data.bones
 if cid=='luca-di-grazia':assert all(s+'.'+p in rig.data.bones for s in ['left','right'] for p in ['wing','wingtip'])
 if cid=='trischli-warrior':assert any(o.get('vfx_separate') for o in sc.objects)
 blended=0
 for v in body.data.vertices:
  ws=[g.weight for g in v.groups if g.weight>0];assert 1<=len(ws)<=4;assert abs(sum(ws)-1)<.0001
  blended+=len(ws)>1
 assert blended>1000
 def reset():
  rig.animation_data.action=None
  for t in rig.animation_data.nla_tracks:t.mute=True
  for b in rig.pose.bones:b.rotation_mode='XYZ';b.rotation_euler=(0,0,0);b.location=(0,0,0)
  bpy.context.view_layer.update()
 def coords():
  deps=bpy.context.evaluated_depsgraph_get();obj=body.evaluated_get(deps);me=obj.to_mesh();values=[v.co.copy() for v in me.vertices];obj.to_mesh_clear();return values
 reset();rest=coords()
 # Real mixed-weight elbows and knees bend ~52° beyond their sculpted rest pose.
 rig.pose.bones['right.forearm'].rotation_euler.x=.9
 rig.pose.bones['left.shin'].rotation_euler.x=-.9
 rig.pose.bones['left.thigh'].rotation_euler.x=.45
 rig.pose.bones['left.index.1'].rotation_euler.x=.5
 rig.pose.bones['left.index.2'].rotation_euler.x=.65
 if cid=='luca-di-grazia':rig.pose.bones['left.wing'].rotation_euler.y=.25;rig.pose.bones['right.wingtip'].rotation_euler.x=.25
 bpy.context.view_layer.update();bent=coords();assert len(rest)==len(bent)
 changed=sum((r-b).length>.01 for r,b in zip(rest,bent));assert changed>500
 ratios=[]
 groups={body.vertex_groups[n].index for n in ['right.upperarm','right.forearm','left.thigh','left.shin']}
 mixed={v.index for v in body.data.vertices if len([g for g in v.groups if g.group in groups and g.weight>.05])>1}
 for e in body.data.edges:
  i,j=e.vertices
  if i in mixed and j in mixed:
   old=(rest[i]-rest[j]).length
   if old>.0001:ratios.append((bent[i]-bent[j]).length/old)
 ratios.sort();assert ratios and ratios[int(len(ratios)*.1)]>.35
 report['characters'].append({'id':cid,'bones':len(rig.data.bones),'vertices':len(rest),'blended_vertices':blended,'deformed_vertices':changed,'bend_edge_ratio_p10':round(ratios[int(len(ratios)*.1)],3),'clips':sorted(required)})
 items.append((sc,rig,body,reset))
 # Leave the pose for all-six bent lineup, then reset before normal portrait rendering.
 if RENDER:
  sc.cycles.samples=16;sc.render.resolution_x=640;sc.render.resolution_y=740;sc.render.resolution_percentage=100;sc.render.filepath=str(BASE/'renders'/('bent-'+cid+'.png'));bpy.ops.render.render(write_still=True)
 reset()
for image in bpy.data.images:
 if image.source=='FILE' and not image.packed_file:report['external_assets'].append(image.filepath)
assert not report['external_assets']
(BASE/'validation.json').write_text(json.dumps(report,indent=2))
if RENDER:
 for sc,rig,body,_ in items:
  bpy.context.window.scene=sc
  for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
  sc.frame_set(1);sc.cycles.samples=24;sc.render.resolution_x=900;sc.render.resolution_y=1050;sc.render.filepath=str(BASE/'renders'/(ids[names.index(sc.name)]+'.png'));bpy.ops.render.render(write_still=True)
  # Transparent same-geometry fallback portraits, no reference images.
  studio=next(c for c in sc.collection.children if c.name.startswith('Studio'))
  for o in studio.objects:
   if o.type in ['MESH','FONT','CURVE']:o.hide_render=True
  sc.render.film_transparent=True;sc.render.resolution_x=450;sc.render.resolution_y=525;sc.cycles.samples=16;sc.render.filepath=str(BASE/'renders'/('portrait-'+ids[names.index(sc.name)]+'.png'));bpy.ops.render.render(write_still=True)
  sc.render.film_transparent=False
  for o in studio.objects:o.hide_render=False
  for clip,frame in [('attack',13),('hit',10),('defeat',37)]:
   track=next(t for t in rig.animation_data.nla_tracks if t.name==clip);rig.animation_data.action=track.strips[0].action;sc.frame_set(frame)
   sc.render.resolution_x=360;sc.render.resolution_y=420;sc.cycles.samples=12;sc.render.filepath=str(BASE/'renders'/(clip+'-'+ids[names.index(sc.name)]+'.png'));bpy.ops.render.render(write_still=True)
  rig.animation_data.action=None
  for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
  sc.frame_set(1)
 lineup=bpy.data.scenes['LINEUP / Refined articulated cast'];bpy.context.window.scene=lineup;lineup.cycles.samples=12;lineup.render.resolution_x=2400;lineup.render.resolution_y=800;lineup.render.filepath=str(BASE/'renders'/'lineup.png');bpy.ops.render.render(write_still=True)
print('FRESH OPEN V2 VALIDATION PASS',json.dumps(report),flush=True)
