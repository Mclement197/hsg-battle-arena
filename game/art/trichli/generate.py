"""Original Trischli-inspired game environment. Blender 5.0+, no dependencies.
Run: blender -b -t 3 --python generate.py -- --output-dir PATH [--draft] [--render all|hero|detail|overhead|none]
All geometry/materials are authored here; venue photos are reference-only, not inputs.
"""
import bpy, math, random, argparse, sys, os, json
from mathutils import Vector
random.seed(15)
p=argparse.ArgumentParser()
p.add_argument('--output-dir',default=os.path.dirname(os.path.abspath(__file__)))
p.add_argument('--draft',action='store_true')
p.add_argument('--render',default='all',choices=['all','hero','detail','overhead','none'])
a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
os.makedirs(a.output_dir,exist_ok=True); os.makedirs(os.path.join(a.output_dir,'renders'),exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name!='Collection': bpy.data.collections.remove(c)
root=bpy.context.scene.collection
if bpy.data.collections.get('Collection'): bpy.data.collections.remove(bpy.data.collections['Collection'])
C={n:bpy.data.collections.new(n) for n in ['Architecture','Props','Lighting','Cameras','Gameplay','Collision']}
for c in C.values(): root.children.link(c)
ceiling=bpy.data.collections.new('Ceiling • cutaway toggle'); C['Architecture'].children.link(ceiling)

def link(o,col='Props'):
    for c in list(o.users_collection): c.objects.unlink(o)
    (C[col] if isinstance(col,str) else col).objects.link(o)
    return o

def mat(n,color,rough=.5,metal=0,emission=0):
    m=bpy.data.materials.new(n); m.diffuse_color=(*color,1); m.use_nodes=True
    s=m.node_tree.nodes.get('Principled BSDF'); s.inputs['Base Color'].default_value=(*color,1)
    s.inputs['Roughness'].default_value=rough; s.inputs['Metallic'].default_value=metal
    if emission: s.inputs['Emission Color'].default_value=(*color,1); s.inputs['Emission Strength'].default_value=emission
    return m
black=mat('Charcoal / powder-coated steel',(.014,.019,.022),.36,.5)
wall=mat('Graphite plaster',(.033,.038,.042),.8)
leather=mat('Black leather / fine grain',(.018,.024,.029),.37)
gold=mat('Brushed champagne brass',(.53,.29,.085),.26,.8)
stone=mat('Smoked stone counter',(.055,.06,.065),.23,.2)
white=mat('Warm-white linear LED',(.85,.91,1),.2,0,4)
amber=mat('2700K amber LED',(1,.42,.09),.25,0,4)
cream=mat('Ivory woven rug',(.55,.51,.42),.9)
ink=mat('Rug charcoal weave',(.055,.065,.07),.9)
blue=mat('Equipment screen',(.08,.36,.5),.25,0,1.2)
label=mat('Bottle paper',(.64,.55,.35),.7)
# Wood shaders use generated coordinates; no bitmap, external data or pack step.
def wood(n,c1,c2):
    m=mat(n,c1,.36); ns=m.node_tree.nodes; ls=m.node_tree.links
    tex=ns.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=4; tex.inputs['Detail'].default_value=2
    co=ns.new('ShaderNodeTexCoord'); scale=ns.new('ShaderNodeVectorMath'); scale.operation='MULTIPLY'; scale.inputs[1].default_value=(5,1,16)
    ls.new(co.outputs['Generated'],scale.inputs[0]); ls.new(scale.outputs[0],tex.inputs['Vector'])
    ramp=ns.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position=.2; ramp.color_ramp.elements[0].color=(*c1,1); ramp.color_ramp.elements[1].position=.8; ramp.color_ramp.elements[1].color=(*c2,1)
    ls.new(tex.outputs['Fac'],ramp.inputs[0]); ls.new(ramp.outputs[0],ns.get('Principled BSDF').inputs['Base Color'])
    bump=ns.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.12; bump.inputs['Distance'].default_value=.025
    ls.new(tex.outputs['Fac'],bump.inputs['Height']); ls.new(bump.outputs[0],ns.get('Principled BSDF').inputs['Normal']); return m
walnut=wood('Honey walnut / long grain',(.13,.054,.018),(.42,.23,.085))
floors=[wood('Smoked oak plank %02d'%i,(.045+i*.006,.025+i*.003,.016+i*.002),(.14+i*.012,.076+i*.006,.037+i*.003)) for i in range(5)]
# Subtle leather pore bump.
ns=leather.node_tree.nodes; noise=ns.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=180
bump=ns.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.18; bump.inputs['Distance'].default_value=.012
leather.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']); leather.node_tree.links.new(bump.outputs[0],ns.get('Principled BSDF').inputs['Normal'])

def cube(n,loc,dim,m=black,bev=.025,col='Props'):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=n; o.dimensions=dim
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if m:o.data.materials.append(m)
    if bev:
        b=o.modifiers.new('Soft manufactured edges','BEVEL'); b.width=bev; b.segments=2
        o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return link(o,col)
def cyl(n,loc,r,depth,m=black,vertices=32,col='Props'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc); o=bpy.context.object; o.name=n; o.data.materials.append(m)
    b=o.modifiers.new('Edge radius','BEVEL'); b.width=.008;b.segments=2;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return link(o,col)
def rod(n,v1,v2,r,m=black,col='Props'):
    d=Vector(v2)-Vector(v1);o=cyl(n,(Vector(v1)+Vector(v2))/2,r,d.length,m,16,col);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
def mesh(n,verts,faces,m,col='Props'):
    me=bpy.data.meshes.new(n);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(n,me);(C[col] if isinstance(col,str) else col).objects.link(o);o.data.materials.append(m);return o
def text(n,body,loc,size,m=gold,rot=(math.pi/2,0,0),align='CENTER'):
    cu=bpy.data.curves.new(n,'FONT');cu.body=body;cu.size=size;cu.align_x=align;cu.extrude=.0015;cu.bevel_depth=.0006
    o=bpy.data.objects.new(n,cu);C['Props'].objects.link(o);o.location=loc;o.rotation_euler=rot;o.data.materials.append(m);return o
def area(n,loc,target,power,color,size=3):
    d=bpy.data.lights.new(n,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(n,d);C['Lighting'].objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o

def point(n,loc,power,color,r=.2):
    d=bpy.data.lights.new(n,'POINT');d.energy=power;d.color=color;d.shadow_soft_size=r;o=bpy.data.objects.new(n,d);C['Lighting'].objects.link(o);o.location=loc;return o
# Meter-scaled 16 x 20 room. Back = +Y. Open front is the presentation cutaway.
cube('Foundation / 16m × 20m',(0,0,-.17),(16.4,20.4,.3),wall,.05,'Architecture')
for ix in range(40):
    x=-7.8+ix*.4
    for j in range(-1,7):
        y=-10+j*3+(1.5 if ix%2 else 0);y0=max(y,-10);y1=min(y+2.99,10)
        if y1>y0:cube('Individual oak floorboard',(x,(y0+y1)/2,.006),(.393,y1-y0,.025),random.choice(floors),.004,'Architecture')
cube('Back wall',(0,10.05,2.4),(16.2,.2,4.8),wall,.02,'Architecture')
cube('West wall',(-8.05,0,2.4),(.2,20,4.8),wall,.02,'Architecture')
cube('East wall',(8.05,0,2.4),(.2,20,4.8),wall,.02,'Architecture')
for x in [-7.9,7.9]:
    cube('Continuous walnut dado',(x,0,.64),(.09,20,1.25),walnut,.015,'Architecture')
    cube('Brass dado cap',(x,0,1.29),(.12,20,.035),gold,.008,'Architecture')
# Structural columns frame peripheral circulation, not central fighting zone.
for x in [-5.8,5.8]:
    for y in [-6,1.5,8.8]:
        cube('Steel structural pier',(x,y,2.23),(.22,.22,4.46),black,.02,'Architecture')
        cube('Pier brass collar',(x,y,.14),(.25,.25,.26),gold,.01,'Architecture')
# DJ: raised end stage, walnut front, three luminous chevrons as documented.
cube('DJ dais',(0,8.5,.18),(8,3,.34),black,.04,'Architecture')
cube('DJ counter',(0,8.2,1.17),(5.4,1.05,.16),stone,.04)
cube('DJ booth core',(0,8.22,.71),(5.2,.82,.82),black,.025)
for i in range(53):cube('DJ walnut fluting',(-2.55+i*.098,7.79,.73),(.06,.055,.78),walnut,.012)
cube('DJ amber reveal',(0,7.735,.36),(5.1,.025,.022),amber,.005)
cube('Chevron backdrop / black panel',(0,9.88,2.75),(7.5,.08,2.45),black,.02)
for xx in [-2.05,0,2.05]:
    v=[(xx-.68,9.81,3.55),(xx+.04,9.81,3.55),(xx+.86,9.81,2.76),(xx+.04,9.81,1.97),(xx-.68,9.81,1.97),(xx+.14,9.81,2.76)]
    mesh('White chevron / reference motif',v,[(0,1,2,3,4,5)],white)
text('DJ venue wordmark','T R I S C H L I',(0,7.726,.75),.18,gold)
# Decks, illuminated ring jog wheels, displays, knobs and central four-channel mixer.
for dx in [-1.02,1.02]:
    cube('Media player chassis',(dx,8.17,1.315),(.81,.72,.15),black,.035)
    cyl('Jog wheel machined rim',(dx,8.01,1.405),.247,.035,gold,64)
    cyl('Jog wheel black platter',(dx,8.01,1.429),.218,.02,black,64)
    cyl('Jog wheel LED centre',(dx,8.01,1.443),.061,.012,white,48)
    cube('Player LCD',(dx,8.39,1.405),(.42,.18,.018),blue,.01)
    for z in range(4):
        cyl('Deck transport control',(dx-.31+z*.095,7.87,1.407),.022,.018,white if z==0 else gold,16)
    cube('Pitch slider rail',(dx+.32,8.13,1.41),(.016,.27,.012),gold,.003)
    cube('Pitch slider cap',(dx+.32,8.15,1.427),(.065,.035,.022),black,.004)
cube('Four-channel mixer',(0,8.17,1.32),(.82,.73,.17),black,.025)
for x in [-.27,-.09,.09,.27]:
    for y in [8.1,8.24,8.38]:cyl('Mixer EQ rotary',(x,y,1.43),.027,.044,gold,16)
    cube('Channel fader track',(x,7.97,1.415),(.01,.16,.012),gold,.002)
    cube('Channel fader',(x,7.97+random.uniform(-.05,.05),1.44),(.07,.025,.025),white,.004)
rod('Headphone cable',(.42,8.4,1.45),(.65,8.65,1.3),.012)
# Speakers have inset cones and protective grille bars.
for x in [-3.15,3.15]:
    cube('PA cabinet',(x,8.35,1.72),(.65,.63,1.08),black,.065)
    for z,r in [(1.52,.2),(1.94,.12)]:
        o=cyl('PA driver',(x,8.022,z),r,.025,stone,32);o.rotation_euler[0]=math.pi/2
        for xx in range(-3,4):rod('Cabinet grille',(x+xx*.065,7.997,z-.18),(x+xx*.065,7.997,z+.18),.006,black)
# East bar: counter runs along Y; bartending aisle remains behind it.
cube('Back bar mirror',(7.9,3.7,2.3),(.035,8,2.3),mat('Smoked mirror',(.18,.2,.21),.08,.92),.005)
cube('Bar core',(6.15,3.45,.59),(1.08,8.2,1.16),black,.035)
cube('Monolithic stone bartop',(6.14,3.45,1.21),(1.45,8.5,.15),stone,.04)
for j in range(82):cube('Bar vertical walnut slat',(5.59,-.55+j*.099,.63),(.065,.065,1.05),walnut,.012)
rod('Bar brass footrest',(5.29,-.4,.21),(5.29,7.3,.21),.035,gold)
for y in [-.3,2,4.3,7.1]:rod('Footrest bracket',(5.29,y,.21),(5.59,y,.21),.025,gold)
cube('Bar amber toe light',(5.54,3.45,.11),(.025,8.02,.024),amber,.003)
for z in [1.55,2.23,2.91]:
    cube('Floating back-bar shelf',(7.58,3.55,z),(.69,7.6,.065),walnut,.015)
    cube('Shelf warm LED',(7.22,3.55,z-.032),(.018,7.55,.02),amber,.002)
bottle_m=[mat('Bottle '+n,c,.23,.2) for n,c in [('amber',(.22,.065,.012)),('green',(.028,.12,.065)),('clear',(.26,.31,.28))]]
for z in [1.59,2.27,2.95]:
    for j in range(25):
        y=-.05+j*.295;x=7.55;h=random.uniform(.26,.38);m=random.choice(bottle_m)
        cyl('Bottle body',(x,y,z+h*.35),.061,h*.7,m,16);cyl('Bottle shoulder',(x,y,z+h*.72),.044,h*.16,m,16);cyl('Bottle neck',(x,y,z+h*.91),.025,h*.25,m,16)
        cyl('Bottle label',(x,y,z+h*.34),.062,h*.26,label,16);cyl('Bottle cap',(x,y,z+h*1.05),.027,.025,gold,16)
# Tap fittings, bar mats, stacked glasses.
for y in [1.2,4.9]:
    rod('Beer tap riser',(6.05,y,1.3),(6.05,y,1.76),.045,gold)
    rod('Beer tap spout',(6.05,y,1.72),(5.88,y,1.72),.032,gold)
    cube('Rubber drip tray',(5.95,y,1.3),(.5,.55,.025),black,.01)
for y in [0,2.8,6.8]:
    for k in range(3):cyl('Lowball glass',(6.05,y+k*.14,1.36),.045,.13,stone,24)
# Black upholstered lounges on inferred .36m western terrace, open walk-through gaps.
cube('Lounge terrace / inferred arrangement',(-5.75,.1,.18),(4.4,15.6,.35),walnut,.04,'Architecture')
for y in [-5.8,.1,5.9]:
    for k in range(2):
        cube('Lounge access step',(-3.42+k*.22,y,.09+(1-k)*.09),(.43,1.75,.18+(1-k)*.18),walnut,.02,'Architecture')
        cube('Amber stair nosing',(-3.21+k*.22,y,.19+(1-k)*.18),(.018,1.65,.016),amber,.003)
# Rug chevrons are original modeled fabric motif; not a photo.
for cy in [-3.1,3.15]:
    cube('Lounge ivory rug',(-5.72,cy,.366),(4.05,4.95,.014),cream,.002)
    for k in range(17):
        yy=cy-2.35+k*.29
        pts=[(-7.65,yy,.377),(-6.7,yy+.23,.377),(-5.75,yy,.377),(-4.8,yy+.23,.377),(-3.85,yy,.377)]
        for j in range(4):
            q=pts[j];r=pts[j+1]
            mesh('Woven rug zigzag',[(q[0],q[1],q[2]),(r[0],r[1],r[2]),(r[0],r[1]+.075,r[2]),(q[0],q[1]+.075,q[2])],[(0,1,2,3)],ink)

def sofa(n,x,y,length=2.65,angle=0):
    # Local Y back; rotate all elements around local center.
    parts=[]
    def b(name,loc,d,m,bev=.03):parts.append(cube(n+' / '+name,(x+loc[0],y+loc[1],loc[2]),d,m,bev))
    b('walnut plinth',(0,0,.49),(length,.94,.23),walnut)
    b('shadow foot',(0,0,.385),(length-.25,.73,.08),black)
    for j in range(3):
        xx=-length/3+j*length/3
        b('seat cushion',(xx,-.07,.73),(length/3-.018,.78,.26),leather,.065)
        b('back cushion',(xx,.34,1.06),(length/3-.016,.19,.67),leather,.055)
        b('fine piping',(xx,-.443,.78),(length/3-.045,.009,.008),black,.002)
    for sign in [-1,1]:b('arm',(sign*(length/2-.065),0,.89),(.13,.94,.48),leather,.05)
    for o in parts:
        v=Vector((o.location.x-x,o.location.y-y,0));v.rotate(__import__('mathutils').Euler((0,0,angle)));o.location.x=x+v.x;o.location.y=y+v.y;o.rotation_euler.z=angle
for y in [-3.1,3.15]:
    sofa('Lounge sofa',-6.15,y+1.25,3.1,0)
    sofa('Lounge sofa',-6.15,y-1.25,3.1,math.pi)
    # two small tables rather than overscaled center obstacle.
    for x in [-6.95,-5.2]:
        cube('Coffee table smoked top',(x,y,.87),(1.28,.68,.055),stone,.025)
        cube('Coffee table brass edge',(x,y,.835),(1.31,.71,.025),gold,.012)
        for dx in [-.53,.53]:
            for dy in [-.24,.24]:rod('Slender table leg',(x+dx,y+dy,.39),(x+dx,y+dy,.82),.017,black)
        cyl('Votive holder',(x-.28,y,.94),.065,.09,gold,24);cyl('Votive glow',(x-.28,y,.99),.04,.015,amber,24)
        cube('Drinks menu',(x+.3,y,1.03),(.19,.035,.28),black,.005)
# Low glass screens; deliberately not full-height barriers.
glass=mat('Lounge glass / subtle transparent',(.24,.3,.31),.13,.2)
bs=glass.node_tree.nodes.get('Principled BSDF');bs.inputs['Transmission Weight'].default_value=1;bs.inputs['IOR'].default_value=1.03
# Alpha surface is a deliberate Eevee architectural-glass approximation.
bs.inputs['Base Color'].default_value=(.3,.42,.45,1);bs.inputs['Roughness'].default_value=.08
bs.inputs['Transmission Weight'].default_value=0;bs.inputs['Alpha'].default_value=.16;glass.diffuse_color=(.3,.42,.45,.16)
glass.surface_render_method='DITHERED'
for y0,y1 in [(-7.2,-6.8),(-4.8,-.9),(1,4.9),(6.8,7.7)]:
    for y in [y0,y1]:rod('Screen brass post',(-3.6,y,.37),(-3.6,y,1.41),.022,gold)
    rod('Screen brass cap',(-3.6,y0,1.41),(-3.6,y1,1.41),.019,gold)
    cube('Glass lounge screen',(-3.6,(y0+y1)/2,.96),(.016,y1-y0,1),glass,.002)
# Foreground social tables and small copper lamps preserve central arena emptiness.
for x,y in [(-5.7,-8.8),(6.4,-4.4),(6.4,-7.5)]:
    cyl('Hexagonal cocktail tabletop',(x,y,1.11),.67,.065,stone,6)
    cyl('Cocktail pedestal',(x,y,.56),.055,1.06,black)
    cyl('Cocktail base',(x,y,.04),.32,.06,black)
    cyl('Table lamp foot',(x,y,1.17),.11,.035,gold)
    rod('Table lamp stem',(x,y,1.17),(x,y,1.48),.018,gold)
    cyl('Table lamp shade',(x,y,1.49),.14,.09,gold)
    cyl('Table lamp diffuser',(x,y,1.446),.12,.009,amber)
    point('Table lamp warm pool',(x,y,1.39),12,(1,.52,.22),.12)
# Rear staff door and discreet wayfinding.
cube('Staff door',(6.15,9.92,1.15),(1.25,.05,2.3),black,.015)
text('Staff door type','PRIVATE',(6.15,9.88,1.65),.095,gold)
rod('Door lever',(6.53,9.84,1),(6.35,9.84,1),.016,gold)
text('Bar typography','B A R',(7.88,3.5,3.62),.33,gold,(math.pi/2,0,-math.pi/2))
# Black exposed technical ceiling + staggered linear grid. Complete but toggleable.
cube('Technical ceiling plane',(0,0,4.77),(16,20,.12),black,.01,ceiling)
for x in [-4.7,0,4.7]:
    rod('Ventilation main duct',(x,-9.8,4.42),(x,9.8,4.42),.19,black,ceiling)
    for y in range(-9,10,2):
        # seam rings around longitudinal ducts
        bpy.ops.mesh.primitive_torus_add(major_radius=.192,minor_radius=.012,major_segments=24,minor_segments=6,location=(x,y,4.42),rotation=(math.pi/2,0,0));o=bpy.context.object;o.name='Duct folded seam';o.data.materials.append(stone);link(o,ceiling)
for y in [-8,-4,0,4,8]:cube('Ceiling service beam',(0,y,4.53),(15.8,.09,.16),black,.01,ceiling)
for ix in range(9):
    x=-6.8+ix*1.7
    for j in range(4):
        y=-7.9+j*4.8+(ix%2)*.55;length=3.6 if ix%3 else 2.8
        cube('Linear luminaire housing',(x,y,4.16),(.074,length,.065),black,.008,ceiling)
        cube('Warm-white linear luminaire',(x,y,4.119),(.027,length-.05,.012),white,.003,ceiling)
        for yy in [y-length*.35,y+length*.35]:rod('Light suspension',(x,yy,4.2),(x,yy,4.65),.007,black,ceiling)
# Golden mirror-ball cluster: mesh of separate beveled quads with real seams.
def disco(x,y,z,r):
    rod('Disco suspension',(x,y,z+r),(x,y,4.67),.009,black,ceiling)
    verts=[];faces=[];rows=20;cols=40
    for i in range(rows):
        t0=math.pi*(i+.07)/rows;t1=math.pi*(i+.93)/rows
        for j in range(cols):
            p0=math.tau*(j+.06)/cols;p1=math.tau*(j+.94)/cols
            base=len(verts)
            for t,ph in [(t0,p0),(t0,p1),(t1,p1),(t1,p0)]:verts.append((x+r*math.sin(t)*math.cos(ph),y+r*math.sin(t)*math.sin(ph),z+r*math.cos(t)))
            faces.append((base,base+1,base+2,base+3))
    mesh('Golden mirrored disco ball',verts,faces,gold,ceiling)
for b in [(-.65,4.8,3.58,.43),(.38,4.9,3.81,.31),(.08,4.1,3.35,.26),(-1.25,4.4,3.9,.24),(1.05,4.5,3.58,.24)]:disco(*b)
# Moving heads and narrow actual spot beams in a restrained haze.
for x,y in [(-2.8,-4),(2.9,-1),(-1.8,3.7),(3.1,6.5),(-6.6,2.5),(5.5,3.3)]:
    cube('Moving-head yoke',(x,y,3.99),(.22,.18,.23),black,.025,ceiling)
    cyl('Moving-head barrel',(x,y,3.8),.12,.25,black,24,ceiling)
    cyl('Moving-head lens',(x,y,3.668),.09,.01,white,24,ceiling)
    d=bpy.data.lights.new('Narrow white atmospheric beam','SPOT');d.energy=700;d.color=(.86,.91,1);d.spot_size=.18;d.spot_blend=.55;d.shadow_soft_size=.06
    o=bpy.data.objects.new(d.name,d);C['Lighting'].objects.link(o);o.location=(x,y,3.65)
# Controlled broad pools separate the warm joinery from the charcoal architecture.
area('Soft frontal architectural key',(1,-6,3.8),(0,2,0),280,(.82,.85,1),6)
area('Bar amber wash',(7,3.5,3.8),(5.3,3.5,.4),500,(1,.48,.17),5)
area('Lounge tungsten wash',(-6,0,3.9),(-5.5,0,.5),420,(1,.58,.28),5)
area('DJ backdrop spill',(0,9.1,3.6),(0,6,1),250,(.83,.9,1),4)
area('Dancefloor softbox',(0,1,4.35),(0,1,0),250,(.91,.85,.7),5)
area('Gold ball glint',(1.7,4,3.8),(-.5,4.5,3.6),160,(1,.58,.22),.7)
# Cheap Eevee volume only; no fake solid light cones.
haze=bpy.data.materials.new('Thin club haze');haze.use_nodes=True;ns=haze.node_tree.nodes;ns.clear();out=ns.new('ShaderNodeOutputMaterial');v=ns.new('ShaderNodeVolumePrincipled');v.inputs['Density'].default_value=.009;v.inputs['Color'].default_value=(.55,.59,.64,1);v.inputs['Anisotropy'].default_value=.3;haze.node_tree.links.new(v.outputs['Volume'],out.inputs['Volume'])
cube('Atmosphere',(0,0,2.2),(15.9,19.9,4.4),haze,0,'Lighting')
# Hidden gameplay helpers. No floor paint or ring graphics.
for n,loc in [('Spawn_A',(-1.7,-1.8,.04)),('Spawn_B',(1.7,1.8,.04)),('Arena_centre',(0,0,.04))]:
    o=bpy.data.objects.new(n,None);C['Gameplay'].objects.link(o);o.location=loc;o.empty_display_type='CIRCLE';o.empty_display_size=.4;o['inferred']='Game-adaptation helper, not surveyed venue geometry'
zone=cube('Playable envelope / 7 × 10 m',(0,-.3,1),(6.8,10,2),None,0,'Gameplay');zone.display_type='WIRE';zone.hide_render=True;zone.hide_set(True)
for n,loc,dim in [('floor',(0,0,-.18),(16,20,.3)),('back',(0,10.05,2),(16,.2,4)),('west',(-8.05,0,2),(.2,20,4)),('east',(8.05,0,2),(.2,20,4)),('bar',(6.15,3.45,.6),(1.5,8.5,1.2)),('dais',(0,8.5,.18),(8,3,.36)),('lounge',(-5.75,.1,.18),(4.4,15.6,.36))]:
    o=cube('COL_'+n,loc,dim,None,0,'Collision');o.display_type='WIRE';o.hide_render=True;o.hide_set(True)
C['Collision'].hide_render=True
# Cameras: interior hero, equipment/bar diagonal, explanatory cutaway.
def camera(n,loc,target,lens):
    d=bpy.data.cameras.new(n);o=bpy.data.objects.new(n,d);C['Cameras'].objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.clip_end=150;return o
cams={
'hero':camera('HERO / entrance toward DJ + bar',(0,-10.8,2.6),(.1,4,1.6),23),
'detail':camera('DETAIL / deck, joinery and bar',(-3.65,3.7,2.75),(.7,8.5,1.8),25),
'overhead':camera('CUTAWAY / inferred game layout',(19,-24,26),(0,0,0),42)}
s=bpy.context.scene;s.unit_settings.system='METRIC';s.unit_settings.length_unit='METERS';s.render.engine='BLENDER_EEVEE'
s.render.threads_mode='FIXED';s.render.threads=3
s.eevee.taa_render_samples=24 if a.draft else 96
s.eevee.shadow_pool_size='1024'
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=60
s.render.resolution_percentage=50 if a.draft else 100
s.world.color=(.065,.065,.065);s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.1,.13,.18,1);s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.22
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=.05
# Subtle optical halation (not a neon bloom wash).
g=bpy.data.node_groups.new('Restrained lens halation','CompositorNodeTree');g.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
r=g.nodes.new('CompositorNodeRLayers');gl=g.nodes.new('CompositorNodeGlare');gl.inputs['Type'].default_value='Fog Glow';gl.inputs['Quality'].default_value='Medium';gl.inputs['Threshold'].default_value=1.8;gl.inputs['Strength'].default_value=.35
out=g.nodes.new('NodeGroupOutput');g.links.new(r.outputs['Image'],gl.inputs['Image']);g.links.new(gl.outputs['Image'],out.inputs['Image']);s.compositing_node_group=g
s.camera=cams['hero'];s.render.resolution_x=1920;s.render.resolution_y=1080
s['venue']='Trischli Club, Brühlgasse 15, St. Gallen';s['design_status']='Venue-inspired game adaptation. Dimensions, adjacency and raised lounge placement inferred; not a surveyed reconstruction.'
s['reference_policy']='Seven official images studied privately. No photos/textures embedded or redistributed.'
s['cutaway_usage']='Ceiling collection is independently toggleable. Overhead render temporarily hides ceiling and atmosphere.'
# Start in a useful camera view in desktop Blender.
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D': ar.spaces.active.region_3d.view_perspective='CAMERA'
blend=os.path.join(a.output_dir,'trichli-arena.blend');bpy.ops.wm.save_as_mainfile(filepath=blend,compress=True)
statistics={'objects':len(bpy.data.objects),'mesh_objects':sum(o.type=='MESH' for o in bpy.data.objects),'materials':sum(m.users>0 for m in bpy.data.materials),'mesh_vertices':sum(len(m.vertices) for m in bpy.data.meshes),'mesh_polygons':sum(len(m.polygons) for m in bpy.data.meshes),'collections':[c.name for c in bpy.data.collections],'reference_count':7,'dimensions_m':[16.4,20.4,5.15],'blender':bpy.app.version_string,'renderer':s.render.engine}
with open(os.path.join(a.output_dir,'scene-stats.json'),'w') as f:json.dump(statistics,f,indent=2)
for key in (list(cams) if a.render=='all' else [] if a.render=='none' else [a.render]):
    s.camera=cams[key];s.render.resolution_x=1920;s.render.resolution_y=1440 if key=='overhead' else 1080
    ceiling.hide_render=(key=='overhead');bpy.data.objects['Atmosphere'].hide_render=(key=='overhead')
    # Camera-facing east wall is sectioned away only in the explanatory cutaway.
    bpy.data.objects['East wall'].hide_render=(key=='overhead')
    if key=='overhead':
        s.view_settings.exposure=.65
        # Section away the back-bar mirror/shelves to reveal the working counter.
        for o in bpy.data.objects:
            if o.location.x>7.15 and (o.type=='MESH' or o.name=='Bar typography'):o.hide_render=True
        area('Cutaway presentation fill',(4,-7,13),(0,0,0),1700,(.77,.83,1),10)
        for o in bpy.data.objects:
            if o.name.startswith('Continuous walnut dado') or o.name.startswith('Brass dado cap'):
                o.hide_render=o.location.x>0
    else:s.view_settings.exposure=.05
    s.render.filepath=os.path.join(a.output_dir,'renders',key+'.png');bpy.ops.render.render(write_still=True)
print('TRISCHLI_COMPLETE',json.dumps(statistics))
