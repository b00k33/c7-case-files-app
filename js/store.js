// The only module the UI calls for data. Every function here is async and
// can fail — written as if the data were already remote, because one day
// it will be. Locally these run SQL against sql.js (via db.js); hosted,
// the same signatures become fetch() calls and nothing above this file
// changes.

import * as db from './db.js';

export function uuid() { return crypto.randomUUID(); }
export function nowISO() { return new Date().toISOString(); }

// change_log is device-local audit. The sync outbox rides the same
// chokepoint: every mutation that logs a change also queues that record for
// the next cloud push (the outbox tables exist once sync.js has booted).
let outboxReady = false;
let outboxListener = null;
export function markOutboxReady() { outboxReady = true; }
/** sync.js registers here to push soon after any change lands in the outbox. */
export function setOutboxListener(fn) { outboxListener = fn; }

function logChange(entity, entityId, op, payload) {
  db.run(
    'INSERT INTO change_log (id, entity, entity_id, op, payload, at, device) VALUES (?,?,?,?,?,?,?)',
    [uuid(), entity, entityId, op, JSON.stringify(payload), nowISO(), 'local']
  );
  if (outboxReady && entity !== 'change_log') {
    db.run('INSERT OR REPLACE INTO c7_outbox (entity, entity_id, queued_at) VALUES (?,?,?)', [entity, entityId, nowISO()]);
    if (outboxListener) { try { outboxListener(); } catch (_) { /* never let sync scheduling break a save */ } }
  }
}

// ---------------------------------------------- cases home: search + summaries --

/** Everything, across every case: cases, people, evidence titles/notes, video quotes. */
export async function searchAll(q) {
  const like = `%${q}%`;
  const cases = db.exec(
    `SELECT id, name AS label, id AS case_id, name AS case_name FROM case_file
     WHERE deleted_at IS NULL AND kind != 'fun' AND name LIKE ? ORDER BY name LIMIT 10`, [like]
  ).map((r) => ({ type: 'case', ...r }));
  const people = db.exec(
    `SELECT p.id, p.display_name AS label, p.case_id, c.name AS case_name FROM person p
     JOIN case_file c ON c.id = p.case_id
     WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND c.kind != 'fun'
       AND (p.display_name LIKE ? OR p.name_at_birth LIKE ? OR p.notes LIKE ?) ORDER BY p.display_name LIMIT 20`, [like, like, like]
  ).map((r) => ({ type: 'person', ...r }));
  const evidence = db.exec(
    `SELECT e.id, e.title AS label, e.case_id, c.name AS case_name, e.type AS sub FROM evidence e
     JOIN case_file c ON c.id = e.case_id
     WHERE e.deleted_at IS NULL AND c.deleted_at IS NULL AND (e.title LIKE ? OR e.notes LIKE ?) ORDER BY e.created_at DESC LIMIT 20`, [like, like]
  ).map((r) => ({ type: 'evidence', ...r }));
  const moments = db.exec(
    `SELECT m.id, COALESCE(m.quote, m.label) AS label, e.id AS evidence_id, e.title AS sub, e.case_id, c.name AS case_name FROM video_moment m
     JOIN evidence e ON e.id = m.evidence_id JOIN case_file c ON c.id = e.case_id
     WHERE e.deleted_at IS NULL AND (m.quote LIKE ? OR m.label LIKE ? OR m.note LIKE ?) LIMIT 20`, [like, like, like]
  ).map((r) => ({ type: 'moment', ...r }));
  return [...cases, ...people, ...evidence, ...moments];
}

/** What a case card needs: its people (with pictures) and the counts that earn a badge. */
export async function caseSummary(caseId) {
  const people = await listPeople(caseId);
  const toReview = db.exec(`SELECT COUNT(*) AS n FROM claim WHERE case_id=? AND state='drafted'`, [caseId])[0]?.n || 0;
  const questions = db.exec(`SELECT COUNT(*) AS n FROM question WHERE case_id=? AND resolved=0`, [caseId])[0]?.n || 0;
  const inbox = await countInbox(caseId);
  return { people, toReview, questions, inbox };
}

/** Every person in every research case, for the People view. */
export async function listAllPeople() {
  return db.exec(
    `SELECT p.*, c.name AS case_name, c.kind AS case_kind FROM person p
     JOIN case_file c ON c.id = p.case_id
     WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND c.kind != 'fun'
     ORDER BY p.display_name COLLATE NOCASE`
  );
}

// ---------------------------------------------------------------- cases --

export async function listCases() {
  return db.exec('SELECT * FROM case_file WHERE deleted_at IS NULL ORDER BY updated_at DESC');
}

export async function getCase(id) {
  const rows = db.exec('SELECT * FROM case_file WHERE id=? AND deleted_at IS NULL', [id]);
  return rows[0] || null;
}

