"""Derive an explicitly invented gameplay view; never edits the three reference studies.
blender -b trichli-arena.blend -t 3 --python-exit-code 1 --python battle.py -- --output-dir .
Regenerate studies first with generate.py --render none to build completely from source.
"""
import bpy, math, os, sys, argparse, json
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--output-dir',default=os.path.dirname(os.path.abspath(__file__)));p.add_argument('--draft',action='store_true');p.add_argument('--render',choices=['all','none','preview','background'],default='all');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
os.makedirs(os.path.join(a.output_dir,'renders'),exist_ok=True)
for old in list(bpy.data.scenes):
 if old.name.startswith('BATTLE /'):bpy.data.scenes.remove(old)
for col in list(bpy.data.collections):
 if col.name.startswith('Battle /'):bpy.data.collections.remove(col)
source=next(s for s in bpy.data.scenes if s.name.startswith('MAIN /'))
s=source.copy();s.name='BATTLE / gameplay adaptation';bpy.context.window.scene=s
# Independent object copies, with shared immutable mesh data from the study.
for c in list(s.collection.children):s.collection.children.unlink(c)
cols={}
for sourcecol in source.collection.children:
 name=sourcecol.name.split(' / ')[-1];col=bpy.data.collections.new('Battle / '+name);s.collection.children.link(col);cols[name]=col
 for original in sourcecol.objects:
  if original.type=='CAMERA':continue
  o=original.copy()
  if original.type=='LIGHT':o.data=original.data.copy()
  col.objects.link(o)
for key in ['Fighters','Staging','Sign']:
 col=bpy.data.collections.new('Battle / '+key);s.collection.children.link(col);cols[key]=col
# Clear foreground tables only in battle adaptation; no obstacles in the attack lane.
for o in list(cols['Furniture'].objects)+list(cols['Props'].objects):
 if any(o.name.startswith(n) for n in ['Black high tabletop','Square pedestal foot','Table pedestal','Votive holder','Candle']):bpy.data.objects.remove(o,do_unlink=True)
# Thin atmosphere rather than thick photographic beams over the fighters.
for o in cols['Lights'].objects:
 if o.name.startswith('Atmospheric volume'):
  o.hide_render=True;o.hide_viewport=True
 if o.type=='LIGHT' and o.data.type=='SPOT':o.data.energy*=.16

def mat(n,c,r=.5,metal=0,e=0):
 m=bpy.data.materials.new('Battle / '+n);m.diffuse_color=(*c,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*c,1);b.inputs['Roughness'].default_value=r;b.inputs['Metallic'].default_value=metal
 if e:b.inputs['Emission Color'].default_value=(*c,1);b.inputs['Emission Strength'].default_value=e
 return m
navy=mat('ink fabric',(.018,.035,.055),.72);teal=mat('teal overshirt',(.035,.39,.42),.55);orange=mat('ochre varsity',(.78,.28,.068),.58);cream=mat('chalk accents',(.83,.83,.72),.68);skin=mat('warm skin',(.57,.32,.19),.65);skin2=mat('deep skin',(.23,.105,.065),.68);hair=mat('dark hair',(.022,.015,.014),.7);sole=mat('rubber sole',(.035,.039,.045),.8);cyan=mat('teal floor inlay',(.09,.55,.6),.45,.2,.7);gold=mat('ochre floor inlay',(.95,.4,.09),.45,.2,.7);signmat=mat('warm ivory sign',(.98,.87,.61),.4,0,2);dark=mat('sign lacquer',(.014,.024,.027),.37,.2);brass=mat('sign brass',(.38,.22,.08),.32,.6)
def link(o,key):
 for c in list(o.users_collection):c.objects.unlink(o)
 cols[key].objects.link(o);return o

def cube(n,loc,d,m,key='Staging',bevel=.015):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name='Battle / '+n;o.dimensions=d;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bevel:b=o.modifiers.new('Soft tailored edges','BEVEL');b.width=bevel;b.segments=3;o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return link(o,key)
def ell(n,p,scale,m,key='Fighters'):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=1,location=p);o=bpy.context.object;o.name='Battle / '+n;o.scale=scale;o.data.materials.append(m)
 for f in o.data.polygons:f.use_smooth=True
 return link(o,key)
