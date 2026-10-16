"""HSG library: bounded architectural interpretation of the verified 2013 event photo.
Blender 5.0.1, bundled bpy only. Original modeled geometry; no embedded photographs.
blender -b -t 3 --python-exit-code 1 --python generate.py -- [--draft] [--render all|none]
"""
import bpy, math, random, os, sys, argparse, json
from mathutils import Vector
random.seed(2013)
p=argparse.ArgumentParser();p.add_argument('--output-dir',default=os.path.dirname(os.path.abspath(__file__)));p.add_argument('--draft',action='store_true');p.add_argument('--render',default='all',choices=['all','none']);a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
base=os.path.abspath(a.output_dir);os.makedirs(os.path.join(base,'renders'),exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
s=bpy.context.scene;s.name='BATTLE / HSG library'
C={}
for key in ['Shell','Gallery','Roof','Stacks','Books','Landmark sculpture','Peripheral desks (assumed)','Lighting','Cameras','Fighters','Game labels']:
 c=bpy.data.collections.new(key);s.collection.children.link(c);C[key]=c

def link(o,k):
 for c in list(o.users_collection):c.objects.unlink(o)
 C[k].objects.link(o);return o

def mat(n,c,r=.6,metal=0,e=0):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*c,1);b.inputs['Roughness'].default_value=r;b.inputs['Metallic'].default_value=metal
 if e:b.inputs['Emission Color'].default_value=(*c,1);b.inputs['Emission Strength'].default_value=e
 return m
concrete=mat('Raw light-gray concrete',(.42,.43,.405),.95)
# Small procedural mineral variation, never a source-photo texture.
ns=concrete.node_tree.nodes;ls=concrete.node_tree.links;n=ns.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=7;n.inputs['Detail'].default_value=3;bump=ns.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.15;bump.inputs['Distance'].default_value=.035;ls.new(n.outputs['Fac'],bump.inputs['Height']);ls.new(bump.outputs['Normal'],ns.get('Principled BSDF').inputs['Normal'])
white=mat('Warm-white painted columns and stack steel',(.79,.80,.76),.5)
rail=mat('Satin aluminum rail',(.52,.58,.57),.3,.65)
maroon=mat('Skylight deep red ring',(.24,.033,.065),.4,.25)
carpet=mat('Graphite gray carpet',(.045,.047,.044),.98)
ns=carpet.node_tree.nodes;ls=carpet.node_tree.links;n=ns.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=200;b=ns.new('ShaderNodeBump');b.inputs['Strength'].default_value=.2;b.inputs['Distance'].default_value=.008;ls.new(n.outputs['Fac'],b.inputs['Height']);ls.new(b.outputs['Normal'],ns.get('Principled BSDF').inputs['Normal'])
dark=mat('Dark shelf recess and shoes',(.028,.034,.034),.85)
glass=mat('Gallery glass transparent approximation',(.54,.65,.65),.2,.1)
ns=glass.node_tree.nodes;ns.clear();out=ns.new('ShaderNodeOutputMaterial');tr=ns.new('ShaderNodeBsdfTransparent');tr.inputs['Color'].default_value=(.97,.985,.985,1);glass.node_tree.links.new(tr.outputs[0],out.inputs['Surface'])
roofglass=mat('Diffuse daylight roof glazing',(.78,.87,.88),.24,0,.28)
lamp=mat('Warm fluorescent strip',(.91,.85,.66),.35,0,2.5)
bronze=mat('Landmark dark patinated sculpture (approximation)',(.045,.055,.046),.52,.42)
pedestal=mat('Light round sculpture pedestal',(.63,.65,.59),.8)
deskmat=mat('Peripheral laminate desktops (assumed)',(.52,.49,.39),.65)
bookcolors=[(.13,.21,.25),(.36,.15,.12),(.22,.32,.29),(.56,.52,.39),(.72,.69,.56),(.13,.17,.22),(.48,.45,.36),(.25,.37,.45),(.72,.72,.68),(.24,.23,.19)]
bookmats=[mat('Book spine %02d'%i,c,.8) for i,c in enumerate(bookcolors)]
label=mat('Book spine label cream',(.79,.80,.73),.9)

