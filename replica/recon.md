# Recon map: Greptile (web dashboard + GitHub/GitLab app)

Scope: the AI pull-request review loop. Connect GitHub, choose repos, index them,
review every PR automatically (a summary comment plus inline comments), tune it
with rules and config, have it learn from reactions, and show results in analytics.
For: REPTILE, the user's own product (assumed to be for sale as a Greptile alternative). Change this line if it is wrong.
Date: 2026-10-04

> **How this was gathered.** The session's network policy blocked `greptile.com`,
> `docs.greptile.com` and `app.greptile.com`. Everything below comes from public
> search-result extracts of Greptile's own docs, blog, changelog and pricing,
> plus third-party write-ups. Nobody logged into a Greptile account. No screenshots,
> JS bundles or network calls were captured. Dashboard screens are inferred
> from docs text, so their layout details are **medium/guess** confidence until
> someone checks them against screenshots (see `screens/README.md`).

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | docs: overview | https://www.greptile.com/docs/introduction | what Greptile is |
| 2 | docs: quickstart | https://www.greptile.com/docs/quickstart | sign up → Code Providers → install GitHub App → link org → first PR |
| 3 | docs: GitHub/GitLab integration | https://www.greptile.com/docs/integrations/github-gitlab-integration | app install, repo selection |
| 4 | docs: anatomy of a review | https://www.greptile.com/docs/code-review/first-pr-review | summary, confidence score, inline comments, P0/P1/P2 badges, suggested fixes, diagrams |
| 5 | docs: trigger config | https://www.greptile.com/docs/code-review-bot/trigger-code-review | labels, drafts, authors, branches, keywords, @greptileai |
| 6 | docs: greptile.json reference | https://www.greptile.com/docs/code-review/greptile-json-reference | strictness 1–3, commentTypes, ignorePatterns, include/exclude authors/branches, labels |
| 7 | docs: .greptile/ folder | https://www.greptile.com/docs/code-review/greptile-config-reference | per-directory config, priority over greptile.json and dashboard |
| 8 | docs: controlling nitpickiness | https://www.greptile.com/docs/code-review/controlling-nitpickiness | strictness levels |
| 9 | docs: custom context & learning | https://www.greptile.com/docs/code-review-bot/custom-context | rules, style guides, scoping by repo/path, related repos |
| 10 | docs: custom standards | https://www.greptile.com/docs/code-review/custom-standards | plain-English rules, reads CLAUDE.md/AGENTS.md/.cursorrules |
| 11 | docs: emoji reactions | https://www.greptile.com/docs/code-review-bot/emoji-reactions | 👍/👎 feedback signal |
| 12 | docs: knowledge bases | https://www.greptile.com/docs/how-greptile-works/knowledge-bases | auto-written per-repo docs: index, per-area docs, reverts |
| 13 | docs: orgs & teams | https://www.greptile.com/docs/code-review/team-setup-basics | Organization → Teams (one per GH org / GL group), Admin/Member roles |
| 14 | docs: billing & seats | https://www.greptile.com/docs/code-review-bot/billing-seats.md | seats = active developers |
| 15 | docs: developer quick ref | https://www.greptile.com/docs/developer-quick-reference | @greptileai commands, reply-to-comment Q&A |
| 16 | docs: Fix with your Agent | https://www.greptile.com/docs/integrations/fix-with-your-agent | per-comment button + "Fix All" |
| 17 | docs: CLI | https://www.greptile.com/docs/code-review/greptile-cli | `greptile review`, `-b`, `--resume` |
| 18 | docs: troubleshooting | https://www.greptile.com/docs/troubleshooting/common-issues | failure states |
| 19 | pricing (via v4 blog) | https://www.greptile.com/blog/greptile-v4 | $30/dev/mo incl. 50 reviews, $1 overage, "T-Rex" review = 3 credits |
| 20 | pricing (3rd party) | https://aicodereview.cc/blog/greptile-pricing | Free (1 dev, 50 credits), Pro, Enterprise (self-host) |
| 21 | changelog | https://www.greptile.com/changelog | Sep 2026 summary redesign, Aug 2026 v5 agent swarm, Jul 2026 security agent |
| 22 | blog: v5 | https://www.greptile.com/blog/greptile-v5 | median review 5:04 → 2:25 |
| 23 | marketing: learning | https://www.greptile.com/learning | learns from team comments and reactions |
| 24 | marketing: sequence diagrams | https://www.greptile.com/sequence-diagrams | mermaid diagram per PR |
| 25 | marketing: security check | https://greptile.com/security-check | static rules + SCA + AI |
| 26 | marketing: knowledge base | https://greptile.com/knowledge-base | living, editable docs |
| 27 | blog: MCP update | https://www.greptile.com/blog/greptile-update | MCP server, Jira/Notion/Drive context |
| 28 | public API (v2) | https://docs.greptile.com/api-reference/repositories | POST /repositories, status submitted→cloning→processing→completed, POST /query |

