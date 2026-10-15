"""Fresh-open checks; no image recognition or architectural-fidelity claims."""
import bpy, os, json, struct, math
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
base=os.path.dirname(bpy.data.filepath);s=bpy.data.scenes.get('BATTLE / gameplay adaptation');assert s
bpy.context.window.scene=s;bpy.context.view_layer.update()
checks={};landmarks={}
def bounds(objects):
 pts=[world_to_camera_view(s,s.camera,o.matrix_world@Vector(c)) for o in objects for c in o.bound_box]
 return [min(p.x for p in pts),1-max(p.y for p in pts),max(p.x for p in pts),1-min(p.y for p in pts)]
for key,prefix in [('player','Battle / Player placeholder /'),('opponent','Battle / Opponent placeholder /'),('sign','Battle / TRISCHLI world sign')]:
 objects=[o for o in s.objects if o.name.startswith(prefix)];assert objects,key
 landmarks[key]=[round(v,4) for v in bounds(objects)]
checks['four_scenes_original_studies_preserved']=len(bpy.data.scenes)==4 and all(any(x.name.startswith(k+' /') for x in bpy.data.scenes) for k in ['MAIN','DJ','LOUNGE'])
checks['perspective_battle_camera']=s.camera.data.type=='PERSP' and s.camera.name.startswith('Battle /')
checks['full_HD']=s.render.resolution_x==1920 and s.render.resolution_y==1080 and s.render.resolution_percentage==100
checks['gameplay_not_survey_disclosed']=s.get('gameplay_adaptation') and 'not a photographic view' in s['status']
checks['two_original_placeholder_groups']=set(o.get('fighter') for o in s.objects if o.get('placeholder'))=={'Player placeholder','Opponent placeholder'}
checks['fighters_in_frame']=all(all(0<v<1 for v in landmarks[k]) for k in ['player','opponent'])
checks['near_left_far_right']=landmarks['player'][2]<landmarks['opponent'][0] and landmarks['player'][3]>landmarks['opponent'][3]
checks['bottom_23_percent_fighter_free']=max(landmarks[k][3] for k in ['player','opponent'])<=.77
checks['world_TRISCHLI_text']=any(o.type=='FONT' and o.data.body=='TRISCHLI' for o in s.objects)
b=landmarks['sign'];checks['sign_unclipped_readable_size']=all(0<v<1 for v in b) and (b[2]-b[0])*1920>=250 and (b[3]-b[1])*1080>=35
checks['hud_corner_fighter_free']=all(landmarks[k][1]>.18 for k in ['player','opponent'])
checks['no_study_objects_shared']=all(len(o.users_scene)==1 for o in s.objects)
checks['architecture_preserved']=all(any(o.name.startswith(n) for o in s.objects) for n in ['Narrow staggered smoked floorboard','Clear glass screen','Large right walnut enclosure','Far bar panel','Main overhead conduit'])
checks['no_lane_tables']=not any(o.name.startswith('Black high tabletop') for o in s.objects)
checks['editable_separate_fighter_collection']=bpy.data.collections['Battle / Fighters'].hide_render==False
checks['no_external_photos_libraries_fonts']=not bpy.data.libraries and not any(i.source=='FILE' for i in bpy.data.images) and all(not f.filepath or f.filepath=='<builtin>' for f in bpy.data.fonts)
checks['finite_transforms']=all(all(math.isfinite(v) for v in tuple(o.location)+tuple(o.scale)+tuple(o.rotation_euler)) for o in s.objects)
images={}
for key in ['preview','background']:
 path=os.path.join(base,'renders','battle-'+key+'.png')
 if os.path.isfile(path):
  with open(path,'rb') as f:header=f.read(24)
  w,h=struct.unpack('>II',header[16:24]);images[key]={'width':w,'height':h,'bytes':os.path.getsize(path)}
checks['two_full_HD_under_8MiB']=len(images)==2 and all(i['width']==1920 and i['height']==1080 and i['bytes']<8*1024**2 for i in images.values())
report={'pass':all(checks.values()),'checks':checks,'images':images,'landmarks_normalized_top_left':landmarks,'camera':{'location':list(s.camera.location),'lens_mm':s.camera.data.lens,'shift_y':s.camera.data.shift_y},'fighter_positions':json.loads(s['fighter_positions']),'blend_bytes':os.path.getsize(bpy.data.filepath),'scope':'Technical composition checks. Invented gameplay adaptation, not real venue layout. Actual image inspection recorded separately.'}
with open(os.path.join(base,'battle-validation.json'),'w') as f:json.dump(report,f,indent=2)
print('BATTLE_VALIDATION',json.dumps(report));assert report['pass'],report
