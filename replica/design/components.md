# Components: REPTILE

Built from the recon component list (`recon.md`, section Components) and the screens S01–S19.
Tokens: `tokens.json` (light) and `tokens.dark.json` (dark). Both pass AA (`contrast.py`, 26 pairs each, 0 failures).
Code: `web/src/components/ui/*`. Living reference: `/design` (dev only, or with `SHOW_DESIGN=1`).

## Ground rules

- **Measured vs. inferred.** The recon network blocked greptile.com, so nothing here was measured from
  Greptile screenshots. The roles, density and patterns follow the recon's screen and component inventory
  and the norms of developer dashboards (dense tables, 13–14px body, dark mode expected).
  Once `replica/screens/` has references, re-check spacing and type against them, then use `/replica-diff`.
- **Nothing of theirs.** Icons are from Lucide (ISC). Fonts are Geist and Geist Mono (SIL OFL), loaded from the
  `geist` package, not Google. The accent is a neutral placeholder indigo; Greptile's brand colour is recorded only
  as the role `accent`. /replica-brand replaces the values. There are no illustrations; empty states use
  an icon in a soft circle. Every label in the code is written fresh.
- **No opacity for "disabled-looking" content that must stay readable** (it breaks contrast); use a dashed border and the surface colour instead, and keep opacity only on truly disabled controls.
- **Provider marks.** Lucide has no GitHub/GitLab logos. Provider cards use a generic icon until /replica-brand
  adds the official marks under each provider's brand rules (GitHub's "Sign in with GitHub" rules allow it).
- **Tokens only.** Components use `bg-surface text-muted border-border rounded-md shadow-card`, never hex. Light and
  dark switch through `data-theme` on `<html>` (or follow the OS when it is unset).

## Foundations

| token | values | notes |
| --- | --- | --- |
| colour roles | bg, surface, surface-sunken, border, border-strong, border-input, text, text-muted, accent, accent-hover, accent-soft, on-accent, danger(+soft, on-), warning(+soft), success(+soft), info(+soft), focus, overlay | 7 greys per theme: bg, surface, sunken, border, border-strong, border-input, muted |
| type | xs 12/16 · sm 13/20 · base 14/22 · md 16/24 · lg 20/28 · xl 28/34 · display 44/48 | Body is 14 (dense dashboard). Code and ids use `font-mono` |
| space | 4px base: 0 2 4 6 8 12 16 20 24 32 40 48 64 | Tailwind `--spacing: 4px`, so `p-4` = 16px |
| radius | sm 4 · md 6 · lg 10 · xl 14 · pill | Controls md, cards lg, modals xl |
| shadow | card, pop | Cards mostly rely on the border; pop is for menus and dialogs |
| motion | fast 120ms · base 180ms · slow 280ms, ease (.2,.8,.2,1) | `prefers-reduced-motion` disables transforms |
| layout | sidebar 240 / 56 collapsed · header 52 · content max 1200 · form max 640 | breakpoints sm 640, md 768, lg 1024, xl 1280. Below lg, the sidebar becomes a drawer |

## Specs

```
Button                                                       web/src/components/ui/button.tsx
  variants  primary, secondary, ghost, danger, link
  sizes     sm 28px, md 32px, lg 40px, icon (square, same heights)
  states    default, hover, active, focus-visible (2px ring focus, 2px offset), disabled, loading
  tokens    primary: bg accent → accent-hover, text on-accent · secondary: bg bg, border border-strong, text fg
            ghost: transparent, hover surface · danger: bg danger, text on-danger · radius md · font sm/500
  a11y      real <button>; loading sets aria-busy, disables it, keeps the label and adds a spinner (aria-hidden)
  used on   all
```

```
Input, Textarea, Field (label + hint + error)                 input.tsx, field.tsx
  sizes     md 32px (inputs), textarea min 80px, resizes vertically
  states    default, hover (border-strong), focus-visible (ring), disabled, invalid (border danger + message), read-only
  tokens    bg bg, border border-input, text fg, placeholder text-muted, radius md
  a11y      <label for>; hint and error tied by aria-describedby; invalid → aria-invalid; the error has an icon too, not just colour
  used on   S01, S07, S08, S12, S15, S16
```

```
Switch                                                        switch.tsx (Radix Switch)
  sizes     sm (36×20)
  states    off, on, focus-visible, disabled, saving (thumb dimmed, aria-busy)
  tokens    track off border-strong / on accent, thumb bg
  a11y      role=switch with aria-checked; label is required (visible, or aria-label in table rows: "Review PRs in owner/repo")
  used on   S05 (per repo review), S07 (drafts, summary options)
```

