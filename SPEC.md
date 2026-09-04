# C7 Case Files — local app spec

A local web app for building research files on people (and households, and
historical figures), attaching evidence to them, and reading numerology /
astrology patterns off the dates.

One folder. One SQLite file. No cloud, no account, no network needed.

## 1. The one trade-off to accept up front

A folder of files opened straight from disk (`file://`) cannot load ES
modules, cannot load WebAssembly, and cannot use the File System Access API.
Chrome blocks all three. So a browser-based local app has to be served, even
locally.

Resolution, originally: a one-double-click launcher next to the app
(`start.command` on macOS, `start.bat` + `serve.ps1` on Windows) serving
the folder on `localhost:8777`. **Retired 2026-09-03**, once both devices
ran from the cloud (§9): the app is served from GitHub Pages and installed
as a PWA, so nothing local needs to be served any more. The files live on
in git history only. Still no npm, no build step, no bundler.

## 2. Folder shape

```
c7-case-files/
  index.html                the only page
  css/
    tokens.css             colours, type, spacing — the design system
    app.css                layout + components
  js/
    main.js                boot, routing, page mount
    db.js                  open/save the SQLite file, migrations
    schema.sql             the whole database, as SQL
    numerology.js          pure functions, no DOM
    chinese.js             animal + element + lunar-new-year boundary
    western.js              sun sign + cusp
    relations.js            clash / trine / harmony / same
    stats.js                observed vs expected
    indicators.js           renders the indicator tokens (shared everywhere)
    pages/
      dashboard.js  subject.js  evidence.js  board.js
      relations.js  patterns.js  import.js  review.js  video.js
  vendor/
    sql-wasm.js             sql.js (SQLite compiled to WASM)
    sql-wasm.wasm
  data/
    c7.db                   THE database
    assets/                 the actual screenshots, PDFs, clips
    backups/                timestamped copies, kept automatically
```

Why binaries live beside the database, not inside it: the `.db` stays small
enough to open instantly and back up in seconds. The database stores each
file's path, size and SHA-256; the bytes sit in `data/assets/`. Move the whole
`data/` folder and nothing breaks.

## 3. Saving

- The app loads `data/c7.db` into memory on boot.
- Every write marks the database dirty.
- A dirty database is written back 2 seconds after the last change, and on
  page hide.
- Before each write, the previous file is copied to
  `data/backups/c7-YYYYMMDD-HHMMSS.db`. Keep the last 30, delete older.
- A visible save state in the header: saved · saving · unsaved changes.
- Never a silent failure. If a write fails, say so in the header and stop
  overwriting.

## 4. Database

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
-- meta('schema_version','1')

