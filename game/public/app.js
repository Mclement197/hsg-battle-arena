import { BattleWorld } from './battle-world.js?v=20261018-previews';
import { CharacterStage, modelFor } from './characters.js?v=20261018-previews';
import { FIGHTER_PROFILES, STAT_META, fighterStats, moveDescription } from './fighter-data.js?v=20261016-arcade';
// Presentation identities use the authoritative team characterId, never nickname or team order.
export const CHARACTER_THEMES = Object.freeze({
  'luca-di-grazia': { name: 'Luca Di Grazia', motif: 'chalk', labels: { attack: 'GOLDEN CHALK', defend: 'OPEN BOOK', heal: 'GOOD WORK', special: 'FULL MARKS' } },
  'free-rider': { name: 'Free rider in group project', motif: 'notes', labels: { attack: 'COPY / PASTE', defend: 'PAPER DECOY', heal: 'GROUP CREDIT', special: 'ALL MY WORK' } },
  'tryhard': { name: 'Tryhard', motif: 'formula', labels: { attack: 'FORMULA', defend: 'TEXTBOOK', heal: 'EXTRA CREDIT', special: 'A+' } },
  'assessment-hoodie': { name: 'Assessment student', motif: 'cloud', labels: { attack: 'BAD LUCK', defend: 'HOOD UP', heal: 'ONE MORE TRY', special: 'BROKEN CHARM' } },
  'trischli-warrior': { name: 'Trischli warrior', motif: 'disco', labels: { attack: 'DANCE OFF', defend: 'WRISTBAND', heal: 'SECOND WIND', special: 'DANCE FLOOR' } },
  'bad-teacher': { name: 'Bad teacher', motif: 'redpen', labels: { attack: 'RED PEN', defend: 'EXAM SHIELD', heal: 'LATE CREDIT', special: 'FAILED' } }
});

// Drawn vector motifs, not platform-dependent emoji. Each action retains its own motion grammar.
const MOTIFS = Object.freeze({
  chalk: ['M12 25 45 48 86 8', 'M16 70h70M50 70v12'],
  notes: ['M20 14h48l13 13v58H20z', 'M30 40h39M30 52h39M30 64h27M68 14v14h13'],
  formula: ['M19 22h57M19 76h57M45 30 29 50l16 20M55 30l16 20-16 20'],
  cloud: ['M22 62Q8 60 13 45q3-11 16-11 4-20 23-20 18 0 22 20 17-1 19 16 0 12-15 12Z', 'M44 66 36 79l13-4-5 14'],
  disco: ['M50 11v73M11 49h78M23 22l54 54M77 22 23 76', 'M50 31 69 50 50 69 31 50Z'],
  redpen: ['M20 77 71 15l13 11-51 62-17 3z', 'M68 19l13 11M24 69l12 10']
});
export function characterTheme(id) {
  return typeof id === 'string' && Object.hasOwn(CHARACTER_THEMES, id) ? CHARACTER_THEMES[id] : null;
}
export function themeMotifPaths(motif) { return MOTIFS[motif] || []; }

// Original action assets; add future moves in this one mapping.
export const ACTION_SOUNDS = Object.freeze({
  attack: './assets/audio/attack-impact.wav',
  defend: './assets/audio/defend-shield.wav',
  heal: './assets/audio/heal-chime.wav',
  special: './assets/audio/special-burst.wav'
});

export const AUDIO_SOUNDS = Object.freeze({
  ...ACTION_SOUNDS,
  'battle-start': './assets/audio/battle-start.wav',
  countdown: './assets/audio/countdown.wav',
  lobby: './assets/audio/lobby-loop.wav',
  battle: './assets/audio/battle-loop.webm',
  win: './assets/audio/victory.webm'
});

// Arm only on a live edge. Native audio-clock scheduling avoids timer drift and stale replay.
export function createBattleStartCue(play, stop = () => {}) {
  let scope = null, phase = null, consumed = false;
  const consume = state => {
    const nextScope = state.roomId + ':' + state.match;
    if (scope !== nextScope) {
      stop(); scope = nextScope; phase = state.phase; consumed = state.phase !== 'lobby';
      return;
    }
    const started = phase === 'lobby' && ['countdown', 'running'].includes(state.phase) && !consumed;
    phase = state.phase;
    if (state.phase !== 'lobby') consumed = true;
    if (started && state.phase === 'countdown' && state.prebattle) {
      const elapsed = Math.max(0, (state.serverNow - state.prebattle.startedAt) / 1000);
      // Never start the voice or Ready/Fight late or let it intrude into turn one.
      if (elapsed < 3) play('countdown', { offset: elapsed });
      if (elapsed < 3) play('battle-start', { delay: 3 - elapsed });
    } else if (started && state.prebattle === undefined) play('battle-start'); // Old server only; never a missed new-server intro.
    if (state.phase === 'lobby' || state.phase === 'finished' || (state.phase === 'running' && state.prebattle === null)) stop();
  };
  consume.reset = () => { stop(); scope = null; phase = null; consumed = false; };
  return consume;
}

// A finished snapshot is history unless this stream observed the live running edge.
export function createVictoryCue(play, stop = () => {}) {
  let scope = null, phase = null, consumed = false;
  const consume = state => {
    const nextScope = state.roomId + ':' + state.match;
    if (scope !== nextScope) {
      stop(); scope = nextScope; phase = state.phase; consumed = state.phase === 'finished';
      return;
    }
    const won = phase === 'running' && state.phase === 'finished' && !consumed;
    phase = state.phase;
    if (phase === 'finished') consumed = true; // Even unavailable/muted outcomes stay consumed.
    if (won) play('win');
  };
  consume.reset = () => { stop(); scope = null; phase = null; consumed = false; };
  return consume;
}

export function prebattleLabel(state, now = state.serverNow) {
  if (state.phase !== 'countdown' || !state.prebattle) return '';
  const elapsed = Math.max(0, now - state.prebattle.startedAt);
  return elapsed < 3000 ? String(3 - Math.floor(elapsed / 1000)) : 'READY… FIGHT!';
}

// Consume server snapshots only, never votes or the presentation countdown.
export function createActionCue(play) {
  let scope = null, seenNumber = 0;
  const consume = state => {
    const nextScope = state.roomId + ':' + state.match;
    const result = state.lastResult;
    const number = result?.number || 0;
    if (scope !== nextScope) {
      scope = nextScope;
      seenNumber = number; // A first/reopened snapshot is history, not a new action.
      return;
    }
    if (number <= seenNumber) return;
    seenNumber = number; // Consume even muted/unavailable cues; never replay them later.
    if (Object.hasOwn(ACTION_SOUNDS, result.move)) play(result.move);
  };
  consume.reset = () => { scope = null; seenNumber = 0; };
  return consume;
}

