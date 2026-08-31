// Pure Chinese zodiac functions. No DOM, no database, no globals.

export const ANIMALS = [
  'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake',
  'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig',
];

export const ELEMENTS = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];

/**
 * Lunar New Year (Gregorian month/day) by year, best-effort table.
 * Source: published Chinese lunar calendar references. Covers 1930–2035.
 * A year missing from this table near the Jan/Feb boundary is NOT guessed —
 * signFor() returns boundary:true instead of silently picking a side.
 */
export const CNY_TABLE = {
  1930: [1, 30], 1931: [2, 17], 1932: [2, 6], 1933: [1, 26], 1934: [2, 14],
  1935: [2, 4], 1936: [1, 24], 1937: [2, 11], 1938: [1, 31], 1939: [2, 19],
  1940: [2, 8], 1941: [1, 27], 1942: [2, 15], 1943: [2, 5], 1944: [1, 25],
  1945: [2, 13], 1946: [2, 2], 1947: [1, 22], 1948: [2, 10], 1949: [1, 29],
  1950: [2, 17], 1951: [2, 6], 1952: [1, 27], 1953: [2, 14], 1954: [2, 3],
  1955: [1, 24], 1956: [2, 12], 1957: [1, 31], 1958: [2, 18], 1959: [2, 8],
  1960: [1, 28], 1961: [2, 15], 1962: [2, 5], 1963: [1, 25], 1964: [2, 13],
  1965: [2, 2], 1966: [1, 21], 1967: [2, 9], 1968: [1, 30], 1969: [2, 17],
  1970: [2, 6], 1971: [1, 27], 1972: [2, 15], 1973: [2, 3], 1974: [1, 23],
  1975: [2, 11], 1976: [1, 31], 1977: [2, 18], 1978: [2, 7], 1979: [1, 28],
  1980: [2, 16], 1981: [2, 5], 1982: [1, 25], 1983: [2, 13], 1984: [2, 2],
  1985: [2, 20], 1986: [2, 9], 1987: [1, 29], 1988: [2, 17], 1989: [2, 6],
  1990: [1, 27], 1991: [2, 15], 1992: [2, 4], 1993: [1, 23], 1994: [2, 10],
  1995: [1, 31], 1996: [2, 19], 1997: [2, 7], 1998: [1, 28], 1999: [2, 16],
  2000: [2, 5], 2001: [1, 24], 2002: [2, 12], 2003: [2, 1], 2004: [1, 22],
  2005: [2, 9], 2006: [1, 29], 2007: [2, 18], 2008: [2, 7], 2009: [1, 26],
  2010: [2, 14], 2011: [2, 3], 2012: [1, 23], 2013: [2, 10], 2014: [1, 31],
  2015: [2, 19], 2016: [2, 8], 2017: [1, 28], 2018: [2, 16], 2019: [2, 5],
  2020: [1, 25], 2021: [2, 12], 2022: [2, 1], 2023: [1, 22], 2024: [2, 10],
  2025: [1, 29], 2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13],
  2030: [2, 3], 2031: [1, 23], 2032: [2, 11], 2033: [1, 31], 2034: [2, 19],
  2035: [2, 8],
};

/** 0 = Rat, cycling from 1984 (a Wood Rat year). */
export function animalIndex(year) {
  return ((year - 1984) % 12 + 12) % 12;
}

/** 0..4 = Wood Fire Earth Metal Water, from the 10-stem cycle, two years per element. */
export function elementIndex(year) {
  const stem = ((year - 1984) % 10 + 10) % 10;
  return Math.floor(stem / 2);
}

function parseDateParts(dateISO) {
  if (!dateISO || typeof dateISO !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return { year, month, day };
}

/**
 * Animal + element for a birth date, honest about the lunar new year
 * boundary. Needs a full date — a birth known only to the year cannot be
 * resolved against a specific new year cutoff.
 */
export function signFor(dateISO) {
  const parts = parseDateParts(dateISO);
  if (!parts) return { ok: false, reason: 'needs a day and month' };
  const { year, month, day } = parts;

  let effectiveYear = year;
  const nearBoundary = month === 1 || (month === 2 && day <= 21);

  if (nearBoundary) {
    const cny = CNY_TABLE[year];
    if (!cny) {
      return { ok: true, animal: null, element: null, boundary: true };
    }
    const cnyDate = Date.UTC(year, cny[0] - 1, cny[1]);
    const thisDate = Date.UTC(year, month - 1, day);
    if (thisDate < cnyDate) effectiveYear = year - 1;
  }

  const ai = animalIndex(effectiveYear);
  const ei = elementIndex(effectiveYear);
  return {
    ok: true,
    animal: ANIMALS[ai],
    element: ELEMENTS[ei],
    animalIndex: ai,
    elementIndex: ei,
    boundary: false,
  };
}