def cube(n,p,d,m,k='Shell',bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=n;o.dimensions=d;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bevel:mod=o.modifiers.new('Editable edge radius','BEVEL');mod.width=bevel;mod.segments=2
 return link(o,k)
def mesh(n,v,f,m,k):
 me=bpy.data.meshes.new(n);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(n,me);C[k].objects.link(o);o.data.materials.append(m);return o

def cyl(n,p,r,h,m,k='Shell',verts=32):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=h,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(m)
 for poly in o.data.polygons:poly.use_smooth=True
 return link(o,k)
def rod(n,p,q,r,m,k='Shell'):
 v=Vector(q)-Vector(p);o=cyl(n,(Vector(p)+Vector(q))/2,r,v.length,m,k,16);o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return o

def ell(n,p,sc,m,k):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=1,location=p);o=bpy.context.object;o.name=n;o.scale=sc;o.data.materials.append(m)
 for f in o.data.polygons:f.use_smooth=True
 return link(o,k)

def area(n,p,target,power,size,color=(1,.95,.84)):
 d=bpy.data.lights.new(n,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(n,d);C['Lighting'].objects.link(o);o.location=p;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o

def camera(n,p,target,lens):
 d=bpy.data.cameras.new(n);o=bpy.data.objects.new(n,d);C['Cameras'].objects.link(o);o.location=p;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.clip_end=100;return o
# Metric dimensions below are inferred from photograph, not measured.
# Open atrium 16 x 17 m, ground + exactly ONE upper gallery at 3.25 m.
cube('Continuous dark-gray carpet',(0,2,-.09),(24,26,.18),carpet)
cube('Far concrete wall',(0,14,3.55),(24,.3,7.1),concrete)
cube('Left concrete boundary',(-12,2,3.55),(.3,24,7.1),concrete)
cube('Right concrete boundary',(12,2,3.55),(.3,24,7.1),concrete)
for x in [-10,10]:cube('Upper side gallery slab',(x,2,3.17),(4,24,.26),concrete,'Gallery')
cube('Upper far gallery slab',(0,11.5,3.17),(16,5,.26),concrete,'Gallery')
# Front gallery exists behind camera, completing square atrium with no extra stories.
cube('Upper near gallery slab',(0,-11.5,3.17),(16,3,.26),concrete,'Gallery')
# Raw-concrete fascia, repetitive brackets and beams/coffers visible above stacks.
for z in [3.08,6.65]:
 cube('Far horizontal concrete fascia',(0,9,z),(16.3,.42,.37),concrete,'Gallery')
 for x in [-8,8]:cube('Side horizontal concrete fascia',(x,1,z),(.42,16.4,.37),concrete,'Gallery')
for x in [i*2-7 for i in range(8)]:
 cube('Far projecting coffer beam',(x,11.3,6.28),(.27,4.8,.65),concrete,'Roof')
 cube('Far upper slab bracket',(x,9.08,2.88),(.2,.65,.45),concrete,'Gallery')
for y in [-6,-3,0,3,6]:
 for x in [-10,10]:
  cube('Side projecting coffer beam',(x,y,6.28),(4.2,.27,.65),concrete,'Roof')
  cube('Side gallery supporting bracket',(-8 if x<0 else 8,y,2.88),(.65,.2,.45),concrete,'Gallery')
# Gallery ceilings are dark against the sunlit open atrium.
cube('Far coffer backing',(0,11.6,6.68),(24,5,.15),concrete,'Roof')
# Lower-level shelf ceiling is concrete and rhythmically beamed too.
for x in range(-7,8,2):cube('Lower gallery coffer crossbeam',(x,11.4,2.82),(.20,4.8,.34),concrete,'Gallery')
for x in [-10,10]:cube('Side coffer backing',(x,1,6.68),(4,16,.15),concrete,'Roof')
# Glass/metal gallery rails: broad pale horizontal band plus fine lower rails.
def railing(p,q):
 p=Vector((*p,3.32));q=Vector((*q,3.32));v=q-p;N=math.ceil(v.length/1.5)
 for i in range(N):
  aa=p+v*i/N;bb=p+v*(i+1)/N;mid=(aa+bb)/2
  dims=(abs(bb.x-aa.x) or .014,abs(bb.y-aa.y) or .014,.83)
  cube('Clear gallery glass panel',mid+Vector((0,0,.47)),dims,glass,'Gallery')
 for i in range(N+1):
  pp=p+v*i/N;rod('Gallery metal upright',pp,pp+Vector((0,0,1.05)),.024,rail,'Gallery')
 for zz,r in [(.1,.023),(.34,.013),(.68,.014),(.94,.022)]:rod('Gallery horizontal metal rail',p+Vector((0,0,zz)),q+Vector((0,0,zz)),r,rail,'Gallery')
 mid=(p+q)/2;cube('Wide pale gallery top band',mid+Vector((0,0,1.0)),(abs(v.x) or .08,abs(v.y) or .08,.16),white,'Gallery')
railing((-8,9),(8,9));railing((-8,-10),(-8,9));railing((8,-10),(8,9));railing((-8,-10),(8,-10))
# Distinctive paired slender columns on left-of-center and smaller far pair.
for x,y in [(-3.35,3.8),(-2.78,3.8),(2.9,9.1),(3.42,9.1)]:
 cyl('Paired slender white cylindrical column',(x,y,3.38),.17,6.76,white)
 for z in [1.95,4.6]:cyl('Fine column sleeve seam',(x,y,z),.175,.024,rail)
# Near-right thick white duct with fine horizontal jacket seams.
cyl('Large near-right white cylindrical duct',(7.5,-.5,3.55),.39,7.1,white)
for z in [i*.44 for i in range(1,16)]:cyl('Duct jacket circumferential seam',(7.5,-.5,z),.395,.012,rail)
# Large elliptical skylight in maroon ring, with radial white glazed roof ribs.
# Polygonal oval ring (not a generic dome): two concentric low-profile edge bands.
def ellipse_ring(n,rx,ry,z,width,h,m):
 v=[];f=[];N=128
 for i in range(N):
  t=2*math.pi*i/N
  for rr,zz in [(0,0),(-width,0),(-width,h),(0,h)]:v.append(((rx+rr)*math.cos(t),1+(ry+rr)*math.sin(t),z+zz))
 for i in range(N):
  j=(i+1)%N
  for k in range(4):f.append((4*i+k,4*j+k,4*j+(k+1)%4,4*i+(k+1)%4))
 return mesh(n,v,f,m,'Roof')
ellipse_ring('Large maroon oval skylight perimeter',8.35,8.4,6.85,.19,.22,maroon)
ellipse_ring('Inner red skylight edge',8.03,8.08,7.03,.055,.08,maroon)
# Shallow raised conical glazing. White radial beams retain the photo silhouette.
N=32;apex=(0,1,9.4)
for i in range(N):
 t=2*math.pi*i/N;tt=2*math.pi*(i+1)/N;p1=(8.15*math.cos(t),1+8.2*math.sin(t),7.1);p2=(8.15*math.cos(tt),1+8.2*math.sin(tt),7.1)
 mesh('Diffuse glazed roof segment',[p1,p2,apex],[(0,1,2)],roofglass,'Roof');rod('White radial skylight structural rib',p1,apex,.045,white,'Roof')
# A white perimeter service duct tracks the upper edge like source.
for i in range(64):
 t=2*math.pi*i/64;tt=2*math.pi*(i+1)/64
 rod('White skylight perimeter service duct',(8.65*math.cos(t),1+8.7*math.sin(t),6.9),(8.65*math.cos(tt),1+8.7*math.sin(tt),6.9),.12,white,'Roof')
# Dense shelving, books batched into editable mesh per shelf bay/material for efficiency.
def shelf(n,x,y,z,w=1.85,angle=0,h=2.15):
 start=set(C['Stacks'].objects);bs=[[] for _ in bookmats];fs=[[] for _ in bookmats];lv=[];lf=[]
 def co(xx,yy,zz):return (x+xx*math.cos(angle)-yy*math.sin(angle),y+xx*math.sin(angle)+yy*math.cos(angle),z+zz)
 def boxbuf(v,f,center,d):
  offset=len(v);xx,yy,zz=center;dx,dy,dz=[q/2 for q in d]
  v.extend(co(xx+sx*dx,yy+sy*dy,zz+sz*dz) for sx,sy,sz in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)])
  f.extend(tuple(offset+i for i in face) for face in [(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)])
 for xx in [-w/2,w/2]:cube(n+' white upright',co(xx,0,h/2),(.045,.49,h),white,'Stacks')
 cube(n+' pale central shelf back',co(0,.02,h/2),(w,.025,h),white,'Stacks')
 for level in range(6):
  zz=.10+level*.35;cube(n+' light metal shelf',co(0,0,zz),(w,.5,.032),white,'Stacks')
  if level==5:continue
  xx=-w/2+.055
  while xx<w/2-.07:
   bw=random.uniform(.025,.09);bh=random.uniform(.21,.315);idx=random.choices(range(len(bookmats)),[9,4,5,6,12,9,5,5,12,6])[0]
   boxbuf(bs[idx],fs[idx],(xx+bw/2,-.16,zz+.03+bh/2),(bw,.28,bh))
   if random.random()<.7:boxbuf(lv,lf,(xx+bw/2,-.303,zz+.09),(bw*.8,.004,.035))
   xx+=bw+.007
 # Stacks are double-sided in the photograph: mirror book volumes around bay center.
 for i in range(len(bookmats)):
  count=len(bs[i]);orig=list(bs[i]);faces=list(fs[i])
  for vx,vy,vz in orig:
   dx=vx-x;dy=vy-y;localy=-dx*math.sin(angle)+dy*math.cos(angle);bs[i].append((vx+(2*localy)*math.sin(angle),vy-(2*localy)*math.cos(angle),vz))
  fs[i].extend(tuple(count+j for j in reversed(face)) for face in faces)
 for i,m in enumerate(bookmats):
  if bs[i]:mesh(n+' / editable book spines '+str(i),bs[i],fs[i],m,'Books')
 if lv:mesh(n+' / small spine labels',lv,lf,label,'Books')
 for o in set(C['Stacks'].objects)-start:o.rotation_euler.z=angle
