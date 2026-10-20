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
 position.x+=side*THREE.MathUtils.lerp(from,to,travel)*weight*portrait;
 position.z+=push*weight*portrait;position.y+=lift*weight;
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
 'Golden Chalk': {mode:'melee',gesture:'write',prop:'chalk',detail:'Draw back chalk; run in; carve a golden tick; jog home.'},
 'Open Book': {mode:'self',gesture:'read',prop:'open-book',detail:'Lift closed book; open both covers as a shield; read; fold away.'},
 'Good Work': {mode:'self',gesture:'thumb',prop:'praise',detail:'Lean forward; approving thumbs-up and gold star; proud nod; settle.'},
 'Full Marks': {mode:'melee',gesture:'stamp',prop:'marks',detail:'Raise marked exam; stride in; stamp 100% with a gold shower; return.'},
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
 'Dance Off': {mode:'melee',gesture:'dance',prop:'dance',detail:'Run to dance floor; windmill arms and alternate high knees; disco stomp; moonwalk home.'},
 'Call the Bouncer': {mode:'self',gesture:'call',prop:'bouncer',detail:'Phone the door; summon a suited bouncer; fold arms together; dismiss the guard.'},
 'Glass of Water': {mode:'self',gesture:'drink',prop:'water',detail:'Reach for transparent water glass; lift to mouth; sip and sparkle; lower glass.'},
 'Throw a Beer': {mode:'lob',gesture:'throw',prop:'beer',detail:'Cock mug behind shoulder; overarm throw; amber beer arcs and splashes; wipe brow.'},
 'Red Pen': {mode:'melee',gesture:'slash',prop:'pen',detail:'Brandish red pen; run in; draw a broad correction slash; step back home.'},
 'Curved Exam': {mode:'self',gesture:'curve',prop:'curve',detail:'Grip exam ends; physically bend a curved exam shield; trace grade curve; flatten and lower.'},
 'Brian AI': {mode:'self',gesture:'consult',prop:'brian',detail:'Tap a tablet; summon BRIAN robot tutor; receive a green advice heart; thank and close.'},
 'Failed': {mode:'melee',gesture:'slam',prop:'failed',detail:'Hoist a red stamp; charge; slam FAILED onto a report beside opponent; recoil and retreat.'}
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
 case 'marks':page(prop,'100%',.85,1.0);text(secondary,'FULL MARKS',1.16,.28,'#664900','#ffe798');break;
 case 'copies':page(prop,'COPY');page(secondary,'PASTE');break;
 case 'decoy':humanoid(prop,0xfff4d6,true);text(secondary,'NOT ME',.72,.25);break;
 case 'group':for(let i=0;i<3;i++){const p=new THREE.Group();p.position.set((i-1)*.48,0,-.10);humanoid(p,[0x4aaba2,0x7588c7,0xcc8b69][i]);prop.add(p);}star(secondary,.24);text(secondary,'CREDIT',.67,.24).position.y=.34;break;
 case 'slop':box(prop,.65,.045,.4);box(prop,.65,.43,.04,0,.23,-.17,0x243149);text(prop,'AI',.35,.22).position.set(0,.25,-.14);for(let i=0;i<7;i++)tube(secondary,[[Math.sin(i)*.24,-.2,0],[Math.cos(i)*.28,.13,.13],[Math.sin(i+2)*.25,.32,0],[.1,-.25,.18]],.025,i%2?0xf5ce62:0xc386ed);ball(secondary,.21,0,0,0,0x99cbd5);text(secondary,'SLOP',.6,.22).position.y=.40;break;
 case 'formula':text(prop,'x² + y² = A',1.13,.32,'#b7ffce','#21473b');tube(secondary,[[.30,.32,0],[-.30,.32,0],[.03,0,0],[-.30,-.32,0],[.30,-.32,0]],.055,0xa0ffc6);break;
 case 'textbook':box(prop,.85,1.12,.22,0,0,0,0x2c9475);box(prop,.73,1.01,.23,.03,0,.02,0xfff4d6);text(prop,'TEXTBOOK',.74,.25,'#ffffff','#246650').position.z=.15;break;
 case 'credit':for(let i=0;i<3;i++)box(prop,.64-i*.08,.075,.45,0,-.075+i*.075,0,[0x295c79,0x9877bd,0x53ac8e][i]);star(secondary,.27);text(secondary,'+1',.42,.29,'#1c4738','#b7ffce').position.y=.37;break;
 case 'grade':star(prop,.48);text(prop,'A+',.64,.45,'#6b4300','#ffe580').position.z=.10;mesh(secondary,new THREE.TorusGeometry(.54,.035,8,40),0,0,0,0xffcf43);break;
 case 'storm':for(let i=0;i<5;i++)ball(prop,.21,(i-2)*.17,Math.sin(i)*.055,0,0x746da3);tube(secondary,[[.10,.18,0],[-.13,-.06,0],[.09,-.04,0],[-.09,-.38,0]],.047,0xffe88c);for(let i=0;i<7;i++)tube(prop,[[(i-3)*.12,-.23,0],[(i-3)*.12-.05,-.45,0]],.014,0x8ccfff);break;
 case 'hood':{const hood=mesh(prop,new THREE.SphereGeometry(.30,16,10,0,Math.PI*2,0,Math.PI*.72),0,0,0,0x245b48);hood.scale.z=.78;box(prop,.44,.17,.16,0,-.16,0,0x245b48);break;}
 case 'jacket':box(prop,.49,.56,.15,0,0,0,0x245b48);for(const s of [-1,1])box(prop,.17,.46,.14,s*.33,.10,0,0x245b48).rotation.z=s*.70;mesh(prop,new THREE.TorusGeometry(.13,.06,8,20),0,.31,0,0x245b48);star(secondary,.28);text(secondary,'FREEDOM',.90,.25,'#5f4400','#fff0aa').position.y=.40;break;
 case 'lecture':box(prop,1.12,.65,.06,0,.22,0,0x21473b);text(prop,'MATHS A',.98,.26,'#efffee','#21473b').position.y=.30;box(prop,.46,.08,.43,0,-.31,.12,0xb59972);box(prop,.46,.37,.06,0,-.10,-.06,0xb59972);for(const s of [-1,1])box(prop,.055,.38,.055,s*.18,-.53,.12,0x525e63);page(secondary,'ABSENT',.67,.43);break;
 case 'dance':for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)box(prop,.42,.025,.42,x*.44,.02,z*.44,[0xff5bca,0x54c8ef,0xffdb72][(x+z+6)%3]);for(const s of [-1,1]){ball(secondary,.09,s*.40,0,0,0xff9be6);tube(secondary,[[s*.40,0,0],[s*.40,.36,0],[s*.22,.29,0]],.025,0xff9be6);}break;
 case 'bouncer':humanoid(prop,0x182431);box(prop,.13,.47,.26,0,.04,.01,0xf5f2e5);box(prop,.07,.34,.04,0,.10,.16,0x262d3c);for(const s of [-1,1]){box(prop,.15,.055,.10,s*.08,.48,.13,0x101624);box(prop,.45,.13,.18,s*.08,.06,.17,0x182431).rotation.z=s*.12;}text(secondary,'BOUNCER',.82,.25);prop.scale.setScalar(1.20);break;
 case 'water':mug(prop,true);for(let i=0;i<5;i++)ball(secondary,.035,Math.sin(i*2)*.20,i*.09,0,0x83e9ff);break;
 case 'beer':mug(prop);for(let i=0;i<9;i++)ball(secondary,.035+(i%3)*.012,Math.cos(i*2.4)*.38,Math.sin(i*2.4)*.30,Math.sin(i)*.15,0xf0bb3d);break;
 case 'pen':mesh(prop,new THREE.CylinderGeometry(.032,.032,.76,10),0,0,0,0xe33e36).rotation.z=-.5;mesh(prop,new THREE.ConeGeometry(.035,.13,8),.21,-.39,0,0xeee3c0).rotation.z=Math.PI-.5;tube(secondary,[[-.50,.35,0],[0,-.10,0],[.40,-.35,0]],.055,0xf54343);break;
 case 'curve':{const shape=new THREE.Shape();shape.moveTo(-.55,-.28);shape.quadraticCurveTo(0,-.55,.55,-.28);shape.lineTo(.55,.36);shape.quadraticCurveTo(0,.08,-.55,.36);shape.closePath();mesh(prop,new THREE.ExtrudeGeometry(shape,{depth:.06,bevelEnabled:false}),0,0,0,0xffefd3);tube(secondary,[[-.44,-.20,0],[-.16,-.13,0],[.12,.08,0],[.40,.23,0]],.032,0xff5149);text(prop,'CURVED',.79,.20,'#bd2828','#fff4d6').position.y=.37;break;}
 case 'brian':box(prop,.56,.39,.18,0,0,0,0x7ac6c1);box(prop,.43,.22,.04,0,.015,.11,0x183849);for(const s of [-1,1])ball(prop,.047,s*.12,.015,.15,0x98ffe3);tube(prop,[[0,.19,0],[0,.33,0]],.023,0x77dcbe);ball(prop,.06,0,.36,0,0x77dcbe);text(prop,'BRIAN AI',.75,.23).position.y=-.35;star(secondary,.22);text(secondary,'+ ADVICE',.87,.24,'#144838','#b4ffe0').position.y=.32;break;
 case 'failed':box(prop,.17,.35,.16,0,.26,0,0x65372f);box(prop,.88,.27,.22,0,0,0,0xd72e39);text(prop,'FAILED',.84,.24,'#fff1de','#b91f32').position.z=.13;page(secondary,'FAILED',.85,1.0);tube(secondary,[[-.20,-.02,.07],[.22,-.36,.07]],.045,0xe43439);tube(secondary,[[-.20,-.36,.07],[.22,-.02,.07]],.045,0xe43439);break;
 }
 // A small readable contact burst; the named prop supplies the semantic impact. No screen flash.
 for(let i=0;i<6;i++){const a=i*Math.PI/3;const s=star(impact,.055);s.position.set(Math.cos(a)*.30,Math.sin(a)*.30,0);}
 const used=new Set();group.traverse(o=>{if(o.material)used.add(o.material);});for(const m of palette.values())if(!used.has(m))m.dispose();
 group.userData.parts={prop,secondary,impact};group.userData.labels=labels;return group;
}

