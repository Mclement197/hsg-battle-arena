# HSG Battle Arena HTTP/SSE contract (v1)

All paths start `/game`; use relative same-origin URLs. JSON request/response, no external assets/services. `POST` requires `Content-Type: application/json` and (when sent by a browser) `Origin` exactly matching configured `PUBLIC_ORIGIN`. Credentials are opaque bearer capabilities, never put them in URLs, QR codes, DOM, or logs. Store host and player tokens separately in browser session storage; a presenter token grants start/reset, never distribute it to students. Fetch SSE with `Authorization` (native EventSource cannot set that header).

## Endpoints

- `POST /game/api/rooms`, body `{}` or `{mode:"friend"|"bot"|"groups"}` → **201** `{roomId, hostToken, joinUrl, qrUrl, state}`. Browser-only presenter creation; no CLI/account needed. `joinUrl` is `${PUBLIC_ORIGIN}/game/?room=ROOM_ID`, `qrUrl` is `/game/api/rooms/ROOM_ID/qr.svg`; neither contains a capability.
- `POST /game/api/rooms/ROOM_ID/join`, body `{nickname}` → **201** `{playerToken, playerId, team, state}`. Nickname trimmed, 1–24 Unicode code points, no control characters. Groups allows joining lobby/running/finished and assigns the smaller team, random on equal counts; disconnected players still count. Friend admits only one guest B (host already owns A), then returns 409 friend_full. Bot rejects external joins.
- `POST /game/api/rooms/ROOM_ID/reconnect`, body `{}`, `Authorization: Bearer PLAYER_TOKEN` → **200** `{playerId, team, state}`. Same player/team and vote, no new slot or rebalance. Invalid/lost token cannot recover identity; Groups rejoin consumes another slot; a full Friend room cannot recover a lost token through rejoining.
- `GET /game/api/rooms/ROOM_ID/state`, host/player bearer → **200** `{state}`.
- `GET /game/api/rooms/ROOM_ID/events`, host/player bearer → **200** `text/event-stream`. Fetch and parse SSE frames: `event: state`, `id: REVISION`, `data: STATE_JSON`, blank line. Immediate full snapshot, then current changes coalesced within 100ms (intermediate revisions may be skipped); 15s comment heartbeats. Reconnect gets full current snapshot, not historical replay; ignore Last-Event-ID. Stop/retry according to HTTP status and show reconnect state. Up to 2 live streams per capability. No query-string credential accepted.
- `POST /game/api/rooms/ROOM_ID/start`, body `{}`, host bearer → **200** `{state}`. Lobby only; at least one member on each team. Team A always starts.
- `POST /game/api/rooms/ROOM_ID/reset`, body `{}`, host bearer → **200** `{state}`. Any phase → lobby, preserves players/tokens/teams, restores HP/shields/cooldowns, clears votes/results, increments match; start explicitly again.
- `POST /game/api/rooms/ROOM_ID/vote`, player bearer, body `{turnId, move}` → **200** `{state}`. `move` exactly `attack|defend|heal|special`. Replace own vote until cutoff. Server derives team from token; no team/player fields accepted. Old match/turn rejected, wrong team rejected, cooldown special rejected.
- `GET`/`HEAD /game/api/rooms/ROOM_ID/qr.svg` → public local SVG for student join URL only.
- `GET`/`HEAD /game` → **308** `/game/` (preserves query); `GET`/`HEAD /game/` and `/game/index.html`, `/game/app.js`, `/game/styles.css`, `/game/fighter-data.js`, `/game/assets/NAME.EXT` → allowlisted local frontend files if present (backend does not create them). Asset names: simple ASCII letters/digits/underscore/hyphen, extensions svg/png/webp/jpg/ico/woff2/mp3/wav/ogg. No nested paths, symlinks, dotfiles, traversal, arbitrary files.

