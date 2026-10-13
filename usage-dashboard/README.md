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
- `src/live-usage.mjs` shares installation aggregate reads between visitors, serializes CLI readers and recovers from a bounded private backup.
- `src/process-reader.mjs` owns canceled/timed-out CLI children until physical close, with SIGTERM followed by SIGKILL after 500 ms.
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

Diagnostics omit credentials and prompt text. While visible, the browser requests /usage/api/usage **5 seconds after the previous response finishes**, rather than on a fixed timer, and immediately after a hidden tab becomes visible. Running-agent status checks every **5 seconds** while visible and on resume. Each endpoint's client requests coalesce while one is pending; hidden tabs stop usage checks. Failed HTTP requests retain the previous snapshot, mark it stale, and retry after five seconds. A valid response with live.status of degraded or loading retains reported totals but labels the source unavailable or sampling pending. A stable accounting revision (and receipt-only changes) does not repaint charts or reset filters. Refresh triggers a read of the public usage endpoint; it does not make a model call.

The installation source performs an on-demand, process-wide, shared read of the supported aggregate reporting API; its 5-second normal retry bound starts after the read finishes. The frontend shows the last successful sample time separately from the latest rollup refresh, if supplied. source.refreshedAt is the latest rollup refresh across agents, **not** a completeness watermark for every agent or every recent response. Neither 5-second polling nor source receipts make this a live token stream: usage may only be recorded after the provider response completes, and upstream rollups can lag. Backend failures preserve the last successfully sampled totals with degraded status and 10/20/40/60-second bounded retry backoff. During degraded or missing-data operation, a shared backup read is allowed at most once per minute; a newer validated installation snapshot is adopted with its actual original sampling/source timestamps, never replacing newer in-memory data. Missing startup backups can recover without restarting. Backup files are bounded to 1 MiB, must be regular files, and cannot be symlinks. The five-minute collector remains the sole persistent snapshot writer; live reads never write that file.

The installed Gateway caches complete aggregate responses for up to **30 seconds**, invalidating that cache when usage rollups publish updates. Aggregate reads request supported background refresh when needed; there is no supported force-refresh flag. Even successful five-second sampling can return an older upstream report. Source reportUpdatedAt is aggregate assembly time; refreshedAt/sourceUpdatedAt is the latest merged rollup refresh, not proof that all responses or agents are current. Response completion, rollup work, Gateway cache reuse, polling cadence and outages determine real latency; no sub-second or token-stream guarantee is made.

One active-agent or usage CLI child may run at a time, with at most one queued read. Active-agent timeouts also cancel queued work before child admission. Cancellation/timeout sends SIGTERM and escalates to SIGKILL after **500 ms**; the slot remains held until child close, even if the HTTP sample timeout has already returned old data. The HTTP adapter admits at most **32 retained handlers** and **128 sockets**; excess handlers receive 503 with Retry-After: 5. Disconnects do not prematurely release an unfinished handler's admission. Normal source demand is capped to one aggregate read per five seconds after completion, regardless of visitor count; absent visitors cause no live polling. The existing five-minute backup timer remains unchanged. Read-only measurements found roughly 0.75–0.87 seconds wall time and 184 MiB peak RSS per CLI startup; serializing children avoids doubling that memory within the existing service limit, but frequent polling still has CPU cost.

After changing the frontend source, restart only `afp-usage.service` and reload already-open browser tabs to obtain the new polling code; the server preloads static assets. Verify the served `/usage/app.js`, anonymous `/usage/api/usage` (`Cache-Control: no-store`), and automatic requests before claiming the fix is deployed. Do not restart the Gateway.

### Named skills

Install the reviewed observer following [plugin/README.md](plugin/README.md), linked to this source tree. Configure only the private allowlist and event paths; no network, prompt-injection or conversation-access grants are needed. Verify real tool events after enablement before claiming instrumentation is live.

## Accounting and privacy

- Default/project-only scope is the configured root, verified descendants, and optionally an exact registered project ID. Explicit all-conversations mode below admits all permitted main conversations and their approved specialist delegations; neither mode counts all computer/account activity.
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

Directories use the supported read-only agents.list and skills.status APIs. Agent accounting partitions only the admitted exact-instance session reports in the selected mode, never unfiltered account-wide totals. The catalogue describes the root agent's skills; different agents can resolve different catalogues.

The public HTTP boundary validates the optional details through src/public-details.mjs. Authored runtime labels and skill frontmatter are not automatically safe to publish. The reviewed data/public-metadata.json file contains public names/roles, skill descriptions bound to a SHA-256 digest of the installed descriptor, and task titles/summaries keyed by the opaque exact-instance task identifier. It contains no private session keys or raw tasks. Changed or unreviewed descriptions remain unavailable until reviewed. New task instances do not inherit approvals merely because their labels match.

