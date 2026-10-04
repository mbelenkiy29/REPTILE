# Countersign: brand

The clone was called REPTILE while it was being built. That name is one letter from *Greptile* and means the same
thing, which fails the "confusingly similar in sound, look or meaning" test, so it is gone from the product. The
GitHub repository is still named `REPTILE`; renaming it is the owner's call (GitHub keeps redirects from the old name).

## 1. The name

Angle (from `fixes.md`): **predictable bills**, supported by **the outside reviewer that catches what your agent
missed**.

20 candidates:

| style | candidates |
| --- | --- |
| descriptive | Fairdiff, Plainreview, Flatreview, Capped |
| compound | Diffwise, Mergewell, Patchmark, Linecheck, Reviewcap |
| invented | Revo, Kodal, Velta, Nyra |
| metaphor | Countersign, Plumb, Keel, Ledger, Tally |
| verb | Vouch, Vet |

Cut, and why:

- **Plumb**: already a verification tool for coding agents, the same category (web check, 2026-10-04:
  [Product Hunt](https://www.producthunt.com/p/plumb), [hunted.space](https://hunted.space/product/plumb)).
- **Velta**: one letter from Velt, a developer-tools company whose product is comments in apps (web check,
  2026-10-04: [Velt profile](https://www.everydev.ai/developers/velt)).
- **Kodal**: too close to Kodus, an AI code review tool seen in the review research.
- **Vet**: an existing dependency-vetting CLI. **Keel**: an existing Kubernetes tool. **Ledger, Tally**: large
  existing brands. These four are from memory and were not re-checked.
- **Capped, Flatreview, Plainreview, Reviewcap, Linecheck, Revo, Nyra, Vouch**: too generic to register, or nothing
  to do with the angle.

The 5 that went to the checks: **Countersign, Fairdiff, Mergewell, Diffwise, Patchmark**.

**Chosen: Countersign** (the owner picked it on 2026-10-04). A countersignature is the second signature that confirms
the first, which is the product: an outside reviewer signing off on what your agent or teammate wrote. It is a real
word used for something it doesn't describe, which makes a strong mark. It is easy to spell after hearing it once, and
nothing in it echoes reptiles, grep, tiles or "G".

### Checks

Screening, not legal clearance. Before you spend money on the name, a trademark lawyer should run a full search.
From this environment, every register, WHOIS and handle lookup was blocked by the network policy; only the web search
worked. So most rows say **to run**.

| check | Countersign | Fairdiff | Mergewell | Diffwise | Patchmark |
| --- | --- | --- | --- | --- | --- |
| US trademark (tmsearch.uspto.gov, classes 9 and 42) | to run | to run | to run | to run | to run |
| EU trademark (EUIPO eSearch or TMview) | to run | to run | to run | to run | to run |
| Canada (ised-isde.canada.ca) | to run | to run | to run | to run | to run |
| global (WIPO Global Brand Database) | to run | to run | to run | to run | to run |
| domain (.com, .dev; `whois`) | to run | to run | to run | to run | to run |
| App Store and Google Play | to run | to run | to run | to run | to run |
| handles (X, Instagram, TikTok, GitHub) | to run | to run | to run | to run | to run |
| the web ("name" + code review) | 2026-10-04: no code review product found ([search](#web-searches)) | 2026-10-04: none found | 2026-10-04: none found | 2026-10-04: none found; several "Diff-" AI reviewers exist (Diff Hound, DiffAid, Diffity) | 2026-10-04: none found; "Patched" (AI dev automation) exists |

Risks to look at first for Countersign:

- It is an ordinary English word, so the .com is likely taken and there may be marks for it in other classes
  (finance, e-signature, legal). What matters is classes 9 and 42 for software, and anything in e-signature software,
  which is close enough to confuse. Fallback domains: countersign.dev, getcountersign.com, countersign.app.
- If the US search turns up a live mark for software in class 9 or 42, go back to Fairdiff. It is the most likely to
  be free, and it says the angle.

<a id="web-searches"></a>Web searches (2026-10-04): "Countersign" code review, "Fairdiff" software, "Mergewell" code
review, "Diffwise" code review AI, "Patchmark" software developer tool, "Plumb" AI code review tool, "Velta" app
software AI.

## 2. Palette

Greptile's brand is green: a green logo mark (an eye, a tile and a "G" in one) with DM Sans, Anybody and Space Mono
([greptile.com/design](https://www.greptile.com/design),
[brand refresh post](https://www.greptile.com/blog/brand-refresh); read through web search, since the pages themselves
are blocked here). Countersign's primary is a **signature-ink violet**, a different hue family from green. It isn't
next to Greptile's blues either. Type stays Geist, which is none of Greptile's three fonts.

Only the accent roles changed; every other token keeps its neutral value. The token names are the ones
`/replica-design` set up.

| role | light | dark |
| --- | --- | --- |
| accent | `#5b2fc4` | `#b49cff` |
| accent-hover | `#4a249f` | `#c6b4ff` |
| accent-soft | `#f2edfc` | `#211a3d` |
| focus | `#5b2fc4` | `#b49cff` |

`python3 replica/design/contrast.py`: **26 pairs, 0 failing AA** in light and in dark. The email button colour in
`web/src/lib/email/templates.ts` was updated to match.

Not done: Greptile's exact brand hexes are not in `brand.json` yet, because its design page can't be read from here.
Copy them from greptile.com/design into `colors` and re-run the sweep.

## 3. Logo brief

- **Idea:** the second signature. A check mark drawn over a signature line: someone else read this and signed it.
- **Mark type:** symbol plus wordmark. The symbol must stand alone as the app icon and the favicon.
- **Must work** at 16px (the favicon: the check alone has to read, the line can drop out) and at 1024px.
- **Colour:** ink violet `#5b2fc4` with white; a one-colour version in `#12161c` and in white.
- **Deliverables:** SVG (symbol, wordmark, lockup), a 1024x1024 app icon with no transparency, a favicon set (SVG,
  32px PNG, 180px Apple touch icon), and a 1200x630 social image.
- **Must not resemble Greptile's mark:** no eye, no tile or tessellation, no reptile, scale or lizard shapes, no "G",
  and no green. Put Greptile's logo next to every draft and check.
- **Interim mark (in the app now):** a check over a short line in an ink-violet rounded square
  (`web/src/app/icon.svg`, `web/src/components/logo.tsx`). It's a placeholder, not the final logo.

## 4. Voice

**Plain, exact, calm.**

- **Plain**, not casual: short words and sentences, no slang or jokes.
- **Exact**, not pedantic: give the number, the limit, what is counted and what isn't, and stop there.
- **Calm**, not cold: no hype, exclamation marks or urgency, but always say what happens next.

| do | don't |
| --- | --- |
| "The review couldn't finish and no credit was used." | "Oops! Something went wrong 😬" |
| "Reviews pause and nothing is charged." | "Don't lose access, upgrade now!" |
| "usually within a few minutes" | "instantly", "lightning-fast" |
| "Countersign comments on pull requests and never pushes code." | "Countersign supercharges your workflow" |
| "React 👍 or 👎 to tune future reviews" | puns on signing ("Sign here!", "Signed, sealed, delivered") |

Rule from `fixes.md` F6: the score or a clean review is never presented as an approval. Countersign reviews; people
approve.

### The 10 most-seen strings, rewritten

| where | before | after |
| --- | --- | --- |
| page description (`layout.tsx`) | AI code review for pull requests, with your whole codebase as context. | A second reviewer on every pull request, reading your whole codebase. |
| sign-in subtitle | Code review on every pull request, with your whole codebase as context. | A second reviewer on every pull request, reading your whole codebase. |
| onboarding intro | …installs as an app on your GitHub account or organization. You pick which repositories it can read; it comments on pull requests and never pushes code. | Countersign installs as a GitHub App. You choose which repositories it can read. It comments on pull requests and never pushes code. |
| repositories empty state | Install the GitHub App on an account or organization to start reviewing pull requests. | Install the GitHub App on an account or organization. Reviews start with the next pull request. |
| reviews empty state | Open a pull request on a repository with reviews turned on. The first review shows up here within a few minutes. | Open a pull request on a repository with reviews on. Its review appears here, usually within a few minutes. |
| inline comment footer (on GitHub) | 👍 / 👎 to teach REPTILE | React 👍 or 👎 to tune future reviews |
| review failed (on GitHub) | The review couldn't finish. Comment @reptile on the pull request to try again; no credit was used. | The review couldn't finish and no credit was used. Comment @countersign on the pull request to try again. |
| invite email | REPTILE reviews your team's pull requests with the whole codebase as context. | Countersign reviews your team's pull requests against the whole codebase and comments on what could break. |
| trial-ending email | When it ends, reviews pause. Your settings, rules and history stay, and pick up where they left off when you choose a plan. | When it ends, reviews pause and nothing is charged. Your settings, rules and history stay until you choose a plan. |
| account deleted | Your account and its data are gone. Thanks for trying REPTILE. | Your account and its data have been deleted. Thanks for trying Countersign. |

## 5. The rename and the sweep

Renamed everywhere in `web/` (58 files):

- product name, page titles, check-run titles, emails and the GitHub summary marker (`<!-- countersign:summary -->`)
- the `@countersign` mention and the default app slug
- the repository config file: `countersign.json` and `.countersign/config.json`
- environment variables: `COUNTERSIGN_API_KEY`, `COUNTERSIGN_GIT_BASE`
- the API key prefix: `csk_`, was `rpt_`
- the package name, `countersign-web`
- the local database names: `countersign` and `countersign_test`

The stock create-next-app favicon (Vercel's) was replaced with `icon.svg`, and the auth proxy now lets it through for
signed-out visitors. Before this fix, it redirected to sign-in.

`python3 .claude/skills/replica-brand/sweep.py web --config replica/brand.json`: **Clean.** `.claude/` is clean too.
A sweep of the whole repo reports only `HANDOFF.md`, a planning note that has to name Greptile, the same reason
`replica/` is skipped.

Checked after the rename (2026-10-04): `tsc` and `eslint` clean, 93 of 93 unit tests, 106 of 106 end-to-end tests
(including the 3 expected-failure repros for the open S3 bugs). One run had an intermittent browser-navigation abort in
F01-E5; it passed on a clean re-run. Checked by eye: sign-in page and app shell in light and dark, favicon, page title
("Sign in · Countersign").

Still to do by hand:

- [ ] Add Greptile's brand hexes to `brand.json` `colors` and re-run the sweep.
- [ ] Run the trademark, domain, store and handle checks above; buy the domain only after the US search is clear.
- [ ] Commission the logo from the brief; replace `icon.svg` and the interim mark.
- [ ] The social image (1200x630) does not exist yet; `/replica-launch` makes it with the landing page.
- [ ] Register the GitHub App as "Countersign" (slug `countersign`) when it's created for production.
- [ ] `replica/clone-screens/` still shows the old name and colour; regenerate with `node scripts/screens.mjs` before
      using them anywhere.

Next: `/replica-launch`.
