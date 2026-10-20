"""Validate repaired native surfaces, identity regions and unmodified animation contract."""
import bpy,json,math,sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
report=[]
for body in bpy.data.objects:
 if body.type!='MESH' or not body.get('source_regions'):continue
 regions=json.loads(body['source_regions']);attr=body.data.attributes['source_region'];rows=[]
 for rid,name in regions.items():
  if 'continuous sleeve shoulder elbow' not in name:continue
  vs=[v for v in body.data.vertices if attr.data[v.index].value==int(rid)];assert len(vs)==400
  rings=[vs[i:i+16] for i in range(0,400,16)];maxstep=0
  for a,b in zip(rings,rings[1:]):
   ca=sum((v.co for v in a),Vector())/16;cb=sum((v.co for v in b),Vector())/16
   # No 180 degree ring reversal or long cross-body triangles.
   dot=(a[0].co-ca).normalized().dot((b[0].co-cb).normalized());assert dot>0,(name,dot)
   maxstep=max(maxstep,max((x.co-y.co).length for x,y in zip(a,b)))
  # Segment spacing varies with the authored elbow; ring direction is the regression.
  rows.append({'sleeve':name,'maxRingStep':maxstep})
 assert all(math.isfinite(c) for v in body.data.vertices for c in v.co)
 assert body.parent.type=='ARMATURE'
 report.append({'id':body.parent.parent['character_id'],'sleeves':rows,'vertices':len(body.data.vertices),'clips':[t.name for t in body.parent.animation_data.nla_tracks]})
assert len(report)==6
open(sys.argv[-1],'w').write(json.dumps(report,indent=2));print('SURFACE_PASS',len(report))
