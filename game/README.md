# Game backend — first implementation

Authoritative Node HTTP + SSE backend with separately implemented browser UI in `public/`. A dedicated local origin is now deployed as the user service `afp-game.service` on `127.0.0.1:18892`, with the canonical public origin `https://afp.mclement.ch`. Local and public HTTPS end-to-end verification passed; the game is live at https://afp.mclement.ch/game/ . See [deployment evidence](../docs/game-deployment.md).

## Run

Requires Node 22 or newer and npm.

```sh
cd game
npm ci
npm test
npm start
```

Local URL: http://127.0.0.1:3210/game/ . No bundler/build step. Server serves allowlisted local UI files when present, generates QR SVG locally, and uses no external services or paid accounts.

For main’s later HTTPS proxy integration:

```sh
PUBLIC_ORIGIN=https://afp.mclement.ch HOST=127.0.0.1 PORT=3210 npm start
```

- `PUBLIC_ORIGIN`: one canonical HTTP(S) origin, no path, credentials, query or fragment. Default `http://127.0.0.1:3210` (uses custom PORT if supplied). Private API requests and mutations must originate here; public GET/HEAD entry, allowlisted static files and QR accept navigation from other sites. Forwarded origin/host headers are ignored.
- `HOST`: listening interface, default loopback `127.0.0.1`.
- `PORT`: integer 1–65535, default 3210.
- `TRUSTED_CLOUDFLARE_LOOPBACK`: exactly `0` (default) or `1`. Enable only when a trusted local cloudflared connector reaches this loopback-bound backend and overwrites `CF-Connecting-IP` with the verified incoming client address. Normal mode ignores all forwarded/client-IP headers.

### Optional trusted local Cloudflare connector

```sh
PUBLIC_ORIGIN=https://afp.mclement.ch HOST=127.0.0.1 PORT=3210 TRUSTED_CLOUDFLARE_LOOPBACK=1 npm start
```

Opt-in mode accepts **only loopback sockets** and requires exactly one `CF-Connecting-IP` containing a valid IPv4/IPv6 address (`node:net.isIP`); missing/malformed/duplicate values return 400 and non-loopback sockets return 403. IPv6 spellings and IPv4-mapped IPv6 are normalized for quotas. X-Forwarded-For, Forwarded and forwarded host/protocol never establish identity or origin. A local process can forge this header: loopback is the explicit trusted-connector boundary, not cryptographic verification. Do not enable behind an untrusted local proxy or a proxy that merely relays a browser-supplied header; do not expose the backend port publicly. Direct local health/debug requests also need that one header in enabled mode.

Anonymous/static/404/creation traffic uses a per-validated-client quota in trusted mode (socket-IP otherwise). Valid room capabilities get separate bounded all-request quotas and still retain mutation/stream limits, so anonymous abuse cannot spend the presenter/player quota, including behind shared NAT. Public room creation/join/static traffic still shares an IP budget when actual clients share an IP. IP-bucket memory is capped, and authenticated request budgets are bounded by existing room participants.

Proxy must preserve `/game`, use streaming/no buffering for events, support long-lived responses, and avoid recording Authorization. No infrastructure/configuration file is supplied or changed.

## Contract and checks

- [Exact HTTP/SSE API](API.md) — endpoints, state, errors, limits and timer/cooldown semantics.
- [Architecture](../docs/game-architecture.md) — design and integration responsibilities.
- `npm test`: deterministic injected clock/RNG rules plus real multi-client loopback HTTP/SSE, 24-player concurrent voting/full match, reconnect, reset, TTL, capacities and security boundaries. Tests use direct native loopback transport so runner proxy settings cannot send participant fixtures outside the machine.
- `npm audit --omit=dev`: dependency advisory check; requires npm registry connectivity.
- `git diff --check`: whitespace check (also inspect new/untracked files).

## Sound on the presenter and player devices

Sound is **ON by default as a preference**. A permitted autoplay attempt is made; when the browser requires a gesture, the first normal click/tap/key (including create/join/start) activates audio synchronously. Explicit mute remains off across subsequent interactions on that page. The exact lowercase master label becomes **sound is on** only when Web Audio runs and all seven WAVs decode. Loading, muted, failed or suspended audio remains **sound is off**; a separate visible hint and accessible label/title explain loading or waiting for browser permission. Each device has independent **Music** and **SFX / voice** sliders in **Audio levels**. Zero volume is allowed without changing audio readiness. Device volume, silent mode and muted tabs remain outside the game’s control.

