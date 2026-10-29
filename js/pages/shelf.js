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
import { countUp } from '../ui.js';
import { zodiacSvg } from '../story-art.js';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let shelfSeen = false; // the header counts up and shines once a session
let freshProduct = null; // the product just added here, glows once on the next draw
let lastBrand = null;    // the brand chip she used last stays picked

// lively (her 2026-10-25 "make the my shelf page more lively"): each card's swatch is a little
// drawing of its category, and the hovered one acts it out (the jar lid lifts, the lipstick
// winds up, the perfume puffs a mist, the star turns). currentColor = the category colour.
const SWATCH_ART = {
  Skincare: '<rect class="s-lid" x="12" y="9" width="16" height="6" rx="2" fill="currentColor"/><rect x="10" y="15" width="20" height="16" rx="4" fill="currentColor" opacity=".55"/><rect x="14" y="21" width="12" height="4" rx="1.5" fill="#fff" opacity=".7"/>',
  Makeup: '<g class="s-bullet"><path d="M17 15 L17 9 Q 20 4 23 7 L23 15 Z" fill="currentColor"/></g><rect x="15" y="14" width="10" height="5" rx="1" fill="currentColor" opacity=".75"/><rect x="14" y="19" width="12" height="13" rx="2" fill="currentColor" opacity=".45"/>',
  Perfume: '<g class="s-mist"><circle cx="29" cy="9" r="1.4" fill="currentColor"/><circle cx="32" cy="12" r="1.1" fill="currentColor"/><circle cx="31" cy="6.5" r=".9" fill="currentColor"/></g><rect x="18" y="8" width="5" height="4" rx="1" fill="currentColor"/><rect x="19" y="12" width="3" height="3" fill="currentColor" opacity=".8"/><rect x="12" y="15" width="17" height="17" rx="5" fill="currentColor" opacity=".55"/><ellipse cx="17" cy="21" rx="2" ry="3.5" fill="#fff" opacity=".45"/>',
  Other: '<g class="s-star"><path d="M20 6 L23 17 L34 20 L23 23 L20 34 L17 23 L6 20 L17 17 Z" fill="currentColor"/></g>',
};

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
          <p class="shelf-stat"><span data-count="${products.length}">${products.length}</span> product${products.length === 1 ? '' : 's'} &middot; <span data-count="${brandCount}">${brandCount}</span> brand${brandCount === 1 ? '' : 's'}</p>
        </div>
        <div class="shelf-segctrl" id="shelf-segctrl" role="group" aria-label="Group products by">
          <span class="shelf-seg-thumb" id="shelf-seg-thumb"></span>
          <button type="button" class="shelf-seg-btn" data-g="category">By category</button>
          <button type="button" class="shelf-seg-btn" data-g="zodiac">By zodiac</button>
        </div>
      </div>
      <div class="card shelf-add" id="shelf-add"></div>
      <div id="shelf-sections"></div>
    </div>
  `;
  paintAdd();

  // "+ Product" right here (her pick, 2026-10-29: My Shelf had never been used,
  // because a product could only be added from inside its brand's case): tap
  // a brand chip, type the name, tap a category chip, Add.
  async function paintAdd() {
    const box = root.querySelector('#shelf-add');
    const brands = (await store.listCases()).filter((c) => c.kind === 'company').sort((a, b) => a.name.localeCompare(b.name));
    if (!brands.some((b) => b.id === lastBrand)) lastBrand = brands[0]?.id || null;
    let cat = 'Skincare';
    box.innerHTML = `
      <div class="shelf-add-title">+ Product</div>
      <div class="shelf-add-row" id="sa-brands">
        ${brands.map((b) => `<button type="button" class="chip sa-brand${b.id === lastBrand ? ' on' : ''}" data-id="${esc(b.id)}">${esc(b.name)}</button>`).join('')}
        <button type="button" class="chip sa-newbrand">+ brand</button>
      </div>
      <div class="shelf-add-row sa-brandform" hidden><input class="input" id="sa-brandname" placeholder="Brand name" autocomplete="off"><button type="button" class="btn btn-ghost btn-sm" id="sa-brandsave">Add brand</button></div>
      <input class="input" id="sa-name" placeholder="Product name" autocomplete="off">
      <div class="shelf-add-row" id="sa-cats">
        ${CATEGORIES.map((c) => `<button type="button" class="chip sa-cat ${CATEGORY_CHIP[c]}${c === cat ? ' on' : ''}" data-c="${c}">${c}</button>`).join('')}
        <button type="button" class="btn btn-primary btn-sm" id="sa-go">Add</button>
        <span class="shelf-stat" id="sa-msg"></span>
      </div>`;
    const $ = (s) => box.querySelector(s);
    box.querySelectorAll('.sa-brand').forEach((b) => b.addEventListener('click', () => {
      lastBrand = b.dataset.id;
      box.querySelectorAll('.sa-brand').forEach((x) => x.classList.toggle('on', x === b));
    }));
    box.querySelectorAll('.sa-cat').forEach((b) => b.addEventListener('click', () => {
      cat = b.dataset.c;
      box.querySelectorAll('.sa-cat').forEach((x) => x.classList.toggle('on', x === b));
    }));
    $('.sa-newbrand').addEventListener('click', () => { const f = $('.sa-brandform'); f.hidden = !f.hidden; if (!f.hidden) $('#sa-brandname').focus(); });
    const addBrand = async () => {
      const name = $('#sa-brandname').value.trim();
      if (!name) { $('#sa-brandname').focus(); return; }
      const same = brands.find((b) => b.name.trim().toLowerCase() === name.toLowerCase());
      lastBrand = same ? same.id : (await store.createCase({ name, kind: 'company' })).id;
      await paintAdd();
      root.querySelector('#sa-name').focus();
    };
    $('#sa-brandsave').addEventListener('click', addBrand);
    $('#sa-brandname').addEventListener('keydown', (e) => { if (e.key === 'Enter') addBrand(); });
    const add = async () => {
      const name = $('#sa-name').value.trim();
      if (!lastBrand) { $('#sa-msg').textContent = 'Add a brand first'; return; }
      if (!name) { $('#sa-msg').textContent = 'Type the product name'; $('#sa-name').focus(); return; }
      freshProduct = await store.createEvent({ case_id: lastBrand, kind: 'shelf_item', title: name, place: cat });
      render(root, ctx);
    };
    $('#sa-go').addEventListener('click', add);
    $('#sa-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  }

  const segctrl = root.querySelector('#shelf-segctrl');
  const thumb = root.querySelector('#shelf-seg-thumb');
  segctrl.querySelectorAll('.shelf-seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.g === groupBy) return;
      groupBy = btn.dataset.g;
      localStorage.setItem(GROUP_KEY, groupBy);
      paintToggle();
      renderSections(true);
    });
  });
  function paintToggle() {
    segctrl.querySelectorAll('.shelf-seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.g === groupBy));
    thumb.style.transform = `translateX(${groupBy === 'zodiac' ? '100%' : '0%'})`;
  }

  function renderSections(swap = false) {
    const sectionsEl = root.querySelector('#shelf-sections');
    // a switch between By category / By zodiac rearranges the shelf: every card glides from
    // where it was to its new place (FLIP), instead of the whole shelf being swapped
    const before = new Map();
    if (swap && !calm()) sectionsEl.querySelectorAll('.shelf-card').forEach((c) => before.set(c.dataset.id, c.getBoundingClientRect()));
    if (!products.length) {
      sectionsEl.innerHTML = '';
      sectionsEl.appendChild(emptyState({
        missing: 'Nothing on your shelf yet.',
        why: 'Add what you own with + Product above. It shows up here, grouped by category or by its brand’s zodiac.',
      }));
      return;
    }

    const order = groupBy === 'zodiac' ? ANIMALS : CATEGORIES;
    const keyOf = (p) => (groupBy === 'zodiac' ? p.animal : p.category);
    const byKey = {};
    for (const p of products) { const k = keyOf(p); (byKey[k] || (byKey[k] = [])).push(p); }
    const unknown = groupBy === 'zodiac' ? (byKey[null] || []) : [];
    const keys = order.filter((k) => byKey[k] && byKey[k].length);

    const sectionHtml = (label, color, items, face = '') => `
      <section class="shelf-group">
        <div class="shelf-group-header">
          ${face ? `<span class="shelf-group-face" aria-hidden="true">${face}</span>` : `<span class="shelf-group-dot" style="--gc:${color}"></span>`}
          <h2>${esc(label)}</h2>
          <span class="shelf-group-count">${items.length} item${items.length === 1 ? '' : 's'}</span>
        </div>
        <div class="shelf-grid">
          ${items.map((p, i) => `
            <article class="shelf-card card${p.id === freshProduct ? ' fresh' : ''}" data-case="${esc(p.case_id)}" data-id="${esc(p.id)}" style="animation-delay:${(i * 0.05).toFixed(2)}s">
              <div class="shelf-swatch cat-${CATEGORY_CHIP[p.category]}"><svg class="shelf-art" viewBox="0 0 40 40" aria-hidden="true">${SWATCH_ART[p.category]}</svg></div>
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

    sectionsEl.innerHTML = keys.map((k) => sectionHtml(groupLabel(k), groupColor(k), byKey[k], groupBy === 'zodiac' ? zodiacSvg(k, 'shelf-gzod') : '')).join('')
      + (unknown.length ? sectionHtml('Zodiac not set yet', 'var(--text-3)', unknown) : '');

    sectionsEl.querySelectorAll('.shelf-card').forEach((card) => {
      card.addEventListener('click', () => { ctx.setCaseId(card.dataset.case).then(() => ctx.navigate('#/company')); });
    });

    if (before.size) {
      sectionsEl.classList.add('shelf-swap'); // no rise-in while the cards glide
      const moved = [];
      sectionsEl.querySelectorAll('.shelf-card').forEach((c) => {
        const was = before.get(c.dataset.id);
        if (!was) return;
        const now = c.getBoundingClientRect();
        c.classList.add('flip');
        c.style.transform = `translate(${was.left - now.left}px, ${was.top - now.top}px)`;
        moved.push(c);
      });
      void sectionsEl.offsetWidth; // lay out the start positions before gliding
      moved.forEach((c, i) => {
        c.style.transition = `transform .55s cubic-bezier(.2,.8,.2,1) ${Math.min(i, 20) * 18}ms`;
        c.style.transform = '';
      });
      setTimeout(() => {
        moved.forEach((c) => { c.classList.remove('flip'); c.style.transition = ''; });
        sectionsEl.classList.remove('shelf-swap');
      }, 1000);
    }
  }

  paintToggle();
  renderSections();
  freshProduct = null;
  if (!shelfSeen) {
    shelfSeen = true;
    const top = root.querySelector('.shelf-topbar');
    top.classList.add('shelf-shine');
    countUp(top);
    setTimeout(() => top.classList.remove('shelf-shine'), 1800);
  }
}
