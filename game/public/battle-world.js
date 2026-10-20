import * as THREE from './vendor/three.module.js';
import { loadModel, modelFor, release } from './characters.js?v=20261018-previews';
import { ARENA_WORLDS, BattleEvents } from './battle-contract.js?v=20261018-move-presentation';
const v = a => new THREE.Vector3(...a);
const ease = t => { t = THREE.MathUtils.clamp(t,0,1); return t*t*(3-2*t); };

// Analytic timeline (not accumulated lerps): identical framing at 15/30/60 Hz and zero cut on return.
export function actionCamera(config, event, progress, aspect = 1) {
 const t=THREE.MathUtils.clamp(progress,0,1),launch=event.ability.launch,impact=event.ability.impact;
 const enter=ease(t/launch),travel=ease((t-launch)/(impact-launch));
 const release=1-ease((t-Math.max(impact,.72))/(1-Math.max(impact,.72)));
 const weight=enter*release,side=event.actor==='A'?1:-1;
 const portrait=.35+.65*ease((aspect-.9)/.8);
 const shots={attack:[.70,-.42,-1.05,-.40],defend:[.82,.98,-.65,-.32],heal:[.38,.48,-.85,.12],special:[1.05,-.85,-1.35,-.18]};
 const [from,to,push,lift]=shots[event.move]||shots.attack;
 const position=v(config.overview);
 position.x+=side*THREE.MathUtils.lerp(from,to,travel)*weight*portrait*.30;
 position.z+=push*weight*portrait*.55;position.y+=lift*weight*.40;
 const actor=v(config.fighters[event.actor==='A'?0:1]);
 const target=v(config.fighters[event.target==='A'?0:1]);
 const focus=actor.lerp(target,event.actor===event.target?0:travel*.68);
 const look=v(config.look);look.x+=focus.x*.17*weight*portrait;
 look.y+=(event.move==='heal'?.10:-.06)*weight;
 // All shots remain in the open central aisle, below Trischli's low fixtures.
 position.x=THREE.MathUtils.clamp(position.x,-1.3,1.3);
 return {position,look,phase:t<launch?'anticipation':t<impact?'launch':t<.72?'impact':'recovery'};
}

// Held opposing three-quarter shots, not a continuous orbit. Main action choreography stays unchanged.
export function selectionCamera(config, team = 'A') {
 const side = team === 'A' ? -1 : 1;
 const position = v(config.overview);
 position.x = side * (config === ARENA_WORLDS.library ? 3.3 : 1.6);
 position.z -= config === ARENA_WORLDS.library ? 2.0 : 1.8;
 position.y -= .35;
 return { position, look: v(config.look), phase: 'selection-' + team };
}

// Fit the *animated* cast (including wings, raised hands and props), not just the bind pose.
export function fighterEnvelope(fighter) {
 const bounds=new THREE.Box3(),holder=fighter.holder;
 const position=holder.position.clone(),rotation=holder.quaternion.clone();
 holder.updateMatrixWorld(true);const transform=holder.matrixWorld.clone();
 // Keep the envelope oriented with the fighter: world-axis boxes invent huge empty wing corners.
 holder.position.set(0,0,0);holder.quaternion.identity();holder.updateMatrixWorld(true);
 for(const action of fighter.actions.values()) {
  fighter.mixer.stopAllAction();action.reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  for(const fraction of [0,.25,.5,.75,1]) {
   fighter.mixer.setTime(action.getClip().duration*fraction);
   fighter.holder.updateMatrixWorld(true);bounds.union(new THREE.Box3().setFromObject(fighter.holder,true));
  }
 }
 fighter.mixer.stopAllAction();fighter.clip=null;
 // Small allowance for cross-fades, idle sway and the floating ability cue.
 bounds.expandByScalar(.10);
 fighter.framePoints=[];
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])fighter.framePoints.push(new THREE.Vector3(x,y,z).applyMatrix4(transform));
 holder.position.copy(position);holder.quaternion.copy(rotation);holder.updateMatrixWorld(true);
 return bounds.applyMatrix4(transform);
}

// Presentation recipes audited against every server roster ID / ABILITIES label (24, not inferred by motif).
// Each recipe shares timing mechanics but owns its prop, gesture and spatial action. No combat values here.
export const MOVE_CHOREOGRAPHY = Object.freeze({
 'Golden Chalk': {mode:'melee',gesture:'write',prop:'chalk',detail:'Plant a short advance; draw a tick from the held chalk; send the mark; step home.'},
 'Open Book': {mode:'self',gesture:'read',prop:'open-book',detail:'Lift closed book; open both covers as a shield; read; fold away.'},
 'Good Work': {mode:'self',gesture:'thumb',prop:'praise',detail:'Lean forward; approving thumbs-up and gold star; proud nod; settle.'},
 'Full Marks': {mode:'melee',gesture:'stamp',prop:'marks',detail:'Advance one pace; stamp a held exam 100%; send the marked paper; step home.'},
 'Copy / Paste': {mode:'projectile',gesture:'copy',prop:'copies',detail:'Pinch a source page; duplicate it; send the PASTE copy; pocket the original.'},
 'Paper Decoy': {mode:'self',gesture:'fold',prop:'decoy',detail:'Fold paper; unfold a life-size paper stand-in; duck behind it; stand back up.'},
 'Group Credit': {mode:'self',gesture:'claim',prop:'group',detail:'Beckon three contributors; take their CREDIT medal; celebrate; wave them off.'},
 'AI Slop': {mode:'projectile',gesture:'type',prop:'slop',detail:'Hunch over laptop; type; launch a tangled robot-generated noodle ball; close laptop.'},
 'Formula': {mode:'projectile',gesture:'solve',prop:'formula',detail:'Count on fingers; write an equation; propel a spinning sigma; erase and reset.'},
 'Textbook': {mode:'self',gesture:'brace',prop:'textbook',detail:'Heave a heavy textbook; brace behind its spine; absorb a pulse; lower it.'},
 'Extra Credit': {mode:'self',gesture:'climb',prop:'credit',detail:'Stack extra books; step up with raised hand; collect +1 star; step down.'},
 'A+': {mode:'projectile',gesture:'present',prop:'grade',detail:'Wind up a gold grade; flourish; send an enormous A+ seal; scholarly bow.'},
 'Bad Luck': {mode:'summon',gesture:'jinx',prop:'storm',detail:'Recoil superstitiously; point; summon rain and lightning above opponent; shake it off.'},
 'Hood Up': {mode:'self',gesture:'hood',prop:'hood',detail:'Grab both sides; pull a real hood overhead; hunker down; release the fabric.'},
 'Take Hoodie Off': {mode:'self',gesture:'undress',prop:'jacket',detail:'Cross arms; peel off a modeled hoodie; stretch in sunshine; fold it away.'},
 'Skip Maths A Lecture': {mode:'evade',gesture:'sneak',prop:'lecture',detail:'Eye the MATHS A board; sneak away leaving an empty chair; send absent note; sneak back.'},
 'Dance Off': {mode:'melee',gesture:'dance',prop:'dance',detail:'Step onto a fixed dance floor; two controlled knee accents; finish the beat; step home.'},
 'Call the Bouncer': {mode:'self',gesture:'call',prop:'bouncer',detail:'Call on a hand-held phone; the bouncer steps into the free flank; settle and dismiss.'},
 'Glass of Water': {mode:'self',gesture:'drink',prop:'water',detail:'Reach for transparent water glass; lift to mouth; sip and sparkle; lower glass.'},
 'Throw a Beer': {mode:'lob',gesture:'throw',prop:'beer',detail:'Cock mug behind shoulder; overarm throw; amber beer arcs and splashes; wipe brow.'},
 'Red Pen': {mode:'melee',gesture:'slash',prop:'pen',detail:'Advance one pace; sweep the held pen; send the correction stroke; step home.'},
 'Curved Exam': {mode:'self',gesture:'curve',prop:'curve',detail:'Grip exam ends; physically bend a curved exam shield; trace grade curve; flatten and lower.'},
 'Brian AI': {mode:'self',gesture:'consult',prop:'brian',detail:'Tap a tablet; summon BRIAN robot tutor; receive a green advice heart; thank and close.'},
 'Failed': {mode:'melee',gesture:'slam',prop:'failed',detail:'Advance one pace; stamp the held report FAILED; send it to the opponent; step home.'}
});
const ramp=(t,a,b)=>ease((t-a)/(b-a));
const pulse=(t,a,b,c)=>ramp(t,a,b)*(1-ramp(t,b,c));

