import { fighterStats } from '../public/fighter-data.js';

export const BOT_DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);

// Only public combat state and engine-legal moves enter the policy, never votes.
export function chooseBotMove({ difficulty = 'normal', active, opponent, availableMoves, maxHp }, pick) {
  const moves = availableMoves.filter(move => move !== 'heal' || active.hp < maxHp);
  const uniform = () => moves[pick(moves.length)];
  if (difficulty === 'easy' || difficulty === 'normal' && pick(2) === 0) return uniform();

  const ownStats = fighterStats(active.characterId), opponentStats = fighterStats(opponent.characterId);
  const damage = (power, target, stats) => Math.max(1, Math.round(power * (100 - (target.shield ? stats.defend : 0)) / 100));
  if (moves.includes('attack') && damage(ownStats.attack, opponent, opponentStats) >= opponent.hp) return 'attack';
  if (moves.includes('special') && damage(ownStats.special, opponent, opponentStats) >= opponent.hp) return 'special';

  const specialNextTurn = opponent.specialReadyOwnTurn <= opponent.ownTurn + 1;
  const incoming = Math.max(damage(opponentStats.attack, active, ownStats),
    specialNextTurn ? damage(opponentStats.special, active, ownStats) : 0);
  if (moves.includes('heal') && incoming >= active.hp && Math.min(maxHp, active.hp + ownStats.heal) > incoming) return 'heal';
  if (moves.includes('special')) return 'special';
  if (moves.includes('defend') && specialNextTurn) return 'defend';
  return 'attack';
}
