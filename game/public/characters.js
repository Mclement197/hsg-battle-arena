import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

// One stable mapping shared by selection, runtime and asset tests; never derive filenames from nicknames.
export const CHARACTER_MODELS = Object.freeze(Object.fromEntries([
  'luca-di-grazia', 'free-rider', 'tryhard', 'assessment-hoodie', 'trischli-warrior', 'bad-teacher'
].map(id => [id, Object.freeze({ model: './assets/characters/' + id + '.glb', portrait: './assets/characters/' + id + '.webp' })])));
export const modelFor = id => Object.hasOwn(CHARACTER_MODELS, id) ? CHARACTER_MODELS[id] : null;
export const REQUIRED_CLIPS = Object.freeze(['idle', 'attack', 'hit', 'defeat', 'defend', 'heal', 'special']);
const bytes = new Map();
export async function loadModel(url) {
  if (!bytes.has(url)) bytes.set(url, fetch(url).then(r => { if (!r.ok) throw Error('Model unavailable'); return r.arrayBuffer(); }).catch(e => { bytes.delete(url); throw e; }));
  return new GLTFLoader().parseAsync(await bytes.get(url), new URL('./assets/characters/', location.href).href);
}
export function release(root) {
  const geometries = new Set(), materials = new Set(), skeletons = new Set(), textures = new Set();
  root?.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.skeleton) skeletons.add(o.skeleton); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) materials.add(m); });
  for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  root?.traverse(o => { if (o.shadow?.map) o.shadow.map.dispose(); });
  for (const x of [...geometries, ...materials, ...skeletons, ...textures]) x.dispose();
}

class CharacterView {
  constructor(image, id, reduced) {
    this.image = image; this.id = id; this.reduced = reduced; this.dead = false;
    this.ready = this.load();
  }
  async load() {
    let gltf;
    try {
      gltf = await loadModel(modelFor(this.id).model);
      if (this.dead) { release(gltf.scene); return; }
      this.root = gltf.scene;
      this.scene = new THREE.Scene();
      this.scene.add(this.root, new THREE.HemisphereLight(0xe8f5ff, 0x767455, 2.1));
      const key = new THREE.DirectionalLight(0xfff1dc, 3.1); key.position.set(-3, 5, 7); this.scene.add(key);
      const rim = new THREE.DirectionalLight(0xd6eaff, 2); rim.position.set(3, 4, -3); this.scene.add(rim);
      this.root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(this.root), size = bounds.getSize(new THREE.Vector3());
      this.center = bounds.getCenter(new THREE.Vector3()); this.size = size;
      this.camera = new THREE.OrthographicCamera(-3, 3, 3, -3, .1, 60);
      const team = this.image.dataset.modelTeam;
      this.camera.position.copy(this.center).add(new THREE.Vector3(team === 'B' ? -1.8 : 1.8, .7, 9));
      this.camera.lookAt(this.center);
      this.mixer = new THREE.AnimationMixer(this.root);
      this.actions = new Map(gltf.animations.map(c => [c.name, this.mixer.clipAction(c)]));
      if (!REQUIRED_CLIPS.every(c => this.actions.has(c))) throw Error('Incomplete character animation');
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      this.renderer.setClearColor(0, 0); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.canvas = this.renderer.domElement; this.canvas.className = 'character-canvas'; this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.dataset.modelId = this.id;
      this.image.parentElement.append(this.canvas);
      this.resize = new ResizeObserver(() => { this.layout(); this.render(); }); this.resize.observe(this.image);
      this.image.classList.add('model-ready');
      this.mixer.addEventListener('finished', e => { if (e.action === this.current && this.clip !== 'defeat') this.play('idle'); });
      this.layout(); this.play(this.image.dataset.modelPose === 'defeat' ? 'defeat' : 'idle');
      this.image.dataset.modelStatus = 'ready';
      let last = performance.now();
      const tick = now => {
        if (this.dead) return;
        this.raf = requestAnimationFrame(tick);
        if (document.hidden || this.reduced || now - last < 1000 / 30) return;
        this.mixer.update(Math.min((now - last) / 1000, .1)); last = now; this.render();
      };
      if (!this.reduced) this.raf = requestAnimationFrame(tick);
    } catch (error) {
      // Genuine original portrait fallback when WebGL2/assets are unavailable, never pretend it is 3D.
      if (!this.dead) { this.image.dataset.modelStatus = 'fallback'; this.image.title = 'Static portrait — 3D unavailable'; this.dispose(); }
      if (gltf && !this.root) release(gltf.scene);
    }
  }
  layout() {
    if (this.dead) return;
    const image = this.image, w = image.clientWidth, h = image.clientHeight;
    this.canvas.style.left = image.offsetLeft + 'px'; this.canvas.style.top = image.offsetTop + 'px';
    this.renderer.setSize(w, h);
    const aspect = w / Math.max(h, 1);
    // Rest bounds include wings, halo, hair and stars; generous motion envelope prevents clipping.
    const height = Math.max(this.size.y * 1.20, (this.size.x + this.size.z * .35) / aspect * 1.15);
    this.camera.left = -height * aspect / 2; this.camera.right = height * aspect / 2;
    this.camera.top = height / 2; this.camera.bottom = -height / 2; this.camera.updateProjectionMatrix();
  }
  play(clip) {
    const action = this.actions?.get(clip); if (!action || this.dead) return false;
    if (clip === 'idle' && this.clip === 'idle') return true;
    const old = this.current;
    action.reset().setEffectiveWeight(1).setLoop(clip === 'idle' ? THREE.LoopRepeat : THREE.LoopOnce, clip === 'idle' ? Infinity : 1);
    action.clampWhenFinished = clip !== 'idle'; action.play();
    if (old && old !== action) { if (this.reduced) old.stop(); else action.crossFadeFrom(old, .12, false); }
    this.current = action; this.clip = clip; this.canvas.dataset.clip = clip;
    if (this.reduced) { this.mixer.update(clip === 'idle' ? 0 : action.getClip().duration * (clip === 'defeat' ? 1 : .5)); this.render(); }
    else this.render();
    clearTimeout(this.poseTimer);
    if (this.reduced && !['idle', 'defeat'].includes(clip)) this.poseTimer = setTimeout(() => this.play('idle'), 850);
    return true;
  }
  render() { if (!this.dead && this.renderer) this.renderer.render(this.scene, this.camera); }
  dispose() {
    this.dead = true; cancelAnimationFrame(this.raf); clearTimeout(this.poseTimer); this.resize?.disconnect();
    this.mixer?.stopAllAction(); if (this.root) this.mixer?.uncacheRoot(this.root);
    release(this.root); this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.canvas?.remove(); this.image.classList.remove('model-ready');
  }
}

