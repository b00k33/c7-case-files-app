// Renders the indicator tokens shared by every page: colour says how sure,
// form says what it is. This is the only module allowed to draw them, so
// the rule can't drift page to page.

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// --- status -> colour --------------------------------------------------

/** status: 'sourced' | 'drafted' | 'unknown' | 'contradicted' */
export function statusColor(status) {
  switch (status) {
    case 'sourced': return 'var(--brass)';
    case 'drafted': return 'var(--text-3)';
    case 'contradicted': return 'var(--red)';
    case 'unknown':
    default: return 'transparent';
  }
}
function strokeColor(status) {
  return status === 'unknown' ? 'var(--text-3)' : statusColor(status);
}

// --- confidence, from evidence.verification -----------------------------
// Drafted facts never raise a confidence figure — 'drafted' always maps to 0.

const VERIFICATION_CONFIDENCE = {
  two_plus: 90,
  single: 55,
  disputed: 25,
  dead_link: 10,
  drafted: 0,
};

export function verificationConfidence(verification) {
  return VERIFICATION_CONFIDENCE[verification] ?? 0;
}

// the human face of the verification codes — chips never show "two_plus"
const VERIFICATION_SHORT = { two_plus: '2+ sources', single: '1 source', disputed: 'disputed', dead_link: 'dead link', drafted: 'drafted' };
export function verificationLabel(verification) {
  return VERIFICATION_SHORT[verification] || verification;
}

export function confidenceBand(value) {
  if (value >= 70) return 'green';
  if (value >= 40) return 'amber';
  return 'red';
}

// --- the bar row: label (left) · bar (middle) · value (right) ----------

export function barRow({ label, value, max = 100, display, colorVar }) {
  const row = document.createElement('div');
  row.className = 'bar-row';
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color = colorVar || `var(--${{ green: 'green', amber: 'amber', red: 'red' }[confidenceBand(pct)]})`;
  row.innerHTML = `
    <span class="bar-row-label">${label}</span>
    <span class="bar-row-track"><span class="bar-row-fill" style="width:${pct}%; background:${color}"></span></span>
    <span class="bar-row-value">${display != null ? display : value}</span>
  `;
  return row;
}

// --- tokens --------------------------------------------------------------
// ---------------------------------------------------------------- colour --
// Her colour code (2026-09-03), applied wherever an animal or sun sign is
// printed. Chinese animals by trine: blue Snake·Ox·Rooster, green
// Dog·Tiger·Horse, pink Pig·Goat·Rabbit (the Cat, in the Vietnamese
// zodiac), yellow Rat·Dragon·Monkey. Western signs by element: air light
// blue, fire red, earth yellow-brown, water dark blue.
const ZODIAC_GROUP = {
  Snake: 'blue', Ox: 'blue', Rooster: 'blue',
  Dog: 'green', Tiger: 'green', Horse: 'green',
  Pig: 'pink', Goat: 'pink', Rabbit: 'pink', Cat: 'pink',
  Rat: 'yellow', Dragon: 'yellow', Monkey: 'yellow',
};
const SIGN_ELEMENT = {
  Gemini: 'air', Libra: 'air', Aquarius: 'air',
  Aries: 'fire', Leo: 'fire', Sagittarius: 'fire',
  Taurus: 'earth', Virgo: 'earth', Capricorn: 'earth',
  Cancer: 'water', Scorpio: 'water', Pisces: 'water',
};
export function zodiacGroup(animal) { return ZODIAC_GROUP[animal] || null; }
export function signElement(sign) { return SIGN_ELEMENT[sign] || null; }
export function zodiacColor(animal) { const g = zodiacGroup(animal); return g ? `var(--zc-${g})` : null; }
export function signColor(sign) { const e = signElement(sign); return e ? `var(--ws-${e})` : null; }
/** Inline HTML for a coloured animal / sun-sign name. */
export function animalHtml(animal) { const g = zodiacGroup(animal); return g ? `<span class="zc zc-${g}">${animal}</span>` : animal; }
export function signHtml(sign) { const e = signElement(sign); return e ? `<span class="zc ws-${e}">${sign}</span>` : sign; }

// Her call (2026-09-03): "show lp number as number, and use images/icons for
// astrology" — the wheel/square tokens are gone from the tree, the map and
// the profile header. The animal is its picture, the sign its classic
// glyph, both carrying the colour code; the life path is just the number.
const ANIMAL_ICON = { Rat: '🐀', Ox: '🐂', Tiger: '🐅', Rabbit: '🐇', Cat: '🐈', Dragon: '🐉', Snake: '🐍', Horse: '🐎', Goat: '🐐', Monkey: '🐒', Rooster: '🐓', Dog: '🐕', Pig: '🐖' };
const SIGN_GLYPH = { Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋', Leo: '♌', Virgo: '♍', Libra: '♎', Scorpio: '♏', Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓' };
export function animalIcon(animal) { return ANIMAL_ICON[animal] || null; }
export function signGlyph(sign) { return SIGN_GLYPH[sign] || null; }

