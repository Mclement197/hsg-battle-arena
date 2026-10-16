# HSG Battle Arena
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users and purpose
HSG students play campus-themed turn-based fights in a browser. Friends duel across two devices; solo players fight a bot; classroom groups vote from phones while a presenter runs a projector. Success is a complete 100-HP match, understandable commands, reliable reconnect, and replay.

## Stack
Existing plain HTML/CSS/ES modules with a Node HTTP server, authoritative engine, bearer-authenticated fetch SSE and qrcode. Retain these adequate existing solutions; no new runtime dependencies.

## Capabilities and constraints
Three separate modes: Friend (host is P1, exactly one guest P2), Bot, Groups (non-playing presenter and balanced voting teams). Four commands only: Attack, Defend, Heal, Special. Six named fighters; Luca Di Grazia is strongest overall by explicit user request. Library, Trischli and Mensa B remain the arenas. Server owns stats, HP, votes, roles, timing, cooldowns and outcomes. No credentials in URLs. Existing sessionStorage capabilities restore the same seat after reload. Room data is in memory and disappears on service restart.

## Brand commitments
User pins an arcade fighting-game roster reference: dramatic dark backdrop, angular frames, condensed italic headlines, luminous selection outline, large selected fighter preview, smaller roster portraits with four segmented stat bars. HSG forest/emerald green dominates with white accents, not reference red. All five primary screens must adopt this world. Existing original vector fighters and arena illustrations remain clearly labeled replaceable placeholders; no third-party character art is copied.

## Evidence on hand
The user supplied an arcade roster screenshot in the task. Existing implementation, proposal, engine tests, original SVG assets and self-hosted OFL Barlow fonts provide factual context. The assignment explicitly requests direct main push and live deployment after verification. Product facts above come from that assignment and repository, not a new interview.

## Accessibility
Responsive desktop and phone layouts, labeled stat numbers and units, visible focus, readable contrast, 44px minimum primary controls, optional gesture-enabled sound, and reduced-motion support.

## Supplied photographic background
User additionally requests the supplied HSG Learning Center building photograph as the main-menu background, with translucent green tint applied only to the background. Keep the stepped glass facade recognizable at desktop and phone sizes and all three mode actions readable. Shipping optimized source: public/assets/hsg-learning-center.webp; source provenance: art/hsg-learning-center-source.md.