export const ACTION_EFFECTS = Object.freeze({
  attack: { kind: 'slash', target: 'opponent' },
  defend: { kind: 'shield', target: 'actor' },
  heal: { kind: 'healing', target: 'actor' },
  special: { kind: 'burst', target: 'opponent' }
});
export function createVisualCue(show) {
  let scope = null, seenNumber = 0;
  return state => {
    const nextScope = state.roomId + ':' + state.match;
    const result = state.lastResult;
    const number = result?.number || 0;
    if (scope !== nextScope) { scope = nextScope; seenNumber = number; return; }
    if (number <= seenNumber) return;
    seenNumber = number;
    if (!['running', 'finished'].includes(state.phase)) return;
    const effect = ACTION_EFFECTS[result.move];
    if (!effect || !['A', 'B'].includes(result.team)) return;
    // Identity belongs to the acting team even when the effect lands on its opponent.
    // Unknown older identities intentionally retain generic cues.
    const actorTeam = result.team;
    const characterId = state.teams?.[actorTeam]?.characterId;
    show({ ...effect, move: result.move, actorTeam,
      themeId: characterTheme(characterId) ? characterId : null,
      team: effect.target === 'actor' ? actorTeam : actorTeam === 'A' ? 'B' : 'A' });
  };
}

export class ActionAudio {
  constructor(context, fetcher = (...args) => globalThis.fetch(...args)) {
    this.context = context;
    this.fetcher = fetcher;
    this.buffers = new Map();
    this.active = new Set();
    this.prebattle = new Set();
    this.music = null;
    this.musicVolume = .35; this.sfxVolume = .8;
    this.musicGain = context.createGain(); this.sfxGain = context.createGain();
    this.musicGain.connect(context.destination); this.sfxGain.connect(context.destination);
    this.setVolume('music', this.musicVolume); this.setVolume('sfx', this.sfxVolume);
  }
  // Optional music codecs must not silence the unchanged lobby or SFX.
  get ready() { return Object.keys(AUDIO_SOUNDS).every(move => ['battle', 'win'].includes(move) || this.buffers.has(move)); }
  async load() {
    if (this.loading) return this.loading;
    this.loading = Promise.all(Object.entries(AUDIO_SOUNDS).map(async ([move, url]) => {
      if (this.buffers.has(move)) return;
      try {
        const response = await this.fetcher(url);
        if (!response.ok) return;
        const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(move, buffer);
      } catch { /* Missing assets or unsupported audio must not interrupt the game. */ }
    }));
    await this.loading;
    this.loading = null;
  }
  setVolume(bus, value) {
    if (!['music', 'sfx'].includes(bus)) return;
    value = Number(value);
    if (!Number.isFinite(value)) return;
    this[bus + 'Volume'] = Math.max(0, Math.min(1, value));
    this[bus + 'Gain'].gain.setValueAtTime(this[bus + 'Volume'], this.context.currentTime);
  }
  setMusic(track, scope = track) {
    const key = track ? track + ':' + scope : null;
    if (this.music && this.musicKey === key) return;
    this.music?.stop(); this.music = null; this.musicKey = null;
    if (track && ['lobby', 'battle'].includes(track) && this.play(track, { loop: true })) {
      this.music = this.lastSource; this.musicKey = key;
    }
  }
  stopPrebattle() {
    for (const source of [...this.prebattle]) source.stop();
    this.prebattle.clear();
  }
  stopVictory() {
    this.victory?.stop(); this.victory = null;
  }
  play(move, { delay = 0, offset = 0, loop = false } = {}) {
    if (move === 'win') { this.setMusic(null); this.stopVictory(); }
    const buffer = this.buffers.get(move);
    // Never queue a stale action while loading or waiting for a user gesture.
    if (!buffer || this.context.state !== 'running') return false;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer; source.loop = loop; this.lastSource = source;
    gain.gain.setValueAtTime((move === 'countdown' ? .9 : .45) * (move === 'battle' ? .5 : move === 'win' ? 2 : 1), this.context.currentTime);
    source.connect(gain).connect(['lobby', 'battle', 'win'].includes(move) ? this.musicGain : this.sfxGain);
    this.active.add(source);
    if (move === 'win') this.victory = source;
    if (['countdown', 'battle-start'].includes(move)) this.prebattle.add(source);
    source.onended = () => { if (this.victory === source) this.victory = null; this.active.delete(source); this.prebattle.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(this.context.currentTime + delay, offset);
    return true;
  }
  stop() {
    for (const source of this.active) source.stop();
    this.active.clear(); this.prebattle.clear(); this.music = null; this.musicKey = null; this.victory = null;
  }
}

// Same-origin transport only. Capabilities are never placed in URLs or DOM.
const ROOM_RE = /^[a-f0-9]{12}$/;
const prefix = 'hsg-arena:v1:';
export const validRoom = room => ROOM_RE.test(room || '');
export const roomCode = value => String(value || '').trim().toLowerCase();
export function parseFrames(chunk, state, onState) {
  state.buffer = (state.buffer + chunk).replace(/\r\n/g, '\n');
  if (state.buffer.length > 262144) throw new Error('Event stream frame too large');
  let index;
  while ((index = state.buffer.indexOf('\n\n')) !== -1) {
    const frame = state.buffer.slice(0, index);
    state.buffer = state.buffer.slice(index + 2);
    let type = '', data = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      if (line.startsWith('data:')) data += line.slice(5).trimStart();
    }
    if (type === 'state' && data) onState(JSON.parse(data));
  }
}
export class ArenaClient {
  constructor({ fetcher = (...args) => globalThis.fetch(...args), storage = sessionStorage, onState = () => {}, onConnection = () => {}, onError = () => {}, sleep = (ms, signal) => new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  }) } = {}) {
    this.fetcher = fetcher; this.storage = storage; this.onState = onState;
    this.onConnection = onConnection; this.onError = onError; this.sleep = sleep;
    this.generation = 0; this.room = null; this.role = null; this.token = null;
    this.state = null; this.controller = null; this.offset = 0;
  }
  key(room, role) { return prefix + role + ':' + room; }
  save(room, role, token) {
    if (!validRoom(room) || !['host', 'player'].includes(role) || !token) throw new Error('Invalid session');
    this.storage.setItem(this.key(room, role), token);
    this.storage.setItem(prefix + 'active', JSON.stringify({ room, role }));
  }
  remembered(roomHint) {
    try {
      const active = JSON.parse(this.storage.getItem(prefix + 'active') || 'null');
      if (roomHint && validRoom(roomHint) && roomHint !== active?.room) {
        const token = this.storage.getItem(this.key(roomHint, 'player'));
        return token ? { room: roomHint, role: 'player', token } : null;
      }
      if (!active || !validRoom(active.room) || !['host', 'player'].includes(active.role)) return null;
      const token = this.storage.getItem(this.key(active.room, active.role));
      return token ? { ...active, token } : null;
    } catch { return null; }
  }
  forget() {
    if (this.room && this.role) this.storage.removeItem(this.key(this.room, this.role));
    this.storage.removeItem(prefix + 'active');
    this.stop();
    this.room = null; this.role = null; this.token = null; this.state = null;
  }
  stop() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
  }
  base(room = this.room) {
    if (!validRoom(room)) throw new Error('Enter a 12-character room code');
    return '/game/api/rooms/' + room;
  }
  async request(path, { method = 'GET', body, token = this.token, signal } = {}) {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.fetcher(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal, cache: 'no-store' });
    if (!response.ok) {
      let message;
      try { message = (await response.json()).error?.message; } catch { /* generic error below */ }
      const error = new Error(message || 'Request failed (' + response.status + ')');
      error.status = response.status;
      error.retryAfter = Number(response.headers?.get('Retry-After')) || 0;
      throw error;
    }
    return response.json();
  }
  accept(state, generation = this.generation) {
    if (generation !== this.generation || state.roomId !== this.room) return;
    if (this.state && state.revision < this.state.revision) return;
    this.state = state;
    this.offset = state.serverNow - Date.now();
    this.onState(state);
  }
  async create(setup = {}) {
    const result = await this.request('/game/api/rooms', { method: 'POST', body: setup, token: null });
    this.save(result.roomId, 'host', result.hostToken);
    this.activate(result.roomId, 'host', result.hostToken, result.state);
    return result;
  }
  async join(room, nickname) {
    const result = await this.request(this.base(room) + '/join', { method: 'POST', body: { nickname: nickname.trim() }, token: null });
    this.save(room, 'player', result.playerToken);
    this.activate(room, 'player', result.playerToken, result.state);
    return result;
  }
  async resume(saved) {
    if (!saved || !validRoom(saved.room)) return false;
    this.activate(saved.room, saved.role, saved.token);
    try {
      if (saved.role === 'player') {
        const result = await this.request(this.base() + '/reconnect', { method: 'POST', body: {} });
        this.accept(result.state);
      } else {
        const result = await this.request(this.base() + '/state');
        this.accept(result.state);
      }
      return true;
    } catch (error) {
      if (error.status === 401 || error.status === 404) this.forget();
      else this.onError(error);
      return false;
    }
  }
  activate(room, role, token, state) {
    this.stop();
    this.room = room; this.role = role; this.token = token; this.state = null;
    if (state) this.accept(state);
    this.listen();
  }
  async mutate(action, body = {}) {
    if (!this.room || !this.token) throw new Error('Join a room first');
    if (!['start', 'reset', 'configure', 'play', 'vote'].includes(action)) throw new Error('Invalid action');
    if ((action === 'vote') !== (this.role === 'player')) throw new Error('Not allowed for this role');
    const generation = this.generation;
    const result = await this.request(this.base() + '/' + action, { method: 'POST', body });
    this.accept(result.state, generation);
    return result.state;
  }
  secondsLeft() {
    if (!this.state?.turn) return 0;
    return Math.max(0, Math.ceil((this.state.turn.deadline - Date.now() - this.offset) / 1000));
  }
  async listen() {
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    let failures = 0;
    while (generation === this.generation && !controller.signal.aborted) {
      try {
        this.onConnection(failures ? 'reconnecting' : 'connecting');
        const response = await this.fetcher(this.base() + '/events', { headers: { Authorization: 'Bearer ' + this.token }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) {
          const error = new Error('Connection failed (' + response.status + ')');
          error.status = response.status;
          error.retryAfter = Number(response.headers?.get('Retry-After')) || 0;
          throw error;
        }
        if (!response.body || !response.headers?.get('Content-Type')?.startsWith('text/event-stream')) throw new Error('Streaming is unavailable');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const frame = { buffer: '' };
        failures = 0;
        // Full snapshot arrives immediately; only then is this client live.
        while (generation === this.generation && !controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          parseFrames(decoder.decode(value, { stream: true }), frame, state => {
            if (generation !== this.generation) return;
            this.accept(state, generation);
            this.onConnection('connected');
          });
        }
        await reader.cancel().catch(() => {});
        if (controller.signal.aborted) break;
        throw new Error('Connection interrupted');
      } catch (error) {
        if (controller.signal.aborted || generation !== this.generation) break;
        this.onConnection('reconnecting');
        if (error.status === 401 || error.status === 404) {
          this.onError(error); this.forget(); this.onConnection('disconnected'); break;
        }
        failures++;
        const delay = Math.max(Math.min((Number(error.retryAfter) || 0) * 1000, 30000), Math.min(8000, 500 * 2 ** Math.min(failures - 1, 4)));
        await this.sleep(delay, controller.signal);
      }
    }
  }
}
export function present(state, connected, secondsLeft, origin = globalThis.location?.origin || '') {
  const host = state.you.role === 'host';
  const own = state.you.team;
  const active = state.turn?.team === own;
  const voting = !host && state.phase === 'running' && !!state.turn && active && connected && secondsLeft > 0;
  const teamName = team => characterTheme(state.teams[team]?.characterId)?.name || (team === 'A' ? 'Ace' : 'Dynamo');
  const names = team => state.players.filter(player => player.team === team).map(player => player.nickname);
  const result = state.lastResult;
  const last = result ? 'Team ' + teamName(result.team) + ' used ' + result.move + (result.damage ? ' for ' + result.damage + ' damage.' : result.healed ? ' and restored ' + result.healed + ' HP.' : '.') : 'The arena is ready.';
  const winner = state.winner === 'A' ? 'ace' : 'dynamo';
  const ownTeam = state.teams[own];
  return {
    screen: state.phase === 'lobby' ? host ? 'lobby' : 'player' : state.phase === 'finished' ? 'victory' : host ? 'battle' : 'player',
    role: host ? 'host' : 'guest', roomCode: state.roomId,
    joinUrl: origin + '/game/?room=' + state.roomId,
    teams: { ace: { hp: state.teams.A.hp, players: names('A') }, dynamo: { hp: state.teams.B.hp, players: names('B') } },
    canStart: connected && state.phase === 'lobby' && state.teams.A.playerCount > 0 && state.teams.B.playerCount > 0,
    canControl: host && connected,
    lobbyStatus: state.teams.A.playerCount && state.teams.B.playerCount ? 'Both teams are ready.' : 'Waiting for both teams to join.',
    turnLabel: state.phase === 'countdown' ? 'Get ready — voting opens after the intro' : state.turn ? 'Team ' + teamName(state.turn.team) + ' is choosing' : 'Match complete',
    round: state.turn?.number || result?.number || 1,
    secondsLeft, message: last, voteCount: state.turn?.totalVotes || 0, tally: state.turn?.voteCounts || { attack: 0, defend: 0, heal: 0, special: 0 },
    playerTeam: own === 'A' ? 'ace' : own === 'B' ? 'dynamo' : null,
    playerState: state.phase === 'countdown' ? 'Get ready — voting opens after the intro.' : state.phase === 'lobby' ? 'Waiting for the presenter to start.' : state.phase === 'finished' ? 'Match complete.' : !connected ? 'Reconnecting. Voting is paused.' : active ? secondsLeft ? 'Your team is choosing now.' : 'Time is up. Waiting for the server.' : 'Other team is choosing. Watch the projector.',
    voteFeedback: state.you.vote ? 'Vote confirmed: ' + state.you.vote + '. You can change it before the timer ends.' : 'You can change your vote until the timer ends.',
    votedMove: state.you.vote || null, canVote: voting, specialReady: !!state.turn?.availableMoves.includes('special'),
    specialInfo: ownTeam?.specialCooldownRemaining ? 'Ready in ' + ownTeam.specialCooldownRemaining + ' own turn(s)' : '30 damage · 3-turn cooldown',
    winner, victoryMessage: 'Well played, everyone. Ready for another round?'
  };
}
/* Presentation only. The server owns rooms, turns, HP, votes, eligibility and outcomes.
   Integration supplies a normalized view model to ArenaUI.render; no transport is assumed here. */