# Far upper continuous wall of books and ground rows, kept close to real white stacks.
for z in [0,3.32]:
 for i in range(11):shelf('Far wall bay',-10.3+i*2.03,13.4,z,1.93)
 for y in [-5,-2,1,4,7,10]:
  shelf('Left peripheral bay',-11.45,y,z,2.4,math.pi/2)
  shelf('Right peripheral bay',11.45,y,z,2.4,-math.pi/2)
# Ground stacks come inward in short runs; upper stacks also form perpendicular aisles.
for x in [-7,-5.0,-3,0,2,4,6,8]:
 for j in range(2):shelf('Ground inward stack',x,10.7+j*1.4,0,1.3,math.pi/2)
for x in [-9.8,-7.7,-5.6,-3.5,0,2.1,4.2,6.3,8.4]:
 shelf('Upper gallery aisle stack',x,11.8,3.32,1.6,math.pi/2)
# Continuous foreground line of upper books matches the dense source gallery silhouette.
for i in range(8):shelf('Upper continuous gallery book frontage',-7.0+i*2,10.45,3.32,1.9)
for x in [-9.9,9.9]:
 for y in [-4,0,4,7]:shelf('Side upper gallery row',x,y,3.32,1.9)
# Linear ceiling luminaires under the gallery and under roof coffers.
for z in [2.84,6.02]:
 for x in [-6,-2,2,6]:
  for y in [10.1,11.9,13.0]:cube('Horizontal warm library strip',(x,y,z),(2.4,.07,.035),lamp,'Lighting')
 for x in [-9.5,9.5]:
  for y in [-5,-1,3,7]:cube('Side warm library strip',(x,y,z),(.07,2,.035),lamp,'Lighting')
