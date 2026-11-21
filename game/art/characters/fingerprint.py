"""Stable semantic geometry fingerprint (not volatile .blend file bytes)."""
import bpy, json, hashlib, os
records=[]
for scene in bpy.data.scenes:
 bpy.context.window.scene=scene;bpy.context.view_layer.update()
for c in sorted((c for c in bpy.data.collections if c.name.startswith('CHARACTER / ')),key=lambda c:c.name):
 parts=[]
 for o in sorted(c.all_objects,key=lambda o:o.name):
  r={'name':o.name,'type':o.type,'parent':o.parent.name if o.parent else None,'matrix':[round(v,6) for row in o.matrix_local for v in row]}
  if o.type=='MESH':r.update(vertices=[[round(x,6) for x in v.co] for v in o.data.vertices],faces=sorted([list(f.vertices) for f in o.data.polygons]))
  elif o.type=='CURVE':r['splines']=[[[round(x,6) for x in p.co] for p in sp.bezier_points] for sp in o.data.splines]
  elif o.type=='FONT':r['text']=o.data.body
  if o.type in ['MESH','CURVE','FONT']:r['materials']=[m.name for m in o.data.materials]
  parts.append(r)
 records.append({'collection':c.name,'objects':len(parts),'sha256':hashlib.sha256(json.dumps(parts,sort_keys=True).encode()).hexdigest()})
out={'blender':bpy.app.version_string,'characters':records,'sha256':hashlib.sha256(json.dumps(records,sort_keys=True).encode()).hexdigest()}
with open(os.path.dirname(bpy.data.filepath)+'/fingerprint.json','w') as f:json.dump(out,f,indent=2)
print(json.dumps(out))
