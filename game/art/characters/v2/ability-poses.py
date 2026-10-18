"""Identity-specific bone choreography, evaluated by the reproducible cast generator."""
def ability_pose(rig, identity, clip, wave):
 if clip not in ['attack','defend','heal','special']:return
 a=wave*(1.3 if clip=='special' else 1)
 def pose(b,x=0,y=0,z=0):rig.pose.bones[b].rotation_euler=(x*a,y*a,z*a)
 # Right-hand chalk flourish + opened wings; left-hand stolen paper snatch;
 # book-supported formula writing; nervous recoil; torso-led dance; red-pen slash.
 profiles=[
  {'chest':(0,-.22,0),'right.upperarm':(-.75,0,-.35),'right.forearm':(.55,.35,.15)},
  {'chest':(.1,-.38,0),'left.upperarm':(-.8,0,.25),'left.forearm':(.6,0,.35),'right.forearm':(.65,0,0)},
  {'head':(.18,0,0),'left.forearm':(.55,0,0),'right.upperarm':(-.45,0,-.35),'right.forearm':(.7,.4,0)},
  {'spine':(.18,0,-.15),'head':(.15,0,.2),'left.upperarm':(-.45,0,.3),'right.forearm':(.7,0,0)},
  {'chest':(0,.35,.18),'left.upperarm':(-.3,0,.8),'right.upperarm':(-.6,0,-.4),'left.forearm':(.45,0,0)},
  {'chest':(.12,-.2,0),'right.upperarm':(-.7,0,-.35),'right.forearm':(.55,0,-.3),'head':(.15,0,0)}]
 for b,angles in profiles[identity].items():pose(b,*angles)
 if clip=='special':
  if identity==0:
   pose('left.upperarm',-.4,0,.7);pose('left.wing',0,.42);pose('right.wing',0,-.42)
  elif identity==1:pose('chest',-.12,.4);pose('left.upperarm',-.95,0,-.3)
  elif identity==2:pose('right.upperarm',-.95,0,-.6);pose('chest',-.15,-.3)
  elif identity==3:pose('chest',-.22,.32);pose('left.upperarm',-.9,0,.4)
  elif identity==4:pose('chest',0,-.65,-.22);pose('right.upperarm',-.85,0,-.8)
  else:pose('right.upperarm',-1.05,0,-.6);pose('right.forearm',.9,0,.5)
 elif clip=='defend':
  poses=[{'left.forearm':(.9,0,.25),'right.forearm':(.9,0,-.25)},
   {'left.forearm':(1.2,0,0),'head':(.18,0,-.2)},
   {'left.upperarm':(-.55,0,.3),'left.forearm':(1.1,0,0)},
   {'left.upperarm':(-1.05,0,0),'right.upperarm':(-1.05,0,0),'head':(.28,0,0)},
   {'left.upperarm':(-.6,0,.2),'left.forearm':(1.2,0,0)},
   {'left.upperarm':(-.55,0,0),'left.forearm':(1.,0,0)}]
  for b,angles in poses[identity].items():pose(b,*angles)
 elif clip=='heal':
  pose('head',[-.22,.18,.28,-.18,-.25,.22][identity]);pose('right.forearm',.55+identity*.09,0,.1)
  pose('chest',-.1,identity*.025,0)