Unknown fields rejected on every POST. Empty bodies are not `{}`. Responses use `Cache-Control: no-store`. No CORS support. Public entry/static/QR GET/HEAD accept cross-site navigation, including omitted, null or different Origin; they expose no capabilities or private room state. This exception never applies to POST, private state or events; mismatched Origin or cross-site Fetch metadata still returns 403 there. HEAD returns the corresponding GET status/headers without a body. JSON failures: `{error: {code, message}}`; statuses 400 invalid input (including missing/malformed/duplicate trusted client-IP header), 401 missing/invalid bearer, 403 host/player-only, wrong team/origin, or non-loopback connector socket, 404 missing/expired room or route, 409 phase/stale turn/cooldown, 408 body timeout (10s), 413 oversized body, 415 MIME, 429 rate/capacity/stream limit with `Retry-After`, 503 room/player/global capacity.

## State shape

```json
{
  "roomId":"12 lowercase hex characters",
  "revision":3, "serverNow":1700000000000,
  "phase":"lobby", "match":0, "winner":null,
  "rules":{"turnMs":15000,"maxHp":100,"attack":20,"heal":15,"special":30,"specialCooldownOwnTurns":3},
  "teams":{
    "A":{"hp":100,"shield":false,"ownTurn":0,"specialReadyOwnTurn":0,"specialCooldownRemaining":0,"playerCount":1},
    "B":{"hp":100,"shield":false,"ownTurn":0,"specialReadyOwnTurn":0,"specialCooldownRemaining":0,"playerCount":1}
  },
  "players":[{"id":"opaque player id","nickname":"Alex","team":"A","connected":true}],
  "turn":null,
  "lastResult":null,
  "you":{"role":"player","playerId":"opaque player id","team":"A","vote":null}
}
```

Group/Bot host `you` is `{role:"host"}`; Friend host additionally receives `{playerId,team:"A",vote}`. Running `turn`: `{id,number,team,startedAt,deadline,availableMoves:[...],voteCounts:{attack:0,defend:0,heal:0,special:0},totalVotes:0}`. `turn.id` includes match and turn number, opaque to UI; send it unchanged. Last result: `{turnId,number,team,move,voteCounts,totalVotes,tiedMoves,damage,healed,resolvedAt}`; no-vote result has a uniformly random available `move`, `totalVotes:0` and `tiedMoves:[]`. Winner is `"A"|"B"` only in `finished`, and turn becomes null. `lastResult` persists until next resolution/reset. Connected means an active SSE stream, not mere HTTP traffic. No capability appears in state.

## Authoritative timing and rules

The server accepts votes only at `serverNow < deadline`; client clocks/timers never authorize actions. 15-second alternating turns, 100 HP each. Configured fighters use snapshot teams.A/B.stats from public/fighter-data.js: Attack/Special in HP, Heal in HP capped at 100, Defend in percent of the next attack/special blocked. Guard does not stack and is consumed by one hit. Damage = min(target HP, max(1, round(power × (100 − blockedPercent)/100))). Unconfigured legacy rooms retain Attack 20, Special 30, 50% block and Heal 15. Only when the entire active team has submitted no votes at the deadline, choose uniformly at random from available moves (excluding special during cooldown). Any submitted votes still determine the winning move; tied top moves remain uniformly random. Special used on own turn N is unavailable on own turns N+1, N+2, N+3 and available on N+4. Thus after using it `specialReadyOwnTurn=N+4`; cooldown remaining is the number of **future own-turn starts** until ready, not a milliseconds countdown. Example used on A1: A2 displays 3, A3 2, A4 1, A5 0. Immediate post-resolution A ownTurn stays 1 and displays 4 until A2 starts. Shield persists across heals, missed turns, and cooldowns until consumed/reset. At zero HP match finishes immediately. Initial start does not require all players connected.

Reconnect/reset/late join never rebalance existing players. Reset increments match immediately and invalidates all prior turn IDs, votes and results; participant capabilities remain valid. Timer advances on server ticks and before every room request, including late votes. A delayed timer opens the next turn at actual resolution time (always a full 15s, no instant catch-up turns).

## Limits and runtime

