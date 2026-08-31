import { emptyState } from '../indicators.js';

function fmtT(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export async function render(root, ctx, evidenceId) {
  const { store } = ctx;

  if (!evidenceId) {
    const items = ctx.caseId ? (await store.listEvidence(ctx.caseId)).filter((e) => e.type === 'video') : [];
    root.innerHTML = '<div class="panel"><div class="panel-title">Pick a video</div><div id="pick" class="stack" style="gap:2px"></div></div>';
    const pick = root.querySelector('#pick');
    if (!items.length) pick.appendChild(emptyState({ missing: 'No video evidence in this case.', why: 'Add one from the Evidence page.', action: 'Go to Evidence', onAction: () => ctx.navigate('#/evidence') }));
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title">${it.title}</div></div>`;
      row.addEventListener('click', () => ctx.navigate(`#/video/${it.id}`));
      pick.appendChild(row);
    }
    return;
  }

  const item = await store.getEvidence(evidenceId);
  if (!item) { root.innerHTML = ''; root.appendChild(emptyState({ missing: 'Video not found.', why: 'It may have been deleted.' })); return; }
  ctx.setTitle(item.title);
  const moments = await store.listVideoMoments(item.id);

  root.innerHTML = `
    <div class="video-layout">
      <div class="stack">
        <div class="video-frame" id="video-frame"><span>Loading…</span></div>
        <div class="panel">
          <div class="panel-title">Citation preview</div>
          <textarea id="citation" readonly style="font-family:var(--font-mono);font-size:11px;min-height:70px"></textarea>
          <button class="btn btn-sm" id="copy-citation" style="margin-top:8px">Copy citation</button>
        </div>
      </div>
      <div class="stack">
        <div class="panel">
          <div class="panel-title">Source</div>
          <div class="mono" style="font-size:12px">${item.source_name || 'no source recorded'} ${item.source_kind ? `· ${item.source_kind}` : ''}</div>
          ${item.source_kind === 'dramatisation' ? '<div class="chip red" style="margin-top:6px">dramatisation — cannot raise confidence</div>' : ''}
        </div>
        <div class="panel">
          <div class="row between"><div class="panel-title" style="margin:0">Marked moments</div><span class="chip">${moments.filter((m) => m.conflicts).length} conflict${moments.filter((m) => m.conflicts).length === 1 ? '' : 's'}</span></div>
          <div id="moments-list" class="stack" style="gap:4px"></div>
          <div class="field" style="margin-top:12px"><label>Label</label><input type="text" id="m-label"></div>
          <div class="field"><label>Note</label><textarea id="m-note"></textarea></div>
          <div class="field"><label>Quote</label><input type="text" id="m-quote"></div>
          <label style="font-size:11px;color:var(--text-2);display:flex;gap:6px;align-items:center;margin-bottom:8px"><input type="checkbox" id="m-conflict"> conflicts with another source</label>
          <button class="btn btn-primary btn-sm" id="add-moment">+ Mark this moment</button>
        </div>
      </div>
    </div>
  `;

  const frame = root.querySelector('#video-frame');
  let videoEl = null;
  if (item.file_path) {
    const url = await store.evidenceAssetUrl(item.file_path);
    frame.innerHTML = `<video id="v" controls style="width:100%;height:100%;border-radius:8px" src="${url}"></video>`;
    videoEl = frame.querySelector('#v');
  } else {
    frame.innerHTML = `<span style="color:var(--text-3);font-size:12px;text-align:center;padding:16px">No local file attached.${item.original_url ? ' Original: ' + item.original_url : ' Add one from the Evidence page.'}</span>`;
  }

  const momentsList = root.querySelector('#moments-list');
  if (!moments.length) {
    momentsList.appendChild(emptyState({ missing: 'No moments marked yet.', why: 'Mark the moment you\'re watching using the form below.' }));
  } else {
    for (const m of moments) {
      const row = document.createElement('div');
      row.className = 'moment-row';
      row.style.cursor = videoEl ? 'pointer' : 'default';
      row.innerHTML = `<span class="t">${fmtT(m.t_ms)}</span><span>${m.label || ''}${m.conflicts ? ' <span class="chip red">conflict</span>' : ''}${m.quote ? `<div class="mono" style="font-size:11px;color:var(--text-3)">"${m.quote}"</div>` : ''}</span>`;
      if (videoEl) row.addEventListener('click', () => { videoEl.currentTime = m.t_ms / 1000; videoEl.play(); });
      momentsList.appendChild(row);
    }
  }

  root.querySelector('#add-moment').addEventListener('click', async () => {
    const t_ms = videoEl ? Math.round(videoEl.currentTime * 1000) : 0;
    await store.createVideoMoment({
      evidence_id: item.id, t_ms,
      label: root.querySelector('#m-label').value || null,
      note: root.querySelector('#m-note').value || null,
      quote: root.querySelector('#m-quote').value || null,
      conflicts: root.querySelector('#m-conflict').checked,
    });
    render(root, ctx, evidenceId);
  });

  const citation = [item.title, item.source_name, item.original_url, item.dated ? `content dated ${item.dated}` : null, item.captured_at ? `captured ${item.captured_at}` : null]
    .filter(Boolean).join(' — ');
  root.querySelector('#citation').value = citation;
  root.querySelector('#copy-citation').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(citation); } catch (_) { root.querySelector('#citation').select(); document.execCommand('copy'); }
  });
}
