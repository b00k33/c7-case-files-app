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
