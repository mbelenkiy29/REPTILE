# Build log: REPTILE

Built 2026-10-04 by /replica-build on a **fake data layer** (`web/src/lib/data`): in-memory seed data behind the same function
signatures the Drizzle layer will have, plus fake sign-in and a fake GitHub install. Every screen was written fresh from
`recon.md` and `design/`. There were no Greptile screenshots to compare against (recon couldn't reach greptile.com), so the
layouts follow the recon inventory, not measured references.

Done means every definition-of-done box is checked: all states, 390 and 1440 wide, keyboard reachable, no console errors,
our own copy, features.csv updated, screenshot in `clone-screens/`. "Partial" means the screen is done but a feature behind it
needs the backend.

| ID | screen | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| S01 | Sign in | done (fake auth) | real OAuth and email links (Auth.js) | — |
| S02 | Connect a code host | done (fake install) | real GitHub App redirect; GitLab/GHE are "coming soon" | — |
| S03 | GitHub App install | not built, by design | GitHub's own page; we register our own app | — |
| S04 | Link installation | done (fake installations) | real `GET /user/installations` check | — |
| S05 | Repositories | done | — | Mobile: a 6-column table hid the toggle; status moves under the name below 640px |
| S06 | Repository detail | done | real indexer status | Repo override vs org defaults needed a clear "customize / go back" model |
| S07 | Review settings | done | the pipeline that applies strictness and comment types | Saving goes through the reptile.json schema so the dashboard and files can't drift |
| S08 | Rules | done | rule enforcement and learning jobs | — |
| S09 | Knowledge base | done (view + edit) | generation from the code | — |
| S10 | Analytics | done | real data | Status colours failed the palette validator for charts (danger↔warning colour-blind ΔE 3.1); switched to a validated one-hue ordinal ramp. The tile and table had two different "fixed" definitions; unified |
| S11 | Review history | done | real reviews | Same mobile column issue as S05 |
| S12 | Members | done | invite emails and the accept-invite page | — |
| S13 | Billing | done (fake checkout) | Stripe Checkout, portal, metering | Lint caught `Date.now()` in render; trial days moved into the data layer |
| S14 | Integrations | done (fake connect) | real OAuth to each tool and using their context | — |
| S15 | API keys | done | the API and CLI the keys are for | — |
| S16 | Config file checker | done | — | zod reports unknown keys on the parent object, so line numbers were missing; caught by the flow test, fixed, unit-tested |
| S17 | Summary comment | partial: renderer + dashboard preview | posting and editing on GitHub | — |
| S18 | Inline comment | partial: renderer + preview | diff-position anchoring and posting | — |
| S19 | Check run | partial: title/conclusion logic | check-run API | — |
| S20 | Marketing landing | not built | belongs to /replica-launch | — |

Extra pages not in the recon inventory: review detail (`/reviews/[id]`), fix-with-your-agent prompt pages (`/fix/...`),
new organization, not-found and error boundaries, and `/design`.

## Second pass: gaps from /replica-diff (2026-10-04)

| ID | screen / area | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| S15 | API keys | done | the CLI itself (could) | — The page promised an `npm install -g reptile-cli` that doesn't exist; it now shows `curl` calls to the two read endpoints the keys actually work with |
| S13 | Billing: Free plan | done | — | "free" already meant "canceled subscription" in the Stripe mapping; Free is `plan = free` with `billing_status = none`, so a canceled Team org stays paused until an admin picks Free. New states: trial ended / canceled with "Continue on Free" (one-person orgs only), Free active, free allowance used |
| S12 | Members on Free | done | — | invites and invite acceptance are refused on Free (one person); the page says why instead of showing Invite |
| — | Learning from review comments | done | — | `feedback.finding_id` was required; human comments belong to a PR and a file, not a finding (migration 0005). Only people with write access, 20+ characters, no bots, deduplicated by comment id |

Checks after this pass: 93 vitest, e2e 96 passed + 3 expected failures (open S3s), 56/56 screen states, 4 flow scripts.
Parity: 91.2 → 92.9 (both remaining *should* rows done; everything left is *could*).

## Bigger than it looked

- **The product is the backend.** Almost every must-have is "partial": the screens and the pure review logic are done, but
  automatic reviews, indexing, comments on GitHub and learning all need the GitHub App, a worker and the model pipeline. The
  dashboard alone doesn't deliver the core value. `/replica-backend` is the critical path, and the review pipeline will be
  the largest single piece.
- **Mobile tables.** Dense tables don't fit at 390px. The pattern used: secondary columns hide below `sm`, key status moves
  under the primary cell, and the scroll wrapper is a focusable labelled region.
- **Chart colours.** The design's status colours can't double as chart series. Chart tokens were added (`chart-1`,
  `sev-p0..2`) and validated in both themes.

## Checks (all green at the last run)

- `npm test`: 23 unit tests (config precedence, validation, review filters, GitHub markdown, fingerprints)
- `node scripts/screens.mjs`: 26 screen states × 2 widths, with axe WCAG 2.2 AA, console errors and overflow (52/52)
- `node scripts/slice.mjs`: the core loop, sign in → new org → connect → link → reviews → review → run again → result, in 11 clicks
- `node scripts/config-flow.mjs`: S07 by keyboard only, S16, S08, S06
- `node scripts/org-flow.mjs`: S12, S15, S14, S13, S09, S10
- `npm run lint`, `tsc --noEmit`, `next build`: clean

The scripts need the app running with the dev panel: `SHOW_DESIGN=1 npx next start -p 3100` (from `web/`, after `npm run build`).
