# Emoji reactions release — 2026-11-08

Feature commit: 4ecb2cc on feat/emoji-reactions. Deployed at https://afp.mclement.ch/game/. Hub description and /game/ link verified publicly.

- Reviewed feature targeted suite: 62 passed, 0 failed.
- Production-baseline full suite: 315 passed, 0 failed, 11 optional-browser skips.
- Tested merged deployment: 327 passed, 0 failed, 11 optional-browser skips.
- Chromium merged deployment smoke: 10 checks passed, five real reaction POSTs 200, zero page errors. Covers Groups waiting-team delivery to presenter/both teams, Friend both directions/both screens, mobile nonoverlap, aggregation/fixed expiry and post-action connection continuity.
- Hub suite: 27 passed.
- Public HTTPS smoke: passed Groups six emojis, server cooldown 429, inactive-team reaction, vote and SSE reaction delivery; Friend host/guest; Bot exclusion; disabled setting; assets.

Deployment preserved existing uncommitted production audio/countdown/3D changes using a hash-guarded three-way merge, not replacement from this clean feature branch. Those unrelated changes are not included in this feature commit. Production-only dance-off asset test received a scoped entrypoint cache-key assertion update. Game and hub services restarted; existing in-memory rooms were cleared.

No physical classroom-phone or complete native-audio matrix claim. Reconnect regression verified in unit/integration probes, not automated network-disruption browser testing.
