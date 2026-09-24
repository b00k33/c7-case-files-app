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
- **The profile Chart panel only surfaces five things** (2026-09-05, her
  call — "i dont use these things" re: expression/soul urge/personality
  and personal year): life path, day born (the raw birth day, unreduced),
  Chinese animal, sun sign, and "lucky number" (`birthdayNumber` under a
  friendlier label). `expression`/`soulUrge`/`personality`/`personalYear`/
  `universalYear` stay real, tested functions — just not rendered on the
  Chart panel any more. Don't re-add them there without her asking.

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

The Patterns page's relation-count panel (clash/trine/harmony/same, from
`expectedCounts`) prints observed and expected side by side — that
comparison is the whole point of a control test there. This does NOT
extend to every numeric display in the app: the Relations page's life-path
Repeats panel dropped its "chance would give X.X" comparison entirely
(2026-09-05, her call — "remove chance, i dont use it") and now shows the
observed count alone. Don't restore that comparison there, and don't add
it anywhere she hasn't asked for it.

## 6. Pages

1. Dashboard — search, file table, evidence-by-type bars, needs-attention,
   saved searches, recent activity.
2. Subject file — identity, addresses, relations, chart wheel or the refusal
   panel, timeline with per-entry sourcing, confidence bars, open questions,
   attached evidence.
3. Evidence — Grid / Board / Table toggle. Grid with filters; item drawer
   showing full provenance and chain of handling.
4. Board — cork background, the plain year strip, cards hung on string at
   their year, undated tray, string legend. The universal/personal-year/
   density mode switcher was removed (2026-09-05, her call — "i dont
   understand board... i dont use these things" about the numerology
   overlay generally): the strip just labels each year, nothing else. A
   commercial-milestone card (`js/milestone-kinds.js`) gets a teal top
   border and its category as the sub-label instead of the raw kind.
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
   **Year of marriage (2026-09-07):** every real (non-implied) marriage
   line carries a small tap target above its midpoint — a known year reads
   as "m. 2005" in brass mono; an unknown one is a quiet low-opacity dot,
   not a blank invitation, since most couples on a tree will never have
   this filled in. Either opens a one-field drawer (year only — Save or
   Clear) that writes `relationship.start_date` as `YYYY-01-01`, the same
   "day is a placeholder, only the year is ever shown" convention a
   month-precision birth date already uses. This is the schema's existing
   field, already read internally to order a person's marriages left-to-
   right — there had never been a UI to set it before, only to imply it
   from ordering.
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

## 13a. Fun & Zodiac — no duplicate people (v65/v67, 2026-09-05)

`js/pages/fun.js`'s "+ Add" used to create a brand-new person every click,
so retyping a name (to add a second trait, or a birth date noticed later)
made a second entry with no way to merge them. "+ Add" now matches the
typed name against everyone already in the Fun case, case-insensitively,
trimmed; a match reuses that person instead of creating a new one — new
traits merge onto the existing tags, a birth date fills in if the
existing record didn't have one, and a clip/quote adds a new evidence
item as before. An inline note says when this happened.

