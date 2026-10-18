import * as THREE from './vendor/three.module.js';
import { loadModel, modelFor, release } from './characters.js?v=20261018-previews';
import { ARENA_WORLDS, BattleEvents } from './battle-contract.js';
const v = a => new THREE.Vector3(...a);
const ease = t => { t = THREE.MathUtils.clamp(t,0,1); return t*t*(3-2*t); };

// Each motif is modeled in world space. Books/paper/pen are solids; writing and dance rays are lines.
function motifShape(motif, color, special, move) {
 const group = new THREE.Group();
 const mat = new THREE.MeshStandardMaterial({ color, emissive:color, emissiveIntensity:.5, roughness:.5 });
 const white = new THREE.MeshStandardMaterial({ color:0xfff5d7, roughness:.8 });
 const mesh = (geo,x,y,z,m=mat) => { const o = new THREE.Mesh(geo,m);o.position.set(x,y,z);group.add(o);return o; };
 const line = (points,m=mat) => { const c = new THREE.CatmullRomCurve3(points.map(v)); group.add(new THREE.Mesh(new THREE.TubeGeometry(c,16,.018,5,false),m)); };
 if (motif === 'notes' || motif === 'formula' || move === 'defend' && ['chalk','redpen'].includes(motif)) {
  const count = special ? 5 : motif === 'notes' ? 3 : 1;
  for(let i=0;i<count;i++) {
   const paper=mesh(new THREE.BoxGeometry(.42,.55,.035),(i-(count-1)/2)*.15,i*.05,i*.065,white);paper.rotation.z=(i-(count-1)/2)*.17;
   for(let j=0;j<3;j++) mesh(new THREE.BoxGeometry(.25,.012,.015),(i-(count-1)/2)*.15,i*.05+.15-j*.10,i*.065+.025);
  }
  if(motif==='formula') { line([[-.25,.25,.08],[0,0,.08],[-.25,-.25,.08],[.3,-.25,.08]]);line([[.15,.12,.08],[.5,.12,.08]]);line([[.15,-.02,.08],[.5,-.02,.08]]); }
 } else if (motif === 'chalk') {
  if(special) for(let i=0;i<3;i++) line([[-.6+i*.38,0,0],[-.45+i*.38,-.16,0],[-.18+i*.38,.25,0]]);
  else {mesh(new THREE.CylinderGeometry(.05,.05,.6,8),0,0,0).rotation.z=-.6;line([[-.5,-.3,0],[-.05,-.1,0],[.4,.3,0]]);}
 } else if (motif === 'cloud' && move === 'defend') {
  const hood=mesh(new THREE.SphereGeometry(.5,12,8,0,Math.PI*2,0,Math.PI*.65),0,0,0);hood.scale.z=.65;
 } else if (motif === 'cloud') {
  for(let i=0;i<5;i++)mesh(new THREE.IcosahedronGeometry(.22,1),(i-2)*.16,Math.sin(i)*.08,0);
  line([[.1,-.1,0],[-.08,-.35,0],[.1,-.3,0],[-.04,-.58,0]]);
  if(special) for(const s of [-1,1])line([[s*.04,.25,0],[s*.25,.45,0],[s*.4,.25,0],[s*.18,.06,0]]);
 } else if (motif === 'disco') {
  if(move==='defend')mesh(new THREE.TorusGeometry(.24,.065,6,24),0,0,0);
  else mesh(new THREE.SphereGeometry(special?.30:.19,12,8),0,0,0);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;line([[Math.cos(a)*.3,Math.sin(a)*.3,0],[Math.cos(a)*.72,Math.sin(a)*.72,0]]);}
 } else if(motif==='redpen') {
  mesh(new THREE.CylinderGeometry(.035,.035,.8,8),0,0,0).rotation.z=-.7;
  line([[-.35,.35,0],[.35,-.35,0]]);if(special)line([[-.35,-.35,0],[.35,.35,0]]);
 }
 if(move==='defend') { const ring=mesh(new THREE.TorusGeometry(.65,.025,6,48),0,0,-.08);ring.scale.y=1.15; }
 if(move==='heal') {line([[-.13,0,.1],[.13,0,.1]]);line([[0,-.13,.1],[0,.13,.1]]);}
 // Dispose unused palette materials too, not only materials attached to visible meshes.
 if(!group.children.some(o=>o.material===white))white.dispose();
 return group;
}