Tasks here are verified session/delegation workstreams, not a complete inventory of human requests. Lifecycle success does not prove product acceptance. Recorded session model selection is not substituted for historical per-run model attribution. Missing timing endpoints, model splits or tool evidence stay unavailable. Tool steps count deduplicated observations, not reasoning steps, and historical coverage is bounded by retention.

The optional detail fields are additive to snapshot v1. Old snapshots remain valid. A failed optional metadata source should mark that directory unavailable or partial while preserving valid core usage. No complete skill instructions, cached transcript summaries or raw task bodies are published.

## All-conversations accounting (explicit opt-in)

All mode requires both `scopeMode: all-conversations` and a **verified, explicitly authorized** `conversationProfileId` in the existing private collector configuration, plus a reporting context authenticated as that same person. Omitted or `scoped` retains the project-only behavior and old snapshot-v1 compatibility. The selected root key remains private configuration for reverting; in all mode it does not restrict accounting. Any old project ID or scope label is ignored for all-mode admission/labeling.

Admission uses the supported read-only Gateway APIs documented in the installed runtime's Gateway protocol **session control** and **system and channels**, with parameter shapes checked against its installed protocol schemas:

- Before any session read, require `users.self` to report the exact configured human profile. Missing identity, a merged/ambiguous profile, or a different person fails closed; never retry through a privileged shared-token/admin context. Then page `sessions.list` with `ownerId`, `creatorId` and typed `profileRelation: { profileId, relationship: owned }` for active/archived main roots, excluding subagents, cron/system and global/unknown sentinels. Independently validate both creator and effective owner as matching typed profile identities. Bare human/channel IDs, names, labels, agent IDs and participant/involvement matches do not authorize admission. No title, last-message or activity-summary projection.
- Read descendants only with `spawnedBy` anchored to an admitted parent; never scan independent specialist conversations. Admit only `main`, `dev-builder`, `dev-ui`, `dev-content`, `dev-scout`, `dev-review`, `dev-qa`, `dev-security`, with explicit spawn provenance and matching parent key **and parent instance ID**. Validate creator/default agent ownership against that admitted parent, or the authorized human profile. A child reassigned to another human or an ambiguously assigned agent is excluded. Private/draft, incognito, background/system, denied and missing visibility/sharing evidence are excluded at every level.
- Query `sessions.usage` separately with each admitted key and agent, `groupBy: instance`, Zurich date range and `mode: specific`. Deduplicate aliases by **agent + instance**, not instance ID alone or a family rollup. Re-list and compare exact membership/aliases, normalized ownership, creator provenance, parent-instance linkage and visibility before publication; recheck reporting identity as well.
- Visibility remains enforced by the authenticated human API context, not the CLI's broad machine authority. No visibility expansion, Gateway permission changes, transcript endpoint, raw database read, account-wide usage API or external provider request is permitted. An ACL or identity refusal is a blocker, never a reason to bypass it. Discord sender IDs are **not** Gateway profile IDs: only a supported verified channel link or an explicit human-approved profile assignment can establish the configured person. The channel-link reader requires administrator authority; do not enumerate unrelated people or escalate to it as a fallback.

All mode publishes **token/cost/model/per-agent aggregates only**, never conversation text, titles, task summaries, commands or private references (not even opaque per-conversation IDs). All-mode activity/task details, named skill reads and agent-run count charts are explicitly unavailable; `requests: []`, `tasks: null`, `skillDaily: null`, `agentRunDaily: null` are not zero-use claims. Approved static agent/skill descriptions remain distinct from observed accounting. The collector empties the observer allowlist in this mode rather than widening prospective observation to other conversations; reverting scoped mode restores verified admission at the next collection. The public boundary independently withholds detail if an all-mode snapshot accidentally contains old scoped activity.

“All conversations” means all **visible retained current instances**, across channels and projects, not complete lifetime history. Deleted, rotated, invisible, unattributed, private and lineage-unverifiable records cannot be reconstructed. Previously shared/machine-attributed roots are not guessed into human ownership. The scope badge and notes explicitly label retained history **partial**. Lookback remains the configured 30 days by default (1–366 supported). Paging is bounded at 20 pages of 100 per query, 2,000 admitted aliases; crossing a bound, invalid cursor, instance/membership changes, unavailable usage or API failure fails collection and retains the prior snapshot. The existing 80-query daily split budget remains: model-day totals survive, missing splits remain null. Unknown costs are null, not free; normalized totals do not add cache twice. Per-agent partitions recombine with the same null semantics.