def segment(n,p,q,r,m):
 v=Vector(q)-Vector(p);o=ell(n,(Vector(p)+Vector(q))/2,(r,r,v.length/2+r*.4),m);o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return o

def area(n,loc,target,power,color,size):
 d=bpy.data.lights.new('Battle / '+n,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(d.name,d);cols['Lights'].objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
# Human-ish student stand-ins; bespoke simple clothing, no franchise character designs.
positions={'player':(-1.9,3.8,0),'opponent':(1.7,7.4,0)}
def fighter(name,pos,opponent,coat,skinmat,accent):
 start=set(cols['Fighters'].objects);pos=Vector(pos);f=(Vector(opponent)-pos).normalized();right=Vector((f.y,-f.x,0));up=Vector((0,0,1))
 def P(x,y,z):return pos+right*x+f*y+up*z
 def E(n,p,sz,m):return ell(name+' / '+n,P(*p),sz,m)
 def S(n,p,q,r,m):return segment(name+' / '+n,P(*p),P(*q),r,m)
 # Slightly bent, offset stance, with shoes grounded at z=.07.
 for side,x,y in [('left',-.19,.16),('right',.22,-.15)]:
  knee=(x,y+.035,.57);hip=(x*.75,0,.96);ankle=(x*1.25,y,.14)
  S(side+' trouser thigh',hip,knee,.115,navy);S(side+' trouser shin',knee,ankle,.088,navy)
  shoe=E(side+' sneaker',(ankle[0],ankle[1]+.065,.095),(.115,.2,.09),cream);shoe.rotation_euler.z=math.atan2(-f.x,f.y)
  S(side+' sole',(ankle[0],ankle[1]-.065,.047),(ankle[0],ankle[1]+.16,.047),.055,sole)
 torso=E('overshirt',(0,0,1.22),(.27,.17,.36),coat)
 torso.rotation_euler.z=math.atan2(-f.x,f.y)
 E('neck',(0,.015,1.56),(.085,.085,.13),skinmat)
 E('head',(0,.01,1.77),(.145,.13,.195),skinmat)
 E('hair crown',(0,-.018,1.89),(.153,.137,.105),hair)
 E('nose',(0,.139,1.77),(.035,.045,.038),skinmat)
 for x in [-.065,.065]:E('eye',(x,.131,1.805),(.012,.009,.016),navy)
 # Diagonal sleeves and raised fists create a readable non-violent ready pose.
 for side,shoulder,elbow,wrist in [('left',(-.245,0,1.43),(-.37,.08,1.17),(-.27,.38,1.36)),('right',(.245,0,1.43),(.34,.12,1.25),(.20,.42,1.54))]:
  S(side+' sleeve',shoulder,elbow,.105,coat);S(side+' forearm',elbow,wrist,.072,skinmat);E(side+' fist',wrist,(.086,.09,.09),skinmat)
 # Visible backpack is a student cue, not a final character identity.
 pack=E('small book bag',(0,-.18,1.26),(.18,.095,.23),navy);pack.rotation_euler.z=math.atan2(-f.x,f.y)
 for x in [-.15,.15]:S('bag strap',(x,-.13,1.47),(x,-.19,1.1),.022,cream)
 # Clothing cuff accent.
 E('collar',(0,.07,1.51),(.13,.09,.045),cream)
 for o in set(cols['Fighters'].objects)-start:o['placeholder']=True;o['fighter']=name
 # Thin floor markers, not raised platforms or surveyed venue fixtures.
 bpy.ops.mesh.primitive_torus_add(major_segments=96,minor_segments=8,location=pos+Vector((0,0,.034)),major_radius=.76,minor_radius=.013)
 ring=link(bpy.context.object,'Staging');ring.name='Battle / '+name+' floor position inlay';ring.data.materials.append(accent)
 return f
fighter('Player placeholder',positions['player'],positions['opponent'],teal,skin,cyan)
fighter('Opponent placeholder',positions['opponent'],positions['player'],orange,skin2,gold)
# Venue sign is mounted on the far backbar; an invented gameplay identifier.
cube('sign brass rim',(0,12.39,2.51),(5.55,.12,.87),brass,'Sign')
cube('sign dark panel',(0,12.305,2.51),(5.42,.08,.75),dark,'Sign')
def text(n,body,loc,size,material):
 d=bpy.data.curves.new(n,'FONT');d.body=body;d.align_x='CENTER';d.align_y='CENTER';d.size=size;d.extrude=.004;d.bevel_depth=.0015;d.space_character=1.15;o=bpy.data.objects.new('Battle / '+n,d);cols['Sign'].objects.link(o);o.location=loc;o.rotation_euler=(math.pi/2,0,0);d.materials.append(material);return o
text('TRISCHLI world sign','TRISCHLI',(0,12.248,2.57),.59,signmat)
text('club subline','S T .  G A L L E N   /   C L U B',(0,12.24,2.29),.075,signmat)
# A low eye-level over-player diagonal, not the study's wide whole-room view.
d=bpy.data.cameras.new('Battle / camera');cam=bpy.data.objects.new('Battle / over-player camera',d);cols['Cameras'].objects.link(cam);cam.location=(-.9,-2.6,2.5);target=Vector((0,7.0,.85));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();d.lens=29;d.clip_end=80;d.shift_y=-.07;s.camera=cam
area('soft cool fighter key',(-2,1.3,3.05),(0,5,1),280,(.62,.85,1),4)
area('warm opponent key',(2.5,6.2,3.0),(1,7.8,1),260,(1,.76,.49),3)
area('teal silhouette rim',(-2,5.4,2.8),(-1.6,3.3,1),140,(.23,.83,1),2)
area('bar warm bounce',(0,10.5,2.95),(0,11.6,1),170,(1,.69,.38),3)
area('room soft cross-fill',(-3,7,2.9),(3,6,1),110,(.63,.71,.85),4)
s.render.engine='BLENDER_EEVEE';s.eevee.taa_render_samples=32 if a.draft else 96;s.render.threads_mode='FIXED';s.render.threads=3;s.render.resolution_x=1920;s.render.resolution_y=1080;s.render.resolution_percentage=50 if a.draft else 100;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=75
# Study compositor copied by scene.copy references MAIN: explicitly replace it.
g=bpy.data.node_groups.new('Battle / restrained halation','CompositorNodeTree');g.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor');r=g.nodes.new('CompositorNodeRLayers');r.scene=s;gl=g.nodes.new('CompositorNodeGlare');gl.inputs['Type'].default_value='Fog Glow';gl.inputs['Threshold'].default_value=3;gl.inputs['Strength'].default_value=.12;out=g.nodes.new('NodeGroupOutput');g.links.new(r.outputs['Image'],gl.inputs['Image']);g.links.new(gl.outputs['Image'],out.inputs['Image']);s.compositing_node_group=g
s['status']='Invented turn-based gameplay staging derived from MAIN; not a photographic view or surveyed real layout. Original placeholder fighters, not final user characters.';s['reference']='MAIN architectural vocabulary only; invented battle staging';s['gameplay_adaptation']=True;s['bottom_command_reserve']=.23;s['upper_HUD_reserve']='left/right upper corners; no baked UI';s['fighter_positions']=json.dumps(positions)
cols['Fighters'].hide_render=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.output_dir,'trichli-arena.blend'),compress=True)
for kind in (['preview','background'] if a.render=='all' else [] if a.render=='none' else [a.render]):
 cols['Fighters'].hide_render=kind=='background';s.render.filepath=os.path.join(a.output_dir,'renders','battle-'+kind+'.png');bpy.ops.render.render(write_still=True)
cols['Fighters'].hide_render=False
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.output_dir,'trichli-arena.blend'),compress=True)
print('BATTLE_COMPLETE',s.name,len(s.objects))
