import { randomBytes, randomInt } from 'node:crypto';

export const RULES = Object.freeze({ turnMs: 15000, maxHp: 100, attack: 20, heal: 15, special: 30, specialCooldownOwnTurns: 3 });
export const ARENAS = Object.freeze(['library', 'trischli', 'mensa-b']);
export const CHARACTERS = Object.freeze(['luca-di-grazia', 'free-rider', 'tryhard', 'assessment-hoodie', 'trischli-warrior', 'bad-teacher']);
export const MOVES = Object.freeze(['attack', 'defend', 'heal', 'special']);
export class GameError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function fail(status, code, message) { throw new GameError(status, code, message); }
export function fields(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== keys.length || keys.some(key => !Object.hasOwn(body, key)))
    fail(400, 'invalid_body', 'Expected exactly: ' + (keys.join(', ') || '{}'));
}
const token = () => randomBytes(32).toString('base64url');
const id = () => randomBytes(6).toString('hex');
const teamState = () => ({ hp: RULES.maxHp, shield: false, ownTurn: 0, specialReadyOwnTurn: 0 });

// Inject clock and unbiased index picker for deterministic tests, not through HTTP.
export class Arena {
  constructor({ now = Date.now, pick = size => randomInt(size), maxRooms = 50, maxPlayers = 200,
    idleMs = 3600000, lifetimeMs = 21600000 } = {}) {
    Object.assign(this, { now, pick, maxRooms, maxPlayers, idleMs, lifetimeMs });
    this.rooms = new Map();
  }
  create() {
    if (this.rooms.size >= this.maxRooms) fail(503, 'room_capacity', 'Room capacity reached');
    const createdAt = this.now();
    const room = { id: id(), hostToken: token(), createdAt, touchedAt: createdAt, revision: 0,
      mode: 'online', arenaId: 'library', phase: 'lobby', match: 0, winner: null, teams: { A: teamState(), B: teamState() },
      players: new Map(), credentials: new Map(), turn: null, lastResult: null, streams: new Set(), mutationRates: new Map() };
    this.rooms.set(room.id, room);
    return room;
  }
  enableBot(room) {
    const human = this.join(room, { nickname: 'You' });
    const bot = this.join(room, { nickname: 'Campus Bot' });
    human.player.team = 'A'; bot.player.team = 'B';
    room.mode = 'bot';
  }
  configure(room, viewer, body) {
    fields(body, ['arenaId', 'characterA', 'characterB']); this.requireRole(viewer, 'host');
    if (room.phase !== 'lobby') fail(409, 'invalid_phase', 'Choose fighters before starting the match');
    if (!ARENAS.includes(body.arenaId) || !CHARACTERS.includes(body.characterA) || !CHARACTERS.includes(body.characterB))
      fail(400, 'invalid_selection', 'Choose a listed arena and two listed fighters');
    room.arenaId = body.arenaId;
    room.teams.A.characterId = body.characterA; room.teams.B.characterId = body.characterB;
    this.touch(room); room.revision++;
  }
  play(room, viewer, body) {
    this.requireRole(viewer, 'host');
    if (room.mode !== 'bot') fail(409, 'invalid_mode', 'Solo moves are only available against the bot');
    const player = [...room.players.values()].find(player => player.team === 'A');
    this.vote(room, { role: 'player', player }, body);
  }
  expired(room) { const now = this.now(); return now - room.createdAt >= this.lifetimeMs || now - room.touchedAt >= this.idleMs; }
  touch(room) { room.touchedAt = this.now(); }
  join(room, body) {
    if (room.mode === 'bot') fail(409, 'solo_room', 'This is a solo game. Create an online room to invite friends');
    fields(body, ['nickname']);
    if (typeof body.nickname !== 'string') fail(400, 'invalid_nickname', 'Nickname must be text');
    const nickname = body.nickname.trim();
    if ([...nickname].length < 1 || [...nickname].length > 24 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(nickname))
      fail(400, 'invalid_nickname', 'Nickname must be 1–24 characters without controls');
    if (room.players.size >= this.maxPlayers) fail(503, 'player_capacity', 'Room player capacity reached');
    const countA = [...room.players.values()].filter(player => player.team === 'A').length;
    const countB = room.players.size - countA;
    const team = countA === countB ? ['A', 'B'][this.pick(2)] : countA < countB ? 'A' : 'B';
    const player = { id: id(), nickname, team, connections: 0 };
    const playerToken = token();
    room.players.set(player.id, player);
    room.credentials.set(playerToken, player);
    this.touch(room); room.revision++;
    return { player, playerToken };
  }
  authenticate(room, credential) {
    if (typeof credential !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(credential))
      fail(401, 'unauthorized', 'A valid bearer capability is required');
    if (credential === room.hostToken) return { role: 'host' };
    const player = room.credentials.get(credential);
    if (!player) fail(401, 'unauthorized', 'A valid bearer capability is required');
    return { role: 'player', player };
  }
  requireRole(viewer, role) { if (viewer.role !== role) fail(403, 'role_required', role + ' capability required'); }
  openTurn(room, team, number) {
    room.teams[team].ownTurn++;
    const startedAt = this.now();
    room.turn = { id: room.match + ':' + number, number, team, startedAt,
      deadline: startedAt + (room.mode === 'bot' && team === 'B' ? 1000 : RULES.turnMs), votes: new Map() };
  }
  available(room) {
    const team = room.teams[room.turn.team];
    return MOVES.filter(move => move !== 'special' || team.ownTurn >= team.specialReadyOwnTurn);
  }
  start(room, viewer, body) {
    fields(body, []); this.requireRole(viewer, 'host');
    if (room.phase !== 'lobby') fail(409, 'invalid_phase', 'Reset before starting another match');
    if (!['A', 'B'].every(team => [...room.players.values()].some(player => player.team === team)))
      fail(409, 'not_enough_players', 'At least one player per team is required');
    room.phase = 'running'; this.openTurn(room, 'A', 1); this.touch(room); room.revision++;
  }
  reset(room, viewer, body) {
    fields(body, []); this.requireRole(viewer, 'host');
    room.match++; room.phase = 'lobby'; room.winner = null; room.turn = null; room.lastResult = null;
    room.teams = { A: { ...teamState(), ...(room.teams.A.characterId ? { characterId: room.teams.A.characterId } : {}) }, B: { ...teamState(), ...(room.teams.B.characterId ? { characterId: room.teams.B.characterId } : {}) } }; this.touch(room); room.revision++;
  }
  vote(room, viewer, body) {
    fields(body, ['turnId', 'move']); this.requireRole(viewer, 'player');
    if (typeof body.turnId !== 'string' || body.turnId.length > 64 || !MOVES.includes(body.move))
      fail(400, 'invalid_vote', 'Invalid turnId or move');
    if (room.phase !== 'running') fail(409, 'invalid_phase', 'No active turn');
    if (body.turnId !== room.turn.id || this.now() >= room.turn.deadline)
      fail(409, 'stale_turn', 'This turn has ended');
    if (viewer.player.team !== room.turn.team) fail(403, 'wrong_team', 'Only the active team may vote');
    if (!this.available(room).includes(body.move)) fail(409, 'special_cooldown', 'Special is cooling down');
    room.turn.votes.set(viewer.player.id, body.move);
    if (room.mode === 'bot') room.turn.deadline = this.now(); this.touch(room); room.revision++;
  }
  counts(room) {
    const counts = Object.fromEntries(MOVES.map(move => [move, 0]));
    for (const move of room.turn.votes.values()) counts[move]++;
    return counts;
  }
  advance(room) {
    if (room.phase !== 'running' || this.now() < room.turn.deadline) return false;
    const turn = room.turn;
    const voteCounts = this.counts(room);
    const totalVotes = turn.votes.size;
    const max = Math.max(...Object.values(voteCounts));
    const tiedMoves = max ? MOVES.filter(move => voteCounts[move] === max) : [];
    const candidates = totalVotes ? tiedMoves : this.available(room);
    const move = candidates[this.pick(candidates.length)];
    const active = room.teams[turn.team];
    const otherTeam = turn.team === 'A' ? 'B' : 'A';
    const target = room.teams[otherTeam];
    let damage = 0, healed = 0;
    if (move === 'attack' || move === 'special') {
      damage = Math.min(target.hp, RULES[move] / (target.shield ? 2 : 1));
      target.hp -= damage; target.shield = false;
      if (move === 'special') active.specialReadyOwnTurn = active.ownTurn + RULES.specialCooldownOwnTurns + 1;
    } else if (move === 'defend') active.shield = true;
    else { healed = Math.min(RULES.heal, RULES.maxHp - active.hp); active.hp += healed; }
    room.lastResult = { turnId: turn.id, number: turn.number, team: turn.team, move,
      voteCounts, totalVotes, tiedMoves, damage, healed, resolvedAt: this.now() };
    if (target.hp === 0) { room.phase = 'finished'; room.winner = turn.team; room.turn = null; }
    else this.openTurn(room, otherTeam, turn.number + 1);
    room.revision++;
    return true;
  }
  snapshot(room, viewer) {
    const players = [...room.players.values()];
    const teams = Object.fromEntries(['A', 'B'].map(key => [key, { ...room.teams[key],
      specialCooldownRemaining: Math.max(0, room.teams[key].specialReadyOwnTurn - room.teams[key].ownTurn),
      playerCount: players.filter(player => player.team === key).length }]));
    const turn = room.turn && { id: room.turn.id, number: room.turn.number, team: room.turn.team,
      startedAt: room.turn.startedAt, deadline: room.turn.deadline, availableMoves: this.available(room),
      voteCounts: this.counts(room), totalVotes: room.turn.votes.size };
    return { roomId: room.id, revision: room.revision, serverNow: this.now(), phase: room.phase,
      mode: room.mode, arenaId: room.arenaId, match: room.match, winner: room.winner, rules: RULES, teams,
      players: players.map(({ id, nickname, team, connections }) => ({ id, nickname, team, connected: connections > 0 })),
      turn, lastResult: room.lastResult,
      you: viewer.role === 'host' ? { role: 'host' } : { role: 'player', playerId: viewer.player.id,
        team: viewer.player.team, vote: room.turn?.votes.get(viewer.player.id) ?? null } };
  }
}
