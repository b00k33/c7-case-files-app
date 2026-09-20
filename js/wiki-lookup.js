// A second, looser-trust source alongside Wikidata's structured claims
// (her ask, 2026-09-20: "multiple sources for retrieving information, like
// wikipedia... combine multiple sources to search google to add relevant
// data"). A browser page can't run an actual Google search — there's no
// free, key-less, CORS-open endpoint for that — but any wiki running plain
// MediaWiki with anonymous API access (Wikipedia itself, and fan wikis
// like D-Addicts that leave it open) exposes exactly that: a name search
// and a page's plain-text extract, the same way Wikidata does. This file
// is the generic client for that — one config per wiki, not one file per
// site.
import { parseDate } from './profile-parse.js';
import { getJSON, savePhotoFromUrl } from './lookup.js';

export const WIKIS = {
  wikipedia: { id: 'wikipedia', label: 'Wikipedia', api: 'https://en.wikipedia.org/w/api.php' },
  daddicts: { id: 'daddicts', label: 'D-Addicts', api: 'https://wiki.d-addicts.com/api.php' },
};

const articleUrl = (wiki, title) => `${wiki.api.replace(/api\.php$/, '')}index.php?title=${encodeURIComponent(String(title).replace(/ /g, '_'))}`;

/**
 * A name search on one wiki — same shape as lookup.js's searchPeople.
 * `opensearch` (a title-prefix match, the same API Wikipedia's own search
 * box autocomplete uses) rather than `list=search` (full-text): the
 * latter's relevance ranking is built for finding a phrase anywhere in
 * millions of articles, so a search for someone this wiki doesn't have
 * returns whatever unrelated pages happen to mention their surname in
 * passing, instead of nothing — the wrong failure mode for "is this
 * person on this wiki at all?" (found live, 2026-09-20, searching a
 * genuinely private person: five unrelated articles came back, not "no
 * match"). No snippet comes with a title-match, so unlike Wikidata's
 * description, only the title distinguishes one candidate from another.
 */
export async function searchWiki(wiki, name) {
  const q = String(name || '').trim();
  if (!q) return [];
  const data = await getJSON(`${wiki.api}?action=opensearch&search=${encodeURIComponent(q)}&limit=6&namespace=0&format=json&origin=*`);
  const [, titles = [], , urls = []] = data;
  return titles.map((title, i) => ({ id: title, label: title, description: '', url: urls[i] || articleUrl(wiki, title) }));
}

/**
 * One page's plain-text body and lead image, read from the wiki's own API.
 * `redirects=1`: a search hit is often a redirect (a nickname or alternate
 * spelling pointing at the real article, or a minor figure folded into a
 * "List of..." page) — without it the API returns the redirect stub itself,
 * with no extract, instead of following through (found live, 2026-09-20:
 * "Old Gregg" came back empty this way; with the flag it correctly resolves
 * to that character's actual section text).
 */
export async function fetchWikiArticle(wiki, title, knownUrl) {
  const data = await getJSON(`${wiki.api}?action=query&prop=extracts|pageimages&explaintext=1&piprop=original&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`);
  const pages = (data.query && data.query.pages) || {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) throw new Error('That page could not be read.');
  return {
    title: page.title,
    extract: page.extract || '',
    photoUrl: (page.original && page.original.source) || null,
    url: knownUrl || articleUrl(wiki, page.title),
  };
}

// A biography's lead sentence follows one of a handful of fixed shapes —
// "Name (born 19 January 1946) is..." or "Name (21 April 1926 – 8
// September 2022) was..." — reliably enough to pull a birth/death date
// straight out of it. Nothing else in the prose is safe to pattern-match
// this way: parseProfileText's other keyword regexes ("occupation",
// "worked as"...) are built for a short, structured paste, and drafted
// pure narrative garbage when tried against a full article instead (found
// live, 2026-09-20: an "occupation" claim came back as "al songwriter at
// sixteen. After writing songs for others" — the regex had matched the
// word "worked" three paragraphs into the prose, nowhere near an actual
// job title). So a wiki article only ever contributes dates — birthplace,
// nationality, gender, occupation stay with the paste box or Wikidata,
// which both give them cleanly.
const MONTH = '[A-Z][a-z]+';
const DATE_RE = `(?:\\d{1,2}\\s+${MONTH}\\s+\\d{4}|${MONTH}\\s+\\d{1,2},?\\s+\\d{4})`;
function leadDates(extract) {
  const lead = String(extract || '').slice(0, 500);
  const range = lead.match(new RegExp(`(${DATE_RE})\\s*[–—-]\\s*(${DATE_RE})`));
  if (range) return { birth: parseDate(range[1]), death: parseDate(range[2]) };
  const born = lead.match(new RegExp(`\\bborn\\s+(${DATE_RE})`, 'i'));
  return { birth: born ? parseDate(born[1]) : null, death: null };
}

/**
 * Turn one article's lead-sentence dates into drafted claims on
 * `personId` (through Review, same as a Wikidata lookup), plus one linked
 * evidence item citing the specific wiki and page, and the article's lead
 * photo. Unlike Wikidata's claims, there is no structured family here to
 * insert and no Works/Life-events list — a wiki article is prose, not a
 * knowledge graph.
 */
export async function draftFromWikiText(store, caseId, personId, wiki, article) {
  const drafted = [];
  const cite = `Source: ${wiki.label} ${article.url}`;
  const existing = await store.listClaims(caseId);
  const already = (field, value) => existing.some((c) => c.target_type === 'person' && c.target_id === personId && c.field === field && c.value === JSON.stringify(value));

  const sources = await store.listSources();
  let src = sources.find((s) => s.name === wiki.label);
  if (!src) src = await store.createSource({ name: wiki.label, kind: 'secondary', agenda_note: 'Crowd-edited wiki; check the page\'s own citations for anything contested.' });
  let ev = (await store.listEvidence(caseId)).find((e) => !e.deleted_at && e.original_url === article.url);
  if (!ev) ev = await store.createEvidence({ case_id: caseId, type: 'document', title: `${wiki.label}: ${article.title}`, source_id: src.id, original_url: article.url, verification: 'single', dated: new Date().toISOString().slice(0, 10) });
  const links = await store.listLinksForTarget('person', personId);
  if (!links.some((l) => l.evidence_id === ev.id)) await store.linkEvidence({ evidence_id: ev.id, target_type: 'person', target_id: personId, note: 'from lookup' });

  const claim = async (field, value) => {
    if (already(field, value)) return;
    const claimId = await store.createClaim({ case_id: caseId, target_type: 'person', target_id: personId, field, value, origin: 'lookup', rationale: cite });
    await store.linkEvidence({ evidence_id: ev.id, target_type: 'claim', target_id: claimId, note: cite });
    drafted.push(field);
  };

  const { birth, death } = leadDates(article.extract);
  if (birth) await claim('birth', birth);
  if (death) await claim('death', death);

  // the article's picture: an identification aid, not a fact, saved
  // directly, same treatment as Wikidata's — never replaces one she chose
  const current = await store.getPerson(personId);
  if (article.photoUrl && !(current && current.photo_path)) await savePhotoFromUrl(store, personId, article.photoUrl);

  return { drafted, evidenceId: ev.id };
}
