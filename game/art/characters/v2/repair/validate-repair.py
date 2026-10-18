"""Fresh-open real mesh/pose regression, not a collision-free claim.
blender -b STAGED.blend --python validate-repair.py -- OUTPUT.json
"""
import bpy,json,sys,math
from pathlib import Path
from mathutils import Vector
report=[]
for sc in bpy.data.scenes:
 rigs=[o for o in sc.objects if o.type=='ARMATURE']
 if not rigs:continue
 bpy.context.window.scene=sc;r=rigs[0];body=next(o for o in sc.objects if 'Weighted surfaces' in o.name)
 regions=json.loads(body.get('source_regions','{}'));attr=body.data.attributes.get('source_region')
 assert attr,'Native semantic mesh regions required'
 def indices(term):
  region_ids={int(k) for k,n in regions.items() if term in n}
  return {i for i,a in enumerate(attr.data) if a.value in region_ids}
 pants=indices('connected pelvis crotch and trousers');assert len(pants)>900
 # A single shared crotch/waist connected component and no boundary edges.
 edges=[e for e in body.data.edges if all(i in pants for i in e.vertices)];adj={i:set() for i in pants}
 for e in edges:
  a,b=e.vertices;adj[a].add(b);adj[b].add(a)
 seen=set();todo=[next(iter(pants))]
 while todo:
  i=todo.pop()
  if i in seen:continue
  seen.add(i);todo.extend(adj[i]-seen)
 assert seen==pants,'Disconnected pelvic seam'
 face_edges={}
 for face in body.data.polygons:
  if all(i in pants for i in face.vertices):
   vs=list(face.vertices)
   for i,j in zip(vs,vs[1:]+vs[:1]):
    key=tuple(sorted((i,j)));face_edges[key]=face_edges.get(key,0)+1
 assert all(n==2 for n in face_edges.values()),'Open/nonmanifold trouser seam'
 for v in body.data.vertices:
  weights=[g.weight for g in v.groups if g.weight>0];assert 1<=len(weights)<=4 and abs(sum(weights)-1)<.0001
 prop_terms=['phone charcoal','perfect notes cover','color coded revision cover','bad luck timetable','party cup','red pen','marked examination cover']
 prop_groups=[]
 for term in prop_terms:
  ids=indices(term)
  if not ids:continue
  assert all(len([g for g in body.data.vertices[i].groups if g.weight>0])==1 for i in ids),'Nonrigid held prop'
  prop_groups.append((term,sorted(ids)))
 # Rest contact geometry vs actual box/cylinder interiors, not an AABB overlap claim.
 # Source-authored dimensions; finger pads may touch surfaces, not pass through solids.
 grip_boxes={'Free-rider':[('right',(.28,-.50,2.26),(.19,.075,.32))], 'Tryhard':[('left',(-.43,-.55,2.01),(.48,.15,.60)),('right',(.53,-.43,1.98),(.31,.15,.46))], 'Assessment':[('left',(0,-.40,1.71),(.43,.06,.43)),('right',(0,-.40,1.71),(.43,.06,.43))], 'Bad Teacher':[('left',(-.45,-.45,2.03),(.48,.15,.62))]}.get(sc.name,[])
 for side,center,size in grip_boxes:
  contact=indices(side+' hand contact')|indices(side+' hand opposed contact thumb')
  assert contact
  inside=[i for i in contact if all(abs(body.data.vertices[i].co[k]-center[k])<size[k]/2-.007 for k in range(3))]
  assert not inside,(sc.name,side,'grip penetrates prop interior',len(inside))
 # Occupied finger joints never change relative to their hand: exact authored grasp maintained.
 occupied={'Free-rider':['right'],'Tryhard':['left','right'],'Assessment':['left','right'],'Trischli Warrior':['right'],'Bad Teacher':['left','right']}.get(sc.name,[])
 maxfoot=0;maxsupport=0;maxrigid=0;maxstretch=0;count=0
 rest_lengths={(int(a),int(b)):(body.data.vertices[a].co-body.data.vertices[b].co).length for a,b in [e.vertices for e in edges]}
 for track in r.animation_data.nla_tracks:track.mute=True
 # Exclude world scale from exact native geometry contact checks; runtime sweep handles export.
 assert len(r.data.bones) in [48,52]
 for track in r.animation_data.nla_tracks:
  strip=track.strips[0];r.animation_data.action=strip.action;r.animation_data.action_slot=strip.action_slot
  for frame in range(1,int(strip.action.frame_range[1])+1):
   sc.frame_set(frame);bpy.context.view_layer.update();count+=1
   for side in occupied:
    for digit in ['index','middle','ring','little','thumb']:
     for k in ([1,2] if digit=='thumb' else [1,2,3]):assert Vector(r.pose.bones[side+'.'+digit+'.'+str(k)].rotation_euler).length<.0001
   for side in ['left','right']:
    p=r.pose.bones[side+'.foot'];rest=r.data.bones[side+'.foot'];maxfoot=max(maxfoot,abs(p.head.z-rest.head_local.z))
   if sc.name=='Assessment':
    l=r.pose.bones['left.hand'];rr=r.pose.bones['right.hand'];ld=r.data.bones['left.hand'];rd=r.data.bones['right.hand']
    desired=l.matrix@ld.matrix_local.inverted()@rd.matrix_local;maxsupport=max(maxsupport,(desired.translation-rr.head).length)
   deps=bpy.context.evaluated_depsgraph_get();ev=body.evaluated_get(deps);me=ev.to_mesh()
   for term,ids in prop_groups:
    a,b=ids[0],ids[len(ids)//2];before=(body.data.vertices[a].co-body.data.vertices[b].co).length;after=(me.vertices[a].co-me.vertices[b].co).length;maxrigid=max(maxrigid,abs(before-after))
   for (a,b),length in rest_lengths.items():
    if length>.001:maxstretch=max(maxstretch,(me.vertices[a].co-me.vertices[b].co).length/length)
   ev.to_mesh_clear()
 print('SWEEP',sc.name,count,maxfoot,maxsupport,maxrigid,maxstretch,flush=True)
 assert maxfoot<.012,(sc.name,'foot hover',maxfoot)
 assert maxsupport<.012,(sc.name,'support drift',maxsupport)
 assert maxrigid<.0001,(sc.name,'rigid prop deformation',maxrigid)
 assert maxstretch<3.5,(sc.name,'pelvis skin tear',maxstretch)
 report.append({'character':sc.name,'frames':count,'connected_pants_vertices':len(pants),'pants_manifold':True,'max_ankle_vertical_error':maxfoot,'max_bimanual_contact_drift':maxsupport,'max_prop_distance_error':maxrigid,'max_pants_edge_stretch':maxstretch,'occupied_hands':occupied})
Path(sys.argv[-1]).write_text(json.dumps(report,indent=2));print('ANATOMY_REPAIR_PASS',json.dumps(report))