```
SegmentedControl                                              segmented.tsx (Radix ToggleGroup, single)
  use       strictness 1 / 2 / 3, with a one-line description of the chosen level underneath
  states    selected, hover, focus-visible, disabled
  tokens    track surface-sunken + border, selected bg + shadow-card + text fg, others text-muted
  a11y      arrow keys move between options, one tab stop; never empty (selecting the current option does nothing)
  used on   S07
```

```
ChipInput (tag input)                                         chip-input.tsx
  use       labels, authors, branches, ignore globs, path scopes
  behaviour Enter or comma adds; Backspace on an empty input removes the last chip; paste splits on commas/newlines;
            no duplicates; optional validate(value) → error text
  states    empty (placeholder), filled, invalid entry (error under the field, entry stays in the input), disabled
  tokens    container like Input; chip bg surface-sunken, border, font-mono xs, remove button ghost
  a11y      each chip's remove button has aria-label "Remove <value>"; additions and removals announced via aria-live=polite
  used on   S07, S08
```

```
Select                                                        select.tsx (Radix Select)
  states    closed, open, focus-visible, disabled, invalid
  a11y      Radix listbox semantics, type-ahead
  used on   S04 (org), S10 (filters), S12 (role)
```

```
DropdownMenu                                                  dropdown-menu.tsx (Radix)
  use       row actions (⋯), org switcher, user menu
  states    item default, highlighted, disabled, destructive (text danger)
  tokens    bg bg, border, shadow-pop, radius lg, item radius md
  a11y      roving focus, Esc closes, focus returns to the trigger
  used on   shell, S05, S08, S12, S15
```

```
Dialog / ConfirmDialog / SecretDialog                         dialog.tsx (Radix Dialog / AlertDialog)
  sizes     sm 400, md 520, lg 720
  variants  form, confirm-danger (AlertDialog, the destructive button is not autofocused), one-time secret
            (copy button, "I've saved it" closes it, then the secret is gone)
  states    open, submitting (buttons loading, Esc still closes), error (inline Alert at the top)
  tokens    overlay at 50% opacity, panel bg, radius xl, shadow-pop
  a11y      focus trapped, title is required, the description is linked, Esc and overlay click close (except while a form is dirty)
  used on   S08 (rule editor), S12 (invite), S15 (create key), destructive confirms
```

```
Tabs                                                          tabs.tsx (Radix Tabs)
  use       settings sections, repo detail (Overview / Reviews / Settings / Knowledge)
  states    selected (2px accent underline, text fg), hover, focus-visible
  used on   S06, S07, S09
```

```
Tooltip                                                       tooltip.tsx (Radix)
  use       icon-only buttons, truncated repo names, explaining a metric
  rule      never the only place important information lives (not for touch)
```

```
DataTable                                                     table.tsx
  parts     Table, THead, TRow, TH (sortable: button + aria-sort), TD, TableEmpty, TableSkeleton
  states    loading (5 skeleton rows), empty (EmptyState in the table body), filled, error (Alert above), row hover
  density   row 44px, cell px-3, numbers right-aligned in tabular-nums, ids/SHAs in mono
  mobile    below md the table scrolls horizontally inside its card; the first column stays fixed
  used on   S05, S11, S12, S15
```

```
StatusPill                                                    badge.tsx
  values    queued (neutral), indexing/running (info + spinner dot), completed (success), failed (danger),
            skipped (neutral, with the reason in a tooltip), disabled (neutral, dashed), superseded (neutral)
  tokens    soft bg + strong text of the same role, radius pill, xs/500
  a11y      text label always shown; the dot is decorative
  used on   S05, S06, S11, S19-mirror
```

```
SeverityBadge / ConfidenceScore                               badge.tsx
  severity  P0 Critical (danger), P1 High (warning), P2 Medium (info); text is "P0" plus the word in an sr-only span
  score     1–5 as five segments + "3/5"; colour 1–2 danger, 3 warning, 4–5 success; the label is always printed
  used on   S11, review detail; the same rules apply to the markdown we post on GitHub (S17/S18, see below)
```

