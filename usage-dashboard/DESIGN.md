# AFP Usage interface

## Purpose and current scope

A public, read-only interface for understanding AFP AI work: usage by model, the configured agent team, what skills do, and the work recorded in recent activity. This utility is separate from the game and the OpenClaw control interface. No password is required.

The October 12 review asks for a refinement of the existing interface, not a new brand: clearer hierarchy, separate pages, predictable click targets, and useful details. Preserve the navy navigation, warm light canvas, blue actions, system sans, and quiet data-focused appearance. Avoid decorative dashboards, duplicated summaries, and walls of identical cards.

## Information architecture

- /usage: concise overview and links into the four workspaces.
- /usage/models: model comparison, selected-model detail, daily usage and attributable token buckets.
- /usage/agents: configured agent directory and agent detail; configuration is not a claim that an agent is currently running.
- /usage/skills: searchable descriptions and skill detail, with observed instruction reads and their coverage explained.
- /usage/activity: searchable work history and task/run details with the metadata actually recorded.

Use query parameters for selections and filters. Actual anchors provide deep links and browser Back/Forward. Direct page loads must work. Unknown pages return 404, not a blanket app fallback.

## Interaction rules

- Metrics and named entities that invite drilling down are actual links, with a visible destination/action hint, hover and keyboard-focus states.
- Model, agent, skill and activity selections reveal useful details, not repeated summary copy. Provide a clear return to the list without losing filters.
- Cross-links connect relevant work, agents, models and skills only where the data establishes a relationship. Do not infer per-task costs from session totals.
- Search has a clear action and recoverable no-results state. Filters show their state and have a visible reset.
- Use progressive inline/detail pages, not unnecessary modals. Status is never encoded by color alone.
- Refresh updates the snapshot while retaining the current page/selection. Keep the last valid data on refresh failure and mark it stale.

## Truth and privacy

Only validated public fields leave the service. Never publish raw prompts, transcripts, command bodies, filesystem paths, private session keys, credentials, or complete agent/skill instruction bodies. Titles and descriptions need a safe, documented source; inferred activity stays labeled as inferred. Missing metrics remain unavailable, not zero. Distinguish configured model defaults from observed model usage, and agent-run outcomes from completed user tasks.

The configured directories may be wider than the measured AFP accounting scope; say so. Skills describe available instructions, and observed reads do not prove workflow execution. Dates use Europe/Zurich. Show snapshot time and coverage near the data they qualify.

## Layout and accessibility

Operate mode: scanability and familiarity over novelty. Use a fixed rem type scale, tabular numerals for measurements, clear heading hierarchy, and comfortable 44px targets. Desktop uses persistent navigation and readable list/detail composition. Phone layouts use five labeled navigation destinations, stacked detail content and contained scrolling for genuine data tables, without horizontal page overflow.

Keyboard users can reach every advertised action. Use native controls, visible focus, appropriate current-page state and polite loading/status announcements. Respect reduced motion. Do not load external fonts, analytics, or decorative assets.

## Release checks

- Each page supports direct load, navigation, Back/Forward and refresh.
- Overview links and every named detail link resolve to actual content or an explicit unavailable state.
- Actual configured agents and real skill descriptions appear when metadata is available.
- Activity details identify recorded agent, status, time and work evidence without claiming unsupported attribution.
- Empty, unavailable, malformed and stale data remain understandable and recoverable.
- Anonymous HTTPS access remains available; private-file routes and write APIs remain inaccessible.
- Inspect phone and laptop in one bounded browser pass, batch the defects, then confirm once. A browser blocker must be recorded, never presented as visual success.