**Existing duplicates are folded away silently, no button (v67 — her
first cut, a "Duplicate names" panel with a two-tap Merge button per
group, was "too complicated, make it easier"):** every render of the
page scans its own people for same-name groups (case-insensitive,
trimmed) and merges each group's extras into its oldest entry
automatically, before anything is drawn — she never sees it happen
unless it just did, in which case a one-line note says so ("Folded 1
duplicate entry into the existing one — nothing lost, just tidied.").
This reuses `store.mergePerson(keepId, dupId)` — a thorough, pre-existing
function (aliases, addresses, events, contradictions, claims, evidence
links, tags, relationships all move to the survivor; any blank field on
the survivor is filled from the duplicate; the duplicate is
soft-deleted) that was written for the Wikidata-name-fix work but had
never actually been wired to anything in the app until now. Note this is
deliberately looser than the Cases page's own "Clean up duplicates"
(`findDuplicates`/`removeDuplicates`, `js/store.js`), which explicitly
never merges same-name PEOPLE in a real research case — two people
sharing a name there might genuinely be different people, so that call
stays hers to make per-case, manually. Fun & Zodiac is different: it's
explicitly "not research," so a fully automatic same-name merge is safe
by design and doesn't need her confirmation.

## 13b. Birth precision follows a typed date, everywhere (v68, 2026-09-06)

Every path that saves a birth date except one already set `birth_precision`
to `day` the instant a full date existed — quick-add on Relations/Fun/
Import, the Wikidata lookup, even a claim landing through Review
(`store.js`: `if (claim.field === 'birth_date') patch.birth_precision =
'day'`). The one holdout was the person profile's full "Edit" form
(`renderEditForm`, `js/pages/subject.js`): its "Birth precision" dropdown
(day/month/year/range/unknown) exists because this is the only form that
can also express month-only, year-only or a contested range — but that
meant typing a real day here also required remembering to separately flip
the dropdown to "day", something nothing else in the app asks for. Forget
it and the date is right but the precision is stale, which is a real bug:
`exactBirth()` (section 13's rule) then treats the day as unknown and every
calculation silently drops it.

Fixed to match the rest of the app: `#f-bdate`'s `change` handler now sets
`#f-bprec` to `day` automatically whenever the field holds a value. The
dropdown still exists and is still hers to set manually — but only for the
cases it actually exists for (leaving the date blank and using month/year/
range instead), not for the common case of typing an exact date. Caught in
a code3 pass (her invocation, 2026-09-06 — "lazy but does not want to
compromise on quality" — see `CLAUDE.md`): this is exactly that trade in
miniature, since removing the manual step also removes a way the data
could quietly end up wrong.

## 13c. Compare's axis toggle was invisible on a phone (v69, 2026-09-06)

`.view-toggle` (the pill switcher shared by People's Table/List and Cases'
grid/list) hides below 640px by CSS design — `@media (max-width: 640px)
{ .view-toggle { display: none; } }` — because on those two pages mobile
always has a fixed fallback (cards), so the switch has nothing to do
there. Compare (v63) reused the same class for its Calendar-year/
Years-since-debut axis switch without noticing that contract: Compare has
no fallback axis, so on a phone the control just vanished with no way to
reach "Years since debut" at all — a real functionality loss, not a
cosmetic one. Caught in the code3 mobile check she asked for right after
the v68 sweep.

Fixed by giving Compare's toggle its own `.axis-toggle` class
(`js/pages/compare.js`) with a scoped override
(`.axis-toggle { display: inline-flex !important; }`, `css/app.css`)
that keeps it visible at every width, leaving People/Cases' `.view-toggle`
behaviour untouched. **The lesson for next time:** reusing a shared class
for a new purpose means reading what its existing media queries assume,
not just its visual styling — an invisible-on-mobile rule that's correct
for a layout-view toggle is a bug for anything else hiding behind the same
class name.

## 13d. Duplicate CASES — flag + one-tap merge (v70, 2026-09-06)

Her screenshot: two separate cases, "Michael Jackson" and "Michael
jackson," each with its own person, evidence and events — created by
mistake, and nothing on the Cases page could see it. Each case's own
"⋯ → Clean up duplicates" (`findDuplicates`/`removeDuplicates`, section
13a) only ever looks *inside that one case* — duplicate claims, duplicate
evidence by URL, a same-name-person count it deliberately never removes.
It has no way to compare two case files against each other.

**Detection** (`findDuplicateCases`, `js/pages/cases.js`): every render of
the Cases page groups all `kind:'person'` cases by their subject's name
(`subjectOf`, case-insensitive, trimmed — the case's own name if it has no
person yet). A group of 2+ is a duplicate set; the oldest case is treated
as the original, every other case in the group gets a brass "Possible
duplicate of `<name>` →" badge next to its other attention badges (to
review / images / open questions), in both Cards and Table view. Family
and event cases are never flagged this way — merging a family or an event
isn't the same operation, and wasn't asked for.

**Merge** (`store.mergeCase(keepCaseId, dupCaseId, keepPersonId,
dupPersonId)`): the badge is a two-tap button (`twoTapConfirm`, so a stray
tap can't merge anything). Confirming re-homes every case-scoped row
(`person`, `relationship`, `event`, `evidence`, `claim`, `question`,
`finding`, `contradiction` — everything in schema.sql that carries a
`case_id`) from the duplicate case onto the kept one, then folds the two
matching subject people into one with the existing `mergePerson` (section
13a — aliases, addresses, events, contradictions, claims, evidence links,
tags, relationships all consolidate; blank fields on the survivor backfill
from the duplicate), then soft-deletes the now-empty case. Nothing is ever
merged without her tapping the badge twice — this flags, it never
auto-merges, unlike Fun & Zodiac's silent merge (section 13a), because a
real investigation might genuinely have two different people sharing a
name and that call has to stay hers.

*(Found in passing, not fixed here — flagged separately: `createPerson`'s
INSERT never actually writes `gender`, `nationality` or `marital_status`
even though `mergePerson`'s backfill and the claims pipeline both expect
those columns to exist on a freshly created person. No real code path
calls `createPerson` with those fields today, so it's dormant, not an
active bug — but worth closing so it doesn't become one.)*

## 13e. The offline shell had fallen behind the app (v71, 2026-09-06)

`sw.js`'s `SHELL` array precaches every file the app needs so it opens and
works with no connection at all (the data was always offline-first — it
lives in IndexedDB/the data folder — this is only about the app's own
code). It's a hand-maintained list, and it wasn't updated when several
pages shipped this week: `js/pages/event.js`, `js/pages/questions.js`,
`js/pages/compare.js`, `js/pages/commercial.js`, `js/milestone-kinds.js`,
`js/milestone-parse.js` and `js/works.js` all existed on disk and were
real, reachable routes (`main.js`'s `ROUTES`, or a tab under the profile)
but weren't in `SHELL` — so with no connection, opening Compare, an Event
case, Questions, or a profile's Commercial tab would fail outright (a
plain network error on the dynamic `import()`), while everything else in
the app kept working fine. Her ask ("make the app function offline")
caught a gap that had been silently growing since v63, not a
never-worked feature.

Fixed by diffing every `.js` file that actually exists in `js/` against
`SHELL` (`find js -name "*.js"` vs. the array) rather than eyeballing it,
so this is checked exhaustively rather than by memory next time. **The
lesson: a new page module means a `SHELL` entry, every time — nothing
else enforces this, and it fails silently (only offline, only on that one
route) rather than loudly.**

## 13f. "I don't enjoy using the app" — ask28 → Stage 1 quick wins (v73, 2026-09-07)

Her words: *"i dont enjoy using the app, theres friction in what i want to
see or search. its not smooth."* A 28-question round (AskUserQuestion
popups, four at a time, with a friction map of the real screens as the
visual guide) pinned down what she actually does and what gets in the way.
The answers that now shape the app:

- **What she opens it for:** the family tree, importing people, and their
  numbers — on both phone and desktop. The friction was *getting to the
  person*: a search box that only lived on Cases, results that landed on
  the wrong tab, a ← that always went home, and pictures popping in after
  the page.
- **The person is the unit, not the case.** People — every case, Fun
  included ("one pool of people") — is where she wants to land (Stage 2).
  A search hit on a person opens *the tree with them focused*, not the
  profile. She searches by name only.
- **On the person:** the numbers AND a ±1 tree slice, side by side; of the
  tabs she uses Relations, then Commercial/Board; everything that *puts*
  information on a person (paste, look up, insert family, works) goes
  behind one **+ Add** button; the page is one screen, same layout on both
  devices; ← goes back to where she came from.
- **Smoothness:** only pictures popping in bothered her; tabs should be
  instant; scroll position remembered; never a strip over the page.
- **Cut:** the old Dashboard route. Keep: Fun, Compare, To do.
- **Order:** quick wins on the current layout first (this section), then
  the People-home + one-screen person page redesign (Stage 2, mocked and
  approved: `c7-redesign-mock.html` in the 2026-09-07 session).

**Stage 1 — what shipped in v73, on the existing layout:**

1. **One search box, top of every page** (`index.html` `#global-search`,
   wired in `main.js`). Results as she types (120 ms debounce), every case,
   Fun people marked ✦. A person opens `#/subject/<id>/relations` (a Fun
   person their profile — no family to show); evidence/quotes/cases open
   where they always did. Escape, a tap outside, or a route change hides
   it; Enter opens the first hit. A person-kind case whose person is also a
   hit is dropped (it would be the same row twice). `store.searchAll` now
   includes Fun people and returns `case_kind` on people and cases. The
   Cases and People pages lost their own search boxes (a count sits in the
   space).
2. **← goes back to where she came from** — a per-session screen stack
   (`sessionStorage c7-nav-stack`), where every tab on one person counts
   as one screen, so ← from a Relations tab leaves the person; with
   nothing behind it, home.
3. **Faces arrive with the page.** `assets.preloadImage(src, 800)` decodes
   a picture (or gives up after 800 ms, or reports a broken source) before
   the `<img>` goes in; Cases (`faceEl`), People, Family and the tree
   (`loadFace`, all faces side by side, tree waits for the batch) all use
   it. No more initials-then-photo flicker.
4. **+ Add on the profile** — the paste box, Look up, + Works and Insert
   family moved out of the page into a drawer titled "Add to <name>". The
   block is built with the page (handlers wired once, scoped to `tools`)
   and *moved* into the drawer; results (`#pi-result`) stay on the page and
   the drawer closes when a save lands. Enter in the Look up field looks
   up (it used to hit the drawer's first primary button — the paste save).
5. **Profile tab order: Chart → Timeline → Profile grid** — the numbers
   first, the facts grid last; the duplicate Edit button in the Profile
   panel went (the header's one is enough).
6. **Tabs: Profile · Relations · Commercial · Board · ⋯** — the other four
   (Evidence, Contradictions, Questions, Import) open with one tap on ⋯,
   remembered for the session (`c7-tabs-more`), and are always shown when
   she lands on one of them.
7. **No strips over the page.** Install lives only in the sync drawer;
   the "old copy" notice is gone; a waiting update turns the sync chip
   brass ("⇅ update ready") and the drawer's first button applies it —
   still never on its own. `Dashboard (old)` left the rail and the routes
   (`pages/dashboard.js` stays for `createCaseOfKind`/`CASE_KINDS`).

Also in v73: a profile "Look up" corrects a lowercase name the same way
Insert family already did (`draftFromLookup` returns `renamed`; the case is
renamed too when it carried the same lowercase name) — her Andrew
Bustamante report.

## 13g. "It looks too dark, the gold is too light" — two grounds, and the life map (v74 →, 2026-09-07)

Her words, right after Stage 1 went live: *"improve the design. it looks
too dark. and the gold is too light. the visual design is also too plain,
too many words. i like visual displays. i want to be able to see person,
what things they did (their significant dates/years), who they married,
who their family are, whats the astrological compatibility/incompatibility
they have with when they do things why did it fail or was successful."*

Sixteen questions against a mock (`c7-visual-redesign-guide.html`: three
grounds, four golds, a "life map" of Michael Jackson with every number
computed by the app's own modules). Her answers, which now govern:

**Ground & gold (shipped v74):**
- **Both grounds — paper by day, ink by night**, following the phone's
  setting by default; Follow phone · Day · Night in the sync drawer
  (`localStorage c7-theme`; `index.html` stamps `data-theme` before first
  paint). STYLE §1 holds both palettes. The night ground is two steps
  lighter and warmer than the old one.
- **Gold: antique `#c9922e` on ink, old gold `#a8731c` on paper** — the
  brass was too pale. `--on-brass` is the text on a brass surface.
- **Her zodiac colour code keeps its code, shades tuned per ground** (a
  step deeper on paper); the values moved from app.css to tokens.css.
- **Words: short labels stay visible**; sentences (rationale, source,
  gloss) move behind a tap. Panel titles go where an eyebrow will do.

**The life map — the person page (next push, previewed first):**
- **It IS the person page**: replaces the Profile tab's Chart / Timeline /
  Profile-grid panels; the facts grid sits behind a "details" tap;
  Relations · Commercial · Board stay as tabs.
- **Life line: a ribbon on the page, the year list on tap.** Every year
  from birth coloured by their personal year (gold 1·8, teal 3·5, red 7·9,
  violet 11·22, grey 2·4·6); marks above it for what they did (♪ release
  · ♥ married · ✕ divorced · ⚖ trial · ⚠ crisis · ✝ died · milestones);
  on the phone the ribbon fits the screen and crowded marks stack in rows.
- **Worked / failed: infer where the record says so, she tags the rest.**
  A divorce ends a marriage; a chart #1, award or certification = worked;
  a death = end; anything else stays grey until she taps ✓ or ✕ on the
  mark. Never a guess dressed as a fact.
- **The "why" line on a mark:** their personal year with the GG33
  lean-in/caution gloss; the calendar year's animal against theirs
  (trine · clash · harmony · same · neutral); for a marriage the two
  people's animals and life-path tier; and the two sun signs (shown, no
  verdict — the app has no Western compatibility rule of its own).
- **The circle: cards on the page, the tree one tap away.** Spouse cards
  carry married year → ended year with both personal years; family cards
  carry the relation. Verdicts are **glyph + one word chip, coloured**
  (STYLE §5 glyphs: // clash, △ trine, linked rings harmony, = same).
- **Three systems count:** Chinese animals, the GG33 life-path tiers
  (best · good · neutral · enemy, master/slave 1×6 as its own chip), and
  Western elements as a third, lighter chip (fire+air, earth+water get on;
  fire+water, earth+air clash — the classic pairing, flagged as not GG33).
- **"Compare with…"** from the person page opens the search and shows the
  same verdict chips for anyone in any case (Fun included) without adding
  a relationship.
- **Cases and People lists** get the same treatment: face + name + the
  three tokens, no kind/count text; attention badges stay.
- **Order:** ground + gold first (v74), the life map next as its own push
  with a preview she reacts to first.

**The life map as built (v75, 2026-09-07 — she saw the preview and said
"Go"; `js/lifemap.js`, on the Profile tab):**
- `buildLifeLine()` — years from birth (or the first dated thing) to death
  (or now), each with `personalYear()` from `exactBirth()` only (never a
  placeholder date); marks from the person's events (`markKind()`: kind
  first, then a title pattern for trial / crisis / divorce), from spouse
  relationships' `start_date`/`end_date` when no event says so, and from
  `death_date`. Inference: milestone kinds → worked, divorce → failed,
  death → end, a marriage followed by a divorce → failed. Her tag wins.
- **Outcomes ride the tag system**: `outcome:worked` / `outcome:failed` on
  `target_type='event'` (`store.listEventOutcomes`, `store.setEventOutcome`)
  — no schema change, and `tagging` already syncs. One per event.
- `renderLifeLine()` — ribbon of `<i>` per year (tone class), marks as
  `<button>`s positioned by year and stacked into rows by a greedy pass
  (30 px minimum, re-run by ResizeObserver), a decade axis, the legend.
- `renderWhyCard()` — what · their year (PY ring + gloss · the year's
  animal against theirs) · the two (spouse: `verdictChips`) · judge (✓ ✕
  toggle; "from the record — tap to overrule" when inferred).
- `verdictChips(a, b)` — animals via `relation()` with the STYLE §5 glyph;
  her GG33 tier via `lpTier()` (table in the module, read from the page
  person's side — the source table is not symmetric, e.g. 1→11 best but
  11→1 not listed); Western elements via `elementPair()` as a lighter
  chip. Missing birth dates → an honest "needs both birth dates" chip.
- `renderCircle()` — spouse cards (♥ year · ✕ year · PY a → b) then
  parents, children, siblings, god-relations; tap opens their profile.
- `renderCompare()` — a search box in the circle; a pick shows a card with
  the chips, "compared, not related", dismissable.
- The header carries `tokensHtml()`: the life path as a number, the animal
  chip + element, the sun-sign chip. Chart (five numbers), Profile grid,
  Contradictions, Addresses/Relations, Questions/Evidence sit behind
  **Details ▸** (`sessionStorage c7-details-open`); the old Timeline is the
  **year list ▸** under the ribbon.
- Lesson from the build: sql.js writes persist on a debounce — reloading
  the page right after seeding lost every row but the first. Wait for the
  save state to read "saved" before any reload.

## 13h. "I don't know how the board works — it's all empty" (v76, 2026-09-07)

The Board (and now the life line) draw the case's **events**; the app had
no plain way to make one. Events came only from + Works (releases), the
Commercial tab (milestones), a theory timeline, or the Import page's form
by way of Review — and "Look up" never read dated life events from
Wikidata. So every board was empty, and the empty state's button went to
Relations. Her two answers:

- **Add an event, one tap, in the + Add sheet**: what · kind · date
  (`parseDate`: "14 Nov 1996", "Nov 1996", "1996" — precision kept honest,
  a year-only date stores `date_year_min/max` and no day). Her own entry
  is the record, like the paste box — no claim to accept.
- **+ Life events from Wikidata** (`js/life-events.js`): one SPARQL read
  of the statements that carry dates — spouse P26 (start P580 / end
  P582), award P166 (P585), position held P39, residence P551, educated
  at P69, employer P108 — as a tick-list like + Works (undated rows
  unticked). Each pick becomes an event citing its statement
  (`wikidata_id` = `<person>/<prop>/<item>[/start|/end]`, so a second run
  skips what is there). A marriage row also **dates the spouse
  relationship** (start / end, filled only where blank; created
  unconfirmed at 70 when the spouse is in the case but no relationship
  is) — the tree's "m. YYYY" and the circle's "♥ · ✕" read from there.
- **The Board's empty state opens the + Add sheet** on the person
  (`sessionStorage c7-open-add`), focus in the event field; the life
  line's own empty state does the same. Board's `render` now takes the
  person id the profile tab passes it.
- Event kinds `trial` and `crisis` are now real kinds (the life line used
  to find them only by title).

What the first real pull (Michael Jackson, Q2831: 4 marriage rows, 22
awards, 4 homes, 1 school) added to the build:

- **"Already here" is by key *or* by meaning** (`alreadyHere` in
  life-events.js, used by the tick list and by `addLifeEvents`): a
  candidate is skipped when any event in the case carries its Wikidata
  key, or when one of this person's events in the same year names the
  same thing — normalised title equal, or the statement's item label
  inside the title; a spouse row must also match direction (married vs
  ended, by kind or by "divorc/ended/separat/annul" vs "married/wed").
  So a hand-typed "Married Debbie Rowe" and the P26 statement never sit on
  the life line twice. An undated candidate matches by key only.
- **Same kind + same year = one counted mark** on the life line
  (`clusterMark` in lifemap.js): nine 1984 Grammys read as "★ ×9", the
  why card lists each with its own date and outcome, and judging is done
  per event from the year list. Rows are 36px (one mark tall) so the
  count badge never touches the label above.
- **Board cards read the date at its precision** ("Nov 1996", not
  "1996-11-01"), like everything else on the person page.

## 13i. "More dimension, not so plain and flat" (v77, 2026-09-07 night)

"i like the dark theme more than light but just wish it had more
dimension instead of being too plain and flat." Diagnosis: every surface
was a solid fill in one hue, each a few percent lighter than the last,
with no edge, no shadow and no light direction; the rail was the same
shade as the panels, so nothing sat in front of anything.

Asked against a guide of the same slice of Michael Jackson's page in
four recipes (lifted layers · ambient light · glass · outlined), then the
parts up close. Her eight answers: **A lifted layers · neutral charcoal ·
medium · what-you-tap lifted more than its box · D brighter gold
(#e0a33a) · edge-light + shadow · ribbon sunk, marks raised · faces
ringed, cards lifted.** For the last five she typed "show" (= build it):
rail sunk below the page · vignette ground · lift on hover, press on tap
· Day gets the same depth in paper shadows · default theme unchanged
(Follow phone). Built exactly so — tokens in `css/tokens.css`, one depth
block at the end of `css/app.css`, STYLE §1 "Depth" table. Two things
learned about asking, recorded in memory: the mock goes *inside* the
popup as each option's preview, and "show" after the shape questions
means stop asking.

## 13j. "I click on hp to review and I can't find it" (v78, 2026-09-08)

The Cases card said "11 to review" but the chip was a label: tapping it
(or the card) opened the person's profile, where Review was not a tab at
all — it lived only at `#/review`, behind the phone tab bar. Fix, code3
style (one tap to the outcome, nothing new to learn):

- **The chip is the door.** "N to review →" on the card and the table
  row (`.rv-open`) opens the case and lands in its Review queue —
  `openReview()` in cases.js. A person-case opens it *as the person's
  Review tab* (`#/subject/<id>/review`) so she stays in their file; a
  family or event case opens `#/review`.
- **Review is a person tab** (first under ⋯; `TAB_MODULES.review`), and
  the person header carries the same "N to review →" chip whenever the
  case has drafted claims, hidden on the Review tab itself. Clearing the
  queue clears the chip. The subject page passes a tab module's unmount
  up to the router so Review's keyboard shortcuts never outlive the tab.
- Attention chips that are doors ("N to review →", "N open") now read as
  tappable: pointer cursor, `--lift-2`, hover tone.

## 13k. Picture rows — Cases and People (v80, 2026-09-08; her Q15 of §13g)

"Face + name + the three tokens, no kind/count text; attention badges
stay." Built as one layout for the phone and the desktop (`.pic-row`,
`.pic-list` in app.css; `tokensHtml(person, { compact: true })` in
lifemap.js):

- **Cases** (`js/pages/cases.js`): one row per case, most recently opened
  first. The picture is the subject's face, up to three family faces, or
  the violet Event mark; the name in the title serif; a "Fictional" pill
  when the case has a world; the subject's tokens (life path · animal ·
  sign) or "needs a full birth date"; attention chips on the right of the
  token line ("N to review →", "N images", "N open", "Possible duplicate
  of … →"), each a door; Import and ⋯ on the right of the name line. The
  Table/Cards toggle and the sort headers of v62 are gone — the search box
  finds, the order is recency. The "N cases" count and + New stay.
- **People** (`js/pages/people.js`): one row per person, A→Z: face, name,
  the case they live in as a dim mono note on the right (only when it
  isn't just their own name; hidden on the phone), the three tokens.
  The Table/List toggle is gone; "Compare artists →" stays.
- Compact tokens never read from a placeholder date (`exactBirth`): a
  year-only birth shows "needs a full birth date", not a wrong sign.
- `.case-card` / `.case-grid` / the ribbons left the CSS with the cards,
  and so did the table's sort-header and row-action rules.

What the adversarial review of the diff (four lenses, two refuters per
finding, 2026-09-08) added before the push: "N images →" is a door to
the Inbox like the other chips; a birth on the lunar-new-year boundary
reads "near lunar new year" in a row instead of a silently missing
animal; the name takes only its own width so a "Fictional" pill sits
beside the word, not beside Import; on the phone the token line wraps so
several attention chips drop under the tokens rather than over them;
`.pic-row` honours prefers-reduced-motion; the closed drawer no longer
carries a shadow (its 32px blur bled a dark band down the right edge of
every page since v77).

## 13l. The day palette, redesigned (v81, 2026-09-08)

"redesign the day palette. i dont like it." Asked what bothered her about
the cream-and-gold day look she ticked all four: the cream page, washed-out
text, the muddy old gold, the brown shadows. Two drawn pages (static HTML
— her viewer runs no scripts, a first page built with JS showed empty
headings) and two popup rounds gave eight picks:

| # | question | her pick |
|---|---|---|
| 1 | what bothers you | all four: cream page, washed out, the gold, brown shadows |
| 2 | page colour | **A** cool white — grey-white page, white cards |
| 3 | rail and top bar | **D** white rail floating on a soft shadow (not the Book33 dark rail) |
| 4 | accent | **D** teal — buttons, chips, active tab; gold retired as accent |
| 5 | text | **A** near-black ink |
| 6 | shadows | **A** soft grey, neutral (no warm tint) |
| 7 | where gold lives | **A** only the life path number |
| 8 | animal and sign tokens | **B** solid pills, full colour, white text |

Built as tokens only (`css/tokens.css` light block) plus one appended
block in app.css: `--brass` by day is teal #287d71 (the token keeps its
name for its job — every accent rule reads it), a new `--gold` (#e0a33a /
#9a6a17) that `.lm-tokens .tk .big`, `.num-icons .ni-lp`, the tree's `.lp`
and the gold tier read, `--bar-bg` + `--rail-shadow` / `--topbar-shadow` /
`--tabbar-shadow` (night sets them transparent), `--on-code` for the solid
pill text, and every day zodiac shade re-picked to hold ≥ 4.5:1 under
white text (measured: yellow #8f6c10 4.86, earth #8a6216 5.47, air
#2277a8 4.92, green #2b7d44 5.1, pink #b43a78 5.5; blue, fire and water
already passed). Night is untouched. STYLE.md §1 carries the new table.

Reviewed before the push by a four-lens adversarial workflow (52 agents;
each finding faced two refuters). Four real problems, all fixed: the
ribbon segment and legend swatch of the 1·8 "gold" tier still read
`--brass`, which by day equals `--teal`, so two tiers had become one
colour (now `.lm-t-gold` reads `--gold`, and the "same" verdict glyph in
indicators.js follows its chip to `--gold`); the appended `.num-icons
.ni-lp` rule outranked `.unknown` and painted the honest "—" gold on both
grounds (now `:not(.unknown)`); the phone's status-bar `theme-color` still
said cream #efeae0 by day (now white, the top bar's colour); and the
person page's 22px headline life path was an inline `--brass`, teal by
day (now `--gold`). Decision 7 is read as "gold is no longer the accent";
the gold *tier* of her code keeps its gold the way the zodiac keeps its
colours. Fifteen other claims were refuted, most of them pre-existing
11px chip contrasts of 4.2–4.5 that this change did not move.

## 13m. Fiction after the fact (v82, 2026-09-08)

"where can i save him as fiction?" — asked from a person page, about a
case that had been created as real research. The answer was nowhere:
`case_file.world` was written by the tick box in "+ New" and never again
(db.js said so in as many words, "set at creation only"), the ⋯ menu
offered Rename / Make it … / Clean up duplicates / Delete, and the
person's Edit panel has no such field. A case made under the wrong
assumption was stuck with it forever.

The ⋯ menu on a case row now carries it, beside the kind switches
because it answers the same question — what IS this case?

- real now → **Mark as fiction**, which opens the same inline form the
  rest of the menu uses, pre-filled with "Fictional" so a world with no
  name still saves (the form refuses an empty value)
- fiction now → **Edit the world** (pre-filled with the current world)
  and **Mark as real**, which clears it

No confirm on either: both are one click back, unlike Delete. The row
re-renders, so the violet world pill appears or goes at once, and the
Questions tab picks up its "the world" wording and 🌍 the next time it
is opened. Rule to carry: **anything the app asks at creation must be
changeable afterwards** — a one-shot question is a trap, because the
answer is least certain at the moment the thing is made.

## 13n. Alternate birthday, with its evidence (v83, 2026-09-08)

"if i want to add an alternate birthday and include the evidence for it,
how? make the process easy for me." The claim/evidence machinery already
existed for exactly this — `claim.field='birth'` (the same shape the
paste box and Wikidata lookup already use), and `evidence_link` already
supported `target_type='claim'` in its schema — but nothing in the UI
ever created that combination, and Review never rendered it.

**+ Add → Alternate birthday**: one date field (the same free-text parser
as "Add an event": "14 Nov 1996 · Nov 1996 · 1996") and one "where this
comes from" field. Save creates a **drafted** `birth` claim — it does not
touch the person's own birth date — plus a real Evidence record (a link
if she typed one, a note otherwise) linked to BOTH the claim (so it's
right there when she decides) and the person (so it stays browsable
afterward, whichever way the decision goes — Review only ever lists
drafted claims, so a claim's own evidence would otherwise vanish the
moment it's decided).

**Review** now shows, for a `birth`/`death` claim: what's on record now
(from the person, for comparison) and, if any, the evidence attached —
title, her citation as the sub-line, its verification, click-through to
the Evidence page. Accepting overwrites the birth date exactly like any
other accepted claim; rejecting leaves it and the record untouched; the
evidence stays on the person's Attached Evidence panel either way.

**Two dormant bugs surfaced and fixed** — both existed before this build
but were unreachable, because no earlier source of a `birth` claim (paste,
Wikidata lookup) ever produced month precision, only day or year:
- `describeClaim` (review.js) read anything but day precision as
  "(year only)", so "June 1958" showed as "1958".
- `applyClaim` (store.js) only wrote `birth_date` for day precision, so
  accepting a month-precision claim changed `birth_precision` to
  `'month'` while leaving the OLD `birth_date` sitting under it —
  `exactBirth()` already refuses non-day precision regardless, so this
  never broke a calculation, but the stored fact itself was wrong.
Both now handle month precision the way the rest of the app already
does (profile-parse.js's `setBirth`, the person Edit form): the same
`'YYYY-MM-01'` placeholder date, never read for anything exact.

## 13o. Paste a picture into Evidence (v84, 2026-09-08)

"in evidence, allow me to paste pictures." The page already had three ways
in — the picker, drag-and-drop, and the phone's share sheet — all landing
on the same `addImages()`. Paste is the fourth, and reuses it exactly: copy
a screenshot, press Ctrl+V anywhere on the Evidence page, and it lands in
the Inbox to be titled and given a person there, like every other route in.
A pasted PNG already reads as `screenshot` through the existing
`guessType()`, so it needs no special case.

The listener sits on the **document** — a paste has no element to aim at
unless something is focused — which makes its lifetime the whole problem:

- **It must not stack.** This page re-renders on every view-tab and filter
  change (calling `render()` directly, not through the router), so a
  listener added per render would accumulate and add the same pasted image
  once per copy. Held at module scope like review.js's `keyHandler`, and
  removed before each new one is attached. Verified: five re-renders, then
  one paste, adds exactly one image.
- **It must stop when she leaves.** `render()` returns early on two of its
  three paths, so a returned unmount would not always be reached. The guard
  is `#evidence-body` — an id unique to this page's own markup, and
  `#page-root`'s contents are replaced on every navigation, so its absence
  means we have left. Verified: pasting from the Cases page adds nothing.
- **It must not hijack text.** A paste aimed at an `input`, `textarea` or
  `contenteditable` is left alone, so pasting a URL into a source field
  still behaves like a normal paste.

## 13p. Pictures live on the evidence item (v85, 2026-09-08)

"I want these screenshots added to the relevant evidence mentioned in
transcript", then "allow for pasting images into evidence" — the same ask
twice, which by her own rule means the last build was at the wrong layer.
v84's paste always made a *new* inbox item. What she had was an item that
already existed (a court decree she had typed up from a video) and a picture
of that exact document, with no way to put the two together. And the detail
panel had never shown a picture at all: it printed `File   a3f9….jpg` as
text, so even an inbox screenshot could not be looked at again after it was
titled.

**Where a paste lands now depends on what is in front of her.** With an item
open, Ctrl+V puts the picture *on that item*. With nothing open, it goes to
the Inbox exactly as in v84. One document-level listener decides between
them — two listeners could not reliably agree which should win, because
both would be on `document` and the later registration always runs second,
so `stopImmediatePropagation` from the panel's listener could never
pre-empt the page's. The open-panel test is `openDetailTarget()`: the
drawer carries `.open`, the panel body is still in the document, and it
still contains `#shots`. That last check is what distinguishes our panel
from the drawer showing sync, an add-form, or a different page's content.

**One cover, then pages.** `evidence.file_path` stays picture one — it is
what every card thumbnail in the app reads — and everything added through
the panel becomes an `evidence_shot` row (`file_path`, `caption`, `ord`).
The new table needs no cloud migration: sync stores every entity as a row in
one generic `c7_records` table, so adding `evidence_shot` to `SYNC_TABLES`
is the whole change. `cardPicture()` falls through to the first shot when
the item has no image of its own, which is what lets a typed-up note show
the decree once she pastes it on, and lets the cover be removed without the
card going blank. Removing the cover only clears the columns; the stored
file is left alone, so a mis-tap costs a link, not the picture.

**The viewer** (`openShotViewer` in `js/ui.js`) pages the whole set with
‹ › and the arrow keys, and is where removing happens — a 92px tile with an
X on it is one mis-tap from losing a document. Its arm-then-act is written
out rather than reusing `twoTapConfirm`, because that helper keeps `armed`
in a closure that outlives the picture on screen: arming on page 1 and then
arrowing to page 2 would have deleted page 2 on a single tap. Paging calls
`disarm()`, so the flag and the label always move together. Verified.
The cover has no caption of its own to save into, so its caption box is
disabled and says why rather than quietly forgetting what she types.

**A deadlock this turned up, present since v1.** Evidence card thumbnails
never appeared on a cold open. `.card-thumb` is `display:none` until `.has`,
`.has` was added by the image's `load` event, and a `loading="lazy"` image
inside a `display:none` box never starts loading — so the class that would
reveal it could only be added by an event that could not fire. It looked
fine in testing only when that exact picture happened to be decoded already.
Fixed the way faces already do it: `preloadImage()` first, then append and
reveal. Never wait on a `load` event to un-hide the box the image is in.

## 14. Public Sans everywhere — a title-font pick, and two more never-loaded fonts (v96, 2026-09-13)

Her reaction to Newsreader once §13y's bug fix let her actually see it
render: "i dont like the font." A genuine taste call this time, not a
bug — she'd only ever seen the Georgia fallback before that fix, so this
was her first real look at the typeface the design was built around, and
she didn't like it. Five real candidates were built in a sandbox artifact
against her own real case names (Michael Jackson, Taylor Swift, J. K.
Rowling), rendered in the real dark-theme tokens: Lora, Source Serif 4,
Libre Caslon Text, and Public Sans set bold with no serif at all. She
picked **Public Sans** — "the same face the rest of the UI already uses,
just bold, for titles too. Cleaner, more 'app,' less 'research tool.'"
`--font-title` now equals `--font-body`'s stack, and the shared `h1, h2,
h3, .title` rule went from `font-weight: 500` to `700` to carry the bold
call through every title-styled element app-wide — page headings, tile
names, drawer headers, list-row titles — matching what she actually saw
and picked, not just the one page title in the mock.

**While checking whether the swap needed anything else, found two more
instances of §13y's exact bug.** The same canvas glyph-width test run
against `--font-body` (`'Public Sans', system-ui, …`) and `--font-mono`
(`'JetBrains Mono', ui-monospace, …`) showed both stacks measuring
pixel-identical to their fallback fonts (`system-ui`, and `Consolas` /
generic `monospace` respectively) — proof neither had ever actually
loaded. Like Newsreader, both were named in `tokens.css` from the start
of this design system but never added to the Google Fonts `<link>` in
`index.html`, which only ever carried Caveat (and, since yesterday,
Newsreader). This is a bigger miss than a title font: `--font-body` is
almost all running text in the app, and `--font-mono` is every number,
date, time, code and hash (`.mono, .num, time, .value, code` in
`tokens.css`) — the entire app has been silently running on system
fallbacks its whole life. Fixed the same way as Newsreader: added Public
Sans (400/500/600/700 — the weights actually used across body text and
titles) and JetBrains Mono (400/600, matching `.lm-tokens .tk .big`,
`.lm-py`, `.lm-v` and the mono defaults) to the same `<link>`, and
removed Newsreader from it entirely now that nothing references it.
Confirmed all three loading with `document.fonts` reporting `status:
'loaded'` for every weight, and a glyph-width re-measurement showing each
stack's width diverging from its fallback's.

Verified live: the Cases and People tiles, a case's Profile page, and
the Review page's "CASE REVIEWED" stamp (§15, "the case stamp") all
still read cleanly with the bolder sans in place of the serif — if
anything the stamp's uppercase, wide-letter-spaced brass box looks more
like an official rubber stamp in a grotesque sans than it did in a serif.
44/44 in `tests/browser-tests.html`.

## 61. The rail's case switcher, removed — she never used it (v143, 2026-09-24)

Her report, a screenshot of the nav rail's "Case file" dropdown open on
Petersons: "i dont use this, it is not useful for me." Asked which part —
not the list's ordering or labeling, the dropdown itself: she never
switches cases through it, always going Cases/People/search instead.

Removed outright — the whole `.case-rail` block (`index.html`), its wiring
in `main.js` (`refreshCaseContext`'s rail branch, the `case-rail-select`
change handler — including the inline "+ New case…" mini-form it hosted,
her real doors for that already exist on Cases and People), and its CSS
(`app.css`). One dependency this surfaced: the topbar's own "which case am
I in" chip (`#case-context`) was hard-hidden above 1200px width —
`/* wide screens: the rail block says it */` — because the rail dropdown
was carrying that job there instead. With the rail gone, that media query
would have left wide screens with NO case indicator at all; removed too,
so the chip now shows at every width, same as it already did on a phone
or a collapsed rail.

Everything the dropdown's "+ New case…" did is still reachable exactly as
before: Cases' own "+ New" button, and People's "+ Person → Start their
own case." Switching cases by tapping into one from Cases or People — her
actual workflow — is untouched; `setCaseId`, the chip, and every case-
scoped page still work exactly as they did, just with one redundant
control gone.

Verified live at three widths: desktop (1400px, chip now visible where it
used to hide), the old 72px icon-rail breakpoint, and phone width (already
unaffected — the dropdown never showed there). Tapping into a case from
its tile still opens it and updates the chip correctly. No console errors.

## 60. "+ Tag people" — a fast, batch door onto the Traits gallery (v142, 2026-09-24)

Her ask, right after v141 shipped: pasted three real lists (~28 named
celebrities) and asked "is there a fast way to mark celebs with dimples."
One-at-a-time through each profile's Edit sheet wasn't it.

"+ Tag people" sits next to the gallery's title (always there, even
before any trait exists — the empty state now points to it as the other
way in). One trait, a textarea of names — one per line or comma
separated. Per name: already anywhere in the file (by name, any case,
checked fresh each run so an earlier name in the SAME paste is found
too) → tagged directly; not found → the same Wikidata search-and-fill "+
Person" already has (v138), auto-taking the top match (trusted the way
every other Wikidata search in this app already is) rather than pausing
for a pick each time, landing in "No case yet" since a dimple note
doesn't need a case built around it. This is deliberately the one add
path on this page allowed to hit the network — the gallery can't place
anyone by life path or day without a real birth date, so a bare name
alone would never be able to appear in it.

Progress reads live ("3 of 28 — Harry Styles"); the summary
(added/already-here/not-found counts) waits for her own tap on "Done"
before the page re-renders, so it doesn't vanish the instant it appears
— same reasoning as the life-events sheet's own deferred "Done" step
(2026-09-21).

Verified live: "Ariana Grande, Kate Middleton, Sofía Vergara,
Zzqxnotarealperson123" → dimples. Ariana Grande created with real dates/
photo/nationality; "Kate Middleton" resolved correctly to Wikidata but
saved under its own label, "Catherine, Princess of Wales" (same
label-not-typed-name behavior every Wikidata create in this app already
has) — and her real birth date, 9 Jan 1982, means she'll actually surface
under "Born on the 9th," not a contrived example. Sofía Vergara (already
in the file) matched and was tagged without a duplicate. The nonsense
name failed cleanly and was named in the summary. One transient 429 from
Wikidata's own rate limiting during the run; both real people still came
out fully filled — a large paste (her real ask was ~28 names) should
expect to take a couple of minutes, run sequentially, one profile at a
time.

## 59. Traits gallery — a physical trait, crossed with life path 9 or born on the 9th (v141, 2026-09-24)

Her ask: "make an option to create a gallery of people who have dimples
and show that they are either 9 life path or born on 9 day." Asked "make
some mocks for me... for case studying" before any code — three real
candidates (face grid, quiet list, grouped by reason), her pick: grouped
by reason, two panels so it's legible WHICH condition is doing the work.

Two pieces, since neither existed:

**Tagging a real person.** Traits already had a mechanism — the tag/
tagging tables, built for Fun & Zodiac's "note a trait" box (2026-09-05)
— but that tool only ever tags people inside its own separate, isolated
`fun`-kind case; nothing on a REAL person's own profile could add one.
Added "Traits you've noticed" to the Edit sheet, comma-separated, same
UX as Fun's own box; save diffs typed traits against what was already
there (`store.untagTarget` for anything removed, `ensureTag` +
`store.tagTarget` for anything new) rather than only ever adding, so a
trait she deletes from the box actually comes off.

**The gallery itself**, new on Patterns, above the existing (case-scoped)
matrix/counts/findings panels and NOT gated by having a case open — a
physical trait isn't scoped to one case, the whole point is spotting it
across everyone she's researched. Chips list every trait actually in use
anywhere (excluding the unrelated `outcome:*` tags event outcomes ride on
the same table), remembered across visits (`localStorage`). Picking one
computes `lifePath(exactBirth(p))` for every holder with a full date and
splits them into "Life path 9" and "Born on the 9th" (`lp.parts.day`,
the real calendar day life path's own math already carries — no separate
calculation needed), a person in both flagged "★ both" in each panel.
Only matches show — someone tagged with the trait but neither condition
doesn't appear, since the gallery IS the intersection, per her literal ask.

Verified live: tagged the sandbox's real Sofía Vergara (life path 9,
already true from her real birth date) plus a synthetic 1959-03-09 test
person (life path 9 AND day 9, to prove the "★ both" path) with
"dimples" — gallery showed exactly "Life path 9 · 2" and "Born on the
9th · 1," correctly leaving out two other dimples-tagged people who
matched neither. Confirmed the Edit sheet round-trip too: pre-fills with
current traits, adding one persists it, removing one actually removes the
tagging row, not just stops re-adding it. No console errors. Test data
cleaned from the sandbox after.

## 58. "Move all to People" — the bulk door beside the single-case one (v140, 2026-09-22)

Her ask, one day after v136's per-case "Move to People": "make people in
cases just people" — a real screenshot of her live Cases grid, 22 cases,
nine of them a single person's own biography (Dolly Parton, Lily Allen,
Sofía Vergara, Zara Larsson, Harry Potter, Sandra Bullock, Jessica
Simpson, Erika Kirk, Amber Heard). Asked first whether one-at-a-time (now
that her app had the v136 update, which her "1↑ update ready" pill showed
she hadn't installed yet) was enough, or whether nine individual menu taps
was worth a bulk button — she picked the button.

`Move all N to People` sits beside `+ New` on the Cases page, appearing
only when there's at least one visible person-kind case to move; a
two-tap confirm (the same arm-then-act pattern as every destructive-ish
button in this app) runs `store.updateCase(c.id, { hidden: 1 })` across
every one of them in one pass, then re-renders. Same scope as the single-
case version it sits beside: family/event/series cases (Royal Family, the
Petersons, The Tudors, Suits) are invisible to the filter that builds this
list, so they're never touched; each moved case stays exactly as
reversible as it already was, one at a time, from "Move back to Cases" on
that person's own profile — a bulk button was what she asked for, a bulk
undo wasn't, and nothing here is destructive enough to need one.

Verified live: 4 cases (Suits, Emma Stone, Sofía Vergara, Dolly Parton) →
"Move all 3 to People" → confirm → 1 case left (Suits, correctly
untouched — it's a series, not a person). All three still fully present
and unchanged on the People grid straight after. No console errors.

## 57. Time of birth — a column that existed since day one, no door to it (v139, 2026-09-22)

Her ask: add times of birth for seven royals (the three great-grandchildren,
William, Harry, Charles, the late Queen). `person.birth_time` and
`birth_time_precision` were already real columns in the base schema —
`store.updatePerson` already whitelisted them — but no page had ever put a
field in front of either one. The Edit sheet went straight from birth date
to birth precision; nothing else on the profile read the column at all.

Added: a "Time of birth" input beside birth date in the Edit sheet
(`<input type="time">`, saved alongside the date); precision defaults to
`exact` the moment a time is typed, `unknown` when it's cleared — same
"don't make her flip a dropdown for the common case" rule already applied
to birth date's own precision field. Shows, when set, folded into every
"Born" line on the profile — the compact DEMOGRAPHICS strip under her name
and the fuller Profile-details grid both read the one `born` string, so
one change carries to both densities (`"24 Nov 1964 · 4:24pm"`). No chart
is drawn from it — western.js has no rising-sign calculation — it's
reference data only, the same footing birthplace already has.

**Caught building it:** the first pass appended the time only inside the
Profile-details grid's own row-building code, missing that the compact
DEMOGRAPHICS strip (what she actually sees first, and the one confirmed
live) reads a *shared* `born` variable computed once, upstream of both.
Fixed by folding the time into that shared variable itself, so either
consumer downstream of it just works — caught by testing against the
visible panel, not the code that looked obviously right.

**What this doesn't do yet:** the sandbox this app is tested in (a local
dev server, its own separate browser storage) is not the live, synced app
on her devices — nothing typed here reaches her real file. The feature is
real and ready; the seven royals' actual times still need typing in by
hand, once each, on her own device, now that the field exists to type them
into.

## 56. + Person gets its own "Look up on Wikipedia" (v138, 2026-09-22)

Her question: "how to add someone from wikipedia directly to people." The
answer was that it couldn't, not from here — that record-fill (dates,
picture, Wikipedia evidence, all pulled and saved in one go) has only ever
lived on Cases' own "+ New" form (§ "Look up on Wikipedia inside + New").
People's own "+ Person" (its bare `Their name` box) had no door to it at
all; reaching it meant detouring through Cases first.

Same search box, same "Create from this ▸" result rows, wired onto +
Person instead — deliberately smaller than Cases' version: no kind switch
(a person here is always a person) and no +family/+works checkboxes, since
those pull relatives or a discography INTO a case, and the "No case yet"
door people already has doesn't have one to pull them into. Both of
People's existing doors are honoured: "Start their own case" makes the
case and fills the person exactly as Cases' version does; "No case yet"
(2026-09-21) creates the placeless person directly and fills them the same
way, `case_id` left null throughout — proof this door was already meant to
carry a full record, not just a name, since `fillFromWikidata`'s evidence
and accepted-claim writes both already tolerated a null case_id without
being asked to. Same duplicate guard as the plain-name path (cross-case,
by name — her 2026-09-11 rule) fires before either door, so a Wikidata
pick can't double up a person already in the file.

Verified live, both doors, real Wikidata records: "Start their own case"
on Emma Stone made a full case — photo, 6 Nov 1988, gender, nationality,
birthplace, occupation, the Wikidata citation, life path/animal/sign all
computed — landing on her profile. "No case yet" on Timothée Chalamet
filled the same way with no case at all, appearing on the People grid
tagged "No case yet" with his own computed tokens. No console errors
either time.

## 55. A tile's ⋯ menu, opened and invisible — the hover lift was trapping it (v137, 2026-09-22)

Her report, one screenshot and one line: "when i click 3 dots i dont see the
dropdown." Reproduced live on the Cases grid (Sofía Vergara's tile, phone
width, same shape as her screenshot): the click worked — `.menu-slot` had
real buttons in it, a real position, a real size — it painted zero pixels.

Root cause: `.tile:hover { transform: translateY(-2px) }` (the grid's hover
lift, unrelated to this feature, long-standing) creates a fresh CSS stacking
context on whichever tile is under the cursor — a side effect of `transform`
that has nothing to do with `z-index`. The floating menu's `z-index: 5`
(§ "the ⋯ menu opens as a floating panel below the tile") is written
expecting to compete for paint order against every OTHER tile in the grid;
trapped inside its own hovered tile's new context instead, it can only win
against its own tile's other content — the next tile down, painted after it
in plain DOM order, covers whatever part of the menu overflows past its
own tile's bottom edge. The more items the menu has, the more of it falls
into that dead zone — the new "Move to People" row (§54, same day) was
enough to push this from "mostly fine" to "gone."

Fix: `.tile:has(.menu-slot:not(:empty)) { z-index: 6; }` — the tile actually
showing its menu now always outranks every sibling tile in paint order,
hover or not, menu length or not. Reproduced her exact failure first
(confirmed via `getBoundingClientRect()` — content and position both
correct, still invisible — the same "measure, don't eyeball" lesson as
§53's screenshot false alarm, this time landing on a real bug instead of a
non-bug), then confirmed the fix live at phone width: the menu now paints
over the tile below it, fully readable.

## 54. "Move to People" — a thin person-kind case stops being its own tile (v136, 2026-09-22)

Her ask, on the real Cases grid: "move people from cases to people." Four
rounds of grounded questions (not the original example she used — Suits'
cast — but where she actually landed) narrowed it to: a person like Erika
Kirk or Sofía Vergara, whose whole case is just their own biography, can
stop being a separate tile on the Cases grid and be reached from People
instead — family- and event-kind cases, and anyone nested inside one
(a family member, a series' cast), are untouched. Nothing about the
person or their case is deleted or reassigned — her own explicit answer,
"keep it, just drop the case wrapper" — so a new `case_file.hidden` flag
is the whole mechanism: set, the case vanishes from the Cases grid and
the nav rail's case switcher; unset (still trivially reachable — "Move
back to Cases," now on the person's own profile header, since a hidden
case has no tile here to undo it from), it's back exactly as it was.
`person.case_id` never changes, so nothing that already depended on it —
Evidence, Questions/Theories, Board, relationships, drafted claims — so
much as notices.

**A design decision worth naming explicitly, since it differs from her
first, plainer-language answer** ("if they move out of case they just
land in people," which read as `case_id` going to `NULL`, joining the
same placeless pool Family/Event/Series already pick from). Actually
nulling `case_id` would have orphaned every case-scoped row still keyed
to the old case — her own "7 to review, 1 open question" on Erika Kirk's
case would have nowhere to be read from again, directly contradicting her
very next answer ("keep it… reachable the same way"). Read as: she was
describing the OUTCOME she wanted (found in People, not Cases), not
prescribing the mechanism — translating a plain-language want into the
technical shape that actually delivers it (hide the tile, touch nothing
else) is the job here, not a literal field-for-field implementation of
her first phrasing. Flagged here so she can correct it if this reads
differently to her than intended.

Cases' own duplicate-case detector, the "N cases" count, and the nav
rail's case-switcher dropdown all read the same filtered (non-hidden)
list, so a moved case quietly stops appearing in all three at once,
consistently — except the switcher still shows the CURRENT case even
if it's hidden, so the chip/dropdown never goes blank while she's
legitimately standing inside it via her profile. The app's own
"which case to land on when it boots with nothing selected" pick also
skips a hidden case now, so moving whichever case happens to be most
recently touched won't silently make the app open into it every time.

Verified live end-to-end on a real case (Dolly Parton and Sofía Vergara,
this session's own long-running sandbox, not a fresh fixture): "Move to
People" removed Sofía Vergara's tile and dropped the case count from 3 to
2; her People tile, profile, full Demographics/Numerology/Family tree,
and — the real stress test — the Sofía Vergara/Joe Manganiello theory
from earlier this session (§the Questions & Theories entries) all stayed
exactly as they were, reachable the same way; "Move back to Cases" on her
profile restored the tile and the count to 3. No console errors either
direction.

## 53. The season grouping above, corrected to a quiet flat list (v135, 2026-09-21)

Her very next message after §52 shipped: "i meant visually organise
better." §52 had read "organise" as information architecture — collapsed
season cards with a caret, an episode count, a date range — and that
wasn't it; she'd corrected a structural read to a visual one, same as the
2026-08-31 lesson about not pattern-matching a request's label without
checking what she actually meant. Rather than guess a second time, three
real candidates went up as inline `AskUserQuestion` previews (her own real
Season 1 data, her app's actual night-theme hex values hand-inlined so
the preview didn't lie about fonts or colour) — a quiet flat list with no
card at all, a life-line-style rail with dots, and a polished card variant
close to what had just shipped. She picked the quiet list.

Season markers are now a plain uppercase label (brass, no button chrome,
no caret) — always showing its episodes, nothing to expand. Episodes are
a bare number/title/date row with a hairline divider, no card background
at all; the number shown is the real Wikidata ordinal split back out of
the stored title (`13`, not a fresh per-season `1` — season 2's own
first episode really is the show's 13th, and renumbering it would have
been less honest for a one-line cosmetic gain). Edit/delete stayed
reachable — small `✎`/`✕` beside the date on an episode row, and the
season label itself opens a tiny "Edit the season entry / Delete" menu on
tap rather than a permanent extra row of chrome. `openSeasons`
(module-scope collapse-state Set from §52) is gone — nothing left to
track once nothing collapses.

Verified live against the full real Suits data again (144 stored events):
all 9 "SEASON N" labels and 134 episode rows render flat and correct end
to end (season 2 genuinely starts at "13 · She Knows," not a re-numbered
"1"), the season label's Edit/Delete menu opens and the twoTapConfirm
delete still asks before removing a season entry, an episode's own ✎
still opens the same `entryForm` inline with its full citation intact.
`document.body.scrollWidth` checked directly (not just eyeballed off a
screenshot) after a rendering artifact made a phone-width capture look
like the date column was clipped — it wasn't; the DOM had no overflow,
only the screenshot tool's own scaling did.

## 52. Installments group by season, and stop repeating their own citation (v134, 2026-09-21)

Her ask, on a real screenshot of Suits' 134-episode, 9-season Installments
list: "organise and display this better." Every episode AND every season
marker (itself just another installment event, titled "1 · Suits, season
1") got the identical full card, at the identical visual weight, each
repeating its own "Source: Wikidata https://…(P577)" citation line in
full — 143 near-identical cards, no hierarchy at all between a season and
what's inside it.

A season is detected from its own title text — Wikidata's own convention
for a TV season item's label is always "<series>, season N" (or "series
N") — not a stored flag, so it groups installments pulled before this
shipped too; a franchise with no season concept (a film or book series)
never matches anything, so its installment list stays exactly the flat
list it always was, unchanged. Season markers become collapsible headers
("Season 1 · 12 episodes · 23 Jun – 8 Sept 2011"), collapsed by default;
their episodes become compact one-line rows inside (reusing Questions'
own `.tl-row` shape rather than inventing a new one) with NO citation
text on the row — it's still on the record, reachable through ✎ Edit,
just not blasted 134 times. The panel header now also states the real
count ("9 seasons · 134 episodes"), never rounded away.

**A real, pre-existing bug surfaced while building this, unrelated to the
grouping itself:** a series case's own episode count came back off by one
against Wikidata's real 134 — traced to `store.listEventsForCase()`
returning a Questions theory-timeline entry (`event.theory_id` set) too,
since a theory's own dated moments are case-scoped events like everything
else. Questions.js is explicit that a theory timeline is never the
record — but `series.js`'s Installments panel (and its era calculation)
had no filter excluding one, so a theory's speculative entry could leak
into the show's own confirmed installment list and skew its era range.
Now filtered out at the one place `events` is read for the whole page.

Verified live against the real Suits case data (144 stored events, 9 of
them season markers, 1 a theory-timeline entry from unrelated testing):
correct 9 seasons · 134 episodes count once the theory-entry leak was
fixed; every season's episode count and date range checked against the
source list; edit and delete both confirmed working on a nested episode
row (the inline edit form still shows the full citation in its notes
field); light, dark and phone width.

## 51. Adding a theory timeline entry by hand, without the pipe-syntax (v133, 2026-09-21)

Her ask, right after the Sofía Vergara theory walkthrough: "make that
process easier to do." The friction wasn't the Question → Theory →
Entry structure itself (each step is a genuinely distinct idea — a
question, one of its theories, a dated moment under that theory — and
stays as three steps); it was the LAST one. "+ Entry" was a single text
field asking her to type a whole micro-language by hand: `2016-06-01 |
what happened | with: Name | ♪ song | "quote" · mm:ss`, exactly the
syntax I had to teach her, live, to add the Sofía Vergara entry earlier
this session.

"+ Entry" is now a plain fields form — a date box, a "what happened" box,
a "with — names" box, always visible; song/quote/timestamp (rare, and
only relevant to a handful of theories) sit behind a "+ song, quote or
timestamp" reveal instead of always taking up the row. Deliberately left
alone: "Paste a timeline…", the bulk mode for dropping in several lines
at once from an outside transcript — that one is genuinely transcript-
shaped (her own workflow: paste an analysis video's transcript to Claude,
paste the dated lines back here), so the raw syntax stays there, on the
one path where typing several structured lines fast is actually the
point. `parseTimelineLine`'s date parsing was factored out into
`parseLooseDate`, shared by both the raw-line parser and the new form, so
the two paths can never quietly disagree on what counts as a valid date.

Verified live: a fresh theory's first entry, added through the new
form with all three optional fields (song left blank, quote + timestamp
filled) — saved as a real dated event, both named partners auto-created
and linked, the quote and mm:ss rendering identically to an entry added
the old raw-syntax way. An invalid date correctly refuses with the same
message the raw-line parser already gave, without touching the record.

## 50. A cast tile shows who they played, not just who plays them (v132, 2026-09-21)

Her ask, on the real Suits Cast grid (22 actors, names only): "include
cast and character names." `fetchCast` (§47) already read Wikidata's
"character role" qualifier (P453) on every cast statement — it collects
`characters: []` per actor — but nothing downstream ever used it; the
"+ Cast from Wikidata" handler only ever passed `{qid, label}` on to
`addPeopleFromWikidata`, dropping it on the floor. New `person.role`
column (a plain string, e.g. "Harvey Specter" — `&`-joined when Wikidata
lists more than one role for the same actor); the Cast tile shows it as a
small line under the name (`.face-card .role`) whenever it's set.

**Found only by testing the actual button she'd press, not the code
path that looked obvious from the ask.** The first version wrote the role
inside the "nothing new to add" early-return's *sibling* branch — correct
for the very first pull on a brand-new series, but her real Suits case
already has its full cast from the §47 feature, so on her device every
future "+ Cast from Wikidata" tap would hit `picks.length === 0` and
return before the new role-writing loop ever ran, silently doing nothing.
Caught live in the sandbox by re-running the button against an
already-fully-cast test copy of Suits (not a fresh case) — the real shape
of what "re-check" means for someone who already built out their cast
weeks ago. Fixed by moving the role backfill outside the "new people"
gate entirely, so it fills in character names for the existing cast too,
and only reports "nothing new" once *neither* a person nor a role changed.

Verified live against the real Suits cast data (22 actors, in the
sandbox, matching her actual case): re-running "+ Cast from Wikidata" on
an already-complete cast correctly backfilled 6 character names —
Gabriel Macht → Harvey Specter, Patrick J. Adams → Mike Ross, Sarah
Rafferty → Donna Paulsen, Gina Torres → Jessica Pearson, Rick Hoffman →
Louis Litt, Meghan (Markle) → Rachel Zane — and correctly left every
actor Wikidata has no character qualifier for unlabelled, with no error.
`role` flows through the existing generic sync (table-level, reads
columns dynamically — no allow-list to update).

## 49. Life-line pictures for awards, moves and schools — plus a bug that had silenced every award's picture since it shipped (v131, 2026-09-21)

Her ask, on the real Dolly Parton life line (Grammy, CMA Award, Hollywood
Walk of Fame star, all still plain glyphs): "collect images for all these
events." A "+ Collect pictures" button on the Life Line panel (`subject.js`,
next to "+ Add event") now walks every award/move/other-kind event still
missing a picture and fills in what it can find — `collectEventPictures`
in `lifemap.js`: an event added through the "+ Add" life-events Wikidata
picker already carries the exact item to fetch a picture for; one typed or
pasted by hand (no Wikidata link at all) instead gets a Wikidata title
search, taking the first real match. A search can mismatch on an ambiguous
title — the picture is never presented as a fact, only a picture, and
stays swappable from the event's own edit form.

Building this turned up a real, pre-existing bug: **no award has ever
shown a picture, since the poster's picture first shipped (2026-09-13)**.
`resolveMarkPicture`'s gate checked `m.kind` — the mark's DISPLAY kind,
already reshaped by `markKind()` for the ribbon's own glyph/grouping,
which deliberately folds every award into `'milestone'` there. The gate's
own allow-list was `['award', 'move', 'other']`, so it was checking for a
value ('award') that `m.kind` could never actually hold — 'move' and
'other' happened to pass through `markKind()` unchanged, which is exactly
why only awards were silently dead. Fixed by checking `m.event.kind` (the
record's own raw kind) instead of the display kind. A second, related gap
surfaced testing the fix: the SAME check used to gate both "attempt a
fresh Wikidata fetch" and "show a picture already saved on the row" — so a
picture the new search fallback had just found and saved stayed invisible
forever, since an event it can find one for (no Wikidata item) is exactly
an event that check would always refuse. The "already have one, just show
it" read is now unconditional; only a fresh fetch attempt needs a real
Wikidata item.

Verified live: a hand-typed "Grammy Award for Best Country Song · 1981"
event (kind award, no Wikidata link) went from a plain star glyph to a
real photo after one tap, on both a warm re-render and a genuinely cold
page reload with the service worker and caches cleared first.

## 48. The subject header's photo forced empty space beside it (v130, 2026-09-21)

Her ask, on a real screenshot of Dolly Parton's profile: "this is too long
in height. tesselate it keep picture size to reduce empty space." The
140px photo and the identity line sat in the same row, so that row's
height was always 140px even though the identity text only needed about a
third of it — the rest, beside the photo and below the text, was pure
blank space before the Demographics/Numerology band even started below.

Restructured `subject.js`'s header so the photo now runs down beside the
WHOLE content column — identity line and the Demographics/Numerology band
together, not just the identity line — instead of only being level with
one short line of text. On a wide window there's room for Demographics and
Numerology side by side next to the photo, closing the gap entirely
(verified live at 1220px: the header shrank from the original screenshot's
roughly 380px tall to about 140px, matching the photo, no blank band left
over). On a narrow one — this card's own default testing width, and where
her original screenshot actually came from on a phone — there usually
isn't room for the photo AND two side-by-side info columns at once, so
below a `460px` container width (measured on the content column itself,
via a CSS container query, not the viewport — the card sits in a narrow
app column even on a wide monitor) Demographics and Numerology stack
instead, still right under the identity line with no dead gap; below
`480px` of viewport the photo drops to its own row entirely, with
everything else following in natural sequence beneath it, which turned
out to already read as gap-free once nothing was forced to match the
photo's height. `.sh-zone2`/`.sh-zone3`'s background band, previously
full-bleed edge to edge on the whole card, is now a rounded sub-panel
beside the photo instead — full-bleed and "beside the photo" aren't both
possible without reopening the same dead-space bug.

## 47. A series' cast can be pulled from Wikidata in one go (v129, 2026-09-21)

Her ask: "how to add cast from wikipedia?" on the real Suits case, right
after the quick-add fix — cast still needed typing one name at a time, no
auto-pull, unlike installments which already had one. A "+ Cast from
Wikidata" button now sits beside "+ Add person" on a series' Cast panel,
shown whenever the case has a `wikidata_id` (the same gate the installments
recheck button uses). It reads Wikidata's P161 "cast member" off the show's
own item — the real, billed actors, not the fictional characters, since a
character has no real birth data for the app's numerology/astrology
machinery to work with while the actor playing them does — and runs each
through the same `addPeopleFromWikidata` a family/case page already uses
for a Wikidata pick: full profile fill (real birth date, birthplace,
nationality, photo, a linked Wikipedia citation), not a bare name. An actor
already in the case (matched by their own Wikidata item) is left alone, so
running it again only adds anyone newly billed.

New: `fetchCast(qid)` in `lookup.js`, alongside `searchPeople` — flat SPARQL
paired directly with `SERVICE wikibase:label`, no `GROUP BY`, the same
StackOverflowError-avoidance shape `works.js`'s installment/works queries
already document. Verified live against the real Suits item (Q370185): all
22 billed actors landed correctly — Gabriel Macht, Patrick J. Adams, Sarah
Rafferty, Gina Torres, Rick Hoffman and the rest, each a real actor rather
than a character name. A second run correctly found nothing new
("everyone billed is already in the cast").

## 46. The update chip and the open drawer didn't agree with each other (v128, 2026-09-21)

Caught right after v127 shipped: she reported "not fixed" with a screenshot
of the Cloud Sync drawer showing "App version c7-v125" and no update
button, while the chip in the corner read "⇅ update ready." Both things
were true at once, and it wasn't the byte-diff bug from §45 recurring — it
was a second, separate gap. `renderSyncDrawer`'s body is only ever drawn
once, right when she opens the drawer; `insertUpdateButton` runs inline as
part of that single render. When a download finishes *after* she's already
opened the drawer, `noteUpdate` (in `main.js`) sets `updateWaiting` and
calls `renderSyncChip` — which is subscribed and redraws the chip live —
but nothing told the already-open drawer body to redraw too. So a chip
that updates the instant a download lands sat over a drawer frozen at
whatever it looked like a moment earlier.

Fixed: `main.js` now keeps a `syncDrawerBody` reference, set when the sync
chip opens the drawer, and `noteUpdate` re-runs `renderSyncDrawer` on it
directly whenever that drawer is still the one open. Also added a
permanent, always-visible "Force update" button in the drawer (under "App
version") that unregisters the service worker, clears only this app's
`c7-*` caches, and reloads — bypassing the browser's own update-detection
entirely, so there's a reliable manual path any time detection itself
lags or misbehaves again. Verified live: drawer opens cleanly, shows the
new button and caption, and clicking it reloads the app with no console
errors and no data loss.

## 45. Found live: five deploys never reached her installed app (v127, 2026-09-21)

Caught in real time: she tapped "+ Add person" on her real Suits case
right after v126 shipped and got v124's old dead-end message, no quick-add
field — a screenshot of "synced just now," never "update ready," made the
gap visible. `git log -- sw.js` confirmed the cause: `sw.js`'s own bytes
hadn't changed since v121, even though `js/version.js`'s `C7_VERSION` had
been bumped five times since (v122–v126). The browser's own
service-worker update-check byte-diffs `sw.js` — the exact file passed to
`register()` — and only that file; it never re-fetches or diffs
`js/version.js`, which `sw.js` only ever reads through `importScripts()`.
A version bump that touches nothing else in `sw.js` (no new page file
added to `SHELL`) is therefore invisible to the browser: `updatefound`
never fires, the sync chip never offers "update ready," and the installed
app keeps running whatever code was live at the last deploy that happened
to also touch `sw.js`'s own bytes — here, v121. Every deploy in between
looked shipped (pushed, version bumped, documented) and was, in every
real sense, never received.

Fixed with a `// build: c7-vNNN` comment inside `sw.js` itself, bumped by
hand in lockstep with `js/version.js` on every future push (deploy law
updated in CLAUDE.md) — `sw.js`'s bytes now genuinely change every
deploy, so the browser's standard byte-diff correctly notices. This one
push (v127) is itself the first real test: because it changes `sw.js`'s
bytes for the first time since v121, it's the first of the last six
versions actually detectable by the normal update mechanism — v122
through v126's changes ride along inside it rather than needing to be
re-shipped individually, since the cache rebuild pulls current `SHELL`
content regardless of which version last successfully installed.

## 44. The unplaced-people picker gets a quick "type a new name" (v126, 2026-09-21)

Her follow-up, the same day as v124's "pick, don't type" change, on the
real Suits case: **"add option to add cast easily without needing to add
from people."** The friction was real: a brand-new cast member — someone
who obviously belongs to nothing else — now needed a detour to People tab
just to exist, before she could come back and pick them. `js/ui.js`'s
shared `renderUnplacedPicker` (used by Family, Event and Series alike)
gains a "— or —" divider under the pick-list and a plain name + Add field
below it. Typing a name there writes the person straight into the CURRENT
case in one step (`store.createPerson({case_id: ctx.caseId, ...})`) — no
placeless detour, no second write — through the same duplicate guard
every other "+ Person" door already uses: a match already placeless is
claimed instead of doubled, a match already homed in a different case
redirects there rather than creating a copy. The pick-list itself is
untouched — this adds a fast path alongside it, it doesn't replace it.

Verified live: on the real "Test Series Case" (standing in for Suits),
typed "Test Cast Member" straight into Cast with the pool already showing
"Placeless Ray" — both landed correctly, People tab showing "Test Series
Case" as home for each afterward.

## 43. A series case can link to Wikidata after it already exists (v125, 2026-09-21)

Her question, live, on a real "Suits" series case she'd already made:
**"how can i search wiki for these details of this tv series."** The gap:
`"+ Check Wikidata for new installments"` only ever appears when
`case_file.wikidata_id` is already set, and the only place that column
gets written is the "+ New case" form's own "Find on Wikipedia" step
(`js/pages/cases.js`'s `createFromWikidata`) — a series case created the
plain way (typed name, kind picked by hand) had no way, anywhere in the
app, to link itself to Wikidata after the fact. Fixed by adding a search
step to `js/pages/series.js` itself, in the same header spot the recheck
button occupies once linked: when `!kase.wikidata_id`, a text input
(pre-filled with the case's own name) plus "Search Wikipedia" runs the
same `searchPeople()` Wikidata lookup the "+ New case" form already uses;
picking a result writes `wikidata_id` onto the existing case
(`store.updateCase`) and immediately runs the same `fetchInstallments`/
`addInstallments` pull the recheck button runs — no second step, no
re-navigating anywhere.

Verified live end-to-end: a "Test Series Case" made with no Wikidata link,
searched "Suits," six real Wikidata candidates returned (the 2011–2019
American legal drama, plus several unrelated same-named items — a family
name, an ethnic group, other shows), picked the correct one, and all 9
seasons and 134 episodes landed with their real air dates, the era
updating to "2011 – 2019" and the header correctly switching over to the
ordinary "Check Wikidata for new installments" button afterward.

## 42. People stop being typed into a case — they're picked from People (v124, 2026-09-21)

Her ask, verbatim: **"i want to remove people from the case files and just
use the people in people tab."** A short, solution-shaped line — four
rounds of grounded questions (each building on what the code actually
does, not abstract hypotheticals) narrowed it to a concrete scope. What
triggered it: opening a case, she wants to see "cases groups worlds
families etc not people in it" — the case-opening experience, not the
data model. What changed: Family's "type a name in," Event's "+ Add
figure" and Series' "+ Add person" all stop creating a brand-new person
directly inside that case. Each now **picks** someone instead, from a
pool of people who have "nowhere else yet." Declined, explicitly, on the
last round: reassigning a person who already has a case, and letting a
person belong to more than one case at once — both real features, neither
this one. One person, one home, still holds; this only changes how that
home gets assigned.

**"Nowhere else yet" is `person.case_id IS NULL`** — no schema change,
since the column was already nullable and every existing code path just
happened to always fill it. `store.listAllPeople()` was an INNER JOIN
against `case_file`, which would have silently *excluded* a placeless
person from the one page meant to show them — a real bug, caught and
fixed before it could bite (LEFT JOIN, with the WHERE clause updated to
tolerate a null `case_file` row). A new `store.listUnplacedPeople()`
answers the picker's own question directly: everyone with `case_id IS
NULL`, name-sorted.

**People tab is now the one door a new person is created through.**
Its "+ Person" form gained a second choice next to the name field —
"Start their own case" (unchanged default: the existing one-person-case
door) or "No case yet" (new: `store.createPerson({case_id: null, ...})`,
no case spun up). A placeless tile shows "No case yet" where the case
name would sit, and — since there's no case-scoped profile to open — a
tap opens a small in-place rename/remove editor instead of navigating,
built from the same `inlineNameForm` + `twoTapConfirm` primitives every
other prompt-replacement in this app already uses. Picking a placeless
person out of the pool (from Family, an Event or a Series) is a single
`store.updatePerson(id, {case_id: targetCaseId})` — claiming them into
that case is all "picked" ever means; nothing about the person row
changes shape.

**One shared component, three callers.** `renderUnplacedPicker(slot, ctx,
{onPicked})` in `js/ui.js` lists the pool and wires the claim; an empty
pool doesn't offer to create anyone there — it names the one real door
("Add them in People first — with no case yet — then come back and pick
them here") rather than growing a second creation path. `js/pages/
relations.js`'s "Add people" drawer renamed its "Type it in" mode to
"Pick from People" and swapped `renderTypeIn` for the shared picker
outright — its separate "Look up on Wikipedia" batch-import mode is
untouched, a different, valuable feature this ask never named.
`js/pages/event.js`'s "+ Add figure" and `js/pages/series.js`'s "+ Add
person" (Cast) both dropped their local `inlineNameForm`-based
create-in-place block for the same shared picker, toggling the same slot
open/closed rather than opening a drawer — matching each page's own
existing "click again to close" pattern for that slot. `looksHurried` /
`autoCaseName` / `duplicateNameBlock` came out of all three files once
nothing there typed a name in any more.

**A duplicate pair with nowhere to record "not the same person."**
`distinct_pair.case_id` is `NOT NULL` in the schema — fine for every
prior case, where a flagged duplicate always had a home. Two placeless
people sharing a name now can't: `markPeopleDistinct(null, …)` would
throw. `js/pages/people.js`'s dup-flag falls back to whichever side
actually has a case (`p.case_id || dupInfo.keepPerson.case_id`), and
drops the "Not the same person" button entirely on the one genuinely
unrepresentable case — both sides placeless — while the merge button
(which never needed a case_id) keeps working regardless.

Verified live end-to-end (browser-storage mode — the same
stale-service-worker trap CLAUDE.md already names, `reference_stale_
service_worker_sandbox.md`, bit again mid-session; unregistering the
worker and clearing caches wasn't enough on its own, a genuine
`location.reload()` was needed too, since a hash-only navigate never
re-fetches an already-loaded module): created a placeless
person from People, confirmed the "No case yet" tile and its
rename-in-place and remove-in-place both persist; picked that person into
a fresh Event (Key figures), a fresh Family (via the drawer's "Pick from
People" mode), and a fresh Series (Cast) — each claim showed up
immediately in People as that case's name, and the picker correctly
emptied out and pointed back at People once nobody was left in the pool.

## 41. Cute, redesigned same day: dark, and built from the zodiac code (v123, 2026-09-21)

Shown 3 real candidates on her actual Sandra Bullock profile (a published
Artifact, since popup previews have failed to load for her before — see
CLAUDE.md's 2026-09-17 "mock-delivery" lesson): A "Milk tea" (warm
terracotta, gentle rounding, Comfortaa+Nunito), B "Bubblegum kawaii"
(lavender/mint, the roundest of the three, Baloo 2+Fredoka), C "Soft
blush" (barely-changed radius, mostly the app's own Public Sans). Her
answer, verbatim: **"i like b. use that but have a dark background and
keep font, use the numerology astrology colours."** Four instructions in
one line, all followed literally: keep B's shape (the 20px/28px radius,
Baloo 2 + Fredoka), swap its light lavender ground for dark, and replace
its invented accent hues with the app's own existing zodiac colour code.

**The palette is no longer invented — it's read off `--zc-*`/`--ws-*`**,
the trine/element tokens `tokens.css` already carries for the Chinese
zodiac and Western sun-sign pills (STYLE §5's "colour says how sure, form
says what it is" system). At their NIGHT values (already tuned to read on
a dark ground, per the existing day/night convention that pills go
tinted-on-dark, solid-on-light): `--brass` (the main accent, "+Add"
buttons, active states) is now literally `--zc-pink` `#ec86b4` (Pig · Goat
· Rabbit); `--gold` (the life-path number, unchanged convention) is
`--zc-yellow` `#e8c34f` (Rat · Dragon · Monkey); `--teal` is `--ws-air`
`#8fd0f5` (Gemini · Libra · Aquarius); `--green` stays `--zc-green`; `--red`
is `--ws-fire`. Ground: a deep plum-black `#1b1420`, not neutral charcoal —
the one genuinely new colour, chosen to carry the same "cute" personality
even in the dark, with a pink-tinted vignette and pink-tinted card shadows
(same lifted-layers shadow recipe Night already uses, just re-hued).

**A real bug, caught only by comparing parsed rule counts, not by reading
the CSS:** the redesign's own explanatory comment contained the literal
text `zc-*/ws-*` — the asterisk immediately followed by a slash forms a
CSS comment-close token (`*/`) in the middle of a sentence, so the comment
silently terminated three words early and everything after it, INCLUDING
the entire `:root[data-theme="cute"]` rule that followed, parsed as
garbage and was dropped by the browser with no console error. `data-theme`
still stamped correctly ("cute"), so the bug was invisible from JS state
alone — every token just silently fell through to Night's own defaults.
Found by fetching `tokens.css` fresh and comparing `document.styleSheets`'
parsed rule count (2, when 3 were expected) against the raw file's own
brace-balance count (correct) — the mismatch between "the file is valid"
and "the browser only parsed part of it" was the tell. Fixed by rewording
the comment to avoid the literal `*/` sequence.

Verified live end-to-end on a fresh, cache-isolated origin (a stale-port
false alarm along the way — see the trap noted in STYLE.md): `--brass`
computed to `#ec86b4`, `--r-sm` to `20px`, Baloo 2 and Fredoka both
confirmed genuinely loaded via `document.fonts.check()` at their real
weights (700/500, not the default 400 — a first check at the wrong weight
gave a false negative). Cases, a fresh Sandra Bullock profile, and Night
(re-checked for regression) all rendered correctly. `tests/browser-tests.html`
doesn't touch theming either way.

## 40. A third ground: 🌸 Cute — an opt-in toggle, not a redesign (v122, 2026-09-21)

"c7 design is too serious. i want it cute and adorable," then, unprompted,
the scope-defining follow-up: "make a version of it that is cute so i can
toggle." That second line resolved what could otherwise have been a large,
ambiguous ask (redesign the whole app's tone?) into a small, low-risk,
fully reversible one: a third pick in the existing Appearance switcher
(Follow phone · Day · Night · 🌸 Cute) that Day and Night — already proven,
already tokens-driven — never touch. Given that scope and her directive
phrasing, built one committed, cohesive direction and showed her the real
toggle live rather than opening with another round of taste-comparison
questions (per this project's own "a theme is tokens, never a second rule
set" lesson from the 2026-09-08 day-palette work, and "the second time she
names the same want, build it" — she'd now said it twice, each time more
specific).

**Mechanism**, following the exact Day/Night pattern in `css/tokens.css`
and `index.html`: a new `:root[data-theme="cute"]` token block defines
every token the other two grounds already define — nothing in `app.css`
itself changes. `index.html`'s inline theme-stamping script (which sets
`document.documentElement.dataset.theme` before first paint, so there's no
flash of the wrong ground) now accepts `'cute'` as a third valid stored
pick, alongside `'light'`/`'dark'` — but, deliberately, `cute` is **never**
chosen by `prefers-color-scheme` the way Day/Night can be; it only ever
applies from her own explicit pick in the sync drawer, stored the same way
(`localStorage['c7-theme']`). `js/main.js`'s Appearance switcher (already a
data-driven `[[v, label], ...].map()`) needed one array entry; the existing
generic click handler (`localStorage.setItem('c7-theme', v)` +
`window.c7ApplyTheme()`) needed no change at all.

**Palette** — warm cream-peach ground (`#fff8f3`), bubblegum candy-pink
accent (`#e8437d`, replacing brass/teal's job), warm honey gold (kept
reserved for the life-path number, same convention as the other two
grounds), soft mint/coral/lavender for teal/red/violet, and every shadow
re-tinted candy-pink instead of neutral grey — same shape (`--lift-1/2`
etc.), same depth logic, just warmer. **Two non-colour tokens carry most of
the actual "cute" feeling**: `--r-sm`/`--r-lg` (4px/8px on the other two
grounds) become 14px/24px here — since `app.css` already reads both almost
everywhere through `var()` rather than a hardcoded radius (verified by
grepping: 72 of ~100 `border-radius` declarations in the file go through
one of these two tokens), this one change alone gives every card, panel,
button, chip and tile a genuinely soft, blobby rounding with zero
component-level CSS edits — exactly the "theme is tokens" mechanism this
app has used since the original day-palette work, now proven to reach
shape as well as colour. Titles switch to **Baloo 2** (rounded, bubbly, a
real "cute app" face) and body text to **Quicksand** (a softer rounded sans
than Public Sans) — both added to the same one Google Fonts `<link>` in
`index.html` that already carries Public Sans/JetBrains Mono/Caveat, and
**confirmed actually loaded via `document.fonts.check()`** before calling
this done (this project's own three-times-repeated bug: a font named in
`tokens.css` but never linked, silently falling back to a system font —
STYLE.md §2). `--font-mono` (JetBrains Mono, every number/date) and
`--font-hand` (Caveat) are untouched: precision data doesn't need to be
cute, and Caveat already was.

Full palette and rationale: STYLE.md, "A third, opt-in ground: cute."

Verified live: toggled through all three picks on the same disposable test
case used for §39's verification (Cases grid, People grid, a full person
profile) — cute applied cleanly everywhere, `document.documentElement
.dataset.theme` read `'cute'`, computed styles confirmed the new fonts,
accent colour and radius actually took effect (not just the CSS existing
unused); Night and Day were then re-checked and render byte-identical to
before this change, confirming the addition is genuinely additive. No new
console errors. `tests/browser-tests.html`'s suite doesn't touch theming
either way (pure CSS/token change, no JS logic beyond one array entry).

## 39. A fourth case kind: series — cast and dated installments, auto-pulled from Wikidata (v121, 2026-09-21)

Her ask, from a real Wikipedia record for "A Series of Unfortunate Events": "i need a category for novel/film series." The case-kind dropdown only ever offered person / family / event — none fit a franchise, which is neither a person, a household, nor a single major event, but a cast of characters and a run of dated installments. Asked which shape she wanted (a person-case that just happens to hold a list; the event page relabelled; or a genuinely new kind with its own page); she picked the last, the biggest of the three. A second question on build scope — offered "manual version first, auto-pull later" as the safer-seeming default — she overrode: **"i want only auto pulling."** So the Wikidata pull is the build, not a follow-on; there is no manual-entry-only version of this feature to speak of. A third question, on whether a pulled installment should sit in Review first or save immediately, she answered "Save immediately" — same as `addWorks` already does for a person's own works.

**New case kind, `series`**, added to `dashboard.js`'s `CASE_KINDS`/`CASE_KIND_LABEL`/`createCaseOfKind`, `cases.js`'s `KIND_LABEL`/`openCase`/`buildPicRow`/`wireImportBtn`, and `main.js`'s `ROUTES`/`TITLES`/`INSIDE_CASE`. A new `case_file.wikidata_id` column (`db.js`'s `ADDED_COLUMNS` migration, plus `schema.sql` and `store.createCase` for a fresh database) holds the franchise's own Wikidata item, the way `person.wikidata_id` already does for a person — so "Check Wikidata for new installments" can be re-run later without her retyping anything.

**`js/pages/series.js`**, adapted from `event.js` (which faced the same "not a person" shape first, 2026-09-04): same case-level storage (every installment is an `event` row with `person_id` null, `case_id` set), same tab strip (Evidence / Contradictions / Questions / Board reused unchanged). Two differences from event.js, both disclosed calls rather than further questions, given she'd already signalled "just build it":
- **No manual era-setter.** event.js lets her type era-start/era-end by hand; a series' span is exactly its installments' own publication years, so it's read off them instead (`Math.min`/`Math.max` over `date_year_min`/parsed dates) — one less thing to keep in sync, and it can't go stale the way a hand-typed range could.
- **"Cast," not "Key figures," and no relationship graph.** The design notes floated reusing `family.js`'s "+ Add person" (which pulls in `relations.js`'s parent/spouse/sibling machinery) for the cast list. Looked at what a series' cast actually is — characters or real people connected to a franchise, not a family tree — and kept event.js's simpler flat-list "+ Add person" (name only, opens a full profile) instead; the relationship graph doesn't apply here and would have been dead weight.

**Wikidata auto-pull, in `js/works.js`**: `fetchInstallments(qid)` / `addInstallments(store, caseId, list)`, alongside the existing `fetchWorks`/`addWorks` for a person's own catalogue. Wikidata records a series↔part relationship both ways — P527 "has part(s)" on the series, P179 "part of the series" on the installment (the more reliably populated of the two in practice) — both queried and merged, an installment reachable either way asked for once. Reading order ("Book 1," "Book 2"...) comes from P1545 (series ordinal), a *qualifier* on the P179 statement rather than a plain triple, reached via the same `p:`/`ps:`/`pq:` property-path trio the existing music query already uses for a sourced date. No `GROUP BY` in either new query, so pairing directly with `SERVICE wikibase:label` is safe (the `GROUP BY` + label-service StackOverflowError found live twice already this week, §37, is specifically that combination). Each installment is written directly as an `event` row, `kind: 'installment'`, title carrying its ordinal ("1 · The Bad Beginning") for the order she'd recognise, with no claim/review step — her "Save immediately" answer, same mechanism `addWorks` already uses. A re-run dedupes by `wikidata_id` exactly like `addWorks` does, so "Check Wikidata for new installments" only ever adds what's genuinely new.

**Wired into the existing "Look up on Wikipedia" flow** (`cases.js`'s `wireCaseLookup`/`createFromWikidata`): choosing "A novel / film series" hides "+ family" entirely (a franchise has no relatives) and locks "+ installments" permanently checked — there is no unticked state, matching "only auto pulling." Picking a Wikidata match for a series creates the case with `wikidata_id` set, skips person-creation and `fillFromWikidata` entirely (a series isn't a person), pulls and saves every installment immediately, and lands on the new series page rather than a profile.

A new `.tile .pic.series` tile mark (teal, `--teal`, parallel to the existing violet `.pic.event`) keeps a series case visually distinct from an event case on the Cases grid; `.event-badge.series` gives the series page's own badge the same teal instead of event's violet.

Verified live, real Wikidata, a disposable in-browser-storage test case (not the real data folder — see §38's still-open reconnection issue): created "A Series of Unfortunate Events" from its actual Wikidata novel-series record (Q213841). All 15 installments came back correctly — the 13 numbered main books 1–13 in the right order with the right titles and dates (30 Sept 1999 through 13 Oct 2006), plus two unnumbered companion volumes ("The Beatrice Letters," "Lemony Snicket: The Unauthorized Autobiography") correctly included and correctly placed by date rather than a false ordinal. Era read "1999 – 2007" off the installments, computed correctly. "Check Wikidata for new installments," run a second time, correctly reported "Nothing new — 15 already on file." Added a cast member ("Violet Baudelaire") via "+ Add person"; her own profile opened exactly like an event-case's key figure would. The Evidence tab (and, by the same `TAB_MODULES` wiring, Contradictions/Questions/Board) rendered under the series header with no errors. The Cases-grid tile showed the new teal series mark. Console showed only the pre-existing, unrelated service-worker-registration failure from the ad-hoc verification server used for this check (not a real hosting setup) — no errors from any of the new code.

## 38. Life events stay in the sheet after adding, and Review learns to filter by person (v120, 2026-09-21)

Her ask: "when i click add event, then lookup, then life events, add x events then i have to find info to review - how to make this workflow faster and smoother." Investigated (a background pass over `subject.js`, `life-events.js`, `review.js` and `store.js`'s claim model) before changing anything, since her phrase didn't quite match what the code actually does.

**What was actually happening:** "+ Life events" (`showLifeEventsPicker`, reached via +Add → Look up → a matched record's "more ▾") calls `addLifeEvents()`, which writes each ticked item straight in — `store.createEvent` plus `store.createAcceptedClaim`, a claim inserted and immediately flipped to `state='accepted'` in the same breath. It never sits `'drafted'` — a deliberate choice (a Wikidata marriage or award date isn't really a judgment call the way a name match is), but the confirmation was a `sessionStorage`-backed banner shown once, on a page the drawer-close-and-full-rerender yanked her back to, then deleted on the next render. Nothing to accept, nothing queued, no link forward — "then I have to find info to review" was literally true: there was nothing to find, because it had already happened, silently.

**Fix, in `life-events.js` and `subject.js`:** `addLifeEvents()` now returns `created: [{id, claimId, title, kind, date}]` — what was actually written, not just a count. The `#le-add` handler no longer calls `ctx.closeDrawer()` + `ctx.rerender()` on success (the latter tears down any open drawer anyway — `main.js`'s `renderRoute()` closes it as a first step, which is exactly why the old code always had to). Instead `paintAdded()` renders the real list in the same sheet — date, title, a one-tap Remove per row (`store.deleteEvent` + `store.deleteClaim`) — with a "Done" button that does the old close-and-refresh, now a deliberate step after she's actually seen what happened, not an automatic one. Verified live: added 3 of Lily Allen's marriages, removed one from the list (confirmed gone from `listEventsForCase` after — the other two survived), Done closed the drawer and the life line showed the remaining two.

**A second, smaller fix while in the area:** the sibling "Use this" facts flow *does* draft real `state='drafted'` claims, and `#/subject/:id/review` already looked like a per-person filtered route — `subject.js` passes `personId` as `render()`'s third argument. `review.js`'s own `render(root, ctx)` never accepted it. The whole case's claims and unconfirmed relationships showed in one flat, chronologically-interleaved queue regardless of which person's page she came from, findable only by skipping card-by-card. Fixed by accepting `personId` and filtering `claims`/`rels` before the queue is built — the only wrinkle: a `'relationship'`/`'relative'` claim is filed against the *case* (`target_id` is the case id, not a person — see `import.js`/`lookup.js`), with the real link buried in `value.a_id`/`b_id`/`of`, so a plain `target_id` check would silently drop every one of them from a filtered view; `claimBelongsToPerson()` checks both. Every action that re-renders (accept, reject, skip, question, edit, bulk) now threads `personId` through so the filter survives the whole sitting. An "N more elsewhere in this case →" chip appears whenever the filter is hiding something, linking to the unfiltered `#/review` — so a person-filtered view never quietly implies the rest of the case is clear. The duplicate-detector banner (case-wide by nature) is suppressed on the filtered view rather than mislabelling itself "in this queue."

Verified live with a two-person test case: Lily's filtered queue showed 2 claims + 1 relationship (her own occupation claim, a relationship claim naming both her and a second test person, and their shared unconfirmed relationship) with "1 more elsewhere" linking correctly to the full 3-claim case total; the second person's filtered queue mirrored it from their side; accepting a claim kept the filter active across the re-render. 44/44 in `tests/browser-tests.html` (doesn't exercise either page's DOM/claim-filtering logic).

## 37. "+ Works" beyond music — and a real bug it surfaced in the music path itself (v119, 2026-09-21)

Her ask, on a screenshot of a Wikidata match row for a princess with "+ Works" visible: "for works, include more than just musical works like albums and awards." The picker (§30, ask28) had only ever queried P175 (performer), so anyone who wasn't a musician always got an empty list even when Wikidata held real works of theirs.

**Five more properties, one more query, in `js/works.js`**: P800 (a person's own "notable work" link), plus the reverse links P170 creator, P50 author, P84 architect, P61 discoverer-or-inventor — covering paintings, books, buildings and discoveries. Deliberately not P86 composer: that overlaps almost entirely with the music path's own P175 catalogue and would just relabel a musician's own songs. Dates come from whichever of P577 (publication), P571 (inception) or P585 (point in time) the item actually carries, tried in that order — the citation records which one actually dated it, not a hardcoded guess. `fetchWorks()` now runs the existing music query and the new general query in parallel via `Promise.allSettled` and merges both into one sorted list, under one more `WORK_GROUPS` entry, "Other works."

**A genuinely live, currently-broken bug in the untouched music path, found while regression-testing this change**: `LIST_QUERY` — unchanged since 2026-09-04 — pairs a `GROUP BY` aggregation subquery with `SERVICE wikibase:label` on the outer query. That exact combination reliably 500s Wikidata's query service with a Blazegraph `StackOverflowError` once an artist has enough real catalogue to aggregate — reproduced twice, minutes apart, against Lily Allen's actual discography (one of the four artists the whole music path was originally tuned against). Not a regression from today's change — `fetchMusicWorks` is byte-identical to the old `fetchWorks`, just renamed — but a real defect surfaced by testing it fresh. Fixed the same way as the new general query's own detail lookup (built afresh today, hit the identical 500 first): dropped `?itemLabel` and the label service out of `LIST_QUERY` entirely, and added a flat, non-aggregated `LABEL_QUERY`, batched 200 items at a time in the same pass as the existing detail query. Verified live: Lily Allen's "+ Works" now returns Albums · 5, EPs · 2, Singles · 24, Songs · 42 with real titles (previously it hung, then silently returned zero — see next paragraph), and `Add 59 works` created events with correct per-item citations (`(P577)`, `(P571)`, etc., not a hardcoded property).

**A second bug, in today's own new code, caught by the same regression test**: `fetchWorks()`'s `Promise.allSettled` merge, by design, keeps whichever of the two sources succeeds even if the other rejects — reasonable for a musician whose general-works query happens to error, or vice versa. But it did this silently: when the music query 500'd (above) and the general query succeeded, the picker showed only "Other works · 1" for Lily Allen with no sign that her entire discography had failed to load — a partial result presenting itself as a complete one. Fixed by tagging the returned array with `rows.failedSource` ('music' or 'general') when exactly one side rejected, and showing it as a visible warning in `subject.js`'s picker ("Couldn't read musical works right now — showing what did load; try again in a moment"). Also extended the existing 429/502/503/504 one-retry-after-2s tolerance in both queries' fetch helpers to include 500, since the live failures came in bursts mixing all of these — a busy moment, not a single deterministic error.

Verified live end-to-end, real UI (a disposable in-browser-storage test case, never the real data folder): Anne, Princess Royal's one 1740 self-portrait (typed "painting", cited via P571); Shakespeare's 299 plays and poems (mixed P571/P577 citations); Lily Allen's full discography plus her 2018 memoir "My Thoughts Exactly" (typed "literary work", cited via P577 — Wikidata dates it by publication date same as an album) — all sorted into one chronological list, added as 59 release events, reading correctly on the life-line interleaved with her music releases. 44/44 in `tests/browser-tests.html` (unaffected — nothing in the suite exercises `works.js`'s Wikidata-dependent functions either way).

## 36. createPerson silently dropped gender, nationality, marital status (v118, 2026-09-20)

Flagged in passing on 2026-09-06 (§13d, v70) as "dormant, not an active bug — but worth closing": `createPerson()`'s INSERT statement never listed the `person` table's own `gender`, `nationality` or `marital_status` columns, so anything passed under those keys was silently discarded rather than saved. Never followed up until asked directly, two weeks later, whether any backlog remained.

**Verified genuinely dormant before touching it** — traced all ~15 call sites across the app that create a person; none of them ever pass `gender`, `nationality` or `marital_status` at creation time, so nothing was actually losing data today. Every place that sets those fields does it afterward through `updatePerson()` (the Edit form, or a `gender`/`nationality`/`marital_status`-field claim applied from Review). Fixed anyway, since a `createPerson()` that can't do what its own table's columns promise is a trap for the next caller, not just today's non-issue.

Added the three columns to the INSERT (28 columns now, was 25), each `obj.field || null` like every other optional text column here. Verified live: a test person created with all three set now reads them straight back, instead of `null`. 44/44 in `tests/browser-tests.html`, unaffected (nothing in the suite exercises `createPerson`'s demographic fields either way).

## 35. Two more sources when Wikidata has nothing — Wikipedia, and D-Addicts for fiction (v117, 2026-09-20)

Her ask, refined over several rapid messages: "i want multiple sources for retrieving information, like wikipedia" → "combine multiple sources to search google to add relevant data." A browser page can't run an actual Google search — no free, key-less, CORS-open endpoint exists for that — but Wikipedia (and any other wiki running plain MediaWiki with anonymous API access) exposes the same two operations Wikidata already gave the app: a name search and a page's plain-text content. Three rounds of clarifying questions settled the shape: **mechanism** — "Add Wikipedia as its own one-click source," not a bigger paste box; **layout** — "One search box, source picked automatically," so the common case (Wikidata already has this person) must look exactly as it always has; and, once she separately named `wiki.d-addicts.com` ("use this for fictional cases and people"), **gating** — "Only offer it on cases marked fictional."

**Built as a new module, `js/wiki-lookup.js`, reusing `case_file.world`** (an existing field from 2026-09-03, previously only surfaced in `cases.js`'s "Mark as fiction" toggle, never read anywhere else) rather than inventing a second fictional-flag concept. `searchWiki()`/`fetchWikiArticle()` mirror `lookup.js`'s `searchPeople()`/`fetchProfile()` shape exactly, so `subject.js`'s existing render code barely had to change to accept a second kind of match.

**The fallback only ever runs when Wikidata found nothing** — `#lk-search`'s handler in `subject.js` tries `searchPeople()` alone first, and only calls `searchWiki()` (Wikipedia always; D-Addicts too, when `store.getCase(ctx.caseId).world` is set) when that comes back empty. A wiki match renders with a small `${wiki.label}` chip and a bare "Use this ▸" — no "more ▾" (Works/Life events), since a prose article isn't a knowledge graph the way a Wikidata item is. Clicking it runs `fetchWikiArticle()` + `draftFromWikiText()`, which drafts facts to Review and links one evidence item citing the exact page, same as a Wikidata lookup.

**A wiki article only ever contributes birth/death dates, nothing else — a disclosed, tested scope decision.** `leadDates()` pattern-matches the fixed shapes a biography's lead sentence reliably takes ("Name (born 19 January 1946) is…", "Name (21 April 1926 – 8 September 2022) was…") from the first 500 characters only. Reusing the general-purpose `parseProfileText()` on a full article was tried and rejected after live-testing against Dolly Parton's real Wikipedia page: its keyword-triggered regexes (built for short structured paste, not flowing prose) drafted `occupation: "al songwriter at sixteen. After writing songs for others"` — a mid-sentence fragment, because "worked" appeared naturally three paragraphs in. Occupation, nationality, gender and marital status stay Wikidata-or-paste-only for wiki sources.

**MediaWiki `opensearch` (title-prefix match), not `list=search` (full-text)**, found live to matter: searching a genuinely private person's name against `list=search` returned five unrelated articles that merely mentioned a matching surname in passing — the wrong failure mode for "does this wiki have this person at all?" `opensearch` correctly returned nothing for the same name.

**Two real bugs found by an adversarial 2-lens review (correctness, UX), both fixed before shipping, plus one found and fixed live before that review even started:**
1. (found during my own live UI testing) `fetchWikiArticle()` queried without `redirects=1` — a search hit that's actually a redirect (a nickname, or a minor character folded into a "List of…" page) came back with an empty extract instead of the real content, silently indistinguishable from "no dates in this article." Fixed by adding the flag.
2. **(correctness)** Two wiki-sourced match rows (Wikipedia + D-Addicts) describe the SAME subject just searched — unlike two same-named Wikidata candidates, who are usually different people. Tapping "Use this" on one row while another was still reading could draft the same date twice under two different citations, since each fetch's dedup check snapshots existing claims before either has written anything. Fixed: every "Use this" now disables ALL match rows' buttons immediately, not just its own — closing the window entirely, since every path already ends in a full re-render regardless of outcome.
3. **(UX)** "nothing recognised to draft" read as a failure when the lookup had actually worked fine — the page was read successfully, it just had no plain date in its lead. Reworded to "the page had no plain birth or death date to draft." (A third UX suggestion — surfacing MediaWiki's opensearch "description" field to tell same-titled candidates apart — was checked live against the real API for both wikis and found to always return empty; not built, since there was no data behind it.)

Verified live end-to-end through the real UI, not just direct module calls: the graceful empty-state message when neither Wikidata nor Wikipedia has a match (a real private person); a successful Wikipedia-fallback match and its redirect fix, confirmed via a disposable test case; and the D-Addicts-only-on-fictional-case gating, confirmed on a case marked fictional with real D-Addicts search results (Wikipedia correctly absent, since it genuinely has no matching article). All disposable test cases/evidence cleaned up afterward. 44/44 in `tests/browser-tests.html`.

## 34. Widowed, from the other spouse's own card too (v116, 2026-09-20)

Found by her, live, on the v115 fix itself: a screenshot of Prince Philip's own life line, showing TWO cards side by side for the same day (9 Apr 2021) — a red "✕" "Ended with Elizabeth II" card sitting right next to the correct "✝ Died" card.

**Root cause: the v115 reclassification only checked one side of the relationship.** `buildLifeLine()`'s divorce→death reclassification (§33) compared a synthesized "ended" mark's year to the SPOUSE's own recorded death year — correct for Elizabeth's card (Philip's death ends her marriage) but silent for Philip's own card, where it's HIS OWN death, not hers, that ends it. His "ended" mark never matched the check (his end year is 2021; Elizabeth's death year is 2022), so it stayed `kind: 'divorce'` and kept its original "✕" styling — the exact bug §33 was meant to fix, just visible from the other person's own profile instead.

**Fixed, in the same reclassification pass:** now checks the PERSON'S OWN death year too, not just the spouse's. But reclassifying to a second "died" mark would have just traded one duplicate for another — the person's own "Died" mark (pushed separately, right below) already states the identical fact, same day. So when it's the subject's own death that ends the marriage, the synthetic "ended" mark is dropped outright instead of reclassified — one card, not two. The marriage's own outcome-inference (`widowed`) was widened to match: it now recognizes either a spouse's death mark (carries a `spouseId`) or the subject's own bare death mark (carries none) as ending the marriage in a death, not a breakup — so Philip's own "Married Elizabeth II" card correctly reads `✝ widowed` from his side too, not just hers.

Verified live against the real Royal Family case: Philip's life line now shows exactly two 1940s/2020s cards (Married, Died — the duplicate "Ended with Elizabeth II" gone), and his marriage's own "why" panel reads `♥ Married Elizabeth II · 1947 · ✝ widowed`. Elizabeth's own card re-checked unaffected. 44/44 in `tests/browser-tests.html`.

## 33. A widowed marriage is not a failed one (v115, 2026-09-20)

Her ask, on the v114 poster (§32) itself, with a screenshot of Elizabeth II's 1947 marriage card: "show widowed instead of failed marriage." The card's "why" panel read `✕ failed` in red for a 74-year marriage that ended only when Prince Philip died in 2021 — a year before her own death.

**Root cause, found live while verifying, not guessed at:** `buildLifeLine()` synthesizes an ended-marriage mark from a spousal relationship's recorded end date, with no way to tell WHY it ended — a spouse's death dates the relationship exactly the same way a divorce does, so every ended marriage up to this point was inferred `kind: 'divorce'`, and any marriage with one was inferred `outcome: 'failed'`. A second, independently-started session (spawned earlier as `task_7aaf20a7` to fix this exact root cause) had already landed a reclassification loop in `js/lifemap.js`, uncommitted, by the time this fix began: an ended-marriage mark whose end year matches the spouse's own recorded death year is rewritten from `kind: 'divorce'` to `kind: 'death'` before outcomes are inferred. That fix alone stopped the false "failed," but left the marriage with no outcome word (or a bare "end") — not yet her actual ask of a labeled "widowed."

**Built on top of that, in the same file:** the marriage-outcome branch now also checks for a same-or-later `kind: 'death'` mark carrying the spouse's own `spouseId` (the shape the reclassification above produces) and infers `outcome: 'widowed'` when found, checked after — not instead of — the existing divorce check, so an actual divorce that happens to follow a spouse's earlier death (a second marriage) still reads `failed`. `outcomeChip()` and the poster badge glyph both gained a `widowed` case (✝, neutral gray via a new `.lm-poster-oc.lm-o-widowed` CSS rule — same glyph as `end`, but `--text-3` instead of `--red`, since a marriage that lasted until death is neither a judged success nor a failure). No new button-wiring was needed: marriage marks are synthesized from `rels`, not from a real `event`, so the "JUDGE" tap-to-overrule row was already dim/inert for every marriage mark before this fix — `widowed` is inferred-only, like `end`, by design already in place.

**Coordination note:** both sessions were editing `js/lifemap.js` at the same time. Read the other session's live, uncommitted diff before writing a line, confirmed what it already fixed and what it hadn't, and built targeted edits on top of its exact on-disk state rather than overwriting it — both fixes ship together in this one commit.

Verified live against the real Royal Family case data (not a mock): the 1947 marriage card's "why" panel now reads `♥ Married Prince Philip, Duke of Edinburgh · 20 Nov 1947 · ✝ widowed`, and the poster badge's computed color is `--text-3` (`#636c79`), not `--red`. 44/44 in `tests/browser-tests.html`, unaffected.

## 32. The life line, rebuilt — rhythm strip, decade eras, size tiers (v114, 2026-09-20)

Her ask (a screenshot of the poster, verbatim, twice): "improve ui. make 3 widgets" — the exact phrase that had already triggered the §27 (v109) redesign two days earlier, which had shipped the current screenshot's own design. A clarifying question surfaced the real ask: "make it interactive and better, more user friendly. looks too plain and boring." Three real, fully interactive HTML mockups (Motion & micro-interaction / Rich editorial timeline / Playful & gamified) were built against real Queen Elizabeth II data and sent as files; she picked **Direction B, "Rich editorial timeline."**

**The mockup's own honest trade-off, and how it was resolved for a generic subject.** Direction B's chapters ("Princess & Heir," "Marriage & Accession"), its size hierarchy, and its narrative blurbs were all hand-authored for one specific, exhaustively documented person — none of that has an equivalent in this app's real, generic data model, which has to work for an arbitrary or sparse private subject with no biography written about them anywhere. Four judgment calls, each disclosed rather than silently resolved:

1. **Chapter titles → plain decade dividers.** A real chapter name is a biographical judgment this app has no data to make. Marks now group under a plain `.lm-era` divider ("1950s") instead — always available (pure calendar math), never invented.
2. **Card size → scored from the record, not curated by hand.** `markTier()` in `js/lifemap.js` scores every mark from data that already exists: a relationship-defining kind (marriage/divorce/death, +3), a trial or crisis (+2), a milestone (+1), a numerologically special personal year (+2), a real resolved photo (+1), a cluster of 3+ same-year-same-kind marks (+1). Score ≥5 is `hero` (spans the full row — one deliberate emphasis point, not a uniform size for everything), ≥3 is `large`, ≥1 is `medium` (no override CSS at all — it's the exact pre-v114 look), else `small`. This generalizes cleanly: a genuinely eventful year earns a bigger card on ANY subject's poster, not just a famous one's.
3. **The rhythm strip → real numerology, not invented narrative labels.** A "life at a glance" strip of one tick per calendar year, toned the same as its spine segment (`pyTone()` — gold/teal/red/violet/grey), sits above the poster. The mockup's own 5-item legend ("Ambition," "Love & loss," "Turning point," …) was invented narrative framing with no equivalent in the app's real `PY_GLOSS` dictionary — dropped rather than fabricated. Tapping a tick jumps to that year's decade.
4. **No second detail panel.** The mockup's inline "dock" duplicates a surface this app already has: `onPick(mark, button)` still drives the SAME existing "why" verdict panel elsewhere on the page (`renderWhyCard`), unchanged. Building a second detail view on top of it would have been two competing places to read the same fact.

**Also resolved without asking, since the app already has an answer:** real photos (spouse's own photo for marriage/divorce, else a Wikidata item photo for award/move/other, else the plain glyph — `resolveMarkPicture()`, unchanged) replace the mockup's illustrated placeholder busts; the mobile breakpoint stays this app's own 641px, not the mockup's 760px; the v107 "quiet editorial, shadows off" flattening is now graduated by tier instead of uniformly flat — a small/medium card stays flat until hovered, a large/hero card carries a resting lift that grows on hover, since a size hierarchy with identical flatness across every tier would have undercut the very case being made for more visual weight.

**An adversarial 2-lens review (correctness, UX/conventions) found 8 real bugs, all independently verified, all fixed before shipping:**
1. A tier-graduated shadow rule for large/hero cards had higher CSS specificity than the existing `.lm-mark.on` selection ring, so tapping a large/hero mark (most of the emotionally significant ones — that's the whole point of the tier) showed no selection indicator at all. Fixed with a matching-specificity `.lm-poster .lm-mark.on` rule.
2. Switching `.lm-poster-row:first-child`/`:last-child` to `:first-of-type`/`:last-of-type` (needed because era dividers are now sometimes the true first/last DOM child) didn't actually fix anything — `:first-of-type` matches by tag, and a `.lm-era` divider is a `<div>` too. Fixed by having `renderLifeLine()` (and `renderRelationshipLine()`, which shares the same CSS) mark the real first/last row with an explicit class instead of leaning on sibling position at all.
3. `markTier()`'s own introducing comment claimed "medium is the untouched default, so an ordinary mark looks exactly as it always has" — true only for a mark with at least one point of weight; a mark with none of the scoring signals at all (the plainest possible line) goes a size down to `small`. The code was doing the intended thing; the comment was wrong. Fixed the wording.
4. A hero card spans the same grid track its own spine connector dot occupies; the dot's `z-index:1` painted it on top of the card wherever they overlapped. Fixed by hiding the connector dot for hero rows — the oversized card already marks its own spot on the spine.
5–6. The rhythm strip's ~70-90 real `<button>` elements (one per year of a long life) sat in keyboard tab order ahead of any real content, and their only "why" (the tone/personal-year meaning behind each color) lived in a `title` tooltip the accessible name never carried. Rather than build a full accessible widget for a glanceable enhancement, made the whole strip `aria-hidden` and untabbable — the page's own "year list" toggle, right above it, already gives a complete, plain-text, fully accessible list of every dated item.
7. The photo/glyph box scales up per tier (72px large, 92px hero) but the fallback glyph shown when there's no photo stayed fixed at 24px — a death mark (which can never resolve a photo, and reaches `large` tier unconditionally) rendered as a big, mostly-empty box with a tiny icon adrift in the middle. Fixed with tier-scaled glyph sizes (18/32/40px).
8. On desktop, `.lm-poster-row` has zero gap between rows and the `large` tier's own max-width (200px) exactly equalled the row's min-width floor — two consecutive large cards touched with a measured 0px between them. Fixed by giving large/hero rows their own wider floor (224px/264px) so centring leaves real breathing room.

44/44 in `tests/browser-tests.html`. Verified live against a real Wikidata pull (Queen Elizabeth II, 126 life events, 65 shown marks after clustering, 8 small/36 medium/19 large/2 hero) on both breakpoints: the rhythm strip and decade dividers render correctly, a hero mark (her 1947 marriage) spans the full row with a real spouse photo and a working selection ring, the spine truncates cleanly at both ends, and no adjacent cards touch on desktop.

## 31. The Add sheet, reordered — Wikidata first, hand-typed fields last (v113, 2026-09-19)

Her ask: "improve ui, i want wiki retrieval at the top and manual adding last. improve user friendly ui" — on the "+ Add" sheet built in §30. A literal, unambiguous reorder (a competence call, no mocks needed) plus a restrained polish pass, per the standing rule that "improve the ui" means quiet, existing-convention polish, not new chrome or a paradigm change.

**Built:** the sheet's four field-groups now read Look up (Wikidata) → Import information (paste-parse) → a quiet `.section-label` divider "By hand" → Add an event → Alternate birthday — most-automatic to most-manual, top to bottom. Every field keeps its existing id; every handler is still wired by `tools.querySelector('#id')`, so the reorder itself is presentation-only. The Look-up label was trimmed from a bare "Look up" to "Look up — the name to search," matching the sheet's own convention (each label says what to type, not what the button does).

**Four real bugs found by an adversarial 2-lens review (correctness, UX/conventions), all confirmed by independent verification and fixed before shipping:**
1. `js/main.js`'s drawer-wide Enter fallback clicks the first `.btn-primary:not([disabled])` in DOM order for any field with no local keydown handler. `#ev-kind` (the event-kind dropdown) had no such handler — harmless before, since `#ev-save` was coincidentally first; after the reorder, `#lk-search` is first, so Enter on the kind dropdown silently fired an unrelated Wikidata search instead of doing nothing useful. Fixed: `#ev-kind` now gets the same explicit Enter handler as `#ev-title`, moving focus to `#ev-date`.
2. The "no match on Wikidata" note still said "the paste box **above** still works" — true under the old order, backwards under the new one (Import now sits directly below Look-up). Fixed the wording to "below."
3. The new Look-up label ("facts and family, in one go") repeated what the button text and its title already said, three times over in one small cluster — the one label in the sheet that described the outcome instead of the input. Fixed by shortening it (see above).
4. The new "By hand" divider (originally "Add by hand") sat directly above "Add an event," repeating "Add" twice in a row. Fixed by dropping the word from the divider.

44/44 in `tests/browser-tests.html`. Verified live: reorder renders correctly, Enter on the kind dropdown now advances to the date field instead of triggering a search, and the "no match" note reads correctly.

## 30. The Add-flow's four buttons become one, plus "more" (v112, 2026-09-18)

Her ask: a screenshot of the "+ Add" sheet's Look-up field-group, plus "too many buttons to add. lookup wiki, add family, add work etc. make that more seamless." Read the actual code before mocking anything: "Look up," "+ Works," "+ Life events," and "Insert family" were four flat buttons that each independently re-ran the SAME Wikidata name search, differing only in what a clicked match did next. Wanting facts and family for the same person meant searching the same name three times.

A genuine design decision, not a competence call — built 3 real, click-through mockups (a Workflow, 3 agents each on a distinct structural direction, each required to disclose its honest trade-off): **A** one search with action chips per match, **B** pick categories before searching, **C** one primary action with the rest tucked behind "more." Sent all three as real files plus a compare-card visualize widget. She picked **C**.

**Built:** one button, "Add from Wikidata," runs one search. Each matched record shows a primary "Use this ▸" (drafts facts to Review **and** inserts family together — the two most common asks, combined) and a secondary, text-labelled "more ▾" that reveals "+ Works" and "+ Life events" as menu items, each still leading to their existing tick-and-add checklists unchanged. `showWorksPicker`/`showLifeEventsPicker` were extracted from their old flat-button handlers into standalone functions taking `(m, slot)` instead of closing over a shared results list, so they can run against an already-found match without re-searching.

**Two real bugs found and fixed before shipping, both via live testing, not just reading the code:**
1. Searching a real celebrity ("Michael Jackson") to graft their family onto an unrelated, blank-demographics test profile silently overwrote that profile's gender, nationality, death date and photo with the celebrity's own — because v111's anchor-backfill (§29) ran unconditionally. Fixed with a `looksLikeSelf` guard in `insertFamily()` (`js/lookup.js`): the anchor's own blank fields (and now, after a second review pass, its `wikidata_id` link too — the first fix left the *identity link* itself unguarded, only the demographic fields) are only touched when the searched record's Wikidata label matches the anchor's own display name.
2. An adversarial 3-lens review (correctness, conventions, accessibility) caught: "Use this" and the "more" checklists shared one result slot with no mutual exclusion, so tapping one while the other was mid-fetch (or holding an un-added tick-list) could silently clobber it; and a genuine lookup/insert failure rendered in the same green "success" border as every other message that key had ever carried. Fixed with a `lock()`/`unlock()` pair around all three actions on a match (the checklist pickers now report back whether they actually painted something, so a failed/empty search re-enables the row instead of leaving it stuck) and an `ok` flag threaded through to `c7-pi-result-ok`, so the final note picks red or green honestly.

44/44 in `tests/browser-tests.html`. Verified live: real Wikidata searches (Sofía Vergara, Michael Jackson) confirmed the self-guard fires correctly in both directions (matching name backfills, mismatched name only links relatives, never overwrites the anchor), the race lock holds a match row's buttons disabled through an in-flight "more" fetch, and the combined result message renders correctly.

## 29. ask28: backfill on Insert family, one true "to review" count (v111, 2026-09-18)

Her ask: "ask28" on a screenshot of Sofía Vergara's profile — blank Demographics next to a "Family inserted" banner, an "11 to review →" pill, an auto-inferred outcome badge, and a life line. Investigated each of the four before asking anything (`js/lookup.js`, `js/pages/subject.js`, `js/lifemap.js`, `js/store.js` / `js/pages/review.js`), then asked exactly four grounded questions rather than re-running the historical 28 — see [[project_c7_ask28_stage_plan]].

**1. Backfill (decided: yes).** `insertFamily()` (`js/lookup.js`) already calls `fillFromWikidata()` for every new or bare *relative* it inserts, but never for the anchor subject whose page she's standing on — even though the same Wikidata item that supplies the relatives also carries the anchor's own birth date, gender, nationality and birthplace. Fixed by calling `fillFromWikidata(store, caseId, personId, qid)` on the anchor too, right after its `wikidata_id` is set. `fillFromWikidata` only ever touches fields still blank, so this is safe to call unconditionally — it can't clobber anything she's already filled in by hand. Verified live: a bare anchor person run through `insertFamily('Q2831')` (Michael Jackson's real Wikidata record) came back with birth date, gender, nationality and birthplace filled, each recorded as an accepted claim citing Wikidata — same audit trail as a relative's backfill.

**2. Review count (decided: one true count).** The "N to review" pill (`caseSummary()` in `js/store.js`) only ever counted drafted claims, but Review's own queue (`js/pages/review.js`) merges drafted claims *and* unconfirmed, non-theory relationships into what she actually sees and works through — so the pill could under-report by exactly however many relationships were sitting unconfirmed (the "11 to review" in her screenshot, immediately after an Insert family, was almost certainly mostly relationships, not claims). Fixed `caseSummary()` to add `COUNT(relationship WHERE confirmed=0 AND theory_id IS NULL)` to the claims count. Verified live: after adding one unconfirmed relationship to the seed case, the pill and a hand-built copy of Review's own queue-length logic both read 4 — they now agree by construction, not by coincidence.

**3. Auto-inferred outcome tag (decided: leave as-is).** The life line's `.lm-o-failed`-style outcome badge renders identically whether a human confirmed the outcome or the app inferred it from a later event. She confirmed this is fine — recorded here so it isn't re-investigated as a bug later.

**4. "Family inserted" banner (decided: leave as-is).** The one-shot `sessionStorage` banner (no close button, clears on next navigation) is fine as she has it. Recorded for the same reason.

44/44 in `tests/browser-tests.html`.

## 28. The nav rail's collapsed state gets its labels back (v110, 2026-09-17)

Her ask: a screenshot of the desktop `#nav-rail` at its narrow (641–1199px) collapsed width, plus one word — "improve." No stated complaint, but the screenshot itself was the complaint: six icons (▤ ◉ ✓ ▣ ▩ ✦), no labels, no tooltips — exactly the pattern she's flagged before, elsewhere, more than once: "I don't always remember the page names, I hate the icon" (Book33's own nav rail, 2026-08-30), and separately picked visible text labels over icon+tooltip for LCM's header actions (2026-09-07) — see [[feedback_nav_labels_over_icons]]. A competence call, not a taste one: an already-established, twice-validated standing preference, not a fresh design question, so built directly rather than mocking 3 options.

The real markup already carries a `.label` span next to every `.ic` glyph (`Cases`, `People`, `Review`, `Inbox`, `Patterns`, `Fun & Zodiac`) — wide screens (≥1200px) already show them in a horizontal icon-beside-label row. The 641–1199px band, though, collapsed the rail to a bare `width: 60px` and set `.label { display: none }` — pure icon-only, with not even a native `title` tooltip to fall back on. Fix borrows a pattern already proven live in the very same app: the phone's `#tab-bar` already solves "identifiable in a narrow column" with icon-over-label, stacked vertically. Applied the same shape here — the rail widens slightly (60px → 72px, still well short of the full 200px wide-screen rail) and each `.nav-link` switches to a small vertical stack (icon on top, a 9.5px label below) instead of hiding the label outright. The inbox badge (`.nav-badge`), previously right-aligned via `margin-left: auto` in a horizontal row, gets the same absolute corner-pin treatment `#tab-bar` already uses for its own icon-over-label badge, so it doesn't break in the new vertical layout.

Verified live at all three states: 1000px (the collapsed band — labels now visible, confirmed via `getBoundingClientRect()` that the inbox badge sits fully inside its link's box, not clipped or overlapping the label below it), 1300px (wide rail, unchanged — still the original horizontal icon+label row with the case-context chip), and 375px (phone `#tab-bar`, untouched, still its own separate component). 44/44 in `tests/browser-tests.html`.

## 27. The life-line mark, reorganised into 3 widgets (v109, 2026-09-17)

Her ask, on a screenshot of the v108 badge: "i like the details but reorganise it, give me 3 widgets." A taste call — the INFORMATION was right (kept every fact: photo/glyph, title, date, outcome mark, personal-year raw+reduced, year zodiac), only the LAYOUT — a picture card, then a small separate badge floating below it, connected only by a thin spine segment — needed reorganising. A Workflow built 3 real candidates, each a different bet on how much of the spine architecture to touch: **A** "one card, 3 zones" (picture/info/personal-year fused into one bordered card by hairlines, moving the ring off the spine entirely); **B** "three connected widgets" (the same three groupings, kept as separate pieces but visibly stitched together — the outcome mark sitting on the seam between picture and info); **C** "just the badge, split in 3" (the most conservative reading — leave the event card untouched, only reorganise the small badge itself, spine architecture fully preserved). Shown as compact swatches in an inline `visualize` widget, matching [[feedback_mock_delivery_fallback]]. Her pick: **A**.

**What shipped.** The personal-year ring moved OFF the spine and INTO the card as its own third zone. `.lm-poster-node` (the spine's own node) is now just a small tone-coloured connector dot (`.lm-poster-dot`) — the ring that used to live there is gone. `.lm-mark` is now one bordered, `overflow:hidden` card split into 3 zones by hairlines: Zone 1 — picture/glyph (`.lm-poster-piczone` > `.lm-poster-picwrap` > `.lm-poster-pic`, background stepped to `--ink-1`), with the outcome mark now explicitly anchored to the picture wrapper rather than the whole card; Zone 2 — title + date (`.lm-poster-body`, reused); Zone 3 — personal year + zodiac (`.lm-poster-py`, a tone-tinted background step + left edge, raw/reduced fraction, the zodiac emoji, and the master-year star). The tone itself is a CSS custom property (`.tone-gold/teal/red/violet/grey/none` on `.lm-mark`) — a fresh system, kept deliberately separate from the pre-existing `.lm-t-*`/`.lm-py.lm-t-*` classes, because those are still used by the UNRELATED tap-to-open "why" card's own small ring (`renderWhyCard()`, untouched). The old `.lm-py.stack` system (raw/reduced/star/animal as a floating badge) is fully removed — dead code once the JS stopped emitting it.

One real bug caught by review before shipping: the zodiac emoji had been marked `aria-hidden="true"` unconditionally, when for a relationship-line mark (no personal year, no outcome — the zodiac is the ONLY fact in that zone) that left nothing for a screen reader beyond an unreliable `title` tooltip. Fixed with `aria-label="${animalLabel}"` on the emoji span instead of hiding it.

Verified live: cleared the service worker/cache, confirmed the real single-event subject page renders correctly, fed `renderLifeLine()` a synthetic 5-mark dataset directly (3 real Sandra Bullock events across two tones + a forced master-year mark) to check alternation, per-mark tone, and the master-year star all still work at both breakpoints — measured via `getBoundingClientRect()` that neither the outcome badge nor the master-year star is clipped by the card's new `overflow:hidden` in any row, confirmed the untouched "why" card panel still opens correctly with its own independent ring. 44/44 in `tests/browser-tests.html`.

## 26. The life-line badge grows a year zodiac (v108, 2026-09-17)

Her ask, on a screenshot of the freshly-shipped v107 badge (the "34/7" tick): "it needs year zodiac." The year's Chinese zodiac animal was already computed elsewhere — `renderWhyCard()`'s tap-to-open panel has shown it since an earlier same-day ask ("include chinese zodiac"), via `animalIndex(m.year)` — just never surfaced on the poster badge itself, where she'd actually see it without tapping. A competence call: the fact already exists and the ask was concrete, not a style direction, so built directly with no mock.

`.lm-py.stack` gained a third grid row: raw (small, muted) over reduced (bold, toned) over the year's animal (a plain small emoji via `animalIcon()`, not the header's duotone trine-tinted picture — that filter is built for a much bigger context, and a second loud colour signal would fight the quiet-editorial badge right above it). Because the year's animal comes from the calendar year alone, not the person's birth date, it shows even on the `.dot` fallback badge used when there's no personal year to display (a mark with no birth date, or the relationship-line spine in `renderRelationshipLine()` which reuses the same badge shape) — it replaces the old bare "·" placeholder there with real information instead of leaving the inconsistency once it was visible on one spine and not the other.

One layout trap: the desktop breakpoint's badge row was a *fixed* `44px` grid track. A third text row pushed the `.special` (master/submaster year) badge variant past that height, which a fixed track doesn't grow to absorb — it would have overflowed into the card rows above/below. Changed to `minmax(44px, auto)` so the track grows with content; confirmed via `getBoundingClientRect()` across every row of a 6-mark test render (including one forced `.special` badge) that no badge overflows its row and no badge overlaps its neighbouring card, rather than eyeballing a screenshot.

Verified live: the real single-event subject page shows the animal correctly; a synthetic multi-mark render (bypassing the sandbox's own thin synth data, same technique as §25) confirmed the animal renders correctly across normal and `.special` badges, on both the personal-year stack and the no-personal-year dot, at both breakpoints. 44/44 in `tests/browser-tests.html`.

## 25. The life line, restyled "quiet editorial" (v107, 2026-09-17)

Same message as §24's fix, second half: "ui audit, code7 see how ticks are cut off? mock 3 better styles for the page" — the clipped-badge bug (§24) was a competence call, fixed directly; "mock 3 better styles for the page" was a taste call on the life-line poster itself (§13w), so it went through the mock-first protocol. Grounded in the original poster's own deliberate constraints (read back from §13w before designing, not re-litigated): the mobile/desktop orientation flip, index-parity alternation (not category lanes), per-mark personal-year toning via `pyTone()`, both raw and reduced numbers always shown, and the outcome badge staying corner-anchored to the card. A Workflow built 3 real style candidates against those constraints, each rendered with the exact real 4-event Sandra Bullock dataset at both breakpoints: **A** "refined poster wall" (richer materials — glow-gradient spine, framed/matted photos, ring outcome badge, deeper hover-lift); **B** "quiet editorial" (the interface doing less — hairline spine, no card shadows, the personal-year ring replaced by a small bordered tick); **C** "the numbers lead" (the personal-year badge becomes the visual anchor, the event shrinks to a dashed satellite chip tethered to it). Shown as compact swatches in an inline `visualize` widget (per [[feedback_mock_delivery_fallback]], established earlier the same day). Her pick: **B**.

**What shipped.** Only `css/app.css`'s `.lm-poster`/`.lm-py` rules changed — `js/lifemap.js`'s markup was already the right shape (`.lm-mark`, `.lm-poster-pic`, `.lm-poster-oc`, `.lm-py.stack` with `.lm-py-raw`/`.lm-py-reduced` children), so this is a pure restyle, no DOM change. The spine thins from 4px to 2px and drops its inset shadow. `.lm-mark` drops its box-shadow and lift-on-hover for a 1px `var(--line)` border that darkens on hover instead — colour now lives as a thin accent (the tick, the spine segment), not a filled shape. The personal-year badge (`.lm-py.stack`) goes from a solid tone-coloured ring to a hairline-bordered chip: a `::before` tick bar (no DOM change — pure CSS, spans both grid rows) carries the tone colour, with raw (small, muted) over reduced (bold, toned) in a 2-row grid beside it. The `.dot` fallback (no personal year — a relationship's spine, §11) gets the same quiet chip treatment. The outcome badge keeps its exact corner position and unclipped padding fix from §24, just resized slightly (20px → 18px) to match the lighter overall weight. Because `.lm-mark`/`.lm-poster-pic`/`.lm-spine-seg` are also styled by shared page-wide shadow rules (`.card, .lm-card, .lm-mark { box-shadow: var(--lift-2) }` etc.), the override uses `.lm-poster` scoping for higher specificity rather than editing those shared rules — so the rest of the app's cards keep their normal lift.

Verified live against the real app, not just the mocks: cleared the service worker + cache, confirmed the single real subject's one mark renders correctly (unclipped badge, `getBoundingClientRect()` re-checked), then rendered the real `renderLifeLine()` function directly with the same 4-event Sandra Bullock dataset used in the mocks (bypassing the sandbox's thin synth data) to confirm alternation, per-mark tone switching (grey → red between the 2005 and 2010 pairs), and the orientation flip all still work correctly at both the mobile and desktop breakpoints. 44/44 in `tests/browser-tests.html`.

## 24. The life-line outcome badge, un-clipped (v106, 2026-09-17)

Her ask, on a live screenshot of the life-line ribbon: "ui audit, code7 see how ticks are cut off?" The green ✓ / red ✕ outcome badge on each poster card (`.lm-poster-oc`, `js/lifemap.js`) sits at `position: absolute; top: -6px; right: -6px`, deliberately poking past its card's own top-right corner. At desktop widths (≥641px) `.lm-poster` becomes a horizontally-scrolling row (`overflow-x: auto`) with zero top padding — and per the CSS spec, setting `overflow-x` to anything but `visible` while `overflow-y` is left unset forces `overflow-y` to `auto` too, not `visible`. With no padding to give the badge room inside that now-scrollable box, its top ~8px sat past the container's own edge and got clipped outright. Confirmed live via `getBoundingClientRect()` before and after (badge top vs. container top) rather than eyeballing it — an 8px overlap became a clean 2px of headroom. Fix: `.lm-poster`'s desktop rule gained a top padding (`padding: var(--sp-2) 0`, was `padding-bottom` only) — no layout or component change, purely restoring the room the badge always needed.

A competence call (an invisible correctness bug, not a taste question) — fixed directly, no mock or ask needed. 44/44 in `tests/browser-tests.html`.

## 23. The subject header, split into 3 widgets (v105, 2026-09-17)

Her ask, on a screenshot of the Profile tab's identity card: "improve this ui, make 3 widgets" + "make it visually scannable." The old header was one flat strip: avatar, a mono meta line, action buttons, then age/gender/nationality/birthplace/marital squashed into one dot-separated sentence, then the life-path/zodiac tokens floating inline right after — four different kinds of information with no visual grouping. Three real candidates, each grounded in the app's own real Sandra Bullock data and real day-theme tokens, went up as an AskUserQuestion popup with inline previews first (per the standing taste-call rule) — but she couldn't open the plain scratchpad-mock link and the popup preview didn't get through either ("you keep asking me but i cant open the mocks"), so the same 3 candidates were re-shown as an inline `visualize` widget rendered directly in the conversation instead of a link or a popup, sidestepping whatever was blocking the earlier delivery paths. Her pick: **B, "compact three-zone header."**

**The shape.** `.subject-head` is now one card (own background/radius/shadow, not wrapped in a generic `.panel`) split into zones, not three separate floating boxes: Zone 1 (identity — avatar, ref/status/occupation, aliases, the +Add/Edit/review-chip actions) runs full width and stays exactly as prominent as before; a hairline rule; then Zone 2 (Demographics) and Zone 3 (Numerology & Zodiac) sit side by side (55/45) below a second hairline, told apart by a faint background step (`--ink-2` vs `--ink-1`) rather than by breaking into separate panel chrome — collapsing to a plain stack under 640px. Demographics is now a real `.profile-grid` (the same k/v grid the "Profile details" widget already uses below, reused verbatim rather than inventing a second grid style) — one fact per row — instead of a dot-separated run-on sentence; a blank fact keeps the exact same "— gender, tap to fill in" affordance the old strip had, just as a grid row instead of an inline span. Numerology & Zodiac still renders through the real `tokensHtml(person)` (unchanged — same master-number star, boundary/cusp handling, unknown-date fallback as everywhere else this function is used), just given a scoped larger life-path number and a vertical stack instead of the default inline-wrap layout, since this zone is narrower than the full-width contexts `.lm-tokens` usually sits in.

**One structural correction made during implementation, not carried over from the mocks.** All three candidate mockups (built independently by parallel design agents) added "Sandra Bullock" as a name inside the card — but the real header never has, because the page's own top-bar title already says the name once. Copying the mock literally would have violated this project's own 2026-09-02 audit pick ("a name is said once per screen") the moment it shipped; the approved STRUCTURE (three zones, the grid, the side-by-side split) was kept, the mock's own redundant name line was not.

Verified live end-to-end against the real running app (not just the mocks): both the People-tab tile and the Cases-tile compact `.lm-tokens` usage confirmed unaffected by the new zone-scoped sizing (`.sh-zone3 .lm-tokens` only), a blank demographic field's "tap to fill in" click still opens the real Edit drawer, and the mobile collapse (identity full-width → actions wrap → demographics/numerology stack) checked at 375px. 44/44 in `tests/browser-tests.html`.

## 22. The empty state, redesigned again — "the icon is alive" (v104, 2026-09-17)

"Editorial calm" (§21) lasted one round. Her next look at it: "give me 3 redesigns of this including icons, font etc." — three static layout variants (a monospace stamp, a side-by-side layout, an oversized glyph), shown via the same popup convention. She dismissed that popup without picking — this project's tool-level convention for "do not proceed, wait for next instruction," correctly not treated as a silent pick of the recommended option. Her next words: **"i want modern, interactive designs. this will also be for the entire app"** — redirecting from static layout comparison to real motion, and re-confirming (unprompted) that this is the one shared component, not a Review-page tweak.

Three genuinely-interactive candidates were built next — actual CSS entrance animation and hover states, not more static mockups — each with its own "↻ replay entrance" button in the comparison harness so she could re-watch the motion without reloading the page: a considered staggered fade-rise with an underline-draw link hover; a magnifying-glass icon that draws itself in on mount and then breathes gently forever, with a solid lifted button; and a whole-card hover/lift version with a growing accent edge, gated behind `@media (hover: hover)` so it never gets stuck "on" on a touch device. Shown via the same inline-preview popup convention (real hex tokens, since the popup can't load the app's stylesheet); her pick was **"the icon is alive."**

**The shape**, replacing §21's rule-and-typography treatment: a 64px icon well (a magnifying glass that draws itself stroke-by-stroke, `stroke-dasharray`/`stroke-dashoffset`, inside a breathing ring — `border-radius: 50%`, opacity cycling 0.35 ↔ 0.55 on a slow 3.6s loop), a bold 16px headline, a muted 13px why-line, then the action as a solid brass/teal button (matching `.btn-primary`'s own colour language, not a separate ghost-link style) with an arrow that nudges right on hover — lifting on hover with `var(--lift-2-hover)`, the same shadow token `.tile:hover` already uses elsewhere in the app. `emptyState({missing, why, action, onAction})`'s signature is unchanged; every existing call site needed zero changes.

**Motion follows this app's own established convention, not the mock's.** The round-3 scratchpad mock gated every animation inside `@media (prefers-reduced-motion: no-preference)`; the shipped version instead follows the pattern already used three times elsewhere in `app.css` (`.review-card`, `.stamp-moment`, `.answer-flash`): animations run unconditionally, and a `@media (prefers-reduced-motion: reduce)` block strips them with `animation: none`. For that strip to land on a fully-settled, correct static state with no extra CSS, every animated property (the SVG `stroke-dashoffset`, the ring's opacity/scale, the text's opacity/translateY) is set *only* inside the animation itself (`animation-fill-mode: both`), never as a separate static rule — confirmed live by forcing `animation: none` and checking computed styles: dashoffset lands at 0 (fully drawn), ring opacity at .35 (its settled value), text/button opacity at 1. No half-animated, half-static hybrid state is reachable.

**One more small fix made in passing, in the same lines being rewritten**: `missing`/`why` were interpolated straight into `innerHTML` unescaped — harmless for the app's own hard-coded call sites, but one real call site (`dashboard.js`, the search-empty state) builds its `missing` string from the user's own search box text (`` `No matches for "${q}".` ``), so a search for a string containing `<`/`>` could have injected markup into the page. `emptyState()` now runs `missing`/`why` through the same small `esc()` pattern already duplicated in a dozen other page modules; the action label is still set via `textContent`, never `innerHTML`, since a couple of call sites (Family's Wikipedia-lookup button) build it from a case name she typed in herself.

Verified live against the real running app (not just the scratchpad mock) across three call sites — Review's "queue is empty" (the page this whole redesign started from), Evidence's "no evidence matches" (has an action), and Board's "no theories pinned yet" (a longer why-line, narrower mobile-width panel) — plus a detached no-action instance to confirm the last-element's margin collapses correctly with no trailing whitespace when there's no button. 44/44 in `tests/browser-tests.html`.

## 21. The empty state, redesigned — "editorial calm" (v103, 2026-09-17)

Her ask, looking at Review's own "The review queue is empty" card: "improve ui. give me several options." This is the ONE shared `emptyState()` component (`js/indicators.js`, `.empty-state` in `css/app.css`) used everywhere the app has nothing to show — Cases, People, Review, Board, Evidence, the life line, and more — so any redesign here changes the whole app at once, not just the screen she was looking at. Three real candidates built against the actual Review-queue-empty content and the app's real day-theme tokens (not the generic mock palette): an icon-led card, a no-icon "editorial calm" treatment leaning on typography and a thin rule, and a minimal left-accent-stripe refinement of the existing card. Shown via the popup's inline previews; her answer was "show me" — this project's own established signal to stop asking and build the recommended option (`feedback_popup_previews_inline` / this file's 2026-09-07 CLAUDE.md entry) — so **editorial calm** shipped without a further round.

**The shape**: a thin 32px rule, a bold 16px headline, a muted 13px "why" line, a second thin rule (only when there's an action), then the action as a small uppercase teal link — never a ghost button — centered rather than left-aligned. No icon, so every existing call site needed zero changes to its own arguments; `emptyState({missing, why, action, onAction})`'s signature is unchanged.

**One bug fixed in passing, found while rewriting the exact lines it lived in**: the old markup printed `<p class="empty-why">${why}</p>` unconditionally — a call site with no `why` (e.g. Commercial's "This person could not be found") would have literally rendered the word "undefined" beneath the headline. `why` is now conditional, only rendered when given.

Verified live across three genuinely different contexts (a narrow Review panel, a wide Evidence panel, both light and dark theme) rather than just the isolated comparison mock, since a centered layout that reads well in a small square card can still look lost in a much wider real panel — it read well in all three. 44/44 in `tests/browser-tests.html`.

## 20. Zodiac on the why-card, People-tab "+ Person", two overflow fixes, a Wikipedia awards-list link (v102, 2026-09-17)

A synth22 batch of four unrelated small requests, collected under her own trigger and built as one pass once she said "work on all of the above." Ultracode was on, so each item's design questions were resolved by a background research Workflow (4 parallel read-only agents, one per item) before any code was touched — every open question came back answered with a concrete, grounded recommendation, so nothing needed asking: per the 2026-09-16 standing rule ("build competence calls, ask only taste calls"), this batch was all competence calls.

**The life-line mark's own year gets its zodiac animal.** `renderWhyCard` (`js/lifemap.js`) was already computing the tapped mark's year-animal (`animalIndex(m.year)`, `js/chinese.js`) to work out the trine/clash relation shown in its "their year" line — it just never rendered the animal itself as anything more than a word buried in that sentence. Now it gets the same coloured chip `indicators.js`'s `animalChipHtml()` already gives the header's own birth-year badge (`tokensHtml`), so a tapped mark reads "🐀 Rat" as its own badge, same look as the person's own animal elsewhere. The sentence underneath was trimmed to drop the now-redundant "= Rat year" ("2008 — trine with a Dragon" instead of "2008 = Rat year — trine with a Dragon"), since the chip carries that half of it now.

**People tab gets its own "+ Person."** The People tab spans every case with no current case open, unlike Relations' own "+ Person" (which always runs inside one already-open case and writes straight into `ctx.caseId`) — reusing that form unmodified would have written into whatever case happened to be ambient in `ctx.caseId`, silently wrong on a page that by design has none. Reuses Cases' own "+ New" pattern instead: `ui.js`'s `inlineNameForm` → `store.findPeopleByName(null, name, 'person')` (the same cross-case duplicate guard as everywhere else, `duplicateNameBlock` on a hit) → `dashboard.js`'s `createCaseOfKind(store, ctx, name, 'person', null)` on a miss, which auto-creates a minimal one-person case and lands on the new profile — the exact same "create a person from nothing" primitive Cases' own button already uses, zero new store-layer code.

**Two overflow bugs, one cause.** The "+ Add" tools sheet (`js/pages/subject.js`, opened in the 420px drawer) had its Look-up row's four buttons (Look up / + Works / + Life events / Insert family) running off the drawer's right edge — the row used the bare `.row` class instead of the `.row.wrap` utility its own two sibling rows in the same sheet already used. One class added (`row` → `row wrap`) wraps it onto a second line instead. The same missing-wrap bug was found, in the same investigation, on the Commercial tab's own button row (`js/pages/commercial.js`) — fixed alongside it since it's the identical one-line cause, just not yet visibly triggered there because that panel is wider than the drawer. Separately, the alt-birthday source field's placeholder was a full sentence ("Where this comes from — a document, a page, a link") hard-clipped in a narrow input with no room for it — shortened to an example phrase, with the full sentence moved into a `title`, matching how this same sheet's Look-up buttons already keep visible text short and put the explanation in a tooltip.

**A fuller award list often lives on its own Wikipedia page — detected, not parsed.** Her example: Sandra Bullock's own Wikidata item carries 8 award statements; her real "List of awards and nominations received by Sandra Bullock" Wikipedia article has dozens. `fetchAwardsListArticle(qid)` (`js/life-events.js`) queries Wikidata for an item that is `P1269` "facet of" the person and `P31` "instance of" `Q13406463` "Wikimedia list article" with an English sitelink whose URL contains "award," and hands back that URL when one exists. The Commercial tab's "+ From Wikipedia" picker (`js/pages/commercial.js`) surfaces it as a labelled, tappable link — "A fuller award list exists on Wikipedia — open it →, then paste specific rows into '+ Add milestones' below" — rather than attempting to parse the article's own wikitext tables automatically. Deliberately not automatic: live-fetching that page's real wikitext during investigation showed two independently-scoped nested rowspans (the ceremony name and the award category each span a different, uneven run of rows), which a first-version parser could easily misattribute — silently saving a wrong year or category under this app's own "sourced" citation shape. This app's standing rule is that sourcing stays real, never guessed, so a first version links to the source for her to paste from by hand rather than risk a wrong auto-import.

Verified live end-to-end against real data (all four): a constructed award-year mark showing its year's animal chip in both the no-birth-date and full-birth-date cases; the People tab's duplicate guard correctly blocking and offering to jump to an existing "Sandra Bullock" rather than creating a second one; the Look-up row's four buttons measured wrapping onto a second line inside a 420px drawer instead of overflowing; and the real Sandra Bullock (Wikidata Q40791) pulled live, showing the same 8 Wikidata awards from her screenshot plus the new "fuller award list on Wikipedia" banner linking to the exact article she'd named. 44/44 in `tests/browser-tests.html`.

## 18. The Profile page becomes widgets, plus numerology submasters, gated Commercial, divorce year (v100, 2026-09-15)

A synth22 batch (four requests collected under one "done," synthesised
into one plan, approved as a whole): looking at Camilla's Profile tab,
"just want to see the family tree, and easily add family and events to
the profile" (with "code3 code7" — code7 doesn't exist for this project,
see the 2026-09-13 CLAUDE.md entry; applied code3 + code6 instead);
Commercial only matters "for singers, business owners, people of great
net worth"; "13, 31, 28 are all submaster numbers... show them and
reduced number e.g. 13/4 personal year"; and "i also want to see year of
divorce." Her final answers, after a mock and two rounds of questions:
the whole Profile page becomes drag-to-arrange widgets ("make me
widgets," her rejection of three narrower tree-layout options), the same
⚙ Arrange pattern as Book33's Day-page organiser; Commercial tucks into
"⋯" rather than disappearing; numerology shows personal year + life path
+ lucky number, raw AND reduced, always.

**Widgets** (`js/profile-widgets.js`, new). `WIDGET_DEFS` — nine panels:
Life line, Family, Chart, Profile details, Contradictions, Addresses,
Relations, Open questions, Attached evidence. One global (not per-person)
`localStorage` preference list — order + on/off — merges forward for any
widget a saved preference predates. Default matches what was actually on
screen before: Life line + Family on, everything that used to live
behind "Details ▸" off. `subject.js`'s Profile tab now renders every
widget's container unconditionally (`hidden` when off) rather than
conditionally including it in the template — every existing element id
(`#chart-slot`, `#address-list`, `#rel-list`, `#ask-slot`,
`#evidence-list`, …) stays put, so none of the render()'s later wiring
code needed to change. `⚙ Arrange` opens a drawer (`renderArrangeDrawer`)
matching Book33's tile organiser: drag handle, name, on/off, a brass line
(not gold — gold is reserved for the life path number, STYLE §1) marks
exactly where a dragged row will land. The Details ▸ toggle is gone,
superseded by per-widget visibility.

**Family widget = a compact tree, not the old circle-of-cards.**
`relations.js`'s `renderTree` gained `opts.compact` (no toolbar, fixed ±1
generation, no numbers/godparent chrome, always fit, one "Expand ⤢" door
to the real full-screen tree) and `opts.state` — a fresh `{up,down,scale}`
object the widget owns instead of the module-level `treeState` singleton,
so panning or zooming the mini-tree can never move the real Relations-tab
tree underneath it. The "Their Story →" link that used to live on a
`renderCircle` spouse card is gone from the Profile page along with the
circle itself (still exported from `lifemap.js`, just unused there now);
reaching it now goes through the tree's own marriage-year marker
(`renderEditMarriageYear`, unchanged) — already reachable from the
compact widget, since it's the same function. `+ Add family` opens the
add-tools drawer focused on the Look-up row's "Insert family" button
(already pre-filled with her own name); `+ Add event` on the Life line
widget does the same for the event form — both her request 1b, "easily
add family and events," without a second copy of either flow.

**Commercial-tab gating.** `isCommercialRelevant(person, events)`
(`milestone-kinds.js`): occupation keyword match (singer, musician,
actor, businessman, founder, …) OR an existing release/business/chart/
certification/deal event — `award` deliberately excluded, since it's
shared with non-commercial honours (a knighthood, a Nobel Prize) written
by the general "+ Life events" tool and would false-positive exactly the
people this gate should hide. `person.commercial_override` (new column,
1/0/null) always wins when she's set it by hand, from a new field on the
Edit form. Never circular: occupation is set the moment a Wikidata
profile is pulled, well before any milestone would exist.

**Numerology, raw and reduced.** Every caller of `reduce()` already
exposed its pre-reduction total (`lifePath`/`personalYear`'s
`.parts.total`, `birthdayNumber`'s `.day`) — no change needed in
`numerology.js` itself. Life path and lucky-number chart tiles, the
why-card's personal-year line, and the circle's spousal PY line
(everywhere still in use) now read `raw/reduced` (e.g. "18/9"). **One
surfaced constraint, not one of her literal answers:** life path's raw
total can only ever reach 13 as a submaster (max possible is 27) — 28 and
31 are mathematically impossible there; personal year's raw total can
reach all three. **One kept judgment call, not yet confirmed by her:**
the life-line poster's own 24px circular spine badges still show only the
final reduced digit — cramming "13/4" into a 24px circle would break the
poster's visual rhythm — with the full raw/reduced pair in the badge's
hover title instead.

**Tree divorce year.** `relationship.end_date`, already the schema's
field, now has a UI: `renderEditMarriageYear` gained a second "Year
separated" input beside "Year married," saved together. The tree draws
"d. YYYY" in red (`.tree-divorce-year`, `var(--red)`) mirrored below the
marriage-year line, drawn only when BOTH a marriage year and an end date
are on record — no quiet "add" dot, since the overwhelming majority of
married couples on a tree never divorce.

## 19. The spine badge, redesigned — raw AND reduced, always (v101, 2026-09-15)

§18's one flagged, unconfirmed judgment call — the life-line poster's tiny
24px spine badges still showing only the final reduced digit — got her
answer: she quoted that exact paragraph back with "- improve the ui"
appended. Not the LCM/pharmacy "improve the ui = quiet sheet" convention
(checked `feedback_improve_ui_means_quiet_sheet.md` directly rather than
pattern-matching the phrase — it's a different app's table-density
convention, unrelated here); read plainly, in context, as "the badge
should show both."

**Reframed before designing.** Raw ≠ reduced for MOST years, not just the
rare submaster/master ones — the raw total is a multi-step pre-reduction
sum almost always ≥ 10 (e.g. "18/9"). The redesign had to read well for
the ordinary case, not just the special ones. A 3-agent parallel Workflow
produced three grounded candidates against this brief; a real mock (her
own token colours, not the generic widget palette) went up as an Artifact
before asking. She picked **"Stacked fraction"**: a two-line badge, raw
small/muted on top, reduced bold/toned below, no cramming two numbers
into one line.

**`.lm-py` split into two shapes** (`css/app.css`). `.dot` — the original
24px circle, unchanged — stays for the relationship-poster's "no personal
year" case and the why-card's single-digit inline badge (`js/lifemap.js`:
`renderRelationshipLine`, `renderWhyCard`). `.stack` is new: a 28×34
rounded stadium, `.lm-py-raw` (8px, muted) over `.lm-py-reduced` (15px,
bold, tone colour) — this is what `renderLifeLine` now emits for every
personal-year node. A submaster year (13/28/31, `SUBMASTER_TOTALS` in
`lifemap.js` — her own numerology term, distinct from true master numbers
11/22/33) or a real master year gets `.stack.special` (34×40, bigger
digits); a master year additionally gets a small `--brass` star badge
(`.lm-py-star`) in the corner instead of repeating the unreduced number a
second time, since master numbers are already visually distinguished by
staying unreduced. Gold stays reserved for the life path number alone
(STYLE §1) — the star uses `--brass`, not `--gold`.

**Her mid-build follow-up, same sitting: "make the submaster larger."**
Applied the `.special` size bump to submaster years as asked. Extended it
to master years too, unasked but disclosed here: leaving master at the
base 28×34 size next to an enlarged submaster badge would read as an
inconsistency or a bug, not a deliberate distinction — both are already
told apart by content (raw digit vs. repeated master number + star), so
size didn't need to also carry that distinction. `.lm-poster-row`'s node
grid track bumped 40px → 44px (mobile and desktop) to give the bigger
badge room without crowding its neighbours.

Verified live: an ordinary year (Charles III, 2005, PY 32/5) at base
size, no star; a real submaster (Camilla, 2005, PY 31/4) at `.special`
size; a constructed master-year test case (PY 22/22) showing the star,
confirmed in both day (`--brass` = teal) and night (`--brass` = gold)
themes, then the test event removed. 44/44 in `tests/browser-tests.html`.

## 17. Their Story — a relationship's own timeline (v99, 2026-09-15)

Her ask, looking at Camilla's profile with Charles's family tree drawn on
it: "i want to create boards and timelines of relationships like camilla
and charles, when they met, etc etc milestones of relationship plus
photos and evidence." A real new concept, not a tweak — the app had a
timeline for a PERSON (the "Our Story" poster, §13g) but nothing for a
RELATIONSHIP itself. Explored with a 3-way parallel design workflow, then
a real two-option visual mock (her own actual Camilla/Charles data, real
Wikipedia photos); she picked **Option A, a dedicated page**, and **the
real thing, not a thin first pass**.

**Data model.** `event.relationship_id` (nullable, via `ADDED_COLUMNS` in
`db.js` — same mechanism `photo_path`/`wikidata_id` arrived through for
the person poster) lets a milestone belong to a relationship instead of a
person. Deliberately NOT reusing `event.person_id` for this: Camilla has
two marriages on file (Andrew Parker Bowles, then Charles), and a
person-scoped event can't say which one a mark belongs to — the exact
trap one of the three design proposals flagged and the others didn't
avoid. "Married"/"Separated" marks are synthesized straight from
`relationship.start_date`/`end_date` (the same field the tree's "m. 2005"
marker already reads and writes) UNLESS a typed milestone already covers
that year and kind — so a hand-written "Married" with its own note and
evidence is never shadowed by the bare date underneath it, and the date
is never stored in two places for one fact.

**Page.** New route `#/relationship/:id` (`js/pages/relationship.js`):
both portraits overlapping at the top, the pair's name, `verdictChips(a,
b)` (reused as-is from the person poster), then their own spine —
`buildRelationshipLine`/`renderRelationshipLine` in `lifemap.js`, sharing
`renderLifeLine`'s CSS and card shape but NOT its code: a relationship has
no birth date, so there's no personal year to tone the spine with (every
segment stays neutral rather than faking one), and a milestone's picture
is its own uploaded photo — never a spouse's face or a Wikidata fetch,
since the poster's `resolveMarkPicture` is Wikidata-specific and wouldn't
show a hand-added one. `+ Milestone` opens a drawer: what happened, kind
(met / engaged / married / separated / reunited / other), a date at its
honest precision, where, notes ("notes / evidence" — a note, or where it
comes from, same convention as the alt-birthday flow), and a photo
(`compressImage` + `storeEvidenceFile`, same path the profile picture
uses). Tapping a typed mark shows the full detail with Edit/Delete;
tapping a synthesized "Married"/"Separated" mark opens the same
year-editor the tree's own marker already uses — one place, not two.

**Entry points.** A small "Their Story →" link inside the Tree's
marriage-year drawer (`renderEditMarriageYear` in `relations.js`) — where
she's already looking at a couple, not a new button competing for
attention anywhere else. Originally also lived on a spouse card in
`renderCircle` (`lifemap.js`, `onStory` param); superseded §18
(2026-09-15) replaced the Profile page's circle-of-cards with a compact
family tree, so that copy of the link is gone along with the circle —
`renderEditMarriageYear`'s link is reachable from the compact tree too
(same function), so nothing was actually lost. `renderCircle`/`onStory`
still exist in `lifemap.js`, just unused for now.

## 16. Wikipedia first, everywhere data comes in (v98, 2026-09-14)

Her ask, looking at the Relations toolbar (`+ Person`, `+ From Wikipedia`,
`+ Relationship`, `Questions`): "i want to make inputting data easier...
just a fast button to add relationships from wikipedia instead of these
options... just use wiki to download info." Then, looking at Import's
"Describe a topic" tab (its old default): "i dont use this, i only add
from wiki." Same complaint from two different pages — she never hand-types
a name, a date, or a relationship; Wikipedia lookup is the only path she
actually uses, and the manual options were just clutter between her and
it.

**Relations page.** `+ Person` and `+ From Wikipedia` were already the
SAME drawer (`renderAddPerson`) — the first just opened it on the "Type
it in" tab, the second on "Look up on Wikipedia." That redundancy, plus
`+ Relationship` as a third, separate button, is what read as "these
options." Collapsed to one primary, bold button — `+ From Wikipedia` —
that opens straight into search, no tab click needed (the drawer's
default `mode` flipped from `'type'` to `'lookup'`, and its own two tabs
reordered to match). `+ Person`'s manual path and `+ Relationship` still
exist — capability isn't gone, a private or fictional person still needs
a way in — but demoted to small underlined text after the primary button
("or type a name in" · "link two people"), matching `.linkish` styling
used elsewhere for low-priority actions. The empty-tree state's own
action button changed the same way.

**Import page.** Its three tabs — "Describe a topic" (a hand-filled
dropdown form: pick a claim type, fill fields, submit), "Paste text"
(regex-parsed, not Wikipedia), "Look up a record" (Wikidata facts for an
existing person) — defaulted to "Describe a topic," the one she said she
never uses. Reordered so "Look up a record" leads and is the default
active tab; the other two are still there, just no longer first.

Nothing was deleted on either page — every manual path she doesn't use
today still works for the day she (or a future case) needs it, it's just
no longer competing with the one button she actually reaches for. 44/44
tests pass.

## 15. The case stamp, reused (v97, 2026-09-13)

Her reaction to the Review page's "CASE REVIEWED" stamp: "i like the case
stamp. i want more of that in the app." Asked where, with a popup showing
three candidate moments; she picked **all three** — a question gets
answered, a family import finishes, and every question in a case gets
answered.

**Pulled the look out of Review into a shared component first.**
`.review-finish`/`.finish-tally`/`.finish-note` (Review-page-specific
names) became `.stamp-moment`/`.stamp-detail`/`.stamp-note` in `app.css`,
and the markup itself moved into `stampMoment({ text, detail, note,
actionLabel, onAction })`, a new export in `ui.js` alongside
`twoTapConfirm`/`inlineNameForm`/`inlineNote`. Review's own "Case
Reviewed" screen now calls this instead of building its markup inline —
same look, same animation, no behaviour change there.

**Two of the three moments reuse `stampMoment` as-is — a genuine
finish, shown once:**
- **A family import finishes** (`relations.js`, the "+ From Wikipedia"
  batch-add drawer): when at least one person in the batch had "+
  family" ticked and it actually inserted relatives (`r.families > 0`),
  a "Family / Added" stamp appears above the existing results summary.
  Scoped to `r.families` specifically, not just any successful add — one
  ordinary person added without family ticked is not "a family import."
- **Every question in a case is answered** (`js/pages/questions.js`):
  after `answerFlow()`'s `finish()` records an answer, if every
  top-level question in the case is now resolved, an "All / Answered"
  stamp is prepended above the (still-visible, still-useful) question
  list — deliberately NOT a full-page takeover like Review's, since
  Questions still has real content worth seeing afterward, unlike an
  emptied review queue. Text reads "All Answered," not "Case Reviewed"
  or "Case Closed," on purpose — two different milestones (drafted
  claims accepted vs. questions settled) that would read as the same
  thing if worded the same.

**The third — "a question gets answered" — is NOT the same component,
by design.** This fires far more often than the other two (every single
theory pick, not once per queue/import/case), so a full centered
takeover would be constant interruption rather than a payoff. Built a
second, smaller CSS-only piece instead: `.answer-flash`, a miniature
version of the same brass double-border stamp (10px, no border-radius
excess, no page-centering) that pops in next to the question's status
chip and fades on its own over ~1.8s — one keyframe, `animation-fill-
mode: both`, no JS timer or cleanup needed (`reference_hidden_tab_
timer_throttling`-safe by construction, not by care). `prefers-reduced-
motion` hides it outright rather than freezing it visible, since its
resting state is meant to be gone.

Verified live against real data for all three: answered two real test
questions in sequence (flash on the first, the "All Answered" stamp
firing exactly on the second — the one that actually emptied the open
count); ran the real "+ From Wikipedia" family flow twice against live
Wikidata (Mark Zuckerberg's and Sasha Obama's families) to confirm the
stamp only appears when a family genuinely lands, with the right count
in its note. Test people, relationships and evidence cleaned up
afterward — `QA Tree Dup` left as found: 5 people, 5 relationships,
0 questions, 0 evidence. 44/44 in `tests/browser-tests.html`.

## 13z. The tile picture band is a 3:4 portrait (v95, 2026-09-13)

Her follow-up the moment she saw v94 live on her own real cases (a
screenshot of 17 real tiles — Michael Jackson, Amber Heard, J. K.
Rowling, Taylor Swift and more): "make tiles more vertical for photo to
look good." The full-bleed fix (§13y) was right to go edge-to-edge, but
the band itself was still the OLD short, wide 96px shape underneath it —
a real portrait photo needs more height than a 96px strip has, whatever
its crop.

`.tile .pic` traded its fixed `height: 96px` for `aspect-ratio: 3 / 4` —
a classic portrait ratio, and one that scales with the tile itself rather
than staying a fixed pixel height while the grid's own `minmax(150px,
1fr)` columns grow or shrink the tile's width. A no-photo tile's initials
grew to match (28px → 36px single, 18px → 22px per family segment) so
the big-monogram look introduced in §13y still fills the taller band
rather than looking small inside it. Nothing else about the tile —
grid, spacing, name, tokens, badges — changed; this is a single property
swap, verified by measuring the rendered `.pic` rect at both a 5-column
desktop width and a 2-column phone width (173.6×231.5 and 169.5×226 —
both hold the 3:4 ratio exactly) rather than trusting a screenshot, since
the Browser pane's own screenshot tool was cropping wider grids
mid-verification (a known tool quirk, not a layout bug — see
`reference_c7_local_preview_traps`).

## 13y. Tile picture and font fix (v94, 2026-09-13)

Her feedback right after the synth22 batch shipped: "not happy with the UI
design in terms of the font and the display of the image of the tiles in
the cases view. The image is too small. The tiles are okay." Two fixes,
one a bug, one a real choice between mocked options.

**The font — a real, app-wide bug, not a style pick.** `tokens.css` has
declared `--font-title: 'Newsreader', Georgia, 'Times New Roman', serif`
since the very first version of this design system, and every page
title, tile name, panel heading and h1/h2/h3 in the app uses it — but no
Google Font `<link>` ever actually loaded Newsreader. Confirmed with a
canvas glyph-width measurement: the full font stack measured pixel-
identical to `Georgia` alone, proof the browser was silently falling
through past a font name it could never resolve. Every serif heading in
the app has been rendering in Georgia this entire project, not the
typeface the design system was built around. Fixed by adding Newsreader
(400/500/600) to the same Google Fonts `<link>` the corkboard's Caveat
already uses (SPEC §13x) — no design decision needed, just a correction.

**The picture — mocked live in the sandbox, then two real options put to
her.** The tile's picture band has always been 96px tall; the face inside
it was hard-coded to 48px (40px for a family) — a small circle lost in a
lot of empty dark space, confirmed by pulling a real photo (Barack
Obama's own Wikipedia portrait, via the app's own `fetchProfile`) onto a
test person rather than judging it off a thin initials-only fixture. Two
real candidates were built directly in the sandbox and screenshotted
(not abstract mocks): **A** — the same round-face tile, just sized to
fill the band (76px); **B** — the photo full-bleed, edge to edge. She
picked **B**, the bolder option, after seeing both live.

**A live correction mid-build: full-bleed centre-crop cut off the top of
the head.** Her exact words, seeing the first version: "full bleed cuts
off the head. can you fix that? move photo to top." A portrait photo,
object-fit: cover'd into a wide-short band, crops from the centre by
default — for a headshot that means the crop line falls mid-forehead.
Fixed with `object-position: top`, so the crop keeps the head in frame
by anchoring to the top of the source image instead of its centre.

**Full-bleed had no answer for a family of three** — the old tile
overlapped three round faces; a photo can't overlap another photo and
still read as three people. Not one of her literal answers — a judgment
call, flagged here rather than assumed settled: a family tile is now a
strip, one segment per person (photo if they have one, their initials at
size if they don't), divided by a hairline. The event-kind mark (a
solid violet gradient block) got the same full-bleed treatment for
consistency — it already filled its circle almost edge to edge, so this
mostly means it now genuinely fills the whole band rather than sitting
inside a circle within it.

**What changed under the hood:** `cases.js`'s and `people.js`'s own
`faceEl()` (a fixed-size circular avatar, still used elsewhere — Relations
tree nodes, face-cards, the avatar component, all untouched) is no longer
called from tile rendering; both files gained a `picSegEl()` (a full-
bleed photo-or-initials segment) and `markSegEl()`/inline equivalent for
the no-photo and event cases. `.tile .pic` gained `.seg` children instead
of `.face` children — `.face`'s own CSS (a shared, circular class used
well beyond tiles) was left completely alone.

## 13x. The corkboard — theories, evidence and a red thread (v93, 2026-09-13)

Stage 4 of the synth22 batch (§13u), the last stage: the Board becomes
the detective's corkboard her reference imagery showed — theories pinned
in a row, their evidence strung beneath, a red thread wherever the
case's own contradictions cross two pinned pieces of evidence. The old
Board (a year axis of dated events) is retired — those events moved to
the poster in §13w; the Board now only ever reads theories, their
evidence links, and contradictions.

**Look — B, real cork and pushpins, overriding STYLE §9.** Her call,
against the existing "cork through colour/texture alone, not literalism"
decision: a tan cork gradient (`--cork-1/2/-edge`, new tokens, declared
once and never touched by the light/dark split — cork is a material, not
a ground colour), paper-coloured cards (`--paper`/`--paper-ink`) set at a
small per-card tilt, and round red pushpins (`.pin`) on every card. STYLE
§9 updated to match — see below.

**Arrangement — L1, theories on top.** One column per theory
(`question` rows with `parent_id`), laid out left to right in creation
order; that theory's evidence (`evidence_link` rows with
`target_type='question'`, `target_id`=the theory) hangs beneath it in a
stack. The app places every card — no drag, nothing saved. A theory
card shows the parent question as a small eyebrow line, the theory text
in the handwritten face, and a ★ for her leaning (`question.pick`) or a
✓ if it's the one that answered the question (`question.resolved &&
answer_id === this theory`). Clicking any card opens the Questions or
Evidence tab it belongs to — the corkboard only ever reads that data;
creating, starring, answering and evidencing a theory all still happen
on Questions, exactly as before this stage.

**String colour — S1, three meanings, reusing the app's existing
sourced/drafted law.** Brass (teal by day) = this evidence supports the
theory it hangs under and clears the bar the rest of the app already
uses for "sourced" (`indicators.js`'s `verificationConfidence(v) >= 40`
— two-or-more-sources and single-source both count, disputed/dead-link/
drafted don't); a grey dashed line is the same support, still drafted.
Red = an existing `contradiction` row between two evidence items already
pinned somewhere on the board, drawn as a curve between their two
positions regardless of which theories they hang under. No new law was
invented for this — the exact green/amber/red, sourced/drafted
vocabulary already used on every evidence chip in the app carries
straight over to string colour.

**A contradiction whose evidence isn't pinned anywhere yet** gets no
string — there's nowhere to draw it — and instead drops into a "Not yet
on the board" tray beneath the corkboard, one red chip per orphaned
pair, mirroring the exact fallback the OLD board.js already used for its
own "undated event" case. Not one of her sixteen literal answers, a
judgment call carried over from existing precedent rather than invented
fresh.

**Phone — P1, the Tree's own viewing controls, duplicated not shared.**
Fit/−/+ and drag-to-pan, the identical values and pattern the Relations
Tree already uses (`ZOOM_MIN/MAX/STEP`, `MIN_FIT`, the pointer-drag +
`dataset.dragged` click-suppression guard) — investigated first and
confirmed NOT to live in a reusable module (all inline in `relations.js`,
closed over Tree-only locals including a module-level singleton that
would collide if reused directly), so the Board gets its own small
`attachPanZoom()` that mirrors the proven pattern rather than refactoring
a working feature into a shared one it was never built to be.

**Two real bugs, found live before shipping, both fixed:**

- **A CSS comment closed itself early and silently ate the entire
  `.board-wrap` rule.** The comment introducing the corkboard section
  read "...see --cork-*/--paper-* in tokens.css." — and `-*/` is a
  literal comment-close sequence, so the browser's parser ended the
  comment there, treated the rest as invalid CSS, and dropped the whole
  `.board-wrap` rule (background gradient, inset edge ring) while every
  OTHER new rule in the same stylesheet parsed fine. It looked correct
  in an early screenshot because the empty cork ground still reads as a
  plausible neutral background at a glance — only caught by checking
  computed styles directly (`getComputedStyle(...).backgroundImage`)
  while verifying dark theme, not by eye. A CSS comment is not a safe
  place for a path-like string that happens to contain `*/`.
- **A missing Google Font, present since long before this stage.**
  `--font-hand: 'Caveat', ...` was already declared in tokens.css and
  already referenced by old board CSS, but no `<link>` ever loaded the
  actual Caveat font anywhere in the app — a silent gap, invisible until
  a theory card's handwritten label actually needed to render, because
  every earlier user of the token happened to render off-screen or
  untested. Fixed by adding the Google Fonts `<link>` to `index.html`,
  directly necessary for this stage's "handwritten-feel labels" pick.

## 13w. "Our Story" — the life line becomes a poster (v92, 2026-09-13)

Stage 3 of the synth22 batch: the life ribbon (§13g/§13i) redrawn as a
poster of the life itself, per her own reference imagery — a spine of
dated cards, each carrying the picture of what happened, not just a
coloured dot.

**Orientation — her own words, "down for mobile, across for desktop."**
A deliberate second layout-exception (the first was §13g's day/night
grounds): `.lm-poster` stacks vertically on the phone (cards alternating
left/right of a vertical spine) and lays out horizontally on the desktop
(cards alternating above/below a horizontal spine), at the project's
usual 640px breakpoint. Nowhere else in the app does phone and desktop
diverge in shape, not just density — flagged here so a future session
doesn't "fix" it back to one layout.

**The spine's colour — C1 of her sixteen picks.** Each shown mark gets
its own stretch of spine (`.lm-spine-seg`), toned by that mark's own
`pyTone()` — reusing the exact function and `.lm-t-*` classes the old
ribbon used, so the day-palette's gold/teal token split (STYLE §1, the
`--brass`==`--teal`-in-light trap) needed no new handling. **One
judgment call made without re-asking her:** her literal words described
the ribbon's per-CALENDAR-YEAR colouring; the poster instead colours per
SHOWN MARK — a stretch per event, not per year — because a real
timeline's marks cluster unevenly (nine Grammys in one year, decades of
nothing between school and marriage) and a strictly time-proportional
spine either crushes the sparse decades or explodes the crowded ones.
Marks lay out in chronological sequence, alternating sides, not
positioned by real elapsed time. The on-spine ring (`.lm-py`, unchanged)
carries the personal-year number as before; the old ribbon, its axis and
its legend line are retired.

**The picture — D1, "the picture of the thing."** A marriage/divorce
mark reuses the spouse's own photo, already resolved on the person row
(`m.spouseId` → the case's own people list) — no new lookup needed, the
same photo `renderCircle` already shows on a spouse card. An award,
move, or "other" mark instead fetches the picture of the WIKIDATA ITEM
the event points at — a place, a school, a trophy — via a new
`fetchItemPhoto(qid)` (`js/lookup.js`), the same sitelink → Wikipedia
lead-image trick `fetchProfile` already uses for a person's own photo,
generalised to any item and parsed off the event's own `wikidata_id`
(life-events.js's composite `personQid/prop/itemQid` shape; releases'
plain single-QID shape never reaches this path, since a chart position
isn't "the picture of a thing"). Fetched once, cached as an asset via
the existing pipeline (`compressImage`/`storeEvidenceFile`/`queueUpload`,
mirroring `savePhotoFromUrl`) onto two new columns, `event.photo_path`/
`event.photo_url`. No free image on Wikipedia (most releases, some
schools, small employers) → the card carries its kind's own glyph
instead, labelled honestly in the title attribute ("the award's
picture", never a made-up caption) — exactly her "goes without a
picture" answer for a release with no free cover.

**A real bug found and fixed live against Wikidata, before shipping:**
the first draft copied `fetchProfile`'s `.replace(/\/(\d+)px-/, '/640px-')`
resize verbatim — reasonable for a profile header photo, wrong here. A
poster picture only ever shows at 44px, and asking Commons' thumbnail
scaler to render a brand-new 640px variant on demand is unreliable
(confirmed directly: the exact same file 404's at some on-demand widths
and not others, no obvious pattern). A batch of many life events fetching
concurrently turned a rare flake into a visibly broken-image icon on
several cards. Fixed by keeping the REST API's own already-generated
thumbnail size — plenty for a 44px circle, and never a size Commons has
to newly render. Verified after the fix: a fresh pull of a real, event-
rich Wikidata record (37 life events) rendered every fetchable picture
correctly with zero broken images.

**The verdict panel — E2, unchanged in spirit.** She rejected the
on-card panel option; the single WHAT · THEIR YEAR · JUDGE panel stays
below the whole poster exactly as it was under the old ribbon
(`renderWhyCard`, untouched), filled by whichever card she taps. The
✓/✕/✝ outcome chip stays on the card itself (`.lm-poster-oc`), now a
small badge on the picture's corner instead of a plain-text glyph.

**What stayed exactly as it was:** `buildLifeLine`, `pyTone`, `PY_GLOSS`,
`lpTier`, `elementPair`, `markKind`, `eventYear`, `clusterMark`,
`outcomeChip`, `verdictChips`, `renderWhyCard`, `renderCircle`,
`renderCompare`, `tokensHtml` — only `renderLifeLine` (now async, to
resolve pictures before painting — the same decode-before-paint pattern
`renderCircle` already used) and its two `subject.js` call sites changed.

## 13v. The family and Commercial "+ From Wikipedia" doors (v91, 2026-09-13)

Stage 2 of the synth22 batch (§13u): "make adding a family from wikipedia
easier" and "commercial milestones — add from wikipedia, including
releases". Both turned out to be doors onto machinery the app already
had, just standing in the wrong room — building this stage was mostly
about putting the door where she stands, plus two small new pieces
(the next hop, and the blank-placeholder tidy).

**Family.** The Family page's Members panel gets a "+ From Wikipedia"
button and, when the case has no members yet, the empty state itself
offers "Find *case name* on Wikipedia" — both open Relations' existing
"Add people" drawer (now `export`ed) straight into look-up mode, the
same search → pick → tick-family → "Add N people" flow the Relations map
already had (`renderLookupBatch`/`paintMatches` → `addPeopleFromWikidata`,
unchanged). The empty-page offer additionally pre-fills the case's own
name and fires the search immediately — one tap, not three — and starts
every row's "+ family" box ticked, since arriving from an empty family
page means she wants the whole family, not one relative at a time. A
name that resolves to a broad item (a surname, a franchise) rather than
a specific person still shows up as the top pick — "change" against the
other candidates is how she corrects it, exactly as it already worked
everywhere else this search is used.

**The next hop** (her "YES" to the question, §13u's decision log): once
someone arrives with their own Wikidata record but nothing pulled from
it yet, a small "+ family" shows under their face on the Members row —
one tap runs `insertFamily` from them directly, no drawer, no search
(she already has their record). It only shows when
`person.wikidata_id` is set AND `listRelationshipsForPerson` comes back
empty, so it disappears the moment either a real relationship is drawn
or she has already pulled that person's own family.

**The blank placeholder.** A case can carry a person named exactly like
the case itself with nothing else on them — the natural residue of
opening a "person"-kind case for a family she hasn't looked up yet (her
original example: a case named "Kardashian" with one bare placeholder
person of the same name). The first time a Wikidata batch-add succeeds
on that case, `dropCaseNamePlaceholder` quietly removes that one person
— matched on name (case-insensitive) AND nothing else set
(`wikidata_id`, birth date, photo, notes all blank) — so it can never
catch a real person who happens to share the case's name once she has
actually put something on them. A person the batch itself just filled
in no longer qualifies (filling sets `wikidata_id`), so the one that WAS
the match is never the one dropped.

**Commercial.** The tab's "Commercial milestones" panel gets "+ From
Wikipedia" beside "+ Add milestones". One tap: if the profile already
carries a `wikidata_id` it reads straight from that record; otherwise it
searches the person's own name and, on more than one hit, asks "which
one is them?" the same way subject.js's own lookups do. The record's
releases (`works.js`, P577) and awards (`life-events.js`, P166 only —
marriages/positions/homes/schools stay off this tab) come back as one
tick list, ticked by default except a shared/pre-career release or an
undated award, which want a second look first — "Add N milestones" runs
`addWorks` and `addLifeEvents` on whatever's still ticked. Chart
positions, certifications and deals have no reliable Wikidata source and
stay exactly where they were, in the paste box below.

Remaining synth22 stages (not yet built at v91; both followed the same
day — the "Our Story" poster life line in v92, §13w, and the Board as a
detective's corkboard in v93, §13x).

## 13u. Names capitalised; Cases and People become tiles (v90, 2026-09-13)

The first stage of a synth22 batch of eight requests ("i dont like row
display… prevent lower case… make adding a family from wikipedia
easier… i dont like this [board] display… commercial milestones — add
from wikipedia… i like information, just not [life line] design…" plus
two reference images for the Board and a poster timeline). Batched,
synthesised into one plan, sixteen questions answered before anything
was built. This stage: names, and the Cases/People tiles.

**Names.** Every typed person and case name is capitalised the moment it
lands — but only when it "looks hurried" (all-lower or all-upper letters,
the same test v61/v73 already used for the Wikidata relabel guard, now
shared from `js/names.js`). A name typed with any real capitalisation
already is left exactly as typed. Particles stay lowercase mid-name
("Vincent van Gogh", "Leonardo da Vinci"), Roman numerals go fully upper
("henry viii" → "Henry VIII"), "Mc" gets its internal capital
("mcdonald" → "McDonald"), apostrophes and hyphens each cap their own
piece. A Wikidata label is never run through this — `bell hooks` stays
exactly as Wikipedia spells it.

The chokepoint lives at each typed-input site (Relations' "+ Person",
"+ Add key figure", paste-import's new person and manual claim form, a
transcript's named partners, Fun & Zodiac, the profile Edit form, case
creation — typed, Wikidata-picked or rail — and case Rename), not inside
`store.createPerson`/`updatePerson` themselves: those two are shared by
every Wikidata-sourced write too, and a name straight from Wikidata's own
label must never be re-cased.

A name the app cased itself stays eligible for a later Wikidata
correction even after it no longer "looks hurried": `person.
name_needs_formatting` (new column) is set whenever the chokepoint casts
a hurried name, and cleared the moment Wikidata's own label lands. So
"jk rowling" saves as "Jk Rowling" and a later "Look up" or "+ From
Wikipedia" on that person still corrects it to "J. K. Rowling" — without
the flag, "Jk Rowling" would already look properly capitalised (mixed
case) and the relabel guard would never fire again.

Every lower-/upper-case name already in the file gets the same tidy,
once, quietly: `store.tidyNames()` walks every person and case name,
recases the hurried ones through `updatePerson`/`updateCase` (so it
bumps `updated_at`, logs, and queues for sync like any other edit), and
sets a `meta` table flag so it never repeats. For a device that syncs it
runs from `sync.js`'s `syncNow()`, right after that cycle's `pull()` —
never before, so a stale capitalisation fix can't out-race a genuine
edit another device already pushed. A device that never signs in has no
pull to wait for, so `main.js` runs it as soon as sync settles to
`'off'`. Either path is a no-op after its first real run. The sync
drawer shows one quiet line, this session only: "N names tidied — …".

**Tiles.** "i dont like row display. mock some tile displays" (2026-09-13)
— logged as a dislike under §13k. Widget mocks of three tile shapes
(portrait/landscape/cover) were shown; she picked portrait. §13k's row is
replaced on both Cases and People by `.tile-grid`
(`repeat(auto-fill, minmax(150px,1fr))`) — one shape for the phone and the
desktop, the grid just fits more tiles per row on a wider screen. A tile
is a 96px picture band (round face, up to three overlapping family faces,
or the violet Event mark) over the name, the three tokens, attention
chips, then Import/⋯ (Cases) or the merge flag (People). Every sibling
answer from §13k still stands: three tokens, no kind/count text, chips
are doors, Import and ⋯ stay. The ⋯ menu opens as a small floating panel
under its own tile so it never stretches the rest of that grid row.

Remaining synth22 stages (not yet built at v90; the family/Commercial
doors followed in v91, §13v): the "Our Story" poster life line, and the
Board as a detective's corkboard.

## 13t. Merging a case could leave duplicate relationships behind (v89, 2026-09-12)

Her screenshot: the Relations Tree on her real Michael Jackson case, every
spouse and child drawn twice (Debbie Rowe ×2, Lisa Marie Presley ×2,
Prince/Paris/Blanket ×2 each) — Michael Jackson himself once. "still
seeing duplicates." §13s (below) closes the *creation-time* gap; this was
a different, older bug already sitting in her data: `mergeCase` — the
tool behind the Cases page's "Possible duplicate of …" chip for two case
files about the same subject (built 2026-09-06, well before this week's
work) — only ever merged the ONE subject pair the caller named. Every
OTHER person who happened to exist in both cases (a spouse or child
entered once per case, e.g. from running "Insert family" separately on
each) just had its `case_id` reassigned in place, keeping its own,
now-redundant relationship row to the newly-singular subject. The math
matched exactly: 1 subject + 2 spouses×2 + 3 children×2 = 11 people, 2
spouse-rels×2 + 3 child-rels×2 = 10 relationships — precisely what her
screenshot showed.

**`mergeCase` now sweeps for every OTHER duplicate too, not just the
named pair.** After the explicit subject merge, it re-groups everyone now
sharing the kept case by normalised name + kind (the same grouping the
People page's own detector uses) and folds each group through the
already-safe `mergePerson` — which already deletes a redundant
relationship rather than doubling it, confirmed unchanged. The same
"already directly related to each other → a namesake, not a duplicate"
guard the People page uses applies here too, so a father and son who
happen to share a name across the two merged cases are never
force-merged into one person.

**Two more relationship-creation sites had no duplicate check at all,
independent of the merge bug.** `applyClaim`'s `'relationship'` branch
(a drafted relationship claim being accepted from Review) had no
existence check, unlike its `'person'` and `'relative'` sibling branches
in the same function — accepting two claims describing the same pair
silently doubled the row. The Relations tab's manual "+ Relationship"
form had no check either — using it twice for the same pair and kind was
a deterministic duplicate, no race needed. Both now check
`relationshipExists()` first, matching the pattern already used
elsewhere in the same function/file.

**Confirmed NOT the bug:** the Tree layout itself. `layoutTree()` /
`assignGenerations()` key every structure (`gen`, `parentsOf`,
`spousesOf`, `siblingsOf`) by person id and dedupe on insert — a person
reachable by more than one relationship edge (both a spouse and a parent
in the same tree, say) is placed once with multiple lines drawn to them,
never duplicated as a node. The doubling was real data, not a rendering
artifact.

**Her existing data still needs cleaning up by hand — this fix only
stops it happening again.** The People page's own duplicate detector
(§13s) already recognises Debbie Rowe, Lisa Marie Presley, Prince, Paris
and Blanket as same-name duplicates now sharing one case, un-blocked by
the namesake guard (none of them are directly related to their own
duplicate) — each gets a "Possible duplicate →" chip there, two taps to
merge, and merging correctly collapses the redundant relationship row
each time (verified below). She needs to do this once per family member
still doubled in her real case; the code fix only prevents a FUTURE case
merge from creating fresh ones.

Verified: reproduced her exact bug on synthetic data (two independent
person-kind cases, each built out with its own spouse + child, merged
via `mergeCase`) — before the fix this would have left 6 people / 4
relationships; after the fix, 3 people / 2 relationships, case correctly
soft-deleted. A deliberate namesake case (two same-named people who are
themselves directly related to each other, simulating a real
grandfather/grandson pair split across the two merged cases) correctly
did NOT get force-merged. Both relationship-creation guards verified via
their real UI/data paths: accepting a duplicate drafted relationship
claim is now a no-op instead of a second row; using "+ Relationship"
twice for the same pair shows "This relationship is already recorded —
nothing new to add" instead of doubling it. 44/44 tests; no console
errors.

## 13s. Do not allow duplicates, across cases too (v88, 2026-09-11)

§13r's hard block only ever searched inside the case being worked in. Her
follow-up, verbatim: "the app should not allow any duplicates" — closing
the gap explicitly deferred in §13r and §13q's text: the same real person
existing twice split across two *different* cases (their own dedicated
case, and again inside a family case that mentions them by the same
name), never linked or flagged. Confirmed with a preview before building:
"adding/renaming into a cross-case name match would prompt the same way
same-case ones already do." She answered yes.

**Every duplicate check in the app now searches every case, not just the
current one.** `findPeopleByName` takes `caseId=null` for "everywhere";
all three hard-block sites, the rename guard, and the People page's
passive duplicate detector now all search globally. Every match names the
case it actually lives in ("Use Joe Jackson (added 11 September 2026) —
in "Michael Jackson" →"), since "this case" can no longer be assumed.

**"Use" a cross-case match takes you to them, not a silent no-op.**
Live-testing this before shipping caught what §13r's design didn't
anticipate: a matched person from a *different* case can't actually be
wired into the case you're working in — `person.case_id` is a single
home, so the Relations tree and an event's key-figure roster (both built
from `listPeople(thisCase)`) would just never show them, no matter what
"Use" did. So for a cross-case match, "Use" now takes you straight to
where that person already lives — the same redirect at all three
hard-block sites and the two case-creation sites below. The paste-import
flow is the one exception with something real to lose (a whole drafted
timeline, not just an empty form): its "existing person" dropdown is
built only from people in the current case, so a cross-case pick can't be
selected into it either — silently landing on whatever the dropdown
defaulted to would misattribute the timeline to the wrong person. Fixed
by tracking the picked cross-case person directly and using them, bypassing
the dropdown entirely; confirmed live that the drafted events land on the
correct person's own life line, in the case that was actually being
imported into.

**Creating a case is exactly as much a duplicate-creation moment as
typing a name — and wasn't checked at all.** A person-kind case
auto-creates its own subject the moment it's made, with no duplicate
check anywhere: typing a name in "+ New case" (both the Cases page's own
form and the nav rail's), and picking a result from "Look up on
Wikipedia" inside that same form, all created a second person with zero
warning. This is *the* scenario from her own example — a dedicated case
for someone who already exists somewhere else — so all three now get the
same hard block, redirecting to the existing person instead of making the
case at all. A second, quieter version of the same gap: opening an
existing case that currently has no person of its own (its only person
merged away from the People page, say) used to silently invent a fresh
placeholder subject with no check either — now it checks first and opens
the real match if one exists, matching the same "no one in this case yet"
handling already used elsewhere for an emptied-out case.

**Still deliberately same-case only:** the two silent/automatic reuse
paths named in §13r (claim-acceptance on Review accept, the Wikidata
auto-relabel guard) — unlike a typed name or a picked search result,
these are semi-automated and already conservative by design; the Wikidata
family-import/batch-add paths for the same reason. Widening those wasn't
part of what she asked to close.

**A tradeoff worth stating plainly:** two different real people who
happen to share a common name, in two entirely unrelated cases, will now
also trip this — the fix is a distinguishing name (a middle name, a
birth year), same as the same-case block already required. This follows
directly from what she approved, not a silent side effect.

Verified live: a hard block at each of the three interactive sites
correctly finds a match from a *different* case and names it; "Use"
takes you to the existing person in their own case, for all three plus
both case-creation sites; a cross-case paste-import timeline lands on the
right person, confirmed via Review accept and the life line; a second
same-named case is blocked whether typed, picked from Wikidata, or made
from the rail switcher; opening an emptied-out case finds the real person
instead of duplicating them; the People page's merge chip and its
two-tap confirm label correctly say which case the other entry lives in,
for a genuine cross-case pair, merged successfully; dark/mobile; 44/44
tests; no console errors.

## 13r. Do not allow duplicates (v87, 2026-09-11)

Her screenshot: the Relations tab's Zodiac map, "Joe Jackson" appearing
twice in the Michael Jackson case, drawn with a red zodiac-clash line
running to itself. "do not allow duplicates." §13q (below) had already
built a way to *resolve* a duplicate once it exists; this is the other
half — stopping one from being created in the first place.

**Hard block, no escape hatch, at every place a name gets typed by
hand.** When a person is added by typing a free-text name and the same
trimmed, case-insensitive name (Unicode-aware — "JOSÉ" matches "José") and
`kind` already exists in that case, nothing is created. An inline block
(same slot as every other inline validation in this app) lists the
existing match(es) — "Use Frida Kahlo (added 11 September 2026) →" — or
she edits the name field for someone genuinely new. No "create anyway."
Live at the three places this is actually reachable by typing a fresh
name: the Relations tab's "+ Person → Type it in" drawer (the one in her
screenshot), an event-case's "+ Add key figure," and the paste-import
flow's "+ New person" (which also preserves any relationship she'd
already picked for that person, redirecting it onto the existing person
instead of silently dropping it).

**The same rule applies to renaming, not just creating.** A person's own
Edit form now refuses to rename them onto an existing different person's
name — the rest of that save still goes through (a fixed birthdate or new
notes in the same pass aren't held hostage by the name field), only the
name reverts, with a note pointing at merging from the People page if
they really are the same person.

**Deliberately not hard-blocked — already safe, or not an interactive
moment:** creating the first/only person in a brand-new or empty case
(structurally can't collide); the Wikidata family-import and batch-add
paths, and the paste-transcript "with: …" extraction in Questions, which
already silently reuse a same-named person rather than create a second
(a pre-existing pattern, now also proven correct against accented
letters); a "new person" claim drafted via the paste-import "Describe a
topic" tab, which only becomes a real person when *accepted* later from
the Review queue — no live typing moment to block against, so it follows
the same silent-reuse pattern as its sibling claim types, and now
backfills a drafted birth date onto the reused person the same way the
sibling branch backfills a Wikidata id (only when the existing person
doesn't already have one). The Fun & Zodiac page keeps its own separate,
pre-existing silent-merge behaviour, untouched — it was never real
research.

**"Not the same person," properly weighed.** §13q's merge chip flags a
same-named pair unless they already carry a relationship to each other
(namesakes, not a double entry). Now she can say so explicitly too — a
"Not the same person" action beside the chip, set off by a divider so the
two opposite verdicts sitting side by side don't invite a mistap. Marking
a pair distinct can't be undone anywhere in the app, so it gets the same
two-tap weight as the merge right next to it, not a lighter one. The
decision is permanent per pair and survives everything that could
otherwise make it forgotten: it syncs across devices, and if either side
of a marked pair later turns out to be a genuine duplicate of a third
person and gets merged away, the "these two are different" fact is
carried over onto the surviving identity rather than silently lost.

Verified live: all three hard-block sites correctly refuse a colliding
name and create nothing, a differently-named or corrected name still
creates or saves normally, "Use existing" closes/resolves each form
without a duplicate and (for the paste-import flow) keeps the relationship
she'd chosen and updates its own confirm button to match; the Edit-form
rename block saves every other field while reverting only the name; a
same-named pair with no relationship still gets the merge chip and merges
correctly (regression on §13q); "Not the same person" requires two taps
and is confirmed to sync-eligible and merge-survive; an accented name
(José/JOSÉ) is caught correctly; light/dark/mobile; 44/44 tests.

## 13q. Duplicate people, resolved from the People page (v86, 2026-09-11)

"lisa is duplicated but i dont know how to resolve it. make the process
easier." The engine already knew how to fold two people into one —
`store.mergePerson(keepId, dupId)` re-homes every alias, address, event,
contradiction, claim, evidence link, tagging and relationship the duplicate
carried, fills any blank field on the keeper from the duplicate, and
soft-deletes the duplicate. It just had no door on the People page. Cases
already had one: same-named person-*cases* get a "Possible duplicate of
… →" chip (`js/pages/cases.js`, `findDuplicateCases`), added 2026-09-06 for
the "Michael Jackson" / "michael jackson" problem. This is that pattern,
copied exactly, one level down — same-named *people* within one case.

Grouped by `case_id` + the name, trimmed and lower-cased, + `kind` (so a
person and an org or household sharing a name never pair up); the oldest
created wins and every later one gets the chip; two-tap confirm merges. A
group of three or more works the same way — everyone but the oldest is
flagged, and merging one re-renders the whole page, so the group
self-corrects on its own without any special-casing.

**Deliberately narrower than it could be.** Two people who are the same
name in *different* cases — a subject with their own case, matched again
inside someone else's family tree — are not touched here. That is a
different question: whether a person can belong to more than one case at
once, which is a real design call about what a person *is* in this app,
not a data-hygiene fix. Raised to her as a separate, bigger decision.

**A related pair is never offered the merge.** An adversarial review run
before ship caught a real blocker: two same-named people who already have
a relationship recorded between them (a father and son sharing a name, the
app's own core "keep distinct people distinct" scenario) are almost
certainly namesakes, not a double entry — the same real person merged
under two rows would never carry a relationship to themselves. Merging
them anyway would silently *delete* that relationship (`mergePerson`
collapses both ends to the same id and drops the now-self-referential
row) with no warning naming what was lost. So `js/pages/people.js` checks
`listRelationshipsForPerson` before flagging a pair at all — a directly
related pair simply gets no chip, full stop. The shared `mergePerson`
primitive itself is untouched; the guard lives only at this one door.

**The confirm step names both birth years, when known.** "Merge into the
other Lisa? (this: b.1998 · keeping: b.1950)" — visible on the armed chip
itself, not a hover-only tooltip, so it reads on a phone too. A same-named
pair with a real age gap is the other shape "different people, same name"
can take once the relationship guard has ruled out namesakes with a
recorded link.

Verified live: a 2-person and a 3-person group, a relationship and an
evidence link on the merged-away entry both confirmed re-homed to the
keeper afterward, the merged person gone from the list with no orphaned
links left pointing at it, a same-named person in a *different* case left
alone throughout, a related same-named pair correctly withheld the chip,
the birth-year confirm text checked against a real merge, light and dark,
phone width, 44/44 tests.

*Known, accepted gap:* if the two merged entries both link the same piece
of evidence with different notes on the link, one note is dropped —
`mergePerson`'s existing collision handling (unchanged, pre-dates this
feature, shared with the Cases page's cross-case merge). Minor and rare
enough not to hold up this ship.

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
