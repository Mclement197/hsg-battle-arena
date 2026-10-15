"""Trischli reference reconstruction, three independent editable photographic studies.
Blender 5.0.1; no downloaded assets, photos, add-ons, or Python dependencies.
blender -b -t 3 --python-exit-code 1 --python generate.py -- --output-dir PATH [--draft] [--render all|dj|main|lounge|none]
"""
import bpy, math, random, argparse, os, sys, json
from mathutils import Vector
random.seed(15)
p=argparse.ArgumentParser();p.add_argument('--output-dir',default=os.path.dirname(os.path.abspath(__file__)));p.add_argument('--draft',action='store_true');p.add_argument('--render',default='all',choices=['all','dj','main','lounge','none']);a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
os.makedirs(os.path.join(a.output_dir,'renders'),exist_ok=True)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
for s in list(bpy.data.scenes)[1:]:bpy.data.scenes.remove(s)
for c in list(bpy.data.collections):bpy.data.collections.remove(c)

def mat(n,c,r=.5,metal=0,e=0):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Roughness'].default_value=r;bs.inputs['Metallic'].default_value=metal
 if e:bs.inputs['Emission Color'].default_value=(*c,1);bs.inputs['Emission Strength'].default_value=e
 return m
black=mat('Black powdercoat',(.009,.011,.013),.36,.35);wall=mat('Dark graphite plaster',(.026,.025,.026),.87);leather=mat('Charcoal upholstery',(.012,.016,.021),.64);brass=mat('Muted brass edge',(.23,.16,.071),.3,.65);ivory=mat('Rug ivory',(.45,.46,.45),.95);ink=mat('Rug black',(.042,.046,.053),.97);gray=mat('Rug gray',(.19,.21,.24),.97);white=mat('White LED',(.83,.89,1),.25,0,4);arrows=mat('Chevron light',(.95,.98,1),.3,0,2.8);amber=mat('Amber stair LED',(1,.4,.07),.3,0,3);screen=mat('Deck LCD',(.7,.8,.8),.3,0,.6);paper=mat('Bottle labels',(.74,.7,.58),.8)
def wood(n,c1,c2):
 m=mat(n,c1,.49);ns=m.node_tree.nodes;ls=m.node_tree.links;co=ns.new('ShaderNodeTexCoord');v=ns.new('ShaderNodeVectorMath');v.operation='MULTIPLY';v.inputs[1].default_value=(7,1,18);noise=ns.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=4;noise.inputs['Detail'].default_value=2;ls.new(co.outputs['Generated'],v.inputs[0]);ls.new(v.outputs[0],noise.inputs['Vector']);r=ns.new('ShaderNodeValToRGB');r.color_ramp.elements[0].color=(*c1,1);r.color_ramp.elements[1].color=(*c2,1);ls.new(noise.outputs['Fac'],r.inputs[0]);ls.new(r.outputs[0],ns.get('Principled BSDF').inputs['Base Color']);return m
walnut=wood('Walnut panel grain',(.10,.044,.021),(.27,.145,.062));floors=[wood('Smoked narrow oak %d'%i,(.035+i*.004,.026+i*.003,.021+i*.002),(.105+i*.01,.074+i*.007,.05+i*.005)) for i in range(6)]
glass=mat('Clear screen / Eevee alpha approximation',(.16,.2,.22),.15,.15);bs=glass.node_tree.nodes.get('Principled BSDF');bs.inputs['Alpha'].default_value=.08;glass.surface_render_method='DITHERED';glass.diffuse_color=(.16,.2,.22,.08)
bottles=[mat('Bottle '+str(i),c,.22,.12) for i,c in enumerate([(.16,.064,.012),(.037,.091,.047),(.26,.24,.14),(.35,.32,.24)])]
C={};S={}
def link(o,col):
 for c in list(o.users_collection):c.objects.unlink(o)
 C[col].objects.link(o);return o