// Original low-poly theatrical props, generated with the existing Three runtime. No downloads/dependencies.
export function createMoveProps(label,color=0xffcf63) {
 const recipe=MOVE_CHOREOGRAPHY[label];if(!recipe)throw Error('Missing move choreography: '+label);
 const group=new THREE.Group();group.name=label+' / choreography';group.userData.recipe=recipe;
 const palette=new Map(), labels=[];
 const material=(c,glow=false)=>{const key=c+':'+glow;if(!palette.has(key))palette.set(key,new THREE.MeshStandardMaterial({color:c,roughness:.63,emissive:c,emissiveIntensity:glow?.55:.04}));return palette.get(key);};
 const mesh=(parent,geo,x=0,y=0,z=0,c=color,glow=false)=>{const o=new THREE.Mesh(geo,material(c,glow));o.position.set(x,y,z);parent.add(o);return o;};
 const box=(p,w,h,d,x=0,y=0,z=0,c=color)=>mesh(p,new THREE.BoxGeometry(w,h,d),x,y,z,c);
 const ball=(p,r,x=0,y=0,z=0,c=color)=>mesh(p,new THREE.SphereGeometry(r,12,8),x,y,z,c);
 const tube=(p,points,r=.022,c=color)=>mesh(p,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v)),20,r,6,false),0,0,0,c);
 const part=name=>{const p=new THREE.Group();p.name=name;group.add(p);return p;};
 const prop=part('prop'),secondary=part('secondary'),impact=part('impact');
 function text(p,value,w=.85,h=.28,c='#ffffff',bg='#18323b') {
  const m=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,transparent:true,depthWrite:false});
  if(typeof document!=='undefined') {const canvas=document.createElement('canvas');canvas.width=512;canvas.height=Math.round(512*h/w);const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=c;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold '+Math.floor(canvas.height*.67)+'px sans-serif';ctx.fillText(value,256,canvas.height/2,490);m.map=new THREE.CanvasTexture(canvas);m.map.colorSpace=THREE.SRGBColorSpace;}
  const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);o.position.z=.065;p.add(o);labels.push(o);return o;
 }
 const page=(p,value,w=.64,h=.82)=>{box(p,w,h,.045,0,0,0,0xfff4d6);if(value)text(p,value,w*.9,h*.24,'#18323b','#fff4d6').position.y=h*.22;for(let i=0;i<3;i++)box(p,w*.68,.016,.012,0,-i*.11,.03,0x72949b);};
 const star=(p,r=.22)=>{const shape=new THREE.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,R=i%2?r*.45:r;const x=Math.cos(a)*R,y=Math.sin(a)*R;if(i)shape.lineTo(x,y);else shape.moveTo(x,y);}shape.closePath();return mesh(p,new THREE.ExtrudeGeometry(shape,{depth:.055,bevelEnabled:false}),0,0,0,0xffcf43,true);};
 function humanoid(p,c=0x253345,paper=false){box(p,.45,.60,paper?.035:.23,0,0,0,c);ball(p,.15,0,.45,0,paper?0xfff4d6:0xe3ab7b);for(const s of [-1,1]){const arm=box(p,.13,.5,paper?.035:.16,s*.3,.04,0,c);arm.rotation.z=s*.35;box(p,.14,.42,paper?.035:.16,s*.14,-.48,0,c);}return p;}
 const mug=(p,water=false)=>{const cup=mesh(p,new THREE.CylinderGeometry(.14,.11,.34,16,1,true),0,0,0,water?0xc4efff:0xd89431);cup.material=cup.material.clone();cup.material.transparent=true;cup.material.opacity=water?.38:.72;mesh(p,new THREE.CylinderGeometry(.117,.10,.20,16),0,-.035,0,water?0x43cfff:0xe3a122);if(!water){mesh(p,new THREE.TorusGeometry(.115,.025,6,16),.17,.01,0,0xffedbb);for(let i=0;i<5;i++)ball(p,.065,(i-2)*.045,.17,0,0xfff7dc);}};
 switch(recipe.prop){
 case 'chalk':mesh(prop,new THREE.CylinderGeometry(.045,.045,.65,8)).rotation.z=-.8;tube(secondary,[[-.5,-.2,0],[-.12,-.4,0],[.6,.45,0]],.045,0xffd34f);break;
 case 'open-book':{for(const s of [-1,1]){const cover=new THREE.Group();cover.name=s<0?'left-cover':'right-cover';prop.add(cover);box(cover,.47,.67,.07,s*.24,0,0,0x257e69);box(cover,.43,.60,.05,s*.24,0,.05,0xfff4d6);for(let i=0;i<4;i++)box(cover,.30,.014,.01,s*.24,.19-i*.12,.08,0x5d8f82);}break;}
 case 'praise':{star(prop,.32);text(secondary,'GOOD WORK',1.05,.25);ball(prop,.09,.30,-.02,0,0xffdfa1);box(prop,.13,.32,.12,.30,.12,0,0xffdfa1).rotation.z=-.2;break;}
 case 'marks':box(prop,.13,.26,.13,0,.22,0,0x8a6630);box(prop,.46,.18,.19,0,0,0,0xd6a422);text(prop,'100%',.44,.15,'#664900','#ffe798').position.z=.11;page(secondary,'',.68,.78);{const print=new THREE.Group();print.name='contact print';secondary.add(print);text(print,'100%',.59,.23,'#664900','#ffe798').position.y=.13;text(print,'FULL MARKS',.61,.13,'#664900','#ffe798').position.y=-.10;}break;
 case 'copies':page(prop,'COPY');page(secondary,'PASTE');break;
 case 'decoy':humanoid(prop,0xfff4d6,true);text(secondary,'NOT ME',.72,.25);break;
 case 'group':for(let i=0;i<3;i++){const p=new THREE.Group();p.position.set((i-1)*.48,0,-.10);humanoid(p,[0x4aaba2,0x7588c7,0xcc8b69][i]);prop.add(p);}star(secondary,.24);text(secondary,'CREDIT',.67,.24).position.y=.34;break;
 case 'slop':box(prop,.65,.045,.4);box(prop,.65,.43,.04,0,.23,-.17,0x243149);text(prop,'AI',.35,.22).position.set(0,.25,-.14);for(let i=0;i<7;i++)tube(secondary,[[Math.sin(i)*.24,-.2,0],[Math.cos(i)*.28,.13,.13],[Math.sin(i+2)*.25,.32,0],[.1,-.25,.18]],.025,i%2?0xf5ce62:0xc386ed);ball(secondary,.21,0,0,0,0x99cbd5);text(secondary,'SLOP',.6,.22).position.y=.40;break;
 case 'formula':text(prop,'x² + y² = A',1.13,.32,'#b7ffce','#21473b');tube(secondary,[[.30,.32,0],[-.30,.32,0],[.03,0,0],[-.30,-.32,0],[.30,-.32,0]],.055,0xa0ffc6);break;
 case 'textbook':box(prop,.85,1.12,.22,0,0,0,0x2c9475);box(prop,.73,1.01,.23,.03,0,.02,0xfff4d6);text(prop,'TEXTBOOK',.74,.25,'#ffffff','#246650').position.z=.15;break;
 case 'credit':for(let i=0;i<3;i++)box(prop,.64-i*.08,.075,.45,0,-.075+i*.075,0,[0x295c79,0x9877bd,0x53ac8e][i]);star(secondary,.27);text(secondary,'+1',.42,.29,'#1c4738','#b7ffce').position.y=.37;break;
 case 'grade':star(prop,.48);text(prop,'A+',.64,.45,'#6b4300','#ffe580').position.z=.10;mesh(secondary,new THREE.TorusGeometry(.54,.035,8,40),0,0,0,0xffcf43);break;
 case 'storm':for(let i=0;i<5;i++)ball(prop,.21,(i-2)*.17,Math.sin(i)*.055,0,0x746da3);tube(secondary,[[.10,.18,0],[-.13,-.06,0],[.09,-.04,0],[-.09,-.38,0]],.047,0xffe88c);for(let i=0;i<7;i++)tube(prop,[[(i-3)*.12,-.23,0],[(i-3)*.12-.05,-.45,0]],.014,0x8ccfff);break;
 case 'hood':{const hood=mesh(prop,new THREE.SphereGeometry(.30,16,10,Math.PI/2+.80,Math.PI*2-1.60,0,Math.PI*.72),0,0,0,0x245b48);hood.scale.z=.78;hood.material.side=THREE.DoubleSide;box(prop,.44,.17,.16,0,-.16,0,0x245b48);break;}
 case 'jacket':box(prop,.49,.56,.15,0,0,0,0x245b48);for(const s of [-1,1])box(prop,.17,.46,.14,s*.33,.10,0,0x245b48).rotation.z=s*.70;mesh(prop,new THREE.TorusGeometry(.13,.06,8,20),0,.31,0,0x245b48);star(secondary,.28);text(secondary,'FREEDOM',.90,.25,'#5f4400','#fff0aa').position.y=.40;break;
 case 'lecture':box(prop,1.12,.65,.06,0,.22,0,0x21473b);text(prop,'MATHS A',.98,.26,'#efffee','#21473b').position.y=.30;box(prop,.46,.08,.43,0,-.31,.12,0xb59972);box(prop,.46,.37,.06,0,-.10,-.06,0xb59972);for(const s of [-1,1])box(prop,.055,.38,.055,s*.18,-.53,.12,0x525e63);page(secondary,'ABSENT',.67,.43);break;
 case 'dance':for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)box(prop,.42,.025,.42,x*.44,.02,z*.44,[0xff5bca,0x54c8ef,0xffdb72][(x+z+6)%3]);for(const s of [-1,1]){ball(secondary,.09,s*.40,0,0,0xff9be6);tube(secondary,[[s*.40,0,0],[s*.40,.36,0],[s*.22,.29,0]],.025,0xff9be6);}break;
 case 'bouncer':humanoid(prop,0x182431);box(prop,.13,.47,.26,0,.04,.01,0xf5f2e5);box(prop,.07,.34,.04,0,.10,.16,0x262d3c);for(const s of [-1,1]){box(prop,.15,.055,.10,s*.08,.48,.13,0x101624);box(prop,.45,.13,.18,s*.08,.06,.17,0x182431).rotation.z=s*.12;}text(prop,'BOUNCER',.82,.25).position.y=.91;box(secondary,.12,.22,.045,0,0,0,0x182431);box(secondary,.085,.15,.01,0,.01,.027,0x83cbd5);prop.scale.setScalar(1.20);break;
 case 'water':mug(prop,true);for(let i=0;i<5;i++)ball(secondary,.035,Math.sin(i*2)*.20,i*.09,0,0x83e9ff);break;
 case 'beer':mug(prop);for(let i=0;i<9;i++)ball(secondary,.035+(i%3)*.012,Math.cos(i*2.4)*.38,Math.sin(i*2.4)*.30,Math.sin(i)*.15,0xf0bb3d);break;
 case 'pen':mesh(prop,new THREE.CylinderGeometry(.032,.032,.76,10),0,0,0,0xe33e36).rotation.z=-.5;mesh(prop,new THREE.ConeGeometry(.035,.13,8),.21,-.39,0,0xeee3c0).rotation.z=Math.PI-.5;tube(secondary,[[-.50,.35,0],[0,-.10,0],[.40,-.35,0]],.055,0xf54343);break;
 case 'curve':{const shape=new THREE.Shape();shape.moveTo(-.55,-.28);shape.quadraticCurveTo(0,-.55,.55,-.28);shape.lineTo(.55,.36);shape.quadraticCurveTo(0,.08,-.55,.36);shape.closePath();mesh(prop,new THREE.ExtrudeGeometry(shape,{depth:.06,bevelEnabled:false}),0,0,0,0xffefd3);tube(secondary,[[-.44,-.20,0],[-.16,-.13,0],[.12,.08,0],[.40,.23,0]],.032,0xff5149);text(prop,'CURVED',.79,.20,'#bd2828','#fff4d6').position.y=.37;break;}
 case 'brian':box(prop,.56,.39,.18,0,0,0,0x7ac6c1);box(prop,.43,.22,.04,0,.015,.11,0x183849);for(const s of [-1,1])ball(prop,.047,s*.12,.015,.15,0x98ffe3);tube(prop,[[0,.19,0],[0,.33,0]],.023,0x77dcbe);ball(prop,.06,0,.36,0,0x77dcbe);text(prop,'BRIAN AI',.75,.23).position.y=-.35;star(secondary,.22);text(secondary,'+ ADVICE',.87,.24,'#144838','#b4ffe0').position.y=.32;break;
 case 'failed':box(prop,.17,.35,.16,0,.26,0,0x65372f);box(prop,.88,.27,.22,0,0,0,0xd72e39);text(prop,'FAILED',.84,.24,'#fff1de','#b91f32').position.z=.13;page(secondary,'',.85,1.0);{const print=new THREE.Group();print.name='contact print';secondary.add(print);text(print,'FAILED',.76,.23,'#fff1de','#b91f32').position.y=.22;tube(print,[[-.20,-.02,.07],[.22,-.36,.07]],.032,0xe43439);tube(print,[[-.20,-.36,.07],[.22,-.02,.07]],.032,0xe43439);}break;
 }
 // A small readable contact burst; the named prop supplies the semantic impact. No screen flash.
 for(let i=0;i<6;i++){const a=i*Math.PI/3;const s=star(impact,.055);s.position.set(Math.cos(a)*.30,Math.sin(a)*.30,0);}
 const used=new Set();group.traverse(o=>{if(o.material)used.add(o.material);});for(const m of palette.values())if(!used.has(m))m.dispose();
 group.userData.parts={prop,secondary,impact};group.userData.labels=labels;return group;
}