Node >=22. `cd game && npm ci && npm test`; `PUBLIC_ORIGIN=https://afp.mclement.ch PORT=3210 HOST=127.0.0.1 npm start`. Origin must be one http(s) origin without a path; configured constant, never forwarded headers. Default local origin `http://127.0.0.1:3210`. Main owns proxy/deployment; proxy must preserve `/game`, allow SSE streaming, disable buffering, and not log Authorization. Backend defaults to loopback.

Limits: 50 rooms, 200 players/room, 2 streams/capability, 400/room, 1000 globally; JSON ≤2048 bytes. Anonymous/static/404 traffic: 3000 HTTP requests/minute and 10 room creations/minute per client IP. Valid authenticated room routes: independent 3000 requests/minute per host/player capability, plus 90 mutations/minute per room/host or player. Valid capabilities never spend anonymous IP quota, even when that budget/bucket capacity is exhausted; invalid capabilities do. IP buckets capped at 4096; authenticated buckets bounded by existing room participants. Default IP identity is socket-IP; all forwarded headers ignored. Explicit `TRUSTED_CLOUDFLARE_LOOPBACK=1` requires a loopback socket and exactly one valid `CF-Connecting-IP` (IPv4/IPv6 using net.isIP, normalized); missing/malformed/duplicate returns 400, non-loopback returns 403. Only enable for a trusted local cloudflared connector that overwrites the header; any local process can forge it. Never trust X-Forwarded-For/Forwarded or forwarded origins/hosts. Default `0`; only 0/1 accepted. See README.md for trust boundary and setup. Room idle TTL 1h (mutations/reconnect/new stream refresh, heartbeats/read-only polls do not), hard lifetime 6h. Expired rooms removed and streams closed; restart loses all rooms. No analytics or persistent participant storage/logging.

## Campus setup and three distinct modes (2026-10-16)

Existing empty-body create/join/start/reset/vote/SSE contracts remain valid as legacy group play (mode: online).

- POST /game/api/rooms accepts exactly {mode: "bot"}, {mode: "friend"}, or {mode: "groups"}. Other mode values and unknown fields are rejected. Bot creates two internal players. Friend reserves A for the host, exposes no separate A player capability, and permits exactly one guest B. Groups creates a non-playing presenter and up to the normal 200 voters. Mode is immutable after creation.
- POST /game/api/rooms/ROOM_ID/configure: host bearer, lobby only, exact body {arenaId, characterA, characterB}. Arena: library|trischli|mensa-b. Character: luca-di-grazia|free-rider|tryhard|assessment-hoodie|trischli-warrior|bad-teacher. Same fighter on both teams is permitted. Server selects actual stats from IDs; arbitrary stats are rejected.
- POST /game/api/rooms/ROOM_ID/play: host bearer, Bot/Friend only, exact body {turnId, move}. Validates Team A ownership, current turn, cutoff and cooldown. Accepted choices set deadline to server-now; next tick/request resolves. Friend B uses player-only /vote, also immediately. Wrong-side actions return 403; consumed turn IDs return 409. Groups retains changeable voting through the full deadline; its presenter cannot /play or /vote.
- Bot B acts after one second, randomly choosing a legal move. Friend contains no bot; both sides are human capabilities. A missed 15-second Friend turn uses normal random no-vote fallback.
- Snapshots include mode: online|groups|friend|bot, arenaId, configured characterId and numeric stats for each team. No extra credentials appear in state or URLs. Shared stat table and units: README.md. Luca is strongest on all four stats, deliberately.
- Reset preserves mode, arena, fighters, both Friend seats and all participant capabilities, restoring HP/shields/cooldowns and clearing votes/results. API reset always returns lobby; browser Friend/Bot replay then invokes host /start. Groups replay waits for the presenter to start.
- Mode actions retain exact-body validation, authenticated SSE, origin checks, TTL and quotas. Friend capacity counts disconnected seats, preventing role theft during reload. Lost capabilities cannot be recovered; create another room.
- Fonts use font/ttf. JS/CSS and shared fighter data use version tokens; all responses retain no-store and traversal/symlink protection.
