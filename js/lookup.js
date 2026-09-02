// Wikipedia / Wikidata lookup — the app's first third-party read (her rule
// change, 2026-09-02: read-only public lookups, user-triggered, nothing sent
// but the name). Facts never touch a profile directly: each becomes a
// drafted claim in Review citing its Wikidata property, and one Wikipedia
// evidence item is linked to the person so the citation exists regardless.

const WD = 'https://www.wikidata.org/w/api.php';
const WP_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

const P = { birth: 'P569', death: 'P570', birthPlace: 'P19', citizenship: 'P27', gender: 'P21', spouse: 'P26', occupation: 'P106' };

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

  const labels = {};
  if (ids.size) {
    const ld = await getJSON(`${WD}?action=wbgetentities&ids=${[...ids].join('|')}&props=labels&languages=en&format=json&origin=*`);
    for (const [id, e] of Object.entries(ld.entities || {})) labels[id] = e.labels && e.labels.en ? e.labels.en.value : id;
  }
  const L = (id) => (id ? labels[id] || id : null);

  const wikiTitle = ent.sitelinks && ent.sitelinks.enwiki ? ent.sitelinks.enwiki.title : null;
  let summary = null, wikiUrl = null;
  if (wikiTitle) {
    try {
      const s = await getJSON(WP_SUMMARY + encodeURIComponent(wikiTitle));
      summary = s.extract || null;
      wikiUrl = (s.content_urls && s.content_urls.desktop && s.content_urls.desktop.page) || `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`;
    } catch (_) { wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`; }
  }

  return {
    qid,
    label: ent.labels && ent.labels.en ? ent.labels.en.value : qid,
    description: ent.descriptions && ent.descriptions.en ? ent.descriptions.en.value : '',
    wikidataUrl: `https://www.wikidata.org/wiki/${qid}`,
    wikiUrl, summary,
    birth: parseWdTime(values(claims, P.birth)[0]),
    death: parseWdTime(values(claims, P.death)[0]),
    birthPlace: L(birthPlaceId),
    gender: L(genderId),
    nationality: citizenIds.map((id) => DEMONYM[L(id)] || L(id)).filter((v, i, a) => a.indexOf(v) === i),
    spouses: spouseIds.map((id) => ({ qid: id, name: L(id) })),
    occupations: occupationIds.map(L),
  };
}

/**
 * Turn fetched facts into drafted claims on `personId` (through Review), plus
 * one linked Wikipedia evidence item. Returns what was drafted.
 */
export async function draftFromLookup(store, caseId, personId, facts) {
  const drafted = [];
  const cite = (prop) => `Source: Wikidata ${facts.wikidataUrl} (${prop})${facts.wikiUrl ? ` · Wikipedia ${facts.wikiUrl}` : ''}`;
  const claim = (field, value, prop) => store.createClaim({ case_id: caseId, target_type: 'person', target_id: personId, field, value, origin: 'lookup', rationale: cite(prop) })
    .then(() => drafted.push(field));

  // the citation exists even before anything is accepted
  const sources = await store.listSources();
  let src = sources.find((s) => s.name === 'Wikipedia');
  if (!src) src = await store.createSource({ name: 'Wikipedia', kind: 'secondary', agenda_note: 'Crowd-edited encyclopaedia; check the article\'s own citations for anything contested.' });
  const ev = await store.createEvidence({
    case_id: caseId, type: 'document', title: `Wikipedia: ${facts.label}`, source_id: src.id,
    original_url: facts.wikiUrl || facts.wikidataUrl, verification: 'single',
    notes: [facts.description, facts.summary].filter(Boolean).join('\n\n') || null,
    dated: new Date().toISOString().slice(0, 10),
  });
  await store.linkEvidence({ evidence_id: ev.id, target_type: 'person', target_id: personId, note: 'from lookup' });

  if (facts.birth) await claim('birth', facts.birth, P.birth);
  if (facts.death && facts.death.precision === 'day') await claim('death', facts.death, P.death);
  if (facts.birthPlace) await claim('birth_place', facts.birthPlace, P.birthPlace);
  if (facts.nationality.length) await claim('nationality', facts.nationality.join(', '), P.citizenship);
  if (facts.gender) await claim('gender', facts.gender.charAt(0).toUpperCase() + facts.gender.slice(1), P.gender);
  if (facts.occupations.length) await claim('occupation', facts.occupations.join(', '), P.occupation);
  for (const sp of facts.spouses) {
    // a spouse arrives as a new person to accept; the relationship is one
    // step away on the Relations map once both exist
    await store.createClaim({ case_id: caseId, target_type: 'case', target_id: caseId, field: 'person', value: { display_name: sp.name, notes: `Spouse of ${facts.label} per Wikidata ${facts.wikidataUrl} (P26)` }, origin: 'lookup', rationale: cite(P.spouse) });
    drafted.push('spouse');
  }
  return { drafted, evidenceId: ev.id };
}