export class BattleWorld {
 constructor() {
  this.events = new BattleEvents();this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.fighters={};this.generation=0;
  this.onMotion=()=>{this.cancel();if(this.state)this.events.consume(this.state);this.overview(true);};this.motion.addEventListener('change',this.onMotion);
  this.onHide=()=>{if(document.hidden)this.cancel();else if(this.state){this.events.consume(this.state);this.sync(this.state);}};document.addEventListener('visibilitychange',this.onHide);
  this.onPage=()=>this.dispose();window.addEventListener('pagehide',this.onPage);
 }
 sync(state) {
  this.state=state;
  const screen=document.body.dataset.screen;
  const host=screen==='battle',phone=screen==='player' && state.phase!=='lobby';
  if(!host&&!phone){this.clear();return;}
  if(document.hidden){this.events.reset();this.events.consume(state);return;}
  const container=host?document.querySelector('.fight-stage'):document.querySelector('#player-world');
  const scope=[state.roomId,state.match,state.arenaId,state.teams.A.characterId,state.teams.B.characterId].join(':');
  if(this.scope!==scope||this.container!==container){this.clear();this.scope=scope;this.container=container;this.events.consume(state);this.ready=this.load(state);}
  else this.events.consume(state);
  if(state.phase==='lobby')this.cancel();
 }
 async load(state) {
  const generation=this.generation;
  const world=ARENA_WORLDS[state.arenaId];
  if(!world){this.container.dataset.worldStatus='unavailable';this.container.setAttribute('aria-label','Mensa B: 3D environment not modeled');return;}
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
    this.fighters[team]={root,holder,mixer,actions,clip:null};
    this.play(team,state.teams[team].hp===0?'defeat':'idle');
    if(state.teams[team].hp===0)mixer.update(1.5);
   }
   this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));
   this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
   this.camera=new THREE.PerspectiveCamera(49,1,.08,80);this.look=v(world.look);this.overview(true);
   this.canvas=this.renderer.domElement;this.canvas.className='battle-world-canvas';this.canvas.setAttribute('aria-hidden','true');
   this.canvas.addEventListener('webglcontextlost',event=>{if(generation!==this.generation)return;event.preventDefault();cancelAnimationFrame(this.raf);this.disconnect();this.container.dataset.worldStatus='error';});this.canvas.addEventListener('webglcontextrestored',()=>{if(generation!==this.generation)return;const current=this.state;this.clear();if(current)this.sync(current);});this.container.prepend(this.canvas);
   this.badge=document.createElement('span');this.badge.className='world-action-label';this.badge.setAttribute('aria-hidden','true');this.container.append(this.badge);
   this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(this.container);this.layout();
   this.container.dataset.worldStatus='ready';this.container.dataset.worldArena=state.arenaId;
   this.events.pending=this.events.pending.filter(e=>(this.state.serverNow-e.resolvedAt)<15000);
   let last=performance.now();const tick=now=>{if(generation!==this.generation)return;this.raf=requestAnimationFrame(tick);if(document.hidden||now-last<1000/30)return;const dt=Math.min((now-last)/1000,.25);last=now;
    if(!this.active&&this.events.pending.length)this.begin(this.events.pending.shift(),now);
    if(this.active)this.animate(now);
    for(const f of Object.values(this.fighters))if(!this.motion.matches)f.mixer.update(dt);
    if(this.active&&!this.motion.matches)this.renderer.shadowMap.needsUpdate=true;
    this.renderer.render(this.scene,this.camera);
   };this.raf=requestAnimationFrame(tick);
  } catch(error) {
   for(const g of roots)release(g.scene);if(generation!==this.generation)return;
   this.clear();this.container.dataset.worldStatus='error';this.container.setAttribute('aria-label','3D arena unavailable. Health and commands still work.');
   console.warn('Arena load failed',error);
  }
 }
 layout(){if(!this.renderer)return;const w=this.container.clientWidth,h=this.container.clientHeight;this.renderer.setSize(w,h);this.camera.aspect=w/Math.max(h,1);this.camera.fov=w/h<1.1?64:49;this.camera.updateProjectionMatrix();this.overview(!this.active);}
 play(team,clip){const f=this.fighters[team],a=f?.actions.get(clip);if(!a)return;if(clip==='idle'&&f.clip==='idle')return;const old=f.current;a.reset().setLoop(clip==='idle'?THREE.LoopRepeat:THREE.LoopOnce,clip==='idle'?Infinity:1);a.clampWhenFinished=clip!=='idle';a.play();if(old&&old!==a)a.crossFadeFrom(old,.1,false);f.current=a;f.clip=clip;}
 overview(snap=false){if(!this.camera||!this.config)return;this.goal=v(this.config.overview);this.goalLook=v(this.config.look);if(snap){this.camera.fov=this.camera.aspect<1.1?64:49;this.camera.updateProjectionMatrix();this.camera.position.copy(this.goal);this.look.copy(this.goalLook);this.camera.lookAt(this.look);}}
 begin(event,now){this.active={...event,startedAt:now,hit:false};this.lastCameraTime=now;this.play(event.actor,event.move);this.badge.textContent=event.ability.label;this.canvas.dataset.action=event.id;this.canvas.dataset.worldMove=event.move;this.canvas.dataset.actor=event.actor;
  this.fx=motifShape(event.ability.motif,event.ability.color,event.move==='special',event.move);this.scene.add(this.fx);this.fx.visible=false;
  // Stretch bone anticipation so the hand gesture launches at the world-space projectile beat.
  this.fighters[event.actor].current.setDuration(1.45);
  if(this.motion.matches){this.fighters[event.actor].mixer.update(.7);this.renderer.shadowMap.needsUpdate=true;}
 }
 animate(now){const e=this.active,t=Math.min((now-e.startedAt)/e.ability.duration,1),actor=this.fighters[e.actor],target=this.fighters[e.target],a=actor.holder.position,b=target.holder.position;
  const moving=!this.motion.matches;const launch=e.ability.launch,impact=e.ability.impact;
  this.fx.visible=t>=launch&&t<.87;
  const handName=e.ability.motif==='notes'?'lefthand':'righthand';
  const hand=actor.root.getObjectByName(handName);
  actor.holder.updateMatrixWorld(true);
  const source=hand?hand.getWorldPosition(new THREE.Vector3()):a.clone().add(new THREE.Vector3(0,1.23,0)),dest=b.clone().add(new THREE.Vector3(0,1.08,0));
  if(e.actor===e.target){this.fx.position.copy(a).add(new THREE.Vector3(0,e.move==='defend'?1.2:1.45,0));this.fx.scale.setScalar(e.move==='defend'?.9: moving?.55+Math.sin(t*Math.PI)*.35:.8);}
  else {const flight=ease((t-launch)/(impact-launch));this.fx.position.copy(moving?source.lerp(dest,flight):dest);this.fx.position.y+=moving?Math.sin(flight*Math.PI)*.35:0;this.fx.scale.setScalar(e.move==='special'?1.1:.8);}
  this.fx.quaternion.copy(this.camera.quaternion);
  if(e.ability.motif==='notes'&&moving)this.fx.rotateZ(Math.sin(t*8)*.22);
  if(e.ability.motif==='disco'&&moving)this.fx.rotateZ(t*3);
  if(!this.motion.matches&&t<.94){actor.current.time=Math.min(t*e.ability.duration/1000*actor.current.timeScale,actor.current.getClip().duration-.001);actor.mixer.update(0);}
  if(t>=impact&&!e.hit){e.hit=true;if(e.actor!==e.target){this.play(e.target,e.defeated?'defeat':'hit');if(this.motion.matches)target.mixer.update(e.defeated?1.5:.35);}}
  if(t>.94){for(const [team,f] of Object.entries(this.fighters))if(f.clip!=='idle'&&f.clip!=='defeat')this.play(team,'idle');}
  // Fixed safe corridor shots, no wall crossing or fast orbital spins. Controls remain outside canvas.
  let phase=t<.35?'anticipation':t<.72?'impact':'return';this.canvas.dataset.camera=phase;
  if(moving){const subject=phase==='anticipation'?a:b;
   if(phase==='return')this.overview();else{
    const base=v(this.config.overview);this.goal=base.lerp(subject.clone().add(new THREE.Vector3(e.actor==='A'?-1.7:1.7,2.05,4.2)),.68);
    this.goal.x=THREE.MathUtils.clamp(this.goal.x,-2.4,2.4);this.goal.y=Math.min(this.goal.y,this.state.arenaId==='trischli'?2.8:4.2);
    if(this.state.arenaId==='trischli'){this.goal.z=Math.max(.2,this.goal.z);this.goal.y=Math.min(2.55,this.goal.y);}
    this.goalLook=subject.clone().lerp(e.actor===e.target?subject:phase==='anticipation'?b:a,.38).add(new THREE.Vector3(0,1.05,0));
   }
   const blend=1-Math.exp(-Math.min((now-(this.lastCameraTime??now-33))/1000,.25)*8);this.lastCameraTime=now;
   this.camera.position.lerp(this.goal,blend);this.look.lerp(this.goalLook,blend);this.camera.lookAt(this.look);
   // Widen the shot rather than cutting off a wing when the other fighter gets the close-up.
   this.camera.fov=this.camera.aspect<1.1?64:49;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
   let edge=0;for(const fighter of Object.values(this.fighters)){const box=new THREE.Box3().setFromObject(fighter.holder);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).project(this.camera);edge=Math.max(edge,Math.abs(p.x),Math.abs(p.y));}}
   const baseFov=this.camera.aspect<1.1?64:49;this.camera.fov=Math.min(78,baseFov+Math.max(0,edge-.88)*22);this.camera.updateProjectionMatrix();
  }else this.overview(true);
  if(t>=1){this.finish();}
 }
 finish(){if(this.fx){this.scene?.remove(this.fx);release(this.fx);this.fx=null;}this.active=null;if(this.badge)this.badge.textContent='';if(this.canvas){this.canvas.dataset.camera='overview';delete this.canvas.dataset.action;}this.overview(true);if(this.renderer)this.renderer.shadowMap.needsUpdate=true;}
 cancel(){this.events.reset();this.finish();for(const [t,f] of Object.entries(this.fighters))this.play(t,this.state?.teams[t].hp===0?'defeat':'idle');}
 disconnect(){this.cancel();if(this.state)this.events.consume(this.state);}
 clear(){this.generation++;cancelAnimationFrame(this.raf);this.cancel();this.observer?.disconnect();for(const f of Object.values(this.fighters)){f.mixer.stopAllAction();f.mixer.uncacheRoot(f.root);}release(this.scene);this.renderer?.dispose();this.renderer?.forceContextLoss();this.canvas?.remove();this.badge?.remove();if(this.container)delete this.container.dataset.worldStatus;this.renderer=null;this.scene=null;this.fighters={};this.scope=null;this.camera=null;}
 dispose(){this.clear();this.motion.removeEventListener('change',this.onMotion);document.removeEventListener('visibilitychange',this.onHide);window.removeEventListener('pagehide',this.onPage);}
}
