// Family tree layout — pure functions, no DOM (her redesign 2026-09-03: the
// reference was a generational chart: oldest on top, couples joined,
// children hanging from a bar). Given people + relationships, returns
// node positions and edges in pixels; the page only draws.
//
// Sibling groups (her ask, same day): in a family with many children, the
// ones who carry nothing but "child of these parents" fold into one compact
// block of faces hung from a single line; a child with their own
// connections — the focus person, a spouse, children, a godchild — stays a
// full node beside the block so their branch can hang cleanly.
//
// Every line the tree draws is a relationship the file holds (or one it
// implies, drawn dotted). It never draws a line between two people who have
// no recorded link, and it never hangs a child from someone who is not
// their parent — the review of 2026-09-03 found both happening for a
// person with two marriages, so couples and drops are now built from the
// actual rows: each spouse joins the person they married, and a set of
// children drops from the midpoint of THEIR parents.

export const FAMILY_KINDS = new Set(['parent', 'spouse', 'sibling', 'godparent']);
export const GROUP_MIN = 4;      // fewer plain siblings than this stay as separate faces
const GROUP_COLS = 4;
const MINI_W = 64, MINI_H = 66, MINI_GAP = 6, GROUP_PAD = 8, GROUP_LABEL = 16;
const ARC_PAD = 16;              // room above the top row for a marriage drawn as an arc

function birthKey(p) {
  if (p.birth_date) { const t = Date.parse(p.birth_date); if (!Number.isNaN(t)) return t; }
  if (p.birth_year_min) return Date.UTC(p.birth_year_min, 0, 1);
  return 8.64e15; // unknown dates go last
}

/** Which row each person sits on: parents above children, spouses and siblings level. */
export function assignGenerations(people, rels) {
  const gen = new Map(people.map((p) => [p.id, 0]));
  const family = rels.filter((r) => gen.has(r.a_id) && gen.has(r.b_id));
  const relax = () => {
    for (let i = 0; i < 40; i++) {
      let changed = false;
      for (const r of family) {
        const ga = gen.get(r.a_id), gb = gen.get(r.b_id);
        if (r.kind === 'parent') {
          if (gb < ga + 1) { gen.set(r.b_id, ga + 1); changed = true; }
        } else if (r.kind === 'spouse' || r.kind === 'sibling') {
          const m = Math.max(ga, gb);
          if (ga !== m) { gen.set(r.a_id, m); changed = true; }
          if (gb !== m) { gen.set(r.b_id, m); changed = true; }
        }
      }
      if (!changed) return;
    }
  };
  relax();
  // A godparent link is soft: only someone the family rows do not already
  // place (no parents, spouse or siblings in the case) takes their row from
  // it — one below the godparent. Without this a person whose only link is
  // "godchild" sat on row 0 among the grandparents (Miley Cyrus, Dolly's
  // godchild); with it as a hard rule, an older sibling standing godparent
  // to a younger one could never settle and the tree became 6,000px of
  // empty rows.
  const anchored = new Set();
  for (const r of family) {
    if (r.kind === 'parent') anchored.add(r.b_id);
    else if (r.kind === 'spouse' || r.kind === 'sibling') { anchored.add(r.a_id); anchored.add(r.b_id); }
  }
  let moved = false;
  for (const r of family) {
    if (r.kind !== 'godparent' || anchored.has(r.b_id)) continue;
    const want = gen.get(r.a_id) + 1;
    if (gen.get(r.b_id) < want) { gen.set(r.b_id, want); moved = true; }
  }
  if (moved) relax(); // the godchild's own children follow them down
  // contradictory rows ("A parent of B" next to "B sibling of A") cannot
  // settle; whatever came out, rows are numbered without gaps so the tree
  // never holds an empty generation
  const levels = [...new Set(gen.values())].sort((a, b) => a - b);
  const rank = new Map(levels.map((v, i) => [v, i]));
  for (const [k, v] of gen) gen.set(k, rank.get(v));
  return gen;
}

