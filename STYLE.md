# C7 Case Files — style rules

This app's own rulebook. It is not shared with any other project, and no
other project's rulebook applies here. When a build makes a design decision
that isn't covered below, add it here so the next build doesn't undo it.

---

## 1. Ground

Dark, always. Not a light theme with the colours inverted — designed dark.

```
--ink-0   #101216   page
--ink-1   #171a1f   panels, rails, grouped areas
--ink-2   #1e2229   raised rows, cards, inputs
--ink-3   #262b33   hover, chips, pressed
--line    #2b313a   used sparingly, mostly as a 1px inset shadow
--text    #e8e6e1
--text-2  #a7adb8
--text-3  #6f7783
--brass   #d9a54a   the accent — actions, the current thing, "sourced"
--teal    #5fb3a6   links between things, secondary tags
--green   #6faa6f   corroborated
--amber   #d9a54a   single-sourced, needs work
--red     #c96a5a   disputed, contradicted, dead
--violet  #8f86c9   master numbers, historical subjects
```

Group things with **background tone and space**, not with borders. If you
find yourself drawing a box, try a tone change first. No nested boxes. No
card inside a card.

## 2. Type

- Body and UI: **Public Sans** (fallback: system-ui)
- Titles and names: **Newsreader** (fallback: Georgia, serif) — this is what
  makes it feel like a research tool rather than a dashboard
- All numbers, dates, times, codes, hashes: **JetBrains Mono**
- Handwriting on the cork board only: **Caveat**

Section labels are 10px, uppercase, letter-spaced, `--text-3`. Page titles
are slim, left-aligned, never centred, never huge.

Numbers are mono everywhere. A date, a count, a percentage, a life path, a
timestamp — all mono. It's how the eye finds data on a dense page.

## 3. Density

Desktop is dense on purpose — this is a tool for looking at a lot at once.
Tight rows, small gaps, tables over scattered cards, information tessellated
rather than spread out.

Mobile is the opposite: one clean column, generous touch targets, nothing
smaller than 44px that can be tapped. Design mobile first, then let the
desktop version use the space.

Pages are full-bleed to the edges. No capped content width, no page-card, no
outer frame. Panels stretch; the background does the grouping.

## 4. The bar row

Any percentage, quantity or proportion uses the same row:

`short label (left) · rounded horizontal bar (middle) · value (right)`

Bar is 5px tall, 3px radius, track `--ink-3`. Colour by meaning: green
healthy, brass low, red empty. Never a pie chart for this.

## 5. Indicators

**Colour says how sure. Form says what it is.** This is the rule the whole
app hangs on — never encode identity in hue alone.

| Form | Meaning |
|---|---|
| filled disc | life path |
| open ring | personal year |
| double ring | master number 11 / 22 / 33 |
| twelve-spoke wheel, one sector filled | animal year (element as hub letter) |
| square, three capitals | sun sign |
| half token | born on a cusp, or near the lunar new year |

| Colour | Meaning |
|---|---|
| brass | sourced |
| grey | drafted, not yet sourced |
| hollow outline | unknown |
| red ring | contradicted |

Relations are drawn **on the connecting line**, never on the card: two
slashes = clash, triangle = trine, linked rings = harmony, equals sign = same
sign, dashed with a question mark = one of the two birth years is unsettled.

Ceilings: three tokens on a card, four on a node, two bands on a timeline. A
third band is allowed but warned about.

An indicator is **never omitted because data is missing**. Hollow token,
always.

## 6. Honesty, as a design rule

These are visual rules, not just policy — they change what gets drawn.

- Missing data gets a visible empty state that says what is missing and what
  would fill it. Never a blank space, never a plausible-looking guess.
- Drafted things look drafted: grey token, "drafted" stamp, no contribution
  to any bar.
- Every observed count is rendered beside its expected count. A lone number
  is not allowed in a pattern panel.
- Sources carry their kind on their face — state record, hostile,
  dramatisation. A dramatisation is visually storable and visually incapable
  of raising confidence.

## 7. Motion

Almost none. A 120ms fade on panel changes, nothing on hover except colour.
This is a reading tool; movement is noise.

## 8. Empty states

Every list, panel and chart has one written for it, and it says three
things: what is missing, why the app can't fill it, and the one action that
would.