export async function createCase(obj) {
  const id = uuid();
  const now = nowISO();
  db.run(
    `INSERT INTO case_file (id,name,kind,description,era_start,era_end,owner_id,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, obj.name, obj.kind || 'research', obj.description || null, obj.era_start ?? null, obj.era_end ?? null, 'local', now, now]
  );
  logChange('case_file', id, 'insert', obj);
  return getCase(id);
}

export async function updateCase(id, patch) {
  const now = nowISO();
  const fields = Object.keys(patch);
  if (!fields.length) return getCase(id);
  db.run(
    `UPDATE case_file SET ${fields.map((f) => `${f}=?`).join(',')}, updated_at=? WHERE id=?`,
    [...fields.map((f) => patch[f]), now, id]
  );
  logChange('case_file', id, 'update', patch);
  return getCase(id);
}

export async function softDeleteCase(id) {
  const now = nowISO();
  db.run('UPDATE case_file SET deleted_at=?, updated_at=? WHERE id=?', [now, now, id]);
  logChange('case_file', id, 'delete', {});
}

// --------------------------------------------------------------- people --

export async function listPeople(caseId) {
  return db.exec(
    'SELECT * FROM person WHERE case_id=? AND deleted_at IS NULL ORDER BY display_name COLLATE NOCASE',
    [caseId]
  );
}

export async function getPerson(id) {
  const rows = db.exec('SELECT * FROM person WHERE id=? AND deleted_at IS NULL', [id]);
  return rows[0] || null;
}

export async function createPerson(obj) {
  const id = uuid();
  const now = nowISO();
  db.run(
    `INSERT INTO person (id,case_id,kind,display_name,name_at_birth,ref_code,
       birth_date,birth_precision,birth_year_min,birth_year_max,birth_time,birth_time_precision,
       birth_place,birth_lat,birth_lng,birth_tz,death_date,death_precision,occupation,status,notes,
       created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, obj.case_id, obj.kind || 'person', obj.display_name, obj.name_at_birth || null, obj.ref_code || null,
      obj.birth_date || null, obj.birth_precision || 'unknown', obj.birth_year_min ?? null, obj.birth_year_max ?? null,
      obj.birth_time || null, obj.birth_time_precision || 'unknown',
      obj.birth_place || null, obj.birth_lat ?? null, obj.birth_lng ?? null, obj.birth_tz || null,
      obj.death_date || null, obj.death_precision || 'unknown', obj.occupation || null, obj.status || 'active', obj.notes || null,
      now, now,
    ]
  );
  logChange('person', id, 'insert', obj);
  return getPerson(id);
}

export async function updatePerson(id, patch) {
  const now = nowISO();
  const fields = Object.keys(patch);
  if (!fields.length) return getPerson(id);
  db.run(
    `UPDATE person SET ${fields.map((f) => `${f}=?`).join(',')}, updated_at=? WHERE id=?`,
    [...fields.map((f) => patch[f]), now, id]
  );
  logChange('person', id, 'update', patch);
  return getPerson(id);
}

export async function softDeletePerson(id) {
  const now = nowISO();
  db.run('UPDATE person SET deleted_at=?, updated_at=? WHERE id=?', [now, now, id]);
  logChange('person', id, 'delete', {});
}

export async function listAliases(personId) {
  return db.exec('SELECT * FROM person_alias WHERE person_id=? ORDER BY alias', [personId]);
}

export async function createAlias(obj) {
  const id = uuid();
  db.run('INSERT INTO person_alias (id,person_id,alias,kind) VALUES (?,?,?,?)', [id, obj.person_id, obj.alias, obj.kind || 'other']);
  logChange('person_alias', id, 'insert', obj);
  return id;
}

export async function listAddresses(personId) {
  return db.exec('SELECT * FROM address WHERE person_id=? ORDER BY from_year', [personId]);
}

export async function createAddress(obj) {
  const id = uuid();
  db.run('INSERT INTO address (id,person_id,label,from_year,to_year,notes) VALUES (?,?,?,?,?,?)',
    [id, obj.person_id, obj.label, obj.from_year ?? null, obj.to_year ?? null, obj.notes || null]);
  logChange('address', id, 'insert', obj);
  return id;
}

// --------------------------------------------------------- relationships --

export async function listRelationships(caseId) {
  return db.exec('SELECT * FROM relationship WHERE case_id=?', [caseId]);
}

export async function listRelationshipsForPerson(personId) {
  return db.exec('SELECT * FROM relationship WHERE a_id=? OR b_id=?', [personId, personId]);
}

export async function upsertRelationship(obj) {
  const now = nowISO();
  if (obj.id) {
    const fields = ['a_id', 'b_id', 'kind', 'start_date', 'end_date', 'confidence', 'confirmed', 'notes'].filter((f) => f in obj);
    db.run(`UPDATE relationship SET ${fields.map((f) => `${f}=?`).join(',')} WHERE id=?`, [...fields.map((f) => obj[f]), obj.id]);
    logChange('relationship', obj.id, 'update', obj);
    return obj.id;
  }
  const id = uuid();
  db.run(
    `INSERT INTO relationship (id,case_id,a_id,b_id,kind,start_date,end_date,confidence,confirmed,notes)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, obj.case_id, obj.a_id, obj.b_id, obj.kind, obj.start_date || null, obj.end_date || null,
      obj.confidence ?? 50, obj.confirmed ?? 0, obj.notes || null]
  );
  logChange('relationship', id, 'insert', obj);
  return id;
}

export async function deleteRelationship(id) {
  db.run('DELETE FROM relationship WHERE id=?', [id]);
  logChange('relationship', id, 'delete', {});
}

// --------------------------------------------------------------- events --

export async function listEventsForCase(caseId) {
  return db.exec('SELECT * FROM event WHERE case_id=? ORDER BY date', [caseId]);
}

export async function listEventsForPerson(personId) {
  return db.exec('SELECT * FROM event WHERE person_id=? ORDER BY date', [personId]);
}

export async function createEvent(obj) {
  const id = uuid();
  db.run(
    `INSERT INTO event (id,case_id,person_id,title,kind,date,date_precision,date_year_min,date_year_max,place,notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, obj.case_id, obj.person_id || null, obj.title, obj.kind || 'other', obj.date || null,
      obj.date_precision || 'day', obj.date_year_min ?? null, obj.date_year_max ?? null, obj.place || null, obj.notes || null]
  );
  logChange('event', id, 'insert', obj);
  return id;
}

