"""One-time semantic garment migration on repaired native source; clips/rigs untouched."""
import bpy,bmesh,json,sys,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

def subset(body,ids,name):
 o=body.copy();o.data=body.data.copy();body.users_collection[0].objects.link(o);o.name=name
 bm=bmesh.new();bm.from_mesh(o.data);layer=bm.verts.layers.int.get('source_region')
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if v[layer] not in ids],context='VERTS');bm.to_mesh(o.data);bm.free()
 return o

def remove_regions(body,ids):
 bm=bmesh.new();bm.from_mesh(body.data);layer=bm.verts.layers.int.get('source_region')
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if v[layer] in ids],context='VERTS');bm.to_mesh(body.data);bm.free()

for body in list(bpy.data.objects):
 if body.type!='MESH' or not body.get('source_regions') or body.get('clothing_repair'):continue
 regions=json.loads(body['source_regions']);attr=body.data.attributes['source_region']
 if body.name.startswith('assessment-hoodie'):
  garment_ids={int(k) for k,n in regions.items() if any(s in n.lower() for s in ['tailored torso','hood draped','hood opening','ribbed waistband','kangaroo pouch','pouch angled','embroidery','drawcord','aglet','continuous sleeve shoulder elbow',' cuff'])}
  garment=subset(body,garment_ids,'Assessment removable hoodie');garment['removable_garment']=True
  torso_ids={int(k) for k,n in regions.items() if 'tailored torso' in n}
  sleeve_ids={int(k) for k,n in regions.items() if 'continuous sleeve shoulder elbow' in n}
  inner=subset(body,torso_ids|sleeve_ids,'Assessment fitted undershirt and arms');inner['underlayer']=True
  ivory=bpy.data.materials.get('warm ivory');skin=bpy.data.materials.get('warm deep skin');inner.data.materials.clear();inner.data.materials.append(ivory);inner.data.materials.append(skin)
  a=inner.data.attributes['source_region']
  for p in inner.data.polygons:p.material_index=0 if a.data[p.vertices[0]].value in torso_ids else 1
  for v in inner.data.vertices:
   if a.data[v.index].value in torso_ids:v.co.x*=.92;v.co.y*=.90;v.co.z=1.55+(v.co.z-1.55)*.985
  # Keep the original arm centerline/weights; only its fabric allowance is removed.
  for rid in sleeve_ids:
   vs=[v for v in inner.data.vertices if a.data[v.index].value==rid]
   assert len(vs)==400
   for j in range(0,400,16):
    ring=vs[j:j+16];c=sum((v.co for v in ring),Vector())/16
    for v in ring:v.co=c+(v.co-c)*.76
  remove_regions(body,garment_ids)
  for o in [body,garment,inner]:o['clothing_repair']='semantic hoodie shell + weighted fitted underlayer v1'
 if body.name.startswith('trischli-warrior'):
  torso_id=next(int(k) for k,n in regions.items() if 'tailored torso' in n)
  tee_id=next(int(k) for k,n in regions.items() if 'black inner shirt' in n)
  faces=[tuple(p.vertices) for p in body.data.polygons if attr.data[p.vertices[0]].value==torso_id]
  tree=BVHTree.FromPolygons([v.co.copy() for v in body.data.vertices],faces)
  # Ray projection + barycentric skin transfer: the tee bends exactly with its underlying triangle.
  coords=[];weights=[];N=12;M=24
  for j in range(M+1):
   z=1.89+.72*j/M
   for i in range(N+1):
    x=-.155+.31*i/N;hit,normal,fi,_=tree.ray_cast(Vector((x,-2,z)),Vector((0,1,0)),4)
    assert hit is not None
    face=faces[fi];tri=min((tuple(face[k] for k in (0,t,t+1)) for t in range(1,len(face)-1)),key=lambda tri:sum(max(0,-u) for u in barycentric_transform(hit,*[body.data.vertices[k].co for k in tri],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))))
    uvw=barycentric_transform(hit,*[body.data.vertices[k].co for k in tri],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
    w={}
    for vi,bw in zip(tri,uvw):
     for g in body.data.vertices[vi].groups:w[g.group]=w.get(g.group,0)+g.weight*max(0,bw)
    total=sum(w.values());weights.append({gi:v/total for gi,v in w.items() if v>1e-7});coords.append((x,hit.y-.018,z))
  quads=[]
  for j in range(M):
   for i in range(N):
    k=j*(N+1)+i;quads.append((k,k+1,k+N+2,k+N+1))
  data=bpy.data.meshes.new('Conforming inner tee surface');data.from_pydata(coords,[],quads);data.materials.append(bpy.data.materials.get('ink charcoal'))
  tee=bpy.data.objects.new('Trischli conforming inner tee',data);body.users_collection[0].objects.link(tee);tee.parent=body.parent
  for g in body.vertex_groups:tee.vertex_groups.new(name=g.name)
  for vi,ws in enumerate(weights):
   for gi,w in ws.items():tee.vertex_groups[gi].add([vi],w,'REPLACE')
  mod=tee.modifiers.new('Same torso rig deformation','ARMATURE');mod.object=next(m.object for m in body.modifiers if m.type=='ARMATURE')
  # Physical thickness, not a coplanar decal or a floating rigid rectangle.
  solid=tee.modifiers.new('Tee fabric thickness','SOLIDIFY');solid.thickness=.008
  for p in data.polygons:p.use_smooth=True
  remove_regions(body,{tee_id});body['clothing_repair']='conforming tee + barycentric torso skin v1'
  tee['clothing_repair']=body['clothing_repair']
bpy.ops.wm.save_as_mainfile(filepath=sys.argv[-1])
