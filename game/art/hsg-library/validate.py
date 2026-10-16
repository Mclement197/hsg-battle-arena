"""Run in a fresh Blender process after generation. No architectural accuracy claim."""
import bpy, os, struct, json, math
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
base=os.path.dirname(bpy.data.filepath);s=bpy.data.scenes['BATTLE / HSG library'];r=bpy.data.scenes['REFERENCE / 2013 architectural interpretation'];bpy.context.window.scene=s;bpy.context.view_layer.update()
checks={};landmarks={}
def bounds(obs):
 pts=[world_to_camera_view(s,s.camera,o.matrix_world@Vector(v)) for o in obs for v in o.bound_box]
 return [round(min(p.x for p in pts),5),round(1-max(p.y for p in pts),5),round(max(p.x for p in pts),5),round(1-min(p.y for p in pts),5)]
for k,p in [('player','Player placeholder /'),('opponent','Opponent placeholder /'),('sign','HSG BIBLIOTHEK /')]:landmarks[k]=bounds([o for o in s.objects if o.name.startswith(p)])
checks['two_editable_camera_scenes']=len(bpy.data.scenes)==2 and s.camera!=r.camera and s.camera.data.type=='PERSP'
checks['battle_full_HD']=s.render.resolution_x==1920 and s.render.resolution_y==1080 and s.render.resolution_percentage==100
checks['reference_1800x1200']=r.render.resolution_x==1800 and r.render.resolution_y==1200 and r.render.resolution_percentage==100
checks['eevee_three_threads']=all(sc.render.engine=='BLENDER_EEVEE' and sc.render.threads==3 and sc.render.threads_mode=='FIXED' for sc in [s,r])
checks['one_upper_gallery']=s['upper_gallery_count']==1 and not any('stair' in o.name.lower() for o in s.objects)
checks['required_structural_landmarks']=all(any(o.name.startswith(p) for o in s.objects) for p in ['Wide pale gallery top band','Paired slender white cylindrical column','Large near-right white cylindrical duct','Large maroon oval skylight perimeter','White radial skylight structural rib','Short round pale landmark pedestal','Dark landmark folded rising fan','Far projecting coffer beam','Ground inward stack'])
checks['two_original_placeholder_groups']=set(o.get('fighter') for o in s.objects if o.get('placeholder'))=={'Player placeholder','Opponent placeholder'}
checks['fighters_in_frame']=all(all(0<v<1 for v in landmarks[k]) for k in ['player','opponent'])
checks['near_left_far_right']=landmarks['player'][2]<landmarks['opponent'][0] and landmarks['player'][3]>landmarks['opponent'][3]
checks['bottom_20_percent_fighter_free']=max(landmarks[k][3] for k in ['player','opponent'])<=.8
checks['upper_corner_HUD_fighter_free']=min(landmarks[k][1] for k in ['player','opponent'])>.20
b=landmarks['sign'];checks['sign_legible_projection']=all(0<v<1 for v in b) and (b[2]-b[0])*1920>=210 and (b[3]-b[1])*1080>=22
checks['sign_explicitly_invented']=any(o.get('invented_game_label') for o in s.objects)
checks['reference_excludes_game_labels_fighters']=all(r.view_layers[0].layer_collection.children[k].exclude for k in ['Fighters','Game labels'])
checks['saved_fighters_editable_visible']=not bpy.data.collections['Fighters'].hide_render and all(o.type=='MESH' for o in bpy.data.collections['Fighters'].objects)
checks['no_external_photos_assets_fonts']=not bpy.data.libraries and not any(i.source=='FILE' for i in bpy.data.images) and all(not f.filepath or f.filepath=='<builtin>' for f in bpy.data.fonts)
checks['no_simulation_or_particle_dependencies']=not any(o.modifiers and any(m.type in ['FLUID','CLOTH','SOFT_BODY','PARTICLE_SYSTEM'] for m in o.modifiers) for o in s.objects)
checks['finite_transforms']=all(all(math.isfinite(v) for v in tuple(o.location)+tuple(o.scale)+tuple(o.rotation_euler)) for o in s.objects)
images={}
for k,dims in [('reference-interior',(1800,1200)),('battle-preview',(1920,1080)),('battle-background',(1920,1080))]:
 path=os.path.join(base,'renders',k+'.png')
 with open(path,'rb') as f:header=f.read(24)
 w,h=struct.unpack('>II',header[16:24]);images[k]={'width':w,'height':h,'bytes':os.path.getsize(path)}
 checks[k+'_dimensions_size']=(w,h)==dims and os.path.getsize(path)<8*1024**2
checks['blend_under_25MiB']=os.path.getsize(bpy.data.filepath)<25*1024**2
report={'pass':all(checks.values()),'checks':checks,'landmarks_normalized_top_left':landmarks,'images':images,'blend_bytes':os.path.getsize(bpy.data.filepath),'objects':len(bpy.data.objects),'mesh_vertices':sum(len(m.vertices) for m in bpy.data.meshes),'blender_version':bpy.app.version_string,'battle_camera':{'location':list(s.camera.location),'lens_mm':s.camera.data.lens,'shift_y':s.camera.data.shift_y},'scope':'Fresh-open technical composition checks; visual reference comparison recorded separately in README.'}
with open(os.path.join(base,'validation.json'),'w') as f:json.dump(report,f,indent=2)
print('HSG_LIBRARY_VALIDATION',json.dumps(report));assert report['pass'],report