### Separate human-profile mode (not activated)

The human-profile all-conversations mode remains unactivated and is separate from the installation aggregate mode deployed below. **Human-profile activation is blocked:** the current local CLI reporting context cannot resolve `users.self`; no verified Discord-sender-to-human-profile binding has been established. The prior broad-context 49-instance dry run is not evidence of authorized human coverage and must not be published. Minimum clarification: the authorized person's verified Gateway profile ID and an identity-bearing reporting context for that same person. The numeric sender ID, operating-system account and shared Owner profile are not substitutes. No privileged fallback was attempted. Once those are verified, merge both `"scopeMode": "all-conversations"` and `"conversationProfileId": "<verified-authorized-profile-id>"`, preserving every existing key/path and private 0600 permissions. Do not replace the config wholesale or change Gateway auth just to make this collector work.

Only after the identity/authority blocker is resolved through a supported authorized context, reviewing source/tests and making that human-authorized merge (these are deferred owner steps, not performed here):

~~~sh
cd ~/hsg-battle-arena/usage-dashboard
npm test
systemctl --user start afp-usage-collect.service
systemctl --user status afp-usage-collect.service
# After successful collection, load the updated HTTP projection/static assets:
systemctl --user restart afp-usage.service
node scripts/smoke.mjs https://afp.mclement.ch
~~~

Check anonymous `https://afp.mclement.ch/usage/api/usage`: `scopeMode` must be `all-conversations`, the scope must say retained partial history, and tasks/skillDaily/agentRunDaily must be null with no recent request records or private references. Reload already-open tabs. A failed collection intentionally leaves the previous project's label/data intact; do not describe it as activated until the new mode is actually served. Revert by merging `"scopeMode": "scoped"` and repeating collection/web-service refresh. Never restart the Gateway. No deployment, private config write, service restart or scheduler change was performed as part of this implementation.

## Installation aggregate mode (deployed)

The owner-authorized installation mode merges only `"scopeMode": "installation"` into the existing private configuration, retaining its other fields, paths, credentials and 0600 permissions. It uses the supported read-only `usage.cost` API with `agentScope: "all"`, the configured Zurich date range and 30-day lookback. It does not require or infer a human profile, discover conversations, read transcripts or expand permissions. A private backup is retained before activation.

Public usage contains daily installation-wide token/cost totals across all configured agents and retained history, including chat, delegation and background work. Model, per-agent, session, request, task and named-skill attribution are unavailable: those detail fields are null or empty, never guessed. The installation UI shows a compact aggregate-source explanation instead of unsupported model, skill or agent charts; daily installation token totals remain available under Installation tokens. The top-right running-agent status is independent of aggregate usage. The active-agent endpoint is a separate names-only live registry observation, not usage attribution. `status: "ok"` with an empty list means verified idle; `status: "unavailable"` means unknown, not idle. Only explicitly running active records count; queued/recently used sessions do not. The source is cached for at most 10 seconds with a 4-second timeout and 15-second age bound; the visible UI polls every 5 seconds.

Initial installation activation on 2026-10-13 used the existing collector service and restarted only `afp-usage.service` after validating a successful installation snapshot. An initial pending aggregate cache failed closed, preserved the prior snapshot, and caused private configuration rollback; activation succeeded after the supported cache became usable. Following independent security review, the integrated on-demand reader and official Graft export were deployed at **16:51:51 CEST on 2026-10-13** by restarting only `afp-usage.service`. The existing unit and PATH drop-in were inspected and preserved. No configuration, timer, Gateway, tunnel, DNS or auth changes were made; the five-minute collector remains the sole backup writer. Neither path is realtime token streaming. Reload already-open tabs to load the deployed polling code.

Post-deployment verification passed **192/192 tests**, JavaScript syntax checks and the anonymous public smoke script. Two public usage responses, requested five seconds after the preceding response finished, recorded 30-day totals of **155,163,616 tokens at 16:53:20.850 CEST** and **155,363,921 tokens at 16:53:26.641 CEST** (+200,305 tokens in 5.791 seconds); today’s totals changed from 73,722,595 to 73,922,900 and the accounting revision changed. Sampling stopped at that actual accounting change, not at a timestamp-only update. HTTP response wall times were 1,454 and 789 ms; server attempt-to-successful-sample intervals were 1,256 and 744 ms. These measure collection/public observation, **not provider-response completion latency**. The live status was `ok` in both responses while source status changed from `refreshing` to `fresh`; aggregate-only projection, unavailable attribution and distinct sample/report/latest-rollup clocks were verified. Supported Gateway caching (up to 30 seconds), rollup lag and provider completion still bound freshness; latest rollup refresh is not an all-agent completeness watermark. Failure/degraded/loading, timestamp preservation and retry semantics passed source/frontend tests; production failures were not deliberately induced.

