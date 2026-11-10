# Bounded security operations

Resolve the checkout from trusted scheduler/operator configuration, never from scanner output. Read repository AGENTS.md and inspect this runner before execution after changes. Deployment paths, job identity, delivery and runtime posture belong in owner-local private operations records, not this document.

## Scan-only

From the repository root run exactly:

    node security-dashboard/src/scan.mjs

Use a 600-second external deadline and collect process completion. The script derives its project root from its own location, not the caller's working directory. npm audit sends dependency names/versions to the public advisory service; source scanning stays local. No paid service or arbitrary repository lifecycle script is invoked.

Exit 0 means sources completed, not that findings are safe. Exit 2 means degraded monitoring: report AUTOMATION_FAILED with the actual sanitized failure. Never retry indefinitely or steal a stale lock. Verify the printed run ID against the private ledger, run archive and the deployed read-only summary API. Report counts, actual measured scope and unavailable sources; never publish raw candidates, source text or private paths.

## Parser and suppression policy

Ten pinned upstream rules run on the original inventory. Inline nosem/nosemgrep/noopengrep directives are **not honored**: both passes use --disable-nosem. This also prevents scanner-only import metadata comments from manufacturing suppression. There is no finding-text-driven suppression or acceptance.

Known decimal-ternary and static import-attribute grammar defects receive one bounded second pass over private copies. Acorn verifies syntax and executable-AST equivalence; static attributes remain scanner-visible, not runtime import-policy analysis. Inserted tokens carry an original UTF-8 byte-offset/column map. Merge only identical rule/path/original spans; distinct same-line occurrences remain distinct. Original errors and proof persist privately. Unsupported/invalid/changed/unscanned files or remaining errors stay degraded. No source files or security rules are excluded to improve scores.

## Remediation — independent review HOLD

Do not schedule or run live remediation until independent review approves the containment changes. The reviewed entrypoint is:

    node security-dashboard/src/remediate.mjs

Its only proposed allowlist tightens permissions on named private project scan artifacts. It never edits application sources, dependencies, credentials, access policy, firewall/SSH/Gateway configuration, services or schedules. No shell commands, file targets or code are derived from finding text. Unsupported findings remain approval-required.

At most one attempt and 100 metadata edits; bounded inventory/file sizes; one exclusive lock spans baseline, edits, tests, rescan and rollback. Complete baseline, all reviewed dashboard tests and a complete rescan are mandatory. Journals record before/after IDs and modes. On verification failure, roll back only unchanged own inode/content/mode identities and perform one rollback verification scan. Concurrent changes require approval, not overwrite. A no-supported-fix result is not a clean assessment.

## Artifact containment and limits

Artifacts remain outside the repository and HTTP allowlists, owner-only by default. Before lock creation, chmod, journal writes or scans, validate existing run/journal directories and all root ancestors without following symlinks. Directory descriptors anchor creation, atomic rename, append, inspection and chmod; child report destinations use held file descriptors. Directory walkers receive a traversable descriptor-root suffix, not a bare descriptor symlink. Each real secret scan must first detect a redacted synthetic positive control through the same directory/report protocol; failure degrades the secrets source. The control is not a project finding. Root/ancestor replacement is rejected on subsequent validation. Never use a symlink as an artifact directory or silently repair a failed containment check.

This Linux /proc descriptor design does not establish a hostile-same-user security boundary. An attacker with the same OS account can move anchored objects, tamper with scanners or access process descriptors. Path checks alone are not complete TOCTOU protection. Independent review and OS isolation are required for a stronger adversary; fail closed on detected identity changes. A killed process needs operator verification before lock/journal recovery.

## Scheduler evidence, not projections

The public API reloads a private scheduler.json record. Schema v1 requires source="openclaw-automations", scope="security-dashboard", a private UUID jobId, agent="dev-security", observed enabled boolean, actual verifiedAt ISO time, reviewed cron schedule {kind:"cron",expr:"0 9 * * 1,4",tz:"Europe/Zurich"}, and scheduler-reported nextRunAt ISO/null. The job identity is not published.

Missing/malformed/future evidence => unknown; >24h => stale, current enabled=null and nextRunAt=null. Never calculate next-run timestamps or advance verifiedAt without successful authenticated readback. The 24h TTL is intentionally shorter than the three/four-day scan cadence: scan-time refresh alone will go stale.

Proposed separately authorized refresh: a main-owned observer, at most once per 12h, one authenticated readback attempt with 30s deadline; validate the private bound job/scope, copy only verified scheduler fields, atomically replace the owner-only record. On failure retain old evidence and let it become stale. No refresh job is created here, no scan cadence changes, and no evidence is invented. Until configured, unknown/stale is expected between scan days. Backend module publication requires a separately authorized host reload; this task does not restart services.
