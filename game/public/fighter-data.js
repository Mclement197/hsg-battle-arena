// Shared by the server engine and roster. Values are game units, not cosmetic ratings.
export const STAT_META = Object.freeze({
  attack: Object.freeze({ label: 'Attack', unit: 'HP damage', max: 50 }),
  defend: Object.freeze({ label: 'Defend', unit: '% next hit blocked', max: 100 }),
  heal: Object.freeze({ label: 'Heal', unit: 'HP restored', max: 20 }),
  special: Object.freeze({ label: 'Special', unit: 'HP damage', max: 50 })
});
const profile = (archetype, attack, defend, heal, special) => Object.freeze({ archetype, stats: Object.freeze({ attack, defend, heal, special }) });
export const FIGHTER_PROFILES = Object.freeze({
  'luca-di-grazia': profile('The campus legend · strongest overall', 50, 100, 20, 50),
  'free-rider': profile('The survivor · guard & recovery', 17, 62, 11, 30),
  'tryhard': profile('The technician · sustained pressure', 25, 42, 8, 36),
  'assessment-hoodie': profile('The comeback kid · recovery specialist', 19, 56, 13, 31),
  'trischli-warrior': profile('The glass cannon · explosive damage', 27, 35, 7, 40),
  'bad-teacher': profile('The gatekeeper · defensive pressure', 22, 66, 9, 34)
});
export const LEGACY_STATS = Object.freeze({ attack: 20, defend: 50, heal: 15, special: 30 });
export function fighterStats(id) { return Object.hasOwn(FIGHTER_PROFILES, id || '') ? FIGHTER_PROFILES[id].stats : LEGACY_STATS; }
export function strengthScore(id) { return Object.entries(fighterStats(id)).reduce((sum, [key, value]) => sum + value / STAT_META[key].max, 0); }
export function moveDescription(stats, move) {
  return move === 'defend' ? stats.defend + '% next hit blocked' : move === 'heal' ? 'Restore ' + stats.heal + ' HP' : stats[move] + ' HP damage';
}
