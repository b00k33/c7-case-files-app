// My Shelf — her personal skincare/makeup/perfume inventory, grouped by
// brand zodiac (her ask, 2026-10-01: "i want to add skincare brands and
// beauty brands so i can organise my inventory of products so i can group
// them in numerology/astrology" + "makeup perfume etc"). Each brand is an
// ordinary Business/corporation case (company.js) — same founding-facts
// machinery already built for Songmont/Anytime Fitness, Wikidata-first then
// manual. Each product she owns is a row on that brand's own Products tab
// (kind='shelf_item', see schema.sql). This page is the one cross-case view
// that pulls every brand's products together — see store.listBeautyProducts.
//
// Grouping: by the 12-animal zodiac, not the 5-element Wu Xing (her pick,
// 2026-10-01, over a mock that defaulted to element). Computed from
// chinese.js's plain animalIndex(year) — a calendar-year lookup, not
// signFor()'s lunar-new-year-boundary-exact version used for a person's
// birth date. That's deliberate, not an oversight: almost no brand she'll
// add has a known day of founding (Songmont: year only; Anytime Fitness:
// year only), so the one thing actually computable is the plain year-cycle
// animal — signFor() would refuse every single brand. A brand founded in
// January or early February, right at the lunar-new-year cusp, could in
// principle land a calendar year off from the true lunar sign; this page
// doesn't resolve that, same honesty-over-guessing spirit as the rest of
// the app, just not worth the same rigor here as for a person's birth chart.
//
// Colour: reuses indicators.js's own animal-trine chip (animalChipHtml) —
// the exact pill already used everywhere else an animal is shown (the
// subject header, the life-path grid) — rather than inventing a new look.
import { emptyState, animalChipHtml, animalLabel, zodiacColor } from '../indicators.js';
import { animalIndex, ANIMALS } from '../chinese.js';

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const GROUP_KEY = 'c7-shelf-groupby'; // 'category' | 'zodiac' — remembered across visits, same pattern as fashion.js's FILTER_KEY
const CATEGORIES = ['Skincare', 'Makeup', 'Perfume', 'Other'];
const CATEGORY_CHIP = { Skincare: 'green', Makeup: 'red', Perfume: 'violet', Other: 'teal' }; // the app's own existing semantic chip colours

/** The one year a brand's own founding facts give us, at whatever precision they were saved at — see company.js's parseDateInput. */
function yearOf(p) {
  if (p.founding_year_min) return p.founding_year_min;
  if (p.founding_date) return parseInt(String(p.founding_date).slice(0, 4), 10) || null;
  return null;
}

export async function render(root, ctx) {
  const { store } = ctx;
  const rows = await store.listBeautyProducts();
  const products = rows.map((p) => {
    const year = yearOf(p);
    return { ...p, year, animal: year ? ANIMALS[animalIndex(year)] : null, category: CATEGORIES.includes(p.category) ? p.category : 'Other' };
  });

  let groupBy = localStorage.getItem(GROUP_KEY) || 'category';
  if (groupBy !== 'category' && groupBy !== 'zodiac') groupBy = 'category';

  const brandCount = new Set(products.map((p) => p.case_id)).size;
  root.innerHTML = `
    <div class="shelf-page">
      <div class="shelf-topbar">
        <div>
          <p class="shelf-eyebrow">The Vanity</p>
          <h1 class="shelf-h1">My Shelf</h1>
          <p class="shelf-stat">${products.length} product${products.length === 1 ? '' : 's'} &middot; ${brandCount} brand${brandCount === 1 ? '' : 's'}</p>
        </div>
        <div class="shelf-segctrl" id="shelf-segctrl" role="group" aria-label="Group products by">
          <span class="shelf-seg-thumb" id="shelf-seg-thumb"></span>
          <button type="button" class="shelf-seg-btn" data-g="category">By category</button>
          <button type="button" class="shelf-seg-btn" data-g="zodiac">By zodiac</button>
        </div>
      </div>
      <div id="shelf-sections"></div>
    </div>
  `;

  const segctrl = root.querySelector('#shelf-segctrl');
  const thumb = root.querySelector('#shelf-seg-thumb');
  segctrl.querySelectorAll('.shelf-seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.g === groupBy) return;
      groupBy = btn.dataset.g;
      localStorage.setItem(GROUP_KEY, groupBy);
      paintToggle();
      renderSections();
    });
  });
  function paintToggle() {
    segctrl.querySelectorAll('.shelf-seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.g === groupBy));
    thumb.style.transform = `translateX(${groupBy === 'zodiac' ? '100%' : '0%'})`;
  }

  function renderSections() {
    const sectionsEl = root.querySelector('#shelf-sections');
    if (!products.length) {
      sectionsEl.innerHTML = '';
      sectionsEl.appendChild(emptyState({
        missing: 'Nothing on your shelf yet.',
        why: 'Open a brand’s Business case (or add one from Cases) and add what you own on its Products tab — it shows up here, grouped by that brand’s own zodiac.',
        action: 'Go to Cases', onAction: () => ctx.navigate('#/cases'),
      }));
      return;
    }

    const order = groupBy === 'zodiac' ? ANIMALS : CATEGORIES;
    const keyOf = (p) => (groupBy === 'zodiac' ? p.animal : p.category);
    const byKey = {};
    for (const p of products) { const k = keyOf(p); (byKey[k] || (byKey[k] = [])).push(p); }
    const unknown = groupBy === 'zodiac' ? (byKey[null] || []) : [];
    const keys = order.filter((k) => byKey[k] && byKey[k].length);

    const sectionHtml = (label, color, items) => `
      <section class="shelf-group">
        <div class="shelf-group-header">
          <span class="shelf-group-dot" style="--gc:${color}"></span>
          <h2>${esc(label)}</h2>
          <span class="shelf-group-count">${items.length} item${items.length === 1 ? '' : 's'}</span>
        </div>
        <div class="shelf-grid">
          ${items.map((p, i) => `
            <article class="shelf-card card" data-case="${esc(p.case_id)}" style="animation-delay:${(i * 0.05).toFixed(2)}s">
              <div class="shelf-swatch cat-${CATEGORY_CHIP[p.category]}"><span class="ic">${esc(p.category[0])}</span></div>
              <div class="shelf-brand">${esc(p.brand)}</div>
              <h3 class="shelf-pname">${esc(p.name)}</h3>
              ${p.notes ? `<p class="shelf-note">${esc(p.notes)}</p>` : ''}
              <div class="shelf-meta-row">
                <span class="chip ${CATEGORY_CHIP[p.category]}">${esc(p.category)}</span>
                ${p.animal ? animalChipHtml(p.animal) + `<span class="chip">${p.year}</span>` : '<span class="chip shelf-zbadge-unknown">zodiac unknown</span>'}
              </div>
            </article>`).join('')}
        </div>
      </section>`;

    const groupLabel = (k) => (groupBy === 'zodiac' ? animalLabel(k) : k);
    const groupColor = (k) => (groupBy === 'zodiac' ? (zodiacColor(k) || 'var(--text-3)') : `var(--${CATEGORY_CHIP[k]})`);

    sectionsEl.innerHTML = keys.map((k) => sectionHtml(groupLabel(k), groupColor(k), byKey[k])).join('')
      + (unknown.length ? sectionHtml('Zodiac not set yet', 'var(--text-3)', unknown) : '');

    sectionsEl.querySelectorAll('.shelf-card').forEach((card) => {
      card.addEventListener('click', () => { ctx.setCaseId(card.dataset.case).then(() => ctx.navigate('#/company')); });
    });
  }

  paintToggle();
  renderSections();
}