def cube(n,loc,d,m=black,bev=0,col='Props'):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=d;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bev:b=o.modifiers.new('Editable edge softness','BEVEL');b.width=bev;b.segments=2;o.modifiers.new('Corner normals','WEIGHTED_NORMAL')
 return link(o,col)
def mesh(n,v,f,m,col='Props'):
 me=bpy.data.meshes.new(n);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(n,me);C[col].objects.link(o);o.data.materials.append(m);return o
def cyl(n,loc,r,h,m=black,col='Props',vertices=24):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=h,location=loc);o=bpy.context.object;o.name=n;o.data.materials.append(m);return link(o,col)
def rod(n,p,q,r=.012,m=black,col='Props'):
 v=Vector(q)-Vector(p);o=cyl(n,(Vector(p)+Vector(q))/2,r,v.length,m,col,16);o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return o
def area(n,loc,target,power,color=(.9,.92,1),size=4):
 d=bpy.data.lights.new(n,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(n,d);C['Lights'].objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
def camera(n,loc,target,lens):
 d=bpy.data.cameras.new(n);o=bpy.data.objects.new(n,d);C['Cameras'].objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.clip_end=80;return o
def newscene(key,ref,loc,target,lens):
 global C
 s=bpy.data.scenes[0] if not S else bpy.data.scenes.new(key);s.name=key.upper()+' / reference '+ref;bpy.context.window.scene=s;C={}
 for n in ['Architecture','Furniture','Props','Ceiling','Lights','Cameras']:
  c=bpy.data.collections.new(key+' / '+n);s.collection.children.link(c);C[n]=c
 s.render.engine='BLENDER_EEVEE';s.eevee.taa_render_samples=24 if a.draft else 80;s.eevee.shadow_pool_size='1024';s.eevee.volumetric_tile_size='4';s.eevee.volumetric_samples=64;s.render.threads_mode='FIXED';s.render.threads=3;s.render.resolution_x=1800;s.render.resolution_y=1200;s.render.resolution_percentage=50 if a.draft else 100;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=70
 s.world=bpy.data.worlds.new(key+' / night');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.09,.1,.12,1);s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.16
 s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=0
 s.unit_settings.system='METRIC';s.unit_settings.scale_length=1;s.camera=camera(key.upper()+' / matched reference '+ref,loc,target,lens)
 s['venue']='Trischli Club, St. Gallen';s['revision']=3;s['reference']=ref;s['status']='Bounded photographic reconstruction; estimated scale, not surveyed. Independent study, not a joined venue floorplan.';s['source_photo_embedded']=False
 S[key]=s;return s

def floor(x0,x1,y0,y1,z=0):
 cube('Subfloor',((x0+x1)/2,(y0+y1)/2,z-.08),(x1-x0,y1-y0,.14),wall,col='Architecture')
 for i in range(math.ceil((x1-x0)/.21)):
  x=x0+.105+i*.21
  for j in range(-1,math.ceil((y1-y0)/1.9)+1):
   y=y0+j*1.9+(i%3)*.63;lo=max(y,y0);hi=min(y+1.895,y1)
   if hi>lo:cube('Narrow staggered smoked floorboard',(x,(lo+hi)/2,z),(.206,hi-lo,.018),random.choice(floors),col='Architecture')
