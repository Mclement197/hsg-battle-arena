"""Export original editable arena geometry, never the render/backdrop or stand-in fighters.
blender -b -t 3 --python-exit-code 1 --python game/art/export-arenas.py
Source .blend files stay untouched. Area lights become glTF-supported point lights.
"""
import bpy, sys, json
from pathlib import Path
BASE=Path(__file__).resolve().parent
sys.path.insert(0,str(BASE/'characters/v2/.tools/packages'))
OUT=BASE.parent/'public/assets/arenas';OUT.mkdir(parents=True,exist_ok=True)
reports=[]
for cid,file,scene in [('library','hsg-library/hsg-library.blend','BATTLE / HSG library'),('trischli','trichli/trichli-arena.blend','BATTLE / gameplay adaptation')]:
 bpy.ops.wm.open_mainfile(filepath=str(BASE/file));sc=bpy.data.scenes[scene];bpy.context.window.scene=sc
 removed=[]
 for o in list(sc.objects):
  if o.get('placeholder') or any('Fighters' in c.name or 'Staging' in c.name for c in o.users_collection) or o.type=='CAMERA' or o.hide_render or 'volume' in o.name.lower():
   removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
 # Evaluate all modeled bevels, text, curves and material slots, then batch by material.
 bpy.ops.object.select_all(action='DESELECT')
 for o in list(sc.objects):
  if o.type in {'MESH','CURVE','FONT','SURFACE'}:o.select_set(True)
 bpy.context.view_layer.objects.active=next(o for o in sc.objects if o.select_get())
 bpy.ops.object.convert(target='MESH');bpy.ops.object.join();mesh=bpy.context.object
 # Material split reduces thousands of shelf/book draw calls to tens without flattening geometry.
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00005);bpy.ops.mesh.dissolve_limited(angle_limit=.025);bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
 for i,o in enumerate([o for o in sc.objects if o.type=='MESH']):
  o.name=cid+' / original geometry / '+(o.data.materials[0].name if o.data.materials else str(i))
  if cid=='library' and ('Book spine' in o.name or 'Book spine label' in o.name):
   mod=o.modifiers.new('Shelf bevel budget','DECIMATE');mod.ratio=.20
   bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
  # glTF cannot serialize procedural noise. Preserve PBR base colors, metal and roughness.
  for m in o.data.materials:
   if m and m.use_nodes:
    for n in m.node_tree.nodes:
     if n.type=='BSDF_PRINCIPLED':
      for socket in [n.inputs.get('Normal'),n.inputs.get('Base Color')]:
       if socket:
        for link in list(socket.links):m.node_tree.links.remove(link)
      n.inputs['Base Color'].default_value=m.diffuse_color
  o.select_set(True)
 lights=[]
 for o in list(sc.objects):
  if o.type=='LIGHT':
   if o.data.type=='AREA':o.data.type='POINT';o.data.energy=min(o.data.energy*.22,120)
   if o.data.type=='SPOT':o.data.energy=min(o.data.energy,75)
   lights.append(o.name);o.select_set(True)
 sc['arena_id']=cid;sc['source_geometry']=file;sc['standins_removed']=True
 bpy.ops.export_scene.gltf(filepath=str(OUT/(cid+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_cameras=False,export_lights=True,export_extras=True,export_yup=True,export_texcoords=False)
 reports.append({'id':cid,'source':file,'meshes':len([o for o in sc.objects if o.type=='MESH']),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in sc.objects if o.type=='MESH'),'removed':removed,'lights':lights,'bytes':(OUT/(cid+'.glb')).stat().st_size})
(OUT/'export-report.json').write_text(json.dumps(reports,indent=2));print(json.dumps(reports))
