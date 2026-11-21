"""Original refined cast: continuous weighted limb surfaces, native armatures and GLB clips.
Reuse first-pass identity details without modifying its source or deliverables.
blender -b -t 3 --python-exit-code 1 --python game/art/characters/v2/generate.py -- --render none
"""
from pathlib import Path
import sys
BASE=Path(__file__).resolve().parent
sys.path.insert(0,str(BASE/'.tools'/'packages'))
sys.path.insert(0,str(BASE))
from normalize import normalize
source=(BASE.parent/'generate.py').read_text()
source=source[:source.index("ids=['luca'")]
start=source.index(' # Pose fingers around held props;')
end=source.index(' # Varied body masses',start)
source=source[:start]+source[end:]
# Default output belongs to v2, not the archived first pass.
exec(compile(source,str(BASE.parent/'generate.py'),'exec'),globals())
OUT=os.environ.get('HSG_CHARACTER_OUTPUT',str(BASE));os.makedirs(OUT+'/renders',exist_ok=True)
EXPORT=Path(os.environ.get('HSG_CHARACTER_EXPORT',str(BASE.parents[2]/'public'/'assets'/'characters')))
EXPORT.mkdir(parents=True,exist_ok=True)
CURRENT=0;JOINTS={};WEIGHTS={}
oldell=ell
oldbox=box
def box(n,p,d,m,b=.035):
 if n not in ['ribbed waistband','high waist waistband','gold waist belt']:return oldbox(n,p,d,m,b)
 v=[];f=[];N=32
 for j in range(4):
  z=p[2]+d[2]*(j/3-.5);factor=.97 if j in [0,3] else 1
  for k in range(N):
   t=math.tau*k/N;v.append((p[0]+d[0]*.5*factor*math.cos(t),p[1]+d[1]*.5*factor*math.sin(t),z))
 for j in range(3):
  for k in range(N):f.append((j*N+k,j*N+(k+1)%N,(j+1)*N+(k+1)%N,(j+1)*N+k))
 f.extend([tuple(reversed(range(N))),tuple(range(3*N,4*N))]);return mesh(n+' contoured oval tailoring',v,f,m)
# Lower tessellation of decorative forms; silhouettes retain smooth shading.
def ell(n,p,s,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,radius=1,location=p);o=put(bpy.context.object,n,m);o.scale=s
 for f in o.data.polygons:f.use_smooth=True
 return o

def setweights(o, rows):
 for i,ws in enumerate(rows):
  for n,w in ws.items():
   if w>.00001:
    g=o.vertex_groups.get(n) or o.vertex_groups.new(name=n);g.add([i],w,'REPLACE')
 return o

def blended(t,names,positions):
 if t<=positions[0]:return {names[0]:1}
 for i in range(len(positions)-1):
  if t<=positions[i+1]:
   f=(t-positions[i])/(positions[i+1]-positions[i]);f=f*f*(3-2*f)
   return {names[i]:1-f,names[i+1]:f}
 return {names[-1]:1}

def tube(n,points,radii,m,names,centers,flat=1,N=16,times=None):
 # Multi-ring continuous skin: enough loops across each bend for blended weights.
 pts=[Vector(v) for v in points];v=[];f=[];ws=[];previous=None
 for j,(p,r) in enumerate(zip(pts,radii)):
  axis=(pts[min(j+1,len(pts)-1)]-pts[max(0,j-1)]).normalized()
  ref=Vector((0,1,0)) if abs(axis.y)<.9 else Vector((1,0,0))
  # Parallel transport avoids the old reference-axis flip folding a sleeve inside out.
  xx=axis.cross(ref).normalized() if previous is None else (previous-axis*previous.dot(axis)).normalized();yy=axis.cross(xx).normalized();previous=xx
  for i in range(N):
   ang=i*math.tau/N;v.append(tuple(p+xx*(r*math.cos(ang))+yy*(r*flat*math.sin(ang))));ws.append(blended(times[j] if times is not None else j/(len(pts)-1),names,centers))
 for j in range(len(pts)-1):
  for i in range(N):f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
 f.extend([tuple(reversed(range(N))),tuple(range((len(pts)-1)*N,len(pts)*N))])
 return setweights(mesh(n,v,f,m),ws)

