// Convert our own Cycles portraits to WebP and assemble genuine pose evidence with Chromium Canvas2D.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = new URL('./', import.meta.url), root = new URL('../../../', import.meta.url);
const ids = ['luca-di-grazia','free-rider','tryhard','assessment-hoodie','trischli-warrior','bad-teacher'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true });
try {
 const page = await browser.newPage();
 for (const id of ids) {
  const data = (await readFile(new URL('renders/portrait-' + id + '.png', base))).toString('base64');
  const webp = await page.evaluate(async raw => { const im = new Image(); im.src = 'data:image/png;base64,' + raw; await im.decode(); const c = document.createElement('canvas'); c.width = 300; c.height = 350; c.getContext('2d').drawImage(im,0,0,300,350); return c.toDataURL('image/webp',.86).split(',')[1]; }, data);
  await writeFile(new URL('public/assets/characters/' + id + '.webp', root), Buffer.from(webp,'base64'));
 }
 for (const [file, poses] of [['pose-contact-sheet.png',['rest','attack','hit','defeat']],['bent-joints-contact-sheet.png',['bent']]]) {
  const images=[];
  for (const id of ids) for (const pose of poses) images.push({ id, pose, raw: (await readFile(new URL('renders/' + (pose === 'rest' ? '' : pose + '-') + id + '.png',base))).toString('base64') });
  const raw = await page.evaluate(async ({images,columns}) => {
   const c=document.createElement('canvas'); c.width=columns*360;c.height=6*440+45;const ctx=c.getContext('2d');ctx.fillStyle='#13291f';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#dff4e7';ctx.font='bold 19px sans-serif';ctx.fillText(columns===1?'REAL BENT-JOINT SKIN PROOF':'ACTUAL SKELETAL CLIPS · REST / ATTACK / HIT / DEFEAT',18,28);
   for(let i=0;i<images.length;i++){const it=images[i],im=new Image();im.src='data:image/png;base64,'+it.raw;await im.decode();const x=(i%columns)*360,y=Math.floor(i/columns)*440+45;ctx.drawImage(im,x,y,360,405);ctx.fillStyle='#dff4e7';ctx.font='14px sans-serif';ctx.fillText(it.id+' · '+it.pose,x+9,y+425);}
   return c.toDataURL('image/png').split(',')[1];
  },{images,columns:poses.length});
  await writeFile(new URL('renders/'+file,base),Buffer.from(raw,'base64'));
 }
 console.log('6 WebP runtime portraits and two genuine pose contact sheets prepared');
} finally { await browser.close(); }
