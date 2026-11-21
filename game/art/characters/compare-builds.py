import bpy,os,json
base=os.path.dirname(os.path.abspath(__file__))
def snapshot(path):
 bpy.ops.wm.open_mainfile(filepath=path)
 for s in bpy.data.scenes:bpy.context.window.scene=s;bpy.context.view_layer.update()
 out={}
 for c in bpy.data.collections:
  if not c.name.startswith('CHARACTER / '):continue
  for o in c.all_objects:
   r={'type':o.type,'loc':list(o.location),'rot':list(o.rotation_euler),'scale':list(o.scale),'parent':o.parent.name if o.parent else None}
   if o.type=='MESH':r['verts']=[list(v.co) for v in o.data.vertices];r['faces']=[list(f.vertices) for f in o.data.polygons]
   if o.type in ['MESH','CURVE','FONT']:r['materials']=[m.name for m in o.data.materials]
   if o.type=='FONT':r['text']=o.data.body
   if o.type=='CURVE':r['curves']=[[[*p.co] for p in sp.bezier_points] for sp in o.data.splines]
   out[o.name]=r
 return out
a=snapshot(base+'/hsg-characters.blend');b=snapshot(base+'/rebuild/hsg-characters.blend')
diff=[]
for k in sorted(set(a)|set(b)):
 if a.get(k)!=b.get(k):
  if k in a and k in b:diff.append({'name':k,'fields':{f:[str(a[k].get(f))[:180],str(b[k].get(f))[:180]] for f in set(a[k])|set(b[k]) if a[k].get(f)!=b[k].get(f)}})
  else:diff.append({'name':k,'missing':True})
with open(base+'/rebuild/differences.json','w') as f:json.dump(diff,f,indent=2)
print('DIFF COUNT',len(diff));print(json.dumps(diff[:3]))
