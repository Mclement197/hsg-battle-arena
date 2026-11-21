import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildNamedSound} from '../public/assets/audio/generate.mjs';
import {THEMED_ACTION_SOUNDS} from '../public/app.js';
import {actionSoundTiming,ABILITIES} from '../public/battle-contract.js';

const sha=b=>createHash('sha256').update(b).digest('hex');
test('Bad Luck is a reproducible single 500ms lightning crack with restrained lead and decaying thunder',async()=>{
 const b=await readFile(new URL('../public/'+THEMED_ACTION_SOUNDS['assessment-hoodie:attack'],import.meta.url));
 assert.deepEqual(b,buildNamedSound('assessment-hoodie','attack'));
 assert.deepEqual(b,buildNamedSound('assessment-hoodie','attack'));
 assert.equal(b.length,24044);assert.equal(b.readUInt32LE(24),24000);assert.equal(b.readUInt16LE(22),1);assert.equal(b.readUInt16LE(34),16);
 const x=Array.from({length:12000},(_,i)=>b.readInt16LE(44+i*2)/32768);
 const rms=(from,to,values=x)=>Math.sqrt(values.slice(Math.round(from*24000),Math.round(to*24000)).reduce((s,v)=>s+v*v,0)/Math.round((to-from)*24000));
 let peak=0,peakFrame=0,sum=0,energy=0,max50=0,clipped=0;
 for(let i=0;i<x.length;i++){const v=x[i];if(Math.abs(v)>peak){peak=Math.abs(v);peakFrame=i;}sum+=v;clipped+=Math.abs(v)>=32767/32768;energy+=v*v;if(i>=1200)energy-=x[i-1200]**2;if(i>=1199)max50=Math.max(max50,energy/1200);}
 assert.equal(clipped,0);assert.equal(x[0],0);assert.equal(x.at(-1),0);assert.ok(peak<.8&&peak>.5);assert.ok(Math.abs(sum/x.length)<.001);
 assert.ok(peakFrame/24>=55&&peakFrame/24<75,'main crack follows the existing 55ms marker');
 assert.ok(Math.sqrt(max50)<=.2801,'unchanged offline 50ms energy cap');
 assert.ok(rms(0,.05)<rms(.055,.105)*.1,'electrical lead remains restrained');
 assert.ok(rms(.15,.25)>rms(.30,.40)*2,'one continuous thunder decay, not another strike');
 assert.ok(rms(.40,.50)<.01,'short restrained tail');
 let low=0,bass=0;const phone=x.map(v=>{low+=(1-Math.exp(-2*Math.PI*1200/24000))*(v-low);bass+=(1-Math.exp(-2*Math.PI*300/24000))*(low-bass);return low-bass;});
 assert.ok(rms(.12,.30,phone)>.008,'thunder has measurable 300-1200Hz phone body, not only bass');
 assert.deepEqual(actionSoundTiming('attack','assessment-hoodie:attack'),{phase:.59,accent:.055});
 assert.equal(ABILITIES['assessment-hoodie'].attack.duration,2200);assert.equal(ABILITIES['assessment-hoodie'].attack.target,'opponent');
 console.log('BAD_LUCK_PCM',JSON.stringify({sha256:sha(b),bytes:b.length,peak,peakDb:20*Math.log10(peak),peakMs:peakFrame/24,max50msDb:10*Math.log10(max50),dc:sum/x.length,clipped,leadRms:rms(0,.05),crackRms:rms(.055,.105),bodyRms:rms(.15,.25),lateRms:rms(.30,.40),tailRms:rms(.40,.50),phoneBodyRms:rms(.12,.30,phone)}));
});

test('Bad Luck audio mapping stays fixed while the UI cache generation advances',async()=>{
 const [html,app]=await Promise.all(['index.html','app.js'].map(f=>readFile(new URL('../public/'+f,import.meta.url),'utf8')));
 assert.equal(THEMED_ACTION_SOUNDS['assessment-hoodie:attack'],'./assets/audio/assessment-hoodie-attack.wav?v=20261109-bad-luck1');
 assert.ok(html.includes('./app.js?v=20261121-siuu2'));assert.ok(html.includes('./styles.css?v=20261110-win-celebration1'));
 assert.ok(app.includes('./battle-world.js?v=20261121-siuu1'));assert.ok(app.includes('./battle-contract.js?v=20261021-festival-puck1'));
 assert.equal(THEMED_ACTION_SOUNDS['trischli-warrior:attack'],'./assets/audio/trischli-warrior-attack.wav?v=20261021-festival-puck1');
});