```
Card / StatTile / UsageMeter                                  card.tsx, stat-tile.tsx, usage-meter.tsx
  Card      bg bg, border, radius lg, optional header (title md/600 + actions) and footer
  StatTile  label (sm, muted), value (xl, tabular-nums), delta (↑/↓ + %, success or danger, with the sign written out),
            loading skeleton
  UsageMeter label, "used / included" figures, bar (accent; warning ≥ 80%; danger > 100% with an overage note), role=meter
  used on   S10, S13, S06
```

```
Chart                                                         (built with S10 in /replica-build, using the dataviz skill)
  types     line (reviews per day, merge time), stacked bar (findings by severity)
  rules     series colours from roles (accent, info, warning, danger); no colour-only legend; empty and loading
            states match StatTile; the table/CSV export doubles as the accessible alternative
```

```
EmptyState                                                    empty-state.tsx
  parts     icon in a soft circle, title (md/600), one sentence, primary action, optional secondary link
  copy      (ours) S05: "No repositories yet" / "Install the GitHub App on an org to start reviewing pull requests."
            S08: "No rules yet" / "Write a rule in plain English and it gets checked on every review."
            S10: "Nothing to chart yet" / "Numbers show up after the first reviewed pull request."
            S11: "No reviews yet" / "Open a pull request on an enabled repository."
```

```
Alert / Banner                                                alert.tsx
  variants  info, success, warning, danger; optional action; dismissible banners remember that per user
  a11y      danger and warning use role=alert only when they appear in response to an action; static ones use role=status
  used on   trial ending (S13), index failed (S06), config invalid (S16), app suspended (S05)
```

```
Toast                                                         toaster.tsx (Sonner)
  variants  success, error, info; at most 3; bottom-right (bottom-centre on mobile); 4s, errors 8s, hover pauses
  a11y      aria-live polite (errors assertive); never the only record of an error that needs action
  used on   save settings, toggle repo, copy, invite sent
```

```
CodeBlock / CopyButton                                        code-block.tsx
  use       reptile.json export, API keys, CLI install, mermaid source
  states    copy idle → "Copied" (2s) → idle; long lines scroll horizontally
  tokens    bg surface-sunken, border, font-mono sm, radius md
```

```
ProviderCard                                                  provider-card.tsx
  values    GitHub Cloud, GitHub Enterprise (soon), GitLab (soon)
  states    disconnected (Connect), connecting (loading), connected (account login + Manage), error (Alert + Retry),
            coming soon (dashed border + surface bg, button disabled; text stays full contrast)
  used on   S02, S14
```

```
AppShell (Sidebar + Header + OrgSwitcher + ThemeToggle)        app-shell.tsx, theme-toggle.tsx
  sidebar   240px; sections Repositories, Reviews, Rules, Analytics, Knowledge; Settings group (Review, Members, Billing,
            API keys, Integrations); active item bg surface, text fg, 2px accent bar; collapses to a 56px icon rail (state saved)
  header    52px: page title, breadcrumbs, right side: docs link, theme toggle, user menu
  mobile    < lg: header shows a menu button, the sidebar opens as a drawer (Dialog), focus trapped
  a11y      <nav aria-label="Main">, aria-current="page", a "Skip to content" link first in the tab order
  theme     ThemeToggle cycles system → light → dark and stores it in localStorage (in try/catch); an inline script sets
            data-theme before paint, so there is no flash
```

```
Skeleton                                                      skeleton.tsx
  bg border (visible in both themes; sunken is darker than bg in dark mode), pulse; static under prefers-reduced-motion
```

## GitHub-side surfaces (S17 summary, S18 inline, S19 check)

These are markdown, not UI, but they are the screens users see most, so they have a spec too:

- **Summary comment.** The first line is the verdict and score, e.g. `**3/5 · Safe to merge after fixes**`. Then a `### Findings`
  list sorted P0→P2, each linking to its inline comment. Then `<details>` blocks for "Files changed", "Sequence diagram" (a ```mermaid
  block) and "What we checked". An HTML comment marker `<!-- reptile:summary -->` lets us find and edit our own comment.
- **Inline comment.** The first line is `**P1** · Logic · <short title>`, then 1–3 sentences, then a ```suggestion block when there is a fix,
  then the footer links `Fix with your agent` · `👍 / 👎 to teach REPTILE`.
- **Severity in markdown.** GitHub renders no custom colours, so severity is always written out (P0/P1/P2). We don't use emoji-only
  signals.
- **Check run title.** e.g. `REPTILE · 2 findings (1 P0)`. The conclusion is `neutral` when there are P0s, `success` otherwise (see architecture).
