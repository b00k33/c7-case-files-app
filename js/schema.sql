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
  gender TEXT, nationality TEXT,           -- profile basics (2026-09-02), free text
  marital_status TEXT,                     -- override only; normally derived from spouse relationships
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

-- file_path: an optional picture of the moment (a screenshot), stored like any asset
CREATE TABLE video_moment (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  t_ms INTEGER NOT NULL,
  label TEXT, note TEXT, quote TEXT,
  conflicts INTEGER DEFAULT 0,
  file_path TEXT
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

-- "this vs that": two pieces of evidence (each optionally pinned to a video
-- moment or a quote) that contradict each other about one person. Purely
-- descriptive — never changes verification or confidence (her rule).
CREATE TABLE contradiction (
  id TEXT PRIMARY KEY,                     -- uuid v4, generated client-side
  case_id TEXT REFERENCES case_file(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES person(id) ON DELETE SET NULL,
  a_evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  a_moment_id TEXT, a_quote TEXT,
  b_evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  b_moment_id TEXT, b_quote TEXT,
  note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
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
CREATE INDEX idx_contradiction_person ON contradiction(person_id);
