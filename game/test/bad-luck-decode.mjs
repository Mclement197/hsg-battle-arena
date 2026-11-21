// Focused native codec/resampling and conservative one-action-plus-music bounds; not listening.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true});
try{
 const page=await browser.newPage();
 const inputs=Object.fromEntries(await Promise.all(['assessment-hoodie-attack.wav','battle-loop.webm','victory.webm'].map(async f=>[f,(await readFile(new URL('../public/assets/audio/'+f,import.meta.url))).toString('base64')])));
 const rows=await page.evaluate(async inputs=>{
  const rows=[];
  for(const rate of [48000,96000]){
   const ctx=new OfflineAudioContext(2,1,rate),peaks={};
   for(const [name,b64]of Object.entries(inputs)){
    const raw=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)),b=await ctx.decodeAudioData(raw.buffer);
    let peak=0;for(let c=0;c<b.numberOfChannels;c++)for(const x of b.getChannelData(c))peak=Math.max(peak,Math.abs(x));
    peaks[name]={peak,duration:b.duration,channels:b.numberOfChannels,frames:b.length};
   }
   const s=peaks['assessment-hoodie-attack.wav'].peak,b=peaks['battle-loop.webm'].peak,w=peaks['victory.webm'].peak;
   rows.push({rate,peaks,battleMax:s*.45+b*.225,battleDefault:s*.45*.8+b*.225*.35,victoryMax:s*.45+w*.9});
  }
  return rows;
 },inputs);
 console.log('RESAMPLING_MEASUREMENTS',JSON.stringify(rows));
 for(const r of rows){assert.ok(r.peaks['assessment-hoodie-attack.wav'].peak<.8);assert.equal(r.peaks['assessment-hoodie-attack.wav'].duration,.5);assert.ok(r.battleMax<1);assert.ok(r.victoryMax<1);}
 const result={browser:browser.version(),os:'Linux x64',rows};console.log('BAD_LUCK_NATIVE_HEADROOM',JSON.stringify(result));
 if(process.env.DECODE_EVIDENCE)await writeFile(process.env.DECODE_EVIDENCE,JSON.stringify(result,null,2));
}finally{await browser.close();}
