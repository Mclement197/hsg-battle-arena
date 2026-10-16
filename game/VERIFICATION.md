# Arcade modes verification — 2026-10-16

## Scope and result
Live origin: https://afp.mclement.ch/game/ . Work started on main at e5a3ce68a0e8cfbe1267b10d3868b57e327356d0; origin/main matched. Pre-existing unrelated README/dashboard/documentation/evidence edits were not staged or overwritten.

Backup before edits: /home/mathis/hsg-game-backups/arcade-modes-20261016-152100 (game tree, pre-existing patch and status).

Implemented separate Friend, Bot and Groups entry points, actual two-human Friend roles/capacity/direct turns, six distinct four-command combat profiles, complete forest/emerald arcade treatment for all five primary screens, and the subsequently requested user-supplied HSG building photo on the main menu. Original fighter and arena art is still explicitly replaceable placeholder art. No new dependency, gateway edit, proxy edit or service configuration change.

## Automated checks actually run
- Standard npm test: **58 passed, 0 failed, 3 explicitly skipped native-browser opt-ins** (61 total).
- With PLAYWRIGHT_MODULE pointing at the installed playwright-core and CHROMIUM_EXECUTABLE at installed Chromium: **60 passed, 0 failed, 1 skipped** (61 total, 7966.64 ms). The remaining skipped test is optional AUDIO_LIVE_URL read-only sound activation; desktop, phone and tablet native audio graph tests did run.
- Profile tests cover all six distinct profiles and distinct values on each axis, Luca strongest overall, shared display/engine data, every attacker/defender combination for all four commands, HP rounding/caps, single-use guard and cooldown, and repeated attack versus every healing/guarding opponent to completion.
- New mode unit/HTTP tests cover exactly two Friend seats, host only A, guest only B, wrong-team/extra-field rejection, host-only configure/start/reset, reconnect and reset seat preservation, three distinct mode creation contracts, private state auth, authenticated SSE and public QR.
- Extended real-browser five-screen smoke passed locally and on public HTTPS. Final public run used the photo-inclusive build, isolated contexts, real HTTP/SSE and normal wall-clock timers. It completed desktop and phone Bot matches and replay; Friend host + guest through victory/replay/reset with both reloads and a rejected third seat; Groups presenter + two voters with vote replacement, actual 15-second resolution, reconnect and shared reset.
- The public browser asserts all 24 roster stat numbers match the engine-imported profiles, no horizontal overflow on each capture, all three menu buttons inside desktop/phone viewports, photo background present and foreground opacity exactly 1. Final public result: **0 page errors, 0 failed page responses**.
- Public supplied-photo bytes matched the local shipping asset: SHA-256 34d3520045095bab3de65bd4275eea2f955924ddcc24dfd81b0f5619c1da094f. Asset is 1600×1214 WebP, 178314 bytes, with source metadata/provenance sidecar; original source hash in art/hsg-learning-center-source.md.
- git diff --check passed. The design detector ran once; text size/hover findings were corrected in the bounded fix batch. Requested luminous selection lighting is deliberate, not removed. Functional team/game-state labels and inherited move glyphs were not promoted into design-system doctrine.

## Captures and bounded inspection
Final public captures: game/evidence/arcade-public-photo/ (19 PNGs), also copied to /home/mathis/.openclaw/workspace/media/hsg-arcade-final/ for review/attachment. Primary sets:
- Desktop: desktop-menu.png, bot-arena.png, bot-characters.png, desktop-bot-battle.png, desktop-game-over.png.
- Phone: mobile-menu.png, mobile-arena.png, mobile-characters.png, mobile-bot-battle.png, mobile-game-over.png.
- Multiplayer: desktop-friend-battle.png, mobile-friend-battle.png, desktop-online-lobby.png, desktop-online-battle.png, mobile-online-battle.png.
Every final capture was opened and checked for correct content, loaded art and clipping. Initial desktop/phone inspection had one batched typography/portrait/contrast fix; the photo amendment received its required subsequent public capture. No open-ended styling loop.

Design review/documentation was performed inline because the assigned Builder role prohibits descendant delegation. This is not an independent design sign-off; coordinator review remains appropriate. Product context, surface contract, token-bearing DESIGN.md and .impeccable/design.json are included.

## Runtime / rollback
Only afp-game.service was restarted after the tests passed. It is active with ExecMainStatus=0; static files are read from this checkout and were subsequently verified publicly. Restart invalidates in-memory rooms; sessions are intentionally not persisted across restarts. No other service was restarted.

Safe rollback: revert the scoped arcade commit on main (never reset unrelated edits), then restart only afp-game.service. Alternatively restore only the corresponding game paths from the pre-edit backup after inspecting current changes. Keep unrelated dirty files intact.

## Known limits
- Friend host chooses both fighters and controls start/reset/replay; guest controls only B moves. A disconnected seat stays reserved; lost capability requires a new room.
- Luca is deliberately advantaged, not competitively balanced. Other archetypes are distinct; rounded bar segments are comparisons, exact adjacent numbers are real game units.
- Both sides intentionally choosing only non-damaging moves can extend a match; stats do not make healing or guarding invulnerable against attacks, and no sudden death was added.
- Tested Chromium desktop/touch contexts, not physical projector/speaker output or actual iOS Safari. Original art is placeholder, not final portraits.
