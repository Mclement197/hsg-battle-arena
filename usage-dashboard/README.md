# AFP Usage

A public, read-only, responsive AI usage dashboard at **https://afp.mclement.ch/usage**. This is a separate utility, not the HSG battle game.

## What it shows

- Token usage over time and model rankings, including the most-used model.
- New input, output, cache-read and cache-write tokens where attributable.
- Named skill instruction-read counts recorded after observer installation.
- Recent agent activity with privacy-safe, inferred descriptions.
- Today / 7-day / 30-day filters, model filtering, activity search, accessible chart tables, and mobile navigation.

The dashboard opens without a password. Anyone with the URL can read the sanitized usage snapshot. OpenClaw and Cloudflare credentials, raw prompts, transcripts and private session identifiers are never published.

## Architecture

Node.js 24, standard library only. No production npm dependencies, remote fonts, analytics or CDN assets.

- `src/server.mjs` binds only `127.0.0.1:18891`.
- `src/handler.mjs` serves exactly `/usage` and `/usage/*` with an allowlisted public-data projection.
- `src/collect.mjs` uses supported read-only OpenClaw reporting APIs, never raw session transcript files.
- `src/telemetry.mjs` validates scope and constructs a sanitized snapshot.
- `plugin/` observes successful named skill instruction reads; see its README for evidence and limits.
- `deploy/` contains user-systemd services and a five-minute collector timer.

The AFP hub owns public DNS/TLS/tunnel routing. Forward `/usage` and `/usage/*` to port 18891 **without stripping the prefix**. Other AFP routes belong to the hub. The laptop must be online for the local service and collection to work.

## Local setup

Prerequisites: Node.js 24, a working local OpenClaw CLI/Gateway, and this checkout at `~/hsg-battle-arena` (adjust unit paths if moved).

~~~sh
cd ~/hsg-battle-arena/usage-dashboard
npm test
npm run setup -- '<verified-root-session-key>'
npm run collect
npm start
~~~

Setup creates owner-private files in `~/.config/afp-usage/` (directory 0700, files 0600):

- `config.json`: explicit session scope and local paths.
- `sessions.json`: verified observer allowlist, maintained by the collector.
- `snapshot.json`: latest successful sanitized collection.
- `skills.jsonl`: prospective observations, once the observer is enabled.

Existing configuration is preserved. Legacy `auth.json` / `sign-in.txt` files may remain private on disk but are no longer read or used; new setup does not create them. `AFP_USAGE_CONFIG` selects another private config; `AFP_USAGE_STATE_DIR` changes the initial setup directory. Never put state or credentials inside the repository.

### Persistent operation

Inspect existing unit files before copying these examples. Merge changes rather than replacing unrelated settings.

~~~sh
mkdir -p ~/.config/systemd/user
cp deploy/afp-usage.service deploy/afp-usage-collect.service deploy/afp-usage-collect.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now afp-usage.service afp-usage-collect.timer
systemctl --user start afp-usage-collect.service
~~~

For manual refreshes, start the collector **service** instead of concurrent collector processes. Restart only `afp-usage.service` after source changes; static assets are preloaded. No Gateway restart is required for this web service.

~~~sh
systemctl --user status afp-usage.service afp-usage-collect.timer
journalctl --user -u afp-usage-collect.service -n 20 --no-pager
~~~

Diagnostics omit credentials and prompt text. The browser warns when its snapshot is over 15 minutes old. Refresh reloads the latest collected snapshot; it does not make a model call or immediately scrape the Gateway.

### Named skills

Install the reviewed observer following [plugin/README.md](plugin/README.md), linked to this source tree. Configure only the private allowlist and event paths; no network, prompt-injection or conversation-access grants are needed. Verify real tool events after enablement before claiming instrumentation is live.

## Accounting and privacy

- Scope is the configured root, verified descendants, and optionally an exact registered project ID—not all computer/account activity or unrelated chats.
- Only current session instances are included. Rotated physical history may be absent. Membership is revalidated before publication.
- **Model entries** are recorded usage entries, not guaranteed provider HTTP requests or human tasks.
- Normalized total tokens are authoritative. Cache buckets are not added to an already-inclusive total a second time.
- Missing token splits/prices remain `null` and display as unavailable, never invented zeroes.
- A populated verified rollup refreshed within 15 minutes may be used while an active session refreshes. Coverage notes disclose source freshness. Unusable reports preserve the previous snapshot.
- Activity descriptions are inferred from audit tool categories. No raw requests, prompts, commands, transcripts, session keys or filesystem paths are published. Unknown per-run tokens/models remain unattributed.
- Skill counts mean **instruction reads**, not completed workflows. They start at observer installation, may omit unsupported/missing events, and have no invented historical backfill. Repeated successful reads count separately. Observer limits are documented in its README.
- Local estimated costs, where recorded, are not a provider invoice.

No dashboard password, login endpoint, or session cookie is used. Public API requests omit credentials; the service only serves a validated, allowlisted snapshot and fixed static assets. Local collection state stays owner-private. OpenClaw authentication is unchanged. Hub, OpenClaw and usage share one trusted origin: paths are not browser security boundaries. Do not cohost untrusted applications here.

## Verification

~~~sh
npm test
node --check public/app.js
node --check src/server.mjs
curl --noproxy 127.0.0.1 -i http://127.0.0.1:18891/usage/healthz
curl --noproxy 127.0.0.1 -i http://127.0.0.1:18891/usage/api/usage
~~~

Expect health 200 and anonymous usage 200 after collection. `node scripts/smoke.mjs https://afp.mclement.ch` verifies public access without reading any credential files. Tests cover scope isolation, accounting, null-valued collector/UI contracts, public boot, privacy projection, removed auth endpoints, host/path restrictions, atomic private writes, and observer filtering. Synthetic fixtures are never served as real usage.

Before launch, also verify anonymous data access, public HTTPS, phone/laptop layouts, keyboard controls, and browser errors. Source tests alone do not prove deployed browser behavior.
