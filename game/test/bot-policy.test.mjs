import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBotMove, BOT_DIFFICULTIES } from '../src/bot-policy.mjs';
import { fighterStats } from '../public/fighter-data.js';
const S=(characterId,hp=100,shield=false,ownTurn=1,specialReadyOwnTurn=1)=>({characterId,hp,shield,ownTurn,specialReadyOwnTurn});
function pick(args, values=[0]) { let i=0; return chooseBotMove({difficulty:'hard',active:S('luca-di-grazia'),opponent:S('free-rider'),availableMoves:['attack','defend','heal','special'],maxHp:100,...args},n=>{const v=values[i++]??0;assert.ok(v>=0&&v<n);return v;}); }
test('difficulty modes and legal uniform selection',()=>{
 assert.deepEqual(BOT_DIFFICULTIES,['easy','normal','hard']);
 for(const [i,m] of ['attack','defend','special'].entries()) assert.equal(pick({difficulty:'easy'},[i]),m);
 for(const [i,m] of ['attack','defend','heal','special'].entries()) assert.equal(pick({difficulty:'easy',active:S('luca-di-grazia',80)},[i]),m);
 assert.equal(pick({difficulty:'easy',availableMoves:['attack','defend','heal']},[1]),'defend');
 const called=[];assert.equal(chooseBotMove({difficulty:'normal',active:S('luca-di-grazia',80),opponent:S('free-rider'),availableMoves:['attack','defend','heal','special'],maxHp:100},n=>{called.push(n);return called.length===1?0:1;}),'defend');assert.deepEqual(called,[2,4]);
 assert.equal(pick({difficulty:'normal'},[1]),'special','strategic half uses hard policy');
});
test('hard priorities KO attack, KO special, conditional heal, special, defend, attack',()=>{
 assert.equal(pick({active:S('free-rider'),opponent:S('luca-di-grazia',1)}),'attack');
 assert.equal(pick({active:S('free-rider'),opponent:S('luca-di-grazia',1),availableMoves:['special','defend']}),'special');
 assert.equal(pick({active:S('luca-di-grazia',20),opponent:S('free-rider',80,false,1,2)}),'heal');
 assert.equal(pick({active:S('luca-di-grazia',70),opponent:S('free-rider',90,false,1,2)}),'special');
 assert.equal(pick({active:S('luca-di-grazia',70),opponent:S('free-rider',90,false,1,2),availableMoves:['attack','defend','heal']}),'defend');
 assert.equal(pick({active:S('luca-di-grazia',70),opponent:S('free-rider',90,false,1,9),availableMoves:['attack','defend']}),'attack');
});
test('heal only when capped result strictly exceeds lethal effective hit',()=>{
 assert.notEqual(pick({active:S('luca-di-grazia',40),opponent:S('free-rider',90,false,1,9),availableMoves:['attack','heal']}),'heal');
 // HP 39 + free-rider heal 11 equals the unshielded special's 50 damage: equality is not survival.
 assert.notEqual(pick({active:S('free-rider',39),opponent:S('luca-di-grazia',90,false,1,2),availableMoves:['attack','heal']}),'heal');
 assert.equal(pick({active:S('luca-di-grazia',20,true),opponent:S('free-rider',90,false,1,9),availableMoves:['attack','heal']}),'attack');
});
test('special readiness boundary and available cooldown',()=>{
 for(const r of [3,4]) assert.equal(pick({active:S('luca-di-grazia',70),opponent:S('free-rider',90,false,3,r),availableMoves:['attack','defend']}),'defend');
 assert.equal(pick({active:S('luca-di-grazia',70),opponent:S('free-rider',90,false,3,5),availableMoves:['attack','defend']}),'attack');
});
test('all fighter matchup attack damage uses published fighter stats',()=>{
 const ids=['luca-di-grazia','free-rider','tryhard','assessment-hoodie','trischli-warrior','bad-teacher'];
 for(const own of ids) for(const foe of ids) { const attack=fighterStats(own).attack, block=fighterStats(foe).defend; const hp=Math.max(1,Math.round(attack*(100-block)/100)); assert.equal(pick({active:S(own),opponent:S(foe,hp,true),availableMoves:['attack','special']}),'attack',own+' vs '+foe); }
});