export async function updateEvent(id, patch) {
  const fields = Object.keys(patch);
  if (!fields.length) return;
  db.run(`UPDATE event SET ${fields.map((f) => `${f}=?`).join(',')} WHERE id=?`, [...fields.map((f) => patch[f]), id]);
  logChange('event', id, 'update', patch);
}

export async function deleteEvent(id) {
  db.run('DELETE FROM event WHERE id=?', [id]);
  logChange('event', id, 'delete', {});
}

// -------------------------------------------------------------- sources --

export async function listSources() {
  return db.exec('SELECT * FROM source ORDER BY name');
}

export async function createSource(obj) {
  const id = uuid();
  db.run(
    'INSERT INTO source (id,name,kind,agenda_note,counts_as_evidence) VALUES (?,?,?,?,?)',
    [id, obj.name, obj.kind, obj.agenda_note || null, obj.kind === 'dramatisation' ? 0 : (obj.counts_as_evidence ?? 1)]
  );
  logChange('source', id, 'insert', obj);
  return getSource(id);
}

export async function getSource(id) {
  const rows = db.exec('SELECT * FROM source WHERE id=?', [id]);
  return rows[0] || null;
}

// ------------------------------------------------------- contradictions --

const CONTRA_SELECT = `
  SELECT c.*,
    ea.title AS a_title, ea.dated AS a_dated, ea.original_url AS a_url, ea.type AS a_type,
    eb.title AS b_title, eb.dated AS b_dated, eb.original_url AS b_url, eb.type AS b_type,
    ma.t_ms AS a_t_ms, mb.t_ms AS b_t_ms
  FROM contradiction c
  JOIN evidence ea ON ea.id = c.a_evidence_id
  JOIN evidence eb ON eb.id = c.b_evidence_id
  LEFT JOIN video_moment ma ON ma.id = c.a_moment_id
  LEFT JOIN video_moment mb ON mb.id = c.b_moment_id`;

export async function listContradictionsForPerson(personId) {
  return db.exec(`${CONTRA_SELECT} WHERE c.person_id=? AND c.deleted_at IS NULL ORDER BY c.created_at DESC`, [personId]);
}

export async function listContradictionsForCase(caseId) {
  return db.exec(`${CONTRA_SELECT} WHERE c.case_id=? AND c.deleted_at IS NULL ORDER BY c.created_at DESC`, [caseId]);
}

export async function createContradiction(obj) {
  const id = uuid();
  const now = nowISO();
  db.run(
    `INSERT INTO contradiction (id,case_id,person_id,a_evidence_id,a_moment_id,a_quote,b_evidence_id,b_moment_id,b_quote,note,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, obj.case_id, obj.person_id || null, obj.a_evidence_id, obj.a_moment_id || null, obj.a_quote || null,
      obj.b_evidence_id, obj.b_moment_id || null, obj.b_quote || null, obj.note || null, now, now]
  );
  logChange('contradiction', id, 'insert', obj);
  return id;
}

export async function softDeleteContradiction(id) {
  const now = nowISO();
  db.run('UPDATE contradiction SET deleted_at=?, updated_at=? WHERE id=?', [now, now, id]);
  logChange('contradiction', id, 'update', { deleted_at: now });
}

// ------------------------------------------------------------- evidence --

export async function listEvidence(caseId) {
  return db.exec(
    `SELECT e.*, s.name as source_name, s.kind as source_kind, s.counts_as_evidence as source_counts
     FROM evidence e LEFT JOIN source s ON s.id = e.source_id
     WHERE e.case_id=? AND e.deleted_at IS NULL ORDER BY e.created_at DESC`,
    [caseId]
  );
}

export async function getEvidence(id) {
  const rows = db.exec(
    `SELECT e.*, s.name as source_name, s.kind as source_kind, s.counts_as_evidence as source_counts
     FROM evidence e LEFT JOIN source s ON s.id = e.source_id
     WHERE e.id=? AND e.deleted_at IS NULL`,
    [id]
  );
  return rows[0] || null;
}

export async function createEvidence(obj) {
  const id = uuid();
  const now = nowISO();
  db.run(
    `INSERT INTO evidence (id,case_id,type,title,source_id,original_url,archive_url,captured_at,captured_by,
       file_path,sha256,bytes,mime,duration_ms,dated,date_precision,verification,extracted_text,notes,
       created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, obj.case_id, obj.type, obj.title, obj.source_id || null, obj.original_url || null, obj.archive_url || null,
      obj.captured_at || now, obj.captured_by || null,
      obj.file_path || null, obj.sha256 || null, obj.bytes ?? null, obj.mime || null, obj.duration_ms ?? null,
      obj.dated || null, obj.date_precision || 'day', obj.verification || 'drafted', obj.extracted_text || null, obj.notes || null,
      now, now,
    ]
  );
  logChange('evidence', id, 'insert', obj);
  return getEvidence(id);
}

export async function updateEvidence(id, patch) {
  const now = nowISO();
  const fields = Object.keys(patch);
  if (!fields.length) return getEvidence(id);
  db.run(`UPDATE evidence SET ${fields.map((f) => `${f}=?`).join(',')}, updated_at=? WHERE id=?`,
    [...fields.map((f) => patch[f]), now, id]);
  logChange('evidence', id, 'update', patch);
  return getEvidence(id);
}

export async function softDeleteEvidence(id) {
  const now = nowISO();
  db.run('UPDATE evidence SET deleted_at=?, updated_at=? WHERE id=?', [now, now, id]);
  logChange('evidence', id, 'delete', {});
}