def ceiling(x0,x1,y0,y1,z=3.3,axis='y'):
 cube('Low black technical ceiling',((x0+x1)/2,(y0+y1)/2,z+.18),(x1-x0,y1-y0,.14),black,col='Ceiling')
 for y in range(math.floor(y0),math.ceil(y1)+1):
  cube('Ceiling cross rail',((x0+x1)/2,y,z+.01),(x1-x0,.055,.06),black,col='Ceiling')
 for x in range(math.floor(x0),math.ceil(x1)+1):
  cube('Long ceiling rail',(x,(y0+y1)/2,z-.05),(.045,y1-y0,.07),black,col='Ceiling')
 for x in [x0+.75,0,x1-.6]:
  rod('Exposed service pipe',(x,y0,z+.05),(x,y1,z+.05),.065,black,'Ceiling')
 for y in [y0+1,y0+4,y0+7,y0+10]:
  cube('Broad low air duct',((x0+x1)/2,y,z+.03),(x1-x0,.5,.24),black,col='Ceiling')
  for x in [x0+.5,x0+2.5,x0+4.5,x0+6.5]:cube('Duct folded panel seam',(x,y,z-.096),(.022,.51,.016),black,col='Ceiling')
 for x in [x0+.4,x1-.4]:
  for zoff in [-.05,.015,.08]:rod('Parallel exposed conduit',(x,y0,z+zoff),(x,y1,z+zoff),.018,black,'Ceiling')
 if axis=='x':
  for i in range(10):
   y=y0+i*(y1-y0)/10
   for x in [x0+(x1-x0)*.23,x0+(x1-x0)*.72]:
    length=(x1-x0)*random.uniform(.3,.45);cube('Horizontal staggered light bar',(x,y,z-.2),(length,.028,.028),white,col='Ceiling');rod('Light suspension',(x,y,z-.18),(x,y,z+.1),.007,black,'Ceiling')
 else:
  for x in [-3,-1.6,0,1.5,3]:
   for y in [2,6,10]:
    cube('Axial staggered light bar',(x,y,z-.17),(.028,random.uniform(1.7,2.5),.025),white,col='Ceiling')
def spotlight(x,y,z=3.0,power=500,width=.075):
 cube('Moving head hanger',(x,y,z+.15),(.19,.19,.22),black,.025,'Ceiling');cyl('Moving head barrel',(x,y,z),.105,.23,black,'Ceiling');cyl('Downward lens',(x,y,z-.12),.07,.01,white,'Ceiling')
 d=bpy.data.lights.new('Narrow white spot','SPOT');d.energy=power;d.spot_size=width;d.spot_blend=.3;d.shadow_soft_size=.03;d.color=(.92,.95,1);o=bpy.data.objects.new(d.name,d);C['Lights'].objects.link(o);o.location=(x,y,z-.13)
def haze(x0,x1,y0,y1,z=3.3,density=.018):
 m=bpy.data.materials.new('Thin atmospheric scattering');m.use_nodes=True;ns=m.node_tree.nodes;ns.clear();out=ns.new('ShaderNodeOutputMaterial');v=ns.new('ShaderNodeVolumePrincipled');v.inputs['Density'].default_value=density;v.inputs['Color'].default_value=(.72,.75,.78,1);v.inputs['Anisotropy'].default_value=.35;m.node_tree.links.new(v.outputs['Volume'],out.inputs['Volume']);cube('Atmospheric volume',((x0+x1)/2,(y0+y1)/2,z/2),(x1-x0,y1-y0,z),m,col='Lights')
def panel(n,x,y,w,h=1.2,axis='x',bottom=0):
 # Framed walnut enclosure, not arbitrary fluting.
 parts=[cube(n+' core',(x,y,bottom+h/2),(w,.16,h),walnut,.006,'Architecture')]
 for xx in [x-w/2+.04,x+w/2-.04]:parts.append(cube(n+' outer stile',(xx,y-.095,bottom+h/2),(.055,.045,h),walnut,.005,'Architecture'))
 for z in [bottom+.055,bottom+h-.055]:parts.append(cube(n+' rail',(x,y-.095,z),(w,.045,.065),walnut,.004,'Architecture'))
 for i in range(1,max(2,int(w/.55))):
  xx=x-w/2+i*w/max(2,int(w/.55));parts.append(cube(n+' panel stile',(xx,y-.095,bottom+h/2),(.035,.04,h-.1),walnut,.003,'Architecture'))
 if axis=='y':
  for o in parts:
   dx=o.location.x-x;dy=o.location.y-y;o.location.x=x-dy;o.location.y=y+dx;o.rotation_euler.z=math.pi/2
 cube(n+' dark cap',(x,y,bottom+h+.025),(w+.07,.28,.055) if axis=='x' else (.28,w+.07,.055),black,.008,'Architecture')
