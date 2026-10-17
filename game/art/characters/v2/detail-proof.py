"""Fresh-open closeups of actual model hands/footwear, not anatomy reference images."""
import bpy
from mathutils import Vector
from pathlib import Path
base=Path(__file__).resolve().parent
sc=bpy.data.scenes['Luca Di Grazia'];bpy.context.window.scene=sc
camera=sc.camera;sc.render.resolution_x=800;sc.render.resolution_y=650;sc.cycles.samples=16
for label,target,position,scale in [
 ('hand-thumb-detail',(.83,-.19,2.19),(1.8,-4,2.7),.65),
 ('shoe-arch-detail',(.27,-.13,.20),(-1.8,-3,.85),.85)
]:
 camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
 sc.render.filepath=str(base/'renders'/(label+'.png'));bpy.ops.render.render(write_still=True)
print('Actual sculpted hand/thumb and shoe/arch closeups complete')
