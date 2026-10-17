import http from 'node:http';
import { isIP } from 'node:net';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import QRCode from 'qrcode';
import { Arena, GameError, fail, fields } from './engine.mjs';

export const LIMITS = Object.freeze({ bodyBytes: 2048, requestsPerMinute: 3000, createsPerMinute: 10,
  mutationsPerMinute: 90, ipBuckets: 4096, streamsPerCredential: 2, streamsPerRoom: 400, streamsTotal: 1000 });
const MINUTE = 60000;
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary' };
const publicDirectory = fileURLToPath(new URL('../public', import.meta.url));

function canonicalOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('PUBLIC_ORIGIN must be one HTTP(S) origin without a path or credentials');
  return url.origin;
}
function normalizeIp(value) {
  if (isIP(value) !== 6) return value;
  const ipv6 = new URL('http://[' + value + ']/').hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(ipv6);
  if (!mapped) return ipv6;
  const upper = parseInt(mapped[1], 16), lower = parseInt(mapped[2], 16);
  return [upper >> 8, upper & 255, lower >> 8, lower & 255].join('.');
}
export function requestClientIp(req, trustedCloudflare = false) {
  let socketIp = req.socket.remoteAddress ?? 'unknown';
  try { socketIp = normalizeIp(socketIp); } catch { /* Scoped non-loopback IPv6 is not a trusted connector. */ }
  if (!trustedCloudflare) return socketIp;
  if (socketIp !== '::1' && !(isIP(socketIp) === 4 && socketIp.startsWith('127.')))
    fail(403, 'trusted_proxy_required', 'Trusted connector must use a loopback socket');
  const occurrences = req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'cf-connecting-ip').length;
  const value = req.headers['cf-connecting-ip'];
  if (occurrences !== 1 || typeof value !== 'string' || !isIP(value))
    fail(400, 'invalid_proxy_ip', 'Expected one valid CF-Connecting-IP header');
  try { return normalizeIp(value); }
  catch { fail(400, 'invalid_proxy_ip', 'Expected one valid CF-Connecting-IP header'); }
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? ''))
    fail(415, 'json_required', 'Content-Type must be application/json');
  if (req.headers['content-encoding']) fail(415, 'encoding_unsupported', 'Compressed requests are not supported');
  if (Number(req.headers['content-length']) > LIMITS.bodyBytes) fail(413, 'body_too_large', 'JSON body exceeds 2048 bytes');
  return await new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    const finish = (error, value) => {
      clearTimeout(deadline);
      req.off('data', data); req.off('end', end); req.off('error', aborted); req.off('aborted', aborted);
      if (error) { req.resume(); reject(error); } else resolve(value);
    };
    const data = chunk => {
      bytes += chunk.length;
      if (bytes > LIMITS.bodyBytes) finish(new GameError(413, 'body_too_large', 'JSON body exceeds 2048 bytes'));
      else chunks.push(chunk);
    };
    const end = () => {
      let value;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { return finish(new GameError(400, 'invalid_json', 'Expected a valid UTF-8 JSON object')); }
      finish(null, value);
    };
    const aborted = () => finish(new GameError(400, 'aborted_body', 'Request body interrupted'));
    const deadline = setTimeout(() => finish(new GameError(408, 'body_timeout', 'Request body timed out')), 10000);
    deadline.unref();
    req.on('data', data); req.on('end', end); req.on('error', aborted); req.on('aborted', aborted);
  });
}
function consume(bucket, key, limit, now) {
  let entry = bucket.get(key);
  if (!entry || now - entry.since >= MINUTE) { entry = { since: now, count: 0 }; bucket.set(key, entry); }
  if (entry.count >= limit) fail(429, 'rate_limit', 'Too many requests; retry in a minute');
  entry.count++;
}
function publicStaticPath(pathname) {
  return ['/game/', '/game/index.html', '/game/app.js', '/game/styles.css', '/game/fighter-data.js', '/game/characters.js'].includes(pathname) ||
    /^\/game\/assets\/[A-Za-z0-9_-]+\.(svg|png|webp|jpg|ico|woff2|ttf|mp3|wav|ogg)$/.test(pathname) ||
    /^\/game\/assets\/audio\/[A-Za-z0-9_-]+\.wav$/.test(pathname) ||
    /^\/game\/assets\/characters\/(luca-di-grazia|free-rider|tryhard|assessment-hoodie|trischli-warrior|bad-teacher)\.(glb|webp)$/.test(pathname) ||
    /^\/game\/vendor\/(three\.(module|core)|GLTFLoader|BufferGeometryUtils|SkeletonUtils)\.js$/.test(pathname);
}
async function staticFile(res, pathname, root) {
  const name = pathname === '/game/' ? 'index.html' : pathname.slice('/game/'.length);
  if (!publicStaticPath(pathname))
    fail(404, 'not_found', 'Not found');
  try {
    // All components must be local, non-symlinked and remain inside public/.
    for (const entry of [root, ...name.split('/').map((_, i, parts) => path.join(root, ...parts.slice(0, i + 1)))]) {
      if ((await lstat(entry)).isSymbolicLink()) fail(404, 'not_found', 'Not found');
    }
    const physicalRoot = await realpath(root);
    const file = await realpath(path.join(root, name));
    if (!file.startsWith(physicalRoot + path.sep)) fail(404, 'not_found', 'Not found');
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024) fail(404, 'not_found', 'Not found');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] }); res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') fail(404, 'not_found', 'Not found');
    throw error;
  }
}

