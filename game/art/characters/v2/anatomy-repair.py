"""Authored contact geometry, connected pelvic tailoring and native pose solves.
Executed by generate.py after base helper definitions, before building the cast.
"""
from mathutils import Matrix, Quaternion
GRIPS={
 1:{'right':('edge',(.28,-.50,2.26),(.19,.075,.32),1,2.24)},
 2:{'left':('edge',(-.43,-.55,2.01),(.48,.15,.60),-1,1.94),'right':('edge',(.53,-.43,1.98),(.31,.15,.46),1,1.94)},
 3:{'left':('edge',(0,-.40,1.71),(.43,.06,.43),-1,1.78),'right':('edge',(0,-.40,1.71),(.43,.06,.43),1,1.78)},
 4:{'right':('cylinder',(.82,-.22,2.48),(.082,0,0),1,2.43)},
 5:{'left':('edge',(-.45,-.45,2.03),(.48,.15,.62),-1,1.98),'right':('cylinder',(.64,-.36,2.58),(.018,0,0),1,2.52)}}
original_hand=hand

def grasp_hand(n,wrist,sk,side,spec):
 kind,cp,dims,s,z=spec;c=Vector(cp);w=Vector(wrist);hn=side+'.hand'
 # All contact points are authored in prop space. No prop weight averaging.
 if kind=='edge':
  edge=c.x+s*dims[0]/2;back=c.y+dims[1]/2;front=c.y-dims[1]/2
  p=Vector((edge+s*.074,back+.025,z));end=p+Vector((0,0,-.075))
 else:
  radius=dims[0];p=Vector((c.x+radius+.058,c.y,z));end=p+Vector((0,0,-.075))
 JOINTS[hn]=(tuple(w),tuple(end),side+'.forearm')
 tube(n+' wrist to metacarpal', [w.lerp(p,j/8) for j in range(9)],[.063,.066,.069,.074,.080,.086,.088,.085,.08],sk,[side+'.forearm',hn],[0,.30],flat=.78)
 palm=ell(n+' grasp palm',tuple(p),(.072,.046,.096),sk);palm['bind']=hn
 for j,digit in enumerate(['index','middle','ring','little']):
  zz=z+.060-j*.039;bn=[side+'.'+digit+'.'+str(k) for k in [1,2,3]]
  if kind=='edge':
   # Fingers curl around the outer edge; pads stop on the rear cover, thumb on front.
   pts=[Vector((edge+s*.084,back+.038,zz)),Vector((edge+s*.073,c.y,zz-.003)),Vector((edge+s*.040,front-.026,zz-.010)),Vector((edge-s*.045,front-.025,zz-.014))]
  else:
   radius=dims[0];rr=radius+.020
   pts=[Vector((c.x+rr*math.cos(a),c.y+rr*math.sin(a),zz)) for a in [.05,-.6,-1.3,-2.0]]
  for k in range(3):JOINTS[bn[k]]=(tuple(pts[k]),tuple(pts[k+1]),hn if k==0 else bn[k-1])
  times=[j/18 for j in range(19)];points=[]
  for t in times:
   u=t*3;k=min(2,int(u));points.append(pts[k].lerp(pts[k+1],u-k))
  rs=[(.020 if digit!='little' else .017)*(1-.36*t) if t<.9 else max(.0008,.013*math.sqrt(max(0,1-((t-.9)/.1)**2))) for t in times]
  tube(n+' contact '+digit,points,rs,sk,bn,[.12,.48,.83],N=10,times=times)
 # Thumb opposes the fingers on the other face/azimuth, not a fifth parallel ray.
 if kind=='edge':
  pts=[p+Vector((s*.015,.005,.075)),Vector((edge+s*.046,back+.027,z+.090)),Vector((edge-s*.045,back+.023,z+.080))]
 else:
  rr=dims[0]+.023;pts=[p+Vector((0,.01,.07)),Vector((c.x+rr*.55,c.y+rr*.85,z+.068)),Vector((c.x-rr*.35,c.y+rr*.94,z+.040))]
 bn=[side+'.thumb.1',side+'.thumb.2']
 for k in [0,1]:JOINTS[bn[k]]=(tuple(pts[k]),tuple(pts[k+1]),hn if k==0 else bn[k-1])
 times=[j/14 for j in range(15)];points=[]
 for t in times:
  u=t*2;k=min(1,int(u));points.append(pts[k].lerp(pts[k+1],u-k))
 tube(n+' opposed contact thumb',points,[.029*(1-.45*t) if t<.88 else max(.0008,.018*math.sqrt(max(0,1-((t-.88)/.12)**2))) for t in times],sk,bn,[.15,.72],N=12,times=times)

