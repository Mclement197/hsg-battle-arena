# Usage dashboard review — 12 October 2026

Method: two independent assessments, with a UI review by the UI specialist and deterministic/browser evidence by QA. The source baseline was f9566ed. The requested scope is refinement and implementation, not a replacement brand.

## Findings

The original interface has a coherent navy/blue/light visual identity, responsible accounting caveats, and good initial accessibility intent. Its central failure is that it stops at summaries: navigation scrolls through one document, agents are missing, and skills and activity cannot be explored meaningfully.

| Priority | Finding | Required change |
|---|---|---|
| P1 | Navigation looks like page navigation but only scrolls | Separate Overview, Models, Agents, Skills and Activity, with direct links and Back/Forward |
| P1 | Skills and activity appear interesting but are inert | Real links, sourced descriptions, useful detail views and clear return paths |
| P1 | Configured agents are absent | A directory and profiles, separate from measured project activity |
| P2 | Filters appear global while their scope differs | Page-local controls, explicit coverage and one-step reset |
| P2 | Similar rows have inconsistent click behavior | Consistent links for destinations, buttons for actions, hover and keyboard focus |

## Source-based heuristic assessment

These are provisional review scores, not measurements from a live usability study.

| Heuristic | Score / 4 |
|---|---:|
| System status | 3 |
| Real-world match | 2 |
| Control and freedom | 2 |
| Consistency | 2 |
| Error prevention | 3 |
| Recognition over recall | 2 |
| Flexibility and efficiency | 1 |
| Aesthetic and minimalist design | 3 |
| Error recovery | 3 |
| Help and documentation | 2 |
| **Total** | **23 / 40** |

Power users encounter needless scrolling and weak drill-downs. Keyboard users need genuine links, not click handlers attached to table rows. Phone users need five labeled destinations and detail views that fit the screen without a cramped modal.

## Deterministic and browser evidence

The initial Impeccable scan found one advisory, em-dash-overuse: 12 matches in the HTML. Most were intentional unavailable/loading values, so the prose warning was judged a false positive. The source-file scan could not resolve the deployment-relative stylesheet URL; color and custom-property coverage was incomplete.

Managed Chromium failed to start, so this review has no live screenshots, interaction proof or injected overlay. No visual-only server was started. Source inspection is not a substitute for a browser pass; release evidence must retain that distinction.

## Data decisions

The public site must not expose raw prompts, task bodies, transcripts, command text, local paths, private session keys, credentials, or complete skill instructions.

Supported read-only reporting supplies configured agents, per-agent partitioning of existing scoped usage, a root-agent skill catalogue, and verified session lifecycle plus audit observations. It does not supply an authoritative complete task narrative or actual per-run model/token attribution.

Public names, roles, skill descriptions and task summaries are reviewed in data/public-metadata.json. Skill approvals bind to a digest of the installed description; changed or unreviewed descriptions are withheld. Task approvals bind to an opaque exact-instance identifier, not a reused session label. Unavailable facts remain null. Session model selection is labeled separately from actual historical run usage.

## Implementation acceptance

The detailed interaction and release criteria are in DESIGN.md. This review is the baseline; tests and live HTTP/browser evidence in the delivery record determine what was actually verified after implementation.

## Release disposition

The five prioritized navigation/detail issues were implemented. A separate read-only release review found three P2 correctness defects and no concrete P0/P1 publication or XSS issue in its inspected scope. All three were corrected: model detail dates now match the selected range, task chronology uses lifecycle or actual linked-run evidence rather than sampling time, and unknown counts propagate through task totals instead of becoming zero. Undated work is explicitly excluded from date-filtered lists.

Verification on 12 October 2026:

- 110 automated tests passed, including routing, Back/Forward, detail links, search reset, null accounting, scoped joins, public metadata approvals and nested field projection. Frontend tests use a minimal DOM harness, not a rendered browser.
- Syntax checks and Git whitespace checks passed.
- A real snapshot generated at 13:24:25 UTC contained 8 configured agents, 137 reviewed skill descriptions, 3 retained task workstreams and 26 observed runs. Per-agent accounting recombined exactly to the project totals. Counts reflect that snapshot, not a complete historical task inventory.
- Local and public HTTPS smoke checks passed: five pages, anonymous usage access, removed authentication endpoints and inaccessible private files. Five representative detail URLs returned 200.
- Deployed HTML, JavaScript and CSS matched the tested source byte-for-byte by SHA-256.
- The final detector retained the placeholder-em-dash advisory and deployment-relative stylesheet resolution limitation described above.
- No live visual or phone/laptop rendering sign-off: managed Chromium could not start, and no Gateway desktop provider was available. No sandbox or navigation security control was weakened.