export function createGameServer({ arena, publicOrigin = 'http://127.0.0.1:3210', publicDir = publicDirectory,
  autoTick = true, limits: overrides = {}, trustedCloudflare = false } = {}) {
  if (typeof trustedCloudflare !== 'boolean') throw new Error('trustedCloudflare must be explicitly boolean');
  const wall = Date.now(), monotonic = performance.now();
  arena ??= new Arena({ now: () => Math.floor(wall + performance.now() - monotonic) });
  const origin = canonicalOrigin(publicOrigin);
  const limits = { ...LIMITS, ...overrides };
  const ips = new Map();
  let streamCount = 0;
  let closed = false;
  const joinUrl = room => origin + '/game/?room=' + room.id;
  function sendState(room, stream) {
    if (stream.res.destroyed || !stream.res.write('event: state\nid: ' + room.revision + '\ndata: ' +
      JSON.stringify(arena.snapshot(room, stream.viewer)) + '\n\n')) stream.res.destroy();
  }
  function broadcast(room) {
    // Coalesce classroom vote bursts; snapshots replace state, not an event history.
    if (room.broadcastTimer || closed) return;
    room.broadcastTimer = setTimeout(() => {
      room.broadcastTimer = null;
      if (arena.rooms.has(room.id)) for (const stream of room.streams) sendState(room, stream);
    }, 100);
    room.broadcastTimer.unref();
  }
  function remove(room) {
    arena.rooms.delete(room.id);
    if (room.broadcastTimer) clearTimeout(room.broadcastTimer);
    for (const stream of room.streams) stream.res.end();
  }
  function sweep() {
    for (const [ip, entry] of ips) if (arena.now() - entry.since >= MINUTE) ips.delete(ip);
    for (const room of arena.rooms.values()) {
      if (arena.expired(room)) remove(room);
      else if (arena.advance(room)) broadcast(room);
    }
  }
  function getRoom(roomId) {
    const room = arena.rooms.get(roomId);
    if (!room || arena.expired(room)) {
      if (room) remove(room);
      fail(404, 'room_not_found', 'Room is missing or expired');
    }
    if (arena.advance(room)) broadcast(room);
    return room;
  }
  const server = http.createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      if (closed) fail(503, 'stopping', 'Server stopping');
      const ip = requestClientIp(req, trustedCloudflare);
      if (!req.url || req.url.length > 1024 || !req.url.startsWith('/')) fail(400, 'invalid_path', 'Invalid request path');
      const [pathname, query] = req.url.split('?');
      if (pathname.startsWith('/game/api/') && query !== undefined) fail(400, 'query_forbidden', 'API query parameters are not accepted');
      const route = /^\/game\/api\/rooms\/([a-f0-9]{12})\/(join|reconnect|state|events|start|reset|configure|play|vote|qr\.svg)$/.exec(pathname);
      const publicRead = (req.method === 'GET' || req.method === 'HEAD') &&
        (pathname === '/game' || publicStaticPath(pathname) || route?.[2] === 'qr.svg');
      // Public pages/assets/QR carry no capabilities or private state. Links and QR
      // navigations legitimately arrive cross-site; private APIs and all mutations do not.
      if (!publicRead && (req.headers.origin && req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site'))
        fail(403, 'origin_forbidden', 'Cross-origin requests are not allowed');
      const credential = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')?.[1];
      const candidate = route && !['join', 'qr.svg'].includes(route[2]) ? arena.rooms.get(route[1]) : null;
      let quotaViewer;
      if (candidate && !arena.expired(candidate) && credential) {
        try { quotaViewer = arena.authenticate(candidate, credential); }
        catch (error) { if (!(error instanceof GameError) || error.status !== 401) throw error; }
      }
      let ipEntry;
      if (quotaViewer) {
        // Valid capabilities never spend the anonymous connector/shared-NAT quota.
        candidate.requestRates ??= new Map();
        consume(candidate.requestRates, quotaViewer.player?.id ?? 'host', limits.requestsPerMinute, arena.now());
      } else {
        ipEntry = ips.get(ip);
        if (!ipEntry || arena.now() - ipEntry.since >= MINUTE) {
          if (!ipEntry && ips.size >= limits.ipBuckets) fail(429, 'rate_capacity', 'Too many clients; retry in a minute');
          ipEntry = { since: arena.now(), count: 0, creates: 0 }; ips.set(ip, ipEntry);
        }
        if (ipEntry.count >= limits.requestsPerMinute) fail(429, 'rate_limit', 'Too many requests; retry in a minute');
        ipEntry.count++;
      }
      if (req.method === 'POST' && pathname === '/game/api/rooms') {
        if (ipEntry.creates >= limits.createsPerMinute) fail(429, 'rate_limit', 'Room creation rate exceeded');
        ipEntry.creates++;
        const setup = await body(req);
        fields(setup, Object.hasOwn(setup || {}, 'mode') ? ['mode'] : []);
        if (Object.hasOwn(setup, 'mode') && !['bot', 'friend', 'groups'].includes(setup.mode)) fail(400, 'invalid_mode', 'Mode must be bot, friend or groups; omit mode for legacy group play');
        sweep();
        const room = arena.create();
        if (setup.mode === 'bot') arena.enableBot(room);
        if (setup.mode === 'friend') arena.enableFriend(room);
        if (setup.mode === 'groups') room.mode = 'groups';
        return json(res, 201, { roomId: room.id, hostToken: room.hostToken, joinUrl: joinUrl(room),
          qrUrl: '/game/api/rooms/' + room.id + '/qr.svg', state: arena.snapshot(room, { role: 'host' }) });
      }
      if (publicRead && pathname === '/game') {
        res.writeHead(308, { Location: '/game/' + (query === undefined ? '' : '?' + query) }); return res.end();
      }
      if (!route) {
        if (publicRead && publicStaticPath(pathname)) return await staticFile(res, pathname, publicDir);
        fail(404, 'not_found', 'Not found');
      }
      const [, roomId, action] = route;
      if (action === 'qr.svg' ? !publicRead : ['state', 'events'].includes(action) ? req.method !== 'GET' : req.method !== 'POST')
        fail(404, 'not_found', 'Not found');
      // Parse before resolving/authenticating: slow bodies cannot carry votes past the cutoff.
      const input = req.method === 'POST' ? await body(req) : null;
      const room = getRoom(roomId);
      if (action === 'qr.svg') {
        const svg = await QRCode.toString(joinUrl(room), { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 256 });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return res.end(svg);
      }
      if (action === 'join') {
        const { player, playerToken } = arena.join(room, input);
        broadcast(room);
        return json(res, 201, { playerToken, playerId: player.id, team: player.team,
          state: arena.snapshot(room, { role: 'player', player }) });
      }
      const viewer = arena.authenticate(room, credential);
      if (action === 'state') return json(res, 200, { state: arena.snapshot(room, viewer) });
      if (action === 'events') {
        if (room.streams.size >= limits.streamsPerRoom || streamCount >= limits.streamsTotal ||
            [...room.streams].filter(stream => stream.credential === credential).length >= limits.streamsPerCredential)
          fail(429, 'stream_capacity', 'Too many live streams');
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
        const stream = { res, viewer, credential };
        room.streams.add(stream); streamCount++; arena.touch(room);
        if (viewer.player) { viewer.player.connections++; room.revision++; }
        const heartbeat = setInterval(() => { if (!res.write(': heartbeat\n\n')) res.destroy(); }, 15000);
        heartbeat.unref();
        res.on('close', () => {
          clearInterval(heartbeat); room.streams.delete(stream); streamCount--;
          if (viewer.player) { viewer.player.connections--; room.revision++; if (arena.rooms.has(room.id)) broadcast(room); }
        });
        sendState(room, stream); broadcast(room); return;
      }
      consume(room.mutationRates, viewer.player?.id ?? 'host', limits.mutationsPerMinute, arena.now());
      if (action === 'reconnect') {
        fields(input, []); arena.requireRole(viewer, 'player'); arena.touch(room);
        return json(res, 200, { playerId: viewer.player.id, team: viewer.player.team, state: arena.snapshot(room, viewer) });
      }
      arena[action](room, viewer, input);
      broadcast(room);
      return json(res, 200, { state: arena.snapshot(room, viewer) });
    } catch (error) {
      if (res.headersSent) return res.destroy();
      const known = error instanceof GameError;
      const status = known ? error.status : 500;
      if (status === 429) res.setHeader('Retry-After', '60');
      // Reject and close unconsumed/oversize bodies; never log input or credentials.
      if (req.method === 'POST' && !req.complete) res.setHeader('Connection', 'close');
      json(res, status, { error: { code: known ? error.code : 'internal_error', message: known ? error.message : 'Request failed' } });
    }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  server.maxConnections = 2048;
  const timer = autoTick ? setInterval(sweep, 100) : null;
  timer?.unref();
  server.on('close', () => { closed = true; if (timer) clearInterval(timer); });
  async function close() {
    closed = true; if (timer) clearInterval(timer);
    for (const room of [...arena.rooms.values()]) remove(room);
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
  return { server, arena, tick: sweep, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 3210);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535');
  const proxyMode = process.env.TRUSTED_CLOUDFLARE_LOOPBACK ?? '0';
  if (!['0', '1'].includes(proxyMode)) throw new Error('TRUSTED_CLOUDFLARE_LOOPBACK must be 0 or 1');
  const game = createGameServer({ publicOrigin: process.env.PUBLIC_ORIGIN ?? 'http://127.0.0.1:' + port,
    trustedCloudflare: proxyMode === '1' });
  game.server.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log('HSG Battle Arena listening on port ' + port));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void game.close(); });
}
