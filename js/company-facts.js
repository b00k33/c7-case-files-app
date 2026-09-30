// A company/corporation's founding facts from Wikidata (her ask, 2026-09-29:
// "add an option for me to add corporations/businesses including founding
// date, franchise founding date, founder, location opening etc" — a new
// case kind for tracking a business as its own record; not to be confused
// with event.kind='business', a person's own "opened a business" life
// event, a different, pre-existing thing — see milestone-kinds.js.
//
// Three Wikidata properties map cleanly, checked live against McDonald's
// real item (Q38076, 2026-09-29): P571 (inception — the founding date),
// P740 (location of formation, its own item — resolved to a city name and,
// via that item's own P17, a country) and P112 (founder). No clean fifth
// property exists for "when franchising began" as a concept distinct from
// founding — the McDonald brothers AND Ray Kroc sit on the same
// undifferentiated P112, with nothing to tell them apart — so that field,
// and the Locations tab's individual store/branch openings, stay manual
// entry, matching this app's own precedent (the 2026-09-17 "awards list"
// call) of declining to guess at data Wikidata doesn't cleanly separate.
//
// P159 — headquarters — added 2026-09-30 (her report: "c7 is not extracting
// all info from wiki for anytime fitness despite it showing on website").
// Anytime Fitness's own item (Q4778364) has no P740 at all, only P159
// ("Hastings"), and has zero P112 founder claims even though Wikipedia's
// article names three — that data was simply never entered as a Wikidata
// claim, on the company's item or on any item for the three people, so no
// query can retrieve it (they'd need typing in by hand either way). P159 is
// a genuinely different fact from P740 — a company's HQ can move, and can
// disagree with other sources about where it even is (Wikipedia's own
// infobox says "Woodbury, MN" for this company, not "Hastings") — so it's
// surfaced only as a clearly-labeled "headquarters" fallback, never blended
// into founding_city/country. See applyCompanyFacts and company.js.
import { getJSON, SPARQL, addPeopleFromWikidata } from './lookup.js';

// No GROUP BY here, so pairing directly with the label service is safe (the
// StackOverflowError rule found live 2026-09-21 — see works.js — is
// specifically GROUP BY + SERVICE wikibase:label together).
const FACTS_QUERY = (qid) => `SELECT ?date ?datePrec ?placeLabel ?countryLabel ?hqLabel ?hqCountryLabel ?founder ?founderLabel WHERE {
  OPTIONAL { wd:${qid} p:P571 ?dateSt . ?dateSt ps:P571 ?date ; psv:P571/wikibase:timePrecision ?datePrec . FILTER NOT EXISTS { ?dateSt wikibase:rank wikibase:DeprecatedRank } }
  OPTIONAL { wd:${qid} wdt:P740 ?place . OPTIONAL { ?place wdt:P17 ?country . } }
  OPTIONAL { wd:${qid} wdt:P159 ?hq . OPTIONAL { ?hq wdt:P17 ?hqCountry . } }
  OPTIONAL { wd:${qid} wdt:P112 ?founder . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
} LIMIT 50`;

const ask = async (query) => {
  const url = `${SPARQL}?format=json&query=${encodeURIComponent(query)}`;
  try { return await getJSON(url); }
  catch (e) { if (!/\((429|500|502|503|504)\)/.test(e.message)) throw e; await new Promise((r) => setTimeout(r, 2000)); return getJSON(url); }
};

/**
 * Founding facts for one company's Wikidata item: { date: {iso,prec}|null,
 * city, country, hqCity, hqCountry, founders: [{qid,label}] } — `date.prec`
 * is 11/10/9 (day/month/year), the same convention works.js and lookup.js
 * use. `hqCity`/`hqCountry` (P159) are a distinct fact from `city`/`country`
 * (P740) — see the file-top note on why they're never merged.
 */