def hand(n,wrist,center,sk,side,grip=False):
 spec=GRIPS.get(CURRENT,{}).get(side)
 if spec:return grasp_hand(n,wrist,sk,side,spec)
 return original_hand(n,wrist,center,sk,side,False)

# One watertight pants surface: shared full waist ring -> split crotch -> both legs.
def legs(cloth,shoe=dark,wide=1):
 N=32;v=[];f=[];ws=[];rings=[]
 waist=1.80 if CURRENT==2 else 1.66
 for z,w,d in [(waist,.345,.217),(1.56,.35,.219),(1.44,.35,.213)]:
  ring=[]
  for k in range(N):
   a=math.tau*k/N;ring.append(len(v));v.append((w*math.cos(a),d*math.sin(a),z));ws.append({'pelvis':1})
  rings.append(ring)
 def bridge(a,b):
  for k in range(len(a)):f.append((a[k],a[(k+1)%len(a)],b[(k+1)%len(b)],b[k]))
 bridge(rings[0],rings[1]);bridge(rings[1],rings[2]);f.append(tuple(reversed(rings[0])))
 # Shared center crotch seam joining front to back; each leg has 16 outer vertices + center.
 front=rings[2][24];back=rings[2][8];center=len(v);v.append((0,0,1.37));ws.append({'pelvis':1})
 for s in [-1,1]:
  side='left' if s<0 else 'right';hip=Vector((s*.22,0,1.59));knee=Vector((s*.25,-.015,.93));ankle=Vector((s*.27,0,.28))
  JOINTS[side+'.thigh']=(tuple(hip),tuple(knee),'pelvis');JOINTS[side+'.shin']=(tuple(knee),tuple(ankle),side+'.thigh');JOINTS[side+'.foot']=(tuple(ankle),(s*.27,-.23,.13),side+'.shin');JOINTS[side+'.toe']=((s*.27,-.23,.13),(s*.27,-.41,.12),side+'.foot')
  # Right outer half: back->outer->front; left: front->outer->back. Same closed winding.
  indices=([rings[2][k%N] for k in range(24,41)] if s>0 else [rings[2][k] for k in range(8,25)])+[center]
  # Orient both loops clockwise seen from above (matches mesh radial rings).
  # Resample lower rings to exactly same 18 vertices; matching start angle.
  prev=indices;start=-math.pi/2 if s>0 else math.pi/2;K=len(prev)
  for j in range(1,26):
   z=1.44-(1.44-.28)*j/25;t=(1.59-z)/(1.59-.28);p=hip.lerp(knee,t*2) if t<.5 else knee.lerp(ankle,min(1,(t-.5)*2))
   r=(.174*(1-t*2)+.132*t*2 if t<=.5 else .132*(1-(t-.5)*2)+.095*(t-.5)*2)*wide
   ring=[]
   for k in range(K):
    a=start+math.tau*k/K;ring.append(len(v));v.append((p.x+r*math.cos(a),p.y+r*1.08*math.sin(a),z))
    weights=blended(t,[side+'.thigh',side+'.shin',side+'.foot'],[.25,.75,1]);blend=max(0,min(1,(z-1.23)/.21))*.7
    weights={n:w*(1-blend) for n,w in weights.items()};weights['pelvis']=blend;ws.append(weights)
   bridge(prev,ring);prev=ring
  f.append(tuple(prev));shoe_mesh(side+' shaped rubber sole',s,sole,True);shoe_mesh(side+' sculpted shoe last',s,shoe)
  for j in range(3):
   o=line(side+' shoe lace',[(s*.27-.065,-.10-j*.048,.333-j*.025),(s*.27+.065,-.10-j*.048,.333-j*.025)],.006,white);o['bind']=side+'.foot'
 # Relax only the fork transition; waist/ankles stay exact, topology and skin weights unchanged.
 adjacency={i:set() for i in range(len(v))}
 for face in f:
  for a,b in zip(face,face[1:]+face[:1]):adjacency[a].add(b);adjacency[b].add(a)
 for iteration in range(10):
  previous=[Vector(p) for p in v]
  for i,p in enumerate(previous):
   if 1.20<p.z<1.60:
    strength=.50*min(1,(p.z-1.20)/.10,(1.60-p.z)/.10)
    average=sum((previous[j] for j in adjacency[i]),Vector())/len(adjacency[i]);v[i]=tuple(p.lerp(average,strength))
 o=setweights(mesh('connected pelvis crotch and trousers',v,f,cloth),ws);o['pelvis_continuous']=True
 # Weld the center crotch split (shared IDs above) and recalculate native normals.
 import bmesh
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()