// returns the evidence table's own column names, so callers can spread it
// straight into createEvidence (db.storeAsset speaks camelCase — that
// mismatch silently dropped file_path on every upload until 2026-09-02)
export async function storeEvidenceFile(file) {
  const r = await db.storeAsset(file);
  return { file_path: r.filePath, sha256: r.sha256, bytes: r.bytes, mime: r.mime };
}

export async function evidenceAssetUrl(filePath) {
  return db.assetUrl(filePath);
}

export async function listVideoMoments(evidenceId) {
  return db.exec('SELECT * FROM video_moment WHERE evidence_id=? ORDER BY t_ms', [evidenceId]);
}

export async function createVideoMoment(obj) {
  const id = uuid();
  db.run(
    'INSERT INTO video_moment (id,evidence_id,t_ms,label,note,quote,conflicts) VALUES (?,?,?,?,?,?,?)',
    [id, obj.evidence_id, obj.t_ms, obj.label || null, obj.note || null, obj.quote || null, obj.conflicts ? 1 : 0]
  );
  logChange('video_moment', id, 'insert', obj);
  return id;
}

export async function updateVideoMoment(id, patch) {
  const fields = Object.keys(patch);
  if (!fields.length) return;
  db.run(`UPDATE video_moment SET ${fields.map((f) => `${f}=?`).join(',')} WHERE id=?`, [...fields.map((f) => patch[f]), id]);
  logChange('video_moment', id, 'update', patch);
}

export async function listLinksForEvidence(evidenceId) {
  return db.exec('SELECT * FROM evidence_link WHERE evidence_id=?', [evidenceId]);
}

export async function listLinksForTarget(targetType, targetId) {
  return db.exec(
    `SELECT el.*, e.title as evidence_title, e.type as evidence_type, e.verification as evidence_verification
     FROM evidence_link el JOIN evidence e ON e.id = el.evidence_id
     WHERE el.target_type=? AND el.target_id=? AND e.deleted_at IS NULL`,
    [targetType, targetId]
  );
}

export async function linkEvidence(obj) {
  const id = uuid();
  db.run(
    'INSERT INTO evidence_link (id,evidence_id,moment_id,target_type,target_id,note) VALUES (?,?,?,?,?,?)',
    [id, obj.evidence_id, obj.moment_id || null, obj.target_type, obj.target_id, obj.note || null]
  );
  logChange('evidence_link', id, 'insert', obj);
  return id;
}

// ------------------------------------------------------------------ tags --

export async function listTags() {
  return db.exec('SELECT * FROM tag ORDER BY name');
}

export async function createTag(name, colour) {
  const id = uuid();
  db.run('INSERT INTO tag (id,name,colour) VALUES (?,?,?)', [id, name, colour || null]);
  logChange('tag', id, 'insert', { name, colour });
  return id;
}

export async function tagTarget(tagId, targetType, targetId) {
  db.run('INSERT OR IGNORE INTO tagging (tag_id,target_type,target_id) VALUES (?,?,?)', [tagId, targetType, targetId]);
  logChange('tagging', `${tagId}:${targetType}:${targetId}`, 'insert', { tagId, targetType, targetId });
}

export async function untagTarget(tagId, targetType, targetId) {
  db.run('DELETE FROM tagging WHERE tag_id=? AND target_type=? AND target_id=?', [tagId, targetType, targetId]);
  logChange('tagging', `${tagId}:${targetType}:${targetId}`, 'delete', {});
}

// ---- the image inbox rides the tag system: 'inbox' marks unsorted
// evidence, 'purpose:<kind>' records why an image was kept ----

export const INBOX_TAG = 'inbox';
export const PURPOSES = [
  { key: 'identifies-person', label: 'identifies a person' },
  { key: 'date-place', label: 'establishes a date or place' },
  { key: 'behaviour', label: 'shows behaviour' },
  { key: 'contradiction', label: 'shows a contradiction' },
  { key: 'context', label: 'context / background' },
];

export async function ensureTag(name) {
  const existing = (await listTags()).find((t) => t.name.toLowerCase() === name.toLowerCase());
  return existing ? existing.id : createTag(name);
}

export async function tagEvidence(evidenceId, name) {
  const id = await ensureTag(name);
  await tagTarget(id, 'evidence', evidenceId);
}

export async function untagEvidence(evidenceId, name) {
  const t = (await listTags()).find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (t) await untagTarget(t.id, 'evidence', evidenceId);
}

export async function evidenceTagNames(evidenceId) {
  return (await listTagsForTarget('evidence', evidenceId)).map((t) => t.name);
}

export async function listInboxEvidence(caseId) {
  return db.exec(
    `SELECT e.* FROM evidence e
     JOIN tagging tg ON tg.target_type='evidence' AND tg.target_id=e.id
     JOIN tag t ON t.id=tg.tag_id
     WHERE t.name=? AND e.case_id=? AND e.deleted_at IS NULL
     ORDER BY e.created_at DESC`,
    [INBOX_TAG, caseId]
  );
}

export async function countInbox(caseId) {
  const r = db.exec(
    `SELECT COUNT(*) AS n FROM evidence e
     JOIN tagging tg ON tg.target_type='evidence' AND tg.target_id=e.id
     JOIN tag t ON t.id=tg.tag_id
     WHERE t.name=? AND e.case_id=? AND e.deleted_at IS NULL`,
    [INBOX_TAG, caseId]
  );
  return r.length ? r[0].n : 0;
}

export async function listTagsForTarget(targetType, targetId) {
  return db.exec(
    `SELECT t.* FROM tagging tg JOIN tag t ON t.id = tg.tag_id WHERE tg.target_type=? AND tg.target_id=?`,
    [targetType, targetId]
  );
}

