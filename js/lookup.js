// Wikipedia / Wikidata lookup — the app's first third-party read (her rule
// change, 2026-09-02: read-only public lookups, user-triggered, nothing sent
// but the name). Facts never touch a profile directly: each becomes a
// drafted claim in Review citing its Wikidata property, and one Wikipedia
// evidence item is linked to the person so the citation exists regardless.

const WD = 'https://www.wikidata.org/w/api.php';
const WP_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

const P = { birth: 'P569', death: 'P570', birthPlace: 'P19', citizenship: 'P27', gender: 'P21', spouse: 'P26', occupation: 'P106' };
// relatives (her ask, 2026-09-03): each arrives as one claim — accept it and
// the person AND the relationship exist. Godchildren are recorded on the
// child's side in Wikidata, so they need the reverse query below.
const REL = { father: 'P22', mother: 'P25', sibling: 'P3373', child: 'P40', godparent: 'P1290', spouse: 'P26' };
const SPARQL = 'https://query.wikidata.org/sparql';

// Wikidata gives country names; a nationality field reads better as a demonym
const DEMONYM = {
  'United States of America': 'American', 'United States': 'American', 'United Kingdom': 'British', 'England': 'English', 'Scotland': 'Scottish', 'Wales': 'Welsh', 'Australia': 'Australian', 'Mexico': 'Mexican',
  'France': 'French', 'Germany': 'German', 'Italy': 'Italian', 'Spain': 'Spanish', 'Canada': 'Canadian', 'Russia': 'Russian',
  'China': 'Chinese', 'Japan': 'Japanese', 'India': 'Indian', 'Brazil': 'Brazilian', 'Ireland': 'Irish', 'New Zealand': 'New Zealander',
  'Netherlands': 'Dutch', 'Sweden': 'Swedish', 'Norway': 'Norwegian', 'Denmark': 'Danish', 'Poland': 'Polish', 'Greece': 'Greek',
  'Portugal': 'Portuguese', 'Argentina': 'Argentine', 'South Korea': 'Korean', 'Vietnam': 'Vietnamese', 'Philippines': 'Filipino',
  'Turkey': 'Turkish', 'Israel': 'Israeli', 'Egypt': 'Egyptian', 'South Africa': 'South African', 'Kingdom of England': 'English',
  'Kingdom of Great Britain': 'British', 'Kingdom of France': 'French', 'Russian Empire': 'Russian', 'Soviet Union': 'Soviet',
};

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  return res.json();
}

/** Name → short list of candidate people to choose from. */
export async function searchPeople(name) {
  const q = String(name || '').trim();
  if (!q) return [];
  const data = await getJSON(`${WD}?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&type=item&limit=6&format=json&origin=*`);
  return (data.search || []).map((s) => ({ id: s.id, label: s.label, description: s.description || '' }));
}