def glassline(p,q,z0=0,h=1.2):
 x,y=p;xx,yy=q
 if abs(x-xx)<.01:cube('Clear glass screen',((x+xx)/2,(y+yy)/2,z0+h/2),(.012,abs(yy-y),h),glass,col='Architecture')
 else:cube('Clear glass screen',((x+xx)/2,(y+yy)/2,z0+h/2),(abs(xx-x),.012,h),glass,col='Architecture')
 rod('Fine glass top rail',(x,y,z0+h),(xx,yy,z0+h),.012,brass,'Architecture')
 for u,v in [p,q]:rod('Glass edge upright',(u,v,z0),(u,v,z0+h),.012,black,'Architecture')
def table(x,y,z=0,high=True):
 h=1.06 if high else .56;w=.66 if high else .5;depth=.42 if high else 1.1
 cube('Black high tabletop' if high else 'Stone coffee tabletop',(x,y,z+h),(w,depth,.05),black if high else gray,.01,'Furniture')
 if high:cube('Square pedestal foot',(x,y,z+.025),(.48,.4,.05),black,col='Furniture');cube('Table pedestal',(x,y,z+h/2),(.055,.055,h),black,col='Furniture')
 else:
  cube('Thin table brass rim',(x,y,z+h-.025),(w+.025,depth+.025,.022),brass,.004,'Furniture')
  for dx in [-w/2+.05,w/2-.05]:
   for dy in [-depth/2+.05,depth/2-.05]:rod('Coffee table thin leg',(x+dx,y+dy,z),(x+dx,y+dy,z+h),.012,black,'Furniture')
 cyl('Votive holder',(x-.15,y,z+h+.06),.04,.07,brass);cyl('Candle',(x-.15,y,z+h+.1),.022,.008,amber)
 if not high:cube('Menu card',(x+.22,y,z+h+.16),(.14,.025,.28),black,.003)
def sofa(x,y,length=2.6,angle=0,z=0):
 parts=[]
 def b(n,loc,d,m,bev=.025):parts.append(cube('Sofa / '+n,(x+loc[0],y+loc[1],z+loc[2]),d,m,bev,'Furniture'))
 b('walnut base',(0,0,.16),(length,.86,.18),walnut,.009);b('dark plinth',(0,0,.07),(length-.18,.69,.1),black)
 for i in range(3):
  dx=-length/3+i*length/3;b('seat',(dx,-.04,.34),(length/3-.015,.76,.23),leather,.04);b('back',(dx,.32,.65),(length/3-.012,.16,.66),leather,.027)
 for xx in [-length/2+.035,length/2-.035]:b('slim walnut side',(xx,0,.44),(.055,.86,.65),walnut,.007)
 for o in parts:
  dx=o.location.x-x;dy=o.location.y-y;o.location.x=x+dx*math.cos(angle)-dy*math.sin(angle);o.location.y=y+dx*math.sin(angle)+dy*math.cos(angle);o.rotation_euler.z=angle

def bar(x,y,width=5):
 panel('Far bar panel front',x,y,width,1.02);cube('Warm thick bar top',(x,y-.03,1.09),(width+.17,.76,.12),walnut,.012,'Architecture')
 cube('Backbar dark wall',(x,y+.95,1.6),(width+1,.1,3.2),wall,col='Architecture')
 for k in range(2):
  z=1.12+k*.37
  cube('Bottle shelf',(x,y+.72,z),(width-.2,.26,.035),black,col='Props')
  for i in range(24):
   xx=x-width*.43+i*width*.036;hh=random.uniform(.19,.31);yy=y+.69+random.uniform(-.04,.04);m=random.choice(bottles);cyl('Bottle',(xx,yy,z+hh*.39),.034,hh*.78,m);cyl('Bottle neck',(xx,yy,z+hh*.9),.017,hh*.23,m);cyl('Bottle label',(xx,yy,z+hh*.42),.0345,hh*.26,paper)
 area('Warm backbar bottle glow',(x,y-.1,2.4),(x,y+.7,1.2),180,(1,.72,.37),3)
