import { emptyState } from '../indicators.js';
import { inlineNote, clearInlineNote, twoTapConfirm } from '../ui.js';
import { compressImage, queueUpload, resolveAssetUrl, flushUploads } from '../assets.js';
import { youtubeThumb, youtubeId, fmtT, parseT } from '../media.js';

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
  const hasLocalVideo = !!item.file_path && /^video\//.test(item.mime || '');
  const ytThumb = youtubeThumb(item.original_url);

  root.innerHTML = `
    <div class="video-layout">
      <div class="stack">
        <div class="video-frame" id="video-frame"><span>Loading…</span></div>
        <div class="panel">
          <div class="row between"><div class="panel-title" style="margin:0">Pictures</div><span class="mono" style="font-size:11px;color:var(--text-3)">${moments.filter((m) => m.file_path).length} attached</span></div>
          <div id="pic-gallery" class="pic-gallery" style="margin-top:12px"></div>
          <p style="color:var(--text-3);font-size:11px;margin:10px 0 0">Long video? Mark a moment below and give it a picture — a screenshot of that exact point.</p>
        </div>
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
          ${item.original_url ? `<a href="${item.original_url}" target="_blank" rel="noopener" class="mono" style="font-size:11px;display:block;margin-top:6px;word-break:break-all">${item.original_url}</a>` : ''}
          ${item.source_kind === 'dramatisation' ? '<div class="chip red" style="margin-top:6px">dramatisation — cannot raise confidence</div>' : ''}
        </div>
        <div class="panel">
          <div class="row between"><div class="panel-title" style="margin:0">Marked moments</div><span class="chip">${moments.filter((m) => m.conflicts).length} conflict${moments.filter((m) => m.conflicts).length === 1 ? '' : 's'}</span></div>
          <div id="moments-list" class="stack" style="gap:4px"></div>
          <div class="row wrap" style="gap:8px;margin-top:12px">
            <div class="field" style="flex:0 0 110px"><label>Time (m:ss)</label><input type="text" id="m-time" placeholder="${hasLocalVideo ? 'from player' : '12:34'}"></div>
            <div class="field" style="flex:1 1 160px;min-width:0"><label>Label</label><input type="text" id="m-label"></div>
          </div>
          <div class="field"><label>Quote</label><input type="text" id="m-quote"></div>
          <div class="field"><label>Note</label><textarea id="m-note" style="min-height:48px"></textarea></div>
          <div class="field"><label>Picture of this moment (optional)</label><input type="file" id="m-pic" accept="image/*"></div>
          <label style="font-size:11px;color:var(--text-2);display:flex;gap:6px;align-items:center;margin-bottom:8px"><input type="checkbox" id="m-conflict"> conflicts with another source</label>
          <button class="btn btn-primary btn-sm" id="add-moment">+ Mark this moment</button>
        </div>
      </div>
    </div>
  `;

  // the frame: local file plays; a YouTube link shows its thumbnail with an
  // "open" link; anything else says so honestly
  const frame = root.querySelector('#video-frame');
  let videoEl = null;
  if (hasLocalVideo) {
    const url = await store.evidenceAssetUrl(item.file_path);
    frame.innerHTML = `<video id="v" controls style="width:100%;height:100%;border-radius:8px" src="${url}"></video>`;
    videoEl = frame.querySelector('#v');
  } else if (ytThumb) {
    frame.innerHTML = `<a class="yt-thumb" href="${item.original_url}" target="_blank" rel="noopener"><img src="${ytThumb}" alt="" onerror="this.style.display='none'"><span class="open">▶ Open on YouTube</span></a>`;
  } else {
    frame.innerHTML = `<span style="color:var(--text-3);font-size:12px;text-align:center;padding:16px">No local file attached.${item.original_url ? ` <a href="${item.original_url}" target="_blank" rel="noopener" style="color:var(--brass)">Open the link ↗</a>` : ' Add one from the Evidence page.'}</span>`;
  }

  // gallery of moment pictures, in time order
  const gallery = root.querySelector('#pic-gallery');
  const withPics = moments.filter((m) => m.file_path);
  if (!withPics.length) {
    gallery.innerHTML = '<span class="mono" style="font-size:11px;color:var(--text-3)">no pictures yet</span>';
  }
  for (const m of withPics) {
    const pic = document.createElement('div');
    pic.className = 'pic';
    pic.innerHTML = `<span class="t">${fmtT(m.t_ms)}</span>`;
    pic.title = m.quote || m.label || '';
    resolveAssetUrl(m.file_path, 'image/jpeg').then((u) => { if (u) { const img = document.createElement('img'); img.src = u; img.alt = ''; pic.prepend(img); } });
    pic.addEventListener('click', () => { if (videoEl) { videoEl.currentTime = m.t_ms / 1000; videoEl.play(); } });
    gallery.appendChild(pic);
  }

  const momentsList = root.querySelector('#moments-list');
  if (!moments.length) {
    momentsList.appendChild(emptyState({ missing: 'No moments marked yet.', why: 'Mark the moment you\'re watching using the form below — type the time from the player if the video lives on YouTube.' }));
  } else {
    for (const m of moments) {
      const row = document.createElement('div');
      row.className = 'moment-row';
      row.style.cursor = videoEl ? 'pointer' : 'default';
      row.innerHTML = `<span class="t">${fmtT(m.t_ms)}</span><span style="flex:1;min-width:0">${m.label || ''}${m.conflicts ? ' <span class="chip red">conflict</span>' : ''}${m.quote ? `<div class="mono" style="font-size:11px;color:var(--text-3)">"${m.quote}"</div>` : ''}</span>${m.file_path ? '' : '<span class="m-addpic">+ picture</span>'}`;
      if (m.file_path) {
        resolveAssetUrl(m.file_path, 'image/jpeg').then((u) => { if (u) { const img = document.createElement('img'); img.className = 'm-pic'; img.src = u; img.alt = ''; row.prepend(img); } });
      } else {
        const addPic = row.querySelector('.m-addpic');
        addPic.addEventListener('click', (e) => {
          e.stopPropagation();
          const input = document.createElement('input');
          input.type = 'file'; input.accept = 'image/*';
          input.addEventListener('change', async () => {
            const f = input.files[0];
            if (!f) return;
            addPic.textContent = 'adding…';
            const meta = await store.storeEvidenceFile(await compressImage(f));
            await store.updateVideoMoment(m.id, { file_path: meta.file_path });
            queueUpload(meta.file_path, meta.mime);
            flushUploads();
            render(root, ctx, evidenceId);
          });
          input.click();
        });
      }
      if (videoEl) row.addEventListener('click', () => { videoEl.currentTime = m.t_ms / 1000; videoEl.play(); });
      momentsList.appendChild(row);
    }
  }

  root.querySelector('#add-moment').addEventListener('click', async () => {
    const btn = root.querySelector('#add-moment');
    clearInlineNote(btn);
    const typed = root.querySelector('#m-time').value.trim();
    let t_ms = videoEl ? Math.round(videoEl.currentTime * 1000) : 0;
    if (typed) {
      const parsed = parseT(typed);
      if (parsed == null) { inlineNote(btn, 'Time should look like 12:34 (or 1:02:03).'); return; }
      t_ms = parsed;
    }
    const picFile = root.querySelector('#m-pic').files[0];
    let file_path = null;
    if (picFile) {
      const meta = await store.storeEvidenceFile(await compressImage(picFile));
      file_path = meta.file_path;
      queueUpload(meta.file_path, meta.mime);
    }
    const id = await store.createVideoMoment({
      evidence_id: item.id, t_ms,
      label: root.querySelector('#m-label').value || null,
      note: root.querySelector('#m-note').value || null,
      quote: root.querySelector('#m-quote').value || null,
      conflicts: root.querySelector('#m-conflict').checked,
    });
    if (file_path) await store.updateVideoMoment(id, { file_path });
    flushUploads();
    render(root, ctx, evidenceId);
  });

  const citation = [item.title, item.source_name, item.original_url, item.dated ? `content dated ${item.dated}` : null, item.captured_at ? `captured ${item.captured_at}` : null]
    .filter(Boolean).join(' — ');
  root.querySelector('#citation').value = citation;
  root.querySelector('#copy-citation').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(citation); } catch (_) { root.querySelector('#citation').select(); document.execCommand('copy'); }
  });
}
