import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Arena } from '../src/engine.mjs';
import { createGameServer } from '../src/server.mjs';

const ORIGIN='https://arena.example';
async function fixture(t) {
  let now=100000;
  const arena=new Arena({now:()=>now,pick:()=>0});
  const game=createGameServer({arena,publicOrigin:ORIGIN,autoTick:false});
  await new Promise(resolve=>game.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>game.close());
  const base='http://127.0.0.1:'+game.server.address().port;
  const post=(url,data={},token)=>new Promise((resolve,reject)=>{
    const req=http.request(base+url,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},res=>{let text='';res.setEncoding('utf8');res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,data:text?JSON.parse(text):null,text}));});
    req.on('error',reject);req.end(JSON.stringify(data));
  });
  const get=(url,token)=>new Promise((resolve,reject)=>{const req=http.get(base+url,{headers:{Authorization:'Bearer '+token}},res=>{let text='';res.setEncoding('utf8');res.on('data',x=>text+=x);res.on('end',()=>resolve(JSON.parse(text)));});req.on('error',reject);});
  const create=async()=> (await post('/game/api/rooms')).data;
  const join=async(r,name)=>(await post('/game/api/rooms/'+r.roomId+'/join',{nickname:name})).data;
  const react=(r,p,emoji)=>post('/game/api/rooms/'+r.roomId+'/react',{reaction:emoji},p.playerToken);
  const start=async r=>{const x=await post('/game/api/rooms/'+r.roomId+'/start',{},r.hostToken);if(x.status===200){now=x.data.state.prebattle.deadline;game.tick();}return x;};
  return {arena,game,post,get,create,join,react,start,setNow:x=>now=x};
}

test('reaction endpoint is authenticated, allowlisted, snapshots recent identity, and enforces independent cooldown boundary',async t=>{
 const f=await fixture(t),r=await f.create(),a=await f.join(r,'A'),b=await f.join(r,'B');
 await f.start(r);
 assert.equal((await f.react(r,a,'😂')).status,200);
 let state=(await f.get('/game/api/rooms/'+r.roomId+'/state',r.hostToken)).state;
 assert.equal(state.reactions.enabled,true);assert.deepEqual(state.reactions.recent.map(x=>[x.playerId,x.team,x.emoji]),[[a.playerId,a.team,'😂']]);
 assert.equal(typeof state.reactions.recent[0].at,'number');
 assert.equal((await f.react(r,a,'🔥')).status,429);
 assert.equal((await f.react(r,b,'🔥')).status,200,'cooldown is per-player');
 for(const bad of ['🙂','😂🔥','']) assert.notEqual((await f.react(r,b,bad)).status,200);
 assert.equal((await f.post('/game/api/rooms/'+r.roomId+'/react',{reaction:'😂'})).status,401);
 f.setNow(state.reactions.recent[0].at+1000);assert.equal((await f.react(r,a,'💀')).status,200,'1000ms exact boundary accepted');
 const serialized=JSON.stringify(state);for(const secret of [r.hostToken,a.playerToken,b.playerToken])assert.equal(serialized.includes(secret),false);
});

test('reactions setting defaults on, is configurable only in lobby, and queue expires at two seconds',async t=>{
 const f=await fixture(t),r=await f.create(),a=await f.join(r,'A'),b=await f.join(r,'B'),url='/game/api/rooms/'+r.roomId;
 const config=await f.post(url+'/configure',{reactionsEnabled:false},r.hostToken);
 assert.equal(config.status,200,config.text);
 assert.equal((await f.react(r,b,'🤡')).status,409);
 assert.equal((await f.start(r)).status,200);
 assert.notEqual((await f.post(url+'/configure',{reactionsEnabled:true},r.hostToken)).status,200);
});
