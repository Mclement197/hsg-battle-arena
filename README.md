# HSG Battle Arena

A browser-based, turn-based classroom battle game inspired by Pokémon and themed around student life at the University of St. Gallen (HSG). Two audience teams vote from their phones to control original fighters on the projector.

## Project documents

- [Project proposal](docs/project-proposal.md) — the group’s proposed experience, features, and gameplay.
- [Repository rules](AGENTS.md) — working agreements for contributors and coding assistants.
- [Development workflow](docs/development-workflow.md) — project organization, scoped assignments, review, and integration.

## Current status

A dependency-free, browser-based local bot demo lives in `game/web/`. It has connected menu, arena selection, fighter selection, battle, and game-over screens. The `usage-dashboard/` is separate dashboard work, not part of the game.

### Preview and check

From the repository root, run `python3 -m http.server 8000 --directory game/web` and open `http://localhost:8000/` in a browser. A local HTTP server is needed for ES modules. Run `node --test game/web/test/*.test.mjs` to check combat rules and `node --check game/web/app.mjs` for syntax. There is no bundler or build step.

**Scope:** This is a local, single-player demonstration with a simple bot and replaceable geometric character/arena placeholders. It does not claim to implement the proposed classroom voting game or online friend rooms. No game server or multiplayer protocol exists in this repository; Play vs Friend deliberately explains that it is unavailable instead of simulating a connection. The web demo has no server environment variables.

The local rules (20-damage attack, 32-damage all-nighter with 8 self-damage, half-damage guard, 18-HP coffee) are demo assumptions, not agreed classroom rules. Before an authoritative multiplayer implementation, settle turn timing, team balancing, disconnect/late-join behavior, no-vote turns, reset, and move values.

## Group

Mathis Clement, Lara Mileto, Noam Méndez, Nolan Naeser, Kay Wullschleger, Philippe Verdeja.