if (typeof document !== 'undefined') (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const characters = new CharacterStage();
  const battleWorld = new BattleWorld();
  const setFighterArt = (image, id, name, animated = false, team = '') => {
    const asset = modelFor(id);
    const url = (asset || modelFor('assessment-hoodie')).portrait;
    if (image.getAttribute('src') !== url) image.src = url;
    image.alt = name;
    if (animated && asset) { image.dataset.model = id; image.dataset.modelTeam = team; }
    else { delete image.dataset.model; delete image.dataset.modelTeam; }
  };
  let victoryTimer;
  const screens = ['menu', 'arena', 'character', 'help', 'entry', 'lobby', 'battle', 'player', 'victory'];
  let setupBusy = false;
  const moves = ['attack', 'defend', 'heal', 'special'];
  let audioContext;
  let actionAudio;
  let muted = false; // Desired preference; readiness still depends on browser permission and decoding.
  let audioAttempt = 0;
  let audioLoading = false;
  let audioError = '';
  let audioActivated = false;
  const activeTones = new Set();
  let currentJoinUrl = '';
  const setText = (id, value) => { if (value !== undefined && value !== null) $(id).textContent = String(value); };
  function show(screen, immediate = false) {
    if (screen === 'victory' && !immediate && ['battle', 'player'].includes(document.body.dataset.screen)) {
      victoryTimer ||= setTimeout(() => { victoryTimer = null; show('victory', true); }, Math.min(20000, Math.max(3400, (battleWorld.events.pending.length + (battleWorld.active ? 1 : 0) + 1) * 2200 + 900)));
      return; // Let the authoritative final hit and defeat finish; game state is already final.
    }
    clearTimeout(victoryTimer); victoryTimer = null;
    if (!screens.includes(screen) || document.body.dataset.screen === screen) return;
    screens.forEach((name) => { $(name + '-screen').hidden = name !== screen; });
    document.body.dataset.screen = screen;
    if (!['battle', 'player'].includes(screen)) { battleWorld.clear(); actionAudio?.stopPrebattle(); $('prebattle').hidden = true; }
    syncMusic();
    characters.sync();
    const heading = $(screen + '-screen').querySelector('h1');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  function intent(type, payload = {}) {
    document.dispatchEvent(new CustomEvent('arena:intent', { detail: { type, ...payload } }));
    if (!window.ArenaUI.connected) setText('connection', 'Waiting for game server');
  }
  function tabs(tab) {
    ['join', 'host'].forEach((name) => {
      const selected = name === tab;
      $(name + '-panel').hidden = !selected;
      $(name + '-tab').classList.toggle('active', selected);
      $(name + '-tab').setAttribute('aria-selected', String(selected));
      $(name + '-tab').tabIndex = selected ? 0 : -1;
    });
    $(tab + '-tab').focus();
  }
  $('join-tab').addEventListener('click', () => tabs('join'));
  $('host-tab').addEventListener('click', () => tabs('host'));
  document.querySelector('.panel-switch').addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    tabs(document.activeElement.id === 'join-tab' ? 'host' : 'join');
  });
  $('join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const code = roomCode($('join-code').value);
    const nickname = $('nickname').value.trim();
    if (!validRoom(code) || !nickname) { setText('join-error', 'Enter a 12-character room code and a nickname.'); $('join-error').hidden = false; return; }
    $('join-error').hidden = true;
    intent('join', { code, nickname });
  });
  $('create-room').addEventListener('click', () => beginSetup('groups'));
  $('start-game').addEventListener('click', () => intent('start'));
  $('reset-game').addEventListener('click', () => { if (window.confirm('Reset this match for everyone?')) intent('reset'); });
  $('replay-game').addEventListener('click', () => intent('replay'));
  $('copy-link').addEventListener('click', async () => {
    if (!currentJoinUrl) return;
    try { await navigator.clipboard.writeText(currentJoinUrl); setText('copy-link', 'Link copied'); }
    catch { setText('copy-link', 'Copy unavailable'); }
  });
  document.querySelectorAll('button[data-move]').forEach((button) => button.addEventListener('click', () => {
    if (button.disabled) return;
    // Do not show a confirmed vote until the server acknowledges it.
    intent('vote', { move: button.dataset.move });
    setText('vote-feedback', 'Sending your vote…');
  }));
  function soundReady() {
    return !muted && audioContext?.state === 'running' && actionAudio?.ready;
  }
  function updateSoundControl() {
    const supported = !!(window.AudioContext || window.webkitAudioContext);
    const ready = soundReady(); // Zero mixer levels do not mean browser audio is locked.
    const state = !supported ? 'unavailable' : muted ? 'muted' : audioError ? 'error' : ready ? 'ready' :
      audioContext?.state !== 'running' ? (audioActivated ? 'suspended' : 'waiting') : audioLoading ? 'loading' : 'error';
    const label = muted ? 'sound is off' : 'sound is on';
    // The toggle reflects the user's preference, never browser playback readiness.
    $('mute').dataset.audioState = state;
    $('mute').setAttribute('aria-pressed', String(muted));
    $('mute').setAttribute('aria-label', label);
    setText('mute', label);
    syncMusic();
    const hints = {
      unavailable: 'Audio unavailable in this browser',
      muted: 'Muted on this device',
      error: audioError || 'Audio unavailable — game sounds could not load',
      ready: ['battle', 'win'].every(kind => actionAudio?.buffers.has(kind)) ? '' : audioLoading ? 'Loading optional music…' :
        [!actionAudio?.buffers.has('battle') && 'Battle music unavailable — other game sounds remain enabled',
          !actionAudio?.buffers.has('win') && 'Victory sound unavailable — other game sounds remain enabled'].filter(Boolean).join('. '),
      loading: 'Loading audio…',
      suspended: 'Audio suspended — click, tap or press a key to resume',
      waiting: 'Waiting for browser audio permission — click, tap or press a key'
    };
    setText('sound-hint', hints[state]);
    $('mute').title = muted ? 'Enable sound on this device.' : 'Mute sound on this device.';
  }
  function cue(kind, options) {
    // Server events are not gestures: never resume or queue sound here.
    if (!soundReady()) return;
    try {
      if (Object.hasOwn(AUDIO_SOUNDS, kind)) { actionAudio?.play(kind, options); return; }
      const patterns = { turn: [360, 480] };
      (patterns[kind] || patterns.turn).forEach((frequency, i) => {
        const at = audioContext.currentTime + i * .095;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(.065, at + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, at + .14);
        oscillator.connect(gain).connect(actionAudio.sfxGain);
        activeTones.add(oscillator);
        oscillator.onended = () => { activeTones.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(at); oscillator.stop(at + .15);
      });
    } catch { /* Audio is optional. */ }
  }
  $('mute').addEventListener('click', () => {
    // Toggling ON always mutes, even before browser activation or asset loading.
    if (!muted) {
      ++audioAttempt;
      muted = true;
      actionAudio?.stop();
      for (const tone of activeTones) tone.stop();
      activeTones.clear();
      updateSoundControl();
    } else {
      muted = false;
      updateSoundControl();
      activateSound(true);
    }
  });
  function activateSound(confirmation = false) {
    if (muted) return;
    if (soundReady()) { updateSoundControl(); if (confirmation) cue('turn'); return; }
    if (audioLoading && audioContext?.state === 'running') return;
    const attempt = ++audioAttempt;
    audioError = '';
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      muted = false;
      if (!audioContext) {
        audioContext = new Audio();
        audioContext.addEventListener?.('statechange', () => {
          if (audioContext.state !== 'running') {
            actionAudio?.stop();
            for (const tone of activeTones) tone.stop();
            activeTones.clear();
          }
          if (audioContext.state === 'running') audioActivated = true;
          updateSoundControl();
        });
      }
      actionAudio ||= new ActionAudio(audioContext);
      for (const bus of ['music', 'sfx']) actionAudio.setVolume(bus, Number($('volume-' + bus).value || (bus === 'music' ? 35 : 80)) / 100);
      // Invoke synchronously in click/tap, BEFORE any fetch/decode await (Safari/iOS).
      const resumed = audioContext.resume();
      audioLoading = !actionAudio.ready;
      updateSoundControl();
      const loaded = actionAudio.load().then(() => {
        audioLoading = false;
        if (!actionAudio.ready) audioError = 'Audio unavailable — game sounds could not load';
        updateSoundControl();
      });
      void Promise.all([resumed, loaded]).then(() => {
        updateSoundControl();
        if (confirmation && attempt === audioAttempt && soundReady()) cue('turn');
      }).catch(() => {
        if (attempt === audioAttempt) audioError = 'Audio could not start — click, tap or press a key to retry';
        updateSoundControl();
      });
    } catch {
      audioLoading = false;
      audioError = 'Audio unavailable — could not initialize audio';
      updateSoundControl();
    }
  }
  // Capture before create/join/start handlers; resume synchronously inside the trusted gesture.
  for (const type of ['click', 'touchend', 'keydown']) document.addEventListener(type, event => {
    if (!event.isTrusted || event.target === $('mute') || event.target?.closest?.('#mute') || (type === 'keydown' && event.repeat)) return;
    activateSound();
  }, true);
  function syncMusic() {
    if (!actionAudio) return;
    const screen = document.body.dataset.screen;
    const state = window.ArenaUI?.connected ? client.state : null;
    if (state?.phase !== 'finished' || !['battle', 'player', 'victory'].includes(screen)) actionAudio.stopVictory();
    const battle = ['battle', 'player'].includes(screen) && state?.phase === 'running';
    const lobby = ['menu', 'entry', 'arena', 'character', 'lobby', 'help'].includes(screen) ||
      (screen === 'player' && client.state?.phase === 'lobby');
    // Music follows current authority, not a start cue: reconnect/unmute may recover it.
    if (battle) actionAudio.stopPrebattle();
    actionAudio.setMusic(soundReady() ? battle ? 'battle' : lobby ? 'lobby' : null : null,
      battle ? state.roomId + ':' + state.match : 'lobby');
  }
  for (const bus of ['music', 'sfx']) $('volume-' + bus).addEventListener('input', event => {
    actionAudio?.setVolume(bus, Number(event.target.value) / 100);
    setText('volume-' + bus + '-value', event.target.value + '%');
  });
  updateSoundControl();
  activateSound(); // A permitted autoplay attempt; rejection stays silent until a normal gesture.
  function roster(id, names) {
    const list = $(id);
    list.replaceChildren();
    for (const name of names || []) {
      const li = document.createElement('li');
      li.textContent = String(name);
      list.append(li);
    }
  }
  function health(team, hp) {
    if (!Number.isFinite(hp)) return;
    const safe = Math.max(0, Math.min(100, hp));
    $(team + '-hp').value = safe;
    setText(team + '-hp-text', safe + ' / 100 HP');
  }
  function render(view = {}) {
    // view is a presentation snapshot supplied by the integration layer; never gameplay authority.
    if (view.screen) show(view.screen);
    if (view.error === '') $('global-error').hidden = true;
    if (view.role) document.body.dataset.role = view.role === 'host' ? 'host' : 'guest';
    if (view.connection) {
      const labels = { connected: 'Connected', reconnecting: 'Reconnecting…', disconnected: 'Disconnected', connecting: 'Connecting…' };
      $('connection').dataset.state = view.connection;
      setText('connection', labels[view.connection] || view.connection);
      window.ArenaUI.connected = view.connection === 'connected';
    }
    if (view.error !== undefined) { $('join-error').hidden = !view.error; setText('join-error', view.error || ''); }
    if (view.roomCode !== undefined) setText('room-code', view.roomCode || '-----');
    if (view.joinUrl !== undefined) {
      currentJoinUrl = view.joinUrl || '';
      setText('join-url', currentJoinUrl || 'Waiting for join link');
      $('copy-link').disabled = !currentJoinUrl;
    }
    if (view.qrElement !== undefined) {
      // Integrator provides a genuine QR node; never interpolate raw HTML or invent QR blocks.
      $('qr-container').replaceChildren(view.qrElement || document.createTextNode('QR code unavailable'));
      $('qr-container').setAttribute('aria-label', view.qrElement ? 'Scan to join this room' : 'QR code unavailable');
    }
    if (view.teams) {
      for (const team of ['ace', 'dynamo']) {
        const data = view.teams[team];
        if (!data) continue;
        if (Array.isArray(data.players)) { roster(team + '-players', data.players); setText(team + '-count', data.players.length + (data.players.length === 1 ? ' player' : ' players')); setText(team + '-team-size', data.players.length + (data.players.length === 1 ? ' player' : ' players')); }
        health(team, data.hp);
      }
    }
    if (view.canStart !== undefined) $('start-game').disabled = !(view.role === 'host' && view.canStart);
    if (view.canControl !== undefined) { $('reset-game').disabled = !view.canControl; $('replay-game').disabled = !view.canControl; }
    if (view.lobbyStatus !== undefined) setText('lobby-status', view.lobbyStatus);
    if (view.turnLabel !== undefined) setText('turn-label', view.turnLabel);
    if (view.round !== undefined) setText('round-label', 'TURN ' + view.round);
    if (view.secondsLeft !== undefined) {
      const seconds = Math.max(0, Math.ceil(Number(view.secondsLeft) || 0));
      setText('countdown', seconds); setText('player-countdown', seconds);
      $('countdown').setAttribute('aria-label', seconds + ' seconds left');
    }
    syncMusic();
    if (view.message !== undefined) setText('battle-message', view.message);
    if (view.voteCount !== undefined) setText('vote-count', view.voteCount + (view.voteCount === 1 ? ' vote cast' : ' votes cast'));
    if (view.tally) moves.forEach((move) => setText('tally-' + move, Number(view.tally[move]) || 0));
    if (view.playerTeam !== undefined) setText('player-team', view.playerTeam === 'ace' ? 'TEAM ACE' : view.playerTeam === 'dynamo' ? 'TEAM DYNAMO' : 'SPECTATOR');
    if (view.playerState !== undefined) setText('player-state', view.playerState);
    if (view.voteFeedback !== undefined) setText('vote-feedback', view.voteFeedback);
    if (view.votedMove !== undefined) moves.forEach((move) => document.querySelector('button[data-move="' + move + '"]').setAttribute('aria-pressed', String(view.votedMove === move)));
    if (view.canVote !== undefined) moves.forEach((move) => document.querySelector('button[data-move="' + move + '"]').disabled = !view.canVote || (move === 'special' && !view.specialReady));
    if (view.specialInfo !== undefined) setText('special-info', view.specialInfo);
    if (view.winner !== undefined) {
      const ace = view.winner === 'ace';
      if (!$('winner-art').dataset.model) $('winner-art').src = modelFor(ace ? 'assessment-hoodie' : 'tryhard').portrait;
      setText('victory-title', ace ? 'Team Ace wins!' : 'Team Dynamo wins!');
    }
    if (view.victoryMessage !== undefined) setText('victory-message', view.victoryMessage);
  }
  window.ArenaUI = { render, cue, connected: false };
  $('copy-link').disabled = true;
  const actionCue = createActionCue(cue);
  const battleStartCue = createBattleStartCue(cue, () => actionAudio?.stopPrebattle());
  let activeEffect, effectTimer;
  function showActionEffect(effect) {
    // Shared scene owns physical choreography. Non-battle screens retain compact status stamps.
    if (['battle', 'player'].includes(document.body.dataset.screen)) return;
    characters.play(effect);
    clearTimeout(effectTimer);
    activeEffect?.remove?.();
    // Victory/phone screens have no opposing fighter: stamp the result instead.
    const onStage = document.body.dataset.screen === 'battle';
    const target = onStage ?
      document.querySelector('.fighter-visual[data-team="' + effect.team + '"]') :
      document.body.dataset.screen === 'victory' ? $('victory-message') : document.querySelector('.player-head');
    if (!target) return;
    const node = document.createElement('span');
    node.className = 'action-effect action-effect--' + effect.kind +
      (onStage ? '' : ' action-effect--stamp');
    node.setAttribute('aria-hidden', 'true');
    node.dataset.effectMove = effect.move;
    node.dataset.team = effect.team;
    const theme = characterTheme(effect.themeId);
    if (theme) {
      node.classList.add('action-effect--themed', 'action-effect--' + theme.motif);
      const badge = document.createElement('span');
      badge.className = 'action-theme-badge';
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 100 100');
      icon.setAttribute('aria-hidden', 'true');
      for (const pathData of themeMotifPaths(theme.motif)) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        icon.append(path);
      }
      const label = document.createElement('strong');
      label.textContent = theme.labels[effect.move];
      badge.append(icon, label);
      node.append(badge);
    } else for (let i = 0; i < 3; i++) node.append(document.createElement('i'));
    target.append(node);
    activeEffect = node;
    effectTimer = setTimeout(() => { node.remove?.(); if (activeEffect === node) activeEffect = null; }, 850);
  }
  const visualCue = createVisualCue(showActionEffect);
  const victoryCue = createVictoryCue(kind => { if (window.ArenaUI.connected) cue(kind); }, () => actionAudio?.stopVictory());
  const client = new ArenaClient({
    onState(state) {
      if (setupBusy || pendingSetupRoom) return;
      render(present(state, window.ArenaUI.connected, client.secondsLeft()));
      renderIdentity(state);
      battleStartCue(state);
      actionCue(state);
      visualCue(state);
      victoryCue(state);
      if (state.you.role === 'host' && $('qr-container').querySelector('img')?.src !== location.origin + '/game/api/rooms/' + state.roomId + '/qr.svg') {
        const qr = document.createElement('img');
        qr.src = '/game/api/rooms/' + state.roomId + '/qr.svg';
        qr.alt = 'Scan to join this room';
        render({ qrElement: qr });
      }
    },
    onConnection(status) {
      if (status !== 'connected') { battleStartCue.reset(); actionCue.reset(); victoryCue.reset(); battleWorld.disconnect(); }
      render({ connection: status });
      if (client.state && !setupBusy && !pendingSetupRoom) { render(present(client.state, status === 'connected', client.secondsLeft())); renderIdentity(client.state); }
    },
    onError(error) {
      reportError(error.message);
      const message = error.status === 401 || error.status === 404 ? 'Your room or session expired. Create or join a new game.' : error.message;
      setText('connection', message);
      setText('join-error', message); $('join-error').hidden = false;
      setText('vote-feedback', message);
      if (error.status === 401 || error.status === 404) show('entry');
    }
  });
  async function handleIntent({ type, code, nickname, move }) {
    try {
      if (type === 'join') {
        $('join-form').querySelector('button[type="submit"]').disabled = true;
        await client.join(code, nickname);
        $('join-form').querySelector('button[type="submit"]').disabled = false;
      } else if (type === 'vote') {
        if (!client.state?.turn || !window.ArenaUI.connected) return;
        await client.mutate('vote', { turnId: client.state.turn.id, move });
      } else if ((type === 'start' || type === 'reset' || type === 'replay') && client.role === 'host') {
        const state = await client.mutate(type === 'start' ? 'start' : 'reset');
        if ((state.mode === 'bot' && type !== 'start') || (state.mode === 'friend' && type === 'replay')) await client.mutate('start');
      }
    } catch (error) {
      reportError(error.message);
      $('create-room').disabled = false;
      $('join-form').querySelector('button[type="submit"]').disabled = false;
      if (error.status === 409 && client.room) {
        try { client.accept((await client.request(client.base() + '/state')).state); } catch { /* Next stream snapshot will recover. */ }
      }
      setText('join-error', error.message); $('join-error').hidden = false;
      setText('vote-feedback', error.message);
      setText('lobby-status', error.message);
      setText('connection', error.message);
    }
  }
  const arenaNames = { library: 'Library', trischli: 'Trischli', 'mensa-b': 'Mensa B' };
  const arenaDescriptions = { library: 'Quiet zone. Loud rivalry.', trischli: 'Last dance. Last fighter standing.', 'mensa-b': 'No 3D environment yet. Health and commands only.' };
  let setupMode = 'groups', selectedArena = 'library', selectedTeam = 'A';
  const selectedCharacters = { A: 'luca-di-grazia', B: 'free-rider' };
  function reportError(message) { setText('global-error', message); $('global-error').hidden = false; }
  function mainMenu() {
    pendingSetupRoom = null;
    client.stop();
    render({ connection: 'disconnected' });
    $('resume-game').hidden = !client.remembered();
    $('global-error').hidden = true;
    show('menu');
  }
  $('main-menu').addEventListener('click', mainMenu);
  $('victory-menu').addEventListener('click', mainMenu);
  $('resume-game').addEventListener('click', () => { const saved = client.remembered(); if (saved) void client.resume(saved); });
  $('play-bot').addEventListener('click', () => beginSetup('bot'));
  $('play-friend').addEventListener('click', () => beginSetup('friend'));
  $('play-groups').addEventListener('click', () => { show('entry'); tabs('host'); });
  $('join-existing').addEventListener('click', () => { show('entry'); tabs('join'); });
  $('how-to').addEventListener('click', () => show('help'));
  $('help-back').addEventListener('click', mainMenu);
  $('arena-back').addEventListener('click', () => show(setupMode === 'groups' ? 'entry' : 'menu'));
  $('arena-next').addEventListener('click', () => { drawCharacters(); show('character'); });
  $('character-back').addEventListener('click', () => show('arena'));
  for (const team of ['A', 'B']) $('pick-' + team.toLowerCase()).addEventListener('click', () => { selectedTeam = team; drawCharacters(); });
  function beginSetup(mode) {
    client.stop(); client.state = null;
    pendingSetupRoom = null;
    setupMode = mode; selectedTeam = 'A';
    $('global-error').hidden = true;
    drawArenas(); show('arena');
  }
  function drawArenas() {
    $('arena-options').replaceChildren();
    for (const [id, name] of Object.entries(arenaNames)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'arena-option'; button.dataset.arena = id;
      button.setAttribute('aria-pressed', String(selectedArena === id));
      const image = document.createElement(id === 'mensa-b' ? 'span' : 'img');
      if (id === 'mensa-b') { image.className = 'arena-unmodeled'; image.textContent = '3D arena not modeled'; }
      else { image.src = './assets/arena-' + id + '.webp?v=96f7431-previews1'; image.alt = name + ' — actual 3D battle arena'; }
      const title = document.createElement('strong'); title.textContent = name;
      const description = document.createElement('small'); description.textContent = arenaDescriptions[id];
      button.append(image, title, description);
      button.addEventListener('click', () => { selectedArena = id; drawArenas(); $('arena-options').querySelector('[data-arena="' + id + '"]').focus(); });
      $('arena-options').append(button);
    }
    setText('arena-choice', arenaNames[selectedArena] + ' selected');
  }
  function statBars(id) {
    const box = document.createElement('div'); box.className = 'stat-bars';
    for (const [key, meta] of Object.entries(STAT_META)) {
      const value = fighterStats(id)[key];
      const row = document.createElement('div'); row.className = 'stat-row'; row.dataset.stat = key;
      const label = document.createElement('span'); label.textContent = meta.label;
      const track = document.createElement('span'); track.className = 'stat-track'; track.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 10; i++) { const segment = document.createElement('i'); if (i < Math.round(value / meta.max * 10)) segment.className = 'filled'; track.append(segment); }
      const number = document.createElement('b'); number.textContent = value + (key === 'defend' ? '%' : '');
      row.setAttribute('aria-label', meta.label + ': ' + value + ' ' + meta.unit); row.append(label, track, number); box.append(row);
    }
    return box;
  }
  function drawCharacters() {
    const solo = setupMode === 'bot', friend = setupMode === 'friend';
    setText('pick-a', (solo || friend ? 'You · P1' : 'Team A') + ': ' + CHARACTER_THEMES[selectedCharacters.A].name);
    setText('pick-b', (solo ? 'Bot' : friend ? 'Friend · P2' : 'Team B') + ': ' + CHARACTER_THEMES[selectedCharacters.B].name);
    $('pick-a').setAttribute('aria-pressed', String(selectedTeam === 'A'));
    $('pick-b').setAttribute('aria-pressed', String(selectedTeam === 'B'));
    setText('selection-mode', solo ? 'Choose your fighter and the bot’s challenger.' : friend ? 'You are Player 1. Choose both fighters, invite one friend, then duel online.' : 'Choose both teams’ fighters. Your group votes on every move.');
    setText('selection-next', solo ? 'Start bot battle' : friend ? 'Invite your friend' : 'Open group room');
    setText('fighter-choice', 'Choosing for ' + (solo || friend ? selectedTeam === 'A' ? 'you' : solo ? 'the bot' : 'your friend' : 'Team ' + selectedTeam) + ' · ' + arenaNames[selectedArena]);
    const selectedId = selectedCharacters[selectedTeam];
    const preview = $('selected-fighter-art');
    const artUrl = modelFor(selectedId).portrait;
    if (preview.getAttribute('src') !== artUrl && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) preview.animate?.([{ filter: 'brightness(1.7)' }, { filter: 'brightness(1)' }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' });
    setFighterArt(preview, selectedId, CHARACTER_THEMES[selectedId].name + ' — articulated 3D fighter', true);
    characters.sync();
    setText('selected-fighter-name', CHARACTER_THEMES[selectedId].name);
    setText('selected-fighter-archetype', FIGHTER_PROFILES[selectedId].archetype);
    $('selected-fighter-stats').replaceChildren(statBars(selectedId));
    $('character-options').replaceChildren();
    for (const [id, theme] of Object.entries(CHARACTER_THEMES)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'character-option'; button.dataset.character = id;
      button.setAttribute('aria-pressed', String(selectedCharacters[selectedTeam] === id));
      const image = document.createElement('img'); setFighterArt(image, id, '', false);
      const title = document.createElement('strong'); title.textContent = theme.name;
      const label = document.createElement('small'); label.textContent = Object.entries(selectedCharacters).filter(([, value]) => value === id).map(([team]) => solo ? team === 'A' ? 'YOU' : 'BOT' : 'TEAM ' + team).join(' + ') || theme.labels.special;
      button.append(image, title, label, statBars(id));
      button.addEventListener('click', () => { selectedCharacters[selectedTeam] = id; drawCharacters(); $('character-options').querySelector('[data-character="' + id + '"]').focus(); });
      $('character-options').append(button);
    }
  }
  let pendingSetupRoom = null;
  $('selection-next').addEventListener('click', async () => {
    setupBusy = true; $('selection-next').disabled = true;
    setText('selection-next', 'Preparing battle…');
    try {
      if (!pendingSetupRoom || client.room !== pendingSetupRoom) {
        const room = await client.create({ mode: setupMode });
        pendingSetupRoom = room.roomId;
      }
      await client.mutate('configure', { arenaId: selectedArena, characterA: selectedCharacters.A, characterB: selectedCharacters.B });
      if (setupMode === 'bot') {
        battleStartCue(client.state); // Baseline the confirmed lobby hidden during setup.
        await client.mutate('start');
      }
      pendingSetupRoom = null; setupBusy = false;
      render(present(client.state, window.ArenaUI.connected, client.secondsLeft())); renderIdentity(client.state);
      // Baseline setup history even when its SSE snapshots arrived while setupBusy was true.
      battleStartCue(client.state); actionCue(client.state); visualCue(client.state);
      $('global-error').hidden = true;
    } catch (error) { reportError(error.message); }
    finally { setupBusy = false; $('selection-next').disabled = false; setText('selection-next', setupMode === 'bot' ? 'Start bot battle' : setupMode === 'friend' ? 'Invite your friend' : 'Open group room'); }
  });
  let soloPending = false;
  document.querySelectorAll('[data-solo-move]').forEach(button => button.addEventListener('click', async () => {
    if (soloPending || !client.state?.turn) return;
    soloPending = true; updateSolo(client.state);
    try { await client.mutate('play', { turnId: client.state.turn.id, move: button.dataset.soloMove }); }
    catch (error) { reportError(error.message); }
    finally { soloPending = false; if (client.state) updateSolo(client.state); }
  }));
  function updateSolo(state) {
    const solo = ['bot', 'friend'].includes(state.mode); $('solo-controls').hidden = !solo;
    const choosing = state.phase === 'running' && state.turn?.team === 'A' && client.secondsLeft() > 0;
    setText('solo-status', state.phase === 'countdown' ? 'Get ready — moves open after the intro.' : !window.ArenaUI.connected ? 'Reconnecting. Moves paused.' : choosing ? 'Your turn. Choose a move.' : state.mode === 'friend' ? 'Your friend is choosing…' : 'Campus Bot is choosing…');
    document.querySelectorAll('[data-solo-move]').forEach(button => {
      button.disabled = !solo || !choosing || !window.ArenaUI.connected || soloPending || !state.turn?.availableMoves.includes(button.dataset.soloMove);
      const move = button.dataset.soloMove;
      button.querySelector('small').textContent = move === 'special' && state.teams.A.specialCooldownRemaining ? 'Recharging: ' + state.teams.A.specialCooldownRemaining + ' own turns' : moveDescription(state.teams.A.stats || fighterStats(state.teams.A.characterId), move);
    });
  }
  function renderIdentity(state) {
    document.body.dataset.mode = state.mode || 'online';
    document.body.dataset.arena = Object.hasOwn(arenaNames, state.arenaId) ? state.arenaId : 'library';
    const identities = {};
    for (const [team, key] of [['A', 'ace'], ['B', 'dynamo']]) {
      const theme = characterTheme(state.teams[team].characterId);
      const name = theme?.name || (team === 'A' ? 'Assessment Ace' : 'Deadline Dynamo');
      const id = theme ? state.teams[team].characterId : team === 'A' ? 'assessment-hoodie' : 'tryhard';
      identities[team] = { name, id };
      for (const image of document.querySelectorAll('.' + key + '-fighter .fighter-art, .' + key + '-roster > img')) {
        setFighterArt(image, id, name, image.classList.contains('fighter-art'), team);
        image.dataset.modelPose = state.teams[team].hp === 0 ? 'defeat' : 'idle';
      }
      document.querySelector('.' + key + '-fighter .health span').textContent = name;
      document.querySelector('.' + key + '-roster h2').textContent = name;
      document.querySelector('.' + key + '-roster .team-tag').textContent = 'TEAM ' + team;
      $(key + '-hp').setAttribute('aria-label', name + ' health');
    }
    setText('battle-title', arenaNames[state.arenaId] || 'Campus battle');
    $('battle-title').classList.remove('sr-only');
    const friend = state.mode === 'friend';
    setText('lobby-title', friend ? 'One friend. One showdown.' : 'Rally your groups.');
    setText('lobby-intro', friend ? 'You play as Player 1. Send the link or QR to one friend for Player 2. Only you can start or reset.' : 'Show the QR on the projector. Players join balanced teams and vote on their phones.');
    setText('host-role-label', friend ? 'Player 1 · match host' : state.mode === 'bot' ? 'Solo match controls' : 'Presenter controls');
    setText('player-timer-label', friend ? 'TIME LEFT TO MOVE' : 'TIME LEFT TO VOTE');
    setText('player-rules-note', friend ? 'Your move resolves immediately. If time runs out, the server chooses an available move. Only the host can reset or replay.' : 'You can change your vote before cutoff. No votes and tied votes are decided randomly.');
    if (friend && state.phase === 'lobby') setText('lobby-status', state.teams.B.playerCount ? 'Your friend is ready. Start the duel.' : 'Waiting for one friend to join as Player 2.');
    if (state.you.role === 'player') {
      const stats = state.teams[state.you.team].stats || fighterStats(state.teams[state.you.team].characterId);
      document.querySelectorAll('button[data-move]').forEach(button => { const move = button.dataset.move; button.querySelector('small').textContent = move === 'special' && state.teams[state.you.team].specialCooldownRemaining ? 'Recharging: ' + state.teams[state.you.team].specialCooldownRemaining + ' own turns' : moveDescription(stats, move); });
      if (friend) { setText('player-title', state.phase === 'lobby' ? 'Your duel is ready.' : 'Make your move.'); setText('player-state', !window.ArenaUI.connected ? 'Reconnecting. Moves paused.' : state.phase === 'lobby' ? 'Player 2 connected. Waiting for Player 1 to start.' : state.turn?.team === state.you.team ? 'Your turn. Pick one move.' : 'Player 1 is choosing…'); setText('vote-feedback', state.phase === 'running' ? 'Each choice resolves immediately. 15 seconds per turn.' : 'Stay here — the match starts automatically on your screen.'); }
      setText('player-team', 'TEAM ' + state.you.team + ' · ' + identities[state.you.team].name);
      for (const team of ['A', 'B']) {
        let box = $('player-preview').querySelector('[data-preview-team="' + team + '"]');
        if (!box) { box = document.createElement('div'); box.dataset.previewTeam = team; box.append(document.createElement('img'), document.createElement('span'), document.createElement('progress')); $('player-preview').append(box); }
        const image = box.querySelector('img'), label = box.querySelector('span'), hp = box.querySelector('progress');
        setFighterArt(image, identities[team].id, identities[team].name, state.phase !== 'lobby', team);
        image.dataset.modelPose = state.teams[team].hp === 0 ? 'defeat' : 'idle';
        label.textContent = identities[team].name + ' · ' + state.teams[team].hp + ' HP';
        hp.max = 100; hp.value = state.teams[team].hp; hp.setAttribute('aria-label', identities[team].name + ' health');
      }
    }
    if (state.phase === 'finished') { setFighterArt($('winner-art'), identities[state.winner].id, identities[state.winner].name, true); setText('victory-title', identities[state.winner].name + ' wins!'); }
    renderPrebattle(state);
    battleWorld.sync(state);
    characters.sync();
    updateSolo(state);
  }
  function renderPrebattle(state) {
    const label = ['battle', 'player'].includes(document.body.dataset.screen) ? prebattleLabel(state, Date.now() + client.offset) : '';
    $('prebattle').hidden = !label;
    setText('prebattle-label', label);
    if (label) {
      setText('countdown', label); setText('player-countdown', label);
      setText('player-state', 'Get ready — voting opens after the intro.');
    }
  }
  document.addEventListener('arena:intent', event => { void handleIntent(event.detail); });
  const incomingRoom = roomCode(new URLSearchParams(location.search).get('room'));
  if (validRoom(incomingRoom)) {
    show('entry'); tabs('join');
    $('join-code').value = incomingRoom;
    $('nickname').focus();
  }
  const saved = client.remembered(validRoom(incomingRoom) ? incomingRoom : null);
  $('resume-game').hidden = !saved;
  if (saved) void client.resume(saved);
  setInterval(() => {
    syncMusic();
    if (!client.state) return;
    renderPrebattle(client.state);
    if (client.state.phase !== 'running') return;
    const seconds = client.secondsLeft();
    updateSolo(client.state);
    setText('countdown', seconds); setText('player-countdown', seconds);
    $('countdown').setAttribute('aria-label', seconds + ' seconds left');
    const active = client.state.turn?.team === client.state.you.team;
    const canVote = window.ArenaUI.connected && active && seconds > 0;
    if (active && !seconds && window.ArenaUI.connected) setText('player-state', 'Time is up. Waiting for the server.');
    moves.forEach(move => document.querySelector('button[data-move="' + move + '"]').disabled = !canVote || !client.state.turn?.availableMoves.includes(move));
  }, 250);
})();
