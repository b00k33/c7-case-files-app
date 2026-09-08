# C7 Case Files — style rules

This app's own rulebook. It is not shared with any other project, and no
other project's rulebook applies here. When a build makes a design decision
that isn't covered below, add it here so the next build doesn't undo it.

---

## 1. Ground

Two grounds, one design (2026-09-07, her words: "it looks too dark. and the
gold is too light"): **ink by night, cool white by day**. The phone's
setting picks by default; the sync drawer has Follow phone · Day · Night.
Neither ground is the other inverted — each palette is chosen so the same
token keeps the same job. `index.html` stamps `data-theme="light|dark"` on
`<html>` before first paint; `css/tokens.css` holds both palettes.

```
                 night (ink)   day (cool white)
--ink-0          #15181d       #f4f5f7    the ground (a vignette, --ground, sits behind it)
--ink-rail       #111418       #ffffff    the nav rail / top bar / phone tab bar — sunk by night, floating by day
--ink-1          #20242b       #fafbfc    panels, grouped areas
--ink-2          #2a2f38       #ffffff    raised rows, cards, inputs
--ink-3          #353b45       #e9ecf0    hover, chips, pressed
--line           #3d444f       #dfe3e8    used sparingly, mostly as a 1px inset shadow
--text           #f1eee8       #15181d
--text-2         #b9bfc9       #3f4652
--text-3         #8891a0       #636c79
--brass          #e0a33a       #287d71    the accent — actions, the current thing, "sourced". Gold by night, TEAL by day
--on-brass       #1b1e24       #ffffff    text on a brass surface
--gold           #e0a33a       #9a6a17    the life path number (and the gold tier) — the one place gold lives by day
--teal           #5fb3a6       #287d71    links between things, secondary tags
--green          #6faa6f       #2b7d44    corroborated
--amber          = brass       = gold     single-sourced, needs work
--red            #d0705e       #b8332a    disputed, contradicted, dead
--violet         #9a91d4       #6d63b3    master numbers, historical subjects
--shadow         dark, 50%     grey, 14%  the big drop shadow (drawer, search results)
```

By day `--brass` and `--teal` are the SAME hex on purpose (teal is the
accent and the link colour). So nothing may rely on brass-vs-teal to tell
two meanings apart: anything that means "gold" as a *code* — the life path
number, the 1·8 "gold" tier of her compatibility code (`.lm-t-gold`,
`.lm-py.lm-t-gold`, the "same" verdict glyph and chip) — reads `--gold`,
never `--brass`. The honest blank (`.ni-lp.unknown`, `.dim`) stays
`--text-3` on both grounds: a placeholder is never painted gold.

Her zodiac colour code (`--zc-*` trines, `--ws-*` elements) keeps the same
code on both grounds. By night the pills are tinted (18% wash, coloured
text); by day they are **solid** — full colour, white text (`--on-code`) —
so each day shade is deep enough to hold ≥ 4.5:1 against white. **No raw
hex in app.css** — every colour goes through a token, or a ground silently
breaks. The original single palette (#101216 page, #d9a54a brass) is
retired: two steps too dark, and the brass read pale. The night gold went
from #c9922e to #e0a33a on 2026-09-07 (her pick, "brighter"). The first day
palette — cream paper #efeae0, old gold #a8731c, brown shadows — is retired
on 2026-09-08 ("redesign the day palette. i dont like it"; all four parts
bothered her; SPEC §13l).

### Depth (2026-09-07 night — "more dimension, not so plain and flat")

Dimension in a dark interface comes from light from above, shadow below,
a deeper ground, and the accent catching light. Her recipe: **lifted
layers** — the ground is the deepest thing (with a vignette), the rail
sits below the page, each surface is a step lighter than what it sits on
with a one-pixel light along its top and a shadow beneath. The things she
taps are lifted more than the boxes that hold them. Every shadow is a
token; app.css never writes an rgba shadow of its own.

```
                 what it is                          where
--ground         vignette (lighter centre)           body::before, fixed
--rail-edge      the hairline where rail meets page  #nav-rail, #tab-bar
--lift-1         calm: 1px top light + 2px shadow    .panel .empty-state .stat-tile .board-wrap .tabs
--lift-2         tappable: 1px top light + 4px shadow .card .lm-card .board-card .btn .nav-link.active
--lift-2-hover   under her finger, raised 2px        .lm-card:hover .board-card:hover
--lift-btn       the brass button                    .btn-primary
--press          a button pressed (1px down)         .btn:active
--lift-face      ring + shadow                       .face
--lift-mark      a life-line mark                    .lm-mark .g
--sink           a groove                            .lm-ribbon
```

Day carries the same tokens with warm paper shadows (rgba(50,40,20,…)),
so one rule set gives both grounds their depth. Ghost buttons, chips,
inputs and the tab strip stay flat — depth marks what does something.

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
- **Zodiac colour code (hers, 2026-09-03).** Wherever an animal or sun
  sign is printed it takes its group colour — Chinese animals by trine:
  blue Snake·Ox·Rooster, green Dog·Tiger·Horse, pink Pig·Goat·Rabbit
  (the Cat), yellow Rat·Dragon·Monkey; Western signs by element: air light
  blue, fire red, earth yellow-brown, water dark blue. Tokens keep their
  status colour on the ring and take the group colour on the animal's
  sector/letter and the sign's abbreviation. Variables `--zc-*` and
  `--ws-*`, helpers `animalHtml()`/`signHtml()` in `js/indicators.js`. The
  life-path grid carries a one-line key.
- **Number icons replace the symbol tokens (her call, 2026-09-03).** "Show
  lp number as number, and use images/icons for astrology" — on the tree
  and the profile header the three facts read as
  `4 · 🐓 · ♑`: the life path as a brass number (★ for a master number),
  the animal as its picture inside a ring in its trine colour, the sun sign
  as its classic glyph in its element colour (a small ½ marks a cusp).
  Unknowns are a hollow dash, never omitted. §5's form-token table now
  describes the legacy `makeToken` only; `numberIcons()` in
  `js/indicators.js` is the live rule. Evidence status no longer colours
  these; it lives on the profile's status chip and the chart panel.
- **Tree viewing (2026-09-03).** Fit (on by default) shrinks the tree to
  its box, never below four-fifths (her pick: stop at a readable size — a
  wider tree scrolls sideways); − / + zoom by hand and turn Fit off;
  dragging pans; Expand puts the tree on the whole screen with the same
  controls and ✕ / Escape to leave. Delete on a case card lives in the ⋯
  menu, dimmed, two-tap — Import stays on the card.