function rigOffset(f,name,x=0,y=0,z=0){const bone=f.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));if(bone)bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z))).normalize();}
function restoreFighter(f){if(!f?.home)return;for(const [material,color]of f.costume||[])material.color.copy(color);f.holder.position.copy(f.home.position);f.holder.quaternion.copy(f.home.rotation);f.holder.scale.copy(f.home.scale);}

// Resolve a two-segment limb in world space, preserving segment lengths and a deliberate bend plane.
// The shipped rigs have different bind axes; Euler offsets alone cannot place a hand or plant a foot.
function solveLimb(f,side,kind,goal,hint,endRotation){
 const names=kind==='leg'?['thigh','shin','foot']:['upperarm','forearm','hand'];
 const [upper,lower,end]=names.map(n=>f.root.getObjectByName(side+n));if(!upper||!lower||!end)return goal.clone();
 f.holder.updateMatrixWorld(true);
 const a=upper.getWorldPosition(new THREE.Vector3()),b=lower.getWorldPosition(new THREE.Vector3()),c=end.getWorldPosition(new THREE.Vector3());
 const l1=a.distanceTo(b),l2=b.distanceTo(c),delta=goal.clone().sub(a),d=THREE.MathUtils.clamp(delta.length(),Math.abs(l1-l2)+.001,l1+l2-.002),axis=delta.normalize();
 const bend=hint.clone().sub(a).addScaledVector(axis,-hint.clone().sub(a).dot(axis)).normalize();
 const x=(l1*l1-l2*l2+d*d)/(2*d),joint=a.clone().addScaledVector(axis,x).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-x*x)));
 const aim=(bone,child,point)=>{const origin=bone.getWorldPosition(new THREE.Vector3()),from=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize(),to=point.clone().sub(origin).normalize();const q=new THREE.Quaternion().setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));f.holder.updateMatrixWorld(true);};
 aim(upper,lower,joint);aim(lower,end,a.clone().addScaledVector(axis,d));
 if(endRotation){end.quaternion.copy(end.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(endRotation));f.holder.updateMatrixWorld(true);}
 return end.getWorldPosition(new THREE.Vector3());
}
export function isolateHeldAccessories(f){
 if(f.accessories)return f.accessories;f.accessories=[];const candidates=[];
 f.root.traverse(o=>{if(o.isSkinnedMesh&&o.material?.name==='ink charcoal')candidates.push(o);});
 for(const mesh of candidates){const geometry=mesh.geometry,skin=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
  const joint=mesh.skeleton.bones.findIndex(b=>b.name==='lefthand');if(joint<0||!skin||!weights)continue;
  const held=i=>[0,1,2,3].every(k=>weights.getComponent(i,k)<.0001||skin.getComponent(i,k)===joint);
  const indices=geometry.index?Array.from(geometry.index.array):Array.from({length:geometry.attributes.position.count},(_,i)=>i),body=[],cover=[];
  for(let i=0;i<indices.length;i+=3){const tri=indices.slice(i,i+3);(tri.every(held)?cover:body).push(...tri);}if(!cover.length)continue;
  // Clone only the index, retaining all original skin attributes and exact body triangles.
  const kept=geometry.clone();kept.setIndex(body);mesh.geometry=kept;
  const cut=geometry.clone();cut.setIndex(cover);const accessory=new THREE.SkinnedMesh(cut,mesh.material);accessory.name='isolated original exam cover';accessory.position.copy(mesh.position);accessory.quaternion.copy(mesh.quaternion);accessory.scale.copy(mesh.scale);accessory.bindMode=mesh.bindMode;accessory.bind(mesh.skeleton,mesh.bindMatrix);accessory.castShadow=mesh.castShadow;mesh.parent.add(accessory);f.accessories.push(accessory);geometry.dispose();
 }return f.accessories;
}
function captureMotionRig(f){
 f.holder.updateMatrixWorld(true);const pose=[];f.root.traverse(o=>{if(o.isBone)pose.push([o,o.position.clone(),o.quaternion.clone().normalize(),o.scale.clone()]);});
 const point=(name,fallback)=>f.root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3())||f.holder.localToWorld(v(fallback));
 return {pose,feet:['left','right'].map((side,i)=>({position:point(side+'foot',[i?.12:-.12,.14,0]),rotation:f.root.getObjectByName(side+'foot')?.getWorldQuaternion(new THREE.Quaternion())||f.home.rotation.clone()})),head:f.holder.worldToLocal(point('head',[0,1.5,0])),hands:['left','right'].map((side,i)=>f.holder.worldToLocal(point(side+'hand',[i?.28:-.28,1.03,.16])))};
}
// A foot stays at its previous world-space plant until its own swing. Distance, not elapsed time,
// advances the stride. The final two steps gather both feet before the actor settles.
export function plantedStep(distance,total,leg){
 if(total<=.001)return {distance:0,lift:0};const steps=Math.max(2,Math.ceil(total/.40)),stride=total/steps,q=THREE.MathUtils.clamp(distance/stride,0,steps);
 let plant=0;for(let i=leg;i<steps;i+=2){const end=i>=steps-2?total:(i+1)*stride;if(q<i)return {distance:plant,lift:0};if(q<i+1){const u=q-i;return {distance:THREE.MathUtils.lerp(plant,end,ease(u)),lift:Math.sin(Math.PI*u)*.095};}plant=end;}
 return {distance:plant,lift:0};
}
export function projectilePosition(source,destination,progress,duration,gravity=0){
 const u=THREE.MathUtils.clamp(progress,0,1),p=source.clone().lerp(destination,u);p.y+=.5*gravity*duration*duration*u*(1-u);return p;
}

