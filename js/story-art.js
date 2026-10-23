// story-art.js — the moving pictures for a couple's story (her ask,
// 2026-10-23: "make the relationship timeline animated with animations
// relevant to timeline e.g. wedding, children, and make animated cartoon
// chinese zodiac"; mock their-story-animated-mock.html, her 8 picks).
//
// Three kinds of drawing, all plain SVG strings so any renderer can drop
// them into innerHTML:
//   sceneSvg(kind)   a 160×90 scene for a milestone card with no photo
//   miniSvg(kind)    a 40×40 icon — the corner of a card that has a photo,
//                    and the small lines (profile box, Lifeline tab)
//   zodiacSvg(name)  a cartoon face for the year's Chinese zodiac animal
//
// Motion: an element that moves carries an `a-*` class; app.css only runs
// those while the card is "playing" (.st-run, added once on arrival, or
// the mouse over it) — "play once, loop on hover". The zodiac faces always
// keep a gentle bob and blink (`z-*` classes). Reduced motion stops it all.
//
// The art has its own fixed sticker palette (it sits on a white disc / its
// own tinted ground), so it reads the same by day and by night.

const TRINE = { Rat: 'y', Dragon: 'y', Monkey: 'y', Ox: 'b', Snake: 'b', Rooster: 'b', Tiger: 'g', Horse: 'g', Dog: 'g', Rabbit: 'p', Cat: 'p', Goat: 'p', Pig: 'p' };
const PAL = {
  y: ['#fff3c4', '#f4cb52', '#9c7410'],
  b: ['#e2ebff', '#93b2f3', '#3a5fb0'],
  g: ['#daf4e2', '#84cd9c', '#2c7a49'],
  p: ['#ffe3ef', '#f3a1c5', '#ac4277'],
};
const INK = '#2b2430';
const CHEEK = '#ff8fae';

/** One hidden <svg> of shared gradients, added to the page once. */
function ensureDefs() {
  if (typeof document === 'undefined' || document.getElementById('st-defs')) return;
  const grads = Object.entries(PAL).map(([t, [hi, base]]) => `
    <radialGradient id="st-z-${t}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="${hi}"/><stop offset=".55" stop-color="${base}"/><stop offset="1" stop-color="${base}" stop-opacity=".92"/></radialGradient>`).join('');
  const svg = `<svg id="st-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${grads}
    <radialGradient id="st-muzzle" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f1e7dc"/></radialGradient>
    <radialGradient id="st-heart" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#ff9cbc"/><stop offset="1" stop-color="#d9406f"/></radialGradient>
    <radialGradient id="st-flame" cx="50%" cy="70%" r="70%"><stop offset="0" stop-color="#fff6c2"/><stop offset=".6" stop-color="#ffc23d"/><stop offset="1" stop-color="#ff8a1f"/></radialGradient>
    <linearGradient id="st-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#d9a21e"/></linearGradient>
  </defs></svg>`;
  const go = () => document.body && !document.getElementById('st-defs') && document.body.insertAdjacentHTML('afterbegin', svg);
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go, { once: true });
}
ensureDefs();

// ---------------------------------------------------------------- zodiac --
const eyes = (y = 21, dx = 4.5) => `
  <g class="z-eye"><ellipse cx="${20 - dx}" cy="${y}" rx="1.8" ry="2.15" fill="${INK}"/><ellipse cx="${20 + dx}" cy="${y}" rx="1.8" ry="2.15" fill="${INK}"/></g>
  <circle cx="${20 - dx - .6}" cy="${y - .9}" r=".7" fill="#fff"/><circle cx="${20 + dx - .6}" cy="${y - .9}" r=".7" fill="#fff"/>`;
const cheeks = (y = 25, dx = 8.5) => `<ellipse cx="${20 - dx}" cy="${y}" rx="2.3" ry="1.4" fill="${CHEEK}" opacity=".55"/><ellipse cx="${20 + dx}" cy="${y}" rx="2.3" ry="1.4" fill="${CHEEK}" opacity=".55"/>`;
const smile = (y = 27) => `<path d="M17.6 ${y} Q 20 ${y + 2.3} 22.4 ${y}" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>`;
const shine = (cx = 14.5, cy = 14.5) => `<ellipse cx="${cx}" cy="${cy}" rx="3.2" ry="1.8" fill="#fff" opacity=".45" transform="rotate(-35 ${cx} ${cy})"/>`;
const face = (t, extra = '') => `<circle cx="20" cy="22" r="12.2" fill="url(#st-z-${t})" stroke="${PAL[t][2]}" stroke-width="1.15"${extra}/>`;
const fill = (t) => `fill="url(#st-z-${t})" stroke="${PAL[t][2]}" stroke-width="1.1"`;