// "+1966-09-02T00:00:00Z" + precision 11/10/9 → honest {date, precision, year}
function parseWdTime(v) {
  if (!v || !v.time) return null;
  const m = v.time.match(/^([+-])(\d{4,})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = parseInt(m[2], 10) * (m[1] === '-' ? -1 : 1);
  if (v.precision >= 11 && m[3] !== '00' && m[4] !== '00') return { date: `${m[2]}-${m[3]}-${m[4]}`, precision: 'day', year };
  if (v.precision === 10 && m[3] !== '00') return { date: `${m[2]}-${m[3]}-01`, precision: 'month', year };
  return { date: null, precision: 'year', year };
}

function values(claims, prop) {
  return (claims[prop] || [])
    .filter((c) => c.rank !== 'deprecated' && c.mainsnak && c.mainsnak.datavalue)
    .map((c) => c.mainsnak.datavalue.value);
}

/** One Wikidata item → the facts we know how to draft, labels resolved. */
export async function fetchProfile(qid) {
  const data = await getJSON(`${WD}?action=wbgetentities&ids=${qid}&props=claims|sitelinks|labels|descriptions&languages=en&format=json&origin=*`);
  const ent = data.entities && data.entities[qid];
  if (!ent || ent.missing !== undefined) throw new Error('That record could not be read.');
  const claims = ent.claims || {};
  const ids = new Set();
  const idOf = (v) => v && v.id;
  const birthPlaceId = idOf(values(claims, P.birthPlace)[0]);
  const genderId = idOf(values(claims, P.gender)[0]);
  const citizenIds = values(claims, P.citizenship).map(idOf).filter(Boolean);
  const spouseIds = values(claims, P.spouse).map(idOf).filter(Boolean);
  const occupationIds = values(claims, P.occupation).map(idOf).filter(Boolean).slice(0, 4);
  [birthPlaceId, genderId, ...citizenIds, ...spouseIds, ...occupationIds].filter(Boolean).forEach((id) => ids.add(id));

  // relatives by role, straight off the item
  const relRefs = [];
  for (const [role, prop] of Object.entries(REL)) {
    for (const v of values(claims, prop)) { const id = idOf(v); if (id && !relRefs.some((r) => r.qid === id && r.role === role)) relRefs.push({ qid: id, role }); }
  }
  // godchildren: the child's item names the godparent, so ask the other way round
  try {
    const sq = await getJSON(`${SPARQL}?format=json&query=${encodeURIComponent(`SELECT ?c WHERE { ?c wdt:P1290 wd:${qid} } LIMIT 50`)}`);
    for (const b of (sq.results && sq.results.bindings) || []) {
      const m = /Q\d+$/.exec(b.c && b.c.value || '');
      if (m && !relRefs.some((r) => r.qid === m[0] && r.role === 'godchild')) relRefs.push({ qid: m[0], role: 'godchild' });
    }
  } catch (_) { /* the query service is optional; everything else still works */ }
  relRefs.forEach((r) => ids.add(r.qid));

  const labels = {};
  const relClaims = {};
  const idList = [...ids];
  for (let i = 0; i < idList.length; i += 50) {
    const chunk = idList.slice(i, i + 50);
    const ld = await getJSON(`${WD}?action=wbgetentities&ids=${chunk.join('|')}&props=labels|claims&languages=en&format=json&origin=*`);
    for (const [id, e] of Object.entries(ld.entities || {})) {
      labels[id] = e.labels && e.labels.en ? e.labels.en.value : id;
      relClaims[id] = e.claims || {};
    }
  }
  const L = (id) => (id ? labels[id] || id : null);

  const wikiTitle = ent.sitelinks && ent.sitelinks.enwiki ? ent.sitelinks.enwiki.title : null;
  let summary = null, wikiUrl = null, photoUrl = null;
  if (wikiTitle) {
    try {
      const s = await getJSON(WP_SUMMARY + encodeURIComponent(wikiTitle));
      summary = s.extract || null;
      wikiUrl = (s.content_urls && s.content_urls.desktop && s.content_urls.desktop.page) || `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`;
      // the article's lead image, at a sensible size (Wikimedia serves it with CORS)
      const src = (s.originalimage && s.originalimage.source) || (s.thumbnail && s.thumbnail.source) || null;
      photoUrl = src ? src.replace(/\/(\d+)px-/, '/640px-') : null;
    } catch (_) { wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`; }
  }

  return {
    qid,
    label: ent.labels && ent.labels.en ? ent.labels.en.value : qid,
    description: ent.descriptions && ent.descriptions.en ? ent.descriptions.en.value : '',
    wikidataUrl: `https://www.wikidata.org/wiki/${qid}`,
    wikiUrl, summary, photoUrl,
    birth: parseWdTime(values(claims, P.birth)[0]),
    death: parseWdTime(values(claims, P.death)[0]),
    birthPlace: L(birthPlaceId),
    gender: L(genderId),
    nationality: citizenIds.map((id) => DEMONYM[L(id)] || L(id)).filter((v, i, a) => a.indexOf(v) === i),
    spouses: spouseIds.map((id) => ({ qid: id, name: L(id) })),
    relatives: relRefs.map((r) => ({
      qid: r.qid, role: r.role, name: L(r.qid),
      birth: parseWdTime(values(relClaims[r.qid] || {}, P.birth)[0]),
      death: parseWdTime(values(relClaims[r.qid] || {}, P.death)[0]),
    })),
    occupations: occupationIds.map(L),
  };
}

/** Download a remote picture into the asset store and set it as the person's photo. */
export async function savePhotoFromUrl(store, personId, url) {
  if (!url) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const { compressImage, queueUpload, flushUploads } = await import('./assets.js');
    const file = await compressImage(new File([blob], 'wikipedia.jpg', { type: blob.type || 'image/jpeg' }));
    const meta = await store.storeEvidenceFile(file);
    await store.updatePerson(personId, { photo_path: meta.file_path, photo_url: url });
    queueUpload(meta.file_path, meta.mime);
    flushUploads();
    return true;
  } catch (_) {
    await store.updatePerson(personId, { photo_url: url }); // remote fallback, rendered live
    return false;
  }
}

/** One "Wikipedia: <name>" evidence item per article per case, linked to the person. */
async function ensureWikipediaEvidence(store, caseId, personId, facts) {
  const sources = await store.listSources();
  let src = sources.find((s) => s.name === 'Wikipedia');
  if (!src) src = await store.createSource({ name: 'Wikipedia', kind: 'secondary', agenda_note: 'Crowd-edited encyclopaedia; check the article\'s own citations for anything contested.' });
  const url = facts.wikiUrl || facts.wikidataUrl;
  let ev = (await store.listEvidence(caseId)).find((e) => !e.deleted_at && e.original_url === url && /^Wikipedia:/.test(e.title || ''));
  if (!ev) {
    ev = await store.createEvidence({
      case_id: caseId, type: 'document', title: `Wikipedia: ${facts.label}`, source_id: src.id,
      original_url: url, verification: 'single',
      notes: [facts.description, facts.summary].filter(Boolean).join('\n\n') || null,
      dated: new Date().toISOString().slice(0, 10),
    });
  }
  const links = await store.listLinksForTarget('person', personId);
  if (!links.some((l) => l.evidence_id === ev.id)) {
    await store.linkEvidence({ evidence_id: ev.id, target_type: 'person', target_id: personId, note: 'from lookup' });
  }
  return ev;
}

const ROLE_PROP_ALL = { father: 'P22', mother: 'P25', sibling: 'P3373', child: 'P40', spouse: 'P26', godparent: 'P1290', godchild: 'P1290, reverse' };
// [kind, a, b] for a relative of `subject` — for parent/godparent, A is the parent/godparent of B
function directedRelationship(role, subject, other) {
  return ({
    father: ['parent', other, subject], mother: ['parent', other, subject], child: ['parent', subject, other],
    sibling: ['sibling', subject, other], spouse: ['spouse', subject, other],
    godparent: ['godparent', other, subject], godchild: ['godparent', subject, other],
  })[role] || ['associate', subject, other];
}

/**
 * "Insert family" (her ask, 2026-09-03 — straight in, no Review): every
 * direct relative on the Wikidata item becomes a person in the case (or is
 * matched to the person already there by name), gets the relationship,
 * and — for anyone new or still bare — their own profile: dates,
 * birthplace, nationality, gender, occupation, picture, and their
 * Wikipedia article linked as evidence. Every applied fact is recorded as
 * an accepted claim citing its Wikidata property, so the audit trail is
 * the same as if she had accepted each one in Review.
 */
export async function insertFamily(store, caseId, personId, qid, onProgress = () => {}) {
  onProgress('Reading the family…');
  const facts = await fetchProfile(qid);
  const relatives = (facts.relatives || []).filter((r) => r.name && !/^Q\d+$/.test(r.name));
  const people = await store.listPeople(caseId);
  const byName = (n) => people.find((p) => p.display_name.trim().toLowerCase() === n.trim().toLowerCase());
  const result = { created: [], linked: [], relationships: 0, pictures: 0, failed: [], total: relatives.length };
  const dateFields = (b, d) => ({
    birth_date: b && (b.precision === 'day' || b.precision === 'month') ? b.date : null,
    birth_precision: b ? b.precision : 'unknown',
    birth_year_min: b && b.precision === 'year' ? b.year : null, birth_year_max: b && b.precision === 'year' ? b.year : null,
    death_date: d && d.precision === 'day' ? d.date : null, death_precision: d && d.precision === 'day' ? 'day' : 'unknown',
  });
  let i = 0;
  for (const rel of relatives) {
    i += 1;
    onProgress(`${i} of ${relatives.length} — ${rel.name}`);
    let person = byName(rel.name);
    const existed = !!person;
    if (!person) {
      person = await store.createPerson({ case_id: caseId, kind: 'person', display_name: rel.name, ...dateFields(rel.birth, rel.death), notes: `Wikidata https://www.wikidata.org/wiki/${rel.qid}` });
      people.push(person);
      result.created.push(rel.name);
    } else {
      result.linked.push(rel.name);
    }
    const cite = (prop) => `Source: Wikidata ${facts.wikidataUrl} (${prop})${facts.wikiUrl ? ` · Wikipedia ${facts.wikiUrl}` : ''}`;
    const [kind, a, b] = directedRelationship(rel.role, personId, person.id);
    if (!store.relationshipExists(caseId, a, b, kind)) {
      await store.upsertRelationship({ case_id: caseId, a_id: a, b_id: b, kind, confidence: 70, confirmed: 0, notes: cite(ROLE_PROP_ALL[rel.role] || '') });
      result.relationships += 1;
    }
    await store.createAcceptedClaim({ case_id: caseId, target_type: 'case', target_id: caseId, field: 'relative', value: { display_name: rel.name, qid: rel.qid, role: rel.role, of: personId, birth: rel.birth || null, death: rel.death || null }, origin: 'lookup', rationale: cite(ROLE_PROP_ALL[rel.role] || '') });

    // their own profile — skipped when the case already holds a filled-in person
    if (existed && (person.birth_place || person.photo_path || person.nationality)) continue;
    try {
      const f = await fetchProfile(rel.qid);
      const own = (prop) => `Source: Wikidata ${f.wikidataUrl} (${prop})${f.wikiUrl ? ` · Wikipedia ${f.wikiUrl}` : ''}`;
      const patch = {};
      const applied = [];
      const fresh = await store.getPerson(person.id);
      if (f.birth && !fresh.birth_date && !fresh.birth_year_min) { Object.assign(patch, dateFields(f.birth, null), { death_date: fresh.death_date, death_precision: fresh.death_precision }); applied.push(['birth', f.birth, P.birth]); }
      if (f.death && f.death.precision === 'day' && !fresh.death_date) { patch.death_date = f.death.date; patch.death_precision = 'day'; applied.push(['death', f.death, P.death]); }
      if (f.birthPlace && !fresh.birth_place) { patch.birth_place = f.birthPlace; applied.push(['birth_place', f.birthPlace, P.birthPlace]); }
      if (f.nationality.length && !fresh.nationality) { patch.nationality = f.nationality.join(', '); applied.push(['nationality', patch.nationality, P.citizenship]); }
      if (f.gender && !fresh.gender) { patch.gender = f.gender.charAt(0).toUpperCase() + f.gender.slice(1); applied.push(['gender', patch.gender, P.gender]); }
      if (f.occupations.length && !fresh.occupation) { patch.occupation = f.occupations.join(', '); applied.push(['occupation', patch.occupation, P.occupation]); }
      if (Object.keys(patch).length) await store.updatePerson(person.id, patch);
      for (const [field, value, prop] of applied) {
        await store.createAcceptedClaim({ case_id: caseId, target_type: 'person', target_id: person.id, field, value, origin: 'lookup', rationale: own(prop) });
      }
      await ensureWikipediaEvidence(store, caseId, person.id, f);
      if (f.photoUrl && !fresh.photo_path) {
        const ok = await savePhotoFromUrl(store, person.id, f.photoUrl);
        if (ok) result.pictures += 1;
      }
    } catch (e) {
      result.failed.push(rel.name);
    }
  }
  return result;
}

/**
 * Turn fetched facts into drafted claims on `personId` (through Review), plus
 * one linked Wikipedia evidence item. Returns what was drafted.
 */
export async function draftFromLookup(store, caseId, personId, facts) {
  const drafted = [];
  const cite = (prop) => `Source: Wikidata ${facts.wikidataUrl} (${prop})${facts.wikiUrl ? ` · Wikipedia ${facts.wikiUrl}` : ''}`;
  // running the lookup twice must not draft everything twice (2026-09-02:
  // Dolly arrived with 14 claims for 7 facts) — an identical drafted
  // claim already in the queue is left alone
  // …and a fact she has already accepted (or rejected) is not asked again
  const existing = await store.listClaims(caseId);
  const already = (targetType, targetId, field, value) => existing.some((c) => c.target_type === targetType && c.target_id === targetId && c.field === field && c.value === JSON.stringify(value));
  const claim = async (field, value, prop) => {
    if (already('person', personId, field, value)) return;
    await store.createClaim({ case_id: caseId, target_type: 'person', target_id: personId, field, value, origin: 'lookup', rationale: cite(prop) });
    drafted.push(field);
  };

  // the citation exists even before anything is accepted
  const ev = await ensureWikipediaEvidence(store, caseId, personId, facts);

  // the article's picture: an identification aid, not a fact, so it's saved
  // directly — fetched once, stored as an asset (syncs, works offline), with
  // its Wikipedia origin kept; if the bytes can't be read, the URL alone
  await savePhotoFromUrl(store, personId, facts.photoUrl);

  if (facts.birth) await claim('birth', facts.birth, P.birth);
  if (facts.death && facts.death.precision === 'day') await claim('death', facts.death, P.death);
  if (facts.birthPlace) await claim('birth_place', facts.birthPlace, P.birthPlace);
  if (facts.nationality.length) await claim('nationality', facts.nationality.join(', '), P.citizenship);
  if (facts.gender) await claim('gender', facts.gender.charAt(0).toUpperCase() + facts.gender.slice(1), P.gender);
  if (facts.occupations.length) await claim('occupation', facts.occupations.join(', '), P.occupation);
  // every relative is one claim: accept it and the person (or the existing
  // person with that name) gets the relationship, dates included
  const ROLE_PROP = { ...REL, godchild: 'P1290, reverse' };
  const relatives = facts.relatives || facts.spouses.map((sp) => ({ ...sp, role: 'spouse', birth: null, death: null }));
  for (const rel of relatives) {
    if (!rel.name || /^Q\d+$/.test(rel.name)) continue; // an unlabelled item is nothing she can judge
    const value = { display_name: rel.name, qid: rel.qid, role: rel.role, of: personId, birth: rel.birth || null, death: rel.death || null };
    if (already('case', caseId, 'relative', value)) continue;
    await store.createClaim({ case_id: caseId, target_type: 'case', target_id: caseId, field: 'relative', value, origin: 'lookup', rationale: cite(ROLE_PROP[rel.role] || '') });
    drafted.push(rel.role);
  }
  return { drafted, evidenceId: ev.id };
}