## Core loop

A developer opens a PR. A few minutes later a bot comment with a summary, a 1–5
confidence score and severity-ranked findings is on the PR, along with inline comments
that carry suggested fixes. The team acts on them, reacts, and re-triggers with `@greptileai`.

## Screens

Dashboard routes are guesses from docs text. `app.greptile.com/review/github` is confirmed.

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Sign up / log in | app.greptile.com/login | auth via email, Google, GitHub, GitLab | OAuth buttons, email input | default, error, magic-link sent |
| S02 | Onboarding: connect provider | first run → Code Providers | pick GitHub Cloud / GitLab / GHE | provider cards, "Connect GitHub Cloud", "Add Provider" | empty, connecting, error |
| S03 | GitHub App install (on github.com) | redirect from S02 | choose account/org, all vs. selected repos | *GitHub-owned page, do not rebuild* | n/a |
| S04 | Link org | return from S03 | pick the installed GH org and click Link → creates a Team | org dropdown, Link button | loading, linked, already-linked error |
| S05 | Repositories / review settings | /review/github | list repos, toggle review on/off per repo, see index status | table, toggles, status pill, search | empty (no repos), indexing, filled, error (index failed) |
| S06 | Repo detail | click a repo in S05 | index status, last indexed SHA, per-repo overrides, KB link | status card, settings form | indexing, completed, failed |
| S07 | Settings (org review defaults) | /review → Settings panel | strictness, comment types, triggers (labels, drafts, authors, branches), ignore patterns, summary toggles; copy/download as JSON | sliders/segmented control, chip inputs, toggles, copy/download icons | default, dirty, saved, validation error |
| S08 | Custom context / rules | Settings → Custom Context | add plain-English rules, style guides, docs; scope to repos and path globs; see learned rules | rule list, rule editor modal, scope picker | empty, filled, learned (suggested) |
| S09 | Knowledge base | repo → Knowledge Base | auto-generated index, per-area docs, reverts; editable | doc tree, markdown viewer/editor | generating, filled, edited |
| S10 | Analytics | /analytics | PRs reviewed, addressed rate, critical bugs caught, merge time, 👍/👎 ratio; filter by team/repo/author/period; export | stat tiles, line charts, filters, export | empty (no reviews yet), loading, filled |
| S11 | Reviews list / history | dashboard → Reviews (guess) | recent reviews with status, links to PR | table, status pill | empty, filled, failed review |
| S12 | Members & roles | Org settings → Members | invite, assign Admin/Member, see seats | table, invite modal, role select | empty, pending invite, filled |
| S13 | Billing | Org settings → Billing | plan, seats, credits used, overage, invoices | plan card, usage meter, Stripe portal link | free, trial (14 days), paid, over limit |
| S14 | Integrations | Settings → Integrations | connect Jira, Linear, Notion, Slack, Datadog; MCP setup | integration cards, connect buttons | disconnected, connected, error |
| S15 | API keys | Settings → API | create/revoke keys for API, CLI and MCP | key table, create modal, one-time reveal | empty, filled |
| S16 | Config validator | app.greptile.com/review (validation) | paste greptile.json / .greptile config, see errors | code editor, error list | valid, invalid |
| S17 | **PR summary comment** (on GitHub) | posted on PR open | verdict + confidence 1–5, findings sorted by severity linking to inline comments, "What we checked", sequence diagram, file-by-file table, "Fix All" | markdown comment, mermaid, collapsible sections | reviewing (placeholder), complete, no issues, updated on re-review, unresolved findings carried over |
| S18 | **Inline review comment** (on GitHub) | posted on diff lines | issue text, P0/P1/P2 badge, suggestion block, "Fix with your Agent" link | GitHub review comment, ```suggestion``` block | posted, replied-to, resolved, 👍/👎 |
| S19 | **Check run** (on GitHub) | PR Checks tab | "Greptile Review" status | GitHub check run | queued, in progress, success, neutral, failure |
| S20 | Marketing landing | greptile.com | positioning | hero, logos, demos | n/a, build our own in /replica-launch |

The GitHub-side screens S17–S19 matter most. They are what users actually look at,
and they are built as markdown and GitHub API calls, not as UI.

## Flows