# Central sculpture silhouette: low circular light pedestal, asymmetric dark folded/upright forms.
# Restrained original abstract approximation, not an exact reproduction of the artwork.
cx,cy=0,3.9
cyl('Short round pale landmark pedestal',(cx,cy,.43),.73,.86,pedestal,'Landmark sculpture',64)
cyl('Thin pale pedestal top',(cx,cy,.88),.76,.045,pedestal,'Landmark sculpture',64)
body=ell('Dark sculpture low folded body',(cx,cy,.99),(.48,.36,.27),bronze,'Landmark sculpture')
# Ribbed, twisting fans create the distinctive rising sculpture without claiming art accuracy.
for side in [-1,1]:
 v=[];f=[]
 for i in range(15):
  t=i/14;xx=side*(.08+.38*t);yy=cy+(.18 if side<0 else -.08)+.19*math.sin(t*math.pi);zz=.99+.92*t-.16*t*t
  v.extend([(cx+xx,yy-.11-.12*t,zz),(cx+xx+.045,yy+.12+.18*t,zz+.08)])
 for i in range(14):f.append((2*i,2*i+1,2*i+3,2*i+2))
 o=mesh('Dark landmark folded rising fan',v,f,bronze,'Landmark sculpture');mod=o.modifiers.new('Editable solid bronze thickness','SOLIDIFY');mod.thickness=.04
 for i in range(1,14):rod('Sculpture subtle folded rib',v[2*i],v[2*i+1],.014,bronze,'Landmark sculpture')
