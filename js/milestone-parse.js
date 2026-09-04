// Bulk parser for the Commercial tab's paste box — she reads several facts
// off one article and pastes them in one go, e.g.:
//   2011 - signed to TEN Music Group
//   Feb 2013 - "Uncover" reaches number one in Sweden
//   2014 - certified gold in the UK
//   2016 - wins a Rockbjornen award for Best Female Artist
// One line = one candidate milestone. Unlike the profile's single-fields
// parser, this always returns a full list to review before saving — a wrong
// guess here is a mis-categorised chip, not a silently wrong profile field,
// so the bar for "confident enough to guess" is lower; she edits before Save.
import { parseDate } from './profile-parse.js';

const MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DATE_RE = new RegExp(
  `\\b(\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_RE})\\.?,?\\s+\\d{4}|(?:${MONTH_RE})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|(?:${MONTH_RE})\\.?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\b\\d{4}\\b)`,
  'i'
);

const KIND_RULES = [
  ['certification', /certifi|platinum|\bgold\b|\bsilver\b|\bdiamond\b/i],
  ['chart', /chart|\bno\.?\s?\d+\b|#\d+|number[\s-]one|number-one|\btop\s?\d+\b|debuts? at/i],
  ['award', /\baward|nominat|\bwins?\b|\bwon\b|grammy|brit\s?award/i],
  ['deal', /\bsign(?:ed|s)?\b|\bdeal\b|\btour\b|endorsement|partnership|sponsor|campaign|contract|\blabel\b/i],
];

function guessKind(text) {
  for (const [kind, re] of KIND_RULES) if (re.test(text)) return kind;
  return null;
}

/** One pasted line → a candidate milestone, or null if no date could be found. */
function parseLine(raw) {
  const line = raw.trim();
  if (!line) return null;
  const m = line.match(DATE_RE);
  if (!m) return null;
  const d = parseDate(m[1]);
  if (!d) return null;
  // strip the matched date and any leading/trailing separator around it
  const title = (line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length))
    .replace(/^[\s\-–—:.,]+|[\s\-–—:.,]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || line;
  return {
    kind: guessKind(line) || 'chart',
    title: title.charAt(0).toUpperCase() + title.slice(1),
    date: d.date,
    date_precision: d.precision,
    date_year_min: d.precision === 'year' ? d.year : null,
    date_year_max: d.precision === 'year' ? d.year : null,
    raw: line,
  };
}

/**
 * Parse pasted text into candidate milestones, one per line that carries a
 * recognisable date. Returns { candidates:[{kind,title,date,date_precision,
 * date_year_min,date_year_max,raw}], unrecognised:[string] } — lines with no
 * date go to `unrecognised` since an undated "milestone" has nothing to plot.
 */
export function parseMilestoneText(text) {
  const lines = String(text || '').replace(/\r/g, '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const candidates = [];
  const unrecognised = [];
  for (const line of lines) {
    const c = parseLine(line);
    if (c) candidates.push(c); else unrecognised.push(line);
  }
  return { candidates, unrecognised };
}
