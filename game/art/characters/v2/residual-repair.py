"""Repair independently rejected hem, collar and motif surfaces on the clothing-migrated source.
Uses existing BVH projection and barycentric skin transfer; no rigs/clips/materials removed.
"""
import bpy,json,sys,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

def tree_for(o,ids):
 a=o.data.attributes['source_region'];vs=o.data.vertices
 tris=[]
 for p in o.data.polygons:
  if all(a.data[i].value in ids for i in p.vertices):
   for j in range(1,len(p.vertices)-1):tris.append((p.vertices[0],p.vertices[j],p.vertices[j+1]))
 return BVHTree.FromPolygons([v.co.copy() for v in vs],tris,all_triangles=True),tris

def transfer(o,v,hit,tri,source=None):
 source=source or o
 uvw=barycentric_transform(hit,*[source.data.vertices[i].co for i in tri],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
 ws={}
 for vi,bw in zip(tri,uvw):
  for g in source.data.vertices[vi].groups:
   name=source.vertex_groups[g.group].name;ws[name]=ws.get(name,0)+g.weight*max(0,bw)
 for g in list(v.groups):o.vertex_groups[g.group].remove([v.index])
 total=sum(ws.values())
 for name,w in ws.items():
  if w>1e-7:(o.vertex_groups.get(name) or o.vertex_groups.new(name=name)).add([v.index],w/total,'REPLACE')

for o in list(bpy.data.objects):
 if o.type!='MESH' or not o.get('source_regions') or o.get('residual_repair'):continue
 regions=json.loads(o['source_regions']);a=o.data.attributes['source_region']
 torso_ids={int(k) for k,n in regions.items() if 'tailored torso' in n}
 if not torso_ids:continue
 if o.name.startswith(('tryhard','luca-di-grazia','bad-teacher')):
  tree,tris=tree_for(o,torso_ids)
  details={int(k):n for k,n in regions.items() if any(s in n for s in ['shirt coral diamond','shirt pointed collar'])}
  for rid,name in details.items():
   vs=[v for v in o.data.vertices if a.data[v.index].value==rid]
   if not vs:continue
   lo=min(v.co.y for v in vs);hi=max(v.co.y for v in vs)
   for v in vs:
    # Collar tips above the shoulder contour must meet its actual upper rim, not float by the neck.
    if 'collar' in name:v.co.z=min(v.co.z,2.674)
    else:v.co.x*=.90 # The outer motif column extended beyond the low tapered torso.
    hit,normal,fi,_=tree.ray_cast(Vector((v.co.x,-2,v.co.z)),Vector((0,1,0)),4)
    assert hit is not None,(o.name,name,tuple(v.co))
    depth=(v.co.y-lo)/max(1e-8,hi-lo)
    v.co.y=hit.y-.003-.005*(1-depth)
    transfer(o,v,hit,tris[fi])
 if o.name=='Assessment removable hoodie':
  trousers=next(b for b in bpy.data.objects if b.name.startswith('assessment-hoodie') and b.type=='MESH' and b.get('source_regions'))
  r=json.loads(trousers['source_regions']);pants={int(k) for k,n in r.items() if 'connected pelvis crotch' in n}
  tree,tris=tree_for(trousers,pants)
  hem={int(k) for k,n in regions.items() if 'ribbed waistband' in n}|torso_ids
  for v in o.data.vertices:
   if a.data[v.index].value not in hem or v.co.z>=1.675:continue
   # Bury only the covered hem, with the trouser triangle's own weights, so slouch cannot expose it.
   origin=Vector((v.co.x,-2 if v.co.y<0 else 2,v.co.z));direction=Vector((0,1 if v.co.y<0 else -1,0))
   hit,normal,fi,_=tree.ray_cast(origin,direction,4)
   if hit is not None:
    blend=min(1,max(0,(1.675-v.co.z)/.045));target=hit.y+(.018 if v.co.y<0 else -.018)
    v.co.y=v.co.y*(1-blend)+target*blend
    if blend>.99:transfer(o,v,hit,tris[fi],trousers)
  # Export hood as its own semantic skinned surface: only this region moves during Hood Up.
  hood_ids={int(k) for k,n in regions.items() if 'hood draped' in n or 'hood opening' in n}
  import bmesh
  hood=o.copy();hood.data=o.data.copy();o.users_collection[0].objects.link(hood);hood.name='Assessment articulated authored hood';hood['articulated_hood']=True
  for obj,remove in [(hood,False),(o,True)]:
   bm=bmesh.new();bm.from_mesh(obj.data);layer=bm.verts.layers.int.get('source_region')
   bmesh.ops.delete(bm,geom=[v for v in bm.verts if (v[layer] in hood_ids)==remove],context='VERTS');bm.to_mesh(obj.data);bm.free()
  hood['residual_repair']='authored hood region v1'
 o.data.update();o['residual_repair']='thin conforming motifs and collars / trouser-weighted buried hem v1'
bpy.ops.wm.save_as_mainfile(filepath=sys.argv[-1])
