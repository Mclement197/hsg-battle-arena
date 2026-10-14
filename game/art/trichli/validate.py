"""Reopen validator: blender -b trichli-arena.blend -t 3 --python validate.py"""
import bpy, os, json, math
from mathutils import Vector
s=bpy.context.scene
required=['Architecture','Props','Lighting','Cameras','Gameplay','Collision']
checks={}
checks['required_collections']=all(bpy.data.collections.get(n) for n in required)
checks['three_cameras']=len([o for o in s.objects if o.type=='CAMERA'])==3
checks['three_white_chevrons']=len([o for o in s.objects if o.name.startswith('White chevron /')])==3
checks['two_decks']=len([o for o in s.objects if o.name.startswith('Media player chassis')])==2
checks['mixer']=bool(bpy.data.objects.get('Four-channel mixer'))
checks['gold_ball_cluster']=len([o for o in s.objects if o.name.startswith('Golden mirrored disco ball')])==5
checks['gameplay_helpers']=all(bpy.data.objects.get(n) for n in ['Spawn_A','Spawn_B','Arena_centre'])
checks['collision_hidden']=all(o.hide_render for o in bpy.data.collections['Collision'].objects)
checks['metric']=s.unit_settings.system=='METRIC' and s.unit_settings.scale_length==1
checks['ceiling_present_and_enabled']=not bpy.data.collections['Ceiling • cutaway toggle'].hide_render
checks['active_interior_camera']=s.camera and s.camera.name.startswith('HERO')
checks['full_resolution']=s.render.resolution_percentage==100 and s.render.resolution_x==1920 and s.render.resolution_y==1080
checks['procedural_only']=not [i for i in bpy.data.images if i.source=='FILE']
checks['no_linked_libraries']=len(bpy.data.libraries)==0
checks['no_external_fonts']=all(f.filepath=='<builtin>' or not f.filepath for f in bpy.data.fonts)
missing=[]
for img in bpy.data.images:
    if img.source=='FILE' and not img.packed_file and not os.path.isfile(bpy.path.abspath(img.filepath)):missing.append(img.filepath)
checks['no_missing_resources']=not missing
checks['finite_transforms']=all(all(math.isfinite(v) for v in tuple(o.location)+tuple(o.scale)) for o in s.objects)
base=bpy.data.objects['Foundation / 16m × 20m']
checks['room_dimensions']=abs(base.dimensions.x-16.4)<.001 and abs(base.dimensions.y-20.4)<.001
checks['material_coverage']=all(len(o.data.materials)>0 for o in s.objects if o.type=='MESH' and not o.name.startswith('COL_') and not o.name.startswith('Playable envelope'))
architecture=bpy.data.collections['Architecture'].all_objects
corners=[o.matrix_world@Vector(p) for o in architecture if o.type=='MESH' for p in o.bound_box]
lo=[min(v[i] for v in corners) for i in range(3)];hi=[max(v[i] for v in corners) for i in range(3)]
report={'pass':all(checks.values()),'checks':checks,'missing_resources':missing,'objects':len(s.objects),'materials':len(bpy.data.materials),'images':len(bpy.data.images),'architecture_bounds_m':{'min':lo,'max':hi,'extent':[hi[i]-lo[i] for i in range(3)]},'blend_bytes':os.path.getsize(bpy.data.filepath),'blender':bpy.app.version_string}
path=os.path.join(os.path.dirname(bpy.data.filepath),'validation.json')
with open(path,'w') as f:json.dump(report,f,indent=2)
print('VALIDATION',json.dumps(report))
assert report['pass'],report
