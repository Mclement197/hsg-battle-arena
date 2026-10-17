"""Fresh-open technical validation, native Blender Python only."""
import bpy, os, json, struct, math, hashlib, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
base=os.path.dirname(bpy.data.filepath);checks=[];stats={}
def check(n,v,detail=None):
 checks.append({'name':n,'pass':bool(v),'detail':detail});print(('PASS ' if v else 'FAIL ')+n,flush=True)
ids=['luca','free-rider','tryhard','assessment','trischli-warrior','bad-teacher'];names=['Luca Di Grazia','Free-rider','Tryhard','Assessment','Trischli Warrior','Bad Teacher']
check('seven scenes',len(bpy.data.scenes)==7)
check('three fixed render threads',all(sc.render.threads_mode=='FIXED' and sc.render.threads==3 for sc in bpy.data.scenes))
for slug,name in zip(ids,names):
 sc=bpy.data.scenes.get(name);c=bpy.data.collections.get('CHARACTER / '+name);root=bpy.data.objects.get(slug+' / TRANSFORM ROOT');check(slug+' identity scene collection root',sc and c and root and root.get('character_id')==slug)
 objs=list(c.all_objects);meshes=[o for o in objs if o.type=='MESH'];curves=[o for o in objs if o.type=='CURVE'];fonts=[o for o in objs if o.type=='FONT'];verts=sum(len(o.data.vertices) for o in meshes);faces=sum(len(o.data.polygons) for o in meshes)
 check(slug+' real editable geometry',len(meshes)>60 and verts>15000 and faces>10000,{'mesh_objects':len(meshes),'vertices':verts,'faces':faces})
 check(slug+' root parents all parts',all(o.parent==root for o in objs if o!=root))
 check(slug+' actual face hair hands shoes',all(any(k in o.name for o in objs) for k in ['sculpted jaw','nose tip','almond eye','fitted hair','finger','shoe upper']))
 check(slug+' nonempty materials',all(len(o.data.materials)>0 for o in meshes+curves+fonts))
 check(slug+' finite vertices',all(all(math.isfinite(x) for x in v.co) for o in meshes for v in o.data.vertices))
 bpy.context.window.scene=sc;bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();coords=[]
 for o in objs:
  if o.type not in ['MESH','CURVE','FONT']:continue
  ev=o.evaluated_get(dg)
  # Project evaluated surface vertices, NOT rotated local AABB corners.
  # The latter invents empty wing/collar volume and falsely reports cropping.
  me=ev.to_mesh()
  if me:
   for v in me.vertices:coords.append(world_to_camera_view(sc,sc.camera,ev.matrix_world@v.co))
   ev.to_mesh_clear()
 bounds=[min(p.x for p in coords),max(p.x for p in coords),min(p.y for p in coords),max(p.y for p in coords)];check(slug+' camera includes whole character',bounds[0]>.015 and bounds[1]<.985 and bounds[2]>.015 and bounds[3]<.985,bounds)
 stats[slug]={'mesh_objects':len(meshes),'vertices':verts,'faces':faces,'curves':len(curves),'text':len(fonts),'screen_bounds':bounds}
check('48 separate layered feathers',sum('layered ivory flight feather' in o.name for o in bpy.data.objects)==48)
check('editable dizziness collection',bool(bpy.data.collections.get('trischli-warrior / Editable dizziness VFX')))
check('five editable stars',sum('dizziness star' in o.name for o in bpy.data.objects)==5)
check('tryhard high waistband and perfect notes',bool(bpy.data.objects.get('tryhard | high waist waistband')) and any(o.type=='FONT' and o.data.body=='6 / 6' for o in bpy.data.collections['CHARACTER / Tryhard'].all_objects))
check('hoodie actual lettering',any(o.type=='FONT' and o.data.body=='ST. GALLEN' for o in bpy.data.collections['CHARACTER / Assessment'].all_objects))
check('hoodie hood pouch strings',all(any(k in o.name for o in bpy.data.collections['CHARACTER / Assessment'].all_objects) for k in ['hood draped','kangaroo pouch','white drawcord']))
check('free rider phone bag crumpled notes',all(any(k in o.name for o in bpy.data.collections['CHARACTER / Free-rider'].all_objects) for k in ['phone blue screen','empty collapsed satchel','folded crumpled paper']))
check('teacher exams and red pen',all(any(k in o.name for o in bpy.data.collections['CHARACTER / Bad Teacher'].all_objects) for k in ['red pen','marked examination','tweed jacket']))
check('no rig falsely present',not any(o.type=='ARMATURE' for o in bpy.data.objects))
check('no linked libraries',len(bpy.data.libraries)==0)
check('fonts packed',all(f.packed_file or f.filepath=='<builtin>' for f in bpy.data.fonts))
check('no external image textures',all(im.source=='GENERATED' or im.packed_file or im.name in ['Render Result','Viewer Node'] for im in bpy.data.images))
check('all materials node based',all(m.use_nodes for m in bpy.data.materials))
check('blend below 25 MiB',os.path.getsize(bpy.data.filepath)<25*1024**2,os.path.getsize(bpy.data.filepath))
lineup=bpy.data.scenes['LINEUP / Six original HSG characters'];check('six linked lineup instances',sum(o.instance_type=='COLLECTION' for o in lineup.objects)==6);check('six readable labels',sum('readable character label' in o.name for o in lineup.objects)==6)
files={}
for slug in ids+['lineup']:
 path=base+'/renders/'+slug+'.png'
 if not os.path.exists(path):check(slug+' render exists',False);continue
 with open(path,'rb') as f:data=f.read()
 wh=struct.unpack('>II',data[16:24]);check(slug+' PNG resolution',min(wh)>=1200,wh);files[slug]={'dimensions':wh,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
for script in ['generate.py','validate.py','fingerprint.py']:
 with open(base+'/'+script) as f:compile(f.read(),script,'exec')
 check(script+' syntax',True)
with open(base+'/source-manifest.json') as f:manifest=json.load(f)
check('manifest valid and photos excluded',manifest['reference_photos_in_delivery'] is False and not any(im.source=='FILE' and not im.packed_file for im in bpy.data.images))
report={'blender':bpy.app.version_string,'blend':os.path.basename(bpy.data.filepath),'checks':checks,'passed':sum(c['pass'] for c in checks),'total':len(checks),'characters':stats,'renders':files}
with open(base+'/validation.json','w') as f:json.dump(report,f,indent=2)
if not all(c['pass'] for c in checks):raise RuntimeError('Validation failures: '+str([c['name'] for c in checks if not c['pass']]))
print('VALIDATION COMPLETE',report['passed'],'/',report['total'])
