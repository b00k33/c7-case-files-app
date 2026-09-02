// Pure, deterministic parser for the profile "Import information" box.
// Paste "dob 15th sept 2024", "Russian", "female, married, born in Moscow",
// "died 3 Jan 2020", "aka Marie" — it returns what it recognised, as person
// fields, and lists what it didn't. No network, no guessing: an ambiguous
// fragment is reported as unrecognised rather than saved wrong.

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DATE_ANY = `(\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_RE})\\.?,?\\s+\\d{4}|(?:${MONTH_RE})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{4}|\\d{4}-\\d{2}-\\d{2}|(?:${MONTH_RE})\\.?\\s+\\d{4}|\\b\\d{4}\\b)`;

const DEMONYMS = [
  'afghan', 'albanian', 'algerian', 'american', 'argentine', 'argentinian', 'armenian', 'australian', 'austrian', 'azerbaijani',
  'bangladeshi', 'belarusian', 'belgian', 'bolivian', 'bosnian', 'brazilian', 'british', 'bulgarian', 'burmese',
  'cambodian', 'cameroonian', 'canadian', 'chilean', 'chinese', 'colombian', 'congolese', 'croatian', 'cuban', 'czech',
  'danish', 'dominican', 'dutch', 'ecuadorian', 'egyptian', 'english', 'estonian', 'ethiopian', 'filipino', 'filipina', 'finnish', 'french',
  'georgian', 'german', 'ghanaian', 'greek', 'guatemalan', 'haitian', 'honduran', 'hungarian', 'icelandic', 'indian', 'indonesian',
  'iranian', 'iraqi', 'irish', 'israeli', 'italian', 'jamaican', 'japanese', 'jordanian', 'kazakh', 'kenyan', 'korean', 'kuwaiti',
  'laotian', 'latvian', 'lebanese', 'libyan', 'lithuanian', 'malaysian', 'maltese', 'mexican', 'moldovan', 'mongolian', 'moroccan',
  'nepalese', 'nepali', 'new zealander', 'nigerian', 'norwegian', 'pakistani', 'palestinian', 'panamanian', 'paraguayan', 'peruvian',
  'polish', 'portuguese', 'puerto rican', 'romanian', 'russian', 'saudi', 'scottish', 'senegalese', 'serbian', 'singaporean', 'slovak',
  'slovenian', 'somali', 'south african', 'spanish', 'sri lankan', 'sudanese', 'swedish', 'swiss', 'syrian', 'taiwanese', 'thai',
  'tunisian', 'turkish', 'ugandan', 'ukrainian', 'uruguayan', 'venezuelan', 'vietnamese', 'welsh', 'yemeni', 'zimbabwean',
];
const GENDERS = ['female', 'male', 'woman', 'man', 'non-binary', 'nonbinary', 'trans woman', 'trans man', 'transgender', 'intersex'];
const MARITAL = ['single', 'married', 'divorced', 'widowed', 'engaged', 'separated', 'de facto', 'partnered'];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pad2 = (n) => String(n).padStart(2, '0');

/** "15th sept 2024" → { date:'2024-09-15', precision:'day', year:2024 }; "sept 2024" → month; "2024" → year; null if not a date. */
export function parseDate(str) {
  const s = String(str || '').trim().toLowerCase().replace(/(\d)(st|nd|rd|th)/g, '$1').replace(/\./g, '');
  let m;
  if ((m = s.match(new RegExp(`^(\\d{1,2})\\s+(${MONTH_RE}),?\\s+(\\d{4})$`)))) {
    return valid(parseInt(m[3], 10), MONTHS[m[2]], parseInt(m[1], 10), 'day');
  }
  if ((m = s.match(new RegExp(`^(${MONTH_RE})\\s+(\\d{1,2}),?\\s+(\\d{4})$`)))) {
    return valid(parseInt(m[3], 10), MONTHS[m[1]], parseInt(m[2], 10), 'day');
  }
  if ((m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/))) {
    return valid(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10), 'day'); // day first (AU)
  }
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    return valid(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), 'day');
  }
  if ((m = s.match(new RegExp(`^(${MONTH_RE})\\s+(\\d{4})$`)))) {
    const y = parseInt(m[2], 10), mo = MONTHS[m[1]];
    return { date: `${y}-${pad2(mo)}-01`, precision: 'month', year: y };
  }
  if ((m = s.match(/^(\d{4})$/))) {
    const y = parseInt(m[1], 10);
    if (y < 1000 || y > 2200) return null;
    return { date: null, precision: 'year', year: y };
  }
  return null;
}

function valid(y, mo, d, precision) {
  if (!mo || mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1000 || y > 2200) return null;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > dim) return null;
  return { date: `${y}-${pad2(mo)}-${pad2(d)}`, precision, year: y };
}

/**
 * Parse pasted text into person fields.
 * Returns { fields, aliases, recognised: [{label, value}], unrecognised: [string] }.
 */