// ---------------------------------------------------------------- claims --
// The review queue. Everything drafted or imported lives here, at zero
// confidence, until a person decides. Accepting a claim is the ONLY way a
// drafted fact is allowed to touch person/relationship/event rows.

export async function listClaims(caseId, state) {
  if (state) return db.exec('SELECT * FROM claim WHERE case_id=? AND state=? ORDER BY created_at', [caseId, state]);
  return db.exec('SELECT * FROM claim WHERE case_id=? ORDER BY created_at', [caseId]);
}

export async function getClaim(id) {
  const rows = db.exec('SELECT * FROM claim WHERE id=?', [id]);
  return rows[0] || null;
}

export async function createClaim(obj) {
  const id = uuid();
  const now = nowISO();
  db.run(
    `INSERT INTO claim (id,case_id,target_type,target_id,field,value,origin,state,rationale,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, obj.case_id, obj.target_type, obj.target_id || null, obj.field, JSON.stringify(obj.value),
      obj.origin, 'drafted', obj.rationale || null, now]
  );
  logChange('claim', id, 'insert', obj);
  return id;
}

const PERSON_FIELDS = new Set([
  'display_name', 'name_at_birth', 'birth_date', 'birth_precision', 'birth_year_min', 'birth_year_max',
  'birth_time', 'birth_time_precision', 'birth_place', 'death_date', 'death_precision', 'occupation', 'notes',
  'gender', 'nationality', 'marital_status',
]);

export function relationshipExists(caseId, aId, bId, kind) {
  return db.exec(
    'SELECT 1 FROM relationship WHERE case_id=? AND kind=? AND ((a_id=? AND b_id=?) OR (a_id=? AND b_id=?)) LIMIT 1',
    [caseId, kind, aId, bId, bId, aId]
  ).length > 0;
}

/** A fact applied directly (Insert family) still leaves its claim — already accepted — as the audit trail. */
export async function createAcceptedClaim(obj) {
  const id = await createClaim(obj);
  const now = nowISO();
  db.run("UPDATE claim SET state='accepted', decided_at=? WHERE id=?", [now, id]);
  logChange('claim', id, 'update', { state: 'accepted', decided_at: now });
  return id;
}

export async function deleteClaim(id) {
  db.run('DELETE FROM claim WHERE id=?', [id]);
  logChange('claim', id, 'delete', {}); // a tombstone, so other devices drop it too
}

// ------------------------------------------------------------ duplicates --
// Her ask (2026-09-03): a way to clear copies. Exact copies only — a drafted
// claim identical in target, field and value; an evidence item whose link is
// the same as another's. Same-name people are counted, never removed.

export async function findDuplicates(caseId) {
  const claims = db.exec("SELECT id, target_type, target_id, field, value FROM claim WHERE case_id=? AND state='drafted' ORDER BY created_at", [caseId]);
  const seen = new Set();
  const dupClaims = [];
  for (const c of claims) {
    const key = [c.target_type, c.target_id, c.field, c.value].join('');
    if (seen.has(key)) dupClaims.push(c.id); else seen.add(key);
  }
  const evidence = db.exec("SELECT id, original_url FROM evidence WHERE case_id=? AND deleted_at IS NULL AND original_url IS NOT NULL AND trim(original_url) != '' ORDER BY created_at", [caseId]);
  const byUrl = new Map();
  for (const e of evidence) {
    const key = e.original_url.trim().toLowerCase();
    if (!byUrl.has(key)) byUrl.set(key, { keep: e.id, remove: [] }); else byUrl.get(key).remove.push(e.id);
  }
  const dupEvidence = [...byUrl.values()].filter((g) => g.remove.length);
  const people = db.exec(
    'SELECT MIN(display_name) AS name, COUNT(*) AS n FROM person WHERE case_id=? AND deleted_at IS NULL GROUP BY lower(trim(display_name)) HAVING n > 1', [caseId]
  ).map((r) => ({ name: r.name, count: r.n }));
  const evidenceCount = dupEvidence.reduce((n, g) => n + g.remove.length, 0);
  return { claims: dupClaims, evidence: dupEvidence, evidenceCount, people, total: dupClaims.length + evidenceCount };
}

/** Remove the copies findDuplicates reports; the oldest of each set stays. */
export async function removeDuplicates(caseId) {
  const d = await findDuplicates(caseId);
  for (const id of d.claims) await deleteClaim(id);
  for (const g of d.evidence) {
    for (const dupId of g.remove) {
      // whatever hung off the copy moves to the kept item
      for (const l of db.exec('SELECT * FROM evidence_link WHERE evidence_id=?', [dupId])) {
        const has = db.exec('SELECT 1 FROM evidence_link WHERE evidence_id=? AND target_type=? AND target_id=?', [g.keep, l.target_type, l.target_id]).length;
        if (has) { db.run('DELETE FROM evidence_link WHERE id=?', [l.id]); logChange('evidence_link', l.id, 'delete', {}); }
        else { db.run('UPDATE evidence_link SET evidence_id=? WHERE id=?', [g.keep, l.id]); logChange('evidence_link', l.id, 'update', { evidence_id: g.keep }); }
      }
      for (const m of db.exec('SELECT id FROM video_moment WHERE evidence_id=?', [dupId])) {
        db.run('UPDATE video_moment SET evidence_id=? WHERE id=?', [g.keep, m.id]);
        logChange('video_moment', m.id, 'update', { evidence_id: g.keep });
      }
      await softDeleteEvidence(dupId);
    }
  }
  return d;
}

/**
 * Apply an accepted claim's value to the actual data. This is the single
 * chokepoint where a drafted fact is allowed to become real.
 */
async function applyClaim(claim) {
  const value = JSON.parse(claim.value);
  if (PERSON_FIELDS.has(claim.field) && claim.target_type === 'person' && claim.target_id) {
    const patch = { [claim.field]: value };
    // a full date being accepted implies day-level precision, kept in sync
    // so the calculation modules (which read birth_date, not this column)
    // and the honesty rules (which read birth_precision) never disagree.
    if (claim.field === 'birth_date') patch.birth_precision = 'day';
    if (claim.field === 'death_date') patch.death_precision = 'day';
    await updatePerson(claim.target_id, patch);
    return;
  }
  if (claim.field === 'birth') {
    const patch = { birth_precision: value.precision };
    if (value.precision === 'day') patch.birth_date = value.date;
    else if (value.precision === 'year') { patch.birth_year_min = value.year; patch.birth_year_max = value.year; }
    await updatePerson(claim.target_id, patch);
    return;
  }
  if (claim.field === 'death') {
    // the person table only has a single death_date column (no year_min/max
    // range, unlike birth) — a year-only death can't honestly be stored here,
    // so only day-precision claims land on the person; year-only stays on
    // the event record, which does support year precision.
    if (value.precision === 'day') await updatePerson(claim.target_id, { death_date: value.date, death_precision: 'day' });
    return;
  }
  if (claim.field === 'relationship') {
    await upsertRelationship({ ...value, case_id: claim.case_id, confidence: value.confidence ?? 50, confirmed: 0 });
    return;
  }
  if (claim.field === 'event') {
    await createEvent({ ...value, case_id: claim.case_id });
    return;
  }
  if (claim.field === 'alias') {
    await createAlias({ ...value, person_id: claim.target_id });
    return;
  }
  if (claim.field === 'address') {
    await createAddress({ ...value, person_id: claim.target_id });
    return;
  }
  if (claim.field === 'person') {
    const { spouse_of, ...fields } = value;
    const created = await createPerson({ ...fields, case_id: claim.case_id });
    // a looked-up spouse also becomes a spouse relationship, unconfirmed,
    // so the person's marital status reads from the map straight away
    if (spouse_of && created && created.id && !relationshipExists(claim.case_id, spouse_of, created.id, 'spouse')) {
      await upsertRelationship({ case_id: claim.case_id, a_id: spouse_of, b_id: created.id, kind: 'spouse', confidence: 50, confirmed: 0, notes: claim.rationale || null });
    }
    return;
  }
  if (claim.field === 'relative') {
    // a looked-up relative: the person with that name if the case already
    // has them, otherwise a new person carrying the dates; then the
    // relationship, unconfirmed and cited (her picks, 2026-09-03)
    const name = String(value.display_name || '').trim();
    if (!name || !value.of) return;
    let person = db.exec('SELECT * FROM person WHERE case_id=? AND deleted_at IS NULL AND lower(trim(display_name))=lower(?) LIMIT 1', [claim.case_id, name])[0] || null;
    if (!person) {
      const b = value.birth || null, d = value.death || null;
      person = await createPerson({
        case_id: claim.case_id, kind: 'person', display_name: name,
        birth_date: b && (b.precision === 'day' || b.precision === 'month') ? b.date : null,
        birth_precision: b ? b.precision : 'unknown',
        birth_year_min: b && b.precision === 'year' ? b.year : null, birth_year_max: b && b.precision === 'year' ? b.year : null,
        death_date: d && d.precision === 'day' ? d.date : null, death_precision: d && d.precision === 'day' ? 'day' : 'unknown',
        notes: value.qid ? `Wikidata https://www.wikidata.org/wiki/${value.qid}` : null,
      });
    }
    const subject = value.of, other = person.id;
    const DIRECTED = { // [kind, a_id, b_id] — for parent/godparent, A is the parent/godparent of B
      father: ['parent', other, subject], mother: ['parent', other, subject], child: ['parent', subject, other],
      sibling: ['sibling', subject, other], spouse: ['spouse', subject, other],
      godparent: ['godparent', other, subject], godchild: ['godparent', subject, other],
    };
    const [kind, a, b] = DIRECTED[value.role] || ['associate', subject, other];
    if (!relationshipExists(claim.case_id, a, b, kind)) {
      await upsertRelationship({ case_id: claim.case_id, a_id: a, b_id: b, kind, confidence: 70, confirmed: 0, notes: claim.rationale || null });
    }
    return;
  }
  throw new Error(`don't know how to apply claim field "${claim.field}"`);
}