# Plaque intentionally unlettered; do not invent artist/title.
o=cyl('Unlettered round pedestal plaque',(cx,cy-.731,.43),.14,.012,rail,'Landmark sculpture');o.rotation_euler.x=math.pi/2
# Reading desks only along periphery: inferred furnishing, not observed exact positions.
for x,y in [(-9.1,-3),(-9.1,.3),(9.2,3),(9.2,6)]:
 cube('Assumed peripheral reading tabletop',(x,y,.76),(1.45,.75,.045),deskmat,'Peripheral desks (assumed)')
 for dx in [-.6,.6]:
  for dy in [-.27,.27]:rod('Assumed desk metal leg',(x+dx,y+dy,.03),(x+dx,y+dy,.74),.022,rail,'Peripheral desks (assumed)')
 cube('Assumed chair seat',(x,y-.62,.44),(.43,.42,.06),dark,'Peripheral desks (assumed)',.03)
 cube('Assumed chair back',(x,y-.81,.7),(.43,.05,.48),white,'Peripheral desks (assumed)',.025)
# Game-only text on unobtrusive central fascia, not an observed library sign.
signbg=mat('Invented game label ink',(.025,.065,.067),.55);signfg=mat('Invented game label ivory',(.85,.91,.83),.4,0,.25)
cube('Invented game-label fascia panel',(1,8.74,2.95),(6.25,.075,.61),signbg,'Game labels',.02)
d=bpy.data.curves.new('HSG BIBLIOTHEK invented game label','FONT');d.body='HSG BIBLIOTHEK';d.align_x='CENTER';d.align_y='CENTER';d.size=.49;d.extrude=.002;o=bpy.data.objects.new('HSG BIBLIOTHEK / invented game label',d);C['Game labels'].objects.link(o);o.location=(1,8.69,2.95);o.rotation_euler=(math.pi/2,0,0);d.materials.append(signfg);o['invented_game_label']=True
# Original placeholder students; adapted from existing maintained local Trischli bpy workflow.
navy=mat('Student navy trousers',(.025,.043,.065),.8);teal=mat('Student teal overshirt',(.045,.32,.34),.75);ochre=mat('Student ochre overshirt',(.64,.27,.075),.75);cream=mat('Student cream sneaker',(.76,.76,.68),.75);skin=mat('Student warm skin',(.57,.32,.19),.75);skin2=mat('Student deep skin',(.23,.105,.065),.75);hair=mat('Student dark hair',(.022,.015,.014),.8)
positions={'player':(-3.0,-.6,0),'opponent':(3.5,4.6,0)}
def fighter(name,pos,opponent,coat,sm):
 start=set(C['Fighters'].objects);pos=Vector(pos);f=(Vector(opponent)-pos).normalized();right=Vector((f.y,-f.x,0))
 def P(x,y,z):return pos+right*x+f*y+Vector((0,0,z))
 def E(n,p,sc,m):return ell(name+' / '+n,P(*p),sc,m,'Fighters')
 def S(n,p,q,r,m):
  v=P(*q)-P(*p);o=ell(name+' / '+n,(P(*p)+P(*q))/2,(r,r,v.length/2+r*.4),m,'Fighters');o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return o
 for x,y in [(-.19,.16),(.22,-.15)]:
  S('trouser thigh',(x*.75,0,.96),(x,y,.57),.115,navy);S('trouser shin',(x,y,.57),(x*1.25,y,.14),.088,navy)
  shoe=E('sneaker',(x*1.25,y+.065,.095),(.115,.2,.09),cream);shoe.rotation_euler.z=math.atan2(-f.x,f.y)
 E('overshirt',(0,0,1.22),(.27,.17,.36),coat).rotation_euler.z=math.atan2(-f.x,f.y)
 E('neck',(0,.015,1.56),(.085,.085,.13),sm);E('head',(0,.01,1.77),(.145,.13,.195),sm);E('hair crown',(0,-.018,1.89),(.153,.137,.105),hair);E('nose',(0,.139,1.77),(.035,.045,.038),sm)
 for x in [-.065,.065]:E('eye',(x,.131,1.805),(.012,.009,.016),navy)
 for sh,el,wr in [((-.245,0,1.43),(-.37,.08,1.17),(-.27,.38,1.36)),((.245,0,1.43),(.34,.12,1.25),(.20,.42,1.54))]:
  S('sleeve',sh,el,.105,coat);S('forearm',el,wr,.072,sm);E('ready hand',wr,(.086,.09,.09),sm)
 E('small book bag',(0,-.18,1.26),(.18,.095,.23),navy).rotation_euler.z=math.atan2(-f.x,f.y)
 for x in [-.15,.15]:S('bookbag strap',(x,-.13,1.47),(x,-.19,1.1),.022,cream)
 for o in set(C['Fighters'].objects)-start:o['placeholder']=True;o['fighter']=name
