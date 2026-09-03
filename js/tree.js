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

export const FAMILY_KINDS = new Set(['parent', 'spouse', 'sibling', 'godparent']);
export const GROUP_MIN = 4;      // fewer plain siblings than this stay as separate faces
const GROUP_COLS = 4;
const MINI_W = 64, MINI_H = 66, MINI_GAP = 6, GROUP_PAD = 8, GROUP_LABEL = 16;

function birthKey(p) {
  if (p.birth_date) { const t = Date.parse(p.birth_date); if (!Number.isNaN(t)) return t; }
  if (p.birth_year_min) return Date.UTC(p.birth_year_min, 0, 1);
  return 8.64e15; // unknown dates go last
}

/** Which row each person sits on: parents above children, spouses and siblings level. */
export function assignGenerations(people, rels) {
  const gen = new Map(people.map((p) => [p.id, 0]));
  const family = rels.filter((r) => gen.has(r.a_id) && gen.has(r.b_id));
  for (let i = 0; i < 40; i++) {
    let changed = false;
    for (const r of family) {
      const ga = gen.get(r.a_id), gb = gen.get(r.b_id);
      if (r.kind === 'parent' || r.kind === 'godparent') {
        // a godparent stands a generation above their godchild, same as a
        // parent — without this a person whose only link is "godchild"
        // stayed on row 0 among the grandparents (2026-09-03: Miley Cyrus,
        // Dolly's godchild, drew level with Dolly's parents)
        if (gb < ga + 1) { gen.set(r.b_id, ga + 1); changed = true; }
      } else if (r.kind === 'spouse' || r.kind === 'sibling') {
        const m = Math.max(ga, gb);
        if (ga !== m) { gen.set(r.a_id, m); changed = true; }
        if (gb !== m) { gen.set(r.b_id, m); changed = true; }
      }
    }
    if (!changed) break;
  }
  const min = Math.min(...gen.values());
  for (const [k, v] of gen) gen.set(k, v - min);
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

  const parentsOf = new Map(), spousesOf = new Map(), siblingsOf = new Map(), godOf = new Set(), relOf = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); if (!m.get(k).includes(v)) m.get(k).push(v); };
  for (const r of rels) {
    if (!vis.has(r.a_id) || !vis.has(r.b_id)) continue;
    relOf.set(`${r.a_id}|${r.b_id}|${r.kind}`, r);
    relOf.set(`${r.b_id}|${r.a_id}|${r.kind}`, r);
    if (r.kind === 'parent') add(parentsOf, r.b_id, r.a_id);
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
    for (const pid of parentsOf.get(sib)) { add(parentsOf, p.id, pid); implied.add(`${pid}|${p.id}`); }
  }

  // couple units: a person plus their spouses on the same row; everyone in exactly one
  const unitOf = new Map();
  const units = [];
  for (const p of [...visible].sort((a, b) => birthKey(a) - birthKey(b))) {
    if (unitOf.has(p.id)) continue;
    const members = [p];
    for (const sid of spousesOf.get(p.id) || []) {
      const s = byId.get(sid);
      if (s && !unitOf.has(sid) && gen.get(sid) === gen.get(p.id)) members.push(s);
    }
    // the focus person, or the one with parents in the case, sits first so the drop lands on them
    members.sort((a, b) => (b.id === focusId) - (a.id === focusId) || ((parentsOf.get(b.id) || []).length > 0) - ((parentsOf.get(a.id) || []).length > 0));
    const unit = { id: `u${units.length}`, members, gen: gen.get(p.id), children: [], parentUnit: null, h: nodeH };
    members.forEach((m) => unitOf.set(m.id, unit));
    units.push(unit);
  }
  for (const u of units) {
    let parentUnit = null;
    for (const m of u.members) {
      const ps = parentsOf.get(m.id) || [];
      if (ps.length) { parentUnit = unitOf.get(ps[0]); break; }
    }
    if (parentUnit && parentUnit !== u && parentUnit.gen < u.gen) { u.parentUnit = parentUnit; parentUnit.children.push(u); }
  }
  const unitKey = (u) => Math.min(...u.members.map(birthKey));
  for (const u of units) u.children.sort((a, b) => unitKey(a) - unitKey(b));

  // sibling groups: plain children fold into one block, placed first; the
  // connected ones (focus, spouse, children, godparent links) follow beside it
  const isPlain = (c) => c.members.length === 1 && !c.children.length && c.members[0].id !== focusId && !godOf.has(c.members[0].id);
  let groupCount = 0;
  for (const u of units) {
    const plain = u.children.filter(isPlain);
    if (plain.length < groupMin) continue;
    const connected = u.children.filter((c) => !isPlain(c));
    const members = plain.map((c) => c.members[0]).sort((a, b) => birthKey(a) - birthKey(b));
    const size = groupSize(members.length);
    const g = { id: `g${groupCount++}`, group: true, members, gen: plain[0].gen, children: [], parentUnit: u, w: size.w, h: size.h, cols: size.cols, rows: size.rows };
    members.forEach((m) => unitOf.set(m.id, g));
    u.children = [g, ...connected];
    units.push(g);
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
  const parentLinkOf = (m, u) => {
    const ps = parentsOf.get(m.id) || [];
    const mine = ps.filter((pid) => unitOf.get(pid) === u);
    if (!mine.length) return null;
    const rs = mine.map((pid) => relOf.get(`${pid}|${m.id}|parent`)).filter(Boolean);
    const isImplied = mine.every((pid) => implied.has(`${pid}|${m.id}`));
    return { relIds: rs.map((x) => x.id), implied: isImplied, confirmed: !isImplied && rs.length > 0 && rs.every((x) => x.confirmed), parents: mine.map((pid) => (byId.get(pid) || {}).display_name).filter(Boolean) };
  };
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
    u.members.forEach((m, i) => {
      const n = { id: m.id, person: m, x: mx + i * (nodeW + coupleGap), y: rowY(u.gen), gen: u.gen, unit: u.id };
      nodes.push(n); nodeById.set(m.id, n);
    });
    for (let i = 1; i < u.members.length; i++) {
      const a = u.members[i - 1], b = u.members[i];
      const r = relOf.get(`${a.id}|${b.id}|spouse`);
      const isImplied = implied.has(`${a.id}|${b.id}`);
      edges.push({ kind: 'couple', x1: mx + (i - 1) * (nodeW + coupleGap) + nodeW, x2: mx + i * (nodeW + coupleGap), y: rowY(u.gen) + faceH / 2, confirmed: !isImplied && !!(r && r.confirmed), implied: isImplied, relId: r ? r.id : null, label: `${a.display_name} · ${b.display_name} · spouse` });
    }
    if (!u.children.length) return;
    let cx = x + (u.w - childrenW(u)) / 2;
    for (const c of u.children) { place(c, cx); cx += c.w + gapX; }
    const busY = busYFor(u.gen);
    const drops = [];
    for (const c of u.children) {
      if (c.group) {
        // one line for the whole block; it is confirmed only when every member's link is
        const links = c.members.map((m) => parentLinkOf(m, u)).filter(Boolean);
        if (!links.length) continue;
        const n = nodeById.get(c.id);
        drops.push({
          x: n.x + n.w / 2, y2: n.y,
          confirmed: links.every((l) => l.confirmed), implied: links.every((l) => l.implied),
          relIds: links.flatMap((l) => l.relIds), label: `${c.members.length} siblings · children of ${links[0].parents.join(' & ')}`,
        });
        continue;
      }
      for (const m of c.members) {
        const link = parentLinkOf(m, u);
        if (!link) continue;
        const n = nodeById.get(m.id);
        drops.push({ x: n.x + nodeW / 2, y2: n.y, confirmed: link.confirmed, implied: link.implied, relIds: link.relIds, label: `${m.display_name} · child of ${link.parents.join(' & ')}` });
      }
    }
    if (!drops.length) return;
    edges.push({ kind: 'trunk', x: u.cx, y1: rowY(u.gen) + faceH, y2: busY });
    const xs = drops.map((d) => d.x).concat([u.cx]);
    edges.push({ kind: 'bus', x1: Math.min(...xs), x2: Math.max(...xs), y: busY });
    for (const d of drops) edges.push({ kind: 'drop', x: d.x, y1: busY, y2: d.y2, confirmed: d.confirmed, implied: d.implied, relIds: d.relIds, label: d.label });
  };
  let x = 0;
  for (const r of roots) { place(r, x); x += r.w + gapX * 2; }

  // godparent links: dotted, between the two faces (never inside a block — those members have none)
  for (const r of rels) {
    if (r.kind !== 'godparent' || !vis.has(r.a_id) || !vis.has(r.b_id)) continue;
    const a = nodeById.get(r.a_id), b = nodeById.get(r.b_id);
    if (a && b && !a.group && !b.group) edges.push({ kind: 'god', x1: a.x + nodeW / 2, y1: a.y + faceH, x2: b.x + nodeW / 2, y2: b.y, confirmed: !!r.confirmed, relIds: [r.id], label: `${a.person.display_name} · godparent of ${b.person.display_name}` });
  }

  // the topmost visible row becomes y = 0
  const yShift = nodes.length ? Math.min(...nodes.map((n) => n.y)) : 0;
  for (const n of nodes) n.y -= yShift;
  for (const e of edges) {
    if ('y' in e) e.y -= yShift;
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