export function parseProfileText(text) {
  const out = { fields: {}, aliases: [], recognised: [], unrecognised: [] };
  let t = String(text || '').replace(/\r/g, '');

  const take = (re, handler) => {
    t = t.replace(re, (...m) => { handler(m); return ' § '; });
  };
  const setBirth = (raw) => {
    const d = parseDate(raw);
    if (!d) return;
    out.fields.birth_date = d.date;
    out.fields.birth_precision = d.precision;
    if (d.precision === 'year') { out.fields.birth_year_min = d.year; out.fields.birth_year_max = d.year; }
    out.recognised.push({ label: 'Birth date', value: d.date || String(d.year) + (d.precision === 'year' ? ' (year only)' : '') });
  };
  const setDeath = (raw) => {
    const d = parseDate(raw);
    if (!d) return;
    out.fields.death_date = d.date || `${d.year}-01-01`;
    out.fields.death_precision = d.precision;
    out.recognised.push({ label: 'Death date', value: d.date || `${d.year} (year only)` });
  };

  // keyword-led facts first, cut out of the text as they're found
  take(new RegExp(`\\b(?:dob|date of birth|birth\\s*date|birthday|born(?:\\s+on)?|b\\.)\\s*[:\\-]?\\s*${DATE_ANY}`, 'i'), (m) => setBirth(m[1]));
  take(new RegExp(`\\b(?:dod|date of death|died(?:\\s+on)?|death|d\\.)\\s*[:\\-]?\\s*${DATE_ANY}`, 'i'), (m) => setDeath(m[1]));
  take(/\b(?:born in|birthplace|place of birth|birth place)\s*[:\-]?\s*([^,;\n§]{2,60})/i, (m) => {
    out.fields.birth_place = m[1].trim();
    out.recognised.push({ label: 'Birthplace', value: out.fields.birth_place });
  });
  take(/\b(?:nationality|citizenship|citizen of)\s*[:\-]?\s*([^,;\n§]{2,60})/i, (m) => {
    out.fields.nationality = m[1].trim();
    out.recognised.push({ label: 'Nationality', value: out.fields.nationality });
  });
  take(/\b(?:gender|sex)\s*[:\-]?\s*([^,;\n§]{2,30})/i, (m) => {
    out.fields.gender = cap(m[1].trim());
    out.recognised.push({ label: 'Gender', value: out.fields.gender });
  });
  take(/\b(?:marital status|marital|relationship status)\s*[:\-]?\s*([^,;\n§]{2,40})/i, (m) => {
    out.fields.marital_status = cap(m[1].trim());
    out.recognised.push({ label: 'Marital status', value: out.fields.marital_status });
  });
  take(/\b(?:occupation|profession|job|works as|worked as)\s*[:\-]?\s*([^,;\n§]{2,60})/i, (m) => {
    out.fields.occupation = m[1].trim();
    out.recognised.push({ label: 'Occupation', value: out.fields.occupation });
  });
  take(/\b(n[ée]e)\s*[:\-]?\s*([^,;\n§]{2,60})/i, (m) => {
    out.aliases.push({ alias: m[2].trim(), kind: 'maiden' });
    out.recognised.push({ label: 'Maiden name', value: m[2].trim() });
  });
  take(/\b(?:aka|a\.k\.a\.|also known as|alias)\s*[:\-]?\s*([^,;\n§]{2,60})/i, (m) => {
    out.aliases.push({ alias: m[1].trim(), kind: 'other' });
    out.recognised.push({ label: 'Alias', value: m[1].trim() });
  });

  // whatever's left: fragments judged on their own
  const fragments = t.split(/[\n;§]|,(?!\s*\d{4})/).map((f) => f.trim()).filter((f) => f && f !== '§');
  const nationalities = [];
  for (const frag of fragments) {
    const low = frag.toLowerCase().replace(/[.]+$/, '');
    if (!out.fields.birth_date && !out.fields.birth_precision && parseDate(low)) { setBirth(low); continue; }
    const g = GENDERS.find((x) => low === x);
    if (g && !out.fields.gender) { out.fields.gender = cap(g); out.recognised.push({ label: 'Gender', value: out.fields.gender }); continue; }
    const ms = MARITAL.find((x) => low === x);
    if (ms && !out.fields.marital_status) { out.fields.marital_status = cap(ms); out.recognised.push({ label: 'Marital status', value: out.fields.marital_status }); continue; }
    const parts = low.split(/[\s/&-]+(?:and\s+)?/).filter(Boolean);
    const allDemonyms = parts.length && parts.every((p) => DEMONYMS.includes(p)) ;
    const wholeDemonym = DEMONYMS.includes(low);
    if (wholeDemonym || allDemonyms) {
      nationalities.push(wholeDemonym ? cap(low) : parts.map(cap).join('-'));
      continue;
    }
    out.unrecognised.push(frag);
  }
  if (nationalities.length && !out.fields.nationality) {
    out.fields.nationality = nationalities.join(', ');
    out.recognised.push({ label: 'Nationality', value: out.fields.nationality });
  }
  return out;
}