export async function decideClaim(id, decision, rationale) {
  const claim = await getClaim(id);
  if (!claim) throw new Error('claim not found');
  const now = nowISO();

  if (decision === 'accepted') {
    await applyClaim(claim);
  }
  if (decision === 'question') {
    await createQuestion({
      case_id: claim.case_id,
      text: rationale || `Unclear: ${claim.field} (${claim.target_type || 'new'}) from a ${claim.origin} claim.`,
    });
  }

  db.run('UPDATE claim SET state=?, rationale=?, decided_at=? WHERE id=?', [decision, rationale || claim.rationale, now, id]);
  logChange('claim', id, 'update', { state: decision, rationale });
  return getClaim(id);
}

// ------------------------------------------------------------- questions --

export async function listQuestions(caseId) {
  return db.exec('SELECT * FROM question WHERE case_id=? ORDER BY resolved, text', [caseId]);
}

export async function createQuestion(obj) {
  const id = uuid();
  db.run('INSERT INTO question (id,case_id,text,resolved,notes) VALUES (?,?,?,?,?)',
    [id, obj.case_id, obj.text, obj.resolved ? 1 : 0, obj.notes || null]);
  logChange('question', id, 'insert', obj);
  return id;
}

export async function resolveQuestion(id, resolved = true) {
  db.run('UPDATE question SET resolved=? WHERE id=?', [resolved ? 1 : 0, id]);
  logChange('question', id, 'update', { resolved });
}

