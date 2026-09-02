// Per-person Contradictions page — every "this vs that" pair recorded
// against one person, face to face. Reached from the Subject page.
import { emptyState } from '../indicators.js';
import { renderPairs } from '../contradictions.js';

export async function render(root, ctx, personId) {
  const { store } = ctx;
  if (!personId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No person chosen.', why: 'Contradictions are kept per person — open someone\'s subject file first.', action: 'Go to Relations', onAction: () => ctx.navigate('#/relations') }));
    return;
  }
  const person = await store.getPerson(personId);
  if (!person) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'This person could not be found.', why: 'They may have been deleted.' }));
    return;
  }
  ctx.setTitle(`Contradictions — ${person.display_name}`);
  const pairs = await store.listContradictionsForPerson(person.id);

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:8px">
        <span class="section-label">${pairs.length} contradiction${pairs.length === 1 ? '' : 's'} on record</span>
        <a href="#/subject/${person.id}" class="btn btn-ghost btn-sm">← ${person.display_name}'s file</a>
      </div>
      <div id="contra-list" class="stack" style="gap:12px"></div>
    </div>
  `;
  renderPairs(root.querySelector('#contra-list'), ctx, pairs, { onDeleted: () => render(root, ctx, personId) });
}
