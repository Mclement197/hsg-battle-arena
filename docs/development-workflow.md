# Development workflow

## Layout and status

- `README.md`: project overview, document index, and verified setup/check commands when available.
- `AGENTS.md`: repository-wide contributor rules.
- `docs/project-proposal.md`: proposed product direction, not evidence of implemented features.
- `docs/`: keep project documentation, decisions, and unresolved product questions here.
- `usage-dashboard/`: separate existing, untracked dashboard work; it is not the game implementation. Preserve it outside game assignments.

No game implementation or technology stack has been selected. Once a stack is agreed, place source code, tests, and assets according to its conventions and document the actual layout and commands. Keep game rules separate from presentation and transport, with tests beside the relevant code or in the stack’s conventional test location. Create directories only when they contain needed work; do not scaffold empty folders or choose a stack as an organizational task.

## Assignment and integration

1. **Main coordinates:** read the repository rules and proposal, inspect the working tree, clarify open gameplay rules, and agree acceptance criteria before assigning implementation. Record consequential decisions under `docs/`.
2. **Scope each specialist:** provide the objective, relevant inputs, allowed write paths, exclusions, expected deliverable, checks, and blockers to escalate. Divide ownership to avoid overlapping edits; preserve unrelated and untracked work. Specialists return changed paths, actual check results, assumptions, and remaining risks to main.
3. **Review independently:** main assigns QA and security review separately from implementation. QA checks acceptance criteria, gameplay edge cases, multi-client/reconnect behavior, phone layouts, and projector readability as those features exist. Security review checks authoritative state, host/team authorization, input validation, vote cutoffs, privacy, and dependency risks. Reviewers report findings with evidence; fixes receive repeat checks.
4. **Main integrates:** inspect combined diffs, resolve overlap and review findings, run applicable checks, and update documentation to match verified behavior. Report remaining blockers and unrun checks. Commit, push, or deploy only within explicit authorization.

These are assignment expectations, not a claim that new content or security agents are already operational. Main must explicitly assign the needed roles for each task.

## Content and licensing

Use original HSG-themed characters, writing, artwork, and audio, or material with suitable permission. Pokémon is inspiration, not a source of reusable assets. For third-party content, record its source, author, license/permission, required attribution, and modifications under `docs/`; retain required license notices with the material. Main confirms content scope and licensing before integration. Keep credentials, personal data, and private operational configuration out of project documentation and assets.

## Verification and handoff

Until game tooling exists, review Markdown, check local links, and run `git diff --check`. Once implementation introduces tooling, document real setup, test, and build commands in the README and run the relevant checks. Add deterministic gameplay tests for vote replacement, cutoff handling, ties, no-vote rules, alternating turns, HP bounds, and victory; verify host/student flows together when available.

Every handoff states exact changed paths, commands actually run and their outcomes, and unresolved assumptions or blockers. Proposed features and planned checks must remain distinct from implemented behavior and completed verification.
