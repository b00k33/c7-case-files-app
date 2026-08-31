import { barRow, emptyState } from '../indicators.js';

const EVIDENCE_TYPES = ['screenshot', 'photo', 'clipping', 'document', 'note', 'video', 'audio'];

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export async function render(root, ctx) {
  const { store } = ctx;
  const cases = await store.listCases();

  if (!cases.length) {
    root.innerHTML = '';
    root.appendChild(emptyState({
      missing: 'No case files yet.',
      why: 'A case is the container for everyone and everything you attach to this research — people, evidence, relations.',
      action: '+ New case file',
      onAction: async () => {
        const name = prompt('Name this case file:');
        if (!name) return;
        const kase = await store.createCase({ name, kind: 'research' });
        await ctx.setCaseId(kase.id);
        ctx.navigate('#/dashboard');
        render(root, ctx);
      },
    }));
    return;
  }

  if (!ctx.caseId || !cases.find((c) => c.id === ctx.caseId)) {
    await ctx.setCaseId(cases[0].id);
  }
  const caseId = ctx.caseId;
  const kase = cases.find((c) => c.id === caseId);

  const [people, evidence, claims, questions, changes] = await Promise.all([
    store.listPeople(caseId),
    store.listEvidence(caseId),
    store.listClaims(caseId, 'drafted'),
    store.listQuestions(caseId),
    store.recentChanges(15),
  ]);

  const openQuestions = questions.filter((q) => !q.resolved);
  const disputed = evidence.filter((e) => e.verification === 'disputed' || e.verification === 'dead_link');

  const byType = {};
  for (const t of EVIDENCE_TYPES) byType[t] = 0;
  for (const e of evidence) byType[e.type] = (byType[e.type] || 0) + 1;
  const maxType = Math.max(1, ...Object.values(byType));

  root.innerHTML = `
    <div class="stack">
      <div class="search-box">
        <span class="ic">⌕</span>
        <input type="search" id="dash-search" placeholder="Search this case — people, evidence…">
      </div>
      <div id="dash-search-results"></div>

      <div class="row wrap" style="gap:16px">
        <div class="stat-tile" style="flex:1;min-width:120px"><div class="n">${people.length}</div><div class="l">People</div></div>
        <div class="stat-tile" style="flex:1;min-width:120px"><div class="n">${evidence.length}</div><div class="l">Evidence</div></div>
        <div class="stat-tile" style="flex:1;min-width:120px"><div class="n">${claims.length}</div><div class="l">Drafted, needs review</div></div>
        <div class="stat-tile" style="flex:1;min-width:120px"><div class="n">${openQuestions.length}</div><div class="l">Open questions</div></div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="row between">
            <div class="panel-title">Case files</div>
            <button class="btn btn-ghost btn-sm" id="new-case-btn">+ New</button>
          </div>
          <div id="case-list" class="stack" style="gap:2px"></div>
        </div>

        <div class="panel">
          <div class="panel-title">Evidence by type</div>
          <div id="evidence-bars"></div>
        </div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">Needs attention</div>
          <div id="attention-list" class="stack" style="gap:2px"></div>
        </div>
        <div class="panel">
          <div class="panel-title">Recent activity</div>
          <div id="activity-list" class="stack" style="gap:2px"></div>
        </div>
      </div>
    </div>
  `;

  // case list
  const caseListEl = root.querySelector('#case-list');
  for (const c of cases) {
    const row = document.createElement('div');
    row.className = 'list-row';
    if (c.id === caseId) row.style.background = 'var(--ink-2)';
    row.innerHTML = `<div class="main"><div class="title">${c.name}${c.id === caseId ? ' <span class="chip brass">current</span>' : ''}</div><div class="sub mono">${c.kind}${c.era_start ? ` · ${c.era_start}–${c.era_end || '…'}` : ''}</div></div>`;
    row.addEventListener('click', async () => {
      await ctx.setCaseId(c.id);
      render(root, ctx);
    });
    caseListEl.appendChild(row);
  }
  root.querySelector('#new-case-btn').addEventListener('click', async () => {
    const name = prompt('Name this case file:');
    if (!name) return;
    const kase2 = await store.createCase({ name, kind: 'research' });
    await ctx.setCaseId(kase2.id);
    render(root, ctx);
  });

  // evidence bars
  const barsEl = root.querySelector('#evidence-bars');
  if (!evidence.length) {
    barsEl.appendChild(emptyState({
      missing: 'No evidence attached to this case yet.',
      why: 'Nothing has been added on the Evidence page.',
      action: 'Go to Evidence',
      onAction: () => ctx.navigate('#/evidence'),
    }));
  } else {
    for (const t of EVIDENCE_TYPES) {
      if (!byType[t]) continue;
      barsEl.appendChild(barRow({ label: t, value: byType[t], max: maxType, colorVar: 'var(--teal)' }));
    }
  }

  // needs attention
  const attnEl = root.querySelector('#attention-list');
  const attnItems = [];
  if (claims.length) attnItems.push({ label: `${claims.length} drafted claim${claims.length === 1 ? '' : 's'} awaiting review`, go: '#/review' });
  if (openQuestions.length) attnItems.push({ label: `${openQuestions.length} open question${openQuestions.length === 1 ? '' : 's'}`, go: '#/subject' });
  if (disputed.length) attnItems.push({ label: `${disputed.length} disputed or dead evidence item${disputed.length === 1 ? '' : 's'}`, go: '#/evidence' });
  if (!attnItems.length) {
    attnEl.appendChild(emptyState({ missing: 'Nothing needs attention.', why: 'No drafted claims, open questions, or disputed evidence right now.' }));
  } else {
    for (const item of attnItems) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title">${item.label}</div></div><span class="chip">→</span>`;
      row.addEventListener('click', () => ctx.navigate(item.go));
      attnEl.appendChild(row);
    }
  }

  // recent activity
  const actEl = root.querySelector('#activity-list');
  if (!changes.length) {
    actEl.appendChild(emptyState({ missing: 'No activity yet.', why: 'Every insert, edit and delete will show up here.' }));
  } else {
    for (const ch of changes) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.style.cursor = 'default';
      row.innerHTML = `<div class="main"><div class="title mono" style="font-size:11px">${ch.op} · ${ch.entity}</div></div><div class="sub mono">${timeAgo(ch.at)}</div>`;
      actEl.appendChild(row);
    }
  }

  // search
  const searchInput = root.querySelector('#dash-search');
  const resultsEl = root.querySelector('#dash-search-results');
  searchInput.addEventListener('input', async () => {
    const q = searchInput.value.trim();
    if (!q) { resultsEl.innerHTML = ''; return; }
    const results = await store.searchCase(caseId, q);
    resultsEl.innerHTML = '';
    if (!results.length) {
      resultsEl.appendChild(emptyState({ missing: `No matches for "${q}".`, why: 'Search looks at people and evidence titles in this case.' }));
      return;
    }
    const panel = document.createElement('div');
    panel.className = 'panel';
    for (const r of results) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title">${r.label}</div><div class="sub">${r.type}</div></div>`;
      row.addEventListener('click', () => ctx.navigate(r.type === 'person' ? `#/subject/${r.id}` : `#/evidence`));
      panel.appendChild(row);
    }
    resultsEl.appendChild(panel);
  });
}