function rigOffset(f,name,x=0,y=0,z=0){const bone=f.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));if(bone)bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z))).normalize();}
function restoreFighter(f){if(!f?.home)return;for(const [material,color]of f.costume||[])material.color.copy(color);f.holder.position.copy(f.home.position);f.holder.quaternion.copy(f.home.rotation);f.holder.scale.copy(f.home.scale);}

// Absolute normalized timeline: seeking, low FPS, interruption and repeated moves cannot accumulate transforms.
export function choreograph(world,progress){
 const e=world.active,f=world.fighters[e.actor],target=world.fighters[e.target],r=world.fx.userData.recipe;
 const {prop,secondary,impact}=world.fx.userData.parts, reduced=world.motion.matches;
 const t=reduced?.59:progress;
 const a=f.home.position,b=target.home.position,opponent=world.fighters[e.actor==='A'?'B':'A'];
 const dir=opponent.home.position.clone().sub(a).setY(0).normalize();
 const launch=e.ability.launch,hit=e.ability.impact,flight=ramp(t,launch,hit),recovery=1-ramp(t,.76,1),weight=ramp(t,.04,.18)*recovery;
 restoreFighter(f);if(target!==f)restoreFighter(target);
 // Re-evaluate the authored clip before additive joint posing; never compound last frame's bone rotations.
 if(f.sampledPose)for(const [bone,q]of f.sampledPose)bone.quaternion.copy(q);
 if(f.current){f.current.time=Math.min(f.current.getClip().duration-.001,(reduced?.47:t)*f.current.getClip().duration);f.mixer.update(0);}
 f.sampledPose=[];f.root.traverse(o=>{if(o.isBone)f.sampledPose.push([o,o.quaternion.clone()]);});
 const moving=!reduced,reach=r.mode==='melee'?Math.max(0,a.distanceTo(b)-1.20):0;
 const approach=(ramp(t,.13,.43)*(1-ramp(t,.73,1)))*(moving?1:0);
 f.holder.position.addScaledVector(dir,reach*approach);
 const run=moving?Math.sin(t*62)*pulse(t,.12,.30,.46)+Math.sin(t*62)*pulse(t,.74,.85,1):0;
 if(r.mode==='melee') {rigOffset(f,'left.thigh',run*.65);rigOffset(f,'right.thigh',-run*.65);rigOffset(f,'left.shin',Math.max(0,-run)*.60);rigOffset(f,'right.shin',Math.max(0,run)*.60);rigOffset(f,'left.upperarm',-run*.50);rigOffset(f,'right.upperarm',run*.50);f.holder.position.y+=Math.abs(run)*.055;}
 const wind=pulse(t,.02,.25,.56)*weight,act=pulse(t,.31,hit,.84)*weight;
 const pose=(n,x=0,y=0,z=0)=>rigOffset(f,n,x*(moving?1:.30),y*(moving?1:.30),z*(moving?1:.30));
 switch(r.gesture){
 case 'write':pose('chest',.15*wind,-.4*wind+.5*act);pose('right.upperarm',-.8*wind-.5*act,0,-.45*act);pose('right.forearm',-1.0*wind+.75*act);break;
 case 'read':pose('left.upperarm',-.65*weight,0,.18*weight);pose('right.upperarm',-.65*weight,0,-.18*weight);pose('head',.25*weight);break;
 case 'thumb':pose('right.upperarm',-1.1*act,0,-.40*act);pose('right.forearm',-.6*act);pose('head',Math.sin(t*14)*act*.17);break;
 case 'stamp':pose('right.upperarm',-1.9*wind+.6*act);pose('chest',.35*act);pose('left.upperarm',-.4*weight);break;
 case 'copy':pose('left.upperarm',-.75*weight);pose('right.upperarm',-.4*wind-1.2*act,0,-.35*act);pose('right.forearm',-1*wind);break;
 case 'fold':pose('chest',.28*weight);pose('left.upperarm',-.7*wind);pose('right.upperarm',-.7*wind);pose('left.forearm',-.7*weight);pose('right.forearm',-.7*weight);f.holder.position.y-=moving?act*.25:0;break;
 case 'claim':pose('left.upperarm',-.45*wind,0,.9*act);pose('right.upperarm',-.45*wind,0,-1.1*act);pose('head',-.25*act);break;
 case 'type':pose('chest',.30*wind);pose('head',.30*wind);for(const s of ['left','right']){pose(s+'.upperarm',-.65*weight);pose(s+'.forearm',-.7*weight);pose(s+'.hand',Math.sin(t*65+(s==='left'?0:2))*wind*.25);}break;
 case 'solve':pose('right.upperarm',-.8*weight,0,Math.sin(t*20)*wind*.25);pose('right.forearm',-.7*wind);pose('left.upperarm',-.6*act);pose('head',0,-.2*wind);break;
 case 'brace':pose('chest',-.20*act);pose('left.upperarm',-.9*weight);pose('right.upperarm',-.9*weight);pose('left.thigh',-.20*weight);pose('right.thigh',.18*weight);break;
 case 'climb':pose('left.thigh',-.8*wind);pose('left.shin',.65*wind);pose('right.upperarm',-2.1*act);if(moving){f.holder.position.y+=.24*ramp(t,.20,.34)*(1-ramp(t,.84,.96));f.holder.position.addScaledVector(dir,.50*ramp(t,.24,.50)*(1-ramp(t,.74,.90)));}break;
 case 'present':pose('left.upperarm',-1.2*wind,0,.65*act);pose('right.upperarm',-1.8*wind,0,-.65*act);pose('chest',.25*pulse(t,.70,.84,1));break;
 case 'jinx':pose('chest',-.25*wind);pose('head',0,0,-.18*wind);pose('right.upperarm',-1.25*act);pose('left.forearm',-.9*wind);break;
 case 'hood':pose('left.upperarm',-1.7*wind,0,.35*weight);pose('right.upperarm',-1.7*wind,0,-.35*weight);pose('left.forearm',-1.0*weight);pose('right.forearm',-1.0*weight);pose('head',.30*act);break;
 case 'undress':pose('left.upperarm',-1.3*wind,0,1.15*act);pose('right.upperarm',-1.3*wind,0,-1.15*act);pose('chest',-.22*act);break;
 case 'sneak':pose('chest',.28*weight);pose('head',0,-.6*wind);pose('left.thigh',Math.sin(t*45)*weight*.45);pose('right.thigh',-Math.sin(t*45)*weight*.45);f.holder.position.add(new THREE.Vector3(dir.z,0,-dir.x).multiplyScalar(moving?-.65*act:0));break;
 case 'dance':{const beat=moving?Math.sin((t-.30)*38)*act:0;pose('left.upperarm',-.7*act,0,1.1*act+beat*.4);pose('right.upperarm',-.7*act,0,-1.1*act+beat*.4);pose('left.thigh',Math.max(0,beat)*-.9);pose('right.thigh',Math.max(0,-beat)*-.9);pose('chest',0,beat*.35,beat*.20);f.holder.rotation.y+=moving?Math.sin((t-.32)*15)*act*.8:0;f.holder.position.y+=Math.abs(beat)*.12;break;}
 case 'call':pose('right.upperarm',-.5*wind,0,-.5*wind);pose('right.forearm',-1.7*wind);pose('left.upperarm',-.5*act,0,.4*act);pose('head',0,-.25*wind);break;
 case 'drink':pose('right.upperarm',-.8*weight);pose('right.forearm',-1.35*act);pose('head',-.22*act);break;
 case 'throw':pose('chest',0,-.5*wind+.55*act);pose('right.upperarm',-2.2*wind+.5*act,0,-.3*wind);pose('right.forearm',-1.0*wind+.6*act);pose('left.upperarm',-.6*act);break;
 case 'slash':pose('chest',0,-.5*wind+.7*act);pose('right.upperarm',-1.4*wind,0,-.9*act);pose('right.forearm',-.8*wind+.5*act);break;
 case 'curve':pose('left.upperarm',-.8*weight,0,.4*act);pose('right.upperarm',-.8*weight,0,-.4*act);pose('left.forearm',-.5*weight);pose('right.forearm',-.5*weight);break;
 case 'consult':pose('left.upperarm',-.7*weight);pose('right.upperarm',-.8*wind);pose('right.hand',Math.sin(t*25)*wind*.2);pose('head',.25*wind-.12*act);break;
 case 'slam':pose('left.upperarm',-2*wind+.2*act);pose('right.upperarm',-2*wind+.2*act);pose('chest',.50*act);f.holder.position.y+=moving?pulse(t,.32,.47,.62)*.18:0;break;
 }
 if(r.prop==='jacket'){f.costume??=[];if(!f.costume.length)f.root.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])if(m.name==='HSG forest green')f.costume.push([m,m.color.clone()]);});if(t>=launch&&t<.90)for(const [m]of f.costume)m.color.set(0xf0ecd9);}
 f.holder.updateMatrixWorld(true);
 const floor=new THREE.Box3().setFromObject(f.holder,true).min.y;if(moving&&a.y-floor>1e-6)f.holder.position.y+=a.y-floor;f.holder.updateMatrixWorld(true);
 const hand=f.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('right.hand'));
 const source=hand?hand.getWorldPosition(new THREE.Vector3()):f.holder.position.clone().add(v([0,1.15,0]));
 const front=v(world.config.overview).sub(f.home.position).setY(0).normalize().multiplyScalar(.36);
 const torso=f.holder.position.clone().add(v([0,1.10,0])).add(front),dest=b.clone().add(v([0,1.12,0])).add(front);
 world.fx.position.set(0,0,0);world.fx.quaternion.identity();world.fx.scale.setScalar(1);
 for(const p of [prop,secondary,impact]){p.visible=true;p.position.copy(torso);p.quaternion.copy(world.camera.quaternion);p.scale.setScalar(1);}
 const show=progress>.06&&progress<.98;world.fx.visible=show;prop.visible=show&&(!['copies','slop','formula','lecture'].includes(r.prop)||t<.48);secondary.visible=t>launch&&t<.90;impact.visible=t>=hit&&t<.81;
 // Reduced motion is a held semantic tableau, with no run, flight, spin, shake or camera movement.
 const travel=reduced?1:flight;
 if(['projectile','lob'].includes(r.mode)){prop.position.copy(source);secondary.position.copy(source).lerp(dest,travel);secondary.position.y+=moving?Math.sin(flight*Math.PI)*(r.mode==='lob'?.9:.25):0;}
 if(r.mode==='melee'){prop.position.copy(source);secondary.position.copy(dest);}
 impact.position.copy(e.actor===e.target?torso:dest);impact.scale.setScalar(reduced?.7:.55+ramp(t,hit,.81)*1.1);
 if(r.prop==='chalk'||r.prop==='pen'){prop.position.copy(source);prop.rotation.z+=moving?-.6*wind+act:.2;secondary.scale.setScalar(.7+.4*act);}
 if(r.prop==='open-book')for(const [i,c]of prop.children.entries())c.rotation.y=(i===0?1:-1)*(1-ramp(t,.10,.46))*.9;
 if(r.prop==='praise'){prop.position.add(v([.25,.30,0]));secondary.position.add(v([0,.77,0]));}
 if(r.prop==='marks'){prop.position.y+=wind*.5;secondary.position.y+=.35;}
 if(r.prop==='copies'){prop.position.copy(torso).add(v([-.35,.15,0]));secondary.rotation.z+=moving?Math.sin(flight*Math.PI)*.35:0;}
 if(r.prop==='decoy'){prop.position.copy(a).addScaledVector(dir,.55).add(v([0,.85,0]));prop.scale.x=.12+.88*ramp(t,.12,.46);secondary.position.copy(prop.position).add(v([0,.80,0]));}
 if(r.prop==='group'){prop.position.copy(a).add(v([0,.72,-.3]));prop.scale.setScalar(.72);secondary.position.copy(torso).add(v([0,.55,.10]));}
 if(r.prop==='slop'){prop.position.copy(torso).add(v([0,-.12,.12]));secondary.rotation.z+=moving?flight*5:0;}
 if(r.prop==='formula'){prop.position.copy(torso).add(v([0,.45,0]));secondary.rotation.z+=moving?flight*4:0;}
 if(r.prop==='textbook'){prop.scale.x=1+.12*act;prop.position.addScaledVector(dir,.25);}
 if(r.prop==='credit'){prop.position.copy(a).addScaledVector(dir,.50).add(v([0,.12,0]));secondary.position.copy(torso).add(v([0,.95,0]));}
 if(r.prop==='grade'){prop.position.copy(source).lerp(dest,travel);prop.rotation.z+=moving?Math.sin(flight*Math.PI)*.45:0;secondary.position.copy(prop.position);}
 if(r.prop==='storm'){prop.visible=show&&t>=launch;prop.position.copy(dest).add(v([0,.87,0]));secondary.position.copy(dest).add(v([0,.45,0]));secondary.visible=t>.44&&t<.78;}
 if(r.prop==='hood'){prop.position.copy(torso).add(v([0,.52+.24*(1-ramp(t,.10,.52)),0]));secondary.visible=false;}
 if(r.prop==='jacket'){prop.position.copy(torso).add(v([.35*flight,.60*flight,0]));prop.rotation.z+=moving?flight*.65:0;secondary.position.copy(torso).add(v([-.35,.75,0]));}
 if(r.prop==='lecture'){prop.position.copy(a).add(v([0,.72,-.24]));secondary.position.copy(torso).lerp(dest,travel);secondary.position.y+=moving?Math.sin(flight*Math.PI)*.40:0;}
 if(r.prop==='dance'){prop.position.copy(f.holder.position);prop.quaternion.identity();secondary.position.copy(torso).add(v([0,.65,0]));secondary.rotation.z+=moving?Math.sin(t*28)*.3:0;}
 if(r.prop==='bouncer'){prop.scale.setScalar(1.20);prop.position.copy(a).addScaledVector(new THREE.Vector3(dir.z,0,-dir.x).lengthSq()?new THREE.Vector3(dir.z,0,-dir.x):v([1,0,0]),.72).add(v([0,.85,0]));secondary.position.copy(prop.position).add(v([0,.90,0]));}
 if(r.prop==='water'){const mouth=torso.clone().add(v([.18,.39,.14]));prop.position.copy(source).lerp(mouth,ramp(t,.12,.48)*(1-ramp(t,.73,.96)));prop.rotation.z+=moving?act*.60:.25;secondary.position.copy(mouth).add(v([.18,.10,0]));}
 if(r.prop==='beer'){prop.position.copy(source).lerp(dest,travel);prop.position.y+=moving?Math.sin(flight*Math.PI)*.9:0;prop.rotation.z+=moving?-flight*5:0;secondary.position.copy(dest);secondary.visible=t>=hit&&t<.86;secondary.scale.setScalar(.6+act);}
 if(r.prop==='curve'){prop.scale.x=1-.18*act;secondary.position.copy(torso).add(v([0,0,.12]));}
 if(r.prop==='brian'){prop.position.copy(torso).add(v([-.35,.42,0]));secondary.position.copy(torso).add(v([.35,.65,0]));}
 if(r.prop==='failed'){prop.position.copy(torso).lerp(dest,ramp(t,.35,hit));prop.position.y+=moving?.80*wind-.42*act:.2;secondary.position.copy(dest).add(v([0,-.1,0]));secondary.visible=t>=hit&&t<.91;}
 if(!reduced&&t>.87){const shrink=1-ramp(t,.87,1);prop.scale.multiplyScalar(shrink);secondary.scale.multiplyScalar(shrink);}
 world.fx.updateMatrixWorld(true);
 return {recipe:r,focus:f.holder.position.clone().add(v([0,1.05,0])).lerp(impact.position,ramp(t,launch,hit)),flight,weight};
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
    // Frame the actor during preparation, then the receiving actor/projectile at impact.
    // Inactive bodies can leave the cinematic shot; both combatants remain framed for melee contact.
    const own=f===this.fighters[this.active.actor],self=this.active.actor===this.active.target;
    const presence=self?(own?1:0):this.choreography.recipe.mode==='melee'?1:own?1-this.choreography.flight:this.choreography.flight;
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
   shot.look.lerp(follow,(this.choreography.recipe.mode==='melee'?.50:.92)*weight);
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
  const actor=this.fighters[event.actor];actor.mixer.stopAllAction();actor.current=null;actor.clip=null;actor.sampledPose=null;this.play(event.actor,event.move);
  this.badge.textContent=event.ability.label;this.canvas.dataset.action=event.id;this.canvas.dataset.worldMove=event.move;this.canvas.dataset.actor=event.actor;
  this.fx=createMoveProps(event.ability.label,event.ability.color);this.scene.add(this.fx);this.fx.visible=false;
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
 finish(){for(const f of Object.values(this.fighters)){restoreFighter(f);f.sampledPose=null;if(f.clip!=='defeat'){f.mixer.stopAllAction();f.current=null;f.clip=null;f.mixer.update(0);} }this.choreography=null;clearTimeout(this.fallbackTimer);this.fallbackLabel?.remove();this.fallbackLabel=null;this.selection=null;if(this.fx){this.scene?.remove(this.fx);release(this.fx);this.fx=null;}this.active=null;for(const [team,f]of Object.entries(this.fighters))if(f.clip!=='defeat'){this.play(team,'idle');f.mixer.update(0);}if(this.badge)this.badge.textContent='';if(this.canvas){this.canvas.dataset.camera='overview';delete this.canvas.dataset.action;}this.overview(true);if(this.renderer)this.renderer.shadowMap.needsUpdate=true;}
 cancel(){this.events.reset();this.finish();for(const [t,f] of Object.entries(this.fighters))this.play(t,this.state?.teams[t].hp===0?'defeat':'idle');}
 disconnect(){this.cancel();if(this.state)this.events.consume(this.state);}
 clear(){this.fallback=false;this.generation++;cancelAnimationFrame(this.raf);this.cancel();this.observer?.disconnect();for(const f of Object.values(this.fighters)){f.mixer.stopAllAction();f.mixer.uncacheRoot(f.root);}release(this.scene);this.renderer?.dispose();this.renderer?.forceContextLoss();this.canvas?.remove();this.badge?.remove();if(this.container)delete this.container.dataset.worldStatus;this.renderer=null;this.scene=null;this.fighters={};this.scope=null;this.camera=null;}
 dispose(){this.clear();this.motion.removeEventListener('change',this.onMotion);document.removeEventListener('visibilitychange',this.onHide);window.removeEventListener('pagehide',this.onPage);}
}