// -------------------------------------------------------------- findings --

export async function listFindings(caseId) {
  return db.exec('SELECT * FROM finding WHERE case_id=? ORDER BY created_at DESC', [caseId]);
}

export async function createFinding(obj) {
  const id = uuid();
  db.run(
    'INSERT INTO finding (id,case_id,summary,kind,observed,expected,kept,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, obj.case_id, obj.summary, obj.kind || null, obj.observed ?? null, obj.expected ?? null, obj.kept ? 1 : 0, obj.notes || null, nowISO()]
  );
  logChange('finding', id, 'insert', obj);
  return id;
}

export async function keepFinding(id, kept = true) {
  db.run('UPDATE finding SET kept=? WHERE id=?', [kept ? 1 : 0, id]);
  logChange('finding', id, 'update', { kept });
}

// ---------------------------------------------------------- change log ---

export async function recentChanges(limit = 20) {
  return db.exec('SELECT * FROM change_log ORDER BY at DESC LIMIT ?', [limit]);
}

export async function recentChangesForCase(caseId, limit = 20) {
  // change_log has no case_id column by design (it's entity-agnostic);
  // filter by joining against known case-scoped entities we can resolve cheaply.
  const rows = db.exec('SELECT * FROM change_log ORDER BY at DESC LIMIT ?', [limit * 4]);
  return rows.slice(0, limit);
}

// --------------------------------------------------------------- search --

// ------------------------------------------------------------------ seed --
// Runs exactly once, the moment a brand-new database is created, so the
// app shows something real on first open. Entirely fictional people —
// safe to delete from the Dashboard once you're ready to start your own case.