```
F01 Team admin onboards and gets a first review
    S01 sign up (GitHub OAuth) -> S02 Connect GitHub -> S03 install app, pick repos
    -> S04 Link org -> S05 repos auto-enabled, indexing -> open PR on GitHub -> S17 + S18
    happy path clicks: ~6 in our UI + 3 on GitHub; the number to beat is "first review in under 5 min"
    edge: app installed on wrong org; repo very large and indexing slow; no repos selected;
          PR opened before indexing finished; user lacks org-admin on GitHub

F02 Developer receives an automatic review
    open PR (GitHub) -> S19 check "in progress" -> S17 summary + S18 inline comments
    clicks: 0
    edge: draft PR (skipped by default); author excluded; base branch not included;
          only ignored files changed; PR too large; review fails (check = failure);
          credits exhausted

F03 Developer re-triggers / converses
    push fixes -> comment "@greptileai" -> S17 updated, resolved findings drop off
    reply "@greptileai why?" on S18 -> threaded answer
    clicks: 1 comment
    edge: re-trigger while a review is running; mention on a closed PR; mention by non-member

F04 Developer applies a fix
    S18 "suggestion" -> GitHub "Commit suggestion"   OR   "Fix with your Agent" -> deep link into agent
    S17 "Fix All" -> one prompt with every finding
    edge: suggestion is out of date after a new push

F05 Team gives feedback, and the system learns
    react 👍/👎 on S18, or a human leaves review comments -> S08 shows inferred rules -> future reviews adapt
    edge: conflicting reactions; a rule learned from one noisy reviewer

F06 Admin tunes the noise level
    S07 strictness 1–3, comment types, triggers -> save
    OR commit greptile.json / .greptile/config.json (repo > dashboard priority) -> S16 validate
    edge: invalid JSON; repo file overriding the org default without anyone noticing

F07 Admin adds custom rules
    S08 "Add rule" -> text + scope (repos, globs) -> save -> next review enforces and cites it
    edge: rule matches nothing; overlapping scopes

F08 Lead reviews impact
    S10 pick period/team/repo -> read tiles and charts -> export CSV
    edge: no data yet; deleted repo

F09 Admin manages seats and billing
    S12 invite -> S13 upgrade / see credits -> Stripe portal
    edge: trial expiry; overage; seat removed mid-cycle

F10 Developer reviews locally (CLI)
    `greptile login` -> `greptile review [-b main]` -> findings in the terminal
    edge: uncommitted changes ignored; --resume an interrupted review
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger, OAuth (GitHub/GitLab/Google) | default, hover, focus, disabled, loading | all |
| Provider card | GitHub Cloud, GitHub Enterprise, GitLab | disconnected, connected, error | S02, S14 |
| Data table | sortable, with row toggles | empty, loading (skeleton), filled, error | S05, S11, S12, S15 |
| Status pill | queued, indexing/processing, completed, failed, disabled | — | S05, S06, S11 |
| Toggle switch | — | on, off, disabled, saving | S05, S07 |
| Segmented control | strictness 1/2/3 | selected | S07 |
| Chip / tag input | labels, authors, branches, globs | empty, filled, invalid | S07, S08 |
| Code editor (JSON/markdown) | read-only, editable | valid, invalid | S09, S16 |
| Modal | form, confirm-danger, one-time-secret | open, submitting, error | S08, S12, S15 |
| Stat tile | number + delta | loading, filled | S10 |
| Chart | line, bar | empty, loading, filled | S10 |
| Filter bar | period, team, repo, author | — | S10, S11 |
| Usage meter | credits used / included | normal, near limit, over | S13 |
| Sidebar nav + org switcher | — | collapsed, expanded | shell |
| Toast | success, error, info | — | all |
| Empty state | with CTA | — | S05, S08, S10, S11 |
| Severity badge (markdown) | P0, P1, P2 | — | S17, S18 |
| Confidence score (markdown) | 1–5 | — | S17 |

## Inferred data model

```
Organization  id, name, plan (free|pro|enterprise), trial_ends_at, stripe_customer_id
              evidence: S12/S13, docs "Organizations & Teams", pricing      confidence: high

User          id, email, name, avatar_url, auth_provider
Membership    org_id, user_id, role (admin|member)
              evidence: docs roles                                         confidence: high

Team          id, org_id, provider (github|gitlab|ghe), external_org_id, external_org_login,
              installation_id
              evidence: "each GitHub org or GitLab group you connect is a team"   confidence: high

Repository    id, team_id, provider_repo_id, full_name, default_branch, review_enabled (bool),
              index_status (submitted|cloning|processing|completed|failed), indexed_sha,
              files_indexed, last_indexed_at
              evidence: S05, public API GET /repositories status values    confidence: high