def torso(n,z0,z1,w0,w1,dep,m):
 # Round ribcage, pinched waist, eased shoulder slope, rather than a rounded box.
 profile=[(z0,.31,.20),(z0+.08,.33,.207),(1.85,.34,.215),(2.08,.38,.237),(2.34,.425,.242),(2.51,.445,.221),(2.62,.39,.195),(2.70,.25,.15)]
 v=[];f=[];N=32
 for z,w,d in profile:
  for i in range(N):
   ang=math.tau*i/N;v.append((w*math.cos(ang),d*math.sin(ang),z))
 for j in range(len(profile)-1):
  for i in range(N):f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
 f.extend([tuple(reversed(range(N))),tuple(range((len(profile)-1)*N,len(profile)*N))])
 o=mesh(n,v,f,m);sub=o.modifiers.new('continuous tailored contour','SUBSURF');sub.levels=1
 return o

def hand(n,wrist,center,sk,side,grip=False):
 w=Vector(wrist);p=Vector(center);axis=(p-w).normalized();sideaxis=Vector((1,0,0));depth=Vector((0,-1,0))
 # Wrist, gently arched metacarpal fan and separate fingers with staggered lengths.
 end=p+axis*.082;hn=side+'.hand';JOINTS[hn]=(tuple(w),tuple(end),side+'.forearm')
 points=[w.lerp(end,j/8) for j in range(9)]
 radii=[.068,.074,.086,.096,.104,.105,.099,.091,.078]
 tube(n+' continuous wrist palm',points,radii,sk,[side+'.forearm',hn],[0,.32],flat=.58)
 radial=-1 if side=='left' else 1
 for digit,length,offset in [('index',.148,.061*radial),('middle',.164,.021*radial),('ring',.153,-.023*radial),('little',.119,-.063*radial)]:
  base=end+sideaxis*offset-axis*(.008 if digit=='little' else 0)
  def fingerpoint(t):
   curl=(.064 if grip else .019)*(1-math.cos(t*math.pi))
   return base+axis*(length*t)+depth*curl+sideaxis*(offset*.15*t)
  ts=[j/12 for j in range(11)]+[.89,.93,.965,.985,1.0]
  positions=[fingerpoint(t) for t in ts]
  bn=[side+'.'+digit+'.'+str(k) for k in range(1,4)]
  for k in range(3):JOINTS[bn[k]]=(tuple(fingerpoint(k/3)),tuple(fingerpoint((k+1)/3)),hn if k==0 else bn[k-1])
  radius=.024 if digit!='little' else .020
  rs=[radius*(1-.48*t**1.8) if t<=.89 else max(.0006,radius*(1-.48*.89**1.8)*math.sqrt(max(0,1-((t-.89)/.11)**2))) for t in ts]
  tube(n+' '+digit+' three phalanges',positions,rs,sk,bn,[.12,.48,.82],flat=.85,N=10,times=ts)
  nail=ell(n+' '+digit+' nail',fingerpoint(.84)-depth*.012,(.012,.006,.019),white)
  nail['bind']=bn[-1]
 # Thumb grows from radial thenar base, opposing the fingers, mirrored on each hand.
 base=p-axis*.038+sideaxis*(.060*radial)+depth*.01
 thumb=[base,base+sideaxis*(.048*radial)+axis*.008+depth*.025,base+sideaxis*(.068*radial)+axis*.060+depth*.050]
 bn=[side+'.thumb.1',side+'.thumb.2']
 JOINTS[bn[0]]=(tuple(thumb[0]),tuple(thumb[1]),hn);JOINTS[bn[1]]=(tuple(thumb[1]),tuple(thumb[2]),bn[0])
 ts=[j/12 for j in range(11)]+[.89,.93,.965,.985,1.0];ps=[]
 for t in ts:
  u=t*2;k=min(1,int(u));ps.append(thumb[k].lerp(thumb[k+1],u-k))
 rs=[.038*(1-.65*t**1.2) if t<=.89 else max(.0006,.038*(1-.65*.89**1.2)*math.sqrt(max(0,1-((t-.89)/.11)**2))) for t in ts]
 tube(n+' opposed thumb thenar',ps,rs,sk,bn,[.2,.75],flat=.82,N=12,times=ts)