def curvedsteps(cx,cy):
 for j in range(3):
  r=1.15+j*.26;inner=0;z=(3-j)*.105
  v=[(cx,cy,z)]+[(cx+r*math.cos(t),cy+r*math.sin(t),z) for t in [math.pi+k*math.pi/2/32 for k in range(33)]]
  mesh('Observed curved step tread',v,[tuple(range(len(v)))],floors[2],'Architecture')
  vv=[];ff=[]
  for k in range(33):
   t=math.pi+k*math.pi/64;vv.extend([(cx+r*math.cos(t),cy+r*math.sin(t),0),(cx+r*math.cos(t),cy+r*math.sin(t),z)])
  for k in range(32):ff.append((k*2,k*2+1,k*2+3,k*2+2))
  mesh('Curved step walnut riser',vv,ff,walnut,'Architecture')
  for k in range(32):
   t=math.pi+k*math.pi/64;tt=t+math.pi/64;rod('Curved amber step nosing',(cx+r*math.cos(t),cy+r*math.sin(t),z+.008),(cx+r*math.cos(tt),cy+r*math.sin(tt),z+.008),.009,amber,'Architecture')

# PHOTO 13: camera is BEHIND decks, looking ACROSS the room at the arrows.
s=newscene('dj','13',(0,-3.4,1.77),(0,6,1.68),29)
floor(-5,5,-1.5,10)
cube('Far dark chevron wall',(0,9.8,1.8),(10,.18,3.6),wall,col='Architecture')
cube('Far inset display / across room',(0,9.65,1.67),(6.6,.09,2.25),black,col='Architecture')
for xx in [-2.05,0,2.05]:
 mesh('Far white chevron',[(xx-.78,9.57,3.23),(xx+.14,9.57,3.23),(xx+1.04,9.57,2.42),(xx+.14,9.57,1.61),(xx-.78,9.57,1.61),(xx+.12,9.57,2.42)],[(0,1,2,3,4,5)],arrows,'Architecture')
for x in [-3.45,3.45]:cube('Far screen side pier',(x,9.6,1.7),(.18,.27,3.1),wall,col='Architecture')
ceiling(-5,5,-.5,10,3.25,'x')
# Additional foreground transverse bars to preserve photo's dense, horizontal silhouette.
for x,y,w in [(-2,1,4),(2.5,.1,4),(-2.5,2.2,3),(2.8,3,3.8),(0,6,6.5)]:cube('Transverse white light strip',(x,y,2.94),(w,.026,.028),white,col='Ceiling')
for x,y in [(-3.8,4),(0,6),(3.6,5)]:spotlight(x,y,2.9,55,.25)
for x in [-2.5,2.5]:sofa(x,7.8,2.25,0);table(x,7.2,high=False)
glassline((-4.8,6.8),(4.8,6.8),0,.95)
# Broad unadorned booth parapet and worktop; no invented front branding/dais.
cube('DJ worktop',(0,.42,.95),(5.3,1.5,.09),black,.009,'Furniture');cube('DJ front parapet',(0,1.25,1.19),(9,.12,.38),black,col='Architecture');cube('DJ lower fascia',(0,-.15,.47),(5.3,.08,.9),black,col='Furniture')
for x in [-1.03,1.03]:
 cube('Media player chassis',(x,.42,1.055),(.85,.77,.16),black,.025)
 cyl('Deck jog silver rim',(x,.22,1.15),.237,.025,brass,vertices=64);cyl('Deck jog platter',(x,.22,1.17),.216,.02,black,vertices=64);cyl('Deck jog white centre',(x,.22,1.183),.063,.007,screen)
 cube('Deck rear LCD',(x,.68,1.155),(.42,.22,.015),screen,.007)
 for i in range(4):cyl('Deck button',(x-.31+i*.09,.07,1.16),.019,.016,screen if i==0 else black)
 cube('Pitch track',(x+.32,.38,1.16),(.014,.27,.01),brass)
 cube('Pitch fader',(x+.32,.43,1.18),(.055,.032,.018),screen,.003)
 for j in range(5):
  cyl('Player selector rotary',(x-.3,.36+j*.07,1.17),.013,.02,black)
  cube('Player status key',(x+.29,.6+j*.025,1.17),(.035,.012,.008),screen)