Concurrent normal active-agent reads stayed `ok` with the names-only dev-builder observation. A bounded six-request mixed-endpoint probe returned six HTTP 200 responses in 103 ms, with no unavailable status; those probe reads reused the source cache, not six new CLI children. Before restart, service cgroup current/peak memory was 21,983,232 / 130,957,312 bytes; after public verification it was 26,755,072 / 133,832,704 bytes (25.5 / 127.6 MiB), below the unchanged 256 MiB limit. All memory.events counters, including max/oom/oom_kill, remained zero and NRestarts stayed zero. This is bounded observed behavior, not a long-running load guarantee.

Public HTML, JavaScript, CSS, favicon, sanitized graph and official iframe export matched the source bytes; strict parent CSP and exact iframe script/style hashes plus SAMEORIGIN framing matched the handler. Private/config/source/raw-wiring and removed auth routes returned 404. An earlier active-agent check lacked the CLI PATH; the preserved existing 10-openclaw-path.conf drop-in supplies it now without an environment edit. Rendered iframe/top-right-list interaction remains unverified: one bounded post-deployment managed Chromium open attempt timed out, as earlier attempts had, with no isolation changes or repeated retries. HTTP byte/CSP checks and frontend tests are not rendered interaction proof.

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

### Skill and agent count charts

Overview and the Skills/Agents pages include ranked count bars (top 8), accessible tables (all observed entities), and links to filtered daily detail. Today/7/30 days use Zurich calendar dates intersected with snapshot coverage; query parameters preserve dates through details, refresh and Back/Forward. Model filters intentionally do not apply to these counts.

- **Skills:** deduplicated successful named instruction-read observer events across the already-selected scoped sessions, grouped by name and observer date. Repeated genuine reads count separately. These are not workflow executions, start only at observer installation, and retain the observer's key-only/best-effort limits. The catalogue still describes the root agent; counted reads can come from any admitted scoped session. No observation means unavailable, not a zero-use claim.
- **Agents:** distinct exact-instance audit run identities with at least one agent lifecycle event. Start/finish and duplicate receipts count once; tool-only groups do not count. A run is placed on its latest retained audit-observation date, matching recent activity dating, not snapshot sampling time. All retained groups are counted before the recent activity list's 100-row cap. These are observed runs, not sessions, tasks, provider requests, or all-time usage. Configured agents without evidence are not added as zero bars.
- Pagination/validation/observer-read gaps mark counts as partial known lower bounds. Available means the collection was usable, not historically complete. Older v1 snapshots without daily extensions show explicitly snapshot-wide skill counts and unavailable agent counts; timestamps of last skill reads are never used to guess historical daily counts.

The additive public fields are allowlisted daily aggregates only: skillDaily (name/date/count), agentRunDaily (safe agent ID/date/count), and coverage.usageCharts availability flags. No event IDs, private instance IDs, session keys, paths, task text, or raw transcript content are added.

### Graft code graph

The Graft sidebar embeds the **official @nanonets/graft 0.21.1 `viz --export` viewer** from `graft-integration/viewer/index.html`, fed only the sanitized structural `graph.json` (currently 25 supported JavaScript files, 328 nodes, 885 internal links). Code and Outline tabs are native Graft interactions; the custom `viewer.js` is retained for existing tests but no longer mounted in the dashboard. No battle game exists yet. See [graph provenance, safety and refresh instructions](graft-integration/README.md). The snapshot is static and ignores usage filters. The top-right active-agent list is separate: names only from `/usage/api/active-agents`, visible-tab polling every 5 seconds, with idle, unknown and stale statuses. Installation aggregate mode renders total tokens while explicitly withholding unavailable session, request and model counts.

**Backend integration is implemented:** `src/server.mjs` preloads the fixed export and `src/handler.mjs` serves `/usage/graft/viewer/index.html` through an exact GET/HEAD asset route, never the dashboard-shell fallback. The parent retains its strict CSP with `frame-src 'self'`. The iframe response uses `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`, exact per-export SHA-256 hashes for inline scripts/style blocks, and `style-src-attr 'unsafe-inline'` only for the official viewer's dynamic style attributes. Script attributes, connections and other asset sources remain denied in the iframe. Graft input directories and raw wiring files are not served.
