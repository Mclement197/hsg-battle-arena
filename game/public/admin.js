import { FIGHTER_DISPLAY_NAMES } from './fighter-data.js';

const $ = id => document.getElementById(id);
const REQUEST_TIMEOUT_MS = 10000;
let timer = null, controller = null, generation = 0, failures = 0;
let snapshot = null, nextAllowedAt = 0;

function status(label, state) {
  $('connection').textContent = label;
  $('connection').dataset.state = state;
}
function schedule(delay) {
  clearTimeout(timer);
  if (!document.hidden) timer = setTimeout(poll, Math.max(0, delay));
}
function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
}
function fighter(team, data) {
  const block = element('div', 'fighter');
  const id = data?.characterId;
  const name = Object.hasOwn(FIGHTER_DISPLAY_NAMES, id ?? '') ? FIGHTER_DISPLAY_NAMES[id] : 'Fighter not selected';
  const max = Number.isFinite(data?.maxHp) && data.maxHp > 0 ? data.maxHp : 100;
  const hp = Number.isFinite(data?.hp) ? Math.min(max, Math.max(0, data.hp)) : max;
  const head = element('div', 'fighter-heading');
  head.append(element('span', 'team-label', 'TEAM ' + team), element('strong', 'fighter-name', name));
  const health = element('div', 'health');
  health.append(element('span', '', 'HP'), element('strong', '', hp + ' / ' + max));
  const progress = element('progress');
  progress.max = max; progress.value = hp;
  progress.setAttribute('aria-label', name + ' health');
  block.append(head, health, progress);
  return block;
}
function renderRooms(rooms) {
  const list = document.createDocumentFragment();
  for (const room of rooms) {
    const card = element('article', 'room');
    const meta = element('div', 'room-meta');
    const roomLabel = element('strong', 'room-number', Number.isInteger(room.roomNumber) && room.roomNumber > 0 ? 'Room ' + room.roomNumber : 'Room');
    const mode = { bot: 'BOT', friend: 'FRIEND', groups: 'GROUPS', online: 'GROUPS' }[room.mode] ?? 'UNKNOWN';
    const phase = { lobby: 'Lobby', countdown: 'Countdown', running: 'Running', finished: 'Finished' }[room.phase] ?? 'Unknown';
    meta.append(roomLabel, element('span', 'pill', mode), element('span', 'phase', phase + (room.turnNumber == null ? '' : ' · Turn ' + room.turnNumber)));
    const match = element('div', 'match');
    match.append(fighter('A', room.fighters?.A), element('span', 'vs', 'VS'), fighter('B', room.fighters?.B));
    card.append(meta, match, element('p', 'player-count', String(room.playerCount ?? 0) + ' human ' + (room.playerCount === 1 ? 'player' : 'players')));
    list.append(card);
  }
  $('rooms').replaceChildren(list);
  $('room-message').hidden = rooms.length > 0;
  $('room-message').textContent = rooms.length ? '' : 'No battles right now';
}
function render(data) {
  snapshot = data;
  const summary = data.summary;
  $('active-rooms').textContent = summary.activeRooms;
  $('running-battles').textContent = summary.runningBattles;
  $('players-online').textContent = summary.playersOnline;
  $('rooms-used').textContent = summary.roomsUsed + ' / ' + summary.roomCapacity;
  $('updated').textContent = 'Updated ' + new Date(data.serverNow).toLocaleTimeString();
  renderRooms(data.rooms);
}
async function poll() {
  if (document.hidden || controller) return;
  if (Date.now() < nextAllowedAt) { schedule(nextAllowedAt - Date.now()); return; }
  const run = generation;
  const request = new AbortController(); controller = request;
  let timedOut = false, onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new Error('Request aborted'));
    request.signal.addEventListener('abort', onAbort, { once: true });
  });
  // One deadline covers headers and JSON; the race also ignores uncooperative late results.
  const deadline = setTimeout(() => { timedOut = true; request.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    const response = await Promise.race([fetch('/game/api/admin/overview', {
      cache: 'no-store', signal: request.signal
    }), aborted]);
    if (run !== generation || request.signal.aborted) return;
    if (response.status === 429) {
      failures++;
      const retry = Number(response.headers.get('Retry-After'));
      const wait = Math.max(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 0, Math.min(60000, 2000 * 2 ** Math.min(failures - 1, 5)));
      nextAllowedAt = Date.now() + wait;
      status('Throttled · retrying', 'throttled');
      $('updated').textContent = snapshot ? 'Last update is stale' : 'Awaiting first update';
      return;
    }
    if (!response.ok) throw Error('Request failed');
    const data = await Promise.race([response.json(), aborted]);
    if (run !== generation || request.signal.aborted) return;
    render(data);
    failures = 0; nextAllowedAt = 0;
    status('Live · connected', 'connected');
  } catch (error) {
    if (run !== generation || request.signal.aborted && !timedOut) return;
    failures++;
    nextAllowedAt = Date.now() + Math.min(60000, 2000 * 2 ** Math.min(failures - 1, 5));
    status(snapshot ? 'Reconnecting · data stale' : 'Reconnecting…', 'reconnecting');
    $('updated').textContent = snapshot ? 'Last update is stale' : 'Awaiting first update';
  } finally {
    clearTimeout(deadline);
    request.signal.removeEventListener('abort', onAbort);
    request.abort();
    if (controller === request) controller = null;
    if (run === generation) schedule(nextAllowedAt ? Math.max(0, nextAllowedAt - Date.now()) : 2000);
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    generation++;
    clearTimeout(timer); timer = null;
    controller?.abort(); controller = null;
    status('Paused · tab hidden', 'paused');
  } else {
    status('Connecting…', 'connecting');
    schedule(Math.max(0, nextAllowedAt - Date.now()));
  }
});
schedule(0);