CREATE TABLE case_file (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'research',   -- research | history
  description TEXT,
  era_start INTEGER, era_end INTEGER,      -- years, for the board strip
  owner_id TEXT NOT NULL DEFAULT 'local',  -- always 'local' now; the seam for accounts later
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE person (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  case_id TEXT REFERENCES case_file(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'person',     -- person | household | org
  display_name TEXT NOT NULL,
  name_at_birth TEXT,                      -- drives expression/soul-urge
  ref_code TEXT,                           -- REF-0142

  -- birth, held honestly
  birth_date TEXT,                         -- ISO 'YYYY-MM-DD' when known
  birth_precision TEXT NOT NULL DEFAULT 'unknown',
                                           -- day | month | year | range | unknown
  birth_year_min INTEGER, birth_year_max INTEGER,   -- for 'range'
  birth_time TEXT,                         -- 'HH:MM'
  birth_time_precision TEXT DEFAULT 'unknown',      -- exact | approx | unknown
  birth_place TEXT, birth_lat REAL, birth_lng REAL, birth_tz TEXT,

  death_date TEXT, death_precision TEXT DEFAULT 'unknown',
  occupation TEXT, status TEXT DEFAULT 'active',    -- active|watch|cold|archived
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE person_alias (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  kind TEXT DEFAULT 'other'                -- handle|maiden|title|nickname|other
);

CREATE TABLE address (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  label TEXT NOT NULL, from_year INTEGER, to_year INTEGER, notes TEXT
);

CREATE TABLE relationship (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  case_id TEXT REFERENCES case_file(id) ON DELETE CASCADE,
  a_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  b_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                      -- parent|spouse|sibling|business|associate|household
  start_date TEXT, end_date TEXT,
  confidence INTEGER DEFAULT 50,           -- 0..100
  confirmed INTEGER DEFAULT 0,             -- 0 = unconfirmed, drawn dashed
  notes TEXT
);
-- 'parent' means a_id is the parent of b_id. Direction matters.

CREATE TABLE event (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  case_id TEXT REFERENCES case_file(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES person(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT,                               -- birth|death|marriage|move|business|other
  date TEXT, date_precision TEXT DEFAULT 'day',
  date_year_min INTEGER, date_year_max INTEGER,
  place TEXT, notes TEXT
);

CREATE TABLE source (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  name TEXT NOT NULL,
  kind TEXT NOT NULL,   -- state|primary|secondary|hostile|dramatisation|own|lecture|documentary
  agenda_note TEXT,
  counts_as_evidence INTEGER NOT NULL DEFAULT 1   -- dramatisation = 0
);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  case_id TEXT REFERENCES case_file(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                      -- screenshot|photo|clipping|document|note|video|audio
  title TEXT NOT NULL,
  source_id TEXT REFERENCES source(id),
  original_url TEXT, archive_url TEXT,
  captured_at TEXT, captured_by TEXT,
  file_path TEXT,                          -- relative to data/assets/
  sha256 TEXT, bytes INTEGER, mime TEXT,
  duration_ms INTEGER,                     -- video/audio
  dated TEXT, date_precision TEXT DEFAULT 'day',   -- when the CONTENT is from
  verification TEXT NOT NULL DEFAULT 'drafted',
      -- two_plus | single | disputed | dead_link | drafted
  extracted_text TEXT,
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE video_moment (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  t_ms INTEGER NOT NULL,
  label TEXT, note TEXT, quote TEXT,
  conflicts INTEGER DEFAULT 0
);

CREATE TABLE evidence_link (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  moment_id TEXT REFERENCES video_moment(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,               -- person|event|relationship|claim
  target_id TEXT NOT NULL,
  note TEXT
);

CREATE TABLE tag (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, colour TEXT);
CREATE TABLE tagging (
  tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, target_id TEXT NOT NULL,
  PRIMARY KEY (tag_id, target_type, target_id)
);

-- the review queue: every drafted fact before it is believed
CREATE TABLE claim (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  case_id TEXT REFERENCES case_file(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, target_id TEXT,
  field TEXT NOT NULL,                     -- 'birth_date', 'relationship', ...
  value TEXT NOT NULL,                     -- JSON
  origin TEXT NOT NULL,                    -- import|paste|lookup|user
  state TEXT NOT NULL DEFAULT 'drafted',   -- drafted|accepted|rejected|question
  rationale TEXT,
  created_at TEXT NOT NULL, decided_at TEXT
);

CREATE TABLE question (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  case_id TEXT REFERENCES case_file(id) ON DELETE CASCADE,
  text TEXT NOT NULL, resolved INTEGER DEFAULT 0, notes TEXT
);

CREATE TABLE finding (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  case_id TEXT REFERENCES case_file(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  kind TEXT,                               -- clash|trine|harmony|same|number|seasonal
  observed REAL, expected REAL,
  kept INTEGER DEFAULT 0,                  -- she pressed "keep this"
  notes TEXT, created_at TEXT NOT NULL
);

-- append-only history: undo today, sync between devices later
CREATE TABLE change_log (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  op TEXT NOT NULL,                        -- insert | update | delete
  payload TEXT NOT NULL,                   -- JSON of the change
  at TEXT NOT NULL, device TEXT
);

CREATE INDEX idx_person_case ON person(case_id);
CREATE INDEX idx_event_case_date ON event(case_id, date);
CREATE INDEX idx_evidence_case ON evidence(case_id);
CREATE INDEX idx_link_target ON evidence_link(target_type, target_id);
CREATE INDEX idx_claim_state ON claim(case_id, state);
CREATE INDEX idx_changelog_at ON change_log(at);
```

Nothing derived is ever stored. No life-path column, no sun-sign column. Every
number and sign is computed on read from the date. Change the date and every
screen is right immediately, with no migration and no stale cache.

## 4b. Built so it can go live later — decide this now, not later

Going from a local app to a hosted one is cheap if four decisions are made at
the start, and expensive if they are not. All four cost nothing today.

1. UUID primary keys, generated in the browser. Autoincrement integers
   collide the moment two databases merge — two people both have a
   `person 7`. Every `id` is a UUID v4 from `crypto.randomUUID()`. This is the
   single decision that makes sync possible at all.
2. The UI never touches SQL. All data access goes through `js/store.js`,
   which exposes plain async functions — `listPeople(caseId)`, `getPerson(id)`,
   `saveEvidence(obj)`, `upsertRelationship(obj)`. Local, they run SQL against
   sql.js. Hosted, the same functions become `fetch()` calls to an API and
   nothing else in the app changes. Every page must be written as if the data
   were already remote: always `await`, always handle a failure, never assume
   a query is instant.
3. SQL that Postgres also speaks. No SQLite-only syntax. Timestamps are
   ISO-8601 UTC strings. Explicit foreign keys. No `AUTOINCREMENT`, no `rowid`
   tricks, no comparing dates with SQLite date functions — do date maths in
   JavaScript. This schema should port to Postgres by changing almost
   nothing.
4. Audit columns and a change log from day one. `created_at`, `updated_at`,
   `deleted_at` on the tables that matter, plus an append-only `change_log`.
   Locally this gives undo and a history panel. Remotely it is what makes two
   devices reconcilable. Deletes are always soft.

Also, quietly, now:

- `owner_id` on `case_file`, always `'local'`. Adding a tenancy column to a
  live database later is a migration nobody enjoys.
- Assets are identified by SHA-256, not by path. The path is a convenience;
  the hash is the identity. When files move to object storage, the hash still
  points at the right bytes.
- Every calculation module (`numerology`, `chinese`, `western`, `relations`,
  `stats`) stays pure and dependency-free — no DOM, no database, no globals.
  The same file then runs in a browser, in Node on a server, or in a worker,
  with no port.

What genuinely does change when it goes live, and should not be pretended
away: accounts and passwords, someone else's backups, a monthly bill, and —
for files about named living people — a real duty of care over data that used
to never leave one laptop. None of that is a reason to build differently now.
All of it is a reason to keep the local version working forever as the
fallback.

## 5. The calculation modules — pure functions, unit-tested

`numerology.js`

```
reduce(n, keepMaster = true)   -> {value, master}   11/22/33 survive when keepMaster
lifePath(dateISO)              -> {value, master, parts, ok}
expression(fullName)           -> Pythagorean A=1..I=9, J=1..R=9, S=1..Z=8
soulUrge(fullName)             -> vowels only (Y is a consonant unless it is the
                                  only vowel in the syllable — document the choice)
personality(fullName)          -> consonants only
birthdayNumber(dateISO)        -> reduce(day)
personalYear(birthISO, year)   -> reduce(birthDay + birthMonth + reduce(year))
universalYear(year)            -> reduce(year)
```

Rules:

- Any function given a date without a day and month returns
  `{ok: false, reason: 'needs a day and month'}`. It never guesses.
- Master numbers are returned unreduced with a flag, and rendered with the
  double ring.
- Show the working. `lifePath` returns `parts` so the UI can print
  `13→4 · 11→2 · 1981→1 · = 7`.

`chinese.js`

```
animalIndex(year)   -> 0..11, 0 = Rat, from ((year - 1984) % 12 + 12) % 12
elementIndex(year)  -> 0..4  Wood Fire Earth Metal Water, from the 10-stem cycle
                       ((year - 1984) % 10 + 10) % 10, pairs of two years each
signFor(dateISO)    -> {animal, element, boundary}
```

The lunar new year matters. Include a lookup table of Chinese New Year dates.
A birth before that year's new year belongs to the previous animal year. If
the date falls between 1 January and 21 February and the table has no entry
for that year, return `boundary: true` and the UI renders the half-token.
Never silently pick a side.

`relations.js` — closed forms, no lookup tables needed

```
clash(i, j)    -> (i - j + 12) % 12 === 6
trine(i, j)    -> i !== j && i % 4 === j % 4
harmony(i, j)  -> (i + j) === 1 || (i + j) === 13
same(i, j)     -> i === j
relation(i, j) -> 'clash' | 'trine' | 'harmony' | 'same' | 'neutral'
```

`western.js`

```
sunSign(dateISO) -> {sign, cusp}     cusp = true within 1 day of a boundary
```

`stats.js`

```
expectedCounts(nPairs) -> { clash: nPairs/12, trine: nPairs*2/12,
                            harmony: nPairs/12, same: nPairs/12 }
```

Every pattern panel prints observed and expected, side by side, always. No
panel is allowed to show an observed count alone.

## 6. Pages

1. Dashboard — search, file table, evidence-by-type bars, needs-attention,
   saved searches, recent activity.
2. Subject file — identity, addresses, relations, chart wheel or the refusal
   panel, timeline with per-entry sourcing, confidence bars, open questions,
   attached evidence.
3. Evidence — Grid / Board / Table toggle. Grid with filters; item drawer
   showing full provenance and chain of handling.
4. Board — cork background, the year strip (personal year / universal year /
   record density, switchable), cards hung on string at their year, undated
   tray, string legend.
5. Relations — the family **tree** (2026-09-03, her eight popup answers):
   generation rows, oldest on top; a face (photo, initials fallback), name
   and years per person; spouses side by side joined by a line, children
   hanging from a bar, siblings oldest → youngest; dotted lines for
   unconfirmed links; godparents as a small tag plus a dotted curve. On a
   profile's Relations tab the person is the focus (brass ring) and the
   tree opens at their row ± 1 generation with "Up 1 / Down 1 / Expand
   all" and "+ N above/below" chips; the family overview shows the whole
   case. "Numbers" toggles the life-path/animal/sun tokens under each
   face; "Godparents" (off by default, 2026-09-03 — they were most of the
   clutter on a 56-person tree) toggles the dotted godparent curves and
   the godchild/godparent tags. **Filters (2026-09-03, her ask "let me
   filter through generations/families"):** a per-case *Family* picker —
   one person's line: them, their spouses, their descendants and the
   descendants' spouses; the picker lists everyone with a child — and a
   per-case *Generations* range (row A to row B of the whole case, 1 =
   oldest). Both are remembered, combine, and the tree, the zodiac map,
   the other-connections list and the number panels all obey them; the
   header reads "N of M people". Non-family links (business, associate, household) are listed
   under the tree as "Other connections". The **zodiac map** toggle
   (redesigned 2026-09-03, her eight popup answers) is four trine zones —
   Blue · Yellow / Green · Pink, clashing trines diagonal — each grouped by
   exact animal with counts, a face and short name per person, no
   web of lines ("the picture is simply who shares a trine") — only a red
   ✕ line between two PEOPLE in a direct family relationship (parent,
   spouse, sibling) whose animals clash, e.g. a Pig married to a Snake
   (v53, her call: "show opposites in direct relationships"); people
   without a settled birth year sit in a tray below; on the phone the
   zones stack as bands. Layout is pure (`js/tree.js`: generations by
   relaxation over parent/spouse/sibling links, couple units, recursive
   widths); the page only draws. **Sibling groups (2026-09-03, her ask):**
   when a couple has four or more children who carry nothing but "child
   of these parents" (no spouse, no children, no godparent link, not the
   focus), those fold into one block — small faces in rows of four,
   oldest first, first names, a life-path number when Numbers is on — hung
   from a single line; the connected children stay full nodes beside the
   block so their own branches hang cleanly. A generation holding a block
   is as tall as the block. The block's one line is confirmed only when
   every member's link is, and its brass dot confirms them all at once.
   **Every line is a row the file holds (review, 2026-09-03):** a person
   with two marriages stands between them (first spouse left, later ones
   right; a marriage that cannot sit next to them arcs over the faces
   between) and each line joins the two people it belongs to — never the
   two spouses to each other; a set of children drops from the midpoint of
   THEIR parents, one trunk and bar per set, so half-siblings fold into
   separate blocks and never hang from a step-parent; a parent who stands
   in another unit (married again, or a parent of a child of two units)
   still gets a broken line drawn across the tree; the confirm dot on a
   drop writes only to the parent row in its own direction. A godparent
   link places a person one row below the godparent only when the family
   rows do not place them already (otherwise a sibling standing godparent
   could never settle); contradictory rows are numbered without gaps so
   the tree never holds an empty generation. Fit never goes below
   four-fifths — a wide tree scrolls sideways instead of shrinking past
   legibility (her pick).
   Fit, − / +, drag-pan and Expand (full screen) control the view. Below:
   repeating-number panel and life-path grid. **Confirm (2026-09-03):** a recorded-but-unconfirmed
   link carries a small brass dot at its midpoint on the tree — one tap
   confirms it; the profile's Relations panel shows "unconfirmed · confirm"
   (one tap) or "confirmed ✓" (two taps to un-confirm). Implied links
   (inferred from co-parents or siblings) have no dot: there is nothing
   recorded to confirm until the relationship itself is added.
6. Patterns — the pair matrix, selected-pair readout, children-vs-parents
   band, event-date numbers, findings with observed vs expected, control
   test.
7. Import — describe a topic / paste text / look up a record. Everything
   drafted, at zero confidence, into the queue. The unverified lock cannot be
   turned off.
7b. **Questions & theories (2026-09-03, her ask: "in fiction I have
   questions about the world and research theories I like").** A
   "Questions" tab in the case workspace (and `#/questions` for a family
   case — the case card's "N open" badge and the family page's Questions
   button open it). A question is about the world / the case, or about a
   person (the profile's Open questions panel lists that person's own,
   with "+ Ask about <name>" adding one in place). Under each question
   sit its theories — each with evidence attached from the case's own
   items or by pasting a link (which becomes an evidence item, source =
   the host) and a "why it convinces me" line. ★ marks the theories she
   leans towards, as many as she likes (chip: "★ leaning · N"). "Mark
   answered…" asks which theory settled it and which evidence proves it
   (chip: green "answered"; the theory reads as won). Nothing here ever
   reaches a profile or Review — a theory is never a fact. Questions
   raised from Review land on the same page. Storage: the `question` table
   with `parent_id` (a theory), `person_id`, `pick`, `answer_id`,
   `created_at`; evidence via `evidence_link` target_type 'question'. On
   the phone the cards start collapsed. Filter All / Open / ★ Leaning /
   Answered, remembered.
   **Theory timelines (2026-09-04, her ask: a fan analysis of Taylor
   Swift's love life as dated entries with song references; eight popup
   answers).** A theory can carry a timeline: entries are `event` rows
   with `theory_id` set — never the record. "+ Entry" or "Paste a
   timeline…", one line each: `date | what happened | with: Name | ♪ song,
   ♪ song | "quote" · mm:ss`. The date keeps its honesty (2016-06-01 a
   day, 2016-06 a month, 2016 a year, 2016–2017 a range); ♪ become song
   chips (`event.songs`); `with:` names become people — found or created —
   plus a theory-only partner link (`relationship.theory_id`) to the
   question's person, drawn as a fine dashed violet curve on the tree
   with no confirm dot, chipped "theory" on the profile and under Other
   connections, never in Review, no clash line on the map; the source
   link or pasted transcript becomes evidence on the theory (a YouTube
   link a video item), and a timestamped quote becomes a moment on that
   video, linked to the entry. The person's own timeline shows theory
   events dimmed and chipped (her call). The messy transcript is read by
   Claude in chat; the app only ever reads the clean lines. Board string
   for theories: agreed (dashed, off by default), not yet built.
8. Review — one claim at a time (and, since v54, one unconfirmed
   relationship at a time: Confirm / Skip / Remove / Question — her ask
   2026-09-03 "allow for review"), keyboard A / S / E / R / ?, bulk actions,
   projected confidence.
9. Video — player, marked moments, source-kind rating, conflict flags,
   citation preview.

## 7. Indicator rules (shared by every page)

- Colour says how sure. Form says what it is.
  - filled disc = life path · open ring = personal year · double ring =
    master number · twelve-spoke wheel with one sector = animal year, element
    letter in the hub · square with three capitals = sun sign · half token =
    on a boundary
  - gold = sourced · grey = drafted · hollow = unknown · red ring =
    contradicted
- Relations are drawn on the connecting line: two slashes = clash, triangle =
  trine, linked rings = harmony, equals = same sign, dashed with a question
  mark = one birth year unsettled.
- Maximum three tokens on a card, four on a node, two bands on a timeline.
- An indicator is never omitted because data is missing. Hollow token,
  always.

## 8. Non-negotiable behaviours

1. Nothing computed from a date the file does not hold.
2. Drafted facts never raise a confidence figure.
3. Dramatisations can be stored and tagged but can never raise confidence.
4. Every observed count is shown beside its expected count.
5. Deleting is always soft first — a `deleted_at`, restorable for 30 days.

## 9. The cloud era (2026-09-01) — how the app actually runs now

Her decision, after the phone request: cloud is the master copy. The
original local-only model above still describes the data rules; what
changed is where the app lives and how devices share it.

- **Live app:** GitHub Pages, `https://b00k33.github.io/c7-case-files-app/`
  (public deploy repo; the private repo is the backup). Installable —
  manifest + service worker; updates surface as a tap-to-reload chip,
  never an auto-reload. `sw.js` `CACHE_VERSION` must be bumped every
  deploy push.
- **Storage modes** (`js/db.js`): `folder` on desktop Chrome/Edge (the
  original File System Access flow, unchanged) and `idb` everywhere else
  (phones — same SQLite, persisted in the browser's IndexedDB, no connect
  screen, 5 rolling backups). Phones do not seed the example case.
- **Sync** (`js/sync.js`): record-by-record against one `c7_records` table
  (entity + id + row JSON + tombstone) living inside the Book33 Supabase
  project — her call, keeping C7 beside the personal planner and away from
  the pharmacy's business database; owner-only row security. Every cycle
  pulls before it pushes; deletes are tombstones; per-record
  last-writer-wins; a pending local edit is never overwritten by a pull;
  sync never blocks boot. `change_log` stays device-local. Auth is her
  existing Supabase login in C7's own session slot (`c7-sb-auth`).
  Two timestamps, two jobs (fixed 2026-09-02, c7-v23): the cloud row's
  `updated_at` is the **push time** and drives the pull cursor, so a
  phone edit pushed late can never be skipped by a desktop that has
  already pulled past its edit time; the row's own `updated_at` inside
  `data` decides last-writer-wins. Pulls re-read a ten-minute overlap
  (re-applying is harmless, missing is not). A change pushes ~3s after it
  lands in the outbox and when the tab goes hidden, not only on the
  minute tick — on the phone the app is closed long before a minute.
  **Recovery (c7-v32):** the sync drawer shows "This device holds N cases
  · N people" and offers **Re-pull everything** (resets the pull cursor
  and fetches the whole cloud; last-writer-wins makes re-applying safe).
  A pull that brings rows in persists them immediately and redraws the
  current page, unless she is typing or a drawer is open.
- **Migration:** the first sign-in against an empty cloud uploads the whole
  local database once. Later devices pull instead, and an untouched
  example case is removed rather than duplicated.
- **Identity, not spelling (2026-09-03).** `person.wikidata_id` records the
  item a lookup matched. A relative's own lookup — either side, any later
  time — recognises an existing person by this first, the name second, so
  "Henry VIII" and "Henry VIII of England" from two different articles
  become one king, not two. Set the moment a person is matched or created
  through a lookup or Insert family; `findDuplicates` also flags two
  people sharing one `wikidata_id` as one person under two spellings.
- **Third-party lookups (her rule change, 2026-09-02):** the app may make
  read-only, user-triggered requests to Wikidata and Wikipedia (public APIs,
  no key; nothing sent but the searched name). Results never touch a record
  directly — each fact becomes a drafted claim in Review citing its Wikidata
  property, and one Wikipedia evidence item is linked to the person so the
  citation exists before anything is accepted (`js/lookup.js`). The
  article's lead picture is fetched once from Wikimedia and stored as the
  person's profile picture (`person.photo_path`, origin kept in
  `photo_url`) — an identification aid, saved directly, replaceable by her
  own upload. **Relatives (2026-09-03, her nine answers):** the lookup also
  reads father, mother, siblings, children, spouses, godparents, and
  godchildren (the last via one read-only SPARQL query, because Wikidata
  records godparents on the child). Each relative is one drafted claim
  (`field: relative` — name, role, Wikidata id, birth and death dates);
  accepting it links the person already in the case with that name, or
  creates them with their dates, then draws the relationship — unconfirmed,
  confidence 70, citing the property. A lookup never drafts an identical
  claim twice and reuses the article's evidence item. `godparent` is a
  relationship kind (A is the godparent of B). **Duplicates (same day):**
  `findDuplicates`/`removeDuplicates` — exact-copy drafted claims and
  evidence sharing one link (links and video moments move to the kept,
  oldest item); same-name people are only counted. Offered as a line above
  the Review queue and as "Clean up duplicates · N" in the case card's ⋯
  menu, both two-tap. **Insert family (2026-09-03, her four popup
  answers — "make it easy for me"):** the one deliberate exception to
  "everything through Review". The button beside Look up on a profile
  reads the person's Wikidata record and, for every direct relative,
  creates the person (or matches the one already in the case by name),
  draws the relationship (unconfirmed, 70, cited), then fills the new
  person's own profile from their record — dates, birthplace,
  nationality, gender, occupation, picture — and links their Wikipedia
  article as evidence. Each applied fact is stored as an already-accepted
  claim citing its property, so the audit trail matches a Review accept.
  Existing, already-filled people are left alone. Direct family only.
- **A lookup corrects an unformatted name (v61, 2026-09-04, her ask — "make
  sure future cases can use correct spelling from wikipedia" after
  finding "jk rowling" in her own data):** `fillFromWikidata` now sets
  `display_name` to the item's Wikidata label when the CURRENT name has no
  real capitalisation at all — all-lowercase or all-caps, the shape of a
  name typed in a hurry — recorded as an accepted claim like any other
  applied fact. An already-properly-cased name that's simply shorter or
  different ("Henry VIII" vs Wikidata's "Henry VIII of England", "King
  Charles" vs "Charles III") is a deliberate choice and is never touched.
  Same audit turned up a real bug in `fetchProfile`: it asked Wikidata for
  `languages=en` only, so any item whose label lives solely under `mul`
  (the "same in every language" code — J. K. Rowling's own item among
  them) came back unlabelled, silently falling back to its bare
  Q-number. Fixed to `en|mul` with English
  preferred when both exist — this was quietly breaking relative names,
  citations and now the name-fix above for any such item, not just hers.
  The only other third-party load is a YouTube thumbnail image for a linked video
  (`js/media.js`; an `<img>` from YouTube's image host, video id only,
  placeholder when offline). Nothing else; no automatic lookups.
- **The launcher is retired (2026-09-03).** `start.bat`, `serve.ps1` and
  `start.command` were removed once both her devices ran from the cloud;
  a localhost copy would edit the same folder as the live app from a
  separate origin — the two-live-masters trap — which is why the app still
  shows a steering notice to the live URL whenever it finds itself served
  from localhost. A "Download backup (.db)" button in the sync drawer
  exports the whole database as one SQLite file from any device.

## 10. The Cases home (2026-09-02) — selecting a case takes you somewhere

Her diagnosis: "when I select a person, nothing changes on the screen —
this box feels useless." A selector that only changes state is a broken
promise; every pick must land on a page. Twenty-eight questions later:

- **Home = Cases** (`js/pages/cases.js`), a list of picture cards, most
  recently opened first (`localStorage c7-case-opened`, per device). A
  card shows the case name, its picture (the person's face; up to three
  faces for a family), and attention badges only when earned ("14 to
  review", "1 image", "1 open") — never kind or count text. Import and
  Delete stay visible; ⋯ holds Rename and "Make it a family/person case".
  Delete is two-tap. One search box searches everything across every
  case (`store.searchAll`: case names, people, evidence titles/notes,
  video quotes) and each hit opens in its own case.
- **+ New can start from Wikipedia (v57, 2026-09-04, her ask):** beside
  Create, "Look up on Wikipedia" searches the typed name and lists the
  matches (description · item number); "Create from this" makes the case
  and the person filled straight from Wikidata — dates, birthplace,
  nationality, picture, Wikipedia evidence — with an optional "+ family"
  that inserts the relatives, then lands on the profile (a family case on
  its overview). Plain Create still makes a bare case by name.
- **Musicians' works (v58, 2026-09-04, her ask; four popup answers):** "+
  Works" on the profile's Look-up block, and a "+ works" tick in the
  Cases-page flow. `fetchWorks(qid)` lists the performer's works (P175)
  with type — album / compilation / live album / EP / single / song — and
  the earliest publication date (P577) via SPARQL; the picker shows type
  toggles (all on) and ticked rows; `addWorks()` turns each into a
  'release' event on the person — the record, an accepted claim citing
  P577 — reading the picked items through the entity API so the date
  keeps its real precision (day / month / year), never an invented day.
  A work already in the case (same Wikidata item, `event.wikidata_id`)
  is left alone. Items with several performers (duets, covers,
  standards) are marked "shared" and start unticked — their P577 is the
  song's first release, not hers — and the Cases-page tick skips them.
  Releases read "release · Wikidata" on the profile timeline with no
  confidence bar, and hang on the Board like any dated event. A ♪ chip
  on a theory entry shows the matching release's date.
  *How the read works (`js/works.js`, from a four-agent Wikidata probe,
  2026-09-04):* one light list query (items by P175 with P31 types, P7937
  form, a rough date, labels in "en,mul" — 92 of Taylor's items have no
  English label), then a VALUES-bounded detail query per 200 items
  (performer count, P577 with its precision, tracklist/composition links,
  album dates); one retry on 429/502/503/504; a 15-minute session cache
  per artist. One song is up to five items (composition / recording /
  single / song) — rows dedupe by their links, then by title, inside one
  pool, never across the album and single/song pools; a song row that is
  the same title as a single and undated or overlapping folds into it.
  "Best date" = genuinely earlier wins, overlapping ranges → the more
  precise. A recording with no date takes its album's ("via album"). A
  single query carrying it all ran 40–65 s and hit the service's limit.
- **A third case kind: Event (v59, 2026-09-04, her diagnosis — "i added
  world war 1. it is neither family or person. its a major event"; 8
  popup answers):** `+ New` → "A major event" makes a case with no
  auto-created subject person; it opens on its own overview instead
  (`js/pages/event.js`, `#/event/<tab>`). Header: an editable era
  (`case_file.era_start/era_end`, click to set) and a violet "Major
  event" badge — violet being the palette's own "historical subjects"
  colour. **Key figures**: the case's own person roster (own records,
  full profile fields, same as a family-case — not shared across cases),
  each a face card that opens their profile; "+ Add figure" adds one by
  name, and once they exist their profile's own Look up / + Works /
  Insert family work exactly as they do anywhere. **Timeline**: a flat,
  chronologically-sorted list of `event` rows scoped to the case
  (`case_id` set, `person_id` left null); each entry has a title, a
  loosely-typed date ("1914-06-28", "1914-08", "1914" or "1914-1918",
  parsed to the precision she actually gave — never a guessed day), a
  place, notes, and any number of key figures via `with_ids` (the same
  comma-joined-ids column the theory timelines already use for "with:
  Name" — several figures per entry, e.g. a battle with more than one
  commander). Edit/delete inline, same two-tap delete as everywhere
  else. Tabs: Overview · Evidence · Contradictions · Questions · Board
  — the same case-level pages Evidence/Board/etc. already are, mounted
  under the event header exactly as they mount under a person's on the
  profile. The Cases-home card gets a violet "Event" ribbon instead of a
  face; the "⋯" menu's kind-switcher offers the two kinds a case ISN'T
  as two direct one-click buttons (v60 — a person → family → event →
  person *cycle* hid "event" a click deep behind "family" for any case
  starting as a person, her screenshot), and switching a case to Event
  drops its auto-created placeholder person if it still looks untouched
  (blank fields, same name as the case) — how the existing "World War 1"
  case (made before Event existed) gets fixed up, in place, with its
  evidence kept.
- **Tapping a case goes in** (`openCase`): a person-case opens the
  person's profile (creating the person from the case name if the case
  is empty); a family-case — or an old research-kind case with several
  people — opens the **family overview** (`js/pages/family.js`: faces
  row, then the Relations map with its + Person / + Relationship); an
  event-case opens its own overview. The rail switcher does the same;
  "lands on the Dashboard" is retired.
- **The profile carries the case's workspace as tabs**: Profile ·
  Evidence · Contradictions · Questions · Board · Relations · Import
  (`#/subject/<id>/<tab>`). The tab pages are the same case-level
  modules mounted under the person's header; they re-render through
  `ctx.rerender()` so tabs stay tabs. Profile body order: basics strip,
  Profile panel (facts, paste box, Look up), timeline, chart,
  contradictions, addresses/relations, questions/evidence.
- **Back is a plain ← arrow** in the topbar on any inside-a-case route,
  returning to Cases. No breadcrumb.
- **People** (`js/pages/people.js`): everyone in every case, searchable,
  tap → profile.
- **Cases/People as a database, desktop only (v62, 2026-09-04, her ask —
  "change cases to database"):** `STYLE.md`'s own "tables over scattered
  cards" law had never actually been built. Both pages now carry a
  Table/Cards (People: Table/List) toggle in the header, `localStorage`
  per device (`c7-cases-view`, `c7-people-view`), defaulting to Table.
  Cases table columns: Name (face thumb), Kind, Era, People count,
  Attention (the same badges as a card), Last opened; sortable by Name /
  People / Last opened, click a header to sort, click again to reverse
  (`c7-cases-sort`). People table: Name, Case (chip coloured by the
  case's kind), Occupation, Nationality; sortable by Name / Case
  (`c7-people-sort`). A row's Import/⋯ actions fade in on hover and are
  the exact same `wireCaseMenu`/`wireImportBtn` the card view calls — no
  behaviour can drift between the two views. Row click opens the
  case/person exactly as a card does. Below 640px the toggle is hidden
  and the view is forced to Cards/List regardless of the stored
  preference — a dense table has nowhere to go on a phone.
- A brand-new person-case **offers** Look up on the fresh profile (one
  tap to run it, never automatic). Launch reopens the last route
  (`localStorage c7-last-hash`).
- Navigation: rail Cases · People · Review · Inbox · Patterns · Fun &
  Zodiac, with "Dashboard (old)" dimmed until ~2026-09-09; phone tab bar
  Cases · People · Review · Inbox · Fun. `#/inbox` is the Evidence page
  opened on its Inbox view.

## 12. Commercial milestones and the Compare view (v63, 2026-09-05)

Her ask — "brand analysis", mapping the *timing* of a musician's
commercial/financial success against their release history (Zara Larsson,
Lily Allen were the trigger, but this is a general capability, not
one-offs). Twelve popup answers landed on: dated facts only, no numeric
value field (most of this — deal size, streaming counts — isn't reliably
numeric); reuse the existing sourced/single/disputed system rather than
inventing a new confidence model; and build all three of the mocked
options (Board dots, a per-person tab, a multi-artist compare view).

- **Four categories, stored as plain `event.kind`** (`js/milestone-
  kinds.js`): `chart`, `certification`, `award`, `deal` — no schema
  change. Because Board already reads every row in the `event` table
  regardless of kind, a milestone shows on the year-strip for free the
  moment it's created; `js/pages/board.js` gives it a teal top border and
  its category as the sub-label instead of the raw kind string.
- **A "Commercial" tab** on the person profile (`js/pages/commercial.js`,
  after Import): a read-only Releases row (existing `release` events),
  then milestones grouped by category, each a chip with a confidence dot
  (green/amber/red, from the same `evidence.verification` → `evidence_
  link` pipeline the rest of the app already uses — **no new confidence
  model**) and a two-tap delete.
- **Bulk paste entry** (`js/milestone-parse.js`): she pastes several
  dated facts from one article, one per line ("2014 - certified gold in
  the UK"); `parseMilestoneText` extracts the date (reusing `profile-
  parse.js`'s `parseDate`) and guesses a category by keyword before
  showing an editable preview — kind dropdown + title per row, remove any
  row — she confirms before Save. One source note (a name or URL) and one
  confidence tier apply to the whole pasted batch: if given, one
  `evidence` row (`type:'note'`) is created and `evidence_link`ed to every
  milestone in the batch; if left blank, the milestones save as
  `drafted`/zero confidence, same as any other unsourced fact in C7.
- **Compare** (`js/pages/compare.js`, `#/compare`, linked from People and
  from the Commercial tab): pick any number of people across every case
  (not just musicians), toggle **Calendar year** (the real-world moment
  each hit a milestone) or **Years since debut** (their own timeline
  zeroed at their earliest dated release/milestone — a late starter isn't
  penalised) — her explicit correction: this is *not* about comparing
  artists to each other as people, only about laying their timing side by
  side. Each person's lane shows release dots (grey) and milestone dots
  (teal); the picked list and axis choice persist per device
  (`c7-compare-people`, `c7-compare-axis`). This is the first view in C7
  that reads across more than one case at once.

## 13. Two rules the 2026-09-03 review turned up

**Never calculate from a date the file does not hold.** The schema stores a
date *plus its precision*: `1923-06-01` with `birth_precision` `month` means
"June 1923" and the day is a placeholder. Every calculation module already
refuses to guess when handed nothing — but handed the placeholder it answers
confidently. So birth and death dates reach a calculation ONLY through
`js/person-dates.js` (`exactBirth`, `exactDeath`, `exactEventDate`), which
returns the date at day precision and null otherwise. Never read
`person.birth_date` directly into `lifePath`, `signFor`, `sunSign`,
`personalYear` or `birthdayNumber`.

**The cloud's `updated_at` is not unique, so never page on it alone.**
`push()` stamps a whole batch of 100 rows with one timestamp. Paging with
`gt(lastSeen)` steps over every other row sharing that instant and never
comes back for them (measured: 500 of 600 rows fetched, 100 lost). `pull()`
pages with `gte` plus the set of ids already applied at the cursor instant,
and raises a visible error rather than dropping records if a single instant
ever exceeds one page. `applyRemote` upserts (never INSERT OR REPLACE, which
blanks columns the sender did not carry) and reports whether anything really
changed, so the overlap window cannot repaint her screen every cycle.
