# Security evidence dashboard

Public read-only route: https://afp.mclement.ch/security/ (redirect from /security). This replaces the previous manually maintained static page using the existing application origin. The old static HTML remains archived locally, not served by the live handler. No new app service, paid platform or persistent agent was introduced.

## Local checks

- npm test — deterministic incident, scoring, privacy, HTTP, lock, parser and interface regressions.
- node src/scan.mjs — bounded real scan; writes restricted local artifacts, prints only sanitized summary. Exit 2 deliberately records degraded monitoring.
- Node 24 required. Pinned Acorn 8.15.0 validates scanner compatibility views; install with npm ci --ignore-scripts. Node V8/LCOV measures lines/branches/functions for security-dashboard/src only; statements are unavailable, not estimated. No claim of repository-wide test/security coverage.

The existing hub imports src/handler.mjs. Exact assets, /security/ and /security/api/summary are GET/HEAD only. Public mutations, raw reports, arbitrary paths, query selectors and source files are denied. Arbitrary nested fields are dropped at the boundary. Secret matches and source snippets are never included, even when an upstream tool supplies them. There is no public acknowledgement, resolution, deployment or scanner-launch endpoint.

## Evidence and incident lifecycle

npm audit uses each of game, usage-dashboard, architecture-dashboard and security-dashboard lockfiles, including dev dependencies. Known advisories, vendor CVSS and CWE are ingested only when actually supplied. A CVE-specific total is N/A because npm does not consistently provide CVE identifiers.

Gitleaks 8.30.1 scans a private temporary copy of the Git-visible text working tree in the four app directories. Opengrep 1.33.0 runs ten pinned upstream JavaScript/TypeScript rules locally. Binary, ignored, vendor/assets/art/evidence/generated graph directories, >1MiB files, Git history and unrelated hosts are excluded. Scan metadata reports actual counted files. This is bounded static analysis, not exhaustive coverage or exploitation testing.

OpenClaw security audit is read-only, with no fix/deep network probe. Every returned finding, including informational observations, is retained as an incident; only check IDs/severities are retained privately and public details use reviewed category-level descriptions. The connector installed version and independently observed running executable are compared with the reviewed October 2026 vendor minimum and with each other. This is not a current advisory feed or a full OS/runtime/fleet inventory. Historical connector remediation is a clearly marked resolved report, not a score bonus.

Fingerprint = SHA-256(source, finding kind, component, scanner-stable key). Unchanged findings produce additional observations, not duplicate reports or repeat lifecycle alerts. New, changed, reopened, resolved and accepted-risk states are representable. Verified absence only resolves an open finding when the exact scoped source completed. Accepted risk does not erase a finding or remove its score penalty. There is intentionally no automatic risk acceptance or public mutation. Private ledger edits require operator review; no mutation CLI is exposed.

state.json and public.json use same-directory temp files plus atomic rename and 0600 mode; root data directory is 0700. Per-run archives and append-only observation/event records retain evidence. The exclusive lock is never silently stolen, and each external process has a deadline; source scans are memory/file-size/worker bounded. The entire scheduled run must have a 600-second deadline. Private artifacts stay outside Git and every HTTP file allowlist.

## Score v1.0.0

Security-category weights: SAST 25, dependency advisories 25, secrets 20, configuration 20. Quality weights: measured line coverage 5 and test pass rate 5. These quality metrics are not security guarantees. Each measured security category starts at 100 and loses 40/20/8/2 per active critical/high/medium/low finding, floored at zero. Accepted risks remain active for scoring. Resolved history contributes nothing. Missing/failed categories earn zero and reduce measurement confidence (the available rubric weight); no missing value is synthesized as a pass. Older than 48h halves the weighted score; older than 7d scores zero. This is a transparent local prioritization index, not CVSS or an industry certification.

## Scheduling and bounded remediation

Scheduler truth is a separate verified-readback metadata contract, not a hardcoded authorization claim or a projected next-run timestamp. Main owns updating the existing Mon/Thu 09:00 Europe/Zurich dev-security job and populating scheduler.json. Missing metadata means unknown; evidence >24h means stale, never disabled/enabled by assumption. See API.md and RUNBOOK.md. This implementation does not change jobs or restart services.

The remediation entrypoint is on independent-review HOLD. Do not activate or run live remediation until containment changes are approved. After approval, node src/remediate.mjs permits only reversible permission tightening of named project scan artifacts. It preserves all source/dirty work, holds the scan lock throughout, caps edits/attempts, requires tests and a rescan, journals before/after, and rolls back only unchanged own metadata edits. All actual unsupported security findings remain approval-required. No runtime configuration or dependency upgrades are automated. Main must obtain independent review before scheduling it. Its external deadline is 900s (scan-only remains 600s).

Inline scanner suppressions are disabled in both passes. Distinct occurrences use original UTF-8 spans and are never collapsed by line. The parser integration retains all ten rules and original file inventory. One bounded second pass uses private AST-verified compatible copies for decimal ternaries and static import attributes. Original errors and per-file proof remain in private sast.json; unresolved errors still degrade monitoring. Import attributes are preserved as scanner-visible comments, not runtime import-policy analysis; application files never change.

## Containment, publication and rollback

Root ancestors and existing run/journal directories are validated before artifact mutation. Linux directory descriptors anchor owned artifact operations; child report paths use held file descriptors. Symlinks/identity changes fail closed. This is not a security boundary against a compromised same-user account; see RUNBOOK.md for the exact limitations.

The metadata TTL is 24h, shorter than the scan cadence. A separately authorized main-owned 12-hour authenticated readback observer is proposed, not configured. It may write evidence only after a successful exact-job readback; failures leave evidence to become stale. No next-run time is calculated. Unknown/stale between scan days is expected until independent refreshing exists.

No deployment, scheduler edit or service restart is performed by this change. Long-lived host imports need separately authorized reload before new backend contracts are live. Static assets and a public 200 are not proof of updated backend imports or browser verification. Deployment identifiers, runtime posture and exact operational rollback records stay in owner-local evidence outside this repository.

Permission rollback uses the private attempt journal and changes only unchanged own inode/content/mode identities. Implementation rollback must preserve other dirty work and review current source against the scoped patch; never restore an entire stale checkout or configuration. Rule provenance/license files remain alongside the pinned rules. No paid service or scanner upgrade is introduced.