/** Size of a sibling block holding n faces. */
export function groupSize(n) {
  const cols = Math.min(GROUP_COLS, n);
  const rows = Math.ceil(n / GROUP_COLS);
  return {
    cols, rows,
    w: GROUP_PAD * 2 + cols * MINI_W + (cols - 1) * MINI_GAP,
    h: GROUP_PAD * 2 + GROUP_LABEL + rows * MINI_H + (rows - 1) * MINI_GAP,
  };
}

/**
 * Lay the tree out. Options: focusId + up/down = how many generations either
 * side of the focus are shown (Infinity = all); node/row sizes in px.
 */
export function layoutTree(people, rels, opts = {}) {
  const {
    focusId = null, up = Infinity, down = Infinity,
    nodeW = 96, nodeH = 112, faceH = 44, gapX = 12, coupleGap = 22, rowGap = 52,
    groupMin = GROUP_MIN,
  } = opts;
  const gen = assignGenerations(people, rels);
  const focusGen = focusId && gen.has(focusId) ? gen.get(focusId) : null;
  const lo = focusGen == null ? -Infinity : focusGen - up;
  const hi = focusGen == null ? Infinity : focusGen + down;
  const hiddenAbove = people.filter((p) => gen.get(p.id) < lo).length;
  const hiddenBelow = people.filter((p) => gen.get(p.id) > hi).length;
  const visible = people.filter((p) => gen.get(p.id) >= lo && gen.get(p.id) <= hi);
  const vis = new Set(visible.map((p) => p.id));
  const byId = new Map(visible.map((p) => [p.id, p]));

  const parentsOf = new Map(), spousesOf = new Map(), siblingsOf = new Map(), godOf = new Set(), isParent = new Set(), relOf = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); if (!m.get(k).includes(v)) m.get(k).push(v); };
  for (const r of rels) {
    if (!vis.has(r.a_id) || !vis.has(r.b_id)) continue;
    relOf.set(`${r.a_id}|${r.b_id}|${r.kind}`, r);
    // spouse and sibling read the same either way; parent is directed, and a
    // reversed key would let the confirm dot write to the backwards row
    if (r.kind === 'spouse' || r.kind === 'sibling') relOf.set(`${r.b_id}|${r.a_id}|${r.kind}`, r);
    if (r.kind === 'parent') { add(parentsOf, r.b_id, r.a_id); isParent.add(r.a_id); }
    if (r.kind === 'spouse') { add(spousesOf, r.a_id, r.b_id); add(spousesOf, r.b_id, r.a_id); }
    if (r.kind === 'sibling') { add(siblingsOf, r.a_id, r.b_id); add(siblingsOf, r.b_id, r.a_id); }
    if (r.kind === 'godparent') { godOf.add(r.a_id); godOf.add(r.b_id); }
  }
  // implied by the data, drawn dotted: two parents of the same child stand
  // together even with no spouse link recorded; a sibling with no parents
  // recorded hangs under the sibling's parents
  const implied = new Set();
  for (const [, ps] of parentsOf) {
    for (let i = 1; i < ps.length; i++) {
      if (gen.get(ps[0]) !== gen.get(ps[i])) continue;
      if (!(spousesOf.get(ps[0]) || []).includes(ps[i])) { add(spousesOf, ps[0], ps[i]); add(spousesOf, ps[i], ps[0]); implied.add(`${ps[0]}|${ps[i]}`); implied.add(`${ps[i]}|${ps[0]}`); }
    }
  }
  for (const p of visible) {
    if ((parentsOf.get(p.id) || []).length) continue;
    const sib = (siblingsOf.get(p.id) || []).find((sid) => (parentsOf.get(sid) || []).length);
    if (!sib) continue;
    for (const pid of parentsOf.get(sib)) { add(parentsOf, p.id, pid); implied.add(`${pid}|${p.id}`); isParent.add(pid); }
  }

  // couple units: everyone joined by marriage on one row is one unit, and
  // everyone is in exactly one. The person with the most marriages in the
  // unit is its anchor; their first spouse stands to their left, later ones
  // to their right, so each marriage line joins the two people it belongs to
  const marriageKey = (a, b) => {
    const r = relOf.get(`${a.id}|${b.id}|spouse`);
    if (r && r.start_date) { const t = Date.parse(r.start_date); if (!Number.isNaN(t)) return t; }
    return birthKey(b);
  };
  const unitOf = new Map();
  const units = [];
  for (const p of [...visible].sort((a, b) => birthKey(a) - birthKey(b))) {
    if (unitOf.has(p.id)) continue;
    const comp = [p];
    const inComp = new Set([p.id]);
    for (let i = 0; i < comp.length; i++) {
      for (const sid of spousesOf.get(comp[i].id) || []) {
        const s = byId.get(sid);
        if (s && !inComp.has(sid) && !unitOf.has(sid) && gen.get(sid) === gen.get(p.id)) { inComp.add(sid); comp.push(s); }
      }
    }
    const spousesIn = (m) => (spousesOf.get(m.id) || []).filter((sid) => inComp.has(sid)).map((sid) => byId.get(sid));
    const rank = (m) => [spousesIn(m).length, m.id === focusId ? 1 : 0, (parentsOf.get(m.id) || []).length ? 1 : 0, -birthKey(m)];
    comp.sort((a, b) => { const ra = rank(a), rb = rank(b); for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i]; return 0; });
    const anchor = comp[0];
    const members = [anchor];
    const placed = new Set([anchor.id]);
    const sp = spousesIn(anchor).sort((a, b) => marriageKey(anchor, a) - marriageKey(anchor, b));
    if (sp.length >= 2) { members.unshift(sp[0]); placed.add(sp[0].id); sp.shift(); }
    for (const s of sp) { members.push(s); placed.add(s.id); }
    for (let i = 0; i < members.length; i++) {
      for (const s of spousesIn(members[i])) if (!placed.has(s.id)) { placed.add(s.id); members.push(s); }
    }
    for (const m of comp) if (!placed.has(m.id)) { placed.add(m.id); members.push(m); }
    const unit = { id: `u${units.length}`, members, gen: gen.get(p.id), children: [], parentUnit: null, h: nodeH };
    members.forEach((m) => unitOf.set(m.id, unit));
    units.push(unit);
  }
  // a unit hangs from the unit that holds the most of its members' parents;
  // a parent who lives in another unit still gets a line, drawn across
  for (const u of units) {
    const count = new Map();
    for (const m of u.members) {
      for (const pid of parentsOf.get(m.id) || []) {
        const pu = unitOf.get(pid);
        if (pu && pu !== u && pu.gen < u.gen) count.set(pu, (count.get(pu) || 0) + 1);
      }
    }
    let best = null;
    for (const [pu, n] of count) if (!best || n > best.n) best = { pu, n };
    if (best) { u.parentUnit = best.pu; best.pu.children.push(u); }
  }
  const unitKey = (u) => Math.min(...u.members.map(birthKey));
  // which of the host unit's members a child unit hangs from ("X & S2"): the
  // parents the unit holds, as a stable key, plus where they stand in the row
  const memberIndex = (u) => new Map(u.members.map((m, i) => [m.id, i]));
  const pairOf = (c, host) => {
    const idx = memberIndex(host);
    const first = c.members.find((m) => (parentsOf.get(m.id) || []).some((pid) => idx.has(pid))) || c.members[0];
    const ids = (parentsOf.get(first.id) || []).filter((pid) => idx.has(pid)).sort((a, b) => idx.get(a) - idx.get(b));
    return { key: ids.join('|'), pos: ids.length ? ids.reduce((s, id) => s + idx.get(id), 0) / ids.length : 0, ids };
  };
  for (const u of units) u.children.sort((a, b) => pairOf(a, u).pos - pairOf(b, u).pos || unitKey(a) - unitKey(b));

  // sibling groups: plain children of the same parents fold into one block,
  // placed first among that couple's children; the connected ones (focus,
  // spouse, children, godparent links, a parent in another unit) stay beside it
  const isPlain = (c, host) => c.members.length === 1 && !c.children.length && c.members[0].id !== focusId
    && !godOf.has(c.members[0].id) && !isParent.has(c.members[0].id)
    && (parentsOf.get(c.members[0].id) || []).every((pid) => unitOf.get(pid) === host);
  let groupCount = 0;
  for (const u of units) {
    if (u.group) continue;
    const plainByPair = new Map();
    for (const c of u.children) if (isPlain(c, u)) add(plainByPair, pairOf(c, u).key, c);
    for (const [, plain] of plainByPair) {
      if (plain.length < groupMin) continue;
      const members = plain.map((c) => c.members[0]).sort((a, b) => birthKey(a) - birthKey(b));
      const size = groupSize(members.length);
      const g = { id: `g${groupCount++}`, group: true, members, gen: plain[0].gen, children: [], parentUnit: u, w: size.w, h: size.h, cols: size.cols, rows: size.rows };
      members.forEach((m) => unitOf.set(m.id, g));
      const at = u.children.indexOf(plain[0]);
      u.children = u.children.filter((c) => !plain.includes(c));
      u.children.splice(Math.min(at, u.children.length), 0, g);
      units.push(g);
    }
  }

  // row heights: a generation holding a sibling block is as tall as the block
  const maxGen = Math.max(0, ...units.map((u) => u.gen));
  const genH = [];
  for (let g = 0; g <= maxGen; g++) genH[g] = Math.max(nodeH, ...units.filter((u) => u.gen === g).map((u) => u.h));
  const rowTop = [];
  let acc = 0;
  for (let g = 0; g <= maxGen; g++) { rowTop[g] = acc; acc += genH[g] + rowGap; }
  const rowY = (g) => rowTop[g] ?? 0;
  const busYFor = (g) => (g + 1 <= maxGen ? rowY(g + 1) - rowGap / 2 : rowY(g) + genH[g] + rowGap / 2);

  const roots = units.filter((u) => !u.parentUnit).sort((a, b) => a.gen - b.gen || unitKey(a) - unitKey(b));
  const memberW = (u) => (u.group ? u.w : u.members.length * nodeW + (u.members.length - 1) * coupleGap);
  const childrenW = (u) => u.children.reduce((s, c) => s + c.w, 0) + Math.max(0, u.children.length - 1) * gapX;
  const measure = (u) => { u.children.forEach(measure); u.w = Math.max(memberW(u), childrenW(u)); return u.w; };
  roots.forEach(measure);

  const nodes = [];
  const edges = [];
  const nodeById = new Map();
  const nameOf = (pid) => (byId.get(pid) || {}).display_name;
  const parentLinkOf = (m, u) => {
    const ps = parentsOf.get(m.id) || [];
    const mine = ps.filter((pid) => unitOf.get(pid) === u);
    if (!mine.length) return null;
    const rs = mine.map((pid) => relOf.get(`${pid}|${m.id}|parent`)).filter(Boolean);
    const isImplied = mine.every((pid) => implied.has(`${pid}|${m.id}`));
    return { parentIds: mine, relIds: rs.map((x) => x.id), implied: isImplied, confirmed: !isImplied && rs.length > 0 && rs.every((x) => x.confirmed), parents: mine.map(nameOf).filter(Boolean) };
  };
  const faceX = (pid) => { const n = nodeById.get(pid); return n ? (n.group ? n.x + n.w / 2 : n.x + nodeW / 2) : null; };
  const place = (u, x) => {
    u.x = x;
    const mw = memberW(u);
    const mx = x + (u.w - mw) / 2;
    u.cx = mx + mw / 2;
    if (u.group) {
      const items = u.members.map((m, i) => ({ id: m.id, person: m, col: i % GROUP_COLS, row: Math.floor(i / GROUP_COLS), x: GROUP_PAD + (i % GROUP_COLS) * (MINI_W + MINI_GAP), y: GROUP_PAD + GROUP_LABEL + Math.floor(i / GROUP_COLS) * (MINI_H + MINI_GAP) }));
      const n = { id: u.id, group: true, items, x: mx, y: rowY(u.gen), w: u.w, h: u.h, gen: u.gen, unit: u.id, cols: u.cols, rows: u.rows };
      nodes.push(n); nodeById.set(u.id, n);
      u.members.forEach((m) => nodeById.set(m.id, n));
      return;
    }
    const idx = memberIndex(u);
    u.members.forEach((m, i) => {
      const n = { id: m.id, person: m, x: mx + i * (nodeW + coupleGap), y: rowY(u.gen), gen: u.gen, unit: u.id };
      nodes.push(n); nodeById.set(m.id, n);
    });
    // one line per marriage the file holds: neighbours are joined straight,
    // a marriage across the row is drawn as an arc over the faces
    const done = new Set();
    for (const a of u.members) {
      for (const sid of spousesOf.get(a.id) || []) {
        if (!idx.has(sid)) continue;
        const b = byId.get(sid);
        const key = [a.id, b.id].sort().join('|');
        if (done.has(key)) continue;
        done.add(key);
        const r = relOf.get(`${a.id}|${b.id}|spouse`);
        const isImplied = implied.has(`${a.id}|${b.id}`);
        const [i, j] = [idx.get(a.id), idx.get(b.id)].sort((p, q) => p - q);
        const base = { kind: 'couple', y: rowY(u.gen) + faceH / 2, confirmed: !isImplied && !!(r && r.confirmed), implied: isImplied, relId: r ? r.id : null, label: `${a.display_name} · ${b.display_name} · spouse` };
        if (j === i + 1) edges.push({ ...base, x1: mx + i * (nodeW + coupleGap) + nodeW, x2: mx + j * (nodeW + coupleGap) });
        else edges.push({ ...base, arc: true, x1: mx + i * (nodeW + coupleGap) + nodeW / 2, x2: mx + j * (nodeW + coupleGap) + nodeW / 2, top: rowY(u.gen) });
      }
    }
    if (!u.children.length) return;
    let cx = x + (u.w - childrenW(u)) / 2;
    for (const c of u.children) { place(c, cx); cx += c.w + gapX; }
    // children drop from THEIR parents: one trunk + bar per set of parents
    const sets = new Map();
    const dropTo = (key, drop) => { if (!sets.has(key)) sets.set(key, []); sets.get(key).push(drop); };
    for (const c of u.children) {
      if (c.group) {
        // one line for the whole block; it is confirmed only when every member's link is
        const links = c.members.map((m) => parentLinkOf(m, u)).filter(Boolean);
        if (!links.length) continue;
        const n = nodeById.get(c.id);
        dropTo(links[0].parentIds.join('|'), {
          x: n.x + n.w / 2, y2: n.y, parentIds: links[0].parentIds,
          confirmed: links.every((l) => l.confirmed), implied: links.every((l) => l.implied),
          relIds: links.flatMap((l) => l.relIds), label: `${c.members.length} siblings · children of ${links[0].parents.join(' & ')}`,
        });
        continue;
      }
      for (const m of c.members) {
        const link = parentLinkOf(m, u);
        if (!link) continue;
        const n = nodeById.get(m.id);
        dropTo(link.parentIds.join('|'), { x: n.x + nodeW / 2, y2: n.y, parentIds: link.parentIds, confirmed: link.confirmed, implied: link.implied, relIds: link.relIds, label: `${m.display_name} · child of ${link.parents.join(' & ')}` });
      }
    }
    const spans = [];
    for (const [, drops] of sets) {
      const trunkX = drops[0].parentIds.reduce((s, pid) => s + faceX(pid), 0) / drops[0].parentIds.length;
      const xs = drops.map((d) => d.x).concat([trunkX]);
      const x1 = Math.min(...xs), x2 = Math.max(...xs);
      // two sets of children under one couple's row: bars that would overlap sit a step apart
      let busY = busYFor(u.gen);
      while (spans.some((s) => s.busY === busY && s.x1 <= x2 && x1 <= s.x2)) busY += 6;
      spans.push({ x1, x2, busY });
      edges.push({ kind: 'trunk', x: trunkX, y1: rowY(u.gen) + faceH, y2: busY });
      edges.push({ kind: 'bus', x1, x2, y: busY });
      for (const d of drops) edges.push({ kind: 'drop', x: d.x, y1: busY, y2: d.y2, confirmed: d.confirmed, implied: d.implied, relIds: d.relIds, label: d.label });
    }
  };
  let x = 0;
  for (const r of roots) { place(r, x); x += r.w + gapX * 2; }

  // a parent who stands in another unit than the one the child hangs from
  // (a child of two marriages, a parent married again) still gets their
  // line — drawn across the tree, dotted, never omitted
  for (const u of units) {
    if (u.group) continue;
    for (const m of u.members) {
      const others = new Map();
      for (const pid of parentsOf.get(m.id) || []) {
        const pu = unitOf.get(pid);
        if (!pu || pu === u || pu === u.parentUnit || pu.gen >= u.gen) continue;
        add(others, pu, pid);
      }
      for (const [, pids] of others) {
        const rs = pids.map((pid) => relOf.get(`${pid}|${m.id}|parent`)).filter(Boolean);
        const isImplied = pids.every((pid) => implied.has(`${pid}|${m.id}`));
        const xs = pids.map(faceX).filter((v) => v != null);
        const pn = nodeById.get(pids[0]), cn = nodeById.get(m.id);
        if (!xs.length || !pn || !cn) continue;
        edges.push({
          kind: 'far', x1: xs.reduce((s, v) => s + v, 0) / xs.length, y1: pn.y + (pn.group ? pn.h : faceH), x2: cn.x + nodeW / 2, y2: cn.y,
          confirmed: !isImplied && rs.length > 0 && rs.every((r) => r.confirmed), implied: isImplied, relIds: rs.map((r) => r.id),
          label: `${m.display_name} · child of ${pids.map(nameOf).filter(Boolean).join(' & ')}`,
        });
      }
    }
  }

  // godparent links: dotted, between the two faces (never inside a block — those members have none)
  for (const r of rels) {
    if (r.kind !== 'godparent' || !vis.has(r.a_id) || !vis.has(r.b_id)) continue;
    const a = nodeById.get(r.a_id), b = nodeById.get(r.b_id);
    if (a && b && !a.group && !b.group) edges.push({ kind: 'god', x1: a.x + nodeW / 2, y1: a.y + faceH, x2: b.x + nodeW / 2, y2: b.y, confirmed: !!r.confirmed, relIds: [r.id], label: `${a.person.display_name} · godparent of ${b.person.display_name}` });
  }

  // the topmost visible row becomes y = 0 (plus room for an arc over it)
  const pad = edges.some((e) => e.arc) ? ARC_PAD : 0;
  const yShift = (nodes.length ? Math.min(...nodes.map((n) => n.y)) : 0) - pad;
  for (const n of nodes) n.y -= yShift;
  for (const e of edges) {
    if ('y' in e) e.y -= yShift;
    if ('top' in e) e.top -= yShift;
    if ('y1' in e) { e.y1 -= yShift; e.y2 -= yShift; }
  }
  const height = nodes.length ? Math.max(...nodes.map((n) => n.y + (n.group ? n.h : nodeH))) : 0;
  return { nodes, edges, width: Math.max(0, x - gapX * 2), height, hiddenAbove, hiddenBelow, gen, nodeW, nodeH, faceH, mini: { w: MINI_W, h: MINI_H, face: 36 } };
}

/** "1946 – 2026", "1946", or "" — from whatever dates the person has. */
export function yearsText(p) {
  const y1 = p.birth_date ? p.birth_date.slice(0, 4) : (p.birth_year_min ? String(p.birth_year_min) : '');
  const y2 = p.death_date ? p.death_date.slice(0, 4) : '';
  if (!y1 && !y2) return '';
  return y2 ? `${y1 || '?'} – ${y2}` : y1;
}
