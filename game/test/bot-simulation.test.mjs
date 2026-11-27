import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, CHARACTERS, RULES } from '../src/engine.mjs';
import { chooseBotMove } from '../src/bot-policy.mjs';
test('1000 fixed-seed real-engine Hard mirrors: same fighter on both teams, six-way even roster, balanced starters',()=>{
 const MATCH_SEED=0x5eedc0de;let seed=MATCH_SEED;
 const rng=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%n;};
 let wins=0,losses=0,caps=0,illegal=0,aStarts=0,bStarts=0;const fighterCounts=Object.fromEntries(CHARACTERS.map(id=>[id,{total:0,A:0,B:0}]));
 for(let i=0;i<1000;i++) {
  let now=100000;const arena=new Arena({pick:rng,now:()=>now});const room=arena.create();arena.enableBot(room,'hard');const host=arena.authenticate(room,room.hostToken);
  room.teams.A.characterId=room.teams.B.characterId=CHARACTERS[Math.floor(i/2)%CHARACTERS.length];room.phase='running';
  const starter=i%2?'B':'A';if(starter==='A')aStarts++;else bStarts++;const pairing=fighterCounts[room.teams.A.characterId];pairing.total++;pairing[starter]++;
  let number=1;arena.openTurn(room,starter,number);
  while(room.phase==='running'&&number<500) {
   const team=room.turn.team,legal=arena.available(room);
   if(team==='B') {
    now=room.turn.deadline;arena.advance(room);
    if(!legal.includes(room.lastResult.move))illegal++;
   } else {
    const active=room.teams.A;const move=chooseBotMove({difficulty:'easy',active,opponent:room.teams.B,availableMoves:legal,maxHp:RULES.maxHp},rng);
    if(!legal.includes(move)||move==='heal'&&active.hp===RULES.maxHp)illegal++;
    arena.play(room,host,{turnId:room.turn.id,move});now=room.turn.deadline;arena.advance(room);
   }
   number++;if(room.phase==='running')now=room.turn.deadline-1;
  }
  if(room.phase==='finished') { if(room.winner==='B')wins++;else losses++; } else caps++;
 }
 assert.equal(aStarts,500);assert.equal(bStarts,500);assert.equal(illegal,0);assert.equal(caps,0);assert.deepEqual(Object.values(fighterCounts).map(x=>x.total).sort((a,b)=>b-a),[168,168,166,166,166,166]);
 for(const [id,count] of Object.entries(fighterCounts)) assert.ok(Math.abs(count.A-count.B)<=1, id+' starter imbalance '+JSON.stringify(count));
 assert.ok(wins>=700, 'Hard bot wins '+wins+'/1000 (losses '+losses+', caps '+caps+', seed 0x'+MATCH_SEED.toString(16)+')');
 console.log(JSON.stringify({seed:'0x'+MATCH_SEED.toString(16),matches:1000,hardWins:wins,hardLosses:losses,turnCaps:caps,illegalMoves:illegal,firstTurn:{A:aStarts,B:bStarts},fighterCounts}));
});
