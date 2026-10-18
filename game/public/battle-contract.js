// Presentation only: these are the four existing mechanics, never new combat rules.
const entry = (motif, color, labels) => Object.freeze(Object.fromEntries(['attack','defend','heal','special'].map((move,i) => [move, Object.freeze({ motif, color, label: labels[i], clip: move, target: ['attack','special'].includes(move) ? 'opponent' : 'actor', duration: 2200, launch: .32, impact: .59 })])));
export const ABILITIES = Object.freeze({
 'luca-di-grazia': entry('chalk',0xffcf63,['GOLDEN CHALK','OPEN BOOK','GOOD WORK','FULL MARKS']),
 'free-rider': entry('notes',0x9ee8f2,['COPY / PASTE','PAPER DECOY','GROUP CREDIT','ALL MY WORK']),
 'tryhard': entry('formula',0x91edaf,['FORMULA','TEXTBOOK','EXTRA CREDIT','A+']),
 'assessment-hoodie': entry('cloud',0xb1afff,['BAD LUCK','HOOD UP','ONE MORE TRY','BROKEN CHARM']),
 'trischli-warrior': entry('disco',0xff83e1,['DANCE OFF','WRISTBAND','SECOND WIND','DANCE FLOOR']),
 'bad-teacher': entry('redpen',0xff685b,['RED PEN','EXAM SHIELD','LATE CREDIT','FAILED'])
});
export const ARENA_WORLDS = Object.freeze({
 library: { model: './assets/arenas/library.glb', fighters: [[-2.3,0,2.5],[2.3,0,1.0]], overview: [0,3.0,8.0], look: [0,1,1.6], floor: 0 },
 trischli: { model: './assets/arenas/trischli.glb', fighters: [[-1.4,.012,-4.2],[1.3,.012,-6.4]], overview: [0,2.55,.2], look: [0,1,-5.3], floor: .012 }
});
// The stream's first result is history, not an attack. Explicit reset is a reconnect boundary.
export class BattleEvents {
 constructor() { this.reset(); }
 reset() { this.scope = null; this.number = 0; this.pending = []; }
 consume(state) {
  const scope = state.roomId + ':' + state.match, n = state.lastResult?.number || 0;
  if (scope !== this.scope || state.phase === 'lobby') { this.scope = scope; this.number = n; this.pending = []; return; }
  if (n <= this.number) return;
  const results = (state.recentResults || [state.lastResult]).filter(r => r.number > this.number).sort((a,b) => a.number-b.number);
  const seen = new Set();
  this.number = n;
  for (const r of results) {
  if (seen.has(r.number)) continue; seen.add(r.number);
  const actor = state.teams?.[r.team], characterId = r.actorCharacterId || actor?.characterId, ability = ABILITIES[characterId]?.[r.move];
  if (!ability || !['running','finished'].includes(state.phase)) continue;
  const target = r.targetTeam || (ability.target === 'actor' ? r.team : r.team === 'A' ? 'B' : 'A');
  this.pending.push({ id: scope + ':' + r.turnId, actor: r.team, target, characterId, move: r.move, ability, defeated: (r.targetHp ?? state.teams[target].hp) === 0, resolvedAt: r.resolvedAt, result: r });
  // Connected rapid updates must finish in order; only a reconnect discards history.
  }
 }
}

export function moveLabel(characterId, move) {
 const type = move[0].toUpperCase() + move.slice(1);
 const name = ABILITIES[characterId]?.[move]?.label;
 return name ? type + ' · ' + name : type;
}

// A separate view of HP/results, never passed to transport or used to resolve combat.
export class BattlePresentation {
 constructor() { this.reset(); }
 reset() { this.events = new BattleEvents(); this.scope = null; this.pending = []; this.hp = null; this.result = null; }
 consume(state) {
  const scope = state.roomId + ':' + state.match;
  if (scope !== this.scope || state.phase === 'lobby' || !this.hp) {
   this.reset(); this.scope = scope; this.hp = { A: state.teams.A.hp, B: state.teams.B.hp }; this.result = state.lastResult;
  }
  this.events.consume(state);
  this.pending.push(...this.events.pending.splice(0));
  if (!this.pending.length) { this.hp = { A: state.teams.A.hp, B: state.teams.B.hp }; this.result = state.lastResult; }
 }
 complete(id) {
  const event = this.pending[0];
  if (!event || event.id !== id) return false;
  this.pending.shift();
  const r = event.result;
  this.hp[event.target] = Number.isFinite(r.targetHp) ? r.targetHp : Math.max(0, Math.min(100, this.hp[event.target] - (r.damage || 0) + (r.healed || 0)));
  this.result = r;
  return true;
 }
 get busy() { return this.pending.length > 0; }
 view(state) {
  if (!this.hp) return state;
  return { ...state, phase: this.busy && state.phase === 'finished' ? 'running' : state.phase, winner: this.busy ? null : state.winner,
   lastResult: this.result, teams: { A: { ...state.teams.A, hp: this.hp.A }, B: { ...state.teams.B, hp: this.hp.B } } };
 }
}