const protectedAudio={
 "assessment-hoodie-defend.wav": "8661af074ae0dc4473f2b4a73b5aa7afac20362179f9d6fc63f1794b0a16ae66",
 "assessment-hoodie-heal.wav": "084c37219cab395498ae2bcc01e8c8e74eeaf517e51cb901fb3a83b4abd55b83",
 "assessment-hoodie-special.wav": "b1c900b243d51f9a98b737021de7ee6fb2028ea9d039e42b990cc3fea5a51c3f",
 "attack-impact.wav": "add8e33ebafea2f33fd6abf8ee9a82ca62c1067c12f74f900e2244f4943a8483",
 "bad-teacher-attack.wav": "2efaebe2414ce1260396e1e536d1c335f3a6f87907588686bc1dbf880a56d8b1",
 "bad-teacher-defend.wav": "8ff285230ed7d2e24d8380ad5fe5cebe05d4bcfff256efc643a45fcc42f27615",
 "bad-teacher-heal.wav": "d9cc3fa27f5748af1fbd600ffb98c500891a66f71371c463fe26ed0785c55198",
 "bad-teacher-special.wav": "a7bdc60da6d3c9588e08f9bdff144f6876f81b3f5e5ee34cc1219ffac243e85a",
 "battle-loop.webm": "0a1b4014e7d01ebf9a7de30e267e58def9a1f950c5ccd9e9759282f5ec9e7e4b",
 "battle-start.wav": "ac1753b0c966a04b728a6d76f6650078654049337eeb152fbfc3b2fecc308925",
 "countdown.wav": "bf73b879881d7edc70a7071323f0549630769430bb48b39d86fe3a5f050ff493",
 "defend-shield.wav": "8c133d14ca3ca9b03c74c864425d88ebbc3e936ee1aae807b2c86653328a3cce",
 "free-rider-attack.wav": "a66d95bc2cdb43ff9da536634121e3ab128f2b9bdbab7b018deea6ab61eaa1bb",
 "free-rider-defend.wav": "d86cd229142ab385cb5e6f0cb5e8bf2bd78bfb49c346666f719a2d32c52c7465",
 "free-rider-heal.wav": "542039535b747f96adca7c2f14f41841a18345bd18703603de2514152953d489",
 "free-rider-special.wav": "376b4f593310eabd9d47fbb961bc55c7c44c0a5a01c27e3949d53c4b2d08d21e",
 "heal-chime.wav": "16bf3294544bfcbb1a389222573fbe5db9127bd9f5478f7d9a69eebc2a2ed2fe",
 "lobby-loop.wav": "393273797bd9c6bc198bd5fd1d84f22686986701423d1b2f24772dbb0a864ec4",
 "luca-di-grazia-attack.wav": "fcf1731ffe57808aa68f3c756ac2677bb19cb3d8065e8588265d70b58deea7d6",
 "luca-di-grazia-defend.wav": "cc618f93e688b9b4f1dcd2ba733bb691a57e58f2dc439daf21944e448bc7b69c",
 "luca-di-grazia-heal.wav": "b515193eb20b866ae4f5986ff95fd625594d5323ebcd9d77d087e97c91761a8b",
 "luca-di-grazia-special.wav": "effde7f7e6e226437515d62eacdabd9045511e02bb500ff918a8a977658b5854",
 "special-burst.wav": "10b3f039563d61b8d2d1a6dbb43a35e92fb253c58c81ca183829d49e98505b9b",
 "trischli-warrior-attack-accent.wav": "4d81c6ef373ee164caba24fadf74923acf79c0de7762adfafe98bc3a75f365ea",
 "trischli-warrior-attack.wav": "5aceed8c434be8f170b99694282ed60c51bbb0acb2786f195a9f7b88137591e6",
 "trischli-warrior-defend.wav": "ccadc879a238700ce50d66440a52b720d9b2760175f7cd0fce16a2b0def3babd",
 "trischli-warrior-heal.wav": "4610b6eb2a2c81933f9f88693547d97c9b492746798eac6102ab22465a9befc5",
 "trischli-warrior-special.wav": "437d6f3ecf39b5b0a10e6bd5ec13d6bd842638ba2a33b8255392be954d6a8ac1",
 "tryhard-attack.wav": "782baea240fc730b2b16155b27e8d61899c9c52bb86f60d7d3de6b59646cbcab",
 "tryhard-defend.wav": "9711b928dd16a7eb36807379e8833073bc44dffc9560d734c74057587cba10e1",
 "tryhard-heal.wav": "ef5e7ef23b84e64ebb9fc9ac546d2272da8d1d2a1ee42176b538c64f9b9968e8",
 "tryhard-special.wav": "932c9dff047164c7a49b38c3a22a7e74606aad610f45809851537b78216670df",
 "victory.webm": "f0cf0be0c1cb3e061e12957d34300a49f24e5918feea6eb10e963997968046b7"
};
test('all 33 other audio assets, including Festival/Puck bed and marker, remain byte-identical',async()=>{
 for(const [name,expected]of Object.entries(protectedAudio))assert.equal(sha(await readFile(new URL('../public/assets/audio/'+name,import.meta.url))),expected,name);
});
