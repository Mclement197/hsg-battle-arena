// Render the shipped GLBs through the game's actual cameras/materials/lighting. No AI or stock art.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGameServer} from '../src/server.mjs';
import {CHARACTERS} from '../src/engine.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const evidence=process.env.EVIDENCE_DIR || '/tmp/hsg-current-previews';
await mkdir(evidence,{recursive:true});
const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+game.server.address().port+'/game/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const manifest={schema:1,generation:'96f7431-previews1',sourceCommit:'96f7431',renderer:'Production CharacterStage / BattleWorld, idle frame 0; environment-only overview',sources:{},images:{}};
const hash=b=>createHash('sha256').update(b).digest('hex');
async function source(file){manifest.sources[file]=hash(await readFile(new URL('../'+file,import.meta.url)));}
async function save(file,raw,width,height){const b=Buffer.from(raw,'base64');await writeFile(new URL('../public/'+file,import.meta.url),b);manifest.images[file]={sha256:hash(b),bytes:b.length,width,height};}
try{
 const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 if(process.env.CAPTURE_BEFORE){await p.goto(base);await p.screenshot({path:evidence+'/before-menu.png'});await p.locator('#play-bot').click();await p.screenshot({path:evidence+'/before-mapchooser.png'});await p.locator('#arena-next').click();await p.screenshot({path:evidence+'/before-roster.png'});}
 for(const file of ['art/characters/v2/hsg-characters-v2.blend','art/hsg-library/hsg-library.blend','art/trichli/trichli-arena.blend'])await source(file);
 for(const id of CHARACTERS){
  await source('public/assets/characters/'+id+'.glb');await p.goto(base);
  const raw=await p.evaluate(async id=>{
   const {CharacterStage,modelFor}=await import('./characters.js?v=20261018-previews');
   document.body.replaceChildren();const image=document.createElement('img');image.src=modelFor(id).portrait;image.dataset.model=id;image.style.cssText='width:600px;height:700px';document.body.append(image);
   const stage=new CharacterStage();stage.sync();const view=stage.views.get(image);await view.ready;
   if(!view.renderer)throw Error('Portrait WebGL failed');view.renderer.setPixelRatio(1);view.layout();view.render();
   const out=view.canvas.toDataURL('image/webp',.9).split(',')[1];stage.dispose();return out;
  },id);
  await save('assets/characters/'+id+'.webp',raw,600,700);
 }
 const previous=JSON.parse(await readFile(new URL('./preview-manifest.json',import.meta.url)));for(const [key,value]of Object.entries(previous))if(!(key in manifest))manifest[key]=value;for(const [key,value]of Object.entries(previous.images))if(!manifest.images[key])manifest.images[key]=value;for(const [key,value]of Object.entries(previous.sources))if(!manifest.sources[key])manifest.sources[key]=value;assert.equal(Object.keys(manifest.images).length,8);await writeFile(new URL('./preview-manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+String.fromCharCode(10));
 console.log(JSON.stringify(manifest,null,2));
}finally{await browser.close();await game.close();}