cube('Four-channel mixer',(0,.42,1.06),(.78,.76,.17),black,.012)
for x in [-.27,-.09,.09,.27]:
 for y in [.38,.51,.64,.77]:cyl('Mixer rotary',(x,y,1.18),.022,.045,black);cyl('Rotary highlight',(x,y,1.204),.009,.003,brass)
 cube('Fader slot',(x,.16,1.155),(.009,.17,.01),brass);cube('Fader cap',(x,.17,1.18),(.06,.027,.019),screen,.003)
 for j in range(5):cube('Mixer channel meter',(x+.032,.34+j*.025,1.16),(.008,.015,.006),screen)
for i in range(7):
 x=-.6+i*.19;rod('Equipment cable',(x,.82,1.17),(x+.1,1.01,1.08),.009,black)
area('Deck readable low key',(0,-.7,2.4),(0,.4,1),35,(.88,.92,1),3);area('Far chevron reflected spill',(0,8.9,2.4),(0,7,0),120,(.88,.92,1),4);area('Ceiling grazing fill',(-3,3,2.4),(0,4,3.2),25,(.7,.75,.8),4)

# Dense exposed cable trays and a curved duct section visible over the DJ axis.
for y in [1.7,3.6,5.4,7.3]:
 for x in [-3,-1,1,3]:cube('Black technical cable tray',(x,y,3.04),(1.8,.12,.09),black,col='Ceiling')
rod('Low transverse ventilation',(0,1.1,3.13),(0,3.3,3.13),.22,black,'Ceiling')
# PHOTO 14: narrow axial view, bar OPPOSITE, glass left, walnut enclosure right.
s=newscene('main','14',(0,-.4,1.5),(0,8,1.54),20)
floor(-4.4,4.4,-1,14)
for x in [-4.45,4.45]:cube('Dark side wall',(x,6.5,1.8),(.12,15,3.6),wall,col='Architecture')
ceiling(-4.5,4.5,-1,14,3.3,'y');bar(0,11.6,6.7)
# Dark intersecting service rails, cable trays and hanging fixture housings.
for y in [0.4,1.6,2.8,4.1,5.4,6.7,8.0,9.3]:
 for x in [-3.6,-1.8,0,1.8,3.6]:
  cube('Main overhead transverse service rail',(x,y,3.1),(1.65,.064,.085),black,col='Ceiling')
  if (int(y*10)+int(x*10))%3==0:cube('Main cable tray suspended cover',(x,y+.13,2.99),(.5,.27,.11),black,col='Ceiling')
for x in [-3.1,-2.4,-.8,.65,2.2,3.6]:
 for z in [3.07,3.15]:rod('Main overhead conduit',(x,-.8,z),(x,11,z),.024,black,'Ceiling')
for x,y in [(-3,1.25),(3,2.2),(-2.4,3.6),(2.8,5.5),(-.8,6.6),(1.5,8)]:
 cube('Suspended moving head yoke',(x,y,2.91),(.26,.22,.3),black,.018,'Ceiling')
 cyl('Suspended dark lens',(x,y,2.73),.10,.13,black,'Ceiling')
# Left glass side and black upholstered recess, light on inner stair treads.
panel('Left walnut low wall',-4.1,4,5.8,.9,'y')
for j in range(3):
 cube('Left side narrow terrace tread',(-3.32-j*.17,6,.08+j*.08),(.32,7.9,.16+j*.16),floors[2],col='Architecture')
 for y in [3.4,5.8,8.2]:cube('Left tread warm light',(-3.14-j*.17,y,.17+j*.08),(.025,.4,.012),amber,col='Architecture')
