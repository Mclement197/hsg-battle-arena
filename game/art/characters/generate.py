"""Original HSG human cast. Blender 5 native bpy only; static editable geometry, not rigs.
blender -b -t 3 --python-exit-code 1 --python generate.py -- [--draft] [--render none|all]
"""
import bpy, math, random, argparse, os, sys, json
from mathutils import Vector
random.seed(171026)
p=argparse.ArgumentParser();p.add_argument('--output-dir',default=os.path.dirname(os.path.abspath(__file__)));p.add_argument('--draft',action='store_true');p.add_argument('--render',choices=['none','all'],default='all');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=os.path.abspath(a.output_dir);os.makedirs(OUT+'/renders',exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
M={}
def mat(n,c,rough=.65,metal=0):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*c,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal;M[n]=m;return m
skin=mat('warm terracotta skin',(.61,.34,.22));lskin=mat('Luca warm light skin',(.73,.49,.34));skin2=mat('warm deep skin',(.27,.125,.07));skin3=mat('soft peach skin',(.78,.53,.39));rose=mat('cheek warmth',(.61,.25,.19));dark=mat('ink charcoal',(.025,.032,.044));hair=mat('espresso hair',(.055,.033,.022));lhair=mat('Luca dark brown hair',(.065,.048,.035));auburn=mat('copper hair',(.25,.075,.026));white=mat('warm ivory',(.89,.855,.75));paper=mat('warm note paper',(.95,.93,.85));gold=mat('satin academic gold',(.73,.46,.12),.35,.65);green=mat('HSG forest green',(.018,.115,.055));denim=mat('midnight denim',(.048,.105,.15));purple=mat('club plum satin',(.19,.045,.19),.4);red=mat('red marking ink',(.72,.035,.035));teal=mat('faded teal',(.11,.31,.31));mustard=mat('shirt mustard',(.64,.40,.10));pink=mat('shirt geometric coral',(.8,.25,.23));blue=mat('annotation blue',(.08,.31,.57));tweed=mat('brown tweed',(.20,.13,.085));sole=mat('rubber soles',(.13,.15,.16));iris=mat('hazel irises',(.21,.14,.055));irisblue=mat('blue grey iris',(.13,.27,.30));eye=mat('eye whites',(.95,.94,.88));stage=mat('studio warm grey',(.30,.34,.36));silver=mat('brushed silver',(.55,.61,.63),.35,.6)
# Small procedural fibers on clothing, no downloaded textures.
for m in [green,tweed,denim,teal,mustard,white]:
 ns=m.node_tree.nodes;ls=m.node_tree.links;n=ns.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=135;b=ns.new('ShaderNodeBump');b.inputs['Strength'].default_value=.13;b.inputs['Distance'].default_value=.012;ls.new(n.outputs['Fac'],b.inputs['Height']);ls.new(b.outputs['Normal'],ns.get('Principled BSDF').inputs['Normal'])
serif=bpy.data.fonts.load('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf');sans=bpy.data.fonts.load('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
C=None;ROOT=None;PART=''
def collection(n,parent):
 c=bpy.data.collections.new(n);parent.children.link(c);return c
def put(o,n,m=None):
 o.name=PART+n
 for c in list(o.users_collection):c.objects.unlink(o)
 C.objects.link(o)
 if ROOT:o.parent=ROOT
 if m:o.data.materials.append(m)
 return o
def ell(n,p,s,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,radius=1,location=p);o=put(bpy.context.object,n,m);o.scale=s
 for f in o.data.polygons:f.use_smooth=True
 return o
def box(n,p,d,m,b=.035):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=put(bpy.context.object,n,m);o.dimensions=d;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if b:mod=o.modifiers.new('soft tailored edges','BEVEL');mod.width=b;mod.segments=3;o.modifiers.new('weighted corner normals','WEIGHTED_NORMAL')
 return o
def mesh(n,v,f,m):
 me=bpy.data.meshes.new(n);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(PART+n,me);C.objects.link(o);o.parent=ROOT;me.materials.append(m)
 for ff in me.polygons:ff.use_smooth=True
 return o
def line(n,pts,r,m,closed=False):
 cu=bpy.data.curves.new(n,'CURVE');cu.dimensions='3D';cu.resolution_u=14;cu.bevel_depth=r;cu.bevel_resolution=3;sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
 for b,co in zip(sp.bezier_points,pts):b.co=co;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 sp.use_cyclic_u=closed;o=bpy.data.objects.new(PART+n,cu);C.objects.link(o);o.parent=ROOT;cu.materials.append(m);return o
def segment(n,p,q,r1,r2,m):
 v=Vector(q)-Vector(p);bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=r1,radius2=r2,depth=v.length,location=(Vector(p)+Vector(q))/2);o=put(bpy.context.object,n,m);o.rotation_euler=v.to_track_quat('Z','Y').to_euler();mod=o.modifiers.new('rounded joint transition','BEVEL');mod.width=.04;mod.segments=3
 for f in o.data.polygons:f.use_smooth=True
 return o
def text(n,body,p,size,m,font=None):
 cu=bpy.data.curves.new(n,'FONT');cu.body=body;cu.align_x='CENTER';cu.size=size;cu.extrude=.0015;cu.bevel_depth=.0007;cu.font=font or sans;o=bpy.data.objects.new(PART+n,cu);C.objects.link(o);o.parent=ROOT;o.location=p;o.rotation_euler=(math.pi/2,0,0);cu.materials.append(m);return o
# Tailored ring-profile torso with a flat readable chest, not a capsule.
def torso(n,z0,z1,w0,w1,dep,m):
 verts=[];faces=[];N=32
 for j in range(7):
  t=j/6;z=z0+(z1-z0)*t;w=w0*(1-t)+w1*t;d=dep*(.87+.13*math.sin(t*math.pi))
  for i in range(N):
   ang=2*math.pi*i/N;xx=math.copysign(abs(math.cos(ang))**.65,math.cos(ang))*w;yy=math.copysign(abs(math.sin(ang))**.65,math.sin(ang))*d;verts.append((xx,yy,z))
 for j in range(6):
  for i in range(N):faces.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
 faces.extend([tuple(reversed(range(N))),tuple(range(6*N,7*N))]);return mesh(n,verts,faces,m)
def hand(n,p,sk,gesture='down'):
 x,y,z=p;ell(n+' palm',(x,y,z),(.105,.068,.13),sk)
 for i in range(4):
  xx=x+(i-1.5)*.044;zz=z-.11-(.015 if i in [0,3] else .035)
  segment(n+' finger '+str(i),(xx,y-.015,z-.04),(xx+.008,y-.018,zz-.075),.024,.018,sk);ell(n+' fingertip '+str(i),(xx+.008,y-.018,zz-.075),(.019,.021,.025),sk)
 segment(n+' thumb',(x-.075,y-.015,z+.02),(x-.13,y-.052,z-.05),.035,.025,sk)
def arm(n,shoulder,elbow,wrist,cloth,sk):
 ell(n+' sleeve cap',shoulder,(.20,.20,.21),cloth);segment(n+' upper sleeve',elbow,shoulder,.125,.195,cloth);ell(n+' elbow',elbow,(.13,.13,.14),cloth);segment(n+' fore sleeve',wrist,elbow,.095,.13,cloth);ell(n+' cuff',wrist,(.105,.11,.07),cloth);hand(n+' hand',tuple(Vector(wrist)+Vector((0,-.015,-.13))),sk)
def legs(cloth,shoe=dark,wide=1):
 for s in [-1,1]:
  x=s*.22;hip=(x,0,1.65);knee=(s*.25,-.015,.93);ankle=(s*.27,0,.28)
  segment('trouser thigh',knee,hip,.145*wide,.19*wide,cloth);ell('knee fabric',knee,(.148*wide,.15,.16),cloth);segment('trouser shin',ankle,knee,.105*wide,.145*wide,cloth)
  line('pressed trouser seam',[(x,-.165,1.5),(s*.25,-.167,.95),(s*.27,-.12,.4)],.006,sole)
  box('shoe sole',(s*.27,-.125,.105),(.30,.56,.075),sole,.055);ell('shoe upper',(s*.27,-.125,.21),(.147,.27,.12),shoe)
  for j in range(3):line('shoe lace',[(s*.27-.075,-.23+j*.056,.305),(s*.27+.075,-.23+j*.056,.305)],.008,white)
def face(sk,hm,z=3.18,style='normal',luca=False):
 # Sculpted multi-ring jaw/cheek/head. Front points toward -Y.
 rings=[(-.39,.18,.15),(-.30,.26,.21),(-.10,.315,.255),(.13,.32,.26),(.32,.27,.225),(.41,.17,.15)]
 if luca:rings=[(-.39,.16,.15),(-.30,.235,.21),(-.10,.292,.255),(.13,.30,.26),(.32,.26,.225),(.41,.17,.15)]
 elif style=='severe':rings=[(zz,rx*1.07,ry) for zz,rx,ry in rings]
 elif style=='nervous':rings=[(zz,rx*.95,ry) for zz,rx,ry in rings]
 vv=[];ff=[];N=40
 for dz,rx,ry in rings:
  for i in range(N):
   t=2*math.pi*i/N;vv.append((rx*math.cos(t),ry*math.sin(t),z+dz))
 for j in range(len(rings)-1):
  for i in range(N):ff.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
 ff.extend([tuple(reversed(range(N))),tuple(range((len(rings)-1)*N,len(rings)*N))]);o=mesh('sculpted jaw cheeks forehead',vv,ff,sk);mod=o.modifiers.new('face surface refinement','SUBSURF');mod.levels=2
 for s in [-1,1]:
  ell('ear',(s*.316,.005,z-.04),(.069,.048,.12),sk);ell('inner ear',(s*.341,-.037,z-.04),(.025,.018,.065),rose)
  ex=s*.128;ey=-.236;ez=z+.055
  ell('eye socket',(ex,ey+.006,ez),(.100,.042,.077),sk);ell('almond eye',(ex,ey-.021,ez),(.078,.025,.052),eye);ell('iris',(ex,ey-.045,ez),(.033,.009,.035),iris if luca else irisblue);ell('pupil',(ex,ey-.053,ez),(.016,.005,.022),dark);ell('eye highlight',(ex-.009,ey-.059,ez+.013),(.008,.003,.009),eye)
  if style=='sleepy':line('sleepy upper eyelid',[(ex-.078,-.274,ez+.018),(ex,-.281,ez+.005),(ex+.078,-.274,ez+.018)],.013,sk)
  else:line('upper eyelid',[(ex-.073,-.263,ez+.019),(ex,-.275,ez+.049),(ex+.073,-.263,ez+.02)],.009,hm)
  browz=z+.17;inner=.025 if style=='nervous' else (-.045 if style=='severe' else 0)
  midz=browz-.005 if style=='severe' else browz+.015;outerz=browz+.03 if style=='severe' else browz-.015
  line('expressive eyebrow',[(s*.065,-.252,browz+inner),(s*.13,-.267,midz),(s*.21,-.241,outerz)],.018 if luca else .021,hm)
 # Distinct projecting nose bridge, tip, nostrils.
 ell('nose bridge',(0,-.266,z-.025),(.047,.057,.115 if luca else .09),sk);ell('nose tip',(0,-.319,z-.095),(.066,.067,.044),sk)
 for s in [-1,1]:ell('nose ala',(s*.049,-.299,z-.108),(.033,.032,.026),sk);ell('nostril',(s*.033,-.333,z-.124),(.017,.008,.009),hair)
 mouthz=z-.225
 pts=[(-.115,-.221,mouthz+.017),(0,-.247,mouthz-.003),(.115,-.221,mouthz+.017)]
 if style=='nervous':pts=[(-.09,-.228,mouthz-.012),(0,-.248,mouthz+.014),(.09,-.228,mouthz-.012)]
 if style=='severe':pts=[(-.12,-.221,mouthz-.01),(0,-.247,mouthz+.02),(.12,-.221,mouthz-.01)]
 if style=='sleepy':pts=[(-.105,-.223,mouthz),(.015,-.25,mouthz-.025),(.145,-.217,mouthz+.035)]
 line('mouth expression',pts,.012,hair);line('lower lip',[(-.065,-.235,mouthz-.03),(0,-.243,mouthz-.04),(.065,-.235,mouthz-.03)],.011,rose)
 # Hair cap is an open tailored mesh respecting hairline, no bald sphere.
 v=[];f=[];NN=40;RR=9
 for j in range(RR):
  t=j/(RR-1)
  for i in range(NN):
   ang=2*math.pi*i/NN;front=max(0,-math.sin(ang));theta=(.07+t*(1.67-.86*front));v.append((.326*math.sin(theta)*math.cos(ang),.268*math.sin(theta)*math.sin(ang),z+.035+.421*math.cos(theta)))
 for j in range(RR-1):
  for i in range(NN):f.append((j*NN+i,j*NN+(i+1)%NN,(j+1)*NN+(i+1)%NN,(j+1)*NN+i))
 o=mesh('fitted hair cap',v,f,hm);o.scale=(1.09,1.06,1);o.location.z=-.005
 # Swept sculpted locks give a high textured crown, short sides for Luca.
 for i in range(11):
  xx=-.25+i*.047;zz=z+.34+.07*math.sin((i+1)/12*math.pi)
  if style=='sleepy':zz+=random.uniform(-.04,.035)
  lock=ell('swept crown lock',(xx,-.07,zz),(.064,.17,.105),hm);lock.rotation_euler[1]=-.3
 for s in [-1,1]:ell('short sideburn',(s*.29,-.005,z+.055),(.035,.08,.10),hm)
 if style=='severe':
  for s in [-1,1]:ell('distinguished temple',(s*.296,.006,z+.13),(.019,.065,.085),silver)
 if luca:
  # Shallow stylized stubble on jaw, chin and moustache follows observed portrait.
  stubble=mat('Luca subtle stubble',(.26,.19,.14))
  for row in range(3):
   for i in range(29):
    t=math.pi+(i/28)*math.pi;x=(.232-row*.014)*math.cos(t);yy=(.200-row*.008)*math.sin(t);zz=z-.22-row*.035-.045*(1-abs(x)/.24);ell('jaw stubble',(x,yy-.009,zz),(.009,.006,.012),stubble)
  for s in [-1,1]:ell('trimmed moustache',(s*.049,-.246,z-.186),(.05,.009,.012),stubble)
  ell('chin stubble',(0,-.184,z-.329),(.07,.008,.015),stubble)
def collars(z,m):
 for s in [-1,1]:
  o=box('shirt pointed collar',(s*.12,-.22,z),(.20,.045,.22),m,.012);o.rotation_euler[1]=s*-.45

def book(n,p,color,label='6 / 6',w=.52,h=.58):
 x,y,z=p;box(n+' cover',(x,y,z),(w,.085,h),color,.025);box(n+' pages',(x,y-.052,z),(w*.90,.04,h*.92),paper,.008);text(n+' title',label,(x,y-.08,z+.16),.07,dark)
 for j in range(5):line(n+' neat rule',[(x-w*.35,y-.082,z+.08-j*.06),(x+w*.35,y-.082,z+.08-j*.06)],.0035,blue)
 return (x,y,z)

def wings():
 global C
 # Two layers of individual tapered feather meshes, editable rachis curves.
 for side in [-1,1]:
  line('wing gilded leading edge',[(side*.35,.20,2.60),(side*.85,.23,3.05),(side*1.35,.25,3.43),(side*1.85,.28,3.58)],.07,gold)
  for row in range(2):
   for i in range(12):
    t=i/11;start=Vector((side*(.45+1.25*t),.23-row*.07,2.66+.80*t));tip=Vector((side*(.64+1.55*t),.20-row*.075,1.90+.99*t+row*.25));vec=tip-start;perp=Vector((vec.z,0,-vec.x)).normalized();width=.145 if row==0 else .125
    vs=[]
    for j in range(9):
     u=j/8;mid=start+vec*u+Vector((side*.075*math.sin(math.pi*u),-.03*math.sin(math.pi*u),0));wid=width*(math.sin(math.pi*u)**.65)
     vs.extend([tuple(mid-perp*wid),tuple(mid+Vector((0,-.035,0))),tuple(mid+perp*wid)])
    fs=[]
    for j in range(8):
     for k in range(2):fs.append((j*3+k,j*3+k+1,(j+1)*3+k+1,(j+1)*3+k))
    o=mesh('layered ivory flight feather',vs,fs,white);so=o.modifiers.new('feather thickness','SOLIDIFY');so.thickness=.014;line('gold feather rachis',[tuple(start),tuple((start+tip)/2+Vector((0,-.04,0))),tuple(tip)],.007,gold)

def make_character(slug,title,index):
 global C,ROOT,PART
 scene=bpy.data.scenes.new(title);master=collection('CHARACTER / '+title,scene.collection);C=collection(slug+' / Body and tailoring',master);PART=slug+' | ';ROOT=bpy.data.objects.new(slug+' / TRANSFORM ROOT',None);C.objects.link(ROOT);ROOT['character_id']=slug;ROOT['static_model']=True;ROOT.empty_display_type='PLAIN_AXES'
 sk=[lskin,skin,skin3,skin2,skin3,skin][index];hm=[lhair,hair,auburn,hair,hair,hair][index]
 legs(white if index==0 else (tweed if index==2 else denim if index in [1,3] else dark),gold if index==0 else dark,1.10 if index==2 else 1)
 cloth=[white,teal,mustard,green,purple,tweed][index];base=1.52 if index!=2 else 1.72;torso('tailored torso',base,2.68,.32,.46,.225,cloth)
 segment('neck',(0,0,2.60),(0,0,2.90),.13,.135,sk)
 z=3.18 if index!=5 else 3.24;face(sk,hm,z,'nervous' if index==3 else 'sleepy' if index in [1,4] else 'severe' if index==5 else 'normal',index==0)
 # Each fictional adult gets a distinct hair silhouette, not a recolored Luca clone.
 if index==0:
  for o in list(master.all_objects):
   if 'swept crown lock' in o.name:bpy.data.objects.remove(o,do_unlink=True)
  for j in range(14):
   xx=-.24+j*.037;zz=z+.352+.035*math.sin(j*.8);o=ell('portrait textured upswept hair',(xx,-.075,zz),(.051,.135,.11),hm);o.rotation_euler[1]=-.14+.13*math.sin(j)
 elif index==2:
  for j in range(4):
   o=ell('awkward side parted fringe',(-.17+j*.095,-.22,z+.30+j*.017),(.11,.075,.06),hm);o.rotation_euler[1]=-.28
 elif index==3:
  for j in range(11):
   xx=-.23+j*.046;ell('short curly fringe',(xx,-.205,z+.30+random.uniform(-.025,.025)),(.057,.055,.047),hm)
 elif index==4:
  for j in range(5):
   o=ell('loose club fringe',(-.16+j*.064,-.215,z+.275+j*.012),(.065,.065,.105),hm);o.rotation_euler[1]=-.45
 if index in [0,2,5]:collars(2.62,cloth)
 if index==0:
  arm('left',(-.44,0,2.53),(-.65,-.03,2.16),(-.81,-.16,2.36),white,sk);arm('right',(.44,0,2.53),(.64,-.04,2.18),(.81,-.15,2.36),white,sk)
  # Sleeveless gold-bordered academic stole and geometric belt.
  for s in [-1,1]:
   box('academic stole',(s*.24,-.242,2.16),(.13,.035,.96),gold,.015);box('ivory stole inset',(s*.24,-.265,2.18),(.065,.012,.85),white,.01)
  box('gold waist belt',(0,-.01,1.65),(.73,.47,.095),gold,.022);box('scholar belt clasp',(0,-.27,1.65),(.18,.06,.16),gold,.024);text('academic insignia','AI',(0,-.284,2.29),.13,gold,serif)
  C=collection(slug+' / Layered wings',master);wings();C=collection(slug+' / Halo',master)
  pts=[(.37*math.cos(i*math.tau/64),.07+.15*math.sin(i*math.tau/64),3.89) for i in range(64)];line('halo',pts,.026,gold,True)
 elif index==1:
  # Lowered shoulders, bent elbows, phone in his visual focus, empty sagging bag.
  arm('left',(-.43,.02,2.48),(-.60,-.03,2.02),(-.49,-.32,1.75),teal,sk);arm('right',(.43,.02,2.47),(.56,-.06,2.10),(.29,-.46,2.25),teal,sk)
  box('phone charcoal case',(.28,-.50,2.26),(.19,.075,.32),dark,.024);box('phone blue screen',(.28,-.544,2.26),(.15,.012,.26),blue,.01)
  for j in range(3):box('phone distraction notification',(.28,-.555,2.33-j*.06),(.11,.008,.025),white,.003)
  line('loose shoulder strap',[(-.40,.04,2.52),(-.59,-.10,2.14),(-.57,-.05,1.32)],.027,dark);box('almost empty collapsed satchel',(-.54,.09,1.20),(.30,.16,.43),teal,.06);line('open empty bag rim',[(-.68,-.01,1.40),(-.54,-.07,1.37),(-.40,-.01,1.40)],.021,dark)
  # Actual folded irregular scrap geometry, no flat cube masquerading as crumpled paper.
  for j in range(3):
   cx=-.68+j*.13;cz=.20+j*.035;vv=[(cx+dx,-.37+dy,cz+random.uniform(-.025,.035)) for dx,dy in [(-.08,-.05),(0,-.07),(.08,-.04),(.09,.04),(0,.06),(-.07,.04),(0,0)]];o=mesh('folded crumpled paper',vv,[(i,(i+1)%6,6) for i in range(6)],paper);o.modifiers.new('thin paper','SOLIDIFY').thickness=.003
  for j in range(3):
   o=box('crumpled group project note',(-.70+j*.15,-.32,.16+j*.035),(.17,.12,.035),paper,.025);o.rotation_euler=(.1*j,.2*j,.5*j)
  text('unfinished group notes','TODO',(-.55,-.48,.27),.075,dark)
  # Head + upper torso slouch in a unified transform, maintain joins.
  ROOT.rotation_euler[1]=-.065;ROOT.rotation_euler[0]=.07
 elif index==2:
  # Loud ugly patterned shirt, visibly tucked above high-waisted tailored trousers.
  for i in range(7):
   for j in range(6):
    x=(i-3)*.105;zz=1.91+j*.105;o=box('shirt coral diamond',(x,-.231,zz),(.052,.018,.052),pink,.006);o.rotation_euler[1]=math.pi/4
  box('high waist waistband',(0,-.005,1.78),(.70,.46,.12),tweed,.02);box('belt buckle',(0,-.251,1.78),(.12,.04,.10),gold,.008)
  for i in range(4):ell('shirt button',(0,-.254,2.01+i*.13),(.018,.008,.018),white)
  arm('left',(-.44,0,2.52),(-.58,-.10,2.14),(-.46,-.42,2.06),mustard,sk);arm('right',(.44,0,2.52),(.63,-.03,2.14),(.55,-.34,2.01),mustard,sk)
  book('perfect notes',(-.43,-.55,2.01),blue,'6 / 6',.48,.60);book('color coded revision',(.53,-.43,1.98),pink,'REVISION',.31,.46)
  C=collection(slug+' / Oversize spectacles',master)
  for s in [-1,1]:
   x=s*.14;line('oversized round glasses',[(x+.115*math.cos(i*math.tau/48),-.300,z+.04+.10*math.sin(i*math.tau/48)) for i in range(48)],.018,dark,True);line('glasses temple',[(s*.25,-.29,z+.06),(s*.34,-.08,z+.08)],.013,dark)
  line('glasses bridge',[(-.025,-.312,z+.05),(0,-.327,z+.07),(.025,-.312,z+.05)],.014,dark)
 elif index==3:
  # Actual reference: green pullover, pouch, ribbed hems, white flat strings, two collegiate lines.
  ell('hood draped behind neck',(0,.105,2.70),(.33,.23,.24),green);line('hood opening',[(-.26,-.15,2.78),(-.19,-.24,2.65),(0,-.255,2.61),(.19,-.24,2.65),(.26,-.15,2.78)],.035,green)
  box('ribbed waistband',(0,0,1.56),(.67,.43,.11),green,.04);box('kangaroo pouch',(0,-.237,1.88),(.51,.045,.26),green,.05)
  for s in [-1,1]:line('pouch angled entry',[(s*.17,-.266,2.01),(s*.24,-.27,1.86)],.009,teal)
  # Actual lettering, arched UNIVERSITÄT / ST. GALLEN / EST. 1898.
  # White outer + forest-green inset approximates observed outlined varsity stitch.
  word='UNIVERSITÄT'
  for i,ch in enumerate(word):
   x=(i-(len(word)-1)/2)*.045;zz=2.42+.045*(1-(x/.25)**2);o=text('arched university embroidery '+str(i),ch,(x,-.251,zz),.071,white,serif);o.rotation_euler[1]=-.30*x
  text('St Gallen embroidery','ST. GALLEN',(0,-.253,2.32),.067,white,serif);text('established embroidery','EST. 1898',(0,-.254,2.25),.035,white,serif)
  for o in list(C.objects):
   if o.type=='FONT' and ('arched university embroidery' in o.name or 'St Gallen embroidery' in o.name):
    o.data.offset=.002;dup=o.copy();dup.data=o.data.copy();C.objects.link(dup);dup.name=o.name+' inset';dup.data.offset=-.001;dup.location.y-=.004;dup.data.materials.clear();dup.data.materials.append(green)
  for s in [-1,1]:
   line('flat white drawcord',[(s*.135,-.24,2.67),(s*.12,-.285,2.53),(s*.13,-.285,2.23)],.014,white);segment('gold drawcord aglet',(s*.13,-.285,2.23),(s*.13,-.285,2.18),.013,.013,gold)
  arm('left',(-.44,0,2.52),(-.55,-.08,2.10),(-.38,-.30,1.87),green,sk);arm('right',(.44,0,2.52),(.55,-.07,2.09),(.38,-.29,1.87),green,sk)
  box('bad luck timetable',(0,-.40,1.71),(.43,.06,.43),paper,.02);text('unlucky exam number','EXAM 13',(0,-.436,1.80),.063,red)
  for j in range(3):line('exam rules',[(-.15,-.437,1.72-j*.055),(.15,-.437,1.72-j*.055)],.004,blue)
  ell('nervous cartoon sweat',(.29,-.17,3.26),(.032,.025,.062),blue)
 elif index==4:
  # Open club shirt, contrasting tee, jewellery, leaning clubgoer pose.
  box('black inner shirt',(0,-.225,2.25),(.31,.025,.72),dark,.025)
  for s in [-1,1]:line('club shirt lapel',[(s*.14,-.24,2.66),(s*.22,-.263,2.41),(s*.17,-.25,1.74)],.021,pink)
  line('silver necklace',[(-.12,-.22,2.62),(0,-.29,2.45),(.12,-.22,2.62)],.011,silver);ell('necklace medallion',(0,-.29,2.43),(.04,.01,.05),gold)
  arm('left',(-.44,0,2.52),(-.67,-.03,2.26),(-.74,-.12,1.99),purple,sk);arm('right',(.44,0,2.52),(.66,-.06,2.20),(.83,-.19,2.36),purple,sk)
  # Empty club cup, not a bottle or realistic intoxication depiction.
  segment('party cup',(.82,-.22,2.35),(.82,-.22,2.60),.065,.092,silver)
  ROOT.rotation_euler[1]=-.14;ROOT.rotation_euler[2]=-.07;ROOT.location.z=-.045
  C=collection(slug+' / Editable dizziness VFX',master)
  pts=[(.52*math.cos(t),.02+.24*math.sin(t),3.85+.065*math.sin(2*t)) for t in [i*math.tau/64 for i in range(64)]];line('cartoon dizziness orbit',pts,.011,gold,True)
  for i in range(5):
   t=i*math.tau/5;x=.54*math.cos(t);y=.24*math.sin(t);zv=3.85+.065*math.sin(2*t);vs=[]
   for j in range(10):
    r=.115 if j%2==0 else .05;tt=j*math.pi/5+math.pi/2;vs.append((x+r*math.cos(tt),y-.03,zv+r*math.sin(tt)))
   o=mesh('dizziness star',vs,[tuple(range(10))],gold);o.modifiers.new('star depth','SOLIDIFY').thickness=.035
   ell('orbit particle',(x*.92,y-.04,zv+.16),(.025,.025,.025),white)
 elif index==5:
  # Strict fictional lecturer: thick rigid tweed jacket, red pen, failing exams.
  for s in [-1,1]:
   o=box('tweed jacket lapel',(s*.15,-.238,2.40),(.14,.045,.49),tweed,.008);o.rotation_euler[1]=s*.3
  box('formal shirt insert',(0,-.239,2.49),(.14,.018,.33),paper,.005);line('severe narrow tie',[(0,-.269,2.62),(0,-.278,2.37),(0,-.27,2.22)],.032,red)
  for zz in [1.85,2.05]:ell('brass jacket button',(.08,-.245,zz),(.026,.012,.026),gold)
  # Tweed weave checked fibers on front, editable geometry accent.
  for i in range(10):line('jacket check warp',[(-.32+i*.07,-.229,1.62),(-.34+i*.075,-.241,2.48)],.0014,gold)
  for j in range(9):line('jacket check weft',[(-.33,-.234,1.69+j*.09),(.33,-.234,1.69+j*.09)],.0014,gold)
  arm('left',(-.44,0,2.52),(-.58,-.02,2.16),(-.48,-.34,2.10),tweed,sk);arm('right',(.44,0,2.52),(.62,-.06,2.23),(.65,-.30,2.44),tweed,sk)
  book('marked examination',(-.45,-.45,2.03),dark,'2 / 6',.48,.62);text('failed exam cross','X',(-.45,-.537,1.97),.16,red)
  segment('red pen',(.64,-.36,2.37),(.64,-.36,2.78),.018,.018,red);segment('pen gold nib',(.64,-.36,2.78),(.64,-.36,2.83),.018,0,gold)
  for s in [-1,1]:line('forehead strict crease',[(s*.08,-.242,z+.235),(s*.04,-.258,z+.21)],.005,rose)
 # Pose fingers around held props; keep the editable parts and visible palms.
 if index in [1,2,3,4,5]:
  hands=[]
  if index==1:hands=[('right',(.28,-.49,2.15),.17)]
  elif index==2:hands=[('left',(-.43,-.59,1.79),.36),('right',(.53,-.48,1.80),.26)]
  elif index==3:hands=[('left',(-.22,-.44,1.72),.17),('right',(.22,-.44,1.72),.17)]
  elif index==4:hands=[('right',(.82,-.22,2.36),.15)]
  elif index==5:hands=[('left',(-.45,-.49,1.83),.35),('right',(.64,-.39,2.44),.10)]
  for side,pp,width in hands:
   for o in list(master.all_objects):
    if (side+' hand') in o.name:bpy.data.objects.remove(o,do_unlink=True)
   oldC=C;C=list(master.children)[0];xx,yy,zz=pp;ell(side+' gripping palm',(xx,yy+.035,zz),(.095,.055,.092),sk)
   for j in range(4):
    fx=xx+(j-1.5)*.039;line(side+' curled finger '+str(j),[(fx,yy+.015,zz+.025),(fx,yy-.045,zz+.015),(fx,yy-.052,zz-.015)],.021,sk)
   ell(side+' visible thumb',(xx-width*.46,yy-.035,zz+.095),(.038,.025,.063),sk)
   wrist=bpy.data.objects.get(PART+side+' cuff')
   if wrist:segment(side+' wrist connection',tuple(wrist.location),pp,.074,.077,sk)
   C=oldC
 # Varied body masses preserve an appealing adult ensemble silhouette.
 if index==2:ROOT.scale=(.94,1,1.015)
 elif index==3:ROOT.scale=(.95,.98,.96)
 elif index==5:ROOT.scale=(1.11,1.04,1.055)
 return scene,master,ROOT

def setup(scene,title,slug):
 global C,ROOT,PART
 ROOT=None;PART='STUDIO | ';C=collection('Studio (not character geometry)',scene.collection)
 box('seamless floor',(0,0,-.07),(200,200,.1),stage,.01)
 # Oval small display plinth helps ground each cast member.
 bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=1,depth=.09,location=(0,0,.0));o=put(bpy.context.object,'display plinth',dark);o.scale=(1.12,.83,1)
 text('character name',title.upper(),(0,-1.12,.12),.11,white)
 world=bpy.data.worlds.new(title+' studio world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.48,.53,.57,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=world
 for name,power,pos,size,col in [('key',650,(-3,-4,6),4,(1,.88,.75)),('fill',420,(4,-2,4.5),3,(.78,.88,1)),('rim',800,(1,3,5.5),3,(1,.94,.79))]:
  d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=col;o=bpy.data.objects.new(name,d);C.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,2))-o.location).to_track_quat('-Z','Y').to_euler()
 d=bpy.data.cameras.new(title+' camera');o=bpy.data.objects.new(title+' camera',d);C.objects.link(o);o.location=(5,-10,5.0);o.rotation_euler=(Vector((0,0,1.98))-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=5.3 if slug=='luca' else 4.65;scene.camera=o
 scene.render.engine='CYCLES';scene.cycles.samples=20 if a.draft else 48;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=3;scene.render.resolution_x=800 if a.draft else 1440;scene.render.resolution_y=900 if a.draft else 1600;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False;scene.view_settings.view_transform='AgX';scene.render.filepath=OUT+'/renders/'+slug+'.png'

ids=['luca','free-rider','tryhard','assessment','trischli-warrior','bad-teacher'];names=['Luca Di Grazia','Free-rider','Tryhard','Assessment','Trischli Warrior','Bad Teacher'];items=[]
for i,(slug,title) in enumerate(zip(ids,names)):
 sc,col,rt=make_character(slug,title,i);setup(sc,title,slug);items.append((sc,col,rt))
# Remove empty startup scene only; logical character collections remain independent.
for ss in list(bpy.data.scenes):
 if ss.name not in names:bpy.data.scenes.remove(ss)
# Wide lineup uses linked character collection instances; individual scenes remain untouched.
lineup=bpy.data.scenes.new('LINEUP / Six original HSG characters');setup(lineup,'HSG BATTLE ARENA','lineup');C=[c for c in lineup.collection.children if c.name.startswith('Studio')][0];ROOT=None;PART='LINEUP | '
for i,(sc,col,rt) in enumerate(items):
 x=[-7.3,-3.6,-.8,2.1,5.0,7.8][i];inst=bpy.data.objects.new('LINEUP instance / '+ids[i],None);C.objects.link(inst);inst.instance_type='COLLECTION';inst.instance_collection=col;inst.location=(x,0,0)
 box('lineup nameplate '+ids[i],(x,-1.0,.15),(2.42,.075,.34),dark,.035)
 text('readable character label '+ids[i],names[i].upper(),(x,-1.045,.105),.18,white)
lineup.camera.location=(0,-24,7);lineup.camera.rotation_euler=(Vector((0,0,1.95))-lineup.camera.location).to_track_quat('-Z','Y').to_euler();lineup.camera.data.ortho_scale=20.5;lineup.render.resolution_x=1800 if a.draft else 3600;lineup.render.resolution_y=600 if a.draft else 1200
# Wide studio lights are scaled to cover full cast.
for o in C.objects:
 if o.type=='LIGHT':o.data.energy*=4;o.data.size*=2.5;o.location.x*=2
# Remove setup's redundant center title and center plinth in lineup only.
for o in list(C.objects):
 if o.name.startswith('STUDIO | character name') or o.name.startswith('STUDIO | display plinth'):bpy.data.objects.remove(o,do_unlink=True)
bpy.context.window.scene=items[0][0]
# Font resources are packed and everything else is original geometry/procedural nodes.
bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/hsg-characters.blend',compress=True)
if a.render=='all':
 for sc,_,_ in items:bpy.context.window.scene=sc;bpy.ops.render.render(write_still=True,scene=sc.name)
 bpy.context.window.scene=lineup;bpy.ops.render.render(write_still=True,scene=lineup.name)
print('CHARACTER BUILD COMPLETE',OUT,flush=True)
