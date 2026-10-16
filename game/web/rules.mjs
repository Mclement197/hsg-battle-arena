export const ARENAS = [
  { id: 'library', name: 'Library', detail: 'A quiet place to make some noise.', motif: 'THE STACKS' },
  { id: 'trischli', name: 'Trischli', detail: 'After hours. No excuses.', motif: 'AFTER DARK' },
  { id: 'mensa-b', name: 'Mensa B', detail: 'Lunch rush, main event.', motif: 'THE CANTEEN' },
];
export const FIGHTERS = [
  { id: 'luca', name: 'Luca Di Grazia', tag: 'The headliner', color: '#f1693c', initials: 'LD' },
  { id: 'free-rider', name: 'The free rider in the group project', tag: 'Present in spirit', color: '#8aa9c5', initials: 'FR' },
  { id: 'tryhard', name: 'The tryhard', tag: 'Extra credit energy', color: '#dfb857', initials: 'TH' },
  { id: 'assessment', name: 'The assessment student', tag: 'First year, final form', color: '#b5a5dd', initials: 'AS' },
  { id: 'warrior', name: 'The Trischli warrior', tag: 'Last one dancing', color: '#db788b', initials: 'TW' },
  { id: 'teacher', name: 'The bad teacher', tag: 'Pop quiz incoming', color: '#89b998', initials: 'BT' },
];
export const MOVES = [
  { id: 'attack', name: 'Attack', detail: 'Deal 20 damage', power: 20, type: 'hit' },
  { id: 'heavy', name: 'All-nighter', detail: 'Deal 32 · take 8', power: 32, type: 'hit' },
  { id: 'guard', name: 'Study break', detail: 'Block next hit', power: 0, type: 'guard' },
  { id: 'heal', name: 'Coffee run', detail: 'Restore 18 HP', power: 18, type: 'heal' },
];
export const MAX_HP = 100;
export function newMatch(player, opponent) {
  if (player === opponent) throw new Error('Fighters must be different');
  return { hp: [MAX_HP, MAX_HP], guarding: [false, false], turn: 0, winner: null, log: '', player, opponent };
}
export function performMove(state, moveId) {
  if (state.winner !== null) return state;
  const move = MOVES.find(item => item.id === moveId);
  if (!move) throw new Error('Unknown move');
  const actor = state.turn, target = 1 - actor;
  const hp = [...state.hp], guarding = [...state.guarding];
  let message;
  if (move.type === 'hit') {
    const damage = guarding[target] ? Math.ceil(move.power / 2) : move.power;
    guarding[target] = false;
    hp[target] = Math.max(0, hp[target] - damage);
    if (moveId === 'heavy') hp[actor] = Math.max(0, hp[actor] - 8);
    message = move.name + ' lands for ' + damage + ' damage' + (damage < move.power ? ' through the guard' : '') + '.';
  } else if (move.type === 'heal') {
    const restored = Math.min(move.power, MAX_HP - hp[actor]);
    hp[actor] += restored;
    message = 'Coffee run restores ' + restored + ' HP.';
  } else {
    guarding[actor] = true;
    message = 'Study break: the next hit is halved.';
  }
  const winner = hp[0] === 0 && hp[1] === 0 ? actor : hp[1] === 0 ? 0 : hp[0] === 0 ? 1 : null;
  return { ...state, hp, guarding, turn: winner === null ? target : actor, winner, log: message, lastMove: moveId, lastActor: actor };
}