// Absolute timeline over a neutral idle sample: no generic punch/jump underneath a drinking or reading gesture.
export function choreograph(world,progress){
 const e=world.active,f=world.fighters[e.actor],target=world.fighters[e.target],r=world.fx.userData.recipe;
 const {prop,secondary,impact}=world.fx.userData.parts,reduced=world.motion.matches,moving=!reduced,t=reduced?.59:progress;
 const a=f.home.position,b=target.home.position,opponent=world.fighters[e.actor==='A'?'B':'A'],dir=opponent.home.position.clone().sub(a).setY(0).normalize();
 const launch=e.ability.launch,hit=e.ability.impact,releaseAt=r.mode==='melee'?.46:launch,u=THREE.MathUtils.clamp((t-releaseAt)/(hit-releaseAt),0,1),flight=ease(u),weight=ramp(t,.025,.15)*(1-ramp(t,.82,1));
 restoreFighter(f);if(target!==f)restoreFighter(target);
 const rig=f.motionRig;for(const [bone,p,q,s]of rig.pose){bone.position.copy(p);bone.quaternion.copy(q);bone.scale.copy(s);}
 const reach=r.mode==='melee'?Math.min(1.15,Math.max(0,a.distanceTo(b)-.90)):0,out=reach*ramp(t,.075,.42),back=reach*ramp(t,.70,.985),distance=moving?out-back:0;
 f.holder.position.addScaledVector(dir,distance);
 if(moving&&reach)f.holder.position.y-=.075*(ramp(t,.055,.13)*(1-ramp(t,.40,.47))+ramp(t,.68,.75)*(1-ramp(t,.96,1)));
 const wind=pulse(t,.025,.22,.48)*weight,act=ramp(t,.37,hit)*(1-ramp(t,.67,.86))*weight;
 const body=(name,x=0,y=0,z=0)=>rigOffset(f,name,x*(moving?1:.4),y*(moving?1:.4),z*(moving?1:.4));
 body('pelvis',0,0,-.035*wind);body('spine',.035*wind,0,.02*wind);
 // Follow-through resolves after the authoritative contact, never before it.
 const follow=pulse(t,hit,.66,.84);body('chest',.06*act,0,0);body('head',-.025*act,0,0);
 const local=(x,y,z)=>f.holder.localToWorld(new THREE.Vector3(x,y,z));
 let left=new THREE.Vector3(-.28,1.03,.16),right=new THREE.Vector3(.28,1.03,.16),twoHand=false;
 switch(r.gesture){
 case 'write':right.set(.25-.12*act,1.15+.12*wind-.15*follow,.14+.39*act);body('chest',.04*act,-.13*wind+.16*follow);break;
 case 'read':twoHand=true;body('head',.12*weight);break;
 case 'thumb':right.set(.28,1.12+.13*act,.20+.13*act);body('head',.075*pulse(t,.48,.59,.72));break;
 case 'stamp':right.set(.22,1.16+.35*wind-.12*act,.18+.35*act);left.set(-.22,1.04,.28);body('chest',.13*pulse(t,.23,.40,.56));break;
 case 'copy':left.set(-.26,1.08,.29);right.set(.27,1.08+.12*wind,.26+.24*ramp(t,.20,launch));body('chest',0,-.08*wind+.10*follow);break;
 case 'fold':twoHand=true;body('chest',.11*weight);f.holder.position.y-=moving?.035*act:0;break;
 case 'claim':left.set(-.31-.08*act,1.04+.12*act,.24);right.set(.31+.08*act,1.04+.12*act,.24);body('head',-.05*act);break;
 case 'type':twoHand=true;body('head',.12*wind);body('chest',.08*wind);for(const [i,side]of ['left','right'].entries())for(const finger of ['index1','middle1'])body(side+'.'+finger,(.08+.06*Math.sin(t*65+i*Math.PI+(finger==='index1'?0:1.4)))*wind);break;
 case 'solve':left.set(-.23,1.08,.25);right.set(.23,1.19+.04*Math.sin(t*24)*wind,.30+.12*act);body('head',0,-.07*wind);break;
 case 'brace':twoHand=true;body('chest',-.07*act);f.holder.position.y-=moving?.045*weight:0;break;
 case 'climb':right.set(.26,1.18+.34*act,.17);body('chest',.045*act);f.holder.position.y+=moving?.055*act:0;break;
 case 'present':left.set(-.30,1.08,.20);right.set(.27,1.13+.23*wind,.30+.16*ramp(t,.20,launch));body('chest',.09*pulse(t,.70,.79,.94));break;
 case 'jinx':right.set(.24,1.18,.20+.30*act);left.set(-.28,1.12,.17);body('chest',-.06*wind);body('head',0,-.08*wind,-.04*wind);break;
 case 'hood':left.set(-.24,1.28+.20*ramp(t,.10,.43),.11);right.set(.24,1.28+.20*ramp(t,.10,.43),.11);body('head',.10*act);break;
 case 'undress':left.set(-.24-.11*act,1.20+.42*wind,.20);right.set(.24+.11*act,1.20+.42*wind,.20);body('chest',-.07*act);break;
 case 'sneak':body('chest',.13*weight);body('head',0,-.19*wind);f.holder.position.addScaledVector(new THREE.Vector3(dir.z,0,-dir.x),moving?-.42*(ramp(t,.12,.50)-ramp(t,.62,.94)):0);break;
 case 'dance':{const beat=moving?Math.sin((t-.43)*Math.PI*10)*pulse(t,.42,.58,.72):0;left.set(-.29-.08*act,1.12+.18*act+.05*beat,.24);right.set(.29+.08*act,1.12+.18*act-.05*beat,.24);body('chest',0,beat*.10,beat*.045);f.holder.position.y-=Math.abs(beat)*.025;break;}
 case 'call':right.set(.25,1.09+.32*wind,.15);left.set(-.27,1.10,.25);body('head',0,-.10*wind);break;
 case 'drink':right.set(.23-.10*act,1.10+.29*act,.28);body('head',-.035*act);break;
 case 'throw':right.set(.29,1.16+.31*wind,.08+.40*ramp(t,.19,launch));left.set(-.28,1.10,.22);body('chest',0,-.15*wind+.20*follow);break;
 case 'slash':right.set(.28-.14*act,1.23+.16*wind-.19*follow,.17+.35*act);body('chest',0,-.16*wind+.19*follow);break;
 case 'curve':twoHand=true;body('head',.08*wind);break;
 case 'consult':left.set(-.26,1.06,.28);right.set(.23,1.10,.29);body('head',.10*wind-.04*act);break;
 case 'slam':right.set(.15,1.16+.36*wind-.13*act,.19+.35*act);left.set(-.18,1.13+.30*wind-.10*act,.20+.30*act);body('chest',.14*pulse(t,.23,.40,.56));break;
 }
 f.holder.updateMatrixWorld(true);
 // Foot placement is evaluated against the unchanged floor, including standing gestures and sideways sneaking.
 if(moving)for(const [i,side]of ['left','right'].entries()){
  const plant=rig.feet[i],goal=plant.position.clone();
  if(reach){const returning=t>=.70,step=plantedStep(returning?back:out,reach,i);goal.addScaledVector(dir,returning?reach-step.distance:step.distance);goal.y+=step.lift;}
  if(r.gesture==='sneak'){const returning=t>=.62,step=plantedStep(.42*ramp(t,returning?.62:.12,returning?.94:.50),.42,i);goal.addScaledVector(new THREE.Vector3(dir.z,0,-dir.x),-(returning?.42-step.distance:step.distance));goal.y+=step.lift;}
  if(r.gesture==='climb'&&i===0){goal.addScaledVector(dir,.19*act);goal.y+=.20*act;}
  if(r.gesture==='dance'){const pad=a.clone().addScaledVector(dir,reach);goal.y+=.030*ramp(.59-Math.abs(goal.x-pad.x),0,.08)*ramp(.59-Math.abs(goal.z-pad.z),0,.08);}
  if(r.gesture==='dance'&&t>.42&&t<.73)goal.y+=Math.max(0,Math.sin((t-.43)*Math.PI*10+i*Math.PI))*.065*pulse(t,.42,.58,.73);
  solveLimb(f,side,'leg',goal,local(i?-.02:.02,.45,1),plant.rotation);
 }
 // Skin weights extend the rubber sole slightly below the ankle's rigid plane when the knee bends.
 const sole=new THREE.Box3().setFromObject(f.holder,true).min.y;if(moving&&sole<a.y){f.holder.position.y+=a.y-sole;f.holder.updateMatrixWorld(true);}
 // A two-hand prop's grip points are on its actual edges, not near a screen-space icon.
 const displayQ=world.propRotation||world.camera.quaternion,center=local(0,1.09,.31);
 // Surface frame tilted upward toward the stamp hand (not an upright billboard).
 let stampFrame,drinkFrame,jacketFrame;
 if(r.gesture==='stamp'||r.gesture==='slam'){
  const q=f.holder.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.95,0,0))),scale=.68*.65;
  const paper=local(.065,1.17,.16),press=ramp(t,.22,.385),recoil=ramp(t,.415,.46),gap=.065*(1-press)+.035*recoil;
  const size=r.prop==='marks'?.68*.85:.68*.60,baseHalf=r.prop==='marks'?.09:.135;
  const stampQ=q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(v([1,0,0]),Math.PI/2));
  const stamp=paper.clone().add(v([0,.03*scale,.0225*scale+gap+baseHalf*size]).applyQuaternion(q));
  stampFrame={q,paper,stampQ,stamp,scale,size};
  left=f.holder.worldToLocal(paper.clone().add(v([-.30*scale,-.22*scale,0]).applyQuaternion(q)));
  right=f.holder.worldToLocal(stamp.clone().add(v([0,r.prop==='marks'?.24:.30,0]).multiplyScalar(size).applyQuaternion(stampQ)));
 }
 if(r.gesture==='drink'){
  const sip=ramp(t,.28,.53)*(1-ramp(t,.68,.84)),tilt=.85*ramp(t,.44,.55)*(1-ramp(t,.66,.79));
  const q=f.holder.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(v([1,0,0]),-tilt));
  // Model authored at Blender (0,-.247,2.952), relative to head bind (0,0,2.68).
  const mouth=f.root.getObjectByName('head')?.localToWorld(v([0,.272,.247]))||local(0,1.50,.15),size=.68*.78;
  const rim=v([0,.17,-.14]).multiplyScalar(size).applyQuaternion(q),cup=local(.24,1.08,.30).lerp(mouth.clone().sub(rim),sip);
  drinkFrame={q,cup,size};right=f.holder.worldToLocal(cup.clone().add(v([.14,-.02,0]).multiplyScalar(size).applyQuaternion(q)));
 }
 if(r.gesture==='undress'){
  // Reverse the same overhead path on recovery; no instant green restoration.
  const peel=ramp(t,.10,.34),lower=ramp(t,.39,.52),redress=ramp(t,.69,.79),seat=ramp(t,.81,.94);
  const height=1.14+.68*peel-.64*lower+.64*redress-.68*seat,front=.25+.12*lower-.12*redress;
  const exposure=ramp(t,.265,.34)*(1-ramp(t,.825,.93));
  const garment=ramp(t,.27,.345)*(1-ramp(t,.82,.93));jacketFrame={height,front,exposure,garment};
  left.set(-.23,height,front);right.set(.23,height,front);
 }
 if(twoHand){const half=r.prop==='textbook'?.27:.25;left=f.holder.worldToLocal(center.clone().add(new THREE.Vector3(-half,-.06,.02).applyQuaternion(displayQ)));right=f.holder.worldToLocal(center.clone().add(new THREE.Vector3(half,-.06,.02).applyQuaternion(displayQ)));}
 const blendGoal=(side,point)=>local(...rig.hands[side==='left'?0:1].clone().lerp(point,weight).toArray());

 const lh=solveLimb(f,'left','arm',blendGoal('left',left),local(-.70,.85,.08));
 const rh=solveLimb(f,'right','arm',blendGoal('right',right),local(.70,.85,.08));
 const source=rh.clone(),head=local(...rig.head.toArray()),torso=local(0,1.10,.18);
 const targetHead=target.root.getObjectByName('head')?.getWorldPosition(new THREE.Vector3())||b.clone().add(v([0,1.5,0]));
 const dest=world.contactPoint?.clone()||b.clone().add(v([0,targetHead.y-b.y-.28,0])).addScaledVector(dir,-.25);
 const arrival=reduced?1:u,origin=world.releasePoint||source,seconds=e.ability.duration*(hit-releaseAt)/1000;
 const flying=projectilePosition(origin,dest,arrival,seconds,r.mode==='lob'?9.81:1.5);
 world.fx.position.set(0,0,0);world.fx.quaternion.identity();world.fx.scale.setScalar(1);
 const reveal=reduced?1:ramp(t,.045,.12)*(1-ramp(t,.84,.97));world.fx.visible=reveal>0;
 for(const part of [prop,secondary,impact]){part.visible=true;part.position.copy(torso);part.quaternion.copy(displayQ);part.scale.setScalar(.68*reveal);}
 secondary.visible=t>=launch&&t<.84;impact.visible=e.actor!==e.target&&t>=hit&&t<hit+.105;impact.position.copy(dest);impact.scale.setScalar(.38*(1-ramp(t,hit,hit+.105)));
 if(twoHand)prop.position.copy(lh).add(rh).multiplyScalar(.5).add(new THREE.Vector3(0,.04,0).applyQuaternion(displayQ));
 const contact=ramp(t,.43,hit)*(1-ramp(t,.64,.76));
 const standProp=()=>prop.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),new THREE.Euler().setFromQuaternion(displayQ,'YXZ').y);
 if(r.mode==='melee'&&r.gesture!=='dance')prop.position.copy(source);
 switch(r.prop){
 case 'chalk':case 'pen':prop.position.copy(source);prop.rotateZ((r.prop==='chalk'?-.65:-.5)+.75*contact);secondary.position.copy(flying);secondary.scale.setScalar(.45*ramp(t,releaseAt,releaseAt+.035)*(1-ramp(t,hit,hit+.10)));secondary.visible=t>=releaseAt&&t<hit+.10;break;
 case 'open-book':for(const [i,c]of prop.children.entries())c.rotation.y=(i===0?1:-1)*(1-ramp(t,.12,.40))*.85;secondary.visible=false;break;
 case 'praise':prop.position.copy(rh).add(v([0,.14,0]));prop.scale.multiplyScalar(.64);secondary.position.copy(head).add(v([0,.42,0]));break;
 case 'marks':case 'failed':{const p=stampFrame;prop.position.copy(p.stamp);prop.quaternion.copy(p.stampQ);prop.scale.setScalar(p.size*reveal);secondary.position.copy(t<releaseAt?p.paper:flying);secondary.quaternion.copy(p.q);secondary.scale.setScalar(p.scale*reveal*(1-ramp(t,hit,hit+.10)));secondary.visible=t>.12&&t<hit+.10;secondary.getObjectByName('contact print').visible=t>=.385;break;}
 case 'copies':prop.position.copy(lh).add(v([0,.10,0]));prop.scale.multiplyScalar(.70);secondary.position.copy(t<launch?rh:flying);secondary.scale.multiplyScalar(.70*(1-ramp(t,hit,hit+.07)));secondary.visible=t>.20&&t<hit+.07;break;
 case 'decoy':standProp();prop.position.copy(a).addScaledVector(dir,.56).add(v([0,.73,0]));prop.scale.setScalar(.94*ramp(t,.12,.40)*(1-ramp(t,.80,.97)));prop.position.y=a.y+.69*prop.scale.y;secondary.position.copy(prop.position).add(v([0,.81,0]));break;
 case 'group':standProp();prop.position.copy(a).addScaledVector(new THREE.Vector3(dir.z,0,-dir.x),-.83).add(v([0,.47,0]));prop.scale.setScalar(.63*reveal);prop.position.y=a.y+.69*prop.scale.y;secondary.position.copy(lh).add(rh).multiplyScalar(.5).add(v([0,.21,0]));break;
 case 'slop':prop.rotateX(-.08);secondary.position.copy(t<launch?rh:flying);secondary.scale.multiplyScalar(.72*(1-ramp(t,hit,hit+.065)));secondary.visible=t>.25&&t<hit+.065;break;
 case 'formula':prop.position.copy(lh).add(v([0,.22,0]));prop.scale.multiplyScalar(.65);secondary.position.copy(t<launch?rh:flying);secondary.rotateZ(arrival*.45);secondary.scale.multiplyScalar(.65*(1-ramp(t,hit,hit+.065)));secondary.visible=t>.20&&t<hit+.065;break;
 case 'textbook':prop.scale.multiplyScalar(.77);secondary.visible=false;break;
 case 'credit':prop.position.copy(a).addScaledVector(dir,.19).add(v([0,.12,0]));prop.quaternion.copy(f.home.rotation);prop.scale.setScalar(.88*reveal);prop.position.y=a.y+.1125*prop.scale.y;secondary.position.copy(rh).add(v([0,.13,0]));break;
 case 'grade':prop.position.copy(t<launch?rh:flying);prop.rotateZ(.18*Math.sin(Math.PI*arrival));prop.scale.multiplyScalar(.62*(1-ramp(t,hit,hit+.065)));prop.visible=t<hit+.065;secondary.visible=false;break;
 case 'storm':{prop.position.copy(dest);const crown=Number.isFinite(world.contactTop)?world.contactTop:targetHead.y+.4,amount=reveal*ramp(t,.20,.40);prop.position.y=crown+(reduced?-.25:.40*amount);prop.scale.setScalar(reduced?.34:.68*amount);const span=prop.position.y-.14-dest.y;secondary.position.copy(dest);secondary.scale.y=span/.56;secondary.position.y+=.38*secondary.scale.y;secondary.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),new THREE.Euler().setFromQuaternion(displayQ,'YXZ').y);secondary.visible=t>=hit&&t<hit+.13;impact.visible=false;break;}
 case 'hood':prop.position.copy(head).add(v([0,.14+.17*(1-ramp(t,.12,.43)),0]));prop.quaternion.copy(f.home.rotation);prop.scale.setScalar(.78*reveal);secondary.visible=false;break;
 case 'jacket':{const p=jacketFrame;prop.position.copy(lh).add(rh).multiplyScalar(.5);prop.quaternion.copy(f.holder.quaternion);prop.scale.set(.52*p.garment,.52*p.garment,.52*p.garment);prop.visible=p.garment>.001;secondary.position.copy(head).add(v([0,.38,0]));secondary.visible=t>=.37&&t<.68;f.costume??=[];if(!f.costume.length)f.root.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])if(m.name==='HSG forest green')f.costume.push([m,m.color.clone()]);});for(const [m,c]of f.costume)m.color.copy(c).lerp(new THREE.Color(0xf0ecd9),p.exposure);break;}
 case 'lecture':standProp();prop.position.copy(a).addScaledVector(dir,.90).add(v([0,.66,-.12]));prop.scale.setScalar(.85*reveal);prop.position.y=a.y+.72*prop.scale.y;secondary.position.copy(flying);secondary.scale.multiplyScalar(.65*(1-ramp(t,hit,hit+.08)));secondary.visible=t>=launch&&t<hit+.08;break;
 case 'dance':prop.position.copy(a).addScaledVector(dir,reach);prop.quaternion.identity();prop.scale.setScalar(.90*reveal);secondary.position.copy(head).add(v([0,.28,0]));impact.visible=false;break;
 case 'bouncer':standProp();prop.position.copy(a).add(v([e.actor==='A'?-.40:.40,0,.75]));prop.scale.setScalar(1.35*reveal*ramp(t,.18,.43));prop.position.y=a.y+.69*prop.scale.y;secondary.position.copy(rh);secondary.scale.setScalar(.88*reveal);secondary.visible=t<.49;break;
 case 'water':prop.position.copy(drinkFrame.cup);prop.quaternion.copy(drinkFrame.q);prop.scale.setScalar(drinkFrame.size*reveal);secondary.position.copy(prop.position).add(v([0,.24,0]));secondary.visible=t>=hit&&t<.70;break;
 case 'beer':prop.position.copy(t<launch?rh:flying);prop.rotateZ(-arrival*1.05);prop.scale.multiplyScalar(.85*(1-ramp(t,hit,hit+.045)));prop.visible=t<hit+.045;secondary.position.copy(dest);secondary.scale.setScalar(.55*ramp(t,hit,hit+.05)*(1-ramp(t,.72,.82)));secondary.visible=t>=hit&&t<.82;break;
 case 'curve':prop.scale.x*=1-.12*act;secondary.position.copy(prop.position).add(new THREE.Vector3(0,0,.07).applyQuaternion(displayQ));secondary.scale.multiplyScalar(.75);break;
 case 'brian':prop.position.copy(lh).add(v([0,.30,0]));prop.scale.multiplyScalar(.70*ramp(t,.14,.34));secondary.position.copy(rh).add(v([0,.21,0]));break;

 }
 world.fx.userData.release=(stampFrame?stampFrame.paper:source).clone();world.fx.userData.destination=dest.clone();
 world.fx.updateMatrixWorld(true);
 // Stationary solids do not billboard with the camera; only their graphic labels face the audience.
 for(const label of world.fx.userData.labels){if(label.parent.name==='contact print')continue;const q=label.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world.camera.quaternion);label.quaternion.copy(q);}
 return {recipe:r,focus:r.mode==='self'?torso:a.clone().lerp(b,.5).add(v([0,1.0,0])),flight,weight:ramp(t,0,.34)*(1-ramp(t,.74,1))};
}

