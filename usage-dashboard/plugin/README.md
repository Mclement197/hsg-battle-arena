# AFP prospective skill instruction observer

Local native OpenClaw plugin; Node standard library only. Not installed or enabled by this change. This observes **successful named instruction-load calls**, not skill execution, compliance, or task success. There is no historical backfill and no transcript reader.

## Reviewed integration (operator only)

After security review, merge settings into existing OpenClaw config; preserve all unrelated plugin load paths, allow/deny entries, and settings. Prepare a canonical, local, private directory **outside this repository** owned by the Gateway user (directory mode 0700, files mode 0600). No symlink components, hardlinked files, network shares, or secrets belong here. The collector maintains the allowlist using atomic replacement, and reads/rotates events. The plugin does not create directories or change permissions.

Allowlist JSON: an array of exact session-key strings (objects are rejected):

~~~json
["agent:main:dashboard:project-example"]
~~~

No implicit child-session inclusion, prefix matches, global curator counts, or guessed attribution: the collector must explicitly allowlist each verified project session/child key before its first load.

Expected entry config, exactly two required absolute local paths. Map the collector’s allowlistPath directly and its skillEventsPath to the plugin’s eventsPath; do not pass the whole collector config:

~~~json
{
  "plugins": {
    "entries": {
      "afp-skill-observer": {
        "enabled": true,
        "config": {
          "allowlistPath": "/home/mathis/.config/afp-usage/sessions.json",
          "eventsPath": "/home/mathis/.config/afp-usage/skills.jsonl"
        }
      }
    }
  }
}
~~~

Schema: object, additionalProperties false, required allowlistPath/eventsPath; both strings starting '/', length 2–4096. Runtime also rejects controls, same-file paths, repository paths, unsafe permissions/ownership, symlinks, and hardlinks. Use this source directory via a **linked** local installation so its repository exclusion boundary remains correct. Copying/moving this plugin changes the inferred repository boundary and needs review.

Supported setup commands from the repository root, **documentation only, not executed**:

~~~sh
openclaw plugins install --link ./usage-dashboard/plugin --force
openclaw plugins enable afp-skill-observer
openclaw plugins inspect afp-skill-observer --runtime --json
~~~

Alternative: merge the absolute plugin directory into plugins.load.paths. Respect existing plugins.allow/plugins.deny restrictions. No conversation-access or prompt-injection grant is needed for this observing tool hook; do not grant one. Installed docs describe default hybrid config reload; no Gateway restart is requested here. Later code edits use the documented plugins reload command only when authorized.

## Observation and privacy

Registers api.on('after_tool_call', handler, { matcher: ['skills_read', 'read'] }).

- skills_read: params.name must be a valid bounded name and match successful result.details.name; details.content must exist. Code Mode skills.read invokes this real tool; the outer JavaScript is never parsed.
- read: successful text/truncated result for an absolute or ~/ path whose basename is exactly SKILL.md. Extract the **actual document's** top-level frontmatter name, not the directory name. Only simple unquoted/single-quoted/double-quoted scalar names are accepted, within an 8 KiB frontmatter bound. Relative paths, unsupported YAML, missing headers, continuation chunks without a header, and other files are skipped conservatively. This proves a skill document was read, not that it was registered/installed. A truncated result with a complete header is a partial instruction load, not proof the whole instructions were loaded.
- Valid names: [a-z0-9][a-z0-9._-]*, maximum 128 characters. Valid session keys begin agent:<agent>:<remainder>, no whitespace/control characters, maximum 500 characters.
- Missing session context is rejected. Fresh private allowlist is read for each eligible queued event; absent/malformed/unreadable allowlist fails closed. Authorization is checked immediately before append, not cached globally. A concurrent revocation can race an already-authorized append; serialize revocation with collection if this matters.
- Handler returns immediately, retains only a DTO in a bounded serial asynchronous queue, and never changes tool behavior. Logs contain fixed reason codes only, once per code per plugin instance; never exception text, paths, prompts, commands, arbitrary params, auth, or results.

Each JSONL line contains **only**:

