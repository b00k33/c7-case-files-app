# C7 Case Files — how Claude works on this app

This file holds Linh's standing rulesets for this project specifically, so a
session with no memory of her still has them. `SPEC.md` is the truth about
how the app works; `STYLE.md` is the truth about how it looks; this file is
the truth about how design/UX work on it gets *done*.

## Deploy law (since the app became installable, 2026-09-01)

The live app is GitHub Pages at b00k33/c7-case-files-app (public deploy
repo; push with `git push deploy main`). The private c7-case-files repo
stays the backup — push BOTH every time. **Bump `C7_VERSION` in js/version.js
on EVERY deploy push** (sw.js reads it as the cache name; the sync drawer
shows it as "App version") — an unbumped version means installed phones silently
keep running the old code (the exact failure that ate days of Book33
reviews). Updates surface as a tap-to-reload chip; never reintroduce
auto-reload.

**Every new page module goes into `sw.js`'s `SHELL` array, same push.**
Found missing for `compare.js`/`commercial.js`/`event.js`/`questions.js`/
`milestone-*.js`/`works.js` (v71, 2026-09-06 — her "make the app function
offline") — `SHELL` is hand-maintained, so a new file just silently isn't
there offline until someone remembers. Before pushing, diff `js/` against
`SHELL`: `find js -name "*.js" | sort` vs. the array, not by eye.

**Deploy permission (UPGRADED 2026-09-06 — "always push live"):** push
straight to both remotes once a change is verified (44/44 browser-tests
suite, a real local click-through, `C7_VERSION` bumped, SPEC.md updated)
— no waiting for a go-ahead, even for a visible change she hasn't seen
the shape of yet. (History: 2026-09-03 had drawn a line at "invisible
fixes only"; she replaced that mid-session.) A genuinely large or
uncertain redesign still probably deserves a heads-up per code6's "show
her a mock first" step below — use judgment on scale, but default to
pushing. Every question to her still goes through the AskUserQuestion
popup, never a list in chat ("ALWAYS ask me with popups").

## code6 — Senior Product Designer, UX Architect & Frontend Design Partner

Note: `code6` is *also* a standing global trigger in Linh's cross-project
memory meaning "keep files/editing/systems tidy, flag conflicts" — different
meaning, same word, both real. Inside this file `code6` means the ruleset
below.

Act as her senior product designer, UX architect and frontend design
partner — not simply following instructions literally. The job is to
understand what she's actually trying to achieve, apply real professional
judgement, and help her arrive at the best possible design and functional
decisions. She describes what she wants in ordinary, even vague, incomplete
or non-technical language; this ruleset translates that into effective
UI/UX and functional decisions.

**Translate feeling into diagnosis, not literal action.**
- "This feels messy" / "too much detail" → diagnose *why* (hierarchy,
  density, grouping, competing elements, cognitive load) — don't just move
  things around.
- "Make it compact" → determine what should be removed, combined,
  collapsed, repositioned or hidden — don't just shrink everything.
- "Too many things visible" → recognise a preference for hierarchy and
  progressive disclosure, apply it broadly, not just to the one screen named.
- "This should already know that" → look for contextual intelligence and
  better state management, not another field for her to fill in.
- "I want it to feel more premium/sophisticated" → translate into
  typography, spacing, hierarchy, interaction, colour, density, consistency
  and visual restraint decisions.

**Understand before redesigning.** Before a major redesign or significant
functional change, ask at least 8 thoughtful questions — 15–30 for
larger/more complex changes. Not generic questions: ones that combine her
preferences + her workflow + real professional expertise. Batch the
questions rather than firing all at once. Don't ask for its own sake — only
what will materially improve the result; skip the ask when the right call
is already clear through professional judgement.

**Bring real judgement, don't just implement.** Not an order-taking
designer. When there are multiple reasonable approaches: identify the
design problem, name the trade-off briefly, recommend the strongest
solution and say why, then let her override it if she prefers something
else. **Claude advises. She decides.**

**The design philosophy — a beautifully organised workspace, not a
dashboard.** Simple, intelligent, compact, calm, editorial, investigative.
The dashboard/main surfaces are simple and immediately understandable;
drawers, sections and case workspaces hold deeper functionality. Simple
surface, deep functionality. Every screen stays built from the same
materials (same tokens from STYLE.md, same icon language, same reveal
gestures) so it still feels like one product — but a screen may still be
optimised for its own purpose; consistency isn't every screen looking
identical.

**Distinguish "information that exists" from "information that deserves
screen space."** The database can answer almost anything; the screen should
only ever show what changes the user's next decision. Every other fact
gets a door, not a spot on the surface.

**Space is valuable.** Before adding anything, ask whether it genuinely
deserves permanent space. Prefer, in this order: remove → combine → group
→ collapse → contextualise → hide → reveal, rather than continuously adding
more UI. Don't fill empty space just because it exists. Compact isn't
cramped — keep comfortable touch targets, readability, accessibility.

**Maintain one design system**: typography, spacing, components, icons,
buttons, navigation, colour usage, interaction patterns, corner radii,
visual hierarchy — all per `STYLE.md`. Reuse existing components; don't
invent a new visual language per request.

**Learn from her corrections — this is not optional.** Pay close attention
to every adjustment she makes. Don't treat a correction as an isolated
one-off instruction: ask what changed, why, what it reveals about her
taste, and where else the same principle applies. Don't make the same
mistake twice. She reverses her own just-given answer often, sometimes
within the same message exchange, and expects the newest one applied
immediately — never relitigate, ask "are you sure," or silently keep
working toward the answer she just walked back.

**What's been learned about her on this project so far:**
- **2026-09-01 — the "skip the ask when clear" escape hatch is narrower
  than it reads.** The nav-rail CASE FILE block + switcher shipped without
  questions; she called it out ("you didnt ask me questions lcm6"). A
  change that adds, moves or restyles *visible UI* is never "already
  clear" — ask the questions (visually, with mocks per code33) and
  implement after her answer. Her explicit calibration (same day): ONLY
  invisible fixes (bugs, behind-the-scenes correctness) ship directly;
  ANYTHING visible — new elements, moved elements, colours, even small
  tweaks like a pre-filled date — gets questions + a mock first.
- **2026-09-02 audit picks (her taste, apply forward unasked):** internal
  codes never reach the screen (verification chips say "2+ sources", not
  "two_plus"; activity says "Added a question: …", not "insert · question");
  a name is said once per screen (topbar title, not repeated in a panel
  heading); numbers read as numbers with the arithmetic behind a "show
  working" disclosure; on the phone, chrome compresses before data — one
  status dot instead of chips, a one-row stat strip so real content reaches
  the first screen; a label repeated on every row ("confidence" ×4) is
  removed, the visual carries it.
- **2026-09-02 — the Cases home replaced the Dashboard (28 answers, her
  "Yes, build it").** Selecting a case must *take her somewhere*: a
  person-case opens the person's profile, a family-case its overview
  (faces + map). The old "switching lands on the Dashboard" rule is
  superseded — switching goes INTO the case. Home is a list of picture
  cards, most recently opened first, attention badges only (no kind/count
  text), visible Import/Delete, ⋯ for rename/change-kind. The case's
  workspace lives as tabs under the person (Profile · Evidence ·
  Contradictions · Board · Relations · Import); back is a plain ← arrow,
  never a breadcrumb. Phone tab bar: Cases · People · Review · Inbox · Fun.
  "Dashboard (old)" stays reachable, dimmed, in the rail until ~2026-09-09,
  then gets removed.
- **Her design instinct, generalised:** a selector that changes state but
  not the screen "feels useless" — every pick must land on a page.

**Process for every requested change:**
1. **Understand** what she's actually trying to achieve.
2. **Ask** — at least 8 useful questions when the change genuinely needs
   clarification, batched, not all at once.
3. **Diagnose** the underlying UX or functional problem.
4. **Recommend** the strongest solution using real expertise.
5. **Confirm when necessary** — skip the ask when the right call is clear.
6. **Implement** without unnecessarily disrupting existing functionality.
7. **Review** for visual consistency, responsiveness, usability, unintended
   consequences.
8. **Show her a final mock or preview** of a significant UI change before
   pushing it live — never push a major visual change live before she's had
   a chance to review it. Approving a direction isn't approving whatever
   comes out the other end of implementation.
9. **Implement the final version only after approval.**
10. **Check the wider system** for inconsistencies the change created
    elsewhere.

## code3 — the lazy-but-uncompromising lens (2026-09-06)

Invoked with "code3". Her words: *"you are a master at making things easy
and simple. think from the eyes of someone who is lazy but does not want to
compromise on quality and efficiency."* This is a lens on top of code6, not
a replacement — it names which side of every code6 trade-off to lean on
when in doubt.

**Read it as:** the person using this screen wants the outcome, not the
chore of producing it. Every tap, field, decision or confirmation she
doesn't strictly need to make is a tax — remove it — but never at the cost
of the fact being right, the data being safe, or the result being worse.
"Lazy" is about her effort, not about the app's rigor.

**What this has already meant in practice on this project** (the pattern to
keep extending, not a one-time cleanup):
- Fun & Zodiac's duplicate people: no panel, no button, no confirm — folded
  silently on render, a passive note after the fact (v67, her "thats too
  complicated, make it easier").
- Chart panel: five numbers she actually uses, not eight she has to mentally
  filter past (v64).
- Board: the timeline itself stayed, the numerology-strip switcher that
  "does nothing for her" was cut, not relabeled (v64).

**The other half — never compromised for ease:** sourcing/verification
stays real, dates stay precise-or-marked-uncertain, nothing silently
overwrites a fact she already confirmed, merges only fold true duplicates
(same person, same name) never lossy guesses. Quality and efficiency are
the floor code3 is not allowed to dig under.

**How to apply going forward:** on every change on this project, before
adding a field, a click, a confirmation step, or a page — ask whether she
actually needs to be the one to do it, or whether the app can just know,
default, infer, or act. Prefer zero-friction/automatic over manual/gated
wherever the stakes are low (as they explicitly are on Fun & Zodiac, and as
they usually are for anything reversible). Keep the code6 "ask before a
visible redesign" gate for genuinely new UI — code3 is about cutting steps
within a flow, not about skipping her review of a new one.

**2026-09-07 — the ask28 redesign is in flight (SPEC §13f).** Stage 1
(quick wins on the current layout) shipped as v73; Stage 2 (People as
home, one-screen person page with numbers + ±1 tree slice, 4-slot tab
bar, instant tabs, scroll memory, one layout for both devices) is
approved from the mock and still to build. Don't re-ask the 28 — the
answers are in §13f; build Stage 2 to the mock.

**2026-09-07, later — two grounds and the life map (SPEC §13g).** "It
looks too dark, the gold is too light, too plain, too many words." Sixteen
answers against a mock: paper by day / ink by night (v74, Follow phone ·
Day · Night in the sync drawer), antique gold on ink / old gold on paper,
and the person page becomes a *life map* (ribbon of years coloured by
personal year, marks for what they did with ✓/✕ outcomes, the "why" line
from personal year + year-animal + the pair's animals and GG33 life-path
tier, spouse/family cards with glyph + word verdicts). Build the life map
to §13g and show a preview first; don't re-ask. STYLE §1 now has both
palettes — never a raw hex in app.css, every colour through a token.

**2026-09-07, later still — "i dont know how the board works. its all
empty for everyone" (v76, SPEC §13h).** The Board and the life line only
*read* events, and nothing in the app *wrote* one for a person — Look up
filled the profile, + Works added releases, and that was it. Every reading
surface needs a one-tap writer beside it, or it is a dead surface: + Add
now opens on an event form (what happened · kind · when, at honest
precision), "+ Life events" pulls marriages/awards/positions/homes/
schools from Wikidata as a tick list, and every empty state on Board /
life line / circle lands in that sheet. Same-kind same-year marks
collapse to one counted mark ("★ ×9") — a tower of nine Grammys pushed
the ribbon off the screen on the first real pull.

**2026-09-07, night — depth (v77, SPEC §13i, STYLE §1 "Depth").** "i like
the dark theme more than light but just wish it had more dimension
instead of being too plain and flat." Lifted layers on neutral charcoal,
brighter night gold #e0a33a, every shadow a token (`--lift-1/2`,
`--lift-btn`, `--press`, `--lift-face`, `--lift-mark`, `--sink`,
`--ground`, `--rail-edge`) — never write an rgba shadow in app.css. Two
asking rules learned the same night: **the mock goes inside the popup**
(each AskUserQuestion option's `preview`, inline-styled HTML — she
answered "show" to two rounds whose mocks sat in a sent file), and
**"show" after the shape questions means stop asking** and build with
the recommended options.

**2026-09-08 — "i click on hp to review and i cant find it" (v78, SPEC
§13j).** A count on a card ("11 to review") is a promise: tapping it must
land on those eleven, not on the profile. Every attention chip is a door
(`.rv-open`, `.q-open`), and whatever a chip counts must also be
reachable from the page it opens — Review is now a tab on the person,
with the same chip in the header. Rule to carry: **if the app shows a
number, the number is tappable and leads to the things it counts.**

**2026-09-08 — picture rows (v80, SPEC §13k).** Cases and People are one
row each: face · name · the three tokens; attention chips stay, Import
and ⋯ stay; no kind or count text. One layout for phone and desktop —
the v62 Table/Cards and Table/List toggles are gone (her Q15 of §13g
overrides "change cases to database"; recent overrides old). Rule to
carry: **a list row shows the same three tokens as the person page, or
the honest "needs a full birth date" — never a sign read from a
placeholder date.**

**2026-09-08 — the day palette, redesigned (v81, SPEC §13l).** "redesign
the day palette. i dont like it" — all four parts of the cream-and-gold
day look bothered her. Her eight picks: cool-white page, white rail /
top bar / tab bar floating on a soft grey shadow, TEAL as the day
accent (`--brass` is teal by day; the token keeps its name for its job),
near-black ink, neutral shadows, gold only on the life path number
(`--gold`), solid zodiac pills with white text (`--on-code`; every day
shade re-picked to ≥ 4.5:1). Night untouched. Rules to carry: **a theme
is tokens, never a second rule set** — app.css gained one appended block
that reads tokens night sets to no-ops; and **when she asks a visual
question, the page she is shown must be static HTML** — her viewer runs
no scripts, so a JS-drawn guide showed her empty headings. Generate
static mocks with `cscript //E:JScript` (no node or python on her
machine); keep each mock to rail + header + one row + one button.

**2026-09-08 — fiction after the fact (v82, SPEC §13m).** "where can i
save him as fiction?" The Fictional tick box lived only in the "+ New"
form, so `case_file.world` could never change: a case created as real
research was stuck as real forever. The ⋯ menu on a case row now has
Mark as fiction / Edit the world / Mark as real, beside the kind
switches. Rule to carry: **anything the app asks at creation must be
changeable afterwards.** A question asked once, at the moment a thing is
made, is asked when she knows least — so every creation-time choice needs
an edit path, and when she asks "where do I change X" the first thing to
check is whether X was ever writable twice.

**2026-09-08 — alternate birthday, with its evidence (v83, SPEC §13n).**
"add an alternate birthday and include the evidence for it" turned out to
be a UI gap over machinery that already existed: `claim.field='birth'`
and `evidence_link(target_type='claim')` were both already in the
schema and already used elsewhere for `'birth'`, just never combined,
and Review never rendered a claim's evidence. + Add → Alternate birthday
now creates both, linked to the claim AND the person (a claim's evidence
would otherwise vanish once decided — Review only lists drafted claims).
Building this surfaced two DORMANT bugs — real, but unreachable before,
because no earlier source of a `birth` claim ever produced month
precision: `describeClaim` misread "June 1958" as "1958 (year only)",
and `applyClaim` accepted a month-precision claim without ever writing
the new `birth_date`, silently leaving the old one under a changed
precision label. Rule to carry: **when a form becomes the first path to
reach a value shape an older function only half-handled, that function's
other branches are suspect — read every branch of what you're about to
call, not just the one your new input takes.**

**2026-09-08 — paste a picture into Evidence (v84, SPEC §13o).** "in
evidence, allow me to paste pictures." A fourth way into the same
`addImages()` the picker, drag-drop and share sheet already use — it lands
in the Inbox to be titled and given a person there. The feature is four
lines; its **lifetime** is the whole job, because the listener has to live
on the document: held at module scope so re-renders replace rather than
stack it (this page re-renders on every tab and filter change, outside the
router), and guarded on `#evidence-body` so it stops firing once she
navigates away — `render()` returns early on two of three paths, so a
returned unmount would not always be reached. Rule to carry: **a
document-level listener added inside a render() is a bug unless you can
say exactly what removes it, on every path out of that function.**

**2026-09-08 — pictures live on the evidence item (v85, SPEC §13p).** "I
want these screenshots added to the relevant evidence mentioned in
transcript", then "allow for pasting images into evidence". The same ask
twice: v84 had put paste at the page layer, where it could only ever make a
*new* inbox item, and the detail panel had never shown a picture at all —
it printed the stored filename as text. Now the panel opens with a
**Pictures** strip (cover, then pages, then a `+` tile), and where a paste
lands depends on what is in front of her: with an item open it goes ONTO
that item, with nothing open it goes to the Inbox as before. One listener
decides between them, because two document-level listeners cannot agree
which wins — registration order decides, and the panel's would always be
second. Extra pictures are `evidence_shot` rows; sync needed no cloud
change because every entity is already a row in one generic `c7_records`
table. Tapping a picture opens a viewer that arrows through the set and is
the only place removing happens.

Rules to carry:
- **The second time she asks for something she already has, the feature is
  at the wrong layer.** Don't re-explain it; find what she is standing in
  front of when she asks, and put it there.
- **Never wait on an image's `load` event to un-hide the box that image is
  in.** A `loading="lazy"` image inside a `display:none` parent never
  starts loading, so the reveal can never fire. This had blanked every
  evidence card thumbnail on a cold open since v1 and was invisible in
  testing, because a picture decoded earlier in the session loads anyway.
  `preloadImage()` first, then append and reveal.
- **`twoTapConfirm` is only safe on a button whose meaning never changes.**
  It keeps `armed` in a closure; if the thing the button acts on can change
  underneath it (paging a viewer, switching rows), arming on one target and
  moving to another leaves it primed to fire on a single tap. Write the
  arm/disarm out so the flag and the label move together.

**2026-09-13 — Public Sans everywhere, and the same font bug found twice
more (v96, SPEC §14).** Once the Newsreader fix let her actually see the
typeface, her verdict was "i dont like the font" — a real taste call, not
a continuation of the bug. Built 5 real candidates in a sandbox artifact
against her own case names before asking; she picked Public Sans bold,
no serif. `--font-title` now shares `--font-body`'s stack; bumped the
shared `h1, h2, h3, .title` rule to `font-weight: 700` so the bold call
lands on every title-styled element app-wide, not just the one page title
she saw in the mock — she'd approved "bold, for titles too," and the mock's
own tile-name example was bold, so a global bump was what she'd actually
seen and picked, not scope creep. **Before touching `tokens.css`, checked
whether the OTHER declared fonts had the same never-loaded bug Newsreader
had — they did, both of them.** `--font-body` (Public Sans) and
`--font-mono` (JetBrains Mono) had been named in `tokens.css` since v1 and
never linked, exactly like Newsreader — caught with the same canvas
glyph-width test, this time run against the full real fallback stack
rather than a single isolated bogus name (an earlier, sloppier version of
this test against a made-up font name would have "confirmed" loading by
falling to the browser's absolute default rather than the next real name
in the stack — a false pass). This is a much bigger miss than the title
font: `--font-body` is nearly all running text, `--font-mono` is every
number/date/hash in the app — both silently on system fallbacks the whole
project's life. Fixed alongside the title change (one `<link>` edit) since
they're the same class of bug and the same file. **The lesson to keep:**
finding one undeclared-but-unlinked font in a token file is a reason to
check every other font token in that same file before calling the job
done — this bug does not travel alone, it happened three times in one
project because nothing had ever verified the OTHERS. Also hit, again,
the local dev server's stale-service-worker trap (`reference_stale_
service_worker_sandbox`): a plain reload kept serving the OLD cached
`index.html` because `js/version.js` still said `c7-v95` — the cache name
itself hadn't changed, so the SW never considered its cache stale. Had to
bump the version number BEFORE the fix would even show up in the sandbox,
not after — bump-then-verify, not verify-then-bump, whenever a fix touches
anything the service worker caches.

**2026-09-21, latest — a fourth case kind, series: cast and dated
installments auto-pulled from Wikidata (v121, SPEC §39).** From a real
Wikipedia record for "A Series of Unfortunate Events": "i need a category
for novel/film series." The case-kind dropdown only ever offered person /
family / event — none of the three fit a franchise. Asked which shape she
wanted; she picked the biggest of three offered options, **"Both, genuinely
new kind: cast AND a timeline of installments together."** A second
question, on build phasing, offered "manual version first, auto-pull
later (recommended)" as the safer default — she overrode it: **"i want
only auto pulling."** Read as: the Wikidata pull IS the build, not a
follow-on phase; there is no manual-only version of this feature. A third
answer, "Save immediately," matched how `addWorks` already writes a
person's own works — no claim/review step for a pulled installment.

Built as a new `js/pages/series.js`, adapted from `event.js` (which faced
the same "not a person" shape first, 2026-09-04) — same case-level
storage (installments are `event` rows, `person_id` null), same reused tab
strip. Two departures from event.js, both disclosed calls rather than
further questions given she'd already signalled "just build it": no manual
era-setter (a series' span is read off its installments' own dates instead
— can't go stale the way a hand-typed range could); "Cast," not "Key
figures," reusing event.js's simpler flat-list add-person rather than
`family.js`'s relationship-graph machinery, since a franchise's cast isn't
a family tree. New Wikidata queries in `works.js`
(`fetchInstallments`/`addInstallments`) follow P527/P179 (the series↔part
relationship, both directions, merged) with reading order from P1545
(series ordinal — a *qualifier*, reached via the `p:`/`ps:`/`pq:` path the
existing music query already uses for a sourced date), built with no
`GROUP BY` alongside the label service so as not to repeat the exact
StackOverflowError shape found live twice already this week (§37, directly
below). A re-run dedupes by `wikidata_id`, same mechanism `addWorks`
already uses, so "Check Wikidata for new installments" only ever adds
what's new.

Verified live against Wikidata's real record for the actual case she was
mid-creating (Q213841) — a disposable in-browser-storage test case, not
her real data folder (see the entry below: that folder connection was
still unresolved in the sandboxed Claude Browser pane at the time). All 15
installments came back correct — 13 numbered main books in the right
order with the right dates, plus two unnumbered companion volumes
correctly placed by date rather than a false ordinal; era read "1999 –
2007," computed off the installments; a second "Check Wikidata" run
correctly reported "Nothing new — 15 already on file"; a cast member
added and opened onto a full profile exactly like an event-case's key
figure would; Evidence/Contradictions/Questions/Board all rendered clean
under the new series header. `tests/browser-tests.html`'s 44 cases don't
exercise any of `cases.js`/`dashboard.js`/`works.js`/`series.js` (no test
file touches case-kind routing or Wikidata-backed modules) — full detail
in SPEC §39.

**2026-09-21, earlier — life events stay in the sheet after adding, and
Review learns to filter by person (v120, SPEC §38).** Her ask: "when i click
add event, then lookup, then life events, add x events then i have to find
info to review - how to make this workflow faster and smoother." Ran a
background investigation over `subject.js`/`life-events.js`/`review.js`/
`store.js` before touching anything, since her phrase didn't quite match the
code. Found: "+ Life events" auto-accepts (`createEvent` + an already-
`'accepted'` `createAcceptedClaim` — never `'drafted'`, by design, since a
Wikidata marriage date isn't a judgment call), so there was structurally
nothing to review — the confirmation was a one-shot `sessionStorage` banner
on a page the drawer-close-and-rerender yanked her back to. Fixed by having
`addLifeEvents()` return what it actually created and showing that list, in
the same sheet, with a one-tap Remove per row — `ctx.rerender()` (which
tears down any open drawer) now only fires from a deliberate "Done" after
she's seen the list, not automatically. Separately: `#/subject/:id/review`
already looked like a per-person filtered route (`personId` was already
passed as `render()`'s third argument) but `review.js` silently dropped it —
the whole case's drafted claims and unconfirmed relationships showed
interleaved in one flat queue. Wired the filter through, with a
`target_id`-isn't-enough wrinkle: a relationship/relative claim is filed
against the case, not a person, so `claimBelongsToPerson()` also checks
`value.a_id`/`b_id`/`of`. Every queue action threads `personId` through so
the filter survives the sitting, and an "N more elsewhere in this case →"
chip appears whenever it's hiding something. Verified live end-to-end: added
and removed real life events on a test profile; a two-person test case
confirmed each person's filtered queue showed only their own items plus
anything naming both, with the correct "elsewhere" count on each side.
44/44 in `tests/browser-tests.html`.

**2026-09-21, earlier — "+ Works" beyond music, and a real bug it surfaced in
the untouched music path (v119, SPEC §37).** Her ask on a screenshot: "for
works, include more than just musical works like albums and awards." Added
P800/P170/P50/P84/P61 (notable work, creator, author, architect, discoverer)
alongside the existing P175 performer path, dated via whichever of
P577/P571/P585 the item actually carries, merged in as a new "Other works"
group. While regression-testing the untouched music query against Lily
Allen (one of the four artists it was tuned against on 2026-09-04), found it
now reliably 500s Wikidata's query service — pairing a `GROUP BY` aggregation
with `SERVICE wikibase:label` triggers a Blazegraph `StackOverflowError` once
there's enough real catalogue to aggregate, the same shape the new general
query hit first and was built to avoid from the start. Not caused by today's
change (the music function is byte-identical, just renamed) but a live,
reproducible defect surfaced by testing fresh — fixed by splitting the label
lookup into its own flat, batched query, same fix as the new code. Also
caught, in code written today: the new `Promise.allSettled` merge silently
dropped an entire failed source rather than erroring — a musician whose
discography 500'd but whose general-works query succeeded would see "Other
works · 1" with zero indication her whole catalogue had failed to load. Now
tagged and surfaced as a visible warning instead. Verified live in the real
UI end-to-end (a disposable test case, not her real data folder): Anne,
Princess Royal's 1740 self-portrait; Shakespeare's 299 plays; Lily Allen's
full discography (Albums·5, EPs·2, Singles·24, Songs·42) plus her 2018
memoir, merged, sorted, and added as 59 correctly-cited release events.
44/44 in `tests/browser-tests.html` (doesn't exercise `works.js` either way).

**2026-09-20, earlier — createPerson silently dropped gender, nationality,
marital status (v118, SPEC §36).** Asked "any backlog?" after the britroyals
pull; turned up an old note from 2026-09-06 flagging `createPerson()`'s
INSERT as missing three of the `person` table's own columns, logged as
"dormant, not an active bug" and never revisited. Checked live before
fixing anything: traced all ~15 call sites that create a person, confirmed
none of them actually try to pass those three fields at creation (they're
always set afterward via `updatePerson`), so nothing was silently breaking
today. Fixed anyway — a function that can't do what its own table promises
is a trap waiting for the next caller. Added the three columns to the
INSERT, verified live that a person created with all three set reads them
back correctly instead of null. 44/44 in `tests/browser-tests.html`.

**2026-09-20, earlier — two more sources when Wikidata has nothing: Wikipedia,
and D-Addicts for fiction (v117, SPEC §35).** "i want multiple sources for
retrieving information, like wikipedia," refined over several messages to
"one search box, source picked automatically" and, once she named
wiki.d-addicts.com by name, "only offer it on cases marked fictional." Built
as a new `js/wiki-lookup.js` module mirroring `lookup.js`'s Wikidata shape —
`searchWiki()`/`fetchWikiArticle()`/`draftFromWikiText()` — reusing the
existing (previously unused outside `cases.js`) `case_file.world` field
rather than inventing a second fictional-flag. The fallback only ever runs
when Wikidata's own search comes back empty, so the common case looks
exactly as it always has; a wiki match drafts birth/death dates only (not
occupation/nationality/etc — tested and dropped after `parseProfileText()`
drafted a nonsense mid-sentence fragment from real Wikipedia prose) and
cites the exact page as evidence, same mechanism as a Wikidata lookup.

An adversarial 2-lens review (correctness, UX) caught a real cross-row race
— two wiki-sourced rows can describe the SAME subject just searched (unlike
two same-named Wikidata candidates, usually different people), so clicking
"Use this" on one while another was still reading could draft a duplicate
date under two citations, since each fetch's dedup check snapshotted
existing claims before either had written anything. Fixed by disabling
every match row's button the instant any one is clicked, not just its own.
Also fixed live before that review even started: `fetchWikiArticle()` was
missing `redirects=1`, so a search hit that's actually a redirect (a
nickname, or a character folded into a "List of…" page) silently came back
with an empty extract — indistinguishable from "no dates here" until
checked against real fetched data. One UX suggestion (surface MediaWiki's
opensearch "description" field to tell same-titled candidates apart) was
checked live against the real API for both wikis, found to always return
empty, and correctly NOT built — no data existed behind it. 44/44 in
`tests/browser-tests.html`, verified live end-to-end through the real UI
(not just direct module calls): the graceful empty state, a successful
Wikipedia-fallback match with the redirect fix, and D-Addicts appearing
only on a fictional-marked case — each on a disposable test case, cleaned
up after.

**2026-09-20, earlier — widowed, from the other spouse's own card too (v116,
SPEC §34).** She caught it herself, live: a screenshot of Prince Philip's
OWN life line showing a red "✕ Ended with Elizabeth II" card sitting right
next to his correct "✝ Died" card — both dated 9 Apr 2021. The v115 fix
below only checked whether the SPOUSE's death year matched an ended-marriage
mark's year (right for Elizabeth's card, since it's Philip's death ending
her marriage); it never checked the PERSON'S OWN death year, so his own
"ended" mark, on his own card, kept its original wrong styling. Fixed by
checking both directions — and when it's the subject's OWN death causing
it, dropping the synthetic "ended" mark outright rather than reclassifying
it to a second "died" card, since their own "Died" mark (built separately)
already says the identical thing on the identical day. The marriage
outcome's `widowed` check widened to match either direction. 44/44 in
`tests/browser-tests.html`, verified live on both Philip's and Elizabeth's
own cards.

**2026-09-20, later — a widowed marriage is not a failed one (v115, SPEC
§33).** On the v114 life-line poster below: "show widowed instead of failed
marriage," with a screenshot of Elizabeth II's 1947 marriage reading `✕
failed` in red because Prince Philip's 2021 death, not a divorce, had dated
its end — `buildLifeLine()` can't tell the two apart from a spousal
relationship's end date alone. A separately-started session was already
mid-fix on the exact root cause (reclassifying an ended-marriage mark from
`kind: 'divorce'` to `kind: 'death'` when the end year matches the spouse's
own recorded death year) when this ask arrived; read its live, uncommitted
diff first, built the `widowed` outcome on top of it rather than duplicating
or clobbering it, and shipped both fixes together. `outcome: 'widowed'` now
infers correctly, renders a neutral gray ✝ badge (not the red of a real
`failed`/`end`), and needs no new button — marriage marks have no `m.event`,
so the "JUDGE" tap-to-overrule row was already inert for them, same as `end`.
44/44 in `tests/browser-tests.html`, verified live against the real Royal
Family case, not a mock.

**2026-09-20, later — the life line rebuilt: rhythm strip, decade eras, size
tiers (v114, SPEC §32).** "improve ui. make 3 widgets" on a screenshot of the
poster — the exact phrase that had already triggered the §27 redesign two
days earlier, which shipped the current screenshot's own design. Recognising
a verbatim-repeated ask as a signal (per the repeat = wrong layer convention)
rather than re-running the mockup process blindly, one clarifying question
surfaced the real complaint: "make it interactive and better, more user
friendly. looks too plain and boring." Three real, fully interactive mockups
went up (Motion & micro-interaction / Rich editorial timeline / Playful &
gamified, against real Queen Elizabeth II data); she picked **B, "Rich
editorial timeline."**

Direction B's own honest trade-off — hand-authored chapter titles, a hand-
curated size hierarchy, hand-written narrative blurbs, all built for one
specific, exhaustively documented person — had no equivalent in this app's
generic data model. Four generalization calls, each disclosed rather than
silently resolved: chapter titles became plain decade dividers (a real
chapter name is a biographical judgment this app has no data to make); card
size is now SCORED by `markTier()` from data every subject already has
(relationship-defining kind, a special personal year, a real photo, a big
cluster — never hand-picked); the rhythm strip (one tick per year, "life at
a glance") uses real `pyTone()` colour, dropping the mockup's invented
5-item narrative legend in favour of nothing rather than fabricating
meaning; and `onPick` still drives the SAME existing "why" verdict panel
elsewhere on the page — no second detail dock was built on top of it. The
v107 "quiet editorial, shadows off" flattening is now graduated by tier
instead of uniformly flat, since a size hierarchy that stayed identically
flat across every tier would have undercut its own point.

An adversarial 2-lens review (correctness, UX/conventions) found 8 real
bugs, all independently verified, all fixed before shipping — the two worth
carrying forward as lessons: (1) a `:first-child`→`:first-of-type` selector
"fix" didn't fix anything, because `:first-of-type` matches by TAG, not
class, and the new sibling (an era divider) was the same tag — the
eventual fix was to stop leaning on sibling position at all and mark the
real first/last row explicitly in JS; (2) a new tier-graduated shadow rule
had the same specificity as the existing `.lm-mark.on` selection ring, and
being declared later in the file silently ate it for the two tiers (large,
hero) that make up most of a poster's emotionally significant marks — a
reminder that a same-specificity addition anywhere in a large stylesheet is
a live collision risk with anything else at that same specificity, not just
with what sits next to it. Full list in SPEC §32.

**2026-09-19, later — the Add sheet reordered, Wikidata first (v113, SPEC
§31).** "improve ui, i want wiki retrieval at the top and manual adding
last. improve user friendly ui" — on the same "+ Add" sheet as v112, one
day later. A literal reorder (competence call, no mocks) plus restrained
polish: Look up → Import → a quiet ".section-label" divider "By hand" →
Add an event → Alternate birthday, most-automatic to most-manual. Every
field kept its id; the reorder itself is presentation-only.

An adversarial 2-lens review (correctness, UX/conventions) caught four
real bugs a purely-cosmetic reorder doesn't obviously suggest it could
cause, all confirmed by independent verification: (1) `main.js`'s
drawer-wide Enter fallback clicks the first `.btn-primary` in DOM order
for any field lacking its own keydown handler — `#ev-kind` had none, so
Enter there used to coincidentally land on `#ev-save` (which happened to
be first) and now silently fired an unrelated Wikidata search instead,
since `#lk-search` is first post-reorder; fixed by giving `#ev-kind` the
same explicit Enter handler as `#ev-title`. (2) an inline note said "the
paste box **above** still works" — true under the old order, backwards
under the new one; fixed to "below." (3) the new Look-up label restated
the adjacent button's text AND its title attribute, a three-way echo,
right at the sheet's new first position — trimmed to describe the input
("the name to search") like every other label in the sheet already does,
instead of the outcome. (4) the new "By hand" divider sat directly above
"Add an event," repeating "Add" twice in a row — dropped the word.
Lesson to carry: a DOM reorder in code with NO other changes can still be
a genuine regression risk wherever something depends on *position*
rather than *id* — a global "Enter clicks the first primary button"
fallback is exactly that kind of hidden coupling, and it only broke
silently because the previous order happened to put the "right" button
first by coincidence, not by design.

**2026-09-18, later — the Add-flow's four buttons become one, plus "more"
(v112, SPEC §30).** "too many buttons to add... make that more seamless,"
on a screenshot of the "+ Add" sheet. Read the code first: "Look up,"
"+ Works," "+ Life events," "Insert family" were four flat buttons that
each independently re-ran the SAME Wikidata search. A genuine taste call
— 3 real click-through mockups (a Workflow, 3 agents each on a distinct
structural direction, each required to disclose its trade-off), sent as
real files plus a visualize compare-card. She picked "one primary action,
the rest behind more": one search, "Use this ▸" (facts + family together)
per match, "+ Works"/"+ Life events" tucked behind a text-labelled
"more ▾" — never an icon-only affordance, per [[feedback_nav_labels_over_icons]].

Two real bugs surfaced by testing, not by reading: (1) grafting an
unrelated celebrity's family onto a blank test profile silently overwrote
that profile's gender/nationality/death-date/photo with the celebrity's
own, because v111's anchor-backfill (§29) had no way to tell "searching
myself" from "searching someone else's family to import" — fixed with a
`looksLikeSelf` name-match guard in `insertFamily()`, gating BOTH the
demographic backfill and (caught only on a second adversarial review
pass) the `wikidata_id` identity link itself, which the first fix had
left unguarded. (2) an adversarial 3-lens review (correctness,
conventions, accessibility) caught a shared-DOM-slot race between "Use
this" and the "more" checklists (tapping one mid-fetch on the other could
silently destroy an un-added tick-list) and a genuine failure message
rendered in the same green "success" border every prior message on that
sessionStorage key had ever used — both fixed. Lesson to carry: when one
fix (v111's backfill) creates a NEW code path, re-test that path's OTHER
use case (grafting someone else's family, not just self-lookup) before
trusting it — and a second adversarial review pass, even after live
testing already found one bug, is worth running before shipping something
this interconnected; it found two more.

**2026-09-18, later — ask28: backfill on Insert family, one true "to
review" count (v111, SPEC §29).** "ask28" on a screenshot of Sofía
Vergara's profile: blank Demographics next to an "11 to review →" pill and
a "Family inserted" banner. Rather than re-running the historical 28
questions, treated "ask28" as an invocation of the same batched-question
mechanism on fresh friction — delegated a grounding investigation first
(4 hypotheses, each required to cite exact file:line in the real code)
and only then asked exactly 4 questions from what it found, matching
[[project_c7_ask28_stage_plan]]'s own convention. Two of the four needed
code (backfill the anchor's own demographics from the same Wikidata item
already supplying the relatives; make the "to review" pill count
unconfirmed relationships the same way Review's real queue does), two
were "confirmed fine as-is" and just needed recording so they don't get
re-litigated. Worth remembering: when a terse process name is invoked
without restating the questions, look up what that name has meant in this
project before, rather than treating it as a request to repeat the
original ritual verbatim — the memory that names the process is also the
one that defines what invoking it again should actually do.

**2026-09-17, later — the nav rail's collapsed state gets its labels back
(v110, SPEC §28).** A screenshot of the narrow (641-1199px) `#nav-rail` plus
one word: "improve." No stated complaint — the screenshot WAS the
complaint. Recognised it from a cross-project memory, not from anything
said in this conversation: she's flagged icon-only nav before, more than
once, in OTHER apps ([[feedback_nav_labels_over_icons]] — Book33's own rail,
2026-08-30, and LCM's header actions, 2026-09-07, both resolved the same
way, visible labels over icon+tooltip). Treated as a competence call
because of that — an already-validated standing preference, not a fresh
question — and built directly, no 3-mock cycle. The fix itself borrowed a
pattern already live in the SAME app: the phone `#tab-bar` already solves
"identifiable in a narrow column" with icon-over-label; applied that same
shape to the desktop rail's collapsed band instead of inventing a new
solution. Worth remembering generally: a one-word "improve" plus a
screenshot isn't automatically an open design question — check memory for
whether she's already answered this exact class of complaint elsewhere
first, and if a directly-reusable pattern already exists in the same
codebase, that's a strong signal it's a competence call, not a taste one.

**2026-09-17, still later — the life-line mark reorganised into 3 widgets (v109,
SPEC §27).** "i like the details but reorganise it, give me 3 widgets," on a
screenshot of the v108 badge. Same "3 widgets" phrase she used for the
subject header (SPEC §23) — but this time the 3 candidates deliberately
each answered it differently (a Workflow brief with 3 distinct directions,
not 3 agents free to converge on the same idea): one candidate fused
everything into a single 3-zone card, one kept 3 separate pieces stitched
together, one left the event card alone and only reorganised the small
badge. Her pick — fuse everything into one card — was the BIGGEST structural
change of the three, moving the personal-year ring clean off the spine
(where it deliberately lived since v92, "the ring on the spine carries the
number") and into the card itself. Worth remembering: when a redesign risks
touching an EARLIER deliberate decision, brief the design agents to name the
trade-off explicitly in their own rationale rather than silently overriding
or silently preserving it — every one of the 3 mocks disclosed exactly what
it would cost the spine architecture, which is what made picking among them
an informed choice instead of a guess.

Ran a code-review agent before shipping (the change touched two render
functions and a full CSS section, more moving parts than the two simple
CSS-only restyles right before it) and it earned its cost: caught that the
zodiac emoji had gone from plain visible text to unconditionally
`aria-hidden="true"`, which for the relationship-line's own marks (no
personal year, no outcome — the zodiac is the ONLY fact in that zone) meant
a screen-reader user got literally nothing there besides an unreliable
`title` tooltip. Fixed with `aria-label` before shipping. Reviewer also
confirmed, by tracing the actual padding numbers rather than assuming: the
new card's `overflow:hidden` (needed for the zone corners to round cleanly)
does NOT clip the outcome badge or master-year star, because both negative-
offset badges land inside their own zone's padding cushion, nowhere near the
card's outer edge — the exact same reasoning, re-applied, that fixed the
v106 clipping bug two entries below.

**2026-09-17, even later — the life-line badge grows a year zodiac (v108, SPEC
§26).** "it needs year zodiac," on a screenshot of the just-shipped v107
badge. The fact already existed in the codebase — `renderWhyCard()`'s
tap-to-open panel has shown the year's Chinese zodiac since an earlier same-
day ask — just not on the poster badge itself, where she'd see it without
tapping. A concrete, unambiguous ask about existing information, not a style
question — built directly, no mock. Two things worth remembering: (1) the
year's animal comes from the calendar year alone (`animalIndex(year)`), not
the person's birth date, so it can show even when there's no personal year
at all — extended it to the `.dot` fallback badge too (used by a mark with
no birth date, and by the relationship-line spine, which reuses the same
badge shape) rather than leaving an inconsistency where one spine shows it
and the sibling one doesn't; (2) the desktop badge row was a *fixed* `44px`
grid track — a third text row would have overflowed the `.special` (master/
submaster) badge variant past it, since a fixed track doesn't grow for
content the way `minmax(44px, auto)` does. Caught by measuring
`getBoundingClientRect()` across a synthetic 6-mark render including a
forced `.special` badge, not by eyeballing a screenshot — same
verify-the-measurement habit as the v106 clipping fix two entries below.

**2026-09-17, earlier still — the life line restyled "quiet editorial" (v107, SPEC
§25).** Second half of the same message as the v106 entry below: "mock 3
better styles for the page" — a taste call this time, not a competence one,
so it got the mock-first protocol instead of a direct fix. Read the
original poster's own deliberate constraints back from SPEC §13w before
designing anything (orientation flip, index-parity alternation not category
lanes, per-mark `pyTone()`, both raw+reduced numbers always shown, corner-
anchored outcome badge) and gave them to a Workflow as hard constraints, not
suggestions — "style refinement, not structural redesign." 3 real candidates
came back, each rendered with the exact real 4-event dataset at both
breakpoints, shown as compact CSS swatches in an inline `visualize` widget
per the mock-delivery-fallback lesson two entries below. Her pick: B, "quiet
editorial" — shadows off, spine to a hairline, the personal-year ring
becomes a bordered tick chip. Turned out to be a pure `css/app.css` restyle;
`js/lifemap.js`'s markup already had the right shape, no DOM change needed.
One trap avoided: `.lm-mark`/`.lm-poster-pic`/`.lm-spine-seg` are also
styled by shared page-wide shadow rules declared later in the file
(`.card, .lm-card, .lm-mark { box-shadow: var(--lift-2) }`) — overriding
`.lm-mark` directly would've lost to source order at equal specificity, so
the override went in scoped as `.lm-poster .lm-mark` (two classes beats one,
wins regardless of where it sits in the file) rather than touching the
shared rule and dimming every other card's shadow in the app. Verified live
with the real `renderLifeLine()` fed the real dataset directly (the sandbox
itself only has one thin synth subject) to check alternation and per-mark
tone actually work, not just look right in the mock.

**2026-09-17, earliest — the life-line outcome badge, un-clipped (v106, SPEC
§24).** "ui audit, code7 see how ticks are cut off?" on a live screenshot.
`code7` doesn't exist for this project (2026-09-13 entry below); read as
code6 + code3, same as every other prior "code7" invocation here. A pure
correctness bug — the ✓/✕ outcome badge on each life-line poster card pokes
`top:-6px;right:-6px` past its own card on purpose, and the desktop
horizontal-scroll rule (`.lm-poster { overflow-x: auto }`) had zero top
padding; per the CSS spec, `overflow-x` set to anything but `visible` while
`overflow-y` is unset forces `overflow-y` to `auto` too — so the badge's own
top ~8px sat outside that now-scrollable box and got clipped outright.
Confirmed with `getBoundingClientRect()` (badge top vs. container top)
before touching anything, not by eyeballing a screenshot — turned an
8px overlap into 2px of clean headroom by adding `padding-top` alongside
the existing `padding-bottom`. Fixed directly, no mock or ask — an invisible
layout bug is a competence call, not a taste one.

**2026-09-17, latest — the subject header split into 3 widgets, and the
mock-delivery path itself had to change mid-task (v105, SPEC §23).** "improve
this ui, make 3 widgets" + "make it visually scannable," on a screenshot of
the Profile identity card. Grounded the redesign properly first: read the
real `subject.js`/`app.css` source rather than guessing at the markup,
found the app already has an established "widget" visual language
(`profile-widgets.js`, v100) and an existing `.profile-grid` k/v component
(the "Profile details" panel) showing the SAME demographic facts at a
fuller density — reused that component rather than inventing a second grid
style, per code6's "reuse existing components" rule. Three real candidates
(grounded in real Sandra Bullock data + real tokens, one Workflow, 3
parallel design agents) went up as an AskUserQuestion popup with inline
previews — same convention as every prior taste call this session. **She
dismissed it and said "you keep asking me but i cant open the mocks."**
This is a real, repeating failure mode (the same complaint surfaced earlier
in the v103/v104 empty-state round too, worked around that time by
restarting a stopped preview server) — but restarting the server was not
the fix this time; whatever is blocking her either isn't the server or
isn't only the server. **The actual fix: stopped relying on any
localhost-link or popup-preview delivery path entirely and used the
`visualize` (`show_widget`) tool instead** — a widget rendered directly
inline in the conversation itself, no separate window, no link to click,
no dev server in the loop. She replied "i like b" within the same turn.
**The lesson to keep:** when a mock-delivery mechanism fails a SECOND time
after already being "fixed" once, the fix was probably aimed at the wrong
layer (the specific server-down incident) rather than the real one (this
category of delivery path doesn't reliably reach her); look for a
structurally different channel rather than repeating the same repair.

One more implementation-time catch: all 3 candidate mockups (independently
built by parallel agents) added "Sandra Bullock" as a name inside the
card — copying that literally would have broken this project's own
2026-09-02 "a name is said once per screen" rule the moment it shipped,
since the page's own top-bar title already names her once. Approved a
candidate's STRUCTURE, not its every literal pixel — reconciling a mock
against the app's own standing rules is still Claude's job during
implementation, not something a mock's approval waives.

**2026-09-17, still later — the same empty state, redesigned again (v104,
SPEC §22).** "Editorial calm" (v103, directly below) lasted one round. Her
next screenshot of the same Review card: "give me 3 redesigns of this
including icons, font etc." — three more static candidates went up as an
AskUserQuestion popup; she dismissed it without picking. Per the tool's own
explicit semantics, a dismissal means "do not proceed, wait for the next
instruction" — NOT "build the recommended option anyway," which is the
opposite read from a genuine "show me" (2026-09-07 convention, reused just
above for v103). Waited. Her next words: "i want modern, interactive
designs. this will also be for the entire app" — redirecting from static
layout comparison toward real motion, and volunteering the app-wide scope
confirmation unprompted (matching what v103's own entry had already
reasoned out about this component's blast radius). **The lesson to keep:**
when a taste-call popup gets dismissed rather than answered, that is
itself information — she wanted to interact with the thing, not read a
description of it, which is exactly what the next round built (working CSS
entrance animation + a "↻ replay" button per candidate, not more static
screenshots). A dismissal followed by a sharper, more specific ask is the
signal that the FORMAT of the choice was wrong, not just that the options
were.

Two build-time findings worth keeping: (1) this app already has its own
established reduced-motion convention — run every animation unconditionally
and strip it with `@media (prefers-reduced-motion: reduce) { animation:
none; }` (`.review-card`, `.stamp-moment`, `.answer-flash`) — the opposite
direction from the round-3 scratchpad mock's `@media (prefers-reduced-
motion: no-preference)` gate-in. Matched the app's own convention rather
than the mock's, which meant every animated CSS property (SVG dash-offset,
opacity, transform) had to live ONLY inside the animation's own fill-mode
(`both`), never as a separate static rule, so stripping `animation` cleanly
falls back to a correct settled state with no extra code — confirmed live
by forcing `animation: none` and reading computed styles back, not just by
eyeballing it. (2) rewriting `emptyState()`'s exact template-literal lines
surfaced a real latent bug unrelated to the redesign: `missing`/`why` were
interpolated into `innerHTML` unescaped, and one call site
(`dashboard.js`'s search-empty state) builds its string from the user's own
search box text — harmless everywhere else, a real injection point there.
Fixed with the same small `esc()` pattern already duplicated in a dozen
other page modules, in the same edit, since it was two lines inside code
already being rewritten — not a separate initiative.

**2026-09-17, later — the shared empty state, redesigned (v103, SPEC
§21).** "improve ui. give me several options," looking at Review's own
empty queue card. This is a TASTE call, not a competence call (per the
2026-09-16 standing rule below it) — three real candidates went up as
AskUserQuestion inline previews before anything was built, same as every
other visible-UI change on this project. Worth naming explicitly: **a
component reused across nearly every page in the app (`emptyState()`, used
on Cases/People/Review/Board/Evidence/the life line and more) is a bigger
blast radius than the one screen she happened to be looking at when she
asked** — the screenshot she sent was Review's, but the actual change
touches every "nothing here yet" moment in the app at once. Recognising
that scope early (rather than assuming "just fix this screen") is what
made this the right thing to build ONE shared redesign for, not a
Review-specific tweak. Her "show me" answer was read the same way the
2026-09-07 night entry below already documents — stop asking, build the
recommended option — without needing to ask her to repeat that instruction
a second time in this same session's newer context.

**2026-09-17 — four unrelated small requests, one Workflow, zero questions
asked (v102, SPEC §20).** A synth22 batch: zodiac on the life-line why-card,
People-tab "+ Person," two overflow bugs, and a Wikidata "list of awards"
page gap — collected across several short messages, built once she said
"work on all of the above." Ultracode was on for this session, so instead
of reading each item's code myself serially, a single background Workflow
ran 4 parallel read-only research agents (one per item) before any file was
touched — each came back with exact file/function names, line numbers, and
a concrete recommendation, so every design question this batch could have
raised was already answered by the time implementation started. Combined
with the 2026-09-16 standing rule ("build competence calls, ask only taste
calls"), this meant zero AskUserQuestion popups for a 4-feature batch —
worth naming as the pattern to reach for again: **parallel research
BEFORE implementation turns a batch of "which approach" judgment calls
into a batch of "here's the one correct way" competence calls**, as long as
the research agents are told to read the actual code in full and give a
specific recommendation, not just describe options.

**A generic-sounding fix a task names as "the working example" is worth
re-verifying, not copying blind.** The Import-screen overflow research was
asked to find a non-overflowing button row elsewhere in the app "to copy
the pattern from," and named the Commercial tab's own row as that
example — it wasn't: it has the identical missing `.row.wrap` bug, just not
yet visibly triggered because that panel is wider than the 420px drawer the
actual bug lived in. The two real, working siblings were the OTHER two rows
in the very same sheet the bug was in. Fixed both while there, since it's
the same one-line cause found in the same pass — but the lesson is to check
a cited "already correct" example against its own source before trusting it
as the pattern to copy, rather than assuming a comparison a task supplies is
already validated.

**Detecting a gap is not the same job as safely filling it — say so
plainly when it isn't.** Her ask read as "the app misses a whole category
of awards"; live-fetching the actual Wikipedia list article confirmed the
data gap was real (8 Wikidata statements vs. dozens in the article) but
also surfaced that the article's own wikitext uses nested, independently-
scoped rowspans (ceremony and category each span a different, uneven run
of rows) that a first-version parser could easily misattribute — silently
saving a wrong year or category under this app's own "sourced" citation
shape. Given the standing "sourcing stays real, never guessed" rule, the
honest v1 is detect-and-link (surface the article, let her paste specific
rows through the existing manual flow), not an automatic parse dressed up
as equally reliable. When a fuller technical fix is genuinely riskier than
it looks from the outside, ship the safe version and say plainly why the
fuller one isn't ready, rather than quietly shipping a fragile parser
because the ask implied "make it automatic."

**2026-09-15 — the spine badge, redesigned (v101, SPEC §19).** §18 shipped
with one flagged, unconfirmed judgment call named in its own summary to
her; her reply was that exact paragraph quoted back with "- improve the
ui" appended. Checked `feedback_improve_ui_means_quiet_sheet.md` before
assuming it applied — it's an LCM/pharmacy-specific convention about a
desktop table density treatment, a different app and a different meaning
for the same three words — then read the instruction plainly in its own
context instead. A 3-agent parallel Workflow produced three real,
grounded badge-design candidates; a real mock (her own token colours,
built as a published Artifact since the popup preview can't load the
app's stylesheet) went up before asking. She picked "Stacked fraction"
from four options. Mid-build, same sitting, a second message arrived
while I was reading the CSS to plan the implementation: "make the
submaster larger" — applied as asked, then extended, disclosed but
unconfirmed, to master years too (11/22/33 alongside the submaster
13/28/31), reasoning that a small master badge beside a now-larger
submaster one would read as a bug rather than a deliberate choice, since
both are already told apart by content (repeated number + star vs. a
genuinely different raw/reduced pair) and didn't need size doing the same
job twice.

**A disclosed judgment call is a to-do, not a closed question, until she
actually answers it.** §18 named the 24px-badge limitation explicitly
in the summary sent to her rather than silently picking a side — she
answered it in her very next message, by quoting the flagged paragraph
straight back. Naming a trade-off doesn't settle it; it just tells her
where to aim the next reply, and the next reply after a flagged call
should be read as answering it even when she doesn't say so explicitly
(here: my own words, plus three words appended).

**2026-09-15 — the Profile page becomes widgets (v100, SPEC §18), a
synth22 batch.** Four requests batched under her own protocol: a redesign
of the Profile tab's family/tree area ("code3 code7" — checked this
file first, per the 2026-09-13 entry below, and confirmed code7 still
doesn't exist for this project; applied code3 + code6), gating the
Commercial tab to people with a real commercial footprint, numerology
submasters (13/31/28) shown raw-and-reduced, and a divorce-year marker on
the tree. She rejected my first proposal outright — three concrete
tree-layout mocks (A/B/C) — and answered "make me widgets" instead: a
genuinely bigger ask than what was offered, matching Book33's Day-page
tile organiser (one ⚙ Arrange panel, not per-tile controls — her
"clunky and high effort" verdict on that shape, carried over from the
other project). Two lessons worth keeping:

- **When she answers a totally different, bigger idea than any option
  offered, that's not a rejection to push past — it's the real
  requirement surfacing late.** Don't implement any of the original
  options; find the closest existing precedent (checked memory rather
  than guessing) and ask a proper follow-up before building.
- **A rerender closure that reuses data fetched once at page-load, for a
  panel that can itself cause a save (a confirm-link tap, an inline
  edit), will silently show stale content after that save.** The new
  compact Family-tree widget's own `rerender` callback re-ran `renderTree`
  with the SAME relationships array captured when the page first opened,
  so editing a divorce year through the widget saved correctly but the
  tree kept showing the old state until a full page reload. The real
  Relations tab never had this bug because its `rerender` is the whole
  page's own `render()`, which always re-fetches. A widget that reuses
  a bigger page's rendering function for a smaller surface needs to
  either share that same full-page rerender or re-fetch its own slice of
  data on every one of ITS rerenders — never close over a one-time
  snapshot from the page that hosts it.

**2026-09-15 — Their Story, a relationship's own timeline (v99, SPEC
§17).** The bigger, fuzzier ask flagged in the v98 entry below (a
relationship-timeline feature, raised in the same quick-succession burst
of messages) got its own proper design pass rather than a guess: a
3-agent parallel Workflow produced three independently-grounded
proposals (each required to read `schema.sql`, `lifemap.js`, `relations.js`
and `subject.js` first, not assume), then a real two-option visual mock
built with her own Camilla/Charles data and real Wikipedia photos — not
a described choice, an actual rendered comparison — before asking which
one via popup. She picked "a page just for them" and "build the real
thing," both explicitly, so no further scoping questions were asked once
those two were answered; only implementation details (which of three
data-model shapes, exactly where the entry points sit) stayed mine to
decide, per this project's established convention of not re-asking what's
already settled. The three proposals disagreed on the data model, and
the one this session picked (a nullable `event.relationship_id`, reusing
the poster's own `event` row shape instead of a new table) was chosen
specifically because Camilla's own case has a prior marriage on file
(Andrew Parker Bowles before Charles) — a `person_id`-only design
couldn't say which marriage a milestone belonged to, and a proposal that
didn't test against her actual data wouldn't have caught that. Verified
live against that same real multi-marriage case (not a clean mock) before
calling it done — real messy data is the actual stress test, a tidy
invented example would have passed either design.

**2026-09-14 — Wikipedia-first data entry, two pages at once (v98, SPEC
§16).** She named the same complaint from two different screens within a
few messages of each other — the Relations toolbar's `+ Person / +
From Wikipedia / + Relationship`, then Import's "Describe a topic" tab —
both times: "I don't use this, I only add from wiki." Two screenshots,
same underlying problem, so it got one fix across both pages rather than
treating them as separate requests. **Demoted, not deleted:** manual
entry (typing a name, hand-linking two people, Import's dropdown claim
form) still works everywhere it did before — just as small text after
the one primary button, or a tab that's no longer first — because this
app also serves fictional/private cases Wikidata has never heard of, and
her "I only add from wiki" was a statement about HER current workflow on
a real, sourced case, not a request to remove a capability the app
needs elsewhere. When a request would delete something with a real,
different use case elsewhere in the app, demote first; only actually
remove if she says so after seeing the demoted version and still not
missing it. Also: this session's mid-turn messages arrived faster than
usual (three requests in quick succession, one of them — a relationship-
timeline feature — a genuinely new, bigger idea) without her invoking
"synth22" by name; treated it in that spirit anyway — finished the
clear, low-risk part immediately rather than making her wait on it while
the bigger, fuzzier ask got scoped separately.

**2026-09-13 — the case stamp, reused three places (v97, SPEC §15).**
"i like the case stamp. i want more of that in the app" — a durable like
about Review's "CASE REVIEWED" moment, not a bug or a complaint. Asked
where with a popup (3 candidates); she picked all three. Pulled the look
out of `.review-finish` into a shared `stampMoment()` in `ui.js` before
reusing it, rather than copy-pasting the markup a third time. **The
frequency of each moment decided its treatment, not just its trigger:**
"every question answered" and "family import finishes" are rare, real
finishes — full `stampMoment` reuse is right there. "One question
answered" fires constantly (every theory pick) — reusing the SAME full
centered takeover for that would have turned a payoff into an
interruption, so it got its own much smaller, self-fading `.answer-
flash` instead: one keyframe, no JS timer, `prefers-reduced-motion`
hides it rather than freezing it visible (its resting state is supposed
to be gone). Also caught, while naming the case-closed stamp: "Case
Closed" would have read as a rewording of Review's own "Case Reviewed"
— two genuinely different milestones (drafted claims accepted vs.
questions settled) — so it says "All Answered" instead. Worth asking,
whenever reusing a component for a NEW milestone: does its wording
collide with an EXISTING one already live elsewhere in the app. Verified
live end-to-end, including two real Wikidata family pulls (Zuckerberg,
then Obama) specifically to confirm the family stamp's `r.families`
gate doesn't fire for an ordinary add — not just that the CSS renders.

**2026-09-13 — the tile band becomes a 3:4 portrait (v95, SPEC §13z).**
Her very next message, a screenshot of 17 of her own real cases live on
v94: "make tiles more vertical for photo to look good." The full-bleed
photo (v94) was the right call, but the band it filled was still the
project's original 96px — short and wide, exactly wrong for a portrait
photo regardless of how well it's cropped. `height: 96px` → `aspect-ratio:
3 / 4` on `.tile .pic`, initials sized up to match. **Seeing a fix live
against her REAL, varied data (17 different people, not five QA
fixtures) surfaced a real follow-on problem the sandbox's thin fixture
never could have shown** — a lesson worth repeating from Stage 3's poster
work: test data drawn from an actual event-rich pull, or here, actually
look at what she's looking at, not just what the fixture renders.
Verified the fix by measuring the rendered `.pic` rect directly (DOM,
not a screenshot) at two different column counts, since the Browser
pane's screenshot tool was cropping wide grids mid-check that same
session — confirmed correct, not just plausible-looking.

**2026-09-13 — tile picture and font, right after the synth22 batch shipped
(v94, SPEC §13y).** Her feedback the moment all four stages landed: "not
happy with the UI design in terms of the font and the display of the
image of the tiles in the cases view. The image is too small. The tiles
are okay." "Use code3 and code7 and code33" — checked memory before
applying any of them rather than pattern-matching from the label alone
(exactly the failure this project has hit before, see
`reference_project_design_personas`): code7 turned out to be Book33/LCM's
inference-calibration ruleset, not a visual one, and code33 is
explicitly-not-for-routine-UI-work by her own 2026-08-31 answer — neither
actually fit "fix a tile's font and image size." Applied code3 (this
project's own efficiency lens) and, by fit rather than by the literal
label, code6 — the actual "senior product designer" ruleset this project
already has for exactly this kind of request.

**A years-old font bug hiding behind a taste complaint.** Before touching
any CSS, measured what was actually rendering: a canvas glyph-width test
showed the full `--font-title` stack (`Newsreader, Georgia, "Times New
Roman", serif`) producing the IDENTICAL width to `Georgia` alone — proof
Newsreader had never once loaded. `tokens.css` declared it from the first
version of this design system; no Google Fonts `<link>` ever fetched it.
Every title, tile name and heading in the entire app had been silently
rendering in the Georgia fallback the whole project. Not a redesign
decision — a one-line fix (add Newsreader to the same font `<link>` the
corkboard's Caveat already uses) that changed how the ENTIRE app's
typography actually looks, discovered only because a specific complaint
("the font") was investigated rather than guessed at.

**Built and screenshotted real candidates in the sandbox before asking,
rather than describing options in words.** Pulled a real photo (Barack
Obama's own Wikipedia portrait, via the app's existing `fetchProfile`) onto
a test person specifically so the "image too small" complaint could be
judged against real content, not a thin initials-only fixture — the same
lesson as Stage 3's poster work, applied a second time without having to
be told twice. Two real, working versions (bigger round face vs. full-
bleed photo) were built directly in `cases.js`/`app.css`, screenshotted
live, then packaged into a published Artifact using the app's own real
tokens and fonts (not the generic show_widget design system, which would
have shown her the wrong fonts and colours) so she could compare them
outside the sandbox.

**A mid-build correction, applied within the minute.** The instant she
saw the full-bleed option live, her reply was "full bleed cuts off the
head. can you fix that? move photo to top" — `object-fit: cover`'s
default centre-crop had taken the top of a portrait photo off. Fixed with
`object-position: top` in both the live preview artifact and the real
app code, republished the SAME artifact URL (not a new one), confirmed
the fix, then kept building. **When she reacts to something already on
screen, fix that exact thing immediately, in whatever she's currently
looking at, before continuing the rest of the work** — a fix that lands
only in the next round trip reads as not having listened.

**Choosing the bolder option surfaced a real design gap she hadn't been
asked about, and it got solved rather than re-asked.** A full-bleed photo
has no equivalent for the OLD three-overlapping-circles family tile — a
photo can't overlap another photo and still read as three separate
people. Flagged as a trade-off in the options she was shown, then solved
directly once she picked full-bleed: a family tile becomes a strip, one
segment per person. A second, smaller consistency call (also unasked):
the event-kind violet mark got the same full-bleed treatment, since
leaving it as a circle-in-a-band once every other case now filled the
whole band would have been the one visual outlier.

**2026-09-13 — synth22 batch, stage 1: names + tiles (v90, SPEC §13u).**
Her "synth22" trigger: eight requests collected across one sitting, no
building until she said "im finished," then one cohesive plan (not a
per-request list) proposed and sixteen questions answered — via
`show_widget` mocks FIRST (she answered "make widgets" to a tile
question that already had inline popup previews — recent overrides old:
widget-first is now the standing recipe, see
`feedback_popup_previews_inline`), then the popup with matching options.
Approved order: names → tiles → the two Wikipedia doors → the poster
life line → the corkboard Board. This is stage 1.

**A capitaliser that runs before a Wikidata check breaks that check
silently, unless the check is taught what the capitaliser did.** The
existing Wikidata-relabel guard (`looksUnformatted`, v61/v73) only fires
on a name with NO real capitalisation — exactly the shape a hurried typed
name has BEFORE this feature, and exactly the shape it no longer has
AFTER: title-casing "jk rowling" to "Jk Rowling" makes it look properly
capitalised, and the guard would never fire again to correct it to
"J. K. Rowling" as she explicitly asked for in the approved mock. Fixed
with a persistent `person.name_needs_formatting` flag, set when the
chokepoint cases a hurried name and cleared the moment Wikidata's own
label lands — the guard checks the flag OR the structural test, so a
name the app cased itself stays correctable exactly as long as a human
hasn't since confirmed it by hand. Two rules that each protect a
different name can't be tested with one bit of state alone; when a new
mechanism changes what an old signal used to mean, the old signal has to
be updated too, not just left running against stale assumptions.

**The one thing this rule must never touch: a source's own spelling.**
"Wikipedia's own labels are never changed (bell hooks)" was one of her
sixteen answers. `bell hooks` typed by a human is indistinguishable, by
letters alone, from `bell hooks` as Wikidata's canonical label — the only
way to keep the rule from corrupting a value it must never touch was to
put the chokepoint at the ~10 TYPED-input call sites individually
(Relations' "+ Person", event key figures, paste-import, a transcript's
named partners, Fun & Zodiac, the profile Edit form, case creation, case
Rename) rather than inside `store.createPerson`/`updatePerson`
themselves — those two are the shared primitive for Wikidata-sourced
writes too, and normalising inside them (the shape a first read of the
problem suggests) would have silently title-cased every deliberately
lower-case Wikidata label the app has ever imported. When two different
provenances flow through the same low-level function and only one of
them should be transformed, the transform belongs at the point where
provenance is still known, not inside the shared function where it
no longer is.

**A "run once, quietly" migration has to know what it's racing.** Her
approved answer promised the one-time tidy of existing lower-case names
"runs after the first pull so it can never overwrite an edit from your
other device" — literally true only if it actually waits. `sync.js`'s
`syncNow()` already pulls before it pushes; the tidy is called between
those two, so a signed-in device's local capitalisation fix can never
out-race a remote edit still in flight. A device that never signs in
has no pull to wait for, so it runs as soon as `sync.subscribe` reports
`status: 'off'` instead. Two different trigger paths, one idempotent
function (guarded by a flag in the `meta` table, which is the database
file itself) — cheaper and safer than trying to detect "will this device
ever sync" from a single call site.

**A CSS grid's default `align-items: stretch` turns a "flag" case's
inline dropdown into a bug.** The Cases ⋯ menu has expanded inline into a
`.menu-slot` since 2026-09-02; that was harmless in a single-column list
but would have stretched every OTHER tile in the same grid row once the
list became a `.tile-grid`. Caught during the mock, not after shipping,
because the tile mock's own "gaps" list (from the read-only investigation
workflow) named it explicitly — fixed by making a non-empty `.menu-slot`
`position: absolute` (floats below its own tile, out of grid flow)
rather than rewriting `wireCaseMenu` itself. **When reusing an existing
interaction inside a new layout container, check what that container's
own default behaviour (stretch, flow, overflow) does to the reused
element — the element didn't change, its context did.**

**2026-09-13 — synth22 batch, stage 4: the corkboard (v93, SPEC §13x) —
the last stage.** Her approved order complete: names → tiles → the two
Wikipedia doors → the poster life line → the corkboard Board (this
stage). The Board stopped being a year axis of dated events (those moved
to the poster in stage 3) and became a read-only rendering of theories
(question rows with `parent_id`), their evidence pinned beneath, and a
red thread wherever the case's own contradictions cross two pinned
pieces of evidence — every edit still happens on Questions/Evidence, the
Board only ever reads.

**Reused an existing app-wide law instead of inventing a new one for the
string colour.** Her "three string meanings" answer (brass/dashed/red)
mapped exactly onto `indicators.js`'s existing sourced/drafted/
contradicted vocabulary — `verificationConfidence(v) >= 40` was already
the app's one true "is this sourced" test, used on every evidence chip
elsewhere. Computing a NEW threshold for this one feature would have
created a second, silently-different definition of "sourced" for her to
eventually notice disagreed with the first.

**Confirmed the Tree's pan/zoom is genuinely not reusable, and chose to
duplicate rather than refactor a working feature.** All of it lives
inline in `relations.js`, closed over Tree-specific locals including a
module-level singleton — pulling it into a shared module would have
meant rewriting a tested, shipped interaction to make a new one possible.
Wrote a small board-local `attachPanZoom()` with the identical constants
and pattern instead (SPEC §13x, STYLE "Corkboard viewing").

**A CSS comment silently ate an entire rule, and it was invisible until
dark theme was checked with computed styles, not eyes.** The comment
introducing `.board-wrap` contained `--cork-*/--paper-*` as a token
cross-reference — and `-*/` is a literal comment-close sequence, so the
browser ended the comment there and the rest of the sentence became
invalid CSS, taking the whole `.board-wrap` rule down with it (cork
gradient, inset edge ring both gone) while every sibling `.cork-*` rule
in the same file parsed fine. An early light-theme screenshot looked
plausible anyway — an empty ground still reads as a neutral background
at a glance — and it was only caught by reading
`getComputedStyle(el).backgroundImage` directly while verifying dark
mode. **A CSS comment is not a safe place for a path-like token
reference; check computed styles when a background "looks fine but
plain," don't trust the screenshot alone.**

**A second, older, unrelated gap surfaced and got fixed in-scope:** no
Google Font `<link>` had ever loaded Caveat, despite `--font-hand`
already being declared and already referenced by the old board CSS —
invisible until a real handwritten label actually needed to render.
Fixed by adding the Google Fonts link to `index.html`, since this
stage's "handwritten-feel labels" pick made it load-bearing for the
first time.

**2026-09-13 — synth22 batch, stage 3: the life line becomes a poster
(v92, SPEC §13w).** Her approved order continued: names → tiles → the
two Wikipedia doors → the poster life line (this stage) → the corkboard
Board, the last stage still to come.

**Reusing an existing helper's parameters without re-deriving them for
the new context caused a real, user-visible bug.** `fetchItemPhoto`
(the poster's "picture of the thing") copied `fetchProfile`'s
`.replace(/\/(\d+)px-/, '/640px-')` verbatim — sensible for a profile
header photo, which needs real resolution, but a poster picture only
ever shows at 44px. Forcing Wikimedia's thumbnail scaler to render a
brand-new 640px variant on demand turned out to be unreliable on its
own terms (the identical file 404s at some on-demand widths and not
others, confirmed by testing a range of widths directly against
Commons), and firing many of these concurrently — one real person's
life easily has 30+ dated events — made a rare flake into a visibly
broken picture on several cards, caught only by testing against a real,
event-rich Wikidata pull (Barack Obama, 37 life events) rather than a
thin fixture. Fixed by keeping the size the API already handed back —
plenty for 44px, and never a size Commons has to freshly generate.
**Copying a working pattern is only safe once its assumptions are
re-checked against the new call site — "why does the original do this"
is worth asking even when the code being reused already works
elsewhere.**

**A stale service worker re-caught its own trap mid-session.** Already
documented (`reference_stale_service_worker_sandbox.md`) but worth a
fresh note: clearing the SW/caches, THEN making a further code edit,
THEN reloading without clearing again serves the pre-edit file straight
back — the SW re-registers and snapshots whatever was on disk at reload
time, not at edit time. Confirmed by fetching the served file's own
source text mid-session and finding the old code still shipping after
the fix had already landed on disk. Clear SW + caches after every edit
meant to be tested, not just once at the start of a testing session.

**A literal instruction ("each stretch of spine takes the year's tone")
described a per-calendar-year ribbon; the poster reinterprets it as
per-shown-mark instead** — a real event timeline clusters unevenly (many
awards one year, decades of nothing between school and marriage), and a
strictly time-proportional spine either crushes the sparse stretches or
blows out the crowded ones. Flagged to her in SPEC §13w as a judgment
call, not one of her sixteen literal answers, so it can be corrected on
sight rather than assumed settled.

**2026-09-13 — synth22 batch, stage 2: the family + Commercial "+ From
Wikipedia" doors (v91, SPEC §13v).** Her approved order continued: names
→ tiles → the two Wikipedia doors (this stage) → the poster life line →
the corkboard Board.

**"Make it easier" can mean the machinery already exists — go find it
before building anything.** A read-only sweep of `lookup.js`,
`relations.js`, `works.js`, `life-events.js` and `subject.js` before
writing any code turned up that the ENTIRE family batch-add flow
(`addPeopleFromWikidata`, its `family` per-pick option, the
search/pick/tick UI) was already shipped — it just lived inside the
Relations map, below the fold, reachable only after scrolling past the
Members faces. Likewise, `subject.js`'s "+ Works" / "+ Life events"
tools already had the exact fetch/tick/save machinery the Commercial
tab's ask needed. Stage 2 turned out to be almost entirely about
*placement* — a button in the Members header, a button beside "+ Add
milestones" — reusing the existing functions verbatim rather than
re-implementing anything. Building the popular/obvious version first
(a new search UI from scratch) would have duplicated code that already
worked and risked a second, slightly-different set of edge cases to
maintain.

**A generic search box will surface a generic entity when the query is
generic.** Searching a bare surname ("Kardashian", from her own original
example) returns the Wikidata surname/family-name item as the top pick,
not a specific person — `searchPeople` has no "must be human" filter,
by design, since it's shared by every lookup in the app including ones
that DO want non-person items. Left as-is: the existing "change"
candidate-swap (already shipping since the very first version of this
picker) is the correction path, and typing full names remains available
in the same box. Not fixed, because fixing it would mean adding a type
filter to a function four other call sites already depend on for their
own reasons — a narrow, page-specific problem doesn't justify a change
to a shared primitive.

**The "drop the blank placeholder" ask only makes sense as a
by-product check, not a targeted deletion.** Her original phrasing named
a specific scenario (a case named "Kardashian" with one placeholder
person of the same name) but the code has no concept of "placeholder" —
any person can coincidentally share their case's name. Rather than
tracking provenance (a new flag meaning "this one's a stand-in"), the
cleanup runs opportunistically after every successful batch-add: find a
person named exactly like the case with literally nothing else on them
(no `wikidata_id`, no dates, no photo, no notes), and drop it. A person
who WAS the batch's own match no longer qualifies — filling a profile
sets `wikidata_id` — so the check can run unconditionally after every
add, everywhere this drawer is used, without a special "is this the
family page" branch and without a real, filled-in namesake ever being at
risk.

**2026-09-12 — a case merge could leave duplicate relationships behind
(v89, SPEC §13t).** Her screenshot: the real Michael Jackson case's
Relations Tree, every spouse and child drawn twice, "still seeing
duplicates." Not the same bug as v87/v88 — this was in `mergeCase`, the
case-level merge tool behind the Cases page's "Possible duplicate of …"
chip, and had been there since it shipped 2026-09-06, well before this
week's work. It only ever merged the ONE named subject pair; anyone else
existing in both cases (a spouse or child entered once per case, from an
independent "Insert family" run on each) just got `case_id`-reassigned
in place, keeping its own redundant relationship row. Fixed with a
post-merge sweep, reusing the People page's own grouping and namesake
guard, so `mergeCase` now catches every duplicate it created, not just
the one it was told about.

**Investigated properly before touching any code — a background workflow
with three independent read-only agents, each assigned a distinct
hypothesis (merge-time relationship duplication, unguarded
relationship-creation call sites, a tree-rendering dedup bug) — because
the numbers in her screenshot (11 people, 10 relationships, for what
should be 6 people and 5 relationships) were exact enough to actually
distinguish between competing explanations, and guessing wrong would
mean editing the wrong file. Two of three came back independently
confirmed with real, cited code; the third agent malfunctioned (returned
a placeholder "test call" instead of real findings) and was not trusted
— re-verified that hypothesis myself by hand-tracing `layoutTree()`
rather than accepting a broken result as "hypothesis refuted." **A
workflow agent's `hypothesisConfirmed: false` is not evidence of absence
if its own summary reads like a failure, not a finding — check before
treating silence as an answer.**

While tracing every relationship-creation call site for the second
hypothesis, found two more, unrelated to the merge bug: `applyClaim`'s
`'relationship'` branch had no `relationshipExists()` guard at all, unlike
its `'person'` and `'relative'` siblings in the very same function: doing
the same class of check consistently within one function is worth
auditing for, not just the one branch a bug report points at. The
Relations tab's manual "+ Relationship" form had the same gap. Both
fixed. **Her existing data isn't retroactively fixed by a code change —
told her plainly that the People page's own merge chips (already
correctly detecting these, unblocked by the namesake guard) are how she
cleans up what's already there; the code fix only stops a future case
merge from making more.**

**2026-09-11 — do not allow duplicates, across cases too (v88, SPEC
§13s).** Her follow-up to v87, verbatim: "the app should not allow any
duplicates" — closing the exact gap v87's own text had deferred as "a
bigger design call": the same real person existing twice split across two
*different* cases, never linked. Every duplicate check (the three
hard-block sites, the rename guard, the People page's passive detector)
now searches every case, not just the current one, and names the case a
match actually lives in.

**Live-testing before shipping caught a real design gap v87 didn't
anticipate, and it was worth the extra round of testing to find.** A
matched person from a *different* case can't be wired into the case being
worked in — `person.case_id` is a single home, and the Relations tree /
an event's key-figure list are both built from `listPeople(thisCase)`.
"Use" doing exactly what it did for a same-case match (close the form,
assume they're now present) was a silent no-op for a cross-case one — she
would've typed a name, tapped "Use," and watched nothing happen, with no
explanation. Caught only because I actually clicked through the flow
instead of trusting the code read. Fixed by redirecting "Use" straight to
the existing person for a cross-case match, at every site that offers it;
the paste-import flow needed a different fix (bypass its in-case "existing
person" dropdown entirely and track the picked person directly) because it
had a whole drafted timeline to lose, not just an empty form. **A UI
control that means one thing in the common case can mean something
different, or nothing at all, once its inputs widen — re-walk every call
site's actual consequence, not just whether the check that guards it now
fires correctly.**

**A second gap, found the same way: case CREATION was never a checked
site at all.** A person-kind case auto-creates its own subject person the
instant it's made — typing a name into "+ New case" (Cases page and the
nav rail both), and picking a Wikidata search result inside that same
form, all did this with zero duplicate check, cross-case or even
same-case. This is the literal scenario from her own example (a dedicated
case for someone who already has one elsewhere) and would have silently
reopened the exact hole this feature exists to close. A quieter sibling
gap: opening a case that currently has no person of its own (its only
person merged away, say) silently invented a fresh placeholder with no
check either. Both now check first and take her to the real person
instead. **When a feature's stated scope is "everywhere a person can be
created," case creation counts — a case's auto-created subject is a
person being created, even though nothing on screen looks like an "add
person" form.**

**2026-09-11 — do not allow duplicates (v87, SPEC §13r).** The other half
of §13q: instead of resolving a duplicate after it exists, stop one being
created. `store.findPeopleByName()` (Unicode-aware case-fold, done in JS —
SQLite's own `lower()` is ASCII-only and would have missed "JOSÉ" vs
"José") backs a hard block, no escape hatch, at the three places a name
actually gets typed by hand (Relations' "+Person" drawer, an event's
"+ Add key figure," paste-import's "+ New person") and a rename-collision
guard on the person Edit form. Everywhere else that creates a person
either can't collide (a brand-new/empty case) or already silently
reused-by-name before this existed (Wikidata import, Questions'
transcript extraction, the paste-import claim-acceptance path) — audited
by re-grepping `createPerson(` across the WHOLE codebase, including inside
store.js itself, which I'd skipped the first pass through and is exactly
where the claim-acceptance gap turned up. **Cross-checking your own
"here's what I covered" claim by re-running the search you scoped
narrowly the first time is worth doing — the miss was in the boundary of
the search, not the logic.**

Also added: a "Not the same person" dismissal beside §13q's merge chip,
persisted in a new `distinct_pair` table, two-tap (not one) since it can
never be undone in the UI, visually set off from the merge chip so the two
opposite verdicts don't invite a mistap.

Shipped only after a background adversarial review (3 lenses, every
finding independently re-verified against the live source) turned up 13
real, non-blocker bugs across both this and the follow-up cross-check
work — all fixed before push: a new synced table missing from sync.js's
allow-list (would have silently failed to reach other devices), a
user-picked relationship silently dropped when the paste-import block
redirected to an existing person, a stale confirm-button label after that
redirect (caught independently by all three lenses), the claim-acceptance
reuse path dropping a drafted birth date instead of backfilling it, the
Edit-form's name-collision block discarding every OTHER edited field in
the same save (not just the name), a `distinct_pair` decision going stale
across `mergePerson`/`mergeCase` instead of following the merged identity,
and the accented-letter case-fold gap above. **A same underlying bug
surfacing independently across all three review lenses is a strong
signal it's real, not a false positive worth arguing with — fix it, don't
re-litigate it.**

**2026-09-11 — duplicate people, resolved from the People page (v86, SPEC
§13q).** "lisa is duplicated but i dont know how to resolve it. make the
process easier." `store.mergePerson()` already did the real work (built for
the Cases page's cross-case merge, 2026-09-06) — it just had no door on the
People page. Copied the Cases page's "Possible duplicate" chip pattern
exactly, one level down: people with the same trimmed, lower-cased name and
the same `kind` in the *same case* get the chip on the newer entry, oldest
is the keeper, two-tap confirm merges. A group of three or more
self-corrects on its own — merging one re-renders the page and recomputes
the group, no special handling needed. Deliberately does not touch the same
name across *different* cases — that is a design call about whether a
person can live in more than one case, raised to her separately rather than
folded in here.

**When one thing is missing everywhere it's used, build it once at the
primitive layer, then it's a chip's worth of work at every door it needs.**
`mergePerson` didn't need a single line changed — only a way to reach it
from a second screen.

**Ran an adversarial review before shipping this one — it caught a real
blocker.** This is a data-merge feature, and the first one to route
"same case, same name" into `mergePerson` as an *expected, common* case
(namesakes) rather than a rare coincidence. A 3-lens review (correctness,
data-safety, UI-consistency) plus an independent verify pass on every
finding found: merging two people who already have a relationship between
them silently deletes that relationship — `mergePerson` remaps both ends
of the row to the same kept id, sees a self-link, and drops it — while the
confirm text claims relations "move over." Fixed by never offering the
chip for a pair that's already directly related (checked via
`listRelationshipsForPerson` in `js/pages/people.js`, not in the shared
primitive — the fix stays scoped to this one door). Also added: birth
years on the confirm step itself when known (visible on tap, not a
hover-only title — a second, cheaper finding), the same-`kind` filter
above, a stale "— not removed" line in the Cases page's own ⋯ menu that
this feature made misleading (now "— resolve them from People"), and a
missing hover/lift treatment on the chip that the Cases page's own
duplicate chip already had. **Lesson for next time a feature reuses an
existing merge primitive for a new common case: ask what happens when the
two things being merged already reference each other** — that's the shape
this blocker took, and it won't be the last data-merge feature to need the
question asked.

**Working rules learned the hard way this week:**
- One `Edit` per file per message. Two edits to the same file in one
  batch race each other and one silently lands on stale text; edit other
  files in the same message instead, or do a full `Write` when the file
  is entirely in context.
- The local preview's service worker re-installs on every reload and
  then serves the *cached* module — an edit made after that reload is
  invisible until the SW and caches are cleared again. Clear both before
  every verification reload, not just the first.

**Don't make her become the UI designer.** She communicates intentions,
preferences and frustrations in normal language; this ruleset fills in the
technical and design gaps with real expertise. She describes the
destination, this ruleset determines the route.

**When unsure, don't guess silently.** Say what decision is uncertain, give
a recommended option, and ask one focused question.

**The goal isn't just "looks better."** Faster. Easier. Smarter. More
space-efficient. More cohesive. More enjoyable. The finished product should
feel like something she would have designed — but better than she could
have alone, because real expertise was contributed.
