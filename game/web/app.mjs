import { ARENAS, FIGHTERS, MOVES, MAX_HP, newMatch, performMove } from './rules.mjs';
const root = document.querySelector('#app');
const state = { screen: 'menu', arena: ARENAS[0].id, player: FIGHTERS[0].id, match: null, busy: false, effect: '', matchId: 0 };
const arena = () => ARENAS.find(item => item.id === state.arena);
const fighter = id => FIGHTERS.find(item => item.id === id);
const opponent = () => FIGHTERS.find(item => item.id !== state.player);
const figure = (character, side = '') => `<div class="fighter-portrait ${side}" style="--fighter:${character.color}" aria-hidden="true"><div class="portrait-ring"></div><div class="portrait-shape"><span>${character.initials}</span></div><div class="portrait-shadow"></div></div>`;
const button = (label, action, extra = '') => `<button type="button" class="action ${extra}" data-action="${action}">${label}<span aria-hidden="true">↗</span></button>`;
const back = destination => `<button type="button" class="back" data-action="${destination}"><span aria-hidden="true">←</span> Back</button>`;
const steps = active => `<nav class="steps" aria-label="Setup progress"><span class="${active === 1 ? 'current' : ''}">01 <b>Location</b></span><span class="${active === 2 ? 'current' : ''}">02 <b>Fighter</b></span><span>03 <b>Battle</b></span></nav>`;
function render() {
  document.body.dataset.screen = state.screen;
  if (state.screen === 'menu') root.innerHTML = `<section class="menu-layout"><div class="menu-copy"><p class="stamp">A CAMPUS SHOWDOWN</p><h1>Class is<br><em>in session.</em></h1><p class="intro">Pick your fighter. Choose your turf. Settle it after the lecture.</p><div class="menu-actions">${button('Play vs Bot', 'arenas', 'primary')}${button('Play vs Friend · ONLINE', 'online', 'secondary')}</div><button class="text-link" type="button" data-action="how">How to play <span aria-hidden="true">↗</span></button></div><div class="menu-art" aria-hidden="true"><div class="art-disc"></div><div class="art-fighter left">${figure(FIGHTERS[0])}</div><div class="art-versus">VS</div><div class="art-fighter right">${figure(FIGHTERS[4], 'flipped')}</div><span class="art-caption">NO GRADES. JUST GLORY.</span></div></section>`;
  if (state.screen === 'online') root.innerHTML = `<section class="message-screen">${back('menu')}<div class="message-content"><span class="symbol" aria-hidden="true">↗</span><h1>Online play<br>is not connected yet.</h1><p>This repository has no multiplayer server or friend-room protocol to join. The local bot match is playable now; friend matches need a server integration.</p>${button('Play vs Bot instead', 'arenas', 'primary')}</div></section>`;
  if (state.screen === 'how') root.innerHTML = `<section class="message-screen">${back('menu')}<div class="message-content"><h1>Make your move.</h1><p>Choose an arena and a fighter. You go first, then the bot answers. Bring your opponent to 0 HP to win.</p><ul class="rules-list"><li><strong>Attack</strong><span>Deal 20 damage.</span></li><li><strong>All-nighter</strong><span>Deal 32 damage, but lose 8 HP yourself.</span></li><li><strong>Study break</strong><span>Halve the next hit you take.</span></li><li><strong>Coffee run</strong><span>Restore up to 18 HP.</span></li></ul>${button('Choose an arena', 'arenas', 'primary')}</div></section>`;
  if (state.screen === 'arenas') root.innerHTML = `<section class="selection">${back('menu')}${steps(1)}<div class="selection-heading"><h1>Where are we<br><em>settling this?</em></h1><p>Every great rivalry needs a stage.</p></div><div class="arena-grid">${ARENAS.map((item, index) => `<button type="button" class="arena-card arena-${item.id} ${state.arena === item.id ? 'selected' : ''}" data-arena="${item.id}" aria-pressed="${state.arena === item.id}"><span class="arena-number">0${index + 1} / ${item.motif}</span><span class="arena-illustration" aria-hidden="true"><i></i><i></i><i></i></span><span class="arena-info"><strong>${item.name}</strong><small>${item.detail}</small></span><span class="selection-indicator" aria-hidden="true">${state.arena === item.id ? '✓' : '↗'}</span></button>`).join('')}</div><div class="selection-bottom"><span>SELECTED / ${arena().name.toUpperCase()}</span>${button('Choose fighter', 'characters', 'primary')}</div></section>`;
  if (state.screen === 'characters') root.innerHTML = `<section class="selection">${back('arenas')}${steps(2)}<div class="selection-heading"><h1>Who’s stepping<br><em>into the ring?</em></h1><p>Choose your campus champion. Your rival is selected automatically.</p></div><div class="roster">${FIGHTERS.map((item, index) => `<button type="button" class="fighter-card ${state.player === item.id ? 'selected' : ''}" data-fighter="${item.id}" aria-pressed="${state.player === item.id}"><span class="fighter-index">0${index + 1}</span>${figure(item)}<span class="fighter-details"><strong>${item.name}</strong><small>${item.tag}</small></span><span class="selection-indicator" aria-hidden="true">${state.player === item.id ? '✓' : '↗'}</span></button>`).join('')}</div><div class="selection-bottom"><span>YOUR FIGHTER / ${fighter(state.player).name.toUpperCase()}</span>${button('Enter arena', 'start', 'primary')}</div></section>`;
  if (state.screen === 'battle') {
    const match = state.match, player = fighter(match.player), rival = fighter(match.opponent);
    root.innerHTML = `<section class="battle-screen">${back('characters')}<div class="battle-heading"><div><span class="venue">${arena().name.toUpperCase()} / LOCAL MATCH</span><h1>Battle arena<span class="period">.</span></h1></div><span class="round-label">${state.busy ? 'RIVAL’S TURN' : 'YOUR TURN'}</span></div><div class="battle-stage arena-${arena().id} ${state.effect}" aria-label="Battle at ${arena().name}"><div class="combatant"><div class="health-header"><strong>${player.name}</strong><span>${match.hp[0]} / ${MAX_HP} HP</span></div><div class="health-track" role="progressbar" aria-label="${player.name} health" aria-valuenow="${match.hp[0]}" aria-valuemin="0" aria-valuemax="100"><span style="width:${match.hp[0]}%"></span></div>${figure(player)}</div><div class="battle-vs" aria-hidden="true">VS</div><div class="combatant rival"><div class="health-header"><strong>${rival.name}</strong><span>${match.hp[1]} / ${MAX_HP} HP</span></div><div class="health-track" role="progressbar" aria-label="${rival.name} health" aria-valuenow="${match.hp[1]}" aria-valuemin="0" aria-valuemax="100"><span style="width:${match.hp[1]}%"></span></div>${figure(rival, 'flipped')}</div><div class="stage-floor"></div></div><div class="battle-controls"><div class="battle-log" role="status" aria-live="polite"><span>FIELD NOTES</span><strong>${match.log || `${player.name} faces ${rival.name}. Make the first move!`}</strong></div><div class="moves" role="group" aria-label="Available moves">${MOVES.map((move, index) => `<button type="button" class="move" data-move="${move.id}" ${state.busy ? 'disabled' : ''}><span class="move-key">${index + 1}</span><strong>${move.name}</strong><small>${move.detail}</small></button>`).join('')}</div></div><p class="keyboard-hint">TIP: PRESS 1–4 TO PICK A MOVE</p></section>`;
  }
  if (state.screen === 'gameover') {
    const won = state.match.winner === 0, victor = fighter(won ? state.match.player : state.match.opponent);
    root.innerHTML = `<section class="end-screen"><span class="end-spark" aria-hidden="true">✳</span><p class="venue">${arena().name.toUpperCase()} / MATCH COMPLETE</p><h1>${won ? 'Victory is yours.' : 'The rival wins.'}</h1><div class="winner-display">${figure(victor)}<div><span>WINNER</span><strong>${victor.name}</strong><p>${won ? 'That’s one for the campus legend.' : 'There’s always a rematch.'}</p></div></div><div class="end-actions">${button('Play Again', 'start', 'primary')}${button('Main Menu', 'menu', 'secondary')}</div></section>`;
  }
  root.focus({ preventScroll: true });
}
function navigate(screen) { state.screen = screen; state.busy = false; state.effect = ''; render(); window.scrollTo(0, 0); }
function start() { state.matchId++; state.match = newMatch(state.player, opponent().id); navigate('battle'); }
function move(id) {
  if (state.screen !== 'battle' || state.busy) return;
  state.match = performMove(state.match, id);
  state.effect = id === 'heal' || id === 'guard' ? 'effect-support-player' : 'effect-hit-rival';
  if (state.match.winner !== null) { navigate('gameover'); return; }
  state.busy = true; render();
  const matchId = state.matchId;
  window.setTimeout(() => {
    if (state.screen !== 'battle' || state.matchId !== matchId) return;
    const options = state.match.hp[1] < 38 ? ['attack', 'heal', 'guard'] : ['attack', 'attack', 'heavy', 'guard'];
    state.match = performMove(state.match, options[Math.floor(Math.random() * options.length)]);
    state.effect = state.match.lastMove === 'guard' || state.match.lastMove === 'heal' ? 'effect-support-rival' : 'effect-hit-player';
    state.busy = false;
    if (state.match.winner !== null) navigate('gameover'); else render();
  }, 950);
}
root.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.arena) { state.arena = target.dataset.arena; render(); root.querySelector('[data-arena].selected').focus(); return; }
  if (target.dataset.fighter) { state.player = target.dataset.fighter; render(); root.querySelector('[data-fighter].selected').focus(); return; }
  if (target.dataset.move) { move(target.dataset.move); return; }
  if (target.dataset.action === 'start') start();
  else if (target.dataset.action) navigate(target.dataset.action);
});
document.querySelector('.brand').addEventListener('click', () => navigate('menu'));
document.addEventListener('keydown', event => {
  if (state.screen !== 'battle' || event.altKey || event.ctrlKey || event.metaKey || event.target.matches('button, input, textarea, select')) return;
  const index = Number(event.key) - 1;
  if (index >= 0 && index < MOVES.length) move(MOVES[index].id);
});
render();
