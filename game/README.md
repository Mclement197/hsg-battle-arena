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

Tap **Enable sound** in the top bar on **each** host computer, phone or tablet. Browsers require a gesture on each device; creating/joining a room does not enable sound. The control becomes **Mute sound** only when Web Audio is running and all four action WAVs have decoded. If the browser suspends audio (for example after backgrounding), tap **Enable sound** again. Device volume, silent mode and muted browser tabs are outside the game’s control.

Votes and the local countdown do not play action sounds: the authoritative resolved move plays once on each enabled device. Muted/suspended/loading results are consumed, never replayed after enabling. Muting stops action and confirmation/win sounds.

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

- **Main menu:** Play vs Bot, Play vs Friend ONLINE, How to play, and Main Menu navigation.
- **Arena:** Library, Trischli and Mensa B. Presentation-only; all three use the same balanced rules.
- **Fighters:** Luca Di Grazia, free rider in group project, tryhard, assessment student, Trischli warrior and bad teacher. Select the active Team A/Team B (or You/Bot) slot, then any fighter. Characters intentionally share stats.
- **Battle:** two fighters, authoritative HP, timer, results, themed effects and sound activation. Phone participants see both fighters’ health above the original vote controls.
- **Game over:** winning fighter, Play Again (same selections), Main Menu. Online Play Again resets everyone to the same lobby and preserves participant capabilities; the presenter starts again.

Online remains the real presenter/room/QR/join/balanced-team/SSE/voting game. A single friend on each team is sufficient; the presenter remains a non-voting host. It is not peer-to-peer or a local hot-seat mode.

Bot mode uses the same authoritative engine and server, not browser-controlled HP. The host controls Team A through the host-only solo action. A submitted move resolves on the next server tick (normally within 100 ms); Team B chooses a random legal move after one second. If the human does not choose within 15 seconds, the normal no-vote fallback applies. Bot rooms reject external joins. Bot mode requires a working server connection.

### Replaceable original placeholders

Original six fighter SVGs live at public/assets/CHARACTER_ID.svg, and arena SVGs at public/assets/arena-ARENA_ID.svg. Replace these files in place, keeping their IDs and view boxes (fighters 300×360; arenas 800×360). No API or rule change is necessary. The illustrated identities are playful placeholders, not photographic likenesses. Barlow and Barlow Condensed are self-hosted under their included SIL Open Font License files in public/assets/OFL-*.txt. Existing action audio and original Ace/Dynamo fallback assets are preserved.

### Full UI smoke

With an existing Playwright/Chromium installation (no new runtime dependency):

    PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/path/to/chrome npm run test:ui

This starts an isolated local origin on port 18993. Set LIVE_URL=https://afp.mclement.ch/game/ to exercise the live game instead; that intentionally creates disposable bot/online rooms. EVIDENCE_DIR selects screenshots; default /tmp/hsg-five-screen-smoke. Checks full bot victory/replay, online host plus two independent clients, real timed voting, vote replacement, reconnect/reset and desktop/mobile overflow.
