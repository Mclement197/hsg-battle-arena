import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaClient, prebattleLabel, countdownDelay } from '../public/app.js';
const roomId = 'abcdef123456';
const storage = {getItem:()=>null,setItem(){},removeItem(){}};

test('delayed duplicate HTTP/SSE snapshots never rewind intro or live-turn countdown', t => {
 const original=Date.now; let wall=100, mono=0; Date.now=()=>wall;
 t.after(()=>{Date.now=original;});
 const client=new ArenaClient({storage,now:()=>mono}); client.room=roomId;
 const state={roomId,revision:1,serverNow:10000,phase:'countdown',prebattle:{startedAt:10000,readyAt:13000,deadline:17157},turn:{deadline:25000}};
 client.accept(state);
 wall+=1500; mono+=1500; assert.equal(client.secondsLeft(),14);
 client.accept({...state}); // start HTTP response delayed behind the SSE snapshot
 assert.equal(client.secondsLeft(),14,'late same-revision snapshot must not add a second back');
 assert.equal(prebattleLabel(client.state,client.serverTime()),'2');
 wall+=900; mono+=900;
 client.accept({...state,revision:2,serverNow:11000});
 assert.equal(prebattleLabel(client.state,client.serverTime()),'1','newer revision can also carry an older clock estimate');
 assert.equal(client.secondsLeft(),13);
 mono+=7000; wall+=7000;
 assert.equal(client.secondsLeft(),6,'a stalled callback catches up from the deadline, not a decremented counter');
});

test('countdown uses monotonic elapsed time despite client wall-clock changes', t => {
 const original=Date.now; let wall=100,mono=0;Date.now=()=>wall;t.after(()=>{Date.now=original;});
 const client=new ArenaClient({storage,now:()=>mono});client.room=roomId;
 client.accept({roomId,revision:1,serverNow:10000,turn:{deadline:25000}});
 wall-=60000;mono=1000;assert.equal(client.secondsLeft(),14);
 wall+=120000;mono=2000;assert.equal(client.secondsLeft(),13);
 client.accept({roomId,revision:2,serverNow:12500,turn:{deadline:25000}});
 assert.equal(client.secondsLeft(),13,'a fresher server estimate may advance, never rewind');
});

test('digit wakeups follow intro and authoritative turn boundaries without accumulating drift', () => {
 const intro={phase:'countdown',prebattle:{startedAt:10000}};
 for(const [now,delay] of [[10000,1000],[10251,749],[11999,1],[12000,1000],[12999,1],[13000,null],[17157,null]]) assert.equal(countdownDelay(intro,now),delay);
 const running={phase:'running',turn:{deadline:25000}};
 for(const [now,delay] of [[10000,1000],[10251,749],[11999,1],[23970,30],[25000,null],[26000,null]])assert.equal(countdownDelay(running,now),delay);
 assert.equal(countdownDelay({phase:'lobby'},10000),null);
 assert.equal(countdownDelay({phase:'finished'},10000),null);
});

test('fresh room activation resets the clock scope; stale generations cannot alter it', async () => {
 let mono=0;
 const client=new ArenaClient({storage,now:()=>mono,fetcher:()=>new Promise(()=>{})});client.room=roomId;
 client.accept({roomId,revision:1,serverNow:10000,turn:{deadline:25000}});
 mono=5000;
 const other='123456abcdef';client.activate(other,'host','test-token',{roomId:other,revision:1,serverNow:1000,turn:{deadline:16000}});
 assert.equal(client.secondsLeft(),15);
 client.accept({roomId:other,revision:2,serverNow:50000},client.generation-1);
 assert.equal(client.secondsLeft(),15);client.stop();
});