fighter('Player placeholder',positions['player'],positions['opponent'],teal,skin)
fighter('Opponent placeholder',positions['opponent'],positions['player'],ochre,skin2)
# Skylight and large soft photographic fill. No volumetric effects or expensive textures.
area('Broad skylight',(0,2,8.5),(0,2,0),2200,11,(.86,.93,1))
area('Camera-side diffuse fill',(-3,-6,5),(0,5,1),800,8,(1,.94,.83))
area('Far gallery book fill',(0,7.8,5.7),(0,13,4.2),950,10,(1,.94,.82))
area('Left upper book fill',(-6,1,5.7),(-11,2,4.3),600,7,(1,.94,.82))
area('Right upper book fill',(6,1,5.7),(11,2,4.3),600,7,(1,.94,.82))
area('Lower books soft fill',(0,6.7,2.7),(0,12,1),450,8,(1,.92,.77))
world=bpy.data.worlds.new('Overcast daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.65,.73,.79,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.22;s.world=world
battlecam=camera('BATTLE / over-player diagonal',(-1.6,-8.6,3.1),(.2,5.0,1.5),22);battlecam.data.shift_y=-.035
refcam=camera('REFERENCE / upper-gallery diagonal',(-7.1,-7.0,5.75),(.1,4.8,1.20),22)
s.camera=battlecam;s.render.engine='BLENDER_EEVEE';s.eevee.taa_render_samples=24 if a.draft else 64;s.eevee.shadow_pool_size='512';s.render.threads_mode='FIXED';s.render.threads=3;s.render.resolution_x=1920;s.render.resolution_y=1080;s.render.resolution_percentage=50 if a.draft else 100;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=75;s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.unit_settings.system='METRIC'
s['venue']='HSG main library, St. Gallen';s['source_date']=2013;s['dimensions_status']='Inferred metric blockout, not measured or surveyed';s['source_photo_embedded']=False;s['upper_gallery_count']=1;s['bottom_command_reserve']=.20;s['fighter_positions']=json.dumps(positions);s['gameplay_adaptation']='Clear central battle lane; temporary 2013 event seating/platform omitted. Existing landmark retained. Label and peripheral desks assumed.'
# Reference view shares all architecture and materials, hiding only invented game label/fighters.
r=s.copy();r.name='REFERENCE / 2013 architectural interpretation';r.use_fake_user=True;r.camera=refcam;r.render.resolution_x=1800;r.render.resolution_y=1200
# Distinct view-layer exclusion permits one editable shell to serve all views.
for c in r.view_layers[0].layer_collection.children:
 if c.name in ['Fighters','Game labels']:c.exclude=True
bpy.context.window.scene=s
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(base,'hsg-library.blend'),compress=True)
if a.render=='all':
 for sc,kind in [(r,'reference-interior'),(s,'battle-preview'),(s,'battle-background')]:
  bpy.context.window.scene=sc;C['Fighters'].hide_render=kind!='battle-preview';sc.render.filepath=os.path.join(base,'renders',kind+'.png');bpy.ops.render.render(write_still=True)
C['Fighters'].hide_render=False;bpy.context.window.scene=s
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(base,'hsg-library.blend'),compress=True)
print('HSG_LIBRARY_GENERATED',len(bpy.data.objects),len(bpy.data.meshes))