/**
 * The three facts under a face: life path (number), animal (picture), sun
 * sign (glyph). opts: { lifePath: {ok,value,master}, chinese: {ok,boundary,animal,element}, sun: {ok,cusp,sign} }.
 * Unknowns show as a hollow dash, never omitted (STYLE §5).
 */
export function numberIcons({ lifePath, chinese, sun }, { size = 'sm' } = {}) {
  const row = document.createElement('div');
  row.className = `num-icons num-${size}`;
  const lp = document.createElement('span');
  lp.className = 'ni-lp mono';
  if (lifePath && lifePath.ok) { lp.textContent = `${lifePath.value}${lifePath.master ? '★' : ''}`; lp.title = `Life path ${lifePath.value}${lifePath.master ? ' (master)' : ''}`; }
  else { lp.textContent = '—'; lp.classList.add('unknown'); lp.title = 'Life path — needs a full birth date'; }
  row.appendChild(lp);

  const an = document.createElement('span');
  an.className = 'ni-animal';
  if (chinese && chinese.ok && !chinese.boundary && animalIcon(chinese.animal)) {
    an.textContent = animalIcon(chinese.animal);
    an.style.borderColor = zodiacColor(chinese.animal) || 'var(--ink-3)';
    an.title = `${chinese.animal}${chinese.element ? ' · ' + chinese.element : ''}`;
  } else {
    an.textContent = chinese && chinese.boundary ? '?' : '—';
    an.classList.add('unknown');
    an.title = chinese && chinese.boundary ? 'Animal year — near lunar new year, unresolved' : 'Animal year — needs a full birth date';
  }
  row.appendChild(an);

  const su = document.createElement('span');
  su.className = 'ni-sign';
  if (sun && sun.ok && signGlyph(sun.sign)) {
    su.textContent = signGlyph(sun.sign);
    su.style.color = signColor(sun.sign) || 'var(--text-2)';
    su.title = `${sun.sign}${sun.cusp ? ' (cusp)' : ''}`;
    if (sun.cusp) su.classList.add('cusp');
  } else {
    su.textContent = '—';
    su.classList.add('unknown');
    su.title = 'Sun sign — needs a full birth date';
  }
  row.appendChild(su);
  return row;
}

// kind: 'lifePath' | 'personalYear' | 'animalYear' | 'sunSign'
// opts: { status, master, boundary, cusp, value, animal, animalIndex, element, sign }

function halfClip(id) {
  const clip = svg('clipPath', { id });
  clip.appendChild(svg('rect', { x: 0, y: 0, width: 10, height: 20 }));
  return clip;
}

function ring(cx, cy, r, color, extra = {}) {
  return svg('circle', { cx, cy, r, fill: 'none', stroke: color, 'stroke-width': 1.6, ...extra });
}

function disc(cx, cy, r, color) {
  return svg('circle', { cx, cy, r, fill: color, stroke: color, 'stroke-width': 1 });
}

export function makeToken(kind, opts = {}) {
  const { status = 'unknown', master = false, boundary = false, cusp = false } = opts;
  const size = 20;
  const root = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'c7-token', 'data-kind': kind });
  const color = strokeColor(status);
  const half = kind === 'animalYear' ? boundary : kind === 'sunSign' ? cusp : boundary || cusp;

  const group = svg('g');
  if (half) {
    const clipId = `clip-${Math.random().toString(36).slice(2)}`;
    root.appendChild(halfClip(clipId));
    group.setAttribute('clip-path', `url(#${clipId})`);
  }
  root.appendChild(group);

  if (master) {
    group.appendChild(ring(10, 10, 8, color));
    group.appendChild(ring(10, 10, 5, color));
  } else if (kind === 'lifePath') {
    if (status === 'unknown') group.appendChild(ring(10, 10, 7.5, color));
    else group.appendChild(disc(10, 10, 7.5, color));
  } else if (kind === 'personalYear') {
    group.appendChild(ring(10, 10, 7.5, color));
  } else if (kind === 'animalYear') {
    // twelve-spoke wheel, one sector filled at animalIndex
    group.appendChild(ring(10, 10, 8, color));
    const idx = opts.animalIndex ?? -1;
    // the ring keeps the status colour; the animal's own sector and letter take the trine colour
    const zc = (status !== 'unknown' && zodiacColor(opts.animal)) || color;
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const x1 = 10 + Math.cos(a0) * 3, y1 = 10 + Math.sin(a0) * 3;
      const x2 = 10 + Math.cos(a0) * 8, y2 = 10 + Math.sin(a0) * 8;
      group.appendChild(svg('line', { x1, y1, x2, y2, stroke: idx === i ? zc : color, 'stroke-width': idx === i ? 2.2 : 0.7, opacity: idx === i ? 1 : 0.45 }));
    }
    if (opts.element) {
      const label = svg('text', { x: 10, y: 12.5, 'text-anchor': 'middle', 'font-size': 7, fill: zc, 'font-family': 'var(--font-mono)' });
      label.textContent = opts.element[0];
      group.appendChild(label);
    }
  } else if (kind === 'sunSign') {
    group.appendChild(svg('rect', { x: 2.5, y: 2.5, width: 15, height: 15, rx: 3, fill: 'none', stroke: color, 'stroke-width': 1.6 }));
    if (opts.sign) {
      const wc = (status !== 'unknown' && signColor(opts.sign)) || color;
      const label = svg('text', { x: 10, y: 12.5, 'text-anchor': 'middle', 'font-size': 6.2, fill: wc, 'font-family': 'var(--font-mono)' });
      label.textContent = opts.sign.slice(0, 3).toUpperCase();
      group.appendChild(label);
    }
  }

  if (status === 'contradicted') {
    root.appendChild(ring(10, 10, 9.2, 'var(--red)', { 'stroke-dasharray': '2,1.4' }));
  }

  root.setAttribute('title', tokenTitle(kind, opts));
  const titleEl = svg('title');
  titleEl.textContent = tokenTitle(kind, opts);
  root.insertBefore(titleEl, root.firstChild);
  return root;
}