const ZOD = {
  Rat: (t) => `
    <g class="z-ear-l"><circle cx="9" cy="12" r="6" ${fill(t)}/><circle cx="9" cy="12" r="3.1" fill="${CHEEK}" opacity=".8"/></g>
    <g class="z-ear-r"><circle cx="31" cy="12" r="6" ${fill(t)}/><circle cx="31" cy="12" r="3.1" fill="${CHEEK}" opacity=".8"/></g>
    ${face(t)}${shine()}${eyes()}${cheeks()}
    <ellipse cx="20" cy="26.6" rx="3.6" ry="2.4" fill="url(#st-muzzle)"/><circle cx="20" cy="25.4" r="1.5" fill="#e3698d"/>
    <g class="z-whisk"><path d="M13 25.6 L5.5 23.8 M13 27.2 L5.5 28.4 M27 25.6 L34.5 23.8 M27 27.2 L34.5 28.4" stroke="${INK}" stroke-width=".7" stroke-linecap="round" opacity=".7"/></g>`,
  Ox: (t) => `
    <path d="M10.5 15 Q 2 12 4.6 3.6 Q 7.6 10.6 13.2 11.4 Z" fill="#f7efdf" stroke="#a6946f" stroke-width="1"/><path d="M29.5 15 Q 38 12 35.4 3.6 Q 32.4 10.6 26.8 11.4 Z" fill="#f7efdf" stroke="#a6946f" stroke-width="1"/>
    <ellipse cx="9" cy="18" rx="3.4" ry="2" ${fill(t)}/><ellipse cx="31" cy="18" rx="3.4" ry="2" ${fill(t)}/>
    ${face(t)}${shine()}<path d="M17 11.6 Q 20 9.4 23 11.6 Q 21 13.6 20 12.6 Q 19 13.6 17 11.6 Z" fill="${PAL[t][2]}" opacity=".55"/>${eyes(19)}
    <ellipse cx="20" cy="27.6" rx="7.6" ry="4.8" fill="url(#st-muzzle)" stroke="${PAL[t][2]}" stroke-width=".9"/><ellipse cx="17" cy="27.6" rx="1.05" ry="1.5" fill="${INK}"/><ellipse cx="23" cy="27.6" rx="1.05" ry="1.5" fill="${INK}"/>`,
  Tiger: (t) => `
    <g class="z-ear-l"><circle cx="10" cy="11.6" r="4.6" ${fill(t)}/><circle cx="10" cy="11.6" r="2.2" fill="#fff" opacity=".7"/></g>
    <g class="z-ear-r"><circle cx="30" cy="11.6" r="4.6" ${fill(t)}/><circle cx="30" cy="11.6" r="2.2" fill="#fff" opacity=".7"/></g>
    ${face(t)}${shine()}
    <path d="M20 10.6 L20 14.6 M16 11.6 L17 15.2 M24 11.6 L23 15.2 M8.4 19.6 L12 20.8 M31.6 19.6 L28 20.8 M8.8 23.8 L12 24 M31.2 23.8 L28 24" stroke="${INK}" stroke-width="1.35" stroke-linecap="round" opacity=".75"/>
    ${eyes()}<ellipse cx="20" cy="27" rx="5.4" ry="3.6" fill="url(#st-muzzle)"/><path d="M18.5 25.1 L21.5 25.1 L20 26.8 Z" fill="#e3698d"/>${smile(27.6)}`,
  Rabbit: (t) => `
    <g class="z-ear-l"><ellipse cx="15" cy="6" rx="3.3" ry="9" ${fill(t)}/><ellipse cx="15" cy="6.4" rx="1.5" ry="6" fill="${CHEEK}" opacity=".85"/></g>
    <g class="z-ear-r"><ellipse cx="25" cy="6" rx="3.3" ry="9" ${fill(t)}/><ellipse cx="25" cy="6.4" rx="1.5" ry="6" fill="${CHEEK}" opacity=".85"/></g>
    ${face(t)}${shine()}${eyes()}${cheeks()}
    <ellipse cx="20" cy="26.8" rx="3.8" ry="2.6" fill="url(#st-muzzle)"/><path d="M18.7 24.9 L21.3 24.9 L20 26.4 Z" fill="#e3698d"/>
    <path d="M18.5 27.6 L18.5 29.6 Q 20 30.2 21.5 29.6 L21.5 27.6" fill="#fff" stroke="${PAL[t][2]}" stroke-width=".7"/><line x1="20" y1="27.6" x2="20" y2="29.8" stroke="${PAL[t][2]}" stroke-width=".5"/>`,
  Dragon: (t) => `
    <path d="M12 12.4 L7.6 2.6 M9 6.2 L5.6 5.2 M28 12.4 L32.4 2.6 M31 6.2 L34.4 5.2" stroke="#b9880f" stroke-width="1.9" stroke-linecap="round"/>
    ${face(t)}${shine(14, 15.5)}<path d="M13.6 10.6 L15.6 6.8 L17.8 10.2 L20 6 L22.2 10.2 L24.4 6.8 L26.4 10.6" fill="#62c287" stroke="#2c7a49" stroke-width=".9" stroke-linejoin="round"/>
    ${eyes(20)}<path d="M13.2 17.4 Q 15.4 16 17.6 17.4 M22.4 17.4 Q 24.6 16 26.8 17.4" stroke="${INK}" stroke-width=".9" fill="none" stroke-linecap="round"/>
    <ellipse cx="20" cy="27.2" rx="6.4" ry="4" fill="url(#st-muzzle)" stroke="${PAL[t][2]}" stroke-width=".8"/><circle cx="17.8" cy="26.4" r=".85" fill="${INK}"/><circle cx="22.2" cy="26.4" r=".85" fill="${INK}"/>
    <g class="z-whisk"><path d="M14 27.4 Q 6 26 3.6 31.6 M26 27.4 Q 34 26 36.4 31.6" fill="none" stroke="#b9880f" stroke-width="1.1" stroke-linecap="round"/></g>`,
  Snake: (t) => `
    <ellipse cx="20" cy="21.4" rx="13.2" ry="11.2" fill="url(#st-z-${t})" stroke="${PAL[t][2]}" stroke-width="1.15"/>${shine(13.5, 15.5)}
    <path d="M12.6 13.8 Q 20 9.6 27.4 13.8" fill="none" stroke="${PAL[t][2]}" stroke-width=".9" stroke-dasharray="1.6 2.2" stroke-linecap="round" opacity=".8"/>
    <path d="M15.5 15.6 l1.6 -1.4 l1.6 1.4 l1.3 -1.4 l1.3 1.4 l1.6 -1.4 l1.6 1.4" fill="none" stroke="${PAL[t][2]}" stroke-width=".7" opacity=".55"/>
    ${eyes(19.4, 5)}${cheeks(24.2, 9)}${smile(26)}
    <g class="z-tongue"><path d="M20 28.2 L20 34 L18.4 36.2 M20 34 L21.6 36.2" fill="none" stroke="#e24a76" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  Horse: (t) => `
    <path class="z-ear-l" d="M12 9.6 L12.6 1.8 L17.2 8 Z" ${fill(t)}/><path class="z-ear-r" d="M28 9.6 L27.4 1.8 L22.8 8 Z" ${fill(t)}/>
    <ellipse cx="20" cy="21.6" rx="10.2" ry="13" fill="url(#st-z-${t})" stroke="${PAL[t][2]}" stroke-width="1.15"/>${shine(15, 14)}
    <path d="M14.4 9.4 Q 17.2 3.4 20 8.8 Q 22.8 3.4 25.6 9.4 Q 23 13.6 20 11.4 Q 17 13.6 14.4 9.4 Z" fill="#8a6440" stroke="#5e4128" stroke-width=".6"/>
    ${eyes(18, 5)}<ellipse cx="20" cy="28.6" rx="7.2" ry="4.8" fill="url(#st-muzzle)" stroke="${PAL[t][2]}" stroke-width=".85"/><ellipse cx="17.4" cy="28.4" rx="1" ry="1.4" fill="${INK}"/><ellipse cx="22.6" cy="28.4" rx="1" ry="1.4" fill="${INK}"/>`,
  Goat: (t) => `
    <path d="M12.6 13 Q 3.6 10.6 5.6 4.2 Q 9.2 1.8 10.4 6 Q 9.4 9.2 13.4 10.2" fill="none" stroke="#a6946f" stroke-width="2.4" stroke-linecap="round"/><path d="M27.4 13 Q 36.4 10.6 34.4 4.2 Q 30.8 1.8 29.6 6 Q 30.6 9.2 26.6 10.2" fill="none" stroke="#a6946f" stroke-width="2.4" stroke-linecap="round"/>
    <g class="z-ear-l"><ellipse cx="8" cy="19" rx="3.6" ry="1.9" ${fill(t)} transform="rotate(20 8 19)"/></g><g class="z-ear-r"><ellipse cx="32" cy="19" rx="3.6" ry="1.9" ${fill(t)} transform="rotate(-20 32 19)"/></g>
    ${face(t)}${shine()}${eyes()}${cheeks()}<path d="M18.7 24.9 L21.3 24.9 L20 26.4 Z" fill="#b25478"/>${smile(27.2)}
    <path d="M16.8 32.4 Q 20 41 23.2 32.4 Z" fill="url(#st-muzzle)" stroke="${PAL[t][2]}" stroke-width=".8"/>`,
  Monkey: (t) => `
    <g class="z-ear-l"><circle cx="7" cy="22" r="4.6" ${fill(t)}/><circle cx="7" cy="22" r="2.4" fill="#f8e3c8"/></g>
    <g class="z-ear-r"><circle cx="33" cy="22" r="4.6" ${fill(t)}/><circle cx="33" cy="22" r="2.4" fill="#f8e3c8"/></g>
    ${face(t)}${shine(14, 13)}<path d="M20 15 Q 14 10.6 10.8 16.6 Q 8.8 23.8 12.8 28.2 Q 20 34.4 27.2 28.2 Q 31.2 23.8 29.2 16.6 Q 26 10.6 20 15 Z" fill="#fbead4" stroke="${PAL[t][2]}" stroke-width=".6" stroke-opacity=".5"/>
    ${eyes(20.6, 4)}<circle cx="19" cy="24.6" r=".75" fill="${INK}"/><circle cx="21" cy="24.6" r=".75" fill="${INK}"/>${cheeks(25.4, 7.4)}${smile(27.2)}`,
  Rooster: (t) => `
    <g class="z-comb"><path d="M13.8 11.4 Q 12.4 3.8 16.8 5.8 Q 17.8 0.8 21 4.8 Q 24 0.8 25.2 5.8 Q 28.6 4.6 26.4 11.4 Z" fill="#ec4b4b" stroke="#a82626" stroke-width=".8"/></g>
    ${face(t)}${shine()}${eyes(20)}${cheeks(24)}
    <path d="M16.8 24 L20 22.2 L23.2 24 L20 27.8 Z" fill="url(#st-gold)" stroke="#b9781a" stroke-width=".7" stroke-linejoin="round"/><line x1="16.8" y1="24" x2="23.2" y2="24" stroke="#b9781a" stroke-width=".5"/>
    <ellipse cx="20" cy="30.4" rx="2.1" ry="2.9" fill="#ec4b4b" stroke="#a82626" stroke-width=".6"/>`,
  Dog: (t) => `
    <g class="z-ear-l"><ellipse cx="8.4" cy="20" rx="4.2" ry="8.2" fill="#a97a50" stroke="#6e4a2b" stroke-width=".9" transform="rotate(18 8.4 20)"/></g>
    <g class="z-ear-r"><ellipse cx="31.6" cy="20" rx="4.2" ry="8.2" fill="#a97a50" stroke="#6e4a2b" stroke-width=".9" transform="rotate(-18 31.6 20)"/></g>
    ${face(t)}${shine()}<ellipse cx="25.4" cy="18" rx="4.2" ry="3.6" fill="#fff" opacity=".6"/>${eyes()}
    <ellipse cx="20" cy="26.6" rx="4.4" ry="3" fill="url(#st-muzzle)"/><ellipse cx="20" cy="25" rx="2.5" ry="1.8" fill="${INK}"/><circle cx="19.3" cy="24.5" r=".55" fill="#fff" opacity=".8"/>${smile(27.4)}
    <g class="z-tongue"><path d="M18.4 28.6 Q 20 34 21.6 28.6 Z" fill="#ef7aa0" stroke="#c2507a" stroke-width=".5"/></g>`,
  Pig: (t) => `
    <path class="z-ear-l" d="M10 14.4 L7.4 4.6 L16.2 10 Z" ${fill(t)}/><path class="z-ear-r" d="M30 14.4 L32.6 4.6 L23.8 10 Z" ${fill(t)}/>
    ${face(t)}${shine()}${eyes(19)}${cheeks(24.4)}
    <ellipse cx="20" cy="26" rx="5.4" ry="3.8" fill="#f9a9c7" stroke="${PAL[t][2]}" stroke-width="1"/><ellipse cx="18.2" cy="26" rx=".95" ry="1.4" fill="#a24a6e"/><ellipse cx="21.8" cy="26" rx=".95" ry="1.4" fill="#a24a6e"/>${smile(30.2)}`,
};
ZOD.Cat = (t) => ZOD.Rabbit(t); // the Vietnamese zodiac's Cat shares the Rabbit's place and face

/** A cartoon face for a zodiac animal, in its trine's colour. */
export function zodiacSvg(animal, cls = '') {
  const draw = ZOD[animal];
  if (!draw) return '';
  const t = TRINE[animal];
  return `<svg class="st-zod ${cls}" viewBox="0 0 40 40" role="img" aria-label="${animal}"><ellipse class="z-shadow" cx="20" cy="37.6" rx="9" ry="1.6" fill="${INK}" opacity=".12"/><g class="z-bob">${draw(t)}</g></svg>`;
}

// ---------------------------------------------------------------- scenes --
const HEART = 'M80 78 C 58 62, 52 44, 66 38 C 74 35, 80 42, 80 46 C 80 42, 86 35, 94 38 C 108 44, 102 62, 80 78 Z';
const heartAt = (cx, cy, s, col = 'url(#st-heart)', cls = '') => `<g class="${cls}"><path transform="translate(${cx} ${cy}) scale(${s}) translate(-80 -55)" d="${HEART}" fill="${col}"/></g>`;
const person = (x, col, { veil = false, hair = '#5a3a26' } = {}) => `
  <g class="a-step"><ellipse cx="${x}" cy="77" rx="9" ry="1.6" fill="${INK}" opacity=".1"/>
  <path d="M${x - 9.5} 76 Q ${x - 9.5} 53.5 ${x} 53.5 Q ${x + 9.5} 53.5 ${x + 9.5} 76 Z" fill="${col}" stroke="rgba(0,0,0,.18)" stroke-width=".8"/>
  <circle cx="${x}" cy="44" r="7.4" fill="#f4cfae" stroke="#d8a985" stroke-width=".7"/>
  <path d="M${x - 7.4} 43 Q ${x - 7} 35.6 ${x} 36 Q ${x + 7} 35.6 ${x + 7.4} 43 Q ${x + 3} 39 ${x - 7.4} 43 Z" fill="${hair}"/>
  ${veil ? `<path d="M${x - 7.6} 41 Q ${x} 32 ${x + 7.6} 41 L ${x + 12} 67 Q ${x} 61 ${x - 12} 67 Z" fill="#fff" opacity=".82" stroke="#e7dfe6" stroke-width=".6"/><circle cx="${x}" cy="35.6" r="1.6" fill="#ffd3e2"/>` : ''}
  <circle cx="${x - 2.6}" cy="44.6" r="1" fill="${INK}"/><circle cx="${x + 2.6}" cy="44.6" r="1" fill="${INK}"/><ellipse cx="${x - 4.6}" cy="47" rx="1.4" ry=".8" fill="${CHEEK}" opacity=".55"/><ellipse cx="${x + 4.6}" cy="47" rx="1.4" ry=".8" fill="${CHEEK}" opacity=".55"/>
  <path d="M${x - 1.6} 48 Q ${x} 49.4 ${x + 1.6} 48" fill="none" stroke="${INK}" stroke-width=".8" stroke-linecap="round"/></g>`;
const spark = (x, y, s, cls = '') => `<g transform="translate(${x} ${y}) scale(${s})"><path class="a-twinkle ${cls}" d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" fill="#f6c94a"/></g>`;
const halves = (id, a, b, cls) => `
  <defs><clipPath id="${id}l"><rect x="0" y="0" width="80" height="90"/></clipPath><clipPath id="${id}r"><rect x="80" y="0" width="80" height="90"/></clipPath></defs>
  <g class="${a}"><path d="${HEART}" transform="translate(0 4)" fill="${cls}" clip-path="url(#${id}l)"/></g>
  <g class="${b}"><path d="${HEART}" transform="translate(0 4)" fill="${cls}" clip-path="url(#${id}r)"/></g>`;
let clipN = 0;

const SCENES = {
  met: { tint: '#ec86b4', svg: () => `
    <line x1="14" y1="78" x2="146" y2="78" stroke="#c9ced6" stroke-width="1.4" stroke-linecap="round"/>
    <g class="a-walk-l">${person(64, '#2f8a7c')}</g><g class="a-walk-r">${person(96, '#c2487f', { hair: '#7a4a2a' })}</g>
    <g class="a-pop">${heartAt(80, 24, .3)}</g>` },
  dating: { tint: '#ec86b4', svg: () => `
    <g class="a-orbit"><g transform="translate(-20 0)">${heartAt(80, 50, .4, 'url(#st-heart)', 'a-beat')}</g><g transform="translate(20 0)">${heartAt(80, 50, .4, '#f7a9c6', 'a-beat')}</g></g>
    ${spark(40, 24, .7)}${spark(124, 66, .55, 'd2')}` },
  engaged: { tint: '#e0a33a', svg: () => `
    <g class="a-ring"><circle cx="80" cy="47" r="9" fill="none" stroke="url(#st-gold)" stroke-width="3.2"/><path d="M73.6 37.6 L80 29.6 L86.4 37.6 L80 43.6 Z" fill="#cdeeff" stroke="#7fb7d8" stroke-width="1"/><path d="M76.6 37.6 L80 32 L83.4 37.6" fill="none" stroke="#fff" stroke-width=".8"/></g>
    <rect x="61" y="58" width="38" height="21" rx="3.4" fill="#8a3155"/><rect x="61" y="56" width="38" height="5" rx="2" fill="#62213b"/><rect x="61" y="65" width="38" height="2" fill="#a8456d"/>
    <rect class="a-lid" x="61" y="47.6" width="38" height="9.4" rx="3.4" fill="#a33a63"/>
    ${spark(102, 30, .85)}${spark(56, 26, .65, 'd2')}${spark(110, 52, .5, 'd3')}` },
  married: { tint: '#287d71', svg: () => `
    <path d="M44 80 L44 40 Q 80 5 116 40 L116 80" fill="none" stroke="#e2b6cc" stroke-width="5.4" stroke-linecap="round"/>
    <path d="M44 80 L44 40 Q 80 5 116 40 L116 80" fill="none" stroke="#fff" stroke-width="1.8" stroke-dasharray="1.5 6" stroke-linecap="round"/>
    ${[[47, 50], [113, 50], [60, 24], [100, 24], [80, 18]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#f7a9c6"/><circle cx="${x + 2}" cy="${y + 1}" r="1.8" fill="#fff"/>`).join('')}
    <g class="a-bell"><line x1="72" y1="20" x2="72" y2="26" stroke="#9a6a17" stroke-width="1.4"/><path d="M65.6 36.4 Q 65.6 26 72 26 Q 78.4 26 78.4 36.4 Z" fill="url(#st-gold)" stroke="#b9881a" stroke-width=".6"/><circle cx="72" cy="37.4" r="1.7" fill="#9a6a17"/></g>
    <g class="a-bell b2"><line x1="88" y1="20" x2="88" y2="26" stroke="#9a6a17" stroke-width="1.4"/><path d="M81.6 36.4 Q 81.6 26 88 26 Q 94.4 26 94.4 36.4 Z" fill="url(#st-gold)" stroke="#b9881a" stroke-width=".6"/><circle cx="88" cy="37.4" r="1.7" fill="#9a6a17"/></g>
    ${person(70, '#2b2a34', { hair: '#3a2a20' })}${person(90, '#ffffff', { veil: true, hair: '#8a5a32' })}
    ${[[26, 0, '#ec86b4'], [50, .5, '#f4cb52'], [110, .9, '#6f9cf0'], [132, 1.4, '#5cb87a'], [86, 1.8, '#ec86b4'], [62, 2.2, '#f4cb52'], [140, 2.5, '#ec86b4']].map(([x, d, c]) => `<rect class="a-fall" x="${x}" y="-6" width="4" height="6" rx="1" fill="${c}" style="animation-delay:${d}s"/>`).join('')}` },
  child: { tint: '#6f9cf0', svg: () => `
    <g class="a-fly"><g transform="translate(66 18)"><ellipse cx="11" cy="7" rx="11" ry="5.4" fill="#fff" stroke="#9aa3ae" stroke-width=".9"/><path class="a-flap" d="M4 5 Q 11 -10 20 3 Z" fill="#eef1f5" stroke="#9aa3ae" stroke-width=".9"/><path d="M6 6 L0 8" stroke="#9aa3ae"/><circle cx="23" cy="3" r="3.4" fill="#fff" stroke="#9aa3ae" stroke-width=".9"/><circle cx="23.8" cy="2.4" r=".7" fill="${INK}"/><path d="M26 3 L35 5 L26 5.2 Z" fill="#f29a3a"/><path d="M13 12 L13 21" stroke="#f29a3a" stroke-width="1.2"/><path d="M8.6 19 Q 13 30 17.4 19 Z" fill="#ffd3e2" stroke="#d48aaa" stroke-width=".8"/><circle cx="13" cy="21.6" r="2" fill="#f4cfae"/></g></g>
    <g class="a-rock"><path d="M57 63 Q 80 89 103 63 Z" fill="#cf9b68" stroke="#9c6c3e" stroke-width=".9"/><path d="M57 63 Q 57 48 70 48 L 70 63 Z" fill="#b07f4f" stroke="#9c6c3e" stroke-width=".9"/>
      <circle cx="82" cy="59" r="6.2" fill="#f4cfae" stroke="#d8a985" stroke-width=".6"/><path d="M79.6 59 Q 80.4 58.2 81.2 59 M83 59 Q 83.8 58.2 84.6 59" fill="none" stroke="${INK}" stroke-width=".7" stroke-linecap="round"/><ellipse cx="82" cy="54.2" rx="5" ry="2.2" fill="#c9d9ff"/>
      <path d="M75 65 Q 84 57 97 63 Q 90 70 75 65 Z" fill="#c9d9ff" stroke="#93b2f3" stroke-width=".7"/>
      <path d="M59 82 Q 80 93 101 82" fill="none" stroke="#9c6c3e" stroke-width="3" stroke-linecap="round"/></g>
    <text class="a-zz" x="96" y="51" font-size="9" font-weight="800" fill="#6f9cf0" font-family="Open Sans, sans-serif">z</text><text class="a-zz d2" x="101" y="46" font-size="7" font-weight="800" fill="#6f9cf0" font-family="Open Sans, sans-serif">z</text>` },
  separated: { tint: '#8d95a1', svg: () => {
    const id = `st-c${++clipN}`;
    return `${halves(id, 'a-drift-l', 'a-drift-r', '#d97ba1')}<path class="a-crack" d="M80 48 L76 56 L84 63 L77 71 L80 82" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`;
  } },
  death: { tint: '#a39a8a', svg: () => `
    <ellipse cx="80" cy="80" rx="26" ry="3.4" fill="${INK}" opacity=".08"/>
    <circle class="a-halo" cx="80" cy="34" r="17" fill="#ffe7a6" opacity=".35"/>
    <rect x="72.5" y="44" width="15" height="34" rx="2.6" fill="#f7f1e6" stroke="#d8cdb8" stroke-width=".9"/><path d="M72.5 50 Q 76 53 78 49" fill="none" stroke="#e6dccb" stroke-width="1.4"/>
    <line x1="80" y1="44" x2="80" y2="39" stroke="#5a4a3a" stroke-width="1.1"/>
    <path class="a-flame" d="M80 22 Q 87 31 84.6 36.6 Q 82.6 40.4 80 40.4 Q 77.4 40.4 75.4 36.6 Q 73 31 80 22 Z" fill="url(#st-flame)"/>
    <path d="M64 78 Q 66 72 70 76 M96 78 Q 98 72 92 75" fill="none" stroke="#9cbf8e" stroke-width="1.4" stroke-linecap="round"/><circle cx="66" cy="72" r="2" fill="#f7c9d8"/><circle cx="94" cy="72.6" r="2" fill="#fbe3a0"/>` },
  reunited: { tint: '#ec86b4', svg: () => {
    const id = `st-c${++clipN}`;
    return `<circle class="a-glow" cx="80" cy="60" r="26" fill="#ffd3e2"/>${halves(id, 'a-join-l', 'a-join-r', 'url(#st-heart)')}${spark(112, 36, .7)}${spark(48, 40, .55, 'd2')}`;
  } },
  other: { tint: '#287d71', svg: () => `
    <circle cx="80" cy="48" r="20" fill="#e3f1ee"/>
    <g transform="translate(80 48)"><path class="a-spin-slow" d="M0 -16 L4 -4 L16 0 L4 4 L0 16 L-4 4 L-16 0 L-4 -4 Z" fill="url(#st-gold)" stroke="#b9881a" stroke-width=".8"/></g>
    ${spark(52, 24, .6)}${spark(110, 30, .7, 'd2')}${spark(106, 70, .5, 'd3')}` },
};
SCENES.child_born = SCENES.child;

/** The scene for a milestone card with no photo. `kind` is the mark's scene (see sceneKind). */
export function sceneSvg(kind) {
  const s = SCENES[kind] || SCENES.other;
  return `<svg class="st-scene" style="--st-tint:${s.tint}" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${s.svg()}</svg>`;
}

const MINI = {
  met: () => `${heartAt(20, 21, .34, 'url(#st-heart)', 'a-beat')}`,
  dating: () => `<g class="a-orbit-mini"><g transform="translate(-6 0)">${heartAt(20, 20, .2, 'url(#st-heart)')}</g><g transform="translate(6 0)">${heartAt(20, 20, .2, '#f7a9c6')}</g></g>`,
  engaged: () => `<circle cx="20" cy="24" r="8" fill="none" stroke="url(#st-gold)" stroke-width="3"/><path d="M14.6 15 L20 8 L25.4 15 L20 20 Z" fill="#cdeeff" stroke="#7fb7d8" stroke-width=".9"/>${spark(31, 9, .55)}`,
  married: () => `<g class="a-bell"><line x1="15" y1="6" x2="15" y2="11" stroke="#9a6a17" stroke-width="1.2"/><path d="M8.6 22 Q 8.6 11 15 11 Q 21.4 11 21.4 22 Z" fill="url(#st-gold)" stroke="#b9881a" stroke-width=".6"/><circle cx="15" cy="23" r="1.7" fill="#9a6a17"/></g><g class="a-bell b2"><line x1="25" y1="8" x2="25" y2="13" stroke="#9a6a17" stroke-width="1.2"/><path d="M18.6 24 Q 18.6 13 25 13 Q 31.4 13 31.4 24 Z" fill="url(#st-gold)" stroke="#b9881a" stroke-width=".6"/><circle cx="25" cy="25" r="1.7" fill="#9a6a17"/></g>`,
  child: () => `<g class="a-rock-mini"><path d="M7 20 Q 20 37 33 20 Z" fill="#cf9b68" stroke="#9c6c3e" stroke-width=".8"/><circle cx="21" cy="17.6" r="5" fill="#f4cfae" stroke="#d8a985" stroke-width=".6"/><path d="M14 22 Q 22 16 31 21 Q 25 26 14 22 Z" fill="#c9d9ff"/></g>`,
  separated: () => {
    const id = `st-c${++clipN}`;
    return `<defs><clipPath id="${id}l"><rect x="0" y="0" width="80" height="90"/></clipPath><clipPath id="${id}r"><rect x="80" y="0" width="80" height="90"/></clipPath></defs>
      <g transform="translate(20 20) scale(.36) translate(-80 -58)"><g class="a-drift-l"><path d="${HEART}" fill="#d97ba1" clip-path="url(#${id}l)"/></g><g class="a-drift-r"><path d="${HEART}" fill="#d97ba1" clip-path="url(#${id}r)"/></g></g>`;
  },
  death: () => `<circle class="a-halo" cx="20" cy="12" r="8" fill="#ffe7a6" opacity=".4"/><rect x="15.5" y="18" width="9" height="17" rx="1.8" fill="#f7f1e6" stroke="#d8cdb8" stroke-width=".8"/><path class="a-flame" d="M20 5 Q 24.4 10.6 23 14 Q 21.8 16.4 20 16.4 Q 18.2 16.4 17 14 Q 15.6 10.6 20 5 Z" fill="url(#st-flame)"/>`,
  reunited: () => `<circle class="a-glow" cx="20" cy="21" r="12" fill="#ffd3e2"/>${heartAt(20, 21, .32, 'url(#st-heart)', 'a-beat')}`,
  other: () => `<g transform="translate(20 20)"><path class="a-spin-slow" d="M0 -12 L3 -3 L12 0 L3 3 L0 12 L-3 3 L-12 0 L-3 -3 Z" fill="url(#st-gold)" stroke="#b9881a" stroke-width=".7"/></g>`,
};

/** A small moving icon for a mark (card corner over a photo, the short story lines). */
export function miniSvg(kind) {
  const draw = MINI[kind] || MINI.other;
  return `<svg class="st-mini" viewBox="0 0 40 40" aria-hidden="true">${draw()}</svg>`;
}

/**
 * Which scene a relationship mark gets. A separation in the same year one of
 * the two died is an ending by a death — the candle, never the broken heart
 * (her pick, "Two kinds").
 */
export function sceneKind(m) {
  if (m.kind === 'child') return 'child';
  if (m.kind === 'separated' && m.byDeath) return 'death';
  return SCENES[m.kind] ? m.kind : 'other';
}

/**
 * "Play once, loop on hover" (her pick): each card plays its scene once,
 * the first time it comes into view this visit, then rests; the mouse over
 * it plays it again (CSS). `seen` is the caller's own Set of mark ids, so a
 * redraw after an edit plays nothing. A hidden tab gets a timer way out.
 */
export function playOnArrival(cards, seen) {
  const calm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fresh = cards.filter((c) => c.dataset.stKey && !seen.has(c.dataset.stKey));
  fresh.forEach((c) => seen.add(c.dataset.stKey));
  if (calm || !fresh.length) return;
  const play = (c) => { c.classList.add('st-run'); setTimeout(() => c.classList.remove('st-run'), 4200); };
  if (typeof IntersectionObserver === 'undefined') { fresh.forEach(play); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); play(e.target); } });
  }, { threshold: 0.35 });
  fresh.forEach((c) => io.observe(c));
  setTimeout(() => io.disconnect(), 60000);
}