ReviewConfig  id, scope (org|repo|path), org_id, repo_id?, path?, strictness (1-3),
              comment_types [logic|syntax|style], include_labels, disabled_labels,
              include_authors, exclude_authors, include_branches, exclude_branches,
              ignore_patterns, review_drafts (bool), summary options (json)
              evidence: greptile.json reference, .greptile/ priority order  confidence: high (fields), medium (storage shape)

Rule          id, org_id, text, kind (rule|style_guide|doc), source (manual|learned|file:CLAUDE.md),
              repo_scope [], path_globs [], enabled, created_by
              evidence: custom context docs, learning page                 confidence: medium

PullRequest   id, repo_id, number, title, author_login, base_branch, head_sha, state, is_draft, url
              evidence: trigger filters                                    confidence: high

Review        id, pr_id, head_sha, trigger (opened|mention|label|cli|synchronize), status
              (queued|running|completed|failed|skipped), skip_reason, confidence_score (1-5),
              verdict, summary_md, diagram_mermaid, summary_comment_id, check_run_id,
              credits_used (1 | 3 for "T-Rex"), started_at, completed_at
              evidence: S17, S19, pricing credits, changelog summary redesign   confidence: medium

Finding       id, review_id, repo_id, file_path, line_start, line_end, severity (P0|P1|P2),
              type (logic|syntax|style|security), title, body_md, suggestion_patch,
              rule_id?, provider_comment_id, status (open|addressed|resolved|dismissed),
              first_seen_review_id
              evidence: S18, "unresolved findings stay in the summary until resolved"   confidence: medium

Feedback      id, finding_id, actor_login, kind (thumbs_up|thumbs_down|reply|human_comment), body
              evidence: emoji reactions docs, learning page                confidence: medium

KnowledgeDoc  id, repo_id, path (index|area/<name>|reverts), title, body_md, generated_sha,
              edited_by?, updated_at
              evidence: knowledge base docs                                confidence: medium

Integration   id, org_id, kind (jira|linear|notion|slack|datadog|gdrive), status, credentials_ref
ApiKey        id, org_id, name, hash, last_used_at, created_by
UsageEvent    id, org_id, review_id, credits, period
              evidence: S13, S14, S15, pricing                             confidence: guess (shape)

CodeChunk / Embedding  repo_id, sha, path, symbol, span, vector  (index internals)
              evidence: public API "graph plus embeddings"                 confidence: guess
```

Relationships: Organization 1-n Membership n-1 User. Organization 1-n Team 1-n Repository.
Repository 1-n PullRequest 1-n Review 1-n Finding 1-n Feedback. Organization 1-n Rule. Repository 1-n KnowledgeDoc.
ReviewConfig resolves in this order: path (.greptile/) > repo (greptile.json) > org (dashboard).

## Feature matrix

See `features.csv`. Must: 22, should: 18, could: 11, skip: 5.

## Out of scope (cannot or should not be cloned)

- **Greptile's models, prompts, eval sets and the "v5 agent swarm" internals.** We
  build our own review pipeline on a public LLM API. We do not reverse-engineer theirs.
- **The GitHub App install / OAuth pages** (S03). These belong to GitHub. We register our
  own GitHub App and use the same official flow.
- **Their learned data and knowledge bases** for customer repos.
- **Customer logos, benchmark numbers ("82% bug catch rate"), the "T-Rex" tier name, the
  mascot, the brand.** /replica-brand handles naming.
- **Enterprise compliance** (SOC 2 report, air-gapped self-host, Helm charts). These are
  certifications and ops work, not features. Revisit after there are paying customers.
- **Marketplace-style integration partnerships** (AWS Marketplace listing etc.).

## Size

Screens 20 (16 dashboard, 3 GitHub-side, 1 marketing), flows 10, entities 15.

Hard parts:
1. **Review quality.** Retrieving context across the codebase (index + embeddings + graph),
   a multi-pass LLM pipeline, dedup, severity ranking, and keeping false positives low.
   This is the whole product, and it is research, not CRUD.
2. **GitHub App plumbing.** Webhooks (pull_request, issue_comment, reactions, installation),
   check runs, review comments anchored to diff positions, suggestion blocks, rate limits,
   idempotency, and keeping summaries updated across pushes.
3. **Indexing at scale.** Cloning large repos, incremental re-index on push, a job queue,
   and per-org isolation and data retention (customer source code is sensitive).
4. Also: config precedence (.greptile/ > greptile.json > dashboard), metered credit billing
   (Stripe usage), and "learning" from reactions.

Size: **L** (a quarter) for a credible GitHub-only v1 with must + should rows.
A demo that posts summary and inline comments on PRs is **M**. Matching Greptile's
review quality is open-ended.