export async function fetchCompanyFacts(qid) {
  const data = await ask(FACTS_QUERY(qid));
  const bindings = (data.results && data.results.bindings) || [];
  let date = null, city = null, country = null, hqCity = null, hqCountry = null;
  const founders = new Map();
  for (const b of bindings) {
    if (!date && b.date) date = { iso: b.date.value.slice(0, 10), prec: b.datePrec ? parseInt(b.datePrec.value, 10) : 11 };
    if (!city && b.placeLabel) city = b.placeLabel.value;
    if (!country && b.countryLabel) country = b.countryLabel.value;
    if (!hqCity && b.hqLabel) hqCity = b.hqLabel.value;
    if (!hqCountry && b.hqCountryLabel) hqCountry = b.hqCountryLabel.value;
    if (b.founder) {
      const q = /Q\d+$/.exec(b.founder.value)[0];
      if (!founders.has(q)) founders.set(q, b.founderLabel ? b.founderLabel.value : q);
    }
  }
  return { date, city, country, hqCity, hqCountry, founders: [...founders].map(([fqid, label]) => ({ qid: fqid, label })) };
}

/**
 * Fill in whatever the case doesn't already have — her own edits always
 * win, so a re-check only fills blanks, never overwrites — and add any new
 * founder as a full Wikidata-sourced person (same machinery as a series'
 * cast), role defaulted to "Founder". Wikidata doesn't distinguish an
 * original founder from whoever later took the business to franchise, so a
 * franchise founder's role has to be corrected by hand on their face card.
 * Returns { filledDate, filledPlace, foundersAdded }.
 */
export async function applyCompanyFacts(store, kase, facts) {
  const patch = {};
  if (facts.date && !kase.founding_date && !kase.founding_year_min) {
    const d = facts.date;
    patch.founding_date = d.prec >= 11 ? d.iso : d.prec === 10 ? `${d.iso.slice(0, 7)}-01` : null;
    patch.founding_date_precision = d.prec >= 11 ? 'day' : d.prec === 10 ? 'month' : 'year';
    const year = parseInt(d.iso.slice(0, 4), 10);
    patch.founding_year_min = patch.founding_date_precision === 'year' ? year : null;
    patch.founding_year_max = patch.founding_year_min;
  }
  if (facts.city && !kase.founding_city) patch.founding_city = facts.city;
  if (facts.country && !kase.founding_country) patch.founding_country = facts.country;
  if (facts.hqCity && !kase.headquarters_city) patch.headquarters_city = facts.hqCity;
  if (facts.hqCountry && !kase.headquarters_country) patch.headquarters_country = facts.hqCountry;
  if (Object.keys(patch).length) await store.updateCase(kase.id, patch);

  let foundersAdded = 0;
  if (facts.founders.length) {
    const existingQids = new Set((await store.listPeople(kase.id)).map((p) => p.wikidata_id).filter(Boolean));
    const picks = facts.founders.filter((f) => !existingQids.has(f.qid));
    if (picks.length) {
      const r = await addPeopleFromWikidata(store, kase.id, picks);
      for (const f of picks) {
        const person = store.findPersonByWikidata(kase.id, f.qid);
        if (person && !person.role) await store.updatePerson(person.id, { role: 'Founder' });
      }
      foundersAdded = r.created.length;
    }
  }
  return {
    filledDate: !!patch.founding_date,
    filledPlace: !!(patch.founding_city || patch.founding_country),
    filledHq: !!(patch.headquarters_city || patch.headquarters_country),
    foundersAdded,
  };
}

/** One human-readable line for what a Wikidata pull just changed, or found nothing new. */
export function summarizeCompanyFacts(r) {
  const parts = [];
  if (r.filledDate) parts.push('founding date');
  if (r.filledPlace) parts.push('founding location');
  if (r.filledHq) parts.push('headquarters');
  if (r.foundersAdded) parts.push(`${r.foundersAdded} founder${r.foundersAdded === 1 ? '' : 's'}`);
  return parts.length ? `Filled in from Wikidata: ${parts.join(', ')}.` : 'Nothing new from Wikidata.';
}
