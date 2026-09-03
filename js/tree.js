// Family tree layout — pure functions, no DOM (her redesign 2026-09-03: the
// reference was a generational chart: oldest on top, couples joined,
// children hanging from a bar). Given people + relationships, returns
// node positions and edges in pixels; the page only draws.

export const FAMILY_KINDS = new Set(['parent', 'spouse', 'sibling', 'godparent']);

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
      if (r.kind === 'parent') {
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

/**
 * Lay the tree out. Options: focusId + up/down = how many generations either
 * side of the focus are shown (Infinity = all); node/row sizes in px.
 */
export function layoutTree(people, rels, opts = {}) {
  const {
    focusId = null, up = Infinity, down = Infinity,
    nodeW = 96, nodeH = 112, faceH = 44, gapX = 12, coupleGap = 22, rowGap = 52,
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

  const parentsOf = new Map(), spousesOf = new Map(), siblingsOf = new Map(), relOf = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); if (!m.get(k).includes(v)) m.get(k).push(v); };
  for (const r of rels) {
    if (!vis.has(r.a_id) || !vis.has(r.b_id)) continue;
    relOf.set(`${r.a_id}|${r.b_id}|${r.kind}`, r);
    relOf.set(`${r.b_id}|${r.a_id}|${r.kind}`, r);
    if (r.kind === 'parent') add(parentsOf, r.b_id, r.a_id);
    if (r.kind === 'spouse') { add(spousesOf, r.a_id, r.b_id); add(spousesOf, r.b_id, r.a_id); }
    if (r.kind === 'sibling') { add(siblingsOf, r.a_id, r.b_id); add(siblingsOf, r.b_id, r.a_id); }
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
    const unit = { id: `u${units.length}`, members, gen: gen.get(p.id), children: [], parentUnit: null };
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
  const roots = units.filter((u) => !u.parentUnit).sort((a, b) => a.gen - b.gen || unitKey(a) - unitKey(b));

  const memberW = (u) => u.members.length * nodeW + (u.members.length - 1) * coupleGap;
  const childrenW = (u) => u.children.reduce((s, c) => s + c.w, 0) + Math.max(0, u.children.length - 1) * gapX;
  const measure = (u) => { u.children.forEach(measure); u.w = Math.max(memberW(u), childrenW(u)); return u.w; };
  roots.forEach(measure);

  const rowY = (g) => g * (nodeH + rowGap);
  const nodes = [];
  const edges = [];
  const nodeById = new Map();
  const place = (u, x) => {
    u.x = x;
    const mw = memberW(u);
    const mx = x + (u.w - mw) / 2;
    u.cx = mx + mw / 2;
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
    const busY = rowY(u.gen) + nodeH + rowGap / 2;
    const drops = [];
    for (const c of u.children) {
      for (const m of c.members) {
        const ps = parentsOf.get(m.id) || [];
        if (!ps.some((pid) => unitOf.get(pid) === u)) continue;
        const n = nodeById.get(m.id);
        const r = ps.map((pid) => relOf.get(`${pid}|${m.id}|parent`)).find(Boolean);
        const isImplied = ps.every((pid) => implied.has(`${pid}|${m.id}`));
        const rels = ps.map((pid) => relOf.get(`${pid}|${m.id}|parent`)).filter(Boolean);
        drops.push({ x: n.x + nodeW / 2, y2: n.y, confirmed: !isImplied && !!(r && r.confirmed), implied: isImplied, relIds: rels.map((x) => x.id), label: `${m.display_name} · child of ${ps.map((pid) => (byId.get(pid) || {}).display_name).filter(Boolean).join(' & ')}` });
      }
    }
    if (!drops.length) return;
    // the couple's drop point: between the two parents when both are here, else under the parent
    const parentIds = new Set(drops.flatMap(() => []));
    edges.push({ kind: 'trunk', x: u.cx, y1: rowY(u.gen) + faceH, y2: busY });
    const xs = drops.map((d) => d.x).concat([u.cx]);
    edges.push({ kind: 'bus', x1: Math.min(...xs), x2: Math.max(...xs), y: busY });
    for (const d of drops) edges.push({ kind: 'drop', x: d.x, y1: busY, y2: d.y2, confirmed: d.confirmed, implied: d.implied, relIds: d.relIds, label: d.label });
    void parentIds;
  };
  let x = 0;
  for (const r of roots) { place(r, x); x += r.w + gapX * 2; }

  // godparent links: dotted, between the two faces
  for (const r of rels) {
    if (r.kind !== 'godparent' || !vis.has(r.a_id) || !vis.has(r.b_id)) continue;
    const a = nodeById.get(r.a_id), b = nodeById.get(r.b_id);
    if (a && b) edges.push({ kind: 'god', x1: a.x + nodeW / 2, y1: a.y + faceH, x2: b.x + nodeW / 2, y2: b.y, confirmed: !!r.confirmed, relIds: [r.id], label: `${a.person.display_name} · godparent of ${b.person.display_name}` });
  }

  // the topmost visible row becomes y = 0
  const yShift = nodes.length ? Math.min(...nodes.map((n) => n.y)) : 0;
  for (const n of nodes) n.y -= yShift;
  for (const e of edges) {
    if ('y' in e) e.y -= yShift;
    if ('y1' in e) { e.y1 -= yShift; e.y2 -= yShift; }
  }
  const height = nodes.length ? Math.max(...nodes.map((n) => n.y)) + nodeH : 0;
  return { nodes, edges, width: Math.max(0, x - gapX * 2), height, hiddenAbove, hiddenBelow, gen, nodeW, nodeH, faceH };
}

/** "1946 – 2026", "1946", or "" — from whatever dates the person has. */
export function yearsText(p) {
  const y1 = p.birth_date ? p.birth_date.slice(0, 4) : (p.birth_year_min ? String(p.birth_year_min) : '');
  const y2 = p.death_date ? p.death_date.slice(0, 4) : '';
  if (!y1 && !y2) return '';
  return y2 ? `${y1 || '?'} – ${y2}` : y1;
}
