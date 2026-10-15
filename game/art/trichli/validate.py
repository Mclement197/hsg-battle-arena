"""Fresh-process validation: blender -b trichli-arena.blend -t 3 --python-exit-code 1 --python validate.py"""
import bpy, os, json, math, struct
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
base=os.path.dirname(bpy.data.filepath)
scenes={k:next((s for s in bpy.data.scenes if s.name.startswith(k.upper()+' /')),None) for k in ['dj','main','lounge']}
checks={}
checks['three_named_independent_scenes']=len(bpy.data.scenes)==3 and all(scenes.values())
checks['one_named_camera_per_scene']=all(s and s.camera and s.camera in list(s.objects) and sum(o.type=='CAMERA' for o in s.objects)==1 for s in scenes.values())
checks['no_shared_objects_between_studies']=all(len(o.users_scene)==1 for o in bpy.data.objects)
checks['full_resolution_3_to_2']=all(s.render.resolution_x==1800 and s.render.resolution_y==1200 and s.render.resolution_percentage==100 for s in scenes.values())
checks['editable_meshes']=all(sum(o.type=='MESH' for o in s.objects)>200 for s in scenes.values())
checks['metric_estimated_scale_disclosed']=all(s.unit_settings.system=='METRIC' and 'estimated' in s['status'].lower() for s in scenes.values())
checks['three_far_chevrons']=len([o for o in scenes['dj'].objects if o.name.startswith('Far white chevron')])==3
checks['two_dj_players']=len([o for o in scenes['dj'].objects if o.name.startswith('Media player chassis')])==2
checks['mixer_present']=any(o.name.startswith('Four-channel mixer') for o in scenes['dj'].objects)
checks['chevrons_across_room_not_behind_decks']=all(o.location.y==0 and min(v.co.y for v in o.data.vertices)>9 for o in scenes['dj'].objects if o.name.startswith('Far white chevron'))
checks['one_continuous_carpet']=sum(o.name.startswith('ONE continuous large lounge carpet') for o in scenes['lounge'].objects)==1
checks['no_invented_gameplay_or_disco']=not any(any(n in o.name.lower() for n in ['spawn','combat','disco','playable','dais']) for o in bpy.data.objects)
checks['ceiling_per_study']=all(any(c.name.endswith('/ Ceiling') and len(c.objects)>40 and not c.hide_render for c in s.collection.children) for s in scenes.values())
checks['material_coverage']=all(o.data.materials for o in bpy.data.objects if o.type=='MESH')
checks['procedural_only']=not any(i.source=='FILE' for i in bpy.data.images)
checks['no_external_libraries']=not bpy.data.libraries
checks['no_external_fonts']=all(not f.filepath or f.filepath=='<builtin>' for f in bpy.data.fonts)
checks['no_missing_file_resources']=not any(i.source=='FILE' and not i.packed_file and not os.path.isfile(bpy.path.abspath(i.filepath)) for i in bpy.data.images)
checks['finite_transforms']=all(all(math.isfinite(v) for v in tuple(o.location)+tuple(o.scale)+tuple(o.rotation_euler)) for o in bpy.data.objects)
checks['blend_under_25MiB']=os.path.getsize(bpy.data.filepath)<25*1024**2
images={}
for key in scenes:
 path=os.path.join(base,'renders',key+'.png')
 if os.path.isfile(path):
  with open(path,'rb') as f:h=f.read(24)
  w,hh=struct.unpack('>II',h[16:24]);images[key]={'width':w,'height':hh,'bytes':os.path.getsize(path)}
checks['three_final_PNGs']=len(images)==3 and all(v['width']>=1600 and v['width']*2==v['height']*3 and v['bytes']<8*1024**2 for v in images.values())
# Screen positions use top-left origin, useful QA evidence rather than a survey claim.
landmarks={}
for key,s in scenes.items():
 bpy.context.window.scene=s
 bpy.context.view_layer.update()
 points={}
 for prefix in {'dj':['Far white chevron','Media player chassis','Four-channel mixer'],'main':['Far bar panel front core','Large right walnut enclosure front core','Black high tabletop'],'lounge':['ONE continuous large lounge carpet','Lounge view / walnut enclosure front core','Far bar panel front core']}[key]:
  matches=[o for o in s.objects if o.name.startswith(prefix)]
  points[prefix]=[]
  for o in matches:
   v=world_to_camera_view(s,s.camera,o.matrix_world@Vector(tuple(sum(v[i] for v in o.bound_box)/8 for i in range(3))));bounds=[world_to_camera_view(s,s.camera,o.matrix_world@Vector(c)) for c in o.bound_box]
   points[prefix].append({'center':[round(v.x,3),round(1-v.y,3)],'bounds':([round(min(p.x for p in bounds),3),round(1-max(p.y for p in bounds),3),round(max(p.x for p in bounds),3),round(1-min(p.y for p in bounds),3)] if all(p.z>0 for p in bounds) else None),'crosses_camera_plane':any(p.z<=0 for p in bounds)})
 landmarks[key]=points
report={'pass':all(checks.values()),'checks':checks,'images':images,'landmarks_normalized_top_left':landmarks,'scenes':{k:{'name':s.name,'camera':s.camera.name,'objects':len(s.objects)} for k,s in scenes.items()},'blend_bytes':os.path.getsize(bpy.data.filepath),'blender':bpy.app.version_string,'scope':'Technical checks and screen landmarks; visual fidelity reviewed separately. No survey claim.'}
with open(os.path.join(base,'validation.json'),'w') as f:json.dump(report,f,indent=2)
print('VALIDATION',json.dumps(report));assert report['pass'],report