Philippe’s exact requested [Wii Music - Gaming Background Music (HD)](https://www.youtube.com/watch?v=x2NzoLMWAwQ) (Gaming Sound FX upload; 87 seconds metadata, 86.79624-second full PCM recording) loops on menu/setup/lobby screens, stopping at prebattle. No section was trimmed. Uploader disclaims ownership and no reuse permission is established; attribution does not clear the rights. See [audio provenance](public/assets/audio/README.md). Every successful match start enters an authoritative 7.157-second prebattle phase: deep synthetic speech “three, two, one” at one-second beats, followed by the unchanged 4.156375-second “READY...FIGHT!” clip. Then the server opens the first full 15-second turn. Muted clients still display the countdown and cannot vote early. Replays/reset preserve this sequence; late joins/reconnects never replay historical starts. Audio suspension or reset cancels scheduled playback, not a delayed resume.

Voice uses the already-installed eSpeak NG 1.51 English male variant with low pitch; it is real formant-synthesized speech, not countdown tones. Its retro/robotic timbre is intentional, not a human announcer recording. Reproduction and exact Ready/Fight attribution: [audio assets](public/assets/audio/README.md).

Votes and the local countdown do not play action sounds: the authoritative resolved move plays once on each enabled device. Muted/suspended/loading results are consumed, never replayed after enabling. Muting stops music, voice, scheduled Ready/Fight, action and confirmation/win sounds.

Optional real Chromium graph/UI regression (uses an existing Playwright installation, no new runtime dependency):

```sh
PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
CHROMIUM_EXECUTABLE=/path/to/chrome npm test
```

Without these environment variables, native-browser tests are explicitly skipped; the normal suite still runs. Set `AUDIO_LIVE_URL=https://afp.mclement.ch/game/` as well to opt into the additional read-only live entry-page check; it enables audio but never creates, joins or mutates a live room. Native tests use isolated loopback rooms and desktop, touch-phone and touch-tablet browser contexts, decode real WAVs and measure real audio graph samples. They do not establish physical speaker output or actual iOS Safari compatibility.

State is memory-only. Restart or TTL expires rooms/capabilities. No analytics, database, nickname logs, or external media. Anyone with the student link can occupy a slot; anyone may create a room within limits. This is a public classroom game, not identity/roster verification. Lost tokens cannot be recovered.

## Resolved-move visuals

The browser maps authoritative lastResult moves to four bounded CSS effects in public/app.js and public/styles.css: opponent slash for attack, actor shield for defend, actor healing glow for heal, and opponent energy burst for special. Presenter effects overlay the affected fighter; phone and victory screens show a compact result stamp where the opposing fighter is not displayed. Votes and local timer expiry never trigger effects. First snapshots on join/reconnect are history; room/match/turn-number deduplication consumes repeat snapshots. Effects clean up after 850 ms; reduced-motion mode uses a stationary fading cue. No new assets or dependencies.

### Character-themed resolved cues (integrated roster)

Presentation definitions in `public/app.js` cover Luca Di Grazia (chalk/book), free rider (copied notes/credit), tryhard (formula/textbook), assessment hoodie (storm/luck), Trischli warrior (disco/wristband, no strobe), and bad teacher (red pen/exam/FAILED) for all four moves. The actor's theme colors, illustrated vector mark and per-move caption decorate the existing attack/defend/heal/special placement. The old generic effects remain the fallback; audio and game rules are unchanged. Motion is one-shot, clears after 850 ms, and becomes stationary with reduced motion.

The presenter’s arena/character selections are validated by the server and shared with every client as state.arenaId and state.teams.A/B.characterId. The same stable identities drive roster portraits, health labels, winner art and resolved-move effects. Unknown/older identities retain the original Ace/Dynamo fallback.

## Campus edition — five-screen flow

- **Main menu:** Play with a Friend (real online 1v1), Play with a Bot (solo), Play in Groups (presenter + voting teams). Join by room code, How to play, Return to your room and Main Menu remain available.
- **Arena:** Library, Trischli and Mensa B. Presentation-only; all three use the same balanced rules.
- **Fighters:** Luca Di Grazia, free rider in group project, tryhard, assessment student, Trischli warrior and bad teacher. Select the active Team A/Team B (or You/Bot) slot, then any fighter. Every fighter has four distinct command stats displayed as numbers and segmented bars. The shared profile module also drives server-authoritative combat; see below.
- **Battle:** two fighters, authoritative HP, timer, results, themed effects and sound activation. Phone participants see both fighters’ health above the original vote controls.
- **Game over:** winning fighter, Play Again (same selections), Main Menu. Groups Play Again returns everyone to the lobby for the presenter to start. Friend and Bot replay immediately with the same fighters and restored HP. All preserve participant capabilities.

Groups retains the non-playing presenter/room/QR/join/balanced-team/SSE/voting game. Friend is a separate real online 1v1: the host automatically owns Player 1 (A), one guest owns Player 2 (B), and a third join is rejected. Both play on their own browsers; each accepted move resolves immediately, with random legal fallback after 15 seconds. Only the host configures fighters, starts, resets or replays. Reload reconnects the same seat through its saved capability; losing that capability does not free the seat. This is not local hot-seat or peer-to-peer play.

Bot mode uses the same authoritative engine and server, not browser-controlled HP. The host controls Team A through the host-only solo action. A submitted move resolves on the next server tick (normally within 100 ms); Team B chooses a random legal move after one second. If the human does not choose within 15 seconds, the normal no-vote fallback applies. Bot rooms reject external joins. Bot mode requires a working server connection.

### Articulated character models

Six original refined fighters now use self-contained skinned GLBs under public/assets/characters/, with the exact server character IDs. Selected preview, battle (including participant phones) and winner view use real Three.js skeletal animation; menu/lobby/roster tiles use portraits rendered from the same models. Static portraits remain the explicitly labeled fallback if WebGL2/assets are unavailable. Native editable blend, anatomy/licensing provenance, seven clips, deformation checks and reproduction commands: [articulated cast v2](art/characters/v2/README.md). Existing SVG fighters remain legacy fallback assets; arena SVGs and gameplay rules are unchanged. These are stylized interpretations, not exact photographic likenesses. Barlow and Barlow Condensed are self-hosted under their included SIL Open Font License files in public/assets/OFL-*.txt. Existing action audio and original Ace/Dynamo fallback assets are preserved.

### Full UI smoke

With an existing Playwright/Chromium installation (no new runtime dependency):

    PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/path/to/chrome npm run test:ui

This starts an isolated local origin on port 18993. Set LIVE_URL=https://afp.mclement.ch/game/ to exercise the live game instead; that intentionally creates disposable bot/friend/group rooms. EVIDENCE_DIR selects screenshots; default /tmp/hsg-five-screen-smoke. Checks desktop/phone bot victory and replay; real Friend host + isolated guest through victory, host/guest reloads, third-seat rejection, reset and replay; Groups host + two isolated voters through real timed resolution, vote replacement and reset; all 24 displayed stats against engine data; all five desktop/mobile screen captures and overflow.

## Authoritative fighter profiles

| Fighter | Attack (HP) | Defend (% next hit blocked) | Heal (HP) | Special (HP) |
| --- | ---: | ---: | ---: | ---: |
| Luca Di Grazia | 28 | 70 | 14 | 42 |
| Free rider in group project | 17 | 62 | 11 | 30 |
| Tryhard | 25 | 42 | 8 | 36 |
| Assessment student | 19 | 56 | 13 | 31 |
| Trischli warrior | 27 | 35 | 7 | 40 |
| Bad teacher | 22 | 66 | 9 | 34 |

Luca is intentionally strongest overall, per the explicit request. Others specialize relative to one another: survivor/guard, sustained pressure, recovery, glass cannon, defensive pressure. Roster bars normalize Attack and Special to 50 HP, Defend to 100%, Heal to 20 HP; the exact adjacent number is authoritative, ten segments are rounded visual comparisons. These are not arbitrary 1–10 ratings. Combat uses public/fighter-data.js, also imported by the server. Each snapshot contains teams.A/B.stats; live controls show these values and cooldowns.

Damage rounds to the nearest whole HP after percentage block, minimum 1 HP, capped at current HP. Guard is one-use and does not stack. Heal caps at 100 HP. Special blocks exactly the next three own turns. Defense is at most 70%; every configured heal is below even the weakest basic attack. Tests cover every attacker/defender pair with repeated healing and guarding and establish eventual attack victory. Two players deliberately choosing only non-damaging moves can still prolong a match; no sudden-death rule was added.

Original clients creating with an empty body and omitting fighter configuration retain legacy 20/50%/15/30 fallback values. Normal UI setup always configures named fighters. No client may submit stats, HP or damage.

Design context: [PRODUCT.md](PRODUCT.md), [arcade-surface.md](arcade-surface.md), [DESIGN.md](DESIGN.md). Three.js 0.186.1 is pinned and vendored locally; gltf-validator/esbuild are development-only verification/vendor tooling. Vendored runtime assets are supplied directly, so no build step is needed to play. Assets use version tokens and no-store.

### Safe integration of the prebattle update

Developed and verified in an isolated worktree, not the live static directory. Requires engine + frontend integration and an approved backend service restart; restart destroys in-memory rooms. Do not restart automatically. After QA, integrate at a room-free maintenance window, obtain restart approval, restart, then refresh clients. New client tolerates the old server’s immediate running transition (Ready/Fight only; no claimed server countdown). Old clients remain unable to vote in the new countdown phase, but must refresh to display its new UI. Do not advertise the timed intro as deployed until the new engine runs.
