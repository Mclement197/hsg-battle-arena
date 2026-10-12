# Repository working rules

These rules apply throughout this repository to coding assistants and contributors.

## Scope and source of truth

- Read this file, README.md, and docs/project-proposal.md before making changes. Inspect relevant existing code and the Git working tree first.
- Treat the proposal as the agreed product direction. Distinguish proposed features from implemented and verified behavior.
- Work only on the requested task. Do not start implementing the game, choose a stack, add services, or deploy merely because the proposal describes them.
- Record consequential architecture decisions and unresolved product questions in project documentation when implementation is requested. Do not silently invent requirements.

## Implementation approach

- Prefer the smallest maintainable solution. Check suitable maintained libraries and existing solutions before building infrastructure from scratch. Avoid unnecessary dependencies, paid services, and premature abstractions.
- Keep game rules separate from presentation and transport so they can be tested independently.
- Preserve the core experience: browser-only phone participation, projector host view, two teams, alternating timed votes, changeable votes before cutoff, random tie-breaking, and a zero-HP victory condition.
- Before implementing gameplay, clarify undecided rules such as no-vote turns, team balancing, disconnects, late joins, match reset, move values, and timer duration.
- For multiplayer implementation, use an authoritative game state and validate actions at the trusted boundary. Clients must not determine HP, resolve turns, impersonate the host, vote for the wrong team, or submit votes after the cutoff.
- Design for a live classroom: clear connection states, reconnect behavior, readable projector UI, and large mobile touch targets.
- Use original or appropriately licensed characters, artwork, and audio. Pokémon is an inspiration, not permission to copy its assets. Record third-party attribution as needed.

## Quality and verification

- Keep changes focused, readable, and consistent with the selected stack once one exists.
- Add tests with gameplay logic: vote replacement, cutoff handling, tied results, no-vote behavior, alternating turns, HP bounds, and victory. Make random/time-dependent logic controllable in tests.
- Test host and student flows together, including multiple clients and reconnects, when those flows exist. Verify phone-sized layouts and projector readability.
- Provide a presenter mute control; account for browser audio activation restrictions, keyboard accessibility, and reduced-motion preferences.
- Run the project’s documented checks before committing. Until tooling exists, review Markdown, local links, and git diff --check; never claim unrun tests passed.
- Update README.md with real setup, development, test, and build commands when implementation introduces them. Document required environment variable names without values.

## Security and privacy

- Never commit credentials, API tokens, private keys, local environment files, personal assistant memory, or unrelated computer files. Use placeholders in examples.
- Collect only information needed for participation; treat nicknames and all client input as untrusted. Avoid logging unnecessary participant data.
- Do not introduce analytics, persistent personal data storage, or external integrations without an explicit requirement.

## Git and collaboration

- Preserve others’ edits. Never reset, overwrite, or discard unrelated work. Do not rewrite shared history or force-push without explicit authorization.
- Stage specific intended files, inspect the staged diff, and use descriptive commits. Check the branch and remote before pushing.
- Keep generated files, dependency directories, build outputs, and local settings out of Git. Commit the appropriate dependency lockfile when a package manager is selected.
- At handoff, summarize what changed, checks actually run, and any blockers. Give the commit or pull-request reference when available.
