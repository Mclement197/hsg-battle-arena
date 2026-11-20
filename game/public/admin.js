import { FIGHTER_DISPLAY_NAMES } from './fighter-data.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'hsg-admin-key';
const REQUEST_TIMEOUT_MS = 10000;
let key = sessionStorage.getItem(STORAGE_KEY);
let timer = null, controller = null, generation = 0, failures = 0;
let snapshot = null, revealCodes = false, nextAllowedAt = 0;

function status(label, state) {
  $('connection').textContent = label;
  $('connection').dataset.state = state;
}
function schedule(delay) {
  clearTimeout(timer);
  if (key && !document.hidden) timer = setTimeout(poll, Math.max(0, delay));
}
function clearView() {
  snapshot = null;
  revealCodes = false;
  $('show-codes').setAttribute('aria-pressed', 'false');
  $('show-codes').textContent = 'Show room codes';
  for (const id of ['active-rooms', 'running-battles', 'players-online']) $(id).textContent = '—';
  $('rooms-used').textContent = '— / 50';
  $('updated').textContent = 'Awaiting first update';
  $('rooms').replaceChildren();
  $('room-message').textContent = 'Connecting to arena…';
  $('room-message').hidden = false;
}
function stop() {
  generation++;
  clearTimeout(timer); timer = null;
  controller?.abort(); controller = null;
  failures = 0; nextAllowedAt = 0;
}
function loginScreen(message = '') {
  stop();
  key = null;
  sessionStorage.removeItem(STORAGE_KEY);
  $('admin-key').value = '';
  clearView();
  $('overview').hidden = true;
  $('login').hidden = false;
  $('login-message').hidden = !message;
  $('login-message').textContent = message;
  if (message) $('admin-key').focus();
}
function showOverview() {
  $('login').hidden = true;
  $('login-message').hidden = true;
  $('overview').hidden = false;
  status('Connecting…', 'connecting');
  schedule(0);
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
    const code = element('strong', 'room-code', revealCodes ? room.roomCode : String(room.roomCode ?? '').slice(0, 2) + '••');
    const codeGroup = element('div', 'code-group');
    codeGroup.append(element('span', 'eyebrow', 'ROOM'), code);
    const mode = { bot: 'BOT', friend: 'FRIEND', groups: 'GROUPS', online: 'GROUPS' }[room.mode] ?? 'UNKNOWN';
    const phase = { lobby: 'Lobby', countdown: 'Countdown', running: 'Running', finished: 'Finished' }[room.phase] ?? 'Unknown';
    meta.append(codeGroup, element('span', 'pill', mode), element('span', 'phase', phase + (room.turnNumber == null ? '' : ' · Turn ' + room.turnNumber)));
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
  if (!key || document.hidden || controller) return;
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
      headers: { Authorization: 'Bearer ' + key },
      credentials: 'same-origin', cache: 'no-store', signal: request.signal
    }), aborted]);
    if (run !== generation || request.signal.aborted) return;
    if (response.status === 401) { loginScreen('Admin key was not accepted. Try again.'); return; }
    if (response.status === 404) { loginScreen('Admin overview is unavailable on this server.'); return; }
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
$('login-form').addEventListener('submit', event => {
  event.preventDefault();
  const supplied = $('admin-key').value;
  $('admin-key').value = '';
  if (!supplied) return;
  stop(); clearView();
  key = supplied; sessionStorage.setItem(STORAGE_KEY, supplied);
  showOverview();
});
$('logout').addEventListener('click', () => { loginScreen(); $('admin-key').focus(); });
$('show-codes').addEventListener('click', () => {
  revealCodes = !revealCodes;
  $('show-codes').setAttribute('aria-pressed', String(revealCodes));
  $('show-codes').textContent = revealCodes ? 'Hide room codes' : 'Show room codes';
  if (snapshot) renderRooms(snapshot.rooms);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    generation++;
    clearTimeout(timer); timer = null;
    controller?.abort(); controller = null;
    if (key) status('Paused · tab hidden', 'paused');
  } else if (key) {
    status('Connecting…', 'connecting');
    schedule(Math.max(0, nextAllowedAt - Date.now()));
  }
});
if (key) showOverview();