def arm(n,shoulder,elbow,wrist,cloth,sk):
 sh,el,wr=map(Vector,(shoulder,elbow,wrist));side=n
 JOINTS[side+'.upperarm']=(tuple(sh),tuple(el),'chest');JOINTS[side+'.forearm']=(tuple(el),tuple(wr),side+'.upperarm')
 ps=[];rs=[]
 for j in range(25):
  t=j/24
  if t<=.5:
   u=t*2;inner=Vector((sh.x*.62,sh.y,sh.z+.08));pos=(1-u)**2*inner+2*(1-u)*u*sh+u*u*el;r=.16*(1-u)+.126*u
  else:pos=el.lerp(wr,(t-.5)*2);r=.126*(1-(t-.5)*2)+.086*(t-.5)*2
  # Rounded shoulder enters ribcage, not a separate sphere.
  ps.append(pos);rs.append(r)
 tube(n+' continuous sleeve shoulder elbow',ps,rs,cloth,['chest',side+'.upperarm',side+'.forearm'],[0,.24,.75])
 cuff=ell(n+' cuff',wr,(.09,.10,.062),cloth);cuff['bind']=side+'.forearm'
 gripcenters={1:{'right':(.28,-.49,2.15)},2:{'left':(-.43,-.59,1.88),'right':(.53,-.48,1.86)},3:{'left':(-.22,-.44,1.79),'right':(.22,-.44,1.79)},4:{'right':(.82,-.22,2.36)},5:{'left':(-.45,-.49,1.92),'right':(.64,-.39,2.44)}}
 center=gripcenters.get(CURRENT,{}).get(side,tuple(wr+Vector((0,-.025,-.115))))
 hand(n+' hand',wr,center,sk,side,side in gripcenters.get(CURRENT,{}))

def shoe_mesh(n,s,m,issole=False):
 # Anatomical shoe last: narrow heel, instep rise, medial arch, broad forefoot, tapered toes.
 profiles=[(.17,.075,.10),(.12,.118,.20),(.025,.132,.28),(-.09,.145,.255),(-.23,.158,.17),(-.34,.143,.125),(-.405,.098,.10),(-.435,.012,.085)]
 v=[];f=[];ws=[];N=20
 for y,width,height in profiles:
  for k in range(N):
   ang=k*math.tau/N
   x=s*.27+math.cos(ang)*width
   medial=max(0,-s*math.cos(ang));arch=.024*medial*math.exp(-((y+.015)/.10)**2)
   if issole:z=.069+arch+.035*(1+math.sin(ang))*.5
   else:z=.10+arch+height*(.5+.5*math.sin(ang))
   v.append((x,y,z));t=max(0,min(1,(-y-.14)/.20));ws.append({('left' if s<0 else 'right')+'.foot':1-t,('left' if s<0 else 'right')+'.toe':t})
 for j in range(len(profiles)-1):
  for k in range(N):f.append((j*N+k,j*N+(k+1)%N,(j+1)*N+(k+1)%N,(j+1)*N+k))
 f.extend([tuple(reversed(range(N))),tuple(range((len(profiles)-1)*N,len(profiles)*N))])
 return setweights(mesh(n,v,f,m),ws)

