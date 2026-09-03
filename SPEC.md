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

Resolution: ship a one-double-click launcher next to the app.

- `start.command` (macOS) — runs `python3 -m http.server 8777` in the app
  folder and opens `http://localhost:8777`. Python 3 ships with macOS.
- `start.bat` (Windows) — runs `serve.ps1` via PowerShell, which serves the
  folder on the same port using .NET's `HttpListener`, and opens
  `http://localhost:8777`. PowerShell ships with every Windows install, so
  this needs nothing extra either (an earlier version shelled out to
  `python`, which most Windows machines don't have — switched to avoid
  that install step).

Nothing else to install, on either platform. No npm, no build step, no
bundler. Double-click, browser opens, app runs.

## 2. Folder shape

```
c7-case-files/
  start.command            double-click launcher (mac)
  start.bat                double-click launcher (windows)
  serve.ps1                the windows launcher's local server (no installs needed)
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
   face. Non-family links (business, associate, household) are listed
   under the tree as "Other connections". The old circular **zodiac map**
   stays as a toggle. Layout is pure (`js/tree.js`: generations by
   relaxation over parent/spouse/sibling links, couple units, recursive
   widths); the page only draws. Below: repeating-number panel and
   life-path grid.
6. Patterns — the pair matrix, selected-pair readout, children-vs-parents
   band, event-date numbers, findings with observed vs expected, control
   test.
7. Import — describe a topic / paste text / look up a record. Everything
   drafted, at zero confidence, into the queue. The unverified lock cannot be
   turned off.
8. Review — one claim at a time, keyboard A / S / E / R / ?, bulk actions,
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
- **Migration:** the first sign-in against an empty cloud uploads the whole
  local database once. Later devices pull instead, and an untouched
  example case is removed rather than duplicated.
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
  The only other third-party load is a YouTube thumbnail image for a linked video
  (`js/media.js`; an `<img>` from YouTube's image host, video id only,
  placeholder when offline). Nothing else; no automatic lookups.
- **The launcher (`start.bat` / `start.command`) is legacy.** The
  localhost copy edits the same folder as the live app from a separate
  origin — the two-live-masters trap — so it shows a steering notice to
  the live URL. A "Download backup (.db)" button in the sync drawer
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
- **Tapping a case goes in** (`openCase`): a person-case opens the
  person's profile (creating the person from the case name if the case
  is empty); a family-case — or an old research-kind case with several
  people — opens the **family overview** (`js/pages/family.js`: faces
  row, then the Relations map with its + Person / + Relationship). The
  rail switcher does the same; "lands on the Dashboard" is retired.
- **The profile carries the case's workspace as tabs**: Profile ·
  Evidence · Contradictions · Board · Relations · Import
  (`#/subject/<id>/<tab>`). The tab pages are the same case-level
  modules mounted under the person's header; they re-render through
  `ctx.rerender()` so tabs stay tabs. Profile body order: basics strip,
  Profile panel (facts, paste box, Look up), timeline, chart,
  contradictions, addresses/relations, questions/evidence.
- **Back is a plain ← arrow** in the topbar on any inside-a-case route,
  returning to Cases. No breadcrumb.
- **People** (`js/pages/people.js`): everyone in every case, searchable,
  tap → profile.
- A brand-new person-case **offers** Look up on the fresh profile (one
  tap to run it, never automatic). Launch reopens the last route
  (`localStorage c7-last-hash`).
- Navigation: rail Cases · People · Review · Inbox · Patterns · Fun &
  Zodiac, with "Dashboard (old)" dimmed until ~2026-09-09; phone tab bar
  Cases · People · Review · Inbox · Fun. `#/inbox` is the Evidence page
  opened on its Inbox view.
