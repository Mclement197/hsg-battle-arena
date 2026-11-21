"""Original Mensa B reconstruction from three user-confirmed photographs; no photo pixels.
blender -b -t 3 --python-exit-code 1 --python game/art/mensa-b/generate.py -- --render all
Units/layout inferred, not surveyed. Same evaluated geometry feeds Blender, GLB and realtime instancing.
"""
import bpy, math, random, json, sys, argparse, hashlib, gzip, base64
from pathlib import Path
from mathutils import Vector
random.seed(3936691)
BASE=Path(__file__).resolve().parent
sys.path.insert(0,str(BASE.parent/'characters/v2/.tools/packages'))
MEDIA=Path('/home/mathis/.openclaw/workspace/media/hsg-mensa-b/renders');MEDIA.mkdir(parents=True,exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('--render',default='none',choices=['none','all']);a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene;s.name='BATTLE / Mensa B photograph reconstruction'
s['reference_limit']='Three photographs from different dates, unmeasured layout; yellow historical seating retained. Open battle aisle is an adaptation.'
mats=[]
def mat(n,c,rough=.6,metal=0,em=0):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*c,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
 if em:b.inputs['Emission Color'].default_value=(*c,1);b.inputs['Emission Strength'].default_value=em
 mats.append(m);return m
con=mat('Board-formed warm grey concrete',(.37,.385,.35),.89)
seam=mat('Concrete formwork joints',(.225,.24,.215),.97)
steel=mat('Brushed chrome tubular frames',(.49,.54,.53),.25,.82)
dark=mat('Black rubber and counter rim',(.027,.032,.029),.57)
white=mat('Pale grey laminate tops',(.75,.76,.70),.32)
chair=mat('Honey yellow bentwood shell',(.60,.35,.07),.36)
chairEdge=mat('Bentwood endgrain',(.38,.20,.044),.45)
ink=mat('Wall lettering dark',(.065,.073,.066),.8)
cream=mat('Wall lettering light',(.80,.79,.63),.75)
yellow=mat('Wall art cadmium yellow',(.82,.67,.014),.68)
orange=mat('Wall art orange',(.85,.33,.018),.65)
red=mat('Wall art red oxide',(.43,.065,.034),.72)
blue=mat('Wall art blue grey',(.077,.12,.16),.72)
green=mat('Wall art malachite',(.12,.30,.23),.72)
light=mat('Fluorescent luminous tubes',(.88,.91,1),.25,0,3)
reflector=mat('Enamel lamp reflectors',(.72,.75,.71),.3,.45)
glass=mat('Fridge cool illuminated glass',(.13,.26,.29),.22,.25)
fridge=mat('Fridge red illuminated header',(.66,.012,.025),.38,0,.35)
coffee=mat('Espresso equipment charcoal',(.065,.073,.068),.4,.45)
cup=mat('White ceramic and menu boards',(.85,.85,.78),.27)
brown=mat('Kraft bakery bags',(.47,.28,.11),.8)
leaf=mat('Bottle green',(.02,.32,.09),.25,.15)
water=mat('Bottle aqua',(.10,.43,.55),.24,.15)
woods=[mat('Parquet oak tone %02d'%i,(.16+i*.008,.085+i*.005,.038+i*.0025),.28) for i in range(12)]
# Procedural surface grain is original, never a photographic projection.
for m in [con,chair]+woods:
 ns=m.node_tree.nodes;ls=m.node_tree.links;b=ns.get('Principled BSDF');tex=ns.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=38 if m==con else 9;tex.inputs['Detail'].default_value=2
 coord=ns.new('ShaderNodeTexCoord');mapping=ns.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(1,1,7) if m==con else (1,45,3);ls.new(coord.outputs['Generated'],mapping.inputs[0]);ls.new(mapping.outputs[0],tex.inputs['Vector'])
 bump=ns.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.012 if m==con else .006;ls.new(tex.outputs['Fac'],bump.inputs['Height']);ls.new(bump.outputs[0],b.inputs['Normal'])
cache={}
def mesh(n,verts,faces,m,key=None):
 if key and key in cache:me=cache[key]
 else:
  me=bpy.data.meshes.new(n);me.from_pydata(verts,[],faces);me.materials.append(m);me.update()
  if key:cache[key]=me
 o=bpy.data.objects.new(n,me);s.collection.objects.link(o);return o
unitverts=[(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]
faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
def box(n,p,d,m):
 o=mesh(n,unitverts,faces,m,'box/'+m.name);o.location=p;o.scale=d;return o
def rod(n,p,q,r,m,verts=10):
 key='rod/'+m.name+'/'+str(verts)
 vv=[(math.cos(i*2*math.pi/verts),math.sin(i*2*math.pi/verts),z) for z in [-.5,.5] for i in range(verts)];ff=[tuple(range(verts-1,-1,-1)),tuple(range(verts,verts*2))]+[(i,(i+1)%verts,(i+1)%verts+verts,i+verts) for i in range(verts)]
 o=mesh(n,vv,ff,m,key);v=Vector(q)-Vector(p);o.location=(Vector(p)+Vector(q))/2;o.scale=(r,r,v.length);o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return o

def label(n,txt,p,size,m,rot=(math.pi/2,0,0)):
 cu=bpy.data.curves.new(n,'FONT');cu.body=txt;cu.size=size;cu.extrude=0;cu.resolution_u=3;cu.space_character=1.03;cu.materials.append(m);o=bpy.data.objects.new(n,cu);s.collection.objects.link(o);o.location=p;o.rotation_euler=rot;return o
# Broad low hall; dimensions inferred using chair/table scale, not a building plan.
box('Continuous parquet substrate',(0,1,-.105),(26,26,.17),woods[3])
# Square mosaic oak panels, each five perpendicular strips, with actual fine joint lines.
for ix in range(43):
 for iy in range(43):
  x=-12.9+ix*.6;y=-11.9+iy*.6
  for strip in range(5):
   d=(.596,.117,.012) if (ix+iy)%2==0 else (.117,.596,.012)
   xx=x+(.0 if (ix+iy)%2==0 else (strip-2)*.12);yy=y+((strip-2)*.12 if (ix+iy)%2==0 else .0)
   box('Mosaic parquet strip',(xx,yy,-.006),d,random.choice(woods))
box('Low concrete ceiling slab',(0,1,3.98),(26,26,.24),con)
# Main parallel beams point into photograph one, secondary crossings recede at close spacing.
for x in [-11.6,-8.7,-5.8,-2.9,0,2.9,5.8,8.7,11.6]:
 box('Deep longitudinal exposed beam',(x,1,3.64),(.34,26,.60),con)
 for z in [3.47,3.66,3.84]:box('Horizontal beam casting board seam',(x-.171,1,z),(.003,26,.007),seam)
for y in [-10,-5,0,5,10]:box('Cross beam',(0,y,3.78),(26,.28,.33),con)
# Back partition interrupted by a central glass access door and side openings.
for x,w in [(-6.7,12.1),(6.7,12.1)]:box('Concrete art partition',(x,11,1.61),(w,.24,3.22),con)
for x in [-12.5,-.75,.75,11.9]:box('Square structural column',(x,10.8,1.69),(.48,.65,3.38),con)
box('Access door glazing',(0,11.02,1.27),(1.30,.08,2.54),glass)
for x in [-.67,.67]:box('Door brushed aluminium jamb',(x,10.93,1.3),(.045,.08,2.6),steel)
box('Door transom',(0,10.93,2.57),(1.4,.08,.045),steel);rod('Door pull',(.50,10.84,.9),(.50,10.84,1.18),.014,steel)
# Right art wall is the strong perspective landmark in photograph two.
box('Right concrete art wall',(12.5,1,1.65),(.26,26,3.3),con)
# Board-form seams and scattered tie holes: modeled, not painted photographic detail.
for x in [i*.29-12.3 for i in range(86)]:
 if abs(x)>.8:box('Vertical shuttering seam back wall',(x,10.876,1.61),(.005,.003,3.18),seam)
for y in [i*.29-11.8 for i in range(88)]:box('Vertical shuttering seam right wall',(12.365,y,1.64),(.003,.005,3.26),seam)
for x in [i*.95-12 for i in range(26)]:
 for z in [.48,1.35,2.22,3.02]:rod('Concrete form tie recess',(x,10.87,z),(x,10.864,z),.011,seam,8)
# Mineral-word coloured ribbon artwork, reconstructed as colored strips + original lettering geometry.
def ribbon(x,y,z,w,txt,m,sz=.20):
 box('Mineral ribbon / '+txt,(x+w/2,y,z+.105),(w,.015,.21),m);label('Wall art / '+txt,txt,(x+.025,y-.012,z+.018),sz,ink if m in [yellow,orange] else cream)
ribbon(-11.9,10.862,2.50,4.1,'GLETSCHERSCHLIFF',yellow,.215);ribbon(-7.8,10.862,2.71,2.35,'SAPHIR',blue,.22)
ribbon(-1.85,10.862,2.49,1.65,'ONYX',orange);ribbon(-.2,10.862,2.7,3,'HELIODOR',yellow,.22);ribbon(2.8,10.862,2.49,2.9,'MALACHIT',green,.22);ribbon(5.7,10.862,2.49,4.6,'SCHUBFETZEN',blue,.22)
ribbon(-11.9,10.862,.79,3.9,'TOCHTERSCHICHT',red,.18);ribbon(-8,10.862,.79,2.4,'QUARZ',yellow,.18);ribbon(-1.85,10.862,.79,2.8,'FALTEN',yellow,.20)
# Side wall strips run down y; rotate a local word-and-strip group 90 degrees.
for y,z,w,txt,m in [(6,2.5,3.9,'STEINSCHLAG',orange),(5,.78,3.7,'SCHLEMMER',blue),(8.7,.78,1.9,'TOPAS',red),(2.5,.78,2.5,'BERGKRISTALL',yellow)]:
 o=box('Side mineral ribbon '+txt,(12.355,y+w/2,z+.105),(.016,w,.21),m)
 label('Side wall art '+txt,txt,(12.342,y+w-.035,z+.025),.205,cream if m in [blue,red] else ink,(math.pi/2,0,-math.pi/2))
# Dark far-left window frames/blinds are inferred from cafe reference, not a surveyed facade.
for y in [-8,-4,0,4,8]:
 box('Daylight glazing',(-12.7,y,1.9),(.09,3.75,2.5),glass)
 for yy in [y-1.9,y+1.9]:box('Window aluminium mullion',(-12.55,yy,1.9),(.12,.07,2.7),steel)
 for z in [1+i*.14 for i in range(16)]:box('Horizontal window blind',(-12.58,y,z),(.09,3.7,.022),reflector)
# Reference-specific fluorescent fixtures: open rectangular reflectors, two luminous tubes.
for x in [-10.15,-7.25,-4.35,-1.45,1.45,4.35,7.25,10.15]:
 for y in [-8,-3,2,7]:
  box('Suspended light housing',(x,y,3.46),(.56,1.20,.055),dark)
  for side in [-1,1]:
   o=box('Folded reflector wing',(x+side*.22,y,3.38),(.18,1.21,.035),reflector);o.rotation_euler[1]=side*.32
   rod('Twin fluorescent tube',(x+side*.13,y-.50,3.365),(x+side*.13,y+.50,3.365),.018,light)
  rod('Fixture suspension',(x,y,3.49),(x,y,3.84),.014,dark)
# Chairs: continuous sculpted bent plywood seat/back, chrome four legs with sled-like side rails.
chairParts=[]
def makeChair():
 before=set(s.objects)
 # Sinuous side profile, rounded width corners. Back rises with a gentle backward rake.
 profile=[(-.23,.45),(-.08,.438),(.10,.442),(.19,.48),(.225,.56),(.24,.72),(.255,.91)]
 verts=[];cols=9
 for j,(yy,zz) in enumerate(profile):
  for i in range(cols):
   u=i/(cols-1);xx=(u-.5)*.435;rounding=.025*(abs(u-.5)*2)**6
   verts.append((xx,yy-(rounding if j==0 else 0),zz-rounding if j==len(profile)-1 else zz))
 fs=[(j*cols+i,j*cols+i+1,(j+1)*cols+i+1,(j+1)*cols+i) for j in range(len(profile)-1) for i in range(cols-1)]
 o=mesh('Bent plywood seat and back',verts,fs,chair,'chair-shell');sol=o.modifiers.new('Plywood thickness','SOLIDIFY');sol.thickness=.014;bev=o.modifiers.new('Soft plywood edge','BEVEL');bev.width=.009;bev.segments=2
 for f in o.data.polygons:f.use_smooth=True
 for xx in [-.205,.205]:
  rod('Chrome front leg',(xx,-.19,.035),(xx,-.18,.46),.014,steel)
  rod('Chrome rear leg',(xx,.25,.035),(xx,.17,.52),.014,steel)
  rod('Chair side frame',(xx,-.18,.46),(xx,.18,.48),.014,steel)
  rod('Chrome back support',(xx,.18,.48),(xx,.255,.83),.012,steel)
  for yy in [-.19,.25]:rod('Chair rubber foot',(xx,yy,.006),(xx,yy,.04),.018,dark)
 rod('Seat crossbrace',(-.21,.12,.43),(.21,.12,.43),.012,steel)
 return list(set(s.objects)-before)
parts=makeChair()
# Tables run into the room, pale laminate, warm edge, black T foot, as photo one.
def table(x,y,length=3.6):
 box('Pale laminate dining tabletop',(x,y,.755),(.85,length,.045),white);box('Exposed warm plywood table edge',(x,y,.724),(.856,length+.006,.016),chairEdge)
 for yy in [y-length*.32,y+length*.32]:
  box('Dining table black T pedestal',(x,yy,.36),(.075,.10,.71),dark);box('Dining table T foot',(x,yy,.036),(.75,.10,.05),dark)
 for xx,angle in [(x-.69,-math.pi/2),(x+.69,math.pi/2)]:
  for yy in [y-length*.375+i*.63 for i in range(int(length/.63))]:
   c=math.cos(angle);sn=math.sin(angle)
   for src in parts:
    o=src.copy();o.data=src.data;s.collection.objects.link(o);loc=src.location;o.location=(xx+c*loc.x-sn*loc.y,yy+sn*loc.x+c*loc.y,loc.z);o.rotation_euler=src.rotation_euler.copy();o.rotation_euler.rotate_axis('Z',angle)
# Keep the existing fight/action camera aisle absolutely clear; seating is peripheral.
for x in [-8.8,-5.7,5.7,8.8]:
 for y in [2.9,7.5]:table(x,y,3.6)
# Side/cafe foreground tables, never between gameplay cameras and fighters.
for x in [-8.8,8.8]:table(x,-5.8,3.6)
for x in [-2.35,2.35]:table(x,7.5,4.0)
table(5,-5,2.6)
for o in parts:bpy.data.objects.remove(o,do_unlink=True)
# Cafe counter at the reverse end: warm grey board-form face, dark projecting top.
box('Cafe back concrete wall',(0,-11.7,1.75),(26,.25,3.5),con)
for z in [i*.205 for i in range(1,17)]:box('Cafe wall horizontal board joint',(0,-11.565,z),(25.8,.003,.008),seam)
box('Cafe counter fascia',(-5.1,-8.75,.58),(7.6,1.1,1.16),con)
box('Cafe overhanging dark counter top',(-5.1,-8.75,1.2),(7.85,1.3,.085),dark)
for x in [-8.8+i*.31 for i in range(25)]:box('Counter vertical shuttering seam',(x,-8.194,.57),(.006,.003,1.08),seam)
rod('Counter front tubular foot rail',(-8.9,-7.99,.16),(-1.3,-7.99,.16),.023,steel)
for x in [-8.7,-5,-1.5]:rod('Foot rail bracket',(x,-8.25,.16),(x,-7.99,.16),.02,steel)
# Espresso bank: three individual sloped black/silver machines and coffee dispensers.
for x in [-6.05,-5.45,-4.85]:
 box('Coffee machine body',(x,-8.87,1.69),(.49,.51,.91),coffee)
 o=box('Slanted stainless machine face',(x,-8.57,1.8),(.46,.07,.57),steel);o.rotation_euler[0]=-.18
 box('Machine blue LCD',(x,-8.516,1.84),(.14,.015,.15),glass)
 box('Machine drip tray',(x,-8.45,1.27),(.45,.28,.06),steel)
 rod('Espresso nozzle',(x,-8.46,1.57),(x,-8.46,1.46),.017,dark)
 rod('Cup beneath spout',(x,-8.41,1.31),(x,-8.41,1.41),.065,cup,16)
 rod('Coffee bean hopper',(x,-8.88,2.12),(x,-8.88,2.29),.20,steel,20)
for i in range(13):box('Stacked crockery tray',(-4.05,-8.7,1.28+i*.033),(.48,.40,.022),white)
for x in [-7.4,-6.8]:
 rod('White ceramic pot',(x,-8.48,1.25),(x,-8.48,1.51),.14,cup,20);rod('Pot spout',(x+.10,-8.48,1.44),(x+.22,-8.48,1.49),.035,cup)
# Rotating bakery stand with visible packed sandwiches and pastry boxes.
for z in [1.43,1.76]:
 box('Bakery stand shelf',(-2.6,-8.7,z),(1.45,.48,.025),steel)
 for i in range(8):
  x=-3.2+i*.17;box('Kraft wrapped sandwich',(x,-8.64,z+.12),(.12,.24,.22),brown)
rod('Bakery rack upright',(-2.6,-8.7,1.23),(-2.6,-8.7,2.07),.024,steel)
# Tall glass drinks fridge to right of equipment, distinctive red branded header (text recreation).
box('Tall drink fridge shell',(-.55,-9.32,1.23),(.98,.83,2.46),steel)
box('Illuminated fridge red header',(-.55,-8.887,2.20),(.86,.025,.35),fridge)
label('Drink fridge sign','Coca-Cola',(-.94,-8.866,2.12),.16,cup,(math.pi/2,0,math.pi))
box('Drink fridge dark interior',(-.55,-8.886,1.13),(.84,.025,1.72),coffee)
for z in [.40,.76,1.12,1.48,1.83]:
 box('Fridge shelf',(-.55,-8.78,z),(.81,.34,.02),steel)
 for i in range(6):
  x=-.89+i*.134;rod('Bottled drinks',(x,-8.79,z+.02),(x,-8.79,z+.25),.047,leaf if i%2 else water,10);rod('Bottle cap',(x,-8.79,z+.25),(x,-8.79,z+.29),.025,cup,10)
for x in [-1,.0]:box('Fridge door chrome jamb',(x,-8.68,1.15),(.035,.04,1.80),steel)
# Menu boards with genuine legible category hierarchy, no transplanted photograph.
for i,title in enumerate(['Cafe creme','Heisse Getraenke','Kalte Getraenke']):
 x=-5.4+i*1.3;box('Cafe menu board',(x,-11.40,2.65),(1.22,.04,.95),cup)
 label('Menu heading',title,(x-.55,-11.365,2.94),.10,ink,(math.pi/2,0,math.pi))
 for j,txt in enumerate(['Espresso     3.00','Cappuccino   4.20','Latte        4.50','Tee          3.20','Mineral      3.00']):label('Menu item',txt,(x-.55,-11.363,2.76-j*.12),.067,ink,(math.pi/2,0,math.pi))
# Reorient reverse-wall lettering to face into the room (local text normal +Y).
for o in s.objects:
 if o.type=='FONT' and o.location.y<0:o.rotation_euler=(math.pi/2,0,math.pi)
# A restrained geometric fruit-colour splash behind coffee bank, not a photo decal.
box('Cafe dark tile backsplash',(-4.9,-11.43,1.44),(5.7,.045,1.1),coffee)
for x in [-7.7+i*.12 for i in range(48)]:box('Backsplash grout', (x,-11.40,1.44),(.004,.006,1.09),seam)
for z in [1.0+i*.12 for i in range(8)]:box('Backsplash horizontal grout',(-4.9,-11.40,z),(5.7,.006,.004),seam)
# Counter is viewed in the opposite direction: mirror this service bay to match photo three.
for o in s.objects:
 if o.location.y < -7.8 and not any(t in o.name for t in ['parquet','ceiling','beam','light','Window','window','blind','wall','Wall','column']):
  o.location.x=-o.location.x
  if o.type=='FONT':o.rotation_euler=(math.pi/2,0,math.pi)
box('Cafe structural concrete pier',(-1.6,-9.3,1.75),(.85,1.0,3.5),con)
# Supplementary wall sockets, menu tent cards, modest clutter for scale.
for x in [-11,-2,3,10]:box('Wall power outlet',(x,-11.55,.51),(.09,.025,.12),dark)
for x,y in [(-5.7,2.9),(5.7,2.9),(8.8,-5.8)]:
 o=box('Table menu tent',(x,y,.91),(.16,.045,.26),cup);o.rotation_euler[0]=.12
 label('Table menu title','MENSA B',(x-.067,y-.032,.94),.025,ink)
# Broad overhead fill and side-window bounce. No unbounded per-fixture shadow lights.
def area(n,p,target,power,size,color):
 d=bpy.data.lights.new(n,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(n,d);s.collection.objects.link(o);o.location=p;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
for y in [-7,0,7]:area('Soft fluorescent ceiling fill',(0,y,3.19),(0,y,0),1000,10,(.96,.97,1))
for y in [-5,5]:area('Window daylight bounce',(-12,y,2.5),(0,y,1),1400,7,(.80,.88,1))
area('Coffee service fill',(-4,-7.3,3.15),(-4,-9,1),500,5,(1,.92,.80))
world=bpy.data.worlds.new('Soft ambient daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.42,.44,1);world.node_tree.nodes['Background'].inputs[1].default_value=.32;s.world=world
cameras=[]
def camera(n,p,target,lens):
 d=bpy.data.cameras.new(n);d.lens=lens;d.clip_start=.05;d.clip_end=100;o=bpy.data.objects.new(n,d);s.collection.objects.link(o);o.location=p;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();cameras.append(o);return o
camera('01-reference-central-aisle',(0,-6.8,1.62),(0,10.7,1.65),25)
camera('02-reference-art-wall',(7.5,-7.2,1.65),(10,6,1.6),23)
camera('03-reference-coffee-counter',(4.2,-2.8,1.60),(4.2,-9.3,1.6),23)
camera('04-reverse-room',(-6,8.8,1.75),(0,-7,1.55),22)
camera('05-room-overall',(10,-8.0,2.6),(-2,6,1.5),20)
s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.resolution_x=1920;s.render.resolution_y=1080;s.render.resolution_percentage=100;s.view_settings.view_transform='AgX'
s.camera=cameras[0]
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'mensa-b.blend'))
# Build compact instancing recipe from evaluated native geometry. Exact same modeled surfaces at runtime.
deps=bpy.context.evaluated_depsgraph_get();geos=[];keys={};groups={};materials=[];matIndex={}
for m in mats:
 b=m.node_tree.nodes.get('Principled BSDF');matIndex[m.name]=len(materials);materials.append({'name':m.name,'color':list(m.diffuse_color[:3]),'roughness':b.inputs['Roughness'].default_value,'metalness':b.inputs['Metallic'].default_value,'emission':b.inputs['Emission Strength'].default_value})
for o in list(s.objects):
 if o.type not in ['MESH','FONT']:continue
 ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles()
 vs=[round(v,5) for vv in me.vertices for v in vv.co];ind=[i for tri in me.loop_triangles for i in tri.vertices];mi=matIndex[me.materials[0].name]
 key=hashlib.sha256(json.dumps([vs,ind]).encode()).hexdigest()
 if key not in keys:keys[key]=len(geos);geos.append([vs,ind])
 gi=keys[key];k=(gi,mi);matrix=[round(o.matrix_world[r][c],5) for c in range(4) for r in range(4)];groups.setdefault(k,[]).append(matrix);ev.to_mesh_clear()
recipe={'materials':materials,'geometries':geos,'groups':[[g,m,transforms] for (g,m),transforms in groups.items()],'limits':{'width':26,'depth':26,'ceiling':3.34,'clearBattleAisle':[-3.9,3.9,-9,4.5]},'cameras':[{ 'name':o.name,'position':[o.location.x,o.location.z,-o.location.y],'target':None} for o in cameras]}
(BASE/'scene.json').write_text(json.dumps(recipe,separators=(',',':')))
# Embed the compact recipe in an existing served module; no new backend route/restart or bogus file extension.
contract=BASE.parent.parent/'public/battle-contract.js';text=contract.read_text();marker=chr(10)+'// MENSA_RECONSTRUCTION_DATA: generated by art/mensa-b/generate.py'+chr(10);text=text.split(marker)[0];contract.write_text(text+marker+'export const MENSA_SCENE_GZIP = '+json.dumps(base64.b64encode(gzip.compress(json.dumps(recipe,separators=(',',':')).encode(),mtime=0)).decode())+';'+chr(10))
# Khronos glTF artifact for inspection and independent geometry tests; runtime uses same instanced recipe.
# Export materials with portable PBR, preserving procedural surfaces in saved editable .blend.
for m in mats:
 b=m.node_tree.nodes.get('Principled BSDF')
 for socket in ['Normal','Base Color']:
  for link in list(b.inputs[socket].links):m.node_tree.links.remove(link)
bpy.ops.object.select_all(action='DESELECT')
for o in s.objects:
 if o.type in ['MESH','FONT']:o.select_set(True)
bpy.context.view_layer.objects.active=next(o for o in s.objects if o.select_get());bpy.ops.object.convert(target='MESH')
# Include one supported point light for portable GLB tooling.
d=bpy.data.lights.new('Mensa fluorescent fill','POINT');d.energy=80;o=bpy.data.objects.new('Mensa fluorescent fill',d);s.collection.objects.link(o);o.location=(0,0,3.1);o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(BASE/'mensa-b.glb'),export_format='GLB',use_selection=True,export_animations=False,export_lights=True,export_yup=True,export_gpu_instances=True)
report={'geometries':len(geos),'groups':len(groups),'instances':sum(len(g) for g in groups.values()),'triangles':sum(len(geos[g][1])//3*len(ts) for g,m,ts in recipe['groups']),'recipeBytes':(BASE/'scene.json').stat().st_size,'glbBytes':(BASE/'mensa-b.glb').stat().st_size,'referencePhotos':3,'surveyed':False}
(BASE/'model-report.json').write_text(json.dumps(report,indent=2));print(report)
if a.render=='all':
 bpy.ops.wm.open_mainfile(filepath=str(BASE/'mensa-b.blend'));s=bpy.context.scene
 for cam in [o for o in s.objects if o.type=='CAMERA']:
  s.camera=cam;s.render.filepath=str(MEDIA/(cam.name+'.png'));bpy.ops.render.render(write_still=True)
