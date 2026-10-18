"""Fresh-open authored refined blend -> identical runtime GLB contract, no animation rebake."""
import bpy,sys,json
from pathlib import Path
base=Path(__file__).resolve().parents[1];sys.path.insert(0,str(base/'.tools'/'packages'));sys.path.insert(0,str(base));from normalize import normalize
out=Path(sys.argv[-1]);out.mkdir(parents=True,exist_ok=True);report=[]
for sc in bpy.data.scenes:
 rigs=[o for o in sc.objects if o.type=='ARMATURE']
 if not rigs:continue
 bpy.context.window.scene=sc;r=rigs[0];root=r.parent;cid=root['character_id'];col=r.users_collection[0];r.animation_data.action=None
 for t in r.animation_data.nla_tracks:t.mute=False
 bpy.ops.object.select_all(action='DESELECT')
 for o in col.all_objects:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(out/(cid+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_range=False,export_materials='EXPORT',export_extras=True,export_yup=True,export_cameras=False,export_lights=False,use_active_scene=True,export_texcoords=False)
 normalize(out/(cid+'.glb'))
 for t in r.animation_data.nla_tracks:t.mute=True
 report.append({'id':cid,'bytes':(out/(cid+'.glb')).stat().st_size})
(out/'build-report.json').write_text(json.dumps(report,indent=2))