export class CharacterStage {
  constructor() {
    this.views = new Map(); this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.motionListener = () => { this.clear(); this.sync(); };
    this.motion.addEventListener('change', this.motionListener);
    this.visibilityListener = () => { if (document.hidden) this.clear(); else this.sync(); };
    document.addEventListener('visibilitychange', this.visibilityListener);
    this.pageListener = () => this.clear(); window.addEventListener('pagehide', this.pageListener);
  }
  sync() {
    const active = new Set();
    if (!document.hidden) for (const image of document.querySelectorAll('img[data-model]')) {
      const id = image.dataset.model;
      if (!modelFor(id) || image.closest('section')?.hidden || image.closest('#battle-screen, #player-screen') || !image.clientWidth) continue;
      active.add(image);
      const view = this.views.get(image);
      if (view?.id === id) {
        if (image.dataset.modelPose === 'defeat' && view.clip !== 'defeat') view.play('defeat');
        continue;
      }
      image.dataset.modelStatus = 'loading';
      view?.dispose(); this.views.set(image, new CharacterView(image, id, this.motion.matches));
    }
    for (const [image, view] of this.views) if (!active.has(image)) { view.dispose(); this.views.delete(image); }
  }
  play(effect) {
    // Only called by the existing authoritative, deduplicated resolved-result cue.
    for (const [image, view] of this.views) {
      if (image.closest('section')?.id === 'character-screen') continue;
      const team = image.dataset.modelTeam;
      if (team === effect.actorTeam) view.play(effect.move);
      else if (team === effect.team && ['attack', 'special'].includes(effect.move)) view.play(image.dataset.modelPose === 'defeat' ? 'defeat' : 'hit');
    }
  }
  clear() { for (const v of this.views.values()) v.dispose(); this.views.clear(); }
  dispose() { this.clear(); this.motion.removeEventListener('change', this.motionListener); document.removeEventListener('visibilitychange', this.visibilityListener); window.removeEventListener('pagehide', this.pageListener); }
}