export async function seedExampleCase() {
  const kase = await createCase({
    name: 'Example: The Harrow Household',
    kind: 'research',
    description: 'A seeded example case demonstrating every feature — fictional people, safe to delete.',
    era_start: 1885,
    era_end: 2026,
  });

  const mara = await createPerson({
    case_id: kase.id, display_name: 'Mara Harrow', name_at_birth: 'Mara Voss',
    birth_date: '1981-11-13', birth_precision: 'day', birth_place: 'Ashfield',
    occupation: 'Glassblower', status: 'active', ref_code: 'REF-0001',
  });
  const tobias = await createPerson({
    case_id: kase.id, display_name: 'Tobias Harrow', birth_date: '1978-06-21', birth_precision: 'day',
    birth_place: 'Millbrook', occupation: 'Archivist', status: 'active', ref_code: 'REF-0002',
  });
  const wren = await createPerson({
    case_id: kase.id, display_name: 'Wren Harrow', birth_date: '2009-02-10', birth_precision: 'day',
    birth_place: 'Ashfield', occupation: null, status: 'active', ref_code: 'REF-0003',
  });
  const voss = await createPerson({
    case_id: kase.id, display_name: 'R. Voss', birth_precision: 'range',
    birth_year_min: 1889, birth_year_max: 1891, occupation: 'Merchant', status: 'watch',
    notes: 'Birth year contested between two civil records.', ref_code: 'REF-0004',
  });

  await createAlias({ person_id: voss.id, alias: 'R.V.', kind: 'handle' });
  await createAlias({ person_id: voss.id, alias: 'Rudolph Voss', kind: 'other' });

  await createAddress({ person_id: mara.id, label: 'Childhood home, Bellmoor Lane', from_year: 1981, to_year: 1999 });
  await createAddress({ person_id: mara.id, label: 'Ashfield Road', from_year: 1999, to_year: null });

  await upsertRelationship({ case_id: kase.id, a_id: mara.id, b_id: wren.id, kind: 'parent', confidence: 90, confirmed: 1 });
  await upsertRelationship({ case_id: kase.id, a_id: tobias.id, b_id: wren.id, kind: 'parent', confidence: 90, confirmed: 1 });
  await upsertRelationship({ case_id: kase.id, a_id: mara.id, b_id: tobias.id, kind: 'spouse', start_date: '2005-06-02', confidence: 85, confirmed: 1 });
  await upsertRelationship({ case_id: kase.id, a_id: mara.id, b_id: voss.id, kind: 'associate', confidence: 30, confirmed: 0, notes: 'Possible great-aunt; birth year unsettled.' });

  await createEvent({ case_id: kase.id, person_id: mara.id, title: 'Born, Ashfield', kind: 'birth', date: '1981-11-13', date_precision: 'day' });
  await createEvent({ case_id: kase.id, person_id: tobias.id, title: 'Born, Millbrook', kind: 'birth', date: '1978-06-21', date_precision: 'day' });
  await createEvent({ case_id: kase.id, person_id: wren.id, title: 'Born, Ashfield', kind: 'birth', date: '2009-02-10', date_precision: 'day' });
  await createEvent({ case_id: kase.id, person_id: mara.id, title: 'Married Tobias Harrow', kind: 'marriage', date: '2005-06-02', date_precision: 'day' });
  await createEvent({ case_id: kase.id, person_id: tobias.id, title: 'Married Mara Voss', kind: 'marriage', date: '2005-06-02', date_precision: 'day' });
  await createEvent({ case_id: kase.id, person_id: mara.id, title: 'Moved to Ashfield Road', kind: 'move', date: '1999-03-01', date_precision: 'day' });
  await createEvent({
    case_id: kase.id, person_id: voss.id, title: 'Opened a general store', kind: 'business',
    date: null, date_precision: 'year', date_year_min: 1912, date_year_max: 1912,
  });
  await createEvent({
    case_id: kase.id, person_id: voss.id, title: 'Unconfirmed rumor — second business venture', kind: 'business',
    date: null, date_precision: 'unknown', notes: 'No year known yet; sits in the undated tray until dated.',
  });

  const srcState = await createSource({ name: 'Public Records Office', kind: 'state' });
  const srcOwn = await createSource({ name: 'Family scrapbook', kind: 'own' });
  const srcSecondary = await createSource({ name: 'Local Gazette archive', kind: 'secondary' });
  const srcDram = await createSource({ name: 'Dramatised podcast retelling', kind: 'dramatisation' });

  const evBirth = await createEvidence({
    case_id: kase.id, type: 'document', title: 'Birth registration — Mara Harrow', source_id: srcState.id,
    captured_at: '2024-02-01', captured_by: 'you', dated: '1981-11-13', date_precision: 'day', verification: 'two_plus',
  });
  await linkEvidence({ evidence_id: evBirth.id, target_type: 'person', target_id: mara.id, note: 'Primary birth record' });

  const evMarriage = await createEvidence({
    case_id: kase.id, type: 'document', title: 'Marriage record — Harrow / Voss', source_id: srcState.id,
    captured_at: '2024-02-01', dated: '2005-06-02', date_precision: 'day', verification: 'single',
  });
  await linkEvidence({ evidence_id: evMarriage.id, target_type: 'person', target_id: mara.id });
  await linkEvidence({ evidence_id: evMarriage.id, target_type: 'person', target_id: tobias.id });

  const evGazette = await createEvidence({
    case_id: kase.id, type: 'clipping', title: 'Gazette clipping — Voss dispute', source_id: srcSecondary.id,
    captured_at: '2024-03-15', dated: '1962-03', date_precision: 'month', verification: 'disputed',
    notes: 'Conflicts with the civil register on the birth year.',
  });
  await linkEvidence({ evidence_id: evGazette.id, target_type: 'person', target_id: voss.id });

  const evVideo = await createEvidence({
    case_id: kase.id, type: 'video', title: 'Interview — family history recording', source_id: srcOwn.id,
    captured_at: '2023-11-20', verification: 'single', duration_ms: 754000,
  });
  await linkEvidence({ evidence_id: evVideo.id, target_type: 'person', target_id: mara.id });
  await createVideoMoment({ evidence_id: evVideo.id, t_ms: 42000, label: 'Mentions Voss by name', quote: '"...that would have been great-uncle Rudolph, I think."' });
  await createVideoMoment({ evidence_id: evVideo.id, t_ms: 301000, label: 'Conflicts with Gazette date', conflicts: 1, note: 'Says 1963, Gazette clipping says 1962.' });

  await createEvidence({
    case_id: kase.id, type: 'screenshot', title: 'Possible obituary — R. Voss', source_id: srcSecondary.id,
    captured_at: nowISO(), verification: 'drafted', notes: 'Found via search, not yet reviewed.',
  });
  await createEvidence({
    case_id: kase.id, type: 'video', title: 'Podcast dramatisation — Voss backstory', source_id: srcDram.id,
    captured_at: nowISO(), verification: 'drafted', notes: 'Dramatisation — can be tagged, cannot raise confidence.',
  });

  await createClaim({
    case_id: kase.id, target_type: 'person', target_id: voss.id, field: 'birth_date',
    value: '1890-03-04', origin: 'import',
    rationale: 'Found in a digitised parish register; unconfirmed against the two known candidates.',
  });
  await createClaim({
    case_id: kase.id, target_type: 'person', target_id: voss.id, field: 'event',
    value: { person_id: voss.id, title: 'Declared bankrupt', kind: 'business', date: '1930-05-01', date_precision: 'day', place: 'Millbrook' },
    origin: 'paste', rationale: 'Pasted from an unverified local-history blog post.',
  });

  await createQuestion({ case_id: kase.id, text: 'Which birth-year record for R. Voss is correct — the 1889 civil register or the 1891 church register?' });

  const { relation } = await import('./relations.js');
  const { signFor } = await import('./chinese.js');
  const { expectedCounts } = await import('./stats.js');
  const mSign = signFor(mara.birth_date), wSign = signFor(wren.birth_date);
  if (mSign.ok && !mSign.boundary && wSign.ok && !wSign.boundary) {
    const kind = relation(mSign.animalIndex, wSign.animalIndex);
    const exp = expectedCounts(1);
    await createFinding({
      case_id: kase.id, kind,
      summary: `Mara and Wren (mother/child) show a ${kind} relation — ${mSign.animal} and ${wSign.animal}.`,
      observed: 1, expected: exp[kind] ?? null,
    });
  }

  return kase;
}

export async function searchCase(caseId, query) {
  const q = `%${query.toLowerCase()}%`;
  const people = db.exec(
    `SELECT id, display_name as label, 'person' as type FROM person
     WHERE case_id=? AND deleted_at IS NULL AND lower(display_name) LIKE ? LIMIT 20`,
    [caseId, q]
  );
  const evidence = db.exec(
    `SELECT id, title as label, 'evidence' as type FROM evidence
     WHERE case_id=? AND deleted_at IS NULL AND lower(title) LIKE ? LIMIT 20`,
    [caseId, q]
  );
  return [...people, ...evidence];
}