export class BattleWorld {
 constructor() {
  this.events = new BattleEvents();this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.fighters={};this.generation=0;
  this.onMotion=()=>{this.selection=null;if(this.active&&this.camera)this.animate(performance.now());else this.idleCamera(performance.now());};this.motion.addEventListener('change',this.onMotion);
  this.onHide=()=>{if(document.hidden){this.disconnect();this.onSkip?.();}else if(this.state)this.sync(this.state);};document.addEventListener('visibilitychange',this.onHide);
  this.onPage=()=>this.dispose();window.addEventListener('pagehide',this.onPage);
 }
 sync(state) {
  this.state=state;
  const screen=document.body.dataset.screen;
  const host=screen==='battle',phone=screen==='player' && state.phase!=='lobby';
  if(!host&&!phone){this.clear();return;}
  if(document.hidden){this.events.reset();this.events.consume(state);if(this.events.scope+':'+this.events.number!==this.hiddenNumber){this.hiddenNumber=this.events.scope+':'+this.events.number;queueMicrotask(()=>this.onSkip?.());}return;}
  const container=host?document.querySelector('.fight-stage'):document.querySelector('#player-world');
  const scope=[state.roomId,state.match,state.arenaId,state.teams.A.characterId,state.teams.B.characterId].join(':');
  if(this.scope!==scope||this.container!==container){this.clear();this.scope=scope;this.container=container;this.events.consume(state);this.ready=this.load(state);}
  else this.events.consume(state);
  if(state.phase==='lobby')this.cancel();
  else if(this.fallback)this.pumpFallback();
 }
 async load(state) {
  const generation=this.generation;
  const world=ARENA_WORLDS[state.arenaId];
  if(!world){this.fallback=true;this.container.dataset.worldStatus='unavailable';this.container.setAttribute('aria-label','Mensa B: 3D environment not modeled');return;}
  this.config=world;this.container.dataset.worldStatus='loading';this.container.setAttribute('aria-label',state.arenaId==='library'?'Library: both fighters in the modeled 3D arena':'Trischli: both fighters in the modeled 3D arena');
  const roots=[];
  try {
   for(const url of [world.model,...['A','B'].map(t=>modelFor(state.teams[t].characterId)?.model)]) {
    if(!url)throw Error('Unknown fighter');
    const gltf=await loadModel(url);roots.push(gltf);
    if(generation!==this.generation){for(const g of roots)release(g.scene);return;}
   }
   this.scene=new THREE.Scene();this.scene.background=new THREE.Color(state.arenaId==='library'?0xadb6ad:0x151724);
   this.environment=roots[0].scene;
   // Exported punctual lighting is kept bounded; one shared key supplies coherent fighter shadows.
   this.environment.traverse(o=>{if(o.isLight)o.intensity=Math.min(o.intensity,12);if(o.isMesh){o.receiveShadow=true;}});
   // Keep exported fixtures but render at most three non-shadow punctual lights on phones.
   const fixtures=[];this.environment.traverse(o=>{if(o.isLight)fixtures.push(o);});fixtures.sort((a,b)=>b.intensity-a.intensity);for(const light of fixtures.slice(3))light.visible=false;
   this.scene.add(this.environment,new THREE.HemisphereLight(0xdceaff,0x4d4940,state.arenaId==='library'?1.8:1.1));
   const key=new THREE.DirectionalLight(state.arenaId==='library'?0xfff0d8:0xdee7ff,3.3);
   key.position.set(-2,6,-1);key.target.position.set(0,0,-4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);
   Object.assign(key.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:25});key.shadow.bias=-.0004;this.scene.add(key,key.target);
   for(const [i,team] of ['A','B'].entries()) {
    const gltf=roots[i+1],root=gltf.scene;
    // Original cast is 3.9 units tall; use adult metric height, including halo/wings.
    root.scale.setScalar(.52);root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(root);const holder=new THREE.Group();holder.name='fighter-'+team;
    root.position.y-=bounds.min.y;holder.add(root);holder.position.copy(v(world.fighters[i]));
    // glTF export changes Blender's -Y face direction to local +Z.
    const other=v(world.fighters[1-i]);holder.rotation.y=Math.atan2(other.x-holder.position.x,other.z-holder.position.z);
    root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;o.frustumCulled=false;}});
    this.scene.add(holder);const mixer=new THREE.AnimationMixer(root),actions=new Map(gltf.animations.map(c=>[c.name,mixer.clipAction(c)]));
    this.fighters[team]={root,holder,mixer,actions,clip:null,home:{position:holder.position.clone(),rotation:holder.quaternion.clone(),scale:holder.scale.clone()}};
    isolateHeldAccessories(this.fighters[team]);
    this.fighters[team].envelope=fighterEnvelope(this.fighters[team]);
    this.play(team,state.teams[team].hp===0?'defeat':'idle');
    if(state.teams[team].hp===0)mixer.update(1.5);
   }
   this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));
   this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
   this.camera=new THREE.PerspectiveCamera(49,1,.08,80);this.look=v(world.look);this.overview(true);
   this.canvas=this.renderer.domElement;this.canvas.className='battle-world-canvas';this.canvas.setAttribute('aria-hidden','true');
   this.canvas.addEventListener('webglcontextlost',event=>{if(generation!==this.generation)return;event.preventDefault();cancelAnimationFrame(this.raf);this.cancel();this.fallback=true;this.events.consume(this.state);this.container.dataset.worldStatus='error';this.onSkip?.();});this.canvas.addEventListener('webglcontextrestored',()=>{if(generation!==this.generation)return;const current=this.state;this.clear();if(current)this.sync(current);});this.container.prepend(this.canvas);
   this.badge=document.createElement('span');this.badge.className='world-action-label';this.badge.setAttribute('aria-hidden','true');this.container.append(this.badge);
   this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(this.container);this.layout();
   this.container.dataset.worldStatus='ready';this.container.dataset.worldArena=state.arenaId;
   this.fallback=false;
   let last=performance.now();const tick=now=>{if(generation!==this.generation)return;this.raf=requestAnimationFrame(tick);if(document.hidden||now-last<1000/30)return;const dt=Math.min((now-last)/1000,.25);last=now;
    for(const [team,f] of Object.entries(this.fighters))if(!this.motion.matches&&team!==this.active?.actor)f.mixer.update(dt);
    if(!this.active&&this.events.pending.length)this.begin(this.events.pending.shift(),now);
    if(this.active)this.animate(now);else this.idleCamera(now);
    if(this.active&&!this.motion.matches)this.renderer.shadowMap.needsUpdate=true;
    if(this.renderer&&this.scene)this.renderer.render(this.scene,this.camera);
   };this.raf=requestAnimationFrame(tick);
  } catch(error) {
   for(const g of roots)release(g.scene);if(generation!==this.generation)return;
   const scope=this.scope;this.clear();this.scope=scope;this.fallback=true;this.events.consume(this.state);this.container.dataset.worldStatus='error';queueMicrotask(()=>this.onSkip?.());this.container.setAttribute('aria-label','3D arena unavailable. Health and commands still work.');
   console.warn('Arena load failed',error);
  }
 }
 layout(){
  if(!this.renderer)return;const w=this.container.clientWidth,h=Math.max(this.container.clientHeight,1);
  this.renderer.setSize(w,h);this.camera.aspect=w/h;
  const cards=[...this.container.querySelectorAll('.fighter')];
  this.frameTop=cards.length?Math.min(.55,1-2*(Math.max(...cards.map(card=>card.offsetTop+card.offsetHeight))+12)/h):.84;
  if(this.active&&this.camera)this.direct((performance.now()-this.active.startedAt)/this.active.ability.duration);else this.idleCamera(performance.now());
 }
 play(team,clip){const f=this.fighters[team],a=f?.actions.get(clip);if(!a)return;if(clip==='idle'&&f.clip==='idle')return;const old=f.current;a.reset().setLoop(clip==='idle'?THREE.LoopRepeat:THREE.LoopOnce,clip==='idle'?Infinity:1);a.clampWhenFinished=clip!=='idle';a.play();if(old&&old!==a)a.crossFadeFrom(old,.1,false);f.current=a;f.clip=clip;}
 overview(snap=false){if(!this.camera||!this.config)return;this.goal=v(this.config.overview);this.goalLook=v(this.config.look);if(snap)this.frame(this.goal,this.goalLook);}
 frame(position,look){
  this.camera.position.copy(position);this.look.copy(look);
  // Host health cards occupy the upper quarter; all framing stays below them.
  const host=this.container?.classList.contains('fight-stage');
  this.camera.lookAt(this.look);this.camera.updateMatrixWorld(true);
  const inverse=this.camera.matrixWorldInverse,top=this.frameTop??(host?.43:.84),bottom=-.78;
  let tangent=Math.tan(THREE.MathUtils.degToRad(24/2)),minY=Infinity,maxY=-Infinity;
  const framePoints=[];
  for(const f of Object.values(this.fighters)){
   const box=f.envelope||new THREE.Box3().setFromObject(f.holder);
   if(box.isEmpty())continue;
   let points=f.framePoints||[box.min,box.max];
   if(this.choreography&&!this.motion.matches){
    f.holder.updateMatrixWorld(true);const live=new THREE.Box3().setFromObject(f.holder,true).expandByScalar(.07),corners=[];
    for(const x of [live.min.x,live.max.x])for(const y of [live.min.y,live.max.y])for(const z of [live.min.z,live.max.z])corners.push(new THREE.Vector3(x,y,z));
    const blend=this.choreography.weight;points=[...corners,...corners.map((p,i)=>p.clone().lerp(points[i]||p,1-blend))];
    // Hold both bodies for offensive actions: a prop crossing the aisle must never pull the camera off its source.
    const own=f===this.fighters[this.active.actor],self=this.active.actor===this.active.target;
    const presence=self?(own?1:0):1;
    if(presence<1)points=points.map(p=>p.clone().lerp(this.choreography.focus,blend*(1-presence)));

   }
   framePoints.push(...points);
  }
  if(this.fx?.visible&&!this.motion.matches){for(const part of Object.values(this.fx.userData.parts)){if(!part.visible)continue;const box=new THREE.Box3().setFromObject(part);if(box.isEmpty())continue;box.expandByScalar(.04);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])framePoints.push(new THREE.Vector3(x,y,z));}}
  this.framingPoints=framePoints;
  for(const point of framePoints){
    const p=point.clone().applyMatrix4(inverse),depth=Math.max(.1,-p.z);
    tangent=Math.max(tangent,Math.abs(p.x)/(depth*this.camera.aspect*.88));
    minY=Math.min(minY,p.y/depth);maxY=Math.max(maxY,p.y/depth);
  }
  const hasBounds=Number.isFinite(minY);
  if(hasBounds)tangent=Math.max(tangent,(maxY-minY)/(top-bottom));
  this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(tangent));
  // Off-axis framing uses the space below health cards without tilting down onto heads or cropping feet.
  const shift=hasBounds?(top+bottom)/2-(minY+maxY)/(2*tangent):0;
  this.camera.setViewOffset(this.camera.aspect,1,0,shift/2,this.camera.aspect,1);
 }
 direct(t){
  if(this.motion.matches){this.overview(true);return;}
  const shot=actionCamera(this.config,this.active,t,this.camera.aspect);
  if(this.choreography){
   const follow=this.choreography.focus,weight=this.choreography.weight;
   shot.look.lerp(follow,(this.active.actor===this.active.target?.65:.25)*weight);
  }
  this.goal=shot.position;this.goalLook=shot.look;this.canvas.dataset.camera=shot.phase;
  if(this.active.returnFrom&&t<this.active.ability.launch){const blend=ease(t/this.active.ability.launch);shot.position.lerp(this.active.returnFrom,1-blend);}
  this.frame(shot.position,shot.look);
 }
 idleCamera(now){
  if(!this.camera||!this.config)return;
  if(this.motion.matches||this.state?.phase!=='running'){this.overview(true);return;}
  const team=this.state.turn?.team||'A', key=this.state.turn?.id;
  if(!this.selection||this.selection.key!==key)this.selection={key,startedAt:now,from:this.camera.position.clone(),look:this.look.clone()};
  const shot=selectionCamera(this.config,team),t=ease((now-this.selection.startedAt)/650);
  this.frame(this.selection.from.clone().lerp(shot.position,t),this.selection.look.clone().lerp(shot.look,t));
  this.canvas.dataset.camera=shot.phase;
 }
 pumpFallback(){
  if(this.active||!this.events.pending.length)return;
  const event=this.events.pending.shift();this.active=event;
  if(this.container){this.fallbackLabel=document.createElement('span');this.fallbackLabel.className='world-action-label';this.fallbackLabel.textContent=event.ability.label;this.container.append(this.fallbackLabel);}
  // Same completion contract and ability duration without a WebGL renderer.
  this.fallbackTimer=setTimeout(()=>{this.finish();this.onComplete?.(event);this.pumpFallback();},event.ability.duration);
 }
 begin(event,now){
  if(this.active)this.finish();
  const returnFrom=this.selection?this.camera.position.clone():null;this.selection=null;
  this.active={...event,startedAt:now,hit:false,returnFrom};
  for(const f of Object.values(this.fighters)){restoreFighter(f);f.home??={position:f.holder.position.clone(),rotation:f.holder.quaternion.clone(),scale:f.holder.scale.clone()};}
  const actor=this.fighters[event.actor];actor.mixer.stopAllAction();actor.current=null;actor.clip=null;actor.sampledPose=null;this.play(event.actor,'idle');actor.current.time=0;actor.mixer.update(0);actor.motionRig=captureMotionRig(actor);actor.hiddenProps=[];for(const o of isolateHeldAccessories(actor)){actor.hiddenProps.push([o,o.visible]);o.visible=false;}actor.root.traverse(o=>{if(o.isMesh&&['warm note paper','annotation blue','red marking ink'].includes(o.material?.name)){actor.hiddenProps.push([o,o.visible]);o.visible=false;}});
  this.badge.textContent=event.ability.label;this.canvas.dataset.action=event.id;this.canvas.dataset.worldMove=event.move;this.canvas.dataset.actor=event.actor;
  this.fx=createMoveProps(event.ability.label,event.ability.color);this.scene.add(this.fx);this.fx.visible=false;this.propRotation=this.camera.quaternion.clone();this.releasePoint=null;this.contactPoint=null;const receiver=this.fighters[event.target];this.contactTop=receiver.envelope?.max.y??new THREE.Box3().setFromObject(receiver.holder,true).max.y;
  choreograph(this,this.fx.userData.recipe.mode==='melee'?.46:event.ability.launch);this.releasePoint=this.fx.userData.release.clone();this.contactPoint=this.fx.userData.destination.clone();
  this.animate(now);
 }
 animate(now){
  const e=this.active;if(!e)return;
  const t=THREE.MathUtils.clamp((now-e.startedAt)/e.ability.duration,0,1),target=this.fighters[e.target];
  this.choreography=choreograph(this,t);
  if(t>=e.ability.impact&&!e.hit){e.hit=true;if(e.actor!==e.target){this.play(e.target,e.defeated?'defeat':'hit');if(e.defeated)target.current?.setDuration(e.ability.duration*(1-e.ability.impact)/1000);if(this.motion.matches)target.mixer.update(e.defeated?1.5:.35);}}
  this.direct(t);
  if(t>=1){if(e.defeated&&target.current){target.current.time=target.current.getClip().duration;target.mixer.update(0);}this.finish();this.onComplete?.(e);}
 }
 finish(){for(const f of Object.values(this.fighters)){for(const [mesh,visible]of f.hiddenProps||[])mesh.visible=visible;f.hiddenProps=null;restoreFighter(f);f.sampledPose=null;if(f.clip!=='defeat'){f.mixer.stopAllAction();f.current=null;f.clip=null;f.mixer.update(0);} }this.choreography=null;this.releasePoint=null;this.contactPoint=null;this.contactTop=null;this.propRotation=null;clearTimeout(this.fallbackTimer);this.fallbackLabel?.remove();this.fallbackLabel=null;this.selection=null;if(this.fx){this.scene?.remove(this.fx);release(this.fx);this.fx=null;}this.active=null;for(const [team,f]of Object.entries(this.fighters))if(f.clip!=='defeat'){this.play(team,'idle');f.mixer.update(0);}if(this.badge)this.badge.textContent='';if(this.canvas){this.canvas.dataset.camera='overview';delete this.canvas.dataset.action;}this.overview(true);if(this.renderer)this.renderer.shadowMap.needsUpdate=true;}
 cancel(){this.events.reset();this.finish();for(const [t,f] of Object.entries(this.fighters))this.play(t,this.state?.teams[t].hp===0?'defeat':'idle');}
 disconnect(){this.cancel();if(this.state)this.events.consume(this.state);}
 clear(){this.fallback=false;this.generation++;cancelAnimationFrame(this.raf);this.cancel();this.observer?.disconnect();for(const f of Object.values(this.fighters)){f.mixer.stopAllAction();f.mixer.uncacheRoot(f.root);}release(this.scene);this.renderer?.dispose();this.renderer?.forceContextLoss();this.canvas?.remove();this.badge?.remove();if(this.container)delete this.container.dataset.worldStatus;this.renderer=null;this.scene=null;this.fighters={};this.scope=null;this.camera=null;}
 dispose(){this.clear();this.motion.removeEventListener('change',this.onMotion);document.removeEventListener('visibilitychange',this.onHide);window.removeEventListener('pagehide',this.onPage);}
}