function tokenTitle(kind, opts) {
  const parts = [];
  if (kind === 'lifePath') parts.push(`Life path${opts.value != null ? ' ' + opts.value : ''}`);
  if (kind === 'personalYear') parts.push(`Personal year${opts.value != null ? ' ' + opts.value : ''}`);
  if (kind === 'animalYear') parts.push(opts.boundary ? 'Animal year — near lunar new year, unresolved' : `${opts.animal || '?'} · ${opts.element || '?'}`);
  if (kind === 'sunSign') parts.push(opts.sign ? `${opts.sign}${opts.cusp ? ' (cusp)' : ''}` : 'Sun sign — unknown');
  if (opts.master) parts.push('master number');
  parts.push(`— ${opts.status || 'unknown'}`);
  return parts.join(' ');
}

/** Cap a list of tokens at a ceiling, per STYLE.md (3 on a card, 4 on a node, 2 bands on a timeline). */
export function capTokens(list, max) {
  return list.slice(0, max);
}

// --- relation glyphs, drawn ON the connecting line ----------------------

/** kind: 'clash' | 'trine' | 'harmony' | 'same' | 'neutral', unsettled: bool */
export function relationGlyph(kind, { unsettled = false } = {}) {
  const size = 16;
  const root = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'c7-relation-glyph', 'data-kind': kind });
  const color = unsettled ? 'var(--text-3)' : {
    clash: 'var(--red)', trine: 'var(--green)', harmony: 'var(--teal)', same: 'var(--brass)', neutral: 'var(--text-3)',
  }[kind];

  if (unsettled) {
    root.appendChild(svg('text', { x: 8, y: 11.5, 'text-anchor': 'middle', 'font-size': 10, fill: color, 'font-family': 'var(--font-mono)' })).textContent = '?';
    return root;
  }

  if (kind === 'clash') {
    root.appendChild(svg('line', { x1: 5, y1: 3, x2: 9, y2: 13, stroke: color, 'stroke-width': 1.8 }));
    root.appendChild(svg('line', { x1: 9, y1: 3, x2: 13, y2: 13, stroke: color, 'stroke-width': 1.8 }));
  } else if (kind === 'trine') {
    root.appendChild(svg('polygon', { points: '8,3 14,13 2,13', fill: 'none', stroke: color, 'stroke-width': 1.6 }));
  } else if (kind === 'harmony') {
    root.appendChild(ring(6, 8, 4, color));
    root.appendChild(ring(10, 8, 4, color));
  } else if (kind === 'same') {
    root.appendChild(svg('line', { x1: 3, y1: 6, x2: 13, y2: 6, stroke: color, 'stroke-width': 1.8 }));
    root.appendChild(svg('line', { x1: 3, y1: 10, x2: 13, y2: 10, stroke: color, 'stroke-width': 1.8 }));
  } else {
    root.appendChild(svg('line', { x1: 3, y1: 8, x2: 13, y2: 8, stroke: color, 'stroke-width': 1, opacity: 0.4 }));
  }
  return root;
}

// --- empty state, per STYLE.md section 8: missing / why / one action ----

export function emptyState({ missing, why, action, onAction }) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = `
    <p class="empty-missing">${missing}</p>
    <p class="empty-why">${why}</p>
  `;
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost';
    btn.textContent = action;
    if (onAction) btn.addEventListener('click', onAction);
    el.appendChild(btn);
  }
  return el;
}
