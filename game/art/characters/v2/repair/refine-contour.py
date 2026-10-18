"""Apply the generator's exact local contour relaxation to a reviewed staged blend.
No animation/weight/topology changes; preserves the previous candidate as input.
"""
import bpy,json,sys
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[-1]);out.mkdir(parents=True,exist_ok=True)
for sc in bpy.data.scenes:
 rigs=[o for o in sc.objects if o.type=='ARMATURE']
 if not rigs:continue
 body=next(o for o in sc.objects if 'Weighted surfaces' in o.name);regions=json.loads(body['source_regions']);rid=next(int(k) for k,n in regions.items() if 'connected pelvis crotch and trousers' in n);attr=body.data.attributes['source_region'];ids={i for i,a in enumerate(attr.data) if a.value==rid};adj={i:set() for i in ids}
 for e in body.data.edges:
  a,b=e.vertices
  if a in ids and b in ids:adj[a].add(b);adj[b].add(a)
 for iteration in range(10):
  previous={i:body.data.vertices[i].co.copy() for i in ids}
  for i,p in previous.items():
   if 1.20<p.z<1.60:
    strength=.50*min(1,(p.z-1.20)/.10,(1.60-p.z)/.10);average=sum((previous[j] for j in adj[i]),Vector())/len(adj[i]);body.data.vertices[i].co=p.lerp(average,strength)
 body.data.update()
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(out/'hsg-characters-v2.blend'),compress=True)
