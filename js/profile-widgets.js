// The Profile page as widgets (her ask, 2026-09-15 synth22 batch): "the whole
// Profile page" becomes drag-to-arrange, on/off panels — the same ⚙ Arrange
// pattern as Book33's Day-page tile organiser (drag handle, name, on/off, a
// line showing exactly where a dragged row will land). One preference list,
// shared across every person — this is how SHE likes the Profile page laid
// out, not a per-person setting.

export const WIDGET_DEFS = [
  { id: 'life-line', label: 'Life line' },
  { id: 'family', label: 'Family' },
  { id: 'chart', label: 'Chart' },
  { id: 'profile-grid', label: 'Profile details' },
  { id: 'contradictions', label: 'Contradictions' },
  { id: 'addresses', label: 'Addresses' },
  { id: 'relations-list', label: 'Relations' },
  { id: 'questions', label: 'Open questions' },
  { id: 'evidence', label: 'Attached evidence' },
];
// matches what was actually on screen before widgets existed: life line +
// family visible, everything that used to live behind "Details ▸" starts off
const DEFAULT_ON = new Set(['life-line', 'family']);
const PREFS_KEY = 'c7-profile-widgets';

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export function loadWidgetPrefs() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '[]'); } catch { saved = []; }
  const byId = new Map(saved.filter((w) => w && w.id).map((w) => [w.id, w]));
  // her saved order first, then any widget this version of the app knows
  // about that her save predates — forward-compat, never silently dropped
  const knownIds = new Set(WIDGET_DEFS.map((d) => d.id));
  const order = saved.map((w) => w.id).filter((id) => knownIds.has(id));
  for (const d of WIDGET_DEFS) if (!order.includes(d.id)) order.push(d.id);
  return order.map((id) => ({ id, on: byId.has(id) ? !!byId.get(id).on : DEFAULT_ON.has(id) }));
}

export function saveWidgetPrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs.map((w) => ({ id: w.id, on: !!w.on }))));
}

/**
 * The ⚙ Arrange drawer: drag handle + name + on/off per row, a brass
 * insertion line while dragging shows exactly where the row will land (her
 * "when I drag I want to see where the tile is going" — carried over from
 * the Book33 organiser this is modelled on). `onChange()` re-renders the
 * Profile page after every toggle or reorder; prefs are saved as she goes,
 * not on a final "done" button — same as every other drawer in this app.
 */
export function renderArrangeDrawer(body, prefs, onChange) {
  body.innerHTML = `<h3 class="title" style="margin-bottom:4px">Arrange the Profile page</h3>
    <p style="color:var(--text-3);font-size:12px;margin-bottom:12px">Drag ⠿ to reorder. Switch a panel off to tuck it away.</p>
    <div class="arrange-list" id="arr-list"></div>`;
  const list = body.querySelector('#arr-list');
  const labelOf = (id) => WIDGET_DEFS.find((d) => d.id === id)?.label || id;

  const draw = () => {
    list.innerHTML = prefs.map((w) => `
      <div class="arrange-row" draggable="true" data-id="${w.id}">
        <span class="arrange-handle" title="Drag to reorder">⠿</span>
        <span class="arrange-label">${esc(labelOf(w.id))}</span>
        <label class="row" style="gap:6px;align-items:center;font-size:12px;color:var(--text-3)"><input type="checkbox" data-toggle="${w.id}" ${w.on ? 'checked' : ''}> on</label>
      </div>`).join('');
  };
  draw();

  list.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-toggle]');
    if (!cb) return;
    const w = prefs.find((x) => x.id === cb.dataset.toggle);
    if (w) w.on = cb.checked;
    saveWidgetPrefs(prefs);
    onChange();
  });

  // ---- drag to reorder, brass insertion line marks the drop point ----
  let dragId = null;
  const line = document.createElement('div');
  line.className = 'arrange-insert-line';
  list.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.arrange-row');
    if (!row) return;
    dragId = row.dataset.id;
    row.classList.add('dragging');
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); } catch { /* Safari needs the try */ }
  });
  list.addEventListener('dragend', () => {
    list.querySelector('.arrange-row.dragging')?.classList.remove('dragging');
    line.remove();
    dragId = null;
  });
  list.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const row = e.target.closest('.arrange-row');
    if (!row || row.dataset.id === dragId) return;
    const r = row.getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    list.insertBefore(line, before ? row : row.nextSibling);
  });
  list.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const targetId = line.nextElementSibling?.dataset.id || null;
    line.remove();
    const fromIdx = prefs.findIndex((w) => w.id === dragId);
    if (fromIdx === -1) return;
    const [moved] = prefs.splice(fromIdx, 1);
    const toIdx = targetId ? prefs.findIndex((w) => w.id === targetId) : prefs.length;
    prefs.splice(toIdx, 0, moved);
    saveWidgetPrefs(prefs);
    draw();
    onChange();
  });
}