def legs(cloth,shoe=dark,wide=1):
 for s in [-1,1]:
  side='left' if s<0 else 'right';hip=Vector((s*.22,0,1.65));knee=Vector((s*.25,-.015,.93));ankle=Vector((s*.27,0,.28))
  JOINTS[side+'.thigh']=(tuple(hip),tuple(knee),'pelvis');JOINTS[side+'.shin']=(tuple(knee),tuple(ankle),side+'.thigh');JOINTS[side+'.foot']=(tuple(ankle),(s*.27,-.23,.13),side+'.shin');JOINTS[side+'.toe']=((s*.27,-.23,.13),(s*.27,-.41,.12),side+'.foot')
  ps=[];rs=[]
  for j in range(29):
   t=j/28
   ps.append(hip.lerp(knee,t*2) if t<=.5 else knee.lerp(ankle,(t-.5)*2))
   rs.append((.186*(1-t*2)+.132*t*2 if t<=.5 else .132*(1-(t-.5)*2)+.095*(t-.5)*2)*wide)
  tube(side+' continuous trouser hip knee ankle',ps,rs,cloth,[side+'.thigh',side+'.shin',side+'.foot'],[.22,.75,1],flat=1.08)
  shoe_mesh(side+' shaped rubber sole',s,sole,True);shoe_mesh(side+' sculpted shoe last',s,shoe)
  for j in range(3):
   o=line(side+' shoe lace',[(s*.27-.065,-.10-j*.048,.333-j*.025),(s*.27+.065,-.10-j*.048,.333-j*.025)],.006,white);o['bind']=side+'.foot'

exec((BASE/'anatomy-repair.py').read_text(),globals())

ids=['luca','free-rider','tryhard','assessment','trischli-warrior','bad-teacher']
engineids=['luca-di-grazia','free-rider','tryhard','assessment-hoodie','trischli-warrior','bad-teacher']
names=['Luca Di Grazia','Free-rider','Tryhard','Assessment','Trischli Warrior','Bad Teacher']
items=[];report=[]

def bind_default(o,co):
 n=o.name.lower();z=co.z
 if o.get('bind'):return {o['bind']:1}
 if 'wing' in n or 'feather' in n or 'rachis' in n:
  side='left' if co.x<0 else 'right';t=max(0,min(1,(abs(co.x)-.65)/.75));return {side+'.wing':1-t,side+'.wingtip':t}
 if 'dizziness' in n or 'orbit particle' in n:return {'vfx':1}
 if 'phone' in n or 'party cup' in n or 'red pen' in n or 'pen gold' in n or 'revision' in n:return {'right.hand':1}
 if 'perfect notes' in n or 'marked examination' in n or 'failed exam cross' in n:return {'left.hand':1}
 if 'folded crumpled' in n or 'crumpled group' in n or 'unfinished group' in n:return {'root':1}
 if z>2.83 or 'halo' in n or 'glasses' in n:return {'head':1}
 if 'bad luck timetable' in n or 'unlucky exam' in n or 'exam rules' in n:return {'left.hand':1}
 if 'neck' in n:return blended(z,['chest','head'],[2.63,2.90])
 return blended(z,['pelvis','spine','chest'],[1.65,2.0,2.53])

