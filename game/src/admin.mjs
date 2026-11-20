import { createHash, timingSafeEqual } from 'node:crypto';
import { GameError, fail, RULES } from './engine.mjs';

const WINDOW_MS = 60000, BLOCK_MS = 300000, MAX_FAILURES = 10;
const digest = value => createHash('sha256').update(value).digest();
export const adminStaticPath = pathname => ['/game/admin/', '/game/admin.js', '/game/admin.css'].includes(pathname);

// Capture only a fixed-size digest at server creation; never retain or return the key.
export function createAdminAuth(key, { now, maxClients }) {
  if (typeof key !== 'string') throw new Error('ADMIN_KEY must be text');
  if (!key) return null;
  const expected = digest(key), clients = new Map();
  function prune() {
    const time = now();
    for (const [ip, entry] of clients) {
      if (entry.blockedUntil > time) continue;
      entry.failures = entry.failures.filter(at => time - at < WINDOW_MS);
      if (!entry.failures.length) clients.delete(ip);
    }
  }
  function limited(seconds) {
    const error = new GameError(429, 'admin_rate_limit', 'Too many admin authentication attempts');
    error.retryAfter = seconds; throw error;
  }
  return { prune, authenticate(req, ip) {
    prune();
    const time = now();
    let entry = clients.get(ip);
    if (entry?.blockedUntil > time) limited(Math.ceil((entry.blockedUntil - time) / 1000));
    // Never evict active blocks to admit new identities: bounded and fail closed.
    if (!entry && clients.size >= maxClients) limited(60);
    const occurrences = req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'authorization').length;
    const supplied = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '')?.[1];
    const matches = timingSafeEqual(expected, digest(supplied ?? ''));
    if (occurrences === 1 && supplied !== undefined && matches) { clients.delete(ip); return; }
    if (!entry) { entry = { failures: [], blockedUntil: 0 }; clients.set(ip, entry); }
    entry.failures.push(time);
    if (entry.failures.length >= MAX_FAILURES) entry.blockedUntil = time + BLOCK_MS;
    fail(401, 'unauthorized', 'A valid admin bearer credential is required');
  } };
}

// Deliberately independent of gameplay snapshots: no capabilities, people or vote data.
export function adminOverview(arena) {
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
    rooms.push({ roomCode: room.id, mode: room.mode, phase: room.phase,
      turnNumber: room.phase === 'running' ? room.turn.number : room.phase === 'finished' ? room.lastResult?.number ?? null : null,
      fighters: { A: fighter('A'), B: fighter('B') }, playerCount });
  }
  const rank = { running: 0, countdown: 0, lobby: 1, finished: 2 };
  rooms.sort((a, b) => rank[a.phase] - rank[b.phase]);
  return { serverNow: arena.now(), summary: {
    activeRooms: rooms.filter(room => room.phase !== 'finished').length,
    runningBattles: rooms.filter(room => room.phase === 'running' || room.phase === 'countdown').length,
    playersOnline: online.size, roomsUsed: rooms.length, roomCapacity: arena.maxRooms
  }, rooms };
}