glassline((-3.04,1.7),(-3.04,9),.2,1.03)
for y in [4,7.1,9.5]:sofa(-3.7,y,2.3,math.pi/2,z=.24)
# Paneled rectangular enclosure, with side return visible along the floor axis.
panel('Large right walnut enclosure front',2.72,4.85,1.26,1.35);panel('Large right walnut enclosure side',3.35,6.82,3.96,1.35,'y');cube('Enclosure dark padded upper lip',(2.73,6.65,1.5),(1.25,3.68,.27),black,.015,'Furniture')
glassline((3.0,1.45),(3.0,4.0),.29,1.0);glassline((3.0,1.45),(4.4,1.45),.29,1.0)
curvedsteps(3.0,2.4)
table(-1.05,3.0);table(1.1,3.0);table(.95,9.9)
for x,y in [(-1.55,1.5),(0,1.65),(1.6,1.6),(-2.3,4),(2.3,4.5),(-1.8,7),(1.85,7.8),(0,10)]:spotlight(x,y,3.02,1400 if y<3 else 900,.09)
haze(-4.3,4.3,-.8,12.7,3.35,.019)
# Main photographic beam starts around upper-center, not at image edge.
spotlight(0,2.5,3.02,4800,.095)
for x,y in [(-2.3,4),(2.3,4.5),(-1.8,7),(1.85,7.8),(0,10)]:spotlight(x,y,3.02,1100,.10)
area('Warm bar architectural key',(0,10,2.8),(0,11.6,.5),280,(1,.73,.43),5);area('Right walnut joinery bounce',(0,3,2.6),(2.1,5,.5),95,(1,.78,.55),3);area('Dim floor bounce',(0,4,3),(0,3,0),22,(.8,.83,.86),5)

# PHOTO 11: continuous central zigzag carpet, sofa rows, glass edge, bar upper left.
s=newscene('lounge','11',(-1.75,-4.85,3.2),(.15,1.8,.45),25)
floor(-5.7,6.3,-5,10)
# Continuous single carpet with actual geometric woven zigzags (no mapped photograph).
x0,x1,y0,y1=-3.85,3.95,-4.5,1.35
cube('ONE continuous large lounge carpet',((x0+x1)/2,(y0+y1)/2,.023),(x1-x0,y1-y0,.018),ivory,col='Furniture')
for i in range(-22,34):
 for j in range(-5,8):
  xx=j*.66;yy=i*.29
  pts=[(xx,yy),(xx+.33,yy+.29),(xx+.66,yy)]
  for k in range(2):
   u,v=pts[k];uu,vv=pts[k+1]
   poly=[(u,v),(uu,vv),(uu,vv+.10),(u,v+.10)]
   # Sutherland-Hodgman crop: every woven stripe is bounded by the one rectangular rug.
   for axis,bound,greater in [(0,x0,True),(0,x1,False),(1,y0,True),(1,y1,False)]:
    out=[]
    for n,P in enumerate(poly):
     Q=poly[n-1];inside=lambda t:t[axis]>=bound if greater else t[axis]<=bound
     if inside(P)!=inside(Q):
      t=(bound-Q[axis])/(P[axis]-Q[axis]);out.append((Q[0]+t*(P[0]-Q[0]),Q[1]+t*(P[1]-Q[1])))
     if inside(P):out.append(P)
    poly=out
    if not poly:break
   if len(poly)>2:mesh('Continuous carpet / zigzag weave',[(u,v,.035) for u,v in poly],[tuple(range(len(poly)))],ink if i%3 else gray,'Furniture')