## 9. Decisions made during the build (not in the original brief)

- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48px. One scale, used
  everywhere, no one-off values.
- **Radius scale:** 4px for chips/tokens/inputs, 8px for panels/cards. Two
  sizes only.
- **Focus ring:** 2px solid `--brass` with 2px offset, on every focusable
  element, keyboard and pointer alike — this is a data-entry tool, focus
  must always be legible.
- **Nav:** left rail on desktop (icons + labels, collapsible to icons-only
  under 1200px viewport width), bottom tab bar on mobile (≤640px). Nav
  labels always shown at ≥640px; icon-only nav is never the only cue.
- **Header save state:** lives top-right on desktop, top-center strip on
  mobile. Three states only — `saved` (text-3), `saving…` (brass, pulsing
  120ms fade loop), `unsaved changes` (amber). A failed write turns it red
  and it stays red until a save succeeds — no auto-retry that could hide the
  failure.
- **Confidence bars:** 0–39 red, 40–69 amber, 70–100 green — thresholds
  reused everywhere a confidence number is drawn (subject timeline, review
  queue, relationship lines).
- **Modals:** none. Every edit happens inline or in a slide-in drawer from
  the right edge (full-screen sheet from the bottom on mobile). No dialog
  boxes floating over a dimmed backdrop — it breaks the "reading tool, not a
  dashboard" feeling.
- **Tables:** on desktop, dense tables use 32px row height, mono for every
  numeric/date column, `--ink-2` zebra on even rows only (no border between
  rows — tone does the separating per the ground rule).
- **Cork board texture:** a subtle repeating radial-gradient noise on
  `--ink-1`, not an image asset — keeps the app dependency-free and the
  board still reads as "cork" through colour/texture alone, not literalism.
- **String on the board:** a thin `--text-3` line (SVG), brass where it
  meets a sourced card, dashed where it meets a drafted one — same
  sourced/drafted colour law as every other indicator.
- **Motion exceptions (approved 2026-09-01):** the Review page is allowed
  two moves beyond §7's near-none rule — a short card deal-in as claims
  advance, and the "CASE REVIEWED" stamp slam when the queue clears. Both
  are disabled under `prefers-reduced-motion`. Nothing else moves.
- **Review card accents (2026-09-01):** each drafted claim carries its
  kind's colour as a left stripe + glyph chip — birth `--green`, death
  `--red`, marriage brass, move `--teal`, business `--violet`.
- **Case rail block (2026-09-01):** the current case lives at the top of
  the nav rail as a brass-accented block that is also the case switcher
  (with an inline "+ New case…" row). On icon-rail and mobile widths the
  topbar chip carries the case name instead — named exactly once at any
  width. Switching a case lands on that case's Dashboard.
- **Smallest text: 10px.** Uppercase micro-labels (eyebrows, tab bar,
  field labels, table headers) bottom out at 10px — nothing renders at 9px
  or below.
- **Dense-list gap: 2px (blessed 2026-09-01).** Dense row lists (case
  list, drafted queue, attention lists) use a 2px stack gap — an official
  eighth step below the spacing scale, for lists where tone (not space)
  separates rows. Not for cards, panels or forms.
- **No browser popups either (enforced 2026-09-01).** `prompt()`,
  `confirm()` and `alert()` count as modals and are banned along with
  dialog boxes. The three replacement patterns live in `js/ui.js`:
  destructive buttons use a two-tap arm-then-act (button turns red, asks
  once, resets in 5s); name entry uses an inline mini-form in place
  (Enter submits, Escape cancels); refusals and validation messages render
  as an inline note under the control they refuse. Drawers follow the same
  convention (2026-09-02): Enter in any single-line field fires the
  drawer's primary button — a typed value must never be lost because the
  wrong key was pressed.
- **Cases home cards (2026-09-02).** A card is a picture (96px band on
  desktop; a 72px left column on phones, one card per row) over the
  name; badges are chips that appear only when earned; faces are round
  (`.face`) with brass initials until a picture loads. The profile's tab
  strip is a horizontally scrollable row of text tabs, brass underline
  on the active one, no icons. The topbar back control is a bare ←,
  shown only inside a case.
