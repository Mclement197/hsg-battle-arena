import { RULES } from './engine.mjs';

export const adminStaticPath = pathname => ['/game/admin/', '/game/admin.js', '/game/admin.css'].includes(pathname);

const arenas = new WeakMap();

// Observe creation immediately, not at poll/tick time: even short-lived rooms use a number.
export function trackAdminRooms(arena) {
  let state = arenas.get(arena);
  if (state) return state;
  state = { next: 1, numbers: new WeakMap() };
  arenas.set(arena, state);
  const assign = room => {
    if (!state.numbers.has(room)) state.numbers.set(room, state.next++);
  };
  for (const room of arena.rooms.values()) assign(room);
  const create = arena.create;
  arena.create = function (...args) {
    const room = create.apply(this, args);
    assign(room);
    return room;
  };
  return state;
}

// Deliberately independent of gameplay snapshots: no capabilities, people or vote data.
export function adminOverview(arena) {
  const { numbers } = trackAdminRooms(arena);
  const rooms = [], online = new Set();
  for (const room of arena.rooms.values()) {
    let playerCount = 0;
    const botHostConnected = room.mode === 'bot' && [...room.streams].some(stream => stream.viewer.role === 'host');
    for (const player of room.players.values()) {
      // Bot rooms use internal A/B seats; only A belongs to a human host.
      if (room.mode === 'bot' && player.team !== 'A') continue;
      playerCount++;
      if (player.connections > 0 || botHostConnected) online.add(room.id + ':' + player.id);
    }
    const fighter = team => ({ characterId: room.teams[team].characterId ?? null,
      hp: room.teams[team].hp, maxHp: RULES.maxHp });
    rooms.push({ roomNumber: numbers.get(room), mode: room.mode, phase: room.phase,
      turnNumber: room.phase === 'running' ? room.turn.number : room.phase === 'finished' ? room.lastResult?.number ?? null : null,
      fighters: { A: fighter('A'), B: fighter('B') }, playerCount });
  }
  const rank = { running: 0, countdown: 0, lobby: 1, finished: 2 };
  rooms.sort((a, b) => rank[a.phase] - rank[b.phase] || a.roomNumber - b.roomNumber);
  return { serverNow: arena.now(), summary: {
    activeRooms: rooms.filter(room => room.phase !== 'finished').length,
    runningBattles: rooms.filter(room => room.phase === 'running' || room.phase === 'countdown').length,
    playersOnline: online.size, roomsUsed: rooms.length, roomCapacity: arena.maxRooms
  }, rooms };
}