# Static identity detail corrections happen before joining/weight assignment.
def repair_details(col,root):
 root.rotation_euler=(0,0,0);root.location.z=0
 for o in col.all_objects:
  n=o.name.lower()
  # Rounded shoulder cap is centered on the actual glenohumeral pivot.
  if 'continuous sleeve shoulder elbow' in n:
   side='left' if 'left' in n else 'right';sh=Vector(JOINTS[side+'.upperarm'][0])
   for vert in o.data.vertices:
    # Soften abrupt chest-facing start ring, no free sharp shoulder edge.
    if vert.co.z>sh.z:vert.co.z=sh.z+(vert.co.z-sh.z)*.35
  if CURRENT==5 and ('jacket check warp' in n or 'jacket check weft' in n):
   # Fit stitch curves to actual rounded jacket surface rather than dangling outside.
   if o.type=='CURVE':
    for spline in o.data.splines:
     for p in spline.bezier_points:
      p.co.x*=.88;p.co.z=max(1.70,p.co.z);p.co.y=-.205*math.sqrt(max(.05,1-(p.co.x/.39)**2))-.008
  if CURRENT==1 and ('satchel' in n or 'empty bag rim' in n):o.location.x-=.13;o.location.y+=.10;o['bind']='pelvis'

def solve_chain(rig,upper,lower,target,pole):
 # Analytic 2-bone IK in armature space; rotations only, native keyed bones.
 bpy.context.view_layer.update();u=rig.pose.bones[upper];l=rig.pose.bones[lower];h=u.head.copy();a=u.length;b=l.length;vec=Vector(target)-h;dist=min(a+b-.0001,max(abs(a-b)+.0001,vec.length));direction=vec.normalized()
 bend=Vector(pole)-h;normal=bend-direction*bend.dot(direction)
 if normal.length<.001:normal=Vector((0,-1,0))
 normal.normalize();along=(a*a-b*b+dist*dist)/(2*dist);elbow=h+direction*along+normal*math.sqrt(max(0,a*a-along*along))
 for bone,dest in [(u,elbow),(l,Vector(target))]:
  m=bone.matrix.copy();q=(bone.tail-bone.head).rotation_difference(dest-bone.head);m=Matrix.Translation(bone.head)@q.to_matrix().to_4x4()@Matrix.Translation(-bone.head)@m;bone.matrix=m;bpy.context.view_layer.update()

def solve_pose(rig,clip,t,wave):
 if CURRENT==1:rig.pose.bones['spine'].rotation_euler.x+=.045
 if CURRENT==4:rig.pose.bones['chest'].rotation_euler.z+=.075
 if clip=='defeat':
  ease=t*t*(3-2*t);rig.pose.bones['pelvis'].location=(0,-.20*ease,0)
 for side in ['left','right']:
  rest=rig.data.bones[side+'.foot'];target=rest.head_local.copy()
  if clip=='attack' and side=='left':target.y-=.055*wave
  solve_chain(rig,side+'.thigh',side+'.shin',target,(target.x,-2,.9))
  foot=rig.pose.bones[side+'.foot'];foot.matrix=Matrix.Translation(foot.head)@rest.matrix_local.to_quaternion().to_matrix().to_4x4();bpy.context.view_layer.update()
 if CURRENT==2 and clip in ['attack','special','defend','heal']:
  rig.pose.bones['right.upperarm'].rotation_euler=(.08*wave,0,-.13*wave)
  rig.pose.bones['right.forearm'].rotation_euler=(.20*wave,.12*wave,0)
 if CURRENT==5 and clip in ['attack','special']:
  rig.pose.bones['right.upperarm'].rotation_euler=(-.18*wave,0,-.20*wave)
  rig.pose.bones['right.forearm'].rotation_euler=(.22*wave,.15*wave,.12*wave)
 if CURRENT==4 and clip=='special':rig.pose.bones['right.upperarm'].rotation_euler=(-.18*wave,0,-.30*wave)
 if CURRENT==3:
  rig.pose.bones['left.upperarm'].rotation_euler=(-.12*wave,0,.10*wave)
  rig.pose.bones['left.forearm'].rotation_euler=(.14*wave,0,0)
  bpy.context.view_layer.update();left=rig.pose.bones['left.hand'];right=rig.pose.bones['right.hand'];ld=rig.data.bones['left.hand'];rd=rig.data.bones['right.hand']
  desired=left.matrix@ld.matrix_local.inverted()@rd.matrix_local
  solve_chain(rig,'right.upperarm','right.forearm',desired.translation,(.9,-.1,2.0));right.matrix=desired;bpy.context.view_layer.update()
