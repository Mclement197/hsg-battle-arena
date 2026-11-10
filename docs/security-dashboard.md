# Security dashboard integration

The public read-only dashboard is /security/ with /security/api/summary. The existing host imports security-dashboard/src/handler.mjs. No mutation or raw-artifact endpoints exist. See [README](../security-dashboard/README.md), [API](../security-dashboard/API.md), [RUNBOOK](../security-dashboard/RUNBOOK.md) and [requirements](../security-dashboard/REQUIREMENTS.md).

## Execution and parser correctness

Real dependency, secret, SAST, runtime, test and scoped coverage sources are implemented. Completion is not a clean-security claim. Missing/failed sources remain explicit, earn no category weight and cannot verify incident resolution.

The ten pinned upstream rules run on original files. Known grammar failures receive one bounded scanner-only compatibility pass with syntax/executable-AST proof and original UTF-8 positions. Inline suppression directives are disabled in both passes, including directives embedded in import metadata. Only exact rule/path/original spans deduplicate; distinct same-line findings survive. Original parse errors remain in private evidence, and any unresolved parser/scanner issue degrades the run. No source exclusions or rule weakening are used to raise the score.

Coverage remains Node V8/LCOV for security-dashboard/src only, not repository-wide security assurance. Statements remain N/A. The existing coverage UI and scope labels are retained. Runtime findings require private owner review; no access/configuration changes or upgrades are automatic.

## Remediation and independent review

The only proposed automatic fix is bounded permission tightening of named private scan artifacts. It requires a complete baseline, reviewed tests, complete rescan, journaled before/after and guarded own-edit rollback. Directory/file descriptor anchoring rejects symlinked or replaced run/journal parents before unsafe path traversal. The design does not claim isolation from a hostile same-OS-user account.

Activation remains on independent-review HOLD. This correction pass does not execute live remediation, change schedules, restart services, commit or publish. Deployment-specific commands, job identity and runtime posture remain in owner-local records, not publication files.

## Scheduler evidence

The supported display contract is unknown/stale/enabled/disabled, not a hardcoded authorization block. Only verified private scheduler readback can assert enabled state; private job identity and arbitrary payloads are not published. Missing/malformed/future evidence is unknown. Evidence older than 24h becomes stale and clears current enabled/next-run claims. Projected cron timestamps are not evidence.

Because the 24h TTL is shorter than a twice-weekly cadence, scan-time refresh is insufficient. A separately authorized main-owned observer is proposed: one authenticated exact-job readback per 12h maximum, 30s deadline, atomic owner-only evidence replacement only on success. Failures leave records stale. No observer or scheduler change is installed here; stale between scan days remains honest until that mechanism exists.

## Verification boundary

Tests include real scanner suppression/occurrence regressions, invalid-parent and ancestor-swap containment probes, failed-verification rollback, incident lifecycle, scoring/freshness, nested public projection and HTTP/read-only behavior. Fresh scan artifacts must match ledger/archive/public IDs. A long-lived host needs a separately authorized reload to serve changed backend imports; matching scan IDs alone do not prove the new scheduling contract or rendered browser UI is live.