# Camera-relative seating: near-left cropped sofa, long right-edge sofa,
# diagonally projecting central island and a narrow strip of continuous carpet.
sofa(-2.85,-2.15,3.85,.13);table(-2.35,-3.7,high=False)
sofa(3.72,-1.6,3.5,math.pi/2);table(3.0,-1.2,high=False)
sofa(1.85,-.1,3.15,.36);table(1.8,-1.6,high=False)
sofa(-.95,1.45,2.75,0);table(-1.45,.45,high=False)
sofa(-2.55,3.7,2.6,0);table(-1.8,3.1,high=False)
sofa(3.6,3.05,2.75,math.pi/2)
glassline((-4.6,4.08),(4.65,4.08),0,1.2);glassline((4.65,-3.9),(4.65,4.08),0,1.2)
bar(-2.1,6.2,3.25)
panel('Lounge view / walnut enclosure front',4.65,4.6,4.2,1.55);panel('Lounge view / walnut enclosure return',6.75,5.8,2.4,1.55,'y');cube('Enclosure black upper bench',(4.65,5.2,1.73),(4.15,1.2,.3),black,.015,'Furniture')
curvedsteps(.5,5.9)
for x in [-5.5,7.15]:cube('Dark peripheral wall',(x,3,1.8),(.16,14,3.6),wall,col='Architecture')
cube('Far warm gray wall',(0,10,1.7),(12,.12,3.4),mat('Background warm gray',(.16,.15,.14),.9),col='Architecture')
for x in [-4.5,-1.2,2.1,5.4]:
 cube('Far wall vertical reveal',(x,9.91,1.8),(.06,.04,3.1),wall,col='Architecture')
 cube('Wall sconce',(x+.2,9.87,2.2),(.08,.025,.15),screen,col='Props')
ceiling(-5.6,6.2,-5,10,3.4,'x')
for x,y in [(-3,4.5),(-1,4.5),(1.4,4.5),(3.8,4.5),(-3,7),(1,7)]:spotlight(x,y,3.12,1800,.14)
haze(-5.5,6,-4.8,9.8,3.4,.012)
area('Lounge soft cool architectural key',(-2,-1,3.05),(0,1,0),200,(.78,.83,.95),5);area('Lounge walnut soft bounce',(1,5.2,2.9),(1.6,7.4,.7),190,(1,.69,.44),4);area('Rug soft fill',(1,-2,2.8),(0,0,0),90,(.92,.9,.86),4)

# Subtle photographic halation; never a mapped background.
for key,s in S.items():
 g=bpy.data.node_groups.new(key+' / restrained halation','CompositorNodeTree');g.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
 r=g.nodes.new('CompositorNodeRLayers');r.scene=s;gl=g.nodes.new('CompositorNodeGlare');gl.inputs['Type'].default_value='Fog Glow';gl.inputs['Quality'].default_value='Medium';gl.inputs['Threshold'].default_value=2;gl.inputs['Strength'].default_value=.22
 out=g.nodes.new('NodeGroupOutput');g.links.new(r.outputs['Image'],gl.inputs['Image']);g.links.new(gl.outputs['Image'],out.inputs['Image']);s.compositing_node_group=g
# Preserve a useful default camera in every independent scene.
for screen_ui in bpy.data.screens:
 for ar in screen_ui.areas:
  if ar.type=='VIEW_3D':ar.spaces.active.region_3d.view_perspective='CAMERA'
bpy.context.window.scene=S['main']
bpy.context.preferences.filepaths.save_version=0
path=os.path.join(a.output_dir,'trichli-arena.blend');bpy.ops.wm.save_as_mainfile(filepath=path,compress=True)
stats={'revision':3,'blender':bpy.app.version_string,'renderer':'BLENDER_EEVEE','scenes':{k:{'name':s.name,'objects':len(s.objects),'camera':s.camera.name,'reference':s['reference']} for k,s in S.items()},'objects':len(bpy.data.objects),'meshes':len(bpy.data.meshes),'materials':len(bpy.data.materials),'authored_vertices':sum(len(m.vertices) for m in bpy.data.meshes),'scale':'Estimated metric units; no measured dimensions','connected_floorplan':False,'photo_assets':0}
with open(os.path.join(a.output_dir,'scene-stats.json'),'w') as f:json.dump(stats,f,indent=2)
for key in (S if a.render=='all' else [] if a.render=='none' else [a.render]):
 s=S[key];bpy.context.window.scene=s;s.render.filepath=os.path.join(a.output_dir,'renders',key+'.png');bpy.ops.render.render(write_still=True)
print('TRISCHLI_V3_COMPLETE',json.dumps(stats))
