# AFP Usage

A public, read-only, responsive AI usage dashboard at **https://afp.mclement.ch/usage**. This is a separate utility, not the HSG battle game.

## What it shows

- Token usage over time and model rankings, including the most-used model.
- New input, output, cache-read and cache-write tokens where attributable.
- Named skill instruction-read counts recorded after observer installation.
- Recent agent activity with privacy-safe, inferred descriptions.
- Today / 7-day / 30-day filters, model filtering, activity search, accessible chart tables, and mobile navigation.

The dashboard opens without a password. Anyone with the URL can read the sanitized usage snapshot. OpenClaw and Cloudflare credentials, raw prompts, transcripts and private session identifiers are never published.

## Pages and drill-downs

- **Overview:** a concise entry point to the deeper views.
- **Models:** comparison and individual-model usage, with recorded token buckets and unknowns kept distinct.
- **Agents:** the configured directory, approved role descriptions, configured models and separately measured AFP activity.
- **Skills:** the root agent's installed catalogue, reviewed purpose descriptions, availability flags and observed instruction reads.
- **Activity:** verified session workstreams and recorded agent runs, with public summaries, agent identity, lifecycle evidence, timing and observed tool categories.

The page routes are /usage, /usage/models, /usage/agents, /usage/skills and /usage/activity. Selections and filters use query parameters so links can be shared and browser Back/Forward remains useful. Configuration does not establish that an agent is running or that a skill is executable in every context.

See [the interface brief](DESIGN.md) and [the baseline review](REVIEW.md) for scope and acceptance criteria.

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

### Reviewed public metadata

Directories use the supported read-only agents.list and skills.status APIs. Agent accounting reuses the already scoped session reports rather than collecting account-wide totals. The catalogue describes the root agent's skills; different agents can resolve different catalogues.

The public HTTP boundary validates the optional details through src/public-details.mjs. Authored runtime labels and skill frontmatter are not automatically safe to publish. The reviewed data/public-metadata.json file contains public names/roles, skill descriptions bound to a SHA-256 digest of the installed descriptor, and task titles/summaries keyed by the opaque exact-instance task identifier. It contains no private session keys or raw tasks. Changed or unreviewed descriptions remain unavailable until reviewed. New task instances do not inherit approvals merely because their labels match.

Tasks here are verified session/delegation workstreams, not a complete inventory of human requests. Lifecycle success does not prove product acceptance. Recorded session model selection is not substituted for historical per-run model attribution. Missing timing endpoints, model splits or tool evidence stay unavailable. Tool steps count deduplicated observations, not reasoning steps, and historical coverage is bounded by retention.

The optional detail fields are additive to snapshot v1. Old snapshots remain valid. A failed optional metadata source should mark that directory unavailable or partial while preserving valid core usage. No complete skill instructions, cached transcript summaries or raw task bodies are published.

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