def make_rig(sc,col,root):
 global C,SOURCE_REGIONS
 SOURCE_REGIONS={}
 bpy.context.window.scene=sc
 armdata=bpy.data.armatures.new(root['character_id']+' anatomical skeleton');rig=bpy.data.objects.new(root['character_id']+' / RIG',armdata);col.objects.link(rig);rig.parent=root;rig.show_in_front=True
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
 base={'root':((0,0,.08),(0,0,.42),None),'pelvis':((0,0,1.52),(0,0,1.83),'root'),'spine':((0,0,1.83),(0,0,2.23),'pelvis'),'chest':((0,0,2.23),(0,0,2.68),'spine'),'head':((0,0,2.68),(0,0,3.50),'chest'),'vfx':((0,0,3.65),(0,0,4.0),'head')}
 if CURRENT==0:
  for s in [-1,1]:
   side='left' if s<0 else 'right';base[side+'.wing']=((s*.30,.20,2.60),(s*1.0,.24,3.10),'chest');base[side+'.wingtip']=((s*1.0,.24,3.10),(s*1.9,.27,3.5),side+'.wing')
 for n,(h,t,parent) in {**base,**JOINTS}.items():
  b=armdata.edit_bones.new(n);b.head=h;b.tail=t
 for n,(_,_,parent) in {**base,**JOINTS}.items():
  if parent:armdata.edit_bones[n].parent=armdata.edit_bones[parent]
 bpy.ops.object.mode_set(mode='OBJECT')
 meshes=[];vfxmeshes=[]
 for o in list(col.all_objects):
  if o.type not in ['MESH','FONT','CURVE']:continue
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
  # Web budget: lettering remains actual geometry, but microscopic bevel loops are unnecessary.
  if o.type=='FONT':o.data.bevel_depth=0;o.data.extrude=.001;o.data.resolution_u=3
  elif o.type=='CURVE':o.data.resolution_u=4;o.data.bevel_resolution=1
  for modifier in o.modifiers:
   if modifier.type=='BEVEL':modifier.segments=2
   if modifier.type=='SUBSURF':modifier.levels=1
  # Evaluate native typography, bevels and surfaces once; export only actual triangles.
  try:bpy.ops.object.convert(target='MESH')
  except RuntimeError:pass
  o=bpy.context.object
  local=o.matrix_local.copy();o.data.transform(local);o.matrix_basis.identity();o.parent=rig
  if not len(o.vertex_groups):setweights(o,[bind_default(o,v.co) for v in o.data.vertices])
  # Keep semantic source regions after joining for actual contact/seam tests.
  region=o.data.attributes.new('source_region','INT','POINT')
  region_id=len(SOURCE_REGIONS)+1;SOURCE_REGIONS[str(region_id)]=o.name
  for value in region.data:value.value=region_id
  (vfxmeshes if 'dizziness' in o.name or 'orbit particle' in o.name else meshes).append(o)
 if vfxmeshes:
  bpy.ops.object.select_all(action='DESELECT')
  for o in vfxmeshes:o.select_set(True)
  bpy.context.view_layer.objects.active=vfxmeshes[0];bpy.ops.object.join();vfx=bpy.context.object;vfx.name='trischli-warrior / Separate dizziness VFX';vfx['vfx_separate']=True
  mod=vfx.modifiers.new('Independent VFX bone attachment','ARMATURE');mod.object=rig
 # Merge per material into one weighted mesh; retained names in original source are reproducible.
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();body=bpy.context.object;body.name=engineids[CURRENT]+' / Weighted surfaces'
 mod=body.modifiers.new('Skeleton skin deformation','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=False
 tri=body.modifiers.new('Export triangulation','TRIANGULATE')
 # Fully normalized ≤4 joint influences, checked again after fresh open/export.
 for v in body.data.vertices:
  weights=[(g.group,g.weight) for g in v.groups if g.weight>0];weights=sorted(weights,key=lambda it:-it[1])[:4];total=sum(w for _,w in weights)
  assert total>0,(body.name,v.index)
  for g in body.vertex_groups:g.remove([v.index])
  for gi,w in weights:body.vertex_groups[gi].add([v.index],w/total,'REPLACE')
 body['source_regions']=json.dumps(SOURCE_REGIONS)
 root['static_model']=False;root['character_id']=engineids[CURRENT];root['generation']='v2 deforming skin';body['original_geometry']=True
 return rig,body

exec((BASE/'ability-poses.py').read_text(),globals())
def clips(rig):
 rig.animation_data_create()
 for clip,duration in [('idle',48),('attack',24),('hit',18),('defeat',36),('defend',24),('heal',36),('special',36)]:
  print('BAKE',engineids[CURRENT],clip,flush=True)
  action=bpy.data.actions.new(clip);rig.animation_data.action=None
  frames=list(range(1,duration+2))
  for fi,frame in enumerate(frames):
   t=(frame-1)/duration;wave=math.sin(t*math.pi);pulse=math.sin(t*math.tau)
   for b in rig.pose.bones:b.rotation_mode='XYZ';b.rotation_euler=(0,0,0);b.location=(0,0,0)
   rig.pose.bones['chest'].rotation_euler.x=.018*pulse
   rig.pose.bones['head'].rotation_euler.y=.018*pulse
   if clip=='attack':
    rig.pose.bones['chest'].rotation_euler.y=-.15*wave
    rig.pose.bones['right.upperarm'].rotation_euler.x=-.65*wave;rig.pose.bones['right.forearm'].rotation_euler.x=.48*wave
    rig.pose.bones['left.thigh'].rotation_euler.x=.18*wave;rig.pose.bones['left.shin'].rotation_euler.x=-.34*wave
   elif clip=='hit':
    rig.pose.bones['spine'].rotation_euler.x=-.22*wave;rig.pose.bones['head'].rotation_euler.x=-.15*wave
    rig.pose.bones['left.shin'].rotation_euler.x=-.22*wave;rig.pose.bones['right.shin'].rotation_euler.x=-.18*wave
   elif clip=='defeat':
    ease=t*t*(3-2*t);rig.pose.bones['spine'].rotation_euler.x=.65*ease;rig.pose.bones['head'].rotation_euler.x=.35*ease
    for side in ['left','right']:
     rig.pose.bones[side+'.thigh'].rotation_euler.x=.52*ease;rig.pose.bones[side+'.shin'].rotation_euler.x=-1.10*ease
    rig.pose.bones['pelvis'].location.y=-.38*ease
   elif clip=='defend':
    for side in ['left','right']:rig.pose.bones[side+'.forearm'].rotation_euler.x=.48*wave
   elif clip=='heal':rig.pose.bones['head'].rotation_euler.x=-.16*wave;rig.pose.bones['chest'].rotation_euler.x=-.10*wave
   elif clip=='special':
    for side in ['left','right']:rig.pose.bones[side+'.upperarm'].rotation_euler.z=(1 if side=='left' else -1)*.45*wave
    rig.pose.bones['chest'].rotation_euler.x=-.12*wave
   ability_pose(rig,CURRENT,clip,wave)
   for side in ['left','right']:
    for digit in ['index','middle','ring','little']:
     for k in [1,2,3]:rig.pose.bones[side+'.'+digit+'.'+str(k)].rotation_euler.x=0 if side in GRIPS.get(CURRENT,{}) else (.025*pulse if clip=='idle' else .12*wave)
    rig.pose.bones[side+'.thumb.1'].rotation_euler.y=0 if side in GRIPS.get(CURRENT,{}) else .08*wave
    if side+'.wing' in rig.pose.bones:
     rig.pose.bones[side+'.wing'].rotation_euler.y=(1 if side=='left' else -1)*(.035*pulse if clip=='idle' else .18*wave)
     rig.pose.bones[side+'.wingtip'].rotation_euler.x=.08*wave
   rig.pose.bones['vfx'].rotation_euler.y=.12*pulse
   solve_pose(rig,clip,t,wave)
   solved={b.name:(b.rotation_euler.copy(),b.location.copy()) for b in rig.pose.bones}
   rig.animation_data.action=action
   for b in rig.pose.bones:
    b.rotation_euler,b.location=solved[b.name]
    b.keyframe_insert(data_path='rotation_euler',frame=frame,group=b.name)
    if b.name=='pelvis' or (CURRENT==3 and b.name=='right.hand'):b.keyframe_insert(data_path='location',frame=frame,group=b.name)
   rig.animation_data.action=None
  track=rig.animation_data.nla_tracks.new();track.name=clip;strip=track.strips.new(clip,1,action);strip.name=clip;track.mute=True
  rig.animation_data.action=None
 # Muted in editor for clean rest lineup; exporter exports muted tracks when solo flags disabled.
 for track in rig.animation_data.nla_tracks:track.mute=True
 for bone in rig.pose.bones:bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
 bpy.context.view_layer.update()

for i,(slug,title) in enumerate(zip(ids,names)):
 CURRENT=i;JOINTS={}
 print('BUILD CHARACTER',slug,flush=True)
 sc,col,rt=make_character(slug,title,i)
 repair_details(col,rt)
 rig,body=make_rig(sc,col,rt)
 # Apply semantic scalp/garment attachment repairs to evaluated surfaces too.
 from surface_repair import repair
 repair(body)
 skinmeshes=[obj for obj in col.all_objects if obj.type=='MESH']
 for obj in skinmeshes:obj.hide_set(True)
 clips(rig)
 for obj in skinmeshes:obj.hide_set(False)
 setup(sc,title,slug)
 sc.render.fps=24;sc.frame_set(1);sc.cycles.samples=20;sc.render.resolution_x=900;sc.render.resolution_y=1050
 bpy.context.window.scene=sc;bpy.ops.object.select_all(action='DESELECT')
 for o in col.all_objects:o.select_set(True)
 # Bone-track names are the runtime clip contract; no external resources or morph hacks.
 for track in rig.animation_data.nla_tracks:track.mute=False
 bpy.ops.export_scene.gltf(filepath=str(EXPORT/(engineids[i]+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_range=False,export_materials='EXPORT',export_extras=True,export_yup=True,export_cameras=False,export_lights=False,use_active_scene=True,export_texcoords=False)
 normalize(EXPORT/(engineids[i]+'.glb'))
 for track in rig.animation_data.nla_tracks:track.mute=True
 report.append({'id':engineids[i],'bones':len(rig.data.bones),'vertices':len(body.data.vertices),'file':engineids[i]+'.glb','bytes':(EXPORT/(engineids[i]+'.glb')).stat().st_size})
 items.append((sc,col,rt,rig,body))
for ss in list(bpy.data.scenes):
 if ss.name not in names:bpy.data.scenes.remove(ss)
lineup=bpy.data.scenes.new('LINEUP / Refined articulated cast');setup(lineup,'HSG BATTLE ARENA / V2','lineup');C=[c for c in lineup.collection.children if c.name.startswith('Studio')][0];ROOT=None;PART='LINEUP | '
for i,(sc,col,rt,rig,body) in enumerate(items):
 x=[-7.3,-3.6,-.8,2.1,5.,7.8][i];inst=bpy.data.objects.new('LINEUP / '+engineids[i],None);C.objects.link(inst);inst.instance_type='COLLECTION';inst.instance_collection=col;inst.location=(x,0,0)
 text('label '+ids[i],names[i].upper(),(x,-1.0,.12),.18,white)
lineup.camera.location=(0,-24,7);lineup.camera.rotation_euler=(Vector((0,0,1.95))-lineup.camera.location).to_track_quat('-Z','Y').to_euler();lineup.camera.data.ortho_scale=20.5;lineup.render.resolution_x=3000;lineup.render.resolution_y=1000;lineup.cycles.samples=24
for o in list(C.objects):
 if o.type=='LIGHT':o.data.energy*=4;o.data.size*=2.5;o.location.x*=2
 if o.name.startswith('STUDIO | character name') or o.name.startswith('STUDIO | display plinth'):bpy.data.objects.remove(o,do_unlink=True)
bpy.context.window.scene=items[0][0];bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=OUT+'/hsg-characters-v2.blend',compress=True)
Path(OUT+'/build-report.json').write_text(json.dumps(report,indent=2))
if a.render=='all':
 for sc,_,_,_,_ in items:bpy.context.window.scene=sc;bpy.ops.render.render(write_still=True,scene=sc.name)
 bpy.context.window.scene=lineup;bpy.ops.render.render(write_still=True,scene=lineup.name)
print('V2 BUILD COMPLETE',json.dumps(report),flush=True)
