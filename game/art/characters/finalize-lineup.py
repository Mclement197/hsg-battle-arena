"""Update studio-only nameplates, preserving all six original character geometry."""
import bpy,os,math
base=os.path.dirname(bpy.data.filepath);sc=bpy.data.scenes['LINEUP / Six original HSG characters'];bpy.context.window.scene=sc;c=next(c for c in sc.collection.children if c.name.startswith('Studio'));dark=bpy.data.materials['ink charcoal']
for o in list(c.objects):
 if 'readable character label' not in o.name:continue
 o.data.size=.18;o.location.z=.105
 bpy.ops.mesh.primitive_cube_add(size=1,location=(o.location.x,-1.0,.15));p=bpy.context.object;p.name='LINEUP | lineup nameplate '+o.name.split('label ')[-1];p.dimensions=(2.42,.075,.34);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for cc in list(p.users_collection):cc.objects.unlink(p)
 c.objects.link(p);p.data.materials.append(dark);mod=p.modifiers.new('soft tailored edges','BEVEL');mod.width=.035;mod.segments=3;p.modifiers.new('weighted corner normals','WEIGHTED_NORMAL')
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True);bpy.ops.render.render(write_still=True,scene=sc.name)
