"""Evidence-led surface fixes applied to joined native source without rebaking animation.
Run on hsg-characters-v2.blend with -- OUTPUT.blend; export via repair/export-refined.py.
"""
import bpy,math,json,sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def repair(body):
 if body.get('surface_repair'):return
 regions=json.loads(body['source_regions']);attr=body.data.attributes['source_region'];region=lambda v:regions[str(attr.data[v.index].value)].lower()
 # Use actual evaluated head / shirt triangles, not guessed ellipsoid profiles.
 def surface(fragment):
  selected={v.index for v in body.data.vertices if fragment in region(v)}
  verts=[v.co.copy() for v in body.data.vertices];faces=[tuple(p.vertices) for p in body.data.polygons if all(i in selected for i in p.vertices)]
  return BVHTree.FromPolygons(verts,faces,all_triangles=False)
 head=surface('sculpted jaw cheeks forehead')
 # Source torso names differ; choose the first major torso surface if necessary.
 torso_names=[n for n in regions.values() if 'torso' in n.lower() or 'pullover' in n.lower() or 'shirt body' in n.lower()]
 print('TORSO_REGIONS',body.name,torso_names)
 for v in body.data.vertices:
  name=region(v)
  if 'fitted hair cap' in name:
   # Ray from above to actual scalp: cap must never cross below head skin.
   hit=head.ray_cast(Vector((v.co.x,v.co.y,5)),Vector((0,0,-1)),4)[0]
   if hit is not None and v.co.z<hit.z+.012:v.co.z=hit.z+.012
 # Lips and mouth curves were authored in a flat plane and floated off side-view faces.
 for v in body.data.vertices:
  if any(s in region(v) for s in ['mouth expression','lower lip']):
   hit=head.ray_cast(Vector((v.co.x,-2,v.co.z)),Vector((0,1,0)),4)[0]
   if hit is not None:v.co.y=hit.y-.008
 # Crown cap is an open 40-vertex ring. Close with a head-weighted face, retaining rest topology.
 import bmesh
 bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table()
 cap=[v for v in body.data.vertices if 'fitted hair cap' in region(v)]
 if len(cap)==360:
  ring=[bm.verts[v.index] for v in cap[:40]]
  try:bm.faces.new(tuple(reversed(ring)))
  except ValueError:pass
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
 # Project garment decorations onto the real torso, retaining their original thickness.
 detail_depth={}
 for vertex in body.data.vertices:
  rid=body.data.attributes['source_region'].data[vertex.index].value
  detail_depth.setdefault(rid,[]).append(vertex.co.y)
 detail_depth={rid:(min(values)+max(values))/2 for rid,values in detail_depth.items()}
 regions=json.loads(body['source_regions']);attr=body.data.attributes['source_region']
 torso_ids={int(k) for k,n in regions.items() if any(x in n.lower() for x in ['rounded tailored torso','tailored torso','pullover torso','shirt torso','jacket torso'])}
 if not torso_ids:
  # Explicit builders call torso with these identity-specific names.
  torso_ids={int(k) for k,n in regions.items() if n.lower().endswith(('rounded sweatshirt','tucked patterned shirt','hsg pullover','plum overshirt','tweed jacket','ivory academic tunic'))}
 selected={v.index for v in body.data.vertices if attr.data[v.index].value in torso_ids}
 faces=[tuple(p.vertices) for p in body.data.polygons if all(i in selected for i in p.vertices)]
 if faces:
  torso=BVHTree.FromPolygons([v.co.copy() for v in body.data.vertices],faces)
  for v in body.data.vertices:
   name=regions[str(attr.data[v.index].value)].lower()
   if any(x in name for x in ['shirt coral diamond','shirt button','formal shirt insert','red tie','arched university embroidery','st gallen embroidery','established embroidery','kangaroo pouch','pouch angled entry','tweed jacket lapel']):
    hit=torso.ray_cast(Vector((v.co.x,-2,v.co.z)),Vector((0,1,0)),4)[0]
    if hit is not None:v.co.y=hit.y-.014+(v.co.y-detail_depth[attr.data[v.index].value])
 # Shrink intersecting lower ribbing inside the waistband silhouette, not out through trousers.
 for v in body.data.vertices:
  if 'ribbed waistband' in regions[str(attr.data[v.index].value)].lower():
   v.co.x*=.93;v.co.y*=.93
 # Torso ended below the waistband; protruding triangles bled through the pants on slouch.
 for v in body.data.vertices:
  if attr.data[v.index].value in torso_ids and v.co.z<1.66:
   blend=max(0,min(1,(1.66-v.co.z)/.14));v.co.x*=1-.18*blend;v.co.y*=1-.18*blend
 # Bag was translated without its strap in the earlier anatomy repair. Move strap endpoint with bag.
 for v in body.data.vertices:
  if 'loose shoulder strap' in regions[str(attr.data[v.index].value)].lower():
   blend=max(0,min(1,(2.30-v.co.z)/.75));v.co.x-=.13*blend;v.co.y+=.10*blend
 # Adjacent tube rings used a discontinuous cross-product reference at abs(axis.y)=.9.
 # Rebuild only sleeve ring orientation with parallel transport; centers, weights and topology stay.
 for rid,name in regions.items():
  if 'continuous sleeve shoulder elbow' not in name:continue
  vs=[v for v in body.data.vertices if attr.data[v.index].value==int(rid)]
  assert len(vs)==400
  rings=[vs[i:i+16] for i in range(0,400,16)]
  centers=[sum((v.co for v in ring),Vector())/16 for ring in rings]
  previous=None
  for j,ring in enumerate(rings):
   axis=(centers[min(j+1,24)]-centers[max(0,j-1)]).normalized()
   xx=axis.cross(Vector((0,1,0))).normalized() if previous is None else (previous-axis*previous.dot(axis)).normalized()
   yy=axis.cross(xx).normalized();radius=sum((v.co-centers[j]).length for v in ring)/16
   for k,v in enumerate(ring):v.co=centers[j]+radius*(xx*math.cos(k*math.tau/16)+yy*math.sin(k*math.tau/16))
   previous=xx
 # Original upper starts at z=.100 but sole ends at .104: lower the bottom upper ring into sole.
 for v in body.data.vertices:
  name=regions[str(attr.data[v.index].value)].lower()
  if 'sculpted shoe last' in name and v.co.z<.125:v.co.z-=.020*max(0,1-(v.co.z-.10)/.025)
 body.data.update()
 assert all(math.isfinite(c) for v in body.data.vertices for c in v.co)
 body['surface_repair']='2026-10 scalp / parallel-transport sleeves / fitted detailing / waist / sole / strap'
if __name__=='__main__':
 for body in bpy.data.objects:
  if body.type=='MESH' and body.get('source_regions'):repair(body)
 bpy.ops.wm.save_as_mainfile(filepath=sys.argv[-1])