~~~json
{ "eventId": "opaque-hash-or-uuid", "sessionKey": "agent:main:dashboard:project-example", "skill": "research", "at": "2026-10-12T11:00:00.000Z" }
~~~

- eventId: SHA-256 of sessionKey/runId/toolCallId when bounded IDs exist; otherwise random UUID. Raw IDs are not persisted. Collector should deduplicate eventId across plugin reloads/processes.
- sessionKey: exact host hook context identity, verified against collector allowlist.
- skill: exact successful installed skill name or actual read document frontmatter name.
- at: observer wall-clock UTC ISO timestamp at hook reception (not historical task/run start).

Limits: 64 KiB/1000-session allowlist, 128 pending DTOs, 4096 remembered event IDs, 32 MiB event file. New events are dropped best-effort on limits/errors; collector owns retention/rotation. Dedup cache is bounded and process-local. Separate real calls count separately, including rereads. With no call ID duplicate callbacks cannot be recognized. Pending events can be lost on shutdown/reload; there is no durability guarantee or global “all skills” coverage. A stuck local filesystem operation can stall this bounded queue but cannot block agent tools. Use one writer instance/file to avoid file-size-check races.

## Installed evidence and uncertainty

Reviewed installed OpenClaw **2026.10.2** under /home/mathis/.npm-global/lib/node_modules/openclaw (documentation/source only, no session transcript reads):

- docs/plugins/hooks.md:14–27, 142–154: typed api.on and optional ctx.sessionKey; api.pluginConfig is the supported config source.
- docs/plugins/hooks/reference.md:35–39,149: canonical matcher options and after_tool_call observing hook.
- docs/plugins/hooks.md:40–86: local package/manifest and install --link/enable commands. docs/plugins/manifest.md:21: manifest required. docs/plugins/architecture-internals/packaging.md:75–97: package.json openclaw.extensions.
- dist/channel-core-lfZRnmWl.d.ts:11112–11171: context and after-tool event fields.
- dist/module-export-BbYMQUy2.mjs:12–29: plain exported definition with register(api) supported; no SDK dependency required. dist/package-entrypoints-DCjwjOnD.mjs:3–8: .mjs supported.
- dist/openclaw-tools-Dxfbrtff.mjs:6567–6578,6611–6633: installed name lookup, instruction read, successful details {name,content}.
- dist/agent-tools.read-BolPX2yB.mjs:372–423: real read details text/truncated/not_found shapes.
- dist/code-mode-source-f8CZaGjY.mjs:381–384 maps skills.read to skillsRead; dist/code-mode-state-DRpUwJVv.mjs:642–662 maps skillsRead to skills_read via runtime.callExactId with {name}.
- dist/tool-search-DXY2nmzm.mjs:1006–1013,1037–1099 routes callExactId through executeTool; embedded adapter dist/builtin-openclaw-DkEpBBN1.mjs:20223–20225 forwards to the subscribed catalog executor.
- Same embedded source :12748–12778 wraps nested tools in subscription.runToolLifecycle; :12131–12156 calls finishToolLifecycle → handleToolExecutionEnd; :3342–3361 dispatches after_tool_call with sessionKey/toolCallId. Therefore the installed **embedded Code Mode path does emit nested tool observations**, not just the outer exec.

This is static source evidence, **not an enabled-plugin end-to-end verification**. Other harnesses, worker deployments, future releases, result sanitization/middleware, or missing context may omit/change observations; plugin fails closed. Main must verify one successful skills.read and one actual SKILL.md read in an allowlisted controlled session after authorized enablement, confirm a rejected session produces no event, then compare expected names/counts. Do not fabricate backfill or claim historical named attribution.

## Checks

~~~sh
node --test usage-dashboard/test/skill-observer.test.mjs
node --check usage-dashboard/plugin/index.mjs
node --check usage-dashboard/plugin/observer.mjs
~~~

Tests use injected in-memory I/O and do not read transcripts, create private files, modify config, or install the plugin. Real filesystem permissions/symlink enforcement and actual enabled Gateway emission remain integration-review checks.
